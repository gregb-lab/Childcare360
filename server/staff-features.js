/**
 * server/staff-features.js — v2.6.7
 * Staff portal extended features:
 *  - Staff messaging (educator ↔ manager, educator ↔ educator)
 *  - Certification training links (manager sets, educator sees)
 *  - Professional development requests + feedback
 */
import { Router } from 'express';
import { D } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);
const uuid = () => crypto.randomUUID();

function getMyEdu(userId, tenantId) {
  let e = D().prepare('SELECT * FROM educators WHERE user_id=? AND tenant_id=?').get(userId, tenantId);
  if (!e) {
    const u = D().prepare('SELECT email FROM users WHERE id=?').get(userId);
    if (u?.email) e = D().prepare('SELECT * FROM educators WHERE email=? AND tenant_id=?').get(u.email, tenantId);
  }
  // Preview mode
  return e || null;
}

function getEduOrPreview(userId, tenantId, previewId) {
  if (previewId) return D().prepare('SELECT * FROM educators WHERE id=? AND tenant_id=?').get(previewId, tenantId);
  return getMyEdu(userId, tenantId);
}

// ── MESSAGING ─────────────────────────────────────────────────────────────────

// GET /api/staff-features/messages  — inbox + sent
r.get('/messages', (req, res) => {
  try {
    const { preview_educator_id } = req.query;
    const edu = getEduOrPreview(req.userId, req.tenantId, preview_educator_id);
    const uid = edu?.user_id || req.userId;

    const inbox = D().prepare(`
      SELECT sm.*, u.name as from_name, e.first_name as from_first, e.last_name as from_last
      FROM staff_messages sm
      LEFT JOIN users u ON u.id = sm.from_user_id
      LEFT JOIN educators e ON e.user_id = sm.from_user_id AND e.tenant_id = sm.tenant_id
      WHERE sm.tenant_id=? AND (sm.to_user_id=? OR sm.to_role='all')
      ORDER BY sm.created_at DESC LIMIT 50
    `).all(req.tenantId, uid);

    const sent = D().prepare(`
      SELECT sm.*, u.name as to_name
      FROM staff_messages sm
      LEFT JOIN users u ON u.id = sm.to_user_id
      WHERE sm.tenant_id=? AND sm.from_user_id=?
      ORDER BY sm.created_at DESC LIMIT 50
    `).all(req.tenantId, uid);

    const unread = inbox.filter(m => !m.read_at).length;

    res.json({ inbox, sent, unread });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/staff-features/messages  — send message
r.post('/messages', (req, res) => {
  try {
    const { preview_educator_id } = req.query;
    const edu = getEduOrPreview(req.userId, req.tenantId, preview_educator_id);
    const uid = edu?.user_id || req.userId;

    const { to_user_id, to_role, subject, body, reply_to_id } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'body required' });

    // thread_id: use reply_to's thread or new
    let thread_id = null;
    if (reply_to_id) {
      const orig = D().prepare('SELECT thread_id, id FROM staff_messages WHERE id=? AND tenant_id=?').get(reply_to_id, req.tenantId);
      thread_id = orig?.thread_id || orig?.id;
    }
    const id = uuid();
    if (!thread_id) thread_id = id;

    D().prepare(`INSERT INTO staff_messages (id,tenant_id,from_user_id,to_user_id,to_role,subject,body,thread_id,reply_to_id,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .run(id, req.tenantId, uid, to_user_id || null, to_role || null,
        subject || '(no subject)', body, thread_id, reply_to_id || null);

    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/staff-features/messages/:id/read
r.put('/messages/:id/read', (req, res) => {
  try {
    D().prepare("UPDATE staff_messages SET read_at=datetime('now') WHERE id=? AND tenant_id=?")
      .run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/staff-features/staff-list  — who can be messaged
r.get('/staff-list', (req, res) => {
  try {
    const staff = D().prepare(`
      SELECT e.id, e.first_name, e.last_name, e.qualification, e.user_id,
             r.name as room_name,
             tm.role
      FROM educators e
      LEFT JOIN educator_room_assignments era ON era.educator_id = e.id AND era.tenant_id = e.tenant_id
      LEFT JOIN rooms r ON r.id = era.room_id
      LEFT JOIN tenant_members tm ON tm.user_id = e.user_id AND tm.tenant_id = e.tenant_id
      WHERE e.tenant_id=? AND e.status='active'
      ORDER BY e.first_name, e.last_name
    `).all(req.tenantId);
    // Include admin/manager users too
    const managers = D().prepare(`
      SELECT u.id as user_id, u.name, tm.role
      FROM users u JOIN tenant_members tm ON tm.user_id=u.id
      WHERE tm.tenant_id=? AND tm.role IN ('owner','admin','manager','director')
    `).all(req.tenantId);
    res.json({ staff, managers });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── CERTIFICATION TRAINING LINKS ──────────────────────────────────────────────

// GET /api/staff-features/cert-links?cert_type=first_aid
r.get('/cert-links', (req, res) => {
  try {
    const { cert_type } = req.query;
    const q = cert_type
      ? D().prepare('SELECT * FROM cert_training_links WHERE tenant_id=? AND cert_type=? ORDER BY created_at DESC').all(req.tenantId, cert_type)
      : D().prepare('SELECT * FROM cert_training_links WHERE tenant_id=? ORDER BY cert_type, created_at DESC').all(req.tenantId);
    res.json(q);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/staff-features/cert-links  (manager only)
r.post('/cert-links', (req, res) => {
  try {
    const { cert_type, title, url, provider, notes, cost_est } = req.body;
    if (!cert_type || !title || !url) return res.status(400).json({ error: 'cert_type, title, url required' });
    const id = uuid();
    D().prepare('INSERT INTO cert_training_links (id,tenant_id,cert_type,title,url,provider,notes,cost_est,created_by) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id, req.tenantId, cert_type, title, url, provider||null, notes||null, cost_est||0, req.userId);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/staff-features/cert-links/:id
r.delete('/cert-links/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM cert_training_links WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PROFESSIONAL DEVELOPMENT REQUESTS ────────────────────────────────────────

// GET /api/staff-features/pd-requests  (educator sees own; manager sees all)
r.get('/pd-requests', (req, res) => {
  try {
    const { preview_educator_id, all } = req.query;
    const edu = getEduOrPreview(req.userId, req.tenantId, preview_educator_id);

    let rows;
    if (all === '1' || !edu) {
      // Manager view: all requests
      rows = D().prepare(`
        SELECT pr.*, e.first_name, e.last_name, e.qualification, r.name as room_name
        FROM pd_requests pr
        JOIN educators e ON e.id = pr.educator_id
        LEFT JOIN educator_room_assignments era ON era.educator_id = e.id AND era.tenant_id = e.tenant_id
        LEFT JOIN rooms r ON r.id = era.room_id
        WHERE pr.tenant_id=?
        ORDER BY pr.created_at DESC
      `).all(req.tenantId);
    } else {
      rows = D().prepare(`
        SELECT pr.*, e.first_name, e.last_name FROM pd_requests pr
        JOIN educators e ON e.id=pr.educator_id
        WHERE pr.tenant_id=? AND pr.educator_id=?
        ORDER BY pr.created_at DESC
      `).all(req.tenantId, edu.id);
    }
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/staff-features/pd-requests  (educator creates)
r.post('/pd-requests', (req, res) => {
  try {
    const { preview_educator_id } = req.query;
    const edu = getEduOrPreview(req.userId, req.tenantId, preview_educator_id);
    if (!edu) return res.status(403).json({ error: 'Educator record required' });

    const { title, description, provider, url, start_date, end_date, location,
            delivery_mode, cost_est, expected_outcomes } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    const id = uuid();
    D().prepare(`INSERT INTO pd_requests
      (id,tenant_id,educator_id,title,description,provider,url,start_date,end_date,
       location,delivery_mode,cost_est,expected_outcomes,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',datetime('now'),datetime('now'))`)
      .run(id, req.tenantId, edu.id, title, description||null, provider||null,
        url||null, start_date||null, end_date||null, location||null,
        delivery_mode||'in_person', cost_est||0, expected_outcomes||null);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/staff-features/pd-requests/:id  (manager updates status/feedback/costs)
r.put('/pd-requests/:id', (req, res) => {
  try {
    const { status, manager_notes, manager_feedback, cost_approved,
            location, expected_outcomes, provider, start_date, end_date } = req.body;
    const updates = [];
    const vals = [];

    const fields = { status, manager_notes, manager_feedback, cost_approved,
                     location, expected_outcomes, provider, start_date, end_date };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { updates.push(`${k}=?`); vals.push(v); }
    }
    if (status === 'approved') { updates.push('approved_by=?','approved_at=datetime(\'now\')'); vals.push(req.userId); }
    if (status === 'completed') { updates.push('completed_at=datetime(\'now\')'); }
    updates.push('updated_at=datetime(\'now\')');

    D().prepare((() => 'UPDATE pd_requests SET ' + updates.join(',') + ' WHERE id=? AND tenant_id=?')())
      .run(...vals, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/staff-features/pd-requests/:id
r.delete('/pd-requests/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM pd_requests WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
