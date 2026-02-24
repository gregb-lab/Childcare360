import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const router = Router();
router.use(requireAuth, requireTenant);

// GET children (enhanced with compliance counts)
router.get('/', (req, res) => {
  try {
    const children = D().prepare(`
      SELECT c.*, r.name as room_name,
        (SELECT COUNT(*) FROM medical_plans mp WHERE mp.child_id = c.id AND mp.status = 'current') as active_plans,
        (SELECT COUNT(*) FROM immunisation_records ir WHERE ir.child_id = c.id AND ir.status = 'current') as imm_current,
        (SELECT COUNT(*) FROM child_permissions cp WHERE cp.child_id = c.id AND cp.granted = 1) as permissions_granted,
        (SELECT COUNT(*) FROM daily_updates du WHERE du.child_id = c.id AND du.update_date = date('now')) as updates_today
      FROM children c
      LEFT JOIN rooms r ON c.room_id = r.id
      WHERE c.tenant_id = ? AND c.active = 1
      ORDER BY c.room_id, c.first_name
    `).all(req.tenantId);
    res.json(children);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single child with full profile
router.get('/:id', (req, res) => {
  try {
    const child = D().prepare('SELECT c.*, r.name as room_name FROM children c LEFT JOIN rooms r ON c.room_id = r.id WHERE c.id = ? AND c.tenant_id = ?').get(req.params.id, req.tenantId);
    if (!child) return res.status(404).json({ error: 'Not found' });

    const parents = D().prepare('SELECT * FROM parent_contacts WHERE child_id = ? ORDER BY is_primary DESC').all(req.params.id);
    const medPlans = D().prepare('SELECT * FROM medical_plans WHERE child_id = ? ORDER BY created_at DESC').all(req.params.id);
    const immunisations = D().prepare('SELECT * FROM immunisation_records WHERE child_id = ? ORDER BY date_given DESC').all(req.params.id);
    const medications = D().prepare('SELECT * FROM medications WHERE child_id = ? AND status = \'active\'').all(req.params.id);
    const dietary = D().prepare('SELECT * FROM child_dietary WHERE child_id = ? ORDER BY severity DESC').all(req.params.id).catch?.() || tryQuery(() => D().prepare('SELECT * FROM child_dietary WHERE child_id = ? ORDER BY severity DESC').all(req.params.id));
    const permissions = tryQuery(() => D().prepare('SELECT * FROM child_permissions WHERE child_id = ?').all(req.params.id));
    const pickups = tryQuery(() => D().prepare('SELECT * FROM authorised_pickups WHERE child_id = ? AND active = 1').all(req.params.id));
    const requests = tryQuery(() => D().prepare('SELECT * FROM parental_requests WHERE child_id = ? AND status = \'active\'').all(req.params.id));
    const documents = D().prepare('SELECT * FROM child_documents WHERE child_id = ? ORDER BY created_at DESC').all(req.params.id);
    const invoices = D().prepare('SELECT * FROM invoices WHERE child_id = ? ORDER BY period_start DESC LIMIT 12').all(req.params.id);
    const recentUpdates = tryQuery(() => D().prepare('SELECT * FROM daily_updates WHERE child_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.id));
    
    res.json({ ...child, parents, medPlans, immunisations, medications, dietary, permissions, pickups, requests, documents, invoices, recentUpdates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET child AI insights (rule-based EYLF mapping)
router.get('/:id/ai-insights', (req, res) => {
  try {
    const observations = D().prepare(`SELECT * FROM observations WHERE child_id = ? AND timestamp >= datetime('now','-30 days') ORDER BY timestamp DESC`).all(req.params.id);
    if (observations.length === 0) return res.json({ focusAreas: [], observationCount: 0 });

    const outcomeKeywords = {
      'Identity': ['self', 'identity', 'confident', 'resilient', 'agency', 'belonging', 'independent', 'pride', 'feelings', 'emotion'],
      'Community': ['community', 'contribute', 'responsibility', 'respect', 'diverse', 'culture', 'family', 'friendship', 'empathy', 'social'],
      'Wellbeing': ['wellbeing', 'health', 'physical', 'emotions', 'safety', 'selfcare', 'movement', 'active', 'tired', 'energy'],
      'Learning': ['curious', 'explore', 'investigate', 'problem', 'creative', 'imagine', 'question', 'discover', 'experiment', 'wonder'],
      'Communication': ['language', 'communicate', 'express', 'literacy', 'numeracy', 'symbol', 'story', 'talk', 'listen', 'sing', 'draw', 'count'],
    };

    const scores = {};
    const matchedObs = {};
    Object.keys(outcomeKeywords).forEach(area => { scores[area] = 0; matchedObs[area] = []; });

    observations.forEach(obs => {
      const text = (obs.narrative || '').toLowerCase();
      Object.entries(outcomeKeywords).forEach(([area, keywords]) => {
        const hits = keywords.filter(k => text.includes(k)).length;
        if (hits > 0) {
          scores[area] += hits;
          if (matchedObs[area].length < 2) matchedObs[area].push({ id: obs.id, title: obs.type, snippet: obs.narrative.slice(0, 80) + '...' });
        }
      });
    });

    const focusAreas = Object.entries(scores)
      .filter(([,s]) => s > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([area, score]) => ({
        area,
        score,
        observations: matchedObs[area],
        rationale: `Based on ${matchedObs[area].length > 1 ? matchedObs[area].length + ' observations' : 'recent observations'}, patterns suggest strong engagement with ${area.toLowerCase()}-related activities.`,
      }));

    res.json({ focusAreas, observationCount: observations.length, period: '30 days' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET child attendance stats
router.get('/:id/attendance-stats', (req, res) => {
  try {
    const sessions = D().prepare(`SELECT * FROM attendance_sessions WHERE child_id = ? AND date >= date('now','-90 days') ORDER BY date DESC`).all(req.params.id);
    const present = sessions.filter(s => !s.absent).length;
    const absent = sessions.filter(s => s.absent).length;
    const lateArrivals = sessions.filter(s => {
      if (!s.sign_in) return false;
      const mins = parseInt(s.sign_in.split(':')[0]) * 60 + parseInt(s.sign_in.split(':')[1]);
      return mins > 9 * 60 + 15; // after 9:15am
    }).length;
    res.json({ sessions, present, absent, lateArrivals, total: sessions.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET child event log
router.get('/:id/event-log', (req, res) => {
  try {
    const events = tryQuery(() => D().prepare(`SELECT el.*, u.name as creator_name FROM child_event_log el LEFT JOIN users u ON el.created_by = u.id WHERE el.child_id = ? ORDER BY el.created_at DESC LIMIT 100`).all(req.params.id));
    res.json(events || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST child permission
router.post('/:id/permissions', (req, res) => {
  try {
    const { permission_type, granted, granted_by, notes, expiry_date } = req.body;
    // Upsert
    const existing = tryQuery(() => D().prepare('SELECT id FROM child_permissions WHERE child_id = ? AND permission_type = ?').get(req.params.id, permission_type));
    if (existing) {
      D().prepare('UPDATE child_permissions SET granted = ?, granted_by = ?, granted_at = datetime(\'now\'), notes = ?, expiry_date = ? WHERE id = ?')
        .run(granted ? 1 : 0, granted_by||null, notes||null, expiry_date||null, existing.id);
      return res.json({ id: existing.id });
    }
    const id = uuid();
    D().prepare(`INSERT INTO child_permissions (id,tenant_id,child_id,permission_type,granted,granted_by,granted_at,notes,expiry_date) VALUES(?,?,?,?,?,?,datetime('now'),?,?)`)
      .run(id, req.tenantId, req.params.id, permission_type, granted ? 1 : 0, granted_by||null, notes||null, expiry_date||null);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST child dietary requirement
router.post('/:id/dietary', (req, res) => {
  try {
    const { name, type, description, severity, action_required, notified_kitchen,
            is_anaphylactic, risk_minimisation_plan_url, risk_minimisation_plan_date,
            medical_communication_plan_url, medical_communication_plan_date, category } = req.body;
    const id = uuid();
    D().prepare(`INSERT INTO child_dietary
      (id,tenant_id,child_id,type,description,severity,action_required,notified_kitchen,
       is_anaphylactic,risk_minimisation_plan_url,risk_minimisation_plan_date,
       medical_communication_plan_url,medical_communication_plan_date)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, req.tenantId, req.params.id, category || type || 'allergy',
           name || description, severity || 'moderate', action_required || null,
           notified_kitchen ? 1 : 0, is_anaphylactic ? 1 : 0,
           risk_minimisation_plan_url || null, risk_minimisation_plan_date || null,
           medical_communication_plan_url || null, medical_communication_plan_date || null);
    // Log to child event log
    if (is_anaphylactic) {
      D().prepare('INSERT INTO child_event_log (id,tenant_id,child_id,event_type,description,created_by) VALUES(?,?,?,?,?,?)')
        .run(uuid(), req.tenantId, req.params.id, 'dietary_added',
          `Anaphylactic requirement added: ${name || description}. Plans: MRMP=${risk_minimisation_plan_url ? 'attached' : 'not attached'}, MCP=${medical_communication_plan_url ? 'attached' : 'not attached'}.`,
          req.userId);
    }
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE dietary
router.delete('/:id/dietary/:dietId', (req, res) => {
  try {
    D().prepare('DELETE FROM child_dietary WHERE id = ? AND child_id = ?').run(req.params.dietId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST authorised pickup
router.post('/:id/pickup', (req, res) => {
  try {
    const { name, relationship, phone, notes } = req.body;
    const id = uuid();
    D().prepare(`INSERT INTO authorised_pickups (id,tenant_id,child_id,name,relationship,phone,notes,active) VALUES(?,?,?,?,?,?,?,1)`)
      .run(id, req.tenantId, req.params.id, name, relationship||null, phone||null, notes||null);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE authorised pickup
router.delete('/:id/pickup/:pickupId', (req, res) => {
  try {
    D().prepare('UPDATE authorised_pickups SET active = 0 WHERE id = ? AND child_id = ?').run(req.params.pickupId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST parental request
router.post('/:id/requests', (req, res) => {
  try {
    const { category, request } = req.body;
    const id = uuid();
    D().prepare('INSERT INTO parental_requests (id,tenant_id,child_id,category,request,status) VALUES(?,?,?,?,?,\'active\')')
      .run(id, req.tenantId, req.params.id, category||'other', request);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST log event
router.post('/:id/events', (req, res) => {
  try {
    const { event_type, description, metadata } = req.body;
    const id = uuid();
    D().prepare(`INSERT INTO child_event_log (id,tenant_id,child_id,event_type,description,metadata,created_by) VALUES(?,?,?,?,?,?,?)`)
      .run(id, req.tenantId, req.params.id, event_type, description, JSON.stringify(metadata || {}), req.userId);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update child
router.put('/:id', (req, res) => {
  try {
    const fields = ['first_name','last_name','dob','room_id','allergies','notes','photo_url','doctor_name','doctor_phone','medicare_number','gender','language','indigenous','parent1_name','parent1_email','parent1_phone','parent1_relationship','parent2_name','parent2_email','parent2_phone','centrelink_crn','medical_notes','enrolled_date'];
    const updates = { updated_at: new Date().toISOString() };
    fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    D().prepare(`UPDATE children SET ${setClause} WHERE id = ? AND tenant_id = ?`).run(...Object.values(updates), req.params.id, req.tenantId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new child
router.post('/', (req, res) => {
  try {
    const { first_name, last_name, dob, room_id, allergies, enrolled_date } = req.body;
    const id = uuid();
    D().prepare(`INSERT INTO children (id,tenant_id,first_name,last_name,dob,room_id,allergies,enrolled_date,active) VALUES(?,?,?,?,?,?,?,?,1)`)
      .run(id, req.tenantId, first_name, last_name, dob, room_id||null, allergies||'None', enrolled_date||new Date().toISOString().split('T')[0]);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function tryQuery(fn) { try { return fn(); } catch(e) { return []; } }

export default router;

// ─── MISSING ENDPOINTS ────────────────────────────────────────────────────────

// GET /:id/attendance-summary (alias + enriched version of attendance-stats)
router.get('/:id/attendance-summary', (req, res) => {
  try {
    const sessions = D().prepare(`SELECT * FROM attendance_sessions WHERE child_id=? AND tenant_id=? ORDER BY date DESC LIMIT 120`).all(req.params.id, req.tenantId);
    const total_days = sessions.filter(s=>!s.absent).length;
    const absences   = sessions.filter(s=>s.absent).length;
    const arrivals   = sessions.map(s=>s.sign_in).filter(Boolean).map(t=>parseInt(t.split(':')[0])*60+parseInt(t.split(':')[1]));
    const departures = sessions.map(s=>s.sign_out).filter(Boolean).map(t=>parseInt(t.split(':')[0])*60+parseInt(t.split(':')[1]));
    const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : null;
    const toTime = m => m===null ? null : `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    const dayMap = {1:'mon',2:'tue',3:'wed',4:'thu',5:'fri'};
    const dayPatterns = {};
    ['mon','tue','wed','thu','fri'].forEach(d=>{ dayPatterns[d]=0; });
    sessions.filter(s=>!s.absent).forEach(s=>{
      const dow = new Date(s.date+'T12:00').getDay();
      if (dayMap[dow]) dayPatterns[dayMap[dow]] = (dayPatterns[dayMap[dow]]||0)+1;
    });
    const maxDay = Math.max(1,...Object.values(dayPatterns));
    Object.keys(dayPatterns).forEach(d=>{ dayPatterns[d]=Math.round(dayPatterns[d]/maxDay*100); });
    const early_pct = arrivals.length ? Math.round(arrivals.filter(m=>m<=8*60+30).length/arrivals.length*100) : 0;
    const late_pct  = departures.length ? Math.round(departures.filter(m=>m>=17*60).length/departures.length*100) : 0;
    res.json({ total_days, absences, avg_arrival: toTime(avg(arrivals)), avg_departure: toTime(avg(departures)),
      earliest_arrival: toTime(arrivals.length?Math.min(...arrivals):null), latest_departure: toTime(departures.length?Math.max(...departures):null),
      early_pct, late_pct, day_patterns: dayPatterns, sessions: sessions.slice(0,20) });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /:id/attendance?limit=20
router.get('/:id/attendance', (req, res) => {
  try {
    const limit = parseInt(req.query.limit)||20;
    const rows = D().prepare(`SELECT * FROM attendance_sessions WHERE child_id=? ORDER BY date DESC LIMIT ?`).all(req.params.id, limit);
    res.json(rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /:id/events?type=... (alias for event-log)
router.get('/:id/events', (req, res) => {
  try {
    const { type, limit=50 } = req.query;
    let sql = `SELECT * FROM child_events WHERE child_id=?`;
    const args = [req.params.id];
    if (type && type!=='all') { sql += ` AND event_type=?`; args.push(type); }
    sql += ` ORDER BY created_at DESC LIMIT ?`; args.push(parseInt(limit)||50);
    const rows = tryQuery(()=>D().prepare(sql).all(...args));
    res.json(rows);
  } catch(err) { res.json([]); }
});

// GET + POST /:id/educator-notes
router.get('/:id/educator-notes', (req, res) => {
  try {
    D().prepare(`CREATE TABLE IF NOT EXISTS child_educator_notes (id TEXT PRIMARY KEY, child_id TEXT, tenant_id TEXT, educator_id TEXT, educator_name TEXT, note TEXT, created_at TEXT DEFAULT (datetime('now')))`).run();
    const rows = D().prepare(`SELECT n.*, u.name as educator_name FROM child_educator_notes n LEFT JOIN users u ON u.id=n.educator_id WHERE n.child_id=? ORDER BY n.created_at DESC LIMIT 50`).all(req.params.id);
    res.json(rows);
  } catch(err) { res.json([]); }
});
router.post('/:id/educator-notes', requireAuth, requireTenant, (req, res) => {
  try {
    D().prepare(`CREATE TABLE IF NOT EXISTS child_educator_notes (id TEXT PRIMARY KEY, child_id TEXT, tenant_id TEXT, educator_id TEXT, educator_name TEXT, note TEXT, created_at TEXT DEFAULT (datetime('now')))`).run();
    const { note } = req.body;
    const educator = D().prepare('SELECT name FROM users WHERE id=?').get(req.userId);
    const id = uuid();
    D().prepare(`INSERT INTO child_educator_notes (id,child_id,tenant_id,educator_id,educator_name,note) VALUES(?,?,?,?,?,?)`).run(id, req.params.id, req.tenantId, req.userId, educator?.name||'Educator', note);
    res.json({ id, note, educator_name: educator?.name||'Educator', created_at: new Date().toISOString() });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET + POST + DELETE /:childId/collection-persons
router.get('/:id/collection-persons', (req, res) => {
  try {
    D().prepare(`CREATE TABLE IF NOT EXISTS authorised_pickups (id TEXT PRIMARY KEY, child_id TEXT, tenant_id TEXT, name TEXT, relationship TEXT, phone TEXT, photo_id_type TEXT, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`).run();
    const rows = D().prepare(`SELECT * FROM authorised_pickups WHERE child_id=? AND active=1 ORDER BY name`).all(req.params.id);
    res.json(rows);
  } catch(err) { res.json([]); }
});
router.post('/:id/collection-persons', requireAuth, requireTenant, (req, res) => {
  try {
    D().prepare(`CREATE TABLE IF NOT EXISTS authorised_pickups (id TEXT PRIMARY KEY, child_id TEXT, tenant_id TEXT, name TEXT, relationship TEXT, phone TEXT, photo_id_type TEXT, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`).run();
    const { name, relationship, phone, photo_id_type } = req.body;
    const id = uuid();
    D().prepare(`INSERT INTO authorised_pickups (id,child_id,tenant_id,name,relationship,phone,photo_id_type,active) VALUES(?,?,?,?,?,?,?,1)`).run(id, req.params.id, req.tenantId, name, relationship||'', phone||'', photo_id_type||'');
    res.json({ id, name, relationship, phone, photo_id_type });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
router.delete('/:id/collection-persons/:pid', requireAuth, requireTenant, (req, res) => {
  try {
    D().prepare(`UPDATE authorised_pickups SET active=0 WHERE id=? AND child_id=?`).run(req.params.pid, req.params.id);
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /:id/focus (AI-generated focus profile - cached)
router.get('/:id/focus', (req, res) => {
  try {
    D().prepare(`CREATE TABLE IF NOT EXISTS child_focus_profiles (id TEXT PRIMARY KEY, child_id TEXT UNIQUE, tenant_id TEXT, focus_data TEXT, generated_at TEXT)`).run();
    const row = D().prepare(`SELECT * FROM child_focus_profiles WHERE child_id=?`).get(req.params.id);
    if (!row) return res.json(null);
    res.json({ focus: JSON.parse(row.focus_data||'{}'), generated_at: row.generated_at });
  } catch(err) { res.json(null); }
});
// POST /:id/ai-focus (generate + cache)
router.post('/:id/ai-focus', requireAuth, requireTenant, async (req, res) => {
  try {
    D().prepare(`CREATE TABLE IF NOT EXISTS child_focus_profiles (id TEXT PRIMARY KEY, child_id TEXT UNIQUE, tenant_id TEXT, focus_data TEXT, generated_at TEXT)`).run();
    const child = D().prepare('SELECT * FROM children WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!child) return res.status(404).json({ error: 'Not found' });
    const stories = D().prepare(`SELECT content, eylf_outcomes, tags FROM learning_stories WHERE tenant_id=? AND published=1 AND child_ids LIKE ? ORDER BY date DESC LIMIT 10`).all(req.tenantId, `%${req.params.id}%`);
    const updates = D().prepare(`SELECT category, notes, summary FROM daily_updates WHERE child_id=? ORDER BY created_at DESC LIMIT 30`).all(req.params.id);
    const contextText = [
      `Child: ${child.first_name} ${child.last_name}, DOB: ${child.dob}`,
      stories.length ? `Recent stories: ${stories.slice(0,3).map(s=>s.content?.slice(0,80)).join('; ')}` : '',
      updates.length ? `Recent updates: ${updates.slice(0,5).map(u=>u.notes||u.summary||'').filter(Boolean).join('; ')}` : '',
    ].filter(Boolean).join('\n');
    // Try AI call
    const provider = D().prepare('SELECT * FROM ai_providers WHERE tenant_id=? AND enabled=1 AND api_key IS NOT NULL ORDER BY is_default DESC LIMIT 1').get(req.tenantId);
    let focusData = { strengths: [], next_steps: [], eylf_focus: [], summary: 'Based on available observations.' };
    if (provider) {
      try {
        const aiRes = await fetch('/api/ai/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.authorization, 'x-tenant-id': req.tenantId },
          body: JSON.stringify({
            feature: 'child_focus',
            system: 'You are an early childhood educator. Return ONLY valid JSON with keys: strengths (array of strings), next_steps (array), eylf_focus (array of outcome ids 1-5), summary (string).',
            messages: [{ role: 'user', content: `Generate a learning focus profile for this child:\n${contextText}` }],
            max_tokens: 500,
          }),
        });
        const aiData = await aiRes.json();
        if (aiData.content) {
          try { focusData = JSON.parse(aiData.content.replace(/```json|```/g,'')); } catch{}
        }
      } catch{}
    }
    const id = uuid();
    D().prepare(`INSERT OR REPLACE INTO child_focus_profiles (id,child_id,tenant_id,focus_data,generated_at) VALUES(?,?,?,?,datetime('now'))`).run(id, req.params.id, req.tenantId, JSON.stringify(focusData));
    res.json({ focus: focusData, generated_at: new Date().toISOString() });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /:id/ccs
router.get('/:id/ccs', (req, res) => {
  try {
    const row = D().prepare('SELECT * FROM ccs_details WHERE child_id=?').get(req.params.id);
    res.json(row || {});
  } catch { res.json({}); }
});

// GET /:id/equipment
router.get('/:id/equipment', (req, res) => {
  try {
    const rows = D().prepare(`SELECT * FROM equipment_register WHERE tenant_id=? AND (child_id=? OR child_id IS NULL) ORDER BY expiry_date`).all(req.tenantId, req.params.id);
    res.json(rows);
  } catch { res.json([]); }
});

// GET /:id/medical-plans (standalone route)
router.get('/:id/medical-plans', (req, res) => {
  try { res.json(D().prepare('SELECT * FROM medical_plans WHERE child_id=? ORDER BY created_at DESC').all(req.params.id)); }
  catch { res.json([]); }
});
// GET /:id/medications (standalone)
router.get('/:id/medications', (req, res) => {
  try { res.json(D().prepare("SELECT * FROM medications WHERE child_id=? AND status='active'").all(req.params.id)); }
  catch { res.json([]); }
});
// GET /:id/immunisations (standalone)
router.get('/:id/immunisations', (req, res) => {
  try { res.json(D().prepare('SELECT * FROM immunisation_records WHERE child_id=? ORDER BY date_given DESC').all(req.params.id)); }
  catch { res.json([]); }
});
// GET /:id/parental-requests (standalone)
router.get('/:id/parental-requests', (req, res) => {
  try { res.json(D().prepare("SELECT * FROM parental_requests WHERE child_id=? AND status='active'").all(req.params.id)); }
  catch { res.json([]); }
});
// GET /:id/invoices (standalone)
router.get('/:id/invoices', (req, res) => {
  try {
    const rows = D().prepare('SELECT * FROM invoices WHERE child_id=? ORDER BY period_start DESC LIMIT 24').all(req.params.id);
    res.json(rows.map(r=>({...r, sessions: tryQuery(()=>JSON.parse(r.sessions||'[]'))})));
  } catch { res.json([]); }
});
// DELETE /:id/permissions/:pid
router.delete('/:id/permissions/:pid', requireAuth, requireTenant, (req, res) => {
  try {
    D().prepare('UPDATE child_permissions SET granted=0 WHERE id=? AND child_id=?').run(req.params.pid, req.params.id);
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── MISSING ENDPOINTS v1.9.5 ─────────────────────────────────────────────────

// GET /:id/dietary
router.get('/:id/dietary', (req, res) => {
  const rows = tryQuery(() => D().prepare('SELECT * FROM child_dietary WHERE child_id=? ORDER BY severity DESC').all(req.params.id));
  res.json(rows);
});

// GET /:id/permissions
router.get('/:id/permissions', (req, res) => {
  const rows = tryQuery(() => D().prepare('SELECT * FROM child_permissions WHERE child_id=?').all(req.params.id));
  res.json(rows);
});

// PUT /:id/permissions/:pid — toggle granted
router.put('/:id/permissions/:pid', requireAuth, requireTenant, (req, res) => {
  try {
    const { granted } = req.body;
    D().prepare('UPDATE child_permissions SET granted=?, updated_at=datetime("now") WHERE id=? AND child_id=?')
      .run(granted ? 1 : 0, req.params.pid, req.params.id);
    const row = D().prepare('SELECT * FROM child_permissions WHERE id=?').get(req.params.pid);
    res.json(row || { success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /:id/medications
router.post('/:id/medications', requireAuth, requireTenant, (req, res) => {
  try {
    const { name, dose, frequency, location, expiry_date, instructions, active } = req.body;
    const id = uuid();
    tryQuery(() => D().prepare('CREATE TABLE IF NOT EXISTS medications (id TEXT PRIMARY KEY, child_id TEXT, tenant_id TEXT, name TEXT, dose TEXT, frequency TEXT, location TEXT, expiry_date TEXT, instructions TEXT, status TEXT DEFAULT "active", active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime("now")))').run());
    D().prepare('INSERT INTO medications (id,child_id,tenant_id,name,dose,frequency,location,expiry_date,instructions,status,active) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, req.params.id, req.tenantId, name, dose||null, frequency||null, location||null, expiry_date||null, instructions||null, 'active', active===false?0:1);
    res.json({ id, name, dose, frequency, location, expiry_date, instructions, active: 1 });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /:id/immunisations
router.post('/:id/immunisations', requireAuth, requireTenant, (req, res) => {
  try {
    const { vaccine_name, given, given_date, due_date, batch_number, provider, notes } = req.body;
    const id = uuid();
    tryQuery(() => D().prepare('CREATE TABLE IF NOT EXISTS immunisation_records (id TEXT PRIMARY KEY, child_id TEXT, tenant_id TEXT, vaccine_name TEXT, given INTEGER DEFAULT 0, given_date TEXT, due_date TEXT, batch_number TEXT, provider TEXT, notes TEXT, status TEXT DEFAULT "current", date_given TEXT, created_at TEXT DEFAULT (datetime("now")))').run());
    D().prepare('INSERT INTO immunisation_records (id,child_id,tenant_id,vaccine_name,given,given_date,date_given,due_date,batch_number,provider,notes,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, req.params.id, req.tenantId, vaccine_name, given?1:0, given_date||null, given_date||null, due_date||null, batch_number||null, provider||null, notes||null, 'current');
    res.json({ id, vaccine_name, given: given?1:0, given_date, due_date, batch_number, provider });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /:id/medical-plans
router.post('/:id/medical-plans', requireAuth, requireTenant, (req, res) => {
  try {
    const { plan_type, expiry_date, notes, document_url } = req.body;
    const id = uuid();
    tryQuery(() => D().prepare('CREATE TABLE IF NOT EXISTS medical_plans (id TEXT PRIMARY KEY, child_id TEXT, tenant_id TEXT, plan_type TEXT, expiry_date TEXT, notes TEXT, document_url TEXT, status TEXT DEFAULT "current", created_at TEXT DEFAULT (datetime("now")))').run());
    // Upsert — replace existing plan of same type
    tryQuery(() => D().prepare('DELETE FROM medical_plans WHERE child_id=? AND plan_type=?').run(req.params.id, plan_type));
    D().prepare('INSERT INTO medical_plans (id,child_id,tenant_id,plan_type,expiry_date,notes,document_url,status) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, req.params.id, req.tenantId, plan_type, expiry_date||null, notes||null, document_url||null, 'current');
    res.json({ id, plan_type, expiry_date, notes, document_url, status: 'current' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /:id/equipment
router.post('/:id/equipment', requireAuth, requireTenant, (req, res) => {
  try {
    const { name, location, expiry_date, notes } = req.body;
    const id = uuid();
    tryQuery(() => D().prepare('CREATE TABLE IF NOT EXISTS equipment_register (id TEXT PRIMARY KEY, child_id TEXT, tenant_id TEXT, name TEXT, location TEXT, expiry_date TEXT, notes TEXT, shared INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime("now")))').run());
    D().prepare('INSERT INTO equipment_register (id,child_id,tenant_id,name,location,expiry_date,notes) VALUES(?,?,?,?,?,?,?)')
      .run(id, req.params.id, req.tenantId, name, location||null, expiry_date||null, notes||null);
    res.json({ id, name, location, expiry_date, notes });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// DELETE /:id — archive child (soft delete)
router.delete('/:id', requireAuth, requireTenant, (req, res) => {
  try {
    D().prepare('UPDATE children SET active=0, updated_at=datetime("now") WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /api/rooms/:id/educators — educators assigned to a room
router.get('/room-educators/:roomId', requireAuth, requireTenant, (req, res) => {
  const educators = tryQuery(() => D().prepare(`
    SELECT u.id, u.name, u.email, u.role, u.qualifications, u.wwcc_number
    FROM users u
    JOIN educator_room_assignments era ON era.educator_id = u.id
    WHERE era.room_id = ? AND era.tenant_id = ? AND u.active = 1
  `).all(req.params.roomId, req.tenantId));
  res.json(educators);
});
