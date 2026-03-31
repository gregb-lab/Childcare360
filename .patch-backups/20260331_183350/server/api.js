import { Router } from 'express';
import { D, uuid, auditLog } from './db.js';
import { requireAuth, requireTenant, requireRole } from './middleware.js';

// Wrap route handlers to always return JSON errors
const wrap = fn => (req, res, next) => {
  try {
    const result = fn(req, res, next);
    if (result && typeof result.catch === 'function') {
      result.catch(e => { if (!res.headersSent) res.status(500).json({ error: e.message }); });
    }
  } catch(e) { if (!res.headersSent) res.status(500).json({ error: e.message }); }
};

const router = Router();
router.use(requireAuth);
router.use(requireTenant);

// ─── TENANT INFO ────────────────────────────────────────────────────────────────
router.get('/tenant', (req, res) => {
  const tenant = D().prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenantId);
  const members = D().prepare(`
    SELECT tm.id, tm.role, tm.qualification, tm.first_aid, tm.wwcc, tm.wwcc_expiry,
           tm.is_under_18, tm.active, tm.joined_at, u.id as user_id, u.email, u.name, u.avatar_url
    FROM tenant_members tm JOIN users u ON u.id = tm.user_id WHERE tm.tenant_id = ? ORDER BY u.name
  `).all(req.tenantId);
  res.json({ tenant, members });
});

router.put('/tenant', requireAuth, requireTenant, requireRole('owner','admin','director'), (req, res) => {
  const { name, abn, address, phone, email, serviceType, nqsRating } = req.body;
  D().prepare(
    "UPDATE tenants SET name=COALESCE(?,name), abn=COALESCE(?,abn), address=COALESCE(?,address), phone=COALESCE(?,phone), email=COALESCE(?,email), service_type=COALESCE(?,service_type), nqs_rating=COALESCE(?,nqs_rating), updated_at=datetime('now') WHERE id=?"
  ).run(name, abn, address, phone, email, serviceType, nqsRating, req.tenantId);
  res.json({ success: true });
});

// ─── INVITE MEMBER ──────────────────────────────────────────────────────────────
router.post('/invite', requireAuth, requireTenant, requireRole('owner','admin','director'), (req, res) => {
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const token = uuid();
  D().prepare('INSERT INTO invitations (id,tenant_id,email,role,invited_by,token,expires_at) VALUES(?,?,?,?,?,?,?)')
    .run(uuid(), req.tenantId, email.toLowerCase(), role || 'educator', req.userId, token,
      new Date(Date.now() + 7 * 86400000).toISOString());
  auditLog(req.userId, req.tenantId, 'invite_sent', { email, role }, req.ip, req.headers['user-agent']);
  // TODO: Send invite email with link
  console.log(`  📧 Invitation: ${email} invited as ${role}. Token: ${token}`);
  res.json({ success: true, token });
});

// ─── ROOMS ──────────────────────────────────────────────────────────────────────

