/**
 * server/operations.js — v2.7.0
 *
 * Daily operations endpoints — all designed for 100k+ records / 1000+ tenants:
 *  - Every query filters by tenant_id FIRST (uses composite indexes)
 *  - All lists are paginated (page/limit params)
 *  - Prepared statements cached by better-sqlite3
 *
 * Routes:
 *  /api/operations/visitors       — Visitor sign-in/out + kiosk
 *  /api/operations/evacuation     — Evacuation drills + head counts
 *  /api/operations/sleep          — Sleep tracking + 2hr check alerts
 *  /api/operations/hazards        — Hazard & maintenance log
 *  /api/operations/rp-log         — Responsible Person daily log
 *  /api/operations/handover       — End-of-shift handover forms
 *  /api/operations/room-checkins  — Educator room check-in/out
 */

import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

// ── Local date helper ─────────────────────────────────────────────────────────
// Always use server-local date for "today" — toISOString() is UTC and returns
// yesterday for the first ~10h of the day in AEST. Same fix as children.js,
// daily-updates.js, etc.
const localDate = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
};

// ── Pagination helper ─────────────────────────────────────────────────────────
const paginate = (req) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(200, parseInt(req.query.limit) || 50);
  return { limit, offset: (page - 1) * limit, page };
};

// ─────────────────────────────────────────────────────────────────────────────
// VISITOR SIGN-IN / OUT
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/operations/visitors?date=YYYY-MM-DD&status=in
r.get('/visitors', (req, res) => {
  try {
    const { date, status } = req.query;
    const { limit, offset, page } = paginate(req);
    const d = date || localDate();

    const rows = D().prepare(`
      SELECT vl.*, e.first_name as host_first, e.last_name as host_last
      FROM visitor_logs vl
      LEFT JOIN educators e ON e.id = vl.host_educator_id
      WHERE vl.tenant_id = ?
        AND vl.date = ?
        ${status === 'in' ? 'AND vl.sign_out IS NULL' : ''}
      ORDER BY vl.sign_in DESC
      LIMIT ? OFFSET ?
    `).all(req.tenantId, d, limit, offset);

    const total = D().prepare(
      `SELECT COUNT(*) as n FROM visitor_logs WHERE tenant_id=? AND date=?`
    ).get(req.tenantId, d)?.n || 0;

    res.json({ visitors: rows, total, page, pages: Math.ceil(total / limit) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/operations/visitors  — sign in
r.post('/visitors', (req, res) => {
  try {
    const { visitor_name, visitor_type, company, purpose, host_educator_id,
            wwcc_number, vaccination_status, notes } = req.body;
    if (!visitor_name) return res.status(400).json({ error: 'visitor_name required' });

    const id = uuid();
    const now = new Date();
    const date = localDate();
    const time = now.toTimeString().slice(0,8);

    D().prepare(`
      INSERT INTO visitor_logs
        (id,tenant_id,visitor_name,visitor_type,company,purpose,host_educator_id,
         wwcc_number,vaccination_status,sign_in,date,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, req.tenantId, visitor_name, visitor_type||'visitor', company||null,
           purpose||null, host_educator_id||null, wwcc_number||null,
           vaccination_status||'not_checked', time, date, notes||null);

    res.json({ id, ok: true, sign_in: time });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/operations/visitors/:id/sign-out
r.put('/visitors/:id/sign-out', (req, res) => {
  try {
    const time = new Date().toTimeString().slice(0,8);
    D().prepare(`UPDATE visitor_logs SET sign_out=? WHERE id=? AND tenant_id=?`)
      .run(time, req.params.id, req.tenantId);
    res.json({ ok: true, sign_out: time });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// EVACUATION DRILLS & HEAD COUNTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/operations/evacuation
r.get('/evacuation', (req, res) => {
  try {
    const { limit, offset, page } = paginate(req);
    const rows = D().prepare(`
      SELECT * FROM evacuation_drills WHERE tenant_id=?
      ORDER BY started_at DESC LIMIT ? OFFSET ?
    `).all(req.tenantId, limit, offset);
    const total = D().prepare(
      'SELECT COUNT(*) as n FROM evacuation_drills WHERE tenant_id=?'
    ).get(req.tenantId)?.n || 0;
    res.json({ drills: rows, total, page, pages: Math.ceil(total/limit) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/operations/evacuation  — start a drill, auto-populate from today's attendance
r.post('/evacuation', (req, res) => {
  try {
    const { drill_type, notes, conducted_by } = req.body;
    const id = uuid();
    const now = new Date().toISOString().replace('T',' ').slice(0,19);

    // Count today's present children and clocked-in educators for auto-populate
    const today = now.split(' ')[0];
    const childCount = D().prepare(`
      SELECT COUNT(*) as n FROM attendance_sessions
      WHERE tenant_id=? AND date=? AND sign_in IS NOT NULL AND sign_out IS NULL AND absent=0
    `).get(req.tenantId, today)?.n || 0;
    const eduCount = D().prepare(`
      SELECT COUNT(*) as n FROM clock_records
      WHERE tenant_id=? AND date=? AND clock_in IS NOT NULL AND clock_out IS NULL
    `).get(req.tenantId, today)?.n || 0;

    D().prepare(`
      INSERT INTO evacuation_drills
        (id,tenant_id,drill_type,started_at,total_children,total_educators,conducted_by,notes)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(id, req.tenantId, drill_type||'fire', now, childCount, eduCount,
           conducted_by||null, notes||null);

    // Auto-create headcount rows for all present children
    const presentChildren = D().prepare(`
      SELECT child_id FROM attendance_sessions
      WHERE tenant_id=? AND date=? AND sign_in IS NOT NULL AND sign_out IS NULL AND absent=0
    `).all(req.tenantId, today);

    const insertHC = D().prepare(`
      INSERT INTO evacuation_headcounts (id,drill_id,child_id,person_type,accounted)
      VALUES (?,?,?,?,0)
    `);
    const insertMany = D().transaction((children) => {
      for (const c of children) insertHC.run(uuid(), id, c.child_id, 'child');
    });
    insertMany(presentChildren);

    res.json({ id, ok: true, children_loaded: presentChildren.length, educators: eduCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/operations/evacuation/:id  — drill detail with headcounts
r.get('/evacuation/:id', (req, res) => {
  try {
    const drill = D().prepare(
      'SELECT * FROM evacuation_drills WHERE id=? AND tenant_id=?'
    ).get(req.params.id, req.tenantId);
    if (!drill) return res.status(404).json({ error: 'Not found' });

    const counts = D().prepare(`
      SELECT eh.*, c.first_name, c.last_name, c.room_id, r.name as room_name
      FROM evacuation_headcounts eh
      LEFT JOIN children c ON c.id=eh.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE eh.drill_id=?
      ORDER BY r.name, c.first_name
    `).all(req.params.id);

    res.json({ drill, headcounts: counts });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/operations/evacuation/:id  — update drill (complete it)
r.put('/evacuation/:id', (req, res) => {
  try {
    const { completed_at, duration_seconds, all_accounted, missing_count,
            notes, reviewed_by } = req.body;
    D().prepare(`
      UPDATE evacuation_drills SET
        completed_at=COALESCE(?,completed_at), duration_seconds=COALESCE(?,duration_seconds),
        all_accounted=COALESCE(?,all_accounted), missing_count=COALESCE(?,missing_count),
        notes=COALESCE(?,notes), reviewed_by=COALESCE(?,reviewed_by)
      WHERE id=? AND tenant_id=?
    `).run(completed_at||null, duration_seconds||null, all_accounted!=null?all_accounted:null,
           missing_count||null, notes||null, reviewed_by||null,
           req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/operations/evacuation/:id/headcount/:hcId
r.put('/evacuation/:id/headcount/:hcId', (req, res) => {
  try {
    const { accounted, notes } = req.body;
    D().prepare('UPDATE evacuation_headcounts SET accounted=?, notes=? WHERE id=? AND drill_id=?')
      .run(accounted?1:0, notes||null, req.params.hcId, req.params.id);

    // Update drill totals
    const drill = D().prepare('SELECT id FROM evacuation_drills WHERE id=? AND tenant_id=?')
      .get(req.params.id, req.tenantId);
    if (!drill) return res.status(404).json({ error: 'Drill not found' });

    const stats = D().prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN accounted=1 THEN 1 ELSE 0 END) as acc
      FROM evacuation_headcounts WHERE drill_id=?
    `).get(req.params.id);

    D().prepare('UPDATE evacuation_drills SET all_accounted=?, missing_count=? WHERE id=? AND tenant_id=?')
      .run(stats.acc >= stats.total ? 1 : 0, stats.total - stats.acc, req.params.id, req.tenantId);

    res.json({ ok: true, accounted: stats.acc, total: stats.total });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// SLEEP TRACKING
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/operations/sleep?date=YYYY-MM-DD&room_id=
r.get('/sleep', (req, res) => {
  try {
    const date = req.query.date || localDate();
    const roomFilter = req.query.room_id ? 'AND c.room_id=?' : '';
    const params = req.query.room_id
      ? [req.tenantId, date, req.query.room_id]
      : [req.tenantId, date];

    const rows = D().prepare(`
      SELECT sr.*, c.first_name, c.last_name, c.room_id, r.name as room_name,
             c.dob,
             CAST((julianday('now') - julianday(c.dob)) * 12 / 30.44 AS INTEGER) as age_months
      FROM sleep_records sr
      JOIN children c ON c.id=sr.child_id
      LEFT JOIN rooms r ON r.id=sr.room_id
      WHERE sr.tenant_id=? AND sr.date=? ${roomFilter}
      ORDER BY sr.sleep_start DESC
    `).all(...params);

    // Flag overdue checks (under-2s need check every 2hrs)
    const now = new Date();
    const flagged = rows.map(s => {
      const isUnder2 = s.age_months < 24;
      const overdue = isUnder2 && s.sleep_start && !s.sleep_end && s.next_check_due
        ? new Date(s.date + 'T' + s.next_check_due) < now
        : false;
      return { ...s, check_overdue: overdue, requires_checks: isUnder2 };
    });

    res.json({ records: flagged, date });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/operations/sleep  — start sleep
r.post('/sleep', (req, res) => {
  try {
    const { child_id, sleep_position, room_id, notes, recorded_by } = req.body;
    if (!child_id) return res.status(400).json({ error: 'child_id required' });

    const now = new Date();
    const date = localDate();
    const time = now.toTimeString().slice(0,5);

    // Calculate next check due (2hr intervals for under-2, no requirement otherwise)
    const child = D().prepare('SELECT dob FROM children WHERE id=? AND tenant_id=?')
      .get(child_id, req.tenantId);
    const ageMonths = child?.dob
      ? Math.floor((Date.now() - new Date(child.dob)) / (1000*60*60*24*30.44))
      : 999;
    const nextCheckMins = ageMonths < 24 ? 20 : null; // 20 min initial check, then 2hr
    const nextCheck = nextCheckMins
      ? new Date(now.getTime() + nextCheckMins * 60000).toTimeString().slice(0,5)
      : null;

    const id = uuid();
    D().prepare(`
      INSERT INTO sleep_records
        (id,tenant_id,child_id,date,sleep_start,sleep_position,room_id,
         checks,next_check_due,notes,recorded_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, req.tenantId, child_id, date, time,
           sleep_position||'back', room_id||null,
           JSON.stringify([]), nextCheck, notes||null, recorded_by||null);

    res.json({ id, ok: true, sleep_start: time, next_check_due: nextCheck, age_months: ageMonths });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/operations/sleep/:id/check  — record a sleep check
r.put('/sleep/:id/check', (req, res) => {
  try {
    const rec = D().prepare('SELECT * FROM sleep_records WHERE id=? AND tenant_id=?')
      .get(req.params.id, req.tenantId);
    if (!rec) return res.status(404).json({ error: 'Not found' });

    const now = new Date();
    const timeStr = now.toTimeString().slice(0,5);
    const checks = JSON.parse(rec.checks || '[]');
    checks.push(timeStr);

    // Next check in 2 hours
    const next = new Date(now.getTime() + 2*60*60*1000).toTimeString().slice(0,5);

    D().prepare(`
      UPDATE sleep_records SET
        checks=?, last_check=?, next_check_due=?, alert_sent=0
      WHERE id=? AND tenant_id=?
    `).run(JSON.stringify(checks), timeStr, next, req.params.id, req.tenantId);

    res.json({ ok: true, check_time: timeStr, next_check_due: next, total_checks: checks.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/operations/sleep/:id/wake  — child woke up
r.put('/sleep/:id/wake', (req, res) => {
  try {
    const rec = D().prepare('SELECT * FROM sleep_records WHERE id=? AND tenant_id=?')
      .get(req.params.id, req.tenantId);
    if (!rec) return res.status(404).json({ error: 'Not found' });

    const wakeTime = new Date().toTimeString().slice(0,5);
    const [sh,sm] = rec.sleep_start.split(':').map(Number);
    const [wh,wm] = wakeTime.split(':').map(Number);
    const durMins = (wh*60+wm) - (sh*60+sm);

    D().prepare(`
      UPDATE sleep_records SET sleep_end=?, duration_mins=?, next_check_due=NULL
      WHERE id=? AND tenant_id=?
    `).run(wakeTime, durMins > 0 ? durMins : null, req.params.id, req.tenantId);

    res.json({ ok: true, sleep_end: wakeTime, duration_mins: durMins });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// HAZARD & MAINTENANCE LOG
// ─────────────────────────────────────────────────────────────────────────────

r.get('/hazards', (req, res) => {
  try {
    const { status, risk_level } = req.query;
    const { limit, offset, page } = paginate(req);
    const filters = ['tenant_id=?'];
    const vals = [req.tenantId];
    if (status) { filters.push('status=?'); vals.push(status); }
    if (risk_level) { filters.push('risk_level=?'); vals.push(risk_level); }

    const rows = D().prepare(`
      SELECT * FROM hazard_reports WHERE ${filters.join(' AND ')}
      ORDER BY CASE risk_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
               created_at DESC
      LIMIT ? OFFSET ?
    `).all(...vals, limit, offset);

    const total = D().prepare(
      `SELECT COUNT(*) as n FROM hazard_reports WHERE ${filters.join(' AND ')}`
    ).get(...vals)?.n || 0;

    res.json({ hazards: rows.map(h => ({...h, photo_urls: JSON.parse(h.photo_urls||'[]')})),
               total, page, pages: Math.ceil(total/limit) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/hazards', (req, res) => {
  try {
    const { report_type, title, description, location, risk_level,
            photo_urls, reported_by, assigned_to, due_date } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const id = uuid();
    D().prepare(`
      INSERT INTO hazard_reports
        (id,tenant_id,report_type,title,description,location,risk_level,
         photo_urls,reported_by,assigned_to,due_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, req.tenantId, report_type||'hazard', title, description||null,
           location||null, risk_level||'medium',
           JSON.stringify(photo_urls||[]), reported_by||null, assigned_to||null, due_date||null);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/hazards/:id', (req, res) => {
  try {
    const { status, resolution_notes, assigned_to, risk_level, due_date } = req.body;
    const resolved = status === 'resolved' || status === 'closed'
      ? new Date().toISOString() : null;
    D().prepare(`
      UPDATE hazard_reports SET
        status=COALESCE(?,status), resolution_notes=COALESCE(?,resolution_notes),
        assigned_to=COALESCE(?,assigned_to), risk_level=COALESCE(?,risk_level),
        due_date=COALESCE(?,due_date),
        resolved_at=COALESCE(?,resolved_at), updated_at=datetime('now')
      WHERE id=? AND tenant_id=?
    `).run(status||null, resolution_notes||null, assigned_to||null,
           risk_level||null, due_date||null, resolved,
           req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSIBLE PERSON DAILY LOG
// ─────────────────────────────────────────────────────────────────────────────

r.get('/rp-log', (req, res) => {
  try {
    const date = req.query.date || localDate();
    const rows = D().prepare(`
      SELECT rl.*, e.first_name, e.last_name, e.qualification,
             e.first_aid, e.cpr_expiry, e.anaphylaxis_expiry, e.first_aid_expiry
      FROM rp_daily_log rl
      JOIN educators e ON e.id=rl.educator_id
      WHERE rl.tenant_id=? AND rl.date=?
      ORDER BY rl.start_time
    `).all(req.tenantId, date);
    res.json({ log: rows, date });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/rp-log', (req, res) => {
  try {
    const { educator_id, start_time, end_time, notes } = req.body;
    if (!educator_id || !start_time) return res.status(400).json({ error: 'educator_id and start_time required' });
    const date = req.query.date || localDate();
    const id = uuid();
    D().prepare(`
      INSERT OR IGNORE INTO rp_daily_log (id,tenant_id,date,educator_id,start_time,end_time,notes)
      VALUES (?,?,?,?,?,?,?)
    `).run(id, req.tenantId, date, educator_id, start_time, end_time||null, notes||null);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/rp-log/:id', (req, res) => {
  try {
    const { end_time, signed_by_educator, signed_by_director, notes } = req.body;
    D().prepare(`
      UPDATE rp_daily_log SET
        end_time=COALESCE(?,end_time),
        signed_by_educator=COALESCE(?,signed_by_educator),
        signed_by_director=COALESCE(?,signed_by_director),
        notes=COALESCE(?,notes)
      WHERE id=? AND tenant_id=?
    `).run(end_time||null, signed_by_educator!=null?signed_by_educator:null,
           signed_by_director!=null?signed_by_director:null, notes||null,
           req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// HANDOVER FORMS
// ─────────────────────────────────────────────────────────────────────────────

r.get('/handover', (req, res) => {
  try {
    const date = req.query.date || localDate();
    const rows = D().prepare(`
      SELECT hf.*, r.name as room_name
      FROM handover_forms hf
      LEFT JOIN rooms r ON r.id=hf.room_id
      WHERE hf.tenant_id=? AND hf.date=?
      ORDER BY hf.created_at DESC
    `).all(req.tenantId, date);
    res.json({ forms: rows, date });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/handover', (req, res) => {
  try {
    const { shift_type, room_id, children_present, incidents_summary,
            medications_given, sleep_notes, meals_notes, behaviour_notes,
            outstanding_tasks, messages_for_families, general_notes, submitted_by } = req.body;

    const id = uuid();
    const date = localDate();
    D().prepare(`
      INSERT INTO handover_forms
        (id,tenant_id,date,shift_type,room_id,submitted_by,children_present,
         incidents_summary,medications_given,sleep_notes,meals_notes,behaviour_notes,
         outstanding_tasks,messages_for_families,general_notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, req.tenantId, date, shift_type||'end_of_day', room_id||null,
           submitted_by||null, children_present||0,
           incidents_summary||null, medications_given||null, sleep_notes||null,
           meals_notes||null, behaviour_notes||null, outstanding_tasks||null,
           messages_for_families||null, general_notes||null);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/handover/:id/acknowledge', (req, res) => {
  try {
    const { acknowledged_by } = req.body;
    D().prepare(`
      UPDATE handover_forms SET acknowledged_by=?, acknowledged_at=datetime('now')
      WHERE id=? AND tenant_id=?
    `).run(acknowledged_by||req.userId, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROOM CHECK-IN
// ─────────────────────────────────────────────────────────────────────────────

r.get('/room-checkins', (req, res) => {
  try {
    const date = req.query.date || localDate();
    const rows = D().prepare(`
      SELECT rc.*, e.first_name, e.last_name, e.qualification, r.name as room_name, r.age_group
      FROM room_checkins rc
      JOIN educators e ON e.id=rc.educator_id
      JOIN rooms r ON r.id=rc.room_id
      WHERE rc.tenant_id=? AND rc.date=?
      ORDER BY rc.checked_in_at DESC
    `).all(req.tenantId, date);
    res.json({ checkins: rows, date });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/room-checkins', (req, res) => {
  try {
    const { educator_id, room_id, clock_record_id } = req.body;
    if (!educator_id || !room_id) return res.status(400).json({ error: 'educator_id and room_id required' });

    const date = localDate();
    const id = uuid();

    // Auto-close any open check-in for this educator today
    D().prepare(`
      UPDATE room_checkins SET checked_out_at=datetime('now','localtime')
      WHERE tenant_id=? AND educator_id=? AND date=? AND checked_out_at IS NULL
    `).run(req.tenantId, educator_id, date);

    D().prepare(`
      INSERT INTO room_checkins (id,tenant_id,educator_id,room_id,clock_record_id,checked_in_at,date)
      VALUES (?,?,?,?,?,datetime('now','localtime'),?)
    `).run(id, req.tenantId, educator_id, room_id, clock_record_id||null, date);

    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/room-checkins/:id/checkout', (req, res) => {
  try {
    D().prepare(`
      UPDATE room_checkins SET checked_out_at=datetime('now','localtime')
      WHERE id=? AND tenant_id=?
    `).run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// SHIFT BIDDING (extend rostering)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/operations/shift-bids?entry_id=  (all bids for a shift)
r.get('/shift-bids', (req, res) => {
  try {
    const { entry_id } = req.query;
    if (!entry_id) return res.status(400).json({ error: 'entry_id required' });

    const bids = D().prepare(`
      SELECT sb.*, e.first_name, e.last_name, e.qualification, e.reliability_score,
             e.distance_km
      FROM shift_bids sb
      JOIN educators e ON e.id=sb.educator_id
      WHERE sb.roster_entry_id=? AND e.tenant_id=?
      ORDER BY sb.ai_score DESC, sb.submitted_at ASC
    `).all(entry_id, req.tenantId);

    res.json({ bids });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/operations/open-shifts  — shifts available to bid on
r.get('/open-shifts', (req, res) => {
  try {
    const { limit, offset, page } = paginate(req);
    const today = localDate();

    const shifts = D().prepare(`
      SELECT re.*, r.name as room_name, r.age_group,
             COUNT(sb.id) as bid_count
      FROM roster_entries re
      LEFT JOIN rooms r ON r.id=re.room_id
      LEFT JOIN shift_bids sb ON sb.roster_entry_id=re.id AND sb.status='pending'
      WHERE re.tenant_id=? AND re.status='unfilled' AND re.date >= ?
      GROUP BY re.id
      ORDER BY re.date, re.start_time
      LIMIT ? OFFSET ?
    `).all(req.tenantId, today, limit, offset);

    res.json({ shifts, page });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/operations/shift-bids  — educator bids on a shift
r.post('/shift-bids', (req, res) => {
  try {
    const { roster_entry_id, educator_id, note } = req.body;
    if (!roster_entry_id || !educator_id) return res.status(400).json({ error: 'roster_entry_id and educator_id required' });

    // Verify shift exists and is unfilled
    const shift = D().prepare('SELECT * FROM roster_entries WHERE id=? AND tenant_id=? AND status=?')
      .get(roster_entry_id, req.tenantId, 'unfilled');
    if (!shift) return res.status(404).json({ error: 'Shift not found or already filled' });

    // Check no existing bid
    const existing = D().prepare('SELECT id FROM shift_bids WHERE roster_entry_id=? AND educator_id=? AND status=? AND tenant_id=?')
      .get(roster_entry_id, educator_id, 'pending');
    if (existing) return res.status(409).json({ error: 'Already bid on this shift' });

    // AI score: reliability_score (0-100) weighted with qualification match
    const edu = D().prepare('SELECT reliability_score, qualification, distance_km FROM educators WHERE id=? AND tenant_id=?')
      .get(educator_id, req.tenantId);

    const qualScore = { ect: 100, diploma: 85, cert3: 70, working_towards_diploma: 55, working_towards: 40, unqualified: 20 };
    const reliabilityScore = edu?.reliability_score || 50;
    const qScore = qualScore[edu?.qualification] || 50;
    const distPenalty = Math.min(30, (edu?.distance_km || 5) * 2);
    const aiScore = (reliabilityScore * 0.6 + qScore * 0.4) - distPenalty;

    const id = uuid();
    D().prepare(`
      INSERT INTO shift_bids (id,tenant_id,roster_entry_id,educator_id,note,ai_score)
      VALUES (?,?,?,?,?,?)
    `).run(id, req.tenantId, roster_entry_id, educator_id, note||null, aiScore);

    res.json({ id, ok: true, ai_score: Math.round(aiScore) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/operations/shift-bids/:id/decide  — manager accepts/declines a bid
r.put('/shift-bids/:id/decide', (req, res) => {
  try {
    const { status } = req.body; // accepted | declined
    if (!['accepted','declined'].includes(status)) return res.status(400).json({ error: 'status must be accepted or declined' });

    const bid = D().prepare(`
      SELECT sb.*, re.tenant_id FROM shift_bids sb
      JOIN roster_entries re ON re.id=sb.roster_entry_id
      WHERE sb.id=? AND re.tenant_id=?
    `).get(req.params.id, req.tenantId);
    if (!bid) return res.status(404).json({ error: 'Bid not found' });

    D().prepare(`
      UPDATE shift_bids SET status=?, decided_at=datetime('now'), decided_by=?
      WHERE id=?
    `).run(status, req.userId, req.params.id);

    if (status === 'accepted') {
      // Fill the shift
      D().prepare(`
        UPDATE roster_entries SET status='filled', educator_id=? WHERE id=?
      `).run(bid.educator_id, bid.roster_entry_id);
      // Decline all other bids for this shift
      D().prepare(`
        UPDATE shift_bids SET status='declined', decided_at=datetime('now')
        WHERE roster_entry_id=? AND id!=? AND status='pending'
      `).run(bid.roster_entry_id, req.params.id);
    }

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE PATTERNS (used by dashboard — scale optimised)
// ─────────────────────────────────────────────────────────────────────────────

r.get('/attendance-patterns', (req, res) => {
  try {
    const weeks = Math.min(12, parseInt(req.query.weeks) || 4);
    const since = new Date();
    since.setDate(since.getDate() - (weeks * 7));
    const sinceStr = `${since.getFullYear()}-${String(since.getMonth()+1).padStart(2,'0')}-${String(since.getDate()).padStart(2,'0')}`;

    const byDay = D().prepare(`
      SELECT
        strftime('%w', date) as day_of_week,
        CASE strftime('%w', date)
          WHEN '0' THEN 'Sun' WHEN '1' THEN 'Mon' WHEN '2' THEN 'Tue'
          WHEN '3' THEN 'Wed' WHEN '4' THEN 'Thu' WHEN '5' THEN 'Fri' WHEN '6' THEN 'Sat'
        END as day_name,
        AVG(CAST(strftime('%H', sign_in)*60 + strftime('%M', sign_in) AS REAL)) as avg_arrival_mins,
        AVG(CASE WHEN sign_out IS NOT NULL
          THEN CAST(strftime('%H', sign_out)*60 + strftime('%M', sign_out) AS REAL)
          ELSE NULL END) as avg_departure_mins,
        AVG(hours) as avg_duration_hrs,
        COUNT(*) as sessions
      FROM attendance_sessions
      WHERE tenant_id=? AND date >= ? AND absent=0 AND sign_in IS NOT NULL
      GROUP BY day_of_week
      ORDER BY day_of_week
    `).all(req.tenantId, sinceStr);

    const byRoom = D().prepare(`
      SELECT
        c.room_id, r.name as room_name, r.age_group,
        AVG(CAST(strftime('%H', a.sign_in)*60 + strftime('%M', a.sign_in) AS REAL)) as avg_arrival_mins,
        AVG(CASE WHEN a.sign_out IS NOT NULL
          THEN CAST(strftime('%H', a.sign_out)*60 + strftime('%M', a.sign_out) AS REAL)
          ELSE NULL END) as avg_departure_mins,
        AVG(a.hours) as avg_duration_hrs,
        COUNT(*) as sessions
      FROM attendance_sessions a
      JOIN children c ON c.id=a.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE a.tenant_id=? AND a.date >= ? AND a.absent=0 AND a.sign_in IS NOT NULL
      GROUP BY c.room_id
    `).all(req.tenantId, sinceStr);

    // Format times
    const fmt = m => m ? `${String(Math.floor(m/60)).padStart(2,'0')}:${String(Math.round(m%60)).padStart(2,'0')}` : null;
    const avgArr = byDay.filter(d=>d.avg_arrival_mins).map(d=>d.avg_arrival_mins);
    const avgDep = byDay.filter(d=>d.avg_departure_mins).map(d=>d.avg_departure_mins);

    res.json({
      by_day: byDay.map(d => ({ ...d, avg_arrival: fmt(d.avg_arrival_mins), avg_departure: fmt(d.avg_departure_mins), avg_duration_hrs: d.avg_duration_hrs?.toFixed(1) })),
      by_room: byRoom.map(r => ({ ...r, avg_arrival: fmt(r.avg_arrival_mins), avg_departure: fmt(r.avg_departure_mins), avg_duration_hrs: r.avg_duration_hrs?.toFixed(1) })),
      period: { weeks, since: sinceStr },
      summary: {
        peak_arrival: fmt(avgArr.length ? avgArr.reduce((a,b)=>a+b)/avgArr.length : null),
        peak_departure: fmt(avgDep.length ? avgDep.reduce((a,b)=>a+b)/avgDep.length : null),
        avg_daily_attendance: byDay.reduce((s,d)=>s+(d.sessions||0),0) / Math.max(1, weeks*5),
        avg_hours_per_child: (byDay.reduce((s,d)=>s+(d.avg_duration_hrs||0),0) / Math.max(1, byDay.length)).toFixed(1),
      }
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// NECWR ALERTS (stub — main logic in v2-features.js)
// ─────────────────────────────────────────────────────────────────────────────

r.get('/necwr-alerts', (req, res) => {
  try {
    res.json([]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
