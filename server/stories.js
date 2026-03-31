/**
 * server/stories.js — Weekly Story Generation
 *
 * Generates Google Photos-style weekly stories for parents.
 * Architecture:
 *  1. Gather: observations + activity daily_updates + learning_story photos for the week
 *  2. Filter: exclude sleep/food/nappy, keep meaningful learning moments
 *  3. Select: rank photos by richness (observation > activity > general), pick 4–8
 *  4. Narrate: template-based text from EYLF outcomes (no AI required)
 *  5. Optional: one tiny Claude call (~80 tokens) for a single connecting sentence
 *  6. Assemble: slides JSON with timings totalling 15–25s
 *  7. Publish: sets published=1, parent can view in portal
 *
 * Mount in server/index.js:
 *   import storiesRouter from './stories.js';
 *   app.use('/api/stories', storiesRouter);
 */

import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const router = Router();
router.use(requireAuth);
router.use(requireTenant);

// ─── EYLF outcome → warm parent-friendly phrase (template-based, zero AI needed) ──
const EYLF_PHRASES = {
  '1': 'showing a strong sense of identity and belonging',
  '1.1': 'feeling confident and secure in their environment',
  '1.2': 'developing a sense of self and their place in the group',
  '1.3': 'learning to manage their feelings and build resilience',
  '1.4': 'growing in their sense of wellbeing and happiness',
  '2': 'connecting with their community and the world around them',
  '2.1': 'developing an understanding of the natural world',
  '2.2': 'learning about different cultures and perspectives',
  '2.3': 'exploring how their actions affect others',
  '2.4': 'discovering how they can contribute to their world',
  '3': 'having a strong sense of wellbeing',
  '3.1': 'thriving physically and emotionally',
  '3.2': 'showing great enthusiasm and energy in play',
  '4': 'becoming a confident and involved learner',
  '4.1': 'exploring and discovering with real curiosity',
  '4.2': 'using creativity and imagination in wonderful ways',
  '4.3': 'transferring knowledge to new situations',
  '4.4': 'developing important resource and problem-solving skills',
  '5': 'becoming an effective communicator',
  '5.1': 'engaging in meaningful conversations',
  '5.2': 'expressing ideas through many languages of learning',
  '5.3': 'developing early literacy and language skills',
  '5.4': 'exploring the power of symbols and words',
};

// Activity category → warm narrative opener
const ACTIVITY_OPENERS = [
  'spent time exploring and discovering',
  'engaged with curiosity and enthusiasm',
  'showed real creativity and imagination',
  'connected with friends and educators',
  'practised important new skills',
  'expressed themselves through play and learning',
  'demonstrated growing confidence',
  'worked with focus and determination',
];

// Music tracks (royalty-free, hosted externally or in /public/music/)
const MUSIC_TRACKS = [
  { id: 'gentle-piano', label: 'Gentle Piano', url: 'https://www.bensound.com/bensound-music/bensound-slowmotion.mp3', mood: 'calm' },
  { id: 'playful-ukulele', label: 'Playful Ukulele', url: 'https://www.bensound.com/bensound-music/bensound-ukulele.mp3', mood: 'happy' },
  { id: 'warm-acoustic', label: 'Warm Acoustic', url: 'https://www.bensound.com/bensound-music/bensound-acousticbreeze.mp3', mood: 'warm' },
  { id: 'dreamy', label: 'Dreamy', url: 'https://www.bensound.com/bensound-music/bensound-dreams.mp3', mood: 'wonder' },
];

// Slide duration rules: 15–25s total, 3–5s per slide
const MIN_TOTAL = 15, MAX_TOTAL = 25;
const SLIDE_DUR = 4; // seconds per slide (transitions inclusive)
const TITLE_DUR = 3; // opening title card
const CLOSING_DUR = 3; // closing card

function getWeekBounds(weekStart) {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
}

function pickMusic(observations) {
  // Pick based on the mood of the week's observations
  const narratives = observations.map(o => o.narrative || '').join(' ').toLowerCase();
  if (narratives.includes('creat') || narratives.includes('art') || narratives.includes('paint')) return MUSIC_TRACKS[2];
  if (narratives.includes('curious') || narratives.includes('explor') || narratives.includes('discover')) return MUSIC_TRACKS[3];
  if (narratives.includes('laugh') || narratives.includes('joy') || narratives.includes('excit') || narratives.includes('play')) return MUSIC_TRACKS[1];
  return MUSIC_TRACKS[0]; // default: gentle piano
}

