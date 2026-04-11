import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';
import { D, auditLog } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'childcare360-dev-secret-change-in-production';
const JWT_EXPIRY = '8h';
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

    // Check tenant membership — use JWT tenantId or fall back to x-tenant-id header
    const resolvedTenantId = decoded.tenantId || req.headers['x-tenant-id'] || null;
    if (resolvedTenantId) {
      const member = D().prepare(
        'SELECT tm.role, tm.active FROM tenant_members tm WHERE tm.user_id = ? AND tm.tenant_id = ? AND tm.active = 1'
      ).get(decoded.userId, resolvedTenantId);
      if (!member) {
        return res.status(403).json({ error: 'Not a member of this organisation' });
      }
      req.tenantId = resolvedTenantId;
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

// ─── Public API key auth — used by /v1/* routes only ───────────────────────
// Accepts the key from either:
//   Authorization: Bearer c360_sk_xxxxx
//   X-API-Key:      c360_sk_xxxxx
//
// Looks the SHA256 hash up in api_keys, attaches tenant context, and bumps
// the per-key usage counter (best-effort, non-blocking on the response).
// Logs the request to api_request_log so the developer portal can show
// usage history. Response status code and timing are filled in via res.on('finish').
export function requireApiKey(req, res, next) {
  const authHeader = req.headers['authorization'];
  const apiKeyHeader = req.headers['x-api-key'];
  const rawKey = apiKeyHeader || (authHeader?.startsWith('Bearer c360_') ? authHeader.slice(7) : null);

  if (!rawKey) return res.status(401).json({ error: 'API key required' });

  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const key = D().prepare(
    'SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1'
  ).get(keyHash);

  if (!key) return res.status(401).json({ error: 'Invalid API key' });
  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    return res.status(401).json({ error: 'API key expired' });
  }
  if (key.requests_this_month >= key.requests_per_month_limit) {
    return res.status(429).json({ error: 'Monthly request limit exceeded' });
  }

  // Attach tenant context — same shape as requireAuth so downstream handlers
  // can use req.tenantId and req.apiScopes uniformly.
  req.tenantId = key.tenant_id;
  req.apiKeyId = key.id;
  try { req.apiScopes = JSON.parse(key.scopes || '["read"]'); }
  catch { req.apiScopes = ['read']; }

  // Bump usage counter (best-effort)
  try {
    D().prepare(`
      UPDATE api_keys
      SET requests_this_month = requests_this_month + 1,
          last_used_at = datetime('now'),
          last_used_ip = ?
      WHERE id = ?
    `).run(req.ip || null, key.id);
  } catch (e) { /* non-fatal */ }

  // Log the request — write status_code + response_time on finish so the
  // developer portal can show errors and latency. Use a placeholder row id
  // so we can update the same row instead of inserting twice.
  const logId = randomUUID();
  const start = Date.now();
  try {
    D().prepare(`
      INSERT INTO api_request_log
        (id, tenant_id, api_key_id, method, path, ip_address, user_agent, created_at)
      VALUES (?,?,?,?,?,?,?, datetime('now'))
    `).run(logId, key.tenant_id, key.id, req.method, req.path,
           req.ip || null, req.headers['user-agent'] || null);
  } catch (e) { /* non-fatal */ }

  res.on('finish', () => {
    try {
      D().prepare(`
        UPDATE api_request_log
        SET status_code = ?, response_time_ms = ?
        WHERE id = ?
      `).run(res.statusCode, Date.now() - start, logId);
    } catch (e) { /* non-fatal */ }
  });

  next();
}

export function requireScope(scope) {
  return (req, res, next) => {
    if (!req.apiScopes?.includes(scope)) {
      return res.status(403).json({ error: `Scope '${scope}' required` });
    }
    next();
  };
}

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
