// ═══════════════════════════════════════════════════════════════════════════
//  Childcare360 — AI Voice Agent  (v1.9.9)
//  Twilio: outbound + inbound calls with Claude AI + ElevenLabs TTS
// ═══════════════════════════════════════════════════════════════════════════
import { Router } from 'express';
import { mkdirSync, existsSync, writeFileSync, createReadStream } from 'fs';
import { Readable } from 'stream';
import { join } from 'path';
import { D, uuid, auditLog } from './db.js';
import { requireAuth, requireTenant, requireRole } from './middleware.js';

const router   = Router();
const webhooks = Router();

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data';
const TTS_CACHE_DIR = DATA_DIR + '/tts_cache';

// ── DEVELOPMENT SAFETY OVERRIDE ──────────────────────────────────────────────
// All outbound calls are redirected to this number regardless of the intended
// recipient. Remove DEV_CALL_OVERRIDE from env (or set to empty) to disable.
// This prevents accidental calls to real parents/staff during testing.
const DEV_CALL_OVERRIDE = process.env.DEV_CALL_OVERRIDE || '+61413880015';
function safeNumber(intended) {
  if (DEV_CALL_OVERRIDE) {
    console.log(`[Voice] DEV OVERRIDE: redirecting ${intended} → ${DEV_CALL_OVERRIDE}`);
    return DEV_CALL_OVERRIDE;
  }
  return intended;
}

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
    elevenlabs_voice_id:     db.elevenlabs_voice_id || '21m00Tcm4TlvDq8ikWAM',
    elevenlabs_model:        db.elevenlabs_model    || 'eleven_flash_v2_5',
    call_language:           db.call_language       || 'en-AU',
    voice_provider:          db.voice_provider      || 'twilio',
    retell_api_key:          process.env.RETELL_API_KEY || db.retell_api_key,
    retell_agent_id:         db.retell_agent_id,
    retell_phone_number_id:  db.retell_phone_number_id,
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

// ElevenLabs model options (exposed to frontend)
const EL_MODELS = [
  { id: 'eleven_flash_v2_5',       name: 'Flash v2.5 — fastest, lowest latency (recommended)', multilingual: true  },
  { id: 'eleven_turbo_v2_5',       name: 'Turbo v2.5 — fast, high quality',                    multilingual: true  },
  { id: 'eleven_multilingual_v2',  name: 'Multilingual v2 — best quality',                     multilingual: true  },
  { id: 'eleven_turbo_v2',         name: 'Turbo v2 — English only',                            multilingual: false },
  { id: 'eleven_monolingual_v1',   name: 'Monolingual v1 — legacy',                            multilingual: false },
];

// ─── ElevenLabs streaming TTS ────────────────────────────────────────────────
// Architecture: start the EL request immediately, store the response stream in
// a Map, respond to Twilio with a <Play> pointing to our stream proxy endpoint.
// Twilio fetches that URL and we pipe EL bytes as they arrive — first audio
// bytes reach Twilio in ~250ms instead of waiting for the full file (~800ms).

const streamTokens = new Map(); // token -> { stream: NodeReadable, expires: ms }

// Periodically clean up expired tokens (shouldn't accumulate but belt+suspenders)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of streamTokens) { if (v.expires < now) streamTokens.delete(k); }
}, 60000);

// In-process URL cache for repeated phrases (greetings, farewells etc)
const ttsUrlCache = new Map();
const TTS_URL_CACHE_MAX = 100;

async function elevenLabsStream(text, settings) {
  const key = settings?.elevenlabs_api_key;
  if (!key) return null;

  const voiceId = settings.elevenlabs_voice_id || '21m00Tcm4TlvDq8ikWAM';
  const model   = settings.elevenlabs_model    || 'eleven_flash_v2_5';

  // Check URL cache for identical phrases
  const cacheKey = `${voiceId}|${model}|${text}`;
  if (ttsUrlCache.has(cacheKey)) {
    return `<Play>${ttsUrlCache.get(cacheKey)}</Play>`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?optimize_streaming_latency=4&output_format=mp3_44100_64`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': key },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true }
        })
      }
    );
    clearTimeout(timeout);
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 150)}`);

    // Convert Web ReadableStream → Node.js Readable so we can pipe it
    const nodeStream = Readable.fromWeb(r.body);
    const token = uuid();
    streamTokens.set(token, { stream: nodeStream, expires: Date.now() + 30000 });
    setTimeout(() => streamTokens.delete(token), 30000);

    const url = `${getBase()}/api/voice/audio/stream/${token}`;
    console.log(`[ElevenLabs] stream token created: ${token}`);
    return `<Play>${url}</Play>`;

  } catch(e) {
    console.error('[ElevenLabs] stream FAIL:', e.message, '— falling back to Polly');
    return null;
  }
}

// Twilio neural voice map by language
const POLLY_VOICE_MAP = {
  'en-AU': 'Polly.Olivia-Neural',
  'en-US': 'Polly.Joanna-Neural',
  'en-GB': 'Polly.Amy-Neural',
  'zh-CN': 'Polly.Zhiyu-Neural',
  'ja-JP': 'Polly.Kazuha-Neural',
  'ko-KR': 'Polly.Seoyeon-Neural',
  'fr-FR': 'Polly.Lea-Neural',
  'de-DE': 'Polly.Vicki-Neural',
  'it-IT': 'Polly.Bianca-Neural',
  'es-ES': 'Polly.Lucia-Neural',
  'pt-BR': 'Polly.Vitoria-Neural',
  'ar-SA': 'Polly.Zeina',
  'vi-VN': 'Polly.Joanna-Neural',  // fallback
  'hi-IN': 'Polly.Aditi',
};

function speakPolly(text, settings) {
  const lang  = settings?.call_language || 'en-AU';
  const voice = POLLY_VOICE_MAP[lang] || settings?.tts_voice || 'Polly.Olivia-Neural';
  return `<Say voice="${voice}">${safeXml(text)}</Say>`;
}

