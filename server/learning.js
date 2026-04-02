import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uuid() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|gif|webp/.test(file.mimetype);
    cb(ok ? null : new Error('Images only'), ok);
  }
});

const r = Router();
r.use(requireAuth);
r.use(requireTenant);

// ─── JSON helpers ─────────────────────────────────────────────────────────────
const J  = (v) => { try { return JSON.parse(v || '[]'); } catch { return []; } };
const JO = (v) => { try { return JSON.parse(v || '{}'); } catch { return {}; } };
const S  = (v) => JSON.stringify(v ?? []);
const SO = (v) => JSON.stringify(v ?? {});

function periodWhere(period) {
  switch (period) {
    case 'today':     return `ls.date = date('now','localtime')`;
    case 'yesterday': return `ls.date = date('now','-1 day','localtime')`;
    case 'week':      return `ls.date >= date('now','-7 days','localtime')`;
    case 'month':     return `ls.date >= date('now','-30 days','localtime')`;
    case 'year':      return `ls.date >= date('now','-365 days','localtime')`;
    default:          return '1=1';
  }
}

function hydrateStory(row) {
  if (!row) return null;
  return {
    ...row,
    child_ids:   J(row.child_ids),
    eylf_outcomes: J(row.eylf_outcomes),
    eylf_sub_outcomes: JO(row.eylf_sub_outcomes),
    tags:        J(row.tags),
    photos:      J(row.photos),
    ai_progression_suggestions: J(row.ai_progression_suggestions || '[]'),
    educator_name: row.educator_name || row.educator_name_u || 'Educator',
  };
}

function attachPhotos(stories) {
  if (!stories.length) return stories;
  const ids = stories.map(s => s.id);
  const ph  = D().prepare((() => 'SELECT * FROM story_photos WHERE story_id IN (' + ids.map(() => '?').join(',') + ') ORDER BY sort_order')()).all(...ids);
  const map = {};
  ph.forEach(p => {
    if (!map[p.story_id]) map[p.story_id] = [];
    map[p.story_id].push({ ...p, tagged_child_ids: J(p.tagged_child_ids), tagged_labels: J(p.tagged_labels), ai_suggested_tags: J(p.ai_suggested_tags) });
  });
  return stories.map(s => ({ ...s, photo_rows: map[s.id] || [] }));
}

// ─── FAMILIES ────────────────────────────────────────────────────────────────

function ensureFamily(db, tenantId, child) {
  if (!child.parent1_email) return null;
  let fam = db.prepare('SELECT * FROM families WHERE tenant_id=? AND (email=? OR email2=?)').get(tenantId, child.parent1_email, child.parent1_email);
  if (!fam) {
    const fid = uuid();
    db.prepare('INSERT INTO families (id,tenant_id,family_name,email,email2,phone) VALUES(?,?,?,?,?,?)')
      .run(fid, tenantId, (child.last_name || '') + ' Family', child.parent1_email, child.parent2_email || null, child.parent1_phone || null);
    fam = db.prepare('SELECT * FROM families WHERE id=?').get(fid);
  }
  try { db.prepare('INSERT OR IGNORE INTO family_children (id,family_id,child_id,tenant_id) VALUES(?,?,?,?)').run(uuid(), fam.id, child.id, tenantId); } catch {}
  return fam;
}

r.get('/families', (req, res) => {
  const rows = D().prepare(`
    SELECT f.*, COUNT(DISTINCT fc.child_id) as child_count,
           GROUP_CONCAT(c.first_name || ' ' || c.last_name, ', ') as children_names
    FROM families f
    LEFT JOIN family_children fc ON fc.family_id=f.id
    LEFT JOIN children c ON c.id=fc.child_id AND c.active=1
    WHERE f.tenant_id=?
    GROUP BY f.id ORDER BY f.family_name
  `).all(req.tenantId);
  const ids = rows.map(f => f.id);
  let childMap = {};
  if (ids.length) {
    D().prepare((() => 'SELECT fc.family_id, c.id, c.first_name, c.last_name, c.dob, c.room_id, c.photo_url FROM family_children fc JOIN children c ON c.id=fc.child_id WHERE fc.family_id IN (' + ids.map(() => '?').join(',') + ') AND c.active=1')()).all(...ids).forEach(r => {
      if (!childMap[r.family_id]) childMap[r.family_id] = [];
      childMap[r.family_id].push(r);
    });
  }
  res.json(rows.map(f => ({ ...f, children: childMap[f.id] || [] })));
});

