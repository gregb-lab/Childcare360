import { Router } from 'express';
import { D, uuid, auditLog } from './db.js';
import { requireAuth } from './middleware.js';
import bcrypt from 'bcryptjs';

const r = Router();

// ─── Platform admin middleware ──────────────────────────────────────────────
function requirePlatformAdmin(req, res, next) {
  const admin = D().prepare('SELECT role FROM platform_admins WHERE user_id = ?').get(req.userId);
  if (!admin) return res.status(403).json({ error: 'Platform admin access required' });
  req.platformRole = admin.role;
  next();
}

r.use(requireAuth);
r.use(requirePlatformAdmin);

// ═══ TENANTS (CENTRES) CRUD ═══════════════════════════════════════════════════

// List all tenants with summary stats
r.get('/tenants', (req, res) => {
  const tenants = D().prepare(`
    SELECT t.*,
      ts.plan, ts.status as sub_status, ts.max_children, ts.max_educators, ts.monthly_price_cents, ts.trial_ends_at,
      (SELECT COUNT(*) FROM children c WHERE c.tenant_id = t.id) as child_count,
      (SELECT COUNT(*) FROM tenant_members tm WHERE tm.tenant_id = t.id AND tm.active = 1) as educator_count,
      (SELECT COUNT(*) FROM rooms rm WHERE rm.tenant_id = t.id) as room_count,
      (SELECT COUNT(*) FROM waitlist w WHERE w.tenant_id = t.id AND w.status = 'waiting') as waitlist_count
    FROM tenants t
    LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id
    ORDER BY t.created_at DESC
  `).all();
  res.json({ tenants });
});

// Get single tenant detail
r.get('/tenants/:id', (req, res) => {
  const t = D().prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tenant not found' });
  const sub = D().prepare('SELECT * FROM tenant_subscriptions WHERE tenant_id = ?').get(t.id);
  const members = D().prepare(`
    SELECT tm.*, u.email, u.name, u.last_login FROM tenant_members tm
    JOIN users u ON u.id = tm.user_id WHERE tm.tenant_id = ? ORDER BY tm.role, u.name
  `).all(t.id);
  const rooms = D().prepare('SELECT * FROM rooms WHERE tenant_id = ?').all(t.id);
  const children = D().prepare('SELECT id,first_name,last_name,dob,room_id,allergies,enrolled_date FROM children WHERE tenant_id = ?').all(t.id);
  const recentIncidents = D().prepare('SELECT * FROM incidents WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 10').all(t.id);
  const waitlist = D().prepare('SELECT * FROM waitlist WHERE tenant_id = ? ORDER BY position').all(t.id);
  res.json({ tenant: t, subscription: sub, members, rooms, children, incidents: recentIncidents, waitlist });
});

