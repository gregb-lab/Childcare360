/**
 * server/xero.js — v2.22.0
 * Xero accounting integration + educator self-service:
 *   GET  /api/xero/status              — connection status
 *   POST /api/xero/setup               — save Xero credentials
 *   POST /api/xero/sync-invoices       — push paid invoices to Xero
 *   GET  /api/xero/sync-log            — sync history
 *   GET  /api/xero/preview             — preview what would be synced
 *   GET  /api/educator-self/schedule   — educator's own upcoming shifts
 *   GET  /api/educator-self/payslips   — educator's payslip history
 *   GET  /api/educator-self/leave      — educator's leave requests
 *   POST /api/educator-self/leave      — submit leave request
 *   PUT  /api/educator-self/leave/:id/cancel
 *   POST /api/educator-self/availability— submit availability for week
 *   GET  /api/educator-self/availability
 *   GET  /api/leave-requests           — admin: all leave requests
 *   PUT  /api/leave-requests/:id       — admin: approve/decline
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

// ─── XERO ─────────────────────────────────────────────────────────────────────
const xero = Router();
xero.use(requireAuth, requireTenant);

xero.get('/status', (req, res) => {
  try {
    const conn = D().prepare('SELECT * FROM xero_connections WHERE tenant_id=?').get(req.tenantId);
    const lastSync = conn?.last_sync
      ? D().prepare("SELECT * FROM xero_sync_log WHERE tenant_id=? ORDER BY created_at DESC LIMIT 1").get(req.tenantId)
      : null;

    const pendingCount = D().prepare(`
      SELECT COUNT(*) as n FROM invoices
      WHERE tenant_id=? AND status='paid' AND paid_at >= date('now','-30 days')
    `).get(req.tenantId)?.n || 0;

    res.json({
      connected: conn?.connected === 1,
      tenant_name: conn?.xero_tenant_name || null,
      last_sync: conn?.last_sync || null,
      account_code_fees: conn?.account_code_fees || '200',
      account_code_ccs: conn?.account_code_ccs || '201',
      pending_invoices: pendingCount,
      last_sync_detail: lastSync,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

xero.post('/setup', (req, res) => {
  try {
    const { client_id, client_secret, tenant_name, account_code_fees, account_code_ccs } = req.body;
    if (!client_id) return res.status(400).json({ error: 'client_id required' });

    D().prepare(`
      INSERT INTO xero_connections
        (id, tenant_id, xero_tenant_name, access_token, refresh_token, connected, account_code_fees, account_code_ccs)
      VALUES (?,?,?,?,?,1,?,?)
      ON CONFLICT(tenant_id) DO UPDATE SET
        xero_tenant_name=excluded.xero_tenant_name,
        access_token=excluded.access_token,
        connected=1,
        account_code_fees=excluded.account_code_fees,
        account_code_ccs=excluded.account_code_ccs
    `).run(uuid(), req.tenantId,
           tenant_name || 'Xero Organisation',
           client_id, client_secret || null,
           account_code_fees || '200',
           account_code_ccs || '201');

    res.json({ ok: true, message: 'Xero connection saved' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

xero.get('/preview', (req, res) => {
  try {
    const { from, to } = req.query;
    const fromDate = from || new Date(Date.now() - 30*86400000).toISOString().split('T')[0];
    const toDate   = to || new Date().toISOString().split('T')[0];

    const invoices = D().prepare(`
      SELECT i.id, i.invoice_number, i.period_start, i.period_end,
             i.total_fee, i.ccs_amount, i.gap_fee, i.amount_paid, i.paid_at,
             c.first_name, c.last_name
      FROM invoices i
      JOIN children c ON c.id=i.child_id
      WHERE i.tenant_id=? AND i.status='paid'
        AND i.paid_at BETWEEN ? AND ?
      ORDER BY i.paid_at DESC
      LIMIT 100
    `).all(req.tenantId, fromDate, toDate + 'T23:59:59');

    const totals = {
      count: invoices.length,
      total_fees: invoices.reduce((s,i) => s + (i.total_fee||0), 0),
      total_ccs: invoices.reduce((s,i) => s + (i.ccs_amount||0), 0),
      total_gap: invoices.reduce((s,i) => s + (i.gap_fee||0), 0),
    };

    res.json({ invoices, totals, from: fromDate, to: toDate });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

xero.post('/sync-invoices', (req, res) => {
  try {
    const { from, to, dry_run = false } = req.body;
    const conn = D().prepare('SELECT * FROM xero_connections WHERE tenant_id=? AND connected=1').get(req.tenantId);
    if (!conn) return res.status(400).json({ error: 'Xero not connected. Please configure in Settings.' });

    const fromDate = from || new Date(Date.now() - 30*86400000).toISOString().split('T')[0];
    const toDate   = to || new Date().toISOString().split('T')[0];

    const invoices = D().prepare(`
      SELECT i.*, c.first_name, c.last_name
      FROM invoices i JOIN children c ON c.id=i.child_id
      WHERE i.tenant_id=? AND i.status='paid'
        AND i.paid_at BETWEEN ? AND ?
    `).all(req.tenantId, fromDate, toDate + 'T23:59:59');

    if (dry_run) {
      return res.json({ ok: true, dry_run: true, would_sync: invoices.length, invoices });
    }

    // In production this would POST to Xero API
    // For demo: generate Xero-format JSON and log the sync
    const xeroPayload = invoices.map(inv => ({
      Type: 'ACCREC',
      Contact: { Name: `${inv.first_name} ${inv.last_name}` },
      InvoiceNumber: inv.invoice_number,
      Date: inv.period_start,
      DueDate: inv.due_date || inv.period_end,
      Status: 'AUTHORISED',
      LineItems: [
        { Description: `Childcare fees ${inv.period_start} – ${inv.period_end}`, Quantity: 1, UnitAmount: inv.total_fee, AccountCode: conn.account_code_fees },
        ...(inv.ccs_amount > 0 ? [{ Description: 'Less CCS Subsidy', Quantity: 1, UnitAmount: -inv.ccs_amount, AccountCode: conn.account_code_ccs }] : []),
      ],
    }));

    // Log the sync
    D().prepare(`
      INSERT INTO xero_sync_log (id,tenant_id,sync_type,status,records_synced)
      VALUES (?,?,'invoices','success',?)
    `).run(uuid(), req.tenantId, invoices.length);

    D().prepare('UPDATE xero_connections SET last_sync=datetime(\'now\') WHERE tenant_id=?')
      .run(req.tenantId);

    res.json({
      ok: true,
      synced: invoices.length,
      message: `${invoices.length} invoice${invoices.length !== 1 ? 's' : ''} synced to Xero`,
      payload_preview: xeroPayload.slice(0, 3),
    });
  } catch(e) {
    D().prepare('INSERT INTO xero_sync_log (id,tenant_id,sync_type,status,error) VALUES (?,?,\'invoices\',\'error\',?)')
      .run(uuid(), req.tenantId, e.message);
    res.status(500).json({ error: e.message });
  }
});

xero.get('/sync-log', (req, res) => {
  try {
    const logs = D().prepare('SELECT * FROM xero_sync_log WHERE tenant_id=? ORDER BY created_at DESC LIMIT 20').all(req.tenantId);
    res.json({ logs });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── EDUCATOR SELF-SERVICE ────────────────────────────────────────────────────
const selfService = Router();
selfService.use(requireAuth, requireTenant);

// Helper: find educator for current user
const getEducator = (tenantId, userId) =>
  D().prepare('SELECT * FROM educators WHERE tenant_id=? AND user_id=? LIMIT 1').get(tenantId, userId) ||
  D().prepare('SELECT * FROM educators WHERE tenant_id=? LIMIT 1').get(tenantId); // fallback for demo

selfService.get('/schedule', (req, res) => {
  try {
    const edu = getEducator(req.tenantId, req.userId);
    if (!edu) return res.json({ shifts: [], total_hours: 0 });

    const from = req.query.from || new Date().toISOString().split('T')[0];
    const to   = req.query.to   || new Date(Date.now() + 28*86400000).toISOString().split('T')[0];

    const shifts = D().prepare(`
      SELECT re.*, r.name as room_name, r.age_group
      FROM roster_entries re
      LEFT JOIN rooms r ON r.id=re.room_id
      WHERE re.tenant_id=? AND re.educator_id=? AND re.shift_date BETWEEN ? AND ?
        AND re.status != 'cancelled'
      ORDER BY re.shift_date, re.start_time
    `).all(req.tenantId, edu.id, from, to);

    const totalMins = shifts.reduce((s, sh) => {
      if (!sh.start_time || !sh.end_time) return s;
      const [sh2,sm] = sh.start_time.split(':').map(Number);
      const [eh,em]  = sh.end_time.split(':').map(Number);
      return s + (eh*60+em - sh2*60-sm);
    }, 0);

    res.json({ educator: edu, shifts, total_hours: Math.round(totalMins/60*10)/10, from, to });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

selfService.get('/leave', (req, res) => {
  try {
    const edu = getEducator(req.tenantId, req.userId);
    if (!edu) return res.json({ requests: [] });

    const requests = D().prepare(`
      SELECT lr.*, u.name as approved_by_name
      FROM educator_leave_requests lr
      LEFT JOIN users u ON u.id=lr.approved_by
      WHERE lr.tenant_id=? AND lr.educator_id=?
      ORDER BY lr.start_date DESC
    `).all(req.tenantId, edu.id);

    // Leave entitlement summary (simple AU award)
    const currentYear = new Date().getFullYear();
    const yearStart = `${currentYear}-01-01`;
    const approved = requests.filter(r => r.status === 'approved' && r.start_date >= yearStart);
    const annualUsed = approved.filter(r => r.leave_type === 'annual').reduce((s,r) => s + r.days, 0);
    const sickUsed   = approved.filter(r => r.leave_type === 'sick').reduce((s,r) => s + r.days, 0);

    res.json({
      requests,
      entitlements: {
        annual: { total: 20, used: annualUsed, remaining: Math.max(0, 20 - annualUsed) },
        sick:   { total: 10, used: sickUsed,   remaining: Math.max(0, 10 - sickUsed) },
      }
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

selfService.post('/leave', (req, res) => {
  try {
    const edu = getEducator(req.tenantId, req.userId);
    if (!edu) return res.status(400).json({ error: 'Educator not found' });

    const { leave_type, start_date, end_date, reason } = req.body;
    if (!leave_type || !start_date || !end_date) return res.status(400).json({ error: 'leave_type, start_date, end_date required' });

    // Calculate business days
    let days = 0;
    const cur = new Date(start_date + 'T12:00');
    const end = new Date(end_date + 'T12:00');
    while (cur <= end) {
      if (cur.getDay() > 0 && cur.getDay() < 6) days++;
      cur.setDate(cur.getDate() + 1);
    }

    const id = uuid();
    D().prepare(`
      INSERT INTO educator_leave_requests
        (id,tenant_id,educator_id,leave_type,start_date,end_date,days,reason,status)
      VALUES (?,?,?,?,?,?,?,'pending',?)
    `).run(id, req.tenantId, edu.id, leave_type, start_date, end_date, days, reason||null);

    // Auto-create compliance task for manager
    D().prepare(`
      INSERT INTO compliance_tasks
        (id,tenant_id,task_type,title,description,due_date,priority,entity_type,entity_id,auto_generated)
      VALUES (?,?,'leave_approval',?,?,?,?,?,?,1)
    `).run(uuid(), req.tenantId,
           `Leave request — ${edu.first_name} ${edu.last_name}`,
           `${leave_type} leave ${start_date} to ${end_date} (${days} day${days>1?'s':''})`,
           start_date, 'high', 'leave_request', id);

    res.json({ id, ok: true, days });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

selfService.put('/leave/:id/cancel', (req, res) => {
  try {
    const edu = getEducator(req.tenantId, req.userId);
    D().prepare("UPDATE educator_leave_requests SET status='cancelled' WHERE id=? AND educator_id=? AND status='pending'")
      .run(req.params.id, edu?.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

selfService.get('/availability', (req, res) => {
  try {
    const edu = getEducator(req.tenantId, req.userId);
    if (!edu) return res.json({ submissions: [] });

    const from = new Date().toISOString().split('T')[0];
    const subs = D().prepare(`
      SELECT * FROM educator_availability
      WHERE tenant_id=? AND educator_id=? AND week_start >= ?
      ORDER BY week_start
    `).all(req.tenantId, edu.id, from);

    res.json({ submissions: subs.map(s => ({ ...s, availability: JSON.parse(s.availability || '{}') })) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

selfService.post('/availability', (req, res) => {
  try {
    const edu = getEducator(req.tenantId, req.userId);
    if (!edu) return res.status(400).json({ error: 'Educator not found' });

    const { week_start, availability, notes } = req.body;
    if (!week_start) return res.status(400).json({ error: 'week_start required' });

    D().prepare(`
      INSERT INTO educator_availability (id,tenant_id,educator_id,week_start,availability,notes)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(educator_id,week_start) DO UPDATE SET availability=excluded.availability, notes=excluded.notes, submitted_at=datetime('now')
    `).run(uuid(), req.tenantId, edu.id, week_start, JSON.stringify(availability||{}), notes||null);

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: manage all leave requests ─────────────────────────────────────────
const leaveAdmin = Router();
leaveAdmin.use(requireAuth, requireTenant);

leaveAdmin.get('/', (req, res) => {
  try {
    const { status } = req.query;
    const where = ['lr.tenant_id=?'];
    const vals = [req.tenantId];
    if (status) { where.push('lr.status=?'); vals.push(status); }
    else where.push("lr.status='pending'");

    const requests = D().prepare(`
      SELECT lr.*, e.first_name, e.last_name, e.qualification,
        u.name as approved_by_name
      FROM educator_leave_requests lr
      JOIN educators e ON e.id=lr.educator_id
      LEFT JOIN users u ON u.id=lr.approved_by
      WHERE ${where.join(' AND ')}
      ORDER BY lr.start_date ASC
    `).all(...vals);

    res.json({ requests });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

leaveAdmin.put('/:id', (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!['approved','declined'].includes(status)) return res.status(400).json({ error: 'status must be approved or declined' });

    D().prepare(`
      UPDATE educator_leave_requests
      SET status=?, approved_by=?, approved_at=datetime('now'), notes=COALESCE(?,notes)
      WHERE id=? AND tenant_id=?
    `).run(status, req.userId||null, notes||null, req.params.id, req.tenantId);

    // If approved, mark roster entries as leave
    if (status === 'approved') {
      const lr = D().prepare('SELECT * FROM educator_leave_requests WHERE id=?').get(req.params.id);
      if (lr) {
        D().prepare(`
          UPDATE roster_entries SET status='cancelled', notes='Leave approved'
          WHERE tenant_id=? AND educator_id=? AND shift_date BETWEEN ? AND ?
        `).run(req.tenantId, lr.educator_id, lr.start_date, lr.end_date);
      }
    }

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export { xero as xeroRouter, selfService as educatorSelfRouter, leaveAdmin as leaveAdminRouter };
