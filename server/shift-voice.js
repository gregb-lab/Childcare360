// ═══════════════════════════════════════════════════════════════════════════════
//  Childcare360 — AI Shift Replacement Voice Engine
//  Handles: automated outbound calls to find shift cover + SMS confirmations
// ═══════════════════════════════════════════════════════════════════════════════
import { Router } from 'express';
import { D, uuid, auditLog } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();

// ── DEV SAFETY OVERRIDE (same as voice.js) ────────────────────────────────────
// All calls and SMS go to this number. Set DEV_CALL_OVERRIDE='' in env to disable.
const DEV_OVERRIDE = process.env.DEV_CALL_OVERRIDE || '+61413880015';
function safeNumber(intended) {
  if (DEV_OVERRIDE) {
    console.log(`[ShiftVoice] DEV OVERRIDE: ${intended} → ${DEV_OVERRIDE}`);
    return DEV_OVERRIDE;
  }
  return intended;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getVoiceSettings(tenantId) {
  const db = D().prepare('SELECT * FROM voice_settings WHERE tenant_id=?').get(tenantId) || {};
  return {
    ...db,
    twilio_account_sid:  process.env.TWILIO_ACCOUNT_SID  || db.twilio_account_sid,
    twilio_auth_token:   process.env.TWILIO_AUTH_TOKEN   || db.twilio_auth_token,
    twilio_phone_number: process.env.TWILIO_PHONE_NUMBER || db.twilio_phone_number,
    elevenlabs_api_key:  process.env.ELEVENLABS_API_KEY  || db.elevenlabs_api_key,
    elevenlabs_voice_id: db.elevenlabs_voice_id || '21m00Tcm4TlvDq8ikWAM',
    tts_voice:           db.tts_voice || 'Polly.Joanna-Neural',
  };
}

function getCentreName(tenantId) {
  const tenant = D().prepare('SELECT name FROM tenants WHERE id = ?').get(tenantId);
  return tenant?.name || 'your childcare centre';
}

function getBase() {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return process.env.PUBLIC_URL || '';
}

function twiml(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}

function safeXml(text) {
  return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function getTwilioClient(settings) {
  if (!settings?.twilio_account_sid || !settings?.twilio_auth_token)
    throw new Error('Twilio not configured');
  const mod = await import('twilio');
  const Twilio = mod.default || mod;
  return new Twilio(settings.twilio_account_sid, settings.twilio_auth_token);
}

// ── ElevenLabs TTS (same as voice.js) ─────────────────────────────────────────

import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data';
const TTS_DIR  = DATA_DIR + '/tts_cache';

async function elevenLabsTTS(text, apiKey, voiceId) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId || '21m00Tcm4TlvDq8ikWAM'}`, {
    method: 'POST',
    headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({ text, model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true } })
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

async function speak(text, settings) {
  const key = settings?.elevenlabs_api_key;
  if (key) {
    try {
      mkdirSync(TTS_DIR, { recursive: true });
      const fn = `${uuid()}.mp3`;
      const audio = await elevenLabsTTS(text, key, settings.elevenlabs_voice_id);
      writeFileSync(join(TTS_DIR, fn), audio);
      return `<Play>${getBase()}/api/voice/audio/${fn}</Play>`;
    } catch(e) {
      console.error('[ShiftVoice] ElevenLabs error:', e.message, '— falling back to Twilio TTS');
    }
  }
  return `<Say voice="${settings?.tts_voice || 'Polly.Joanna-Neural'}">${safeXml(text)}</Say>`;
}

async function gather(action, text, settings) {
  const inner = await speak(text, settings);
  return `<Gather input="speech dtmf" action="${action}" method="POST" timeout="8" speechTimeout="2" numDigits="1" language="en-AU" speechModel="phone_call" enhanced="true">
  ${inner}
</Gather>`;
}

// ── SMS ───────────────────────────────────────────────────────────────────────

async function sendSMS(to, body, settings) {
  const actualTo = safeNumber(to);
  const devNote  = DEV_OVERRIDE ? ` [DEV→${DEV_OVERRIDE}, intended: ${to}]` : '';
  console.log(`[ShiftVoice] SMS to ${actualTo}: ${body}${devNote}`);
  const client = await getTwilioClient(settings);
  return client.messages.create({
    to: actualTo,
    from: settings.twilio_phone_number,
    body
  });
}

// ── Format shift details for speech / SMS ─────────────────────────────────────

function formatShiftForSpeech(req) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const d = new Date(req.date + 'T12:00:00');
  const day = days[d.getDay()];
  // Format date as "Wednesday the 4th of March"
  const nth = (n) => n + (['st','nd','rd'][((n+90)%100-10)%10-1]||'th');
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dateStr = `${day} the ${nth(d.getDate())} of ${months[d.getMonth()]}`;
  // Format times: "06:30" → "6:30 AM"
  const fmtTime = (t) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 || 12;
    return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
  };
  return { dateStr, start: fmtTime(req.start_time), end: fmtTime(req.end_time) };
}

function formatShiftForSMS(req) {
  const d = new Date(req.date + 'T12:00:00');
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${req.start_time}–${req.end_time}`;
}

