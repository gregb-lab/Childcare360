import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth } from './middleware.js';

// Wrap route handlers for consistent error responses
const wrap = fn => (req, res, next) => {
  try {
    const result = fn(req, res, next);
    if (result && typeof result.catch === 'function') {
      result.catch(e => { if (!res.headersSent) res.status(500).json({ error: e.message }); });
    }
  } catch(e) { if (!res.headersSent) res.status(500).json({ error: e.message }); }
};

const r = Router();
r.use(requireAuth);

// ── Helper: get email of logged-in user ─────────────────────────────────────
function userEmail(userId) {
  return D().prepare('SELECT email FROM users WHERE id=?').get(userId)?.email || null;
}

// ── Helper: get child IDs belonging to this parent ──────────────────────────
function parentChildIds(userId) {
  const email = userEmail(userId);
  if (!email) return [];
  // Check if this user is a staff member (has a tenant membership with a staff role)
  const membership = D().prepare("SELECT role FROM tenant_members WHERE user_id=? AND role IN ('owner','admin','director','educator','manager') LIMIT 1").get(userId);
  if (membership) {
    // Staff/owner: return all active children for their tenant(s) as preview
    const tenantIds = D().prepare("SELECT DISTINCT tenant_id FROM tenant_members WHERE user_id=? AND role IN ('owner','admin','director','educator','manager')").all(userId).map(r=>r.tenant_id);
    if (tenantIds.length) {
      const ph = tenantIds.map(()=>'?').join(',');
      return D().prepare(`SELECT id as child_id FROM children WHERE tenant_id IN (${ph}) AND active=1`).all(...tenantIds).map(r=>r.child_id);
    }
  }
  return D().prepare('SELECT DISTINCT child_id FROM parent_contacts WHERE email=?').all(email).map(r => r.child_id);
}

// ── GET /api/parent/children ─────────────────────────────────────────────────
r.get('/children', (req, res) => {
  const childIds = parentChildIds(req.userId);
  if (!childIds.length) return res.json([]);
  const ph = childIds.map(() => '?').join(',');
  const children = D().prepare(`
    SELECT c.*, r.name as room_name,
      (SELECT COUNT(*) FROM learning_stories ls WHERE ls.tenant_id=c.tenant_id AND ls.published=1 AND ls.child_ids LIKE '%'||c.id||'%') as story_count,
      (SELECT COUNT(*) FROM daily_updates du WHERE du.child_id=c.id AND du.update_date=date('now','localtime')) as today_update_count
    FROM children c LEFT JOIN rooms r ON r.id=c.room_id
    WHERE c.id IN (${ph}) AND c.active=1
  `).all(...childIds);
  res.json(children);
});

// ── PUT /api/parent/children/:id — parent updates their child's contact info ──
r.put('/children/:id', requireAuth, (req, res) => {
  const childIds = getChildIds(req.userId);
  if (!childIds.includes(req.params.id)) return res.status(403).json({ error: 'Access denied' });
  const { parent1_phone, parent2_phone, parent2_email, dietary_notes, emergency_contact_name, emergency_contact_phone } = req.body;
  D().prepare(`UPDATE children SET
    parent1_phone = COALESCE(?, parent1_phone),
    parent2_phone = COALESCE(?, parent2_phone),
    parent2_email = COALESCE(?, parent2_email),
    updated_at = datetime('now')
    WHERE id = ?`).run(parent1_phone || null, parent2_phone || null, parent2_email || null, req.params.id);
  res.json({ ok: true });
});

// ── GET /api/parent/alerts ───────────────────────────────────────────────────
r.get('/alerts', (req, res) => {
  const childIds = parentChildIds(req.userId);
  const alerts = [];
  if (childIds.length) {
    const ph = childIds.map(() => '?').join(',');
    // Incidents in last 7 days
    const incidents = D().prepare(`
      SELECT du.*, c.first_name FROM daily_updates du
      JOIN children c ON c.id=du.child_id
      WHERE du.child_id IN (${ph}) AND du.category='incident' AND du.update_date >= date('now','-7 days','localtime')
      ORDER BY du.created_at DESC LIMIT 5
    `).all(...childIds);
    incidents.forEach(i => alerts.push({ severity: 'urgent', title: `Incident — ${i.first_name}`, message: i.summary || i.notes || 'An incident was recorded. Please contact the centre.' }));
    // Upcoming excursions needing permission
    try {
      const excursions = D().prepare(`
        SELECT e.*, c.first_name FROM excursions e
        JOIN children c ON c.id IN (${ph})
        WHERE e.tenant_id=c.tenant_id AND e.date >= date('now','localtime') AND e.status='scheduled'
        ORDER BY e.date LIMIT 3
      `).all(...childIds);
      excursions.forEach(ex => alerts.push({ severity: 'info', title: `Upcoming Excursion — ${ex.destination || ex.title}`, message: `Scheduled for ${ex.date}. Please ensure permission is confirmed.` }));
    } catch {}
  }
  res.json(alerts);
});

