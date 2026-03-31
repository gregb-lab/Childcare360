/**
 * server/quality.js — v2.12.0
 * Quality & Engagement:
 *   /api/quality/qip          — Quality Improvement Plan (NQS 7 QAs)
 *   /api/quality/portfolio    — Educator professional portfolio
 *   /api/quality/surveys      — Parent feedback surveys + NPS
 *   /api/quality/prompts      — Documentation prompts / story starters
 *   /api/quality/alerts       — Smart centre-wide alert generation
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

// ─────────────────────────────────────────────────────────────────────────────
// NQS REFERENCE DATA
// ─────────────────────────────────────────────────────────────────────────────
const NQS_QUALITY_AREAS = {
  1: { title: 'Educational Program and Practice',   standards: ['1.1','1.2','1.3'] },
  2: { title: 'Children\'s Health and Safety',      standards: ['2.1','2.2','2.3'] },
  3: { title: 'Physical Environment',               standards: ['3.1','3.2','3.3'] },
  4: { title: 'Staffing Arrangements',              standards: ['4.1','4.2'] },
  5: { title: 'Relationships with Children',        standards: ['5.1','5.2'] },
  6: { title: 'Collaborative Partnerships',         standards: ['6.1','6.2','6.3'] },
  7: { title: 'Governance and Leadership',          standards: ['7.1','7.2'] },
};

const RATINGS = ['working_towards','meeting','exceeding'];
const RATING_ORDER = { working_towards: 0, meeting: 1, exceeding: 2 };

// ─────────────────────────────────────────────────────────────────────────────
// QIP — QUALITY IMPROVEMENT PLAN
// ─────────────────────────────────────────────────────────────────────────────

r.get('/qip', (req, res) => {
  try {
    // Self-assessment ratings per QA
    const assessments = D().prepare(`
      SELECT quality_area, standard, element, current_rating, evidence,
             improvement_notes, target_date, assessed_by, assessed_at
      FROM nqs_self_assessment WHERE tenant_id=?
      ORDER BY quality_area, standard
    `).all(req.tenantId);

    // Goals per QA
    const goals = D().prepare(`
      SELECT * FROM qip_goals WHERE tenant_id=?
      ORDER BY quality_area, created_at
    `).all(req.tenantId);

    // Overall rating summary per QA
    const summary = {};
    for (let qa = 1; qa <= 7; qa++) {
      const qaAssessments = assessments.filter(a => a.quality_area === qa);
      if (!qaAssessments.length) {
        summary[qa] = { rating: 'not_assessed', goals_count: 0, goals_in_progress: 0 };
        continue;
      }
      const ratings = qaAssessments.map(a => RATING_ORDER[a.current_rating] ?? 0);
      const minRating = Math.min(...ratings);
      const qaGoals = goals.filter(g => g.quality_area === qa);
      summary[qa] = {
        rating: RATINGS[minRating] || 'working_towards',
        goals_count: qaGoals.length,
        goals_in_progress: qaGoals.filter(g => g.status === 'in_progress').length,
        goals_completed: qaGoals.filter(g => g.status === 'completed').length,
      };
    }

    res.json({ assessments, goals, summary, nqs: NQS_QUALITY_AREAS });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Update / upsert a self-assessment for a standard/element
r.post('/qip/assessment', (req, res) => {
  try {
    const { quality_area, standard, element, current_rating, evidence,
            improvement_notes, target_date, assessed_by } = req.body;
    if (!quality_area || !standard) return res.status(400).json({ error: 'quality_area and standard required' });

    const existing = D().prepare(
      'SELECT id FROM nqs_self_assessment WHERE tenant_id=? AND quality_area=? AND standard=? AND element IS ?'
    ).get(req.tenantId, quality_area, standard, element || null);

    if (existing) {
      D().prepare(`
        UPDATE nqs_self_assessment SET
          current_rating=COALESCE(?,current_rating),
          evidence=COALESCE(?,evidence),
          improvement_notes=COALESCE(?,improvement_notes),
          target_date=COALESCE(?,target_date),
          assessed_by=COALESCE(?,assessed_by),
          assessed_at=datetime('now'), updated_at=datetime('now')
        WHERE id=?
      `).run(current_rating||null, evidence||null, improvement_notes||null,
             target_date||null, assessed_by||null, existing.id);
    } else {
      D().prepare(`
        INSERT INTO nqs_self_assessment
          (id,tenant_id,quality_area,standard,element,current_rating,evidence,improvement_notes,target_date,assessed_by)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(uuid(), req.tenantId, quality_area, standard, element||null,
             current_rating||'working_towards', evidence||null,
             improvement_notes||null, target_date||null, assessed_by||null);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// QIP Goals CRUD
r.post('/qip/goals', (req, res) => {
  try {
    const { quality_area, goal, actions, responsible, timeline } = req.body;
    if (!quality_area || !goal) return res.status(400).json({ error: 'quality_area and goal required' });
    const id = uuid();
    D().prepare(`
      INSERT INTO qip_goals (id,tenant_id,quality_area,goal,actions,responsible,timeline,status)
      VALUES (?,?,?,?,?,?,?,'not_started')
    `).run(id, req.tenantId, quality_area, goal, actions||null, responsible||null, timeline||null);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/qip/goals/:id', (req, res) => {
  try {
    const { goal, actions, responsible, timeline, status, progress } = req.body;
    D().prepare(`
      UPDATE qip_goals SET
        goal=COALESCE(?,goal), actions=COALESCE(?,actions),
        responsible=COALESCE(?,responsible), timeline=COALESCE(?,timeline),
        status=COALESCE(?,status), progress=COALESCE(?,progress),
        updated_at=datetime('now')
      WHERE id=? AND tenant_id=?
    `).run(goal||null, actions||null, responsible||null, timeline||null,
           status||null, progress!=null?progress:null,
           req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.delete('/qip/goals/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM qip_goals WHERE id=? AND tenant_id=?')
      .run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// QIP export summary (for A&R preparation)
r.get('/qip/export', (req, res) => {
  try {
    const assessments = D().prepare('SELECT * FROM nqs_self_assessment WHERE tenant_id=? ORDER BY quality_area,standard').all(req.tenantId);
    const goals = D().prepare('SELECT * FROM qip_goals WHERE tenant_id=? ORDER BY quality_area').all(req.tenantId);
    const tenant = D().prepare('SELECT name, nqs_rating FROM tenants WHERE id=?').get(req.tenantId);

    const qaData = {};
    for (let qa = 1; qa <= 7; qa++) {
      qaData[qa] = {
        quality_area: qa,
        title: NQS_QUALITY_AREAS[qa].title,
        assessments: assessments.filter(a => a.quality_area === qa),
        goals: goals.filter(g => g.quality_area === qa),
      };
    }

    res.json({ service: tenant, quality_areas: qaData, generated_at: new Date().toISOString() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// EDUCATOR PORTFOLIO
// ─────────────────────────────────────────────────────────────────────────────

r.get('/portfolio/:educatorId', (req, res) => {
  try {
    const entries = D().prepare(`
      SELECT ep.*, u.email as reviewer_email
      FROM educator_portfolio_entries ep
      LEFT JOIN users u ON u.id=ep.reviewer_id
      WHERE ep.educator_id=? AND ep.tenant_id=?
      ORDER BY ep.created_at DESC
    `).all(req.params.educatorId, req.tenantId);

    const stats = {
      total: entries.length,
      reflections: entries.filter(e => e.entry_type === 'reflection').length,
      evidence: entries.filter(e => e.entry_type === 'evidence').length,
      reviewed: entries.filter(e => e.reviewed_at).length,
    };

    // NQS coverage
    const nqsLinks = entries.flatMap(e => JSON.parse(e.nqs_links || '[]'));
    const nqsCoverage = {};
    nqsLinks.forEach(link => { nqsCoverage[link] = (nqsCoverage[link] || 0) + 1; });

    res.json({
      entries: entries.map(e => ({
        ...e,
        evidence_urls: JSON.parse(e.evidence_urls || '[]'),
        nqs_links: JSON.parse(e.nqs_links || '[]'),
        eylf_links: JSON.parse(e.eylf_links || '[]'),
        tags: JSON.parse(e.tags || '[]'),
      })),
      stats,
      nqs_coverage: nqsCoverage,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/portfolio', (req, res) => {
  try {
    const { educator_id, entry_type, title, body, evidence_urls,
            nqs_links, eylf_links, tags, visibility } = req.body;
    if (!educator_id || !title) return res.status(400).json({ error: 'educator_id and title required' });

    const id = uuid();
    D().prepare(`
      INSERT INTO educator_portfolio_entries
        (id,tenant_id,educator_id,entry_type,title,body,evidence_urls,nqs_links,eylf_links,tags,visibility)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, req.tenantId, educator_id, entry_type||'reflection', title, body||null,
           JSON.stringify(evidence_urls||[]), JSON.stringify(nqs_links||[]),
           JSON.stringify(eylf_links||[]), JSON.stringify(tags||[]), visibility||'private');

    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/portfolio/:id', (req, res) => {
  try {
    const { title, body, nqs_links, eylf_links, tags, reviewer_feedback, visibility } = req.body;
    D().prepare(`
      UPDATE educator_portfolio_entries SET
        title=COALESCE(?,title), body=COALESCE(?,body),
        nqs_links=COALESCE(?,nqs_links), eylf_links=COALESCE(?,eylf_links),
        tags=COALESCE(?,tags), visibility=COALESCE(?,visibility),
        reviewer_feedback=COALESCE(?,reviewer_feedback),
        reviewed_at=CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE reviewed_at END,
        updated_at=datetime('now')
      WHERE id=? AND tenant_id=?
    `).run(title||null, body||null,
           nqs_links?JSON.stringify(nqs_links):null,
           eylf_links?JSON.stringify(eylf_links):null,
           tags?JSON.stringify(tags):null,
           visibility||null,
           reviewer_feedback||null,
           reviewer_feedback||null,
           req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.delete('/portfolio/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM educator_portfolio_entries WHERE id=? AND tenant_id=?')
      .run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PARENT SURVEYS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SATISFACTION_QUESTIONS = [
  { id: 'q1', type: 'nps', text: 'How likely are you to recommend our centre to a friend or family member?', required: true },
  { id: 'q2', type: 'rating', text: 'How satisfied are you with the quality of care your child receives?', scale: 5, required: true },
  { id: 'q3', type: 'rating', text: 'How well does our team communicate with your family?', scale: 5, required: true },
  { id: 'q4', type: 'rating', text: 'How satisfied are you with our educational program?', scale: 5, required: true },
  { id: 'q5', type: 'rating', text: 'How satisfied are you with the physical environment and facilities?', scale: 5, required: true },
  { id: 'q6', type: 'text', text: 'What do we do really well?', required: false },
  { id: 'q7', type: 'text', text: 'What could we improve?', required: false },
  { id: 'q8', type: 'text', text: 'Any other comments?', required: false },
];

r.get('/surveys', (req, res) => {
  try {
    const surveys = D().prepare(`
      SELECT s.*,
        COUNT(sr.id) as response_count,
        AVG(sr.nps_score) as avg_nps
      FROM surveys s
      LEFT JOIN survey_responses sr ON sr.survey_id=s.id AND sr.completed=1
      WHERE s.tenant_id=?
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `).all(req.tenantId);

    res.json({ surveys: surveys.map(s => ({ ...s, questions: JSON.parse(s.questions||'[]') })) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/surveys', (req, res) => {
  try {
    const { title, description, survey_type, questions, open_date, close_date, created_by } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    const qs = questions?.length ? questions : DEFAULT_SATISFACTION_QUESTIONS;
    const id = uuid();
    D().prepare(`
      INSERT INTO surveys (id,tenant_id,title,description,survey_type,questions,open_date,close_date,status,created_by)
      VALUES (?,?,?,?,?,?,?,?,'active',?)
    `).run(id, req.tenantId, title, description||null, survey_type||'satisfaction',
           JSON.stringify(qs), open_date||null, close_date||null, created_by||null);

    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.get('/surveys/:id/results', (req, res) => {
  try {
    const survey = D().prepare('SELECT * FROM surveys WHERE id=? AND tenant_id=?')
      .get(req.params.id, req.tenantId);
    if (!survey) return res.status(404).json({ error: 'Not found' });

    const responses = D().prepare(
      'SELECT * FROM survey_responses WHERE survey_id=? AND completed=1 ORDER BY submitted_at DESC'
    ).all(req.params.id);

    const questions = JSON.parse(survey.questions || '[]');

    // Aggregate per question
    const aggregated = questions.map(q => {
      const answers = responses.map(r => {
        const parsed = JSON.parse(r.answers || '[]');
        return parsed.find(a => a.question_id === q.id)?.answer;
      }).filter(a => a !== undefined && a !== null && a !== '');

      if (q.type === 'nps') {
        const scores = answers.map(Number).filter(n => !isNaN(n));
        const promoters  = scores.filter(s => s >= 9).length;
        const detractors = scores.filter(s => s <= 6).length;
        const nps = scores.length ? Math.round(((promoters - detractors) / scores.length) * 100) : null;
        return { ...q, avg: scores.reduce((s,n) => s+n, 0) / (scores.length||1), nps, responses: scores.length };
      }
      if (q.type === 'rating') {
        const scores = answers.map(Number).filter(n => !isNaN(n));
        return { ...q, avg: scores.reduce((s,n) => s+n, 0) / (scores.length||1), responses: scores.length };
      }
      // text
      return { ...q, text_responses: answers.slice(0, 20), responses: answers.length };
    });

    const npsQuestion = aggregated.find(q => q.type === 'nps');
    const ratingQuestions = aggregated.filter(q => q.type === 'rating');
    const avgRating = ratingQuestions.length
      ? ratingQuestions.reduce((s,q) => s + (q.avg||0), 0) / ratingQuestions.length
      : null;

    res.json({
      survey: { ...survey, questions },
      total_responses: responses.length,
      overall_nps: npsQuestion?.nps ?? null,
      avg_satisfaction: avgRating ? Math.round(avgRating * 10) / 10 : null,
      aggregated,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Submit a survey response (public endpoint — no auth needed for parent submission)
r.post('/surveys/:id/respond', (req, res) => {
  try {
    const { answers, respondent_user_id, respondent_child_id } = req.body;
    if (!answers?.length) return res.status(400).json({ error: 'answers required' });

    const survey = D().prepare('SELECT * FROM surveys WHERE id=? AND tenant_id=? AND status=?')
      .get(req.params.id, req.tenantId, 'active');
    if (!survey) return res.status(404).json({ error: 'Survey not found or not active' });

    const npsAnswer = answers.find(a => {
      const qs = JSON.parse(survey.questions);
      const q = qs.find(q => q.id === a.question_id);
      return q?.type === 'nps';
    });
    const nps = npsAnswer ? parseInt(npsAnswer.answer) : null;

    const id = uuid();
    D().prepare(`
      INSERT INTO survey_responses
        (id,tenant_id,survey_id,respondent_user_id,respondent_child_id,answers,nps_score,completed)
      VALUES (?,?,?,?,?,?,?,1)
    `).run(id, req.tenantId, req.params.id,
           respondent_user_id||null, respondent_child_id||null,
           JSON.stringify(answers), nps);

    D().prepare('UPDATE surveys SET response_count=response_count+1 WHERE id=?').run(req.params.id);
    res.json({ ok: true, id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTATION PROMPTS
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPTS = [
  { category: 'learning_story', title: 'Notice, Recognise, Respond', prompt_text: 'What did you notice this child doing? What does this tell you about their learning? How will you respond to extend their learning?', eylf_suggested: ['1.1','1.2','4.1','4.2'], age_groups: ['all'] },
  { category: 'learning_story', title: 'A Moment of Curiosity', prompt_text: 'Describe a moment today when this child showed deep curiosity or engagement. What were they exploring? What questions did they ask?', eylf_suggested: ['4.1','4.2','5.1'], age_groups: ['all'] },
  { category: 'learning_story', title: 'Friendship and Connection', prompt_text: 'Describe an interaction this child had with a peer or educator today. What does this tell you about their social development?', eylf_suggested: ['3.1','3.2'], age_groups: ['all'] },
  { category: 'learning_story', title: 'Problem Solving in Action', prompt_text: 'When did this child encounter a challenge today? How did they approach solving it? What strategies did they use?', eylf_suggested: ['4.1','4.2','5.3'], age_groups: ['all'] },
  { category: 'learning_story', title: 'Creative Expression', prompt_text: 'How did this child express themselves creatively today? Through art, movement, dramatic play, music, or language?', eylf_suggested: ['5.1','5.2'], age_groups: ['all'] },
  { category: 'learning_story', title: 'Growing Independence', prompt_text: 'What did this child do independently today that shows their growing confidence and competence?', eylf_suggested: ['3.2'], age_groups: ['all'] },
  { category: 'learning_story', title: 'Language and Literacy', prompt_text: 'What language did you hear this child using today? Describe their emerging literacy skills or love of stories and books.', eylf_suggested: ['5.1','5.2','5.3'], age_groups: ['all'] },
  { category: 'daily_update', title: 'A Joyful Moment', prompt_text: 'Share a happy moment from today that parents would love to hear about. What made this child light up?', eylf_suggested: [], age_groups: ['all'] },
  { category: 'observation', title: 'Physical Development', prompt_text: 'Describe a moment that shows this child\'s physical development — gross motor, fine motor, or body awareness. What skills are emerging?', eylf_suggested: ['3.2'], age_groups: ['all'] },
  { category: 'observation', title: 'Mathematical Thinking', prompt_text: 'When did you see mathematical thinking today? Counting, sorting, patterns, measurement, spatial reasoning?', eylf_suggested: ['4.2','5.2'], age_groups: ['3y+'] },
  { category: 'group_story', title: 'Our Big Idea', prompt_text: 'What project or inquiry is the group currently exploring? What questions are the children asking? Where is this taking you?', eylf_suggested: ['1.2','4.1','4.2'], age_groups: ['all'] },
  { category: 'group_story', title: 'Today in Our Room', prompt_text: 'What was the energy like in the room today? What were children engaged with most? What surprised you?', eylf_suggested: [], age_groups: ['all'] },
];

r.get('/prompts', (req, res) => {
  try {
    const { category, age_group } = req.query;

    // Get custom prompts for this tenant
    const where = ['(tenant_id=? OR is_system=1)', 'active=1'];
    const vals  = [req.tenantId];
    if (category) { where.push('category=?'); vals.push(category); }

    const custom = D().prepare(`
      SELECT * FROM story_prompts WHERE ${where.join(' AND ')} ORDER BY is_system ASC, created_at DESC
    `).all(...vals);

    // Merge with system prompts if not already in DB
    const customKeys = new Set(custom.filter(p => p.is_system).map(p => p.title));
    const sysToAdd = SYSTEM_PROMPTS.filter(p =>
      !category || p.category === category
    ).map(p => ({ ...p, id: `sys_${p.title.replace(/\s+/g,'_').toLowerCase()}`, is_system: 1, active: 1 }));

    const allPrompts = [
      ...custom.map(p => ({ ...p, eylf_suggested: JSON.parse(p.eylf_suggested||'[]'), age_groups: JSON.parse(p.age_groups||'[]') })),
      ...sysToAdd.filter(p => !customKeys.has(p.title)),
    ];

    res.json({ prompts: allPrompts, categories: ['learning_story','daily_update','observation','group_story'] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/prompts', (req, res) => {
  try {
    const { title, category, prompt_text, eylf_suggested, age_groups } = req.body;
    if (!title || !prompt_text) return res.status(400).json({ error: 'title and prompt_text required' });
    const id = uuid();
    D().prepare(`
      INSERT INTO story_prompts (id,tenant_id,title,category,prompt_text,eylf_suggested,age_groups,is_system)
      VALUES (?,?,?,?,?,?,?,0)
    `).run(id, req.tenantId, title, category||'general', prompt_text,
           JSON.stringify(eylf_suggested||[]), JSON.stringify(age_groups||['all']));
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// SMART ALERTS
// ─────────────────────────────────────────────────────────────────────────────

// Generate fresh alerts by scanning the centre for issues
r.post('/alerts/scan', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const in30 = new Date(Date.now() + 30*86400000).toISOString().split('T')[0];
    const in90 = new Date(Date.now() + 90*86400000).toISOString().split('T')[0];
    const alerts = [];

    // 1. Educator certifications expiring within 30 days
    const expiringCerts = D().prepare(`
      SELECT first_name, last_name, id,
        wwcc_expiry, first_aid_expiry, cpr_expiry, anaphylaxis_expiry
      FROM educators WHERE tenant_id=? AND status='active'
        AND (wwcc_expiry BETWEEN ? AND ? OR first_aid_expiry BETWEEN ? AND ?
             OR cpr_expiry BETWEEN ? AND ? OR anaphylaxis_expiry BETWEEN ? AND ?)
    `).all(req.tenantId, today, in30, today, in30, today, in30, today, in30);

    expiringCerts.forEach(e => {
      const expiring = [];
      if (e.wwcc_expiry?.between?.(today,in30) || (e.wwcc_expiry >= today && e.wwcc_expiry <= in30)) expiring.push('WWCC');
      if (e.first_aid_expiry >= today && e.first_aid_expiry <= in30) expiring.push('First Aid');
      if (e.cpr_expiry >= today && e.cpr_expiry <= in30) expiring.push('CPR');
      if (e.anaphylaxis_expiry >= today && e.anaphylaxis_expiry <= in30) expiring.push('Anaphylaxis');
      if (expiring.length) alerts.push({
        type: 'cert_expiry', priority: 'high',
        title: `${e.first_name} ${e.last_name} — certification expiring`,
        message: `${expiring.join(', ')} expiring within 30 days`,
        entity_type: 'educator', entity_id: e.id
      });
    });

    // 2. Children with no CCS details
    const noCCS = D().prepare(`
      SELECT COUNT(*) as n FROM children c
      WHERE c.tenant_id=? AND c.active=1
        AND NOT EXISTS (SELECT 1 FROM ccs_family_details cf WHERE cf.child_id=c.id AND cf.tenant_id=c.tenant_id)
    `).get(req.tenantId)?.n || 0;
    if (noCCS > 0) alerts.push({
      type: 'ccs_missing', priority: 'high',
      title: `${noCCS} children without CCS details`,
      message: 'Set up CCS family details to enable subsidy calculations',
      entity_type: 'ccs', entity_id: null
    });

    // 3. Overdue debt (>30 days)
    const overdueDebt = D().prepare(`
      SELECT COUNT(*) as n, SUM(amount_cents-amount_paid_cents) as total
      FROM debt_records WHERE tenant_id=? AND status='outstanding'
        AND julianday('now')-julianday(due_date) > 30
    `).get(req.tenantId);
    if (overdueDebt?.n > 0) alerts.push({
      type: 'overdue_debt', priority: 'medium',
      title: `${overdueDebt.n} families with overdue accounts (30+ days)`,
      message: `$${((overdueDebt.total||0)/100).toFixed(0)} outstanding beyond 30 days`,
      entity_type: 'debt', entity_id: null
    });

    // 4. Pending casual bookings
    const pendingCasual = D().prepare(
      "SELECT COUNT(*) as n FROM casual_bookings WHERE tenant_id=? AND status='pending'"
    ).get(req.tenantId)?.n || 0;
    if (pendingCasual > 0) alerts.push({
      type: 'casual_pending', priority: 'normal',
      title: `${pendingCasual} casual booking request${pendingCasual>1?'s':''} awaiting confirmation`,
      message: 'Review and confirm or decline pending casual bookings',
      entity_type: 'casual', entity_id: null
    });

    // 5. Children approaching school age without transition report
    const noTransition = D().prepare(`
      SELECT COUNT(*) as n FROM children c
      WHERE c.tenant_id=? AND c.active=1 AND c.dob IS NOT NULL
        AND julianday(date(c.dob,'+5 years'))-julianday('now') BETWEEN 0 AND 180
        AND NOT EXISTS (SELECT 1 FROM transition_reports tr WHERE tr.child_id=c.id AND tr.tenant_id=c.tenant_id)
    `).get(req.tenantId)?.n || 0;
    if (noTransition > 0) alerts.push({
      type: 'transition_missing', priority: 'normal',
      title: `${noTransition} child${noTransition>1?'ren':''} approaching school age without transition report`,
      message: 'Prepare school readiness transition reports',
      entity_type: 'transition', entity_id: null
    });

    // 6. QIP goals overdue
    const overdueGoals = D().prepare(`
      SELECT COUNT(*) as n FROM qip_goals
      WHERE tenant_id=? AND status != 'completed' AND timeline IS NOT NULL
        AND timeline < date('now')
    `).get(req.tenantId)?.n || 0;
    if (overdueGoals > 0) alerts.push({
      type: 'qip_overdue', priority: 'normal',
      title: `${overdueGoals} QIP goal${overdueGoals>1?'s':''} past target date`,
      message: 'Review and update Quality Improvement Plan goals',
      entity_type: 'qip', entity_id: null
    });

    // 7. Staff appraisals overdue
    const overdueAppraisals = D().prepare(`
      SELECT COUNT(*) as n FROM appraisals
      WHERE tenant_id=? AND status!='completed' AND due_date < date('now')
    `).get(req.tenantId)?.n || 0;
    if (overdueAppraisals > 0) alerts.push({
      type: 'appraisal_overdue', priority: 'normal',
      title: `${overdueAppraisals} staff appraisal${overdueAppraisals>1?'s':''} overdue`,
      message: 'Complete outstanding performance reviews',
      entity_type: 'appraisal', entity_id: null
    });

    // Insert all new alerts (skip duplicates by type+entity)
    const insertAlert = D().prepare(`
      INSERT OR IGNORE INTO smart_alerts
        (id,tenant_id,alert_type,title,message,priority,entity_type,entity_id)
      VALUES (?,?,?,?,?,?,?,?)
    `);
    D().transaction(() => {
      for (const a of alerts) {
        // Dismiss old alerts of same type first
        D().prepare("UPDATE smart_alerts SET dismissed=1 WHERE tenant_id=? AND alert_type=? AND dismissed=0")
          .run(req.tenantId, a.type);
        insertAlert.run(uuid(), req.tenantId, a.type, a.title, a.message,
                        a.priority, a.entity_type, a.entity_id||null);
      }
    })();

    res.json({ ok: true, alerts_generated: alerts.length, alerts });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.get('/alerts', (req, res) => {
  try {
    const alerts = D().prepare(`
      SELECT * FROM smart_alerts
      WHERE tenant_id=? AND dismissed=0
      ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC
    `).all(req.tenantId);
    res.json({ alerts, count: alerts.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/alerts/:id/dismiss', (req, res) => {
  try {
    D().prepare("UPDATE smart_alerts SET dismissed=1,dismissed_by=?,dismissed_at=datetime('now') WHERE id=? AND tenant_id=?")
      .run(req.userId, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
