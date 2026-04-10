import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const router = Router();
router.use(requireAuth, requireTenant);

// GET daily updates for a child/date or all today
router.get('/', (req, res) => {
  try {
    const { child_id, date, room_id } = req.query;
    // Local server date — UTC default would return yesterday's rows in AEST.
    const _now = new Date();
    const _localToday = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
    const targetDate = date || _localToday;

    let query, params;
    if (child_id) {
      query = `SELECT du.*, c.first_name, c.last_name, c.photo_url as child_photo,
        e.first_name as educator_first, e.last_name as educator_last
        FROM daily_updates du
        JOIN children c ON du.child_id = c.id
        LEFT JOIN educators e ON du.educator_id = e.id
        WHERE du.child_id = ? AND du.tenant_id = ?
        ORDER BY du.created_at DESC LIMIT 100`;
      params = [child_id, req.tenantId];
    } else if (room_id) {
      query = `SELECT du.*, c.first_name, c.last_name, c.photo_url as child_photo, c.room_id,
        e.first_name as educator_first, e.last_name as educator_last
        FROM daily_updates du
        JOIN children c ON du.child_id = c.id
        LEFT JOIN educators e ON du.educator_id = e.id
        WHERE du.tenant_id = ? AND du.update_date = ? AND c.room_id = ?
        ORDER BY du.created_at DESC`;
      params = [req.tenantId, targetDate, room_id];
    } else {
      query = `SELECT du.*, c.first_name, c.last_name, c.photo_url as child_photo, c.room_id,
        r.name as room_name, e.first_name as educator_first, e.last_name as educator_last
        FROM daily_updates du
        JOIN children c ON du.child_id = c.id
        LEFT JOIN rooms r ON c.room_id = r.id
        LEFT JOIN educators e ON du.educator_id = e.id
        WHERE du.tenant_id = ? AND du.update_date = ?
        ORDER BY c.room_id, c.first_name, du.created_at`;
      params = [req.tenantId, targetDate];
    }

    const updates = D().prepare(query).all(...params);
    res.json(updates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create update
router.post('/', (req, res) => {
  try {
    const {
      child_id, educator_id, update_date,
      sleep_checks, meal_type, ate_amount, food_details,
      diaper_type, notes, photo_url
    } = req.body;

    // Frontend forms (SleepForm, FoodForm, etc) send `type` rather than
    // `category`, and use `start_time`/`end_time` for sleep. Map both shapes
    // here so the NOT NULL category column is never null and sleep columns
    // are populated regardless of which field name the client used.
    const category = req.body.category || req.body.type || 'other';
    const sleep_start = req.body.sleep_start || req.body.start_time || null;
    const sleep_end = req.body.sleep_end || req.body.end_time || null;

    const id = uuid();
    // Use server-local date so the saved row matches the business day,
    // not the UTC day. Same fix as children.js sign-in/sign-out.
    const _now = new Date();
    const localToday = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
    const today = update_date || localToday;

    D().prepare(`INSERT INTO daily_updates
      (id,tenant_id,child_id,educator_id,update_date,category,sleep_start,sleep_end,sleep_checks,meal_type,ate_amount,food_details,diaper_type,notes,photo_url)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, req.tenantId, child_id, educator_id||null, today, category,
        sleep_start, sleep_end, sleep_checks ? JSON.stringify(sleep_checks) : '[]',
        meal_type||null, ate_amount||null, food_details||null, diaper_type||null, notes||null, photo_url||null);

    // Log to event log
    try {
      const desc = buildEventDescription(category, { ...req.body, sleep_start, sleep_end });
      D().prepare(`INSERT INTO child_event_log (id,tenant_id,child_id,event_type,description,created_by) VALUES(?,?,?,?,?,?)`)
        .run(uuid(), req.tenantId, child_id, category, desc, req.userId);
    } catch(e) {}

    res.json({ id, category, sleep_start, sleep_end });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update sleep record (for adding check-ins or wakeup)
router.put('/:id/sleep', (req, res) => {
  try {
    const { sleep_end, sleep_checks } = req.body;
    const updates = {};
    if (sleep_end) updates.sleep_end = sleep_end;
    if (sleep_checks) updates.sleep_checks = JSON.stringify(sleep_checks);
    const setClause = Object.keys(updates).map(k => k + ' = ?').join(', ');
    D().prepare((() => 'UPDATE daily_updates SET ' + setClause + ' WHERE id = ?')()).run(...Object.values(updates), req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update — edit notes/category for an existing entry
router.patch('/:id', (req, res) => {
  try {
    const { notes, category, type } = req.body;
    const cat = category || type || null;
    // COALESCE keeps existing values when caller omits a field. The
    // daily_updates table has no updated_at column, so don't touch it.
    D().prepare(`UPDATE daily_updates SET
      notes = COALESCE(?, notes),
      category = COALESCE(?, category)
      WHERE id = ? AND tenant_id = ?`)
      .run(notes ?? null, cat, req.params.id, req.tenantId);
    const row = D().prepare('SELECT * FROM daily_updates WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
    if (!row) return res.status(404).json({ error: 'Update not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE update
router.delete('/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM daily_updates WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET feed for a specific child (parent portal view)
router.get('/feed/:childId', (req, res) => {
  try {
    const { date } = req.query;
    const _now = new Date();
    const _localToday = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
    const targetDate = date || _localToday;
    const updates = D().prepare(`
      SELECT du.*, e.first_name||' '||e.last_name as educator_name,
        e.first_name as educator_first, e.last_name as educator_last
      FROM daily_updates du
      LEFT JOIN educators e ON du.educator_id = e.id
      WHERE du.child_id = ? AND du.tenant_id = ? AND du.update_date = ?
      ORDER BY du.created_at ASC
    `).all(req.params.childId, req.tenantId, targetDate);
    res.json(updates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildEventDescription(category, body) {
  switch(category) {
    case 'food': return `${body.meal_type ? body.meal_type.replace('_',' ') : 'Meal'} — ate ${body.ate_amount || 'some'}${body.food_details ? ': ' + body.food_details : ''}`;
    case 'sleep': return body.sleep_end 
      ? `Slept ${calcDuration(body.sleep_start, body.sleep_end)}`
      : `Sleep started at ${body.sleep_start}`;
    case 'diaper': return `Nappy changed — ${body.diaper_type || 'wet'}`;
    case 'toilet': return 'Toilet visit recorded';
    case 'sunscreen': return 'Sunscreen applied';
    case 'incident': return 'Incident recorded';
    case 'activity': return body.notes || 'Activity recorded';
    case 'attendance_in': return body.notes || 'Arrived at centre';
    case 'attendance_out': return body.notes || 'Departed centre';
    default: return body.notes || `${category} recorded`;
  }
}

function calcDuration(start, end) {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 60) return `${mins} mins`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}h ${m}m`;
}

export default router;