// speak — tries ElevenLabs streaming, falls back to Polly immediately.
// EL stream is kicked off and handed to Twilio as it arrives — no full-file wait.
async function speak(text, settings) {
  const el = await elevenLabsStream(text, settings);
  if (el) return el;
  return speakPolly(text, settings);
}

// gatherWith — speechTimeout="auto" is THE key latency fix.
// Twilio uses speech-end detection instead of waiting N seconds of silence.
async function gatherWith(action, text, settings) {
  const inner = await speak(text, settings);
  const lang  = settings?.call_language || 'en-AU';
  return `<Gather input="speech" action="${action}" method="POST" timeout="10" speechTimeout="auto" language="${lang}" speechModel="phone_call" enhanced="true">\n  ${inner}\n</Gather>`;
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
  if (!key) { console.error('[Claude] ANTHROPIC_API_KEY not set'); return "I'm sorry, the AI system is not available right now. Please call back during business hours."; }

  // Build messages — Claude requires first message is role:user
  // Filter out _context entries, then ensure we start with a user turn
  let messages = transcript
    .filter(t => t.role !== '_context')
    .map(t => ({ role: t.role === 'assistant' ? 'assistant' : 'user', content: t.content || '' }))
    .filter(t => t.content.trim());

  // Strip leading assistant turns (Claude API rejects these)
  while (messages.length && messages[0].role === 'assistant') messages.shift();

  // Merge consecutive same-role messages (Claude also rejects these)
  const merged = [];
  for (const m of messages) {
    if (merged.length && merged[merged.length - 1].role === m.role) {
      merged[merged.length - 1].content += ' ' + m.content;
    } else {
      merged.push({ ...m });
    }
  }

  if (!merged.length) { console.error('[Claude] No valid messages after normalisation'); return null; }

  console.log(`[Claude] Sending ${merged.length} messages to Claude. First role: ${merged[0].role}`);

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 200,
        system: `${systemPrompt}\n\nContext: ${context || 'General childcare centre enquiry.'}\n\nYou are on a live phone call. Keep responses short — 1 to 2 sentences maximum. Be warm and natural. No lists, no bullet points, no markdown.`,
        messages: merged
      })
    });
    const d = await r.json();
    if (!r.ok) {
      console.error('[Claude] API error:', JSON.stringify(d).slice(0, 300));
      return "I'm sorry, I had a technical problem. Could you please repeat that?";
    }
    const text = d.content?.[0]?.text;
    if (!text) { console.error('[Claude] Empty response:', JSON.stringify(d).slice(0, 200)); return "I'm sorry, I didn't quite catch that. Could you say that again?"; }
    return text;
  } catch(e) {
    console.error('[Claude] Fetch exception:', e.message);
    return "I'm sorry, I'm having trouble connecting right now. Please try again.";
  }
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
    const headers = { 'xi-api-key': key };
    const mapVoice = (v, source) => ({
      voice_id: v.voice_id, name: v.name,
      category: source || v.category || 'library',
      accent: v.labels?.accent || v.accent || '',
      gender: v.labels?.gender || v.gender || '',
      age: v.labels?.age || '',
      language: v.labels?.language || v.language || '',
      use_case: v.labels?.use_case || v.use_case || '',
      preview_url: v.preview_url || null,
    });

    // 1. Fetch user's own voices (library)
    const myR = await fetch('https://api.elevenlabs.io/v1/voices', { headers });
    const myData = myR.ok ? await myR.json() : { voices: [] };
    const myVoices = (myData.voices || []).map(v => mapVoice(v, 'my_library'));

    // 2. Fetch shared voice library with pagination (up to 500)
    let sharedVoices = [];
    try {
      let page = 0;
      while (sharedVoices.length < 500) {
        const sR = await fetch(
          `https://api.elevenlabs.io/v1/shared-voices?page_size=100&page=${page}&sort=trending`,
          { headers }
        );
        if (!sR.ok) break;
        const sData = await sR.json();
        const batch = (sData.voices || []).map(v => mapVoice(v, 'shared'));
        sharedVoices.push(...batch);
        if (batch.length < 100) break;
        page++;
      }
    } catch(e) {
      console.warn('[ElevenLabs] shared voices fetch failed:', e.message);
    }

    // Dedupe by voice_id — own library first
    const seen = new Set();
    const all = [...myVoices, ...sharedVoices].filter(v => {
      if (seen.has(v.voice_id)) return false;
      seen.add(v.voice_id);
      return true;
    });

    res.json({ voices: all, models: EL_MODELS, total: all.length, my_library: myVoices.length, shared: sharedVoices.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/elevenlabs/models', requireAuth, requireTenant, (req, res) => {
  res.json({ models: EL_MODELS });
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
      retell_configured:     !!(s.retell_api_key),
      voice_provider:        s.voice_provider || 'twilio',
      twilio_auth_token:     s.twilio_auth_token  ? '••••' + s.twilio_auth_token.slice(-4)  : null,
      elevenlabs_api_key:    s.elevenlabs_api_key ? '••••' + s.elevenlabs_api_key.slice(-4) : null,
      retell_api_key:        s.retell_api_key     ? '••••' + s.retell_api_key.slice(-4)     : null,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/settings', requireAuth, requireTenant, (req, res) => {
  try {
    const { twilio_account_sid, twilio_auth_token, twilio_phone_number,
            tts_voice, ai_persona, inbound_greeting, outbound_greeting, active,
            elevenlabs_api_key, elevenlabs_voice_id, elevenlabs_model, call_language,
            voice_provider, retell_api_key, retell_agent_id, retell_phone_number_id } = req.body;
    const existing = getSettings(req.tenantId);
    const id = existing?.id || uuid();
    const authToken    = twilio_auth_token?.startsWith('••••') ? existing?.twilio_auth_token : twilio_auth_token;
    const elKey        = elevenlabs_api_key?.startsWith('••••')  ? existing?.elevenlabs_api_key  : elevenlabs_api_key;
    const retellKey    = retell_api_key?.startsWith('••••')      ? existing?.retell_api_key      : retell_api_key;
    D().prepare(`
      INSERT INTO voice_settings (id,tenant_id,twilio_account_sid,twilio_auth_token,twilio_phone_number,
        tts_voice,ai_persona,inbound_greeting,outbound_greeting,active,
        elevenlabs_api_key,elevenlabs_voice_id,elevenlabs_model,call_language,
        voice_provider,retell_api_key,retell_agent_id,retell_phone_number_id,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(tenant_id) DO UPDATE SET
        twilio_account_sid=excluded.twilio_account_sid, twilio_auth_token=excluded.twilio_auth_token,
        twilio_phone_number=excluded.twilio_phone_number, tts_voice=excluded.tts_voice,
        ai_persona=excluded.ai_persona, inbound_greeting=excluded.inbound_greeting,
        outbound_greeting=excluded.outbound_greeting, active=excluded.active,
        elevenlabs_api_key=excluded.elevenlabs_api_key, elevenlabs_voice_id=excluded.elevenlabs_voice_id,
        elevenlabs_model=excluded.elevenlabs_model, call_language=excluded.call_language,
        voice_provider=excluded.voice_provider, retell_api_key=excluded.retell_api_key,
        retell_agent_id=excluded.retell_agent_id, retell_phone_number_id=excluded.retell_phone_number_id,
        updated_at=excluded.updated_at
    `).run(id, req.tenantId, twilio_account_sid, authToken, twilio_phone_number,
           tts_voice || 'Polly.Joanna-Neural',
           ai_persona || 'You are a friendly assistant for a childcare centre.',
           inbound_greeting || 'Hello, thank you for calling. How can I help you today?',
           outbound_greeting || 'Hello, this is a call from your childcare centre.',
           active ? 1 : 0, elKey || null,
           elevenlabs_voice_id || '21m00Tcm4TlvDq8ikWAM',
           elevenlabs_model || 'eleven_flash_v2_5',
           call_language || 'en-AU',
           voice_provider || 'twilio',
           retellKey || null, retell_agent_id || null, retell_phone_number_id || null);
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
  const actualNumber = safeNumber(to_number);
  const callId = uuid();
  try {
    D().prepare(`INSERT INTO voice_calls (id,tenant_id,direction,status,from_number,to_number,purpose,context_type,context_id,initiated_by,transcript) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(callId, req.tenantId, 'outbound', 'initiated', settings.twilio_phone_number, actualNumber,
           purpose || 'general', context_type || null, context_id || null, req.userId,
           context_data ? JSON.stringify([{ role: '_context', content: JSON.stringify(context_data) }]) : '[]');
    const client = await getTwilioClient(settings);
    const base = getBase();
    const call = await client.calls.create({
      to: actualNumber, from: settings.twilio_phone_number,
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

router.post('/test', requireAuth, requireTenant, async (req, res) => {
  const { to_number } = req.body;
  if (!to_number) return res.status(400).json({ error: 'to_number required' });
  const settings = getSettings(req.tenantId);
  if (!settings?.twilio_account_sid) return res.status(400).json({ error: 'Voice not configured' });
  const actualNumber = safeNumber(to_number);
  const callId = uuid();
  try {
    D().prepare(`INSERT INTO voice_calls (id,tenant_id,direction,status,from_number,to_number,purpose,initiated_by,transcript) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(callId, req.tenantId, 'outbound', 'initiated', settings.twilio_phone_number, actualNumber, 'test', req.userId, '[]');
    const client = await getTwilioClient(settings);
    const base = getBase();
    const call = await client.calls.create({
      to: actualNumber, from: settings.twilio_phone_number,
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

// ─── FORCE ACTIVE (debug helper) ─────────────────────────────────────────────
router.post('/force-active', requireAuth, requireTenant, (req, res) => {
  try {
    const db = D();
    const existing = db.prepare('SELECT * FROM voice_settings WHERE tenant_id=?').get(req.tenantId);
    if (existing) {
      db.prepare("UPDATE voice_settings SET active=1, updated_at=datetime('now') WHERE tenant_id=?").run(req.tenantId);
    } else {
      db.prepare("INSERT INTO voice_settings (id,tenant_id,active,updated_at) VALUES(?,?,1,datetime('now'))").run(uuid(), req.tenantId);
    }
    const check = db.prepare('SELECT active FROM voice_settings WHERE tenant_id=?').get(req.tenantId);
    res.json({ ok: true, active: check?.active });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── CALL LOGS (last 20 voice_calls with error details) ─────────────────────
router.get('/logs', requireAuth, requireTenant, (req, res) => {
  try {
    const calls = D().prepare(`SELECT id, direction, status, from_number, to_number, purpose, error_message, created_at, ended_at, duration_seconds FROM voice_calls WHERE tenant_id=? ORDER BY created_at DESC LIMIT 20`).all(req.tenantId);
    res.json({ calls });
  } catch(e) { res.status(500).json({ error: e.message }); }
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
  console.log(`[Voice:answer] callId=${callId} isTest=${isTest} body=`, JSON.stringify(req.body).slice(0,200));
  res.type('text/xml');
  try {
    const call = D().prepare('SELECT * FROM voice_calls WHERE id=?').get(callId);
    if (!call) {
      console.error(`[Voice:answer] FAIL — no call record found for callId=${callId}`);
      return res.send(twiml('<Say>Sorry, this call could not be connected.</Say><Hangup/>'));
    }
    console.log(`[Voice:answer] call found tenantId=${call.tenant_id} direction=${call.direction}`);
    const settings = getSettings(call.tenant_id);
    console.log(`[Voice:answer] settings active=${settings?.active} tts=${settings?.tts_voice} el_key=${settings?.elevenlabs_api_key ? 'SET' : 'NOT SET'} el_voice=${settings?.elevenlabs_voice_id}`);
    setStatus(callId, 'in-progress');

    if (isTest) {
      console.log('[Voice:answer] TEST mode — playing test message');
      const msg = 'Hello! This is a test call from Childcare360. Your AI voice agent is working correctly. Have a great day!';
      saveTurn(callId, 'assistant', msg);
      const ttsXml = await speak(msg, settings);
      console.log('[Voice:answer] TEST ttsXml:', ttsXml.slice(0,100));
      return res.send(twiml(ttsXml + '<Hangup/>'));
    }

    const base = getBase();
    if (!base) console.error('[Voice:answer] WARNING: getBase() is empty — webhook URLs will be broken');
    const greeting = settings?.outbound_greeting || 'Hello, this is a call from your childcare centre.';
    saveTurn(callId, 'assistant', greeting);
    const gatherUrl = `${base}/api/voice/webhook/gather/${callId}`;
    console.log(`[Voice:answer] gatherUrl=${gatherUrl}`);
    const greetXml = await speak(greeting, settings);
    console.log('[Voice:answer] greetXml:', greetXml.slice(0,100));
    res.send(twiml(
      (await gatherWith(gatherUrl, greeting, settings)) +
      (await speak("Sorry, I didn't catch that.", settings)) +
      `<Redirect method="POST">${gatherUrl}</Redirect>`
    ));
  } catch(e) {
    console.error('[Voice:answer] EXCEPTION:', e.message, e.stack?.slice(0,300));
    res.send(twiml('<Say>Sorry, there was a technical problem.</Say><Hangup/>'));
  }
});

webhooks.post('/gather/:callId', async (req, res) => {
  const { callId } = req.params;
  const speechResult = req.body.SpeechResult || '';
  console.log(`[Voice:gather] callId=${callId} speech="${speechResult.slice(0,100)}"`);
  res.type('text/xml');
  try {
    const call = D().prepare('SELECT * FROM voice_calls WHERE id=?').get(callId);
    if (!call) { console.error(`[Voice:gather] FAIL — no call record callId=${callId}`); return res.send(twiml('<Hangup/>')); }
    const settings = getSettings(call.tenant_id);
    const base = getBase();
    const gatherUrl = `${base}/api/voice/webhook/gather/${callId}`;

    if (!speechResult) {
      return res.send(twiml(
        (await gatherWith(gatherUrl, "I'm sorry, I couldn't hear you. Could you please speak again?", settings)) + '<Hangup/>'
      ));
    }

    // Parse context stored in voice_calls.transcript
    let ctx = {};
    try {
      const ctxTurn = JSON.parse(call.transcript || '[]').find(t => t.role === '_context');
      if (ctxTurn) ctx = JSON.parse(ctxTurn.content);
    } catch(e) {}

    saveTurn(callId, 'user', speechResult);
    const speech = speechResult.toLowerCase();

    // ── Farewell ────────────────────────────────────────────────────────────────
    if (['bye','goodbye','thanks bye','no thank you',"that's all",'all done','nothing else'].some(p => speech.includes(p))) {
      const farewell = "Thank you for calling. Take care and feel better soon. Goodbye!";
      saveTurn(callId, 'assistant', farewell);
      setStatus(callId, 'completed', { outcome: 'completed_naturally' });
      return res.send(twiml((await speak(farewell, settings)) + '<Hangup/>'));
    }

    // ── SICK CALL DETECTION ─────────────────────────────────────────────────────
    const sickKeywords = ['sick','unwell','not well','not feeling well','not coming in',
      "can't come in","cannot come in","won't be in","wont be in",'calling in sick',
      'report sick','cancel my shift','cancel shift','miss my shift','off sick',
      'feeling sick','feel sick','not going to make it'];
    const confirmYes = ['yes','yeah','yep','correct','that is',"that's it","that's the one",'right','confirm','yup','affirmative'];
    const confirmNo  = ['no','nope','wrong','not that one','different','another','not right'];

    const isSickCall  = !ctx.pendingShiftConfirm && sickKeywords.some(k => speech.includes(k));
    const isConfirmYes = ctx.pendingShiftConfirm && confirmYes.some(k => speech.includes(k));
    const isConfirmNo  = ctx.pendingShiftConfirm && confirmNo.some(k => speech.includes(k));

    // ── Step 2: Confirmation response ───────────────────────────────────────────
    if (isConfirmNo) {
      // Caller said no to the shift we found — ask them to clarify
      const upcomingShifts = ctx.upcomingShifts || [];
      if (upcomingShifts.length > 1) {
        // We had multiple — re-list them
        const fmtT = t => { const [h,m] = t.split(':').map(Number); const ap=h<12?'AM':'PM'; const h12=h%12||12; return m?`${h12}:${String(m).padStart(2,'0')} ${ap}`:`${h12} ${ap}`; };
        const listStr = upcomingShifts.map((s,i) => `Option ${i+1}: ${s.day_label} in ${s.room_name} from ${fmtT(s.start_time)} to ${fmtT(s.end_time)}`).join('. ');
        const ask = `No problem. I can see ${upcomingShifts.length} upcoming shifts for you. ${listStr}. Which shift are you cancelling? Say the option number.`;
        saveTurn(callId, 'assistant', ask);
        ctx.pendingShiftConfirm = true;
        ctx.awaitingShiftChoice = true;
        D().prepare("UPDATE voice_calls SET transcript=? WHERE id=?")
          .run(JSON.stringify([{ role: '_context', content: JSON.stringify(ctx) }]), callId);
        return res.send(twiml((await gatherWith(gatherUrl, ask, settings)) + '<Hangup/>'));
      }
      const ask = `I'm sorry about that. Could you tell me which day and room your shift is so I can find it?`;
      saveTurn(callId, 'assistant', ask);
      ctx.pendingShiftConfirm = false;
      ctx.sickCallDetected = true;
      D().prepare("UPDATE voice_calls SET transcript=? WHERE id=?")
        .run(JSON.stringify([{ role: '_context', content: JSON.stringify(ctx) }]), callId);
      return res.send(twiml((await gatherWith(gatherUrl, ask, settings)) + '<Hangup/>'));
    }

    // ── Step 3: Process confirmed shift ─────────────────────────────────────────
    if (isConfirmYes || (ctx.awaitingShiftChoice && /(one|two|three|1|2|3)/.test(speech))) {
      let confirmedShift = ctx.pendingShift;

      // Handle numbered choice
      if (ctx.awaitingShiftChoice && !isConfirmYes) {
        const num = speech.includes('two') || speech.includes('2') ? 2
                  : speech.includes('three') || speech.includes('3') ? 3 : 1;
        const shifts = ctx.upcomingShifts || [];
        confirmedShift = shifts[num - 1] || shifts[0];
      }

      if (!confirmedShift) {
        const err = "I'm sorry, I lost track of the shift details. Could you call back and I'll get that sorted for you?";
        saveTurn(callId, 'assistant', err);
        return res.send(twiml((await speak(err, settings)) + '<Hangup/>'));
      }

      const fmtT = t => { const [h,m] = t.split(':').map(Number); const ap=h<12?'AM':'PM'; const h12=h%12||12; return m?`${h12}:${String(m).padStart(2,'0')} ${ap}`:`${h12} ${ap}`; };
      const confirmMsg = `Perfect. I've recorded your absence for your ${confirmedShift.room_name} shift on ${confirmedShift.day_label} from ${fmtT(confirmedShift.start_time)} to ${fmtT(confirmedShift.end_time)}, and I'm now finding cover. Feel better soon, goodbye!`;
      saveTurn(callId, 'assistant', confirmMsg);
      setStatus(callId, 'completed', { outcome: 'sick_call_processed' });
      D().prepare("UPDATE voice_calls SET purpose='sick_call' WHERE id=?").run(callId);

      const tenantId = call.tenant_id;
      const educatorId = ctx.educatorId;
      const shiftSnap = { ...confirmedShift };
      setImmediate(async () => {
        try {
          const shiftDate = new Date(shiftSnap.date + 'T12:00:00');
          const dayOfWeek = shiftDate.getDay();
          const qualOrder = ['ect','diploma','cert3','working_towards'];
          const reqQualIdx = qualOrder.indexOf(shiftSnap.qualification_required || 'cert3');

          const absId = uuid();
          D().prepare(`INSERT INTO educator_absences (id,tenant_id,educator_id,date,type,reason,notice_given_mins,notified_via) VALUES(?,?,?,?,?,?,?,?)`)
            .run(absId, tenantId, educatorId, shiftSnap.date, 'sick', 'Called in sick via voice agent', 0, 'phone');
          D().prepare("UPDATE educators SET total_sick_days=total_sick_days+1, reliability_score=MAX(0,reliability_score-2), updated_at=datetime('now') WHERE id=?").run(educatorId);
          D().prepare("UPDATE roster_entries SET status='unfilled', notes='Educator called in sick via voice agent', updated_at=datetime('now') WHERE id=?").run(shiftSnap.id);

          const candidates = D().prepare(`
            SELECT e.* FROM educators e JOIN educator_availability ea ON ea.educator_id=e.id
            WHERE e.tenant_id=? AND e.status='active' AND e.id!=? AND ea.day_of_week=? AND ea.available=1
            AND e.id NOT IN (SELECT educator_id FROM roster_entries WHERE date=? AND tenant_id=?)
            ORDER BY e.reliability_score DESC, e.distance_km ASC
          `).all(tenantId, educatorId, dayOfWeek, shiftSnap.date, tenantId)
            .filter(c => qualOrder.indexOf(c.qualification) <= reqQualIdx).slice(0, 10);

          if (!candidates.length) { console.log('[Voice] Sick call — no eligible candidates'); return; }

          const fillId = uuid();
          D().prepare(`INSERT INTO shift_fill_requests (id,tenant_id,absence_id,original_educator_id,roster_entry_id,room_id,date,start_time,end_time,qualification_required,status,ai_initiated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(fillId, tenantId, absId, educatorId, shiftSnap.id, shiftSnap.room_id, shiftSnap.date, shiftSnap.start_time, shiftSnap.end_time, shiftSnap.qualification_required, 'open', 1);
          candidates.forEach(c => D().prepare('INSERT INTO shift_fill_attempts (id,request_id,educator_id,contact_method,status) VALUES(?,?,?,?,?)').run(uuid(), fillId, c.id, 'call', 'queued'));
          const { startShiftFillCalls } = await import('./shift-voice.js');
          await startShiftFillCalls(tenantId, fillId);
        } catch(err) { console.error('[Voice] Sick call background error:', err.message); }
      });
      return res.send(twiml((await speak(confirmMsg, settings)) + '<Hangup/>'));
    }

    // ── Step 1: Initial sick call — look up their shifts ────────────────────────
    if (isSickCall) {
      console.log(`[Voice:gather] SICK CALL educatorId=${ctx.educatorId}`);

      if (!ctx.educatorId) {
        const ask = "I'm sorry to hear that. I wasn't able to identify your number in our system. Could you please tell me your name so I can find your shift?";
        saveTurn(callId, 'assistant', ask);
        ctx.sickCallDetected = true;
        D().prepare("UPDATE voice_calls SET purpose='sick_call', transcript=? WHERE id=?")
          .run(JSON.stringify([{ role: '_context', content: JSON.stringify(ctx) }]), callId);
        return res.send(twiml((await gatherWith(gatherUrl, ask, settings)) + '<Hangup/>'));
      }

      // Look up to 14 days for upcoming shifts
      const today = new Date().toISOString().split('T')[0];
      const in14  = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
      const DAYS  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

      const upcomingShifts = D().prepare(`
        SELECT re.*, r.name as room_name
        FROM roster_entries re LEFT JOIN rooms r ON r.id = re.room_id
        WHERE re.educator_id=? AND re.tenant_id=? AND re.date BETWEEN ? AND ?
        AND re.status NOT IN ('cancelled','unfilled')
        ORDER BY re.date ASC, re.start_time ASC LIMIT 5
      `).all(ctx.educatorId, call.tenant_id, today, in14).map(s => ({
        ...s,
        day_label: s.date === today
          ? 'today'
          : s.date === new Date(Date.now() + 86400000).toISOString().split('T')[0]
            ? 'tomorrow'
            : `${DAYS[new Date(s.date + 'T12:00:00').getDay()]} the ${new Date(s.date + 'T12:00:00').getDate()}`
      }));

      const fmtT = t => { const [h,m] = t.split(':').map(Number); const ap=h<12?'AM':'PM'; const h12=h%12||12; return m?`${h12}:${String(m).padStart(2,'0')} ${ap}`:`${h12} ${ap}`; };

      if (!upcomingShifts.length) {
        // No shifts found — record absence, notify manager, ask what shift
        const ask = `I'm sorry to hear that, ${ctx.educatorName || 'there'}. I don't see any upcoming shifts rostered for you in the next two weeks. I'll make a note and let management know you called. Is there anything else I can help with?`;
        saveTurn(callId, 'assistant', ask);
        const absId = uuid();
        D().prepare(`INSERT INTO educator_absences (id,tenant_id,educator_id,date,type,reason,notice_given_mins,notified_via) VALUES(?,?,?,?,?,?,?,?)`)
          .run(absId, call.tenant_id, ctx.educatorId, today, 'sick', 'Called in sick — no shifts found in roster', 0, 'phone');
        D().prepare("UPDATE voice_calls SET purpose='sick_call', transcript=? WHERE id=?")
          .run(JSON.stringify([{ role: '_context', content: JSON.stringify(ctx) }]), callId);
        return res.send(twiml((await gatherWith(gatherUrl, ask, settings)) + '<Hangup/>'));
      }

      if (upcomingShifts.length === 1) {
        const s = upcomingShifts[0];
        const ask = `I can see you're rostered in the ${s.room_name} ${s.day_label} from ${fmtT(s.start_time)} to ${fmtT(s.end_time)}. Is that the shift you need to cancel?`;
        saveTurn(callId, 'assistant', ask);
        ctx.pendingShiftConfirm = true;
        ctx.pendingShift = s;
        ctx.upcomingShifts = upcomingShifts;
        D().prepare("UPDATE voice_calls SET purpose='sick_call', transcript=? WHERE id=?")
          .run(JSON.stringify([{ role: '_context', content: JSON.stringify(ctx) }]), callId);
        return res.send(twiml((await gatherWith(gatherUrl, ask, settings)) + '<Hangup/>'));
      }

      // Multiple shifts — list them
      const list = upcomingShifts.slice(0, 3).map((s, i) =>
        `Option ${i+1}: ${s.day_label} in ${s.room_name} from ${fmtT(s.start_time)} to ${fmtT(s.end_time)}`
      ).join('. ');
      const ask = `I can see you have a few upcoming shifts, ${ctx.educatorName}. ${list}. Which shift are you calling about? Say the option number.`;
      saveTurn(callId, 'assistant', ask);
      ctx.pendingShiftConfirm = true;
      ctx.awaitingShiftChoice = true;
      ctx.upcomingShifts = upcomingShifts.slice(0, 3);
      D().prepare("UPDATE voice_calls SET purpose='sick_call', transcript=? WHERE id=?")
        .run(JSON.stringify([{ role: '_context', content: JSON.stringify(ctx) }]), callId);
      return res.send(twiml((await gatherWith(gatherUrl, ask, settings)) + '<Hangup/>'));
    }
    // ── General AI conversation ─────────────────────────────────────────────────
    const tenantName = ctx.tenantName || 'the childcare centre';
    const persona = settings?.ai_persona ||
      `You are a friendly AI assistant for ${tenantName}. Help with general enquiries. If someone is calling about a sick day or shift cancellation, acknowledge it warmly. Keep responses to 1-2 sentences maximum.`;

    const aiResponse = await askClaude(getTranscript(callId), persona, JSON.stringify(ctx));
    if (!aiResponse) {
      const fallback = "I'm sorry, I'm having a little trouble understanding. Could you say that again?";
      saveTurn(callId, 'assistant', fallback);
      return res.send(twiml((await gatherWith(gatherUrl, fallback, settings)) + '<Hangup/>'));
    }
    console.log(`[Voice:gather] Claude: "${aiResponse.slice(0, 100)}"`);
    saveTurn(callId, 'assistant', aiResponse);

    if (['goodbye','have a great day','take care','have a wonderful day','feel better'].some(p => aiResponse.toLowerCase().includes(p))) {
      setStatus(callId, 'completed', { outcome: 'completed_naturally' });
      return res.send(twiml((await speak(aiResponse, settings)) + '<Hangup/>'));
    }

    res.send(twiml(
      (await gatherWith(gatherUrl, aiResponse, settings)) +
      (await speak("Is there anything else I can help you with?", settings)) +
      `<Redirect method="POST">${gatherUrl}</Redirect>`
    ));
  } catch(e) {
    console.error('[Voice:gather] EXCEPTION:', e.message, e.stack?.slice(0,400));
    try { res.send(twiml('<Say>I\'m sorry, I had a technical issue. Please call back and I\'ll be happy to help.</Say><Hangup/>')); } catch(re) {}
  }
});

webhooks.post('/inbound/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  res.type('text/xml');
  console.log(`[Voice:inbound] tenantId=${tenantId} From=${req.body.From} CallSid=${req.body.CallSid}`);
  try {
    const settings = getSettings(tenantId);
    console.log(`[Voice:inbound] active=${settings?.active} twilio=${!!settings?.twilio_account_sid} el=${!!settings?.elevenlabs_api_key}`);
    const isActive = settings?.active == null || settings?.active === 1 || settings?.active === true;
    if (!isActive) { console.log('[Voice:inbound] BLOCKED — agent not active'); return res.send(twiml('<Say>Thank you for calling. We are unable to take your call right now.</Say><Hangup/>')); }

    const callId = uuid();
    const callerNumber = req.body.From || 'unknown';

    // Try to identify the caller as an educator
    const educator = callerNumber !== 'unknown'
      ? D().prepare("SELECT id, first_name, last_name FROM educators WHERE tenant_id=? AND phone LIKE ?")
          .get(tenantId, `%${callerNumber.replace(/^\+61/, '0').replace(/\s/g, '')}%`)
      : null;

    const tenantName = D().prepare('SELECT name FROM tenants WHERE id=?').get(tenantId)?.name || 'the centre';

    D().prepare(`INSERT INTO voice_calls (id,tenant_id,call_sid,direction,status,from_number,to_number,purpose,transcript) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(callId, tenantId, req.body.CallSid, 'inbound', 'in-progress', callerNumber,
           req.body.To || settings.twilio_phone_number, 'inbound', '[]');

    // Store context in call record (not as a turn — keeps Claude messages clean)
    const ctx = { tenantId, callerNumber, educatorId: educator?.id || null, educatorName: educator ? educator.first_name : null, tenantName };
    D().prepare("UPDATE voice_calls SET transcript=? WHERE id=?")
      .run(JSON.stringify([{ role: '_context', content: JSON.stringify(ctx) }]), callId);

    // Register statusCallback with Twilio so completed/failed/no-answer updates our DB
    // (For inbound calls this can't be set in TwiML — must use REST API)
    const base = getBase();
    try {
      const client = await getTwilioClient(settings);
      await client.calls(req.body.CallSid).update({
        statusCallback: `${base}/api/voice/webhook/status/${callId}`,
        statusCallbackMethod: 'POST',
        statusCallbackEvent: ['completed', 'failed', 'busy', 'no-answer']
      });
      console.log(`[Voice:inbound] statusCallback registered for ${callId}`);
    } catch(scErr) {
      console.warn('[Voice:inbound] Could not register statusCallback:', scErr.message);
      // Non-fatal — call still works, just won't auto-update status
    }

    const personalGreeting = educator
      ? `Hi ${educator.first_name}, this is the AI assistant at ${tenantName}. How can I help you today?`
      : `Hi, thank you for calling ${tenantName}. This is an AI assistant. How can I help you today?`;

    // NOTE: Do NOT saveTurn for the greeting — it would make Claude's first message 'assistant'
    // which the API rejects. The greeting is context-only.
    res.send(twiml(
      (await gatherWith(`${base}/api/voice/webhook/gather/${callId}`, personalGreeting, settings)) +
      (await speak("I'm sorry, I didn't catch that. Please call back if you need assistance.", settings)) +
      '<Hangup/>'
    ));
  } catch(e) {
    console.error('[Voice] Inbound error:', e.message, e.stack?.slice(0, 200));
    res.send(twiml('<Say>Thank you for calling. Please try again shortly.</Say><Hangup/>'));
  }
});

webhooks.post('/status/:callId', (req, res) => {
  const { CallStatus, CallDuration, CallSid } = req.body;
  const callId = req.params.callId;
  console.log(`[Voice:status] callId=${callId} status=${CallStatus} duration=${CallDuration}`);
  try {
    // Map Twilio statuses → our statuses
    const terminalStatuses = ['completed','failed','busy','no-answer','canceled'];
    const isTerminal = terminalStatuses.includes(CallStatus);
    setStatus(callId, CallStatus, {
      duration: CallDuration ? parseInt(CallDuration) : undefined,
      sid: CallSid || undefined
    });
    // Force ended_at on any terminal status in case setStatus missed it
    if (isTerminal) {
      D().prepare("UPDATE voice_calls SET ended_at=COALESCE(ended_at,datetime('now')) WHERE id=?").run(callId);
    }
  } catch(e) {
    console.error('[Voice:status] Error:', e.message);
  }
  res.sendStatus(204);
});

webhooks.post('/recording/:callId', (req, res) => {
  const { RecordingUrl, RecordingSid } = req.body;
  try { D().prepare('UPDATE voice_calls SET recording_url=?, recording_sid=? WHERE id=?').run(RecordingUrl + '.mp3', RecordingSid, req.params.callId); } catch(e) {}
  res.sendStatus(204);
});

router.use('/webhook', webhooks);

// Separate router for audio — mounted WITHOUT auth so Twilio can fetch files
import { Router as AudioRouter } from 'express';
const audioRouter = AudioRouter();

// ── Stream proxy: Twilio hits this and we pipe ElevenLabs bytes in real-time ──
audioRouter.get('/stream/:token', (req, res) => {
  const entry = streamTokens.get(req.params.token);
  if (!entry) {
    console.warn(`[Stream] token not found: ${req.params.token}`);
    return res.status(404).send('Stream expired');
  }
  streamTokens.delete(req.params.token); // one-time use
  console.log(`[Stream] piping ElevenLabs stream to Twilio for token ${req.params.token}`);
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Transfer-Encoding', 'chunked');
  entry.stream.pipe(res);
  entry.stream.on('error', (e) => { console.error('[Stream] pipe error:', e.message); res.end(); });
});

// ── Static cached MP3 files ───────────────────────────────────────────────────
audioRouter.get('/:filename', (req, res) => {
  const { filename } = req.params;
  if (!/^[a-f0-9-]{36}\.mp3$/.test(filename)) return res.status(400).send('Invalid');
  const fp = join(TTS_CACHE_DIR, filename);
  if (!existsSync(fp)) return res.status(404).send('Not found');
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  createReadStream(fp).pipe(res);
});

// ═══════════════════════════════════════════════════════════════════════════
//  RETELL AI ROUTES — embedded here to guarantee loading
//  Frontend calls these via API('/retell/...') → /api/voice/retell/...
// ═══════════════════════════════════════════════════════════════════════════

function getRetellSettings(tenantId) {
  const db = D().prepare('SELECT * FROM voice_settings WHERE tenant_id=?').get(tenantId) || {};
  return {
    ...db,
    retell_api_key:   process.env.RETELL_API_KEY || db.retell_api_key,
    retell_agent_id:  db.retell_agent_id,
    retell_llm_id:    db.retell_llm_id,
    call_language:    db.call_language || 'en-AU',
    inbound_greeting: db.inbound_greeting || 'Hello, thanks for calling. How can I help?',
  };
}

async function retellFetch(path, method, body, apiKey) {
  const url = `https://api.retellai.com${path}`;
  console.log(`[Retell] ${method} ${url}`);
  let r;
  try {
    r = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch(netErr) {
    throw new Error(`Network error reaching Retell API: ${netErr.message}`);
  }
  const text = await r.text();
  console.log(`[Retell] ${r.status} response (first 300): ${text.slice(0, 300)}`);
  let data;
  try { data = JSON.parse(text); }
  catch(e) { throw new Error(`Retell API ${r.status} returned non-JSON: ${text.slice(0, 200)}`); }
  if (!r.ok) throw new Error(`Retell API ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

function getPublicBase() {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  return '';
}

// GET /api/voice/retell/ping — routing sanity check (no auth)
router.get('/retell/ping', (req, res) => {
  res.json({ ok: true, router: 'voice/retell', ts: Date.now() });
});

// GET /api/voice/retell/llm-url — the wss:// URL for Retell agent config
router.get('/retell/llm-url', requireAuth, requireTenant, (req, res) => {
  const base = getPublicBase();
  const wsUrl = base.replace('https://', 'wss://').replace('http://', 'ws://');
  res.json({ url: `${wsUrl}/api/retell/ws/${req.tenantId}` });
});

// GET /api/voice/retell/status — check API key + fetch agent details
router.get('/retell/status', requireAuth, requireTenant, async (req, res) => {
  const s = getRetellSettings(req.tenantId);
  if (!s.retell_api_key) return res.json({ configured: false, agent: null });
  try {
    const agent = s.retell_agent_id
      ? await retellFetch(`/get-agent/${s.retell_agent_id}`, 'GET', null, s.retell_api_key).catch(() => null)
      : null;
    const phoneNumbers = await retellFetch('/v2/list-phone-numbers', 'GET', null, s.retell_api_key).catch(() => []);
    res.json({ configured: true, agent, phone_numbers: Array.isArray(phoneNumbers) ? phoneNumbers : [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/voice/retell/agent — create or update Retell agent
// Retell v2 flow: create/update custom LLM first → get llm_id → create/update agent
router.post('/retell/agent', requireAuth, requireTenant, async (req, res) => {
  const s = getRetellSettings(req.tenantId);
  if (!s.retell_api_key) return res.status(400).json({ error: 'Retell API key not configured. Add it in settings and save first.' });

  const tenantName = D().prepare('SELECT name FROM tenants WHERE id=?').get(req.tenantId)?.name || 'the centre';
  const base = getPublicBase();
  const wsBase = base.replace('https://', 'wss://').replace('http://', 'ws://');
  const llmWsUrl = `${wsBase}/api/retell/ws/${req.tenantId}`;
  const { voice_id, agent_name, responsiveness, interruption_sensitivity } = req.body;

  console.log('[Retell] POST /retell/agent tenantId:', req.tenantId, 'llmWsUrl:', llmWsUrl);

  try {
    // Step 1: create or update the custom LLM object
    let llmId = s.retell_llm_id;
    if (llmId) {
      const llm = await retellFetch(`/update-retell-llm/${llmId}`, 'PATCH',
        { llm_websocket_url: llmWsUrl }, s.retell_api_key);
      console.log('[Retell] LLM updated:', llm.llm_id);
    } else {
      const llm = await retellFetch('/create-retell-llm', 'POST',
        { llm_websocket_url: llmWsUrl }, s.retell_api_key);
      llmId = llm.llm_id;
      console.log('[Retell] LLM created:', llmId);
      D().prepare("UPDATE voice_settings SET retell_llm_id=?, updated_at=datetime('now') WHERE tenant_id=?")
        .run(llmId, req.tenantId);
    }

    // Step 2: create or update the agent referencing llm_id
    const payload = {
      agent_name: agent_name || s.retell_agent_name || `${tenantName} AI Assistant`,
      response_engine: { type: 'retell-llm', llm_id: llmId },
      voice_id: voice_id || 'openai-Alloy',
      language: (s.call_language || 'en-AU').replace('-', '_'),
      responsiveness: responsiveness ?? 1,
      interruption_sensitivity: interruption_sensitivity ?? 1,
      enable_backchannel: true,
      backchannel_frequency: 0.8,
      normalize_for_speech: true,
      end_call_after_silence_ms: 30000,
      begin_message: s.inbound_greeting || `Hi, thanks for calling ${tenantName}. How can I help?`,
    };

    let agent;
    if (s.retell_agent_id) {
      agent = await retellFetch(`/update-agent/${s.retell_agent_id}`, 'PATCH', payload, s.retell_api_key);
      console.log('[Retell] Agent updated:', agent.agent_id);
    } else {
      agent = await retellFetch('/create-agent', 'POST', payload, s.retell_api_key);
      console.log('[Retell] Agent created:', agent.agent_id);
      D().prepare("UPDATE voice_settings SET retell_agent_id=?, updated_at=datetime('now') WHERE tenant_id=?")
        .run(agent.agent_id, req.tenantId);
    }

    res.json({ ok: true, agent, llm_id: llmId });
  } catch(e) {
    console.error('[Retell] Agent error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/voice/retell/link-number
router.post('/retell/link-number', requireAuth, requireTenant, async (req, res) => {
  const s = getRetellSettings(req.tenantId);
  if (!s.retell_api_key || !s.retell_agent_id) return res.status(400).json({ error: 'API key and agent required' });
  const { phone_number_id } = req.body;
  try {
    const result = await retellFetch(`/update-phone-number/${phone_number_id}`, 'PATCH',
      { inbound_agent_id: s.retell_agent_id }, s.retell_api_key);
    D().prepare('UPDATE voice_settings SET retell_phone_number_id=?, updated_at=datetime("now") WHERE tenant_id=?')
      .run(phone_number_id, req.tenantId);
    res.json({ ok: true, result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/voice/retell/test-call
router.post('/retell/test-call', requireAuth, requireTenant, async (req, res) => {
  const s = getRetellSettings(req.tenantId);
  if (!s.retell_api_key || !s.retell_agent_id) return res.status(400).json({ error: 'API key and agent required' });
  if (!s.retell_phone_number_id) return res.status(400).json({ error: 'No phone number linked' });
  const to = process.env.DEV_CALL_OVERRIDE || req.body.to_number;
  if (!to) return res.status(400).json({ error: 'to_number required' });
  try {
    const call = await retellFetch('/create-phone-call', 'POST', {
      from_number_id: s.retell_phone_number_id,
      to_number: to,
      override_agent_id: s.retell_agent_id,
    }, s.retell_api_key);
    res.json({ ok: true, call_id: call.call_id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


export default router;
export { webhooks as webhookRouter, audioRouter };