r.post('/families/sync', (req, res) => {
  const children = D().prepare('SELECT * FROM children WHERE tenant_id=? AND active=1').all(req.tenantId);
  let linked = 0;
  children.forEach(c => { if (ensureFamily(D(), req.tenantId, c)) linked++; });
  res.json({ ok: true, linked });
});

r.get('/families/:id/stories', (req, res) => {
  const children = D().prepare('SELECT child_id FROM family_children WHERE family_id=? AND tenant_id=?').all(req.params.id, req.tenantId).map(r => r.child_id);
  if (!children.length) return res.json([]);
  const rows = D().prepare(`SELECT ls.*, u.name as educator_name_u, e.photo_url as educator_photo_url FROM learning_stories ls LEFT JOIN users u ON u.id=ls.educator_id LEFT JOIN educators e ON e.tenant_id=ls.tenant_id AND (e.email=u.email OR e.id=ls.educator_id) WHERE ls.tenant_id=? AND ls.published=1 ORDER BY ls.date DESC LIMIT 50`).all(req.tenantId);
  const stories = attachPhotos(rows.map(hydrateStory).filter(s => children.some(cid => s.child_ids.includes(cid))));
  res.json(stories);
});

// ─── LEARNING STORIES ────────────────────────────────────────────────────────

r.get('/stories', (req, res) => {
  const { period = 'month', child_id, family_id, room_id, eylf, tag, album_id, published, q } = req.query;
  let sql = `SELECT ls.*, u.name as educator_name_u, e.photo_url as educator_photo_url FROM learning_stories ls LEFT JOIN users u ON u.id=ls.educator_id LEFT JOIN educators e ON e.tenant_id=ls.tenant_id AND (e.email=u.email OR e.id=ls.educator_id) WHERE ls.tenant_id=? AND ${periodWhere(period)}`;
  const params = [req.tenantId];
  if (room_id)  { sql += ' AND ls.room_id=?';  params.push(room_id); }
  if (album_id) { sql += ' AND ls.album_id=?'; params.push(album_id); }
  if (published === '1') { sql += ' AND ls.published=1'; }
  if (q) { sql += ' AND (ls.title LIKE ? OR ls.content LIKE ?)'; params.push('%'+q+'%', '%'+q+'%'); }
  sql += ' ORDER BY ls.date DESC, ls.created_at DESC LIMIT 150';

  let stories = D().prepare(sql).all(...params).map(hydrateStory);

  // Family filter — expand to all children in family
  if (family_id) {
    const famChildren = D().prepare('SELECT child_id FROM family_children WHERE family_id=? AND tenant_id=?').all(family_id, req.tenantId).map(r => r.child_id);
    stories = stories.filter(s => famChildren.some(cid => s.child_ids.includes(cid)));
  } else if (child_id) {
    stories = stories.filter(s => s.child_ids.includes(child_id));
  }
  if (eylf) stories = stories.filter(s => s.eylf_outcomes.includes(parseInt(eylf)));
  if (tag)  stories = stories.filter(s => s.tags.includes(tag));

  res.json(attachPhotos(stories));
});

