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
      .replace(/{{due_date}}/g,     new Date(Date.now() + 30 * 86400000).toLocaleDateString(undefined))
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

// GET /api/messaging/broadcast — list broadcasts
r.get('/broadcast', (req, res) => {
  try {
    res.json([]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/messaging/broadcast
r.post('/broadcast', async (req, res) => {
  try {
    const { audience, channel, subject, body } = req.body;
    if (!body) return res.status(400).json({ error: 'Message body required' });
    if (channel === 'email' && !subject) return res.status(400).json({ error: 'Email subject required' });

    // Count recipients based on audience
    let recipientCount = 0;
    const db = D();
    if (audience === 'all_parents' || audience === 'everyone') {
      recipientCount += db.prepare("SELECT COUNT(DISTINCT parent1_email) as c FROM children WHERE tenant_id=? AND (active=1 OR active IS NULL) AND parent1_email IS NOT NULL").get(req.tenantId)?.c || 0;
    }
    if (audience === 'all_staff' || audience === 'everyone') {
      recipientCount += db.prepare("SELECT COUNT(*) as c FROM educators WHERE tenant_id=? AND status='active' AND email IS NOT NULL").get(req.tenantId)?.c || 0;
    }
    if (audience?.startsWith('room_')) {
      recipientCount = db.prepare("SELECT COUNT(DISTINCT c.parent1_email) as cnt FROM children c JOIN rooms r ON r.id=c.room_id WHERE c.tenant_id=? AND (c.active=1 OR c.active IS NULL) AND c.parent1_email IS NOT NULL").get(req.tenantId)?.cnt || 0;
    }

    // Log the broadcast as a notification
    const broadcastId = uuid();
    db.prepare(`INSERT INTO notifications (id,tenant_id,type,title,message,channel,trigger_type,sent_at)
      VALUES(?,?,?,?,?,?,?,datetime('now'))`).run(broadcastId, req.tenantId, 'broadcast', subject || 'Broadcast Message', body, channel, `broadcast:${audience}`);

    // Attempt real email send if channel is email and SMTP configured
    let sent = 0, failed = 0;
    if (channel === 'email') {
      const settings = db.prepare('SELECT * FROM tenant_settings WHERE tenant_id=?').get(req.tenantId);
      if (settings?.smtp_host && settings?.smtp_user) {
        try {
          const nodemailer = await import('nodemailer');
          const transporter = nodemailer.default.createTransport({
            host: settings.smtp_host, port: parseInt(settings.smtp_port)||587,
            secure: settings.smtp_secure==='true',
            auth: { user: settings.smtp_user, pass: settings.smtp_password },
            tls: { rejectUnauthorized: false },
          });

          // Collect recipient emails
          const emails = new Set();
          if (audience === 'all_parents' || audience === 'everyone') {
            db.prepare(`SELECT DISTINCT parent1_email FROM children WHERE tenant_id=? AND active=1 AND parent1_email IS NOT NULL AND parent1_email != ''`).all(req.tenantId).forEach(r => emails.add(r.parent1_email));
            db.prepare(`SELECT DISTINCT parent2_email FROM children WHERE tenant_id=? AND active=1 AND parent2_email IS NOT NULL AND parent2_email != ''`).all(req.tenantId).forEach(r => r.parent2_email && emails.add(r.parent2_email));
          }
          if (audience === 'all_staff' || audience === 'everyone') {
            db.prepare(`SELECT DISTINCT email FROM educators WHERE tenant_id=? AND status='active' AND email IS NOT NULL AND email != ''`).all(req.tenantId).forEach(r => emails.add(r.email));
          }
          if (audience?.startsWith('room_')) {
            const roomId = audience.replace('room_','');
            db.prepare(`SELECT DISTINCT parent1_email FROM children WHERE tenant_id=? AND room_id=? AND active=1 AND parent1_email IS NOT NULL`).all(req.tenantId, roomId).forEach(r => emails.add(r.parent1_email));
          }

          const centre = settings.service_name || 'Childcare Centre';
          const htmlBody = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
            <div style="background:#3D3248;color:#fff;padding:20px;border-radius:12px 12px 0 0">
              <h2 style="margin:0;font-size:18px">${centre}</h2>
            </div>
            <div style="background:#f9f9f9;padding:20px;border:1px solid #eee;border-radius:0 0 12px 12px">
              <p style="white-space:pre-wrap;font-size:14px;color:#333">${body.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
              <p style="font-size:11px;color:#999;margin-top:20px">Sent via Childcare360</p>
            </div>
          </div>`;

          for (const email of emails) {
            try {
              await transporter.sendMail({
                from: settings.smtp_from || settings.smtp_user,
                to: email, subject: subject || `Message from ${centre}`,
                html: htmlBody, text: body,
              });
              sent++;
            } catch(e) { failed++; }
          }
        } catch(e) { console.error('[broadcast email error]', e.message); }
      }
    }

    res.json({ ok: true, broadcast_id: broadcastId, recipient_count: recipientCount || 1, sent, failed,
      note: channel === 'email' && sent === 0 ? 'Saved to notifications. Configure SMTP in Settings → Notifications to send real emails.' : undefined
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

export default r;