// ── MAIN ENGINE: initiate sequential calls ────────────────────────────────────
// Called internally when a shift fill request is created and AI is enabled

export async function startShiftFillCalls(tenantId, fillRequestId) {
  const db = D();
  const req = db.prepare(`
    SELECT sfr.*, r.name as room_name, e.first_name as orig_fn, e.last_name as orig_ln
    FROM shift_fill_requests sfr
    LEFT JOIN rooms r ON r.id = sfr.room_id
    LEFT JOIN educators e ON e.id = sfr.original_educator_id
    WHERE sfr.id = ? AND sfr.tenant_id = ?
  `).get(fillRequestId, tenantId);

  if (!req) return console.error(`[ShiftVoice] fill request ${fillRequestId} not found`);
  if (req.status !== 'open') return console.log(`[ShiftVoice] request ${fillRequestId} already ${req.status}`);

  // Get next queued attempt
  const attempt = db.prepare(`
    SELECT sfa.*, e.first_name, e.last_name, e.phone, e.qualification
    FROM shift_fill_attempts sfa
    JOIN educators e ON e.id = sfa.educator_id
    WHERE sfa.request_id = ? AND sfa.status = 'queued'
    ORDER BY (SELECT reliability_score FROM educators WHERE id = sfa.educator_id) DESC
    LIMIT 1
  `).get(fillRequestId);

  if (!attempt) {
    console.log(`[ShiftVoice] No more candidates for request ${fillRequestId}`);
    db.prepare("UPDATE shift_fill_requests SET status='exhausted', updated_at=datetime('now') WHERE id=?").run(fillRequestId);
    // Notify centre manager that no cover was found
    const settings = getVoiceSettings(tenantId);
    const centreName = getCentreName(tenantId);
    const shift = formatShiftForSMS(req);
    if (settings.twilio_phone_number) {
      // Get manager phone
      const manager = db.prepare(`
        SELECT u.phone FROM tenant_members tm JOIN users u ON u.id = tm.user_id
        WHERE tm.tenant_id = ? AND tm.role IN ('owner','admin') AND u.phone IS NOT NULL
        LIMIT 1
      `).get(tenantId);
      if (manager?.phone) {
        await sendSMS(manager.phone,
          `⚠️ ${centreName}: No cover found for shift on ${shift} in ${req.room_name}. Originally: ${req.orig_fn} ${req.orig_ln}. Manual action required.`,
          settings
        );
      }
    }
    return;
  }

  const settings = getVoiceSettings(tenantId);
  const centreName = getCentreName(tenantId);
  const { dateStr, start, end } = formatShiftForSpeech(req);

  // Mark attempt as pending
  db.prepare("UPDATE shift_fill_attempts SET status='pending', contacted_at=datetime('now') WHERE id=?").run(attempt.id);

  // Create a voice call record linked to this attempt
  const callId = uuid();
  db.prepare(`
    INSERT INTO voice_calls (id,tenant_id,direction,status,from_number,to_number,purpose,context_type,context_id,transcript)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(callId, tenantId, 'outbound', 'initiated',
    settings.twilio_phone_number, safeNumber(attempt.phone),
    'shift_fill', 'shift_fill_attempt', attempt.id, '[]');

  // Store context in call for webhook to use
  const ctx = {
    fillRequestId,
    attemptId: attempt.id,
    educatorName: attempt.first_name,
    centreName,
    room: req.room_name,
    dateStr,
    start,
    end,
    origName: `${req.orig_fn} ${req.orig_ln}`,
    tenantId
  };
  db.prepare("UPDATE voice_calls SET transcript=? WHERE id=?")
    .run(JSON.stringify([{ role: '_context', content: JSON.stringify(ctx) }]), callId);

  const greeting = `Hi ${attempt.first_name}. This is an automated message from ${centreName}. I'm an AI assistant. We have an available shift in the ${req.room_name} on ${dateStr}, from ${start} to ${end}. Are you available to take this shift? Please say yes or no, or press 1 for yes and 2 for no.`;

  try {
    const client = await getTwilioClient(settings);
    const base = getBase();
    const call = await client.calls.create({
      to: safeNumber(attempt.phone),
      from: settings.twilio_phone_number,
      url: `${base}/api/shift-voice/webhook/answer/${callId}`,
      statusCallback: `${base}/api/shift-voice/webhook/status/${callId}`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['completed', 'failed', 'busy', 'no-answer']
    });

    db.prepare("UPDATE voice_calls SET call_sid=?, status='ringing' WHERE id=?").run(call.sid, callId);
    db.prepare("UPDATE shift_fill_attempts SET status='calling' WHERE id=?").run(attempt.id);

    console.log(`[ShiftVoice] Calling ${attempt.first_name} ${attempt.last_name} (${safeNumber(attempt.phone)}) — callId=${callId}`);
  } catch(e) {
    console.error('[ShiftVoice] Call failed:', e.message);
    db.prepare("UPDATE shift_fill_attempts SET status='failed', decline_reason=? WHERE id=?").run(e.message, attempt.id);
    db.prepare("UPDATE voice_calls SET status='failed', error_message=? WHERE id=?").run(e.message, callId);
    // Try next candidate after a short delay
    setTimeout(() => startShiftFillCalls(tenantId, fillRequestId), 5000);
  }
}

// ── WEBHOOK ROUTER (no auth — called by Twilio) ───────────────────────────────

export const shiftWebhooks = Router();

// Answer: play the shift offer
shiftWebhooks.post('/answer/:callId', async (req, res) => {
  const { callId } = req.params;
  res.type('text/xml');

  try {
    const call = D().prepare('SELECT * FROM voice_calls WHERE id=?').get(callId);
    if (!call) return res.send(twiml('<Say>Sorry, this call could not be connected.</Say><Hangup/>'));

    const ctx = JSON.parse(call.transcript || '[]').find(t => t.role === '_context');
    if (!ctx) return res.send(twiml('<Say>Sorry, there was an error with this call.</Say><Hangup/>'));

    const context = JSON.parse(ctx.content);
    const settings = getVoiceSettings(call.tenant_id);

    D().prepare("UPDATE voice_calls SET status='in-progress' WHERE id=?").run(callId);

    const greeting = `Hi ${context.educatorName}. This is an automated message from ${context.centreName}. I am an AI assistant. We have an available shift in the ${context.room} on ${context.dateStr}, from ${context.start} to ${context.end}. Are you available to take this shift? Please say yes or no, or press 1 for yes, or 2 for no.`;

    const base = getBase();
    const gatherBlock = await gather(`${base}/api/shift-voice/webhook/gather/${callId}`, greeting, settings);
    const fallback = await speak("I'm sorry, I didn't catch your response. I'll try calling again shortly.", settings);

    res.send(twiml(gatherBlock + fallback + '<Hangup/>'));
  } catch(e) {
    console.error('[ShiftVoice] Answer error:', e.message);
    res.send(twiml('<Say>Sorry, there was a technical problem.</Say><Hangup/>'));
  }
});

// Gather: handle yes/no response
shiftWebhooks.post('/gather/:callId', async (req, res) => {
  const { callId } = req.params;
  const speech = (req.body.SpeechResult || '').toLowerCase().trim();
  const digits = (req.body.Digits || '').trim();
  res.type('text/xml');

  try {
    const call = D().prepare('SELECT * FROM voice_calls WHERE id=?').get(callId);
    if (!call) return res.send(twiml('<Hangup/>'));

    const ctx = JSON.parse(call.transcript || '[]').find(t => t.role === '_context');
    if (!ctx) return res.send(twiml('<Hangup/>'));

    const context = JSON.parse(ctx.content);
    const settings = getVoiceSettings(call.tenant_id);
    const db = D();

    console.log(`[ShiftVoice] Gather response — speech="${speech}" digits="${digits}" callId=${callId}`);

    const isYes = digits === '1' || ['yes','yeah','yep','sure','ok','okay','i can','i will','absolutely'].some(w => speech.includes(w));
    const isNo  = digits === '2' || ['no','nope','can\'t','cannot','sorry','unavailable','not available'].some(w => speech.includes(w));

    if (isYes) {
      // ── ACCEPT ──────────────────────────────────────────────────────────────
      const attempt = db.prepare('SELECT * FROM shift_fill_attempts WHERE id=?').get(context.attemptId);
      const fillReq = db.prepare('SELECT * FROM shift_fill_requests WHERE id=?').get(context.fillRequestId);

      // Update records
      db.prepare("UPDATE shift_fill_requests SET status='filled', filled_by=?, filled_at=datetime('now'), updated_at=datetime('now') WHERE id=?")
        .run(attempt.educator_id, context.fillRequestId);
      db.prepare("UPDATE shift_fill_attempts SET status='accepted', accepted=1, response='yes', responded_at=datetime('now'), ai_transcript=? WHERE id=?")
        .run(speech || 'yes (DTMF 1)', context.attemptId);
      db.prepare("UPDATE shift_fill_attempts SET status='cancelled' WHERE request_id=? AND educator_id!=? AND status IN ('queued','pending','calling')")
        .run(context.fillRequestId, attempt.educator_id);
      db.prepare('UPDATE educators SET total_shifts_accepted=total_shifts_accepted+1, total_shifts_offered=total_shifts_offered+1, reliability_score=MIN(100,reliability_score+1), updated_at=datetime(\'now\') WHERE id=?')
        .run(attempt.educator_id);

      // Update roster entry if exists
      if (fillReq?.roster_entry_id) {
        db.prepare("UPDATE roster_entries SET educator_id=?, status='confirmed', updated_at=datetime('now') WHERE id=?")
          .run(attempt.educator_id, fillReq.roster_entry_id);
      }

      D().prepare("UPDATE voice_calls SET status='completed', outcome='shift_accepted', ended_at=datetime('now') WHERE id=?").run(callId);
      auditLog('system', context.tenantId, 'shift_filled_via_voice', { fillRequestId: context.fillRequestId, educatorId: attempt.educator_id });

      // Get full educator + original educator details for SMS
      const educator = db.prepare('SELECT first_name, last_name, phone FROM educators WHERE id=?').get(attempt.educator_id);
      const original = db.prepare('SELECT first_name, last_name, phone FROM educators WHERE id=?').get(fillReq.original_educator_id);
      const shiftSMS = `${formatShiftForSMS(fillReq)} in ${context.room}`;

      // SMS to replacement educator
      if (educator?.phone) {
        await sendSMS(educator.phone,
          `✅ ${context.centreName}: Shift confirmed! You're booked for ${shiftSMS}. See you then. Reply STOP to opt out of SMS.`,
          settings
        );
      }

      // SMS to sick/absent educator
      if (original?.phone) {
        await sendSMS(original.phone,
          `Hi ${original.first_name}, this is ${context.centreName}. Your shift on ${shiftSMS} has been covered by ${educator.first_name} ${educator.last_name}. Feel better soon.`,
          settings
        );
      }

      const confirmation = await speak(`Wonderful, thank you ${context.educatorName}! Your shift is confirmed for ${context.dateStr} in the ${context.room}. You will receive an SMS shortly with the details. See you then. Goodbye!`, settings);
      return res.send(twiml(confirmation + '<Hangup/>'));

    } else if (isNo) {
      // ── DECLINE ─────────────────────────────────────────────────────────────
      db.prepare("UPDATE shift_fill_attempts SET status='declined', accepted=0, response=?, responded_at=datetime('now'), ai_transcript=? WHERE id=?")
        .run('no', speech || 'no (DTMF 2)', context.attemptId);
      db.prepare('UPDATE educators SET total_shifts_offered=total_shifts_offered+1, reliability_score=MAX(0,reliability_score-0.5), updated_at=datetime(\'now\') WHERE id=?')
        .run(db.prepare('SELECT educator_id FROM shift_fill_attempts WHERE id=?').get(context.attemptId)?.educator_id);

      D().prepare("UPDATE voice_calls SET status='completed', outcome='shift_declined', ended_at=datetime('now') WHERE id=?").run(callId);

      const farewell = await speak(`No problem ${context.educatorName}, thank you for letting us know. Goodbye!`, settings);
      res.send(twiml(farewell + '<Hangup/>'));

      // Try next candidate after 3 seconds
      setTimeout(() => startShiftFillCalls(context.tenantId, context.fillRequestId), 3000);
      return;

    } else {
      // ── UNCLEAR — ask again ─────────────────────────────────────────────────
      const base = getBase();
      const clarify = `I'm sorry ${context.educatorName}, I didn't quite catch that. Can you please say yes or no, or press 1 for yes and 2 for no?`;
      const gatherBlock = await gather(`${base}/api/shift-voice/webhook/gather/${callId}`, clarify, settings);
      return res.send(twiml(gatherBlock + '<Hangup/>'));
    }

  } catch(e) {
    console.error('[ShiftVoice] Gather error:', e.message);
    res.send(twiml('<Say>Sorry, there was a technical problem. We will try again shortly.</Say><Hangup/>'));
  }
});

// Status callback: handle no-answer / busy / failed
shiftWebhooks.post('/status/:callId', async (req, res) => {
  const { CallStatus, CallDuration } = req.body;
  const callId = req.params.callId;

  try {
    const call = D().prepare('SELECT * FROM voice_calls WHERE id=?').get(callId);
    if (!call) return res.sendStatus(204);

    D().prepare("UPDATE voice_calls SET status=?, duration_seconds=?, ended_at=datetime('now') WHERE id=?")
      .run(CallStatus, parseInt(CallDuration || 0), callId);

    if (['busy','no-answer','failed','canceled'].includes(CallStatus)) {
      const ctx = JSON.parse(call.transcript || '[]').find(t => t.role === '_context');
      if (ctx) {
        const context = JSON.parse(ctx.content);
        console.log(`[ShiftVoice] Call ${CallStatus} for attempt ${context.attemptId} — trying next candidate`);
        D().prepare("UPDATE shift_fill_attempts SET status='no-answer', responded_at=datetime('now') WHERE id=?")
          .run(context.attemptId);
        // Move to next candidate after delay
        setTimeout(() => startShiftFillCalls(context.tenantId, context.fillRequestId), 5000);
      }
    }
  } catch(e) {
    console.error('[ShiftVoice] Status callback error:', e.message);
  }

  res.sendStatus(204);
});

// ── API ROUTES (auth required) ────────────────────────────────────────────────

// Trigger: record a sick call and kick off automated shift fill
r.post('/sick-call', requireAuth, requireTenant, async (req, res) => {
  const { educator_id, date, roster_entry_id, reason } = req.body;
  if (!educator_id || !date) return res.status(400).json({ error: 'educator_id and date required' });

  const db = D();

  // Get the roster entry for this shift
  const entry = roster_entry_id
    ? db.prepare('SELECT * FROM roster_entries WHERE id=? AND tenant_id=?').get(roster_entry_id, req.tenantId)
    : db.prepare('SELECT * FROM roster_entries WHERE educator_id=? AND date=? AND tenant_id=? LIMIT 1').get(educator_id, date, req.tenantId);

  if (!entry) return res.status(404).json({ error: 'No roster entry found for this educator on this date' });

  // Record the absence
  const absenceId = uuid();
  db.prepare(`INSERT INTO educator_absences (id,tenant_id,educator_id,date,type,reason,notice_given_mins,notified_via)
    VALUES(?,?,?,?,?,?,?,?)`)
    .run(absenceId, req.tenantId, educator_id, date, 'sick', reason || 'Sick call', 0, 'phone');
  db.prepare('UPDATE educators SET total_sick_days=total_sick_days+1, reliability_score=MAX(0,reliability_score-2), updated_at=datetime(\'now\') WHERE id=?')
    .run(educator_id);

  // Mark the shift as unfilled
  db.prepare("UPDATE roster_entries SET status='unfilled', notes='Educator sick', updated_at=datetime('now') WHERE id=?")
    .run(entry.id);

  // Find eligible candidates
  const dayOfWeek = new Date(date + 'T12:00:00').getDay();
  const qualOrder = ['ect','diploma','cert3','working_towards'];
  const reqQualIdx = qualOrder.indexOf(entry.qualification_required || 'cert3');

  const candidates = db.prepare(`
    SELECT e.* FROM educators e
    JOIN educator_availability ea ON ea.educator_id = e.id
    WHERE e.tenant_id = ? AND e.status = 'active' AND e.id != ?
    AND ea.day_of_week = ? AND ea.available = 1
    AND e.id NOT IN (SELECT educator_id FROM roster_entries WHERE date = ? AND tenant_id = ?)
    ORDER BY e.reliability_score DESC, e.distance_km ASC
  `).all(req.tenantId, educator_id, dayOfWeek, date, req.tenantId)
    .filter(c => qualOrder.indexOf(c.qualification) <= reqQualIdx)
    .slice(0, 10);

  if (!candidates.length) return res.status(200).json({ ok: true, absenceId, message: 'Absence recorded but no eligible candidates found', candidates: 0 });

  // Create fill request
  const fillId = uuid();
  db.prepare(`INSERT INTO shift_fill_requests
    (id,tenant_id,absence_id,original_educator_id,roster_entry_id,room_id,date,start_time,end_time,qualification_required,status,ai_initiated)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(fillId, req.tenantId, absenceId, educator_id, entry.id, entry.room_id, date,
         entry.start_time, entry.end_time, entry.qualification_required, 'open', 1);

  // Create queued attempts
  candidates.forEach(c => {
    db.prepare('INSERT INTO shift_fill_attempts (id,request_id,educator_id,contact_method,status) VALUES(?,?,?,?,?)')
      .run(uuid(), fillId, c.id, 'call', 'queued');
  });

  auditLog(req.userId, req.tenantId, 'sick_call_received', { educator_id, date, fillRequestId: fillId });

  // Kick off calling in background
  setTimeout(() => startShiftFillCalls(req.tenantId, fillId), 1000);

  res.json({
    ok: true,
    absenceId,
    fillRequestId: fillId,
    candidates: candidates.length,
    message: `Absence recorded. AI calling ${candidates.length} eligible educators in sequence.`
  });
});

// Get status of a fill request
r.get('/fill-requests/:id', requireAuth, requireTenant, (req, res) => {
  const fillReq = D().prepare(`
    SELECT sfr.*, r.name as room_name,
      e.first_name || ' ' || e.last_name as original_educator,
      f.first_name || ' ' || f.last_name as filled_by_name
    FROM shift_fill_requests sfr
    LEFT JOIN rooms r ON r.id = sfr.room_id
    LEFT JOIN educators e ON e.id = sfr.original_educator_id
    LEFT JOIN educators f ON f.id = sfr.filled_by
    WHERE sfr.id = ? AND sfr.tenant_id = ?
  `).get(req.params.id, req.tenantId);
  if (!fillReq) return res.status(404).json({ error: 'Not found' });

  const attempts = D().prepare(`
    SELECT sfa.*, e.first_name || ' ' || e.last_name as educator_name, e.phone, e.reliability_score
    FROM shift_fill_attempts sfa JOIN educators e ON e.id = sfa.educator_id
    WHERE sfa.request_id = ? ORDER BY sfa.contacted_at ASC
  `).all(req.params.id);

  res.json({ fillRequest: fillReq, attempts });
});

// List recent fill requests for tenant
r.get('/fill-requests', requireAuth, requireTenant, (req, res) => {
  const requests = D().prepare(`
    SELECT sfr.*, r.name as room_name,
      e.first_name || ' ' || e.last_name as original_educator,
      f.first_name || ' ' || f.last_name as filled_by_name,
      (SELECT COUNT(*) FROM shift_fill_attempts WHERE request_id = sfr.id) as attempts_count
    FROM shift_fill_requests sfr
    LEFT JOIN rooms r ON r.id = sfr.room_id
    LEFT JOIN educators e ON e.id = sfr.original_educator_id
    LEFT JOIN educators f ON f.id = sfr.filled_by
    WHERE sfr.tenant_id = ? ORDER BY sfr.created_at DESC LIMIT 50
  `).all(req.tenantId);
  res.json({ requests });
});

export default r;
