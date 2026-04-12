/**
 * server/bulk-comms.js — v2.17.0
 * Bulk communications & child timeline:
 *   POST /api/bulk-comms/send         — send bulk message to room/all families
 *   GET  /api/bulk-comms/history      — sent message history
 *   GET  /api/bulk-comms/recipients   — preview recipients before sending
 *   GET  /api/bulk-comms/timeline/:childId — complete child history timeline
 *   GET  /api/bulk-comms/activity     — centre activity log
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

// ── Recipient preview ─────────────────────────────────────────────────────────
r.get('/recipients', (req, res) => {
  try {
    const { target_audience, room_ids } = req.query;
    const rooms = room_ids ? room_ids.split(',') : [];

    let query;
    if (target_audience === 'room' && rooms.length > 0) {
      const placeholders = rooms.map(() => '?').join(',');
      query = D().prepare(`
        SELECT c.id as child_id, c.first_name, c.last_name, c.room_id,
               r.name as room_name,
               tm.user_id, u.email, u.name as parent_name
        FROM children c
        JOIN rooms r ON r.id=c.room_id
        LEFT JOIN tenant_members tm ON tm.tenant_id=c.tenant_id AND tm.role='parent'
        LEFT JOIN users u ON u.id=tm.user_id
        WHERE c.tenant_id=? AND c.active=1 AND c.room_id IN (${placeholders})
        GROUP BY c.id
        ORDER BY r.name, c.last_name
      `).all(req.tenantId, ...rooms);
    } else if (target_audience === 'educators') {
      query = D().prepare(`
        SELECT e.id as educator_id, e.first_name, e.last_name,
               u.email, u.name as display_name
        FROM educators e
        LEFT JOIN users u ON u.id=e.user_id
        WHERE e.tenant_id=? AND e.status='active' AND u.email IS NOT NULL
      `).all(req.tenantId);
    } else {
      // All families
      query = D().prepare(`
        SELECT c.id as child_id, c.first_name, c.last_name, c.room_id,
               r.name as room_name,
               tm.user_id, u.email, u.name as parent_name
        FROM children c
        JOIN rooms r ON r.id=c.room_id
        LEFT JOIN tenant_members tm ON tm.tenant_id=c.tenant_id AND tm.role='parent'
        LEFT JOIN users u ON u.id=tm.user_id
        WHERE c.tenant_id=? AND c.active=1
        GROUP BY c.id
        ORDER BY r.name, c.last_name
      `).all(req.tenantId);
    }

    res.json({ recipients: query, count: query.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Send bulk message ─────────────────────────────────────────────────────────
r.post('/send', (req, res) => {
  try {
    const {
      subject, body, message_type = 'general',
      target_audience = 'all_families',
      target_room_ids = [],
      channels = ['in_app'],
      created_by,
    } = req.body;

    if (!body) return res.status(400).json({ error: 'body required' });

    // Build recipient list
    let children;
    if (target_audience === 'room' && target_room_ids.length > 0) {
      const ph = target_room_ids.map(() => '?').join(',');
      children = D().prepare(
        `SELECT id, first_name, last_name, room_id FROM children WHERE tenant_id=? AND active=1 AND room_id IN (${ph})`
      ).all(req.tenantId, ...target_room_ids);
    } else {
      children = D().prepare(
        'SELECT id, first_name, last_name, room_id FROM children WHERE tenant_id=? AND active=1'
      ).all(req.tenantId);
    }

    const msgId = uuid();
    D().prepare(`
      INSERT INTO bulk_messages
        (id, tenant_id, message_type, subject, body, channels, target_audience,
         target_room_ids, recipient_count, status, sent_at, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,'sent',datetime('now'),?)
    `).run(msgId, req.tenantId, message_type,
           subject || 'Message from Centre',
           body,
           JSON.stringify(channels),
           target_audience,
           JSON.stringify(target_room_ids),
           children.length,
           created_by || null);

    // Create in-app threads for each child's family
    const insertRcpt = D().prepare(`
      INSERT INTO bulk_message_recipients
        (id, tenant_id, message_id, child_id, status, sent_at)
      VALUES (?,?,?,?,'sent',datetime('now'))
    `);

    const insertThread = D().prepare(`
      INSERT INTO message_threads
        (id, tenant_id, child_id, subject, last_message_preview, unread_parent, status)
      VALUES (?,?,?,?,?,1,'open')
    `);

    const insertMsg = D().prepare(`
      INSERT INTO thread_messages
        (id, tenant_id, thread_id, sender_type, sender_name, body)
      VALUES (?,?,?,'admin','Centre',?)
    `);

    D().transaction(() => {
      for (const child of children) {
        insertRcpt.run(uuid(), req.tenantId, msgId, child.id);

        if (channels.includes('in_app')) {
          const threadId = uuid();
          insertThread.run(threadId, req.tenantId, child.id,
                           subject || 'Message from Centre',
                           body.slice(0, 100));
          insertMsg.run(uuid(), req.tenantId, threadId, body);
        }
      }
    })();

    // Update sent count
    D().prepare('UPDATE bulk_messages SET sent_count=? WHERE id=? AND tenant_id=?')
      .run(children.length, msgId, req.tenantId);

    res.json({
      ok: true,
      message_id: msgId,
      sent_to: children.length,
      message: `Message sent to ${children.length} famil${children.length !== 1 ? 'ies' : 'y'}`,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Message history ───────────────────────────────────────────────────────────
r.get('/history', (req, res) => {
  try {
    const msgs = D().prepare(`
      SELECT m.*, 
        (SELECT GROUP_CONCAT(DISTINCT ro.name)
         FROM json_each(m.target_room_ids) AS jr
         JOIN rooms ro ON ro.id=jr.value
         WHERE ro.tenant_id=m.tenant_id) as room_names
      FROM bulk_messages m
      WHERE m.tenant_id=?
      ORDER BY m.created_at DESC
      LIMIT 50
    `).all(req.tenantId);

    res.json({
      messages: msgs.map(m => ({
        ...m,
        channels: JSON.parse(m.channels || '["in_app"]'),
        target_room_ids: JSON.parse(m.target_room_ids || '[]'),
      }))
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Child timeline ────────────────────────────────────────────────────────────
r.get('/timeline/:childId', (req, res) => {
  try {
    const child = D().prepare(`
      SELECT c.*, r.name as room_name
      FROM children c LEFT JOIN rooms r ON r.id=c.room_id
      WHERE c.id=? AND c.tenant_id=?
    `).get(req.params.childId, req.tenantId);
    if (!child) return res.status(404).json({ error: 'Child not found' });

    const events = [];

    // Enrolment start
    if (child.start_date) {
      events.push({ date: child.start_date, type: 'enrolment', icon: '🎉', title: 'Started at Centre', detail: `Enrolled in ${child.room_name}`, color: '#7C3AED' });
    }

    // Observations
    const observations = D().prepare(`
      SELECT id, created_at, notes, category, eylf_links, educator_id
      FROM observations WHERE child_id=? ORDER BY created_at DESC LIMIT 50
    `).all(req.params.childId);
    observations.forEach(o => {
      events.push({
        date: o.created_at?.split('T')[0],
        datetime: o.created_at,
        type: 'observation',
        icon: '📝',
        title: 'Observation recorded',
        detail: o.notes?.slice(0, 120),
        color: '#0284C7',
        id: o.id,
      });
    });

    // Learning stories
    try {
      const stories = D().prepare(`
        SELECT id, created_at, title, story_type FROM learning_stories
        WHERE child_id=? ORDER BY created_at DESC LIMIT 30
      `).all(req.params.childId);
      stories.forEach(s => {
        events.push({ date: s.created_at?.split('T')[0], datetime: s.created_at, type: 'story', icon: '✨', title: s.title || 'Learning Story', detail: s.story_type, color: '#7C3AED', id: s.id });
      });
    } catch(e) {}

    // Health events
    try {
      const health = D().prepare(`
        SELECT id, event_date, event_type, description, temperature
        FROM health_events WHERE child_id=? AND tenant_id=? ORDER BY event_date DESC LIMIT 20
      `).all(req.params.childId, req.tenantId);
      health.forEach(h => {
        events.push({ date: h.event_date, type: 'health', icon: h.event_type === 'injury' ? '🩹' : '🤒', title: `Health event — ${h.event_type}`, detail: h.description?.slice(0,100), color: '#D97706', id: h.id });
      });
    } catch(e) {}

    // Incidents
    try {
      const incidents = D().prepare(`
        SELECT id, created_at, title, severity FROM incidents
        WHERE child_id=? AND tenant_id=? ORDER BY created_at DESC LIMIT 20
      `).all(req.params.childId, req.tenantId);
      incidents.forEach(i => {
        events.push({ date: i.created_at?.split('T')[0], datetime: i.created_at, type: 'incident', icon: '⚠️', title: i.title || 'Incident report', detail: `Severity: ${i.severity}`, color: '#DC2626', id: i.id });
      });
    } catch(e) {}

    // Milestones achieved
    try {
      const milestones = D().prepare(`
        SELECT milestone_key, milestone_label, domain, achieved_date
        FROM milestone_records WHERE child_id=? AND achieved=1 ORDER BY achieved_date DESC LIMIT 30
      `).all(req.params.childId);
      milestones.forEach(m => {
        if (m.achieved_date) {
          events.push({ date: m.achieved_date, type: 'milestone', icon: '🌱', title: `Milestone: ${m.milestone_label}`, detail: m.domain, color: '#16A34A' });
        }
      });
    } catch(e) {}

    // Immunisations
    try {
      const imm = D().prepare(`
        SELECT vaccine_name, date_given FROM immunisation_records
        WHERE child_id=? AND date_given IS NOT NULL ORDER BY date_given DESC LIMIT 20
      `).all(req.params.childId);
      imm.forEach(i => {
        events.push({ date: i.date_given, type: 'immunisation', icon: '💉', title: `Vaccine: ${i.vaccine_name}`, detail: 'Immunisation recorded', color: '#0E7490' });
      });
    } catch(e) {}

    // Excursions attended
    try {
      const excursions = D().prepare(`
        SELECT e.title, e.excursion_date FROM excursions e
        JOIN excursion_children ec ON ec.excursion_id=e.id
        WHERE ec.child_id=? AND e.tenant_id=? ORDER BY e.excursion_date DESC LIMIT 20
      `).all(req.params.childId, req.tenantId);
      excursions.forEach(ex => {
        events.push({ date: ex.excursion_date, type: 'excursion', icon: '🚌', title: `Excursion: ${ex.title}`, detail: 'Participated in excursion', color: '#9333EA' });
      });
    } catch(e) {}

    // Room changes
    try {
      const roomChanges = D().prepare(`
        SELECT al.performed_at, al.detail FROM activity_log al
        WHERE al.entity_type='child' AND al.entity_id=? AND al.action='room_change'
        ORDER BY al.performed_at DESC LIMIT 10
      `).all(req.params.childId);
      roomChanges.forEach(rc => {
        events.push({ date: rc.performed_at?.split('T')[0], datetime: rc.performed_at, type: 'room_change', icon: '🏠', title: 'Room Change', detail: rc.detail, color: '#6B7280' });
      });
    } catch(e) {}

    // Sort by date descending
    events.sort((a, b) => {
      const da = a.datetime || a.date || '';
      const db2 = b.datetime || b.date || '';
      return db2.localeCompare(da);
    });

    // Stats
    const stats = {
      total_observations: observations.length,
      milestones_achieved: events.filter(e => e.type === 'milestone').length,
      health_events: events.filter(e => e.type === 'health').length,
      excursions: events.filter(e => e.type === 'excursion').length,
      days_enrolled: child.start_date
        ? Math.floor((Date.now() - new Date(child.start_date)) / 86400000)
        : 0,
    };

    res.json({ child, events, stats });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Templates ────────────────────────────────────────────────────────────────
r.get('/templates', (req, res) => {
  try {
    let templates = [];
    try {
      templates = D().prepare('SELECT * FROM bulk_message_templates WHERE tenant_id=? ORDER BY created_at DESC').all(req.tenantId);
    } catch(e) { /* table may not exist */ }
    res.json({ templates });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Scheduled messages ───────────────────────────────────────────────────────
