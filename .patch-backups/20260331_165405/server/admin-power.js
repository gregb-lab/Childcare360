/**
 * server/admin-power.js — v2.10.0
 * Admin Power Pack:
 *   /api/admin/recruitment   — Job postings, applications, pipeline
 *   /api/admin/appraisals    — Staff appraisals with NQS-linked templates
 *   /api/admin/occupancy     — Occupancy snapshots + 90-day forecast
 *   /api/admin/debt          — Debt tracking, reminders, payment plans
 *   /api/admin/casual        — Casual booking requests + confirmation
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

const pg = req => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(200, parseInt(req.query.limit) || 50);
  return { limit, offset: (page - 1) * limit, page };
};

// ─────────────────────────────────────────────────────────────────────────────
// RECRUITMENT TRACKER
// ─────────────────────────────────────────────────────────────────────────────

r.get('/recruitment/jobs', (req, res) => {
  try {
    const { status } = req.query;
    const where = ['j.tenant_id=?'];
    const vals  = [req.tenantId];
    if (status) { where.push('j.status=?'); vals.push(status); }

    const jobs = D().prepare(`
      SELECT j.*,
        COUNT(a.id) as total_apps,
        SUM(CASE WHEN a.status='new' THEN 1 ELSE 0 END) as new_apps,
        SUM(CASE WHEN a.status='shortlisted' THEN 1 ELSE 0 END) as shortlisted,
        SUM(CASE WHEN a.status='interview' THEN 1 ELSE 0 END) as interview_count
      FROM job_postings j
      LEFT JOIN job_applications a ON a.job_id=j.id
      WHERE ${where.join(' AND ')}
      GROUP BY j.id
      ORDER BY j.created_at DESC
    `).all(...vals);

    // Pipeline summary
    const pipeline = D().prepare(`
      SELECT a.status, COUNT(*) as n
      FROM job_applications a
      JOIN job_postings j ON j.id=a.job_id
      WHERE j.tenant_id=?
      GROUP BY a.status
    `).all(req.tenantId);

    res.json({ jobs, pipeline: pipeline.reduce((m,r) => ({...m,[r.status]:r.n}), {}) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/recruitment/jobs', (req, res) => {
  try {
    const { title, description, requirements, employment_type, hours_per_week,
            salary_min, salary_max, location, room_preference, closing_date, created_by } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const id = uuid();
    D().prepare(`
      INSERT INTO job_postings
        (id,tenant_id,title,description,requirements,employment_type,hours_per_week,
         salary_min,salary_max,location,room_preference,closing_date,status,created_by,posted_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'active',?,date('now','localtime'))
    `).run(id, req.tenantId, title, description||null, requirements||null,
           employment_type||'permanent', hours_per_week||null,
           salary_min||null, salary_max||null, location||null, room_preference||null,
           closing_date||null, created_by||null);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/recruitment/jobs/:id', (req, res) => {
  try {
    const { status, title, description, closing_date } = req.body;
    D().prepare(`
      UPDATE job_postings SET
        status=COALESCE(?,status), title=COALESCE(?,title),
        description=COALESCE(?,description), closing_date=COALESCE(?,closing_date),
        updated_at=datetime('now')
      WHERE id=? AND tenant_id=?
    `).run(status||null, title||null, description||null, closing_date||null,
           req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.get('/recruitment/applications', (req, res) => {
  try {
    const { job_id, status } = req.query;
    const { limit, offset } = pg(req);
    const where = ['a.tenant_id=?'];
    const vals  = [req.tenantId];
    if (job_id) { where.push('a.job_id=?'); vals.push(job_id); }
    if (status) { where.push('a.status=?'); vals.push(status); }

    const apps = D().prepare(`
      SELECT a.*, j.title as job_title
      FROM job_applications a
      JOIN job_postings j ON j.id=a.job_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...vals, limit, offset);

    res.json({ applications: apps.map(a => ({...a, referees: JSON.parse(a.referees||'[]')})) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/recruitment/applications', (req, res) => {
  try {
    const { job_id, applicant_name, applicant_email, applicant_phone,
            qualification, years_experience, resume_url, cover_letter,
            wwcc_number, wwcc_state, source } = req.body;
    if (!job_id || !applicant_name) return res.status(400).json({ error: 'job_id and applicant_name required' });

    const id = uuid();
    D().prepare(`
      INSERT INTO job_applications
        (id,tenant_id,job_id,applicant_name,applicant_email,applicant_phone,
         qualification,years_experience,resume_url,cover_letter,wwcc_number,wwcc_state,source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, req.tenantId, job_id, applicant_name, applicant_email||null,
           applicant_phone||null, qualification||null, years_experience||0,
           resume_url||null, cover_letter||null, wwcc_number||null, wwcc_state||null, source||'direct');

    // Update job application count
    D().prepare('UPDATE job_postings SET applications_count=applications_count+1 WHERE id=?')
      .run(job_id);

    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/recruitment/applications/:id', (req, res) => {
  try {
    const { status, rating, interview_date, interview_notes, offer_date, offer_accepted, rejection_reason } = req.body;
    D().prepare(`
      UPDATE job_applications SET
        status=COALESCE(?,status), rating=COALESCE(?,rating),
        interview_date=COALESCE(?,interview_date), interview_notes=COALESCE(?,interview_notes),
        offer_date=COALESCE(?,offer_date), offer_accepted=COALESCE(?,offer_accepted),
        rejection_reason=COALESCE(?,rejection_reason), updated_at=datetime('now')
      WHERE id=? AND tenant_id=?
    `).run(status||null, rating||null, interview_date||null, interview_notes||null,
           offer_date||null, offer_accepted!=null?offer_accepted:null,
           rejection_reason||null, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// STAFF APPRAISALS
// ─────────────────────────────────────────────────────────────────────────────

// Default NQS-aligned template sections
const DEFAULT_TEMPLATE_SECTIONS = [
  { id: 's1', title: 'Quality Area 4 — Staffing Arrangements', criteria: [
    { id: 'c1', label: 'Maintains appropriate educator-to-child ratios at all times' },
    { id: 'c2', label: 'Holds required qualifications and keeps them current (First Aid, WWCC, CPR, Anaphylaxis)' },
    { id: 'c3', label: 'Punctuality and reliability — shift attendance record' },
  ]},
  { id: 's2', title: 'Quality Area 1 — Educational Program', criteria: [
    { id: 'c4', label: 'Plans and implements curriculum based on each child\'s interests and development' },
    { id: 'c5', label: 'Documents learning with quality observations and learning stories' },
    { id: 'c6', label: 'Demonstrates understanding of EYLF/learning frameworks' },
  ]},
  { id: 's3', title: 'Quality Area 5 — Relationships with Children', criteria: [
    { id: 'c7', label: 'Builds warm, responsive relationships with children' },
    { id: 'c8', label: 'Uses positive guidance strategies consistently' },
    { id: 'c9', label: 'Actively engages children in learning experiences' },
  ]},
  { id: 's4', title: 'Quality Area 6 — Collaborative Partnerships', criteria: [
    { id: 'c10', label: 'Communicates effectively with families' },
    { id: 'c11', label: 'Participates constructively in team meetings and planning' },
    { id: 'c12', label: 'Supports colleagues and contributes to a positive team culture' },
  ]},
  { id: 's5', title: 'Professional Development & Goals', criteria: [
    { id: 'c13', label: 'Actively pursues professional development opportunities' },
    { id: 'c14', label: 'Reflects on practice and implements improvements' },
    { id: 'c15', label: 'Progress towards agreed goals from last review' },
  ]},
];

r.get('/appraisals/templates', (req, res) => {
  try {
    const templates = D().prepare(
      'SELECT * FROM appraisal_templates WHERE tenant_id=? ORDER BY is_default DESC, name'
    ).all(req.tenantId);

    // If no templates, return default
    if (!templates.length) {
      return res.json({ templates: [{
        id: 'default', name: 'NQS-Aligned Performance Review', is_default: 1,
        sections: DEFAULT_TEMPLATE_SECTIONS
      }]});
    }

    res.json({ templates: templates.map(t => ({...t, sections: JSON.parse(t.sections||'[]')})) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.get('/appraisals', (req, res) => {
  try {
    const { status, educator_id } = req.query;
    const { limit, offset } = pg(req);
    const where = ['a.tenant_id=?'];
    const vals  = [req.tenantId];
    if (status) { where.push('a.status=?'); vals.push(status); }
    if (educator_id) { where.push('a.educator_id=?'); vals.push(educator_id); }

    const appraisals = D().prepare(`
      SELECT a.*, e.first_name, e.last_name, e.qualification,
             u.email as reviewer_email
      FROM appraisals a
      JOIN educators e ON e.id=a.educator_id
      LEFT JOIN users u ON u.id=a.reviewer_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.due_date DESC, a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...vals, limit, offset);

    res.json({
      appraisals: appraisals.map(a => ({
        ...a,
        educator_self_assessment: JSON.parse(a.educator_self_assessment||'{}'),
        reviewer_assessment: JSON.parse(a.reviewer_assessment||'{}'),
        agreed_goals: JSON.parse(a.agreed_goals||'[]'),
      }))
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/appraisals', (req, res) => {
  try {
    const { educator_id, template_id, reviewer_id, review_period_start,
            review_period_end, due_date } = req.body;
    if (!educator_id) return res.status(400).json({ error: 'educator_id required' });

    const id = uuid();
    D().prepare(`
      INSERT INTO appraisals
        (id,tenant_id,educator_id,template_id,reviewer_id,
         review_period_start,review_period_end,due_date,status)
      VALUES (?,?,?,?,?,?,?,?,'pending')
    `).run(id, req.tenantId, educator_id, template_id||null, reviewer_id||null,
           review_period_start||null, review_period_end||null, due_date||null);

    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/appraisals/:id', (req, res) => {
  try {
    const { status, overall_rating, educator_self_assessment, reviewer_assessment,
            agreed_goals, strengths, development_areas, educator_comments,
            reviewer_comments, signed_by_educator, signed_by_reviewer } = req.body;

    const now = new Date().toISOString();
    const bothSigned = signed_by_educator === 1 && signed_by_reviewer === 1;

    D().prepare(`
      UPDATE appraisals SET
        status=COALESCE(?,status),
        overall_rating=COALESCE(?,overall_rating),
        educator_self_assessment=COALESCE(?,educator_self_assessment),
        reviewer_assessment=COALESCE(?,reviewer_assessment),
        agreed_goals=COALESCE(?,agreed_goals),
        strengths=COALESCE(?,strengths),
        development_areas=COALESCE(?,development_areas),
        educator_comments=COALESCE(?,educator_comments),
        reviewer_comments=COALESCE(?,reviewer_comments),
        signed_by_educator=COALESCE(?,signed_by_educator),
        signed_by_reviewer=COALESCE(?,signed_by_reviewer),
        signed_at=CASE WHEN ? THEN ? ELSE signed_at END,
        updated_at=datetime('now')
      WHERE id=? AND tenant_id=?
    `).run(
      status||null, overall_rating||null,
      educator_self_assessment ? JSON.stringify(educator_self_assessment) : null,
      reviewer_assessment ? JSON.stringify(reviewer_assessment) : null,
      agreed_goals ? JSON.stringify(agreed_goals) : null,
      strengths||null, development_areas||null,
      educator_comments||null, reviewer_comments||null,
      signed_by_educator!=null?signed_by_educator:null,
      signed_by_reviewer!=null?signed_by_reviewer:null,
      bothSigned?1:0, bothSigned?now:null,
      req.params.id, req.tenantId
    );

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// OCCUPANCY FORECASTING
// ─────────────────────────────────────────────────────────────────────────────

// Take today's occupancy snapshot
r.post('/occupancy/snapshot', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Get all rooms with current enrolled children
    const rooms = D().prepare('SELECT * FROM rooms WHERE tenant_id=?').all(req.tenantId);

    const inserted = D().transaction(() => {
      let count = 0;
      for (const room of rooms) {
        const enrolled = D().prepare(
          'SELECT COUNT(*) as n FROM children WHERE tenant_id=? AND room_id=? AND active=1'
        ).get(req.tenantId, room.id)?.n || 0;

        const attending = D().prepare(
          `SELECT COUNT(*) as n FROM attendance_sessions
           WHERE tenant_id=? AND date=? AND absent=0 AND sign_in IS NOT NULL
             AND child_id IN (SELECT id FROM children WHERE room_id=?)`
        ).get(req.tenantId, today, room.id)?.n || 0;

        const capacity = room.capacity || 0;
        const occPct = capacity > 0 ? (enrolled / capacity) * 100 : 0;

        D().prepare(`
          INSERT OR REPLACE INTO occupancy_snapshots
            (id,tenant_id,snapshot_date,room_id,enrolled,capacity,attending,occupancy_pct)
          VALUES (?,?,?,?,?,?,?,?)
        `).run(uuid(), req.tenantId, today, room.id, enrolled, capacity, attending, occPct);
        count++;
      }
      return count;
    })();

    res.json({ ok: true, rooms: inserted, date: today });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get occupancy history + 90-day forecast
r.get('/occupancy', (req, res) => {
  try {
    const weeks = parseInt(req.query.weeks) || 12;
    const since = new Date(Date.now() - weeks * 7 * 86400000).toISOString().split('T')[0];

    // Historical by room
    const history = D().prepare(`
      SELECT os.snapshot_date, os.room_id, r.name as room_name, r.age_group,
             os.enrolled, os.capacity, os.attending, os.occupancy_pct
      FROM occupancy_snapshots os
      JOIN rooms r ON r.id=os.room_id
      WHERE os.tenant_id=? AND os.snapshot_date >= ?
      ORDER BY os.snapshot_date DESC, r.name
    `).all(req.tenantId, since);

    // Whole-centre summary by week
    const weekly = D().prepare(`
      SELECT
        strftime('%Y-W%W', snapshot_date) as week,
        MIN(snapshot_date) as week_start,
        ROUND(AVG(occupancy_pct),1) as avg_occupancy,
        SUM(enrolled) as total_enrolled,
        SUM(capacity) as total_capacity,
        SUM(attending) as total_attending
      FROM occupancy_snapshots
      WHERE tenant_id=? AND snapshot_date >= ?
      GROUP BY week
      ORDER BY week DESC
    `).all(req.tenantId, since);

    // Current state per room
    const current = D().prepare(`
      SELECT r.id, r.name, r.age_group, r.capacity,
        COUNT(CASE WHEN c.active=1 THEN 1 END) as enrolled,
        ROUND(COUNT(CASE WHEN c.active=1 THEN 1 END) * 100.0 / NULLIF(r.capacity,0),1) as occupancy_pct,
        r.capacity - COUNT(CASE WHEN c.active=1 THEN 1 END) as available_places
      FROM rooms r
      LEFT JOIN children c ON c.room_id=r.id AND c.tenant_id=r.tenant_id
      WHERE r.tenant_id=?
      GROUP BY r.id
    `).all(req.tenantId);

    // Simple 12-week forecast using linear trend from last 8 weeks
    const recentWeeks = weekly.slice(0, 8).reverse();
    let forecast = [];
    if (recentWeeks.length >= 4) {
      const n = recentWeeks.length;
      const avgOcc = recentWeeks.reduce((s,w) => s + w.avg_occupancy, 0) / n;
      const trend = recentWeeks.length > 1
        ? (recentWeeks[n-1].avg_occupancy - recentWeeks[0].avg_occupancy) / n
        : 0;

      // Cap trend at +/-2% per week (seasonal childcare patterns are slow-moving)
      const cappedTrend = Math.max(-2, Math.min(2, trend));

      for (let i = 1; i <= 12; i++) {
        const forecastDate = new Date(Date.now() + i * 7 * 86400000);
        forecast.push({
          week: i,
          week_start: forecastDate.toISOString().split('T')[0],
          forecast_occupancy: Math.min(100, Math.max(0, avgOcc + cappedTrend * i)),
          type: 'forecast',
        });
      }
    }

    // Revenue estimate (using average daily rate × enrolled × attendance rate)
    const totals = D().prepare(`
      SELECT
        SUM(enrolled) as enrolled, SUM(capacity) as capacity,
        AVG(occupancy_pct) as avg_occ
      FROM occupancy_snapshots
      WHERE tenant_id=? AND snapshot_date >= date('now','-7 days')
    `).get(req.tenantId);

    res.json({ current, history, weekly, forecast, totals });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// DEBT MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

r.get('/debt', (req, res) => {
  try {
    const { status } = req.query;
    const { limit, offset } = pg(req);
    const where = ['d.tenant_id=?'];
    const vals  = [req.tenantId];
    if (status) { where.push('d.status=?'); vals.push(status); }
    else { where.push("d.status != 'paid'"); }

    const debts = D().prepare(`
      SELECT d.*, c.first_name, c.last_name, c.room_id,
             r.name as room_name,
             CAST((julianday('now') - julianday(d.due_date)) AS INTEGER) as actual_days_overdue
      FROM debt_records d
      JOIN children c ON c.id=d.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE ${where.join(' AND ')}
      ORDER BY actual_days_overdue DESC, d.amount_cents DESC
      LIMIT ? OFFSET ?
    `).all(...vals, limit, offset);

    const summary = D().prepare(`
      SELECT
        COUNT(*) as total_accounts,
        SUM(amount_cents - amount_paid_cents) as outstanding_cents,
        SUM(CASE WHEN actual_days_overdue > 30 THEN (amount_cents-amount_paid_cents) ELSE 0 END) as overdue_30_cents,
        SUM(CASE WHEN actual_days_overdue > 60 THEN (amount_cents-amount_paid_cents) ELSE 0 END) as overdue_60_cents,
        SUM(CASE WHEN actual_days_overdue > 90 THEN (amount_cents-amount_paid_cents) ELSE 0 END) as overdue_90_cents
      FROM (
        SELECT d.*, CAST((julianday('now')-julianday(d.due_date)) AS INTEGER) as actual_days_overdue
        FROM debt_records d WHERE d.tenant_id=? AND d.status != 'paid'
      )
    `).get(req.tenantId);

    res.json({
      debts: debts.map(d => ({
        ...d,
        outstanding: (d.amount_cents - d.amount_paid_cents) / 100,
        total: d.amount_cents / 100,
        paid: d.amount_paid_cents / 100,
      })),
      summary: {
        ...summary,
        outstanding: (summary.outstanding_cents||0) / 100,
        overdue_30: (summary.overdue_30_cents||0) / 100,
        overdue_60: (summary.overdue_60_cents||0) / 100,
        overdue_90: (summary.overdue_90_cents||0) / 100,
      }
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/debt', (req, res) => {
  try {
    const { child_id, invoice_id, amount_cents, due_date, notes } = req.body;
    if (!child_id || !amount_cents) return res.status(400).json({ error: 'child_id and amount_cents required' });
    const id = uuid();
    D().prepare(`
      INSERT INTO debt_records (id,tenant_id,child_id,invoice_id,amount_cents,due_date,notes)
      VALUES (?,?,?,?,?,?,?)
    `).run(id, req.tenantId, child_id, invoice_id||null, amount_cents, due_date||null, notes||null);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/debt/:id', (req, res) => {
  try {
    const { status, amount_paid_cents, payment_plan, payment_plan_amount_cents,
            payment_plan_frequency, notes, reminder_sent } = req.body;

    const updates = ['updated_at=datetime(\'now\')'];
    const vals = [];

    if (status)         { updates.push('status=?'); vals.push(status); }
    if (amount_paid_cents != null) {
      updates.push('amount_paid_cents=?'); vals.push(amount_paid_cents);
      // Auto-mark paid if fully paid
      const debt = D().prepare('SELECT amount_cents FROM debt_records WHERE id=? AND tenant_id=?')
        .get(req.params.id, req.tenantId);
      if (debt && amount_paid_cents >= debt.amount_cents) {
        updates.push("status='paid'");
      }
    }
    if (payment_plan != null) { updates.push('payment_plan=?'); vals.push(payment_plan?1:0); }
    if (payment_plan_amount_cents) { updates.push('payment_plan_amount_cents=?'); vals.push(payment_plan_amount_cents); }
    if (payment_plan_frequency) { updates.push('payment_plan_frequency=?'); vals.push(payment_plan_frequency); }
    if (notes) { updates.push('notes=?'); vals.push(notes); }
    if (reminder_sent === 1) { updates.push('reminder_1_sent=datetime(\'now\')'); }
    if (reminder_sent === 2) { updates.push('reminder_2_sent=datetime(\'now\')'); }
    if (reminder_sent === 3) { updates.push('reminder_3_sent=datetime(\'now\')'); }

    D().prepare('UPDATE debt_records SET ' + updates.join(',') + ' WHERE id=? AND tenant_id=?')
      .run(...vals, req.params.id, req.tenantId);

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Send reminder (logs action, in production would trigger SMS/email)
r.post('/debt/:id/reminder', (req, res) => {
  try {
    const { reminder_number, method = 'email' } = req.body;
    const debt = D().prepare(`
      SELECT d.*, c.first_name, c.last_name
      FROM debt_records d JOIN children c ON c.id=d.child_id
      WHERE d.id=? AND d.tenant_id=?
    `).get(req.params.id, req.tenantId);
    if (!debt) return res.status(404).json({ error: 'Not found' });

    const col = `reminder_${reminder_number}_sent`;
    D().prepare('UPDATE debt_records SET ' + (col) + '=datetime(\'now\') WHERE id=?').run(req.params.id);

    res.json({
      ok: true,
      message: `Reminder ${reminder_number} logged for ${debt.first_name} ${debt.last_name}`,
      outstanding: (debt.amount_cents - debt.amount_paid_cents) / 100,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// CASUAL BOOKINGS
// ─────────────────────────────────────────────────────────────────────────────

r.get('/casual', (req, res) => {
  try {
    const { status, from, to } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const { limit, offset } = pg(req);

    const where = ['cb.tenant_id=?'];
    const vals  = [req.tenantId];
    if (status) { where.push('cb.status=?'); vals.push(status); }
    if (from)   { where.push('cb.requested_date >= ?'); vals.push(from); }
    if (to)     { where.push('cb.requested_date <= ?'); vals.push(to); }

    const bookings = D().prepare(`
      SELECT cb.*, c.first_name, c.last_name, c.dob, r.name as room_name,
             r.capacity,
             COUNT(CASE WHEN cb2.status='confirmed' AND cb2.requested_date=cb.requested_date THEN 1 END) as room_bookings_that_day
      FROM casual_bookings cb
      JOIN children c ON c.id=cb.child_id
      LEFT JOIN rooms r ON r.id=cb.room_id
      LEFT JOIN casual_bookings cb2 ON cb2.room_id=cb.room_id AND cb2.tenant_id=cb.tenant_id
      WHERE ${where.join(' AND ')}
      GROUP BY cb.id
      ORDER BY cb.requested_date, cb.created_at
      LIMIT ? OFFSET ?
    `).all(...vals, limit, offset);

    const pending_count = D().prepare(
      "SELECT COUNT(*) as n FROM casual_bookings WHERE tenant_id=? AND status='pending'"
    ).get(req.tenantId)?.n || 0;

    res.json({ bookings, pending_count });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/casual', (req, res) => {
  try {
    const { child_id, room_id, requested_date, session_type, start_time,
            end_time, requested_by, fee_cents, notes } = req.body;
    if (!child_id || !requested_date) return res.status(400).json({ error: 'child_id and requested_date required' });

    // Check room capacity for that day
    if (room_id) {
      const room = D().prepare('SELECT capacity FROM rooms WHERE id=? AND tenant_id=?')
        .get(room_id, req.tenantId);
      const confirmed = D().prepare(
        "SELECT COUNT(*) as n FROM casual_bookings WHERE room_id=? AND requested_date=? AND status='confirmed'"
      ).get(room_id, requested_date)?.n || 0;
      const enrolled = D().prepare(
        'SELECT COUNT(*) as n FROM children WHERE room_id=? AND tenant_id=? AND active=1'
      ).get(room_id, req.tenantId)?.n || 0;

      if (room && (confirmed + enrolled) >= room.capacity) {
        return res.status(409).json({ error: 'Room is at capacity for this date', available: false });
      }
    }

    const id = uuid();
    D().prepare(`
      INSERT INTO casual_bookings
        (id,tenant_id,child_id,room_id,requested_date,session_type,
         start_time,end_time,requested_by,fee_cents,notes,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,'pending','pending')
    `).run(id, req.tenantId, child_id, room_id||null, requested_date,
           session_type||'full_day', start_time||null, end_time||null,
           requested_by||null, fee_cents||0, notes||null);

    res.json({ id, ok: true, status: 'pending' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/casual/:id', (req, res) => {
  try {
    const { status, confirmed_by, declined_reason, fee_cents } = req.body;
    D().prepare(`
      UPDATE casual_bookings SET
        status=COALESCE(?,status),
        confirmed_by=CASE WHEN ?='confirmed' THEN ? ELSE confirmed_by END,
        confirmed_at=CASE WHEN ?='confirmed' THEN datetime('now') ELSE confirmed_at END,
        declined_reason=COALESCE(?,declined_reason),
        fee_cents=COALESCE(?,fee_cents)
      WHERE id=? AND tenant_id=?
    `).run(status||null,
           status, confirmed_by||null,
           status,
           declined_reason||null, fee_cents||null,
           req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get availability for a date range (for parent/booking calendar)
r.get('/casual/availability', (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });

    const rooms = D().prepare(`
      SELECT r.id, r.name, r.age_group, r.capacity,
        COUNT(CASE WHEN c.active=1 THEN 1 END) as enrolled
      FROM rooms r
      LEFT JOIN children c ON c.room_id=r.id AND c.tenant_id=r.tenant_id
      WHERE r.tenant_id=?
      GROUP BY r.id
    `).all(req.tenantId);

    const confirmedByRoomDate = D().prepare(`
      SELECT room_id, requested_date, COUNT(*) as confirmed_casual
      FROM casual_bookings
      WHERE tenant_id=? AND requested_date BETWEEN ? AND ? AND status='confirmed'
      GROUP BY room_id, requested_date
    `).all(req.tenantId, from, to);

    const cbMap = {};
    confirmedByRoomDate.forEach(r => {
      cbMap[`${r.room_id}_${r.requested_date}`] = r.confirmed_casual;
    });

    // Build calendar availability
    const days = [];
    let d = new Date(from);
    const end = new Date(to);
    while (d <= end) {
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();
      if (dayOfWeek > 0 && dayOfWeek < 6) { // Weekdays only
        days.push({
          date: dateStr,
          rooms: rooms.map(room => {
            const confirmedCasual = cbMap[`${room.id}_${dateStr}`] || 0;
            const available = Math.max(0, room.capacity - room.enrolled - confirmedCasual);
            return { room_id: room.id, room_name: room.name, age_group: room.age_group,
                     capacity: room.capacity, enrolled: room.enrolled,
                     confirmed_casual: confirmedCasual, available_casual: available };
          })
        });
      }
      d.setDate(d.getDate() + 1);
    }

    res.json({ availability: days });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
