// ─── Developer Portal — API key + webhook management ──────────────────────
//
// These routes are JWT-authenticated (a tenant manager managing their own
// keys). The actual /v1/* public API uses requireApiKey instead — see
// server/publicapi.js. The two are intentionally separate so the public API
// can never be hit with a manager's session JWT.

import { Router } from 'express';
import { createHash, randomBytes } from 'crypto';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const router = Router();
router.use(requireAuth, requireTenant);

const TIER_LIMITS = { read: 50000, read_write: 100000, full: 500000 };

// ════════════════════════════════════════════════════════════════════════════
// API KEYS
// ════════════════════════════════════════════════════════════════════════════

// GET /api/developer/keys
router.get('/keys', (req, res) => {
  try {
    const keys = D().prepare(`
      SELECT id, name, key_prefix, scopes, tier,
             requests_per_month_limit, requests_this_month,
             last_used_at, is_active, created_at, expires_at
      FROM api_keys
      WHERE tenant_id = ?
      ORDER BY created_at DESC
    `).all(req.tenantId);
    // Parse JSON scopes for the UI
    res.json(keys.map(k => ({
      ...k,
      scopes: (() => { try { return JSON.parse(k.scopes || '["read"]'); } catch { return ['read']; } })(),
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/developer/keys
// Body: { name, scopes?, tier? }
//
// Generates a fresh c360_sk_<32 hex> token. The plaintext is returned ONCE
// in the response — only its SHA256 hash is persisted, so we cannot ever
// show it again. The UI surfaces a "save this now" warning.
router.post('/keys', (req, res) => {
  try {
    const { name, scopes, tier } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Key name required' });

    const validTier = TIER_LIMITS[tier] !== undefined ? tier : 'read';
    const validScopes = Array.isArray(scopes) && scopes.length ? scopes : ['read'];

    // c360_sk_ + 32 hex chars (16 bytes)
    const rawKey = 'c360_sk_' + randomBytes(16).toString('hex');
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    // Visible prefix in the UI: "c360_sk_xxxxxxxx" (16 chars total)
    const keyPrefix = rawKey.slice(0, 16);
    const id = uuid();

    D().prepare(`
      INSERT INTO api_keys
        (id, tenant_id, key_hash, key_prefix, name, scopes, tier,
         requests_per_month_limit, created_by, created_at)
      VALUES (?,?,?,?,?,?,?,?,?, datetime('now'))
    `).run(id, req.tenantId, keyHash, keyPrefix, name,
           JSON.stringify(validScopes), validTier,
           TIER_LIMITS[validTier], req.userId || null);

    res.json({
      id,
      name,
      key_prefix: keyPrefix,
      raw_key: rawKey,
      scopes: validScopes,
      tier: validTier,
      message: 'Save this key — it cannot be shown again',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/developer/keys/:id — soft revoke (set is_active=0)
router.delete('/keys/:id', (req, res) => {
  try {
    const result = D().prepare(
      'UPDATE api_keys SET is_active = 0 WHERE id = ? AND tenant_id = ?'
    ).run(req.params.id, req.tenantId);
    if (result.changes === 0) return res.status(404).json({ error: 'Key not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// USAGE
// ════════════════════════════════════════════════════════════════════════════

// GET /api/developer/usage?days=30
//
// Returns daily request counts + a summary block + the last 50 individual
// requests. The UI uses the daily series for the chart and the recent
// requests for the log table.
router.get('/usage', (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const daily = D().prepare(`
      SELECT DATE(created_at) as date,
             COUNT(*) as requests,
             AVG(response_time_ms) as avg_response_ms,
             COUNT(CASE WHEN status_code >= 400 THEN 1 END) as errors
      FROM api_request_log
      WHERE tenant_id = ? AND created_at >= datetime('now', ?)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all(req.tenantId, `-${days} days`);

    const recent = D().prepare(`
      SELECT id, method, path, status_code, response_time_ms, created_at, api_key_id
      FROM api_request_log
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.tenantId);

    const totalRequests = daily.reduce((s, d) => s + (d.requests || 0), 0);
    const totalErrors = daily.reduce((s, d) => s + (d.errors || 0), 0);
    const avgResponse = daily.length
      ? Math.round(daily.reduce((s, d) => s + (d.avg_response_ms || 0), 0) / daily.length)
      : 0;

    res.json({
      days,
      summary: {
        total_requests: totalRequests,
        total_errors: totalErrors,
        error_rate_pct: totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 100) : 0,
        avg_response_ms: avgResponse,
      },
      daily,
      recent,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// WEBHOOKS
// ════════════════════════════════════════════════════════════════════════════

// GET /api/developer/webhooks
router.get('/webhooks', (req, res) => {
  try {
    const webhooks = D().prepare(`
      SELECT id, url, events, is_active, last_triggered_at, failure_count, created_at
      FROM webhooks
      WHERE tenant_id = ?
      ORDER BY created_at DESC
    `).all(req.tenantId);
    res.json(webhooks.map(w => ({
      ...w,
      events: (() => { try { return JSON.parse(w.events || '[]'); } catch { return []; } })(),
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/developer/webhooks
// Body: { url, events }
//
// Generates a 64-char hex secret used to sign payloads (HMAC-SHA256). The
// secret is returned ONCE in the response — same pattern as raw keys.
router.post('/webhooks', (req, res) => {
  try {
    const { url, events } = req.body || {};
    if (!url) return res.status(400).json({ error: 'Webhook URL required' });
    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'URL must start with http:// or https://' });
    }
    const secret = randomBytes(32).toString('hex');
    const id = uuid();
    D().prepare(`
      INSERT INTO webhooks (id, tenant_id, url, events, secret, created_at)
      VALUES (?,?,?,?,?, datetime('now'))
    `).run(id, req.tenantId, url, JSON.stringify(events || []), secret);
    res.json({
      id,
      url,
      events: events || [],
      secret,
      message: 'Save this secret — used to verify webhook payloads (HMAC-SHA256)',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/developer/webhooks/:id — hard delete
router.delete('/webhooks/:id', (req, res) => {
  try {
    const result = D().prepare(
      'DELETE FROM webhooks WHERE id = ? AND tenant_id = ?'
    ).run(req.params.id, req.tenantId);
    if (result.changes === 0) return res.status(404).json({ error: 'Webhook not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
