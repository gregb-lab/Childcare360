import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { randomInt, randomBytes } from 'crypto';
import { D, uuid, auditLog } from './db.js';
import { signToken, hashToken, rateLimit, validatePassword, REFRESH_EXPIRY_DAYS } from './middleware.js';

const router = Router();
const BCRYPT_ROUNDS = 12;

// ─── HELPERS ────────────────────────────────────────────────────────────────────
function generateCode() { return String(randomInt(100000, 999999)); }
function expiresIn(minutes) {
  return new Date(Date.now() + minutes * 60000).toISOString();
}
function sendEmail(to, subject, body) {
  // TODO: Integrate real email (nodemailer + SMTP)
  // For now, log to console — replace with actual sending in production
  console.log(`\n  📧 EMAIL to ${to}:`);
  console.log(`     Subject: ${subject}`);
  console.log(`     ${body}\n`);
  return true;
}

function issueTokens(user, tenantId) {
  const accessToken = signToken({ userId: user.id, email: user.email, tenantId, role: user.role || "educator" });
  const refreshToken = randomBytes(48).toString('hex');
  const refreshHash = hashToken(refreshToken);
  D().prepare(
    'INSERT INTO sessions (id, user_id, tenant_id, token_hash, expires_at) VALUES (?,?,?,?,?)'
  ).run(uuid(), user.id, tenantId, refreshHash, expiresIn(REFRESH_EXPIRY_DAYS * 24 * 60));
  D().prepare("UPDATE users SET last_login = datetime('now'), failed_attempts = 0 WHERE id = ?").run(user.id);
  return { accessToken, refreshToken };
}

function getUserTenants(userId) {
  return D().prepare(`
    SELECT t.id, t.name, t.service_type, tm.role
    FROM tenant_members tm JOIN tenants t ON t.id = tm.tenant_id
    WHERE tm.user_id = ? AND tm.active = 1
  `).all(userId);
}

function isPlatformAdmin(userId) {
  const row = D().prepare('SELECT role FROM platform_admins WHERE user_id = ?').get(userId);
  return row ? row.role : null;
}

