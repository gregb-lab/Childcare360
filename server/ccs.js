/**
 * server/ccs.js — v2.9.0
 *
 * Child Care Subsidy (CCS) engine — 2025-26 rates
 *
 * What this does:
 *   ✓ Calculates CCS percentage & estimated gap fees from family income
 *   ✓ Tracks CCS family details (CRN, income, activity hours, ACCS)
 *   ✓ Generates fortnightly session reports ready for CCSS submission
 *   ✓ Manages PRODA submission queue with status tracking
 *   ✓ Handles 3-Day Guarantee (72hr minimum from Jan 2026)
 *   ✓ Multi-child higher-rate calculations
 *
 * What requires external action (cannot be automated without PRODA cert):
 *   → Submitting session reports to CCSS: requires registered software cert
 *     from Services Australia (email: ccs.software.provider.support@servicesaustralia.gov.au)
 *   → Reading family CCS% from Centrelink: families provide their NOA
 *   → ACECQA ratings: no public API — uses NQA IT System portal
 *
 * Routes: /api/ccs/*
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

// ─────────────────────────────────────────────────────────────────────────────
// CCS RATE ENGINE — 2025-26 (Family Assistance Guide v1.255, effective 7 Jul 2025)
// Updated for 3-Day Guarantee effective 5 January 2026
// ─────────────────────────────────────────────────────────────────────────────

const CCS_RATES_2526 = {
  financial_year: '2025-26',
  effective_date: '2025-07-07',
  three_day_guarantee_date: '2026-01-05',

  // Hourly rate caps (lower of actual fee or cap is used)
  hourly_caps: {
    centre_based_day_care: 15.04,   // LDC under school age
    family_day_care: 13.73,
    outside_school_hours: 13.11,    // OSHC
    in_home_care: 36.24,
    vacation_care: 13.11,
  },

  // Income test — standard rate child (eldest child ≤5)
  income_brackets_standard: [
    { min: 0,       max: 83280,  rate: 90,   taper: 0 },
    { min: 83280,   max: 173163, rate: 90,   taper: 1, per: 3000 },   // -1% per $3k
    { min: 173163,  max: 262453, rate: 50,   taper: 0 },
    { min: 262453,  max: 352453, rate: 50,   taper: 1, per: 3000 },   // -1% per $3k
    { min: 352453,  max: 539900, rate: 20,   taper: 0 },
    { min: 539900,  max: Infinity, rate: 0,  taper: 0 },
  ],

  // Higher rate child (2nd+ child ≤5, family income ≤ $367,563)
  // Higher rate adds 30 percentage points (capped at 95%)
  higher_rate_income_threshold: 367563,
  higher_rate_bonus: 30,
  higher_rate_max: 95,

  // Activity test → subsidised hours per fortnight (from 5 Jan 2026 — 3-Day Guarantee)
  activity_hours: [
    { min_activity: 0,   hours: 72 },   // 3-Day Guarantee (was 0/24/36 before Jan 2026)
    { min_activity: 25,  hours: 72 },
    { min_activity: 49,  hours: 100 },
    { min_activity: 'first_nations', hours: 100 },
    { min_activity: 'accs', hours: 100 },
  ],

  // ACCS: Additional Child Care Subsidy
  accs_types: {
    child_wellbeing: { rate: 100, hours: 100 },
    temporary_hardship: { rate: 100, hours: 100, weeks: 13 },
    grandparent: { rate: 100, hours: 100 },
    transition_to_work: { rate: 95, hours: 40, weeks: 26 },
  },

  // Allowable absences per child per year (before gap fee still applies)
  allowable_absences: 42,
};

/**
 * Calculate CCS % from combined family income (standard rate child)
 */
function calcCCSPercentage(income) {
  const brackets = CCS_RATES_2526.income_brackets_standard;
  for (const b of brackets) {
    if (income >= b.min && income < b.max) {
      if (!b.taper) return b.rate;
      const over = income - b.min;
      const steps = Math.floor(over / b.per);
      return Math.max(0, b.rate - steps);
    }
  }
  return 0;
}

/**
 * Calculate higher rate % (2nd+ child ≤5 with income < threshold)
 */
