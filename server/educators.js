import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const router = Router();
router.use(requireAuth, requireTenant);

// GET all educators
router.get('/', (req, res) => {
  try {
    const educators = D().prepare(`
      SELECT e.*, 
        (SELECT COUNT(*) FROM roster_entries re WHERE re.educator_id = e.id AND re.date >= date('now','-30 days')) as shifts_last_30
      FROM educators e
      WHERE e.tenant_id = ?
      ORDER BY e.last_name, e.first_name
    `).all(req.tenantId);
    res.json(educators);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single educator with full profile
router.get('/:id', (req, res) => {
  try {
    const edu = D().prepare('SELECT * FROM educators WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
    if (!edu) return res.status(404).json({ error: 'Not found' });

    const availability = D().prepare('SELECT * FROM educator_availability WHERE educator_id = ? ORDER BY day_of_week').all(req.params.id);
    const absences = D().prepare('SELECT * FROM educator_absences WHERE educator_id = ? ORDER BY date DESC LIMIT 20').all(req.params.id);
    const documents = D().prepare('SELECT * FROM educator_documents WHERE educator_id = ? ORDER BY created_at DESC').all(req.params.id);
    const leaveRequests = D().prepare('SELECT * FROM leave_requests WHERE educator_id = ? ORDER BY created_at DESC').all(req.params.id);
    const rosterHistory = D().prepare(`
      SELECT re.*, r.name as room_name FROM roster_entries re
      LEFT JOIN rooms r ON re.room_id = r.id
      WHERE re.educator_id = ? ORDER BY re.date DESC LIMIT 30
    `).all(req.params.id);

    // YTD earnings calculation
    const fyStart = getFyStart();
    const ytd = D().prepare(`
      SELECT SUM(cost_cents) as total FROM roster_entries 
      WHERE educator_id = ? AND date >= ?
    `).get(req.params.id, fyStart);

    res.json({ ...edu, availability, absences, documents, leaveRequests, rosterHistory, ytdEarningsCents: ytd?.total || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update educator
router.put('/:id', (req, res) => {
  try {
    const fields = ['first_name','last_name','email','phone','address','suburb','postcode','qualification',
      'employment_type','hourly_rate_cents','annual_salary_cents','super_rate','contracted_hours',
      'max_hours_per_week','wwcc_number','wwcc_expiry','first_aid','first_aid_expiry','cpr_expiry',
      'anaphylaxis_expiry','asthma_expiry','photo_url','tax_file_number','bank_bsb','bank_account',
      'bank_account_name','super_fund_name','super_fund_usi','super_member_number','notes','status',
      'can_start_earlier_mins','can_finish_later_mins','is_lunch_cover','preferred_rooms'];
    const updates = {};
    fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    updates['updated_at'] = new Date().toISOString();
    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    D().prepare(`UPDATE educators SET ${setClause} WHERE id = ? AND tenant_id = ?`)
      .run(...Object.values(updates), req.params.id, req.tenantId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create educator
router.post('/', (req, res) => {
  try {
    const id = uuid();
    const { first_name, last_name, email, phone, qualification, employment_type, hourly_rate_cents, start_date } = req.body;
    D().prepare(`INSERT INTO educators (id,tenant_id,first_name,last_name,email,phone,qualification,employment_type,hourly_rate_cents,start_date,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id, req.tenantId, first_name, last_name, email||null, phone||null,
      qualification||'cert3', employment_type||'casual', hourly_rate_cents||3200, start_date||null, 'active');
    // Create default availability (Mon-Fri)
    for (let d = 0; d < 7; d++) {
      D().prepare('INSERT OR IGNORE INTO educator_availability (id,educator_id,day_of_week,available,start_time,end_time) VALUES(?,?,?,?,?,?)')
        .run(uuid(), id, d, d < 5 ? 1 : 0, '06:00', '18:30');
    }
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET educator YTD earnings
router.get('/:id/ytd-earnings', (req, res) => {
  try {
    const fyStart = getFyStart();
    const rows = D().prepare(`
      SELECT 
        strftime('%Y-%m', date) as month,
        SUM(cost_cents) as total_cents,
        COUNT(*) as shifts
      FROM roster_entries
      WHERE educator_id = ? AND date >= ?
      GROUP BY month ORDER BY month
    `).all(req.params.id, fyStart);
    const total = rows.reduce((s, r) => s + (r.total_cents || 0), 0);
    const edu = D().prepare('SELECT super_rate, hourly_rate_cents, annual_salary_cents, employment_type, contracted_hours FROM educators WHERE id = ?').get(req.params.id);
    const superRate = edu?.super_rate || 11.5;
    const ytdSuper = Math.round(total * superRate / 100);
    res.json({ monthlyBreakdown: rows, ytdTotal: total, ytdSuper, superRate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update availability
router.put('/:id/availability', (req, res) => {
  try {
    const { availability } = req.body; // array of {day_of_week, available, start_time, end_time}
    availability.forEach(a => {
      D().prepare(`INSERT INTO educator_availability (id,educator_id,day_of_week,available,start_time,end_time,preferred)
        VALUES(?,?,?,?,?,?,?) ON CONFLICT(educator_id,day_of_week) DO UPDATE SET
        available=excluded.available, start_time=excluded.start_time, end_time=excluded.end_time, preferred=excluded.preferred`)
        .run(uuid(), req.params.id, a.day_of_week, a.available ? 1 : 0, a.start_time, a.end_time, a.preferred ? 1 : 0);
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload educator document
router.post('/:id/documents', (req, res) => {
  try {
    const { category, document_type, label, file_name, file_size, mime_type, expiry_date } = req.body;
    const id = uuid();
    D().prepare(`INSERT INTO educator_documents (id,tenant_id,educator_id,category,document_type,label,file_name,file_size,mime_type,expiry_date,uploaded_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id, req.tenantId, req.params.id, category, document_type||null, label, file_name, file_size||0, mime_type||null, expiry_date||null, req.userId);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE educator document
router.delete('/:id/documents/:docId', (req, res) => {
  try {
    D().prepare('DELETE FROM educator_documents WHERE id = ? AND educator_id = ?').run(req.params.docId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create leave request
router.post('/:id/leave', (req, res) => {
  try {
    const { leave_type, start_date, end_date, days_requested, reason } = req.body;
    const id = uuid();
    D().prepare(`INSERT INTO leave_requests (id,tenant_id,educator_id,leave_type,start_date,end_date,days_requested,reason,status)
      VALUES(?,?,?,?,?,?,?,?,'pending')`).run(id, req.tenantId, req.params.id, leave_type||'annual', start_date, end_date, days_requested||1, reason||null);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT approve/deny leave request
router.put('/:id/leave/:leaveId', (req, res) => {
  try {
    const { status, notes } = req.body;
    D().prepare('UPDATE leave_requests SET status = ?, notes = ?, approved_by = ?, approved_at = datetime(\'now\') WHERE id = ?')
      .run(status, notes||null, req.userId, req.params.leaveId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET leave balance (calculated)
router.get('/:id/leave-balance', (req, res) => {
  try {
    const edu = D().prepare('SELECT start_date, contracted_hours, max_hours_per_week FROM educators WHERE id = ?').get(req.params.id);
    if (!edu) return res.status(404).json({ error: 'Not found' });
    const startDate = new Date(edu.start_date || '2023-01-01');
    const yearsService = (Date.now() - startDate.getTime()) / (365.25 * 24 * 3600 * 1000);
    const annualLeaveHrs = Math.min(yearsService * 152, 760); // 4 weeks accrual, max 5 years
    const personalLeaveHrs = Math.min(yearsService * 76, 228);  // 2 weeks/yr, max 3 years
    const approvedTaken = D().prepare(`SELECT SUM(days_requested * ?) as hrs FROM leave_requests WHERE educator_id = ? AND status = 'approved'`)
      .get(edu.contracted_hours / 5 || 7.6, req.params.id);
    res.json({
      annual: { accrued: Math.round(annualLeaveHrs * 10) / 10, taken: approvedTaken?.hrs || 0 },
      personal: { accrued: Math.round(personalLeaveHrs * 10) / 10, taken: 0 },
      longService: { accrued: Math.max(0, Math.round((yearsService - 7) * 8.67 * 10) / 10) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE educator (deactivate)
router.delete('/:id', (req, res) => {
  try {
    D().prepare('UPDATE educators SET status = \'inactive\', updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getFyStart() {
  const now = new Date();
  const yr = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${yr}-07-01`;
}

export default router;
