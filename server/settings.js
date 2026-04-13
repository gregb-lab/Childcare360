import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant, requireRole } from './middleware.js';
import { readFileSync, mkdirSync } from 'fs';
import { extname } from 'path';
import multer from 'multer';

const r = Router();

// ── Logo upload multer (module-level, not inside handler) ──
const logoDir = './uploads/logos';
try { mkdirSync(logoDir, { recursive: true }); } catch(e) {}
const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, logoDir),
    filename: (req2, file, cb) => cb(null, (req2.tenantId || 'unknown') + '_logo' + extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

// ── AI model tier helper ──
function getModelForTier(tenantId, tier = 'fast') {
  const defaults = { fast: 'claude-haiku-4-5-20251001', balanced: 'claude-sonnet-4-6', powerful: 'claude-opus-4-6' };
  const validTiers = new Set(['fast', 'balanced', 'powerful']);
  if (!validTiers.has(tier)) return defaults.fast;
  try {
    const col = 'tier_' + tier;
    const sql = 'SELECT ' + col + ' FROM ai_model_tiers WHERE tenant_id=?';
    const row = D().prepare(sql).get(tenantId);
    return row?.[col] || defaults[tier] || defaults.fast;
  } catch(e) { return defaults[tier] || defaults.fast; }
}

// ── AI API key helper ──
function getAnthropicKey(tenantId) {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try { const p = D().prepare("SELECT api_key FROM ai_provider_config WHERE tenant_id=? AND provider='anthropic'").get(tenantId); if (p?.api_key) return p.api_key; } catch(e) {}
  try { const p = D().prepare("SELECT key_value FROM tenant_credentials WHERE tenant_id=? AND provider='anthropic' AND key_name='api_key'").get(tenantId); if (p?.key_value) return p.key_value; } catch(e) {}
  return null;
}

// Ensure tenant_settings table exists
function initSettings() {
  // Add columns if missing
  [
    'smtp_host TEXT','smtp_port INTEGER DEFAULT 587','smtp_user TEXT','smtp_password TEXT','smtp_from TEXT','smtp_secure TEXT DEFAULT \'false\'',
    "brand_primary TEXT DEFAULT '#3C3489'", "brand_accent TEXT DEFAULT '#534AB7'", "brand_light TEXT DEFAULT '#EEEDFE'",
  ].forEach(col => {
    try{const _sSql='ALTER TABLE tenant_settings ADD COLUMN '+col;D().prepare(_sSql).run();}catch(e){}
  });
  D().prepare(`CREATE TABLE IF NOT EXISTS tenant_settings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE,
    service_name TEXT,
    approval_number TEXT,
    abn TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    director_name TEXT,
    nominated_supervisor TEXT,
    service_type TEXT DEFAULT 'long_day_care',
    state TEXT DEFAULT 'NSW',
    open_time TEXT DEFAULT '06:30',
    close_time TEXT DEFAULT '18:30',
    nqs_rating TEXT,
    timezone TEXT DEFAULT 'Australia/Sydney',
    notify_ratio_breach INTEGER DEFAULT 1,
    notify_wwcc_expiry INTEGER DEFAULT 1,
    notify_shift_reminders INTEGER DEFAULT 0,
    notify_daily_compliance INTEGER DEFAULT 1,
    notify_medication_expiry INTEGER DEFAULT 1,
    notify_parent_absence INTEGER DEFAULT 1,
    logo_url TEXT,
    brand_color TEXT DEFAULT '#8B6DAF',
    updated_at TEXT DEFAULT (datetime('now'))
  )`).run();
}

// GET /api/settings
r.get('/', requireAuth, requireTenant, (req, res) => {
  initSettings();
  let s = D().prepare('SELECT * FROM tenant_settings WHERE tenant_id=?').get(req.tenantId);
  if (!s) {
    // Seed from tenant record
    const t = D().prepare('SELECT * FROM tenants WHERE id=?').get(req.tenantId);
    s = { tenant_id: req.tenantId, service_name: t?.name, abn: t?.abn, address: t?.address, phone: t?.phone, email: t?.email, service_type: t?.service_type, timezone: t?.timezone };
  }
  res.json(s);
});

// PUT /api/settings
r.put('/', requireAuth, requireTenant, requireRole('owner','admin','director'), (req, res) => {
  initSettings();
  const f = req.body;
  const id = uuid();
  D().prepare(`INSERT INTO tenant_settings (
    id, tenant_id, service_name, approval_number, abn, address, phone, email,
    director_name, nominated_supervisor, service_type, state, open_time, close_time,
    nqs_rating, timezone, notify_ratio_breach, notify_wwcc_expiry, notify_shift_reminders,
    notify_daily_compliance, notify_medication_expiry, notify_parent_absence, logo_url, brand_color,
    smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, smtp_secure
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(tenant_id) DO UPDATE SET
    service_name=COALESCE(excluded.service_name,service_name),
    approval_number=COALESCE(excluded.approval_number,approval_number),
    abn=COALESCE(excluded.abn,abn), address=COALESCE(excluded.address,address),
    phone=COALESCE(excluded.phone,phone), email=COALESCE(excluded.email,email),
    director_name=COALESCE(excluded.director_name,director_name),
    nominated_supervisor=COALESCE(excluded.nominated_supervisor,nominated_supervisor),
    service_type=COALESCE(excluded.service_type,service_type),
    state=COALESCE(excluded.state,state), open_time=COALESCE(excluded.open_time,open_time),
    close_time=COALESCE(excluded.close_time,close_time), nqs_rating=COALESCE(excluded.nqs_rating,nqs_rating),
    notify_ratio_breach=COALESCE(excluded.notify_ratio_breach,notify_ratio_breach),
    notify_wwcc_expiry=COALESCE(excluded.notify_wwcc_expiry,notify_wwcc_expiry),
    notify_shift_reminders=COALESCE(excluded.notify_shift_reminders,notify_shift_reminders),
    notify_daily_compliance=COALESCE(excluded.notify_daily_compliance,notify_daily_compliance),
    notify_medication_expiry=COALESCE(excluded.notify_medication_expiry,notify_medication_expiry),
    notify_parent_absence=COALESCE(excluded.notify_parent_absence,notify_parent_absence),
    brand_color=COALESCE(excluded.brand_color,brand_color),
    smtp_host=COALESCE(excluded.smtp_host,smtp_host),
    smtp_port=COALESCE(excluded.smtp_port,smtp_port),
    smtp_user=COALESCE(excluded.smtp_user,smtp_user),
    smtp_password=COALESCE(excluded.smtp_password,smtp_password),
    smtp_from=COALESCE(excluded.smtp_from,smtp_from),
    smtp_secure=COALESCE(excluded.smtp_secure,smtp_secure),
    updated_at=datetime('now')`).run(
      id, req.tenantId, f.service_name, f.approval_number, f.abn, f.address, f.phone, f.email,
      f.director_name, f.nominated_supervisor, f.service_type, f.state, f.open_time, f.close_time,
      f.nqs_rating, f.timezone || 'Australia/Sydney',
      f.notify_ratio_breach ? 1 : 0, f.notify_wwcc_expiry ? 1 : 0, f.notify_shift_reminders ? 1 : 0,
      f.notify_daily_compliance ? 1 : 0, f.notify_medication_expiry ? 1 : 0, f.notify_parent_absence ? 1 : 0,
      f.logo_url, f.brand_color || '#8B6DAF',
      f.smtp_host || null, f.smtp_port || 587, f.smtp_user || null, f.smtp_password || null,
      f.smtp_from || null, f.smtp_secure || 'false'
    );
  // Also sync back to tenants table
  D().prepare(`UPDATE tenants SET name=COALESCE(?,name), abn=COALESCE(?,abn), address=COALESCE(?,address), phone=COALESCE(?,phone), email=COALESCE(?,email), service_type=COALESCE(?,service_type), updated_at=datetime('now') WHERE id=?`)
    .run(f.service_name, f.abn, f.address, f.phone, f.email, f.service_type, req.tenantId);
  res.json({ ok: true });
});

// GET /api/settings/users — list users in this tenant
r.get('/users', requireAuth, requireTenant, requireRole('owner','admin','director'), (req, res) => {
  const members = D().prepare(`SELECT tm.*, u.name, u.email, u.phone, u.last_login, u.email_verified, u.locked FROM tenant_members tm JOIN users u ON u.id=tm.user_id WHERE tm.tenant_id=? ORDER BY tm.joined_at DESC`).all(req.tenantId);
  res.json(members);
});

// PUT /api/settings/users/:userId — update role
r.put('/users/:userId', requireAuth, requireTenant, requireRole('admin'), (req, res) => {
  const { role, active } = req.body;
  D().prepare('UPDATE tenant_members SET role=COALESCE(?,role), active=COALESCE(?,active) WHERE user_id=? AND tenant_id=?').run(role || null, active !== undefined ? (active ? 1 : 0) : null, req.params.userId, req.tenantId);
  res.json({ ok: true });
});

// POST /api/settings/users — invite/create a user
r.post('/users', requireAuth, requireTenant, requireRole('owner', 'admin', 'director'), async (req, res) => {
  try {
    const { email, name, role } = req.body;
    if (!email || !role) return res.status(400).json({ error: 'Email and role are required' });

    // Check if user already exists
    let user = D().prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase().trim());
    if (!user) {
      const bcrypt = await import('bcryptjs').catch(() => import('bcrypt'));
      const hash = (bcrypt.default || bcrypt).hashSync('Childcare2024!', 10);
      const userId = uuid();
      D().prepare('INSERT INTO users (id, email, password_hash, name, email_verified, created_at) VALUES (?,?,?,?,1,datetime(\'now\'))').run(userId, email.toLowerCase().trim(), hash, name || '');
      user = { id: userId };
    }

    // Check if already a member
    const existing = D().prepare('SELECT id FROM tenant_members WHERE user_id=? AND tenant_id=?').get(user.id, req.tenantId);
    if (existing) return res.status(409).json({ error: 'User is already a member of this organisation' });

    D().prepare('INSERT INTO tenant_members (id, user_id, tenant_id, role, active, invited_by, joined_at) VALUES (?,?,?,?,1,?,datetime(\'now\'))').run(uuid(), user.id, req.tenantId, role, req.userId);
    res.json({ ok: true, userId: user.id });
  } catch (e) { console.error('[settings:invite]', e); res.status(500).json({ error: e.message }); }
});