// ── GET /api/parent/messages ─────────────────────────────────────────────────
r.get('/messages', (req, res) => {
  const email = userEmail(req.userId);
  if (!email) return res.json([]);
  const msgs = D().prepare(`
    SELECT pm.*, u.name as from_name FROM parent_messages pm
    LEFT JOIN users u ON u.id=pm.sent_by
    WHERE pm.parent_email=? ORDER BY pm.created_at DESC LIMIT 50
  `).all(email);
  res.json(msgs);
});

// ── POST /api/parent/messages ────────────────────────────────────────────────
r.post('/messages', (req, res) => {
  const { subject, body, child_id } = req.body;
  const email = userEmail(req.userId);
  const user = D().prepare('SELECT name FROM users WHERE id=?').get(req.userId);
  if (!email || !body) return res.status(400).json({ error: 'body required' });
  // Find a tenant to attach this to
  const childIds = parentChildIds(req.userId);
  const child = childIds.length ? D().prepare('SELECT tenant_id FROM children WHERE id=?').get(child_id || childIds[0]) : null;
  if (!child) return res.status(400).json({ error: 'No child found' });
  const id = uuid();
  try {
    D().prepare(`INSERT INTO parent_messages (id,tenant_id,child_id,parent_email,parent_name,subject,body,direction,created_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'))`)
      .run(id, child.tenant_id, child_id || childIds[0], email, user?.name || email, subject || 'Message from Parent', body, 'inbound');
  } catch {
    // parent_messages table might not have direction column in older schema
    D().prepare(`INSERT INTO parent_messages (id,tenant_id,child_id,parent_email,parent_name,subject,body,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))`)
      .run(id, child.tenant_id, child_id || childIds[0], email, user?.name || email, subject || 'Message from Parent', body);
  }
  res.json({ id, ok: true });
});

// ── GET /api/parent/learning/:childId ────────────────────────────────────────
r.get('/learning/:childId', (req, res) => {
  const childIds = parentChildIds(req.userId);
  if (!childIds.includes(req.params.childId)) return res.status(403).json({ error: 'Not authorised' });
  const { period = 'month' } = req.query;
  const periodMap = { today: "date('now','localtime')", week: "date('now','-7 days','localtime')", month: "date('now','-30 days','localtime')", year: "date('now','-365 days','localtime')", all: "date('1970-01-01')" };
  const since = periodMap[period] || periodMap.month;
  const rows = D().prepare(`SELECT ls.*, u.name as educator_name FROM learning_stories ls LEFT JOIN users u ON u.id=ls.educator_id WHERE ls.published=1 AND ls.date >= ${since} ORDER BY ls.date DESC LIMIT 50`).all();
  const stories = rows.filter(s => { try { return JSON.parse(s.child_ids || '[]').includes(req.params.childId); } catch { return false; } })
    .map(s => ({ ...s, child_ids: JSON.parse(s.child_ids || '[]'), eylf_outcomes: JSON.parse(s.eylf_outcomes || '[]'), tags: JSON.parse(s.tags || '[]'), photo_rows: [] }));
  res.json(stories);
});

// ── GET /api/parent/learning/:childId/weekly-report ─────────────────────────
r.get('/learning/:childId/weekly-report', (req, res) => {
  const childIds = parentChildIds(req.userId);
  if (!childIds.includes(req.params.childId)) return res.status(403).json({ error: 'Not authorised' });
  const rep = D().prepare('SELECT * FROM weekly_reports WHERE child_id=? ORDER BY week_start DESC LIMIT 1').get(req.params.childId);
  if (!rep) return res.json(null);
  // Build outcome %
  const stories = D().prepare("SELECT eylf_outcomes FROM learning_stories WHERE published=1 AND date >= date('now','-30 days','localtime')").all()
    .filter(s => { try { return JSON.parse(s.child_ids || '[]').includes(req.params.childId); } catch { return false; } });
  const counts = {};
  stories.forEach(s => { try { JSON.parse(s.eylf_outcomes || '[]').forEach(o => { counts[o] = (counts[o] || 0) + 1; }); } catch {} });
  const maxCount = Math.max(1, ...Object.values(counts));
  const outcomes = {};
  Object.entries(counts).forEach(([k, v]) => { outcomes[k] = Math.round((v / maxCount) * 100); });
  res.json({ ...rep, outcomes, eylf_summary: JSON.parse(rep.eylf_summary || '{}'), progressions: JSON.parse(rep.progressions || '[]') });
});