r.get('/stories/:id', (req, res) => {
  const row = D().prepare('SELECT ls.*, u.name as educator_name_u FROM learning_stories ls LEFT JOIN users u ON u.id=ls.educator_id WHERE ls.id=? AND ls.tenant_id=?').get(req.params.id, req.tenantId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const story = hydrateStory(row);
  story.photo_rows = D().prepare('SELECT * FROM story_photos WHERE story_id=? AND tenant_id=? ORDER BY sort_order').all(row.id, row.tenant_id).map(p => ({ ...p, tagged_child_ids: J(p.tagged_child_ids), tagged_labels: J(p.tagged_labels), ai_suggested_tags: J(p.ai_suggested_tags) }));
  res.json(story);
});

r.post('/stories', (req, res) => {
  const { title, content = '', type = 'group', event_name, group_name, room_id, date, child_ids = [], eylf_outcomes = [], eylf_sub_outcomes = {}, tags = [], photos = [], ai_enhanced = false, ai_explanation, visible_to_parents = true, album_id, photo_rows = [] } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'title and date required' });
  const id = uuid();
  const edu = D().prepare('SELECT e.id, e.first_name, e.last_name FROM educators e WHERE e.tenant_id=? AND e.user_id=?').get(req.tenantId, req.userId);
  const eduName = edu ? `${edu.first_name} ${edu.last_name}` : (req.user?.name || 'Educator');
  D().prepare(`INSERT INTO learning_stories (id,tenant_id,title,content,type,event_name,group_name,room_id,date,child_ids,eylf_outcomes,eylf_sub_outcomes,tags,photos,ai_enhanced,ai_explanation,visible_to_parents,album_id,educator_id,educator_name,published,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(id, req.tenantId, title, content, type, event_name || null, group_name || null, room_id || null, date,
         S(child_ids), S(eylf_outcomes), SO(eylf_sub_outcomes), S(tags), S(photos),
         ai_enhanced ? 1 : 0, ai_explanation || null, visible_to_parents ? 1 : 0,
         album_id || null, req.userId, eduName, 0);

  // Insert photo rows
  photo_rows.forEach((p, i) => {
    D().prepare('INSERT INTO story_photos (id,tenant_id,story_id,url,caption,tagged_child_ids,tagged_labels,ai_suggested_tags,sort_order) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(uuid(), req.tenantId, id, p.url, p.caption || null, S(p.tagged_child_ids || []), S(p.tagged_labels || []), S(p.ai_suggested_tags || []), i);
  });

  // Log event for each child
  child_ids.forEach(cid => {
    try {
      D().prepare('INSERT INTO child_event_log (id,tenant_id,child_id,event_type,description,created_by) VALUES(?,?,?,?,?,?)')
        .run(uuid(), req.tenantId, cid, 'learning_story', `Learning story recorded: "${title}"${event_name ? ` (${event_name})` : ''}`, req.userId);
    } catch {}
  });

  // Auto-create/update album if event_name or tag suggests it
  if ((event_name || tags.length) && !album_id) {
    autoAlbum(D(), req.tenantId, id, event_name, tags, child_ids);
  }

  res.json({ id, ok: true });
});

r.put('/stories/:id', (req, res) => {
  const { title, content, type, event_name, group_name, room_id, date, child_ids, eylf_outcomes, eylf_sub_outcomes, tags, photos, ai_enhanced, ai_explanation, visible_to_parents, published, album_id, ai_progression_suggestions } = req.body;
  D().prepare(`UPDATE learning_stories SET
    title=COALESCE(?,title), content=COALESCE(?,content), type=COALESCE(?,type),
    event_name=COALESCE(?,event_name), group_name=COALESCE(?,group_name), room_id=COALESCE(?,room_id),
    date=COALESCE(?,date), child_ids=COALESCE(?,child_ids), eylf_outcomes=COALESCE(?,eylf_outcomes),
    eylf_sub_outcomes=COALESCE(?,eylf_sub_outcomes), tags=COALESCE(?,tags), photos=COALESCE(?,photos),
    ai_enhanced=COALESCE(?,ai_enhanced), ai_explanation=COALESCE(?,ai_explanation),
    visible_to_parents=COALESCE(?,visible_to_parents), published=COALESCE(?,published),
    album_id=COALESCE(?,album_id), ai_progression_suggestions=COALESCE(?,ai_progression_suggestions),
    updated_at=datetime('now') WHERE id=? AND tenant_id=?`)
    .run(title, content, type, event_name, group_name, room_id, date,
         child_ids ? S(child_ids) : null,
         eylf_outcomes ? S(eylf_outcomes) : null,
         eylf_sub_outcomes ? SO(eylf_sub_outcomes) : null,
         tags ? S(tags) : null, photos ? S(photos) : null,
         ai_enhanced != null ? (ai_enhanced ? 1 : 0) : null, ai_explanation,
         visible_to_parents != null ? (visible_to_parents ? 1 : 0) : null,
         published != null ? (published ? 1 : 0) : null,
         album_id, ai_progression_suggestions ? S(ai_progression_suggestions) : null,
         req.params.id, req.tenantId);
  res.json({ ok: true });
});

r.delete('/stories/:id', (req, res) => {
  D().prepare('DELETE FROM story_photos WHERE story_id=?').run(req.params.id);
  D().prepare('DELETE FROM learning_stories WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
  res.json({ ok: true });
});

r.post('/stories/:id/publish', (req, res) => {
  D().prepare("UPDATE learning_stories SET published=1, updated_at=datetime('now') WHERE id=? AND tenant_id=?").run(req.params.id, req.tenantId);
  res.json({ ok: true });
});

// ─── STORY PHOTOS ────────────────────────────────────────────────────────────

r.get('/stories/:id/photos', (req, res) => {
  const photos = D().prepare('SELECT * FROM story_photos WHERE story_id=? AND tenant_id=? ORDER BY sort_order').all(req.params.id, req.tenantId);
  res.json(photos.map(p => ({ ...p, tagged_child_ids: J(p.tagged_child_ids), tagged_labels: J(p.tagged_labels), ai_suggested_tags: J(p.ai_suggested_tags) })));
});

r.post('/stories/:id/photos', (req, res) => {
  const { url, caption, tagged_child_ids = [], tagged_labels = [], sort_order = 0 } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  const id = uuid();
  D().prepare('INSERT INTO story_photos (id,tenant_id,story_id,url,caption,tagged_child_ids,tagged_labels,sort_order) VALUES(?,?,?,?,?,?,?,?)')
    .run(id, req.tenantId, req.params.id, url, caption || null, S(tagged_child_ids), S(tagged_labels), sort_order);
  res.json({ id, ok: true });
});

r.get('/photos/:id', (req, res) => {
  try {
    const photo = D().prepare('SELECT * FROM story_photos WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
    res.json({ ...photo, tagged_child_ids: J(photo.tagged_child_ids), tagged_labels: J(photo.tagged_labels), ai_suggested_tags: J(photo.ai_suggested_tags) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch photo' });
  }
});

r.put('/photos/:id', (req, res) => {
  const { caption, tagged_child_ids, tagged_labels } = req.body;
  D().prepare('UPDATE story_photos SET caption=COALESCE(?,caption), tagged_child_ids=COALESCE(?,tagged_child_ids), tagged_labels=COALESCE(?,tagged_labels) WHERE id=? AND tenant_id=?')
    .run(caption, tagged_child_ids ? S(tagged_child_ids) : null, tagged_labels ? S(tagged_labels) : null, req.params.id, req.tenantId);
  res.json({ ok: true });
});

r.delete('/photos/:id', (req, res) => {
  D().prepare('DELETE FROM story_photos WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
  res.json({ ok: true });
});


// ─── PHOTO FILE UPLOAD ────────────────────────────────────────────────────────

r.post('/stories/:id/upload', upload.array('photos', 20), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
  const db = D();
  const storyId = req.params.id;
  const tenantId = req.tenantId;
  // Verify story belongs to tenant
  const story = db.prepare('SELECT id FROM learning_stories WHERE id=? AND tenant_id=?').get(storyId, tenantId);
  if (!story) return res.status(404).json({ error: 'Story not found' });
  const count = db.prepare('SELECT COUNT(*) as c FROM story_photos WHERE story_id=?').get(storyId).c;
  const ids = [];
  req.files.forEach((file, i) => {
    const id = uuid();
    const url = '/uploads/' + file.filename;
    db.prepare('INSERT INTO story_photos (id,tenant_id,story_id,url,caption,tagged_child_ids,tagged_labels,ai_suggested_tags,sort_order) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id, tenantId, storyId, url, null, '[]', '[]', '[]', count + i);
    ids.push({ id, url });
  });
  res.json({ ok: true, photos: ids });
});

// ─── ALBUMS ──────────────────────────────────────────────────────────────────

r.get('/albums', (req, res) => {
  const albums = D().prepare(`
    SELECT la.*, COUNT(DISTINCT ls.id) as story_count,
           COUNT(DISTINCT sp.id) as photo_count
    FROM learning_albums la
    LEFT JOIN learning_stories ls ON ls.album_id=la.id AND ls.tenant_id=la.tenant_id
    LEFT JOIN story_photos sp ON sp.story_id=ls.id AND sp.tenant_id=la.tenant_id
    WHERE la.tenant_id=?
    GROUP BY la.id ORDER BY la.updated_at DESC
  `).all(req.tenantId);
  res.json(albums.map(a => ({ ...a, tags: J(a.tags), child_ids: J(a.child_ids) })));
});

r.post('/albums', (req, res) => {
  const { name, description, tags = [], child_ids = [], event_name, ai_generated_name = false } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuid();
  D().prepare('INSERT INTO learning_albums (id,tenant_id,name,description,tags,child_ids,event_name,ai_generated_name) VALUES(?,?,?,?,?,?,?,?)')
    .run(id, req.tenantId, name, description || null, S(tags), S(child_ids), event_name || null, ai_generated_name ? 1 : 0);
  res.json({ id, ok: true });
});

r.put('/albums/:id', (req, res) => {
  const { name, description, tags, child_ids, event_name } = req.body;
  D().prepare(`UPDATE learning_albums SET name=COALESCE(?,name), description=COALESCE(?,description), tags=COALESCE(?,tags), child_ids=COALESCE(?,child_ids), event_name=COALESCE(?,event_name), updated_at=datetime('now') WHERE id=? AND tenant_id=?`)
    .run(name, description, tags ? S(tags) : null, child_ids ? S(child_ids) : null, event_name, req.params.id, req.tenantId);
  res.json({ ok: true });
});

r.delete('/albums/:id', (req, res) => {
  D().prepare("UPDATE learning_stories SET album_id=NULL WHERE album_id=? AND tenant_id=?").run(req.params.id, req.tenantId);
  D().prepare('DELETE FROM learning_albums WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
  res.json({ ok: true });
});

// ─── EYLF PROGRESSION ────────────────────────────────────────────────────────

r.get('/progress/:childId', (req, res) => {
  const progress = D().prepare('SELECT * FROM child_eylf_progress WHERE child_id=? AND tenant_id=? ORDER BY eylf_outcome, sub_outcome').all(req.params.childId, req.tenantId);
  // Count stories per outcome
  const stories = D().prepare("SELECT child_ids, eylf_outcomes FROM learning_stories WHERE tenant_id=? AND date >= date('now','-365 days')").all(req.tenantId).filter(s => J(s.child_ids).includes(req.params.childId));
  const outcomeCount = {};
  stories.forEach(s => J(s.eylf_outcomes).forEach(o => { outcomeCount[o] = (outcomeCount[o] || 0) + 1; }));
  res.json({ progress, story_counts: outcomeCount });
});

r.post('/progress/:childId', (req, res) => {
  const { eylf_outcome, sub_outcome, level = 1, notes, story_id } = req.body;
  if (!eylf_outcome) return res.status(400).json({ error: 'eylf_outcome required' });
  const existing = D().prepare('SELECT id FROM child_eylf_progress WHERE tenant_id=? AND child_id=? AND eylf_outcome=? AND sub_outcome IS ?')
    .get(req.tenantId, req.params.childId, eylf_outcome, sub_outcome || null);
  if (existing) {
    D().prepare('UPDATE child_eylf_progress SET level=?, notes=COALESCE(?,notes), progressed_by=?, progressed_at=datetime(\'now\'), story_id=COALESCE(?,story_id) WHERE id=?')
      .run(level, notes, req.userId, story_id || null, existing.id);
  } else {
    D().prepare('INSERT INTO child_eylf_progress (id,tenant_id,child_id,eylf_outcome,sub_outcome,level,notes,progressed_by,progressed_at,story_id) VALUES(?,?,?,?,?,?,?,?,datetime(\'now\'),?)')
      .run(uuid(), req.tenantId, req.params.childId, eylf_outcome, sub_outcome || null, level, notes || null, req.userId, story_id || null);
  }
  // Log to child event
  try {
    D().prepare('INSERT INTO child_event_log (id,tenant_id,child_id,event_type,description,created_by) VALUES(?,?,?,?,?,?)')
      .run(uuid(), req.tenantId, req.params.childId, 'eylf_progression', `EYLF Outcome ${eylf_outcome}${sub_outcome ? ' — ' + sub_outcome : ''} progressed to level ${level}${notes ? ': ' + notes : ''}`, req.userId);
  } catch {}
  res.json({ ok: true });
});

// ─── WEEKLY REPORT ───────────────────────────────────────────────────────────

r.get('/weekly/:childId', (req, res) => {
  const reports = D().prepare('SELECT * FROM weekly_reports WHERE child_id=? AND tenant_id=? ORDER BY week_start DESC LIMIT 12').all(req.params.childId, req.tenantId);
  res.json(reports.map(rep => ({ ...rep, eylf_summary: JO(rep.eylf_summary), progressions: J(rep.progressions), regressions: J(rep.regressions) })));
});

r.post('/weekly/:childId/generate', (req, res) => {
  const { week_start, week_end } = req.body;
  if (!week_start || !week_end) return res.status(400).json({ error: 'week_start and week_end required' });
  const childId = req.params.childId;
  const child = D().prepare('SELECT * FROM children WHERE id=? AND tenant_id=?').get(childId, req.tenantId);
  if (!child) return res.status(404).json({ error: 'Child not found' });

  const stories = D().prepare("SELECT child_ids, eylf_outcomes, eylf_sub_outcomes, title, date, ai_enhanced FROM learning_stories WHERE tenant_id=? AND date>=? AND date<=? AND published=1").all(req.tenantId, week_start, week_end).filter(s => J(s.child_ids).includes(childId));
  const progress = D().prepare('SELECT * FROM child_eylf_progress WHERE child_id=? AND tenant_id=? AND progressed_at>=? AND progressed_at<=?').all(childId, req.tenantId, week_start, week_end + 'T23:59:59');

  const outcomeCounts = {};
  stories.forEach(s => J(s.eylf_outcomes).forEach(o => { outcomeCounts[o] = (outcomeCounts[o] || 0) + 1; }));

  const progressions = progress.map(p => ({ outcome: p.eylf_outcome, sub: p.sub_outcome, level: p.level, notes: p.notes }));

  const summary = stories.length === 0
    ? `${child.first_name} did not participate in recorded learning activities this week.`
    : `${child.first_name} participated in ${stories.length} learning experience${stories.length > 1 ? 's' : ''} this week, engaging with ${Object.keys(outcomeCounts).length} EYLF outcome area${Object.keys(outcomeCounts).length !== 1 ? 's' : ''}. ${progressions.length > 0 ? `${progressions.length} learning progression${progressions.length > 1 ? 's' : ''} were recorded.` : ''} Stories included: ${stories.map(s => s.title).slice(0, 3).join(', ')}${stories.length > 3 ? ` and ${stories.length - 3} more` : ''}.`;

  const id = uuid();
  D().prepare(`INSERT OR REPLACE INTO weekly_reports (id,tenant_id,child_id,week_start,week_end,summary,eylf_summary,progressions,regressions,observations_count,ai_generated,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,1,datetime('now'))`)
    .run(id, req.tenantId, childId, week_start, week_end, summary, SO(outcomeCounts), S(progressions), S([]), stories.length);

  res.json({ id, summary, story_count: stories.length, eylf_summary: outcomeCounts, progressions });
});

// ─── AI ENHANCE STORY ────────────────────────────────────────────────────────
// Uses real AI provider if configured, falls back to template

r.post('/ai/enhance', async (req, res) => {
  const { draft, context = {} } = req.body;
  if (!draft) return res.status(400).json({ error: 'draft required' });
  const { child_names, event, eylf_outcomes = [], room_name } = context;
  const EYLF_LABELS = { 1: 'Strong Sense of Identity', 2: 'Connected with Community', 3: 'Strong Sense of Wellbeing', 4: 'Confident and Involved Learner', 5: 'Effective Communicator' };
  const outcomeNames = eylf_outcomes.map(o => EYLF_LABELS[o]).filter(Boolean);

  // Try real AI first
  const tenantId = req.tenantId;
  if (tenantId) {
    try {
      const { D } = await import('./db.js');
      const provider = D().prepare("SELECT * FROM ai_providers WHERE tenant_id=? AND enabled=1 AND api_key IS NOT NULL ORDER BY is_default DESC LIMIT 1").get(tenantId);
      if (provider) {
        const systemPrompt = `You are an expert early childhood educator in Australia writing professional learning journey observations for a childcare centre. You write in warm, professional, educational language following the Early Years Learning Framework (EYLF). Your narratives are 3-4 paragraphs, observational, developmental, and celebratory of children's learning.`;
        const userMsg = `Transform this brief observation note into a full professional learning journey narrative:

OBSERVATION NOTE: "${draft}"
${child_names ? `CHILDREN: ${child_names}` : ''}
${event ? `ACTIVITY/EVENT: ${event}` : ''}
${room_name ? `ROOM: ${room_name}` : ''}
${outcomeNames.length ? `EYLF OUTCOMES TO REFERENCE: ${outcomeNames.join(', ')}` : ''}

Write a 3-4 paragraph professional educational narrative. Start directly with the observation (no titles). Include:
- What the children did and said (observable behaviours)  
- What developmental skills this demonstrates
- Connection to EYLF outcomes (name them specifically)
- How you will extend this learning
Keep it warm, specific, professional and celebratory.`;

        // Proxy through our AI router
        const aiResp = await fetch(`http://localhost:${process.env.PORT || 3003}/api/ai/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.authorization || '', 'x-tenant-id': tenantId },
          body: JSON.stringify({ messages: [{ role: 'user', content: userMsg }], system: systemPrompt, max_tokens: 800, temperature: 0.7, feature: 'learning_enhance' }),
        });
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          if (aiData.content) {
            return res.json({
              enhanced: aiData.content,
              explanation: `✨ Enhanced using ${aiData.provider?.toUpperCase() || 'AI'} (${aiData.model || 'model'}) — ${outcomeNames.length ? `Connected to EYLF: ${outcomeNames.join(', ')}` : 'Educational narrative generated'}.`,
              original: draft,
              ai_provider: aiData.provider,
              ai_model: aiData.model,
            });
          }
        }
      }
    } catch(e) {
      // Fall through to template
    }
  }

  // Fallback: template-based enhancement
  const enhanced = buildEnhancedNarrative(draft, {
    children: child_names ? `involving ${child_names}` : '',
    event: event ? `during ${event}` : '',
    eylf: outcomeNames.length ? `This connects to EYLF: ${outcomeNames.join(', ')}.` : '',
    room: room_name,
  });
  res.json({
    enhanced,
    explanation: outcomeNames.length
      ? `This observation links to EYLF ${eylf_outcomes.map(o => `Outcome ${o}`).join(' and ')}. Add an AI provider in Settings → AI to get richer narratives.`
      : 'Template narrative generated. Add an AI provider in Settings → AI for richer stories.',
    original: draft,
  });
});



r.post('/ai/suggest-progression', (req, res) => {
  const { story_id, child_id } = req.body;
  if (!story_id || !child_id) return res.status(400).json({ error: 'story_id and child_id required' });

  const story = D().prepare('SELECT * FROM learning_stories WHERE id=? AND tenant_id=?').get(story_id, req.tenantId);
  const child = D().prepare('SELECT * FROM children WHERE id=? AND tenant_id=?').get(child_id, req.tenantId);
  if (!story || !child) return res.status(404).json({ error: 'Not found' });

  const outcomes = J(story.eylf_outcomes);
  const EYLF_LABELS = { 1: 'Strong Sense of Identity', 2: 'Connected with Community', 3: 'Strong Sense of Wellbeing', 4: 'Confident and Involved Learner', 5: 'Effective Communicator' };

  const suggestions = outcomes.map(o => ({
    eylf_outcome: o,
    label: EYLF_LABELS[o],
    suggestion: `Based on this observation, ${child.first_name} has demonstrated engagement with EYLF Outcome ${o} (${EYLF_LABELS[o] || ''}). Would you like to record a progression in this outcome area?`,
    ai_rationale: `This story documents ${child.first_name} participating in "${story.title}" which shows evidence of ${EYLF_LABELS[o] || `Outcome ${o}`} through active engagement. Recording this progression will update ${child.first_name}'s learning journey portfolio.`,
  }));

  // Update story with suggestions
  D().prepare('UPDATE learning_stories SET ai_progression_suggestions=? WHERE id=? AND tenant_id=?').run(S(suggestions), story_id, tenantId);

  res.json({ suggestions });
});

