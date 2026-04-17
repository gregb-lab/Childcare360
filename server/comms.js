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
import { mkdirSync } from 'fs';
import { extname } from 'path';

let multer;
try { multer = (await import('multer')).default; } catch(e) { multer = null; }

const r = Router();
r.use(requireAuth, requireTenant);

const now = () => new Date().toISOString();

// Column migrations are deferred to first use via ensureMsgCols()
let _msgColsMigrated = false;
function ensureMsgCols() {
  if (_msgColsMigrated) return;
  try { D().exec('ALTER TABLE thread_messages ADD COLUMN attachments TEXT DEFAULT \'[]\''); } catch(e) {}
  try { D().exec('ALTER TABLE thread_messages ADD COLUMN acknowledge_required INTEGER DEFAULT 0'); } catch(e) {}
  try { D().exec('ALTER TABLE thread_messages ADD COLUMN ack_at TEXT'); } catch(e) {}
  try { D().exec('ALTER TABLE thread_messages ADD COLUMN ack_by TEXT'); } catch(e) {}
  _msgColsMigrated = true;
}

// Multer upload for message attachments
const MSG_DIR = './uploads/messages';
try { mkdirSync(MSG_DIR, { recursive: true }); } catch(e) {}
const msgUpload = multer ? multer({ storage: multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MSG_DIR),
  filename: (_req, file, cb) => cb(null, uuid() + extname(file.originalname))
}), limits: { fileSize: 50 * 1024 * 1024 } }) : null;

// ─────────────────────────────────────────────────────────────────────────────
// TWO-WAY PARENT MESSAGING
// ─────────────────────────────────────────────────────────────────────────────

