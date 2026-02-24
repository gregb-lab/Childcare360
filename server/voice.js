// ═══════════════════════════════════════════════════════════════════════════
//  Childcare360 — AI Voice Agent  (v1.9.9)
//  Twilio: outbound + inbound calls with Claude AI + ElevenLabs TTS
// ═══════════════════════════════════════════════════════════════════════════
import { Router } from 'express';
import { mkdirSync, existsSync, writeFileSync, createReadStream } from 'fs';
import { join } from 'path';
import { D, uuid, auditLog } from './db.js';
import { requireAuth, requireTenant, requireRole } from './middleware.js';

const router   = Router();
const webhooks = Router();

const TTS_CACHE_DIR = '/data/tts_cache';

// ─── Core helpers ─────────────────────────────────────────────────────────────

function getBase() {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  // Auto-detect from Railway internal domain
  if (process.env.RAILWAY_STATIC_URL) return process.env.RAILWAY_STATIC_URL.replace(/\/+$/, '');
  return '';
}

function twiml(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}

function safeXml(text) {
  return (text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function getSettings(tenantId) {
  const db = D().prepare('SELECT * FROM voice_settings WHERE tenant_id=?').get(tenantId) || {};
  return {
    ...db,
    twilio_account_sid:  process.env.TWILIO_ACCOUNT_SID  || db.twilio_account_sid,
    twilio_auth_token:   process.env.TWILIO_AUTH_TOKEN   || db.twilio_auth_token,
    twilio_phone_number: process.env.TWILIO_PHONE_NUMBER || db.twilio_phone_number,
    elevenlabs_api_key:  process.env.ELEVENLABS_API_KEY  || db.elevenlabs_api_key,
    elevenlabs_voice_id: db.elevenlabs_voice_id || '21m00Tcm4TlvDq8ikWAM',
    tts_voice:           db.tts_voice || 'Polly.Joanna-Neural',
    ai_persona:          db.ai_persona || 'You are a friendly assistant for a childcare centre.',
    inbound_greeting:    db.inbound_greeting || 'Hello, thank you for calling. How can I help you today?',
    outbound_greeting:   db.outbound_greeting || 'Hello, this is a call from your childcare centre.',
    active:              db.active != null ? db.active : 1,
  };
}

async function getTwilioClient(settings) {
  if (!settings?.twilio_account_sid || !settings?.twilio_auth_token)
    throw new Error('Twilio not configured. Add credentials in Voice Settings.');
  try {
    const mod = await import('twilio');
    const Twilio = mod.default || mod;
    return new Twilio(settings.twilio_account_sid, settings.twilio_auth_token);
  } catch(e) { throw new Error('Twilio package not installed: ' + e.message); }
}

// ─── ElevenLabs TTS ──────────────────────────────────────────────────────────

async function elevenLabsTTS(text, apiKey, voiceId) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId || '21m00Tcm4TlvDq8ikWAM'}`, {
    method: 'POST',
    headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true }
    })
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

// Returns a hosted audio URL, or null to fall back to Twilio <Say>
async function toAudioUrl(text, settings) {
  const key = settings?.elevenlabs_api_key;
  if (!key) return null;
  try {
    mkdirSync(TTS_CACHE_DIR, { recursive: true });
    const filename = `${uuid()}.mp3`;
    const audio = await elevenLabsTTS(text, key, settings.elevenlabs_voice_id);
    writeFileSync(join(TTS_CACHE_DIR, filename), audio);
    return `${getBase()}/api/voice/audio/${filename}`;
  } catch(e) {
    console.error('[ElevenLabs]', e.message, '— falling back to Twilio TTS');
    return null;
  }
}

async function speak(text, settings) {
  const url = await toAudioUrl(text, settings);
  if (url) return `<Play>${url}</Play>`;
  return `<Say voice="${settings?.tts_voice || 'Polly.Joanna-Neural'}">${safeXml(text)}</Say>`;
}

async function gatherWith(action, text, settings) {
  const inner = await speak(text, settings);
  return `<Gather input="speech" action="${action}" method="POST" timeout="10" speechTimeout="3" language="en-AU" speechModel="phone_call" enhanced="true">\n  ${inner}\n</Gather>`;
}

// ─── Conversation helpers ──────────────────────────────────────────────────────

function saveTurn(callId, role, content) {
  try { D().prepare('INSERT INTO voice_call_turns (id,call_id,role,content) VALUES (?,?,?,?)').run(uuid(), callId, role, content); } catch(e) {}
}

function getTranscript(callId) {
  return D().prepare('SELECT role,content FROM voice_call_turns WHERE call_id=? ORDER BY created_at ASC')
    .all(callId).filter(t => t.role !== '_context');
}

function setStatus(callId, status, extra = {}) {
  const sets = ['status=?'], vals = [status];
  if (extra.sid)       { sets.push('call_sid=?');         vals.push(extra.sid); }
  if (extra.duration)  { sets.push('duration_seconds=?'); vals.push(extra.duration); }
  if (extra.recording_url) { sets.push('recording_url=?'); vals.push(extra.recording_url); }
  if (extra.outcome)   { sets.push('outcome=?');          vals.push(extra.outcome); }
  if (extra.error)     { sets.push('error_message=?');    vals.push(extra.error); }
  if (['completed','failed','no-answer','busy','canceled'].includes(status))
    sets.push("ended_at=datetime('now')");
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
      model: 'claude-haiku-4-5-20251001', max_tokens: 150,
      system: `${systemPrompt}\n\nContext: ${context || 'General childcare enquiry.'}\n\nYou are on a live phone call. Keep responses under 2 sentences. Be warm and natural. No lists or bullet points.`,
      messages
    })
  });
  const d = await r.json();
  return d.content?.[0]?.text || "I'm sorry, I didn't catch that. Could you repeat?";
}

// ─── AUDIO FILE SERVING ───────────────────────────────────────────────────────

router.get('/audio/:filename', (req, res) => {
  const { filename } = req.params;
  if (!/^[a-f0-9-]{36}\.mp3$/.test(filename)) return res.status(400).send('Invalid');
  const fp = join(TTS_CACHE_DIR, filename);
  if (!existsSync(fp)) return res.status(404).send('Not found');
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  createReadStream(fp).pipe(res);
});

// ─── ELEVENLABS VOICE LIST ────────────────────────────────────────────────────

router.get('/elevenlabs/voices', requireAuth, requireTenant, async (req, res) => {
  const settings = getSettings(req.tenantId);
  const key = settings?.elevenlabs_api_key;
  if (!key) return res.status(400).json({ error: 'ElevenLabs API key not configured. Add it in Voice Settings first.' });
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
    if (!r.ok) return res.status(r.status).json({ error: `ElevenLabs returned ${r.status}` });
    const data = await r.json();
    res.json({
      voices: (data.voices || []).map(v => ({
        voice_id: v.voice_id, name: v.name, category: v.category,
        description: v.labels?.description || '', accent: v.labels?.accent || '',
        gender: v.labels?.gender || '', age: v.labels?.age || '',
        use_case: v.labels?.use_case || '', preview_url: v.preview_url || null,
      }))
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── ELEVENLABS TEST AUDIO ────────────────────────────────────────────────────

router.post('/elevenlabs/test', requireAuth, requireTenant, async (req, res) => {
  const { text, voice_id } = req.body;
  const settings = getSettings(req.tenantId);
  const key = settings?.elevenlabs_api_key;
  if (!key) return res.status(400).json({ error: 'ElevenLabs API key not configured' });
  try {
    const testText = text || 'Hello! This is a test of your ElevenLabs voice for Childcare360. How does it sound?';
    const audio = await elevenLabsTTS(testText, key, voice_id || settings.elevenlabs_voice_id);
    mkdirSync(TTS_CACHE_DIR, { recursive: true });
    const filename = `${uuid()}.mp3`;
    writeFileSync(join(TTS_CACHE_DIR, filename), audio);
    res.json({ ok: true, url: `${getBase()}/api/voice/audio/${filename}`, bytes: audio.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

router.get('/settings', requireAuth, requireTenant, (req, res) => {
  try {
    const s = getSettings(req.tenantId);
    res.json({
      ...s,
      configured:            !!(s.twilio_account_sid && s.twilio_auth_token && s.twilio_phone_number),
      elevenlabs_configured: !!(s.elevenlabs_api_key),
      twilio_auth_token:     s.twilio_auth_token  ? '••••' + s.twilio_auth_token.slice(-4)  : null,
      elevenlabs_api_key:    s.elevenlabs_api_key ? '••••' + s.elevenlabs_api_key.slice(-4) : null,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/settings', requireAuth, requireTenant, requireRole('owner','admin'), (req, res) => {
  try {
    const { twilio_account_sid, twilio_auth_token, twilio_phone_number,
            tts_voice, ai_persona, inbound_greeting, outbound_greeting, active,
            elevenlabs_api_key, elevenlabs_voice_id } = req.body;
    const existing = getSettings(req.tenantId);
    const id = existing?.id || uuid();
    const authToken = twilio_auth_token?.startsWith('••••') ? existing?.twilio_auth_token : twilio_auth_token;
    const elKey     = elevenlabs_api_key?.startsWith('••••') ? existing?.elevenlabs_api_key : elevenlabs_api_key;
    D().prepare(`
      INSERT INTO voice_settings (id,tenant_id,twilio_account_sid,twilio_auth_token,twilio_phone_number,
        tts_voice,ai_persona,inbound_greeting,outbound_greeting,active,elevenlabs_api_key,elevenlabs_voice_id,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(tenant_id) DO UPDATE SET
        twilio_account_sid=excluded.twilio_account_sid, twilio_auth_token=excluded.twilio_auth_token,
        twilio_phone_number=excluded.twilio_phone_number, tts_voice=excluded.tts_voice,
        ai_persona=excluded.ai_persona, inbound_greeting=excluded.inbound_greeting,
        outbound_greeting=excluded.outbound_greeting, active=excluded.active,
        elevenlabs_api_key=excluded.elevenlabs_api_key, elevenlabs_voice_id=excluded.elevenlabs_voice_id,
        updated_at=excluded.updated_at
    `).run(id, req.tenantId, twilio_account_sid, authToken, twilio_phone_number,
           tts_voice || 'Polly.Joanna-Neural',
           ai_persona || 'You are a friendly assistant for a childcare centre.',
           inbound_greeting || 'Hello, thank you for calling. How can I help you today?',
           outbound_greeting || 'Hello, this is a call from your childcare centre.',
           active ? 1 : 0, elKey || null, elevenlabs_voice_id || '21m00Tcm4TlvDq8ikWAM');
    auditLog(req.userId, req.tenantId, 'voice_settings_updated', {}, req.ip, req.headers['user-agent']);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── CALL HISTORY ─────────────────────────────────────────────────────────────

router.get('/calls', requireAuth, requireTenant, (req, res) => {
  try {
    const calls = D().prepare(`SELECT vc.*, u.name as initiated_by_name FROM voice_calls vc
      LEFT JOIN users u ON u.id=vc.initiated_by WHERE vc.tenant_id=? ORDER BY vc.created_at DESC LIMIT 100`)
      .all(req.tenantId);
    res.json(calls.map(c => ({ ...c, transcript: undefined })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/calls/:id', requireAuth, requireTenant, (req, res) => {
  try {
    const call = D().prepare('SELECT * FROM voice_calls WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!call) return res.status(404).json({ error: 'Not found' });
    res.json({ ...call, turns: getTranscript(req.params.id) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── OUTBOUND CALL ────────────────────────────────────────────────────────────

router.post('/call', requireAuth, requireTenant, async (req, res) => {
  const { to_number, purpose, context_type, context_id, context_data } = req.body;
  if (!to_number) return res.status(400).json({ error: 'to_number required' });
  const settings = getSettings(req.tenantId);
  if (!settings?.twilio_account_sid) return res.status(400).json({ error: 'Voice not configured' });
  const callId = uuid();
  try {
    D().prepare(`INSERT INTO voice_calls (id,tenant_id,direction,status,from_number,to_number,purpose,context_type,context_id,initiated_by,transcript) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(callId, req.tenantId, 'outbound', 'initiated', settings.twilio_phone_number, to_number,
           purpose || 'general', context_type || null, context_id || null, req.userId,
           context_data ? JSON.stringify([{ role: '_context', content: JSON.stringify(context_data) }]) : '[]');
    const client = await getTwilioClient(settings);
    const base = getBase();
    const call = await client.calls.create({
      to: to_number, from: settings.twilio_phone_number,
      url: `${base}/api/voice/webhook/answer/${callId}`,
      statusCallback: `${base}/api/voice/webhook/status/${callId}`,
      statusCallbackMethod: 'POST', statusCallbackEvent: ['initiated','ringing','answered','completed'],
      record: true, recordingStatusCallback: `${base}/api/voice/webhook/recording/${callId}`
    });
    setStatus(callId, 'ringing', { sid: call.sid });
    auditLog(req.userId, req.tenantId, 'voice_call_outbound', { callId, to: to_number, purpose }, req.ip, req.headers['user-agent']);
    res.json({ ok: true, callId, callSid: call.sid });
  } catch(e) { setStatus(callId, 'failed', { error: e.message }); res.status(500).json({ error: e.message }); }
});

