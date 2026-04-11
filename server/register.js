import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

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
r.use(requireTenant);

// ─── EQUIPMENT / MEDICATION REGISTER ─────────────────────────────────────────

r.get('/equipment', (req, res) => {
  const { category, child_id, expiring_days, status } = req.query;
  let sql = `SELECT e.*, c.first_name || ' ' || c.last_name as child_name
             FROM equipment_register e
             LEFT JOIN children c ON c.id = e.child_id
             WHERE e.tenant_id = ?`;
  const params = [req.tenantId];
  if (category) { sql += ' AND e.category = ?'; params.push(category); }
  if (child_id) { sql += ' AND e.child_id = ?'; params.push(child_id); }
  if (status) { sql += ' AND e.status = ?'; params.push(status); }
  if (expiring_days) {
    sql += ` AND e.expiry_date IS NOT NULL AND e.expiry_date <= date('now', '+${parseInt(expiring_days)} days')`;
  }
  sql += ' ORDER BY e.expiry_date ASC, e.name ASC';
  res.json(D().prepare(sql).all(...params));
});

r.get('/equipment/:id', (req, res) => {
  const item = D().prepare('SELECT * FROM equipment_register WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

r.post('/equipment', (req, res) => {
  const { name, category = 'medication', description, location, quantity = 1,
          expiry_date, batch_number, supplier, child_id, requires_prescription = 0,
          storage_instructions, disposal_instructions, notes,
          status = 'active' } = req.body;
  // Frontend EquipmentTab sends `last_checked` (date), but the column is
  // `last_checked_date`. It also sends `next_check` which has no column at all
  // — silently dropped. Map the field name and accept status here so neither
  // is lost on save.
  const last_checked_date = req.body.last_checked_date || req.body.last_checked || null;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuid();
  D().prepare(`INSERT INTO equipment_register
    (id,tenant_id,category,name,description,location,quantity,expiry_date,batch_number,supplier,
     child_id,requires_prescription,storage_instructions,disposal_instructions,notes,
     last_checked_date,status,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.tenantId, category, name, description, location, quantity,
         expiry_date || null, batch_number, supplier, child_id || null,
         requires_prescription ? 1 : 0, storage_instructions, disposal_instructions,
         notes, last_checked_date, status, req.userId);
  res.json({ id, ok: true });
});

r.put('/equipment/:id', (req, res) => {
  const { name, category, description, location, quantity, expiry_date, batch_number,
          supplier, child_id, requires_prescription, storage_instructions,
          disposal_instructions, notes, status, last_checked_date } = req.body;
  D().prepare(`UPDATE equipment_register SET
    name=COALESCE(?,name), category=COALESCE(?,category), description=COALESCE(?,description),
    location=COALESCE(?,location), quantity=COALESCE(?,quantity), expiry_date=COALESCE(?,expiry_date),
    batch_number=COALESCE(?,batch_number), supplier=COALESCE(?,supplier), child_id=COALESCE(?,child_id),
    requires_prescription=COALESCE(?,requires_prescription), storage_instructions=COALESCE(?,storage_instructions),
    disposal_instructions=COALESCE(?,disposal_instructions), notes=COALESCE(?,notes),
    status=COALESCE(?,status), last_checked_date=COALESCE(?,last_checked_date),
    last_checked_by=COALESCE(?,last_checked_by), updated_at=datetime('now') WHERE id=? AND tenant_id=?`)
    .run(name, category, description, location, quantity, expiry_date,
         batch_number, supplier, child_id, requires_prescription != null ? (requires_prescription ? 1 : 0) : null,
         storage_instructions, disposal_instructions, notes, status, last_checked_date,
         req.userId, req.params.id, req.tenantId);
  res.json({ ok: true });
});

r.delete('/equipment/:id', (req, res) => {
  D().prepare('DELETE FROM equipment_register WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
  res.json({ ok: true });
});

// Expiry alert summary
r.get('/equipment-alerts', (req, res) => {
  const expired = D().prepare(
    `SELECT * FROM equipment_register WHERE tenant_id = ? AND status = 'active'
     AND expiry_date IS NOT NULL AND expiry_date < date('now') ORDER BY expiry_date ASC`
  ).all(req.tenantId);
  const expiring7 = D().prepare(
    `SELECT * FROM equipment_register WHERE tenant_id = ? AND status = 'active'
     AND expiry_date IS NOT NULL AND expiry_date >= date('now') AND expiry_date <= date('now','+7 days') ORDER BY expiry_date ASC`
  ).all(req.tenantId);
  const expiring30 = D().prepare(
    `SELECT * FROM equipment_register WHERE tenant_id = ? AND status = 'active'
     AND expiry_date IS NOT NULL AND expiry_date > date('now','+7 days') AND expiry_date <= date('now','+30 days') ORDER BY expiry_date ASC`
  ).all(req.tenantId);
  res.json({ expired, expiring7, expiring30 });
});

// ─── PARENT MESSAGES ─────────────────────────────────────────────────────────

r.get('/parent-messages', (req, res) => {
  const { child_id } = req.query;
  let sql = 'SELECT * FROM parent_messages WHERE tenant_id = ?';
  const params = [req.tenantId];
  if (child_id) { sql += ' AND child_id = ?'; params.push(child_id); }
  sql += ' ORDER BY created_at DESC LIMIT 100';
  res.json(D().prepare(sql).all(...params));
});

r.post('/parent-messages', (req, res) => {
  const { child_id, to_parent_email, subject, body, message_type = 'general' } = req.body;
  if (!body) return res.status(400).json({ error: 'body required' });
  const id = uuid();
  D().prepare(`INSERT INTO parent_messages (id,tenant_id,child_id,from_type,from_user_id,from_name,to_parent_email,subject,body,message_type)
    VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.tenantId, child_id || null, 'centre', req.userId, req.user?.name || 'Centre', to_parent_email || null, subject, body, message_type);
  res.json({ id, ok: true });
});

// ─── EDUCATOR NOTES ───────────────────────────────────────────────────────────

r.get('/educator-notes', (req, res) => {
  const { child_id } = req.query;
  if (!child_id) return res.status(400).json({ error: 'child_id required' });
  const notes = D().prepare(
    'SELECT * FROM educator_notes WHERE tenant_id = ? AND child_id = ? ORDER BY note_date DESC, created_at DESC'
  ).all(req.tenantId, child_id);
  res.json(notes);
});

r.post('/educator-notes', (req, res) => {
  const { child_id, note_date, category = 'general', content, visible_to_parents = 0 } = req.body;
  if (!child_id || !content) return res.status(400).json({ error: 'child_id, content required' });
  const id = uuid();
  // Get educator record for this user
  const educator = D().prepare('SELECT id, first_name, last_name FROM educators WHERE tenant_id = ? AND user_id = ?').get(req.tenantId, req.userId);
  const educatorName = educator ? `${educator.first_name} ${educator.last_name}` : (req.user?.name || 'Staff');
  D().prepare(`INSERT INTO educator_notes (id,tenant_id,child_id,educator_id,educator_name,note_date,category,content,visible_to_parents)
    VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(id, req.tenantId, child_id, educator?.id || null, educatorName,
         note_date || new Date().toISOString().split('T')[0], category, content, visible_to_parents ? 1 : 0);
  res.json({ id, ok: true });
});

r.delete('/educator-notes/:id', (req, res) => {
  D().prepare('DELETE FROM educator_notes WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
  res.json({ ok: true });
});

// ─── LUNCH COVER SESSIONS ─────────────────────────────────────────────────────

r.get('/lunch-cover', (req, res) => {
  const { date } = req.query;
  let sql = `SELECT lc.*, e.first_name || ' ' || e.last_name AS cover_educator_name,
             r.name AS room_name
             FROM lunch_cover_sessions lc
             LEFT JOIN educators e ON e.id = lc.cover_educator_id
             LEFT JOIN rooms r ON r.id = lc.room_id
             WHERE lc.tenant_id = ?`;
  const params = [req.tenantId];
  if (date) { sql += ' AND lc.date = ?'; params.push(date); }
  sql += ' ORDER BY lc.date, lc.cover_start';
  res.json(D().prepare(sql).all(...params));
});

r.post('/lunch-cover', (req, res) => {
  const { roster_entry_id, cover_educator_id, room_id, date, cover_start, cover_end, notes } = req.body;
  if (!date || !cover_start || !cover_end) return res.status(400).json({ error: 'date, cover_start, cover_end required' });
  const id = uuid();
  D().prepare(`INSERT INTO lunch_cover_sessions (id,tenant_id,roster_entry_id,cover_educator_id,room_id,date,cover_start,cover_end,notes)
    VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(id, req.tenantId, roster_entry_id || null, cover_educator_id || null, room_id || null, date, cover_start, cover_end, notes || null);
  res.json({ id, ok: true });
});

r.delete('/lunch-cover/:id', (req, res) => {
  D().prepare('DELETE FROM lunch_cover_sessions WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
  res.json({ ok: true });
});


// ─── MEDICATIONS & ADMINISTRATION LOG ────────────────────────────────────────

r.get('/medications', requireAuth, requireTenant, (req, res) => {
  try {
    const { child_id } = req.query;
    let sql = `SELECT m.*, c.first_name, c.last_name,
               c.first_name || ' ' || c.last_name as child_name
               FROM medications m
               LEFT JOIN children c ON c.id=m.child_id
               WHERE m.tenant_id=?`;
    const params = [req.tenantId];
    if (child_id) { sql += ' AND m.child_id=?'; params.push(child_id); }
    sql += ' ORDER BY m.name';
    res.json(D().prepare(sql).all(...params));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/medications', requireAuth, requireTenant, (req, res) => {
  try {
    const { child_id, dosage, frequency, start_date, end_date, route } = req.body;
    // Frontend sends `name`/`prescriber`/`instructions`; older callers may
    // send `medication_name`/`prescribing_doctor`/`notes`. Coalesce both shapes.
    const name = req.body.name || req.body.medication_name;
    const prescriber = req.body.prescriber || req.body.prescribing_doctor || null;
    const notes = req.body.notes || req.body.instructions || null;
    if (!child_id || !name) return res.status(400).json({ error: 'child_id and medication name required' });
    const id = uuid();
    // Write to both `name` (NOT NULL) and `medication_name` so any legacy
    // reader sees the row. Same for instructions/notes.
    D().prepare(`INSERT INTO medications
      (id,tenant_id,child_id,name,medication_name,dosage,frequency,route,prescriber,start_date,end_date,notes,instructions,active,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,'active')`)
      .run(id, req.tenantId, child_id, name, name, dosage||'', frequency||'',
           route||'oral', prescriber, start_date||null, end_date||null, notes, notes);
    res.json({ id, ok: true, name });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/medications/:id', requireAuth, requireTenant, (req, res) => {
  try {
    const { dosage, frequency, end_date, active, route, start_date } = req.body;
    // Same coalesce as POST so the edit form (sending `name`/`prescriber`/`instructions`)
    // and any legacy caller both work.
    const name = req.body.name ?? req.body.medication_name ?? null;
    const prescriber = req.body.prescriber ?? req.body.prescribing_doctor ?? null;
    const notes = req.body.notes ?? req.body.instructions ?? null;
    D().prepare(`UPDATE medications SET
      name=COALESCE(?,name), medication_name=COALESCE(?,medication_name),
      dosage=COALESCE(?,dosage), frequency=COALESCE(?,frequency),
      route=COALESCE(?,route), prescriber=COALESCE(?,prescriber),
      start_date=COALESCE(?,start_date), end_date=COALESCE(?,end_date),
      notes=COALESCE(?,notes), instructions=COALESCE(?,instructions),
      active=COALESCE(?,active), updated_at=datetime('now')
      WHERE id=? AND tenant_id=?`)
      .run(name, name, dosage ?? null, frequency ?? null, route ?? null,
           prescriber, start_date ?? null, end_date ?? null,
           notes, notes, active ?? null, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.delete('/medications/:id', requireAuth, requireTenant, (req, res) => {
  try {
    const r2 = D().prepare('DELETE FROM medications WHERE id=? AND tenant_id=?')
      .run(req.params.id, req.tenantId);
    if (!r2.changes) return res.status(404).json({ error: 'Medication not found' });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.get('/medication-log', requireAuth, requireTenant, (req, res) => {
  try {
    const { child_id, date } = req.query;
    // Surface `given_by` as administered_by for the frontend display — the
    // real `administered_by` column is a FK to users.id and is usually null
    // when the name was typed free-text at the kiosk.
    let sql = `SELECT ml.*, m.name AS med_name, m.dosage, c.first_name, c.last_name,
               c.first_name || ' ' || c.last_name as child_name,
               COALESCE(ml.administered_by, ml.given_by) AS administered_by_display
               FROM medication_log ml
               JOIN medications m ON m.id=ml.medication_id
               JOIN children c ON c.id=ml.child_id
               WHERE ml.tenant_id=?`;
    const params = [req.tenantId];
    if (child_id) { sql += ' AND ml.child_id=?'; params.push(child_id); }
    if (date) { sql += ' AND (ml.time_given LIKE ? OR ml.given_at LIKE ?)'; params.push(date + '%', date + '%'); }
    sql += ' ORDER BY ml.created_at DESC LIMIT 100';
    res.json(D().prepare(sql).all(...params));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── UUID shape guard — administered_by/witnessed_by are FKs to users.id,
//    so we can only populate them when the caller actually sends a user id.
//    Free-text names go into `given_by` (no FK) and the notes field.
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

r.post('/medication-log', requireAuth, requireTenant, (req, res) => {
  try {
    const { medication_id, child_id, dose_given, parent_notified } = req.body;
    if (!medication_id || !child_id) return res.status(400).json({ error: 'medication_id and child_id required' });
    const _now = new Date();
    const localNow = `${String(_now.getHours()).padStart(2,'0')}:${String(_now.getMinutes()).padStart(2,'0')}`;
    const time_given = req.body.time_given || req.body.given_at || localNow;

    // `administered_by`/`witnessed_by` are FK columns; only accept them if they
    // look like UUIDs. Typed names are preserved in `given_by` (no FK) and notes.
    const administered_by_fk = isUuid(req.body.administered_by) ? req.body.administered_by : null;
    const witnessed_by_fk    = isUuid(req.body.witnessed_by)    ? req.body.witnessed_by    : null;
    const given_by_name = req.body.administered_by_name || req.body.given_by || (isUuid(req.body.administered_by) ? null : req.body.administered_by) || null;
    const witnessed_by_name = req.body.witnessed_by_name || null;

    // Fold witnessed_by name into notes when we can't store it in the FK column.
    let notes = req.body.notes || '';
    if (witnessed_by_name && !witnessed_by_fk) {
      notes = notes ? `${notes}\n(Witnessed by: ${witnessed_by_name})` : `Witnessed by: ${witnessed_by_name}`;
    }

    const id = uuid();
    D().prepare(`INSERT INTO medication_log
      (id,tenant_id,medication_id,child_id,time_given,given_at,administered_by,given_by,witnessed_by,dose_given,parent_notified,notes)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, req.tenantId, medication_id, child_id, time_given, time_given,
           administered_by_fk, given_by_name, witnessed_by_fk, dose_given||'',
           parent_notified ? 1 : 0, notes);
    res.json({ id, ok: true, time_given });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.delete('/medication-log/:id', requireAuth, requireTenant, (req, res) => {
  try {
    const r2 = D().prepare('DELETE FROM medication_log WHERE id=? AND tenant_id=?')
      .run(req.params.id, req.tenantId);
    if (!r2.changes) return res.status(404).json({ error: 'Log entry not found' });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