r.get('/threads', (req, res) => {
  try {
    ensureGroupCols();
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

let _groupColsMigrated = false;
function ensureGroupCols() {
  if (_groupColsMigrated) return;
  try { D().exec('ALTER TABLE message_threads ADD COLUMN to_group_label TEXT'); } catch(e) {}
  try { D().exec('ALTER TABLE message_threads ADD COLUMN recipient_count INTEGER DEFAULT 1'); } catch(e) {}
  _groupColsMigrated = true;
}

const handleCreateThread = (req, res) => {
  ensureGroupCols(); ensureMsgCols();
  try {
    const { child_id, subject, body, sender_name, acknowledge_required, recipients: rawRecipients } = req.body;
    if (!subject || !body) return res.status(400).json({ error: 'subject and body required' });

    const user = D().prepare('SELECT name, email FROM users WHERE id=?').get(req.userId);
    const resolvedName = sender_name || user?.name || user?.email?.split('@')[0] || 'Centre';
    const files = (req.files || []).map(f => ({ url: '/uploads/messages/' + f.filename, name: f.originalname, size: f.size, type: f.mimetype }));
    const ackFlag = acknowledge_required === '1' || acknowledge_required === true ? 1 : 0;
    const fileJson = JSON.stringify(files);

    // Parse recipients — may be JSON string from FormData or array
    let parsedRecipients = [];
    try { parsedRecipients = typeof rawRecipients === 'string' ? JSON.parse(rawRecipients) : (Array.isArray(rawRecipients) ? rawRecipients : []); } catch(e) {}

    // Expand any group IDs
    let groupLabel = null;
    let expandedCount = 0;
    const allRecipients = [];
    for (const r2 of parsedRecipients) {
      const rid = typeof r2 === 'string' ? r2 : r2?.id;
      if (rid && rid.startsWith('group_')) {
        const expanded = expandGroup(rid, req.tenantId);
        allRecipients.push(...expanded);
        expandedCount += expanded.length;
        // Use the first group name as label
        if (!groupLabel) {
          const label = typeof r2 === 'object' ? r2.name : rid.replace('group_', '').replace(/_/g, ' ');
          groupLabel = label + ' (' + expanded.length + ')';
        }
      } else if (rid) {
        allRecipients.push({ recipient_id: rid, recipient_name: typeof r2 === 'object' ? r2.name : '', recipient_type: typeof r2 === 'object' ? r2.type : 'individual' });
      }
    }

    // Deduplicate by recipient_id
    const seen = new Set();
    const unique = allRecipients.filter(r2 => { const k = r2.recipient_id || r2.recipient_email; if (!k || seen.has(k)) return false; seen.add(k); return true; });
    const recipientCount = unique.length || 1;

    // Create thread
    const threadId = uuid();
    D().prepare(`
      INSERT INTO message_threads (id, tenant_id, child_id, subject, last_message_at, last_message_preview, unread_parent, to_group_label, recipient_count)
      VALUES (?,?,?,?,datetime('now'),?,1,?,?)
    `).run(threadId, req.tenantId, child_id||null, subject, body.slice(0,100), groupLabel, recipientCount);

    D().prepare(`
      INSERT INTO thread_messages (id, tenant_id, thread_id, sender_type, sender_name, sender_user_id, body, attachments, acknowledge_required)
      VALUES (?,?,?,'admin',?,?,?,?,?)
    `).run(uuid(), req.tenantId, threadId, resolvedName, req.userId||null, body, fileJson, ackFlag);

    try {
      D().prepare('INSERT INTO audit_log (id,user_id,tenant_id,action,details,ip_address,user_agent) VALUES (?,?,?,?,?,?,?)')
        .run(uuid(), req.userId || null, req.tenantId, 'message_thread_created',
          JSON.stringify({ entity_type: child_id ? 'child' : 'system', entity_id: child_id || null,
            category: 'communication', thread_id: threadId, subject, recipient_count: recipientCount,
            snippet: body?.slice(0, 50) }),
          req.ip || null, req.headers['user-agent'] || null);
    } catch (e) {}

    res.json({ id: threadId, ok: true, recipient_count: recipientCount, group_label: groupLabel });
  } catch(e) { res.status(500).json({ error: e.message }); }
};
if (msgUpload) {
  r.post('/threads', msgUpload.array('attachments', 10), handleCreateThread);
} else {
  r.post('/threads', handleCreateThread);
}

r.get('/threads/:id', (req, res) => {
  try {
    ensureMsgCols();
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
    ensureMsgCols();
    const { body, sender_type = 'admin', sender_name } = req.body;
    if (!body) return res.status(400).json({ error: 'body required' });

    const thread = D().prepare('SELECT id FROM message_threads WHERE id=? AND tenant_id=?')
      .get(req.params.id, req.tenantId);
    if (!thread) return res.status(404).json({ error: 'Not found' });

    // Resolve real user name
    const user = D().prepare('SELECT name, email FROM users WHERE id=?').get(req.userId);
    const resolvedName = sender_name === 'Centre' ? (user?.name || user?.email?.split('@')[0] || 'Centre') : (sender_name || 'Centre');

    D().prepare(`
      INSERT INTO thread_messages (id, tenant_id, thread_id, sender_type, sender_name, sender_user_id, body)
      VALUES (?,?,?,?,?,?,?)
    `).run(uuid(), req.tenantId, req.params.id, sender_type,
           resolvedName, req.userId||null, body);

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
      const overdue = !completed && s.age_months <= ageMonths && s.status !== "not_applicable";
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

// ─── GROUP EXPANSION ──────────────────────────────────────────────────────
function expandGroup(groupId, tenantId) {
  const db = D();
  if (groupId === 'group_all_parents') {
    return db.prepare("SELECT pc.id as recipient_id, pc.name as recipient_name, pc.email as recipient_email, 'parent' as recipient_type FROM parent_contacts pc JOIN children c ON c.id=pc.child_id WHERE pc.tenant_id=? AND c.active=1").all(tenantId);
  }
  if (groupId === 'group_all_educators') {
    return db.prepare("SELECT e.id as recipient_id, e.first_name || ' ' || e.last_name as recipient_name, e.email as recipient_email, 'educator' as recipient_type FROM educators e WHERE e.tenant_id=? AND e.status='active'").all(tenantId);
  }
  if (groupId === 'group_all_staff') {
    return db.prepare("SELECT u.id as recipient_id, COALESCE(u.name, u.email) as recipient_name, u.email as recipient_email, 'staff' as recipient_type FROM users u JOIN tenant_members tm ON tm.user_id=u.id WHERE tm.tenant_id=?").all(tenantId);
  }
  if (groupId === 'group_admin') {
    return db.prepare("SELECT u.id as recipient_id, COALESCE(u.name, u.email) as recipient_name, u.email as recipient_email, 'admin' as recipient_type FROM users u JOIN tenant_members tm ON tm.user_id=u.id WHERE tm.tenant_id=? AND tm.role IN ('admin','director','manager','owner')").all(tenantId);
  }
  if (groupId.startsWith('group_room_parents_')) {
    const roomId = groupId.replace('group_room_parents_', '');
    return db.prepare("SELECT pc.id as recipient_id, pc.name as recipient_name, pc.email as recipient_email, 'parent' as recipient_type FROM parent_contacts pc JOIN children c ON c.id=pc.child_id WHERE pc.tenant_id=? AND c.room_id=? AND c.active=1").all(tenantId, roomId);
  }
  if (groupId.startsWith('group_room_educators_')) {
    const roomId = groupId.replace('group_room_educators_', '');
    return db.prepare("SELECT e.id as recipient_id, e.first_name || ' ' || e.last_name as recipient_name, e.email as recipient_email, 'educator' as recipient_type FROM educators e WHERE e.tenant_id=? AND e.preferred_room_id=?").all(tenantId, roomId);
  }
  return [];
}

// ─── RECIPIENTS ────────────────────────────────────────────────────────────
r.get('/recipients', (req, res) => {
  try {
    const staff = D().prepare(
      "SELECT e.id, e.first_name || ' ' || e.last_name as name, e.role_title as role, r.name as room_name, 'staff' as type FROM educators e LEFT JOIN rooms r ON r.id=e.preferred_room_id WHERE e.tenant_id=? AND e.status='active' ORDER BY e.first_name"
    ).all(req.tenantId);
    let parents = [];
    try {
      parents = D().prepare(
        "SELECT pc.id, pc.name, pc.email, c.first_name || ' ' || c.last_name as child_name, 'parent' as type FROM parent_contacts pc JOIN children c ON c.id=pc.child_id WHERE pc.tenant_id=? AND c.active=1 ORDER BY pc.name"
      ).all(req.tenantId);
    } catch(e) {}
    const rooms = D().prepare('SELECT id, name FROM rooms WHERE tenant_id=?').all(req.tenantId);
    const groups = [
      { id: 'group_all_parents', name: 'All parents', description: 'Every family enrolled at this centre', type: 'group', icon: 'parents' },
      { id: 'group_all_educators', name: 'All educators', description: 'Every educator on staff', type: 'group', icon: 'educators' },
      { id: 'group_all_staff', name: 'All staff', description: 'Educators, admin, and management', type: 'group', icon: 'staff' },
      { id: 'group_admin', name: 'Admin & management', description: 'Directors, managers, and admin roles', type: 'group', icon: 'admin' },
      ...rooms.map(rm => ({ id: 'group_room_parents_' + rm.id, name: rm.name + ' \u2014 parents', description: 'Parents of children in ' + rm.name, type: 'group', icon: 'room_parents', room_id: rm.id })),
      ...rooms.map(rm => ({ id: 'group_room_educators_' + rm.id, name: rm.name + ' \u2014 educators', description: 'Educators assigned to ' + rm.name, type: 'group', icon: 'room_educators', room_id: rm.id })),
    ];
    res.json({ staff, parents, groups });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── ACKNOWLEDGE ────────────────────────────────────────────────────────────
r.post('/messages/:id/acknowledge', (req, res) => {
  try {
    ensureMsgCols();
    D().prepare("UPDATE thread_messages SET ack_at=datetime('now'), ack_by=? WHERE id=? AND tenant_id=?")
      .run(req.userId, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Stub routes for templates/scheduled (prevent 401 fallthrough)
r.get('/templates', (req, res) => { res.json({ templates: [] }); });
r.get('/scheduled', (req, res) => { res.json({ scheduled: [] }); });

// ─── SMS COMPOSE ──────────────────────────────────────────────────────────

function ensureSmsTable() {
  try {
    D().prepare(`CREATE TABLE IF NOT EXISTS sms_messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      sent_by TEXT,
      to_number TEXT NOT NULL,
      message TEXT NOT NULL,
      twilio_sid TEXT,
      status TEXT DEFAULT 'sent',
      child_id TEXT,
      educator_id TEXT,
      purpose TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();
  } catch (e) {}
}
ensureSmsTable();

// Normalise to E.164 — assume AU (+61) if it starts with 0
function toE164AU(raw) {
  const clean = (raw || '').replace(/[\s\-().]/g, '');
  if (/^\+61\d{9}$/.test(clean)) return clean;
  if (/^61\d{9}$/.test(clean)) return '+' + clean;
  if (/^0\d{9}$/.test(clean)) return '+61' + clean.slice(1);
  if (/^\+\d{8,15}$/.test(clean)) return clean;
  return null;
}

async function sendSmsViaTwilio(to, body, tenantId) {
  const vs = D().prepare('SELECT * FROM voice_settings WHERE tenant_id=?').get(tenantId) || {};
  const sid = process.env.TWILIO_ACCOUNT_SID || vs.twilio_account_sid;
  const tok = process.env.TWILIO_AUTH_TOKEN || vs.twilio_auth_token;
  const from = process.env.TWILIO_PHONE_NUMBER || vs.twilio_phone_number;
  if (!sid || !tok || !from) throw new Error('Twilio not configured');
  const mod = await import('twilio');
  const client = (mod.default || mod)(sid, tok);
  return await client.messages.create({ body, to, from });
}

function auditSafe(userId, tenantId, action, details, req) {
  try {
    D().prepare('INSERT INTO audit_log (id,user_id,tenant_id,action,details,ip_address,user_agent) VALUES (?,?,?,?,?,?,?)')
      .run(uuid(), userId || null, tenantId, action,
        typeof details === 'string' ? details : JSON.stringify(details),
        req?.ip || null, req?.headers?.['user-agent'] || null);
  } catch (e) {}
}

// POST /api/comms/sms/send
r.post('/sms/send', async (req, res) => {
  try {
    ensureSmsTable();
    const { to, message, child_id, educator_id, purpose } = req.body || {};
    if (!to) return res.status(400).json({ error: 'to required' });
    if (!message || !message.trim()) return res.status(400).json({ error: 'message required' });
    if (message.length > 1600) return res.status(400).json({ error: 'message too long (max 1600 chars)' });

    const e164 = toE164AU(to);
    if (!e164) return res.status(400).json({ error: 'Invalid phone number format' });

    const id = uuid();
    let twilioSid = null;
    let status = 'sent';
    let errorMessage = null;
    try {
      const msg = await sendSmsViaTwilio(e164, message, req.tenantId);
      twilioSid = msg.sid;
      status = msg.status || 'sent';
    } catch (err) {
      status = 'failed';
      errorMessage = err.message;
    }

    D().prepare(`INSERT INTO sms_messages
      (id, tenant_id, sent_by, to_number, message, twilio_sid, status,
       child_id, educator_id, purpose, error_message)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, req.tenantId, req.userId || null, e164, message, twilioSid,
        status, child_id || null, educator_id || null, purpose || null, errorMessage);

    const entityType = child_id ? 'child' : educator_id ? 'educator' : 'system';
    const entityId = child_id || educator_id || null;
    const snippet = message.length > 50 ? message.slice(0, 50) + '…' : message;
    auditSafe(req.userId, req.tenantId, 'sms_sent', {
      entity_type: entityType, entity_id: entityId, category: 'communication',
      to: e164, snippet, twilio_sid: twilioSid, status, purpose: purpose || null,
    }, req);

    if (status === 'failed') return res.status(500).json({ ok: false, id, error: errorMessage });
    res.json({ ok: true, id, twilio_sid: twilioSid, status, to: e164 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/comms/sms/history?limit=20
r.get('/sms/history', (req, res) => {
  try {
    ensureSmsTable();
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const rows = D().prepare(`SELECT sm.*, u.name as sent_by_name,
        c.first_name || ' ' || c.last_name as child_name,
        e.first_name || ' ' || e.last_name as educator_name
      FROM sms_messages sm
      LEFT JOIN users u ON u.id = sm.sent_by
      LEFT JOIN children c ON c.id = sm.child_id
      LEFT JOIN educators e ON e.id = sm.educator_id
      WHERE sm.tenant_id = ?
      ORDER BY sm.created_at DESC LIMIT ?`).all(req.tenantId, limit);
    res.json({ messages: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Audit thread create — add to existing POST /threads handler
// (done via post-send audit in handleCreateThread fallback — see below)

export default r;
export { auditSafe };
