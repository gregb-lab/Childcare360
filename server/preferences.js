// ─── Educator preferences, NC schedule, room assignment memory ─────────────
//
// Three concerns live here so they share schema knowledge cleanly:
//
//  1. educator_preferences  — flexible per-educator rostering hints
//                             (preferred_room, avoid_room, float, etc).
//                             priority 1 = strongest, 10 = weakest.
//
//  2. roster_assignment_history  — every manual override the manager makes
//                                  on the roster grid. Two+ manual moves to
//                                  the same room auto-promote a learned
//                                  preferred_room preference.
//
//  3. non_contact_schedule  — weekly NC blocks (programming / ed leader /
//                             study / admin) with optional replacement cover.
//
// Routes are mounted under /api by index.js so the spec'd absolute paths
// (/api/educators/:id/preferences, /api/rooms/:id/preferred-educators,
// /api/roster/nc-requirements) all live in the same router.

import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

// ── helpers ─────────────────────────────────────────────────────────────────
const localDate = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};
// Monday-of-week ISO date (YYYY-MM-DD), used for week_start columns
const weekStartOf = (dateStr) => {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const dow = d.getDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? -6 : 1 - dow; // Monday
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ════════════════════════════════════════════════════════════════════════════
// EDUCATOR PREFERENCES
// ════════════════════════════════════════════════════════════════════════════

// GET /api/educators/:id/preferences
r.get('/educators/:id/preferences', (req, res) => {
  try {
    const rows = D().prepare(`
      SELECT ep.*, r.name as room_name
      FROM educator_preferences ep
      LEFT JOIN rooms r ON r.id = ep.room_id
      WHERE ep.educator_id = ? AND ep.tenant_id = ?
      ORDER BY ep.preference_type, ep.priority ASC
    `).all(req.params.id, req.tenantId);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/educators/:id/preferences
// Body: { preference_type, room_id, priority, notes }
r.post('/educators/:id/preferences', (req, res) => {
  try {
    const { preference_type, room_id, priority, notes } = req.body;
    if (!preference_type) return res.status(400).json({ error: 'preference_type required' });

    const valid = ['preferred_room', 'avoid_room', 'preferred_shift', 'float', 'shift_fill_priority', 'non_contact_day'];
    if (!valid.includes(preference_type)) {
      return res.status(400).json({ error: `preference_type must be one of: ${valid.join(', ')}` });
    }

    // Upsert by (tenant, educator, preference_type, room_id)
    const existing = D().prepare(`
      SELECT id FROM educator_preferences
      WHERE tenant_id=? AND educator_id=? AND preference_type=? AND COALESCE(room_id,'')=COALESCE(?,'')
    `).get(req.tenantId, req.params.id, preference_type, room_id || null);

    if (existing) {
      D().prepare(`
        UPDATE educator_preferences
        SET priority=?, notes=?, updated_at=datetime('now'), set_by_user_id=?
        WHERE id=?
      `).run(priority || 5, notes || null, req.userId || null, existing.id);
      return res.json({ id: existing.id, updated: true });
    }

    const id = uuid();
    D().prepare(`
      INSERT INTO educator_preferences
        (id, tenant_id, educator_id, room_id, preference_type, priority, notes, set_by_user_id)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(id, req.tenantId, req.params.id, room_id || null, preference_type,
           priority || 5, notes || null, req.userId || null);
    res.json({ id, created: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/educators/:id/preferences/:prefId
r.delete('/educators/:id/preferences/:prefId', (req, res) => {
  try {
    const result = D().prepare(`
      DELETE FROM educator_preferences
      WHERE id=? AND educator_id=? AND tenant_id=?
    `).run(req.params.prefId, req.params.id, req.tenantId);
    if (result.changes === 0) return res.status(404).json({ error: 'Preference not found' });
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/rooms/:id/preferred-educators — educators who prefer this room
r.get('/rooms/:id/preferred-educators', (req, res) => {
  try {
    const rows = D().prepare(`
      SELECT ep.priority, ep.notes,
             e.id, e.first_name, e.last_name, e.qualification, e.is_float, e.preferred_room_id,
             CASE WHEN e.preferred_room_id = ? THEN 1 ELSE 0 END as is_primary_room
      FROM educator_preferences ep
      JOIN educators e ON e.id = ep.educator_id
      WHERE ep.room_id = ? AND ep.tenant_id = ? AND ep.preference_type = 'preferred_room'
      ORDER BY is_primary_room DESC, ep.priority ASC, e.last_name
    `).all(req.params.id, req.params.id, req.tenantId);

    // Also include educators whose primary room is this room (even without an explicit preference row)
    const primary = D().prepare(`
      SELECT 1 as priority, NULL as notes,
             e.id, e.first_name, e.last_name, e.qualification, e.is_float, e.preferred_room_id,
             1 as is_primary_room
      FROM educators e
      WHERE e.preferred_room_id = ? AND e.tenant_id = ? AND e.status='active'
        AND e.id NOT IN (SELECT educator_id FROM educator_preferences
                         WHERE room_id = ? AND tenant_id = ? AND preference_type='preferred_room')
    `).all(req.params.id, req.tenantId, req.params.id, req.tenantId);

    res.json([...primary, ...rows]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// ROSTER ASSIGNMENT MEMORY (learning from manual changes)
// ════════════════════════════════════════════════════════════════════════════

// POST /api/roster/assignment-memory
// Body: { educator_id, new_room_id, old_room_id, week_start, reason }
//
// Records the manual change. After 2+ moves to the same room we auto-create
// a preferred_room preference (priority 3 = strong, learned). The UI uses
// the response to decide whether to show the "set as preferred?" toast.
r.post('/roster/assignment-memory', (req, res) => {
  try {
    const { educator_id, new_room_id, old_room_id, week_start, reason } = req.body;
    if (!educator_id || !new_room_id) {
      return res.status(400).json({ error: 'educator_id and new_room_id required' });
    }
    const ws = week_start || weekStartOf();
    const id = uuid();

    D().prepare(`
      INSERT INTO roster_assignment_history
        (id, tenant_id, educator_id, room_id, week_start,
         was_manually_changed, changed_from_room_id, changed_by_user_id, change_reason)
      VALUES (?,?,?,?,?, 1, ?, ?, ?)
    `).run(id, req.tenantId, educator_id, new_room_id, ws,
           old_room_id || null, req.userId || null, reason || null);

    // Count past manual moves of this educator into this room
    const count = D().prepare(`
      SELECT COUNT(*) as n FROM roster_assignment_history
      WHERE tenant_id=? AND educator_id=? AND room_id=? AND was_manually_changed=1
    `).get(req.tenantId, educator_id, new_room_id).n;

    let learned = null;
    if (count >= 2) {
      // Check whether we already have an explicit preferred_room preference
      const existingPref = D().prepare(`
        SELECT id FROM educator_preferences
        WHERE tenant_id=? AND educator_id=? AND preference_type='preferred_room' AND room_id=?
      `).get(req.tenantId, educator_id, new_room_id);

      if (!existingPref) {
        // Suggest — don't auto-apply. UI will prompt the manager.
        learned = { suggest: true, room_id: new_room_id, move_count: count };
      }
    }

    res.json({ id, count, learned });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// NON-CONTACT SCHEDULE
// ════════════════════════════════════════════════════════════════════════════

// GET /api/educators/:id/nc-schedule?week_start=YYYY-MM-DD
r.get('/educators/:id/nc-schedule', (req, res) => {
  try {
    const ws = req.query.week_start || weekStartOf();
    const rows = D().prepare(`
      SELECT nc.*,
             rep.first_name as replacement_first_name,
             rep.last_name as replacement_last_name
      FROM non_contact_schedule nc
      LEFT JOIN educators rep ON rep.id = nc.replacement_educator_id
      WHERE nc.tenant_id=? AND nc.educator_id=? AND nc.week_start=?
      ORDER BY nc.day_of_week, nc.start_time
    `).all(req.tenantId, req.params.id, ws);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/educators/:id/nc-schedule
// Body: { week_start, day_of_week, start_time, end_time, nc_type, hours_allocated, replacement_educator_id }
r.post('/educators/:id/nc-schedule', (req, res) => {
  try {
    const b = req.body;
    if (b.day_of_week === undefined || !b.start_time || !b.end_time) {
      return res.status(400).json({ error: 'day_of_week, start_time, end_time required' });
    }
    const ws = b.week_start || weekStartOf();
    const id = uuid();
    D().prepare(`
      INSERT INTO non_contact_schedule
        (id, tenant_id, educator_id, week_start, day_of_week, start_time, end_time, nc_type, hours_allocated, replacement_educator_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(id, req.tenantId, req.params.id, ws,
           parseInt(b.day_of_week, 10), b.start_time, b.end_time,
           b.nc_type || 'programming', b.hours_allocated || 2,
           b.replacement_educator_id || null);
    res.json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/educators/:id/nc-schedule/:slotId
r.delete('/educators/:id/nc-schedule/:slotId', (req, res) => {
  try {
    D().prepare(`
      DELETE FROM non_contact_schedule
      WHERE id=? AND educator_id=? AND tenant_id=?
    `).run(req.params.slotId, req.params.id, req.tenantId);
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/roster/nc-requirements?week_start=YYYY-MM-DD
// Returns every active educator with NC entitlement, scheduled hours, and gap.
r.get('/roster/nc-requirements', (req, res) => {
  try {
    const ws = req.query.week_start || weekStartOf();
    const educators = D().prepare(`
      SELECT id, first_name, last_name, role_title, qualification,
             COALESCE(nc_hours_per_week, 2) as nc_hours_entitled,
             COALESCE(is_trainee, 0) as is_trainee,
             COALESCE(study_hours_per_week, 0) as study_hours_per_week
      FROM educators
      WHERE tenant_id=? AND status='active'
      ORDER BY last_name, first_name
    `).all(req.tenantId);

    const ncRows = D().prepare(`
      SELECT educator_id,
             SUM(
               (CAST(substr(end_time,1,2) AS REAL) + CAST(substr(end_time,4,2) AS REAL)/60.0)
               - (CAST(substr(start_time,1,2) AS REAL) + CAST(substr(start_time,4,2) AS REAL)/60.0)
             ) as hours_scheduled
      FROM non_contact_schedule
      WHERE tenant_id=? AND week_start=?
      GROUP BY educator_id
    `).all(req.tenantId, ws);

    const scheduledMap = new Map(ncRows.map(r => [r.educator_id, r.hours_scheduled || 0]));

    const result = educators.map(e => {
      const scheduled = scheduledMap.get(e.id) || 0;
      const gap = Math.max(0, e.nc_hours_entitled - scheduled);
      let status;
      if (e.nc_hours_entitled === 0) status = 'not_required';
      else if (scheduled >= e.nc_hours_entitled) status = 'compliant';
      else if (scheduled > 0) status = 'partial';
      else status = 'missing';
      return {
        educator_id: e.id,
        name: `${e.first_name} ${e.last_name}`,
        role: e.role_title || e.qualification,
        nc_hours_entitled: e.nc_hours_entitled,
        nc_hours_scheduled: Math.round(scheduled * 10) / 10,
        gap: Math.round(gap * 10) / 10,
        status,
        is_trainee: !!e.is_trainee,
        study_hours_per_week: e.study_hours_per_week,
      };
    });

    res.json({
      week_start: ws,
      educators: result,
      summary: {
        total: result.length,
        compliant: result.filter(r => r.status === 'compliant').length,
        partial: result.filter(r => r.status === 'partial').length,
        missing: result.filter(r => r.status === 'missing').length,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default r;