r.get('/scheduled', (req, res) => {
  try {
    let scheduled = [];
    try {
      scheduled = D().prepare("SELECT * FROM bulk_messages WHERE tenant_id=? AND status='scheduled' ORDER BY created_at DESC").all(req.tenantId);
    } catch(e) { /* column/table may not exist */ }
    res.json({ scheduled });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Activity log ──────────────────────────────────────────────────────────────
r.get('/activity', (req, res) => {
  try {
    const { entity_type, from, limit = 100 } = req.query;
    const since = from || new Date(Date.now() - 7*86400000).toISOString().split('T')[0];

    const where = ['al.tenant_id=?', 'al.performed_at >= ?'];
    const vals  = [req.tenantId, since];
    if (entity_type) { where.push('al.entity_type=?'); vals.push(entity_type); }

    const logs = D().prepare(`
      SELECT al.*, u.name as performed_by_name, u.email as performed_by_email
      FROM activity_log al
      LEFT JOIN users u ON u.id=al.performed_by
      WHERE ${where.join(' AND ')}
      ORDER BY al.performed_at DESC
      LIMIT ?
    `).all(...vals, parseInt(limit));

    // Summary by entity type
    const summary = D().prepare(`
      SELECT entity_type, COUNT(*) as count
      FROM activity_log
      WHERE tenant_id=? AND performed_at >= ?
      GROUP BY entity_type
      ORDER BY count DESC
    `).all(req.tenantId, since);

    res.json({ logs, summary });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