// ─── TEST CALL ────────────────────────────────────────────────────────────────

router.post('/test', requireAuth, requireTenant, requireRole('owner','admin'), async (req, res) => {
  const { to_number } = req.body;
  if (!to_number) return res.status(400).json({ error: 'to_number required' });
  const settings = getSettings(req.tenantId);
  if (!settings?.twilio_account_sid) return res.status(400).json({ error: 'Voice not configured' });
  const callId = uuid();
  try {
    D().prepare(`INSERT INTO voice_calls (id,tenant_id,direction,status,from_number,to_number,purpose,initiated_by,transcript) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(callId, req.tenantId, 'outbound', 'initiated', settings.twilio_phone_number, to_number, 'test', req.userId, '[]');
    const client = await getTwilioClient(settings);
    const base = getBase();
    const call = await client.calls.create({
      to: to_number, from: settings.twilio_phone_number,
      url: `${base}/api/voice/webhook/answer/${callId}?test=1`,
      statusCallback: `${base}/api/voice/webhook/status/${callId}`,
      statusCallbackMethod: 'POST', statusCallbackEvent: ['initiated','ringing','answered','completed']
    });
    setStatus(callId, 'ringing', { sid: call.sid });
    res.json({ ok: true, callId, callSid: call.sid, message: `Test call initiated to ${to_number}` });
  } catch(e) { setStatus(callId, 'failed', { error: e.message }); res.status(500).json({ error: e.message }); }
});

// ─── DEBUG ───────────────────────────────────────────────────────────────────
router.get('/debug', requireAuth, requireTenant, (req, res) => {
  const settings = getSettings(req.tenantId);
  const base = getBase();
  res.json({
    base,
    RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN || null,
    RAILWAY_STATIC_URL: process.env.RAILWAY_STATIC_URL || null,
    PUBLIC_URL: process.env.PUBLIC_URL || null,
    voice_active: settings?.active,
    twilio_configured: !!(settings?.twilio_account_sid),
    elevenlabs_configured: !!(settings?.elevenlabs_api_key),
    elevenlabs_voice_id: settings?.elevenlabs_voice_id,
    webhook_url: base ? base + '/api/voice/webhook/answer/TEST' : 'BASE_EMPTY — this is the problem!',
  });
});

// ─── INBOUND URL ──────────────────────────────────────────────────────────────

router.get('/inbound-url', requireAuth, requireTenant, (req, res) => {
  res.json({ url: `${getBase()}/api/voice/webhook/inbound/${req.tenantId}` });
});

// ─── DIAGNOSTICS ─────────────────────────────────────────────────────────────

router.get('/diag', async (req, res) => {
  const r = { timestamp: new Date().toISOString(), checks: {} };
  try { await import('twilio'); r.checks.twilio = { ok: true }; } catch(e) { r.checks.twilio = { ok: false, error: e.message }; }
  r.checks.elevenlabs_key = { ok: !!process.env.ELEVENLABS_API_KEY, value: process.env.ELEVENLABS_API_KEY ? 'set (env)' : 'not in env' };
  r.checks.anthropic_key  = { ok: !!process.env.ANTHROPIC_API_KEY,  value: process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT SET' };
  r.checks.webhook_base   = { ok: !!getBase(), value: getBase() || 'EMPTY' };
  r.checks.tts_cache_dir  = { ok: true, value: TTS_CACHE_DIR };
  try { r.checks.voice_settings = { ok: true, value: D().prepare('SELECT COUNT(*) as n FROM voice_settings').get()?.n + ' rows' }; }
  catch(e) { r.checks.voice_settings = { ok: false, error: e.message }; }
  res.json(r);
});

router.get('/webhook/answer/:callId', (req, res) => {
  res.json({ ok: true, message: 'Webhook route reachable (GET test)', callId: req.params.callId });
});

// ─── TWILIO WEBHOOKS (no auth — called by Twilio) ─────────────────────────────

webhooks.post('/answer/:callId', async (req, res) => {
  const { callId } = req.params;
  const isTest = req.query.test === '1';
  res.type('text/xml');
  try {
    const call = D().prepare('SELECT * FROM voice_calls WHERE id=?').get(callId);
    if (!call) return res.send(twiml('<Say>Sorry, this call could not be connected.</Say><Hangup/>'));
    const settings = getSettings(call.tenant_id);
    setStatus(callId, 'in-progress');

    if (isTest) {
      const msg = 'Hello! This is a test call from Childcare360. Your AI voice agent is working correctly. Have a great day!';
      saveTurn(callId, 'assistant', msg);
      return res.send(twiml((await speak(msg, settings)) + '<Hangup/>'));
    }

    const greeting = settings?.outbound_greeting || 'Hello, this is a call from your childcare centre.';
    saveTurn(callId, 'assistant', greeting);
    const base = getBase();
    const gatherUrl = `${base}/api/voice/webhook/gather/${callId}`;
    res.send(twiml(
      (await gatherWith(gatherUrl, greeting, settings)) +
      (await speak("Sorry, I didn't catch that.", settings)) +
      `<Redirect method="POST">${gatherUrl}</Redirect>`
    ));
  } catch(e) {
    console.error('[Voice] Answer error:', e.message);
    res.send(twiml('<Say>Sorry, there was a technical problem.</Say><Hangup/>'));
  }
});

webhooks.post('/gather/:callId', async (req, res) => {
  const { callId } = req.params;
  const speechResult = req.body.SpeechResult || '';
  res.type('text/xml');
  try {
    const call = D().prepare('SELECT * FROM voice_calls WHERE id=?').get(callId);
    if (!call) return res.send(twiml('<Hangup/>'));
    const settings = getSettings(call.tenant_id);
    const base = getBase();
    const gatherUrl = `${base}/api/voice/webhook/gather/${callId}`;

    if (!speechResult) {
      return res.send(twiml(
        (await gatherWith(gatherUrl, "I'm sorry, I couldn't hear you. Could you please speak again?", settings)) + '<Hangup/>'
      ));
    }

    saveTurn(callId, 'user', speechResult);

    if (['bye','goodbye','thanks bye','no thank you','that\'s all'].some(p => speechResult.toLowerCase().includes(p))) {
      const farewell = "Thank you for your time. Have a wonderful day. Goodbye!";
      saveTurn(callId, 'assistant', farewell);
      setStatus(callId, 'completed', { outcome: 'completed_naturally' });
      return res.send(twiml((await speak(farewell, settings)) + '<Hangup/>'));
    }

    let contextStr = '';
    try { const ctx = JSON.parse(call.transcript || '[]').find(t => t.role === '_context'); if (ctx) contextStr = ctx.content; } catch(e) {}

    const aiResponse = await askClaude(getTranscript(callId), settings?.ai_persona || 'You are a friendly assistant for a childcare centre.', contextStr);
    saveTurn(callId, 'assistant', aiResponse);

    if (['goodbye','have a great day','take care','have a wonderful day'].some(p => aiResponse.toLowerCase().includes(p))) {
      setStatus(callId, 'completed', { outcome: 'completed_naturally' });
      return res.send(twiml((await speak(aiResponse, settings)) + '<Hangup/>'));
    }

    res.send(twiml(
      (await gatherWith(gatherUrl, aiResponse, settings)) +
      (await speak("I didn't catch that. Is there anything else I can help you with?", settings)) +
      `<Redirect method="POST">${gatherUrl}</Redirect>`
    ));
  } catch(e) {
    console.error('[Voice] Gather error:', e.message);
    res.send(twiml('<Say>I\'m sorry, I had a technical issue. Please call back and I\'ll be happy to help.</Say><Hangup/>'));
  }
});

webhooks.post('/inbound/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  res.type('text/xml');
  try {
    const settings = getSettings(tenantId);
    const isActive = settings?.active == null || settings?.active === 1 || settings?.active === true; if (!isActive) return res.send(twiml('<Say>Thank you for calling. We are unable to take your call right now.</Say><Hangup/>'));
    const callId = uuid();
    D().prepare(`INSERT INTO voice_calls (id,tenant_id,call_sid,direction,status,from_number,to_number,purpose,transcript) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(callId, tenantId, req.body.CallSid, 'inbound', 'in-progress', req.body.From || 'unknown', req.body.To || settings.twilio_phone_number, 'inbound', '[]');
    const greeting = settings.inbound_greeting || 'Hello, thank you for calling. How can I help you today?';
    saveTurn(callId, 'assistant', greeting);
    const base = getBase();
    res.send(twiml(
      (await gatherWith(`${base}/api/voice/webhook/gather/${callId}`, greeting, settings)) +
      (await speak("I'm sorry, I didn't catch that. Please call back during business hours.", settings)) + '<Hangup/>'
    ));
  } catch(e) {
    console.error('[Voice] Inbound error:', e.message);
    res.send(twiml('<Say>Thank you for calling. Please try again shortly.</Say><Hangup/>'));
  }
});

webhooks.post('/status/:callId', (req, res) => {
  const { CallStatus, CallDuration } = req.body;
  try { setStatus(req.params.callId, CallStatus === 'completed' ? 'completed' : CallStatus, { duration: CallDuration ? parseInt(CallDuration) : undefined }); } catch(e) {}
  res.sendStatus(204);
});

webhooks.post('/recording/:callId', (req, res) => {
  const { RecordingUrl, RecordingSid } = req.body;
  try { D().prepare('UPDATE voice_calls SET recording_url=?, recording_sid=? WHERE id=?').run(RecordingUrl + '.mp3', RecordingSid, req.params.callId); } catch(e) {}
  res.sendStatus(204);
});

router.use('/webhook', webhooks);

export default router;
export { webhooks as webhookRouter };
