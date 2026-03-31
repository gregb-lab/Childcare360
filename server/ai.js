/**
 * server/ai.js — AI provider management + unified credentials store
 *   GET  /api/ai/catalogue          — All supported AI providers + models
 *   GET  /api/ai/providers          — Configured providers for this tenant
 *   POST /api/ai/providers          — Save/update a provider config
 *   DELETE /api/ai/providers/:key   — Remove a provider
 *   POST /api/ai/test/:key          — Test a provider connection
 *   GET  /api/ai/usage              — Usage stats (30 days)
 *   GET  /api/ai/credentials        — All credentials (API keys, secrets)
 *   PUT  /api/ai/credentials        — Save/update credentials bulk
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const router = Router();
router.use(requireAuth, requireTenant);

// ── CATALOGUE (hardcoded, no DB) ─────────────────────────────────────────────
const CATALOGUE = {
  anthropic: {
    name: 'Anthropic Claude', icon: '🟣', website: 'https://console.anthropic.com/',
    default_model: 'claude-sonnet-4-20250514',
    models: [
      { id: 'claude-opus-4-20250514',    label: 'Claude Opus 4',    tier: 'flagship',  in: 15,    out: 75    },
      { id: 'claude-sonnet-4-20250514',  label: 'Claude Sonnet 4',  tier: 'balanced',  in: 3,     out: 15    },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', tier: 'fast',      in: 0.8,   out: 4     },
      { id: 'claude-sonnet-3-7',         label: 'Claude Sonnet 3.7',tier: 'reasoning', in: 3,     out: 15    },
    ],
  },
  openai: {
    name: 'OpenAI', icon: '🟢', website: 'https://platform.openai.com/',
    default_model: 'gpt-4o',
    models: [
      { id: 'gpt-4o',          label: 'GPT-4o',       tier: 'flagship', in: 2.5,  out: 10   },
      { id: 'gpt-4o-mini',     label: 'GPT-4o Mini',  tier: 'fast',     in: 0.15, out: 0.6  },
      { id: 'o3-mini',         label: 'o3-mini',       tier: 'reasoning',in: 1.1,  out: 4.4  },
    ],
  },
  google: {
    name: 'Google Gemini', icon: '🔵', website: 'https://aistudio.google.com/',
    default_model: 'gemini-2.5-pro',
    models: [
      { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro',   tier: 'flagship', in: 1.25, out: 10  },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash',  tier: 'fast',     in: 0,    out: 0   },
    ],
  },
  retell: {
    name: 'Retell AI (Voice)', icon: '📞', website: 'https://app.retellai.com/',
    default_model: 'retell-default',
    models: [{ id: 'retell-default', label: 'Retell Voice Agent', tier: 'voice', in: 0, out: 0 }],
  },
  twilio: {
    name: 'Twilio (SMS/Voice)', icon: '📱', website: 'https://console.twilio.com/',
    default_model: 'twilio-sms',
    models: [{ id: 'twilio-sms', label: 'SMS + Voice', tier: 'comms', in: 0, out: 0 }],
  },
  xero: {
    name: 'Xero (Accounting)', icon: '💼', website: 'https://app.xero.com/',
    default_model: 'xero-api',
    models: [{ id: 'xero-api', label: 'Xero API', tier: 'accounting', in: 0, out: 0 }],
  },
};

// Ensure tenant_credentials table exists
function ensureTable() {
  D().exec(`
    CREATE TABLE IF NOT EXISTS tenant_credentials (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      key_name TEXT NOT NULL,
      key_value TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, provider, key_name)
    )
  `);
  D().exec(`
    CREATE TABLE IF NOT EXISTS ai_provider_config (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      api_key TEXT,
      default_model TEXT,
      is_default INTEGER DEFAULT 0,
      extra_config TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, provider)
    )
  `);
}

// GET /api/ai/catalogue
router.get('/catalogue', (req, res) => {
  res.json(CATALOGUE);
});

// GET /api/ai/providers
router.get('/providers', (req, res) => {
  try {
    ensureTable();
    const rows = D().prepare(
      `SELECT provider, default_model, is_default, extra_config FROM ai_provider_config WHERE tenant_id=?`
    ).all(req.tenantId);
    // Merge with credentials (mask key)
    const creds = D().prepare(
      `SELECT provider, key_name FROM tenant_credentials WHERE tenant_id=? AND key_name LIKE '%key%'`
    ).all(req.tenantId);
    const configuredKeys = new Set(creds.map(c => c.provider));
    const result = rows.map(r => ({
      ...r,
      has_key: configuredKeys.has(r.provider),
      extra_config: r.extra_config ? JSON.parse(r.extra_config) : {},
    }));
    res.json(result);
  } catch (e) { res.json([]); }
});

// POST /api/ai/providers
router.post('/providers', (req, res) => {
  try {
    ensureTable();
    const { provider, api_key, default_model, is_default } = req.body;
    if (!provider) return res.status(400).json({ error: 'provider required' });
    const id = uuid();
    D().prepare('
      INSERT INTO ai_provider_config (id, tenant_id, provider, api_key, default_model, is_default, updated_at)
      VALUES (?,?,?,?,?,?,datetime(\'now\'))
      ON CONFLICT(tenant_id, provider) DO UPDATE SET
        api_key=excluded.api_key, default_model=excluded.default_model,
        is_default=excluded.is_default, updated_at=excluded.updated_at
    ').run(id, req.tenantId, provider, api_key || null, default_model || null, is_default ? 1 : 0);
    // Also save to unified credentials
    if (api_key) {
      const credId = uuid();
      D().prepare('
        INSERT INTO tenant_credentials (id, tenant_id, provider, key_name, key_value, updated_at)
        VALUES (?,?,?,?,?,datetime(\'now\'))
        ON CONFLICT(tenant_id, provider, key_name) DO UPDATE SET key_value=excluded.key_value, updated_at=excluded.updated_at
      ').run(credId, req.tenantId, provider, 'api_key', api_key);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/ai/providers/:key
router.delete('/providers/:key', (req, res) => {
  try {
    ensureTable();
    D().prepare('DELETE FROM ai_provider_config WHERE tenant_id=? AND provider=?')
       .run(req.tenantId, req.params.key);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/ai/test/:key  — quick connection test
router.post('/test/:key', async (req, res) => {
  try {
    ensureTable();
    const prov = req.params.key;
    // Get key from DB
    const cred = D().prepare(
      `SELECT key_value FROM tenant_credentials WHERE tenant_id=? AND provider=? AND key_name='api_key'`
    ).get(req.tenantId, prov);
    const cfg = D().prepare(
      `SELECT api_key, default_model FROM ai_provider_config WHERE tenant_id=? AND provider=?`
    ).get(req.tenantId, prov);
    const key = cred?.key_value || cfg?.api_key;
    if (!key) return res.json({ ok: false, message: 'No API key configured' });
    if (prov === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: cfg?.default_model || 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: 'Hi' }] }),
      });
      const d = await r.json();
      if (d.content) return res.json({ ok: true, model: d.model });
      return res.json({ ok: false, message: d.error?.message || 'Test failed' });
    }
    if (prov === 'openai') {
      const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
      if (r.ok) return res.json({ ok: true, model: 'connected' });
      return res.json({ ok: false, message: 'Invalid key' });
    }
    res.json({ ok: true, message: 'Key saved (live test not available for this provider)' });
  } catch (e) { res.status(500).json({ ok: false, message: e.message }); }
});

// GET /api/ai/usage
router.get('/usage', (req, res) => {
  try {
    const rows = D().prepare('
      SELECT feature, model, COUNT(*) as requests,
             SUM(tokens_in) as total_in, SUM(tokens_out) as total_out,
             SUM(cost_usd) as total_cost, AVG(latency_ms) as avg_latency
      FROM ai_usage_log
      WHERE tenant_id=? AND created_at > datetime(\'now\',\'-30 days\')
      GROUP BY feature, model ORDER BY total_cost DESC
    ').all(req.tenantId);
    const totals = D().prepare('
      SELECT SUM(cost_usd) as spend, SUM(tokens_in+tokens_out) as tokens, COUNT(*) as requests
      FROM ai_usage_log WHERE tenant_id=? AND created_at > datetime(\'now\',\'-30 days\')
    ').get(req.tenantId);
    res.json({ by_feature: rows, totals });
  } catch { res.json({ by_feature: [], totals: {} }); }
});

// GET /api/ai/credentials  — all credentials for this tenant (values masked)
router.get('/credentials', (req, res) => {
  try {
    ensureTable();
    const rows = D().prepare(
      `SELECT provider, key_name, CASE WHEN length(key_value)>8 THEN substr(key_value,1,4)||'••••'||substr(key_value,-4) ELSE '••••' END as masked, updated_at FROM tenant_credentials WHERE tenant_id=? ORDER BY provider, key_name`
    ).all(req.tenantId);
    res.json({ credentials: rows });
  } catch (e) { res.json({ credentials: [] }); }
});

// PUT /api/ai/credentials  — save one or many credentials
router.put('/credentials', (req, res) => {
  try {
    ensureTable();
    const { credentials } = req.body; // [{ provider, key_name, key_value }]
    if (!Array.isArray(credentials)) return res.status(400).json({ error: 'credentials array required' });
    const stmt = D().prepare('
      INSERT INTO tenant_credentials (id, tenant_id, provider, key_name, key_value, updated_at)
      VALUES (?,?,?,?,?,datetime(\'now\'))
      ON CONFLICT(tenant_id, provider, key_name) DO UPDATE SET key_value=excluded.key_value, updated_at=excluded.updated_at
    ');
    const tx = D().transaction((creds) => {
      for (const c of creds) {
        if (c.key_value && c.key_value !== '••••' && !c.key_value.includes('••••')) {
          stmt.run(uuid(), req.tenantId, c.provider, c.key_name, c.key_value);
        }
      }
    });
    tx(credentials);
    res.json({ ok: true, saved: credentials.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/ai/credentials/raw/:provider/:key_name — get actual value (for internal use)
router.get('/credentials/raw/:provider/:key_name', (req, res) => {
  try {
    ensureTable();
    const row = D().prepare(
      `SELECT key_value FROM tenant_credentials WHERE tenant_id=? AND provider=? AND key_name=?`
    ).get(req.tenantId, req.params.provider, req.params.key_name);
    res.json({ value: row?.key_value || null });
  } catch (e) { res.json({ value: null }); }
});

export default router;
