/**
 * server/weekly-stories.js  — v2.5.0
 * Story Generation for Childcare360
 *
 * Story types by period:
 *   child/room/centre  +  period: week | term | year
 *
 * Durations:
 *   week  → 15-25s (~50 words)
 *   term  → 30-45s (~100 words)
 *   year  → 60-90s (~200 words, with educators, centre message, management photos)
 */

import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const router = Router();
router.use(requireAuth);
router.use(requireTenant);

// ── EYLF outcome labels ───────────────────────────────────────────────────────
const EYLF_SHORT = {
  1: 'sense of identity', 2: 'community connections', 3: 'wellbeing',
  4: 'confident learner', 5: 'effective communicator',
};

// ── Royalty-free CC0 music (Pixabay) ──────────────────────────────────────────
const MUSIC_TRACKS = [
  { id: 'gentle-piano',     label: 'Gentle Piano',      mood: 'calm',       url: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0c6ff1c07.mp3' },
  { id: 'playful-acoustic', label: 'Playful Acoustic',  mood: 'happy',      url: 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_2eefea3b5c.mp3' },
  { id: 'warm-strings',     label: 'Warm Strings',      mood: 'warm',       url: 'https://cdn.pixabay.com/download/audio/2021/11/25/audio_c1ef4bc2af.mp3' },
  { id: 'soft-guitar',      label: 'Soft Guitar',       mood: 'reflective', url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3' },
  { id: 'uplifting-kids',   label: 'Uplifting & Bright',mood: 'joyful',     url: 'https://cdn.pixabay.com/download/audio/2022/01/27/audio_d4c5765dff.mp3' },
  { id: 'cinematic-year',   label: 'Cinematic — Year End', mood: 'epic',    url: 'https://cdn.pixabay.com/download/audio/2022/11/22/audio_febc508520.mp3' },
  { id: 'nostalgic-keys',   label: 'Nostalgic Keys',    mood: 'nostalgic',  url: 'https://cdn.pixabay.com/download/audio/2022/08/02/audio_2dde668d05.mp3' },
];

const EXCLUDE_CATEGORIES = ['nappy', 'diaper', 'toilet', 'sleep'];

// ── Australian school term dates (NSW — configurable per centre) ──────────────
const NSW_TERMS = {
  2024: [ { term:1, start:'2024-01-29', end:'2024-04-12' }, { term:2, start:'2024-04-29', end:'2024-07-05' }, { term:3, start:'2024-07-22', end:'2024-09-27' }, { term:4, start:'2024-10-14', end:'2024-12-19' } ],
  2025: [ { term:1, start:'2025-01-28', end:'2025-04-11' }, { term:2, start:'2025-04-28', end:'2025-07-04' }, { term:3, start:'2025-07-21', end:'2025-09-26' }, { term:4, start:'2025-10-13', end:'2025-12-18' } ],
  2026: [ { term:1, start:'2026-01-26', end:'2026-04-10' }, { term:2, start:'2026-04-27', end:'2026-07-03' }, { term:3, start:'2026-07-20', end:'2026-09-25' }, { term:4, start:'2026-10-12', end:'2026-12-17' } ],
};

function termBounds(year, termNum) {
  const yearTerms = NSW_TERMS[year] || NSW_TERMS[2026];
  const t = yearTerms?.find(t => t.term === termNum);
  return t ? { from: t.start, to: t.end } : { from: `${year}-01-01`, to: `${year}-04-11` };
}

function yearBounds(year) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function gatherChildData(tid, child_id, from, to, maxItems = 30) {
  const stories = D().prepare('
    SELECT ls.title, ls.content, ls.date, ls.eylf_outcomes FROM learning_stories ls
    WHERE ls.tenant_id=? AND ls.date BETWEEN ? AND ?
      AND ls.visible_to_parents=1 AND instr(ls.child_ids, ?) > 0
    ORDER BY ls.date ASC LIMIT ?
  ').all(tid, from, to, `%${child_id}%`, maxItems);

  const activities = D().prepare(`
    SELECT notes, update_date FROM daily_updates
    WHERE tenant_id=? AND child_id=? AND update_date BETWEEN ? AND ?
      AND category NOT IN (${EXCLUDE_CATEGORIES.map(() => '?').join(',')})
      AND notes IS NOT NULL AND notes != ''
    ORDER BY update_date ASC LIMIT ?
  `).all(tid, child_id, from, to, ...EXCLUDE_CATEGORIES, maxItems);

  const observations = D().prepare('
    SELECT o.narrative, o.timestamp, u.name as educator_name FROM observations o
    LEFT JOIN users u ON u.id=o.educator_id
    WHERE o.tenant_id=? AND o.child_id=? AND o.timestamp BETWEEN ? AND ?
      AND o.type NOT IN (\'nappy\',\'toilet\',\'sleep\')
    ORDER BY o.timestamp ASC LIMIT ?
  ').all(tid, child_id, from, to, maxItems);

  const eylf = D().prepare('
    SELECT eylf_outcome, level FROM child_eylf_progress
    WHERE tenant_id=? AND child_id=? AND progressed_at BETWEEN ? AND ?
    ORDER BY level DESC
  ').all(tid, child_id, from, to);

  const photos = [
    ...D().prepare('SELECT photo_url as url, update_date as date FROM daily_updates WHERE tenant_id=? AND child_id=? AND update_date BETWEEN ? AND ? AND photo_url IS NOT NULL ORDER BY update_date ASC LIMIT 15').all(tid, child_id, from, to),
    ...(() => { const _cArg = '%' + child_id + '%'; return D().prepare('SELECT sp.url, ls.date FROM story_photos sp JOIN learning_stories ls ON ls.id=sp.story_id WHERE sp.tenant_id=? AND ls.date BETWEEN ? AND ? AND instr(ls.child_ids, ?) > 0 LIMIT 15').all(tid, from, to, _cArg); })(),
  ].filter(p => p.url).slice(0, 16);

  return { stories, activities, observations, eylf, photos };
}

function gatherEducators(tid, child_id, from, to) {
  // Educators who wrote observations or learning stories for this child
  return D().prepare('
    SELECT DISTINCT e.first_name, e.last_name, e.role_title, e.photo_url,
           COUNT(*) as contribution_count
    FROM educators e
    JOIN users u ON u.id = (
      SELECT educator_id FROM observations o2 WHERE o2.educator_id = (
        SELECT user_id FROM educators e2 WHERE e2.id = e.id LIMIT 1
      ) AND o2.child_id=? AND o2.tenant_id=? AND o2.timestamp BETWEEN ? AND ? LIMIT 1
    )
    WHERE e.tenant_id=?
    GROUP BY e.id ORDER BY contribution_count DESC LIMIT 8
  ').all(child_id, tid, from, to, tid);
}

// ── GET /api/stories/music ────────────────────────────────────────────────────
router.get('/music', (req, res) => res.json({ tracks: MUSIC_TRACKS }));

// ── GET /api/stories/terms/:year — list terms for a year ─────────────────────
router.get('/terms/:year', (req, res) => {
  const y = parseInt(req.params.year);
  res.json({ terms: NSW_TERMS[y] || NSW_TERMS[2026] });
});

// ── GET /api/stories/period-data — gather data for term/year ─────────────────
router.get('/period-data', (req, res) => {
  try {
    const { period = 'week', child_id, room_id, year, term, week } = req.query;
    const tid = req.tenantId;
    let from, to;

    if (period === 'week') {
      if (!week) return res.status(400).json({ error: 'week required' });
      const mon = new Date(week + 'T00:00:00');
      const fri = new Date(mon); fri.setDate(mon.getDate() + 6);
      from = mon.toISOString().split('T')[0]; to = fri.toISOString().split('T')[0];
    } else if (period === 'term') {
      if (!year || !term) return res.status(400).json({ error: 'year and term required' });
      ({ from, to } = termBounds(parseInt(year), parseInt(term)));
    } else if (period === 'year') {
      if (!year) return res.status(400).json({ error: 'year required' });
      ({ from, to } = yearBounds(parseInt(year)));
    }

    let data = { period, from, to, stories: [], activities: [], observations: [], eylf: [], photos: [], educators: [], musicTracks: MUSIC_TRACKS };

    if (child_id) {
      const maxItems = period === 'week' ? 15 : period === 'term' ? 30 : 60;
      const child = gatherChildData(tid, child_id, from, to, maxItems);
      Object.assign(data, child);
      if (period === 'year') {
        // Gather educators who contributed to this child's learning
        data.educators = D().prepare('
          SELECT DISTINCT e.id, e.first_name, e.last_name, e.role_title, e.photo_url,
            (SELECT COUNT(*) FROM observations o WHERE o.educator_id IN 
              (SELECT user_id FROM educators e2 WHERE e2.id=e.id) 
              AND o.child_id=? AND o.tenant_id=? AND o.timestamp BETWEEN ? AND ?) as obs_count
          FROM educators e
          WHERE e.tenant_id=? AND e.status=\'active\'
          ORDER BY obs_count DESC LIMIT 8
        ').all(child_id, tid, from, to, tid);
      }
    } else if (room_id) {
      data.stories = D().prepare('SELECT ls.title, ls.content, ls.date FROM learning_stories ls WHERE ls.tenant_id=? AND ls.room_id=? AND ls.date BETWEEN ? AND ? AND ls.visible_to_parents=1 ORDER BY ls.date ASC LIMIT 30').all(tid, room_id, from, to);
      data.activities = D().prepare('SELECT du.notes, du.update_date FROM daily_updates du JOIN children c ON c.id=du.child_id WHERE du.tenant_id=? AND c.room_id=? AND du.update_date BETWEEN ? AND ? AND du.category=\'activity\' AND du.notes IS NOT NULL ORDER BY du.update_date ASC LIMIT 30').all(tid, room_id, from, to);
      data.photos = D().prepare('SELECT sp.url FROM story_photos sp JOIN learning_stories ls ON ls.id=sp.story_id WHERE sp.tenant_id=? AND ls.room_id=? AND ls.date BETWEEN ? AND ? LIMIT 16').all(tid, room_id, from, to).filter(p => p.url);
    } else {
      // Centre-wide
      data.stories = D().prepare('SELECT ls.title, ls.content, ls.date, r.name as room_name FROM learning_stories ls LEFT JOIN rooms r ON r.id=ls.room_id WHERE ls.tenant_id=? AND ls.date BETWEEN ? AND ? AND ls.visible_to_parents=1 ORDER BY ls.date ASC LIMIT 40').all(tid, from, to);
      data.activities = D().prepare('SELECT du.notes, du.update_date FROM daily_updates du WHERE du.tenant_id=? AND du.update_date BETWEEN ? AND ? AND du.category=\'activity\' AND du.notes IS NOT NULL ORDER BY du.update_date ASC LIMIT 30').all(tid, from, to);
      data.photos = D().prepare('SELECT sp.url FROM story_photos sp JOIN learning_stories ls ON ls.id=sp.story_id WHERE sp.tenant_id=? AND ls.date BETWEEN ? AND ? LIMIT 16').all(tid, from, to).filter(p => p.url);
      if (period === 'year') {
        data.educators = D().prepare('SELECT id, first_name, last_name, role_title, photo_url FROM educators WHERE tenant_id=? AND status=\'active\' ORDER BY first_name ASC LIMIT 20').all(tid);
      }
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/stories/generate — generate story script ───────────────────────
router.post('/generate', async (req, res) => {
  try {
    const {
      period = 'week', story_type = 'child',
      child_id, room_id, child_name, room_name, centre_name,
      year, term,
      from, to,
      stories: learningStories = [], activities = [], observations = [],
      eylf = [], photos = [], educators = [],
      music_track_id = 'gentle-piano',
      override_script,
      // Year-end extras
      centre_message = '',
      management_photos = [],
      featured_educator_ids = [],
    } = req.body;

    if (!from) return res.status(400).json({ error: 'from date required' });

    let script = override_script || null;
    let aiUsed = false;

    const wordTargets = { week: { min: 40, max: 65 }, term: { min: 80, max: 120 }, year: { min: 160, max: 240 } };
    const secTargets = { week: '15-25', term: '30-45', year: '60-90' };
    const target = wordTargets[period] || wordTargets.week;
    const subject = story_type === 'child' ? (child_name || 'your child')
      : story_type === 'room' ? (room_name || 'the room')
      : (centre_name || 'our centre');

    if (!script) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      const highlights = [
        ...learningStories.slice(0, period === 'year' ? 8 : 4).map(ls => ls.title ? `Learning story: "${ls.title}"` : null).filter(Boolean),
        ...activities.slice(0, period === 'year' ? 10 : 5).map(a => a.notes ? `Activity: ${a.notes.slice(0, 80)}` : null).filter(Boolean),
        ...observations.slice(0, 4).map(o => o.narrative ? `Observation: ${o.narrative.slice(0, 80)}` : null).filter(Boolean),
        ...eylf.slice(0, 4).map(e => EYLF_SHORT[e.eylf_outcome] ? `Growth: ${EYLF_SHORT[e.eylf_outcome]}` : null).filter(Boolean),
      ];

      const featuredEdNames = educators
        .filter(e => !featured_educator_ids.length || featured_educator_ids.includes(e.id))
        .slice(0, 6).map(e => `${e.first_name} ${e.last_name}${e.role_title ? ` (${e.role_title})` : ''}`);

      if (apiKey) {
        let prompt = '';

        if (period === 'week') {
          prompt = `Write a warm, celebratory weekly story narration for ${story_type === 'child' ? 'parents about their child' : story_type === 'room' ? 'educators reviewing their room' : 'centre management'}.

Subject: ${subject}  Week: ${from}
Highlights: ${highlights.slice(0, 6).join(' | ')}

Rules: ${target.min}-${target.max} words exactly. Warm and joyful. Specific to real events. No nappies/toileting/medical. ${story_type === 'child' ? 'Address parents directly.' : 'Use "we" and celebrate together.'}
Return ONLY the narration. No title. No quotes.`;

        } else if (period === 'term') {
          const termLabel = term ? `Term ${term} ${year}` : `${from} to ${to}`;
          prompt = `Write a warm end-of-term story narration for ${story_type === 'child' ? 'parents' : 'educators'} summarising a full school term.

Subject: ${subject}  Term: ${termLabel}
Highlights across the term (${highlights.length} moments captured):
${highlights.slice(0, 10).map(h => `- ${h}`).join('\n')}

Rules:
- ${target.min}-${target.max} words (${secTargets[period]} seconds spoken)
- Celebrate the journey of the full term, not just one week
- Reference 3-5 specific highlights from the list above
- Build to a warm celebratory ending — celebrate growth and achievement
- ${story_type === 'child' ? 'Address parents: "This term, [name] has..."' : 'Use "we" and celebrate the team'}
- No nappies, toileting, sleep or medical content
Return ONLY the narration text.`;

        } else if (period === 'year') {
          prompt = `Write a heartfelt year-end story narration for parents, celebrating a full year of their child's growth at childcare.

Child: ${subject}   Year: ${year}
Centre: ${centre_name || 'our centre'}

Highlights from the year (${highlights.length} moments):
${highlights.slice(0, 15).map(h => `- ${h}`).join('\n')}

${featuredEdNames.length ? `Educators who nurtured ${subject} this year: ${featuredEdNames.join(', ')}` : ''}

${centre_message ? `Centre message to include: "${centre_message}"` : ''}

Rules:
- ${target.min}-${target.max} words (${secTargets[period]} seconds spoken)
- Structure: Opening celebration → journey highlights (3-5 specific moments) → growth acknowledgement → educator tribute${featuredEdNames.length ? ` (name the educators: ${featuredEdNames.join(', ')})` : ''} → ${centre_message ? 'weave in the centre message → ' : ''}heartfelt closing thanking the family
- This is the biggest story of the year — make it count emotionally
- End with sincere thanks: "To the [family surname] family, thank you for trusting us with [child name]..."
- Warm, personal, specific, joyful but also a little bittersweet — it's been a whole year
Return ONLY the narration text. No title. No stage directions.`;
        }

        try {
          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: period === 'year' ? 400 : period === 'term' ? 250 : 150,
              messages: [{ role: 'user', content: prompt }],
            }),
          });
          const d = await r.json();
          script = d.content?.[0]?.text?.trim() || null;
          if (script) aiUsed = true;
        } catch (e) { console.error('[Stories] Claude error:', e.message); }
      }

      // Template fallback
      if (!script) {
        const acts = activities.slice(0, 3).map(a => a.notes?.split('.')[0]).filter(Boolean);
        const storyTitles = learningStories.slice(0, 2).map(s => s.title).filter(Boolean);
        const eylfOut = eylf[0] ? EYLF_SHORT[eylf[0].eylf_outcome] : null;

        if (period === 'week') {
          const parts = [`What a wonderful week for ${subject}!`];
          if (storyTitles[0]) parts.push(`We captured "${storyTitles[0]}".`);
          if (acts[0]) parts.push(acts[0] + '.');
          if (eylfOut) parts.push(`We saw real growth in ${subject}'s ${eylfOut}.`);
          parts.push(`Thank you for trusting us. See you next week! 💛`);
          script = parts.join(' ');
        } else if (period === 'term') {
          const termLabel = term ? `Term ${term}` : 'this term';
          const parts = [`What an incredible ${termLabel} for ${subject}!`];
          if (storyTitles.length) parts.push(`We captured ${storyTitles.length > 1 ? 'so many' : 'a beautiful'} moment${storyTitles.length > 1 ? 's' : ''}, including "${storyTitles[0]}".`);
          if (acts.length > 0) parts.push(`${subject} explored ${acts.join(', and ')}.`);
          if (eylfOut) parts.push(`Throughout the term we saw remarkable growth in ${eylfOut}.`);
          parts.push(`Thank you for sharing ${subject} with us this term. We can't wait for the next chapter! 🌟`);
          script = parts.join(' ');
        } else {
          const edNames = featuredEdNames.slice(0, 3).join(', ');
          const parts = [`What an extraordinary year for ${subject}!`];
          if (learningStories.length > 2) parts.push(`Over ${learningStories.length} learning stories captured the beautiful moments of the year.`);
          if (acts.length) parts.push(`${subject} explored everything from ${acts.slice(0, 2).join(' to ')}.`);
          if (eylfOut) parts.push(`We watched ${subject} grow in ${eylfOut} — a joy to witness.`);
          if (edNames) parts.push(`Our wonderful educators — ${edNames} — poured their hearts into every day.`);
          if (centre_message) parts.push(centre_message);
          parts.push(`To ${subject}'s family — thank you from the bottom of our hearts for trusting us with your precious child. What a year it has been. 💛`);
          script = parts.join(' ');
        }
      }
    }

    // Store the story
    const storyId = uuid();
    const track = MUSIC_TRACKS.find(t => t.id === music_track_id) || MUSIC_TRACKS[0];

    D().prepare('
      INSERT INTO weekly_stories
        (id, tenant_id, type, child_id, room_id, period, year, term,
         week_start, week_end, script, music_track_id, music_track_url,
         photo_urls, management_photos, educators_featured,
         centre_message, ai_generated, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime(\'now\'))
    ').run(
      storyId, req.tenantId, story_type, child_id || null, room_id || null,
      period, year || null, term || null,
      from, to, script, track.id, track.url,
      JSON.stringify(photos.slice(0, 16).map(p => p.url || p).filter(Boolean)),
      JSON.stringify(management_photos || []),
      JSON.stringify(featured_educator_ids || []),
      centre_message || '',
      aiUsed ? 1 : 0, 'draft'
    );

    res.json({ id: storyId, script, period, ai_generated: aiUsed, music: track, photos: photos.slice(0, 16) });
  } catch (e) {
    console.error('[Stories:generate]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/stories ──────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const { type, period, status, child_id, room_id, limit = 30 } = req.query;
    let sql = `SELECT ws.*, c.first_name || ' ' || c.last_name as child_name, r.name as room_name
               FROM weekly_stories ws
               LEFT JOIN children c ON c.id=ws.child_id
               LEFT JOIN rooms r ON r.id=ws.room_id
               WHERE ws.tenant_id=?`;
    const p = [req.tenantId];
    if (type)     { sql += ' AND ws.type=?';     p.push(type); }
    if (period)   { sql += ' AND ws.period=?';   p.push(period); }
    if (status)   { sql += ' AND ws.status=?';   p.push(status); }
    if (child_id) { sql += ' AND ws.child_id=?'; p.push(child_id); }
    if (room_id)  { sql += ' AND ws.room_id=?';  p.push(room_id); }
    sql += ' ORDER BY ws.created_at DESC LIMIT ?';
    p.push(Number(limit));
    const rows = D().prepare(sql).all(...p);
    res.json({ stories: rows.map(s => ({ ...s, photo_urls: JSON.parse(s.photo_urls || '[]'), management_photos: JSON.parse(s.management_photos || '[]') })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/stories/:id ──────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const s = D().prepare('
      SELECT ws.*, c.first_name || \' \' || c.last_name as child_name,
             r.name as room_name, t.name as centre_name
      FROM weekly_stories ws
      LEFT JOIN children c ON c.id=ws.child_id
      LEFT JOIN rooms r ON r.id=ws.room_id
      LEFT JOIN tenants t ON t.id=ws.tenant_id
      WHERE ws.id=? AND ws.tenant_id=?
    ').get(req.params.id, req.tenantId);
    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json({ story: { ...s, photo_urls: JSON.parse(s.photo_urls || '[]'), management_photos: JSON.parse(s.management_photos || '[]'), educators_featured: JSON.parse(s.educators_featured || '[]') } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /api/stories/:id ──────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  try {
    const { script, music_track_id, centre_message, management_photos, educators_featured } = req.body;
    const track = MUSIC_TRACKS.find(t => t.id === music_track_id);
    D().prepare('UPDATE weekly_stories SET
      script=COALESCE(?,script), music_track_id=COALESCE(?,music_track_id),
      music_track_url=COALESCE(?,music_track_url),
      centre_message=COALESCE(?,centre_message),
      management_photos=COALESCE(?,management_photos),
      educators_featured=COALESCE(?,educators_featured),
      updated_at=datetime(\'now\') WHERE id=? AND tenant_id=?')
      .run(script||null, music_track_id||null, track?.url||null,
           centre_message||null,
           management_photos ? JSON.stringify(management_photos) : null,
           educators_featured ? JSON.stringify(educators_featured) : null,
           req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Publish / unpublish / delete ──────────────────────────────────────────────
router.post('/:id/publish', (req, res) => {
  try {
    D().prepare('UPDATE weekly_stories SET status=\'published\', published_at=datetime(\'now\'), updated_at=datetime(\'now\') WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/:id/unpublish', (req, res) => {
  try {
    D().prepare('UPDATE weekly_stories SET status=\'draft\', published_at=NULL, updated_at=datetime(\'now\') WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM weekly_stories WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/stories/parent/:childId — published stories for parent portal ────
router.get('/parent/:childId', (req, res) => {
  try {
    const stories = D().prepare('
      SELECT id, type, period, year, term, week_start, script,
             music_track_url, photo_urls, management_photos, published_at, ai_generated
      FROM weekly_stories
      WHERE tenant_id=? AND child_id=? AND status=\'published\'
      ORDER BY week_start DESC LIMIT 20
    ').all(req.tenantId, req.params.childId);
    res.json({ stories: stories.map(s => ({ ...s, photo_urls: JSON.parse(s.photo_urls||'[]'), management_photos: JSON.parse(s.management_photos||'[]') })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
