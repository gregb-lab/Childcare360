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
  return e || null;
}

r.get('/me', (req, res) => {
  try {
    // Admin preview: allow passing a specific educator ID via query param
    let e = null;
    const previewId = req.query.preview_educator_id;
    if (previewId) {
      e = D().prepare('SELECT * FROM educators WHERE id=? AND tenant_id=?').get(previewId, req.tenantId);
    }
    if (!e) e = getMyEdu(req.userId, req.tenantId);
    if (!e) return res.status(404).json({ error: 'No educator record linked. Contact your centre manager.' });
    const avail    = D().prepare('SELECT * FROM educator_availability WHERE educator_id=? ORDER BY day_of_week').all(e.id);
    const docs     = D().prepare('SELECT id,label,category,file_name,expiry_date FROM educator_documents WHERE educator_id=? ORDER BY created_at DESC').all(e.id);
    const leaves   = D().prepare('SELECT * FROM leave_requests WHERE educator_id=? ORDER BY created_at DESC LIMIT 30').all(e.id);
    const specials = D().prepare('SELECT * FROM educator_special_availability WHERE educator_id=? ORDER BY start_date').all(e.id);
    res.json({ ...e, availability: avail, documents: docs, leaveRequests: leaves,
      specialAvailability: specials.map(s => ({ ...s, available_days: JSON.parse(s.available_days||'[]') })) });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

r.put('/me', (req, res) => {
  try {
    const e = getMyEdu(req.userId, req.tenantId);
    if (!e) return res.status(404).json({ error: 'Not found' });
    const allowed = ['phone','address','suburb','state','postcode'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    if (!Object.keys(updates).length) return res.json({ ok: true });
    const sets = Object.keys(updates).map(k => `${k}=?`).join(',');
    D().prepare((() => 'UPDATE educators SET ' + sets + ", updated_at=datetime('now') WHERE id=? AND tenant_id=?")())
      .run(...Object.values(updates), e.id, req.tenantId);
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

r.get('/my-shifts', (req, res) => {
  try {
    const previewId2 = req.query.preview_educator_id;
    const e = previewId2
      ? D().prepare('SELECT * FROM educators WHERE id=? AND tenant_id=?').get(previewId2, req.tenantId)
      : getMyEdu(req.userId, req.tenantId);
    if (!e) return res.json([]);
    const shifts = D().prepare(`SELECT re.*, r.name as room_name, r.age_group FROM roster_entries re
      LEFT JOIN rooms r ON re.room_id=r.id
      WHERE re.educator_id=? AND re.tenant_id=? AND re.date >= date('now','-14 days')
      ORDER BY re.date DESC, re.start_time ASC LIMIT 60`).all(e.id, req.tenantId);
    res.json(shifts);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

r.put('/my-availability', (req, res) => {
  try {
    const e = getMyEdu(req.userId, req.tenantId);
    if (!e) return res.status(404).json({ error: 'Not found' });
    const { availability } = req.body;
    if (!Array.isArray(availability)) return res.status(400).json({ error: 'Array required' });
    for (const a of availability) {
      const ex = D().prepare('SELECT id FROM educator_availability WHERE educator_id=? AND day_of_week=?').get(e.id, a.day_of_week);
      if (ex) {
        D().prepare('UPDATE educator_availability SET available=?,start_time=?,end_time=?,can_start_earlier_mins=?,can_finish_later_mins=? WHERE id=?')
          .run(a.available?1:0, a.start_time||'07:00', a.end_time||'18:00', a.can_start_earlier_mins||0, a.can_finish_later_mins||0, ex.id);
      } else {
        D().prepare('INSERT INTO educator_availability (id,educator_id,day_of_week,available,start_time,end_time,can_start_earlier_mins,can_finish_later_mins) VALUES(?,?,?,?,?,?,?,?)')
          .run(uuid(), e.id, a.day_of_week, a.available?1:0, a.start_time||'07:00', a.end_time||'18:00', a.can_start_earlier_mins||0, a.can_finish_later_mins||0);
      }
    }
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

r.post('/my-special-availability', (req, res) => {
  try {
    const e = getMyEdu(req.userId, req.tenantId);
    if (!e) return res.status(404).json({ error: 'Not found' });
    const { start_date, end_date, available_days, can_start_early, early_start_time, can_stay_late, late_end_time, notes } = req.body;
    if (!start_date || !end_date) return res.status(400).json({ error: 'Dates required' });
    const id = uuid();
    D().prepare(`INSERT INTO educator_special_availability (id,tenant_id,educator_id,start_date,end_date,available_days,can_start_early,early_start_time,can_stay_late,late_end_time,notes)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id, req.tenantId, e.id, start_date, end_date,
      JSON.stringify(available_days||[]), can_start_early?1:0, early_start_time||null,
      can_stay_late?1:0, late_end_time||null, notes||null);
    res.json({ id });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

r.delete('/my-special-availability/:saId', (req, res) => {
  try {
    const e = getMyEdu(req.userId, req.tenantId);
    if (!e) return res.status(404).json({ error: 'Not found' });
    D().prepare('DELETE FROM educator_special_availability WHERE id=? AND educator_id=? AND tenant_id=?').run(req.params.saId, e.id, req.tenantId);
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

r.get('/my-leave', (req, res) => {
  try {
    const e = getMyEdu(req.userId, req.tenantId);
    if (!e) return res.json([]);
    res.json(D().prepare('SELECT * FROM leave_requests WHERE educator_id=? AND tenant_id=? ORDER BY created_at DESC LIMIT 30').all(e.id, req.tenantId));
  } catch(err) { res.status(500).json({ error: err.message }); }
});

r.post('/my-leave', (req, res) => {
  try {
    const e = getMyEdu(req.userId, req.tenantId);
    if (!e) return res.status(404).json({ error: 'Not found' });
    const { leave_type, start_date, end_date, days_requested, reason } = req.body;
    if (!start_date || !end_date) return res.status(400).json({ error: 'Dates required' });
    if (new Date(end_date) < new Date(start_date)) return res.status(400).json({ error: 'End must be after start' });
    const id = uuid();
    D().prepare(`INSERT INTO leave_requests (id,tenant_id,educator_id,leave_type,start_date,end_date,days_requested,reason,status)
      VALUES(?,?,?,?,?,?,?,?,'pending')`).run(id, req.tenantId, e.id, leave_type||'annual', start_date, end_date, days_requested||1, reason||null);
    res.json({ id });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

export default r;
