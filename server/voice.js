// ═══════════════════════════════════════════════════════════════════════════
//  Childcare360 — AI Voice Agent  (v1.9.7)
//  Twilio: outbound + inbound calls with Claude AI conversations
// ═══════════════════════════════════════════════════════════════════════════
import { Router } from 'express';
import { createHmac } from 'crypto';
import { D, uuid, auditLog } from './db.js';
import { requireAuth, requireTenant, requireRole } from './middleware.js';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSettings(tenantId) {
  const db = D().prepare('SELECT * FROM voice_settings WHERE tenant_id=?').get(tenantId) || {};
  // Env vars always win over DB values — survive redeploys
  return {
    ...db,
    twilio_account_sid:  process.env.TWILIO_ACCOUNT_SID  || db.twilio_account_sid,
    twilio_auth_token:   process.env.TWILIO_AUTH_TOKEN   || db.twilio_auth_token,
    twilio_phone_number: process.env.TWILIO_PHONE_NUMBER || db.twilio_phone_number,
    tts_voice:           db.tts_voice || 'alice',
    ai_persona:          db.ai_persona || 'You are a friendly assistant for a childcare centre.',
    inbound_greeting:    db.inbound_greeting || 'Hello, thank you for calling. How can I help you today?',
    outbound_greeting:   db.outbound_greeting || 'Hello, this is a call from your childcare centre.',
    active:              db.active ?? 1,
  };
}

async function getTwilioClient(settings) {
  if (!settings?.twilio_account_sid || !settings?.twilio_auth_token) {
    throw new Error('Twilio not configured. Add credentials in Voice Settings.');
  }
  let Twilio;
  try {
    const mod = await import('twilio');
    Twilio = mod.default || mod;
  } catch(e) {
    throw new Error('Twilio package not installed. Run: npm install twilio');
  }
  return new Twilio(settings.twilio_account_sid, settings.twilio_auth_token);
}

function getBase() {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return process.env.PUBLIC_URL || '';
}

function twiml(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}

function say(text, voice = 'alice') {
  const safe = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<Say voice="${voice}">${safe}</Say>`;
}

function gather(action, prompt, voice = 'alice') {
  const safe = prompt.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<Gather input="speech" action="${action}" method="POST" timeout="10" speechTimeout="3" language="en-US" speechModel="phone_call" enhanced="true">
  <Say voice="${voice}">${safe}</Say>
</Gather>`;
}

function saveTurn(callId, role, content) {
  try {
    D().prepare('INSERT INTO voice_call_turns (id,call_id,role,content) VALUES (?,?,?,?)')
      .run(uuid(), callId, role, content);
  } catch(e) {}
}

function getTranscript(callId) {
  return D().prepare('SELECT role,content FROM voice_call_turns WHERE call_id=? ORDER BY created_at ASC')
    .all(callId).filter(t => t.role !== '_context');
}

function setStatus(callId, status, extra = {}) {
  const sets = ['status=?'];
  const vals = [status];
  if (extra.sid)           { sets.push('call_sid=?');           vals.push(extra.sid); }
  if (extra.duration)      { sets.push('duration_seconds=?');   vals.push(extra.duration); }
  if (extra.recording_url) { sets.push('recording_url=?');      vals.push(extra.recording_url); }
  if (extra.outcome)       { sets.push('outcome=?');            vals.push(extra.outcome); }
  if (extra.error)         { sets.push('error_message=?');      vals.push(extra.error); }
  if (['completed','failed','no-answer','busy','canceled'].includes(status)) {
    sets.push("ended_at=datetime('now')");
  }
  vals.push(callId);
  try { D().prepare(`UPDATE voice_calls SET ${sets.join(',')} WHERE id=?`).run(...vals); } catch(e) {}
}

async function askClaude(transcript, systemPrompt, context) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return "I'm sorry, the AI system is not available right now.";
  const messages = transcript.map(t => ({ role: t.role === 'assistant' ? 'assistant' : 'user', content: t.content }));
  if (!messages.length) return null;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system: `${systemPrompt}\n\nContext: ${context || 'General childcare enquiry.'}\n\nYou are on a live phone call. Keep responses under 2 sentences. Be warm and natural. No lists or bullet points.`,
      messages
    })
  });
  const d = await r.json();
  return d.content?.[0]?.text || "I'm sorry, I didn't catch that. Could you repeat?";
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

