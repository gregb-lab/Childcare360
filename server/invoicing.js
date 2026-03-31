import { Router } from 'express';
import { D, uuid, auditLog } from './db.js';
import { requireAuth, requireTenant, requireRole } from './middleware.js';

const router = Router();
router.use(requireAuth);
router.use(requireTenant);

// CCS rate cap (FY2025-26)
const CCS_HOURLY_CAP = 14.63;
const CCS_RATES = [
  { max: 85279, pct: 90 }, { max: 90279, pct: 89 }, { max: 95279, pct: 88 },
  { max: 100279, pct: 87 }, { max: 105279, pct: 86 }, { max: 110279, pct: 85 },
  { max: 115279, pct: 84 }, { max: 120279, pct: 83 }, { max: 125279, pct: 82 },
  { max: 130279, pct: 81 }, { max: 135279, pct: 80 }, { max: 140279, pct: 79 },
  { max: 145279, pct: 78 }, { max: 150279, pct: 77 }, { max: 155279, pct: 76 },
  { max: 160279, pct: 75 }, { max: 165279, pct: 74 }, { max: 170279, pct: 73 },
  { max: 175279, pct: 72 }, { max: 180279, pct: 71 }, { max: 185279, pct: 70 },
  { max: 190279, pct: 69 }, { max: 195279, pct: 68 }, { max: 200279, pct: 67 },
  { max: 205279, pct: 66 }, { max: 210279, pct: 65 }, { max: 215279, pct: 64 },
  { max: 220279, pct: 63 }, { max: 225279, pct: 62 }, { max: 230279, pct: 61 },
  { max: 235279, pct: 60 }, { max: 240279, pct: 59 }, { max: 245279, pct: 58 },
  { max: 250279, pct: 57 }, { max: 255279, pct: 56 }, { max: 260279, pct: 55 },
  { max: 265279, pct: 54 }, { max: 270279, pct: 53 }, { max: 275279, pct: 52 },
  { max: 280279, pct: 51 }, { max: 285279, pct: 50 },
  { max: 355279, pct: 50 }, // plateau
  { max: 535279, pct: 20 }, // taper
];

function getCCSPercentage(income) {
  if (income <= 85279) return 90;
  if (income >= 535279) return 0;
  for (const r of CCS_RATES) { if (income <= r.max) return r.pct; }
  return 0;
}

// ── Fee schedules ───────────────────────────────────────────────────────────
router.get('/fee-schedules', (req, res) => {
  res.json(D().prepare('SELECT * FROM fee_schedules WHERE tenant_id=? AND active=1 ORDER BY name').all(req.tenantId));
});

router.post('/fee-schedules', requireAuth, requireTenant, requireRole('owner','admin','director'), (req, res) => {
  const f = req.body;
  const id = uuid();
  D().prepare('INSERT INTO fee_schedules (id,tenant_id,room_id,name,daily_fee,hourly_rate,session_hours,effective_from) VALUES(?,?,?,?,?,?,?,?)')
    .run(id, req.tenantId, f.roomId, f.name, f.dailyFee, f.hourlyRate || (f.dailyFee/(f.sessionHours||11)), f.sessionHours||11, f.effectiveFrom);
  res.json({ id });
});

// ── CCS details per child ───────────────────────────────────────────────────
router.get('/ccs/:childId', (req, res) => {
  const ccs = D().prepare('SELECT * FROM ccs_details WHERE child_id=? AND tenant_id=?').get(req.params.childId, req.tenantId);
  res.json(ccs || { ccs_percentage: 0, ccs_hours_fortnight: 72, status: 'not_configured' });
});

