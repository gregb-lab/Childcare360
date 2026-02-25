// ═══════════════════════════════════════════════════════════════════════════
//  Childcare360 — Retell AI Integration
//
//  Architecture:
//  ┌─────────┐    ┌─────────┐    ┌──────────────┐    ┌──────────────┐
//  │  Caller │◄──►│  Retell │◄──►│ Custom LLM   │◄──►│  Our backend │
//  │         │    │ (STT+   │    │ /retell/llm/ │    │  (roster,    │
//  │         │    │  TTS+   │    │ :tenantId    │    │   sick calls)│
//  │         │    │  turns) │    └──────────────┘    └──────────────┘
//  └─────────┘    └─────────┘
//
//  Retell handles: audio I/O, STT, TTS, turn-taking, interruption, latency
//  We handle:      business logic, shift lookups, Claude responses
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { D, uuid, auditLog } from './db.js';

const router   = Router(); // authenticated routes (agent management)
const webhooks = Router(); // Retell webhook (no auth — called by Retell)

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSettings(tenantId) {
  const db = D().prepare('SELECT * FROM voice_settings WHERE tenant_id=?').get(tenantId) || {};
  return {
    ...db,
    retell_api_key:         process.env.RETELL_API_KEY || db.retell_api_key,
    retell_agent_id:        db.retell_agent_id,
    retell_phone_number_id: db.retell_phone_number_id,
    elevenlabs_api_key:     process.env.ELEVENLABS_API_KEY || db.elevenlabs_api_key,
    elevenlabs_voice_id:    db.elevenlabs_voice_id || '21m00Tcm4TlvDq8ikWAM',
    call_language:          db.call_language || 'en-AU',
    ai_persona:             db.ai_persona || 'You are a friendly assistant for a childcare centre.',
    inbound_greeting:       db.inbound_greeting || 'Hello, thank you for calling. How can I help you today?',
  };
}

function getBase() {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  return '';
}