function sanitiseUser(user) {
  const { password_hash, mfa_secret, ...safe } = user;
  return safe;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ██  REGISTER
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/register', rateLimit(10, 900000), (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password and name are required' });
    }
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    // Check existing
    const existing = D().prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const userId = uuid();
    const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
    D().prepare(
      'INSERT INTO users (id, email, password_hash, name, phone, auth_provider) VALUES (?,?,?,?,?,?)'
    ).run(userId, email.toLowerCase().trim(), hash, name.trim(), phone || null, 'email');

    // Send verification code
    const code = generateCode();
    D().prepare(
      'INSERT INTO verification_codes (id, user_id, code, type, expires_at) VALUES (?,?,?,?,?)'
    ).run(uuid(), userId, code, 'email_verify', expiresIn(30));
    sendEmail(email, 'Childcare360 — Verify your email', `Your verification code is: ${code}`);

    auditLog(userId, null, 'register', { email }, req.ip, req.headers['user-agent']);
    res.json({ success: true, userId, message: 'Account created. Check your email for verification code.' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  VERIFY EMAIL
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/verify-email', rateLimit(10, 900000), (req, res) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) return res.status(400).json({ error: 'User ID and code required' });

    const vc = D().prepare(
      "SELECT * FROM verification_codes WHERE user_id = ? AND code = ? AND type = 'email_verify' AND used = 0 AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1"
    ).get(userId, code);
    if (!vc) return res.status(400).json({ error: 'Invalid or expired code' });

    D().prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    D().prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(vc.id);

    auditLog(userId, null, 'email_verified', {}, req.ip, req.headers['user-agent']);
    res.json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  LOGIN (email/password → MFA if enabled)
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/login', rateLimit(15, 900000), (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = D().prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (user.locked) {
      return res.status(403).json({ error: 'Account locked. Contact your administrator.' });
    }
    if (!bcrypt.compareSync(password, user.password_hash)) {
      const attempts = (user.failed_attempts || 0) + 1;
      const locked = attempts >= 10 ? 1 : 0;
      D().prepare('UPDATE users SET failed_attempts = ?, locked = ? WHERE id = ?').run(attempts, locked, user.id);
      auditLog(user.id, null, 'login_failed', { attempts }, req.ip, req.headers['user-agent']);
      if (locked) return res.status(403).json({ error: 'Account locked due to too many failed attempts' });
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (!user.email_verified) {
      // Resend code
      const code = generateCode();
      D().prepare('INSERT INTO verification_codes (id,user_id,code,type,expires_at) VALUES(?,?,?,?,?)')
        .run(uuid(), user.id, code, 'email_verify', expiresIn(30));
      sendEmail(email, 'Childcare360 — Verify your email', `Your verification code is: ${code}`);
      return res.status(403).json({ error: 'Email not verified. New code sent.', code: 'EMAIL_NOT_VERIFIED', userId: user.id });
    }

    // MFA check
    if (user.mfa_enabled) {
      if (user.mfa_method === 'email') {
        const code = generateCode();
        D().prepare('INSERT INTO verification_codes (id,user_id,code,type,expires_at) VALUES(?,?,?,?,?)')
          .run(uuid(), user.id, code, 'mfa_email', expiresIn(10));
        sendEmail(user.email, 'Childcare360 — Login verification code', `Your login code is: ${code}`);
      }
      auditLog(user.id, null, 'login_mfa_required', {}, req.ip, req.headers['user-agent']);
      return res.json({
        mfaRequired: true, userId: user.id, mfaMethod: user.mfa_method,
        message: user.mfa_method === 'email' ? 'Verification code sent to your email' : 'Enter your authenticator code'
      });
    }

    // No MFA — issue tokens
    const tenants = getUserTenants(user.id);
    const tenantId = tenants.length === 1 ? tenants[0].id : null;
    const tokens = issueTokens(user, tenantId);
    auditLog(user.id, tenantId, 'login_success', {}, req.ip, req.headers['user-agent']);

    res.json({
      ...tokens, user: sanitiseUser(user), tenants, platformRole: isPlatformAdmin(user.id),
      currentTenant: tenantId ? tenants[0] : null,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  VERIFY MFA (TOTP or email code)
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/verify-mfa', rateLimit(10, 900000), (req, res) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) return res.status(400).json({ error: 'User ID and code required' });

    const user = D().prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let valid = false;
    if (user.mfa_method === 'totp') {
      valid = authenticator.check(code, user.mfa_secret);
    } else {
      const vc = D().prepare(
        "SELECT * FROM verification_codes WHERE user_id = ? AND code = ? AND type = 'mfa_email' AND used = 0 AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1"
      ).get(userId, code);
      if (vc) {
        valid = true;
        D().prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(vc.id);
      }
    }

    if (!valid) {
      return res.status(401).json({ error: 'Invalid verification code' });
    }

    const tenants = getUserTenants(user.id);
    const tenantId = tenants.length === 1 ? tenants[0].id : null;
    const tokens = issueTokens(user, tenantId);
    auditLog(user.id, tenantId, 'mfa_verified', {}, req.ip, req.headers['user-agent']);

    res.json({
      ...tokens, user: sanitiseUser(user), tenants, platformRole: isPlatformAdmin(user.id),
      currentTenant: tenantId ? tenants[0] : null,
    });
  } catch (err) {
    console.error('MFA verify error:', err);
    res.status(500).json({ error: 'MFA verification failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  MFA SETUP (enable TOTP or email MFA)
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/mfa/setup', (req, res) => {
  try {
    const { userId, method } = req.body; // method: 'totp' or 'email'
    const user = D().prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (method === 'totp') {
      const secret = authenticator.generateSecret();
      const otpauthUrl = authenticator.keyuri(user.email, 'Childcare360', secret);
      // Store secret temporarily — confirmed after first successful verify
      D().prepare('UPDATE users SET mfa_secret = ?, mfa_method = ? WHERE id = ?').run(secret, 'totp', userId);
      return res.json({ secret, otpauthUrl, method: 'totp' });
    } else {
      D().prepare("UPDATE users SET mfa_method = 'email' WHERE id = ?").run(userId);
      return res.json({ method: 'email', message: 'Email MFA configured' });
    }
  } catch (err) {
    console.error('MFA setup error:', err);
    res.status(500).json({ error: 'MFA setup failed' });
  }
});

router.post('/mfa/confirm', (req, res) => {
  try {
    const { userId, code } = req.body;
    const user = D().prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user || !user.mfa_secret) return res.status(400).json({ error: 'MFA not set up' });

    if (!authenticator.check(code, user.mfa_secret)) {
      return res.status(401).json({ error: 'Invalid code. Try again.' });
    }
    D().prepare('UPDATE users SET mfa_enabled = 1 WHERE id = ?').run(userId);
    auditLog(userId, null, 'mfa_enabled', { method: user.mfa_method }, null, null);
    res.json({ success: true, message: 'MFA enabled successfully' });
  } catch (err) {
    console.error('MFA confirm error:', err);
    res.status(500).json({ error: 'MFA confirmation failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  GOOGLE OAUTH CALLBACK
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/oauth/google', rateLimit(20, 900000), async (req, res) => {
  try {
    const { credential } = req.body; // Google ID token from frontend
    if (!credential) return res.status(400).json({ error: 'Google credential required' });

    // Verify Google token
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    if (!GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'Google OAuth not configured' });

    // Decode JWT (Google ID tokens are JWTs)
    const parts = credential.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    if (!payload.email_verified) return res.status(400).json({ error: 'Google email not verified' });

    // Find or create user
    let user = D().prepare('SELECT * FROM users WHERE email = ?').get(payload.email.toLowerCase());
    if (!user) {
      const userId = uuid();
      D().prepare(
        'INSERT INTO users (id,email,name,auth_provider,provider_id,email_verified,avatar_url) VALUES(?,?,?,?,?,1,?)'
      ).run(userId, payload.email.toLowerCase(), payload.name || payload.email, 'google', payload.sub, payload.picture);
      user = D().prepare('SELECT * FROM users WHERE id = ?').get(userId);
      auditLog(userId, null, 'register_google', { email: payload.email }, req.ip, req.headers['user-agent']);
    } else if (user.auth_provider === 'email' && !user.provider_id) {
      // Link Google to existing email account
      D().prepare('UPDATE users SET provider_id = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?')
        .run(payload.sub, payload.picture, user.id);
    }

    if (user.locked) return res.status(403).json({ error: 'Account locked' });

    // MFA check
    if (user.mfa_enabled) {
      if (user.mfa_method === 'email') {
        const code = generateCode();
        D().prepare('INSERT INTO verification_codes (id,user_id,code,type,expires_at) VALUES(?,?,?,?,?)')
          .run(uuid(), user.id, code, 'mfa_email', expiresIn(10));
        sendEmail(user.email, 'Childcare360 — Login verification code', `Your login code is: ${code}`);
      }
      return res.json({ mfaRequired: true, userId: user.id, mfaMethod: user.mfa_method });
    }

    const tenants = getUserTenants(user.id);
    const tenantId = tenants.length === 1 ? tenants[0].id : null;
    const tokens = issueTokens(user, tenantId);
    auditLog(user.id, tenantId, 'login_google', {}, req.ip, req.headers['user-agent']);
    res.json({ ...tokens, user: sanitiseUser(user), tenants, platformRole: isPlatformAdmin(user.id), currentTenant: tenantId ? tenants[0] : null });
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  APPLE OAUTH CALLBACK
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/oauth/apple', rateLimit(20, 900000), async (req, res) => {
  try {
    const { id_token, user: appleUser } = req.body;
    if (!id_token) return res.status(400).json({ error: 'Apple ID token required' });

    const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID;
    if (!APPLE_CLIENT_ID) return res.status(500).json({ error: 'Apple OAuth not configured' });

    const parts = id_token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    let user = D().prepare('SELECT * FROM users WHERE email = ?').get(payload.email.toLowerCase());
    if (!user) {
      const userId = uuid();
      const name = appleUser?.name ? `${appleUser.name.firstName || ''} ${appleUser.name.lastName || ''}`.trim() : payload.email;
      D().prepare(
        'INSERT INTO users (id,email,name,auth_provider,provider_id,email_verified) VALUES(?,?,?,?,?,1)'
      ).run(userId, payload.email.toLowerCase(), name, 'apple', payload.sub);
      user = D().prepare('SELECT * FROM users WHERE id = ?').get(userId);
      auditLog(userId, null, 'register_apple', { email: payload.email }, req.ip, req.headers['user-agent']);
    }

    if (user.locked) return res.status(403).json({ error: 'Account locked' });
    if (user.mfa_enabled) {
      if (user.mfa_method === 'email') {
        const code = generateCode();
        D().prepare('INSERT INTO verification_codes (id,user_id,code,type,expires_at) VALUES(?,?,?,?,?)')
          .run(uuid(), user.id, code, 'mfa_email', expiresIn(10));
        sendEmail(user.email, 'Childcare360 — Login verification code', `Your login code is: ${code}`);
      }
      return res.json({ mfaRequired: true, userId: user.id, mfaMethod: user.mfa_method });
    }

    const tenants = getUserTenants(user.id);
    const tenantId = tenants.length === 1 ? tenants[0].id : null;
    const tokens = issueTokens(user, tenantId);
    auditLog(user.id, tenantId, 'login_apple', {}, req.ip, req.headers['user-agent']);
    res.json({ ...tokens, user: sanitiseUser(user), tenants, platformRole: isPlatformAdmin(user.id), currentTenant: tenantId ? tenants[0] : null });
  } catch (err) {
    console.error('Apple OAuth error:', err);
    res.status(500).json({ error: 'Apple authentication failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  REFRESH TOKEN
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

    const hash = hashToken(refreshToken);
    const session = D().prepare(
      "SELECT * FROM sessions WHERE token_hash = ? AND expires_at > datetime('now')"
    ).get(hash);
    if (!session) return res.status(401).json({ error: 'Invalid or expired refresh token' });

    const user = D().prepare('SELECT * FROM users WHERE id = ? AND locked = 0').get(session.user_id);
    if (!user) return res.status(401).json({ error: 'Account not found or locked' });

    // Rotate refresh token
    D().prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
    const tenants = getUserTenants(user.id);
    const tokens = issueTokens(user, session.tenant_id);

    res.json({ ...tokens, user: sanitiseUser(user), tenants, platformRole: isPlatformAdmin(user.id), currentTenant: tenants.find(t => t.id === session.tenant_id) || null });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  SWITCH TENANT
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/switch-tenant', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Auth required' });
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET || 'childcare360-dev-secret-change-in-production');

    const { tenantId } = req.body;
    const member = D().prepare(
      'SELECT * FROM tenant_members WHERE user_id = ? AND tenant_id = ? AND active = 1'
    ).get(decoded.userId, tenantId);
    if (!member) return res.status(403).json({ error: 'Not a member of that organisation' });

    const user = D().prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);
    const token = signToken({ userId: user.id, email: user.email, tenantId, role: user.role || "educator" });
    const tenant = D().prepare('SELECT id, name, service_type FROM tenants WHERE id = ?').get(tenantId);

    auditLog(user.id, tenantId, 'switch_tenant', {}, req.ip, req.headers['user-agent']);
    res.json({ accessToken: token, currentTenant: { ...tenant, role: member.role } });
  } catch (err) {
    console.error('Switch tenant error:', err);
    res.status(500).json({ error: 'Failed to switch organisation' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  CREATE TENANT (Organisation)
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/create-tenant', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Auth required' });
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET || 'childcare360-dev-secret-change-in-production');

    const { name, abn, address, phone, email, serviceType } = req.body;
    if (!name) return res.status(400).json({ error: 'Organisation name required' });

    const tenantId = uuid();
    D().prepare(
      'INSERT INTO tenants (id,name,abn,address,phone,email,service_type) VALUES(?,?,?,?,?,?,?)'
    ).run(tenantId, name.trim(), abn, address, phone, email, serviceType || 'long_day_care');

    // Add creator as admin
    D().prepare(
      'INSERT INTO tenant_members (id,user_id,tenant_id,role) VALUES(?,?,?,?)'
    ).run(uuid(), decoded.userId, tenantId, 'admin');

    const token = signToken({ userId: decoded.userId, email: decoded.email, tenantId });
    auditLog(decoded.userId, tenantId, 'create_tenant', { name }, req.ip, req.headers['user-agent']);

    res.json({
      accessToken: token,
      tenant: { id: tenantId, name: name.trim(), service_type: serviceType || 'long_day_care', role: 'admin' },
    });
  } catch (err) {
    console.error('Create tenant error:', err);
    res.status(500).json({ error: 'Failed to create organisation' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  PASSWORD RESET
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/forgot-password', rateLimit(5, 900000), (req, res) => {
  try {
    const { email } = req.body;
    // Always return success to prevent email enumeration
    const user = D().prepare('SELECT id, email FROM users WHERE email = ?').get(email?.toLowerCase().trim());
    if (user) {
      const code = generateCode();
      D().prepare('INSERT INTO verification_codes (id,user_id,code,type,expires_at) VALUES(?,?,?,?,?)')
        .run(uuid(), user.id, code, 'password_reset', expiresIn(15));
      sendEmail(user.email, 'Childcare360 — Password Reset', `Your password reset code is: ${code}`);
      auditLog(user.id, null, 'password_reset_requested', {}, req.ip, req.headers['user-agent']);
    }
    res.json({ success: true, message: 'If that email exists, a reset code has been sent.' });
  } catch (err) {
    res.status(500).json({ error: 'Password reset failed' });
  }
});

router.post('/reset-password', rateLimit(5, 900000), (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) return res.status(400).json({ error: 'All fields required' });
    const pwErr = validatePassword(newPassword);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const user = D().prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user) return res.status(400).json({ error: 'Invalid reset request' });

    const vc = D().prepare(
      "SELECT * FROM verification_codes WHERE user_id = ? AND code = ? AND type = 'password_reset' AND used = 0 AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1"
    ).get(user.id, code);
    if (!vc) return res.status(400).json({ error: 'Invalid or expired code' });

    const hash = bcrypt.hashSync(newPassword, BCRYPT_ROUNDS);
    D().prepare('UPDATE users SET password_hash = ?, locked = 0, failed_attempts = 0 WHERE id = ?').run(hash, user.id);
    D().prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(vc.id);
    // Invalidate all sessions
    D().prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

    auditLog(user.id, null, 'password_reset', {}, req.ip, req.headers['user-agent']);
    res.json({ success: true, message: 'Password reset. Please log in.' });
  } catch (err) {
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// ── Logout ──
router.post('/logout', (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      D().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(refreshToken));
    }
    res.json({ success: true });
  } catch (err) {
    res.json({ success: true });
  }
});

// ── Resend verification code ──
router.post('/resend-code', rateLimit(3, 300000), (req, res) => {
  try {
    const { userId, type } = req.body;
    const user = D().prepare('SELECT id, email FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const code = generateCode();
    const codeType = type === 'mfa' ? 'mfa_email' : 'email_verify';
    D().prepare('INSERT INTO verification_codes (id,user_id,code,type,expires_at) VALUES(?,?,?,?,?)')
      .run(uuid(), user.id, code, codeType, expiresIn(type === 'mfa' ? 10 : 30));
    sendEmail(user.email, 'Childcare360 — Your verification code', `Your code is: ${code}`);
    res.json({ success: true, message: 'Code sent' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send code' });
  }
});

export default router;