// Create new tenant (provision a centre)
r.post('/tenants', (req, res) => {
  const { name, abn, address, phone, email, service_type, plan, admin_name, admin_email, admin_password } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

  const tid = uuid();
  const db = D();

  db.prepare('INSERT INTO tenants (id,name,abn,address,phone,email,service_type) VALUES(?,?,?,?,?,?,?)')
    .run(tid, name, abn || null, address || null, phone || null, email, service_type || 'long_day_care');

  // Create subscription
  const subPlan = plan || 'trial';
  const prices = { trial: 0, starter: 7900, professional: 14900, enterprise: 29900 };
  const limits = { trial: [15,6], starter: [30,12], professional: [60,25], enterprise: [120,50] };
  const [maxKids, maxEds] = limits[subPlan] || limits.trial;
  const trialEnd = subPlan === 'trial' ? new Date(Date.now() + 30*86400000).toISOString() : null;

  db.prepare('INSERT INTO tenant_subscriptions (id,tenant_id,plan,status,max_children,max_educators,monthly_price_cents,trial_ends_at,billing_email) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(uuid(), tid, subPlan, subPlan === 'trial' ? 'trial' : 'active', maxKids, maxEds, prices[subPlan] || 0, trialEnd, email);

  // Create admin user for the centre if provided
  if (admin_email) {
    let adminUser = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(admin_email);
    if (!adminUser) {
      const uid = uuid();
      const pw = admin_password || 'Welcome2Childcare360!';
      db.prepare('INSERT INTO users (id,email,password_hash,name,phone,auth_provider,email_verified) VALUES(?,?,?,?,?,?,1)')
        .run(uid, admin_email, bcrypt.hashSync(pw, 12), admin_name || name + ' Admin', phone, 'email');
      adminUser = { id: uid };
    }
    db.prepare('INSERT OR IGNORE INTO tenant_members (id,user_id,tenant_id,role,active) VALUES(?,?,?,?,1)')
      .run(uuid(), adminUser.id, tid, 'admin');
  }

  auditLog(req.userId, null, 'platform.tenant.created', { tid, name, plan: subPlan }, req.ip, req.get('user-agent'));
  res.status(201).json({ id: tid, message: 'Centre provisioned successfully' });
});

// Update tenant
r.put('/tenants/:id', (req, res) => {
  const { name, abn, address, phone, email, service_type, nqs_rating } = req.body;
  D().prepare(`UPDATE tenants SET name=COALESCE(?,name), abn=COALESCE(?,abn), address=COALESCE(?,address),
    phone=COALESCE(?,phone), email=COALESCE(?,email), service_type=COALESCE(?,service_type),
    nqs_rating=COALESCE(?,nqs_rating), updated_at=datetime('now') WHERE id=?`)
    .run(name,abn,address,phone,email,service_type,nqs_rating, req.params.id);
  res.json({ ok: true });
});

// Suspend / reactivate tenant
r.post('/tenants/:id/suspend', (req, res) => {
  D().prepare("UPDATE tenant_subscriptions SET status='suspended' WHERE tenant_id=?").run(req.params.id);
  auditLog(req.userId, req.params.id, 'platform.tenant.suspended', {}, req.ip, req.get('user-agent'));
  res.json({ ok: true });
});
r.post('/tenants/:id/reactivate', (req, res) => {
  D().prepare("UPDATE tenant_subscriptions SET status='active' WHERE tenant_id=?").run(req.params.id);
  res.json({ ok: true });
});

// ═══ SUBSCRIPTIONS ═══════════════════════════════════════════════════════════

r.put('/tenants/:id/subscription', (req, res) => {
  const { plan, max_children, max_educators, monthly_price_cents } = req.body;
  const prices = { trial: 0, starter: 7900, professional: 14900, enterprise: 29900 };
  D().prepare(`UPDATE tenant_subscriptions SET plan=COALESCE(?,plan), max_children=COALESCE(?,max_children),
    max_educators=COALESCE(?,max_educators), monthly_price_cents=COALESCE(?,monthly_price_cents),
    status=CASE WHEN ?='trial' THEN 'trial' ELSE 'active' END WHERE tenant_id=?`)
    .run(plan, max_children, max_educators, monthly_price_cents ?? prices[plan], plan, req.params.id);
  res.json({ ok: true });
});

// ═══ PLATFORM METRICS & ANALYTICS ════════════════════════════════════════════

// Aggregate metrics across all tenants
r.get('/metrics/overview', (req, res) => {
  const db = D();
  // Use individual queries so a missing table doesn't kill everything
  const safeCount = (sql) => { try { return db.prepare(sql).get()?.cnt || 0; } catch(e) { return 0; } };
  const totals = {
    total_centres:    safeCount("SELECT COUNT(*) as cnt FROM tenants"),
    total_children:   safeCount("SELECT COUNT(*) as cnt FROM children WHERE active=1"),
    total_educators:  safeCount("SELECT COUNT(*) as cnt FROM tenant_members WHERE active=1"),
    total_rooms:      safeCount("SELECT COUNT(*) as cnt FROM rooms"),
    mrr_cents:        (()=>{ try { return db.prepare("SELECT COALESCE(SUM(monthly_price_cents),0) as s FROM tenant_subscriptions WHERE status IN ('active','trial')").get()?.s || 0; } catch(e){ return 0; } })(),
    total_waitlist:   safeCount("SELECT COUNT(*) as cnt FROM waitlist WHERE status='waiting'"),
    incidents_30d:    safeCount("SELECT COUNT(*) as cnt FROM incidents WHERE created_at > datetime('now','-30 days')"),
    trial_centres:    safeCount("SELECT COUNT(*) as cnt FROM tenant_subscriptions WHERE status='trial'"),
    active_centres:   safeCount("SELECT COUNT(*) as cnt FROM tenant_subscriptions WHERE status='active'"),
    suspended_centres:safeCount("SELECT COUNT(*) as cnt FROM tenant_subscriptions WHERE status='suspended'"),
  };

  // Plan distribution
  const planDist = db.prepare(`SELECT plan, COUNT(*) as count, SUM(monthly_price_cents) as revenue
    FROM tenant_subscriptions GROUP BY plan`).all();

  // Service type distribution
  const typeDist = db.prepare(`SELECT service_type, COUNT(*) as count FROM tenants GROUP BY service_type`).all();

  res.json({ ...totals, planDistribution: planDist, serviceTypes: typeDist });
});

// Per-tenant metrics over time
r.get('/metrics/tenant/:id', (req, res) => {
  const { days } = req.query;
  const d = parseInt(days) || 30;
  const metrics = D().prepare(`SELECT * FROM tenant_metrics WHERE tenant_id = ? AND date >= date('now',?) ORDER BY date`)
    .all(req.params.id, `-${d} days`);
  res.json({ metrics });
});

// Cross-tenant comparison (occupancy, compliance, revenue)
r.get('/metrics/comparison', (req, res) => {
  const comparison = D().prepare(`
    SELECT t.id, t.name, t.service_type,
      AVG(m.occupancy_pct) as avg_occupancy,
      AVG(m.compliance_pct) as avg_compliance,
      AVG(m.attendance_pct) as avg_attendance,
      AVG(m.parent_engagement_pct) as avg_engagement,
      SUM(m.incidents) as total_incidents,
      SUM(m.revenue_cents) as total_revenue
    FROM tenants t
    LEFT JOIN tenant_metrics m ON m.tenant_id = t.id AND m.date >= date('now','-30 days')
    GROUP BY t.id ORDER BY avg_occupancy DESC
  `).all();
  res.json({ comparison });
});

// Revenue over time (all tenants aggregated)
r.get('/metrics/revenue', (req, res) => {
  const revenue = D().prepare(`
    SELECT date, SUM(revenue_cents) as total_revenue, SUM(active_children) as total_children
    FROM tenant_metrics WHERE date >= date('now','-90 days')
    GROUP BY date ORDER BY date
  `).all();
  res.json({ revenue });
});

// ═══ INCIDENTS (cross-tenant view) ══════════════════════════════════════════

r.get('/incidents', (req, res) => {
  const { severity, status, tenant_id } = req.query;
  let sql = `SELECT i.*, t.name as tenant_name, c.first_name||' '||c.last_name as child_name
    FROM incidents i JOIN tenants t ON t.id = i.tenant_id LEFT JOIN children c ON c.id = i.child_id WHERE 1=1`;
  const params = [];
  if (severity) { sql += ' AND i.severity = ?'; params.push(severity); }
  if (status) { sql += ' AND i.status = ?'; params.push(status); }
  if (tenant_id) { sql += ' AND i.tenant_id = ?'; params.push(tenant_id); }
  sql += ' ORDER BY i.created_at DESC LIMIT 100';
  res.json({ incidents: D().prepare(sql).all(...params) });
});

// ═══ WAITLIST (cross-tenant) ═════════════════════════════════════════════════

r.get('/waitlist', (req, res) => {
  const list = D().prepare(`
    SELECT w.*, t.name as tenant_name FROM waitlist w
    JOIN tenants t ON t.id = w.tenant_id ORDER BY w.priority DESC, w.position
  `).all();
  res.json({ waitlist: list });
});

// ═══ NQS SELF-ASSESSMENT ═════════════════════════════════════════════════════

r.get('/nqs/:tenantId', (req, res) => {
  const assessments = D().prepare('SELECT * FROM nqs_self_assessment WHERE tenant_id = ? ORDER BY quality_area, standard')
    .all(req.params.tenantId);
  const goals = D().prepare('SELECT * FROM qip_goals WHERE tenant_id = ? ORDER BY quality_area, created_at DESC')
    .all(req.params.tenantId);
  res.json({ assessments, goals });
});

r.post('/nqs/:tenantId', (req, res) => {
  const { quality_area, standard, element, current_rating, evidence, improvement_notes, target_date } = req.body;
  D().prepare(`INSERT INTO nqs_self_assessment (id,tenant_id,quality_area,standard,element,current_rating,evidence,improvement_notes,target_date,assessed_by)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET current_rating=excluded.current_rating, evidence=excluded.evidence,
    improvement_notes=excluded.improvement_notes, updated_at=datetime('now')`)
    .run(uuid(), req.params.tenantId, quality_area, standard, element, current_rating, evidence, improvement_notes, target_date, req.userName);
  res.json({ ok: true });
});

// ═══ QIP GOALS ═══════════════════════════════════════════════════════════════

r.post('/qip/:tenantId', (req, res) => {
  const { quality_area, goal, actions, responsible, timeline } = req.body;
  const id = uuid();
  D().prepare('INSERT INTO qip_goals (id,tenant_id,quality_area,goal,actions,responsible,timeline) VALUES(?,?,?,?,?,?,?)')
    .run(id, req.params.tenantId, quality_area, goal, actions, responsible, timeline);
  res.json({ id });
});

r.put('/qip/:id', (req, res) => {
  const { progress, status, actions } = req.body;
  D().prepare(`UPDATE qip_goals SET progress=COALESCE(?,progress), status=COALESCE(?,status),
    actions=COALESCE(?,actions), updated_at=datetime('now') WHERE id=?`)
    .run(progress, status, actions, req.params.id);
  res.json({ ok: true });
});

// ═══ AUDIT LOG (platform-wide) ══════════════════════════════════════════════

r.get('/audit', (req, res) => {
  const logs = D().prepare(`
    SELECT a.*, u.name as user_name, t.name as tenant_name
    FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN tenants t ON t.id = a.tenant_id
    ORDER BY a.created_at DESC LIMIT 200
  `).all();
  res.json({ logs });
});

// ═══ STAFF WELLBEING (cross-tenant) ═════════════════════════════════════════

r.get('/wellbeing', (req, res) => {
  const data = D().prepare(`
    SELECT t.name as tenant_name, AVG(sw.energy_level) as avg_energy,
      AVG(sw.stress_level) as avg_stress, AVG(sw.workload_rating) as avg_workload,
      AVG(sw.support_rating) as avg_support, COUNT(*) as responses
    FROM staff_wellbeing sw JOIN tenants t ON t.id = sw.tenant_id
    WHERE sw.date >= date('now','-30 days') GROUP BY t.id
  `).all();
  res.json({ wellbeing: data });
});

// ═══ INCIDENT TREND ANALYSIS ═════════════════════════════════════════════════

r.get('/incidents/trends', (req, res) => {
  const db = D();
  // By type
  const byType = db.prepare(`
    SELECT type, COUNT(*) as count, severity,
      SUM(CASE WHEN first_aid_given=1 THEN 1 ELSE 0 END) as first_aid_count
    FROM incidents GROUP BY type, severity ORDER BY count DESC
  `).all();
  // By location
  const byLocation = db.prepare(`
    SELECT location, COUNT(*) as count,
      SUM(CASE WHEN severity IN ('moderate','major','critical') THEN 1 ELSE 0 END) as serious_count
    FROM incidents WHERE location IS NOT NULL AND location != ''
    GROUP BY location ORDER BY count DESC LIMIT 15
  `).all();
  // By centre
  const byCentre = db.prepare(`
    SELECT t.name as centre, COUNT(i.id) as count,
      SUM(CASE WHEN i.severity='minor' THEN 1 ELSE 0 END) as minor,
      SUM(CASE WHEN i.severity='moderate' THEN 1 ELSE 0 END) as moderate,
      SUM(CASE WHEN i.severity IN ('major','critical') THEN 1 ELSE 0 END) as serious
    FROM incidents i JOIN tenants t ON t.id = i.tenant_id
    GROUP BY i.tenant_id ORDER BY count DESC
  `).all();
  // Monthly trend
  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count,
      SUM(CASE WHEN severity='minor' THEN 1 ELSE 0 END) as minor,
      SUM(CASE WHEN severity='moderate' THEN 1 ELSE 0 END) as moderate,
      SUM(CASE WHEN severity IN ('major','critical') THEN 1 ELSE 0 END) as serious
    FROM incidents GROUP BY month ORDER BY month DESC LIMIT 12
  `).all();
  // Time-of-day pattern (from created_at hour)
  const byHour = db.prepare(`
    SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as count
    FROM incidents GROUP BY hour ORDER BY hour
  `).all();
  // Repeat locations (hotspots)
  const hotspots = db.prepare(`
    SELECT location, COUNT(*) as count, GROUP_CONCAT(DISTINCT type) as types
    FROM incidents WHERE location IS NOT NULL AND location != ''
    GROUP BY location HAVING count >= 2 ORDER BY count DESC LIMIT 10
  `).all();

  res.json({ byType, byLocation, byCentre, monthly: monthly.reverse(), byHour, hotspots });
});

// ═══ NQS SELF-ASSESSMENT REPORTING ═════════════════════════════════════════

r.get('/nqs/report', (req, res) => {
  const db = D();
  // All assessments grouped by QA for all tenants
  const assessments = db.prepare(`
    SELECT n.*, t.name as tenant_name FROM nqs_self_assessment n
    JOIN tenants t ON t.id = n.tenant_id
    ORDER BY n.tenant_id, n.quality_area, n.standard, n.element
  `).all();
  // QIP goals with progress
  const goals = db.prepare(`
    SELECT q.*, t.name as tenant_name FROM qip_goals q
    JOIN tenants t ON t.id = q.tenant_id
    ORDER BY q.tenant_id, q.quality_area
  `).all();
  // Summary per tenant
  const summary = db.prepare(`
    SELECT n.tenant_id, t.name as tenant_name,
      COUNT(*) as total_elements,
      SUM(CASE WHEN n.current_rating='exceeding' THEN 1 ELSE 0 END) as exceeding,
      SUM(CASE WHEN n.current_rating='meeting' THEN 1 ELSE 0 END) as meeting,
      SUM(CASE WHEN n.current_rating='working_towards' THEN 1 ELSE 0 END) as working_towards,
      SUM(CASE WHEN n.current_rating='significant_improvement' THEN 1 ELSE 0 END) as sig_improvement
    FROM nqs_self_assessment n JOIN tenants t ON t.id = n.tenant_id
    GROUP BY n.tenant_id
  `).all();
  // QA breakdown for each tenant
  const qaBreakdown = db.prepare(`
    SELECT n.tenant_id, n.quality_area,
      COUNT(*) as elements,
      SUM(CASE WHEN n.current_rating='exceeding' THEN 1 ELSE 0 END) as exceeding,
      SUM(CASE WHEN n.current_rating='meeting' THEN 1 ELSE 0 END) as meeting,
      SUM(CASE WHEN n.current_rating='working_towards' THEN 1 ELSE 0 END) as working_towards
    FROM nqs_self_assessment n GROUP BY n.tenant_id, n.quality_area
    ORDER BY n.tenant_id, n.quality_area
  `).all();

  res.json({ assessments, goals, summary, qaBreakdown });
});

// ═══ PARENT SENTIMENT ANALYSIS ═════════════════════════════════════════════

r.get('/sentiment', (req, res) => {
  const db = D();
  // Overview
  const overview = db.prepare(`
    SELECT COUNT(*) as total,
      ROUND(AVG(rating),1) as avg_rating,
      ROUND(AVG(sentiment_score),2) as avg_sentiment,
      SUM(CASE WHEN feedback_type='compliment' THEN 1 ELSE 0 END) as compliments,
      SUM(CASE WHEN feedback_type='concern' THEN 1 ELSE 0 END) as concerns,
      SUM(CASE WHEN feedback_type='suggestion' THEN 1 ELSE 0 END) as suggestions,
      SUM(CASE WHEN responded=0 THEN 1 ELSE 0 END) as unresponded
    FROM parent_feedback
  `).get();
  // By centre
  const byCentre = db.prepare(`
    SELECT t.name as centre, t.id as tenant_id,
      COUNT(pf.id) as count, ROUND(AVG(pf.rating),1) as avg_rating,
      ROUND(AVG(pf.sentiment_score),2) as avg_sentiment,
      SUM(CASE WHEN pf.feedback_type='concern' THEN 1 ELSE 0 END) as concerns,
      SUM(CASE WHEN pf.responded=0 THEN 1 ELSE 0 END) as unresponded
    FROM parent_feedback pf JOIN tenants t ON t.id = pf.tenant_id
    GROUP BY pf.tenant_id ORDER BY avg_sentiment ASC
  `).all();
  // By category
  const byCategory = db.prepare(`
    SELECT category, COUNT(*) as count, ROUND(AVG(rating),1) as avg_rating,
      ROUND(AVG(sentiment_score),2) as avg_sentiment
    FROM parent_feedback WHERE category IS NOT NULL
    GROUP BY category ORDER BY count DESC
  `).all();
  // Recent feedback
  const recent = db.prepare(`
    SELECT pf.*, t.name as tenant_name
    FROM parent_feedback pf JOIN tenants t ON t.id = pf.tenant_id
    ORDER BY pf.created_at DESC LIMIT 30
  `).all();
  // Risk: centres with avg_sentiment below 0.3
  const atRisk = byCentre.filter(c => c.avg_sentiment < 0.3 || c.avg_rating < 3);

  res.json({ overview, byCentre, byCategory, recent, atRisk });
});

// ═══ PREDICTIVE OCCUPANCY ═══════════════════════════════════════════════════

r.get('/occupancy/predict', (req, res) => {
  const db = D();
  // Historical occupancy trends per tenant (from tenant_metrics)
  const trends = db.prepare(`
    SELECT tm.tenant_id, t.name as tenant_name, tm.date,
      tm.active_children, tm.occupancy_pct, tm.revenue_cents
    FROM tenant_metrics tm JOIN tenants t ON t.id = tm.tenant_id
    ORDER BY tm.tenant_id, tm.date
  `).all();

  // Current state per tenant
  const current = db.prepare(`
    SELECT t.id, t.name, ts.max_children,
      (SELECT COUNT(*) FROM children c WHERE c.tenant_id = t.id) as enrolled,
      (SELECT COUNT(*) FROM waitlist w WHERE w.tenant_id = t.id AND w.status = 'waiting') as waitlist
    FROM tenants t LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id
  `).all();

  // Build predictions per tenant
  const predictions = current.map(c => {
    const trendData = trends.filter(t => t.tenant_id === c.id);
    const occupancy = c.max_children > 0 ? Math.round((c.enrolled / c.max_children) * 100) : 0;

    // Simple trend: calculate avg monthly change from metrics
    let avgChange = 0;
    if (trendData.length >= 7) {
      const recent7 = trendData.slice(-7);
      const older7 = trendData.slice(-14, -7);
      if (older7.length > 0) {
        const recentAvg = recent7.reduce((s, d) => s + d.active_children, 0) / recent7.length;
        const olderAvg = older7.reduce((s, d) => s + d.active_children, 0) / older7.length;
        avgChange = recentAvg - olderAvg;
      }
    }

    // Project 3 and 6 months
    const monthlyGrowth = avgChange * 4.3; // ~4.3 weeks per month
    const predict3m = Math.min(Math.max(Math.round(c.enrolled + monthlyGrowth * 3), 0), c.max_children || 999);
    const predict6m = Math.min(Math.max(Math.round(c.enrolled + monthlyGrowth * 6), 0), c.max_children || 999);
    const occ3m = c.max_children > 0 ? Math.round((predict3m / c.max_children) * 100) : 0;
    const occ6m = c.max_children > 0 ? Math.round((predict6m / c.max_children) * 100) : 0;

    // Risk assessment
    let risk = 'stable';
    if (occupancy < 70 && avgChange <= 0) risk = 'declining';
    else if (occupancy < 70 && avgChange > 0) risk = 'recovering';
    else if (occupancy >= 90 && c.waitlist > 5) risk = 'at_capacity';
    else if (occupancy >= 85) risk = 'healthy';

    // Revenue projection (using current per-child average)
    const avgRevenuePerChild = trendData.length > 0
      ? trendData.slice(-7).reduce((s, d) => s + (d.revenue_cents || 0), 0) / (7 * Math.max(c.enrolled, 1))
      : 0;

    return {
      id: c.id, name: c.name, capacity: c.max_children || 0,
      current_enrolled: c.enrolled, current_occupancy: occupancy,
      waitlist: c.waitlist,
      predict_3m: predict3m, predict_6m: predict6m,
      occupancy_3m: occ3m, occupancy_6m: occ6m,
      monthly_growth: Math.round(monthlyGrowth * 10) / 10,
      risk,
      revenue_3m: Math.round(predict3m * avgRevenuePerChild * 30 / 100),
      revenue_6m: Math.round(predict6m * avgRevenuePerChild * 30 / 100),
    };
  });

  // Seasonal patterns (if enough data)
  const seasonal = db.prepare(`
    SELECT strftime('%m', date) as month, ROUND(AVG(occupancy_pct),1) as avg_occupancy,
      ROUND(AVG(active_children),0) as avg_children
    FROM tenant_metrics GROUP BY month ORDER BY month
  `).all();

  res.json({ predictions, seasonal, trends });
});

// ═══ CCS SUBMISSIONS ════════════════════════════════════════════════════════

r.get('/ccs/overview', (req, res) => {
  const db = D();
  // Summary stats
  const overview = db.prepare(`
    SELECT COUNT(*) as total_reports,
      SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) as drafts,
      SUM(fee_charged_cents) as total_fees,
      SUM(ccs_amount_cents) as total_ccs,
      SUM(gap_fee_cents) as total_gap,
      SUM(hours_submitted) as total_hours,
      SUM(absent_days) as total_absences
    FROM ccs_session_reports
  `).get();
  // By centre
  const byCentre = db.prepare(`
    SELECT t.name as centre, t.id as tenant_id,
      COUNT(csr.id) as reports,
      SUM(csr.fee_charged_cents) as total_fees,
      SUM(csr.ccs_amount_cents) as total_ccs,
      SUM(csr.gap_fee_cents) as total_gap,
      SUM(csr.hours_submitted) as total_hours,
      ROUND(AVG(csr.ccs_percentage),1) as avg_ccs_pct,
      SUM(CASE WHEN csr.status='approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN csr.status='submitted' THEN 1 ELSE 0 END) as pending
    FROM ccs_session_reports csr JOIN tenants t ON t.id = csr.tenant_id
    GROUP BY csr.tenant_id
  `).all();
  // Weekly reports
  const weekly = db.prepare(`
    SELECT csr.*, t.name as tenant_name, c.first_name || ' ' || c.last_name as child_name
    FROM ccs_session_reports csr
    JOIN tenants t ON t.id = csr.tenant_id
    LEFT JOIN children c ON c.id = csr.child_id
    ORDER BY csr.week_starting DESC, t.name LIMIT 50
  `).all();

  res.json({ overview, byCentre, weekly });
});

r.post('/ccs/submit/:id', (req, res) => {
  // Simulate CCS submission
  D().prepare((() => 'UPDATE ccs_session_reports SET status=\'submitted\', submitted_at=datetime(\'now\'),'
    response_code='200', response_message='Session report queued for processing',
    updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  auditLog(req.userId, null, 'ccs.session.submitted', { reportId: req.params.id }, req.ip, req.get('user-agent'));
  res.json({ ok: true, message: 'Session report submitted to CCSS' });
});

r.post('/ccs/submit-batch', (req, res) => {
  const { ids } = req.body;
  if (!ids?.length) return res.status(400).json({ error: 'No report IDs provided' });
  const stmt = D().prepare((() => 'UPDATE ccs_session_reports SET status=\'submitted\', submitted_at=datetime(\'now\'),'
    response_code='200', response_message='Batch submitted', updated_at=datetime('now') WHERE id=?`);
  ids.forEach(id => stmt.run(id));
  auditLog(req.userId, null, 'ccs.batch.submitted', { count: ids.length }, req.ip, req.get('user-agent'));
  res.json({ ok: true, submitted: ids.length });
});

export default r;