router.get('/settings', requireAuth, requireTenant, (req, res) => {
  try {
    const s = getSettings(req.tenantId);
    if (!s) return res.json({ configured: false });
    res.json({
      ...s,
      configured: !!(s.twilio_account_sid && s.twilio_auth_token && s.twilio_phone_number),
      twilio_auth_token: s.twilio_auth_token ? '••••' + s.twilio_auth_token.slice(-4) : null
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/settings', requireAuth, requireTenant, requireRole('owner','admin'), (req, res) => {
  try {
    const { twilio_account_sid, twilio_auth_token, twilio_phone_number,
            tts_voice, ai_persona, inbound_greeting, outbound_greeting, active } = req.body;
    const existing = getSettings(req.tenantId);
    const id = existing?.id || uuid();
    const authToken = twilio_auth_token?.startsWith('••••') ? existing?.twilio_auth_token : twilio_auth_token;
    D().prepare(`
      INSERT INTO voice_settings (id,tenant_id,twilio_account_sid,twilio_auth_token,twilio_phone_number,
        tts_voice,ai_persona,inbound_greeting,outbound_greeting,active,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(tenant_id) DO UPDATE SET
        twilio_account_sid=excluded.twilio_account_sid, twilio_auth_token=excluded.twilio_auth_token,
        twilio_phone_number=excluded.twilio_phone_number, tts_voice=excluded.tts_voice,
        ai_persona=excluded.ai_persona, inbound_greeting=excluded.inbound_greeting,
        outbound_greeting=excluded.outbound_greeting, active=excluded.active, updated_at=excluded.updated_at
    `).run(id, req.tenantId, twilio_account_sid, authToken, twilio_phone_number,
           tts_voice || 'alice', ai_persona || 'You are a friendly assistant for a childcare centre.',
           inbound_greeting || 'Hello, thank you for calling. How can I help you today?',
           outbound_greeting || 'Hello, this is a call from your childcare centre.',
           active ? 1 : 0);
    auditLog(req.userId, req.tenantId, 'voice_settings_updated', {}, req.ip, req.headers['user-agent']);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── CALL HISTORY ─────────────────────────────────────────────────────────────

router.get('/calls', requireAuth, requireTenant, (req, res) => {
  try {
    const calls = D().prepare(`
      SELECT vc.*, u.name as initiated_by_name
      FROM voice_calls vc LEFT JOIN users u ON u.id=vc.initiated_by
      WHERE vc.tenant_id=? ORDER BY vc.created_at DESC LIMIT 100
    `).all(req.tenantId);
    res.json(calls.map(c => ({ ...c, transcript: undefined }))); // don't send full transcript in list
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/calls/:id', requireAuth, requireTenant, (req, res) => {
  try {
    const call = D().prepare('SELECT * FROM voice_calls WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!call) return res.status(404).json({ error: 'Not found' });
    const turns = getTranscript(req.params.id);
    res.json({ ...call, turns });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── OUTBOUND CALL ────────────────────────────────────────────────────────────

router.post('/call', requireAuth, requireTenant, async (req, res) => {
  const { to_number, purpose, context_type, context_id, context_data } = req.body;
  if (!to_number) return res.status(400).json({ error: 'to_number required' });

  const settings = getSettings(req.tenantId);
  if (!settings?.twilio_account_sid) return res.status(400).json({ error: 'Voice not configured. Set up Twilio in Voice Settings.' });

  const callId = uuid();
  try {
    D().prepare(`INSERT INTO voice_calls (id,tenant_id,direction,status,from_number,to_number,purpose,context_type,context_id,initiated_by,transcript)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(callId, req.tenantId, 'outbound', 'initiated',
           settings.twilio_phone_number, to_number, purpose || 'general',
           context_type || null, context_id || null, req.userId,
           context_data ? JSON.stringify([{ role: '_context', content: JSON.stringify(context_data) }]) : '[]');

    const base = getBase();
    const client = await getTwilioClient(settings);
    const call = await client.calls.create({
      to: to_number,
      from: settings.twilio_phone_number,
      url: `${base}/api/voice/webhook/answer/${callId}`,
      statusCallback: `${base}/api/voice/webhook/status/${callId}`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated','ringing','answered','completed'],
      record: true,
      recordingStatusCallback: `${base}/api/voice/webhook/recording/${callId}`
    });

    setStatus(callId, 'ringing', { sid: call.sid });
    auditLog(req.userId, req.tenantId, 'voice_call_outbound', { callId, to: to_number, purpose }, req.ip, req.headers['user-agent']);
    res.json({ ok: true, callId, callSid: call.sid });

  } catch(e) {
    setStatus(callId, 'failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─── TEST CALL ────────────────────────────────────────────────────────────────

router.post('/test', requireAuth, requireTenant, requireRole('owner','admin'), async (req, res) => {
  const { to_number } = req.body;
  if (!to_number) return res.status(400).json({ error: 'to_number required' });
  const settings = getSettings(req.tenantId);
  if (!settings?.twilio_account_sid) return res.status(400).json({ error: 'Voice not configured' });

  const callId = uuid();
  try {
    D().prepare(`INSERT INTO voice_calls (id,tenant_id,direction,status,from_number,to_number,purpose,initiated_by,transcript)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(callId, req.tenantId, 'outbound', 'initiated',
           settings.twilio_phone_number, to_number, 'test', req.userId, '[]');

    const base = getBase();
    const client = await getTwilioClient(settings);
    const call = await client.calls.create({
      to: to_number,
      from: settings.twilio_phone_number,
      url: `${base}/api/voice/webhook/answer/${callId}?test=1`,
      statusCallback: `${base}/api/voice/webhook/status/${callId}`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated','ringing','answered','completed']
    });

    setStatus(callId, 'ringing', { sid: call.sid });
    res.json({ ok: true, callId, callSid: call.sid, message: `Test call initiated to ${to_number}` });
  } catch(e) {
    setStatus(callId, 'failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─── INBOUND URL helper ───────────────────────────────────────────────────────

router.get('/inbound-url', requireAuth, requireTenant, (req, res) => {
  const base = getBase();
  res.json({ url: `${base}/api/voice/webhook/inbound/${req.tenantId}` });
});


// ─── DIAGNOSTICS (no auth — for debugging) ───────────────────────────────────
router.get('/diag', async (req, res) => {
  const results = { timestamp: new Date().toISOString(), checks: {} };

  // 1. Check twilio package
  try {
    const mod = await import('twilio');
    results.checks.twilio_installed = { ok: true, value: 'installed' };
  } catch(e) {
    results.checks.twilio_installed = { ok: false, error: e.message };
  }

  // 2. Check env vars
  results.checks.public_url        = { ok: !!process.env.PUBLIC_URL,          value: process.env.PUBLIC_URL || 'NOT SET' };
  results.checks.twilio_sid_env    = { ok: !!process.env.TWILIO_ACCOUNT_SID,  value: process.env.TWILIO_ACCOUNT_SID ? process.env.TWILIO_ACCOUNT_SID.slice(0,6)+'...' : 'NOT SET - add to Railway Variables' };
  results.checks.twilio_token_env  = { ok: !!process.env.TWILIO_AUTH_TOKEN,   value: process.env.TWILIO_AUTH_TOKEN ? 'set' : 'NOT SET - add to Railway Variables' };
  results.checks.twilio_number_env = { ok: !!process.env.TWILIO_PHONE_NUMBER, value: process.env.TWILIO_PHONE_NUMBER || 'NOT SET - add to Railway Variables' };
  results.checks.anthropic_key   = { ok: !!process.env.ANTHROPIC_API_KEY,  value: process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT SET' };
  results.checks.railway_domain  = { ok: !!process.env.RAILWAY_PUBLIC_DOMAIN, value: process.env.RAILWAY_PUBLIC_DOMAIN || 'NOT SET' };

  // 3. Check voice_settings table
  try {
    const rows = D().prepare('SELECT COUNT(*) as n FROM voice_settings').get();
    results.checks.voice_settings_table = { ok: true, value: `${rows.n} rows` };
  } catch(e) {
    results.checks.voice_settings_table = { ok: false, error: e.message };
  }

  // 4. Check voice_calls table
  try {
    const rows = D().prepare('SELECT COUNT(*) as n FROM voice_calls').get();
    results.checks.voice_calls_table = { ok: true, value: `${rows.n} rows` };
  } catch(e) {
    results.checks.voice_calls_table = { ok: false, error: e.message };
  }

  // 5. Webhook base URL
  results.checks.webhook_base = { ok: !!getBase(), value: getBase() || 'EMPTY - set PUBLIC_URL' };
  results.checks.sample_webhook = { value: `${getBase()}/api/voice/webhook/answer/TEST_ID` };

  // 6. Recent calls
  try {
    const recent = D().prepare('SELECT id,status,to_number,created_at FROM voice_calls ORDER BY created_at DESC LIMIT 3').all();
    results.checks.recent_calls = { ok: true, value: recent };
  } catch(e) {
    results.checks.recent_calls = { ok: false, error: e.message };
  }

  const allOk = Object.values(results.checks).every(c => c.ok !== false);
  res.status(allOk ? 200 : 500).json(results);
});

// Simple GET on webhook answer for browser testing
router.get('/webhook/answer/:callId', (req, res) => {
  res.json({ 
    ok: true, 
    message: 'Voice webhook route is reachable',
    callId: req.params.callId,
    note: 'This is a GET test. Twilio sends POST requests.',
    base: getBase()
  });
});

// ─── TWILIO WEBHOOKS (no auth — called by Twilio) ─────────────────────────────

const webhooks = Router();

// Answer outbound call
webhooks.post('/answer/:callId', async (req, res) => {
  const { callId } = req.params;
  const isTest = req.query.test === '1';
  res.type('text/xml');
  console.log(`[Voice] Answer webhook hit — callId: ${callId}, body keys: ${Object.keys(req.body || {}).join(',')}`);

  try {
    const call = D().prepare('SELECT * FROM voice_calls WHERE id=?').get(callId);
    if (!call) {
      console.error(`[Voice] Call not found: ${callId}`);
      return res.send(twiml(say('Sorry, this call could not be connected.') + '<Hangup/>'));
    }

    const settings = getSettings(call.tenant_id);
    const voice = settings?.tts_voice || 'alice';

    setStatus(callId, 'in-progress');

    if (isTest) {
      const msg = 'Hello! This is a test call from Childcare360. Your AI voice agent is configured and working correctly. Have a great day!';
      saveTurn(callId, 'assistant', msg);
      return res.send(twiml(say(msg, voice) + '<Hangup/>'));
    }

    // Get any context stored for this call
    let contextStr = '';
    try {
      const raw = JSON.parse(call.transcript || '[]');
      const ctx = raw.find(t => t.role === '_context');
      if (ctx) contextStr = ctx.content;
    } catch(e) {}

    const greeting = settings?.outbound_greeting || 'Hello, this is a call from your childcare centre.';
    saveTurn(callId, 'assistant', greeting);

    const base = getBase();
    const gatherUrl = `${base}/api/voice/webhook/gather/${callId}`;

    res.send(twiml(
      gather(gatherUrl, greeting, voice) +
      say("Sorry, I didn't catch that.", voice) +
      `<Redirect method="POST">${gatherUrl}</Redirect>`
    ));

  } catch(e) {
    console.error('Webhook answer error:', e.message);
    res.send(twiml(say('Sorry, there was a technical problem.') + '<Hangup/>'));
  }
});

// Handle speech input during outbound conversation
webhooks.post('/gather/:callId', async (req, res) => {
  const { callId } = req.params;
  const speechResult = req.body.SpeechResult || '';
  const confidence = parseFloat(req.body.Confidence || '0');
  res.type('text/xml');

  try {
    const call = D().prepare('SELECT * FROM voice_calls WHERE id=?').get(callId);
    if (!call) return res.send(twiml('<Hangup/>'));

    const settings = getSettings(call.tenant_id);
    const voice = settings?.tts_voice || 'alice';
    const base = getBase();
    const gatherUrl = `${base}/api/voice/webhook/gather/${callId}`;

    if (!speechResult) {
      return res.send(twiml(
        gather(gatherUrl, "I'm sorry, I couldn't hear you. Could you please speak again?", voice) +
        '<Hangup/>'
      ));
    }

    // Save what the caller said
    saveTurn(callId, 'user', speechResult);

    // Check for goodbye intent
    const lowerSpeech = speechResult.toLowerCase();
    if (['bye','goodbye','thanks bye','no thank you','that\'s all'].some(p => lowerSpeech.includes(p))) {
      const farewell = "Thank you for your time. Have a wonderful day. Goodbye!";
      saveTurn(callId, 'assistant', farewell);
      setStatus(callId, 'completed', { outcome: 'completed_naturally' });
      return res.send(twiml(say(farewell, voice) + '<Hangup/>'));
    }

    // Get context
    let contextStr = '';
    try {
      const raw = JSON.parse(call.transcript || '[]');
      const ctx = raw.find(t => t.role === '_context');
      if (ctx) contextStr = ctx.content;
    } catch(e) {}

    const transcript = getTranscript(callId);
    const persona = settings?.ai_persona || 'You are a friendly assistant for a childcare centre.';

    // Get AI response
    const aiResponse = await askClaude(transcript, persona, contextStr);
    saveTurn(callId, 'assistant', aiResponse);

    // Check if AI wants to end the call
    const endsCall = aiResponse.toLowerCase().includes('goodbye') ||
                     aiResponse.toLowerCase().includes('have a great day') ||
                     aiResponse.toLowerCase().includes('take care');

    if (endsCall) {
      setStatus(callId, 'completed', { outcome: 'completed_naturally' });
      return res.send(twiml(say(aiResponse, voice) + '<Hangup/>'));
    }

    res.send(twiml(
      gather(gatherUrl, aiResponse, voice) +
      say("I didn't catch that. Is there anything else I can help you with?", voice) +
      `<Redirect method="POST">${gatherUrl}</Redirect>`
    ));

  } catch(e) {
    console.error('Gather webhook error:', e.message);
    res.send(twiml(
      say("I'm sorry, I had a technical issue. Please call back and I'll be happy to help.", 'alice') +
      '<Hangup/>'
    ));
  }
});

// Inbound call from Twilio
webhooks.post('/inbound/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  res.type('text/xml');

  try {
    const settings = getSettings(tenantId);
    if (!settings?.active) {
      return res.send(twiml(
        say('Thank you for calling. We are unable to take your call right now. Please try again later.') +
        '<Hangup/>'
      ));
    }

    const callId = uuid();
    D().prepare(`INSERT INTO voice_calls (id,tenant_id,call_sid,direction,status,from_number,to_number,purpose,transcript)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(callId, tenantId, req.body.CallSid, 'inbound', 'in-progress',
           req.body.From || 'unknown', req.body.To || settings.twilio_phone_number, 'inbound', '[]');

    const voice = settings.tts_voice || 'alice';
    const greeting = settings.inbound_greeting || 'Hello, thank you for calling. How can I help you today?';
    saveTurn(callId, 'assistant', greeting);

    const base = getBase();
    res.send(twiml(
      gather(`${base}/api/voice/webhook/gather/${callId}`, greeting, voice) +
      say("I'm sorry, I didn't catch that. Please call back during business hours.", voice) +
      '<Hangup/>'
    ));

  } catch(e) {
    console.error('Inbound webhook error:', e.message);
    res.send(twiml(say('Thank you for calling. Please try again shortly.') + '<Hangup/>'));
  }
});

// Call status updates from Twilio
webhooks.post('/status/:callId', (req, res) => {
  const { callId } = req.params;
  const { CallStatus, CallDuration } = req.body;
  try {
    const duration = CallDuration ? parseInt(CallDuration) : undefined;
    setStatus(callId, CallStatus === 'completed' ? 'completed' : CallStatus, { duration });
  } catch(e) {}
  res.sendStatus(204);
});

// Recording ready
webhooks.post('/recording/:callId', (req, res) => {
  const { callId } = req.params;
  const { RecordingUrl, RecordingSid } = req.body;
  try {
    D().prepare('UPDATE voice_calls SET recording_url=?, recording_sid=? WHERE id=?')
      .run(RecordingUrl + '.mp3', RecordingSid, callId);
  } catch(e) {}
  res.sendStatus(204);
});

// Mount webhooks without auth
router.use('/webhook', webhooks);

export default router;
export { webhooks as webhookRouter };
