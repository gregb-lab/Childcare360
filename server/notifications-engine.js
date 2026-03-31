/**
 * server/notifications-engine.js — v2.14.0
 * Smart notification engine:
 *   POST /api/notifications/run     — run all notification checks, generate alerts
 *   GET  /api/notifications/inbox   — user's in-app notification inbox
 *   PUT  /api/notifications/:id/read
 *   PUT  /api/notifications/read-all
 *   GET  /api/notifications/rules   — manage notification rules
 *   POST /api/notifications/rules
 *   PUT  /api/notifications/rules/:id
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

// ── Notification delivery (in-app + email queue) ──────────────────────────────
function deliver(tenantId, { type, priority = 'normal', subject, body, entity_type, entity_id, recipient_user_id }) {
  try {
    // In-app notification
    D().prepare('
      INSERT INTO notifications
        (id, tenant_id, type, priority, subject, body, status, related_compliance_id, created_at)
      VALUES (?,?,?,?,?,?,\'delivered\',?,datetime(\'now\'))
    ').run(uuid(), tenantId, type, priority, subject, body, entity_id || null);

    // Notification log
    D().prepare('
      INSERT INTO notification_log
        (id, tenant_id, channel, subject, body, entity_type, entity_id, status, recipient_user_id)
      VALUES (?,?,?,?,?,?,?,\'sent\',?)
    ').run(uuid(), tenantId, 'in_app', subject, body, entity_type || null, entity_id || null, recipient_user_id || null);
  } catch(e) { /* ignore individual delivery failures */ }
}

