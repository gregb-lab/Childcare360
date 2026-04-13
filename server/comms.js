/**
 * server/comms.js — v2.14.0
 * Communication & Health hub:
 *   /api/comms/threads          — parent message threads (two-way)
 *   /api/comms/threads/:id      — thread detail + messages
 *   /api/comms/threads/:id/reply
 *   /api/comms/health           — health events (illness, temperature, injury)
 *   /api/comms/immunisation/:childId — immunisation status vs AU schedule
 *   /api/comms/immunisation/:childId/record
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

const now = () => new Date().toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// TWO-WAY PARENT MESSAGING
// ─────────────────────────────────────────────────────────────────────────────

r.get('/threads', (req, res) => {
  try {
    const { child_id, status } = req.query;
    const where = ['t.tenant_id=?'];
    const vals  = [req.tenantId];
    if (child_id) { where.push('t.child_id=?'); vals.push(child_id); }
    if (status)   { where.push('t.status=?'); vals.push(status); }

    const threads = D().prepare(`
      SELECT t.*, c.first_name, c.last_name, c.room_id,
             r.name as room_name,
             COUNT(tm.id) as message_count
      FROM message_threads t
      LEFT JOIN children c ON c.id=t.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      LEFT JOIN thread_messages tm ON tm.thread_id=t.id
      WHERE ${where.join(' AND ')}
      GROUP BY t.id
      ORDER BY t.last_message_at DESC
    `).all(...vals);

    const unread_total = threads.reduce((s,t) => s + (t.unread_admin||0), 0);
    res.json({ threads, unread_total });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/threads', (req, res) => {
  try {
    const { child_id, subject, body, sender_name } = req.body;
    if (!subject || !body) return res.status(400).json({ error: 'subject and body required' });

    const threadId = uuid();
    D().prepare(`
      INSERT INTO message_threads (id, tenant_id, child_id, subject, last_message_at, last_message_preview, unread_parent)
      VALUES (?,?,?,?,datetime('now'),?,1)
    `).run(threadId, req.tenantId, child_id||null, subject, body.slice(0,100));

    D().prepare(`
      INSERT INTO thread_messages (id, tenant_id, thread_id, sender_type, sender_name, sender_user_id, body)
      VALUES (?,?,?,'admin',?,?,?)
    `).run(uuid(), req.tenantId, threadId, sender_name||'Centre', req.userId||null, body);

    res.json({ id: threadId, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.get('/threads/:id', (req, res) => {
  try {
    const thread = D().prepare(`
      SELECT t.*, c.first_name, c.last_name
      FROM message_threads t
      LEFT JOIN children c ON c.id=t.child_id
      WHERE t.id=? AND t.tenant_id=?
    `).get(req.params.id, req.tenantId);
    if (!thread) return res.status(404).json({ error: 'Not found' });

    const messages = D().prepare(`
      SELECT * FROM thread_messages WHERE thread_id=? ORDER BY created_at ASC
    `).all(req.params.id);

    // Mark admin-unread as read
    D().prepare('UPDATE message_threads SET unread_admin=0 WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);

    res.json({ thread, messages });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/threads/:id/reply', (req, res) => {
  try {
    const { body, sender_type = 'admin', sender_name } = req.body;
    if (!body) return res.status(400).json({ error: 'body required' });

    const thread = D().prepare('SELECT id FROM message_threads WHERE id=? AND tenant_id=?')
      .get(req.params.id, req.tenantId);
    if (!thread) return res.status(404).json({ error: 'Not found' });

    D().prepare(`
      INSERT INTO thread_messages (id, tenant_id, thread_id, sender_type, sender_name, sender_user_id, body)
      VALUES (?,?,?,?,?,?,?)
    `).run(uuid(), req.tenantId, req.params.id, sender_type,
           sender_name||'Centre', req.userId||null, body);

    // Update thread metadata
    const unreadField = sender_type === 'admin' ? 'unread_parent=1' : 'unread_admin=unread_admin+1';
    D().prepare(`
      UPDATE message_threads SET last_message_at=datetime('now'), last_message_preview=?, ${unreadField}
      WHERE id=?
    `).run(body.slice(0,100), req.params.id);

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/threads/:id/close', (req, res) => {
  try {
    D().prepare("UPDATE message_threads SET status='closed' WHERE id=? AND tenant_id=?")
      .run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH EVENTS
// ─────────────────────────────────────────────────────────────────────────────

r.get('/health', (req, res) => {
  try {
    const { child_id, from, to } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const where = ['h.tenant_id=?'];
    const vals  = [req.tenantId];
    if (child_id) { where.push('h.child_id=?'); vals.push(child_id); }
    if (from)     { where.push('h.event_date >= ?'); vals.push(from); }
    if (to)       { where.push('h.event_date <= ?'); vals.push(to); }

    const events = D().prepare(`
      SELECT h.*, c.first_name, c.last_name, c.room_id, r.name as room_name
      FROM health_events h
      JOIN children c ON c.id=h.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE ${where.join(' AND ')}
      ORDER BY h.event_date DESC, h.created_at DESC
    `).all(...vals);

    // Summary
    const todayEvents = events.filter(e => e.event_date === today);
    res.json({
      events: events.map(e => ({...e, symptoms: JSON.parse(e.symptoms||'[]')})),
      today_count: todayEvents.length,
      follow_up_count: events.filter(e => e.follow_up_required && !e.follow_up_notes).length,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/health', (req, res) => {
  try {
    const { child_id, event_type, event_date, description, temperature,
            symptoms, action_taken, parent_notified, follow_up_required, recorded_by } = req.body;
    if (!child_id || !event_type) return res.status(400).json({ error: 'child_id and event_type required' });

    const id = uuid();
    D().prepare(`
      INSERT INTO health_events
        (id,tenant_id,child_id,event_type,event_date,description,temperature,
         symptoms,action_taken,parent_notified,follow_up_required,recorded_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, req.tenantId, child_id, event_type,
           event_date || new Date().toISOString().split('T')[0],
           description||null, temperature||null,
           JSON.stringify(symptoms||[]), action_taken||null,
           parent_notified?1:0, follow_up_required?1:0, recorded_by||null);

    // If parent notified, create a thread
    if (parent_notified) {
      const child = D().prepare('SELECT first_name, last_name FROM children WHERE id=?').get(child_id);
      const threadId = uuid();
      D().prepare(`
        INSERT INTO message_threads (id,tenant_id,child_id,subject,last_message_preview,unread_parent)
        VALUES (?,?,?,?,?,1)
      `).run(threadId, req.tenantId, child_id,
             `Health Update — ${child?.first_name} ${child?.last_name}`,
             (description||'Health event recorded').slice(0,100));
      D().prepare(`
        INSERT INTO thread_messages (id,tenant_id,thread_id,sender_type,sender_name,body)
        VALUES (?,?,?,'admin','Centre',?)
      `).run(uuid(), req.tenantId, threadId,
             `We wanted to let you know that ${child?.first_name} had a ${event_type} today.\n\n${description||''}\n\n${action_taken?'Action taken: '+action_taken:''}`.trim());
    }

    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/health/:id', (req, res) => {
  try {
    const { follow_up_notes, parent_notified, action_taken } = req.body;
    D().prepare(`
      UPDATE health_events SET
        follow_up_notes=COALESCE(?,follow_up_notes),
        parent_notified=COALESCE(?,parent_notified),
        parent_notified_at=CASE WHEN ? THEN datetime('now') ELSE parent_notified_at END,
        action_taken=COALESCE(?,action_taken)
      WHERE id=? AND tenant_id=?
    `).run(follow_up_notes||null, parent_notified!=null?parent_notified:null,
           parent_notified, action_taken||null, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// IMMUNISATION TRACKING
// ─────────────────────────────────────────────────────────────────────────────

r.get('/immunisation/:childId', (req, res) => {
  try {
    const child = D().prepare(
      'SELECT id, first_name, last_name, dob FROM children WHERE id=? AND tenant_id=?'
    ).get(req.params.childId, req.tenantId);
    if (!child) return res.status(404).json({ error: 'Child not found' });

    const ageMonths = child.dob
      ? ((d) => { const n=new Date(); return (n.getFullYear()-d.getFullYear())*12+(n.getMonth()-d.getMonth()); })(new Date(child.dob))
      : 0;

    // Get AU schedule up to child's age + 3 months ahead
    const schedule = D().prepare(`
      SELECT * FROM immunisation_schedule
      WHERE country_code='AU' AND age_months <= ?
      ORDER BY age_months, vaccine
    `).all(ageMonths + 3);

    // Get recorded vaccinations
    const records = D().prepare(`
      SELECT * FROM immunisation_records WHERE child_id=? ORDER BY date_given DESC
    `).all(req.params.childId);

    const recordMap = {};
    records.forEach(r => {
      const key = r.vaccine_name.toLowerCase();
      if (!recordMap[key]) recordMap[key] = [];
      recordMap[key].push(r);
    });

    // Enrich schedule with completion status
    const enriched = schedule.map(s => {
      const recs = recordMap[s.vaccine.toLowerCase()] || [];
      const completed = recs.length > 0;
      const overdue = !completed && s.age_months <= ageMonths;
      const upcoming = !completed && s.age_months > ageMonths && s.age_months <= ageMonths + 3;
      return {
        ...s,
        completed,
        overdue,
        upcoming,
        record: recs[0] || null,
      };
    });

    const stats = {
      age_months: ageMonths,
      total_due: enriched.filter(s => s.age_months <= ageMonths).length,
      completed: enriched.filter(s => s.completed && s.age_months <= ageMonths).length,
      overdue: enriched.filter(s => s.overdue).length,
      upcoming: enriched.filter(s => s.upcoming).length,
    };

    res.json({ child, schedule: enriched, stats, all_records: records });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/immunisation/:childId', (req, res) => {
  try {
    const { vaccine_name, dose_number, date_given, batch_number, provider, next_due_date } = req.body;
    if (!vaccine_name) return res.status(400).json({ error: 'vaccine_name required' });
    const id = uuid();
    D().prepare(`
      INSERT INTO immunisation_records
        (id,tenant_id,child_id,vaccine_name,dose_number,date_given,batch_number,provider,next_due_date,status)
      VALUES (?,?,?,?,?,?,?,?,?,'current')
    `).run(id, req.tenantId, req.params.childId, vaccine_name,
           dose_number||1, date_given||null, batch_number||null,
           provider||null, next_due_date||null);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.delete('/immunisation/record/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM immunisation_records WHERE id=? AND tenant_id=?')
      .run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Centre-wide immunisation compliance
r.get('/immunisation-compliance', (req, res) => {
  try {
    const children = D().prepare(`
      SELECT c.id, c.first_name, c.last_name, c.dob, c.room_id, r.name as room_name,
        ((strftime('%Y','now')-strftime('%Y',c.dob))*12+(strftime('%m','now')-strftime('%m',c.dob))) as age_months
      FROM children c
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE c.tenant_id=? AND c.active=1 AND c.dob IS NOT NULL
    `).all(req.tenantId);

    const compliance = children.map(child => {
      const ageMonths = child.age_months || 0;
      const due = D().prepare(
        'SELECT COUNT(*) as n FROM immunisation_schedule WHERE age_months <= ? AND country_code=? AND is_required=1'
      ).get(ageMonths, 'AU')?.n || 0;
      const done = D().prepare(`
        SELECT COUNT(DISTINCT vaccine_name) as n FROM immunisation_records
        WHERE child_id=? AND status='current'
      `).get(child.id)?.n || 0;
      return {
        ...child,
        vaccines_due: due,
        vaccines_done: done,
        overdue: Math.max(0, due - done),
        compliant: done >= due,
      };
    });

    const summary = {
      total: compliance.length,
      compliant: compliance.filter(c => c.compliant).length,
      with_overdue: compliance.filter(c => c.overdue > 0).length,
    };

    res.json({ compliance, summary });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Stub routes for templates/scheduled (prevent 401 fallthrough)
r.get('/templates', (req, res) => { res.json({ templates: [] }); });
r.get('/scheduled', (req, res) => { res.json({ scheduled: [] }); });

export default r;