// DELETE /api/settings/users/:userId — remove from tenant
r.delete('/users/:userId', requireAuth, requireTenant, requireRole('owner', 'admin'), (req, res) => {
  try {
    if (req.params.userId === req.userId) return res.status(400).json({ error: 'Cannot remove yourself' });
    D().prepare('DELETE FROM tenant_members WHERE user_id=? AND tenant_id=?').run(req.params.userId, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/settings/branding
r.get('/branding', requireAuth, requireTenant, (req, res) => {
  try {
    initSettings();
    const row = D().prepare(
      'SELECT logo_url, brand_primary, brand_accent, brand_light FROM tenant_settings WHERE tenant_id=?'
    ).get(req.tenantId);
    res.json(row || { logo_url: null, brand_primary: '#3C3489', brand_accent: '#534AB7', brand_light: '#EEEDFE' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/settings/branding
r.put('/branding', requireAuth, requireTenant, requireRole('owner', 'admin', 'director'), (req, res) => {
  try {
    const { brand_primary, brand_accent, brand_light } = req.body;
    initSettings();
    D().prepare(`INSERT INTO tenant_settings (id, tenant_id, brand_primary, brand_accent, brand_light)
      VALUES (?,?,?,?,?)
      ON CONFLICT(tenant_id) DO UPDATE SET
        brand_primary=COALESCE(?,brand_primary),
        brand_accent=COALESCE(?,brand_accent),
        brand_light=COALESCE(?,brand_light),
        updated_at=datetime('now')`)
      .run(uuid(), req.tenantId, brand_primary, brand_accent, brand_light,
        brand_primary, brand_accent, brand_light);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/settings/logo — upload logo + AI colour suggestion
r.post('/logo', requireAuth, requireTenant, logoUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const logoUrl = '/uploads/logos/' + req.file.filename;
    initSettings();
    D().prepare("INSERT INTO tenant_settings (id, tenant_id, logo_url) VALUES (?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET logo_url=excluded.logo_url, updated_at=datetime('now')")
      .run(uuid(), req.tenantId, logoUrl);

    // AI colour suggestion (non-fatal)
    let suggested_colors = null;
    try {
      const apiKey = getAnthropicKey(req.tenantId);
      if (apiKey) {
        const imageData = readFileSync(req.file.path);
        const base64 = imageData.toString('base64');
        const model = getModelForTier(req.tenantId, 'fast');
        console.log('[branding] Calling', model, 'for colour suggestions, image:', imageData.length, 'bytes');
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model, max_tokens: 300,
            messages: [{ role: 'user', content: [
              { type: 'image', source: { type: 'base64', media_type: req.file.mimetype, data: base64 } },
              { type: 'text', text: 'Analyse this childcare centre logo and suggest 2 complementary colour schemes for their management software UI.\n\nColour roles:\n- brand_primary: sidebar background and page headers — must be dark enough for white text (contrast 4.5:1+, lightness < 40%)\n- brand_accent: buttons, active nav items, interactive elements — medium tone that works on white backgrounds\n- brand_light: selected item backgrounds, highlight tints, hover states — very light (lightness > 85%) so dark text is readable\n\nRules:\n- Draw inspiration from the logo but ensure UI usability\n- Colours should feel warm and friendly for a childcare environment\n- Each scheme needs a short friendly name\n\nReturn ONLY this JSON:\n{"schemes":[{"name":"...","brand_primary":"#hexcolor","brand_accent":"#hexcolor","brand_light":"#hexcolor"},{"name":"...","brand_primary":"#hexcolor","brand_accent":"#hexcolor","brand_light":"#hexcolor"}]}' }
            ]}]
          }),
        });
        console.log('[branding] Anthropic status:', aiRes.status);
        const aiData = await aiRes.json();
        if (aiRes.ok && aiData.content?.[0]?.text) {
          const jsonMatch = aiData.content[0].text.match(/\{[\s\S]*\}/);
          if (jsonMatch) suggested_colors = JSON.parse(jsonMatch[0]);
          console.log('[branding] Parsed', suggested_colors?.schemes?.length, 'schemes');
        } else {
          console.error('[branding] AI error:', JSON.stringify(aiData).slice(0, 200));
        }
      } else {
        console.log('[branding] No API key — skipping colour suggestions');
      }
    } catch(aiErr) { console.error('[branding:ai]', aiErr.message); }

    res.json({ ok: true, logo_url: logoUrl, suggested_colors });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/settings/integrations
r.get('/integrations', requireAuth, requireTenant, (req, res) => {
  // Return integration stubs for now
  res.json({ xero: false, myGovID: false, acecqaPortal: false, smartCentral: false });
});

// POST /api/settings/test-email — test SMTP configuration
// POST /api/settings/test-email — test SMTP configuration
r.post('/test-email', requireAuth, requireTenant, async (req, res) => {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, smtp_secure } = req.body;
    if (!smtp_host || !smtp_user) return res.status(400).json({ error: 'SMTP host and username required' });
    let nodemailer;
    try { nodemailer = await import('nodemailer'); } catch(e) {
      return res.json({ error: 'nodemailer not installed — run: npm install nodemailer' });
    }
    const t = nodemailer.default.createTransport({
      host: smtp_host, port: parseInt(smtp_port)||587, secure: smtp_secure==='true',
      auth: { user: smtp_user, pass: smtp_password }, tls: { rejectUnauthorized: false }
    });
    await t.verify();
    await t.sendMail({
      from: smtp_from || smtp_user, to: smtp_user,
      subject: 'Childcare360 — SMTP Test',
      text: `SMTP configured correctly. Sent at ${new Date().toLocaleString('en-AU')}.`
    });
    res.json({ ok: true });
  } catch(e) { res.json({ error: e.message || 'SMTP failed' }); }
});

// ═══ RESEED DEMO DATA ═══════════════════════════════════════════════════════
r.post('/reseed', requireAuth, requireTenant, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { execSync } = await import('child_process');
    const result = execSync('node server/seed-9room.js', {
      cwd: process.cwd(),
      timeout: 30000,
      encoding: 'utf8',
    });
    res.json({ ok: true, output: result.split('\n').filter(l => l.includes('✓') || l.includes('✅')).join('\n') });
  } catch (e) {
    res.status(500).json({ error: e.message, output: e.stdout || '' });
  }
});

// ── AI Model Tiers ──────────────────────────────────────────────────────────
function ensureTiersTable() {
  try { D().exec(`CREATE TABLE IF NOT EXISTS ai_model_tiers (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL UNIQUE,
    tier_fast TEXT DEFAULT 'claude-haiku-4-5-20251001',
    tier_balanced TEXT DEFAULT 'claude-sonnet-4-6',
    tier_powerful TEXT DEFAULT 'claude-opus-4-6',
    auto_update INTEGER DEFAULT 1, last_checked TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  )`); } catch(e) {}
}

r.get('/ai-tiers', requireAuth, requireTenant, (req, res) => {
  try {
    ensureTiersTable();
    let row = D().prepare('SELECT * FROM ai_model_tiers WHERE tenant_id=?').get(req.tenantId);
    if (!row) {
      D().prepare('INSERT INTO ai_model_tiers (id, tenant_id) VALUES (?,?)').run(uuid(), req.tenantId);
      row = D().prepare('SELECT * FROM ai_model_tiers WHERE tenant_id=?').get(req.tenantId);
    }
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/ai-tiers', requireAuth, requireTenant, (req, res) => {
  try {
    ensureTiersTable();
    const { tier_fast, tier_balanced, tier_powerful, auto_update } = req.body;
    D().prepare("INSERT INTO ai_model_tiers (id, tenant_id, tier_fast, tier_balanced, tier_powerful, auto_update) VALUES (?,?,?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET tier_fast=excluded.tier_fast, tier_balanced=excluded.tier_balanced, tier_powerful=excluded.tier_powerful, auto_update=excluded.auto_update, updated_at=datetime('now')")
      .run(uuid(), req.tenantId, tier_fast || 'claude-haiku-4-5-20251001', tier_balanced || 'claude-sonnet-4-6', tier_powerful || 'claude-opus-4-6', auto_update != null ? (auto_update ? 1 : 0) : 1);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/ai-tiers/check-updates', requireAuth, requireTenant, async (req, res) => {
  try {
    ensureTiersTable();
    const apiKey = getAnthropicKey(req.tenantId);
    if (!apiKey) return res.json({ updated: false, reason: 'No API key' });
    const modelsRes = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    });
    if (!modelsRes.ok) return res.json({ updated: false, reason: 'API error: ' + modelsRes.status });
    const { data: models } = await modelsRes.json();
    const pick = (kw) => (models || []).filter(m => m.id.includes(kw)).sort((a, b) => b.id.localeCompare(a.id))[0]?.id;
    const recommended = {
      tier_fast: pick('haiku') || 'claude-haiku-4-5-20251001',
      tier_balanced: pick('sonnet') || 'claude-sonnet-4-6',
      tier_powerful: pick('opus') || 'claude-opus-4-6',
    };
    const current = D().prepare('SELECT * FROM ai_model_tiers WHERE tenant_id=?').get(req.tenantId);
    if (current?.auto_update) {
      D().prepare("UPDATE ai_model_tiers SET tier_fast=?, tier_balanced=?, tier_powerful=?, last_checked=datetime('now'), updated_at=datetime('now') WHERE tenant_id=?")
        .run(recommended.tier_fast, recommended.tier_balanced, recommended.tier_powerful, req.tenantId);
    } else {
      D().prepare("INSERT INTO ai_model_tiers (id, tenant_id, last_checked) VALUES (?,?,datetime('now')) ON CONFLICT(tenant_id) DO UPDATE SET last_checked=datetime('now')")
        .run(uuid(), req.tenantId);
    }
    res.json({ updated: !!current?.auto_update, recommended, current });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Export getModelForTier and getAnthropicKey for use by other modules
export { getModelForTier, getAnthropicKey };
export default r;