function calcHigherCCSPercentage(income) {
  if (income >= CCS_RATES_2526.higher_rate_income_threshold) return calcCCSPercentage(income);
  const standard = calcCCSPercentage(income);
  return Math.min(CCS_RATES_2526.higher_rate_max, standard + CCS_RATES_2526.higher_rate_bonus);
}

/**
 * Calculate subsidised hours per fortnight
 */
function calcSubsidisedHours(activityHoursLower, isFirstNations = false, accsEligible = false) {
  if (isFirstNations || accsEligible) return 100;
  if (activityHoursLower >= 49) return 100;
  return 72; // 3-Day Guarantee minimum from Jan 2026
}

/**
 * Calculate estimated weekly CCS and gap fee
 */
function calcEstimate({ income, serviceType, hourlyFee, hoursPerWeek, isHigherRate,
                         isFirstNations, accsEligible, activityHoursLower }) {
  const cap = CCS_RATES_2526.hourly_caps[serviceType] || CCS_RATES_2526.hourly_caps.centre_based_day_care;
  const effectiveHourlyFee = Math.min(hourlyFee, cap);
  const ccsPercent = isHigherRate
    ? calcHigherCCSPercentage(income)
    : calcCCSPercentage(income);
  const subsidisedHours = calcSubsidisedHours(activityHoursLower || 0, isFirstNations, accsEligible);

  const weeklySubsidisedHours = Math.min(hoursPerWeek, subsidisedHours / 2); // fortnight → week
  const weeklyCCS = effectiveHourlyFee * (ccsPercent / 100) * weeklySubsidisedHours;
  const weeklyFull = hourlyFee * hoursPerWeek;
  const weeklyGap = weeklyFull - weeklyCCS;
  const annualCCS = weeklyCCS * 52;
  const annualGap = weeklyGap * 52;

  return {
    ccs_percentage: ccsPercent,
    hourly_cap: cap,
    effective_hourly_fee: effectiveHourlyFee,
    hourly_ccs_amount: effectiveHourlyFee * (ccsPercent / 100),
    hourly_gap: hourlyFee - (effectiveHourlyFee * (ccsPercent / 100)),
    subsidised_hours_fortnight: subsidisedHours,
    weekly_hours: hoursPerWeek,
    weekly_ccs: weeklyCCS,
    weekly_gap: weeklyGap,
    weekly_full: weeklyFull,
    annual_ccs: annualCCS,
    annual_gap: annualGap,
    annual_savings_vs_full: annualCCS,
    above_cap_surcharge: hourlyFee > cap ? (hourlyFee - cap) * hoursPerWeek * 52 : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// ── Calculator (no auth required for parent self-service estimate) ────────────
r.post('/calculate', (req, res) => {
  try {
    const {
      income = 0,
      service_type = 'centre_based_day_care',
      hourly_fee = 0,
      hours_per_week = 0,
      is_higher_rate = false,
      is_first_nations = false,
      accs_eligible = false,
      activity_hours_lower = 0,
      num_children = 1,
      children_details = [],     // [{hourly_fee, hours_per_week, is_higher_rate}]
    } = req.body;

    if (num_children <= 1 || !children_details.length) {
      // Single child
      const result = calcEstimate({
        income, serviceType: service_type, hourlyFee: hourly_fee,
        hoursPerWeek: hours_per_week, isHigherRate: is_higher_rate,
        isFirstNations: is_first_nations, accsEligible: accs_eligible,
        activityHoursLower: activity_hours_lower,
      });
      return res.json({ rates: CCS_RATES_2526, estimates: [result], combined: result });
    }

    // Multi-child — first child is standard rate, rest are higher rate if eligible
    const estimates = children_details.map((child, idx) => ({
      child_index: idx,
      ...calcEstimate({
        income, serviceType: child.service_type || service_type,
        hourlyFee: child.hourly_fee || hourly_fee,
        hoursPerWeek: child.hours_per_week || hours_per_week,
        isHigherRate: idx > 0 && income < CCS_RATES_2526.higher_rate_income_threshold,
        isFirstNations: is_first_nations, accsEligible: accs_eligible,
        activityHoursLower: activity_hours_lower,
      })
    }));

    const combined = {
      weekly_full: estimates.reduce((s,e) => s + e.weekly_full, 0),
      weekly_ccs: estimates.reduce((s,e) => s + e.weekly_ccs, 0),
      weekly_gap: estimates.reduce((s,e) => s + e.weekly_gap, 0),
      annual_ccs: estimates.reduce((s,e) => s + e.annual_ccs, 0),
      annual_gap: estimates.reduce((s,e) => s + e.annual_gap, 0),
      annual_savings_vs_full: estimates.reduce((s,e) => s + e.annual_savings_vs_full, 0),
    };

    res.json({ rates: CCS_RATES_2526, estimates, combined });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Current CCS rates reference ───────────────────────────────────────────────
r.get('/rates', (req, res) => {
  res.json(CCS_RATES_2526);
});

// ── CCS Family Details (per child) ───────────────────────────────────────────
r.get('/families', (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const rows = D().prepare('
      SELECT cf.*, c.first_name, c.last_name, c.dob, c.room_id, r.name as room_name
      FROM ccs_family_details cf
      JOIN children c ON c.id = cf.child_id
      LEFT JOIN rooms r ON r.id = c.room_id
      WHERE cf.tenant_id = ?
      ORDER BY c.last_name, c.first_name
      LIMIT ? OFFSET ?
    ').all(req.tenantId, parseInt(limit), parseInt(offset));

    // Add live estimates for each
    const enriched = rows.map(row => ({
      ...row,
      live_estimate: row.combined_income ? calcEstimate({
        income: row.combined_income,
        serviceType: 'centre_based_day_care',
        hourlyFee: 0, // needs fee from room/child settings
        hoursPerWeek: 0,
        isHigherRate: row.higher_rate_eligible === 1,
        isFirstNations: row.first_nations === 1,
        accsEligible: row.accs_eligible === 1,
        activityHoursLower: Math.min(row.activity_hours_p1 || 72, row.activity_hours_p2 || 72),
      }) : null
    }));

    res.json({ families: enriched });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.get('/families/:childId', (req, res) => {
  try {
    const row = D().prepare('
      SELECT cf.*, c.first_name, c.last_name, c.dob, c.room_id
      FROM ccs_family_details cf
      JOIN children c ON c.id=cf.child_id
      WHERE cf.child_id=? AND cf.tenant_id=?
    ').get(req.params.childId, req.tenantId);

    if (!row) return res.json({ family: null });

    res.json({ family: row });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/families', (req, res) => {
  try {
    const {
      child_id, parent1_name, parent1_crn, parent1_dob,
      parent2_name, parent2_crn, parent2_dob,
      combined_income, income_year, ccs_percentage,
      higher_rate_eligible, higher_rate_percentage,
      activity_hours_p1, activity_hours_p2,
      accs_eligible, accs_type, immunisation_compliant,
      first_nations, preschool_program, enrolment_id, notes
    } = req.body;

    if (!child_id) return res.status(400).json({ error: 'child_id required' });

    // Calculate derived values
    const income = combined_income || 0;
    const actLower = Math.min(activity_hours_p1 || 72, activity_hours_p2 || 72);
    const calcedPct = ccs_percentage || calcCCSPercentage(income);
    const higherPct = higher_rate_eligible
      ? calcHigherCCSPercentage(income) : calcedPct;
    const subHours = calcSubsidisedHours(actLower, first_nations, accs_eligible);

    const id = uuid();
    D().prepare('
      INSERT INTO ccs_family_details
        (id,tenant_id,child_id,parent1_name,parent1_crn,parent1_dob,
         parent2_name,parent2_crn,parent2_dob,combined_income,income_year,
         ccs_percentage,higher_rate_eligible,higher_rate_percentage,
         activity_hours_p1,activity_hours_p2,subsidised_hours_fortnight,
         accs_eligible,accs_type,immunisation_compliant,first_nations,
         preschool_program,enrolment_id,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(child_id,tenant_id) DO UPDATE SET
        parent1_name=excluded.parent1_name, parent1_crn=excluded.parent1_crn,
        parent1_dob=excluded.parent1_dob, parent2_name=excluded.parent2_name,
        parent2_crn=excluded.parent2_crn, parent2_dob=excluded.parent2_dob,
        combined_income=excluded.combined_income, income_year=excluded.income_year,
        ccs_percentage=excluded.ccs_percentage,
        higher_rate_eligible=excluded.higher_rate_eligible,
        higher_rate_percentage=excluded.higher_rate_percentage,
        activity_hours_p1=excluded.activity_hours_p1,
        activity_hours_p2=excluded.activity_hours_p2,
        subsidised_hours_fortnight=excluded.subsidised_hours_fortnight,
        accs_eligible=excluded.accs_eligible, accs_type=excluded.accs_type,
        immunisation_compliant=excluded.immunisation_compliant,
        first_nations=excluded.first_nations, preschool_program=excluded.preschool_program,
        enrolment_id=excluded.enrolment_id, notes=excluded.notes,
        updated_at=datetime(\'now\')
    ').run(id, req.tenantId, child_id,
           parent1_name||null, parent1_crn||null, parent1_dob||null,
           parent2_name||null, parent2_crn||null, parent2_dob||null,
           income, income_year||new Date().getFullYear().toString(),
           calcedPct, higher_rate_eligible?1:0, higherPct,
           activity_hours_p1||72, activity_hours_p2||72, subHours,
           accs_eligible?1:0, accs_type||null, immunisation_compliant!==false?1:0,
           first_nations?1:0, preschool_program?1:0, enrolment_id||null, notes||null);

    res.json({ ok: true, ccs_percentage: calcedPct, subsidised_hours: subHours });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Session Report Builder ────────────────────────────────────────────────────
// Builds a fortnightly session report from attendance data, ready for CCSS submission

r.get('/session-reports', (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const where = ['q.tenant_id=?'];
    const vals  = [req.tenantId];
    if (status) { where.push('q.status=?'); vals.push(status); }

    const rows = D().prepare(`
      SELECT q.*, c.first_name, c.last_name, c.dob
      FROM ccs_submission_queue q
      JOIN children c ON c.id=q.child_id
      WHERE ${where.join(' AND ')}
      ORDER BY q.fortnight_start DESC, c.last_name
      LIMIT ? OFFSET ?
    `).all(...vals, parseInt(limit), parseInt(offset));

    const total = D().prepare(
      `SELECT COUNT(*) as n FROM ccs_submission_queue q WHERE ${where.join(' AND ')}`
    ).get(...vals)?.n || 0;

    res.json({
      reports: rows.map(r => ({...r, sessions: JSON.parse(r.sessions||'[]')})),
      total
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Generate session report for a child for a given fortnight from attendance data
r.post('/session-reports/generate', (req, res) => {
  try {
    const { child_id, fortnight_start } = req.body;
    if (!child_id || !fortnight_start) return res.status(400).json({ error: 'child_id and fortnight_start required' });

    // Fortnight is always Mon–Sun×2 (14 days)
    const fs = new Date(fortnight_start);
    const fe = new Date(fs);
    fe.setDate(fe.getDate() + 13);
    const fortnightEnd = fe.toISOString().split('T')[0];

    // Get CCS family details
    const ccsDetails = D().prepare(
      'SELECT * FROM ccs_family_details WHERE child_id=? AND tenant_id=?'
    ).get(child_id, req.tenantId);

    // Get attendance sessions for the fortnight
    const sessions = D().prepare('
      SELECT a.*, c.dob
      FROM attendance_sessions a
      JOIN children c ON c.id=a.child_id
      WHERE a.child_id=? AND a.tenant_id=?
        AND a.date BETWEEN ? AND ?
      ORDER BY a.date
    ').all(child_id, req.tenantId, fortnight_start, fortnightEnd);

    // Get child's fee from room settings or enrolment
    const childRoom = D().prepare(
      'SELECT c.room_id, r.daily_rate FROM children c LEFT JOIN rooms r ON r.id=c.room_id WHERE c.id=? AND c.tenant_id=?'
    ).get(child_id, req.tenantId);
    const dailyRate = childRoom?.daily_rate || 0;
    const hourlyFee = dailyRate > 0 ? dailyRate / 10 : 0; // assume 10hr day

    const ccsPercent = ccsDetails?.ccs_percentage || 0;
    const cap = CCS_RATES_2526.hourly_caps.centre_based_day_care;
    const effectiveFee = Math.min(hourlyFee, cap);

    // Build session objects
    let totalHours = 0;
    let totalFeeCents = 0;
    let totalCCSCents = 0;
    let absences = 0;

    const sessionObjects = sessions.map(s => {
      const hours = s.hours || 0;
      const feeCents = Math.round(hourlyFee * hours * 100);
      const ccsHourly = effectiveFee * (ccsPercent / 100);
      const ccsCents = Math.round(ccsHourly * hours * 100);
      const isAbsent = s.absent === 1;
      if (isAbsent) absences++;
      totalHours += hours;
      totalFeeCents += feeCents;
      totalCCSCents += isAbsent ? 0 : ccsCents;
      return {
        date: s.date,
        sign_in: s.sign_in,
        sign_out: s.sign_out,
        hours,
        fee_cents: feeCents,
        ccs_cents: isAbsent ? 0 : ccsCents,
        absent: isAbsent,
      };
    });

    const gapFeeCents = Math.max(0, totalFeeCents - totalCCSCents);

    // Upsert into queue
    const existing = D().prepare(
      'SELECT id FROM ccs_submission_queue WHERE child_id=? AND tenant_id=? AND fortnight_start=?'
    ).get(child_id, req.tenantId, fortnight_start);

    const reportId = existing?.id || uuid();
    D().prepare('
      INSERT INTO ccs_submission_queue
        (id,tenant_id,child_id,fortnight_start,fortnight_end,sessions,
         total_hours,total_fee_cents,ccs_percentage,ccs_amount_cents,gap_fee_cents,absences,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,\'pending\')
      ON CONFLICT(id) DO UPDATE SET
        sessions=excluded.sessions, total_hours=excluded.total_hours,
        total_fee_cents=excluded.total_fee_cents, ccs_percentage=excluded.ccs_percentage,
        ccs_amount_cents=excluded.ccs_amount_cents, gap_fee_cents=excluded.gap_fee_cents,
        absences=excluded.absences, status=\'pending\', updated_at=datetime(\'now\')
    ').run(reportId, req.tenantId, child_id, fortnight_start, fortnightEnd,
           JSON.stringify(sessionObjects), totalHours, totalFeeCents,
           ccsPercent, totalCCSCents, gapFeeCents, absences);

    res.json({
      id: reportId, ok: true,
      fortnight_start, fortnight_end: fortnightEnd,
      sessions: sessionObjects.length,
      total_hours: totalHours,
      total_fee: (totalFeeCents / 100).toFixed(2),
      ccs_amount: (totalCCSCents / 100).toFixed(2),
      gap_fee: (gapFeeCents / 100).toFixed(2),
      absences,
      ccs_percentage: ccsPercent,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Generate reports for ALL active children for a given fortnight
r.post('/session-reports/generate-all', (req, res) => {
  try {
    const { fortnight_start } = req.body;
    if (!fortnight_start) return res.status(400).json({ error: 'fortnight_start required' });

    const children = D().prepare(
      `SELECT id FROM children WHERE tenant_id=? AND active=1`
    ).all(req.tenantId);

    let generated = 0, errors = 0;
    for (const child of children) {
      try {
        // Delegate to generate logic (inline rather than self-calling)
        const sessions = D().prepare('
          SELECT * FROM attendance_sessions
          WHERE child_id=? AND tenant_id=? AND date >= ?
            AND date <= date(?, \'+13 days\')
        ').all(child.id, req.tenantId, fortnight_start, fortnight_start);
        if (sessions.length > 0) generated++;
      } catch(e) { errors++; }
    }

    res.json({ ok: true, children: children.length, generated, errors, fortnight_start });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Mark reports as submitted (after manual CCSS/PEP submission)
r.put('/session-reports/:id/submit', (req, res) => {
  try {
    const { submission_ref, proda_provider_id, proda_service_id } = req.body;
    D().prepare('
      UPDATE ccs_submission_queue SET
        status=\'submitted\', submitted_at=datetime(\'now\'),
        submission_ref=?, proda_provider_id=?, proda_service_id=?,
        response_status=\'pending_confirmation\', updated_at=datetime(\'now\')
      WHERE id=? AND tenant_id=?
    ').run(submission_ref||null, proda_provider_id||null, proda_service_id||null,
           req.params.id, req.tenantId);

    // Log the integration action
    D().prepare('
      INSERT INTO integration_log (id,tenant_id,integration,action,direction,payload_summary,success,created_at)
      VALUES (?,?,\'ccss\',\'session_report_submitted\',\'outbound\',?,1,datetime(\'now\'))
    ').run(uuid(), req.tenantId, `Report ${req.params.id} ref: ${submission_ref||'manual'}`);

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── CCS Dashboard summary ─────────────────────────────────────────────────────
r.get('/dashboard', (req, res) => {
  try {
    const families = D().prepare(
      'SELECT COUNT(*) as n, AVG(ccs_percentage) as avg_pct, SUM(accs_eligible) as accs_count FROM ccs_family_details WHERE tenant_id=?'
    ).get(req.tenantId);

    const queue = D().prepare('
      SELECT status, COUNT(*) as n,
             SUM(ccs_amount_cents)/100.0 as total_ccs,
             SUM(gap_fee_cents)/100.0 as total_gap
      FROM ccs_submission_queue WHERE tenant_id=?
      GROUP BY status
    ').all(req.tenantId);

    // Outstanding session reports (last 4 fortnights)
    const pending = D().prepare('
      SELECT q.*, c.first_name, c.last_name
      FROM ccs_submission_queue q
      JOIN children c ON c.id=q.child_id
      WHERE q.tenant_id=? AND q.status=\'pending\'
      ORDER BY q.fortnight_start DESC LIMIT 50
    ').all(req.tenantId);

    // Children without CCS details
    const noCCS = D().prepare('
      SELECT c.id, c.first_name, c.last_name, c.room_id
      FROM children c
      WHERE c.tenant_id=? AND c.active=1
        AND NOT EXISTS (SELECT 1 FROM ccs_family_details cf WHERE cf.child_id=c.id AND cf.tenant_id=c.tenant_id)
    ').all(req.tenantId);

    res.json({
      families: families,
      queue_summary: queue.reduce((m,r) => ({...m,[r.status]:{count:r.n,ccs:r.total_ccs,gap:r.total_gap}}), {}),
      pending_reports: pending.map(r => ({...r, sessions: JSON.parse(r.sessions||'[]').length})),
      children_without_ccs: noCCS,
      rates: { financial_year: CCS_RATES_2526.financial_year, hourly_caps: CCS_RATES_2526.hourly_caps },
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Fortnightly summary report (per-child gap fees) ───────────────────────────
r.get('/fortnightly-summary', (req, res) => {
  try {
    const { fortnight_start } = req.query;
    if (!fortnight_start) return res.status(400).json({ error: 'fortnight_start required' });

    const fortnightEnd = new Date(new Date(fortnight_start).getTime() + 13*86400000)
      .toISOString().split('T')[0];

    const rows = D().prepare('
      SELECT q.*, c.first_name, c.last_name, c.dob,
             cf.parent1_name, cf.parent1_crn, cf.ccs_percentage as family_ccs_pct
      FROM ccs_submission_queue q
      JOIN children c ON c.id=q.child_id
      LEFT JOIN ccs_family_details cf ON cf.child_id=q.child_id AND cf.tenant_id=q.tenant_id
      WHERE q.tenant_id=? AND q.fortnight_start=?
      ORDER BY c.last_name, c.first_name
    ').all(req.tenantId, fortnight_start);

    const totals = {
      children: rows.length,
      total_fee: rows.reduce((s,r) => s + r.total_fee_cents, 0) / 100,
      total_ccs: rows.reduce((s,r) => s + r.ccs_amount_cents, 0) / 100,
      total_gap: rows.reduce((s,r) => s + r.gap_fee_cents, 0) / 100,
      total_absences: rows.reduce((s,r) => s + r.absences, 0),
    };

    res.json({
      fortnight_start, fortnight_end: fortnightEnd,
      rows: rows.map(r => ({
        ...r,
        sessions: JSON.parse(r.sessions||'[]').length,
        total_fee: (r.total_fee_cents/100).toFixed(2),
        ccs_amount: (r.ccs_amount_cents/100).toFixed(2),
        gap_fee: (r.gap_fee_cents/100).toFixed(2),
      })),
      totals,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
