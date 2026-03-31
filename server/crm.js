/**
 * server/crm.js — v2.7.0
 * CRM for family enquiries + tour bookings
 * Scale-ready: paginated, tenant-first indexes, no N+1 queries
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

const paginate = req => {
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(200, parseInt(req.query.limit) || 50);
  return { limit, offset: (page-1)*limit, page };
};

// ─────────────────────────────────────────────────────────────────────────────
// ENQUIRIES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/crm/enquiries
r.get('/enquiries', (req, res) => {
  try {
    const { status, source, search } = req.query;
    const { limit, offset, page } = paginate(req);

    let where = ['e.tenant_id=?'];
    let vals  = [req.tenantId];
    if (status) { where.push('e.status=?'); vals.push(status); }
    if (source) { where.push('e.source=?'); vals.push(source); }
    if (search) {
      where.push('(e.first_name LIKE ? OR e.last_name LIKE ? OR e.email LIKE ? OR e.child_first_name LIKE ?)');
      const q = `%${search}%`;
      vals.push(q,q,q,q);
    }

    const rows = D().prepare(`
      SELECT e.*,
        (SELECT COUNT(*) FROM tour_bookings t WHERE t.enquiry_id=e.id) as tour_count
      FROM crm_enquiries e
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE e.status WHEN 'new' THEN 1 WHEN 'contacted' THEN 2 WHEN 'tour_booked' THEN 3 ELSE 4 END,
        e.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...vals, limit, offset);

    const total = D().prepare(
      `SELECT COUNT(*) as n FROM crm_enquiries e WHERE ${where.join(' AND ')}`
    ).get(...vals)?.n || 0;

    // Pipeline counts (for kanban header)
    const pipeline = D().prepare('
      SELECT status, COUNT(*) as n
      FROM crm_enquiries WHERE tenant_id=?
      GROUP BY status
    ').all(req.tenantId);

    res.json({
      enquiries: rows.map(e => ({...e, days_requested: JSON.parse(e.days_requested||'[]')})),
      total, page, pages: Math.ceil(total/limit),
      pipeline: pipeline.reduce((m,r) => ({...m,[r.status]:r.n}), {})
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/crm/enquiries
r.post('/enquiries', (req, res) => {
  try {
    const { first_name, last_name, email, phone, child_first_name, child_dob,
            preferred_start_date, preferred_room, days_requested, message,
            source, assigned_to } = req.body;

    const ageMonths = child_dob
      ? Math.floor((Date.now() - new Date(child_dob))/(1000*60*60*24*30.44))
      : null;

    // Auto next follow-up in 24hrs
    const nextFollowUp = new Date(Date.now() + 24*60*60*1000).toISOString().split('T')[0];

    const id = uuid();
    D().prepare('
      INSERT INTO crm_enquiries
        (id,tenant_id,first_name,last_name,email,phone,child_first_name,child_dob,
         child_age_months,preferred_start_date,preferred_room,days_requested,
         message,source,assigned_to,next_follow_up)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ').run(id, req.tenantId, first_name||null, last_name||null, email||null, phone||null,
           child_first_name||null, child_dob||null, ageMonths,
           preferred_start_date||null, preferred_room||null,
           JSON.stringify(days_requested||[]), message||null,
           source||'website', assigned_to||null, nextFollowUp);

    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/crm/enquiries/:id
r.put('/enquiries/:id', (req, res) => {
  try {
    const { status, notes, assigned_to, next_follow_up, lost_reason } = req.body;
    D().prepare('
      UPDATE crm_enquiries SET
        status=COALESCE(?,status),
        notes=COALESCE(?,notes),
        assigned_to=COALESCE(?,assigned_to),
        next_follow_up=COALESCE(?,next_follow_up),
        lost_reason=COALESCE(?,lost_reason),
        last_contact=CASE WHEN ? IS NOT NULL THEN date(\'now\') ELSE last_contact END,
        updated_at=datetime(\'now\')
      WHERE id=? AND tenant_id=?
    ').run(status||null, notes||null, assigned_to||null, next_follow_up||null,
           lost_reason||null, status||null, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// TOUR BOOKINGS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/crm/tours?from=&to=
r.get('/tours', (req, res) => {
  try {
    const { limit, offset, page } = paginate(req);
    const today = new Date().toISOString().split('T')[0];
    const from  = req.query.from || today;
    const to    = req.query.to   || new Date(Date.now()+30*86400000).toISOString().split('T')[0];

    const rows = D().prepare('
      SELECT t.*, e.first_name as conducted_first, e.last_name as conducted_last
      FROM tour_bookings t
      LEFT JOIN educators e ON e.id=t.conducted_by
      WHERE t.tenant_id=? AND t.booked_date BETWEEN ? AND ?
      ORDER BY t.booked_date, t.booked_time
      LIMIT ? OFFSET ?
    ').all(req.tenantId, from, to, limit, offset);

    const total = D().prepare(
      `SELECT COUNT(*) as n FROM tour_bookings WHERE tenant_id=? AND booked_date BETWEEN ? AND ?`
    ).get(req.tenantId, from, to)?.n || 0;

    // Available time slots (9am-4pm, 30min, exclude already booked)
    const bookedTimes = D().prepare(
      `SELECT booked_date || ' ' || booked_time as slot FROM tour_bookings WHERE tenant_id=? AND booked_date >= ? AND status='confirmed'`
    ).all(req.tenantId, today).map(r => r.slot);

    res.json({ tours: rows, total, page, pages: Math.ceil(total/limit), booked_slots: bookedTimes });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/crm/tours
r.post('/tours', (req, res) => {
  try {
    const { enquiry_id, family_name, family_email, family_phone, child_name,
            child_dob, booked_date, booked_time, conducted_by, notes } = req.body;

    if (!family_name || !booked_date || !booked_time)
      return res.status(400).json({ error: 'family_name, booked_date, booked_time required' });

    // Conflict check
    const conflict = D().prepare(
      `SELECT id FROM tour_bookings WHERE tenant_id=? AND booked_date=? AND booked_time=? AND status='confirmed'`
    ).get(req.tenantId, booked_date, booked_time);
    if (conflict) return res.status(409).json({ error: 'Time slot already booked' });

    const id = uuid();
    D().prepare('
      INSERT INTO tour_bookings
        (id,tenant_id,enquiry_id,family_name,family_email,family_phone,
         child_name,child_dob,booked_date,booked_time,conducted_by,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ').run(id, req.tenantId, enquiry_id||null, family_name, family_email||null,
           family_phone||null, child_name||null, child_dob||null,
           booked_date, booked_time, conducted_by||null, notes||null);

    // Update enquiry status
    if (enquiry_id) {
      D().prepare('UPDATE crm_enquiries SET status=\'tour_booked\', tour_id=? WHERE id=? AND tenant_id=?')
        .run(id, enquiry_id, req.tenantId);
    }

    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/crm/tours/:id
r.put('/tours/:id', (req, res) => {
  try {
    const { status, notes, outcome, followup_done, conducted_by } = req.body;
    D().prepare('
      UPDATE tour_bookings SET
        status=COALESCE(?,status), notes=COALESCE(?,notes),
        outcome=COALESCE(?,outcome), followup_done=COALESCE(?,followup_done),
        conducted_by=COALESCE(?,conducted_by)
      WHERE id=? AND tenant_id=?
    ').run(status||null, notes||null, outcome||null,
           followup_done!=null?followup_done:null, conducted_by||null,
           req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/crm/dashboard — pipeline summary + follow-ups due
r.get('/dashboard', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const pipeline = D().prepare('
      SELECT status, COUNT(*) as n, MIN(created_at) as oldest
      FROM crm_enquiries WHERE tenant_id=?
      GROUP BY status
    ').all(req.tenantId);

    const followUps = D().prepare('
      SELECT id, first_name, last_name, child_first_name, email, phone,
             status, next_follow_up, last_contact
      FROM crm_enquiries
      WHERE tenant_id=? AND next_follow_up <= ? AND status NOT IN (\'enrolled\',\'lost\')
      ORDER BY next_follow_up
      LIMIT 20
    ').all(req.tenantId, today);

    const upcomingTours = D().prepare('
      SELECT * FROM tour_bookings
      WHERE tenant_id=? AND booked_date >= ? AND status=\'confirmed\'
      ORDER BY booked_date, booked_time LIMIT 10
    ').all(req.tenantId, today);

    const monthlyConversions = D().prepare('
      SELECT
        strftime(\'%Y-%m\', created_at) as month,
        COUNT(*) as enquiries,
        SUM(CASE WHEN status=\'enrolled\' THEN 1 ELSE 0 END) as enrolled
      FROM crm_enquiries WHERE tenant_id=? AND created_at >= date(\'now\',\'-6 months\')
      GROUP BY month ORDER BY month
    ').all(req.tenantId);

    res.json({ pipeline, followUps, upcomingTours, monthlyConversions });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
