import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';
import { getModel } from './ai-tier.js';

const router = Router();
router.use(requireAuth, requireTenant);

// GET /simple — lightweight child list for dropdowns (MUST be before /:id)
router.get('/simple', (req, res) => {
  try {
    res.json(D().prepare(`
      SELECT c.id, c.first_name, c.last_name, c.dob, c.room_id,
             r.name as room_name, c.active,
             ((strftime('%Y','now')-strftime('%Y',c.dob))*12+(strftime('%m','now')-strftime('%m',c.dob))) as age_months
      FROM children c LEFT JOIN rooms r ON r.id=c.room_id
      WHERE c.tenant_id=? AND c.active=1
      ORDER BY r.name, c.last_name, c.first_name
    `).all(req.tenantId));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /attending — children attending a given week, with dietary info (for meal planning)
router.get('/attending', (req, res) => {
  try {
    const { week_start } = req.query;
    const children = D().prepare(`
      SELECT c.id, c.first_name, c.last_name, c.room_id, c.dob,
        c.allergies, c.medical_notes,
        r.name as room_name
      FROM children c
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE c.tenant_id=? AND c.active=1
      ORDER BY r.name, c.first_name
    `).all(req.tenantId);

    // Also get dietary_requirements table entries
    let dietaryMap = {};
    try {
      const reqs = D().prepare(`
        SELECT dr.child_id, dr.requirement_type, dr.severity, dr.allergens
        FROM dietary_requirements dr
        WHERE dr.tenant_id=?
      `).all(req.tenantId);
      reqs.forEach(r => {
        if (!dietaryMap[r.child_id]) dietaryMap[r.child_id] = [];
        dietaryMap[r.child_id].push(r);
      });
    } catch(e) {}

    const result = children.map(c => ({
      ...c,
      dietary_entries: dietaryMap[c.id] || [],
      has_allergies: !!(c.allergies || (dietaryMap[c.id]||[]).some(d => d.severity === 'allergy')),
      has_dietary: !!((dietaryMap[c.id]||[]).length > 0),
    }));

    const allergiesCount = result.filter(c => c.has_allergies).length;
    const dietaryCount = result.filter(c => c.has_dietary).length;
    res.json({ children: result, total: result.length, allergies_count: allergiesCount, dietary_count: dietaryCount, week_start });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /attendance-today — all children with today's sign-in status (MUST be before /:id)
router.get('/attendance-today', (req, res) => {
  try {
    // Local server date — sign-in/sign-out write the local date, so the join
    // here must use the same. Using UTC here was returning yesterday's row
    // every morning in AEST and made the Clock In/Out UI look stale.
    const _now = new Date();
    const today = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
    const rows = D().prepare(`
      SELECT c.id, c.first_name, c.last_name, c.room_id, c.photo_url, c.allergies, c.dob,
             r.name as room_name,
             a.id as session_id, a.sign_in, a.sign_out, a.absent, a.absent_reason, a.hours
      FROM children c
      LEFT JOIN rooms r ON r.id = c.room_id
      LEFT JOIN attendance_sessions a ON a.child_id = c.id AND a.date = ? AND a.tenant_id = ?
      WHERE c.tenant_id = ? AND c.active = 1
      ORDER BY r.name, c.first_name
    `).all(today, req.tenantId, req.tenantId);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /attendance-report?from=&to=&room_id= — attendance register for date range (MUST be before /:id)
router.get('/attendance-report', (req, res) => {
  try {
    const { from, to, room_id } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates required' });
    const db = D();

    const childWhere = ['c.tenant_id=?'];
    const childVals = [req.tenantId];
    if (room_id) { childWhere.push('c.room_id=?'); childVals.push(room_id); }

    const children = db.prepare(`
      SELECT c.id, c.first_name, c.last_name, c.dob, c.room_id, r.name as room_name
      FROM children c LEFT JOIN rooms r ON r.id=c.room_id
      WHERE ${childWhere.join(' AND ')}
      ORDER BY r.name, c.first_name
    `).all(...childVals);

    let records = [];
    try {
      const recWhere = ['a.tenant_id=?', 'a.date>=?', 'a.date<=?'];
      const recVals = [req.tenantId, from, to];
      if (room_id) { recWhere.push('c.room_id=?'); recVals.push(room_id); }

      records = db.prepare(`
        SELECT a.child_id, a.date, a.sign_in as sign_in_time, a.sign_out as sign_out_time,
               a.absent, a.absent_reason, a.hours, c.first_name, c.last_name, c.dob,
               c.room_id, r.name as room_name
        FROM attendance_sessions a
        JOIN children c ON c.id=a.child_id
        LEFT JOIN rooms r ON r.id=c.room_id
        WHERE ${recWhere.join(' AND ')}
        ORDER BY a.date, r.name, c.first_name
      `).all(...recVals);
    } catch(e) { records = []; }
    res.json({ from, to, children, records, total_children: children.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /bulk-room-assign (MUST be before /:id)
router.post('/bulk-room-assign', (req, res) => {
  try {
    const { assignments } = req.body;
    if (!Array.isArray(assignments)) return res.status(400).json({ error: 'assignments array required' });
    const db = D();
    let updated = 0;
    const stmt = db.prepare('UPDATE children SET room_id=?, updated_at=? WHERE id=? AND tenant_id=?');
    const now = new Date().toISOString();
    const run = db.transaction(() => {
      for (const { child_id, room_id } of assignments) {
        const r = stmt.run(room_id || null, now, child_id, req.tenantId);
        updated += r.changes;
      }
    });
    run();
    res.json({ ok: true, updated });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /delete-demo (MUST be before /:id)
router.delete('/delete-demo', requireAuth, (req, res) => {
  try {
    const db = D();
    const tid = req.tenantId;
    db.prepare('DELETE FROM children WHERE tenant_id=?').run(tid);
    db.prepare('DELETE FROM parent_contacts WHERE tenant_id=?').run(tid);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /room-educators/:roomId (MUST be before /:id)
router.get('/room-educators/:roomId', (req, res) => {
  try {
    const rows = D().prepare(`
      SELECT e.id, e.first_name, e.last_name, e.qualification
      FROM educators e
      LEFT JOIN room_educators re ON re.educator_id=e.id
      WHERE (re.room_id=? OR re.room_id IS NULL) AND e.tenant_id=? AND e.status='active'
      ORDER BY e.first_name
    `).all(req.params.roomId, req.tenantId);
    res.json(rows);
  } catch(e) { res.json([]); }
});

// DEBUG - returns count + tenant info
router.get('/debug-count', (req, res) => {
  try {
    const total = D().prepare('SELECT COUNT(*) as cnt FROM children WHERE tenant_id=? AND active=1').get(req.tenantId);
    const sample = D().prepare('SELECT first_name, last_name, room_id FROM children WHERE tenant_id=? AND active=1 LIMIT 5').all(req.tenantId);
    const rooms = D().prepare('SELECT COUNT(*) as cnt FROM rooms WHERE tenant_id=?').get(req.tenantId);
    res.json({ tenantId: req.tenantId, childCount: total?.cnt, sampleChildren: sample, roomCount: rooms?.cnt });
  } catch(e) { res.status(500).json({ error: e.message, tenantId: req.tenantId }); }
});

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
      WHERE c.tenant_id = ? AND (c.active = 1 OR c.active IS NULL)
      ORDER BY c.room_id, c.first_name
    `).all(req.tenantId);
    res.json(children);
  } catch (err) {
    console.error('[Children GET]', err.message, 'tenant:', req.tenantId);
    res.status(500).json({ error: err.message, tenant: req.tenantId });
  }
});

// GET single child with full profile
router.get('/:id', (req, res) => {
  try {
    const child = D().prepare('SELECT c.*, r.name as room_name FROM children c LEFT JOIN rooms r ON c.room_id = r.id WHERE c.id = ? AND c.tenant_id = ?').get(req.params.id, req.tenantId);
    if (!child) return res.status(404).json({ error: 'Not found' });

    const parents = D().prepare('SELECT * FROM parent_contacts WHERE child_id = ? AND tenant_id = ? ORDER BY is_primary DESC').all(req.params.id, req.tenantId);
    const medPlans = D().prepare('SELECT * FROM medical_plans WHERE child_id = ? AND tenant_id = ? ORDER BY created_at DESC').all(req.params.id, req.tenantId);
    const immunisations = D().prepare('SELECT * FROM immunisation_records WHERE child_id = ? AND tenant_id = ? ORDER BY date_given DESC').all(req.params.id, req.tenantId);
    const medications = D().prepare('SELECT * FROM medications WHERE child_id = ? AND status = \'active\' AND tenant_id = ?').all(req.params.id, req.tenantId);
    const dietary = tryQuery(() => D().prepare('SELECT * FROM child_dietary WHERE child_id = ? AND tenant_id = ? ORDER BY severity DESC').all(req.params.id, req.tenantId));
    const permissions = tryQuery(() => D().prepare('SELECT * FROM child_permissions WHERE child_id = ? AND tenant_id = ?').all(req.params.id, req.tenantId));
    const pickups = tryQuery(() => D().prepare('SELECT * FROM authorised_pickups WHERE child_id = ? AND active = 1 AND tenant_id = ?').all(req.params.id, req.tenantId));
    const requests = tryQuery(() => D().prepare('SELECT * FROM parental_requests WHERE child_id = ? AND status = \'active\' AND tenant_id = ?').all(req.params.id, req.tenantId));
    const documents = D().prepare('SELECT * FROM child_documents WHERE child_id = ? AND tenant_id = ? ORDER BY created_at DESC').all(req.params.id, req.tenantId);
    const invoices = D().prepare('SELECT * FROM invoices WHERE child_id = ? AND tenant_id = ? ORDER BY period_start DESC LIMIT 12').all(req.params.id, req.tenantId);
    const recentUpdates = tryQuery(() => D().prepare('SELECT * FROM daily_updates WHERE child_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.id, req.tenantId));
    
    // Normalize gender codes (F/M → female/male)
    if (child.gender === 'F' || child.gender === 'f') child.gender = 'female';
    else if (child.gender === 'M' || child.gender === 'm') child.gender = 'male';

    // Map parent_contacts into parent1_/parent2_ fields if not already set on child record
    const p1 = parents.find(p => p.is_primary) || parents[0];
    const p2 = parents.find(p => p !== p1);
    const contactFields = {};
    if (p1 && !child.parent1_name) {
      contactFields.parent1_name = p1.name || '';
      contactFields.parent1_email = p1.email || '';
      contactFields.parent1_phone = p1.phone || '';
      contactFields.parent1_relationship = p1.relationship || 'parent';
    }
    if (p2 && !child.parent2_name) {
      contactFields.parent2_name = p2.name || '';
      contactFields.parent2_email = p2.email || '';
      contactFields.parent2_phone = p2.phone || '';
    }

    res.json({ ...child, ...contactFields, parents, medPlans, immunisations, medications, dietary, permissions, pickups, requests, documents, invoices, recentUpdates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET child AI insights (rule-based EYLF mapping)
router.get('/:id/ai-insights', (req, res) => {
  try {
    const observations = D().prepare('SELECT * FROM observations WHERE child_id = ? AND tenant_id = ? AND timestamp >= datetime(\'now\',\'-30 days\') ORDER BY timestamp DESC').all(req.params.id, req.tenantId);
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
    const sessions = D().prepare('SELECT * FROM attendance_sessions WHERE child_id = ? AND tenant_id = ? AND date >= date(\'now\',\'-90 days\') ORDER BY date DESC').all(req.params.id, req.tenantId);
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
    const events = tryQuery(() => D().prepare('SELECT el.*, u.name as creator_name FROM child_event_log el LEFT JOIN users u ON el.created_by = u.id WHERE el.child_id = ? AND el.tenant_id = ? ORDER BY el.created_at DESC LIMIT 100').all(req.params.id, req.tenantId));
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
    const existing = tryQuery(() => D().prepare('SELECT id FROM child_permissions WHERE child_id = ? AND permission_type = ? AND tenant_id = ?').get(req.params.id, permission_type, req.tenantId));
    if (existing) {
      D().prepare('UPDATE child_permissions SET granted = ?, granted_by = ?, granted_at = datetime(\'now\'), notes = ?, expiry_date = ? WHERE id = ? AND tenant_id = ?')
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
    D().prepare('DELETE FROM child_dietary WHERE id = ? AND child_id = ? AND tenant_id = ?').run(req.params.dietId, req.params.id, req.tenantId);
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
    D().prepare('UPDATE authorised_pickups SET active = 0 WHERE id = ? AND child_id = ? AND tenant_id = ?').run(req.params.pickupId, req.params.id, req.tenantId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/parental-requests (also handles /parental-requests path)
router.post('/:id/requests', (req, res) => {
  try {
    const { category, request } = req.body;
    const id = uuid();
    const _prReq = req.body.description || req.body.title || req.body.request || '';
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
    const fields = ['first_name','last_name','dob','room_id','allergies','notes','photo_url','doctor_name','doctor_phone','medicare_number','gender','language','indigenous','parent1_name','parent1_email','parent1_phone','parent1_relationship','parent2_name','parent2_email','parent2_phone','centrelink_crn','medical_notes','enrolled_date','room_override_comment','room_override_by'];
    const updates = { updated_at: new Date().toISOString() };
    fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const setClause = fields.filter(f => f in updates).map(f => f + ' = ?').join(', ');
    console.log(`[PUT /children/${req.params.id}] tenant=${req.tenantId} updates:`, JSON.stringify(updates));
    const _childSql = 'UPDATE children SET ' + setClause + ' WHERE id = ? AND tenant_id = ?'; const result = D().prepare(_childSql).run(...fields.filter(f => f in updates).map(f => updates[f]), req.params.id, req.tenantId);
    console.log(`[PUT /children/${req.params.id}] rows changed: ${result.changes}`);
    if (result.changes === 0) {
      return res.status(404).json({ error: `Child not found or not in your organisation (id=${req.params.id}, tenant=${req.tenantId})` });
    }
    res.json({ success: true, changes: result.changes });
  } catch (err) {
    console.error(`[PUT /children/${req.params.id}] error:`, err.message);
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

// POST /api/children/:id/sign-in
router.post('/:id/sign-in', (req, res) => {
  try {
    const { sign_in_time, collector_name } = req.body;
    // Use server local date so attendance day matches the business calendar.
    // Previously this used new Date().toISOString() (UTC) while the guard
    // query used date('now','localtime') — that mismatch silently disabled
    // the duplicate-sign-in 409 whenever local date != UTC date.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const signIn = sign_in_time || `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const db = D();
    // Get child to verify tenant
    const child = db.prepare('SELECT * FROM children WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!child) return res.status(404).json({ error: 'Child not found' });
    // Guard against duplicate sign-in FIRST (before any cleanup)
    const openSession = db.prepare('SELECT id FROM attendance_sessions WHERE child_id=? AND tenant_id=? AND date=? AND sign_in IS NOT NULL AND sign_out IS NULL').get(req.params.id, req.tenantId, today);
    if (openSession) return res.status(409).json({ error: 'Child already signed in', session_id: openSession.id });
    // Cleanup duplicate closed sessions for today (keep most recent closed one)
    db.prepare(`DELETE FROM attendance_sessions WHERE child_id=? AND tenant_id=? AND date=? AND sign_out IS NOT NULL AND id NOT IN (
      SELECT id FROM attendance_sessions WHERE child_id=? AND tenant_id=? AND date=? AND sign_out IS NOT NULL ORDER BY created_at DESC LIMIT 1
    )`).run(req.params.id, req.tenantId, today, req.params.id, req.tenantId, today);
    // Upsert attendance session for today
    const existing = db.prepare('SELECT * FROM attendance_sessions WHERE child_id=? AND date=? AND tenant_id=?').get(req.params.id, today, req.tenantId);
    if (existing) {
      db.prepare('UPDATE attendance_sessions SET sign_in=?, sign_in_collector=?, absent=0 WHERE id=?').run(signIn, collector_name||null, existing.id);
    } else {
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO attendance_sessions (id,tenant_id,child_id,date,sign_in,sign_in_collector,absent) VALUES(?,?,?,?,?,?,0)')
        .run(id, req.tenantId, req.params.id, today, signIn, collector_name||null);
    }
    res.json({ ok: true, sign_in: signIn, date: today });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/children/:id/sign-out
router.post('/:id/sign-out', (req, res) => {
  try {
    const { sign_out_time, collector_name } = req.body;
    // Use server local date, not UTC — see sign-in handler for the same
    // bug: in AEST, ISO UTC date can be a day behind the business day.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const signOut = sign_out_time || `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const db = D();
    const child = db.prepare('SELECT * FROM children WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!child) return res.status(404).json({ error: 'Child not found' });
    const existing = db.prepare('SELECT * FROM attendance_sessions WHERE child_id=? AND date=? AND tenant_id=?').get(req.params.id, today, req.tenantId);
    if (existing) {
      // Calculate hours
      let hours = 0;
      if (existing.sign_in && signOut) {
        const [sh,sm] = existing.sign_in.split(':').map(Number);
        const [eh,em] = signOut.split(':').map(Number);
        hours = Math.max(0, ((eh*60+em) - (sh*60+sm)) / 60);
      }
      db.prepare('UPDATE attendance_sessions SET sign_out=?, sign_out_collector=?, hours=? WHERE id=?').run(signOut, collector_name||null, hours, existing.id);
    } else {
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO attendance_sessions (id,tenant_id,child_id,date,sign_out,sign_out_collector,absent) VALUES(?,?,?,?,?,?,0)')
        .run(id, req.tenantId, req.params.id, today, signOut, collector_name||null);
    }
    res.json({ ok: true, sign_out: signOut, date: today });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/children/:id/mark-absent
router.post('/:id/mark-absent', (req, res) => {
  try {
    const today = req.body.date || new Date().toISOString().slice(0,10);
    const { reason } = req.body;
    const db = D();
    const existing = db.prepare('SELECT id FROM attendance_sessions WHERE child_id=? AND date=? AND tenant_id=?').get(req.params.id, today, req.tenantId);
    if (existing) {
      db.prepare('UPDATE attendance_sessions SET absent=1, sign_in=NULL, sign_out=NULL, absent_reason=? WHERE id=?').run(reason||null, existing.id);
    } else {
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO attendance_sessions (id,tenant_id,child_id,date,absent,absent_reason) VALUES(?,?,?,?,1,?)').run(id, req.tenantId, req.params.id, today, reason||null);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

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
    const rows = D().prepare('SELECT * FROM attendance_sessions WHERE child_id=? AND tenant_id=? ORDER BY date DESC LIMIT ?').all(req.params.id, req.tenantId, limit);
    res.json(rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /:id/events?type=... — aggregate events from multiple sources
router.get('/:id/events', (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query;

    const attendance = tryQuery(() => D().prepare(`
      SELECT 'attendance' as event_type, id, child_id,
        date || 'T' || COALESCE(sign_in, '00:00') || ':00' as created_at,
        CASE WHEN sign_in IS NOT NULL AND sign_out IS NOT NULL
          THEN 'Signed in at ' || sign_in || ', signed out at ' || sign_out
          WHEN sign_in IS NOT NULL THEN 'Signed in at ' || sign_in
          ELSE 'Absent' END as description,
        sign_in, sign_out, date
      FROM attendance_sessions WHERE child_id=? AND tenant_id=?
      ORDER BY date DESC LIMIT 50
    `).all(id, req.tenantId));

    const medical = tryQuery(() => D().prepare(`
      SELECT 'medical' as event_type, id, child_id, created_at,
        'Medical plan: ' || COALESCE(condition_name, plan_type) as description
      FROM medical_plans WHERE child_id=? AND tenant_id=?
      ORDER BY created_at DESC LIMIT 20
    `).all(id, req.tenantId));

    const incidents = tryQuery(() => D().prepare(`
      SELECT 'incident' as event_type, id, child_id, created_at,
        'Incident: ' || COALESCE(title, type, 'Unknown') as description
      FROM incidents WHERE child_id=? AND tenant_id=?
      ORDER BY created_at DESC LIMIT 20
    `).all(id, req.tenantId));

    let events = [...attendance, ...medical, ...incidents];
    if (type && type !== 'all') events = events.filter(e => e.event_type === type);
    events.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    res.json(events.slice(0, 100));
  } catch(e) { res.json([]); }
});

// GET + POST /:id/educator-notes
router.get('/:id/educator-notes', (req, res) => {
  try {
    D().prepare(`CREATE TABLE IF NOT EXISTS child_educator_notes (id TEXT PRIMARY KEY, child_id TEXT, tenant_id TEXT, educator_id TEXT, educator_name TEXT, note TEXT, created_at TEXT DEFAULT (datetime('now')))`).run();
    const rows = D().prepare('SELECT n.*, u.name as educator_name FROM child_educator_notes n LEFT JOIN users u ON u.id=n.educator_id WHERE n.child_id=? ORDER BY n.created_at DESC LIMIT 50').all(req.params.id);
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
    const rows = D().prepare('SELECT * FROM authorised_pickups WHERE child_id=? AND active=1 AND tenant_id=? ORDER BY name').all(req.params.id, req.tenantId);
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
    D().prepare('UPDATE authorised_pickups SET active=0 WHERE id=? AND child_id=? AND tenant_id=?').run(req.params.pid, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /:id/focus (AI-generated focus profile - cached)
router.get('/:id/focus', requireAuth, requireTenant, (req, res) => {
  try {
    D().prepare(`CREATE TABLE IF NOT EXISTS child_focus_profiles (id TEXT PRIMARY KEY, child_id TEXT UNIQUE, tenant_id TEXT, focus_data TEXT, generated_at TEXT)`).run();
    const row = D().prepare('SELECT * FROM child_focus_profiles WHERE child_id=?').get(req.params.id);
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
    const _cl='%'+req.params.id+'%';
    const stories=D().prepare('SELECT content, eylf_outcomes, tags FROM learning_stories WHERE tenant_id=? AND published=1 AND child_ids LIKE ? ORDER BY date DESC LIMIT 10').all(req.tenantId,_cl);
    const updates = D().prepare('SELECT category, notes FROM daily_updates WHERE child_id=? AND tenant_id=? ORDER BY created_at DESC LIMIT 30').all(req.params.id, req.tenantId);
    const contextText = [
      `Child: ${child.first_name} ${child.last_name}, DOB: ${child.dob}`,
      stories.length ? `Recent stories: ${stories.slice(0,3).map(s=>s.content?.slice(0,80)).join('; ')}` : '',
      updates.length ? `Recent updates: ${updates.slice(0,5).map(u=>u.notes||'').filter(Boolean).join('; ')}` : '',
    ].filter(Boolean).join('\n');
    // Try AI call
    let provider = null;
    try { provider = D().prepare('SELECT * FROM ai_providers WHERE tenant_id=? AND enabled=1 AND api_key IS NOT NULL ORDER BY is_default DESC LIMIT 1').get(req.tenantId); } catch(e) {}
    let focusData = { strengths: [], next_steps: [], eylf_focus: [], summary: 'Based on available observations.' };
    if (provider) {
      try {
        // Direct SDK call — relative URLs don't work server-side
        try {
          const Anthropic = (await import('@anthropic-ai/sdk')).default;
          const client = new Anthropic({ apiKey: provider.api_key });
          const msg = await client.messages.create({
            model: getModel(req.tenantId, 'balanced'),
            max_tokens: 600,
            system: 'You are an early childhood educator. Return ONLY valid JSON. Keys: strengths (array, max 3), next_steps (array, max 3), eylf_focus (array of integers 1-5), summary (string). No markdown.',
            messages: [{ role: 'user', content: `Learning focus profile for:\n${contextText}` }],
          });
          const txt = msg.content?.[0]?.text || '';
          if (txt) { try { focusData = JSON.parse(txt.replace(/```json|```/g,'').trim()); } catch(pe) {} }
        } catch(ae) { console.error('[AI Focus] SDK error:', ae.message); }
      } catch{}
    }
    const id = uuid();
    D().prepare(`INSERT OR REPLACE INTO child_focus_profiles (id,child_id,tenant_id,focus_data,generated_at) VALUES(?,?,?,?,datetime('now'))`).run(id, req.params.id, req.tenantId, JSON.stringify(focusData));
    res.json({ focus: focusData, generated_at: new Date().toISOString() });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// PUT /:id/medical-plans/:pid
router.put('/:id/medical-plans/:pid', requireAuth, requireTenant, (req, res) => {
  try {
    const b = req.body;
    D().prepare("UPDATE medical_plans SET condition_name=COALESCE(?,condition_name), severity=COALESCE(?,severity), triggers=COALESCE(?,triggers), symptoms=COALESCE(?,symptoms), action_steps=COALESCE(?,action_steps), doctor_name=COALESCE(?,doctor_name), doctor_phone=COALESCE(?,doctor_phone), review_date=COALESCE(?,review_date), expiry_date=COALESCE(?,expiry_date), extended_notes=COALESCE(?,extended_notes), notes=COALESCE(?,notes), document_url=COALESCE(?,document_url), updated_at=datetime('now') WHERE id=? AND child_id=? AND tenant_id=?")
      .run(b.condition_name||null, b.severity||null, b.triggers||null, b.symptoms||null, b.action_steps||null, b.doctor_name||null, b.doctor_phone||null, b.review_date||null, b.expiry_date||null, b.extended_notes||null, b.notes||null, b.document_url||null, req.params.pid, req.params.id, req.tenantId);
    const row = D().prepare('SELECT * FROM medical_plans WHERE id=? AND tenant_id=?').get(req.params.pid, req.tenantId);
    res.json(row || { ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /:id/upload
router.post('/:id/upload', requireAuth, requireTenant, async (req, res) => {
  try {
    const { default: busboy } = await import('busboy');
    const { randomUUID } = await import('crypto');
    const { default: pathMod } = await import('path');
    const { default: fsMod } = await import('fs');
    const bb = busboy({ headers: req.headers, limits: { fileSize: 10 * 1024 * 1024 } });
    let savedUrl = null;
    let pending = 0;
    let bbDone = false;
    const tryRespond = () => {
      if (bbDone && pending === 0) {
        if (savedUrl) res.json({ url: savedUrl, ok: true });
        else res.status(400).json({ error: 'No file received' });
      }
    };
    bb.on('file', (name, file, info) => {
      pending++;
      const ext = pathMod.extname(info.filename || '.pdf').toLowerCase() || '.pdf';
      const fname = 'child_' + req.params.id + '_' + randomUUID() + ext;
      const uploadsDir = process.env.DATA_DIR
        ? pathMod.join(process.env.DATA_DIR, 'uploads')
        : pathMod.join(process.cwd(), 'uploads');
      fsMod.mkdirSync(uploadsDir, { recursive: true });
      const stream = fsMod.createWriteStream(pathMod.join(uploadsDir, fname));
      file.pipe(stream);
      stream.on('finish', () => { savedUrl = '/uploads/' + fname; pending--; tryRespond(); });
      stream.on('error', () => { pending--; tryRespond(); });
    });
    bb.on('finish', () => { bbDone = true; tryRespond(); });
    bb.on('error', (e) => res.status(500).json({ error: e.message }));
    req.pipe(bb);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /:id/ccs
router.get('/:id/ccs', (req, res) => {
  try {
    const row = D().prepare('SELECT * FROM ccs_details WHERE child_id=? AND tenant_id=?').get(req.params.id, req.tenantId);
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
  try { res.json(D().prepare('SELECT * FROM medical_plans WHERE child_id=? AND tenant_id=? ORDER BY created_at DESC').all(req.params.id, req.tenantId)); }
  catch { res.json([]); }
});
// GET /:id/medications (standalone)
router.get('/:id/medications', (req, res) => {
  try { res.json(D().prepare("SELECT * FROM medications WHERE child_id=? AND status='active' AND tenant_id=?").all(req.params.id, req.tenantId)); }
  catch { res.json([]); }
});
// GET /:id/immunisations (standalone)
router.get('/:id/immunisations', (req, res) => {
  try { res.json(D().prepare('SELECT * FROM immunisation_records WHERE child_id=? AND tenant_id=? ORDER BY date_given DESC').all(req.params.id, req.tenantId)); }
  catch { res.json([]); }
});
// PUT /:id/immunisations/:rid
router.put('/:id/immunisations/:rid', requireAuth, requireTenant, (req, res) => {
  try {
    const b = req.body;
    D().prepare('UPDATE immunisation_records SET vaccine_name=COALESCE(?,vaccine_name), date_given=COALESCE(?,date_given), given_date=COALESCE(?,given_date), batch_number=COALESCE(?,batch_number), provider=COALESCE(?,provider), status=COALESCE(?,status) WHERE id=? AND child_id=? AND tenant_id=?')
      .run(b.vaccine_name||null, b.date_given||null, b.given_date||null, b.batch_number||null, b.provider||null, b.status||null, req.params.rid, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /:id/immunisations/:rid
router.delete('/:id/immunisations/:rid', requireAuth, requireTenant, (req, res) => {
  try {
    D().prepare('DELETE FROM immunisation_records WHERE id=? AND child_id=? AND tenant_id=?').run(req.params.rid, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /:id/equipment/:eid
router.put('/:id/equipment/:eid', requireAuth, requireTenant, (req, res) => {
  try {
    const { name, location, expiry_date, notes, category, description, quantity, batch_number, supplier } = req.body;
    D().prepare("UPDATE equipment_register SET name=COALESCE(?,name), location=COALESCE(?,location), expiry_date=COALESCE(?,expiry_date), notes=COALESCE(?,notes), updated_at=datetime('now') WHERE id=? AND child_id=? AND tenant_id=?")
      .run(name||null, location||null, expiry_date||null, notes||null, req.params.eid, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /:id/equipment/:eid
router.delete('/:id/equipment/:eid', requireAuth, requireTenant, (req, res) => {
  try {
    D().prepare('DELETE FROM equipment_register WHERE id=? AND child_id=? AND tenant_id=?').run(req.params.eid, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /:id/parental-requests (standalone)
router.get('/:id/parental-requests', (req, res) => {
  try { res.json(D().prepare("SELECT * FROM parental_requests WHERE child_id=? AND status='active' AND tenant_id=?").all(req.params.id, req.tenantId)); }
  catch { res.json([]); }
});
// GET /:id/invoices (standalone)
router.get('/:id/invoices', (req, res) => {
  try {
    const rows = D().prepare('SELECT * FROM invoices WHERE child_id=? AND tenant_id=? ORDER BY period_start DESC LIMIT 24').all(req.params.id, req.tenantId);
    res.json(rows.map(r=>({...r, sessions: tryQuery(()=>JSON.parse(r.sessions||'[]'))})));
  } catch { res.json([]); }
});
// DELETE /:id/permissions/:pid
router.delete('/:id/permissions/:pid', requireAuth, requireTenant, (req, res) => {
  try {
    D().prepare('UPDATE child_permissions SET granted=0 WHERE id=? AND child_id=? AND tenant_id=?').run(req.params.pid, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── MISSING ENDPOINTS v1.9.5 ─────────────────────────────────────────────────

// GET /:id/dietary
router.get('/:id/dietary', (req, res) => {
  const rows = tryQuery(() => D().prepare('SELECT * FROM child_dietary WHERE child_id=? AND tenant_id=? ORDER BY severity DESC').all(req.params.id, req.tenantId));
  res.json(rows);
});

// GET /:id/permissions
router.get('/:id/permissions', (req, res) => {
  const rows = tryQuery(() => D().prepare('SELECT * FROM child_permissions WHERE child_id=? AND tenant_id=?').all(req.params.id, req.tenantId));
  res.json(rows);
});

// PUT /:id/permissions/:pid — toggle granted
router.put('/:id/permissions/:pid', requireAuth, requireTenant, (req, res) => {
  try {
    const { granted } = req.body;
    D().prepare("UPDATE child_permissions SET granted=?, granted_by=?, granted_at=datetime('now') WHERE id=? AND child_id=? AND tenant_id=?")
      .run(granted ? 1 : 0, req.userId, req.params.pid, req.params.id, req.tenantId);
    const row = D().prepare('SELECT * FROM child_permissions WHERE id=? AND tenant_id=?').get(req.params.pid, req.tenantId);
    res.json(row || { success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /:id/medications
router.post('/:id/medications', requireAuth, requireTenant, (req, res) => {
  try {
    const { name, dose: _df, dosage: _dag, frequency, location, expiry_date, instructions, active } = req.body; const dose = _df || _dag || null;
    const id = uuid();
    D().prepare('INSERT INTO medications (id,child_id,tenant_id,name,dosage,dose,frequency,location,expiry_date,instructions,administration_plan,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, req.params.id, req.tenantId, name, dose, dose, frequency||null, location||null, expiry_date||null, instructions||null, instructions||null, 'active');
    res.json({ id, name, dose, dosage: dose, frequency, location, expiry_date, instructions, active: 1 });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /:id/immunisations
router.post('/:id/immunisations', requireAuth, requireTenant, (req, res) => {
  try {
    const { vaccine_name, given, given_date, dateGiven, date_given, due_date, dueDate, batch_number, batchNumber, provider, notes } = req.body;
    const _gd = given_date || dateGiven || date_given || null;
    const _dd = due_date || dueDate || null;
    const _bn = batch_number || batchNumber || null;
    const id = uuid();
    D().prepare('INSERT INTO immunisation_records (id,child_id,tenant_id,vaccine_name,date_given,given_date,next_due_date,due_date,batch_number,provider,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, req.params.id, req.tenantId, vaccine_name, _gd, _gd, _dd, _dd, _bn, provider||null, 'current');
    res.json({ id, vaccine_name, date_given: _gd, given_date: _gd, due_date: _dd, batch_number: _bn, provider });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /:id/medical-plans
router.post('/:id/medical-plans', requireAuth, requireTenant, (req, res) => {
  try {
    const { plan_type, condition_name, severity, triggers, symptoms, action_steps, doctor_name, doctor_phone, review_date, expiry_date, extended_notes, notes, document_url } = req.body;
    const id = uuid();
    tryQuery(() => D().prepare('CREATE TABLE IF NOT EXISTS medical_plans (id TEXT PRIMARY KEY, child_id TEXT, tenant_id TEXT, plan_type TEXT, expiry_date TEXT, notes TEXT, document_url TEXT, status TEXT DEFAULT "current", created_at TEXT DEFAULT (datetime("now")))').run());
    // Upsert — replace existing plan of same type
    tryQuery(() => D().prepare('DELETE FROM medical_plans WHERE child_id=? AND plan_type=?').run(req.params.id, plan_type));
    D().prepare('INSERT INTO medical_plans (id,child_id,tenant_id,plan_type,condition_name,severity,triggers,symptoms,action_steps,doctor_name,doctor_phone,review_date,expiry_date,extended_notes,notes,document_url,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, req.params.id, req.tenantId, plan_type||'general',
        condition_name||plan_type||'General Plan', severity||null, triggers||null,
        symptoms||null, action_steps||null, doctor_name||null, doctor_phone||null,
        review_date||null, expiry_date||null, extended_notes||null, notes||null,
        document_url||null, 'current');
    res.json({ id, plan_type, condition_name, expiry_date, notes, document_url, status: 'current' });
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

// ── Child Leave / Planned Absences ──────────────────────────────────────────
let _leaveTableReady = false;
function ensureLeaveTable() {
  if (_leaveTableReady) return;
  try { D().exec(`CREATE TABLE IF NOT EXISTS child_leave (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, child_id TEXT NOT NULL,
    start_date TEXT NOT NULL, end_date TEXT NOT NULL,
    reason TEXT DEFAULT 'other', notes TEXT,
    logged_by TEXT, logged_by_user_id TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  )`); } catch(e) {}
  try { D().exec('CREATE INDEX IF NOT EXISTS idx_child_leave_lookup ON child_leave(tenant_id, child_id, start_date)'); } catch(e) {}
  _leaveTableReady = true;
}

// GET upcoming leave across all children (must be before /:id routes)
router.get('/leave/upcoming', (req, res) => {
  try {
    ensureLeaveTable();
    const days = parseInt(req.query.days) || 14;
    const sql = "SELECT cl.*, c.first_name || ' ' || c.last_name as child_name, c.room_id, r.name as room_name FROM child_leave cl JOIN children c ON c.id=cl.child_id LEFT JOIN rooms r ON r.id=c.room_id WHERE cl.tenant_id=? AND cl.status='active' AND cl.end_date>=date('now') AND cl.start_date<=date('now','+" + days + " days') ORDER BY cl.start_date ASC";
    const leave = D().prepare(sql).all(req.tenantId);
    res.json({ leave });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET leave for a specific child
router.get('/:id/leave', (req, res) => {
  try {
    ensureLeaveTable();
    const leave = D().prepare(
      "SELECT cl.*, u.name as logged_by_name FROM child_leave cl LEFT JOIN users u ON u.id=cl.logged_by_user_id WHERE cl.tenant_id=? AND cl.child_id=? AND cl.status='active' ORDER BY cl.start_date DESC"
    ).all(req.tenantId, req.params.id);
    res.json({ leave });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST log leave for a child
router.post('/:id/leave', (req, res) => {
  try {
    ensureLeaveTable();
    const { start_date, end_date, reason, notes } = req.body;
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date required' });
    if (end_date < start_date) return res.status(400).json({ error: 'end_date must be >= start_date' });
    const id = uuid();
    D().prepare("INSERT INTO child_leave (id,tenant_id,child_id,start_date,end_date,reason,notes,logged_by,logged_by_user_id,status) VALUES(?,?,?,?,?,?,?,'staff',?,'active')")
      .run(id, req.tenantId, req.params.id, start_date, end_date, reason || 'other', notes || null, req.userId);
    // Mark attendance_sessions as absent for each weekday in range
    try {
      for (let d = new Date(start_date + 'T12:00:00'); d <= new Date(end_date + 'T12:00:00'); d.setDate(d.getDate() + 1)) {
        if (d.getDay() === 0 || d.getDay() === 6) continue;
        const ds = d.toISOString().split('T')[0];
        const existing = D().prepare('SELECT id FROM attendance_sessions WHERE child_id=? AND date=? AND tenant_id=?').get(req.params.id, ds, req.tenantId);
        if (existing) {
          D().prepare('UPDATE attendance_sessions SET absent=1, absent_reason=? WHERE id=?').run(reason || 'planned leave', existing.id);
        } else {
          D().prepare('INSERT INTO attendance_sessions (id,tenant_id,child_id,date,absent,absent_reason) VALUES(?,?,?,?,1,?)').run(uuid(), req.tenantId, req.params.id, ds, reason || 'planned leave');
        }
      }
    } catch(e2) { /* non-blocking */ }
    res.json({ ok: true, id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE (cancel) leave
router.delete('/:id/leave/:leaveId', (req, res) => {
  try {
    ensureLeaveTable();
    D().prepare("UPDATE child_leave SET status='cancelled', updated_at=datetime('now') WHERE id=? AND tenant_id=? AND child_id=?")
      .run(req.params.leaveId, req.tenantId, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default router;
