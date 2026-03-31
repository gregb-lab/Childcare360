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
    const fields = ['first_name','last_name','email','phone','address','suburb','state','postcode','qualification','dob','start_date',
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
    const b = req.body;
    D().prepare(`INSERT INTO educators (id,tenant_id,first_name,last_name,email,phone,qualification,employment_type,
      hourly_rate_cents,start_date,dob,address,suburb,state,postcode,tax_file_number,contracted_hours,super_rate,
      super_fund_name,super_fund_usi,super_member_number,bank_account_name,bank_bsb,bank_account,
      first_aid,first_aid_expiry,cpr_expiry,anaphylaxis_expiry,asthma_expiry,wwcc_number,wwcc_expiry,photo_url,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, req.tenantId, b.first_name, b.last_name, b.email||null, b.phone||null,
        b.qualification||'cert3', b.employment_type||'casual', b.hourly_rate_cents||3200,
        b.start_date||null, b.dob||null, b.address||null, b.suburb||null, b.state||'NSW',
        b.postcode||null, b.tax_file_number||null, b.contracted_hours||null, b.super_rate||11.5,
        b.super_fund_name||null, b.super_fund_usi||null, b.super_member_number||null,
        b.bank_account_name||null, b.bank_bsb||null, b.bank_account||null,
        b.first_aid?1:0, b.first_aid_expiry||null, b.cpr_expiry||null,
        b.anaphylaxis_expiry||null, b.asthma_expiry||null, b.wwcc_number||null,
        b.wwcc_expiry||null, b.photo_url||null, 'active');
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
    const { category, document_type, label, file_name, file_size, mime_type, expiry_date, data_url } = req.body;
    if (!label) return res.status(400).json({ error: 'Label required' });
    const id = uuid();
    D().prepare(`INSERT INTO educator_documents (id,tenant_id,educator_id,category,document_type,label,file_name,file_size,mime_type,expiry_date,data_url,uploaded_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, req.tenantId, req.params.id, category, document_type||null, label, file_name, file_size||0, mime_type||null, expiry_date||null, data_url||null, req.userId);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update educator document
router.put('/:id/documents/:docId', (req, res) => {
  try {
    const { label, category, expiry_date, data_url } = req.body;
    D().prepare('UPDATE educator_documents SET label=COALESCE(?,label), category=COALESCE(?,category), expiry_date=?, data_url=COALESCE(?,data_url) WHERE id=? AND educator_id=? AND tenant_id=?')
      .run(label||null, category||null, expiry_date||null, data_url||null, req.params.docId, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
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

// GET /api/educators/:id/leave-requests — all leave for an educator
router.get('/:id/leave-requests', requireAuth, requireTenant, (req, res) => {
  try {
    const rows = D().prepare('SELECT * FROM leave_requests WHERE educator_id=? AND tenant_id=? ORDER BY created_at DESC').all(req.params.id, req.tenantId);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/educators/all-leave — all pending leave across all educators (for managers)
router.get('/all-leave', requireAuth, requireTenant, (req, res) => {
  try {
    const rows = D().prepare(`
      SELECT lr.*, e.first_name || ' ' || e.last_name as educator_name, e.qualification
      FROM leave_requests lr JOIN educators e ON e.id = lr.educator_id
      WHERE lr.tenant_id=? ORDER BY lr.status='pending' DESC, lr.created_at DESC LIMIT 100
    `).all(req.tenantId);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// POST create leave request
router.post('/:id/leave', (req, res) => {
  try {
    const { leave_type, start_date, end_date, days_requested, reason } = req.body;
    if (!start_date || !end_date) return res.status(400).json({ error: 'Start date and end date are required.' });
    // Verify educator belongs to this tenant
    const edu = D().prepare('SELECT id FROM educators WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!edu) return res.status(404).json({ error: 'Educator not found.' });
    const id = uuid();
    D().prepare(`INSERT INTO leave_requests (id,tenant_id,educator_id,leave_type,start_date,end_date,days_requested,reason,status)
      VALUES(?,?,?,?,?,?,?,?,'pending')`).run(id, req.tenantId, req.params.id, leave_type||'annual', start_date, end_date, days_requested||1, reason||null);
    res.json({ id, ok: true });
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

// ── Termination routes ───────────────────────────────────────────────────────
router.post('/:id/terminate', (req, res) => {
  try {
    const { termination_date, termination_reason, termination_notes } = req.body;
    if (!termination_date) return res.status(400).json({ error: 'Termination date required' });
    // Mark educator as inactive and set termination fields
    D().prepare(`UPDATE educators SET status='inactive', termination_date=?, termination_reason=?, termination_notes=?, updated_at=datetime('now')
      WHERE id=? AND tenant_id=?`).run(termination_date, termination_reason||null, termination_notes||null, req.params.id, req.tenantId);
    // Cancel all future roster entries from termination date
    D().prepare(`UPDATE roster_entries SET status='cancelled' WHERE educator_id=? AND tenant_id=? AND date >= ? AND status NOT IN ('cancelled')`).run(req.params.id, req.tenantId, termination_date);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/reinstate', (req, res) => {
  try {
    D().prepare(`UPDATE educators SET status='active', termination_date=NULL, termination_reason=NULL, termination_notes=NULL, updated_at=datetime('now')
      WHERE id=? AND tenant_id=?`).run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Termination document routes ───────────────────────────────────────────────
router.get('/:id/termination-documents', (req, res) => {
  try {
    const docs = D().prepare('SELECT * FROM educator_termination_documents WHERE educator_id=? AND tenant_id=? ORDER BY created_at DESC').all(req.params.id, req.tenantId);
    res.json(docs);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/termination-documents', (req, res) => {
  try {
    const { label, file_name, mime_type, data_url } = req.body;
    if (!label) return res.status(400).json({ error: 'Label required' });
    const id = uuid();
    D().prepare('INSERT INTO educator_termination_documents (id,tenant_id,educator_id,label,file_name,mime_type,data_url,uploaded_by) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, req.tenantId, req.params.id, label, file_name||null, mime_type||null, data_url||null, req.userId||null);
    res.json({ id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id/termination-documents/:docId', (req, res) => {
  try {
    D().prepare('DELETE FROM educator_termination_documents WHERE id=? AND educator_id=? AND tenant_id=?').run(req.params.docId, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Super Fund routes ────────────────────────────────────────────────────────
router.get('/super-funds', (req, res) => {
  try {
    const funds = D().prepare('SELECT * FROM super_funds WHERE tenant_id=? ORDER BY fund_name').all(req.tenantId);
    res.json(funds);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/super-funds', (req, res) => {
  try {
    const { fund_name, abn, usi, esa, address, phone, is_smsf, bank_bsb, bank_account, bank_account_name } = req.body;
    if (!fund_name) return res.status(400).json({ error: 'Fund name required' });
    const id = uuid();
    D().prepare(`INSERT OR REPLACE INTO super_funds (id,tenant_id,fund_name,abn,usi,esa,address,phone,is_smsf,bank_bsb,bank_account,bank_account_name)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, req.tenantId, fund_name, abn||null, usi||null, esa||null, address||null, phone||null, is_smsf?1:0, bank_bsb||null, bank_account||null, bank_account_name||null);
    res.json({ id, fund_name });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Special availability routes ────────────────────────────────────────────
router.get('/:id/special-availability', (req, res) => {
  try {
    const rows = D().prepare('SELECT * FROM educator_special_availability WHERE educator_id=? AND tenant_id=? ORDER BY start_date').all(req.params.id, req.tenantId);
    res.json(rows.map(r => ({ ...r, available_days: JSON.parse(r.available_days||'[]') })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/special-availability', (req, res) => {
  try {
    const { start_date, end_date, available_days, can_start_early, early_start_time, can_stay_late, late_end_time, notes } = req.body;
    if (!start_date || !end_date) return res.status(400).json({ error: 'Start and end dates required' });
    const id = uuid();
    D().prepare(`INSERT INTO educator_special_availability (id,tenant_id,educator_id,start_date,end_date,available_days,can_start_early,early_start_time,can_stay_late,late_end_time,notes)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id, req.tenantId, req.params.id, start_date, end_date, JSON.stringify(available_days||[]), can_start_early?1:0, early_start_time||null, can_stay_late?1:0, late_end_time||null, notes||null);
    res.json({ id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id/special-availability/:saId', (req, res) => {
  try {
    D().prepare('DELETE FROM educator_special_availability WHERE id=? AND educator_id=? AND tenant_id=?').run(req.params.saId, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Photo upload ─────────────────────────────────────────────────────────────
router.post('/:id/photo', requireAuth, requireTenant, (req, res) => {
  try {
    const { photo_url } = req.body;
    D().prepare('UPDATE educators SET photo_url=? WHERE id=? AND tenant_id=?').run(photo_url, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/educators/:id/verify-ner — National Educator Register verification
router.get('/:id/verify-ner', requireAuth, requireTenant, (req, res) => {
  const educator = D().prepare('SELECT id, first_name, last_name, wwcc_number, wwcc_expiry FROM educators WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
  if (!educator) return res.status(404).json({ error: 'Educator not found' });
  res.json({
    educator_id: educator.id,
    name: `${educator.first_name} ${educator.last_name}`,
    wwcc_number: educator.wwcc_number,
    status: 'pending',
    message: 'National Educator Register integration is not yet available. The register is expected to go live mid-2025.',
    register_url: 'https://www.acecqa.gov.au/national-educator-register',
  });
});


// ─── NECWR (National Early Childhood Worker Register) ────────────────────────

// GET /api/educators/necwr-status — list all educators with their NECWR status
router.get('/necwr-status', requireAuth, requireTenant, (req, res) => {
  try {
    const rows = D().prepare(`
      SELECT id, first_name, last_name, qualification, employment_type,
             necwr_status, necwr_submitted_at, necwr_confirmation, necwr_submitted_by,
             wwcc_number, wwcc_expiry, email, active, termination_date
      FROM educators
      WHERE tenant_id=? AND active=1 AND (termination_date IS NULL OR termination_date > date('now'))
      ORDER BY first_name, last_name
    `).all(req.tenantId);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/educators/:id/necwr — update NECWR submission status
router.put('/:id/necwr', requireAuth, requireTenant, (req, res) => {
  try {
    const { necwr_status, necwr_confirmation } = req.body;
    const validStatuses = ['not_submitted', 'in_progress', 'submitted', 'verified', 'rejected'];
    if (!validStatuses.includes(necwr_status)) return res.status(400).json({ error: 'Invalid status' });
    
    const now = new Date().toISOString();
    D().prepare(`
      UPDATE educators SET
        necwr_status=?,
        necwr_confirmation=?,
        necwr_submitted_at=CASE WHEN ?='submitted' THEN ? ELSE necwr_submitted_at END,
        necwr_submitted_by=CASE WHEN ?='submitted' THEN ? ELSE necwr_submitted_by END
      WHERE id=? AND tenant_id=?
    `).run(
      necwr_status, necwr_confirmation || null,
      necwr_status, now,
      necwr_status, req.userId || null,
      req.params.id, req.tenantId
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/educators/necwr-bulk — bulk update multiple educators
router.post('/necwr-bulk', requireAuth, requireTenant, (req, res) => {
  try {
    const { educator_ids, necwr_status } = req.body;
    if (!Array.isArray(educator_ids) || !educator_ids.length) return res.status(400).json({ error: 'educator_ids required' });
    const now = new Date().toISOString();
    const stmt = D().prepare(`UPDATE educators SET necwr_status=?, necwr_submitted_at=?, necwr_submitted_by=? WHERE id=? AND tenant_id=?`);
    const updateMany = D().transaction((ids) => {
      for (const id of ids) stmt.run(necwr_status, now, req.userId || null, id, req.tenantId);
    });
    updateMany(educator_ids);
    res.json({ updated: educator_ids.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// PUT /api/educators/leave/:id/decide — approve or reject a leave request
router.put('/leave/:id/decide', requireAuth, requireTenant, (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved','rejected'].includes(status)) return res.status(400).json({ error: 'status must be approved or rejected' });
    const existing = D().prepare('SELECT id FROM leave_requests WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Leave request not found' });
    D().prepare(`UPDATE leave_requests SET status=?, approved_by=?, approved_at=datetime('now'), updated_at=datetime('now') WHERE id=?`)
      .run(status, req.userName || 'manager', req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default router;