function buildNarrative(child, observations, activities, weekStart) {
  const name = child.first_name || 'Your child';
  const weekDate = new Date(weekStart + 'T12:00:00');
  const weekLabel = weekDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });

  // Collect unique EYLF outcomes across all observations
  const eylfSet = new Set();
  observations.forEach(o => {
    try { (JSON.parse(o.eylf_outcomes || '[]')).forEach(k => eylfSet.add(String(k))); } catch {}
  });
  const eylfKeys = [...eylfSet].slice(0, 3);
  const eylfPhrases = eylfKeys.map(k => EYLF_PHRASES[k]).filter(Boolean);

  // Build narration array (one sentence per slide)
  const narration = [];

  // Opening — title card
  narration.push(`${name}'s Week — ${weekLabel}`);

  // Observation highlights (up to 3)
  observations.slice(0, 3).forEach(obs => {
    const snippet = (obs.narrative || '').split(/[.!?]/)[0].trim();
    if (snippet.length > 20) narration.push(snippet.length > 100 ? snippet.slice(0, 97) + '…' : snippet);
  });

  // Activity narrative
  if (activities.length > 0) {
    const opener = ACTIVITY_OPENERS[Math.floor(Math.random() * ACTIVITY_OPENERS.length)];
    narration.push(`${name} ${opener} throughout the week.`);
  }

  // EYLF learning moment
  if (eylfPhrases.length > 0) {
    narration.push(`This week ${name} was ${eylfPhrases[0]}.`);
  }

  // Closing
  narration.push(`What a wonderful week! 💛`);

  return narration;
}

async function optionalAISentence(childName, eylfPhrases, observations) {
  // One small Claude call (~80 tokens) to generate a single warm connecting sentence.
  // Only called if ANTHROPIC_API_KEY is set AND there are 2+ EYLF outcomes to connect.
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || eylfPhrases.length < 2) return null;

  // Build a tiny prompt — no observation text sent to keep it minimal
  const prompt = `Write ONE warm, joyful sentence (max 20 words) for a childcare story about ${childName} who was ${eylfPhrases[0]} and ${eylfPhrases[1]}. No emojis. Parent-friendly tone.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 60, messages: [{ role: 'user', content: prompt }] }),
    });
    const d = await r.json();
    return d.content?.[0]?.text?.trim() || null;
  } catch { return null; }
}

function assembleSlides(photos, narration, childName) {
  // Calculate how many photo slides fit within the time budget
  const availableForPhotos = MAX_TOTAL - TITLE_DUR - CLOSING_DUR;
  const maxPhotoSlides = Math.floor(availableForPhotos / SLIDE_DUR);
  const selectedPhotos = photos.slice(0, Math.min(maxPhotoSlides, 7));

  const slides = [];

  // 1. Title card
  slides.push({ type: 'title', duration: TITLE_DUR, text: narration[0], subtext: `Prepared by ${childName}'s educators` });

  // 2. Photo slides — interleave narration
  selectedPhotos.forEach((photo, i) => {
    const textIdx = i + 1; // narration[0] is title
    slides.push({
      type: 'photo',
      duration: SLIDE_DUR,
      photo_url: photo.url,
      caption: narration[textIdx] || null,
      transition: i % 2 === 0 ? 'fade' : 'slide',
      source: photo.source, // 'observation' | 'activity' | 'learning_story'
    });
  });

  // 3. EYLF badge slide (if we have outcomes)
  if (narration.length > selectedPhotos.length + 1) {
    slides.push({ type: 'text', duration: 3, text: narration[selectedPhotos.length + 1], style: 'highlight' });
  }

  // 4. Closing card
  slides.push({ type: 'closing', duration: CLOSING_DUR, text: narration[narration.length - 1] });

  // Calculate total duration
  const totalDuration = slides.reduce((acc, s) => acc + s.duration, 0);

  return { slides, totalDuration: Math.max(MIN_TOTAL, Math.min(MAX_TOTAL, totalDuration)) };
}

