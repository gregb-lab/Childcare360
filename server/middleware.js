import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { D, auditLog } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'childcare360-dev-secret-change-in-production';
const JWT_EXPIRY = '4h';
const REFRESH_EXPIRY_DAYS = 30;

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

// ─── Auth Middleware — verifies JWT, attaches user + tenant to req ────────────
export function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);

    // Check user still exists and not locked
    const user = D().prepare('SELECT id, email, name, locked, mfa_enabled FROM users WHERE id = ?').get(decoded.userId);
    if (!user || user.locked) {
      return res.status(401).json({ error: 'Account locked or not found' });
    }

    // Check tenant membership if tenant specified
    if (decoded.tenantId) {
      const member = D().prepare(
        'SELECT tm.role, tm.active FROM tenant_members tm WHERE tm.user_id = ? AND tm.tenant_id = ? AND tm.active = 1'
      ).get(decoded.userId, decoded.tenantId);
      if (!member) {
        return res.status(403).json({ error: 'Not a member of this organisation' });
      }
      req.tenantId = decoded.tenantId;
      req.tenantRole = member.role;
    }

    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.userName = user.name;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── Require specific tenant roles ──────────────────────────────────────────
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.tenantRole || !roles.includes(req.tenantRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// ─── Require tenant context ─────────────────────────────────────────────────
export function requireTenant(req, res, next) {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'No organisation selected' });
  }
  next();
}

// ─── Rate limiter (simple in-memory) ────────────────────────────────────────
const rateLimits = new Map();
export function rateLimit(maxAttempts, windowMs) {
  return (req, res, next) => {
    const key = req.ip + ':' + req.path;
    const now = Date.now();
    const entry = rateLimits.get(key);
    if (entry && now - entry.start < windowMs) {
      if (entry.count >= maxAttempts) {
        return res.status(429).json({ error: 'Too many attempts. Please wait and try again.' });
      }
      entry.count++;
    } else {
      rateLimits.set(key, { count: 1, start: now });
    }
    next();
  };
}
// Cleanup old entries every 5 min
setInterval(() => {
  const cutoff = Date.now() - 600000;
  for (const [k, v] of rateLimits) { if (v.start < cutoff) rateLimits.delete(k); }
}, 300000);

export { JWT_SECRET, JWT_EXPIRY, REFRESH_EXPIRY_DAYS };

// ─── Password complexity validator ───────────────────────────────────────────
export function validatePassword(password) {
  const errors = [];
  if (!password || password.length < 10) errors.push('at least 10 characters');
  if (!/[A-Z]/.test(password)) errors.push('one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('one lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('one number');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('one special character (!@#$%^&* etc)');
  return errors.length === 0 ? null : `Password must contain: ${errors.join(', ')}`;
}

// ─── Global mutation audit middleware ────────────────────────────────────────
// Logs all POST/PUT/PATCH/DELETE requests that aren't already specifically audited

const SKIP_AUDIT_PATHS = new Set([
  '/api/auth/login', '/api/auth/refresh', '/api/auth/logout',
  '/api/auth/register', '/api/auth/verify-email', '/api/auth/reset-password',
  '/api/auth/mfa', '/api/auth/google', '/api/auth/apple',
  '/health'
]);

export function globalAuditMiddleware(req, res, next) {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return next();
  if (SKIP_AUDIT_PATHS.has(req.path)) return next();
  if (!req.userId) return next(); // not authenticated — auth middleware will handle it

  const action = `${req.method.toLowerCase()}:${req.path.replace(/\/[a-f0-9-]{36}/g, '/:id')}`;
  const details = {
    method: req.method,
    path: req.path,
    params: req.params,
    body_keys: req.body ? Object.keys(req.body).filter(k => !['password','token','secret'].includes(k)) : []
  };

  // Log after response to capture status
  const orig = res.json.bind(res);
  res.json = function(body) {
    try {
      if (res.statusCode < 400) {
        auditLog(req.userId, req.tenantId || null, action,
          { ...details, status: res.statusCode }, req.ip, req.headers['user-agent']);
      }
    } catch(e) { /* non-fatal */ }
    return orig(body);
  };
  next();
}