// ─── CHILD STORIES (for Children Module) ─────────────────────────────────────

r.get('/child/:childId/stories', (req, res) => {
  const { period = 'year' } = req.query;
  const _lDays = { today:0, week:7, month:30, year:365 }[period] ?? 30; const _lSince = period === 'all' ? '1970-01-01' : new Date(Date.now() - _lDays * 86400000).toISOString().slice(0, 10); const rows = D().prepare('SELECT ls.*, u.name as educator_name_u FROM learning_stories ls LEFT JOIN users u ON u.id=ls.educator_id WHERE ls.tenant_id=? AND ls.published=1 AND ls.date >= ? ORDER BY ls.date DESC LIMIT 50').all(req.tenantId, _lSince);
  const stories = attachPhotos(rows.map(hydrateStory).filter(s => s.child_ids.includes(req.params.childId)));
  res.json(stories);
});

r.get('/child/:childId/eylf-summary', (req, res) => {
  const progress = D().prepare('SELECT * FROM child_eylf_progress WHERE child_id=? AND tenant_id=?').all(req.params.childId, req.tenantId);
  const storyCounts = {};
  const recentStories = D().prepare("SELECT eylf_outcomes, child_ids FROM learning_stories WHERE tenant_id=? AND date >= date('now','-365 days')").all(req.tenantId).filter(s => J(s.child_ids).includes(req.params.childId));
  recentStories.forEach(s => J(s.eylf_outcomes).forEach(o => { storyCounts[o] = (storyCounts[o] || 0) + 1; }));
  res.json({ progress, story_counts: storyCounts, total_stories: recentStories.length });
});

