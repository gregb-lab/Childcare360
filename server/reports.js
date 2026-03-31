import { Router } from 'express';
import { D } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);
const uuid = () => crypto.randomUUID();

// GET /api/reports/schedules
r.get('/schedules', (req, res) => {
  try {
    const rows = D().prepare('SELECT * FROM report_schedules WHERE tenant_id=? ORDER BY created_at DESC').all(req.tenantId);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/reports/schedules
r.post('/schedules', (req, res) => {
  try {
    const { report_type, frequency, day_of_week, time, email, format, enabled } = req.body;
    if (!report_type || !email) return res.status(400).json({ error: 'report_type and email required' });
    const id = uuid();
    D().prepare('INSERT INTO report_schedules (id,tenant_id,report_type,frequency,day_of_week,time,email,format,enabled,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id, req.tenantId, report_type, frequency||'weekly', day_of_week||'1', time||'07:00', email, format||'email_body', enabled?1:0, req.userId||null);
    res.json({ id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/reports/schedules/:id
r.put('/schedules/:id', (req, res) => {
  try {
    const { enabled, time, email, frequency, day_of_week } = req.body;
    const fields = [];
    const vals = [];
    if (enabled !== undefined) { fields.push('enabled=?'); vals.push(enabled?1:0); }
    if (time !== undefined) { fields.push('time=?'); vals.push(time); }
    if (email !== undefined) { fields.push('email=?'); vals.push(email); }
    if (frequency !== undefined) { fields.push('frequency=?'); vals.push(frequency); }
    if (day_of_week !== undefined) { fields.push('day_of_week=?'); vals.push(day_of_week); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id, req.tenantId);
    D().prepare(`UPDATE report_schedules SET ${fields.join(',')} WHERE id=? AND tenant_id=?`).run(...vals);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/reports/schedules/:id
r.delete('/schedules/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM report_schedules WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
