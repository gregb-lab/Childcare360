/**
 * server/ai-assistant.js — v2.19.0
 *   POST /api/ai-assistant/generate    — AI observation/story generation
 *   GET  /api/ai-assistant/history     — Past AI sessions
 *   POST /api/ai-assistant/save        — Save final text to observation
 *   GET  /api/fee-overrides            — Child fee overrides
 *   POST /api/fee-overrides            — Set fee override
 *   DELETE /api/fee-overrides/:id      — Remove override
 *   GET  /api/compliance-tasks         — Compliance task list
 *   POST /api/compliance-tasks         — Create task
 *   PUT  /api/compliance-tasks/:id     — Update/complete task
 *   POST /api/compliance-tasks/auto-generate — Scan and generate tasks
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

// ─────────────────────────────────────────────────────────────────────────────
// AI WRITING ASSISTANT
// ─────────────────────────────────────────────────────────────────────────────

const EYLF_OUTCOMES = {
  '1.1': 'Children feel safe, secure, and supported',
  '1.2': 'Children develop their emerging autonomy, inter-dependence, resilience and sense of agency',
  '1.3': 'Children develop knowledgeable and confident self identities',
  '1.4': 'Children learn to interact in relation to others with care, empathy and respect',
  '2.1': 'Children develop a sense of belonging to groups and communities',
  '2.2': 'Children respond to diversity with respect',
  '2.3': 'Children become aware of fairness',
  '2.4': 'Children become socially responsible and show respect for the environment',
  '3.1': 'Children become strong in their social and emotional wellbeing',
  '3.2': 'Children take increasing responsibility for their own health and physical wellbeing',
  '4.1': 'Children develop dispositions for learning such as curiosity, cooperation and creativity',
  '4.2': 'Children use a range of skills and processes such as problem solving, inquiry and experimentation',
  '5.1': 'Children interact verbally and non-verbally with others for a range of purposes',
  '5.2': 'Children engage with a range of texts and gain meaning from these texts',
  '5.3': 'Children express ideas and make meaning using a range of media',
};

// Build a context-aware prompt
function buildPrompt(type, context) {
  const { child_name, age_months, observation_notes, activity, eylf_focus, room_name } = context;
  const ageYears = age_months ? `${Math.floor(age_months/12)} years ${age_months%12} months` : 'unknown age';

  const baseContext = child_name
    ? `Child: ${child_name} (${ageYears})${room_name ? `, Room: ${room_name}` : ''}`
    : 'Child: (unnamed)';

  const prompts = {
    observation: `You are an experienced early childhood educator writing a professional observation for a childcare portfolio.

${baseContext}
${observation_notes ? `Raw notes: ${observation_notes}` : ''}
${activity ? `Activity observed: ${activity}` : ''}
${eylf_focus ? `EYLF focus: ${eylf_focus}` : ''}

Write a warm, professional observation (150-200 words) that:
- Uses strength-based, positive language
- Describes what the child was doing in detail
- Links to learning and development
- Is written in third person
- Includes a "what this tells us" reflection
- Feels personal and specific, not generic

Write only the observation text, no headers.`,

    learning_story: `You are an experienced early childhood educator writing a learning story for a child's portfolio.

${baseContext}
${observation_notes ? `What happened: ${observation_notes}` : ''}
${activity ? `Context: ${activity}` : ''}
${eylf_focus ? `EYLF outcome to link: ${eylf_focus}` : ''}

Write a warm, narrative learning story (200-250 words) that:
- Opens with an engaging description of the moment
- Uses the "I wonder/I notice/I see" framework naturally
- Celebrates the child's strengths and capabilities
- Connects to an EYLF outcome
- Ends with a "What next?" extension idea
- Is written to delight both educators and families

Write only the story, no headers.`,

    daily_update: `You are an early childhood educator writing a brief, warm daily update for a family.

${baseContext}
${observation_notes ? `Today's highlights: ${observation_notes}` : ''}
${activity ? `Main activity: ${activity}` : ''}

Write a friendly daily update (80-120 words) that:
- Feels warm and personal, not clinical
- Highlights something specific and joyful from the day
- Reassures parents their child is thriving
- Mentions one thing to ask or follow up at home

Write only the update text.`,

    eylf_link: `You are an early childhood educator. Given this observation, identify the most relevant EYLF outcomes and explain the connection.

${baseContext}
Observation: ${observation_notes || activity || 'See context'}

List the 2-3 most relevant EYLF outcomes (by number and description) and in 1-2 sentences each, explain specifically how this observation demonstrates that outcome.

Format as:
Outcome X.X — [Title]
[Explanation]`,

    group_story: `You are an experienced early childhood educator writing a group learning story for a centre newsletter or documentation panel.

Room: ${room_name || 'The Room'}
${observation_notes ? `What happened: ${observation_notes}` : ''}
${activity ? `Project/activity: ${activity}` : ''}

Write a captivating group learning story (200-250 words) that:
- Captures the energy and curiosity of the group
- Highlights the collaborative learning that occurred
- Links to the learning environment and educator's role
- Celebrates children as capable, curious learners
- Ends with where the inquiry is headed next

Write only the story text.`,
  };

  return prompts[type] || prompts.observation;
}

r.post('/generate', async (req, res) => {
  try {
    const {
      session_type = 'observation',
      child_id, educator_id,
      child_name, age_months,
      observation_notes, activity,
      eylf_focus, room_name,
      anthropic_key, // Optional: pass from settings
    } = req.body;

    // Get Anthropic API key from request, env, or voice_settings
    let dbKey = null;
    try {
      const vs = D().prepare("SELECT elevenlabs_api_key FROM voice_settings WHERE tenant_id=? LIMIT 1").get(req.tenantId);
      if (!vs) {
        const ac = D().prepare("SELECT voice_engine_api_key FROM ai_agent_config WHERE tenant_id=? LIMIT 1").get(req.tenantId);
        dbKey = ac?.voice_engine_api_key || null;
      }
    } catch(e) {}
    const apiKey = anthropic_key || process.env.ANTHROPIC_API_KEY || dbKey;

    if (!apiKey) {
      // Return a structured template instead
      const templates = {
        observation: `[Child name] demonstrated [skill/behaviour] today during [activity]. They showed [quality] as they [specific action]. This reflects their growing [developmental area]. What this tells us: [Learning significance]. We will [next steps].`,
        learning_story: `Today I noticed something wonderful! [Child name] was [activity]. As I watched, I could see [observation detail]. "I wonder..." [child's words or actions]. This moment shows us [EYLF connection]. What's next? [Extension idea].`,
        daily_update: `What a wonderful day [child name] had! They spent time [activity] and showed such [quality]. One highlight was [specific moment]. Ask them about [conversation starter] tonight!`,
      };
      return res.json({
        ok: true,
        generated_text: templates[session_type] || templates.observation,
        eylf_suggested: ['1.1', '4.1'],
        source: 'template',
        message: 'Configure Anthropic API key in Settings → Integrations for AI-generated text',
      });
    }

    const prompt = req.body.prompt_override || buildPrompt(session_type, { child_name, age_months, observation_notes, activity, eylf_focus, room_name });

    // Call Anthropic Claude
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    const generatedText = data.content?.[0]?.text || '';

    // Auto-detect EYLF outcomes mentioned or relevant
    const eylfSuggested = [];
    if (generatedText.match(/identit|self|belonging/i)) eylfSuggested.push('1.3');
    if (generatedText.match(/curious|wonder|explor|investigat/i)) eylfSuggested.push('4.1');
    if (generatedText.match(/communicat|language|speak|listen/i)) eylfSuggested.push('5.1');
    if (generatedText.match(/problem.solv|persist|strateg/i)) eylfSuggested.push('4.2');
    if (generatedText.match(/social|friend|together|cooperat/i)) eylfSuggested.push('2.1');
    if (generatedText.match(/physical|gross|fine.motor|body/i)) eylfSuggested.push('3.2');
    if (eylfSuggested.length === 0) eylfSuggested.push('4.1', '1.1');

    // Save session
    const sessionId = uuid();
    D().prepare(`
      INSERT INTO ai_writing_sessions
        (id,tenant_id,educator_id,child_id,session_type,prompt_used,generated_text,eylf_suggested)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(sessionId, req.tenantId, educator_id||null, child_id||null,
           session_type, prompt.slice(0,500), generatedText, JSON.stringify(eylfSuggested));

    // Log AI usage
    try {
      D().prepare(`
        INSERT INTO ai_usage_log (id,tenant_id,action,tokens_used,cost_usd,created_at)
        VALUES (?,?,?,?,?,datetime('now'))
      `).run(uuid(), req.tenantId, `ai_writing_${session_type}`,
             data.usage?.input_tokens + data.usage?.output_tokens || 0,
             ((data.usage?.input_tokens||0) * 0.00000025 + (data.usage?.output_tokens||0) * 0.00000125));
    } catch(e) {}

    res.json({
      ok: true,
      session_id: sessionId,
      generated_text: generatedText,
      eylf_suggested: eylfSuggested,
      source: 'claude',
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.get('/history', (req, res) => {
  try {
    const sessions = D().prepare(`
      SELECT s.*, c.first_name, c.last_name
      FROM ai_writing_sessions s
      LEFT JOIN children c ON c.id=s.child_id
      WHERE s.tenant_id=?
      ORDER BY s.created_at DESC LIMIT 50
    `).all(req.tenantId);
    res.json({ sessions: sessions.map(s => ({...s, eylf_suggested: JSON.parse(s.eylf_suggested||'[]')})) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/save', (req, res) => {
  try {
    const { session_id, final_text, child_id, session_type, eylf_links } = req.body;

    if (session_id) {
      D().prepare('UPDATE ai_writing_sessions SET final_text=?, used=1 WHERE id=? AND tenant_id=?')
        .run(final_text, session_id, req.tenantId);
    }

    // Optionally auto-create an observation from the saved text
    if (final_text && child_id && session_type === 'observation') {
      D().prepare(`
        INSERT INTO observations (id,tenant_id,child_id,notes,category,eylf_links,created_at)
        VALUES (?,?,?,?,?,?,datetime('now'))
      `).run(uuid(), req.tenantId, child_id, final_text, 'learning',
             JSON.stringify(eylf_links||[]));
    }

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHILD FEE OVERRIDES
// ─────────────────────────────────────────────────────────────────────────────

export const feeOverrideRouter = Router();
feeOverrideRouter.use(requireAuth, requireTenant);

feeOverrideRouter.get('/', (req, res) => {
  try {
    const overrides = D().prepare(`
      SELECT fo.*, c.first_name, c.last_name, c.room_id, r.name as room_name,
             CAST(fs.daily_fee * 100 AS INTEGER) as standard_rate_cents
      FROM child_fee_overrides fo
      JOIN children c ON c.id=fo.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      LEFT JOIN fee_schedules fs ON fs.room_id=c.room_id AND fs.tenant_id=fo.tenant_id AND fs.active=1
      WHERE fo.tenant_id=?
        AND (fo.effective_to IS NULL OR fo.effective_to >= date('now'))
      ORDER BY c.last_name, fo.effective_from DESC
    `).all(req.tenantId);

    // Also get all active children with their current rates
    const children = D().prepare(`
      SELECT c.id, c.first_name, c.last_name, c.room_id, r.name as room_name,
             CAST(fs.daily_fee * 100 AS INTEGER) as room_rate_cents,
             fo.id as override_id, fo.daily_rate_cents as override_rate_cents,
             fo.discount_pct, fo.discount_reason
      FROM children c
      LEFT JOIN rooms r ON r.id=c.room_id
      LEFT JOIN fee_schedules fs ON fs.room_id=c.room_id AND fs.tenant_id=c.tenant_id AND fs.active=1
      LEFT JOIN child_fee_overrides fo ON fo.child_id=c.id AND fo.tenant_id=c.tenant_id
        AND fo.effective_from <= date('now')
        AND (fo.effective_to IS NULL OR fo.effective_to >= date('now'))
      WHERE c.tenant_id=? AND c.active=1
      ORDER BY r.name, c.last_name
    `).all(req.tenantId);

    res.json({
      overrides: overrides.map(o => ({ ...o, session_rates: JSON.parse(o.session_rates||'{}') })),
      children: children.map(c => ({
        ...c,
        effective_rate_cents: c.override_rate_cents ||
          (c.room_rate_cents && c.discount_pct ? Math.round(c.room_rate_cents * (1 - c.discount_pct/100)) : c.room_rate_cents),
      })),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

feeOverrideRouter.post('/', (req, res) => {
  try {
    const { child_id, override_type, daily_rate_cents, discount_pct,
            discount_reason, effective_from, effective_to, notes } = req.body;
    if (!child_id) return res.status(400).json({ error: 'child_id required' });

    const id = uuid();
    D().prepare(`
      INSERT INTO child_fee_overrides
        (id,tenant_id,child_id,override_type,daily_rate_cents,discount_pct,
         discount_reason,effective_from,effective_to,notes,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, req.tenantId, child_id, override_type||'fixed',
           daily_rate_cents||null, discount_pct||0, discount_reason||null,
           effective_from||new Date().toISOString().split('T')[0],
           effective_to||null, notes||null, req.userId||null);

    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

feeOverrideRouter.delete('/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM child_fee_overrides WHERE id=? AND tenant_id=?')
      .run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE TASK NAGGER
// ─────────────────────────────────────────────────────────────────────────────

export const complianceTaskRouter = Router();
complianceTaskRouter.use(requireAuth, requireTenant);

complianceTaskRouter.get('/', (req, res) => {
  try {
    const { status, assigned_to, overdue_only } = req.query;
    const today = new Date().toISOString().split('T')[0];

    const where = ['ct.tenant_id=?'];
    const vals  = [req.tenantId];
    if (status)      { where.push('ct.status=?'); vals.push(status); }
    else             { where.push("ct.status='open'"); }
    if (assigned_to) { where.push('ct.assigned_to=?'); vals.push(assigned_to); }
    if (overdue_only === 'true') { where.push('ct.due_date < ?'); vals.push(today); }

    const tasks = D().prepare(`
      SELECT ct.*, u.name as assigned_to_name, u.email as assigned_to_email,
        CAST(julianday(?) - julianday(ct.due_date) AS INTEGER) as days_overdue
      FROM compliance_tasks ct
      LEFT JOIN users u ON u.id=ct.assigned_to
      WHERE ${where.join(' AND ')}
      ORDER BY ct.due_date ASC, ct.priority DESC
    `).all(...vals, today);

    const summary = {
      total_open: tasks.length,
      overdue: tasks.filter(t => t.days_overdue > 0).length,
      due_today: tasks.filter(t => t.due_date === today).length,
      due_this_week: tasks.filter(t => {
        const dueDate = new Date(t.due_date+'T12:00');
        const inWeek = new Date(Date.now() + 7*86400000);
        return dueDate >= new Date() && dueDate <= inWeek;
      }).length,
    };

    res.json({ tasks, summary });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

complianceTaskRouter.post('/', (req, res) => {
  try {
    const { task_type, title, description, due_date, assigned_to, priority, entity_type, entity_id } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const id = uuid();
    D().prepare(`
      INSERT INTO compliance_tasks
        (id,tenant_id,task_type,title,description,due_date,assigned_to,priority,entity_type,entity_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(id, req.tenantId, task_type||'general', title, description||null,
           due_date||null, assigned_to||null, priority||'normal', entity_type||null, entity_id||null);
    res.json({ id, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

complianceTaskRouter.put('/:id', (req, res) => {
  try {
    const { status, due_date, assigned_to, notes, completed_by } = req.body;
    const updates = ["updated_at=datetime('now')" ];
    const vals = [];
    if (status)      { updates.push('status=?'); vals.push(status); }
    if (due_date)    { updates.push('due_date=?'); vals.push(due_date); }
    if (assigned_to) { updates.push('assigned_to=?'); vals.push(assigned_to); }
    if (status === 'completed') {
      updates.push("completed_at=datetime('now')");
      if (completed_by) { updates.push('completed_by=?'); vals.push(completed_by); }
    }
    D().prepare((() => 'UPDATE compliance_tasks SET ' + updates.join(',') + ' WHERE id=? AND tenant_id=?')())
      .run(...vals, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Auto-generate compliance tasks from scan
complianceTaskRouter.post('/auto-generate', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const in14  = new Date(Date.now() + 14*86400000).toISOString().split('T')[0];
    const in30  = new Date(Date.now() + 30*86400000).toISOString().split('T')[0];
    const tasks = [];

    // Cert renewals
    const expiringCerts = D().prepare(`
      SELECT id, first_name, last_name,
        first_aid_expiry, cpr_expiry, wwcc_expiry, anaphylaxis_expiry
      FROM educators WHERE tenant_id=? AND status='active'
        AND (first_aid_expiry BETWEEN ? AND ? OR cpr_expiry BETWEEN ? AND ?
             OR wwcc_expiry BETWEEN ? AND ? OR anaphylaxis_expiry BETWEEN ? AND ?)
    `).all(req.tenantId, today, in30, today, in30, today, in30, today, in30);

    for (const e of expiringCerts) {
      const certs = [];
      if (e.first_aid_expiry <= in30) certs.push(`First Aid (${e.first_aid_expiry})`);
      if (e.cpr_expiry <= in30)       certs.push(`CPR (${e.cpr_expiry})`);
      if (e.wwcc_expiry <= in30)      certs.push(`WWCC (${e.wwcc_expiry})`);
      if (e.anaphylaxis_expiry <= in30) certs.push(`Anaphylaxis (${e.anaphylaxis_expiry})`);
      if (!certs.length) continue;

      const exists = D().prepare(
        "SELECT id FROM compliance_tasks WHERE tenant_id=? AND entity_id=? AND task_type='cert_renewal' AND status='open'"
      ).get(req.tenantId, e.id);
      if (exists) continue;

      const taskId = uuid();
      D().prepare(`
        INSERT INTO compliance_tasks
          (id,tenant_id,task_type,title,description,due_date,priority,entity_type,entity_id,auto_generated)
        VALUES (?,?,'cert_renewal',?,?,?,?,?,?,1)
      `).run(taskId, req.tenantId,
             `Renew certifications — ${e.first_name} ${e.last_name}`,
             `Expiring: ${certs.join(', ')}`,
             certs[0].match(/\d{4}-\d{2}-\d{2}/)?.[0] || in30,
             'high', 'educator', e.id);
      tasks.push({ type: 'cert_renewal', name: `${e.first_name} ${e.last_name}` });
    }

    // Overdue appraisals
    const overdueAppraisals = D().prepare(`
      SELECT a.id, e.first_name, e.last_name, a.due_date
      FROM appraisals a JOIN educators e ON e.id=a.educator_id
      WHERE a.tenant_id=? AND a.status!='completed' AND a.due_date < ?
    `).all(req.tenantId, today);

    for (const a of overdueAppraisals) {
      const exists = D().prepare(
        "SELECT id FROM compliance_tasks WHERE tenant_id=? AND entity_id=? AND task_type='appraisal' AND status='open'"
      ).get(req.tenantId, a.id);
      if (exists) continue;

      const taskId = uuid();
      D().prepare(`
        INSERT INTO compliance_tasks
          (id,tenant_id,task_type,title,description,due_date,priority,entity_type,entity_id,auto_generated)
        VALUES (?,?,'appraisal',?,?,?,?,?,?,1)
      `).run(taskId, req.tenantId,
             `Complete overdue appraisal — ${a.first_name} ${a.last_name}`,
             `Appraisal due date was ${a.due_date}`,
             today, 'normal', 'appraisal', a.id);
      tasks.push({ type: 'appraisal', name: `${a.first_name} ${a.last_name}` });
    }

    // Missing immunisation records
    const missingImm = D().prepare(`
      SELECT c.id, c.first_name, c.last_name FROM children c
      WHERE c.tenant_id=? AND c.active=1
        AND NOT EXISTS (SELECT 1 FROM immunisation_records ir WHERE ir.child_id=c.id AND ir.status='current')
        AND NOT EXISTS (SELECT 1 FROM compliance_tasks ct
                        WHERE ct.tenant_id=c.tenant_id AND ct.entity_id=c.id
                          AND ct.task_type='immunisation' AND ct.status='open')
      LIMIT 10
    `).all(req.tenantId);

    for (const c of missingImm) {
      const taskId = uuid();
      D().prepare(`
        INSERT INTO compliance_tasks
          (id,tenant_id,task_type,title,due_date,priority,entity_type,entity_id,auto_generated)
        VALUES (?,?,'immunisation',?,?,?,?,?,1)
      `).run(taskId, req.tenantId,
             `Request immunisation records — ${c.first_name} ${c.last_name}`,
             in14, 'normal', 'child', c.id);
      tasks.push({ type: 'immunisation', name: `${c.first_name} ${c.last_name}` });
    }

    res.json({ ok: true, generated: tasks.length, tasks });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