// GET /api/rooms/debug — returns auth state + raw DB rooms for debugging
router.get('/rooms/debug', requireAuth, requireTenant, (req, res) => {
  try {
    const rooms = D().prepare('SELECT * FROM rooms WHERE tenant_id=?').all(req.tenantId);
    const allRooms = D().prepare('SELECT id, tenant_id, name FROM rooms LIMIT 20').all();
    res.json({
      auth_ok: true,
      tenant_id: req.tenantId,
      tenant_role: req.tenantRole,
      user_id: req.userId,
      rooms_for_tenant: rooms.length,
      rooms,
      all_rooms_sample: allRooms,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/rooms', requireAuth, requireTenant, (req, res) => {
  try {
    const rows = D().prepare(`
      SELECT r.*, (SELECT COUNT(*) FROM children c WHERE c.room_id = r.id ) as child_count
      FROM rooms r WHERE r.tenant_id = ? ORDER BY r.name
    `).all(req.tenantId);
    console.log(`[GET /rooms] tenant=${req.tenantId} role=${req.tenantRole} found=${rows.length} rooms`);
    res.json(rows.map(r => ({ ...r, current_children: r.child_count || r.current_children || 0 })));
  } catch(e) {
    console.error('[GET /rooms] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/rooms', requireAuth, requireTenant, requireRole('owner', 'admin', 'director'), (req, res) => {
  try {
    const { name, capacity } = req.body;
    const ageGroup = req.body.ageGroup || 'preschool';
    console.log(`[POST /rooms] tenant=${req.tenantId} role=${req.tenantRole} name=${name}`);
    if (!name?.trim()) return res.status(400).json({ error: 'Room name is required' });
    const id = uuid();
    D().prepare('INSERT INTO rooms (id,tenant_id,name,age_group,capacity) VALUES(?,?,?,?,?)')
      .run(id, req.tenantId, name.trim(), ageGroup, capacity || 20);
    console.log(`[POST /rooms] created id=${id} tenant=${req.tenantId}`);
    res.json({ id, name: name.trim(), age_group: ageGroup, capacity: capacity || 20 });
  } catch(e) {
    console.error('[POST /rooms] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put('/rooms/:id', requireAuth, requireTenant, requireRole('owner', 'admin', 'director'), (req, res) => {
  const { name, ageGroup, capacity, currentChildren, color, description } = req.body;
  D().prepare('UPDATE rooms SET name=COALESCE(?,name), age_group=COALESCE(?,age_group), capacity=COALESCE(?,capacity), current_children=COALESCE(?,current_children) WHERE id=? AND tenant_id=?')
    .run(name, ageGroup, capacity, currentChildren ?? null, req.params.id, req.tenantId);
  res.json({ success: true });
});

router.delete('/rooms/:id', requireAuth, requireTenant, requireRole('owner', 'admin', 'director'), (req, res) => {
  const childCount = D().prepare('SELECT COUNT(*) as c FROM children WHERE room_id=? AND active=1').get(req.params.id)?.c || 0;
  if (childCount > 0) return res.status(400).json({ error: `Cannot delete room — ${childCount} active children are assigned to it. Move them first.` });
  D().prepare('DELETE FROM rooms WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
  res.json({ success: true });
});

// ─── AGE GROUP SETTINGS ──────────────────────────────────────────────────────
const DEFAULT_AGE_GROUPS = [
  { group_id: 'babies',      label: 'Babies',      sub: '0–24 months',  min_months: 0,   max_months: 24,  ratio: 4,  color: '#C9929E', sort_order: 0 },
  { group_id: 'toddlers',    label: 'Toddlers',    sub: '24–36 months', min_months: 24,  max_months: 36,  ratio: 5,  color: '#9B7DC0', sort_order: 1 },
  { group_id: 'preschool',   label: 'Preschool',   sub: '3–5 years',    min_months: 36,  max_months: 60,  ratio: 10, color: '#6BA38B', sort_order: 2 },
  { group_id: 'kindergarten',label: 'Kindergarten',sub: '4–6 years',    min_months: 48,  max_months: 72,  ratio: 10, color: '#5B8DB5', sort_order: 3 },
  { group_id: 'oshc',        label: 'OSHC',        sub: '5+ years',     min_months: 60,  max_months: 999, ratio: 15, color: '#D4A26A', sort_order: 4 },
];

function getAgeGroups(tenantId) {
  const rows = D().prepare('SELECT * FROM age_group_settings WHERE tenant_id=? ORDER BY sort_order').all(tenantId);
  if (rows.length > 0) return rows;
  // Seed defaults on first access
  const stmt = D().prepare('INSERT OR IGNORE INTO age_group_settings (id,tenant_id,group_id,label,sub,min_months,max_months,ratio,color,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)');
  DEFAULT_AGE_GROUPS.forEach(g => stmt.run(uuid(), tenantId, g.group_id, g.label, g.sub, g.min_months, g.max_months, g.ratio, g.color, g.sort_order));
  return D().prepare('SELECT * FROM age_group_settings WHERE tenant_id=? ORDER BY sort_order').all(tenantId);
}

router.get('/age-groups', requireAuth, requireTenant, (req, res) => {
  try { res.json(getAgeGroups(req.tenantId)); } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/age-groups', requireAuth, requireTenant, requireRole('owner', 'admin', 'director'), (req, res) => {
  try {
    const { group_id, label, sub, min_months, max_months, ratio, color, sort_order } = req.body;
    if (!label) return res.status(400).json({ error: 'Label is required' });
    const id = uuid();
    const gid = group_id || label.toLowerCase().replace(/[^a-z0-9]/g,'_') + '_' + Date.now();
    const maxOrder = D().prepare('SELECT MAX(sort_order) as m FROM age_group_settings WHERE tenant_id=?').get(req.tenantId)?.m || 0;
    D().prepare('INSERT INTO age_group_settings (id,tenant_id,group_id,label,sub,min_months,max_months,ratio,color,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id, req.tenantId, gid, label, sub||'', min_months||0, max_months||999, ratio||10, color||'#8B6DAF', sort_order ?? maxOrder+1);
    res.json({ id, group_id: gid });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/age-groups/:id', requireAuth, requireTenant, requireRole('owner', 'admin', 'director'), (req, res) => {
  try {
    const { label, sub, min_months, max_months, ratio, color, sort_order } = req.body;
    D().prepare('UPDATE age_group_settings SET label=COALESCE(?,label), sub=COALESCE(?,sub), min_months=COALESCE(?,min_months), max_months=COALESCE(?,max_months), ratio=COALESCE(?,ratio), color=COALESCE(?,color), sort_order=COALESCE(?,sort_order) WHERE id=? AND tenant_id=?')
      .run(label, sub, min_months, max_months, ratio, color, sort_order, req.params.id, req.tenantId);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/age-groups/:id', requireAuth, requireTenant, requireRole('owner', 'admin', 'director'), (req, res) => {
  try {
    const group = D().prepare('SELECT * FROM age_group_settings WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!group) return res.status(404).json({ error: 'Not found' });
    const roomCount = D().prepare('SELECT COUNT(*) as c FROM rooms WHERE age_group=? AND tenant_id=?').get(group.group_id, req.tenantId)?.c || 0;
    if (roomCount > 0) return res.status(400).json({ error: `Cannot delete — ${roomCount} room(s) use this age group. Change those rooms first.` });
    D().prepare('DELETE FROM age_group_settings WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── ROOM STATS ─────────────────────────────────────────────────────────────
router.get('/rooms/:id/stats', requireAuth, requireTenant, (req, res) => {
  const room = D().prepare('SELECT * FROM rooms WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const children = D().prepare('SELECT c.*, pc.name as parent_name, pc.email as parent_email, pc.phone as parent_phone FROM children c LEFT JOIN parent_contacts pc ON pc.child_id=c.id AND pc.is_primary=1 WHERE c.room_id=? AND c.active=1 ORDER BY c.first_name').all(req.params.id);
  const recentUpdates = D().prepare("SELECT du.*, c.first_name FROM daily_updates du JOIN children c ON c.id=du.child_id WHERE c.room_id=? AND du.update_date=date('now','localtime') ORDER BY du.created_at DESC LIMIT 20").all(req.params.id);
  const todayAttendance = D().prepare("SELECT COUNT(*) as present FROM attendance_sessions WHERE date=date('now','localtime') AND child_id IN (SELECT id FROM children WHERE room_id=?)").get(req.params.id);
  res.json({ room, children, recentUpdates, todayAttendance: todayAttendance?.present || 0, childCount: children.length });
});

// ─── CHILDREN ───────────────────────────────────────────────────────────────────
// GET /children handled by server/children.js

// POST /children handled by server/children.js

// PUT /children/:id removed — handled by server/children.js

// ─── OBSERVATIONS ───────────────────────────────────────────────────────────────
router.get('/observations', requireAuth, requireTenant, (req, res) => {
  const { childId, date, limit } = req.query;
  let sql = 'SELECT * FROM observations WHERE tenant_id = ?';
  const params = [req.tenantId];
  if (childId) { sql += ' AND child_id = ?'; params.push(childId); }
  if (date) { sql += ' AND timestamp LIKE ?'; params.push(date + '%'); }
  sql += ' ORDER BY timestamp DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }
  const rows = D().prepare(sql).all(...params);
  res.json(rows.map(r => ({
    ...r, domains: JSON.parse(r.domains || '[]'), eylf_outcomes: JSON.parse(r.eylf_outcomes || '[]'),
    progress_updates: JSON.parse(r.progress_updates || '{}'), media: JSON.parse(r.media || '[]'),
  })));
});

router.post('/observations', requireAuth, requireTenant, (req, res) => {
  const o = req.body;
  const id = uuid();
  D().prepare(
    'INSERT INTO observations (id,tenant_id,child_id,educator_id,type,narrative,domains,eylf_outcomes,progress_updates,media,follow_up) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
  ).run(id, req.tenantId, o.childId, req.userId, o.type || 'jotting', o.narrative,
    JSON.stringify(o.domains || []), JSON.stringify(o.eylfOutcomes || []),
    JSON.stringify(o.progressUpdates || {}), JSON.stringify(o.media || []), o.followUp || '');

  // Apply progress updates to child
  if (o.progressUpdates && Object.keys(o.progressUpdates).length > 0) {
    const child = D().prepare('SELECT domains FROM children WHERE id = ? AND tenant_id = ?').get(o.childId, req.tenantId);
    if (child) {
      const domains = JSON.parse(child.domains || '{}');
      Object.entries(o.progressUpdates).forEach(([k, v]) => { if (v) domains[k] = v; });
      D().prepare("UPDATE children SET domains = ?, updated_at = datetime('now') WHERE id = ?")
        .run(JSON.stringify(domains), o.childId);
    }
  }
  res.json({ id });
});

// ─── DAILY PLANS ────────────────────────────────────────────────────────────────
router.get('/plans', requireAuth, requireTenant, (req, res) => {
  const { roomId, date } = req.query;
  let sql = 'SELECT * FROM daily_plans WHERE tenant_id = ?';
  const params = [req.tenantId];
  if (roomId) { sql += ' AND room_id = ?'; params.push(roomId); }
  if (date) { sql += ' AND date = ?'; params.push(date); }
  sql += ' ORDER BY date DESC, created_at DESC';
  const rows = D().prepare(sql).all(...params);
  res.json(rows.map(r => ({
    ...r, focus_domains: JSON.parse(r.focus_domains || '[]'), activities: JSON.parse(r.activities || '[]'),
    differentiation: JSON.parse(r.differentiation || '{}'), reflections: JSON.parse(r.reflections || '{}'),
  })));
});

router.post('/plans', requireAuth, requireTenant, (req, res) => {
  const p = req.body;
  const id = uuid();
  D().prepare(
    'INSERT INTO daily_plans (id,tenant_id,room_id,educator_id,date,focus_domains,activities,differentiation,reflections,notes,child_count,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(id, req.tenantId, p.roomId, req.userId, p.date, JSON.stringify(p.focusDomains || []),
    JSON.stringify(p.activities || []), JSON.stringify(p.differentiation || {}),
    JSON.stringify(p.reflections || {}), p.notes || '', p.childCount || 0, 'active');
  res.json({ id });
});

// ─── MEMBER MANAGEMENT ──────────────────────────────────────────────────────────
router.put('/members/:id', requireAuth, requireTenant, requireRole('owner','admin','director'), (req, res) => {
  const { role, qualification, firstAid, wwcc, wwccExpiry, active } = req.body;
  D().prepare(
    'UPDATE tenant_members SET role=COALESCE(?,role), qualification=COALESCE(?,qualification), first_aid=COALESCE(?,first_aid), wwcc=COALESCE(?,wwcc), wwcc_expiry=COALESCE(?,wwcc_expiry), active=COALESCE(?,active) WHERE id=? AND tenant_id=?'
  ).run(role, qualification, firstAid, wwcc, wwccExpiry, active, req.params.id, req.tenantId);
  res.json({ success: true });
});

// ─── CLOCK RECORDS ──────────────────────────────────────────────────────────────
router.get('/clock-records', requireAuth, requireTenant, (req, res) => {
  const { date } = req.query;
  let sql = 'SELECT * FROM clock_records WHERE tenant_id = ?';
  const params = [req.tenantId];
  if (date) { sql += ' AND date = ?'; params.push(date); }
  res.json(D().prepare(sql + ' ORDER BY clock_in DESC').all(...params));
});

router.post('/clock-records', requireAuth, requireTenant, (req, res) => {
  const id = uuid();
  const { memberId, clockIn, date } = req.body;
  D().prepare('INSERT INTO clock_records (id,tenant_id,member_id,clock_in,date) VALUES(?,?,?,?,?)')
    .run(id, req.tenantId, memberId, clockIn || new Date().toISOString(), date || new Date().toISOString().split('T')[0]);
  res.json({ id });
});

router.put('/clock-records/:id', requireAuth, requireTenant, (req, res) => {
  const { clockOut, breakStart, breakEnd, totalBreakMins } = req.body;
  D().prepare(
    'UPDATE clock_records SET clock_out=COALESCE(?,clock_out), break_start=COALESCE(?,break_start), break_end=COALESCE(?,break_end), total_break_mins=COALESCE(?,total_break_mins) WHERE id=? AND tenant_id=?'
  ).run(clockOut, breakStart, breakEnd, totalBreakMins, req.params.id, req.tenantId);
  res.json({ success: true });
});

// ─── AUDIT LOG ──────────────────────────────────────────────────────────────────
router.get('/audit-log', requireAuth, requireTenant, requireRole('owner','admin'), (req, res) => {
  const rows = D().prepare(
    'SELECT al.*, u.name as user_name FROM audit_log al LEFT JOIN users u ON u.id = al.user_id WHERE al.tenant_id = ? ORDER BY al.created_at DESC LIMIT 100'
  ).all(req.tenantId);
  res.json(rows);
});

// ─── CURRENT USER PROFILE ───────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  const user = D().prepare('SELECT id,email,name,phone,auth_provider,mfa_enabled,mfa_method,email_verified,avatar_url,created_at FROM users WHERE id=?').get(req.userId);
  const membership = D().prepare('SELECT * FROM tenant_members WHERE user_id=? AND tenant_id=?').get(req.userId, req.tenantId);
  res.json({ user, membership });
});


// ── Peak Attendance Times ──────────────────────────────────────────────────
router.get('/attendance-peak', (req, res) => {
  try {
    // Get sign_in/sign_out from attendance_sessions for last 30 days
    const sessions = D().prepare(`
      SELECT sign_in, sign_out, date FROM attendance_sessions
      WHERE tenant_id=? AND date >= date('now','-30 days','localtime')
      AND sign_in IS NOT NULL AND absent=0
      ORDER BY date
    `).all(req.tenantId);

    // Build hourly buckets 6am-7pm
    const buckets = {};
    for (let h = 6; h <= 19; h++) buckets[h] = { hour: h, arrivals: 0, departures: 0, present: 0 };

    sessions.forEach(s => {
      if (s.sign_in) {
        const h = parseInt(s.sign_in.split(':')[0]);
        if (h >= 6 && h <= 19) buckets[h].arrivals++;
      }
      if (s.sign_out) {
        const h = parseInt(s.sign_out.split(':')[0]);
        if (h >= 6 && h <= 19) buckets[h].departures++;
      }
    });

    // If no real data, generate realistic synthetic distribution
    const totalArrivals = Object.values(buckets).reduce((s,b)=>s+b.arrivals,0);
    if (totalArrivals === 0) {
      const children = D().prepare('SELECT COUNT(*) as c FROM children WHERE tenant_id=? AND active=1').get(req.tenantId).c || 8;
      // Typical LDC arrival: peak 7:30-9:30, departure peak 3pm-5:30pm
      const arrivalDist = {6:0.05,7:0.15,8:0.30,9:0.28,10:0.12,11:0.05,12:0.03,13:0.02};
      const departureDist = {14:0.05,15:0.15,16:0.28,17:0.32,18:0.15,19:0.05};
      Object.entries(arrivalDist).forEach(([h,pct])=>{ buckets[parseInt(h)].arrivals = Math.round(pct*children); });
      Object.entries(departureDist).forEach(([h,pct])=>{ buckets[parseInt(h)].departures = Math.round(pct*children); });
    }

    // Calculate cumulative present count across the day
    let present = 0;
    const data = Object.values(buckets).map(b => {
      present += b.arrivals;
      present = Math.max(0, present - b.departures);
      return {
        time: `${b.hour}:00`,
        label: b.hour < 12 ? `${b.hour}am` : b.hour === 12 ? '12pm' : `${b.hour-12}pm`,
        arrivals: b.arrivals, departures: b.departures, present,
      };
    });

    res.json(data);
  } catch(e) {
    res.json([]);
  }
});



router.get('/dashboard/today', async (req, res) => {
  try {
    const db = D();
    const today = new Date().toISOString().split('T')[0];
    const tid = req.tenantId;

    // Children attendance today
    const attendance = db.prepare(`
      SELECT c.id, c.first_name, c.last_name, c.room_id, c.dob,
             a.sign_in_time, a.sign_out_time, a.absent, a.absent_reason
      FROM children c
      LEFT JOIN (
        SELECT child_id, sign_in_time, sign_out_time, absent, absent_reason
        FROM child_attendance WHERE date=? AND tenant_id=?
      ) a ON a.child_id=c.id
      WHERE c.tenant_id=? 
      ORDER BY c.first_name
    `).all(today, tid, tid);

    // Upcoming birthdays (next 14 days)
    const allChildren = db.prepare(`SELECT id,first_name,last_name,dob FROM children WHERE tenant_id=? `).all(tid);
    const todayD = new Date(); todayD.setHours(0,0,0,0);
    const birthdays = allChildren.filter(c => {
      if (!c.dob) return false;
      const bday = new Date(c.dob);
      const thisYear = new Date(todayD.getFullYear(), bday.getMonth(), bday.getDate());
      const diff = (thisYear - todayD) / (1000*60*60*24);
      return diff >= 0 && diff <= 14;
    }).map(c => {
      const bday = new Date(c.dob);
      const thisYear = new Date(todayD.getFullYear(), bday.getMonth(), bday.getDate());
      const diff = Math.round((thisYear - todayD) / (1000*60*60*24));
      const age = todayD.getFullYear() - bday.getFullYear();
      return { ...c, days_until: diff, turning: age };
    }).sort((a,b) => a.days_until - b.days_until);

    // Pending enrolment applications
    const pendingEnrolments = db.prepare(`SELECT COUNT(*) as c FROM enrolment_applications WHERE tenant_id=? AND status IN ('submitted','reviewing')`).get(tid)?.c || 0;

    // Expiring certs (next 30 days)
    const expiring = db.prepare(`
      SELECT first_name, last_name, 
        CASE WHEN first_aid_expiry <= date('now','+30 days') AND first_aid_expiry > date('now') THEN 'First Aid' 
             WHEN cpr_expiry <= date('now','+30 days') AND cpr_expiry > date('now') THEN 'CPR'
             WHEN wwcc_expiry <= date('now','+30 days') AND wwcc_expiry > date('now') THEN 'WWCC'
        END as cert_type,
        CASE WHEN first_aid_expiry <= date('now','+30 days') AND first_aid_expiry > date('now') THEN first_aid_expiry
             WHEN cpr_expiry <= date('now','+30 days') AND cpr_expiry > date('now') THEN cpr_expiry
             WHEN wwcc_expiry <= date('now','+30 days') AND wwcc_expiry > date('now') THEN wwcc_expiry
        END as expires_on
      FROM educators WHERE tenant_id=? AND status='active'
        AND (
          (first_aid_expiry <= date('now','+30 days') AND first_aid_expiry > date('now')) OR
          (cpr_expiry <= date('now','+30 days') AND cpr_expiry > date('now')) OR
          (wwcc_expiry <= date('now','+30 days') AND wwcc_expiry > date('now'))
        )
      ORDER BY expires_on LIMIT 5
    `).all(tid);

    // Overdue invoices
    let overdueInvoices = 0;
    try { overdueInvoices = db.prepare(`SELECT COUNT(*) as c FROM invoices WHERE tenant_id=? AND status='overdue'`).get(tid)?.c || 0; } catch(e) {}

    // Pending leave requests
    let pendingLeave = 0;
    try { pendingLeave = db.prepare(`SELECT COUNT(*) as c FROM leave_requests WHERE tenant_id=? AND status='pending'`).get(tid)?.c || 0; } catch(e) {}

    // Today's roster summary
    const rosterToday = db.prepare(`
      SELECT COUNT(*) as total_shifts,
             SUM(CASE WHEN re.status='confirmed' THEN 1 ELSE 0 END) as confirmed,
             SUM(CASE WHEN re.status='unfilled' THEN 1 ELSE 0 END) as unfilled
      FROM roster_entries re
      JOIN roster_periods rp ON rp.id=re.period_id
      WHERE re.date=? AND re.tenant_id=? AND rp.status='published'
    `).get(today, tid) || { total_shifts:0, confirmed:0, unfilled:0 };

    const present = attendance.filter(a => a.sign_in_time && !a.sign_out_time).length;
    const absent = attendance.filter(a => a.absent).length;
    const notYetArrived = attendance.filter(a => !a.sign_in_time && !a.absent).length;
    const signedOut = attendance.filter(a => a.sign_out_time).length;

    // Today's educators on roster
    let todayEducators = [];
    try {
      todayEducators = db.prepare(`
        SELECT e.first_name, e.last_name, e.qualification,
               re.start_time, re.end_time, r.name as room_name
        FROM roster_entries re
        JOIN educators e ON e.id=re.educator_id
        LEFT JOIN rooms r ON r.id=re.room_id
        JOIN roster_periods rp ON rp.id=re.period_id
        WHERE re.date=? AND re.tenant_id=? AND rp.status='published'
        ORDER BY re.start_time
      `).all(today, tid);
    } catch(e) {}

    res.json({
      today,
      attendance: { present, absent, not_arrived: notYetArrived, signed_out: signedOut, total: attendance.length },
      birthdays,
      pending_enrolments: pendingEnrolments,
      expiring_certs: expiring,
      overdue_invoices: overdueInvoices,
      pending_leave: pendingLeave,
      roster_today: rosterToday,
      today_educators: todayEducators,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default router;

// ─── ROOM EDUCATOR ASSIGNMENTS v1.9.5 ─────────────────────────────────────────
router.get('/rooms/:id/educators', requireAuth, requireTenant, (req, res) => {
  try {
    const educators = D().prepare(`
      SELECT u.id, u.name, u.email, u.role, u.qualifications, u.wwcc_number, u.photo_url
      FROM users u
      JOIN educator_room_assignments era ON era.educator_id = u.id
      WHERE era.room_id = ? AND era.tenant_id = ? AND u.active = 1
    `).all(req.params.id, req.tenantId);
    res.json(educators);
  } catch(err) { res.json([]); }
});

router.post('/rooms/:id/educators', requireAuth, requireTenant, requireRole('owner','admin','director','manager'), (req, res) => {
  try {
    const { educator_id } = req.body;
    try { D().prepare('CREATE TABLE IF NOT EXISTS educator_room_assignments (id TEXT, educator_id TEXT, room_id TEXT, tenant_id TEXT, assigned_at TEXT DEFAULT (datetime("now")), PRIMARY KEY(educator_id,room_id))').run(); } catch(e) {}
    const id = uuid();
    D().prepare('INSERT OR REPLACE INTO educator_room_assignments (id,educator_id,room_id,tenant_id) VALUES(?,?,?,?)').run(id, educator_id, req.params.id, req.tenantId);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.delete('/rooms/:id/educators/:educatorId', requireAuth, requireTenant, requireRole('owner','admin','director','manager'), (req, res) => {
  try {
    D().prepare('DELETE FROM educator_room_assignments WHERE educator_id=? AND room_id=? AND tenant_id=?').run(req.params.educatorId, req.params.id, req.tenantId);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});