// ─── AUTO-ALBUM HELPER ───────────────────────────────────────────────────────

function autoAlbum(db, tenantId, storyId, eventName, tags, childIds) {
  try {
    const key = eventName || (tags.length ? tags[0] : null);
    if (!key) return;
    let album = db.prepare('SELECT * FROM learning_albums WHERE tenant_id=? AND (event_name=? OR name=?)').get(tenantId, key, key);
    if (!album) {
      const aid = uuid();
      db.prepare('INSERT INTO learning_albums (id,tenant_id,name,event_name,tags,child_ids,ai_generated_name) VALUES(?,?,?,?,?,?,1)')
        .run(aid, tenantId, key, eventName || null, S(tags), S(childIds));
      db.prepare("UPDATE learning_stories SET album_id=? WHERE id=? AND tenant_id=?").run(aid, storyId, tenantId);
    } else {
      // Merge child IDs
      const existing = J(album.child_ids);
      const merged = [...new Set([...existing, ...childIds])];
      db.prepare("UPDATE learning_albums SET child_ids=?, story_count=story_count+1, updated_at=datetime('now') WHERE id=? AND tenant_id=?").run(S(merged), album.id, tenantId);
      db.prepare("UPDATE learning_stories SET album_id=? WHERE id=? AND tenant_id=?").run(album.id, storyId, tenantId);
    }
  } catch (e) {}
}

export default r;
