import { Router } from 'express';
import { D } from './db.js';
import { requireAuth, requireTenant, requireRole } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);
const uuid = () => crypto.randomUUID();

// GET /api/incidents — list all incidents
r.get('/', (req, res) => {
  try {
    const { from, to, child_id, type, severity } = req.query;
    let sql = `SELECT i.*, c.first_name, c.last_name, c.room_id, rm.name as room_name,
               COALESCE(e.first_name || ' ' || e.last_name, u.name, i.reported_by) as reported_by
               FROM incidents i
               LEFT JOIN children c ON c.id=i.child_id
               LEFT JOIN rooms rm ON rm.id=c.room_id
               LEFT JOIN educators e ON e.id=i.reported_by
               LEFT JOIN users u ON u.id=i.reported_by
               WHERE i.tenant_id=?`;
    const params = [req.tenantId];
    if (from) { sql += ' AND i.date>=?'; params.push(from); }
    if (to) { sql += ' AND i.date<=?'; params.push(to); }
    if (child_id) { sql += ' AND i.child_id=?'; params.push(child_id); }
    if (type) { sql += ' AND i.type=?'; params.push(type); }
    if (severity) { sql += ' AND i.severity=?'; params.push(severity); }
    sql += ' ORDER BY i.date DESC, i.created_at DESC';
    res.json(D().prepare(sql).all(...params));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/incidents/:id
r.get('/:id', (req, res) => {
  try {
    const row = D().prepare(`SELECT i.*, c.first_name, c.last_name FROM incidents i LEFT JOIN children c ON c.id=i.child_id WHERE i.id=? AND i.tenant_id=?`).get(req.params.id, req.tenantId);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/incidents
r.post('/', (req, res) => {
  try {
    const b = req.body;
    // Accept alternate field names from different frontends
    const date = b.date || b.incident_date;
    const type = b.type || b.incident_type;
    if (!date || !type) return res.status(400).json({ error: 'date and type are required' });
    const id = uuid();
    D().prepare(`INSERT INTO incidents (id,tenant_id,child_id,date,time,type,severity,title,description,location,action_taken,first_aid_given,first_aid_by,parent_notified,parent_notified_at,parent_notified_method,reported_by,witness,follow_up_required,follow_up_notes,regulatory_report_required,regulatory_reported_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`
    ).run(id, req.tenantId, b.child_id||null, date, b.time||null, type, b.severity||'minor',
      b.title||null, b.description||null, b.location||null, b.action_taken||null,
      b.first_aid_given?1:0, b.first_aid_by||null,
      b.parent_notified?1:0, b.parent_notified_at||null, b.parent_notified_method||null,
      b.reported_by||req.userName||null, b.witness||null,
      b.follow_up_required?1:0, b.follow_up_notes||null,
      b.regulatory_report_required?1:0, b.regulatory_reported_at||null
    );
    res.json({ id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/incidents/:id
r.put('/:id', (req, res) => {
  try {
    const b = req.body;
    D().prepare(`UPDATE incidents SET
      child_id=COALESCE(?,child_id), date=COALESCE(?,date), time=COALESCE(?,time),
      type=COALESCE(?,type), severity=COALESCE(?,severity), title=COALESCE(?,title),
      description=COALESCE(?,description), location=COALESCE(?,location),
      action_taken=COALESCE(?,action_taken),
      first_aid_given=COALESCE(?,first_aid_given), first_aid_by=COALESCE(?,first_aid_by),
      parent_notified=COALESCE(?,parent_notified), parent_notified_at=COALESCE(?,parent_notified_at),
      parent_notified_method=COALESCE(?,parent_notified_method),
      reported_by=COALESCE(?,reported_by), witness=COALESCE(?,witness),
      follow_up_required=COALESCE(?,follow_up_required), follow_up_notes=COALESCE(?,follow_up_notes),
      regulatory_report_required=COALESCE(?,regulatory_report_required),
      regulatory_reported_at=COALESCE(?,regulatory_reported_at),
      updated_at=datetime('now')
      WHERE id=? AND tenant_id=?`).run(
      b.child_id, b.date, b.time, b.type, b.severity, b.title, b.description, b.location,
      b.action_taken, b.first_aid_given!=null?b.first_aid_given?1:0:null, b.first_aid_by,
      b.parent_notified!=null?b.parent_notified?1:0:null, b.parent_notified_at, b.parent_notified_method,
      b.reported_by ?? null, b.witness ?? null,
      b.follow_up_required!=null?b.follow_up_required?1:0:null, b.follow_up_notes,
      b.regulatory_report_required!=null?b.regulatory_report_required?1:0:null, b.regulatory_reported_at,
      req.params.id, req.tenantId
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/incidents/:id — admin only
r.delete('/:id', requireRole('owner','admin','director'), (req, res) => {
  try {
    D().prepare('DELETE FROM incidents WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