async function retellFetch(path, method, body, apiKey) {
  const r = await fetch(`https://api.retellai.com${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Retell ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

// ── Claude response (same as voice.js) ───────────────────────────────────────

async function askClaude(messages, systemPrompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return "I'm sorry, the AI system is temporarily unavailable.";

  // Ensure first message is user role
  let msgs = messages.filter(m => m.content?.trim());
  while (msgs.length && msgs[0].role === 'assistant') msgs.shift();
  // Merge consecutive same-role
  const merged = [];
  for (const m of msgs) {
    if (merged.length && merged[merged.length-1].role === m.role) {
      merged[merged.length-1].content += ' ' + m.content;
    } else merged.push({ ...m });
  }
  if (!merged.length) return null;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 200,
      system: systemPrompt,
      messages: merged,
    })
  });
  const d = await r.json();
  if (!r.ok) { console.error('[Retell:Claude] error:', JSON.stringify(d).slice(0, 200)); return null; }
  return d.content?.[0]?.text || null;
}

// ── Shift helpers (shared logic) ─────────────────────────────────────────────

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2,'0')} ${ap}` : `${h12} ${ap}`;
}

function dayLabel(dateStr) {
  const today    = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  if (dateStr === today)    return 'today';
  if (dateStr === tomorrow) return 'tomorrow';
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAYS[d.getDay()]} the ${d.getDate()}`;
}

function getUpcomingShifts(educatorId, tenantId) {
  const today = new Date().toISOString().split('T')[0];
  const in14  = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
  return D().prepare(`
    SELECT re.*, r.name as room_name
    FROM roster_entries re LEFT JOIN rooms r ON r.id = re.room_id
    WHERE re.educator_id=? AND re.tenant_id=? AND re.date BETWEEN ? AND ?
    AND re.status NOT IN ('cancelled','unfilled')
    ORDER BY re.date ASC, re.start_time ASC LIMIT 5
  `).all(educatorId, tenantId, today, in14).map(s => ({ ...s, day_label: dayLabel(s.date) }));
}

function identifyCaller(from, tenantId) {
  if (!from || from === 'unknown') return null;
  const normalised = from.replace(/^\+61/, '0').replace(/\s/g, '');
  return D().prepare(
    "SELECT id, first_name, last_name FROM educators WHERE tenant_id=? AND phone LIKE ?"
  ).get(tenantId, `%${normalised}%`) || null;
}

async function processConfirmedSickCall(tenantId, educatorId, shift) {
  const today = new Date().toISOString().split('T')[0];
  const shiftDate = new Date(shift.date + 'T12:00:00');
  const dayOfWeek = shiftDate.getDay();
  const qualOrder = ['ect','diploma','cert3','working_towards'];
  const reqQualIdx = qualOrder.indexOf(shift.qualification_required || 'cert3');

  const absId = uuid();
  D().prepare(`INSERT INTO educator_absences (id,tenant_id,educator_id,date,type,reason,notice_given_mins,notified_via) VALUES(?,?,?,?,?,?,?,?)`)
    .run(absId, tenantId, educatorId, shift.date, 'sick', 'Called in sick via Retell voice agent', 0, 'phone');
  D().prepare("UPDATE educators SET total_sick_days=total_sick_days+1, reliability_score=MAX(0,reliability_score-2), updated_at=datetime('now') WHERE id=?").run(educatorId);
  D().prepare("UPDATE roster_entries SET status='unfilled', notes='Educator called in sick via Retell voice agent', updated_at=datetime('now') WHERE id=?").run(shift.id);

  const candidates = D().prepare(`
    SELECT e.* FROM educators e JOIN educator_availability ea ON ea.educator_id=e.id
    WHERE e.tenant_id=? AND e.status='active' AND e.id!=? AND ea.day_of_week=? AND ea.available=1
    AND e.id NOT IN (SELECT educator_id FROM roster_entries WHERE date=? AND tenant_id=?)
    ORDER BY e.reliability_score DESC, e.distance_km ASC
  `).all(tenantId, educatorId, dayOfWeek, shift.date, tenantId)
    .filter(c => qualOrder.indexOf(c.qualification) <= reqQualIdx).slice(0, 10);

  if (!candidates.length) { console.log('[Retell] No eligible cover candidates'); return; }

  const fillId = uuid();
  D().prepare(`INSERT INTO shift_fill_requests (id,tenant_id,absence_id,original_educator_id,roster_entry_id,room_id,date,start_time,end_time,qualification_required,status,ai_initiated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(fillId, tenantId, absId, educatorId, shift.id, shift.room_id, shift.date, shift.start_time, shift.end_time, shift.qualification_required, 'open', 1);
  candidates.forEach(c => D().prepare('INSERT INTO shift_fill_attempts (id,request_id,educator_id,contact_method,status) VALUES(?,?,?,?,?)').run(uuid(), fillId, c.id, 'call', 'queued'));

  try {
    const { startShiftFillCalls } = await import('./shift-voice.js');
    await startShiftFillCalls(tenantId, fillId);
  } catch(e) { console.error('[Retell] startShiftFillCalls error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════
//  RETELL CUSTOM LLM WEBHOOK
//  POST /api/retell/llm/:tenantId
//
//  Retell sends the full conversation each turn. We respond with the next
//  agent utterance. State is carried in `call.metadata`.
// ═══════════════════════════════════════════════════════════════════════════

webhooks.post('/llm/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  const { llm_id, call, transcript } = req.body;

  // call.metadata persists across turns (we store sick-call state here)
  const meta    = call?.metadata || {};
  const from    = call?.from_number || 'unknown';
  const callId  = call?.call_id || uuid();

  console.log(`[Retell:LLM] tenantId=${tenantId} callId=${callId} turns=${transcript?.length}`);

  try {
    const settings  = getSettings(tenantId);
    const tenantName = D().prepare('SELECT name FROM tenants WHERE id=?').get(tenantId)?.name || 'the centre';

    // Identify caller on first turn
    if (!meta.identityChecked) {
      const educator = identifyCaller(from, tenantId);
      meta.educatorId   = educator?.id || null;
      meta.educatorName = educator?.first_name || null;
      meta.identityChecked = true;
    }

    // Build transcript for Claude (Retell format → Claude format)
    const messages = (transcript || []).map(t => ({
      role: t.role === 'agent' ? 'assistant' : 'user',
      content: t.content || '',
    })).filter(m => m.content.trim());

    const lastUserMsg = [...(transcript || [])].reverse().find(t => t.role === 'user')?.content?.toLowerCase() || '';

    // ── SICK CALL FLOW ─────────────────────────────────────────────────────────

    const sickKeywords = ['sick','unwell','not well','not coming in',"can't come in",
      "won't be in",'calling in sick','report sick','cancel my shift','cancel shift',
      'miss my shift','off sick','feeling sick','feel sick','not going to make it'];
    const confirmYes = ['yes','yeah','yep','correct','that is',"that's it","that's the one",'right','confirm','yup'];
    const confirmNo  = ['no','nope','wrong','not that one','different','another','not right'];

    const isSick      = !meta.pendingConfirm && sickKeywords.some(k => lastUserMsg.includes(k));
    const isYes       = meta.pendingConfirm && confirmYes.some(k => lastUserMsg.includes(k));
    const isNo        = meta.pendingConfirm && confirmNo.some(k => lastUserMsg.includes(k));
    const isChoice    = meta.awaitingChoice && /\b(one|two|three|1|2|3)\b/.test(lastUserMsg);

    // Confirmed — process
    if (isYes || isChoice) {
      let shift = meta.pendingShift;
      if (isChoice) {
        const n = lastUserMsg.includes('two') || lastUserMsg.includes('2') ? 1
                : lastUserMsg.includes('three') || lastUserMsg.includes('3') ? 2 : 0;
        shift = (meta.upcomingShifts || [])[n] || shift;
      }
      if (shift) {
        const reply = `Perfect, I've recorded your sick day for your ${shift.room_name} shift ${shift.day_label} from ${fmtTime(shift.start_time)} to ${fmtTime(shift.end_time)}, and I'm now arranging cover. Feel better soon, goodbye!`;
        setImmediate(() => processConfirmedSickCall(tenantId, meta.educatorId, shift).catch(console.error));
        return res.json({ response_id: req.body.response_id, content: reply, end_call: true });
      }
    }

    // Declined the shift we suggested — re-ask
    if (isNo) {
      const shifts = meta.upcomingShifts || [];
      if (shifts.length > 1) {
        const list = shifts.map((s, i) => `Option ${i+1}: ${s.day_label} in ${s.room_name} from ${fmtTime(s.start_time)} to ${fmtTime(s.end_time)}`).join('. ');
        meta.awaitingChoice = true;
        meta.pendingConfirm = true;
        return res.json({ response_id: req.body.response_id, content: `No problem. I can see ${shifts.length} upcoming shifts for you. ${list}. Which one are you cancelling? Say the option number.`, metadata: meta });
      }
      meta.pendingConfirm = false;
      return res.json({ response_id: req.body.response_id, content: `I'm sorry about that. Could you tell me which day and room your shift is so I can find it?`, metadata: meta });
    }

    // Initial sick call detected
    if (isSick) {
      if (!meta.educatorId) {
        meta.sickDetected = true;
        return res.json({ response_id: req.body.response_id, content: `I'm sorry to hear that. I wasn't able to identify your number in our system. Could you please tell me your name so I can find your shift?`, metadata: meta });
      }

      const shifts = getUpcomingShifts(meta.educatorId, tenantId);
      if (!shifts.length) {
        const today = new Date().toISOString().split('T')[0];
        D().prepare(`INSERT INTO educator_absences (id,tenant_id,educator_id,date,type,reason,notice_given_mins,notified_via) VALUES(?,?,?,?,?,?,?,?)`)
          .run(uuid(), tenantId, meta.educatorId, today, 'sick', 'Called in sick via Retell — no shifts in roster', 0, 'phone');
        return res.json({ response_id: req.body.response_id, content: `I'm sorry to hear that, ${meta.educatorName || 'there'}. I don't see any upcoming shifts rostered for you in the next two weeks. I've made a note and management will be in touch. Is there anything else I can help with?`, metadata: meta });
      }

      meta.upcomingShifts = shifts;

      if (shifts.length === 1) {
        const s = shifts[0];
        meta.pendingShift   = s;
        meta.pendingConfirm = true;
        return res.json({ response_id: req.body.response_id, content: `I can see you're rostered in the ${s.room_name} ${s.day_label} from ${fmtTime(s.start_time)} to ${fmtTime(s.end_time)}. Is that the shift you need to cancel?`, metadata: meta });
      }

      // Multiple shifts
      const list = shifts.slice(0, 3).map((s, i) =>
        `Option ${i+1}: ${s.day_label} in ${s.room_name} from ${fmtTime(s.start_time)} to ${fmtTime(s.end_time)}`
      ).join('. ');
      meta.pendingConfirm = true;
      meta.awaitingChoice = true;
      return res.json({ response_id: req.body.response_id, content: `I can see you have a few upcoming shifts, ${meta.educatorName}. ${list}. Which shift are you calling about? Say the option number.`, metadata: meta });
    }

    // ── General AI conversation ────────────────────────────────────────────────
    const nameStr = meta.educatorName ? `, ${meta.educatorName}` : '';
    const systemPrompt = settings.ai_persona ||
      `You are a warm, professional AI assistant for ${tenantName}. ` +
      `You help educators and parents with enquiries. ` +
      `If someone mentions being sick or needing to cancel a shift, acknowledge it and help them. ` +
      `Keep responses concise — 1 to 2 sentences. Never use lists or bullet points on a phone call.`;

    const response = await askClaude(messages, systemPrompt);
    const fallback = `I'm not quite sure I understood that${nameStr}. Could you say that again?`;
    const content = response || fallback;

    return res.json({ response_id: req.body.response_id, content, metadata: meta });

  } catch(e) {
    console.error('[Retell:LLM] Exception:', e.message, e.stack?.slice(0, 300));
    return res.json({ response_id: req.body.response_id, content: "I'm sorry, I had a technical issue. Please call back and I'll be happy to help.", end_call: true });
  }
});

// ── Call event webhook (optional — for status tracking) ───────────────────────
webhooks.post('/event/:tenantId', (req, res) => {
  const { event, call } = req.body;
  console.log(`[Retell:event] ${event} call_id=${call?.call_id} from=${call?.from_number}`);
  try {
    if (event === 'call_ended' && call?.call_id) {
      D().prepare(`
        UPDATE voice_calls SET status='completed', ended_at=COALESCE(ended_at,datetime('now')),
        duration_seconds=? WHERE call_sid=?
      `).run(call.duration_ms ? Math.round(call.duration_ms / 1000) : null, call.call_id);
    }
  } catch(e) { console.error('[Retell:event] DB error:', e.message); }
  res.sendStatus(200);
});

// ═══════════════════════════════════════════════════════════════════════════
//  RETELL MANAGEMENT APIs (authenticated)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/retell/status — check config + fetch agent details
router.get('/status', async (req, res) => {
  const s = getSettings(req.tenantId);
  if (!s.retell_api_key) return res.json({ configured: false, agent: null });
  try {
    const agent = s.retell_agent_id
      ? await retellFetch(`/v2/get-agent/${s.retell_agent_id}`, 'GET', null, s.retell_api_key).catch(() => null)
      : null;
    const phoneNumbers = await retellFetch('/v2/list-phone-numbers', 'GET', null, s.retell_api_key).catch(() => []);
    res.json({ configured: true, agent, phone_numbers: phoneNumbers });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/retell/voices — list ElevenLabs voices via Retell
router.get('/voices', async (req, res) => {
  const s = getSettings(req.tenantId);
  if (!s.retell_api_key) return res.status(400).json({ error: 'Retell API key not configured' });
  try {
    // Retell supports multiple voice providers
    const voices = await retellFetch('/v2/list-voices', 'GET', null, s.retell_api_key);
    res.json({ voices: Array.isArray(voices) ? voices : (voices.voices || []) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/retell/agent — create or update the Retell agent for this tenant
router.post('/agent', async (req, res) => {
  const s = getSettings(req.tenantId);
  if (!s.retell_api_key) return res.status(400).json({ error: 'Retell API key not configured' });

  const tenantName = D().prepare('SELECT name FROM tenants WHERE id=?').get(req.tenantId)?.name || 'the centre';
  const base = getBase();
  const llmUrl = `${base}/api/retell/webhook/llm/${req.tenantId}`;

  const {
    voice_id,       // Retell voice ID
    voice_model,    // e.g. 'eleven_flash_v2_5'
    agent_name,
    ambient_sound,  // 'coffee-shop' | 'convention-hall' | 'summer-outdoor' | 'mountain-outdoor' | null
    responsiveness, // 0–1, default 1
    interruption_sensitivity, // 0–1, default 1
  } = req.body;

  const agentPayload = {
    llm_websocket_url: llmUrl, // Retell calls our endpoint each turn
    agent_name: agent_name || `${tenantName} AI Assistant`,
    voice_id: voice_id || 'openai-Alloy', // default safe voice
    voice_model: voice_model || undefined,
    language: s.call_language || 'en-AU',
    responsiveness: responsiveness ?? 1,
    interruption_sensitivity: interruption_sensitivity ?? 1,
    enable_backchannel: true,      // natural "mm-hmm", "yeah" etc
    backchannel_frequency: 0.8,
    backchannel_words: ['right', 'got it', 'sure', 'okay'],
    reminder_trigger_ms: 10000,    // gentle prompt if silence
    reminder_max_count: 2,
    ambient_sound: ambient_sound || null,
    normalize_for_speech: true,    // handles numbers/dates naturally
    end_call_after_silence_ms: 30000,
    max_call_duration_ms: 1800000, // 30 min max
    begin_message: s.inbound_greeting || `Hi, thanks for calling ${tenantName}. This is an AI assistant. How can I help you today?`,
    metadata: { tenant_id: req.tenantId },
  };

  try {
    let agent;
    if (s.retell_agent_id) {
      agent = await retellFetch(`/v2/update-agent/${s.retell_agent_id}`, 'PATCH', agentPayload, s.retell_api_key);
      console.log(`[Retell] Agent updated: ${s.retell_agent_id}`);
    } else {
      agent = await retellFetch('/v2/create-agent', 'POST', agentPayload, s.retell_api_key);
      console.log(`[Retell] Agent created: ${agent.agent_id}`);
      // Save the new agent_id
      D().prepare("UPDATE voice_settings SET retell_agent_id=?, updated_at=datetime('now') WHERE tenant_id=?")
        .run(agent.agent_id, req.tenantId);
    }
    res.json({ ok: true, agent });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/retell/link-number — link a Retell phone number to the agent
router.post('/link-number', async (req, res) => {
  const s = getSettings(req.tenantId);
  if (!s.retell_api_key || !s.retell_agent_id)
    return res.status(400).json({ error: 'Retell API key and agent required' });
  const { phone_number_id } = req.body;
  if (!phone_number_id) return res.status(400).json({ error: 'phone_number_id required' });
  try {
    const result = await retellFetch(
      `/v2/update-phone-number/${phone_number_id}`, 'PATCH',
      { inbound_agent_id: s.retell_agent_id }, s.retell_api_key
    );
    D().prepare("UPDATE voice_settings SET retell_phone_number_id=?, updated_at=datetime('now') WHERE tenant_id=?")
      .run(phone_number_id, req.tenantId);
    res.json({ ok: true, result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/retell/test-call — trigger an outbound test call via Retell
router.post('/test-call', async (req, res) => {
  const s = getSettings(req.tenantId);
  if (!s.retell_api_key || !s.retell_agent_id)
    return res.status(400).json({ error: 'Retell API key and agent required. Create the agent first.' });

  const DEV_OVERRIDE = process.env.DEV_CALL_OVERRIDE || '';
  const to = DEV_OVERRIDE || req.body.to_number;
  if (!to) return res.status(400).json({ error: 'to_number required' });

  if (!s.retell_phone_number_id)
    return res.status(400).json({ error: 'No Retell phone number linked to agent. Link one first.' });

  try {
    const call = await retellFetch('/v2/create-phone-call', 'POST', {
      from_number_id: s.retell_phone_number_id,
      to_number: to,
      override_agent_id: s.retell_agent_id,
      metadata: { tenant_id: req.tenantId, test: true },
    }, s.retell_api_key);

    // Log it
    D().prepare(`INSERT INTO voice_calls (id,tenant_id,call_sid,direction,status,from_number,to_number,purpose) VALUES(?,?,?,?,?,?,?,?)`)
      .run(uuid(), req.tenantId, call.call_id, 'outbound', 'ringing', s.retell_phone_number_id || 'retell', to, 'test');

    res.json({ ok: true, call_id: call.call_id, to: DEV_OVERRIDE ? `${to} (DEV OVERRIDE)` : to });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/retell/llm-url — the URL to paste into Retell dashboard
router.get('/llm-url', (req, res) => {
  res.json({ url: `${getBase()}/api/retell/webhook/llm/${req.tenantId}` });
});

export default router;
export { webhooks as retellWebhooks };
