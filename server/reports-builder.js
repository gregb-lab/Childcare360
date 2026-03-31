/**
 * server/reports-builder.js — v2.18.0
 *   /api/reports-builder/run        — run a custom report
 *   /api/reports-builder/saved      — saved reports CRUD
 *   /api/reports-builder/emergency  — emergency contacts by room
 *   /api/risk-assessments           — excursion risk assessments
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const rb = Router();
rb.use(requireAuth, requireTenant);

// ─────────────────────────────────────────────────────────────────────────────
// REPORT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

const REPORT_TYPES = {
  attendance: {
    label: 'Attendance Report',
    description: 'Daily/weekly attendance by room or child',
    run: (tenantId, config) => {
      const { from, to, room_id } = config;
      const today = new Date().toISOString().split('T')[0];
      const fromDate = from || new Date(Date.now() - 30*86400000).toISOString().split('T')[0];
      const toDate   = to   || today;

      const where = ['a.tenant_id=?', 'a.date BETWEEN ? AND ?'];
      const vals  = [tenantId, fromDate, toDate];
      if (room_id) { where.push('c.room_id=?'); vals.push(room_id); }

      const rows = D().prepare(`
        SELECT a.date, c.first_name, c.last_name, r.name as room,
               a.sign_in, a.sign_out, a.hours,
               CASE WHEN a.absent=1 THEN 'Absent' WHEN a.sign_in IS NOT NULL THEN 'Present' ELSE 'No record' END as status
        FROM attendance_sessions a
        JOIN children c ON c.id=a.child_id
        LEFT JOIN rooms r ON r.id=c.room_id
        WHERE ${where.join(' AND ')}
        ORDER BY a.date DESC, r.name, c.last_name
      `).all(...vals);

      const summary = {
        total_sessions: rows.length,
        present: rows.filter(r => r.status === 'Present').length,
        absent: rows.filter(r => r.status === 'Absent').length,
        avg_hours: rows.filter(r => r.hours).reduce((s,r) => s+r.hours, 0) / (rows.filter(r=>r.hours).length || 1),
      };
      return { rows, summary, columns: ['Date','Child','Room','Status','Sign In','Sign Out','Hours'] };
    }
  },

  educator_hours: {
    label: 'Educator Hours Report',
    description: 'Clock records and hours worked per educator',
    run: (tenantId, config) => {
      const { from, to } = config;
      const fromDate = from || new Date(Date.now() - 14*86400000).toISOString().split('T')[0];
      const toDate   = to   || new Date().toISOString().split('T')[0];

      const rows = D().prepare('
        SELECT e.first_name, e.last_name, e.qualification, e.employment_type,
               cr.clock_date as date, cr.clock_in, cr.clock_out,
               ROUND(COALESCE(cr.hours_worked, 0), 2) as net_hours,
               cr.total_break_minutes as break_mins
        FROM clock_records cr
        JOIN educators e ON e.id=cr.educator_id
        WHERE cr.tenant_id=? AND cr.clock_date BETWEEN ? AND ? AND cr.clock_out IS NOT NULL
        ORDER BY cr.clock_date DESC, e.last_name
      ').all(tenantId, fromDate, toDate);

      const byEducator = {};
      rows.forEach(r => {
        const key = `${r.first_name} ${r.last_name}`;
        if (!byEducator[key]) byEducator[key] = { name: key, shifts: 0, total_hours: 0 };
        byEducator[key].shifts++;
        byEducator[key].total_hours = Math.round((byEducator[key].total_hours + (r.net_hours||0)) * 100) / 100;
      });

      return {
        rows,
        summary: Object.values(byEducator),
        columns: ['Date','Educator','Qualification','Clock In','Clock Out','Break','Net Hours'],
      };
    }
  },

  enrolment: {
    label: 'Enrolment Report',
    description: 'Current enrolments by room, age group, and status',
    run: (tenantId, config) => {
      const rows = D().prepare('
        SELECT c.first_name, c.last_name,
               date(c.dob) as dob,
               CAST((julianday(\'now\') - julianday(c.dob)) / 365.25 AS INTEGER) as age_years,
               r.name as room, r.age_group,
               c.start_date, c.medical_conditions, c.allergies,
               c.crn_number
        FROM children c
        LEFT JOIN rooms r ON r.id=c.room_id
        WHERE c.tenant_id=? AND c.active=1
        ORDER BY r.name, c.last_name
      ').all(tenantId);

      const byRoom = {};
      rows.forEach(r => {
        (byRoom[r.room||'Unassigned'] = byRoom[r.room||'Unassigned'] || []).push(r);
      });

      return {
        rows,
        summary: Object.entries(byRoom).map(([room, children]) => ({ room, count: children.length })),
        columns: ['Child','DOB','Age','Room','Age Group','Start Date','Medical','Allergies'],
      };
    }
  },

  compliance: {
    label: 'Compliance & Certification Report',
    description: 'Educator qualifications, certifications, and expiry dates',
    run: (tenantId, config) => {
      const today = new Date().toISOString().split('T')[0];
      const in90  = new Date(Date.now() + 90*86400000).toISOString().split('T')[0];

      const rows = D().prepare('
        SELECT e.first_name, e.last_name, e.qualification, e.employment_type,
               e.first_aid_expiry, e.cpr_expiry, e.wwcc_expiry, e.wwcc_number,
               e.anaphylaxis_expiry, e.status,
               CASE WHEN e.first_aid_expiry < ? THEN \'EXPIRED\'
                    WHEN e.first_aid_expiry < ? THEN \'EXPIRING SOON\' ELSE \'OK\' END as first_aid_status,
               CASE WHEN e.wwcc_expiry < ? THEN \'EXPIRED\'
                    WHEN e.wwcc_expiry < ? THEN \'EXPIRING SOON\' ELSE \'OK\' END as wwcc_status
        FROM educators e
        WHERE e.tenant_id=? AND e.status=\'active\'
        ORDER BY e.last_name
      ').all(today, in90, today, in90, tenantId);

      const summary = {
        total: rows.length,
        expiring_soon: rows.filter(r => r.first_aid_status === 'EXPIRING SOON' || r.wwcc_status === 'EXPIRING SOON').length,
        expired: rows.filter(r => r.first_aid_status === 'EXPIRED' || r.wwcc_status === 'EXPIRED').length,
      };

      return {
        rows,
        summary,
        columns: ['Educator','Qualification','Employment','First Aid','CPR','WWCC','Anaphylaxis','Status'],
      };
    }
  },

  debt: {
    label: 'Outstanding Debt Report',
    description: 'Overdue accounts and payment history',
    run: (tenantId, config) => {
      const rows = D().prepare('
        SELECT c.first_name, c.last_name, r.name as room,
               d.amount_cents, d.amount_paid_cents,
               d.amount_cents - d.amount_paid_cents as outstanding_cents,
               d.due_date, d.status,
               CAST(julianday(\'now\') - julianday(d.due_date) AS INTEGER) as days_overdue,
               d.reminder_1_sent, d.reminder_2_sent, d.reminder_3_sent
        FROM debt_records d
        JOIN children c ON c.id=d.child_id
        LEFT JOIN rooms r ON r.id=c.room_id
        WHERE d.tenant_id=? AND d.status != \'paid\'
        ORDER BY days_overdue DESC
      ').all(tenantId);

      const summary = {
        total_accounts: rows.length,
        total_outstanding: rows.reduce((s,r) => s + r.outstanding_cents, 0) / 100,
        overdue_30: rows.filter(r => r.days_overdue > 30).length,
        overdue_90: rows.filter(r => r.days_overdue > 90).length,
      };

      return {
        rows: rows.map(r => ({...r, amount: r.amount_cents/100, paid: r.amount_paid_cents/100, outstanding: r.outstanding_cents/100})),
        summary,
        columns: ['Child','Room','Total','Paid','Outstanding','Due Date','Days Overdue','Status'],
      };
    }
  },

  occupancy: {
    label: 'Occupancy Report',
    description: 'Room capacity, enrolment, and occupancy trends',
    run: (tenantId, config) => {
      const rooms = D().prepare('
        SELECT r.id, r.name, r.age_group, r.capacity,
          COUNT(c.id) as enrolled,
          ROUND(COUNT(c.id)*100.0/NULLIF(r.capacity,0),1) as occupancy_pct
        FROM rooms r
        LEFT JOIN children c ON c.room_id=r.id AND c.tenant_id=r.tenant_id AND c.active=1
        WHERE r.tenant_id=?
        GROUP BY r.id
        ORDER BY r.name
      ').all(tenantId);

      const waitlist = D().prepare('
        SELECT preferred_room, COUNT(*) as waiting
        FROM waitlist WHERE tenant_id=? AND status=\'waiting\'
        GROUP BY preferred_room
      ').all(tenantId);

      const waitMap = {};
      waitlist.forEach(w => { waitMap[w.preferred_room] = w.waiting; });

      const rows = rooms.map(r => ({
        ...r,
        available: r.capacity - r.enrolled,
        waitlist: waitMap[r.id] || 0,
      }));

      return {
        rows,
        summary: {
          total_capacity: rooms.reduce((s,r) => s+r.capacity, 0),
          total_enrolled: rooms.reduce((s,r) => s+r.enrolled, 0),
          avg_occupancy: Math.round(rooms.reduce((s,r) => s+(r.occupancy_pct||0), 0) / (rooms.length||1)),
        },
        columns: ['Room','Age Group','Capacity','Enrolled','Available','Occupancy %','Waitlist'],
      };
    }
  },
};

rb.get('/types', (req, res) => {
  res.json({
    types: Object.entries(REPORT_TYPES).map(([id, r]) => ({ id, label: r.label, description: r.description }))
  });
});

rb.post('/run', (req, res) => {
  try {
    const { report_type, config = {} } = req.body;
    if (!REPORT_TYPES[report_type]) return res.status(400).json({ error: 'Unknown report type' });
    const result = REPORT_TYPES[report_type].run(req.tenantId, config);
    res.json({ ok: true, report_type, ...result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

rb.get('/saved', (req, res) => {
  try {
    const reports = D().prepare('SELECT * FROM saved_reports WHERE tenant_id=? ORDER BY created_at DESC').all(req.tenantId);
    res.json({ reports: reports.map(r => ({ ...r, config: JSON.parse(r.config||'{}') })) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

rb.post('/saved', (req, res) => {
  try {
    const { name, report_type, config } = req.body;
    if (!name || !report_type) return res.status(400).json({ error: 'name and report_type required' });
    const id = uuid();
    D().prepare('INSERT INTO saved_reports (id,tenant_id,name,report_type,config,created_by) VALUES (?,?,?,?,?,?)')
      .run(id, req.tenantId, name, report_type, JSON.stringify(config||{}), req.userId||null);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

rb.delete('/saved/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM saved_reports WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Emergency contacts fast-view ──────────────────────────────────────────────
rb.get('/emergency', (req, res) => {
  try {
    const { room_id } = req.query;
    const where = ['c.tenant_id=?', 'c.active=1'];
    const vals  = [req.tenantId];
    if (room_id) { where.push('c.room_id=?'); vals.push(room_id); }

    const children = D().prepare(`
      SELECT c.id, c.first_name, c.last_name, c.room_id,
             r.name as room_name,
             c.emergency_contact_name, c.emergency_contact_phone, c.emergency_contact_relationship,
             c.emergency_contact2_name, c.emergency_contact2_phone,
             c.medical_conditions, c.allergies, c.medicare_number,
             c.doctor_name, c.doctor_phone
      FROM children c
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE ${where.join(' AND ')}
      ORDER BY r.name, c.last_name
    `).all(...vals);

    const rooms = D().prepare('SELECT * FROM rooms WHERE tenant_id=? ORDER BY name').all(req.tenantId);

    res.json({ children, rooms });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── Report schedules ──────────────────────────────────────────────────────────
rb.get('/schedules', (req, res) => {
  try {
    const schedules = D().prepare(
      'SELECT * FROM report_schedules WHERE tenant_id=? ORDER BY created_at DESC'
    ).all(req.tenantId);
    res.json({ schedules: schedules.map(s => ({ ...s, config: JSON.parse(s.config||'{}'), recipients: JSON.parse(s.recipients||'[]') })) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

rb.post('/schedules', (req, res) => {
  try {
    const { name, report_type, config, frequency, day_of_week, time, recipients } = req.body;
    if (!name || !report_type) return res.status(400).json({ error: 'name and report_type required' });
    
    // Calculate next run date
    const now = new Date();
    const dayMap = { weekly: 7, fortnightly: 14, monthly: 30 };
    const nextRun = new Date(now.getTime() + (dayMap[frequency]||7)*86400000).toISOString().split('T')[0];
    
    const id = uuid();
    D().prepare('
      INSERT INTO report_schedules (id,tenant_id,name,report_type,config,frequency,day_of_week,time,recipients,next_run,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ').run(id, req.tenantId, name, report_type, JSON.stringify(config||{}),
           frequency||'weekly', day_of_week||1, time||'08:00',
           JSON.stringify(recipients||[]), nextRun, req.userId||null);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

rb.put('/schedules/:id', (req, res) => {
  try {
    const { enabled, name, frequency, time, recipients } = req.body;
    const updates = [];
    const vals = [];
    if (enabled !== undefined) { updates.push('enabled=?'); vals.push(enabled ? 1 : 0); }
    if (name) { updates.push('name=?'); vals.push(name); }
    if (frequency) { updates.push('frequency=?'); vals.push(frequency); }
    if (time) { updates.push('time=?'); vals.push(time); }
    if (recipients) { updates.push('recipients=?'); vals.push(JSON.stringify(recipients)); }
    if (!updates.length) return res.json({ ok: true });
    D().prepare((() => { const _s = 'UPDATE report_schedules SET ' + updates.join(',') + ' WHERE id=? AND tenant_id=?'; return _s; })())
      .run(...vals, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

rb.delete('/schedules/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM report_schedules WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export { rb as reportsBuilderRouter };

// ─────────────────────────────────────────────────────────────────────────────
// RISK ASSESSMENTS
// ─────────────────────────────────────────────────────────────────────────────

const ra = Router();
ra.use(requireAuth, requireTenant);

const HAZARD_LIBRARY = [
  { category: 'Transport', hazard: 'Vehicle accident during transport', likelihood: 'unlikely', consequence: 'major', controls: 'Use accredited transport provider, seatbelts, head counts before/after' },
  { category: 'Transport', hazard: 'Child separated from group', likelihood: 'possible', consequence: 'major', controls: 'Buddy system, roll calls every 15 min, photo ID cards for children' },
  { category: 'Environment', hazard: 'Sun exposure / heat stress', likelihood: 'likely', consequence: 'minor', controls: 'Sunscreen, hats, shade breaks, water carried, avoid peak UV hours' },
  { category: 'Environment', hazard: 'Slips, trips, falls on uneven terrain', likelihood: 'likely', consequence: 'minor', controls: 'Close supervision, appropriate footwear, assess site before activity' },
  { category: 'Environment', hazard: 'Water hazard (creeks, pools, puddles)', likelihood: 'possible', consequence: 'major', controls: 'Maintain 1:1 supervision near water, fence off where possible' },
  { category: 'Health', hazard: 'Allergic reaction / anaphylaxis', likelihood: 'unlikely', consequence: 'major', controls: 'Carry EpiPen, check child health plans, no sharing of food' },
  { category: 'Health', hazard: 'Child becomes unwell / injury', likelihood: 'possible', consequence: 'moderate', controls: 'First aid kit, trained first aider present, parent contact numbers' },
  { category: 'Behaviour', hazard: 'Child absconding from group', likelihood: 'unlikely', consequence: 'major', controls: 'Head counts, wristbands with centre contact, high-vis vests' },
  { category: 'Behaviour', hazard: 'Conflict between children', likelihood: 'possible', consequence: 'minor', controls: 'Sufficient adult supervision, clear behaviour expectations briefed' },
  { category: 'Crowd', hazard: 'Lost in crowded public space', likelihood: 'unlikely', consequence: 'major', controls: 'Centre contact info on wristbands, buddy system, meeting point identified' },
];

ra.get('/library', (req, res) => res.json({ hazards: HAZARD_LIBRARY }));

ra.get('/', (req, res) => {
  try {
    const assessments = D().prepare('
      SELECT ra.*, e.title as excursion_title, e.excursion_date, e.destination
      FROM risk_assessments ra
      LEFT JOIN excursions e ON e.id=ra.excursion_id
      WHERE ra.tenant_id=?
      ORDER BY ra.assessment_date DESC
    ').all(req.tenantId);

    res.json({ assessments: assessments.map(a => ({...a, hazards: JSON.parse(a.hazards||'[]')})) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

ra.get('/:id', (req, res) => {
  try {
    const assessment = D().prepare('
      SELECT ra.*, e.title as excursion_title, e.destination, e.excursion_date,
             e.transport_method, e.max_children
      FROM risk_assessments ra
      LEFT JOIN excursions e ON e.id=ra.excursion_id
      WHERE ra.id=? AND ra.tenant_id=?
    ').get(req.params.id, req.tenantId);
    if (!assessment) return res.status(404).json({ error: 'Not found' });
    res.json({ assessment: {...assessment, hazards: JSON.parse(assessment.hazards||'[]')} });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

ra.post('/', (req, res) => {
  try {
    const { excursion_id, title, assessment_date, location, assessor,
            hazards, emergency_plan, medical_kit_checked, ratios_confirmed,
            transport_checked, parent_permissions_complete, notes } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    // Auto-calculate overall risk level
    const riskLevels = { low: 0, medium: 1, high: 2, extreme: 3 };
    const riskMatrix = { unlikely: { minor: 'low', moderate: 'low', major: 'medium' },
                         possible:  { minor: 'low', moderate: 'medium', major: 'high' },
                         likely:    { minor: 'medium', moderate: 'high', major: 'extreme' } };

    let maxRisk = 'low';
    (hazards||[]).forEach(h => {
      const risk = riskMatrix[h.likelihood]?.[h.consequence] || 'low';
      if (riskLevels[risk] > riskLevels[maxRisk]) maxRisk = risk;
    });

    const id = uuid();
    D().prepare('
      INSERT INTO risk_assessments
        (id,tenant_id,excursion_id,title,assessment_date,location,assessor,
         hazards,overall_risk_level,emergency_plan,
         medical_kit_checked,ratios_confirmed,transport_checked,parent_permissions_complete,notes,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,\'draft\')
    ').run(id, req.tenantId, excursion_id||null, title,
           assessment_date||new Date().toISOString().split('T')[0],
           location||null, assessor||null,
           JSON.stringify(hazards||[]), maxRisk,
           emergency_plan||null,
           medical_kit_checked?1:0, ratios_confirmed?1:0,
           transport_checked?1:0, parent_permissions_complete?1:0, notes||null);

    res.json({ id, ok: true, overall_risk_level: maxRisk });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

ra.put('/:id', (req, res) => {
  try {
    const { hazards, status, emergency_plan, medical_kit_checked, ratios_confirmed,
            transport_checked, parent_permissions_complete, reviewed_by, notes } = req.body;

    const updates = ["updated_at=datetime('now')"];
    const vals = [];

    if (hazards !== undefined) {
      const riskMatrix = { unlikely: { minor:'low', moderate:'low', major:'medium' },
                           possible:  { minor:'low', moderate:'medium', major:'high' },
                           likely:    { minor:'medium', moderate:'high', major:'extreme' } };
      const riskLevels = { low:0, medium:1, high:2, extreme:3 };
      let maxRisk = 'low';
      hazards.forEach(h => {
        const r = riskMatrix[h.likelihood]?.[h.consequence] || 'low';
        if (riskLevels[r] > riskLevels[maxRisk]) maxRisk = r;
      });
      updates.push('hazards=?', 'overall_risk_level=?');
      vals.push(JSON.stringify(hazards), maxRisk);
    }
    if (status) { updates.push('status=?'); vals.push(status); }
    if (emergency_plan !== undefined) { updates.push('emergency_plan=?'); vals.push(emergency_plan); }
    if (medical_kit_checked !== undefined) { updates.push('medical_kit_checked=?'); vals.push(medical_kit_checked?1:0); }
    if (ratios_confirmed !== undefined) { updates.push('ratios_confirmed=?'); vals.push(ratios_confirmed?1:0); }
    if (transport_checked !== undefined) { updates.push('transport_checked=?'); vals.push(transport_checked?1:0); }
    if (parent_permissions_complete !== undefined) { updates.push('parent_permissions_complete=?'); vals.push(parent_permissions_complete?1:0); }
    if (reviewed_by) { updates.push('reviewed_by=?','reviewed_at=datetime(\'now\')'); vals.push(reviewed_by); }
    if (notes !== undefined) { updates.push('notes=?'); vals.push(notes); }

    D().prepare((() => { const _s = 'UPDATE risk_assessments SET ' + updates.join(',') + ' WHERE id=? AND tenant_id=?'; return _s; })())
      .run(...vals, req.params.id, req.tenantId);

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export { ra as riskAssessmentRouter };