// ─── Ensure parent_stories table exists ────────────────────────────────────────
function ensureTable() {
  try {
    D().exec(`
      CREATE TABLE IF NOT EXISTS parent_stories (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
        week_starting TEXT NOT NULL,
        title TEXT NOT NULL,
        slides TEXT NOT NULL DEFAULT '[]',
        music_track TEXT,
        duration_secs REAL DEFAULT 20,
        narration TEXT DEFAULT '[]',
        eylf_outcomes TEXT DEFAULT '[]',
        observation_count INTEGER DEFAULT 0,
        photo_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'draft',
        published INTEGER DEFAULT 0,
        published_at TEXT,
        viewed_at TEXT,
        view_count INTEGER DEFAULT 0,
        ai_used INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(tenant_id, child_id, week_starting)
      );
      CREATE INDEX IF NOT EXISTS idx_stories_tenant_week ON parent_stories(tenant_id, week_starting);
      CREATE INDEX IF NOT EXISTS idx_stories_child ON parent_stories(child_id);
      CREATE INDEX IF NOT EXISTS idx_stories_published ON parent_stories(tenant_id, published);
    `);
  } catch(e) {}
}

// ─── Generate story for one child ──────────────────────────────────────────────
async function generateStoryForChild(tenantId, childId, weekStart) {
  ensureTable();
  const db = D();
  const { start, end } = getWeekBounds(weekStart);

  const child = db.prepare('SELECT * FROM children WHERE id=? AND tenant_id=?').get(childId, tenantId);
  if (!child) throw new Error('Child not found');

  // 1. Gather observations (exclude nothing — educators already filtered)
  const observations = db.prepare('
    SELECT id, narrative, eylf_outcomes, media, timestamp
    FROM observations
    WHERE tenant_id=? AND child_id=? AND date(timestamp) BETWEEN ? AND ?
    ORDER BY timestamp DESC
  ').all(tenantId, childId, start, end);

  // 2. Gather activity daily_updates (exclude sleep/food/nappy)
  const activities = db.prepare('
    SELECT id, category, notes, photo_url, update_date
    FROM daily_updates
    WHERE tenant_id=? AND child_id=? AND update_date BETWEEN ? AND ?
    AND category NOT IN (\'sleep\',\'food\',\'nappy\',\'diaper\')
    AND (notes IS NOT NULL OR photo_url IS NOT NULL)
    ORDER BY update_date DESC
  ').all(tenantId, childId, start, end);

  // 3. Gather photos from learning_stories that include this child
  const learningPhotos = db.prepare('
    SELECT sp.url, sp.caption, ls.date
    FROM story_photos sp
    JOIN learning_stories ls ON ls.id = sp.story_id
    WHERE ls.tenant_id=? AND sp.tenant_id=? AND ls.date BETWEEN ? AND ?
    AND ls.child_ids LIKE ?
    AND ls.published=1
    ORDER BY ls.date DESC
    LIMIT 10
  ').all(tenantId, tenantId, start, end, `%${childId}%`);

  // 4. Build ranked photo list
  const photos = [];

  // Observations with media (highest value — educator documented learning)
  observations.forEach(obs => {
    try {
      const media = JSON.parse(obs.media || '[]');
      media.filter(m => m.url && m.type !== 'video').forEach(m => {
        photos.push({ url: m.url, source: 'observation', rank: 3, caption: obs.narrative?.slice(0, 80) });
      });
    } catch {}
  });

  // Learning story photos
  learningPhotos.forEach(p => photos.push({ url: p.url, source: 'learning_story', rank: 2, caption: p.caption }));

  // Activity daily update photos
  activities.filter(a => a.photo_url).forEach(a => {
    photos.push({ url: a.photo_url, source: 'activity', rank: 1, caption: a.notes?.slice(0, 80) });
  });

  // Sort by rank desc, deduplicate by URL, cap at 8
  const seen = new Set();
  const dedupedPhotos = photos
    .sort((a, b) => b.rank - a.rank)
    .filter(p => { if (seen.has(p.url)) return false; seen.add(p.url); return true; })
    .slice(0, 8);

  // 5. Collect EYLF outcomes
  const eylfSet = new Set();
  observations.forEach(o => {
    try { JSON.parse(o.eylf_outcomes || '[]').forEach(k => eylfSet.add(String(k))); } catch {}
  });
  const eylfKeys = [...eylfSet].slice(0, 4);
  const eylfPhrases = eylfKeys.map(k => EYLF_PHRASES[k]).filter(Boolean);

  // 6. Build template-based narration
  let narration = buildNarrative(child, observations, activities, weekStart);

  // 7. Optional: one AI sentence to enrich if AI is available and there's good data
  let aiUsed = 0;
  if (eylfPhrases.length >= 2 && (observations.length > 0 || activities.length > 0)) {
    const aiSentence = await optionalAISentence(child.first_name, eylfPhrases, observations);
    if (aiSentence) {
      // Insert AI sentence before closing
      narration.splice(narration.length - 1, 0, aiSentence);
      aiUsed = 1;
    }
  }

  // 8. Assemble slides + pick music
  const { slides, totalDuration } = assembleSlides(dedupedPhotos, narration, child.first_name || 'Your child');
  const music = pickMusic(observations);

  // 9. Build title
  const weekDate = new Date(weekStart + 'T12:00:00');
  const title = `${child.first_name}'s Week — ${weekDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  // 10. Upsert into parent_stories
  const existingStory = db.prepare('SELECT id FROM parent_stories WHERE tenant_id=? AND child_id=? AND week_starting=?').get(tenantId, childId, weekStart);
  const storyId = existingStory?.id || uuid();

  if (existingStory) {
    db.prepare('UPDATE parent_stories SET title=?,slides=?,music_track=?,duration_secs=?,narration=?,eylf_outcomes=?,observation_count=?,photo_count=?,status=\'draft\',published=0,ai_used=?,updated_at=datetime(\'now\') WHERE id=?')
      .run(title, JSON.stringify(slides), music.id, totalDuration, JSON.stringify(narration), JSON.stringify(eylfKeys), observations.length, dedupedPhotos.length, aiUsed, storyId);
  } else {
    db.prepare('INSERT INTO parent_stories (id,tenant_id,child_id,week_starting,title,slides,music_track,duration_secs,narration,eylf_outcomes,observation_count,photo_count,status,ai_used) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,\'draft\',?)')
      .run(storyId, tenantId, childId, weekStart, title, JSON.stringify(slides), music.id, totalDuration, JSON.stringify(narration), JSON.stringify(eylfKeys), observations.length, dedupedPhotos.length, aiUsed);
  }

  return {
    id: storyId, title, slides, music, totalDuration,
    observation_count: observations.length,
    photo_count: dedupedPhotos.length,
    eylf_outcomes: eylfKeys, ai_used: aiUsed,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/stories — list stories for tenant (with optional ?child_id=&week=&status=)
router.get('/', (req, res) => {
  try {
    ensureTable();
    const { child_id, week, status = 'all', published } = req.query;
    let q = 'SELECT ps.*, c.first_name, c.last_name, c.photo_url as child_photo FROM parent_stories ps JOIN children c ON c.id=ps.child_id WHERE ps.tenant_id=?';
    const params = [req.tenantId];
    if (child_id) { q += ' AND ps.child_id=?'; params.push(child_id); }
    if (week) { q += ' AND ps.week_starting=?'; params.push(week); }
    if (published !== undefined) { q += ' AND ps.published=?'; params.push(published === 'true' ? 1 : 0); }
    if (status !== 'all') { q += ' AND ps.status=?'; params.push(status); }
    q += ' ORDER BY ps.week_starting DESC, c.first_name ASC LIMIT 100';
    const stories = D().prepare(q).all(...params).map(s => ({
      ...s,
      slides: (() => { try { return JSON.parse(s.slides); } catch { return []; } })(),
      narration: (() => { try { return JSON.parse(s.narration); } catch { return []; } })(),
      eylf_outcomes: (() => { try { return JSON.parse(s.eylf_outcomes); } catch { return []; } })(),
    }));
    res.json({ stories });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/stories/:id — single story (full slides JSON)
router.get('/:id', (req, res) => {
  try {
    ensureTable();
    const s = D().prepare('SELECT ps.*, c.first_name, c.last_name, c.photo_url as child_photo FROM parent_stories ps JOIN children c ON c.id=ps.child_id WHERE ps.id=? AND ps.tenant_id=?').get(req.params.id, req.tenantId);
    if (!s) return res.status(404).json({ error: 'Story not found' });
    res.json({
      story: { ...s, slides: JSON.parse(s.slides || '[]'), narration: JSON.parse(s.narration || '[]'), eylf_outcomes: JSON.parse(s.eylf_outcomes || '[]') },
      music_tracks: MUSIC_TRACKS,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/stories/generate — generate stories for a week (all children or one)
router.post('/generate', async (req, res) => {
  try {
    ensureTable();
    const { week_starting, child_id } = req.body;
    if (!week_starting) return res.status(400).json({ error: 'week_starting required (YYYY-MM-DD Monday)' });

    // Validate it's a Monday
    const d = new Date(week_starting + 'T12:00:00');
    if (d.getDay() !== 1) return res.status(400).json({ error: 'week_starting must be a Monday' });

    let childIds;
    if (child_id) {
      childIds = [child_id];
    } else {
      childIds = D().prepare('SELECT id FROM children WHERE tenant_id=? AND active=1').all(req.tenantId).map(c => c.id);
    }

    const results = [];
    for (const cid of childIds) {
      try {
        const story = await generateStoryForChild(req.tenantId, cid, week_starting);
        results.push({ child_id: cid, story_id: story.id, ok: true, photo_count: story.photo_count, observation_count: story.observation_count });
      } catch(e) {
        results.push({ child_id: cid, ok: false, error: e.message });
      }
    }

    const succeeded = results.filter(r => r.ok).length;
    res.json({ generated: succeeded, total: childIds.length, results });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/stories/:id — update story (edit slides, music, narration)
router.put('/:id', (req, res) => {
  try {
    const { slides, music_track, narration, status } = req.body;
    const story = D().prepare('SELECT id FROM parent_stories WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!story) return res.status(404).json({ error: 'Not found' });
    const updates = [];
    const params = [];
    if (slides !== undefined) { updates.push('slides=?'); params.push(JSON.stringify(slides)); }
    if (music_track !== undefined) { updates.push('music_track=?'); params.push(music_track); }
    if (narration !== undefined) { updates.push('narration=?'); params.push(JSON.stringify(narration)); }
    if (status !== undefined) { updates.push('status=?'); params.push(status); }
    updates.push("updated_at=datetime('now')");
    params.push(req.params.id, req.tenantId);
    const _stSql = 'UPDATE parent_stories SET ' + updates.join(',') + ' WHERE id=? AND tenant_id=?';
    D().prepare(_stSql).run(...params);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/stories/:id/publish — publish to parent portal
router.post('/:id/publish', (req, res) => {
  try {
    const result = D().prepare("UPDATE parent_stories SET published=1, published_at=datetime('now'), status='published', updated_at=datetime('now') WHERE id=? AND tenant_id=?").run(req.params.id, req.tenantId);
    if (result.changes === 0) return res.status(404).json({ error: 'Story not found' });
    res.json({ ok: true, published_at: new Date().toISOString() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/stories/:id/unpublish
router.post('/:id/unpublish', (req, res) => {
  try {
    D().prepare("UPDATE parent_stories SET published=0, status='draft', updated_at=datetime('now') WHERE id=? AND tenant_id=?").run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/stories/:id
router.delete('/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM parent_stories WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/stories/music-tracks — list available tracks
router.get('/meta/music-tracks', (req, res) => res.json({ tracks: MUSIC_TRACKS }));

// GET /api/stories/parent/:childId — parent-facing: published stories for their child
// Note: no requireTenant here since parent portal has its own auth — mount separately if needed
router.get('/parent/:childId', (req, res) => {
  try {
    ensureTable();
    const stories = D().prepare('
      SELECT id, title, week_starting, duration_secs, music_track, slides, photo_count,
             eylf_outcomes, published_at, viewed_at, view_count
      FROM parent_stories WHERE tenant_id=? AND child_id=? AND published=1
      ORDER BY week_starting DESC LIMIT 20
    ').all(req.tenantId, req.params.childId).map(s => ({
      ...s,
      slides: JSON.parse(s.slides || '[]'),
      eylf_outcomes: JSON.parse(s.eylf_outcomes || '[]'),
    }));
    res.json({ stories });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/stories/:id/viewed — track view (parent portal)
router.post('/:id/viewed', (req, res) => {
  try {
    D().prepare("UPDATE parent_stories SET viewed_at=COALESCE(viewed_at,datetime('now')), view_count=view_count+1 WHERE id=? AND tenant_id=?").run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default router;
