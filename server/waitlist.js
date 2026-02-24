import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();

// GET /api/waitlist
r.get('/', requireAuth, requireTenant, (req, res) => {
  const rows = D().prepare(`SELECT w.*, r.name as room_name FROM waitlist w LEFT JOIN rooms r ON r.id=w.preferred_room WHERE w.tenant_id=? ORDER BY CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, w.created_at ASC`).all(req.tenantId);
  res.json(rows.map(row => ({ ...row, preferred_days: JSON.parse(row.preferred_days || '[]') })));
});

// POST /api/waitlist
r.post('/', requireAuth, requireTenant, (req, res) => {
  const { child_name, child_dob, parent_name, parent_email, parent_phone, preferred_room, preferred_days, preferred_start, notes, priority = 'normal' } = req.body;
  if (!child_name || !parent_name) return res.status(400).json({ error: 'child_name and parent_name required' });
  const id = uuid();
  D().prepare('INSERT INTO waitlist (id,tenant_id,child_name,child_dob,parent_name,parent_email,parent_phone,preferred_room,preferred_days,preferred_start,notes,priority,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, req.tenantId, child_name, child_dob || null, parent_name, parent_email || null, parent_phone || null, preferred_room || null, JSON.stringify(preferred_days || []), preferred_start || null, notes || null, priority, 'waiting');
  res.json({ id, ok: true });
});

// PUT /api/waitlist/:id
r.put('/:id', requireAuth, requireTenant, (req, res) => {
  const { priority, status, preferred_room } = req.body;
  D().prepare(`UPDATE waitlist SET priority=COALESCE(?,priority), status=COALESCE(?,status), preferred_room=COALESCE(?,preferred_room), updated_at=datetime('now') WHERE id=? AND tenant_id=?`).run(priority || null, status || null, preferred_room || null, req.params.id, req.tenantId);
  res.json({ ok: true });
});

// DELETE /api/waitlist/:id
r.delete('/:id', requireAuth, requireTenant, (req, res) => {
  D().prepare('DELETE FROM waitlist WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
  res.json({ ok: true });
});

// POST /api/waitlist/:id/convert
r.post('/:id/convert', requireAuth, requireTenant, (req, res) => {
  const entry = D().prepare('SELECT * FROM waitlist WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  const appId = uuid();
  D().prepare(`INSERT INTO enrolment_applications (id,tenant_id,status,child_first_name,preferred_room,preferred_days,preferred_start_date,parent1_name,parent1_email,parent1_phone,additional_notes,submitted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(appId, req.tenantId, 'submitted', entry.child_name, entry.preferred_room, entry.preferred_days, entry.preferred_start, entry.parent_name, entry.parent_email, entry.parent_phone, entry.notes);
  D().prepare("UPDATE waitlist SET status='converted',updated_at=datetime('now') WHERE id=?").run(req.params.id);
  res.json({ id: appId, ok: true });
});

// POST /api/waitlist/ai-reenrolment-plan
r.post('/ai-reenrolment-plan', requireAuth, requireTenant, (req, res) => {
  const { year = new Date().getFullYear() + 1 } = req.body;
  const waitlistKids = D().prepare("SELECT * FROM waitlist WHERE tenant_id=? AND status='waiting' ORDER BY priority,created_at").all(req.tenantId);
  const currentChildren = D().prepare('SELECT c.*, r.name as room_name, r.age_group FROM children c LEFT JOIN rooms r ON r.id=c.room_id WHERE c.tenant_id=? AND c.active=1').all(req.tenantId);
  const rooms = D().prepare('SELECT * FROM rooms WHERE tenant_id=?').all(req.tenantId);
  
  // Simulate age-based room transitions for next year
  const AGE_GROUPS = { babies: { min: 0, max: 24 }, toddlers: { min: 24, max: 36 }, preschool: { min: 36, max: 72 }, oshc: { min: 60, max: 156 } };
  const ageAt = (dob, refDate) => { const d = new Date(refDate || Date.now()); const b = new Date(dob); return (d - b) / (1000 * 60 * 60 * 24 * 30.5); };
  
  const transitions = currentChildren.filter(c => c.dob).map(c => {
    const ageInJan = ageAt(c.dob, `${year}-01-28`);
    const newGroup = Object.entries(AGE_GROUPS).find(([, g]) => ageInJan >= g.min && ageInJan < g.max)?.[0];
    const needsTransition = newGroup && newGroup !== c.age_group;
    const newRoom = needsTransition ? rooms.find(r => r.age_group === newGroup) : null;
    return { child: c, ageInJan: Math.round(ageInJan), currentGroup: c.age_group, newGroup, newRoom, needsTransition };
  }).filter(t => t.needsTransition);
  
  const graduating = currentChildren.filter(c => c.dob && ageAt(c.dob, `${year}-01-28`) >= 72);
  
  // Available spots from transitions + graduations
  const spots = {};
  graduating.forEach(c => { const g = c.age_group; spots[g] = (spots[g] || 0) + 1; });
  transitions.forEach(t => { spots[t.currentGroup] = (spots[t.currentGroup] || 0) + 1; });
  
  // Match waitlist to spots
  const suggestions = waitlistKids.slice(0, 15).map((w, i) => ({
    id: w.id, child_name: w.child_name, parent_name: w.parent_name, parent_email: w.parent_email,
    preferred_room: rooms.find(r => r.id === w.preferred_room)?.name || 'Any',
    recommended_start: `${year}-02-01`,
    priority: w.priority,
    suggested_room: rooms.find(r => r.age_group === w.preferred_room) || rooms[0],
    availability: i < 5 ? 'available' : 'waitlisted',
    position: i + 1,
  }));
  
  res.json({ year, suggestions, transitions: transitions.slice(0, 10), graduating: graduating.map(c => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, room: c.room_name })), spots, generated_at: new Date().toISOString() });
});

export default r;
