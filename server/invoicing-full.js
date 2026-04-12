/**
 * server/invoicing-full.js — v2.21.0
 * Complete invoicing engine:
 *   GET  /api/invoicing-full/summary           — dashboard summary
 *   GET  /api/invoicing-full/invoices           — invoice list with filters
 *   GET  /api/invoicing-full/invoices/:id       — invoice detail with line items
 *   POST /api/invoicing-full/invoices           — create invoice
 *   PUT  /api/invoicing-full/invoices/:id       — update invoice
 *   POST /api/invoicing-full/invoices/:id/issue — issue (send) invoice
 *   POST /api/invoicing-full/invoices/:id/pay   — record payment
 *   POST /api/invoicing-full/bulk-generate      — auto-generate from attendance
 *   GET  /api/invoicing-full/statements/:childId — account statement
 *   GET  /api/invoicing-full/fee-schedules      — room fee schedules
 *   POST /api/invoicing-full/fee-schedules      — create/update fee schedule
 *   GET  /api/invoicing-full/payment-plans      — payment plans
 *   POST /api/invoicing-full/payment-plans      — create payment plan
 *   PUT  /api/invoicing-full/payment-plans/:id/pay — record plan instalment
 *   GET  /api/invoicing-full/credit-notes       — credit notes
 *   POST /api/invoicing-full/credit-notes       — issue credit note
 *   GET  /api/invoicing-full/templates          — invoice templates
 *   POST /api/invoicing-full/templates          — save template
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

// Data migration: fix room ID mismatch (room-kookas → room-kookaburras)
try {
  const roomExists = D().prepare("SELECT id FROM rooms WHERE id='room-kookaburras' LIMIT 1").get();
  if (roomExists) {
    D().prepare("UPDATE fee_schedules SET room_id='room-kookaburras' WHERE room_id='room-kookas'").run();
  }
} catch(e) { /* ignore if already correct */ }

const c2d = cents => (cents || 0) / 100;
const d2c = dollars => Math.round((parseFloat(dollars) || 0) * 100);

// ── Invoice number generation ─────────────────────────────────────────────────
function nextInvoiceNumber(tenantId) {
  const last = D().prepare(
    "SELECT invoice_number FROM invoices WHERE tenant_id=? ORDER BY created_at DESC LIMIT 1"
  ).get(tenantId);
  if (!last) return 'INV-0001';
  const match = last.invoice_number.match(/(\d+)$/);
  if (!match) return 'INV-0001';
  const next = parseInt(match[1]) + 1;
  return last.invoice_number.replace(/\d+$/, String(next).padStart(4, '0'));
}

