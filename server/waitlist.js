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

// GET /api/waitlist
r.get('/', requireAuth, requireTenant, (req, res) => {
  const rows = D().prepare('SELECT w.*, r.name as room_name FROM waitlist w LEFT JOIN rooms r ON r.id=w.preferred_room WHERE w.tenant_id=? ORDER BY CASE w.priority WHEN \'urgent\' THEN 0 WHEN \'high\' THEN 1 WHEN \'normal\' THEN 2 ELSE 3 END, w.created_at ASC').all(req.tenantId);
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

// PUT /api/waitlist/:id — full edit (BUG-WL-04). Used to live-edit a waitlist
// entry from the new "Edit" modal. Accepts any subset of editable columns.
r.put('/:id', requireAuth, requireTenant, (req, res) => {
  try {
    const b = req.body || {};
    const fields = [
      'child_name', 'child_dob', 'parent_name', 'parent_email', 'parent_phone',
      'preferred_room', 'preferred_days', 'preferred_start',
      'notes', 'priority', 'status',
    ];
    const updates = {};
    for (const f of fields) {
      if (b[f] !== undefined) {
        updates[f] = f === 'preferred_days' && Array.isArray(b[f]) ? JSON.stringify(b[f]) : b[f];
      }
    }
    if (!Object.keys(updates).length) return res.json({ ok: true });
    const setClause = Object.keys(updates).map(f => `${f} = COALESCE(?, ${f})`).join(', ');
    const values = Object.values(updates);
    D().prepare(
      `UPDATE waitlist SET ${setClause}, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
    ).run(...values, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/waitlist/:id
r.delete('/:id', requireAuth, requireTenant, (req, res) => {
  D().prepare('DELETE FROM waitlist WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
  res.json({ ok: true });
});

// POST /api/waitlist/:id/offer (BUG-WL-01)
// Mark a waitlist entry as "offered" with a 7-day expiry. The UI's "Offer
// Place" button hits this endpoint. Returns the offer + expiry dates so the
// UI can show a confirmation toast with the deadline.
r.post('/:id/offer', requireAuth, requireTenant, (req, res) => {
  try {
    const entry = D().prepare(
      'SELECT id FROM waitlist WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenantId);
    if (!entry) return res.status(404).json({ error: 'Waitlist entry not found' });

    const localDate = (d) => {
      const n = d || new Date();
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    };
    const offerDate = new Date();
    const expiryDate = new Date(offerDate);
    expiryDate.setDate(expiryDate.getDate() + 7);

    D().prepare(`
      UPDATE waitlist
      SET status = 'offered',
          offer_date = ?,
          offer_expiry = ?,
          updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(localDate(offerDate), localDate(expiryDate), req.params.id, req.tenantId);

    res.json({
      ok: true,
      offer_date: localDate(offerDate),
      offer_expiry: localDate(expiryDate),
      message: `Place offered — expires ${localDate(expiryDate)}`,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/waitlist/:id/convert
r.post('/:id/convert', requireAuth, requireTenant, (req, res) => {
  const entry = D().prepare('SELECT * FROM waitlist WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  const appId = uuid();
  D().prepare('INSERT INTO enrolment_applications (id,tenant_id,status,child_first_name,preferred_room,preferred_days,preferred_start_date,parent1_name,parent1_email,parent1_phone,additional_notes,submitted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,datetime(\'now\'))').run(appId, req.tenantId, 'submitted', entry.child_name, entry.preferred_room, entry.preferred_days, entry.preferred_start, entry.parent_name, entry.parent_email, entry.parent_phone, entry.notes);
  D().prepare("UPDATE waitlist SET status='converted',updated_at=datetime('now') WHERE id=? AND tenant_id=?").run(req.params.id, req.tenantId);
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

  // ── BUG-WL-03 — aggregate counts + rooms-grouped placements ─────────────
  // The UI expects existing_placed / waitlist_offers / rooms_at_capacity /
  // unplaced_waitlist on the top-level response and a `rooms` array of
  // room-grouped placements. Compute them from the raw analysis above so
  // we don't have to teach the UI a different shape.
  const offered = suggestions.filter(s => s.availability === 'available');
  const unplaced = suggestions.filter(s => s.availability !== 'available');

  // Group offered + transitioning placements by suggested room.
  const roomMap = new Map();
  const ensureRoom = (room) => {
    if (!room) return null;
    if (!roomMap.has(room.id)) {
      roomMap.set(room.id, {
        room_id: room.id,
        room_name: room.name,
        capacity: room.capacity || 0,
        placements: [],
      });
    }
    return roomMap.get(room.id);
  };

  // 1. Returning children who are transitioning into a new room next year
  for (const t of transitions) {
    const bucket = ensureRoom(t.newRoom);
    if (!bucket) continue;
    bucket.placements.push({
      child_id: t.child.id,
      child_name: `${t.child.first_name} ${t.child.last_name || ''}`.trim(),
      is_new: false,
      preferred_days: [],
      reason: `Aged into ${t.newGroup} (${t.ageInJan}m)`,
    });
  }

  // 2. Waitlist children being offered a place
  for (const s of offered) {
    const bucket = ensureRoom(s.suggested_room);
    if (!bucket) continue;
    bucket.placements.push({
      child_id: s.id,
      child_name: s.child_name,
      is_new: true,
      preferred_days: [],
      reason: `Priority: ${s.priority}`,
    });
  }

  const roomsArray = Array.from(roomMap.values());
  const roomsAtCapacity = roomsArray.filter(r => r.capacity > 0 && r.placements.length >= r.capacity).length;

  res.json({
    year,
    // Counts the UI displays in the planner header (BUG-WL-03)
    existing_placed: transitions.length + graduating.length,
    waitlist_offers: offered.length,
    rooms_at_capacity: roomsAtCapacity,
    unplaced_waitlist: unplaced.length,
    summary: `${transitions.length + graduating.length} returning families re-placed, ${offered.length} waitlist families offered places. ${unplaced.length} remain on the waitlist.`,
    rooms: roomsArray,
    remaining_waitlist: unplaced.map(s => ({
      id: s.id,
      child_name: s.child_name,
      preferred_days: [],
    })),
    // Original raw fields kept for any consumer that depends on them
    suggestions,
    transitions: transitions.slice(0, 10),
    graduating: graduating.map(c => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, room: c.room_name })),
    spots,
    generated_at: new Date().toISOString(),
  });
});

export default r;
