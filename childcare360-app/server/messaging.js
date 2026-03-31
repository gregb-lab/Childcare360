import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

// ── Notification Templates ────────────────────────────────────────────────────

r.get('/templates', (req, res) => {
  try {
    const rows = D().prepare(
      'SELECT * FROM notification_templates WHERE tenant_id=? ORDER BY trigger_type, days_before DESC'
    ).all(req.tenantId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

r.post('/templates', (req, res) => {
  try {
    const { trigger_type, channel, subject, body_html, days_before, active } = req.body;
    const id = uuid();
    D().prepare(`
      INSERT INTO notification_templates (id,tenant_id,trigger_type,channel,subject,body_html,days_before,active)
      VALUES(?,?,?,?,?,?,?,?)
    `).run(id, req.tenantId, trigger_type, channel || 'email', subject || null, body_html || '', days_before ?? 0, active !== false ? 1 : 0);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

r.put('/templates/:id', (req, res) => {
  try {
    const { trigger_type, channel, subject, body_html, days_before, active } = req.body;
    D().prepare(`
      UPDATE notification_templates SET trigger_type=?,channel=?,subject=?,body_html=?,days_before=?,active=?
      WHERE id=? AND tenant_id=?
    `).run(trigger_type, channel || 'email', subject || null, body_html || '', days_before ?? 0, active !== false ? 1 : 0, req.params.id, req.tenantId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

r.delete('/templates/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM notification_templates WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Notification History ──────────────────────────────────────────────────────

r.get('/notifications', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const rows = D().prepare(
      `SELECT n.*, u.email as recipient_email FROM notifications n
       LEFT JOIN users u ON n.user_id = u.id
       WHERE n.tenant_id=? ORDER BY n.created_at DESC LIMIT ?`
    ).all(req.tenantId, limit);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

r.put('/notifications/:id/read', (req, res) => {
  try {
    D().prepare("UPDATE notifications SET read_at=datetime('now') WHERE id=? AND tenant_id=?").run(req.params.id, req.tenantId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Send test notification ────────────────────────────────────────────────────

r.post('/send-test', (req, res) => {
  try {
    const { template_id, recipient_email } = req.body;
    const tmpl = D().prepare('SELECT * FROM notification_templates WHERE id=? AND tenant_id=?').get(template_id, req.tenantId);
    if (!tmpl) return res.status(404).json({ error: 'Template not found' });

    const rendered = (tmpl.body_html || '')
      .replace(/{{child_name}}/g,   'Oliver Thompson')
      .replace(/{{parent_name}}/g,  'Kate Thompson')
      .replace(/{{due_date}}/g,     new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-AU'))
      .replace(/{{centre_name}}/g,  'Sunshine Learning Centre')
      .replace(/{{amount}}/g,       '$245.00')
      .replace(/{{invoice_number}}/g, 'INV-2026-0042');

    const notifId = uuid();
    D().prepare(`INSERT INTO notifications (id,tenant_id,type,title,message,channel,trigger_type,sent_at)
      VALUES(?,?,?,?,?,?,?,datetime('now'))`)
      .run(notifId, req.tenantId, 'test', 'Test: ' + (tmpl.subject || tmpl.trigger_type), rendered, tmpl.channel, tmpl.trigger_type);

    res.json({ success: true, notif_id: notifId, rendered_body: rendered });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default r;