// ── Main notification run ─────────────────────────────────────────────────────
r.post('/run', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const in7   = new Date(Date.now() +  7*86400000).toISOString().split('T')[0];
    const in14  = new Date(Date.now() + 14*86400000).toISOString().split('T')[0];
    const in30  = new Date(Date.now() + 30*86400000).toISOString().split('T')[0];

    const generated = [];

    // ── 1. BIRTHDAYS TODAY ──────────────────────────────────────────────────
    const birthdays = D().prepare('
      SELECT c.id, c.first_name, c.last_name, c.dob, c.room_id, r.name as room_name
      FROM children c
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE c.tenant_id=? AND c.active=1
        AND strftime(\'%m-%d\', c.dob) = strftime(\'%m-%d\', \'now\')
    ').all(req.tenantId);

    birthdays.forEach(c => {
      const age = new Date().getFullYear() - new Date(c.dob).getFullYear();
      deliver(req.tenantId, {
        type: 'birthday', priority: 'normal',
        subject: `🎂 ${c.first_name}'s Birthday Today!`,
        body: `${c.first_name} ${c.last_name} turns ${age} today. Consider a special acknowledgement in ${c.room_name || 'their room'}.`,
        entity_type: 'child', entity_id: c.id,
      });
      generated.push({ type: 'birthday', name: `${c.first_name} ${c.last_name}` });
    });

    // ── 2. CERT EXPIRIES (7-day warning) ────────────────────────────────────
    const expiringCerts = D().prepare('
      SELECT id, first_name, last_name,
        first_aid_expiry, cpr_expiry, wwcc_expiry,
        wwcc_number, wwcc_state, anaphylaxis_expiry
      FROM educators
      WHERE tenant_id=? AND status=\'active\'
        AND (
          (first_aid_expiry BETWEEN ? AND ?) OR
          (cpr_expiry BETWEEN ? AND ?) OR
          (wwcc_expiry BETWEEN ? AND ?) OR
          (anaphylaxis_expiry BETWEEN ? AND ?)
        )
    ').all(req.tenantId, today, in14, today, in14, today, in30, today, in14);

    expiringCerts.forEach(e => {
      const expiring = [];
      if (e.first_aid_expiry >= today && e.first_aid_expiry <= in14)    expiring.push(`First Aid (${e.first_aid_expiry})`);
      if (e.cpr_expiry >= today && e.cpr_expiry <= in14)                expiring.push(`CPR (${e.cpr_expiry})`);
      if (e.wwcc_expiry >= today && e.wwcc_expiry <= in30)              expiring.push(`WWCC (${e.wwcc_expiry})`);
      if (e.anaphylaxis_expiry >= today && e.anaphylaxis_expiry <= in14) expiring.push(`Anaphylaxis (${e.anaphylaxis_expiry})`);

      if (expiring.length) {
        deliver(req.tenantId, {
          type: 'cert_expiry', priority: 'high',
          subject: `⚠️ ${e.first_name} ${e.last_name} — Certification Expiring Soon`,
          body: `The following certifications are expiring: ${expiring.join(', ')}. Please arrange renewal immediately to maintain compliance.`,
          entity_type: 'educator', entity_id: e.id,
        });
        generated.push({ type: 'cert_expiry', name: `${e.first_name} ${e.last_name}` });
      }
    });

    // ── 3. OVERDUE DEBT REMINDERS ───────────────────────────────────────────
    const overdueDebts = D().prepare('
      SELECT d.id, d.amount_cents, d.amount_paid_cents, d.due_date,
             d.reminder_1_sent, d.reminder_2_sent,
             c.first_name, c.last_name
      FROM debt_records d
      JOIN children c ON c.id=d.child_id
      WHERE d.tenant_id=? AND d.status=\'outstanding\'
        AND julianday(\'now\') - julianday(d.due_date) > 7
        AND d.reminder_1_sent IS NULL
    ').all(req.tenantId);

    overdueDebts.forEach(d => {
      const outstanding = ((d.amount_cents - d.amount_paid_cents) / 100).toFixed(2);
      deliver(req.tenantId, {
        type: 'debt_reminder', priority: 'high',
        subject: `💳 Overdue Account — ${d.first_name} ${d.last_name}`,
        body: `$${outstanding} overdue since ${d.due_date}. First reminder should be sent to the family.`,
        entity_type: 'debt', entity_id: d.id,
      });
      // Mark reminder 1 as triggered
      D().prepare("UPDATE debt_records SET reminder_1_sent=datetime('now') WHERE id=?").run(d.id);
      generated.push({ type: 'debt_reminder', name: `${d.first_name} ${d.last_name}` });
    });

    // ── 4. WWCC EXPIRY — 90-day warning ─────────────────────────────────────
    const wwccExpiring90 = D().prepare('
      SELECT id, first_name, last_name, wwcc_expiry
      FROM educators
      WHERE tenant_id=? AND status=\'active\'
        AND wwcc_expiry BETWEEN ? AND ?
        AND wwcc_expiry NOT BETWEEN ? AND ?
    ').all(req.tenantId,
      new Date(Date.now() + 30*86400000).toISOString().split('T')[0],
      new Date(Date.now() + 90*86400000).toISOString().split('T')[0],
      today, in30
    );

    wwccExpiring90.forEach(e => {
      const daysLeft = Math.round((new Date(e.wwcc_expiry) - new Date()) / 86400000);
      deliver(req.tenantId, {
        type: 'wwcc_expiry_90', priority: 'normal',
        subject: `🪪 ${e.first_name} ${e.last_name} — WWCC Expires in ${daysLeft} Days`,
        body: `WWCC expires ${e.wwcc_expiry}. Remind the educator to renew well in advance — processing can take several weeks.`,
        entity_type: 'educator', entity_id: e.id,
      });
      generated.push({ type: 'wwcc_expiry', name: `${e.first_name} ${e.last_name}` });
    });

    // ── 5. OCCUPANCY BELOW 70% ──────────────────────────────────────────────
    const lowOccupancy = D().prepare('
      SELECT r.name, r.capacity,
        COUNT(CASE WHEN c.active=1 THEN 1 END) as enrolled,
        ROUND(COUNT(CASE WHEN c.active=1 THEN 1 END)*100.0/NULLIF(r.capacity,0),1) as occ_pct
      FROM rooms r
      LEFT JOIN children c ON c.room_id=r.id AND c.tenant_id=r.tenant_id
      WHERE r.tenant_id=?
      GROUP BY r.id
      HAVING occ_pct < 70 AND r.capacity > 0
    ').all(req.tenantId);

    if (lowOccupancy.length > 0) {
      const rooms = lowOccupancy.map(r => `${r.name} (${Math.round(r.occ_pct)}%)`).join(', ');
      deliver(req.tenantId, {
        type: 'low_occupancy', priority: 'normal',
        subject: `📉 Low Occupancy Alert`,
        body: `The following rooms are below 70% occupancy: ${rooms}. Review your CRM waitlist for families ready to enrol.`,
        entity_type: 'occupancy', entity_id: null,
      });
      generated.push({ type: 'low_occupancy', detail: rooms });
    }

    // ── 6. CHILDREN MISSING IMMUNISATION RECORDS ────────────────────────────
    const missingImm = D().prepare('
      SELECT COUNT(*) as n FROM children c
      WHERE c.tenant_id=? AND c.active=1
        AND NOT EXISTS (
          SELECT 1 FROM immunisation_records ir
          WHERE ir.child_id=c.id AND ir.status=\'current\'
        )
    ').get(req.tenantId)?.n || 0;

    if (missingImm > 0) {
      deliver(req.tenantId, {
        type: 'immunisation_missing', priority: 'normal',
        subject: `💉 ${missingImm} Children Without Current Immunisation Records`,
        body: `${missingImm} enrolled children are missing current immunisation records. Request updated AIR statements from families.`,
        entity_type: 'compliance', entity_id: null,
      });
      generated.push({ type: 'immunisation_missing', count: missingImm });
    }

    // ── 7. APPRAISALS DUE IN 14 DAYS ───────────────────────────────────────
    const appraisalsDue = D().prepare('
      SELECT a.id, e.first_name, e.last_name, a.due_date
      FROM appraisals a
      JOIN educators e ON e.id=a.educator_id
      WHERE a.tenant_id=? AND a.status!=\'completed\'
        AND a.due_date BETWEEN ? AND ?
    ').all(req.tenantId, today, in14);

    appraisalsDue.forEach(a => {
      deliver(req.tenantId, {
        type: 'appraisal_due', priority: 'normal',
        subject: `⭐ Appraisal Due — ${a.first_name} ${a.last_name}`,
        body: `Performance review for ${a.first_name} ${a.last_name} is due ${a.due_date}. Please complete the review in the Appraisals module.`,
        entity_type: 'appraisal', entity_id: a.id,
      });
      generated.push({ type: 'appraisal_due', name: `${a.first_name} ${a.last_name}` });
    });

    res.json({ ok: true, generated: generated.length, breakdown: generated });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Inbox ─────────────────────────────────────────────────────────────────────
r.get('/inbox', (req, res) => {
  try {
    const { limit = 50, unread_only } = req.query;

    const where = ['tenant_id=?'];
    const vals  = [req.tenantId];
    if (unread_only === 'true') { where.push("status='delivered'"); }

    const notifications = D().prepare(`
      SELECT * FROM notifications
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...vals, parseInt(limit));

    const unread = D().prepare(
      "SELECT COUNT(*) as n FROM notifications WHERE tenant_id=? AND status='delivered'"
    ).get(req.tenantId)?.n || 0;

    const TYPE_ICONS = {
      birthday: '🎂', cert_expiry: '⚠️', debt_reminder: '💳',
      wwcc_expiry: '🪪', wwcc_expiry_90: '🪪', low_occupancy: '📉',
      immunisation_missing: '💉', appraisal_due: '⭐',
    };

    res.json({
      notifications: notifications.map(n => ({
        ...n,
        icon: TYPE_ICONS[n.type] || '🔔',
        is_read: n.status === 'read',
      })),
      unread_count: unread,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/:id/read', (req, res) => {
  try {
    D().prepare("UPDATE notifications SET status='read', sent_at=datetime('now') WHERE id=? AND tenant_id=?")
      .run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/read-all', (req, res) => {
  try {
    D().prepare("UPDATE notifications SET status='read' WHERE tenant_id=? AND status='delivered'")
      .run(req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Rules management ──────────────────────────────────────────────────────────
r.get('/rules', (req, res) => {
  try {
    // Return default rules if none set up yet
    const rules = D().prepare('SELECT * FROM notification_rules WHERE tenant_id=? ORDER BY trigger_event').all(req.tenantId);
    const defaults = [
      { rule_type: 'scheduled', trigger_event: 'birthday',              days_before: 0,  channels: ['in_app'], subject_template: "🎂 {name}'s Birthday Today", active: 1 },
      { rule_type: 'scheduled', trigger_event: 'cert_expiry',           days_before: 14, channels: ['in_app'], subject_template: "⚠️ Certification expiring: {name}", active: 1 },
      { rule_type: 'scheduled', trigger_event: 'wwcc_expiry',           days_before: 90, channels: ['in_app'], subject_template: "🪪 WWCC expiring: {name}", active: 1 },
      { rule_type: 'scheduled', trigger_event: 'debt_overdue',          days_before: -7, channels: ['in_app'], subject_template: "💳 Overdue account: {name}", active: 1 },
      { rule_type: 'scheduled', trigger_event: 'appraisal_due',         days_before: 14, channels: ['in_app'], subject_template: "⭐ Appraisal due: {name}", active: 1 },
      { rule_type: 'scheduled', trigger_event: 'low_occupancy',         days_before: 0,  channels: ['in_app'], subject_template: "📉 Low occupancy alert", active: 1 },
      { rule_type: 'scheduled', trigger_event: 'immunisation_missing',  days_before: 0,  channels: ['in_app'], subject_template: "💉 Missing immunisation records", active: 1 },
    ];
    res.json({ rules: rules.length ? rules : defaults });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
