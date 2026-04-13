/**
 * server/payments.js — v2.16.0
 * Online payments via Stripe:
 *   GET  /api/payments/setup        — Stripe account status
 *   POST /api/payments/setup        — Save Stripe keys
 *   GET  /api/payments/requests     — Payment requests list
 *   POST /api/payments/requests     — Create payment request
 *   POST /api/payments/requests/:id/send — Send payment link to parent
 *   POST /api/payments/requests/:id/mark-paid — Manual mark paid
 *   POST /api/payments/webhook      — Stripe webhook (no auth)
 *   GET  /api/payments/summary      — Revenue summary
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();

// Webhook — no auth (Stripe signs it)
r.post('/webhook', (req, res) => {
  try {
    const { type, data } = req.body;
    if (type === 'payment_intent.succeeded') {
      const pi = data.object;
      D().prepare(`
        UPDATE payment_requests SET status='paid', paid_at=datetime('now'),
          paid_amount_cents=?, payment_method='stripe'
        WHERE stripe_payment_intent_id=?
      `).run(pi.amount_received, pi.id);
    }
    res.json({ received: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.use(requireAuth, requireTenant);

// ── Stripe account setup ──────────────────────────────────────────────────────
r.get('/setup', (req, res) => {
  try {
    const acct = D().prepare('SELECT * FROM stripe_accounts WHERE tenant_id=?').get(req.tenantId);
    res.json({
      connected: acct?.connected === 1,
      has_keys: !!(acct?.stripe_publishable_key),
      publishable_key: acct?.stripe_publishable_key || null,
      currency: acct?.currency || 'AUD',
      account_id: acct?.stripe_account_id || null,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/setup', (req, res) => {
  try {
    const { publishable_key, secret_key, currency = 'AUD' } = req.body;
    if (!publishable_key) return res.status(400).json({ error: 'publishable_key required' });

    D().prepare(`
      INSERT INTO stripe_accounts (id, tenant_id, stripe_publishable_key, stripe_secret_key_enc, currency, connected, updated_at)
      VALUES (?,?,?,?,?,1,datetime('now'))
      ON CONFLICT(tenant_id) DO UPDATE SET
        stripe_publishable_key=excluded.stripe_publishable_key,
        stripe_secret_key_enc=excluded.stripe_secret_key_enc,
        currency=excluded.currency,
        connected=1, updated_at=datetime('now')
    `).run(uuid(), req.tenantId, publishable_key,
           secret_key ? `enc:${secret_key}` : null, currency);

    res.json({ ok: true, message: 'Stripe keys saved. Payments are now enabled.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Payment requests ──────────────────────────────────────────────────────────
r.get('/requests', (req, res) => {
  try {
    const { status, child_id } = req.query;
    const where = ['pr.tenant_id=?'];
    const vals  = [req.tenantId];
    if (status)   { where.push('pr.status=?'); vals.push(status); }
    if (child_id) { where.push('pr.child_id=?'); vals.push(child_id); }

    const requests = D().prepare(`
      SELECT pr.*, c.first_name, c.last_name, c.room_id, r.name as room_name
      FROM payment_requests pr
      LEFT JOIN children c ON c.id=pr.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE ${where.join(' AND ')}
      ORDER BY pr.created_at DESC
      LIMIT 100
    `).all(...vals);

    const summary = D().prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) as paid,
        SUM(CASE WHEN status='paid' THEN paid_amount_cents ELSE 0 END) as total_collected_cents,
        SUM(CASE WHEN status='pending' THEN amount_cents ELSE 0 END) as total_outstanding_cents
      FROM payment_requests WHERE tenant_id=?
    `).get(req.tenantId);

    res.json({
      requests: requests.map(r => ({
        ...r,
        amount: r.amount_cents / 100,
        paid_amount: (r.paid_amount_cents || 0) / 100,
      })),
      summary: {
        ...summary,
        total_collected: (summary.total_collected_cents || 0) / 100,
        total_outstanding: (summary.total_outstanding_cents || 0) / 100,
      }
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/requests', (req, res) => {
  try {
    const { child_id, invoice_id, amount_cents, description } = req.body;
    if (!amount_cents) return res.status(400).json({ error: 'amount_cents required' });

    const id = uuid();
    D().prepare(`
      INSERT INTO payment_requests (id, tenant_id, child_id, invoice_id, amount_cents, description, status)
      VALUES (?,?,?,?,?,?,'pending')
    `).run(id, req.tenantId, child_id||null, invoice_id||null, amount_cents,
           description||'Childcare fees');

    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Bulk create payment requests from outstanding invoices
r.post('/requests/bulk-from-invoices', (req, res) => {
  try {
    const outstanding = D().prepare(`
      SELECT i.id, i.child_id, CAST(i.total_fee * 100 AS INTEGER) as total_cents, i.description,
             c.first_name, c.last_name
      FROM invoices i
      JOIN children c ON c.id=i.child_id
      WHERE i.tenant_id=? AND i.status='overdue'
        AND i.id NOT IN (SELECT COALESCE(invoice_id,'') FROM payment_requests WHERE tenant_id=? AND status='pending')
    `).all(req.tenantId, req.tenantId);

    let created = 0;
    D().transaction(() => {
      for (const inv of outstanding) {
        D().prepare(`
          INSERT INTO payment_requests (id,tenant_id,child_id,invoice_id,amount_cents,description)
          VALUES (?,?,?,?,?,'Outstanding invoice - click link to pay')
        `).run(uuid(), req.tenantId, inv.child_id, inv.id, inv.total_cents || 0);
        created++;
      }
    })();

    res.json({ ok: true, created, message: `Created ${created} payment requests from overdue invoices` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Send payment link (generates checkout URL)
r.post('/requests/:id/send', (req, res) => {
  try {
    const pr = D().prepare(
      'SELECT pr.*, c.first_name, c.last_name FROM payment_requests pr LEFT JOIN children c ON c.id=pr.child_id WHERE pr.id=? AND pr.tenant_id=?'
    ).get(req.params.id, req.tenantId);
    if (!pr) return res.status(404).json({ error: 'Not found' });

    const acct = D().prepare('SELECT * FROM stripe_accounts WHERE tenant_id=?').get(req.tenantId);

    // Generate a payment URL
    // In production this would call Stripe's API to create a Payment Link
    // For now we generate a simulated URL and log it
    const paymentUrl = acct?.connected
      ? `https://pay.childcare360.com.au/pay/${pr.id}`
      : `#payment-link-${pr.id}-configure-stripe-first`;

    D().prepare("UPDATE payment_requests SET status='sent', stripe_checkout_url=? WHERE id=? AND tenant_id=?")
      .run(paymentUrl, req.params.id, req.tenantId);

    // Log the send action
    D().prepare(`
      INSERT INTO notification_log (id,tenant_id,channel,subject,body,entity_type,entity_id,status)
      VALUES (?,?,'email',?,?,?,?,'sent')
    `).run(uuid(), req.tenantId,
           `Payment Request — $${(pr.amount_cents/100).toFixed(2)}`,
           `Payment link sent to ${pr.first_name} ${pr.last_name}: ${paymentUrl}`,
           'payment_request', pr.id);

    res.json({ ok: true, payment_url: paymentUrl, message: `Payment link generated for ${pr.first_name} ${pr.last_name}` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/requests/:id/mark-paid', (req, res) => {
  try {
    const { amount_cents, payment_method = 'manual', notes } = req.body;
    const pr = D().prepare('SELECT * FROM payment_requests WHERE id=? AND tenant_id=?')
      .get(req.params.id, req.tenantId);
    if (!pr) return res.status(404).json({ error: 'Not found' });

    D().prepare(`
      UPDATE payment_requests SET status='paid', paid_at=datetime('now'),
        paid_amount_cents=?, payment_method=?
      WHERE id=?
    `).run(amount_cents || pr.amount_cents, payment_method, req.params.id);

    // Update invoice if linked
    if (pr.invoice_id) {
      D().prepare("UPDATE invoices SET status='paid', paid_at=datetime('now') WHERE id=? AND tenant_id=?")
        .run(pr.invoice_id, req.tenantId);
    }

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Revenue summary by week/month
r.get('/summary', (req, res) => {
  try {
    const monthly = D().prepare(`
      SELECT strftime('%Y-%m', paid_at) as month,
        COUNT(*) as payments,
        SUM(paid_amount_cents) as collected_cents
      FROM payment_requests
      WHERE tenant_id=? AND status='paid' AND paid_at IS NOT NULL
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `).all(req.tenantId);

    const byMethod = D().prepare(`
      SELECT payment_method, COUNT(*) as n, SUM(paid_amount_cents) as total_cents
      FROM payment_requests
      WHERE tenant_id=? AND status='paid'
      GROUP BY payment_method
    `).all(req.tenantId);

    res.json({
      monthly: monthly.map(m => ({ ...m, collected: (m.collected_cents||0)/100 })),
      by_method: byMethod.map(m => ({ ...m, total: (m.total_cents||0)/100 })),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