router.post('/ccs/:childId', (req, res) => {
  const c = req.body;
  const existing = D().prepare('SELECT id FROM ccs_details WHERE child_id=? AND tenant_id=?').get(req.params.childId, req.tenantId);
  const pct = c.ccsPercentage || (c.familyIncome ? getCCSPercentage(c.familyIncome) : 0);
  if (existing) {
    D().prepare("UPDATE ccs_details SET crn=COALESCE(?,crn),parent_crn=COALESCE(?,parent_crn),ccs_percentage=?,ccs_hours_fortnight=COALESCE(?,ccs_hours_fortnight),income_bracket=?,higher_rate=COALESCE(?,higher_rate),updated_at=datetime('now') WHERE id=?")
      .run(c.crn, c.parentCrn, pct, c.ccsHours, c.incomeBracket, c.higherRate?1:0, existing.id);
  } else {
    D().prepare('INSERT INTO ccs_details (id,tenant_id,child_id,crn,parent_crn,ccs_percentage,ccs_hours_fortnight,income_bracket,higher_rate) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(uuid(), req.tenantId, req.params.childId, c.crn, c.parentCrn, pct, c.ccsHours||72, c.incomeBracket, c.higherRate?1:0);
  }
  res.json({ success: true, ccsPercentage: pct });
});

// ── CCS calculator endpoint ─────────────────────────────────────────────────
router.post('/ccs-calculate', (req, res) => {
  const { familyIncome, dailyFee, sessionHours, daysPerWeek, secondChild } = req.body;
  const hourlyRate = dailyFee / (sessionHours || 11);
  const cappedRate = Math.min(hourlyRate, CCS_HOURLY_CAP);
  let pct = getCCSPercentage(familyIncome || 0);
  if (secondChild && familyIncome < 367563) pct = Math.min(pct + 30, 95);
  const ccsPerHour = cappedRate * (pct / 100);
  const gapPerHour = hourlyRate - ccsPerHour;
  const dailyCCS = ccsPerHour * (sessionHours || 11);
  const dailyGap = dailyFee - dailyCCS;
  const weeklyGap = dailyGap * (daysPerWeek || 3);
  const annualGap = weeklyGap * 50;
  res.json({ ccsPercentage: pct, hourlyRate: +hourlyRate.toFixed(2), cappedRate: +cappedRate.toFixed(2),
    ccsPerHour: +ccsPerHour.toFixed(2), gapPerHour: +gapPerHour.toFixed(2),
    dailyCCS: +dailyCCS.toFixed(2), dailyGap: +Math.max(0,dailyGap).toFixed(2),
    weeklyGap: +Math.max(0,weeklyGap).toFixed(2), annualGap: +Math.max(0,annualGap).toFixed(2) });
});

// ── Attendance sessions ─────────────────────────────────────────────────────
router.get('/attendance', (req, res) => {
  const { childId, from, to } = req.query;
  let sql = 'SELECT * FROM attendance_sessions WHERE tenant_id=?';
  const p = [req.tenantId];
  if (childId) { sql += ' AND child_id=?'; p.push(childId); }
  if (from) { sql += ' AND date>=?'; p.push(from); }
  if (to) { sql += ' AND date<=?'; p.push(to); }
  res.json(D().prepare(sql + ' ORDER BY date DESC,sign_in').all(...p));
});

router.post('/attendance', (req, res) => {
  const a = req.body;
  const id = uuid();
  const child = D().prepare('SELECT * FROM children WHERE id=? AND tenant_id=?').get(a.childId, req.tenantId);
  const ccs = D().prepare('SELECT * FROM ccs_details WHERE child_id=? AND tenant_id=?').get(a.childId, req.tenantId);
  const fee = D().prepare('SELECT * FROM fee_schedules WHERE tenant_id=? AND (room_id=? OR room_id IS NULL) AND active=1 ORDER BY room_id DESC LIMIT 1').get(req.tenantId, child?.room_id);
  const hours = a.hours || (fee?.session_hours || 11);
  const feeCharged = a.absent ? 0 : (fee?.daily_fee || 0);
  const ccsPct = ccs?.ccs_percentage || 0;
  const hourlyRate = fee ? fee.daily_fee / fee.session_hours : 0;
  const cappedRate = Math.min(hourlyRate, CCS_HOURLY_CAP);
  const ccsApplied = a.absent ? 0 : +(cappedRate * (ccsPct/100) * hours).toFixed(2);
  const gap = +(feeCharged - ccsApplied).toFixed(2);

  D().prepare('INSERT INTO attendance_sessions (id,tenant_id,child_id,date,sign_in,sign_out,hours,absent,absent_reason,fee_charged,ccs_applied,gap) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, req.tenantId, a.childId, a.date, a.signIn, a.signOut, hours, a.absent?1:0, a.absentReason, feeCharged, ccsApplied, Math.max(0, gap));
  res.json({ id, feeCharged, ccsApplied, gap: Math.max(0,gap) });
});

// ── Generate invoice ────────────────────────────────────────────────────────
router.post('/generate-invoice', requireAuth, requireTenant, requireRole('owner','admin','director'), (req, res) => {
  const { childId, periodStart, periodEnd } = req.body;
  if (!childId || !periodStart || !periodEnd) return res.status(400).json({ error: 'childId, periodStart, and periodEnd are required.' });
  const sessions = D().prepare('SELECT * FROM attendance_sessions WHERE child_id=? AND tenant_id=? AND date>=? AND date<=? ORDER BY date')
    .all(childId, req.tenantId, periodStart, periodEnd);
  const totalFee = sessions.reduce((s,a) => s + (a.fee_charged||0), 0);
  const totalCCS = sessions.reduce((s,a) => s + (a.ccs_applied||0), 0);
  const gapFee = Math.max(0, totalFee - totalCCS);
  // Generate invoice number
  const count = D().prepare('SELECT COUNT(*) as c FROM invoices WHERE tenant_id=?').get(req.tenantId)?.c || 0;
  const invNum = `INV-${String(count+1).padStart(5,'0')}`;
  const dueDate = new Date(Date.now() + 14*86400000).toISOString().split('T')[0];
  const id = uuid();
  D().prepare('INSERT INTO invoices (id,tenant_id,child_id,invoice_number,period_start,period_end,sessions,total_fee,ccs_amount,gap_fee,amount_due,status,due_date,issued_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, req.tenantId, childId, invNum, periodStart, periodEnd, JSON.stringify(sessions),
      +totalFee.toFixed(2), +totalCCS.toFixed(2), +gapFee.toFixed(2), +gapFee.toFixed(2), 'issued', dueDate, new Date().toISOString());
  auditLog(req.userId, req.tenantId, 'invoice_generated', { invNum, childId, amount: gapFee }, req.ip, req.headers['user-agent']);
  res.json({ id, invoiceNumber: invNum, totalFee: +totalFee.toFixed(2), ccsAmount: +totalCCS.toFixed(2), gapFee: +gapFee.toFixed(2), dueDate });
});

// ── List invoices ───────────────────────────────────────────────────────────
router.get('/invoices', (req, res) => {
  const { childId, status } = req.query;
  let sql = 'SELECT i.*, c.first_name, c.last_name FROM invoices i JOIN children c ON c.id=i.child_id WHERE i.tenant_id=?';
  const p = [req.tenantId];
  if (childId) { sql += ' AND i.child_id=?'; p.push(childId); }
  if (status) { sql += ' AND i.status=?'; p.push(status); }
  sql += ' ORDER BY i.created_at DESC';
  const rows = D().prepare(sql).all(...p);
  res.json(rows.map(r => ({ ...r, sessions: JSON.parse(r.sessions||'[]') })));
});

// ── Record payment ──────────────────────────────────────────────────────────
router.post('/payments', (req, res) => {
  const { invoiceId, amount, method, reference } = req.body;
  const inv = D().prepare('SELECT * FROM invoices WHERE id=? AND tenant_id=?').get(invoiceId, req.tenantId);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const id = uuid();
  D().prepare('INSERT INTO payments (id,tenant_id,invoice_id,child_id,amount,method,reference) VALUES(?,?,?,?,?,?,?)')
    .run(id, req.tenantId, invoiceId, inv.child_id, amount, method||'card', reference);
  const totalPaid = (inv.amount_paid||0) + amount;
  const newStatus = totalPaid >= inv.amount_due ? 'paid' : 'partial';
  D().prepare('UPDATE invoices SET amount_paid=?,status=?,paid_at=CASE WHEN ?>=amount_due THEN datetime(\'now\') ELSE paid_at END WHERE id=?')
    .run(+totalPaid.toFixed(2), newStatus, totalPaid, invoiceId);
  res.json({ id, invoiceStatus: newStatus });
});

// ── Payment methods (for parents) ───────────────────────────────────────────
router.get('/payment-methods', (req, res) => {
  res.json(D().prepare('SELECT id,type,last_four,brand,expiry_month,expiry_year,is_default FROM payment_methods WHERE user_id=?').all(req.userId));
});

router.post('/payment-methods', (req, res) => {
  const { lastFour, brand, expiryMonth, expiryYear } = req.body;
  const id = uuid();
  // Reset other defaults
  D().prepare('UPDATE payment_methods SET is_default=0 WHERE user_id=?').run(req.userId);
  D().prepare('INSERT INTO payment_methods (id,user_id,type,last_four,brand,expiry_month,expiry_year,is_default) VALUES(?,?,?,?,?,?,?,1)')
    .run(id, req.userId, 'card', lastFour, brand, expiryMonth, expiryYear);
  res.json({ id });
});

// ── Dashboard summary ───────────────────────────────────────────────────────
router.get('/summary', (req, res) => {
  const outstanding = D().prepare("SELECT SUM(amount_due-amount_paid) as total FROM invoices WHERE tenant_id=? AND status IN ('issued','partial','overdue')").get(req.tenantId);
  const thisMonth = new Date().toISOString().slice(0,7);
  const monthlyFees = D().prepare("SELECT SUM(total_fee) as fees, SUM(ccs_amount) as ccs, SUM(gap_fee) as gap FROM invoices WHERE tenant_id=? AND period_start LIKE ?").get(req.tenantId, thisMonth+'%');
  const overdue = D().prepare("SELECT COUNT(*) as c FROM invoices WHERE tenant_id=? AND status='issued' AND due_date < ?").get(req.tenantId, new Date().toISOString().split('T')[0]);
  res.json({
    outstanding: +(outstanding?.total||0).toFixed(2),
    monthlyFees: +(monthlyFees?.fees||0).toFixed(2),
    monthlyCCS: +(monthlyFees?.ccs||0).toFixed(2),
    monthlyGap: +(monthlyFees?.gap||0).toFixed(2),
    overdueCount: overdue?.c||0,
  });
});


// POST /api/invoicing/invoices/:id/email — send invoice to parent
router.post('/invoices/:id/email', requireAuth, requireTenant, async (req, res) => {
  try {
    const db = D();
    const inv = db.prepare('
      SELECT i.*, c.first_name, c.last_name,
             pc.email as parent_email, pc.name as parent_name
      FROM invoices i
      JOIN children c ON c.id=i.child_id
      LEFT JOIN parent_contacts pc ON pc.child_id=c.id AND pc.is_primary=1
      WHERE i.id=? AND i.tenant_id=?
    ').get(req.params.id, req.tenantId);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    if (!inv.parent_email) return res.status(400).json({ error: 'No parent email address on file for this child' });

    // Load SMTP config from settings
    const settings = db.prepare('SELECT * FROM tenant_settings WHERE tenant_id=?').get(req.tenantId);
    if (!settings?.smtp_host) return res.status(400).json({ error: 'SMTP not configured. Set up email in Settings → Notifications.' });

    let nodemailer;
    try { nodemailer = await import('nodemailer'); } catch(e) {
      return res.status(500).json({ error: 'nodemailer not installed — run: npm install nodemailer' });
    }

    const transporter = nodemailer.default.createTransport({
      host: settings.smtp_host, port: parseInt(settings.smtp_port)||587,
      secure: settings.smtp_secure==='true',
      auth: { user: settings.smtp_user, pass: settings.smtp_password },
      tls: { rejectUnauthorized: false },
    });

    const centreTitle = settings.service_name || 'Childcare Centre';
    const gapFee = ((inv.parent_gap||0)/100).toFixed(2);
    const totalFee = ((inv.total_fee||0)/100).toFixed(2);
    const ccsAmt = ((inv.ccs_amount||0)/100).toFixed(2);
    const dueDate = inv.due_date || 'Upon receipt';

    await transporter.sendMail({
      from: settings.smtp_from || settings.smtp_user,
      to: `${inv.parent_name||''} <${inv.parent_email}>`,
      subject: `Invoice ${inv.invoice_number} — ${centreTitle}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
          <div style="background:#3D3248;color:#fff;padding:24px;border-radius:12px 12px 0 0">
            <h1 style="margin:0;font-size:20px">${centreTitle}</h1>
            <p style="margin:4px 0 0;opacity:0.8">Childcare Invoice</p>
          </div>
          <div style="background:#f9f9f9;padding:24px;border:1px solid #eee">
            <p>Dear ${inv.parent_name||'Parent/Guardian'},</p>
            <p>Please find your invoice details for <strong>${inv.first_name} ${inv.last_name}</strong>:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr><td style="padding:8px;color:#666">Invoice Number</td><td style="padding:8px;font-weight:bold">${inv.invoice_number}</td></tr>
              <tr style="background:#fff"><td style="padding:8px;color:#666">Period</td><td style="padding:8px">${inv.period_start} to ${inv.period_end}</td></tr>
              <tr><td style="padding:8px;color:#666">Total Fees</td><td style="padding:8px">$${totalFee}</td></tr>
              <tr style="background:#fff"><td style="padding:8px;color:#666">CCS Subsidy</td><td style="padding:8px;color:#2E7D32">-$${ccsAmt}</td></tr>
              <tr style="background:#E8F5E9"><td style="padding:8px;font-weight:bold">Gap Fee Due</td><td style="padding:8px;font-weight:bold;font-size:18px;color:#1B5E20">$${gapFee}</td></tr>
              <tr><td style="padding:8px;color:#666">Due Date</td><td style="padding:8px;color:#E65100;font-weight:bold">${dueDate}</td></tr>
            </table>
            <p style="color:#666;font-size:14px">Questions? Contact us at ${settings.email||settings.phone||'the centre'}.</p>
          </div>
          <div style="background:#eee;padding:12px;text-align:center;font-size:12px;color:#888;border-radius:0 0 12px 12px">
            ${centreTitle} · ${settings.address||''}
          </div>
        </div>
      `,
    });

    res.json({ ok: true, sent_to: inv.parent_email });
  } catch(e) {
    console.error('[email invoice]', e.message);
    res.json({ error: e.message });
  }
});


// DELETE /api/invoicing/fee-schedules/:id
router.delete('/fee-schedules/:id', requireAuth, requireTenant, requireRole('owner','admin','director'), (req, res) => {
  try {
    D().prepare('UPDATE fee_schedules SET active=0 WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
export default router;