// ── GET /api/parent/eylf/:childId ────────────────────────────────────────────
r.get('/eylf/:childId', (req, res) => {
  const childIds = parentChildIds(req.userId);
  if (!childIds.includes(req.params.childId)) return res.status(403).json({ error: 'Not authorised' });
  const progress = D().prepare('SELECT * FROM child_eylf_progress WHERE child_id=? ORDER BY eylf_outcome,sub_outcome').all(req.params.childId);
  res.json(progress);
});

// ── GET /api/parent/absences/:childId ────────────────────────────────────────
r.get('/absences/:childId', (req, res) => {
  const childIds = parentChildIds(req.userId);
  if (!childIds.includes(req.params.childId)) return res.status(403).json({ error: 'Not authorised' });
  try {
    const rows = D().prepare('SELECT * FROM child_absences WHERE child_id=? ORDER BY start_date DESC LIMIT 30').all(req.params.childId);
    res.json(rows);
  } catch { res.json([]); }
});

// ── POST /api/parent/absences/:childId ───────────────────────────────────────
r.post('/absences/:childId', (req, res) => {
  const childIds = parentChildIds(req.userId);
  if (!childIds.includes(req.params.childId)) return res.status(403).json({ error: 'Not authorised' });
  const { start_date, end_date, reason, notes } = req.body;
  if (!start_date || !reason) return res.status(400).json({ error: 'start_date and reason required' });
  const child = D().prepare('SELECT tenant_id FROM children WHERE id=?').get(req.params.childId);
  const id = uuid();
  try {
    D().prepare('INSERT INTO child_absences (id,tenant_id,child_id,start_date,end_date,reason,notes,acknowledged,created_at) VALUES(?,?,?,?,?,?,?,0,datetime(\'now\'))')
      .run(id, child?.tenant_id, req.params.childId, start_date, end_date || null, reason, notes || null);
  } catch {
    // Table might not exist, create it
    D().prepare('CREATE TABLE IF NOT EXISTS child_absences (id TEXT PRIMARY KEY, tenant_id TEXT, child_id TEXT, start_date TEXT, end_date TEXT, reason TEXT, notes TEXT, acknowledged INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime(\'now\')))').run();
    D().prepare('INSERT INTO child_absences (id,tenant_id,child_id,start_date,end_date,reason,notes,acknowledged) VALUES(?,?,?,?,?,?,?,0)')
      .run(id, child?.tenant_id, req.params.childId, start_date, end_date || null, reason, notes || null);
  }
  res.json({ id, ok: true });
});

// ── GET /api/parent/documents/:childId ───────────────────────────────────────
r.get('/documents/:childId', (req, res) => {
  const childIds = parentChildIds(req.userId);
  if (!childIds.includes(req.params.childId)) return res.status(403).json({ error: 'Not authorised' });
  const docs = D().prepare("SELECT * FROM child_documents WHERE child_id=? AND (pending_review=0 OR pending_review IS NULL) ORDER BY created_at DESC").all(req.params.childId);
  res.json(docs);
});

// ── GET /api/parent/invoices ─────────────────────────────────────────────────
r.get('/invoices', (req, res) => {
  const childIds = parentChildIds(req.userId);
  if (!childIds.length) return res.json([]);
  const ph = childIds.map(() => '?').join(',');
  try {
    const invoices = D().prepare(`SELECT i.*, c.first_name, c.last_name FROM invoices i JOIN children c ON c.id=i.child_id WHERE i.child_id IN (${ph}) AND i.status != 'draft' ORDER BY i.created_at DESC LIMIT 30`).all(...childIds);
    res.json(invoices.map(inv => ({ ...inv, sessions: JSON.parse(inv.sessions || '[]') })));
  } catch { res.json([]); }
});

// ── GET /api/parent/daily-updates/:childId ───────────────────────────────────
r.get('/daily-updates/:childId', (req, res) => {
  const childIds = parentChildIds(req.userId);
  if (!childIds.includes(req.params.childId)) return res.status(403).json({ error: 'Not authorised' });
  const { date = new Date().toISOString().slice(0, 10) } = req.query;
  const updates = D().prepare("SELECT * FROM daily_updates WHERE child_id=? AND update_date=? ORDER BY created_at DESC").all(req.params.childId, date);
  res.json(updates);
});

// ── GET /api/parent/siblings ──────────────────────────────────────────────────
// Returns all children linked to this parent, grouped by family
r.get('/siblings', (req, res) => {
  const childIds = parentChildIds(req.userId);
  if (!childIds.length) return res.json([]);
  const ph = childIds.map(() => '?').join(',');
  const children = D().prepare(`SELECT c.*, r.name as room_name FROM children c LEFT JOIN rooms r ON r.id=c.room_id WHERE c.id IN (${ph}) AND c.active=1`).all(...childIds);
  res.json(children);
});

export default r;
