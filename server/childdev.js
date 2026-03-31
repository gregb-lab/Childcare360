/**
 * server/childdev.js — v2.11.0
 * Child development & nutrition:
 *   /api/childdev/menus         — weekly menu planning + allergen tracking
 *   /api/childdev/dietary       — per-child dietary requirements
 *   /api/childdev/milestones    — developmental milestone tracking
 *   /api/childdev/transitions   — school readiness / transition reports
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

// ─────────────────────────────────────────────────────────────────────────────
// DEVELOPMENTAL MILESTONES REFERENCE DATA
// Based on EYLF + Australian developmental guidelines
// ─────────────────────────────────────────────────────────────────────────────
const MILESTONE_FRAMEWORK = {
  communication: {
    label: 'Communication & Language',
    icon: '💬',
    milestones: [
      { key: 'babbles',          label: 'Babbles and makes sounds',           age: 6 },
      { key: 'first_words',      label: 'Says first words (mama/dada)',        age: 12 },
      { key: 'words_20',         label: 'Uses 20+ words',                      age: 18 },
      { key: 'two_word',         label: 'Combines two words',                  age: 24 },
      { key: 'sentences_3',      label: 'Uses 3-word sentences',               age: 30 },
      { key: 'stories_simple',   label: 'Tells simple stories',                age: 36 },
      { key: 'rhymes',           label: 'Enjoys rhymes and songs',             age: 42 },
      { key: 'questions_why',    label: 'Asks why/how questions',              age: 48 },
      { key: 'complex_sentences',label: 'Uses complex sentences',              age: 54 },
      { key: 'reads_name',       label: 'Recognises own name in writing',      age: 60 },
    ]
  },
  social_emotional: {
    label: 'Social & Emotional',
    icon: '❤️',
    milestones: [
      { key: 'stranger_anxiety',  label: 'Shows stranger anxiety',            age: 9 },
      { key: 'parallel_play',     label: 'Plays alongside other children',    age: 18 },
      { key: 'empathy_basic',     label: 'Shows basic empathy',               age: 24 },
      { key: 'turn_taking',       label: 'Takes turns in play',               age: 30 },
      { key: 'cooperative_play',  label: 'Engages in cooperative play',       age: 36 },
      { key: 'emotion_labels',    label: 'Labels own emotions',               age: 42 },
      { key: 'conflict_resolve',  label: 'Begins resolving conflicts',        age: 48 },
      { key: 'friendships',       label: 'Forms consistent friendships',      age: 54 },
      { key: 'school_readiness',  label: 'Ready for school transitions',      age: 60 },
    ]
  },
  physical_gross: {
    label: 'Gross Motor',
    icon: '🏃',
    milestones: [
      { key: 'sits_unassisted',   label: 'Sits without support',              age: 8 },
      { key: 'crawls',            label: 'Crawls',                            age: 9 },
      { key: 'pulls_to_stand',    label: 'Pulls to standing',                 age: 10 },
      { key: 'walks_unaided',     label: 'Walks independently',               age: 14 },
      { key: 'runs',              label: 'Runs steadily',                     age: 18 },
      { key: 'kicks_ball',        label: 'Kicks a ball',                      age: 24 },
      { key: 'jumps_both_feet',   label: 'Jumps with both feet',              age: 30 },
      { key: 'climbs_stairs',     label: 'Climbs stairs alternating feet',    age: 36 },
      { key: 'hops_one_foot',     label: 'Hops on one foot',                  age: 48 },
      { key: 'skips',             label: 'Skips',                             age: 60 },
    ]
  },
  physical_fine: {
    label: 'Fine Motor',
    icon: '✏️',
    milestones: [
      { key: 'reaches_grasps',    label: 'Reaches and grasps objects',        age: 6 },
      { key: 'pincer_grasp',      label: 'Pincer grasp',                      age: 10 },
      { key: 'stacks_2',          label: 'Stacks 2 blocks',                   age: 15 },
      { key: 'scribbles',         label: 'Scribbles with crayon',             age: 18 },
      { key: 'turns_pages',       label: 'Turns book pages',                  age: 24 },
      { key: 'cuts_scissors',     label: 'Uses scissors with help',           age: 36 },
      { key: 'draws_circle',      label: 'Draws a circle',                    age: 36 },
      { key: 'writes_name',       label: 'Attempts to write own name',        age: 48 },
      { key: 'pencil_grip',       label: 'Holds pencil with correct grip',    age: 54 },
      { key: 'buttons_zips',      label: 'Buttons/zips independently',        age: 60 },
    ]
  },
  cognitive: {
    label: 'Cognitive & Problem Solving',
    icon: '🧠',
    milestones: [
      { key: 'object_permanence',  label: 'Object permanence',               age: 10 },
      { key: 'cause_effect',       label: 'Understands cause and effect',     age: 12 },
      { key: 'pretend_play',       label: 'Engages in pretend play',          age: 18 },
      { key: 'shapes_colours',     label: 'Names basic shapes & colours',     age: 30 },
      { key: 'counts_to_5',        label: 'Counts to 5',                      age: 36 },
      { key: 'sorting',            label: 'Sorts objects by type',            age: 36 },
      { key: 'alphabet_knows',     label: 'Recognises letters of alphabet',   age: 48 },
      { key: 'counts_to_20',       label: 'Counts to 20',                     age: 54 },
      { key: 'reads_sight_words',  label: 'Reads simple sight words',         age: 60 },
      { key: 'writes_numbers',     label: 'Writes numbers 1–10',              age: 60 },
    ]
  },
  self_care: {
    label: 'Self-Care & Independence',
    icon: '🧼',
    milestones: [
      { key: 'drinks_cup',         label: 'Drinks from cup independently',    age: 18 },
      { key: 'spoon_fork',         label: 'Uses spoon/fork',                  age: 24 },
      { key: 'toilet_training',    label: 'Toilet training achieved',         age: 36 },
      { key: 'washes_hands',       label: 'Washes hands independently',       age: 36 },
      { key: 'dresses_partially',  label: 'Partly dresses self',              age: 36 },
      { key: 'dresses_fully',      label: 'Dresses fully independently',      age: 54 },
      { key: 'manages_lunchbox',   label: 'Manages own lunchbox',             age: 60 },
    ]
  }
};

r.get('/milestones/framework', (req, res) => {
  res.json({ framework: MILESTONE_FRAMEWORK });
});

// ─────────────────────────────────────────────────────────────────────────────
// MENU PLANNING
// ─────────────────────────────────────────────────────────────────────────────

r.get('/menus', (req, res) => {
  try {
    const { from, to } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const fromDate = from || new Date(Date.now() - 4 * 7 * 86400000).toISOString().split('T')[0];
    const toDate   = to   || new Date(Date.now() + 8 * 7 * 86400000).toISOString().split('T')[0];

    const plans = D().prepare('
      SELECT mp.*,
        COUNT(mi.id) as item_count
      FROM menu_plans mp
      LEFT JOIN menu_items mi ON mi.menu_plan_id=mp.id
      WHERE mp.tenant_id=? AND mp.week_starting BETWEEN ? AND ?
      GROUP BY mp.id
      ORDER BY mp.week_starting DESC
    ').all(req.tenantId, fromDate, toDate);

    res.json({ plans });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.get('/menus/:weekStarting', (req, res) => {
  try {
    const plan = D().prepare(
      'SELECT * FROM menu_plans WHERE tenant_id=? AND week_starting=?'
    ).get(req.tenantId, req.params.weekStarting);

    if (!plan) {
      // Return empty structure for the week
      return res.json({ plan: null, items: [], week_starting: req.params.weekStarting });
    }

    const items = D().prepare(
      'SELECT * FROM menu_items WHERE menu_plan_id=? ORDER BY day_of_week, meal_type'
    ).all(plan.id);

    res.json({
      plan,
      items: items.map(i => ({ ...i, allergens: JSON.parse(i.allergens || '[]') })),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/menus/:weekStarting', (req, res) => {
  try {
    const { plan_name, items = [] } = req.body;

    // Upsert plan
    const existing = D().prepare(
      'SELECT id FROM menu_plans WHERE tenant_id=? AND week_starting=?'
    ).get(req.tenantId, req.params.weekStarting);

    const planId = existing?.id || uuid();
    if (existing) {
      D().prepare('UPDATE menu_plans SET plan_name=COALESCE(?,plan_name), updated_at=datetime(\'now\') WHERE id=?')
        .run(plan_name||null, planId);
    } else {
      D().prepare('
        INSERT INTO menu_plans (id,tenant_id,week_starting,plan_name,status)
        VALUES (?,?,?,?,\'draft\')
      ').run(planId, req.tenantId, req.params.weekStarting, plan_name || 'Weekly Menu');
    }

    // Replace all items for this plan
    D().prepare('DELETE FROM menu_items WHERE menu_plan_id=?').run(planId);

    const insertItem = D().prepare('
      INSERT INTO menu_items
        (id,tenant_id,menu_plan_id,day_of_week,meal_type,description,allergens,is_vegetarian,is_halal,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    ');
    D().transaction(() => {
      for (const item of items) {
        insertItem.run(
          uuid(), req.tenantId, planId,
          item.day_of_week, item.meal_type, item.description,
          JSON.stringify(item.allergens || []),
          item.is_vegetarian ? 1 : 0,
          item.is_halal ? 1 : 0,
          item.notes || null
        );
      }
    })();

    res.json({ id: planId, ok: true, items_saved: items.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/menus/:weekStarting/approve', (req, res) => {
  try {
    const { approved_by } = req.body;
    D().prepare('
      UPDATE menu_plans SET status=\'approved\', approved_by=?, approved_at=datetime(\'now\')
      WHERE tenant_id=? AND week_starting=?
    ').run(approved_by || req.userId, req.tenantId, req.params.weekStarting);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Copy last week's menu to this week
r.post('/menus/:weekStarting/copy-from/:sourceWeek', (req, res) => {
  try {
    const source = D().prepare(
      'SELECT * FROM menu_plans WHERE tenant_id=? AND week_starting=?'
    ).get(req.tenantId, req.params.sourceWeek);
    if (!source) return res.status(404).json({ error: 'Source week not found' });

    const sourceItems = D().prepare(
      'SELECT * FROM menu_items WHERE menu_plan_id=?'
    ).all(source.id);

    const newId = uuid();
    D().prepare('
      INSERT OR REPLACE INTO menu_plans (id,tenant_id,week_starting,plan_name,status,created_by)
      VALUES (?,?,?,?,\'draft\',?)
    ').run(newId, req.tenantId, req.params.weekStarting, source.plan_name, req.userId);

    D().prepare('DELETE FROM menu_items WHERE menu_plan_id IN (SELECT id FROM menu_plans WHERE tenant_id=? AND week_starting=?)')
      .run(req.tenantId, req.params.weekStarting);

    const ins = D().prepare('
      INSERT INTO menu_items (id,tenant_id,menu_plan_id,day_of_week,meal_type,description,allergens,is_vegetarian,is_halal,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    ');
    D().transaction(() => {
      for (const item of sourceItems) {
        ins.run(uuid(), req.tenantId, newId, item.day_of_week, item.meal_type,
                item.description, item.allergens, item.is_vegetarian, item.is_halal, item.notes);
      }
    })();

    res.json({ ok: true, id: newId, items_copied: sourceItems.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Allergen alert: children attending this week with dietary requirements
r.get('/menus/:weekStarting/allergen-check', (req, res) => {
  try {
    const plan = D().prepare(
      'SELECT id FROM menu_plans WHERE tenant_id=? AND week_starting=?'
    ).get(req.tenantId, req.params.weekStarting);
    if (!plan) return res.json({ alerts: [] });

    const items = D().prepare(
      'SELECT * FROM menu_items WHERE menu_plan_id=?'
    ).all(plan.id);

    const menuAllergens = new Set(
      items.flatMap(i => JSON.parse(i.allergens || '[]'))
    );

    const childRequirements = D().prepare('
      SELECT dr.*, c.first_name, c.last_name, c.room_id, r.name as room_name
      FROM dietary_requirements dr
      JOIN children c ON c.id=dr.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE dr.tenant_id=? AND c.active=1
    ').all(req.tenantId);

    const alerts = childRequirements.filter(req => {
      const childAllergens = JSON.parse(req.allergens || '[]');
      return childAllergens.some(a => menuAllergens.has(a));
    }).map(req => ({
      child_name: `${req.first_name} ${req.last_name}`,
      room: req.room_name,
      requirement: req.requirement_type,
      description: req.description,
      severity: req.severity,
      conflicting_allergens: JSON.parse(req.allergens || '[]').filter(a => menuAllergens.has(a)),
      action_plan: req.action_plan,
    }));

    res.json({ alerts, menu_allergens: [...menuAllergens] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Dietary requirements ──────────────────────────────────────────────────────
r.get('/dietary', (req, res) => {
  try {
    const rows = D().prepare('
      SELECT dr.*, c.first_name, c.last_name, c.room_id, r.name as room_name
      FROM dietary_requirements dr
      JOIN children c ON c.id=dr.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE dr.tenant_id=?
      ORDER BY dr.severity DESC, c.last_name
    ').all(req.tenantId);
    res.json({ requirements: rows.map(r => ({ ...r, allergens: JSON.parse(r.allergens || '[]') })) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/dietary', (req, res) => {
  try {
    const { child_id, requirement_type, description, severity, allergens, action_plan, medical_cert_url, review_date } = req.body;
    if (!child_id || !requirement_type) return res.status(400).json({ error: 'child_id and requirement_type required' });
    const id = uuid();
    D().prepare('
      INSERT INTO dietary_requirements
        (id,tenant_id,child_id,requirement_type,description,severity,allergens,action_plan,medical_cert_url,review_date)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    ').run(id, req.tenantId, child_id, requirement_type, description||null, severity||'intolerance',
           JSON.stringify(allergens||[]), action_plan||null, medical_cert_url||null, review_date||null);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.delete('/dietary/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM dietary_requirements WHERE id=? AND tenant_id=?')
      .run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// DEVELOPMENTAL MILESTONES
// ─────────────────────────────────────────────────────────────────────────────

r.get('/milestones/:childId', (req, res) => {
  try {
    const child = D().prepare(
      'SELECT id, first_name, last_name, dob FROM children WHERE id=? AND tenant_id=?'
    ).get(req.params.childId, req.tenantId);
    if (!child) return res.status(404).json({ error: 'Child not found' });

    const ageMonths = child.dob
      ? Math.floor((Date.now() - new Date(child.dob)) / (1000 * 60 * 60 * 24 * 30.44))
      : 0;

    const achieved = D().prepare(
      'SELECT * FROM milestone_records WHERE child_id=? ORDER BY domain, achieved_date'
    ).all(req.params.childId);

    const achievedMap = {};
    achieved.forEach(a => { achievedMap[a.milestone_key] = a; });

    // Enrich framework with achievement status
    const enriched = {};
    for (const [domain, data] of Object.entries(MILESTONE_FRAMEWORK)) {
      enriched[domain] = {
        ...data,
        milestones: data.milestones.map(m => ({
          ...m,
          achieved: achievedMap[m.key]?.achieved === 1,
          achieved_date: achievedMap[m.key]?.achieved_date,
          notes: achievedMap[m.key]?.notes,
          overdue: !achievedMap[m.key]?.achieved && ageMonths > m.age + 6,
          upcoming: !achievedMap[m.key]?.achieved && ageMonths >= m.age - 3 && ageMonths <= m.age + 6,
        }))
      };
    }

    const stats = {
      age_months: ageMonths,
      total: Object.values(MILESTONE_FRAMEWORK).reduce((s,d) => s + d.milestones.length, 0),
      achieved: achieved.filter(a => a.achieved).length,
      overdue: 0,
    };
    Object.values(enriched).forEach(d => {
      d.milestones.forEach(m => { if (m.overdue) stats.overdue++; });
    });

    res.json({ child, framework: enriched, stats });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/milestones/:childId', (req, res) => {
  try {
    const { milestone_key, domain, milestone_label, age_months_expected, achieved, notes, observation_id, recorded_by } = req.body;
    if (!milestone_key) return res.status(400).json({ error: 'milestone_key required' });

    const achievedDate = achieved ? new Date().toISOString().split('T')[0] : null;

    D().prepare('
      INSERT INTO milestone_records
        (id,tenant_id,child_id,domain,milestone_key,milestone_label,age_months_expected,
         achieved,achieved_date,notes,observation_id,recorded_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(child_id,milestone_key) DO UPDATE SET
        achieved=excluded.achieved,
        achieved_date=CASE WHEN excluded.achieved=1 AND achieved_date IS NULL THEN excluded.achieved_date ELSE achieved_date END,
        notes=COALESCE(excluded.notes,notes),
        observation_id=COALESCE(excluded.observation_id,observation_id)
    ').run(uuid(), req.tenantId, req.params.childId, domain||'other',
           milestone_key, milestone_label||milestone_key,
           age_months_expected||null, achieved?1:0, achievedDate,
           notes||null, observation_id||null, recorded_by||null);

    res.json({ ok: true, achieved_date: achievedDate });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Batch update milestones (for bulk achievement recording)
r.post('/milestones/:childId/batch', (req, res) => {
  try {
    const { achievements = [] } = req.body; // [{milestone_key, domain, milestone_label, age_months_expected, achieved}]
    const today = new Date().toISOString().split('T')[0];

    const upsert = D().prepare('
      INSERT INTO milestone_records
        (id,tenant_id,child_id,domain,milestone_key,milestone_label,age_months_expected,achieved,achieved_date)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(child_id,milestone_key) DO UPDATE SET
        achieved=excluded.achieved,
        achieved_date=CASE WHEN excluded.achieved=1 AND achieved_date IS NULL THEN excluded.achieved_date ELSE achieved_date END
    ');

    D().transaction(() => {
      for (const a of achievements) {
        upsert.run(uuid(), req.tenantId, req.params.childId,
                   a.domain, a.milestone_key, a.milestone_label||a.milestone_key,
                   a.age_months_expected||null, a.achieved?1:0,
                   a.achieved ? today : null);
      }
    })();

    res.json({ ok: true, updated: achievements.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Summary across all children — which milestones are commonly delayed
r.get('/milestones/summary/centre', (req, res) => {
  try {
    const summary = D().prepare('
      SELECT
        domain, milestone_key, milestone_label, age_months_expected,
        COUNT(*) as total_children,
        SUM(achieved) as achieved_count,
        ROUND(SUM(achieved) * 100.0 / COUNT(*), 1) as achievement_rate
      FROM milestone_records
      WHERE tenant_id=?
      GROUP BY milestone_key
      ORDER BY achievement_rate ASC
    ').all(req.tenantId);

    res.json({ summary });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSITION REPORTS
// ─────────────────────────────────────────────────────────────────────────────

r.get('/transitions', (req, res) => {
  try {
    const { status } = req.query;
    const where = ['tr.tenant_id=?'];
    const vals  = [req.tenantId];
    if (status) { where.push('tr.status=?'); vals.push(status); }

    const reports = D().prepare(`
      SELECT tr.*, c.first_name, c.last_name, c.dob, c.room_id, r.name as room_name
      FROM transition_reports tr
      JOIN children c ON c.id=tr.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE ${where.join(' AND ')}
      ORDER BY tr.transition_date, c.last_name
    `).all(...vals);

    res.json({ reports: reports.map(r => ({ ...r, eylf_outcomes: JSON.parse(r.eylf_outcomes||'{}') })) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.get('/transitions/:id', (req, res) => {
  try {
    const report = D().prepare('
      SELECT tr.*, c.first_name, c.last_name, c.dob
      FROM transition_reports tr
      JOIN children c ON c.id=tr.child_id
      WHERE tr.id=? AND tr.tenant_id=?
    ').get(req.params.id, req.tenantId);
    if (!report) return res.status(404).json({ error: 'Not found' });

    // Get milestone data for this child
    const milestones = D().prepare(
      'SELECT domain, milestone_key, milestone_label, achieved, achieved_date FROM milestone_records WHERE child_id=? ORDER BY domain'
    ).all(report.child_id);

    res.json({ report: { ...report, eylf_outcomes: JSON.parse(report.eylf_outcomes||'{}') }, milestones });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/transitions', (req, res) => {
  try {
    const { child_id, report_type, transition_date, target_school, prepared_by } = req.body;
    if (!child_id) return res.status(400).json({ error: 'child_id required' });

    const id = uuid();
    D().prepare('
      INSERT INTO transition_reports
        (id,tenant_id,child_id,report_type,report_date,transition_date,target_school,status,prepared_by)
      VALUES (?,?,?,?,date(\'now\',\'localtime\'),?,?,?,?)
    ').run(id, req.tenantId, child_id, report_type||'school_readiness',
           transition_date||null, target_school||null, 'draft', prepared_by||null);

    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/transitions/:id', (req, res) => {
  try {
    const fields = ['communication','literacy','numeracy','social_emotional',
                    'physical_development','independence','interests','learning_style',
                    'strengths','areas_for_support','recommendations','educator_notes',
                    'family_input','target_school','transition_date','status',
                    'shared_with_family','shared_with_school','reviewed_by','eylf_outcomes'];

    const updates = ["updated_at=datetime('now')"];
    const vals    = [];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f}=?`);
        vals.push(f === 'eylf_outcomes' ? JSON.stringify(req.body[f]) : req.body[f]);
      }
    }

    D().prepare((() => { const _s = 'UPDATE transition_reports SET ' + updates.join(',') + ' WHERE id=? AND tenant_id=?'; return _s; })())
      .run(...vals, req.params.id, req.tenantId);

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Auto-draft from observations + milestones
r.post('/transitions/:id/auto-draft', (req, res) => {
  try {
    const report = D().prepare('SELECT * FROM transition_reports WHERE id=? AND tenant_id=?')
      .get(req.params.id, req.tenantId);
    if (!report) return res.status(404).json({ error: 'Not found' });

    const milestones = D().prepare(
      "SELECT domain, milestone_label FROM milestone_records WHERE child_id=? AND achieved=1 ORDER BY domain"
    ).all(report.child_id);

    const observations = D().prepare(
      `SELECT notes, category, eylf_links FROM observations WHERE child_id=? AND tenant_id=? ORDER BY created_at DESC LIMIT 10`
    ).all(report.child_id, req.tenantId);

    // Build draft sections from data
    const byDomain = {};
    milestones.forEach(m => {
      (byDomain[m.domain] = byDomain[m.domain] || []).push(m.milestone_label);
    });

    const communication = byDomain.communication?.join(', ') || 'Assessment pending';
    const physical = `Gross motor: ${byDomain.physical_gross?.join(', ') || 'ongoing'}\nFine motor: ${byDomain.physical_fine?.join(', ') || 'ongoing'}`;
    const social = byDomain.social_emotional?.join(', ') || 'Assessment pending';
    const selfCare = byDomain.self_care?.join(', ') || 'Assessment pending';
    const cognitive = byDomain.cognitive?.join(', ') || 'Assessment pending';

    const draftStrengths = milestones.filter(m => m.achieved).slice(0, 5)
      .map(m => m.milestone_label).join(', ') || 'To be completed by educator';

    const recentObs = observations.slice(0, 3).map(o => o.notes).filter(Boolean).join(' ') || '';

    D().prepare('
      UPDATE transition_reports SET
        communication=?, physical_development=?, social_emotional=?,
        independence=?, literacy=?, strengths=?, educator_notes=?,
        status=\'draft\', updated_at=datetime(\'now\')
      WHERE id=? AND tenant_id=?
    ').run(
      communication, physical, social, selfCare, cognitive,
      draftStrengths, recentObs ? `Based on observations: ${recentObs.slice(0, 500)}` : null,
      req.params.id, req.tenantId
    );

    res.json({ ok: true, drafted_sections: 7, milestone_count: milestones.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Children approaching school age (within 12 months)
r.get('/transitions/upcoming/school-age', (req, res) => {
  try {
    const upcoming = D().prepare('
      SELECT c.id, c.first_name, c.last_name, c.dob, c.room_id, r.name as room_name,
        CAST((julianday(date(\'now\')) - julianday(c.dob)) / 30.44 AS INTEGER) as age_months,
        CAST((julianday(date(c.dob,\'+5 years\')) - julianday(date(\'now\'))) / 30.44 AS INTEGER) as months_to_school,
        (SELECT id FROM transition_reports tr WHERE tr.child_id=c.id AND tr.tenant_id=c.tenant_id LIMIT 1) as has_report
      FROM children c
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE c.tenant_id=? AND c.active=1
        AND c.dob IS NOT NULL
        AND julianday(date(c.dob,\'+5 years\')) - julianday(date(\'now\')) BETWEEN 0 AND 365
      ORDER BY c.dob
    ').all(req.tenantId);

    res.json({ upcoming });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
