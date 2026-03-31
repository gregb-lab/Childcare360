import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant, requireRole } from './middleware.js';

const r = Router();

// Ensure tenant_settings table exists
function initSettings() {
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
r.put('/', requireAuth, requireTenant, requireRole('admin', 'director'), (req, res) => {
  initSettings();
  const f = req.body;
  const id = uuid();
  D().prepare(`INSERT INTO tenant_settings (
    id, tenant_id, service_name, approval_number, abn, address, phone, email,
    director_name, nominated_supervisor, service_type, state, open_time, close_time,
    nqs_rating, timezone, notify_ratio_breach, notify_wwcc_expiry, notify_shift_reminders,
    notify_daily_compliance, notify_medication_expiry, notify_parent_absence, logo_url, brand_color
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(tenant_id) DO UPDATE SET
    service_name=COALESCE(excluded.service_name,service_name),
    approval_number=COALESCE(excluded.approval_number,approval_number),
    abn=COALESCE(excluded.abn,abn),
    address=COALESCE(excluded.address,address),
    phone=COALESCE(excluded.phone,phone),
    email=COALESCE(excluded.email,email),
    director_name=COALESCE(excluded.director_name,director_name),
    nominated_supervisor=COALESCE(excluded.nominated_supervisor,nominated_supervisor),
    service_type=COALESCE(excluded.service_type,service_type),
    state=COALESCE(excluded.state,state),
    open_time=COALESCE(excluded.open_time,open_time),
    close_time=COALESCE(excluded.close_time,close_time),
    nqs_rating=COALESCE(excluded.nqs_rating,nqs_rating),
    notify_ratio_breach=COALESCE(excluded.notify_ratio_breach,notify_ratio_breach),
    notify_wwcc_expiry=COALESCE(excluded.notify_wwcc_expiry,notify_wwcc_expiry),
    notify_shift_reminders=COALESCE(excluded.notify_shift_reminders,notify_shift_reminders),
    notify_daily_compliance=COALESCE(excluded.notify_daily_compliance,notify_daily_compliance),
    notify_medication_expiry=COALESCE(excluded.notify_medication_expiry,notify_medication_expiry),
    notify_parent_absence=COALESCE(excluded.notify_parent_absence,notify_parent_absence),
    brand_color=COALESCE(excluded.brand_color,brand_color),
    updated_at=datetime('now')`).run(
      id, req.tenantId, f.service_name, f.approval_number, f.abn, f.address, f.phone, f.email,
      f.director_name, f.nominated_supervisor, f.service_type, f.state, f.open_time, f.close_time,
      f.nqs_rating, f.timezone || 'Australia/Sydney',
      f.notify_ratio_breach ? 1 : 0, f.notify_wwcc_expiry ? 1 : 0, f.notify_shift_reminders ? 1 : 0,
      f.notify_daily_compliance ? 1 : 0, f.notify_medication_expiry ? 1 : 0, f.notify_parent_absence ? 1 : 0,
      f.logo_url, f.brand_color || '#8B6DAF'
    );
  // Also sync back to tenants table
  D().prepare(`UPDATE tenants SET name=COALESCE(?,name), abn=COALESCE(?,abn), address=COALESCE(?,address), phone=COALESCE(?,phone), email=COALESCE(?,email), service_type=COALESCE(?,service_type), updated_at=datetime('now') WHERE id=?`)
    .run(f.service_name, f.abn, f.address, f.phone, f.email, f.service_type, req.tenantId);
  res.json({ ok: true });
});

// GET /api/settings/users — list users in this tenant
r.get('/users', requireAuth, requireTenant, requireRole('admin', 'director'), (req, res) => {
  const members = D().prepare(`SELECT tm.*, u.name, u.email, u.phone, u.last_login, u.email_verified, u.locked FROM tenant_members tm JOIN users u ON u.id=tm.user_id WHERE tm.tenant_id=? ORDER BY tm.created_at DESC`).all(req.tenantId);
  res.json(members);
});

// PUT /api/settings/users/:userId — update role
r.put('/users/:userId', requireAuth, requireTenant, requireRole('admin'), (req, res) => {
  const { role, active } = req.body;
  D().prepare('UPDATE tenant_members SET role=COALESCE(?,role), active=COALESCE(?,active) WHERE user_id=? AND tenant_id=?').run(role || null, active !== undefined ? (active ? 1 : 0) : null, req.params.userId, req.tenantId);
  res.json({ ok: true });
});

// GET /api/settings/integrations
r.get('/integrations', requireAuth, requireTenant, (req, res) => {
  // Return integration stubs for now
  res.json({ xero: false, myGovID: false, acecqaPortal: false, smartCentral: false });
});

export default r;
