import { Router } from 'express';
import { D } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);
const uuid = () => crypto.randomUUID();

// GET /api/runsheet?date=YYYY-MM-DD&room_id=xxx
r.get('/', (req, res) => {
  try {
    const { date, room_id } = req.query;
    const today = date || new Date().toISOString().slice(0,10);
    const db = D();
    db.exec(`CREATE TABLE IF NOT EXISTS daily_run_sheets (id TEXT PRIMARY KEY, tenant_id TEXT, room_id TEXT, date TEXT, notes TEXT, generated_by TEXT, created_by TEXT, published_to_parents INTEGER DEFAULT 0, published_at TEXT, published_by TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT, UNIQUE(tenant_id, room_id, date))`);
    ['generated_by TEXT','published_to_parents INTEGER DEFAULT 0','published_at TEXT','published_by TEXT','updated_at TEXT','emailed_at TEXT'].forEach(c => { try { db.exec('ALTER TABLE daily_run_sheets ADD COLUMN '+c); } catch(e) {} });
    db.exec(`CREATE TABLE IF NOT EXISTS run_sheet_children (id TEXT PRIMARY KEY, tenant_id TEXT, run_sheet_id TEXT, child_id TEXT, attended INTEGER DEFAULT 1, mood TEXT, observations TEXT, learning_highlights TEXT, educator_notes TEXT, activities_completed TEXT DEFAULT '[]', notes TEXT, created_at TEXT DEFAULT (datetime('now')))`);
    ['attended INTEGER DEFAULT 1','mood TEXT','observations TEXT','learning_highlights TEXT','educator_notes TEXT'].forEach(c => { try { db.exec('ALTER TABLE run_sheet_children ADD COLUMN '+c); } catch(e) {} });

    // Get all rooms for this tenant (or filtered by room_id)
    const rooms = room_id
      ? [db.prepare('SELECT r.*, ag.label as group_label, ag.ratio FROM rooms r LEFT JOIN age_group_settings ag ON ag.group_id=r.age_group AND ag.tenant_id=r.tenant_id WHERE r.id=? AND r.tenant_id=?').get(room_id, req.tenantId)].filter(Boolean)
      : db.prepare('SELECT r.*, ag.label as group_label, ag.ratio FROM rooms r LEFT JOIN age_group_settings ag ON ag.group_id=r.age_group AND ag.tenant_id=r.tenant_id WHERE r.tenant_id=? ORDER BY r.name').all(req.tenantId);

    const result = rooms.map(room => {
      // Get run sheet for this room+date
      let sheet = db.prepare('SELECT * FROM daily_run_sheets WHERE room_id=? AND date=? AND tenant_id=?').get(room.id, today, req.tenantId);

      // Get children in this room with their health/learning data
      const children = db.prepare(`
        SELECT c.id, c.first_name, c.last_name, c.dob, c.allergies, c.photo_url,
               c.medical_notes,
               mp.plan_type as condition_type, mp.condition_name, mp.notes as medical_plan_notes,
               a.sign_in, a.sign_out, a.absent,
               rsc.activities_completed, rsc.notes as rsc_notes, rsc.id as rsc_id,
               rsc.attended, rsc.mood, rsc.observations, rsc.learning_highlights, rsc.educator_notes,
               (SELECT o.narrative FROM observations o WHERE o.child_id=c.id AND o.tenant_id=? ORDER BY o.timestamp DESC LIMIT 1) as last_observation,
               (SELECT date(o.timestamp) FROM observations o WHERE o.child_id=c.id AND o.tenant_id=? ORDER BY o.timestamp DESC LIMIT 1) as last_obs_date
        FROM children c
        LEFT JOIN medical_plans mp ON mp.child_id=c.id AND mp.status='current' AND mp.tenant_id=?
        LEFT JOIN attendance_sessions a ON a.child_id=c.id AND a.date=? AND a.tenant_id=?
        LEFT JOIN daily_run_sheets drs ON drs.room_id=c.room_id AND drs.date=? AND drs.tenant_id=?
        LEFT JOIN run_sheet_children rsc ON rsc.child_id=c.id AND rsc.run_sheet_id=drs.id
        WHERE c.room_id=? AND c.tenant_id=? AND c.active=1
        ORDER BY c.first_name
      `).all(req.tenantId, req.tenantId, req.tenantId, today, req.tenantId, today, req.tenantId, room.id, req.tenantId);

      return {
        room: { id: room.id, name: room.name, group_label: room.group_label, ratio: room.ratio, capacity: room.capacity },
        sheet: sheet || null,
        children: children.map(c => ({
          ...c,
          activities_completed: JSON.parse(c.activities_completed || '[]'),
        })),
        date: today,
      };
    });

    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/runsheet — create or update a run sheet
r.post('/', (req, res) => {
  try {
    const { room_id, date, notes } = req.body;
    const today = date || new Date().toISOString().slice(0,10);
    if (!room_id) return res.status(400).json({ error: 'room_id required' });
    let sheet = D().prepare('SELECT id FROM daily_run_sheets WHERE room_id=? AND date=? AND tenant_id=?').get(room_id, today, req.tenantId);
    if (sheet) {
      D().prepare("UPDATE daily_run_sheets SET notes=?, updated_at=datetime('now') WHERE id=?").run(notes||null, sheet.id);
      res.json({ id: sheet.id });
    } else {
      const id = uuid();
      D().prepare('INSERT INTO daily_run_sheets (id,tenant_id,room_id,date,generated_by,notes) VALUES(?,?,?,?,?,?)').run(id, req.tenantId, room_id, today, req.userId||null, notes||null);
      res.json({ id });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/runsheet/child/:childId — update a child's run sheet entry
r.put('/child/:childId', (req, res) => {
  try {
    const { run_sheet_id, attended, mood, observations, learning_highlights, educator_notes, activities_completed } = req.body;
    if (!run_sheet_id) return res.status(400).json({ error: 'run_sheet_id required' });
    const existing = D().prepare('SELECT id FROM run_sheet_children WHERE run_sheet_id=? AND child_id=?').get(run_sheet_id, req.params.childId);
    const acts = JSON.stringify(Array.isArray(activities_completed) ? activities_completed : []);
    if (existing) {
      D().prepare('UPDATE run_sheet_children SET attended=?,mood=?,observations=?,learning_highlights=?,educator_notes=?,activities_completed=? WHERE id=?')
        .run(attended?1:0, mood||null, observations||null, learning_highlights||null, educator_notes||null, acts, existing.id);
      res.json({ id: existing.id });
    } else {
      const id = uuid();
      D().prepare('INSERT INTO run_sheet_children (id,run_sheet_id,child_id,attended,mood,observations,learning_highlights,educator_notes,activities_completed) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id, run_sheet_id, req.params.childId, attended?1:0, mood||null, observations||null, learning_highlights||null, educator_notes||null, acts);
      res.json({ id });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/runsheet/child/:childId — alias for history
r.get('/child/:childId', (req, res) => {
  try {
    const rows = D().prepare(`
      SELECT rsc.*, drs.date, r.name as room_name
      FROM run_sheet_children rsc
      JOIN daily_run_sheets drs ON drs.id=rsc.run_sheet_id
      JOIN rooms r ON r.id=drs.room_id
      WHERE rsc.child_id=? AND drs.tenant_id=?
      ORDER BY drs.date DESC LIMIT 30
    `).all(req.params.childId, req.tenantId);
    res.json(rows.map(r => ({ ...r, activities_completed: JSON.parse(r.activities_completed || '[]') })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/runsheet/history/:childId — last 30 days for a child
r.get('/history/:childId', (req, res) => {
  try {
    const rows = D().prepare(`
      SELECT rsc.*, drs.date, r.name as room_name
      FROM run_sheet_children rsc
      JOIN daily_run_sheets drs ON drs.id=rsc.run_sheet_id
      JOIN rooms r ON r.id=drs.room_id
      WHERE rsc.child_id=? AND drs.tenant_id=?
      ORDER BY drs.date DESC LIMIT 30
    `).all(req.params.childId, req.tenantId);
    res.json(rows.map(r => ({ ...r, activities_completed: JSON.parse(r.activities_completed || '[]') })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