// ── Summary ───────────────────────────────────────────────────────────────────
r.get('/summary', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0,7) + '-01';

    const summary = D().prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) as drafts,
        SUM(CASE WHEN status='issued' THEN 1 ELSE 0 END) as issued,
        SUM(CASE WHEN status='overdue' THEN 1 ELSE 0 END) as overdue,
        SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN status IN ('issued','overdue') THEN amount_due*100 ELSE 0 END) as outstanding_cents,
        SUM(CASE WHEN status='paid' AND paid_at >= ? THEN amount_paid*100 ELSE 0 END) as collected_this_month_cents,
        SUM(CASE WHEN status='overdue' THEN amount_due*100 ELSE 0 END) as overdue_cents
      FROM invoices WHERE tenant_id=?
    `).get(monthStart, req.tenantId);

    // Auto-update overdue status
    D().prepare(`
      UPDATE invoices SET status='overdue'
      WHERE tenant_id=? AND status='issued' AND due_date < date('now')
    `).run(req.tenantId);

    const pendingPlans = D().prepare(
      "SELECT COUNT(*) as n FROM payment_plans WHERE tenant_id=? AND status='active'"
    ).get(req.tenantId)?.n || 0;

    const availableCredits = D().prepare(
      "SELECT COALESCE(SUM(amount_cents),0) as total FROM credit_notes WHERE tenant_id=? AND status='available'"
    ).get(req.tenantId)?.total || 0;

    res.json({
      ...summary,
      outstanding: c2d(summary.outstanding_cents),
      collected_this_month: c2d(summary.collected_this_month_cents),
      overdue_amount: c2d(summary.overdue_cents),
      pending_payment_plans: pendingPlans,
      available_credits: c2d(availableCredits),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Invoice list ──────────────────────────────────────────────────────────────
r.get('/invoices', (req, res) => {
  try {
    const { status, child_id, from, to, search, limit = 50, offset = 0 } = req.query;

    // Auto-mark overdue
    D().prepare("UPDATE invoices SET status='overdue' WHERE tenant_id=? AND status='issued' AND due_date < date('now')")
      .run(req.tenantId);

    const where = ['i.tenant_id=?'];
    const vals  = [req.tenantId];
    if (status)   { where.push('i.status=?'); vals.push(status); }
    if (child_id) { where.push('i.child_id=?'); vals.push(child_id); }
    if (from)     { where.push('i.period_start >= ?'); vals.push(from); }
    if (to)       { where.push('i.period_end <= ?'); vals.push(to); }
    if (search)   { where.push('(c.first_name || " " || c.last_name LIKE ? OR i.invoice_number LIKE ?)'); vals.push(`%${search}%`, `%${search}%`); }

    const total = D().prepare(
      `SELECT COUNT(*) as n FROM invoices i LEFT JOIN children c ON c.id=i.child_id WHERE ${where.join(' AND ')}`
    ).get(...vals)?.n || 0;

    const invoices = D().prepare(`
      SELECT i.*, c.first_name, c.last_name, r.name as room_name,
        CAST(julianday('now') - julianday(i.due_date) AS INTEGER) as days_overdue
      FROM invoices i
      LEFT JOIN children c ON c.id=i.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE ${where.join(' AND ')}
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...vals, parseInt(limit), parseInt(offset));

    res.json({ invoices, total, pages: Math.ceil(total/parseInt(limit)) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Invoice detail ────────────────────────────────────────────────────────────
r.get('/invoices/:id', (req, res) => {
  try {
    const invoice = D().prepare(`
      SELECT i.*, c.first_name, c.last_name, c.dob, c.crn_number,
             r.name as room_name, r.age_group,
             cd.ccs_percentage, cd.ccs_hours_fortnight
      FROM invoices i
      JOIN children c ON c.id=i.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      LEFT JOIN ccs_details cd ON cd.child_id=c.id AND cd.tenant_id=i.tenant_id
      WHERE i.id=? AND i.tenant_id=?
    `).get(req.params.id, req.tenantId);

    if (!invoice) return res.status(404).json({ error: 'Not found' });

    const lineItems = D().prepare(
      'SELECT * FROM invoice_line_items WHERE invoice_id=? ORDER BY sort_order, date'
    ).all(req.params.id);

    const payments = D().prepare(
      'SELECT * FROM payments WHERE invoice_id=? ORDER BY payment_date DESC'
    ).all(req.params.id);

    const creditNotes = D().prepare(
      "SELECT * FROM credit_notes WHERE applied_to_invoice=? AND tenant_id=?"
    ).all(req.params.id, req.tenantId);

    const template = D().prepare(
      'SELECT * FROM invoice_templates WHERE tenant_id=? AND is_default=1 LIMIT 1'
    ).get(req.tenantId);

    res.json({
      invoice: { ...invoice, sessions: JSON.parse(invoice.sessions || '[]') },
      line_items: lineItems,
      payments,
      credit_notes: creditNotes,
      template,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Create invoice ────────────────────────────────────────────────────────────
r.post('/invoices', (req, res) => {
  try {
    const {
      child_id, period_start, period_end,
      line_items = [], notes, due_date,
      apply_ccs = true,
    } = req.body;

    if (!child_id) return res.status(400).json({ error: 'child_id required' });

    // Calculate totals
    const grossCents = line_items.reduce((s, item) => s + d2c(item.unit_price) * (item.quantity || 1), 0);

    // CCS calculation
    let ccsCents = 0;
    if (apply_ccs) {
      const ccsDetails = D().prepare(
        "SELECT * FROM ccs_details WHERE child_id=? AND tenant_id=? AND status='active' LIMIT 1"
      ).get(child_id, req.tenantId);
      if (ccsDetails?.ccs_percentage > 0) {
        // Get room hourly cap
        const child = D().prepare('SELECT room_id FROM children WHERE id=?').get(child_id);
        const roomSchedule = child?.room_id ? D().prepare(
          'SELECT * FROM fee_schedules WHERE room_id=? AND tenant_id=? AND active=1 LIMIT 1'
        ).get(child.room_id, req.tenantId) : null;

        const hourlyRate = roomSchedule?.hourly_rate || 15.04; // LDC cap 2025-26
        const sessionHours = roomSchedule?.session_hours || 11;
        const sessions = line_items.filter(i => i.item_type === 'fee' || !i.item_type).length;
        const cappedAmount = hourlyRate * sessionHours * sessions;
        const feeForCCS = Math.min(grossCents / 100, cappedAmount);
        ccsCents = Math.round(feeForCCS * (ccsDetails.ccs_percentage / 100) * 100);
      }
    }

    const gapCents = grossCents - ccsCents;
    const id = uuid();
    const invoiceNumber = nextInvoiceNumber(req.tenantId);
    const dueDate = due_date || new Date(Date.now() + 14*86400000).toISOString().split('T')[0];

    D().prepare(`
      INSERT INTO invoices
        (id,tenant_id,child_id,invoice_number,period_start,period_end,
         total_fee,ccs_amount,gap_fee,amount_due,due_date,status,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'draft',?)
    `).run(id, req.tenantId, child_id, invoiceNumber,
           period_start || new Date().toISOString().split('T')[0],
           period_end   || new Date().toISOString().split('T')[0],
           grossCents/100, ccsCents/100, gapCents/100, gapCents/100,
           dueDate, notes || null);

    // Insert line items
    const insertItem = D().prepare(`
      INSERT INTO invoice_line_items
        (id,tenant_id,invoice_id,description,quantity,unit_price_cents,total_cents,item_type,date,sort_order)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `);
    D().transaction(() => {
      line_items.forEach((item, i) => {
        const unitCents = d2c(item.unit_price);
        const qty = item.quantity || 1;
        insertItem.run(uuid(), req.tenantId, id,
          item.description, qty, unitCents, unitCents * qty,
          item.item_type || 'fee', item.date || null, i);
      });
    })();

    res.json({ id, invoice_number: invoiceNumber, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Update invoice ────────────────────────────────────────────────────────────
r.put('/invoices/:id', (req, res) => {
  try {
    const { notes, due_date, status, line_items } = req.body;

    const updates = [];
    const vals = [];
    if (notes !== undefined)    { updates.push('notes=?'); vals.push(notes); }
    if (due_date)               { updates.push('due_date=?'); vals.push(due_date); }
    if (status)                 { updates.push('status=?'); vals.push(status); }

    if (updates.length > 0) {
      D().prepare((() => 'UPDATE invoices SET ' + updates.join(',') + ' WHERE id=? AND tenant_id=?')())
        .run(...vals, req.params.id, req.tenantId);
    }

    if (line_items) {
      D().prepare('DELETE FROM invoice_line_items WHERE invoice_id=?').run(req.params.id);
      const insertItem = D().prepare(`
        INSERT INTO invoice_line_items
          (id,tenant_id,invoice_id,description,quantity,unit_price_cents,total_cents,item_type,date,sort_order)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `);

      let gross = 0;
      D().transaction(() => {
        line_items.forEach((item, i) => {
          const unitCents = d2c(item.unit_price);
          const qty = item.quantity || 1;
          const totalCents = unitCents * qty;
          gross += totalCents;
          insertItem.run(uuid(), req.tenantId, req.params.id,
            item.description, qty, unitCents, totalCents,
            item.item_type || 'fee', item.date || null, i);
        });
      })();

      D().prepare('UPDATE invoices SET total_fee=?, amount_due=? WHERE id=? AND tenant_id=?')
        .run(gross/100, gross/100, req.params.id, req.tenantId);
    }

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Issue invoice ─────────────────────────────────────────────────────────────
r.post('/invoices/:id/issue', (req, res) => {
  try {
    D().prepare(`
      UPDATE invoices SET status='issued', issued_at=datetime('now')
      WHERE id=? AND tenant_id=? AND status='draft'
    `).run(req.params.id, req.tenantId);

    const inv = D().prepare(
      'SELECT i.*, c.first_name, c.last_name FROM invoices i JOIN children c ON c.id=i.child_id WHERE i.id=?'
    ).get(req.params.id);

    // Create payment request
    if (inv) {
      D().prepare(`
        INSERT OR IGNORE INTO payment_requests
          (id,tenant_id,child_id,invoice_id,amount_cents,description,status)
        VALUES (?,?,?,?,?,'Gap fee — ' || ?,  'pending')
      `).run(uuid(), req.tenantId, inv.child_id, inv.id,
             Math.round(inv.gap_fee * 100), inv.invoice_number);
    }

    res.json({ ok: true, message: `Invoice ${inv?.invoice_number} issued` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Record payment ────────────────────────────────────────────────────────────
r.post('/invoices/:id/pay', (req, res) => {
  try {
    const { amount, method = 'bank_transfer', reference, payment_date } = req.body;
    if (!amount) return res.status(400).json({ error: 'amount required' });

    const inv = D().prepare('SELECT * FROM invoices WHERE id=? AND tenant_id=?')
      .get(req.params.id, req.tenantId);
    if (!inv) return res.status(404).json({ error: 'Not found' });

    const amountNum = parseFloat(amount);
    const newPaid = (inv.amount_paid || 0) + amountNum;
    const fullyPaid = newPaid >= (inv.amount_due || 0) - 0.01;

    D().prepare(`
      INSERT INTO payments (id,tenant_id,invoice_id,child_id,amount,method,reference,payment_date)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(uuid(), req.tenantId, req.params.id, inv.child_id,
           amountNum, method, reference || null,
           payment_date || new Date().toISOString().split('T')[0]);

    D().prepare(`
      UPDATE invoices SET amount_paid=?,
        status=CASE WHEN ? THEN 'paid' ELSE status END,
        paid_at=CASE WHEN ? THEN datetime('now') ELSE paid_at END
      WHERE id=?
    `).run(newPaid, fullyPaid ? 1 : 0, fullyPaid ? 1 : 0, req.params.id);

    // Mark payment request as paid
    D().prepare("UPDATE payment_requests SET status='paid', paid_at=datetime('now'), payment_method=? WHERE invoice_id=? AND tenant_id=?")
      .run(method, req.params.id, req.tenantId);

    res.json({ ok: true, fully_paid: fullyPaid, amount_paid: newPaid });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Bulk generate invoices from attendance ────────────────────────────────────
r.post('/bulk-generate', (req, res) => {
  try {
    const { period_start, period_end, room_ids, include_ccs = true } = req.body;
    if (!period_start || !period_end) return res.status(400).json({ error: 'period_start and period_end required' });

    const where = ['c.tenant_id=?', 'c.active=1'];
    const vals  = [req.tenantId];
    if (room_ids?.length) {
      where.push(`c.room_id IN (${room_ids.map(() => '?').join(',')})`);
      vals.push(...room_ids);
    }

    const children = D().prepare(`
      SELECT c.id, c.first_name, c.last_name, c.room_id,
             fs.daily_fee, fs.session_hours, fs.hourly_rate
      FROM children c
      LEFT JOIN fee_schedules fs ON fs.room_id=c.room_id AND fs.tenant_id=c.tenant_id AND fs.active=1
      WHERE ${where.join(' AND ')}
    `).all(...vals);

    let created = 0, skipped = 0;

    D().transaction(() => {
      for (const child of children) {
        // Check for existing invoice for this period
        const existing = D().prepare(
          'SELECT id FROM invoices WHERE tenant_id=? AND child_id=? AND period_start=? AND period_end=?'
        ).get(req.tenantId, child.id, period_start, period_end);

        if (existing) { skipped++; continue; }

        // Get attendance sessions for the period
        const sessions = D().prepare(`
          SELECT date, sign_in, sign_out, hours FROM attendance_sessions
          WHERE tenant_id=? AND child_id=? AND date BETWEEN ? AND ? AND absent=0
          ORDER BY date
        `).all(req.tenantId, child.id, period_start, period_end);

        if (sessions.length === 0 && !req.body.include_absent) { skipped++; continue; }

        const dailyFee = child.daily_fee || 135; // fallback
        const grossCents = sessions.length * Math.round(dailyFee * 100);

        // CCS
        let ccsCents = 0;
        if (include_ccs) {
          const ccsDetails = D().prepare(
            "SELECT * FROM ccs_details WHERE child_id=? AND tenant_id=? AND status='active' LIMIT 1"
          ).get(child.id, req.tenantId);

          if (ccsDetails?.ccs_percentage > 0) {
            const hourlyRate = child.hourly_rate || 15.04;
            const sessionHrs = child.session_hours || 11;
            const cappedFee = Math.min(dailyFee, hourlyRate * sessionHrs);
            ccsCents = Math.round(cappedFee * sessions.length * (ccsDetails.ccs_percentage / 100) * 100);
          }
        }

        const gapCents = grossCents - ccsCents;
        const invoiceId = uuid();
        const invoiceNumber = nextInvoiceNumber(req.tenantId);
        const dueDate = new Date(new Date(period_end+'T12:00').getTime() + 14*86400000).toISOString().split('T')[0];

        D().prepare(`
          INSERT INTO invoices
            (id,tenant_id,child_id,invoice_number,period_start,period_end,
             sessions,total_fee,ccs_amount,gap_fee,amount_due,due_date,status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'draft')
        `).run(invoiceId, req.tenantId, child.id, invoiceNumber,
               period_start, period_end, JSON.stringify(sessions),
               grossCents/100, ccsCents/100, gapCents/100, gapCents/100, dueDate);

        // Line items
        sessions.forEach((s, i) => {
          D().prepare(`
            INSERT INTO invoice_line_items
              (id,tenant_id,invoice_id,description,quantity,unit_price_cents,total_cents,item_type,date,sort_order)
            VALUES (?,?,?,?,1,?,?,?,?,?)
          `).run(uuid(), req.tenantId, invoiceId,
                 `Childcare — ${new Date(s.date+'T12:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})}`,
                 Math.round(dailyFee * 100), Math.round(dailyFee * 100), 'fee', s.date, i);
        });

        created++;
      }
    })();

    res.json({ ok: true, created, skipped, period_start, period_end });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Account statement ─────────────────────────────────────────────────────────
r.get('/statements/:childId', (req, res) => {
  try {
    const child = D().prepare(
      'SELECT c.*, r.name as room_name FROM children c LEFT JOIN rooms r ON r.id=c.room_id WHERE c.id=? AND c.tenant_id=?'
    ).get(req.params.childId, req.tenantId);
    if (!child) return res.status(404).json({ error: 'Child not found' });

    const invoices = D().prepare(`
      SELECT * FROM invoices WHERE tenant_id=? AND child_id=? ORDER BY period_start DESC
    `).all(req.tenantId, req.params.childId);

    const payments = D().prepare(`
      SELECT p.*, i.invoice_number FROM payments p
      LEFT JOIN invoices i ON i.id=p.invoice_id
      WHERE p.tenant_id=? AND p.child_id=? ORDER BY p.payment_date DESC
    `).all(req.tenantId, req.params.childId);

    const credits = D().prepare(
      "SELECT * FROM credit_notes WHERE tenant_id=? AND child_id=? ORDER BY created_at DESC"
    ).all(req.tenantId, req.params.childId);

    const plan = D().prepare(
      "SELECT * FROM payment_plans WHERE tenant_id=? AND child_id=? AND status='active' LIMIT 1"
    ).get(req.tenantId, req.params.childId);

    const totals = {
      total_billed: invoices.reduce((s,i) => s + (i.amount_due||0), 0),
      total_paid: payments.reduce((s,p) => s + (p.amount||0), 0),
      total_credits: credits.filter(c=>c.status==='available').reduce((s,c) => s + c.amount_cents/100, 0),
      balance_due: invoices.filter(i=>['issued','overdue'].includes(i.status)).reduce((s,i) => s + ((i.amount_due||0)-(i.amount_paid||0)), 0),
    };

    res.json({ child, invoices, payments, credits, payment_plan: plan, totals });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Fee schedules ─────────────────────────────────────────────────────────────
r.get('/fee-schedules', (req, res) => {
  try {
    const schedules = D().prepare(`
      SELECT fs.*, r.name as room_name, r.age_group
      FROM fee_schedules fs
      LEFT JOIN rooms r ON r.id=fs.room_id
      WHERE fs.tenant_id=? AND fs.active=1
      ORDER BY r.name
    `).all(req.tenantId);
    res.json({ schedules });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/fee-schedules', (req, res) => {
  try {
    const { room_id, name, daily_fee, hourly_rate, session_hours, effective_from } = req.body;
    if (!daily_fee) return res.status(400).json({ error: 'daily_fee required' });

    // Deactivate old schedule for this room
    if (room_id) {
      D().prepare('UPDATE fee_schedules SET active=0 WHERE tenant_id=? AND room_id=?')
        .run(req.tenantId, room_id);
    }

    const id = uuid();
    D().prepare(`
      INSERT INTO fee_schedules
        (id,tenant_id,room_id,name,daily_fee,hourly_rate,session_hours,effective_from,active)
      VALUES (?,?,?,?,?,?,?,?,1)
    `).run(id, req.tenantId, room_id||null, name||'Standard Fee',
           parseFloat(daily_fee), hourly_rate ? parseFloat(hourly_rate) : null,
           session_hours ? parseFloat(session_hours) : 11,
           effective_from || new Date().toISOString().split('T')[0]);

    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.delete('/fee-schedules/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM fee_schedules WHERE id=? AND tenant_id=?')
      .run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Payment plans ─────────────────────────────────────────────────────────────
r.get('/payment-plans', (req, res) => {
  try {
    const plans = D().prepare(`
      SELECT pp.*, c.first_name, c.last_name, i.invoice_number
      FROM payment_plans pp
      JOIN children c ON c.id=pp.child_id
      LEFT JOIN invoices i ON i.id=pp.invoice_id
      WHERE pp.tenant_id=?
      ORDER BY pp.created_at DESC
    `).all(req.tenantId);
    res.json({ plans: plans.map(p => ({ ...p, total: p.total_amount_cents/100, paid: p.amount_paid_cents/100, instalment: p.instalment_amount_cents/100 })) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/payment-plans', (req, res) => {
  try {
    const { child_id, invoice_id, total_amount, instalment_amount, frequency, start_date, notes } = req.body;
    if (!child_id || !total_amount || !instalment_amount) return res.status(400).json({ error: 'child_id, total_amount, instalment_amount required' });

    const totalCents = d2c(total_amount);
    const instalCents = d2c(instalment_amount);
    const totalInstalments = Math.ceil(totalCents / instalCents);

    const id = uuid();
    D().prepare(`
      INSERT INTO payment_plans
        (id,tenant_id,child_id,invoice_id,total_amount_cents,instalment_amount_cents,
         frequency,start_date,next_due_date,instalments_total,status,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,'active',?)
    `).run(id, req.tenantId, child_id, invoice_id||null, totalCents, instalCents,
           frequency||'weekly', start_date, start_date, totalInstalments, notes||null);

    res.json({ id, ok: true, total_instalments: totalInstalments });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/payment-plans/:id/pay', (req, res) => {
  try {
    const { amount, method = 'bank_transfer' } = req.body;
    const plan = D().prepare('SELECT * FROM payment_plans WHERE id=? AND tenant_id=?')
      .get(req.params.id, req.tenantId);
    if (!plan) return res.status(404).json({ error: 'Not found' });

    const payAmount = d2c(amount || plan.instalment_amount_cents / 100);
    const newPaid = plan.amount_paid_cents + payAmount;
    const newCount = plan.instalments_paid + 1;
    const fullyPaid = newPaid >= plan.total_amount_cents;

    // Calculate next due date
    let nextDue = plan.next_due_date;
    if (!fullyPaid && nextDue) {
      const d = new Date(nextDue + 'T12:00');
      if (plan.frequency === 'weekly') d.setDate(d.getDate() + 7);
      else if (plan.frequency === 'fortnightly') d.setDate(d.getDate() + 14);
      else d.setMonth(d.getMonth() + 1);
      nextDue = d.toISOString().split('T')[0];
    }

    D().prepare(`
      UPDATE payment_plans SET
        amount_paid_cents=?, instalments_paid=?, next_due_date=?,
        status=CASE WHEN ? THEN 'completed' ELSE 'active' END
      WHERE id=?
    `).run(newPaid, newCount, fullyPaid ? null : nextDue, fullyPaid ? 1 : 0, req.params.id);

    // Record payment
    if (plan.invoice_id) {
      D().prepare(`
        INSERT INTO payments (id,tenant_id,invoice_id,child_id,amount,method,payment_date)
        VALUES (?,?,?,?,?,?,date('now'))
      `).run(uuid(), req.tenantId, plan.invoice_id, plan.child_id, payAmount/100, method);
    }

    res.json({ ok: true, fully_paid: fullyPaid, total_paid: newPaid/100 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Credit notes ──────────────────────────────────────────────────────────────
r.get('/credit-notes', (req, res) => {
  try {
    const credits = D().prepare(`
      SELECT cn.*, c.first_name, c.last_name
      FROM credit_notes cn
      JOIN children c ON c.id=cn.child_id
      WHERE cn.tenant_id=?
      ORDER BY cn.created_at DESC
    `).all(req.tenantId);
    res.json({ credits: credits.map(c => ({ ...c, amount: c.amount_cents/100 })) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/credit-notes', (req, res) => {
  try {
    const { child_id, invoice_id, amount, reason } = req.body;
    if (!child_id || !amount) return res.status(400).json({ error: 'child_id and amount required' });

    const seq = D().prepare("SELECT COUNT(*)+1 as n FROM credit_notes WHERE tenant_id=?").get(req.tenantId)?.n || 1;
    const creditNumber = `CN-${String(seq).padStart(4,'0')}`;
    const id = uuid();
    D().prepare(`
      INSERT INTO credit_notes (id,tenant_id,child_id,invoice_id,credit_number,amount_cents,reason,status)
      VALUES (?,?,?,?,?,?,?,'available')
    `).run(id, req.tenantId, child_id, invoice_id||null, creditNumber, d2c(amount), reason||null);

    res.json({ id, credit_number: creditNumber, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Invoice templates ─────────────────────────────────────────────────────────
r.get('/templates', (req, res) => {
  try {
    const templates = D().prepare('SELECT * FROM invoice_templates WHERE tenant_id=? ORDER BY is_default DESC').all(req.tenantId);
    if (!templates.length) {
      return res.json({ templates: [{ id: null, name: 'Default', payment_terms: 'Due within 14 days', include_ccs_breakdown: 1, colour: '#7C3AED', is_default: 1 }] });
    }
    res.json({ templates });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/templates', (req, res) => {
  try {
    const { name, payment_terms, bank_name, bank_bsb, bank_account, include_ccs_breakdown, colour, is_default } = req.body;

    if (is_default) {
      D().prepare('UPDATE invoice_templates SET is_default=0 WHERE tenant_id=?').run(req.tenantId);
    }

    const id = uuid();
    D().prepare(`
      INSERT INTO invoice_templates
        (id,tenant_id,name,payment_terms,bank_name,bank_bsb,bank_account,include_ccs_breakdown,colour,is_default)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT DO NOTHING
    `).run(id, req.tenantId, name||'Default', payment_terms||'Due within 14 days',
           bank_name||null, bank_bsb||null, bank_account||null,
           include_ccs_breakdown?1:0, colour||'#7C3AED', is_default?1:0);

    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
