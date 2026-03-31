import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

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
          storage_instructions, disposal_instructions, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuid();
  D().prepare(`INSERT INTO equipment_register
    (id,tenant_id,category,name,description,location,quantity,expiry_date,batch_number,supplier,
     child_id,requires_prescription,storage_instructions,disposal_instructions,notes,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.tenantId, category, name, description, location, quantity,
         expiry_date || null, batch_number, supplier, child_id || null,
         requires_prescription ? 1 : 0, storage_instructions, disposal_instructions,
         notes, req.userId);
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

export default r;
