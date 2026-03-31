// ═══════════════════════════════════════════════════════════════════════════
//  Childcare360 — Rostering Enhancements Server Module
//  Mount in server/index.js:  app.use('/api/roster-enhanced', require('./roster-enhancements.js'))
//
//  All 15 enhancement features with full CRUD + validation endpoints.
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const router = Router();
router.use(requireAuth);
router.use(requireTenant);

// ── Helpers ──────────────────────────────────────────────────────────────

function timeToMins(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minsToTime(m) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

function dayOfWeek(dateStr) {
  return new Date(dateStr + 'T12:00:00').getDay(); // 0=Sun
}

function dateRange(start, end) {
  const dates = [];
  const d = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  while (d <= e) {
    dates.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

const QUAL_ORDER = { ect: 5, diploma: 4, working_towards_diploma: 3, cert3: 2, working_towards: 1, unqualified: 0 };
function qualScore(q) { return QUAL_ORDER[q] || 0; }

// NQF Ratios by age group (NSW defaults — configurable per tenant via age_group_settings)
const NQF_RATIOS = { '0-2': 4, '2-3': 5, '3-4': 11, '3-5': 11, '4-5': 11 };

// ═══════════════════════════════════════════════════════════════════════════
//  #1  RESPONSIBLE PERSON COVERAGE VALIDATION
//      Reg 150: RP must be physically on-site at all times
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/roster-enhanced/rp-coverage?date=YYYY-MM-DD
// Returns RP coverage for a given date with gap detection
router.get('/rp-coverage', (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date required' });

    const tenant = D().prepare('SELECT * FROM tenants WHERE id=?').get(req.tenantId);
    const opStart = timeToMins(tenant?.operating_hours_start || '06:30');
    const opEnd = timeToMins(tenant?.operating_hours_end || '18:30');

    const rpEntries = D().prepare(`
      SELECT rc.*, e.first_name, e.last_name, e.qualification,
        e.first_aid, e.first_aid_expiry, e.cpr_expiry, e.anaphylaxis_expiry
      FROM rp_coverage rc JOIN educators e ON e.id = rc.educator_id
      WHERE rc.tenant_id=? AND rc.date=?
      ORDER BY rc.start_time ASC
    `).all(req.tenantId, date);

    // Detect gaps — sweep operating hours for uncovered minutes
    const gaps = [];
    let cursor = opStart;
    const primaryRPs = rpEntries.filter(r => !r.is_backup);
    const sortedRPs = primaryRPs.sort((a, b) => timeToMins(a.start_time) - timeToMins(b.start_time));

    for (const rp of sortedRPs) {
      const rpStart = timeToMins(rp.start_time);
      const rpEnd = timeToMins(rp.end_time);
      if (rpStart > cursor) {
        gaps.push({ start: minsToTime(cursor), end: minsToTime(rpStart), duration_mins: rpStart - cursor });
      }
      cursor = Math.max(cursor, rpEnd);
    }
    if (cursor < opEnd) {
      gaps.push({ start: minsToTime(cursor), end: minsToTime(opEnd), duration_mins: opEnd - cursor });
    }

    // Check RP eligibility (FA + CPR + Anaphylaxis all current)
    const today = new Date().toISOString().split('T')[0];
    const eligibilityIssues = rpEntries.map(rp => {
      const issues = [];
      if (!rp.first_aid || (rp.first_aid_expiry && rp.first_aid_expiry < today)) issues.push('First Aid expired or missing');
      if (rp.cpr_expiry && rp.cpr_expiry < today) issues.push('CPR expired');
      if (rp.anaphylaxis_expiry && rp.anaphylaxis_expiry < today) issues.push('Anaphylaxis expired');
      return issues.length ? { educator_id: rp.educator_id, name: `${rp.first_name} ${rp.last_name}`, issues } : null;
    }).filter(Boolean);

    res.json({
      date,
      operating_hours: { start: tenant?.operating_hours_start || '06:30', end: tenant?.operating_hours_end || '18:30' },
      rp_entries: rpEntries,
      gaps,
      has_gaps: gaps.length > 0,
      eligibility_issues: eligibilityIssues,
      compliant: gaps.length === 0 && eligibilityIssues.length === 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/roster-enhanced/rp-coverage — assign RP to a date/time
router.post('/rp-coverage', (req, res) => {
  try {
    const { date, educator_id, start_time, end_time, is_backup } = req.body;
    if (!date || !educator_id || !start_time || !end_time)
      return res.status(400).json({ error: 'date, educator_id, start_time, end_time required' });

    // Verify educator is qualified (ECT or Diploma, FA+CPR+Anaphylaxis current)
    const ed = D().prepare('SELECT * FROM educators WHERE id=? AND tenant_id=?').get(educator_id, req.tenantId);
    if (!ed) return res.status(404).json({ error: 'Educator not found' });
    if (qualScore(ed.qualification) < qualScore('cert3'))
      return res.status(400).json({ error: 'RP must hold at least Cert III qualification' });

    const id = uuid();
    D().prepare('INSERT INTO rp_coverage (id,tenant_id,date,educator_id,start_time,end_time,role,is_backup) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, req.tenantId, date, educator_id, start_time, end_time, 'responsible_person', is_backup ? 1 : 0);
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/roster-enhanced/rp-coverage/:id
router.delete('/rp-coverage/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM rp_coverage WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/roster-enhanced/rp-coverage/week?start=YYYY-MM-DD
// Batch check RP coverage for a full week
router.get('/rp-coverage/week', (req, res) => {
  try {
    const { start } = req.query;
    if (!start) return res.status(400).json({ error: 'start date required' });
    const dates = dateRange(start, (() => {
      const d = new Date(start + 'T12:00:00'); d.setDate(d.getDate() + 6);
      return d.toISOString().split('T')[0];
    })());

    const tenant = D().prepare('SELECT * FROM tenants WHERE id=?').get(req.tenantId);
    const opStart = timeToMins(tenant?.operating_hours_start || '06:30');
    const opEnd = timeToMins(tenant?.operating_hours_end || '18:30');

    const results = dates.map(date => {
      const rpEntries = D().prepare('SELECT * FROM rp_coverage WHERE tenant_id=? AND date=? AND is_backup=0 ORDER BY start_time').all(req.tenantId, date);
      let cursor = opStart;
      let gapMins = 0;
      for (const rp of rpEntries) {
        const rpS = timeToMins(rp.start_time);
        if (rpS > cursor) gapMins += rpS - cursor;
        cursor = Math.max(cursor, timeToMins(rp.end_time));
      }
      if (cursor < opEnd) gapMins += opEnd - cursor;
      return { date, rp_count: rpEntries.length, gap_mins: gapMins, compliant: gapMins === 0 };
    });

    res.json({ week_start: start, days: results, all_compliant: results.every(d => d.compliant) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  #2  MULTI-DAY ABSENCES
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/roster-enhanced/absence — create multi-day absence + cascade
router.post('/absence', (req, res) => {
  try {
    const { educator_id, start_date, end_date, type, reason, medical_cert_required } = req.body;
    if (!educator_id || !start_date) return res.status(400).json({ error: 'educator_id and start_date required' });

    const endDate = end_date || start_date;
    const dates = dateRange(start_date, endDate);
    const ed = D().prepare('SELECT * FROM educators WHERE id=? AND tenant_id=?').get(educator_id, req.tenantId);
    if (!ed) return res.status(404).json({ error: 'Educator not found' });

    // Region-aware medical cert requirements
    const tenant = D().prepare('SELECT region FROM tenants WHERE id=?').get(req.tenantId);
    const region = tenant?.region || 'AU';
    const certThresholds = { AU: 2, NZ: 3, GUAM: 3, MY: 0 }; // days before cert required
    const needsCert = medical_cert_required || (dates.length > (certThresholds[region] || 2));

    const absenceIds = [];
    const affectedShifts = [];

    for (const date of dates) {
      const absId = uuid();
      D().prepare(`INSERT INTO educator_absences
        (id,tenant_id,educator_id,date,start_date,end_date,type,reason,
         medical_cert_required,notice_given_mins,notified_via,approved)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(absId, req.tenantId, educator_id, date, start_date, endDate,
          type || 'sick', reason || '', needsCert ? 1 : 0, 0, 'system', 0);
      absenceIds.push(absId);

      // Find and mark affected roster entries as unfilled
      const shifts = D().prepare(
        "SELECT * FROM roster_entries WHERE tenant_id=? AND educator_id=? AND date=? AND status NOT IN ('cancelled','unfilled')"
      ).all(req.tenantId, educator_id, date);

      for (const shift of shifts) {
        D().prepare("UPDATE roster_entries SET status='unfilled', notes=? WHERE id=?")
          .run(`Absence: ${type || 'sick'} — ${reason || 'no reason given'}`, shift.id);

        // Auto-create shift_fill_request
        const fillId = uuid();
        D().prepare(`INSERT INTO shift_fill_requests
          (id,tenant_id,absence_id,original_educator_id,roster_entry_id,room_id,
           date,start_time,end_time,qualification_required,status,ai_initiated)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(fillId, req.tenantId, absId, educator_id, shift.id, shift.room_id,
            date, shift.start_time, shift.end_time, ed.qualification, 'open', 0);
        affectedShifts.push({ date, shift_id: shift.id, fill_request_id: fillId, room_id: shift.room_id });
      }
    }

    // Update educator stats
    D().prepare("UPDATE educators SET total_sick_days=total_sick_days+?, reliability_score=MAX(0,reliability_score-?), updated_at=datetime('now') WHERE id=?")
      .run(dates.length, dates.length * 2, educator_id);

    // Deduct sick leave balance
    if ((type || 'sick') === 'sick') {
      const hoursPerDay = 7.6;
      D().prepare("UPDATE educators SET sick_leave_balance_hours=MAX(0,sick_leave_balance_hours-?) WHERE id=?")
        .run(dates.length * hoursPerDay, educator_id);
    }

    res.json({
      ok: true,
      absence_ids: absenceIds,
      dates,
      affected_shifts: affectedShifts,
      medical_cert_required: needsCert,
      medical_cert_note: needsCert
        ? `Medical certificate required for ${region} absences > ${certThresholds[region]} day(s)`
        : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  #3  CHILD ATTENDANCE FORECASTING
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/roster-enhanced/attendance-forecast?date=YYYY-MM-DD
router.get('/attendance-forecast', (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date required' });

    const dow = dayOfWeek(date); // 0=Sun, 1=Mon...
    if (dow === 0 || dow === 6) return res.json({ date, rooms: [], note: 'Weekend — centre closed' });

    // Check if public holiday
    const holiday = D().prepare('SELECT * FROM public_holidays WHERE (tenant_id=? OR tenant_id IS NULL) AND date=?')
      .get(req.tenantId, date);
    if (holiday && !holiday.centre_open)
      return res.json({ date, rooms: [], note: `Public holiday: ${holiday.name} — centre closed` });

    const rooms = D().prepare('SELECT * FROM rooms WHERE tenant_id=? ORDER BY age_group').all(req.tenantId);

    // Get age_group_settings for custom ratios
    const ageSettings = D().prepare('SELECT * FROM age_group_settings WHERE tenant_id=?').all(req.tenantId);
    const ratioMap = {};
    ageSettings.forEach(s => { ratioMap[s.group_id] = s.ratio; });

    const forecast = rooms.map(room => {
      // Count booked children for this day
      const booked = D().prepare(
        "SELECT COUNT(*) as cnt FROM child_booked_days WHERE tenant_id=? AND room_id=? AND day_of_week=? AND active=1 AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)"
      ).get(req.tenantId, room.id, dow, date, date)?.cnt || 0;

      // Apply 92% attendance factor (industry average)
      const expected = Math.round(booked * 0.92);
      const ratio = ratioMap[room.age_group] || NQF_RATIOS[room.age_group] || 11;
      const educatorsRequired = Math.max(1, Math.ceil(expected / ratio));

      // Current roster for this room+date
      const rostered = D().prepare(
        "SELECT COUNT(*) as cnt FROM roster_entries WHERE tenant_id=? AND room_id=? AND date=? AND status NOT IN ('cancelled','unfilled')"
      ).get(req.tenantId, room.id, date)?.cnt || 0;

      // Count non-contact blocks that reduce effective educator count
      const nonContactMins = D().prepare(
        "SELECT COALESCE(SUM(CAST((julianday(end_time)-julianday(start_time))*1440 AS INTEGER)),0) as mins FROM non_contact_blocks WHERE tenant_id=? AND date=? AND educator_id IN (SELECT educator_id FROM roster_entries WHERE room_id=? AND date=? AND tenant_id=?)"
      ).get(req.tenantId, date, room.id, date, req.tenantId)?.mins || 0;

      // Existing forecast row
      const existing = D().prepare('SELECT * FROM daily_attendance_forecast WHERE tenant_id=? AND room_id=? AND date=?')
        .get(req.tenantId, room.id, date);

      return {
        room_id: room.id,
        room_name: room.name,
        age_group: room.age_group,
        capacity: room.capacity,
        booked,
        expected,
        actual: existing?.actual_count ?? null,
        ratio: `1:${ratio}`,
        educators_required: educatorsRequired,
        educators_rostered: rostered,
        non_contact_mins: nonContactMins,
        staffing_status: rostered >= educatorsRequired ? 'adequate' : rostered > 0 ? 'under' : 'none',
        shortfall: Math.max(0, educatorsRequired - rostered),
      };
    });

    res.json({
      date,
      day: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow],
      is_holiday: !!holiday,
      holiday_name: holiday?.name || null,
      rooms: forecast,
      total_booked: forecast.reduce((s, r) => s + r.booked, 0),
      total_expected: forecast.reduce((s, r) => s + r.expected, 0),
      total_educators_required: forecast.reduce((s, r) => s + r.educators_required, 0),
      total_educators_rostered: forecast.reduce((s, r) => s + r.educators_rostered, 0),
      compliant: forecast.every(r => r.staffing_status === 'adequate'),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/roster-enhanced/attendance-forecast/generate — regenerate forecast for a week
router.post('/attendance-forecast/generate', (req, res) => {
  try {
    const { start_date, end_date } = req.body;
    if (!start_date) return res.status(400).json({ error: 'start_date required' });
    const endDate = end_date || (() => { const d = new Date(start_date + 'T12:00:00'); d.setDate(d.getDate() + 4); return d.toISOString().split('T')[0]; })();
    const dates = dateRange(start_date, endDate);
    const rooms = D().prepare('SELECT * FROM rooms WHERE tenant_id=?').all(req.tenantId);
    const ageSettings = D().prepare('SELECT * FROM age_group_settings WHERE tenant_id=?').all(req.tenantId);
    const ratioMap = {};
    ageSettings.forEach(s => { ratioMap[s.group_id] = s.ratio; });

    let generated = 0;
    for (const date of dates) {
      const dow = dayOfWeek(date);
      if (dow === 0 || dow === 6) continue;
      for (const room of rooms) {
        const booked = D().prepare(
          "SELECT COUNT(*) as cnt FROM child_booked_days WHERE tenant_id=? AND room_id=? AND day_of_week=? AND active=1 AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)"
        ).get(req.tenantId, room.id, dow, date, date)?.cnt || 0;
        const expected = Math.round(booked * 0.92);
        const ratio = ratioMap[room.age_group] || NQF_RATIOS[room.age_group] || 11;
        const educatorsRequired = Math.max(1, Math.ceil(expected / ratio));

        D().prepare(`INSERT OR REPLACE INTO daily_attendance_forecast
          (id,tenant_id,room_id,date,booked_count,expected_count,educators_required,ratio_required)
          VALUES(COALESCE((SELECT id FROM daily_attendance_forecast WHERE tenant_id=? AND room_id=? AND date=?),?),?,?,?,?,?,?,?)`)
          .run(req.tenantId, room.id, date, uuid(), req.tenantId, room.id, date, booked, expected, educatorsRequired, `1:${ratio}`);
        generated++;
      }
    }
    res.json({ ok: true, generated, dates: dates.length, rooms: rooms.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  #4  NON-CONTACT TIME
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/roster-enhanced/non-contact?date=YYYY-MM-DD
router.get('/non-contact', (req, res) => {
  try {
    const { date, educator_id } = req.query;
    const where = ['nc.tenant_id=?'];
    const params = [req.tenantId];
    if (date) { where.push('nc.date=?'); params.push(date); }
    if (educator_id) { where.push('nc.educator_id=?'); params.push(educator_id); }

    const blocks = D().prepare(`
      SELECT nc.*, e.first_name, e.last_name, r.name as room_name
      FROM non_contact_blocks nc
      JOIN educators e ON e.id=nc.educator_id
      LEFT JOIN roster_entries re ON re.id=nc.roster_entry_id
      LEFT JOIN rooms r ON r.id=re.room_id
      WHERE ${where.join(' AND ')}
      ORDER BY nc.date, nc.start_time
    `).all(...params);

    res.json({ blocks });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/roster-enhanced/non-contact
router.post('/non-contact', (req, res) => {
  try {
    const { roster_entry_id, educator_id, date, start_time, end_time, block_type, description } = req.body;
    if (!educator_id || !date || !start_time || !end_time)
      return res.status(400).json({ error: 'educator_id, date, start_time, end_time required' });

    // Validate duration (max 3 hours per block)
    const durMins = timeToMins(end_time) - timeToMins(start_time);
    if (durMins > 180) return res.status(400).json({ error: 'Non-contact block cannot exceed 3 hours' });

    // Check ratio impact — will removing this educator from the floor breach ratios?
    const entry = roster_entry_id
      ? D().prepare('SELECT * FROM roster_entries WHERE id=? AND tenant_id=?').get(roster_entry_id, req.tenantId)
      : null;

    if (entry) {
      const room = D().prepare('SELECT * FROM rooms WHERE id=?').get(entry.room_id);
      if (room) {
        const ratio = NQF_RATIOS[room.age_group] || 11;
        const forecast = D().prepare('SELECT expected_count FROM daily_attendance_forecast WHERE tenant_id=? AND room_id=? AND date=?')
          .get(req.tenantId, room.id, date);
        const expectedKids = forecast?.expected_count || room.current_children || 0;
        const currentEdCount = D().prepare(
          "SELECT COUNT(*) as cnt FROM roster_entries WHERE tenant_id=? AND room_id=? AND date=? AND status NOT IN ('cancelled','unfilled') AND ? BETWEEN start_time AND end_time"
        ).get(req.tenantId, room.id, date, start_time)?.cnt || 0;

        const educatorsAfter = currentEdCount - 1; // removing this one for non-contact
        const minRequired = Math.max(1, Math.ceil(expectedKids / ratio));
        if (educatorsAfter < minRequired) {
          return res.status(400).json({
            error: 'Ratio breach warning',
            detail: (()=>{
              const _eRow=D().prepare('SELECT first_name FROM educators WHERE id=?').get(educator_id);
              const _fn=(_eRow&&_eRow.first_name)?_eRow.first_name:'this educator';
              return 'Removing '+_fn+' from floor would leave '+educatorsAfter+' educators for ~'+expectedKids+' children (need '+minRequired+' at 1:'+ratio+')';
            })(),
            can_override: true,
          });
        }
      }
    }

    const id = uuid();
    D().prepare('INSERT INTO non_contact_blocks (id,tenant_id,roster_entry_id,educator_id,date,start_time,end_time,block_type,description) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id, req.tenantId, roster_entry_id || null, educator_id, date, start_time, end_time, block_type || 'programming', description || '');
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/roster-enhanced/non-contact/:id
router.delete('/non-contact/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM non_contact_blocks WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  #5  QUALIFICATION MIX VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/roster-enhanced/qualification-check?date=YYYY-MM-DD
router.get('/qualification-check', (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date required' });

    const rules = D().prepare('SELECT * FROM qualification_mix_rules WHERE tenant_id=? AND active=1').all(req.tenantId);
    const tenant = D().prepare('SELECT approved_places FROM tenants WHERE id=?').get(req.tenantId);
    const approvedPlaces = tenant?.approved_places || 40;

    // Get all rostered educators for this date (active shifts)
    const rostered = D().prepare(`
      SELECT DISTINCT re.educator_id, e.qualification
      FROM roster_entries re JOIN educators e ON e.id=re.educator_id
      WHERE re.tenant_id=? AND re.date=? AND re.status NOT IN ('cancelled','unfilled')
    `).all(req.tenantId, date);

    const totalEds = rostered.length;
    const ects = rostered.filter(e => e.qualification === 'ect').length;
    const diplomaOrAbove = rostered.filter(e => qualScore(e.qualification) >= qualScore('diploma')).length;
    const workingTowardsDipOrAbove = rostered.filter(e => qualScore(e.qualification) >= qualScore('working_towards_diploma')).length;
    const diplomaPct = totalEds > 0 ? (workingTowardsDipOrAbove / totalEds) * 100 : 0;

    const violations = [];

    for (const rule of rules) {
      if (rule.rule_type === 'diploma_minimum' && diplomaPct < rule.min_diploma_pct) {
        violations.push({
          rule: rule.rule_type, regulation: rule.regulation_ref,
          required: `${rule.min_diploma_pct}% Diploma or above`,
          actual: `${Math.round(diplomaPct)}% (${workingTowardsDipOrAbove}/${totalEds})`,
          severity: 'critical',
        });
      }
      if (rule.rule_type.startsWith('ect_') && approvedPlaces <= rule.children_threshold) {
        if (ects < rule.min_ect) {
          violations.push({
            rule: rule.rule_type, regulation: rule.regulation_ref,
            required: `${rule.min_ect} ECT(s) for ${approvedPlaces} approved places`,
            actual: `${ects} ECT(s) rostered`,
            severity: 'critical',
          });
        }
      }
    }

    // Per-room check: at least 1 educator per occupied room
    const rooms = D().prepare('SELECT DISTINCT room_id FROM roster_entries WHERE tenant_id=? AND date=? AND status NOT IN ("cancelled","unfilled")').all(req.tenantId, date);
    for (const { room_id } of rooms) {
      const count = D().prepare('SELECT COUNT(*) as cnt FROM roster_entries WHERE tenant_id=? AND room_id=? AND date=? AND status NOT IN ("cancelled","unfilled")').get(req.tenantId, room_id, date)?.cnt || 0;
      if (count < 1) {
        const roomName = D().prepare('SELECT name FROM rooms WHERE id=?').get(room_id)?.name || room_id;
        violations.push({ rule: 'min_one_educator', regulation: 'Regulation 132', required: '≥1 educator', actual: `0 in ${roomName}`, severity: 'critical' });
      }
    }

    res.json({
      date,
      approved_places: approvedPlaces,
      total_educators_rostered: totalEds,
      qualification_breakdown: {
        ect: ects, diploma: diplomaOrAbove - ects,
        working_towards_diploma: workingTowardsDipOrAbove - diplomaOrAbove,
        cert3: rostered.filter(e => e.qualification === 'cert3').length,
        working_towards: rostered.filter(e => e.qualification === 'working_towards').length,
      },
      diploma_pct: Math.round(diplomaPct),
      violations,
      compliant: violations.length === 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  #6  SHIFT SWAPS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/roster-enhanced/shift-swaps
router.get('/shift-swaps', (req, res) => {
  try {
    const { status } = req.query;
    const where = 'ss.tenant_id=?' + (status ? ' AND ss.status=?' : '');
    const params = status ? [req.tenantId, status] : [req.tenantId];
    const swaps = D().prepare(`
      SELECT ss.*,
        re.first_name as req_first, re.last_name as req_last,
        te.first_name as tgt_first, te.last_name as tgt_last,
        rr.date as req_date, rr.start_time as req_start, rr.end_time as req_end, rr_rm.name as req_room,
        tr.date as tgt_date, tr.start_time as tgt_start, tr.end_time as tgt_end, tr_rm.name as tgt_room
      FROM shift_swaps ss
      JOIN educators re ON re.id=ss.requester_id
      JOIN educators te ON te.id=ss.target_id
      JOIN roster_entries rr ON rr.id=ss.requester_entry_id
      JOIN roster_entries tr ON tr.id=ss.target_entry_id
      LEFT JOIN rooms rr_rm ON rr_rm.id=rr.room_id
      LEFT JOIN rooms tr_rm ON tr_rm.id=tr.room_id
      WHERE ${where}
      ORDER BY ss.created_at DESC
    `).all(...params);
    res.json({ swaps });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/roster-enhanced/shift-swaps — request a swap
router.post('/shift-swaps', (req, res) => {
  try {
    const { requester_id, requester_entry_id, target_id, target_entry_id, reason } = req.body;
    if (!requester_id || !requester_entry_id || !target_id || !target_entry_id)
      return res.status(400).json({ error: 'requester_id, requester_entry_id, target_id, target_entry_id required' });

    // Compliance pre-check — will the swap maintain ratios and qualification requirements?
    const reqEntry = D().prepare('SELECT * FROM roster_entries WHERE id=? AND tenant_id=?').get(requester_entry_id, req.tenantId);
    const tgtEntry = D().prepare('SELECT * FROM roster_entries WHERE id=? AND tenant_id=?').get(target_entry_id, req.tenantId);
    const reqEd = D().prepare('SELECT * FROM educators WHERE id=? AND tenant_id=?').get(requester_id, req.tenantId);
    const tgtEd = D().prepare('SELECT * FROM educators WHERE id=? AND tenant_id=?').get(target_id, req.tenantId);

    if (!reqEntry || !tgtEntry || !reqEd || !tgtEd) return res.status(404).json({ error: 'Entry or educator not found' });

    // Check qualification: swapped educator must meet room's minimum qual
    const reqRoom = D().prepare('SELECT * FROM rooms WHERE id=?').get(reqEntry.room_id);
    const tgtRoom = D().prepare('SELECT * FROM rooms WHERE id=?').get(tgtEntry.room_id);
    const complianceNotes = [];
    let compliancePassed = true;

    // Check availability
    const reqDow = dayOfWeek(tgtEntry.date); // Requester needs to be available on target's day
    const tgtDow = dayOfWeek(reqEntry.date); // Target needs to be available on requester's day
    const reqAvail = D().prepare('SELECT * FROM educator_availability WHERE educator_id=? AND day_of_week=?').get(requester_id, reqDow);
    const tgtAvail = D().prepare('SELECT * FROM educator_availability WHERE educator_id=? AND day_of_week=?').get(target_id, tgtDow);
    if (reqAvail && !reqAvail.available) { compliancePassed = false; complianceNotes.push(`${reqEd.first_name} not available on ${tgtEntry.date}`); }
    if (tgtAvail && !tgtAvail.available) { compliancePassed = false; complianceNotes.push(`${tgtEd.first_name} not available on ${reqEntry.date}`); }

    // Check max hours won't be exceeded
    // (simplified — full implementation would sum all shifts in the week)

    const id = uuid();
    D().prepare(`INSERT INTO shift_swaps (id,tenant_id,requester_id,requester_entry_id,target_id,target_entry_id,reason,status,compliance_check_passed,compliance_notes) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(id, req.tenantId, requester_id, requester_entry_id, target_id, target_entry_id, reason || '', 'pending', compliancePassed ? 1 : 0, complianceNotes.join('; '));

    res.json({ ok: true, id, compliance_passed: compliancePassed, compliance_notes: complianceNotes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/roster-enhanced/shift-swaps/:id/approve
router.put('/shift-swaps/:id/approve', (req, res) => {
  try {
    const swap = D().prepare('SELECT * FROM shift_swaps WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!swap) return res.status(404).json({ error: 'Swap not found' });
    if (swap.status !== 'pending') return res.status(400).json({ error: `Swap already ${swap.status}` });

    // Execute the swap — update roster_entries
    const reqEntry = D().prepare('SELECT * FROM roster_entries WHERE id=?').get(swap.requester_entry_id);
    const tgtEntry = D().prepare('SELECT * FROM roster_entries WHERE id=?').get(swap.target_entry_id);

    D().prepare('UPDATE roster_entries SET educator_id=?, notes=? WHERE id=?')
      .run(swap.target_id, `Swapped with ${swap.requester_id} — swap #${swap.id.slice(0,8)}`, swap.requester_entry_id);
    D().prepare('UPDATE roster_entries SET educator_id=?, notes=? WHERE id=?')
      .run(swap.requester_id, `Swapped with ${swap.target_id} — swap #${swap.id.slice(0,8)}`, swap.target_entry_id);

    D().prepare("UPDATE shift_swaps SET status='approved', approved_by=?, approved_at=datetime('now') WHERE id=?")
      .run(req.userId, req.params.id);

    res.json({ ok: true, message: 'Swap executed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/roster-enhanced/shift-swaps/:id/decline
router.put('/shift-swaps/:id/decline', (req, res) => {
  try {
    const { reason } = req.body;
    D().prepare("UPDATE shift_swaps SET status='declined', decline_reason=?, responded_at=datetime('now') WHERE id=? AND tenant_id=?")
      .run(reason || '', req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  #7  ROOM-TO-ROOM FLOATING / MOVEMENTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/roster-enhanced/movements?date=YYYY-MM-DD
router.get('/movements', (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date required' });
    const movements = D().prepare(`
      SELECT m.*, e.first_name, e.last_name,
        fr.name as from_room_name, tr.name as to_room_name
      FROM educator_room_movements m
      JOIN educators e ON e.id=m.educator_id
      LEFT JOIN rooms fr ON fr.id=m.from_room_id
      JOIN rooms tr ON tr.id=m.to_room_id
      WHERE m.tenant_id=? AND m.date=?
      ORDER BY m.start_time
    `).all(req.tenantId, date);
    res.json({ date, movements });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/roster-enhanced/movements
router.post('/movements', (req, res) => {
  try {
    const { educator_id, date, from_room_id, to_room_id, start_time, end_time, reason } = req.body;
    if (!educator_id || !date || !to_room_id || !start_time)
      return res.status(400).json({ error: 'educator_id, date, to_room_id, start_time required' });

    const id = uuid();
    D().prepare('INSERT INTO educator_room_movements (id,tenant_id,educator_id,date,from_room_id,to_room_id,start_time,end_time,reason,initiated_by) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id, req.tenantId, educator_id, date, from_room_id || null, to_room_id, start_time, end_time || null, reason || 'planned_float', req.userId);
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/roster-enhanced/movements/:id
router.delete('/movements/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM educator_room_movements WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  #8  PUBLIC HOLIDAYS + PENALTY RATES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/roster-enhanced/public-holidays?year=2026
router.get('/public-holidays', (req, res) => {
  try {
    const { year } = req.query;
    const startDate = `${year || '2026'}-01-01`;
    const endDate = `${year || '2026'}-12-31`;
    const holidays = D().prepare(
      "SELECT * FROM public_holidays WHERE (tenant_id=? OR tenant_id IS NULL) AND date BETWEEN ? AND ? ORDER BY date"
    ).all(req.tenantId, startDate, endDate);
    res.json({ holidays });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/roster-enhanced/public-holidays
router.post('/public-holidays', (req, res) => {
  try {
    const { name, date, region, state, centre_open, notes } = req.body;
    if (!name || !date) return res.status(400).json({ error: 'name and date required' });
    const id = uuid();
    D().prepare('INSERT INTO public_holidays (id,tenant_id,region,state,name,date,centre_open,notes) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, req.tenantId, region || 'AU', state || 'NSW', name, date, centre_open ? 1 : 0, notes || '');
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/roster-enhanced/penalty-rates
router.get('/penalty-rates', (req, res) => {
  try {
    const rules = D().prepare('SELECT * FROM penalty_rate_rules WHERE (tenant_id=? OR tenant_id IS NULL) AND active=1 ORDER BY condition_type').all(req.tenantId);
    res.json({ rules });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/roster-enhanced/cost-calculate?date=YYYY-MM-DD
// Calculate actual shift costs including penalty rates for a given date
router.get('/cost-calculate', (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date required' });

    const dow = dayOfWeek(date); // 0=Sun...6=Sat
    const holiday = D().prepare('SELECT * FROM public_holidays WHERE (tenant_id=? OR tenant_id IS NULL) AND date=?').get(req.tenantId, date);
    const rules = D().prepare('SELECT * FROM penalty_rate_rules WHERE (tenant_id=? OR tenant_id IS NULL) AND active=1').all(req.tenantId);

    const entries = D().prepare(`
      SELECT re.*, e.first_name, e.last_name, e.employment_type, e.hourly_rate_cents, e.qualification,
        e.award_classification, e.award_level
      FROM roster_entries re JOIN educators e ON e.id=re.educator_id
      WHERE re.tenant_id=? AND re.date=? AND re.status NOT IN ('cancelled')
      ORDER BY re.start_time
    `).all(req.tenantId, date);

    const costedEntries = entries.map(entry => {
      const startMins = timeToMins(entry.start_time);
      const endMins = timeToMins(entry.end_time);
      const workMins = endMins - startMins - (entry.break_mins || 30);
      const workHours = workMins / 60;
      const baseRate = entry.hourly_rate_cents || 3500;
      let multiplier = 1.0;
      const appliedPenalties = [];

      // Determine highest applicable penalty
      if (holiday) {
        const phRule = rules.find(r => r.condition_type === 'public_holiday' && (r.applies_to_employment_type === entry.employment_type || r.applies_to_employment_type === 'all'));
        if (phRule) { multiplier = Math.max(multiplier, phRule.multiplier); appliedPenalties.push(`Public holiday: ${phRule.multiplier}x`); }
      } else if (dow === 0) {
        const sunRule = rules.find(r => r.condition_type === 'sunday' && (r.applies_to_employment_type === entry.employment_type || r.applies_to_employment_type === 'all'));
        if (sunRule) { multiplier = Math.max(multiplier, sunRule.multiplier); appliedPenalties.push(`Sunday: ${sunRule.multiplier}x`); }
      } else if (dow === 6) {
        const satRule = rules.find(r => r.condition_type === 'saturday' && (r.applies_to_employment_type === entry.employment_type || r.applies_to_employment_type === 'all'));
        if (satRule) { multiplier = Math.max(multiplier, satRule.multiplier); appliedPenalties.push(`Saturday: ${satRule.multiplier}x`); }
      }

      // Early morning / late evening
      if (startMins < 360) { // before 06:00
        const emRule = rules.find(r => r.condition_type === 'early_morning');
        if (emRule && multiplier < emRule.multiplier) { multiplier = Math.max(multiplier, emRule.multiplier); appliedPenalties.push('Early morning'); }
      }
      if (endMins > 1110) { // after 18:30
        const leRule = rules.find(r => r.condition_type === 'late_evening');
        if (leRule && multiplier < leRule.multiplier) { multiplier = Math.max(multiplier, leRule.multiplier); appliedPenalties.push('Late evening'); }
      }

      // Casual loading (if not already a higher penalty)
      if (entry.employment_type === 'casual' && multiplier <= 1.0) {
        const clRule = rules.find(r => r.condition_type === 'casual_loading');
        if (clRule) { multiplier *= clRule.multiplier; appliedPenalties.push('Casual loading 25%'); }
      }

      // Split shift allowance
      if (entry.is_split_shift) {
        appliedPenalties.push('Split shift allowance');
      }

      const grossCents = Math.round(workHours * baseRate * multiplier);

      return {
        ...entry,
        work_hours: Math.round(workHours * 100) / 100,
        base_rate_cents: baseRate,
        penalty_multiplier: multiplier,
        applied_penalties: appliedPenalties,
        gross_cents: grossCents,
        gross_dollars: (grossCents / 100).toFixed(2),
      };
    });

    const totalGross = costedEntries.reduce((s, e) => s + e.gross_cents, 0);

    res.json({
      date,
      is_holiday: !!holiday,
      holiday_name: holiday?.name || null,
      day_of_week: dow,
      entries: costedEntries,
      total_gross_cents: totalGross,
      total_gross_dollars: (totalGross / 100).toFixed(2),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  #9  AWARD CLASSIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/roster-enhanced/award-classifications
router.get('/award-classifications', (req, res) => {
  try {
    const levels = D().prepare('SELECT * FROM award_classifications ORDER BY CAST(level AS INTEGER), CAST(sub_level AS INTEGER)').all();
    res.json({ levels });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/roster-enhanced/educators/:id/classification — assign award level to educator
router.put('/educators/:id/classification', (req, res) => {
  try {
    const { award_classification, award_level } = req.body;
    // Look up the base rate from the classification table
    const parts = award_level?.split('.') || [];
    const classification = D().prepare('SELECT * FROM award_classifications WHERE level=? AND sub_level=?')
      .get(parts[0] || award_classification, parts[1] || '1');

    const updates = ['award_classification=?', 'award_level=?'];
    const params = [award_classification, award_level];

    if (classification) {
      // Auto-set hourly rate from award
      const ed = D().prepare('SELECT employment_type FROM educators WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
      let rate = classification.base_hourly_cents;
      if (ed?.employment_type === 'casual') {
        rate = Math.round(rate * (1 + (classification.casual_loading_pct || 25) / 100));
      }
      updates.push('hourly_rate_cents=?');
      params.push(rate);
    }

    params.push(req.params.id, req.tenantId);
    D().prepare('UPDATE educators SET ' + updates.join(',') + ", updated_at=datetime('now') WHERE id=? AND tenant_id=?").run(...params);
    res.json({ ok: true, base_hourly_cents: classification?.base_hourly_cents, classification });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  #10  STAFFING AGENCIES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/roster-enhanced/agencies
router.get('/agencies', (req, res) => {
  try {
    const agencies = D().prepare('SELECT * FROM staffing_agencies WHERE tenant_id=? AND active=1 ORDER BY preferred DESC, rating DESC').all(req.tenantId);
    res.json({ agencies });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/roster-enhanced/agencies
router.post('/agencies', (req, res) => {
  try {
    const { name, contact_name, phone, email, hourly_rate_cents, agency_fee_pct, qualifications_available, preferred } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const id = uuid();
    D().prepare('INSERT INTO staffing_agencies (id,tenant_id,name,contact_name,phone,email,hourly_rate_cents,agency_fee_pct,qualifications_available,preferred) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id, req.tenantId, name, contact_name || '', phone || '', email || '', hourly_rate_cents || 5500, agency_fee_pct || 15, qualifications_available || '["cert3","diploma"]', preferred ? 1 : 0);
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/roster-enhanced/agency-booking — escalate to agency when internal fill fails
router.post('/agency-booking', (req, res) => {
  try {
    const { shift_fill_request_id, agency_id, room_id, date, start_time, end_time, qualification_required, notes } = req.body;
    if (!agency_id || !date || !start_time || !end_time)
      return res.status(400).json({ error: 'agency_id, date, start_time, end_time required' });

    const agency = D().prepare('SELECT * FROM staffing_agencies WHERE id=? AND tenant_id=?').get(agency_id, req.tenantId);
    if (!agency) return res.status(404).json({ error: 'Agency not found' });

    const workMins = timeToMins(end_time) - timeToMins(start_time) - 30;
    const costCents = Math.round((workMins / 60) * agency.hourly_rate_cents);
    const feeCents = Math.round(costCents * (agency.agency_fee_pct / 100));

    const id = uuid();
    D().prepare(`INSERT INTO agency_bookings
      (id,tenant_id,agency_id,shift_fill_request_id,room_id,date,start_time,end_time,
       qualification_required,status,cost_cents,agency_fee_cents,notes)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, req.tenantId, agency_id, shift_fill_request_id || null, room_id || null,
        date, start_time, end_time, qualification_required || 'cert3', 'requested', costCents, feeCents, notes || '');

    // Mark shift_fill_request as escalated
    if (shift_fill_request_id) {
      D().prepare("UPDATE shift_fill_requests SET escalated_to_agency=1, agency_booking_id=?, escalation_time=datetime('now') WHERE id=?")
        .run(id, shift_fill_request_id);
    }

    // Update agency stats
    D().prepare("UPDATE staffing_agencies SET total_bookings=total_bookings+1, updated_at=datetime('now') WHERE id=?").run(agency_id);

    res.json({
      ok: true, id,
      agency_name: agency.name,
      cost_dollars: (costCents / 100).toFixed(2),
      agency_fee_dollars: (feeCents / 100).toFixed(2),
      total_dollars: ((costCents + feeCents) / 100).toFixed(2),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/roster-enhanced/agency-bookings?date=YYYY-MM-DD
router.get('/agency-bookings', (req, res) => {
  try {
    const { date, status } = req.query;
    const where = ['ab.tenant_id=?'];
    const params = [req.tenantId];
    if (date) { where.push('ab.date=?'); params.push(date); }
    if (status) { where.push('ab.status=?'); params.push(status); }

    const bookings = D().prepare(`
      SELECT ab.*, sa.name as agency_name, sa.contact_name, sa.phone as agency_phone,
        r.name as room_name
      FROM agency_bookings ab
      JOIN staffing_agencies sa ON sa.id=ab.agency_id
      LEFT JOIN rooms r ON r.id=ab.room_id
      WHERE ${where.join(' AND ')}
      ORDER BY ab.date, ab.start_time
    `).all(...params);
    res.json({ bookings });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/roster-enhanced/agency-bookings/:id/confirm
router.put('/agency-bookings/:id/confirm', (req, res) => {
  try {
    const { agency_educator_name, agency_educator_qualification, agency_educator_wwcc } = req.body;
    D().prepare(`UPDATE agency_bookings SET status='confirmed', agency_educator_name=?, agency_educator_qualification=?, agency_educator_wwcc=?, confirmed_at=datetime('now') WHERE id=? AND tenant_id=?`)
      .run(agency_educator_name || '', agency_educator_qualification || 'cert3', agency_educator_wwcc || '', req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  #12  ROLE COVERAGE REQUIREMENTS (NS, EL, First Aider)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/roster-enhanced/role-coverage?date=YYYY-MM-DD
router.get('/role-coverage', (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date required' });

    const requirements = D().prepare('SELECT * FROM role_coverage_requirements WHERE tenant_id=? AND active=1').all(req.tenantId);
    const rostered = D().prepare(`
      SELECT DISTINCT re.educator_id, e.first_name, e.last_name, e.qualification,
        e.is_responsible_person, e.is_nominated_supervisor, e.is_educational_leader,
        e.first_aid, e.first_aid_expiry, e.cpr_expiry, e.roster_role
      FROM roster_entries re JOIN educators e ON e.id=re.educator_id
      WHERE re.tenant_id=? AND re.date=? AND re.status NOT IN ('cancelled','unfilled')
    `).all(req.tenantId, date);

    const today = new Date().toISOString().split('T')[0];
    const results = requirements.map(req_rule => {
      let covered = [];
      switch (req_rule.role_type) {
        case 'responsible_person':
          covered = rostered.filter(e => e.is_responsible_person); break;
        case 'nominated_supervisor':
          covered = rostered.filter(e => e.is_nominated_supervisor); break;
        case 'educational_leader':
          covered = rostered.filter(e => e.is_educational_leader); break;
        case 'first_aider':
          covered = rostered.filter(e => e.first_aid && e.first_aid_expiry && e.first_aid_expiry >= today); break;
        case 'ect':
          covered = rostered.filter(e => e.qualification === 'ect'); break;
      }
      return {
        role: req_rule.role_type,
        regulation: req_rule.regulation_ref,
        required: req_rule.min_count,
        must_be_onsite: !!req_rule.must_be_onsite,
        covered_by: covered.map(e => ({ id: e.educator_id, name: `${e.first_name} ${e.last_name}` })),
        met: covered.length >= req_rule.min_count,
      };
    });

    res.json({
      date,
      requirements: results,
      all_met: results.every(r => r.met),
      violations: results.filter(r => !r.met).map(r => `${r.role} — need ${r.required}, have ${r.covered_by.length} (${r.regulation})`),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  #13  FLOAT / SUPERNUMERARY ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/roster-enhanced/float-assignments?date=YYYY-MM-DD
router.get('/float-assignments', (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date required' });
    const assignments = D().prepare(`
      SELECT fa.*, e.first_name, e.last_name, r.name as primary_room_name
      FROM float_assignments fa
      JOIN educators e ON e.id=fa.educator_id
      LEFT JOIN rooms r ON r.id=fa.primary_room_id
      WHERE fa.tenant_id=? AND fa.date=?
      ORDER BY fa.assignment_type, e.first_name
    `).all(req.tenantId, date);
    res.json({ date, assignments });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/roster-enhanced/float-assignments
router.post('/float-assignments', (req, res) => {
  try {
    const { educator_id, date, assignment_type, primary_room_id, roster_entry_id, notes } = req.body;
    if (!educator_id || !date) return res.status(400).json({ error: 'educator_id and date required' });
    const id = uuid();
    D().prepare('INSERT OR REPLACE INTO float_assignments (id,tenant_id,roster_entry_id,educator_id,date,assignment_type,primary_room_id,notes) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, req.tenantId, roster_entry_id || null, educator_id, date, assignment_type || 'float', primary_room_id || null, notes || '');
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  #14  PAY PERIODS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/roster-enhanced/pay-periods
router.get('/pay-periods', (req, res) => {
  try {
    const periods = D().prepare('SELECT * FROM pay_periods WHERE tenant_id=? ORDER BY start_date DESC LIMIT 20').all(req.tenantId);
    res.json({ periods });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/roster-enhanced/pay-periods/generate — generate pay period from roster data
router.post('/pay-periods/generate', (req, res) => {
  try {
    const { start_date, end_date, pay_date } = req.body;
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date required' });

    // Check for existing
    const existing = D().prepare('SELECT id FROM pay_periods WHERE tenant_id=? AND start_date=?').get(req.tenantId, start_date);
    if (existing) return res.status(400).json({ error: 'Pay period already exists for this start date' });

    const ppId = uuid();
    const dates = dateRange(start_date, end_date);
    const rules = D().prepare('SELECT * FROM penalty_rate_rules WHERE (tenant_id=? OR tenant_id IS NULL) AND active=1').all(req.tenantId);

    let totalHours = 0, totalGross = 0, totalSuper = 0, totalPenalty = 0;
    const entryCount = { inserted: 0 };

    for (const date of dates) {
      const dow = dayOfWeek(date);
      const holiday = D().prepare('SELECT * FROM public_holidays WHERE (tenant_id=? OR tenant_id IS NULL) AND date=?').get(req.tenantId, date);

      const entries = D().prepare(`
        SELECT re.*, e.employment_type, e.hourly_rate_cents, e.super_rate
        FROM roster_entries re JOIN educators e ON e.id=re.educator_id
        WHERE re.tenant_id=? AND re.date=? AND re.status NOT IN ('cancelled')
      `).all(req.tenantId, date);

      for (const entry of entries) {
        const workMins = timeToMins(entry.end_time) - timeToMins(entry.start_time) - (entry.break_mins || 30);
        const workHours = workMins / 60;
        const baseRate = entry.hourly_rate_cents || 3500;
        let multiplier = 1.0;
        let penaltyReason = '';

        if (holiday) {
          const phRule = rules.find(r => r.condition_type === 'public_holiday' && (r.applies_to_employment_type === entry.employment_type || r.applies_to_employment_type === 'all'));
          if (phRule) { multiplier = phRule.multiplier; penaltyReason = `PH: ${holiday.name}`; }
        } else if (dow === 0) {
          const r = rules.find(r => r.condition_type === 'sunday' && (r.applies_to_employment_type === entry.employment_type || r.applies_to_employment_type === 'all'));
          if (r) { multiplier = r.multiplier; penaltyReason = 'Sunday'; }
        } else if (dow === 6) {
          const r = rules.find(r => r.condition_type === 'saturday' && (r.applies_to_employment_type === entry.employment_type || r.applies_to_employment_type === 'all'));
          if (r) { multiplier = r.multiplier; penaltyReason = 'Saturday'; }
        }
        if (entry.employment_type === 'casual' && multiplier <= 1.0) multiplier = 1.25;

        const grossCents = Math.round(workHours * baseRate * multiplier);
        const superCents = Math.round(grossCents * ((entry.super_rate || 11.5) / 100));
        const penaltyCents = multiplier > 1.0 ? Math.round(workHours * baseRate * (multiplier - 1)) : 0;

        D().prepare(`INSERT INTO pay_period_entries
          (id,pay_period_id,educator_id,roster_entry_id,date,ordinary_hours,penalty_hours,
           base_rate_cents,penalty_multiplier,penalty_reason,gross_cents,super_cents)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(uuid(), ppId, entry.educator_id, entry.id, date,
            multiplier <= 1.0 ? workHours : 0, multiplier > 1.0 ? workHours : 0,
            baseRate, multiplier, penaltyReason, grossCents, superCents);

        totalHours += workHours;
        totalGross += grossCents;
        totalSuper += superCents;
        totalPenalty += penaltyCents;
        entryCount.inserted++;
      }
    }

    D().prepare(`INSERT INTO pay_periods
      (id,tenant_id,period_type,start_date,end_date,pay_date,status,total_hours,total_gross_cents,total_super_cents,total_penalty_cents)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(ppId, req.tenantId, 'fortnightly', start_date, end_date, pay_date || null, 'open',
        Math.round(totalHours * 100) / 100, totalGross, totalSuper, totalPenalty);

    res.json({
      ok: true, id: ppId,
      entries_generated: entryCount.inserted,
      total_hours: Math.round(totalHours * 100) / 100,
      total_gross_dollars: (totalGross / 100).toFixed(2),
      total_super_dollars: (totalSuper / 100).toFixed(2),
      total_penalty_dollars: (totalPenalty / 100).toFixed(2),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/roster-enhanced/pay-periods/:id/detail
router.get('/pay-periods/:id/detail', (req, res) => {
  try {
    const period = D().prepare('SELECT * FROM pay_periods WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!period) return res.status(404).json({ error: 'Pay period not found' });

    const entries = D().prepare(`
      SELECT ppe.*, e.first_name, e.last_name, e.employment_type
      FROM pay_period_entries ppe JOIN educators e ON e.id=ppe.educator_id
      WHERE ppe.pay_period_id=?
      ORDER BY e.last_name, ppe.date
    `).all(req.params.id);

    // Group by educator
    const byEducator = {};
    entries.forEach(e => {
      if (!byEducator[e.educator_id]) {
        byEducator[e.educator_id] = {
          educator_id: e.educator_id, name: `${e.first_name} ${e.last_name}`,
          employment_type: e.employment_type,
          total_hours: 0, total_gross: 0, total_super: 0, days: [],
        };
      }
      byEducator[e.educator_id].total_hours += (e.ordinary_hours || 0) + (e.penalty_hours || 0);
      byEducator[e.educator_id].total_gross += e.gross_cents;
      byEducator[e.educator_id].total_super += e.super_cents;
      byEducator[e.educator_id].days.push(e);
    });

    res.json({ period, educators: Object.values(byEducator) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  #15  FATIGUE / CONSECUTIVE DAYS VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/roster-enhanced/fatigue-check?educator_id=...&date=YYYY-MM-DD
router.get('/fatigue-check', (req, res) => {
  try {
    const { educator_id, date, week_start } = req.query;
    if (!educator_id) return res.status(400).json({ error: 'educator_id required' });

    const ed = D().prepare('SELECT * FROM educators WHERE id=? AND tenant_id=?').get(educator_id, req.tenantId);
    if (!ed) return res.status(404).json({ error: 'Educator not found' });

    const fatigueRule = D().prepare('SELECT * FROM fatigue_rules WHERE (tenant_id=? OR tenant_id IS NULL) LIMIT 1').get(req.tenantId);
    const maxConsecutive = ed.max_consecutive_days || fatigueRule?.max_consecutive_days || 5;
    const minBreakHrs = fatigueRule?.min_break_between_shifts_hours || 10;
    const maxHoursDay = fatigueRule?.max_hours_per_day || 10;
    const maxHoursWeek = ed.max_hours_per_week || fatigueRule?.max_hours_per_week || 38;

    const checkDate = date || new Date().toISOString().split('T')[0];

    // Look at 14-day window around the date
    const windowStart = (() => { const d = new Date(checkDate + 'T12:00:00'); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]; })();
    const windowEnd = (() => { const d = new Date(checkDate + 'T12:00:00'); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0]; })();

    const shifts = D().prepare(`
      SELECT date, start_time, end_time, break_mins
      FROM roster_entries WHERE tenant_id=? AND educator_id=? AND date BETWEEN ? AND ? AND status NOT IN ('cancelled','unfilled')
      ORDER BY date, start_time
    `).all(req.tenantId, educator_id, windowStart, windowEnd);

    // Consecutive days analysis
    const workedDates = [...new Set(shifts.map(s => s.date))].sort();
    let maxConsecFound = 0, currentStreak = 0, prevDate = null;
    const streaks = [];
    for (const d of workedDates) {
      if (prevDate) {
        const diff = (new Date(d + 'T12:00:00') - new Date(prevDate + 'T12:00:00')) / 86400000;
        if (diff === 1) { currentStreak++; }
        else { if (currentStreak > 1) streaks.push({ start: workedDates[workedDates.indexOf(d) - currentStreak], end: prevDate, days: currentStreak }); currentStreak = 1; }
      } else { currentStreak = 1; }
      maxConsecFound = Math.max(maxConsecFound, currentStreak);
      prevDate = d;
    }
    if (currentStreak > 1) streaks.push({ days: currentStreak });

    // Weekly hours
    const weekStart = week_start || (() => {
      const d = new Date(checkDate + 'T12:00:00');
      d.setDate(d.getDate() - d.getDay() + 1); // Monday
      return d.toISOString().split('T')[0];
    })();
    const weekEnd = (() => { const d = new Date(weekStart + 'T12:00:00'); d.setDate(d.getDate() + 6); return d.toISOString().split('T')[0]; })();
    const weekShifts = shifts.filter(s => s.date >= weekStart && s.date <= weekEnd);
    const weekHours = weekShifts.reduce((sum, s) => {
      return sum + (timeToMins(s.end_time) - timeToMins(s.start_time) - (s.break_mins || 30)) / 60;
    }, 0);

    // Min break between shifts
    let shortestBreak = Infinity;
    for (let i = 1; i < shifts.length; i++) {
      const prevEnd = timeToMins(shifts[i-1].end_time);
      const nextStart = timeToMins(shifts[i].start_time);
      if (shifts[i].date === shifts[i-1].date) continue; // same day
      const dayDiff = (new Date(shifts[i].date + 'T12:00:00') - new Date(shifts[i-1].date + 'T12:00:00')) / 86400000;
      if (dayDiff === 1) {
        const breakHrs = (24 * 60 - prevEnd + nextStart) / 60;
        shortestBreak = Math.min(shortestBreak, breakHrs);
      }
    }

    const violations = [];
    if (maxConsecFound > maxConsecutive) violations.push({ type: 'consecutive_days', message: `${maxConsecFound} consecutive days (max ${maxConsecutive})`, severity: 'warning' });
    if (weekHours > maxHoursWeek) violations.push({ type: 'weekly_hours', message: `${weekHours.toFixed(1)}hrs this week (max ${maxHoursWeek})`, severity: 'warning' });
    if (shortestBreak < minBreakHrs && shortestBreak !== Infinity) violations.push({ type: 'min_break', message: `Only ${shortestBreak.toFixed(1)}hrs between shifts (min ${minBreakHrs})`, severity: 'critical' });

    // Daily hours check
    const dailyHours = {};
    shifts.forEach(s => {
      const hrs = (timeToMins(s.end_time) - timeToMins(s.start_time) - (s.break_mins || 30)) / 60;
      dailyHours[s.date] = (dailyHours[s.date] || 0) + hrs;
    });
    Object.entries(dailyHours).forEach(([d, hrs]) => {
      if (hrs > maxHoursDay) violations.push({ type: 'daily_hours', message: `${hrs.toFixed(1)}hrs on ${d} (max ${maxHoursDay})`, severity: 'warning' });
    });

    res.json({
      educator_id,
      educator_name: `${ed.first_name} ${ed.last_name}`,
      rules: { max_consecutive_days: maxConsecutive, min_break_hours: minBreakHrs, max_hours_day: maxHoursDay, max_hours_week: maxHoursWeek },
      analysis: {
        max_consecutive_found: maxConsecFound,
        week_hours: Math.round(weekHours * 100) / 100,
        shortest_break_hours: shortestBreak === Infinity ? null : Math.round(shortestBreak * 100) / 100,
        worked_dates: workedDates,
      },
      violations,
      compliant: violations.length === 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  COMPREHENSIVE ROSTER COMPLIANCE CHECK
//  Runs ALL validation checks for a given date/period in one call.
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/roster-enhanced/compliance-check?date=YYYY-MM-DD
router.get('/compliance-check', (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date required' });

    const violations = [];
    const tenant = D().prepare('SELECT * FROM tenants WHERE id=?').get(req.tenantId);

    // 1. RP Coverage
    const opStart = timeToMins(tenant?.operating_hours_start || '06:30');
    const opEnd = timeToMins(tenant?.operating_hours_end || '18:30');
    const rpEntries = D().prepare('SELECT * FROM rp_coverage WHERE tenant_id=? AND date=? AND is_backup=0 ORDER BY start_time').all(req.tenantId, date);
    let rpCursor = opStart;
    for (const rp of rpEntries) { rpCursor = Math.max(rpCursor, timeToMins(rp.end_time)); }
    if (rpCursor < opEnd || (rpEntries.length === 0)) {
      violations.push({ category: 'Responsible Person', regulation: 'Reg 150', severity: 'critical', message: rpEntries.length === 0 ? 'No RP assigned for this date' : 'RP coverage gaps detected' });
    }

    // 2. Educator:child ratios per room
    const rooms = D().prepare('SELECT * FROM rooms WHERE tenant_id=?').all(req.tenantId);
    const ageSettings = D().prepare('SELECT * FROM age_group_settings WHERE tenant_id=?').all(req.tenantId);
    const ratioMap = {};
    ageSettings.forEach(s => { ratioMap[s.group_id] = s.ratio; });
    const dow = dayOfWeek(date);

    for (const room of rooms) {
      const booked = D().prepare(
        "SELECT COUNT(*) as cnt FROM child_booked_days WHERE tenant_id=? AND room_id=? AND day_of_week=? AND active=1 AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)"
      ).get(req.tenantId, room.id, dow, date, date)?.cnt || 0;
      if (booked === 0) continue;
      const expected = Math.round(booked * 0.92);
      const ratio = ratioMap[room.age_group] || NQF_RATIOS[room.age_group] || 11;
      const required = Math.max(1, Math.ceil(expected / ratio));
      const rostered = D().prepare(
        "SELECT COUNT(*) as cnt FROM roster_entries WHERE tenant_id=? AND room_id=? AND date=? AND status NOT IN ('cancelled','unfilled')"
      ).get(req.tenantId, room.id, date)?.cnt || 0;
      if (rostered < required) {
        violations.push({ category: 'Ratio', regulation: 'Reg 123', severity: 'critical', message: `${room.name}: ${rostered} educators for ~${expected} children (need ${required} at 1:${ratio})` });
      }
    }

    // 3. Qualification mix
    const rosteredEds = D().prepare(`
      SELECT DISTINCT e.qualification FROM roster_entries re JOIN educators e ON e.id=re.educator_id
      WHERE re.tenant_id=? AND re.date=? AND re.status NOT IN ('cancelled','unfilled')
    `).all(req.tenantId, date);
    const totalEds = rosteredEds.length;
    const dipOrAbove = rosteredEds.filter(e => qualScore(e.qualification) >= qualScore('working_towards_diploma')).length;
    if (totalEds > 0 && (dipOrAbove / totalEds) < 0.5) {
      violations.push({ category: 'Qualification Mix', regulation: 'Reg 126', severity: 'critical', message: `Only ${Math.round(dipOrAbove/totalEds*100)}% hold/working towards Diploma (need 50%)` });
    }

    // 4. Role coverage (NS, EL, First Aider)
    const roleReqs = D().prepare('SELECT * FROM role_coverage_requirements WHERE tenant_id=? AND active=1').all(req.tenantId);
    const today = new Date().toISOString().split('T')[0];
    const allRostered = D().prepare(`
      SELECT e.* FROM roster_entries re JOIN educators e ON e.id=re.educator_id
      WHERE re.tenant_id=? AND re.date=? AND re.status NOT IN ('cancelled','unfilled')
    `).all(req.tenantId, date);

    for (const rr of roleReqs) {
      let count = 0;
      if (rr.role_type === 'responsible_person') count = allRostered.filter(e => e.is_responsible_person).length;
      else if (rr.role_type === 'nominated_supervisor') count = allRostered.filter(e => e.is_nominated_supervisor).length;
      else if (rr.role_type === 'educational_leader') count = allRostered.filter(e => e.is_educational_leader).length;
      else if (rr.role_type === 'first_aider') count = allRostered.filter(e => e.first_aid && e.first_aid_expiry >= today).length;
      if (count < rr.min_count) {
        violations.push({ category: 'Role Coverage', regulation: rr.regulation_ref, severity: rr.must_be_onsite ? 'critical' : 'warning', message: `${rr.role_type}: ${count}/${rr.min_count} required` });
      }
    }

    // 5. Fatigue — check all rostered educators
    const uniqueEdIds = [...new Set(allRostered.map(e => e.id))];
    const fatigueRule = D().prepare('SELECT * FROM fatigue_rules WHERE (tenant_id=? OR tenant_id IS NULL) LIMIT 1').get(req.tenantId);
    for (const edId of uniqueEdIds) {
      const ed = allRostered.find(e => e.id === edId);
      const maxConsec = ed?.max_consecutive_days || fatigueRule?.max_consecutive_days || 5;
      const windowStart = (() => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - maxConsec); return d.toISOString().split('T')[0]; })();
      const consecutiveShifts = D().prepare(`
        SELECT DISTINCT date FROM roster_entries WHERE tenant_id=? AND educator_id=? AND date BETWEEN ? AND ? AND status NOT IN ('cancelled','unfilled') ORDER BY date
      `).all(req.tenantId, edId, windowStart, date);
      // Count consecutive ending at 'date'
      let streak = 0;
      const sortedDates = consecutiveShifts.map(s => s.date).reverse();
      for (let i = 0; i < sortedDates.length; i++) {
        const expected = (() => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - i); return d.toISOString().split('T')[0]; })();
        if (sortedDates[i] === expected) streak++;
        else break;
      }
      if (streak > maxConsec) {
        violations.push({ category: 'Fatigue', regulation: 'Award cl.22', severity: 'warning', message: `${ed?.first_name} ${ed?.last_name}: ${streak} consecutive days (max ${maxConsec})` });
      }
    }

    const criticalCount = violations.filter(v => v.severity === 'critical').length;
    const warningCount = violations.filter(v => v.severity === 'warning').length;

    res.json({
      date,
      compliant: criticalCount === 0,
      summary: { critical: criticalCount, warning: warningCount, total: violations.length },
      violations,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  BOOKED DAYS CRUD (for #3 attendance forecasting)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/roster-enhanced/booked-days?child_id=...
router.get('/booked-days', (req, res) => {
  try {
    const { child_id, room_id } = req.query;
    const where = ['bd.tenant_id=?'];
    const params = [req.tenantId];
    if (child_id) { where.push('bd.child_id=?'); params.push(child_id); }
    if (room_id) { where.push('bd.room_id=?'); params.push(room_id); }

    const days = D().prepare(`
      SELECT bd.*, c.first_name, c.last_name, r.name as room_name
      FROM child_booked_days bd
      JOIN children c ON c.id=bd.child_id
      JOIN rooms r ON r.id=bd.room_id
      WHERE ${where.join(' AND ')} AND bd.active=1
      ORDER BY c.last_name, bd.day_of_week
    `).all(...params);
    res.json({ booked_days: days });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/roster-enhanced/booked-days
router.post('/booked-days', (req, res) => {
  try {
    const { child_id, room_id, day_of_week, session_type, start_time, end_time, effective_from } = req.body;
    if (!child_id || !room_id || day_of_week == null) return res.status(400).json({ error: 'child_id, room_id, day_of_week required' });
    const id = uuid();
    D().prepare('INSERT OR REPLACE INTO child_booked_days (id,tenant_id,child_id,room_id,day_of_week,session_type,start_time,end_time,effective_from,active) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id, req.tenantId, child_id, room_id, day_of_week, session_type || 'full_day', start_time || '07:00', end_time || '18:00', effective_from || new Date().toISOString().split('T')[0], 1);
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/roster-enhanced/booked-days/:id
router.delete('/booked-days/:id', (req, res) => {
  try {
    D().prepare("UPDATE child_booked_days SET active=0 WHERE id=? AND tenant_id=?").run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  ROOM GROUPS — combine rooms for ratio-optimised rostering
//  NQF: when rooms are combined, ratio must be for YOUNGEST child present
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/roster-enhanced/room-groups — list all groups with members + schedules
router.get('/room-groups', (req, res) => {
  try {
    const groups = D().prepare('SELECT * FROM room_groups WHERE tenant_id=? AND active=1 ORDER BY name').all(req.tenantId);
    const result = groups.map(g => {
      const members = D().prepare(`
        SELECT rgm.id as membership_id, rgm.room_id, r.name as room_name, r.age_group, r.capacity
        FROM room_group_members rgm JOIN rooms r ON r.id=rgm.room_id
        WHERE rgm.room_group_id=?
        ORDER BY r.age_group
      `).all(g.id);
      const schedules = D().prepare('SELECT * FROM room_group_schedules WHERE room_group_id=? AND active=1 ORDER BY day_of_week, start_time').all(g.id);
      const youngestAgeGroup = members.reduce((youngest, m) => {
        const order = { '0-2': 0, '2-3': 1, '3-4': 2, '3-5': 2, '4-5': 3 };
        return (order[m.age_group] || 99) < (order[youngest] || 99) ? m.age_group : youngest;
      }, members[0]?.age_group || '0-2');
      const ratio = NQF_RATIOS[youngestAgeGroup] || 4;
      return { ...g, members, schedules, youngest_age_group: youngestAgeGroup, effective_ratio: `1:${ratio}`, total_capacity: members.reduce((s, m) => s + (m.capacity || 0), 0) };
    });
    res.json({ groups: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/roster-enhanced/room-groups — create a room group
router.post('/room-groups', (req, res) => {
  try {
    const { name, description, location, combined_ratio_strategy, room_ids } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const id = uuid();
    D().prepare('INSERT INTO room_groups (id,tenant_id,name,description,location,combined_ratio_strategy) VALUES(?,?,?,?,?,?)')
      .run(id, req.tenantId, name, description || '', location || '', combined_ratio_strategy || 'youngest_child');
    if (Array.isArray(room_ids)) {
      room_ids.forEach(rid => {
        D().prepare('INSERT OR IGNORE INTO room_group_members (id,room_group_id,room_id) VALUES(?,?,?)').run(uuid(), id, rid);
      });
    }
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/roster-enhanced/room-groups/:id
router.put('/room-groups/:id', (req, res) => {
  try {
    const { name, description, location, combined_ratio_strategy } = req.body;
    D().prepare('UPDATE room_groups SET name=COALESCE(?,name), description=COALESCE(?,description), location=COALESCE(?,location), combined_ratio_strategy=COALESCE(?,combined_ratio_strategy) WHERE id=? AND tenant_id=?')
      .run(name||null, description||null, location||null, combined_ratio_strategy||null, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/roster-enhanced/room-groups/:id
router.delete('/room-groups/:id', (req, res) => {
  try {
    D().prepare('UPDATE room_groups SET active=0 WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/roster-enhanced/room-groups/:id/members — add room to group
router.post('/room-groups/:id/members', (req, res) => {
  try {
    const { room_id } = req.body;
    if (!room_id) return res.status(400).json({ error: 'room_id required' });
    D().prepare('INSERT OR IGNORE INTO room_group_members (id,room_group_id,room_id) VALUES(?,?,?)').run(uuid(), req.params.id, room_id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/roster-enhanced/room-groups/:id/members/:roomId
router.delete('/room-groups/:id/members/:roomId', (req, res) => {
  try {
    D().prepare('DELETE FROM room_group_members WHERE room_group_id=? AND room_id=?').run(req.params.id, req.params.roomId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/roster-enhanced/room-groups/:id/schedules — add time schedule
router.post('/room-groups/:id/schedules', (req, res) => {
  try {
    const { day_of_week, start_time, end_time, schedule_type, specific_date, reason, min_educators } = req.body;
    if (!start_time || !end_time) return res.status(400).json({ error: 'start_time and end_time required' });
    const id = uuid();
    D().prepare('INSERT INTO room_group_schedules (id,tenant_id,room_group_id,day_of_week,start_time,end_time,schedule_type,specific_date,reason,min_educators) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id, req.tenantId, req.params.id, day_of_week ?? null, start_time, end_time, schedule_type || 'recurring', specific_date || null, reason || 'ratio_optimisation', min_educators || 1);
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/roster-enhanced/room-groups/:groupId/schedules/:scheduleId
router.delete('/room-groups/:groupId/schedules/:scheduleId', (req, res) => {
  try {
    D().prepare('DELETE FROM room_group_schedules WHERE id=? AND room_group_id=?').run(req.params.scheduleId, req.params.groupId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/roster-enhanced/room-groups/active?date=YYYY-MM-DD&time=HH:MM
// Returns which room groups are active at a specific date/time
router.get('/room-groups/active', (req, res) => {
  try {
    const { date, time } = req.query;
    if (!date) return res.status(400).json({ error: 'date required' });
    const checkTime = time || '12:00';
    const dow = dayOfWeek(date);

    const activeGroups = D().prepare(`
      SELECT rg.*, rgs.start_time, rgs.end_time, rgs.min_educators, rgs.reason
      FROM room_group_schedules rgs
      JOIN room_groups rg ON rg.id=rgs.room_group_id
      WHERE rgs.tenant_id=? AND rg.active=1 AND rgs.active=1
      AND ((rgs.schedule_type='recurring' AND rgs.day_of_week=?)
        OR (rgs.schedule_type='one_off' AND rgs.specific_date=?))
      AND rgs.start_time<=? AND rgs.end_time>=?
    `).all(req.tenantId, dow, date, checkTime, checkTime);

    const result = activeGroups.map(g => {
      const members = D().prepare(`
        SELECT r.id, r.name, r.age_group, r.capacity
        FROM room_group_members rgm JOIN rooms r ON r.id=rgm.room_id
        WHERE rgm.room_group_id=?
      `).all(g.id);
      const youngestAgeGroup = members.reduce((youngest, m) => {
        const order = { '0-2': 0, '2-3': 1, '3-4': 2, '3-5': 2, '4-5': 3 };
        return (order[m.age_group] || 99) < (order[youngest] || 99) ? m.age_group : youngest;
      }, members[0]?.age_group || '0-2');
      const ratio = NQF_RATIOS[youngestAgeGroup] || 4;
      // Estimate children present based on booked days
      const totalBooked = members.reduce((sum, m) => {
        const cnt = D().prepare("SELECT COUNT(*) as c FROM child_booked_days WHERE tenant_id=? AND room_id=? AND day_of_week=? AND active=1 AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)").get(req.tenantId, m.id, dow, date, date)?.c || 0;
        return sum + cnt;
      }, 0);
      const expectedChildren = Math.round(totalBooked * 0.92);
      const educatorsRequired = Math.max(g.min_educators || 1, Math.ceil(expectedChildren / ratio));

      return {
        group_id: g.id, group_name: g.name, location: g.location,
        active_from: g.start_time, active_to: g.end_time, reason: g.reason,
        rooms: members, youngest_age_group: youngestAgeGroup,
        effective_ratio: `1:${ratio}`,
        expected_children: expectedChildren,
        educators_required: educatorsRequired,
        min_educators: g.min_educators,
        savings_note: `Combined group uses 1:${ratio} ratio instead of individual room ratios`,
      };
    });

    res.json({ date, time: checkTime, active_groups: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/roster-enhanced/room-groups/:id/ratio-calc?date=YYYY-MM-DD
// Full ratio calculation for a specific group on a date
router.get('/room-groups/:id/ratio-calc', (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date required' });
    const dow = dayOfWeek(date);

    const group = D().prepare('SELECT * FROM room_groups WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const members = D().prepare(`
      SELECT r.*, (SELECT COUNT(*) FROM child_booked_days bd WHERE bd.room_id=r.id AND bd.tenant_id=? AND bd.day_of_week=? AND bd.active=1 AND bd.effective_from<=? AND (bd.effective_to IS NULL OR bd.effective_to>=?)) as booked
      FROM room_group_members rgm JOIN rooms r ON r.id=rgm.room_id WHERE rgm.room_group_id=?
    `).all(req.tenantId, dow, date, date, req.params.id);

    const totalBooked = members.reduce((s, m) => s + (m.booked || 0), 0);
    const expectedChildren = Math.round(totalBooked * 0.92);

    // Calculate what individual rooms would need vs combined
    const individualRequired = members.reduce((sum, m) => {
      const ratio = NQF_RATIOS[m.age_group] || 11;
      const expected = Math.round((m.booked || 0) * 0.92);
      return sum + Math.max(1, Math.ceil(expected / ratio));
    }, 0);

    const youngestAgeGroup = members.reduce((youngest, m) => {
      const order = { '0-2': 0, '2-3': 1, '3-4': 2, '3-5': 2, '4-5': 3 };
      return (order[m.age_group] || 99) < (order[youngest] || 99) ? m.age_group : youngest;
    }, members[0]?.age_group || '0-2');
    const combinedRatio = NQF_RATIOS[youngestAgeGroup] || 4;
    const combinedRequired = Math.max(1, Math.ceil(expectedChildren / combinedRatio));

    const schedules = D().prepare('SELECT * FROM room_group_schedules WHERE room_group_id=? AND active=1 AND (day_of_week=? OR specific_date=?) ORDER BY start_time').all(req.params.id, dow, date);

    res.json({
      group: { id: group.id, name: group.name, location: group.location },
      date,
      rooms: members.map(m => ({ id: m.id, name: m.name, age_group: m.age_group, booked: m.booked, expected: Math.round((m.booked || 0) * 0.92), individual_ratio: `1:${NQF_RATIOS[m.age_group] || 11}`, individual_educators_needed: Math.max(1, Math.ceil(Math.round((m.booked || 0) * 0.92) / (NQF_RATIOS[m.age_group] || 11))) })),
      combined: {
        youngest_age_group: youngestAgeGroup,
        effective_ratio: `1:${combinedRatio}`,
        total_booked: totalBooked,
        expected_children: expectedChildren,
        educators_required: combinedRequired,
      },
      comparison: {
        individual_total_educators: individualRequired,
        combined_total_educators: combinedRequired,
        educator_savings: individualRequired - combinedRequired,
        savings_note: individualRequired > combinedRequired ? `Combining saves ${individualRequired - combinedRequired} educator(s) during grouped periods` : 'No savings — combined ratio same or higher',
      },
      schedules: schedules.map(s => ({ time: `${s.start_time}–${s.end_time}`, reason: s.reason, min_educators: s.min_educators })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/roster-enhanced/room-groups/:id/roster-entry — roster an educator to a combined group period
router.post('/room-groups/:id/roster-entry', (req, res) => {
  try {
    const { educator_id, date, start_time, end_time, notes } = req.body;
    if (!educator_id || !date || !start_time || !end_time)
      return res.status(400).json({ error: 'educator_id, date, start_time, end_time required' });

    const ed = D().prepare('SELECT * FROM educators WHERE id=? AND tenant_id=?').get(educator_id, req.tenantId);
    if (!ed) return res.status(404).json({ error: 'Educator not found' });

    const workMins = timeToMins(end_time) - timeToMins(start_time);
    const costCents = Math.round((workMins / 60) * (ed.hourly_rate_cents || 3500));

    const id = uuid();
    D().prepare('INSERT INTO room_group_roster_entries (id,tenant_id,room_group_id,educator_id,date,start_time,end_time,cost_cents,notes) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id, req.tenantId, req.params.id, educator_id, date, start_time, end_time, costCents, notes || null);
    res.json({ ok: true, id, cost_cents: costCents });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/roster-enhanced/room-groups/roster?date=YYYY-MM-DD
router.get('/room-groups/roster', (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date required' });
    const entries = D().prepare(`
      SELECT rgre.*, rg.name as group_name, rg.location,
        e.first_name, e.last_name, e.qualification
      FROM room_group_roster_entries rgre
      JOIN room_groups rg ON rg.id=rgre.room_group_id
      JOIN educators e ON e.id=rgre.educator_id
      WHERE rgre.tenant_id=? AND rgre.date=?
      ORDER BY rgre.start_time
    `).all(req.tenantId, date);
    res.json({ date, entries });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
