/**
 * server/engagement.js — v2.8.0
 * Family & staff engagement features:
 *   /api/engagement/events        — Centre events + RSVP
 *   /api/engagement/posts         — Community posts (family shares from home)
 *   /api/engagement/reactions     — Story reactions (heart, star, etc.)
 *   /api/engagement/comments      — Story comments
 *   /api/engagement/policies      — Policy documents library + acknowledgements
 *   /api/engagement/checklists    — Custom checklist builder + completions
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

const pg = req => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(200, parseInt(req.query.limit) || 50);
  return { limit, offset: (page - 1) * limit, page };
};

// ─────────────────────────────────────────────────────────────────────────────
// CENTRE EVENTS + RSVP
// ─────────────────────────────────────────────────────────────────────────────

r.get('/events', (req, res) => {
  try {
    const { from, to, upcoming } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const fromDate = from || (upcoming ? today : new Date(Date.now() - 30*86400000).toISOString().split('T')[0]);
    const toDate   = to   || new Date(Date.now() + 90*86400000).toISOString().split('T')[0];
    const { limit, offset, page } = pg(req);

    const events = D().prepare('
      SELECT e.*,
        COUNT(DISTINCT r.id) as rsvp_count,
        SUM(CASE WHEN r.status=\'attending\' THEN r.guest_count ELSE 0 END) as attending_count
      FROM centre_events e
      LEFT JOIN event_rsvps r ON r.event_id = e.id
      WHERE e.tenant_id=? AND e.event_date BETWEEN ? AND ?
      GROUP BY e.id
      ORDER BY e.event_date, e.start_time
      LIMIT ? OFFSET ?
    ').all(req.tenantId, fromDate, toDate, limit, offset);

    const total = D().prepare(
      `SELECT COUNT(*) as n FROM centre_events WHERE tenant_id=? AND event_date BETWEEN ? AND ?`
    ).get(req.tenantId, fromDate, toDate)?.n || 0;

    res.json({
      events: events.map(e => ({ ...e, room_ids: JSON.parse(e.room_ids || '[]') })),
      total, page, pages: Math.ceil(total / limit)
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.get('/events/:id', (req, res) => {
  try {
    const event = D().prepare('SELECT * FROM centre_events WHERE id=? AND tenant_id=?')
      .get(req.params.id, req.tenantId);
    if (!event) return res.status(404).json({ error: 'Not found' });

    const rsvps = D().prepare('
      SELECT er.*, c.first_name as child_first, c.last_name as child_last
      FROM event_rsvps er
      LEFT JOIN children c ON c.id = er.child_id
      WHERE er.event_id=? ORDER BY er.created_at
    ').all(req.params.id);

    res.json({ event: { ...event, room_ids: JSON.parse(event.room_ids || '[]') }, rsvps });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/events', (req, res) => {
  try {
    const { title, description, event_type, event_date, start_time, end_time,
            location, all_rooms, room_ids, rsvp_required, rsvp_deadline,
            max_attendees, created_by } = req.body;
    if (!title || !event_date) return res.status(400).json({ error: 'title and event_date required' });

    const id = uuid();
    D().prepare('
      INSERT INTO centre_events
        (id,tenant_id,title,description,event_type,event_date,start_time,end_time,
         location,all_rooms,room_ids,rsvp_required,rsvp_deadline,max_attendees,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ').run(id, req.tenantId, title, description||null, event_type||'general',
           event_date, start_time||null, end_time||null, location||null,
           all_rooms!==false?1:0, JSON.stringify(room_ids||[]),
           rsvp_required?1:0, rsvp_deadline||null, max_attendees||null, created_by||null);

    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/events/:id', (req, res) => {
  try {
    const { title, description, event_type, event_date, start_time, end_time,
            location, rsvp_required, rsvp_deadline, max_attendees } = req.body;
    D().prepare('
      UPDATE centre_events SET
        title=COALESCE(?,title), description=COALESCE(?,description),
        event_type=COALESCE(?,event_type), event_date=COALESCE(?,event_date),
        start_time=COALESCE(?,start_time), end_time=COALESCE(?,end_time),
        location=COALESCE(?,location), rsvp_required=COALESCE(?,rsvp_required),
        rsvp_deadline=COALESCE(?,rsvp_deadline), max_attendees=COALESCE(?,max_attendees)
      WHERE id=? AND tenant_id=?
    ').run(title||null, description||null, event_type||null, event_date||null,
           start_time||null, end_time||null, location||null,
           rsvp_required!=null?rsvp_required:null, rsvp_deadline||null,
           max_attendees||null, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.delete('/events/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM centre_events WHERE id=? AND tenant_id=?')
      .run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// RSVP
r.post('/events/:id/rsvp', (req, res) => {
  try {
    const { child_id, parent_user_id, status, guest_count, notes } = req.body;
    const event = D().prepare('SELECT * FROM centre_events WHERE id=? AND tenant_id=?')
      .get(req.params.id, req.tenantId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Check capacity
    if (event.max_attendees && status === 'attending') {
      const attending = D().prepare(
        `SELECT SUM(guest_count) as n FROM event_rsvps WHERE event_id=? AND status='attending'`
      ).get(req.params.id)?.n || 0;
      if (attending >= event.max_attendees)
        return res.status(409).json({ error: 'Event is at capacity' });
    }

    const id = uuid();
    D().prepare('
      INSERT INTO event_rsvps (id,event_id,tenant_id,child_id,parent_user_id,status,guest_count,notes)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(event_id,child_id) DO UPDATE SET
        status=excluded.status, guest_count=excluded.guest_count, notes=excluded.notes
    ').run(id, req.params.id, req.tenantId, child_id||null, parent_user_id||null,
           status||'attending', guest_count||1, notes||null);

    const count = D().prepare(
      `SELECT COUNT(*) as n, SUM(guest_count) as total FROM event_rsvps WHERE event_id=? AND status='attending'`
    ).get(req.params.id);
    res.json({ ok: true, attending: count.n, total_guests: count.total });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMUNITY POSTS
// ─────────────────────────────────────────────────────────────────────────────

r.get('/posts', (req, res) => {
  try {
    const { child_id } = req.query;
    const { limit, offset, page } = pg(req);
    const where = ['p.tenant_id=?'];
    const vals  = [req.tenantId];
    if (child_id) { where.push('(p.child_id=? OR p.child_id IS NULL)'); vals.push(child_id); }

    const posts = D().prepare(`
      SELECT p.*,
        COUNT(DISTINCT r.id) as reaction_count,
        COUNT(DISTINCT c.id) as comment_count
      FROM community_posts p
      LEFT JOIN story_reactions r ON r.story_id=p.id AND r.story_type='community'
      LEFT JOIN story_comments  c ON c.story_id=p.id AND c.story_type='community'
      WHERE ${where.join(' AND ')}
      GROUP BY p.id
      ORDER BY p.pinned DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...vals, limit, offset);

    const total = D().prepare(
      `SELECT COUNT(*) as n FROM community_posts p WHERE ${where.join(' AND ')}`
    ).get(...vals)?.n || 0;

    res.json({
      posts: posts.map(p => ({ ...p, photo_urls: JSON.parse(p.photo_urls || '[]') })),
      total, page, pages: Math.ceil(total / limit)
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/posts', (req, res) => {
  try {
    const { author_user_id, author_name, author_type, child_id, title, body, photo_urls, visibility } = req.body;
    if (!body) return res.status(400).json({ error: 'body required' });
    const id = uuid();
    D().prepare('
      INSERT INTO community_posts
        (id,tenant_id,author_user_id,author_name,author_type,child_id,title,body,photo_urls,visibility)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    ').run(id, req.tenantId, author_user_id||req.userId, author_name||null,
           author_type||'parent', child_id||null, title||null, body,
           JSON.stringify(photo_urls||[]), visibility||'centre');
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.delete('/posts/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM community_posts WHERE id=? AND tenant_id=?')
      .run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/posts/:id/pin', (req, res) => {
  try {
    const { pinned } = req.body;
    D().prepare('UPDATE community_posts SET pinned=? WHERE id=? AND tenant_id=?')
      .run(pinned ? 1 : 0, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// STORY REACTIONS  (heart / star / clap / wow)
// ─────────────────────────────────────────────────────────────────────────────

r.post('/reactions', (req, res) => {
  try {
    const { story_id, story_type, user_id, reaction } = req.body;
    if (!story_id || !user_id) return res.status(400).json({ error: 'story_id and user_id required' });

    // Toggle: if exists remove it, otherwise add it
    const existing = D().prepare(
      'SELECT id FROM story_reactions WHERE story_id=? AND user_id=? AND reaction=?'
    ).get(story_id, user_id, reaction || 'heart');

    if (existing) {
      D().prepare('DELETE FROM story_reactions WHERE id=?').run(existing.id);
    } else {
      D().prepare('
        INSERT OR IGNORE INTO story_reactions (id,tenant_id,story_id,story_type,user_id,reaction)
        VALUES (?,?,?,?,?,?)
      ').run(uuid(), req.tenantId, story_id, story_type||'observation', user_id, reaction||'heart');
    }

    const counts = D().prepare('
      SELECT reaction, COUNT(*) as n FROM story_reactions WHERE story_id=? GROUP BY reaction
    ').all(story_id);

    res.json({ ok: true, removed: !!existing, counts });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.get('/reactions/:storyId', (req, res) => {
  try {
    const counts = D().prepare('
      SELECT reaction, COUNT(*) as n, GROUP_CONCAT(user_id) as users
      FROM story_reactions WHERE story_id=? GROUP BY reaction
    ').all(req.params.storyId);
    res.json({ counts });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// STORY COMMENTS
// ─────────────────────────────────────────────────────────────────────────────

r.get('/comments/:storyId', (req, res) => {
  try {
    const comments = D().prepare('
      SELECT * FROM story_comments WHERE story_id=?
      ORDER BY created_at ASC
    ').all(req.params.storyId);
    res.json({ comments });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/comments', (req, res) => {
  try {
    const { story_id, story_type, author_user_id, author_name, author_type, body, reply_to_id } = req.body;
    if (!story_id || !body) return res.status(400).json({ error: 'story_id and body required' });
    const id = uuid();
    D().prepare('
      INSERT INTO story_comments
        (id,tenant_id,story_id,story_type,author_user_id,author_name,author_type,body,reply_to_id)
      VALUES (?,?,?,?,?,?,?,?,?)
    ').run(id, req.tenantId, story_id, story_type||'observation',
           author_user_id||req.userId, author_name||null, author_type||'educator',
           body, reply_to_id||null);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.delete('/comments/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM story_comments WHERE id=? AND tenant_id=?')
      .run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// POLICY DOCUMENTS LIBRARY
// ─────────────────────────────────────────────────────────────────────────────

r.get('/policies', (req, res) => {
  try {
    const { category, status } = req.query;
    const where = ['pd.tenant_id=?'];
    const vals  = [req.tenantId];
    if (category) { where.push('pd.category=?'); vals.push(category); }
    if (status)   { where.push('pd.status=?');   vals.push(status);   }
    else          { where.push("pd.status='active'"); }

    const docs = D().prepare(`
      SELECT pd.*,
        COUNT(DISTINCT pa.id) as ack_count
      FROM policy_documents pd
      LEFT JOIN policy_acknowledgements pa ON pa.document_id=pd.id
      WHERE ${where.join(' AND ')}
      GROUP BY pd.id
      ORDER BY pd.category, pd.title
    `).all(...vals);

    res.json({ documents: docs });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/policies', (req, res) => {
  try {
    const { title, category, description, file_url, file_name, file_size,
            version, requires_acknowledgement, visible_to_parents, created_by } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const id = uuid();
    D().prepare('
      INSERT INTO policy_documents
        (id,tenant_id,title,category,description,file_url,file_name,file_size,
         version,requires_acknowledgement,visible_to_parents,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ').run(id, req.tenantId, title, category||'policy', description||null,
           file_url||null, file_name||null, file_size||null,
           version||'1.0', requires_acknowledgement?1:0,
           visible_to_parents?1:0, created_by||null);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/policies/:id', (req, res) => {
  try {
    const { title, description, status, version, requires_acknowledgement, visible_to_parents } = req.body;
    D().prepare('
      UPDATE policy_documents SET
        title=COALESCE(?,title), description=COALESCE(?,description),
        status=COALESCE(?,status), version=COALESCE(?,version),
        requires_acknowledgement=COALESCE(?,requires_acknowledgement),
        visible_to_parents=COALESCE(?,visible_to_parents),
        updated_at=datetime(\'now\')
      WHERE id=? AND tenant_id=?
    ').run(title||null, description||null, status||null, version||null,
           requires_acknowledgement!=null?requires_acknowledgement:null,
           visible_to_parents!=null?visible_to_parents:null,
           req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get acknowledgement status for a document
r.get('/policies/:id/acknowledgements', (req, res) => {
  try {
    const acks = D().prepare('
      SELECT pa.*, e.first_name, e.last_name, e.qualification
      FROM policy_acknowledgements pa
      LEFT JOIN educators e ON e.id=pa.educator_id
      WHERE pa.document_id=? AND pa.tenant_id=?
      ORDER BY pa.acknowledged_at DESC
    ').all(req.params.id, req.tenantId);

    // Who hasn't acknowledged yet
    const allEducators = D().prepare(
      `SELECT id, first_name, last_name FROM educators WHERE tenant_id=? AND status='active'`
    ).all(req.tenantId);
    const ackedIds = new Set(acks.map(a => a.educator_id));
    const pending = allEducators.filter(e => !ackedIds.has(e.id));

    res.json({ acknowledged: acks, pending });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Acknowledge a document
r.post('/policies/:id/acknowledge', (req, res) => {
  try {
    const { user_id, educator_id, version } = req.body;
    const doc = D().prepare('SELECT * FROM policy_documents WHERE id=? AND tenant_id=?')
      .get(req.params.id, req.tenantId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    D().prepare('
      INSERT OR REPLACE INTO policy_acknowledgements
        (id,tenant_id,document_id,user_id,educator_id,version)
      VALUES (?,?,?,?,?,?)
    ').run(uuid(), req.tenantId, req.params.id,
           user_id||req.userId, educator_id||null, version||doc.version);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM CHECKLIST BUILDER
// ─────────────────────────────────────────────────────────────────────────────

r.get('/checklists', (req, res) => {
  try {
    const { active } = req.query;
    const where = ['tenant_id=?'];
    const vals  = [req.tenantId];
    if (active !== 'all') { where.push('active=1'); }

    const templates = D().prepare(`
      SELECT ct.*,
        (SELECT COUNT(*) FROM checklist_completions cc
         WHERE cc.template_id=ct.id AND cc.date=date('now','localtime')) as completed_today
      FROM checklist_templates ct
      WHERE ${where.join(' AND ')}
      ORDER BY ct.category, ct.title
    `).all(...vals);

    res.json({
      templates: templates.map(t => ({
        ...t,
        items: JSON.parse(t.items || '[]'),
        room_ids: JSON.parse(t.room_ids || '[]')
      }))
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/checklists', (req, res) => {
  try {
    const { title, description, category, frequency, room_ids,
            assign_to_role, items, created_by } = req.body;
    if (!title || !items?.length) return res.status(400).json({ error: 'title and items required' });
    const id = uuid();
    D().prepare('
      INSERT INTO checklist_templates
        (id,tenant_id,title,description,category,frequency,room_ids,assign_to_role,items,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    ').run(id, req.tenantId, title, description||null, category||'daily',
           frequency||'daily', JSON.stringify(room_ids||[]),
           assign_to_role||'educator', JSON.stringify(items), created_by||null);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/checklists/:id', (req, res) => {
  try {
    const { title, description, items, active, frequency } = req.body;
    D().prepare('
      UPDATE checklist_templates SET
        title=COALESCE(?,title), description=COALESCE(?,description),
        items=COALESCE(?,items), active=COALESCE(?,active),
        frequency=COALESCE(?,frequency)
      WHERE id=? AND tenant_id=?
    ').run(title||null, description||null,
           items ? JSON.stringify(items) : null,
           active!=null?active:null, frequency||null,
           req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.delete('/checklists/:id', (req, res) => {
  try {
    D().prepare('UPDATE checklist_templates SET active=0 WHERE id=? AND tenant_id=?')
      .run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Submit a completed checklist
r.post('/checklists/:id/complete', (req, res) => {
  try {
    const { completed_by, educator_id, responses, notes, date } = req.body;
    if (!responses?.length) return res.status(400).json({ error: 'responses required' });

    const id = uuid();
    const d  = date || new Date().toISOString().split('T')[0];
    D().prepare('
      INSERT INTO checklist_completions
        (id,tenant_id,template_id,completed_by,educator_id,date,responses,notes)
      VALUES (?,?,?,?,?,?,?,?)
    ').run(id, req.tenantId, req.params.id, completed_by||null, educator_id||null,
           d, JSON.stringify(responses), notes||null);

    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get completions for a template
r.get('/checklists/:id/completions', (req, res) => {
  try {
    const { from, to } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const completions = D().prepare('
      SELECT cc.*, e.first_name, e.last_name
      FROM checklist_completions cc
      LEFT JOIN educators e ON e.id=cc.educator_id
      WHERE cc.template_id=? AND cc.tenant_id=?
        AND cc.date BETWEEN ? AND ?
      ORDER BY cc.date DESC, cc.completed_at DESC
    ').all(req.params.id, req.tenantId,
           from || new Date(Date.now()-7*86400000).toISOString().split('T')[0],
           to || today);

    res.json({
      completions: completions.map(c => ({
        ...c, responses: JSON.parse(c.responses || '[]')
      }))
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Daily summary — which checklists are done/overdue today
r.get('/checklists/status/today', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const templates = D().prepare(
      `SELECT id, title, category, frequency, assign_to_role FROM checklist_templates WHERE tenant_id=? AND active=1`
    ).all(req.tenantId);

    const done = new Set(
      D().prepare('SELECT template_id FROM checklist_completions WHERE tenant_id=? AND date=?')
        .all(req.tenantId, today).map(c => c.template_id)
    );

    const status = templates.map(t => ({
      ...t,
      completed: done.has(t.id),
      status: done.has(t.id) ? 'done' : 'pending'
    }));

    res.json({
      status,
      done_count: status.filter(s => s.completed).length,
      pending_count: status.filter(s => !s.completed).length
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
