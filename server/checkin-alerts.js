// ═══════════════════════════════════════════════════════════════════════════
//  Childcare360 — Child Check-in Safety Alerts
//
//  If a child hasn't arrived by expected time + grace period:
//    1. SMS parent → wait for YES/NO reply
//    2. If no SMS reply → voice call with Twilio Gather
//    3. If no call response → escalate to director
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';
import { createSpotOffer } from './casual-spots.js';

const router = Router();

// ── DB MIGRATIONS ────────────────────────────────────────────────────────

function initTables() {
  try {
    D().prepare(`CREATE TABLE IF NOT EXISTS checkin_alert_config (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL UNIQUE,
      enabled INTEGER DEFAULT 1,
      grace_minutes INTEGER DEFAULT 15,
      expected_arrival_time TEXT DEFAULT '09:00',
      alert_method TEXT DEFAULT 'sms_then_call',
      sms_wait_minutes INTEGER DEFAULT 10,
      escalate_to_director INTEGER DEFAULT 1,
      director_escalation_minutes INTEGER DEFAULT 15,
      alert_message TEXT DEFAULT 'Hi {parent_name}, {child_name} has not arrived at {centre_name} yet. Reply YES if on the way or NO if not attending today.',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();
  } catch (e) {}

  try {
    D().prepare(`CREATE TABLE IF NOT EXISTS checkin_alerts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL,
      alert_date TEXT NOT NULL,
      expected_arrival TEXT NOT NULL,
      triggered_at TEXT,
      sms_sent_at TEXT,
      sms_to TEXT,
      sms_sid TEXT,
      sms_response TEXT,
      sms_response_at TEXT,
      call_initiated_at TEXT,
      call_sid TEXT,
      call_outcome TEXT,
      director_alerted_at TEXT,
      status TEXT DEFAULT 'pending',
      resolved_at TEXT,
      resolution TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();
  } catch (e) {}

  try { D().prepare('ALTER TABLE children ADD COLUMN expected_arrival_time TEXT').run(); } catch (e) {}
}

// Run migrations lazily
let _tablesInit = false;
function ensureTables() {
  if (_tablesInit) return;
  try { initTables(); _tablesInit = true; } catch (e) { console.error('[checkin-alert] table init error:', e.message); }
}

// ── HELPERS ──────────────────────────────────────────────────────────────

function getConfig(tenantId) {
  return D().prepare('SELECT * FROM checkin_alert_config WHERE tenant_id=?').get(tenantId) || {
    enabled: 1,
    grace_minutes: 15,
    expected_arrival_time: '09:00',
    alert_method: 'sms_then_call',
    sms_wait_minutes: 10,
    escalate_to_director: 1,
    director_escalation_minutes: 15,
    alert_message: 'Hi {parent_name}, {child_name} has not arrived at {centre_name} yet. Reply YES if on the way or NO if not attending today.',
  };
}

function getVoiceSettings(tenantId) {
  const db = D().prepare('SELECT * FROM voice_settings WHERE tenant_id=?').get(tenantId) || {};
  return {
    twilio_account_sid:  process.env.TWILIO_ACCOUNT_SID  || db.twilio_account_sid,
    twilio_auth_token:   process.env.TWILIO_AUTH_TOKEN   || db.twilio_auth_token,
    twilio_phone_number: process.env.TWILIO_PHONE_NUMBER || db.twilio_phone_number,
  };
}

function getBaseUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  if (process.env.APP_DOMAIN) return `https://${process.env.APP_DOMAIN}`;
  return `http://localhost:${process.env.PORT || 3003}`;
}

async function getTwilioClient(settings) {
  if (!settings.twilio_account_sid || !settings.twilio_auth_token) return null;
  const mod = await import('twilio');
  const Twilio = mod.default || mod;
  return new Twilio(settings.twilio_account_sid, settings.twilio_auth_token);
}

async function sendSMS(to, body, tenantId) {
  try {
    const s = getVoiceSettings(tenantId);
    const client = await getTwilioClient(s);
    if (!client || !s.twilio_phone_number) {
      console.warn('[checkin-alert] Twilio not configured — SMS not sent');
      return null;
    }
    const msg = await client.messages.create({ body, to, from: s.twilio_phone_number });
    console.log(`[checkin-alert] SMS sent to ${to}: ${msg.sid}`);
    return msg.sid;
  } catch (e) {
    console.error('[checkin-alert] SMS error:', e.message);
    return null;
  }
}

async function makeCall(to, alertId, tenantId) {
  try {
    const s = getVoiceSettings(tenantId);
    const client = await getTwilioClient(s);
    if (!client || !s.twilio_phone_number) return null;
    const base = getBaseUrl();
    const call = await client.calls.create({
      to,
      from: s.twilio_phone_number,
      url: `${base}/api/checkin-alerts/twiml/${alertId}`,
      statusCallback: `${base}/api/checkin-alerts/call-status/${alertId}`,
      statusCallbackMethod: 'POST',
    });
    console.log(`[checkin-alert] Call initiated to ${to}: ${call.sid}`);
    return call.sid;
  } catch (e) {
    console.error('[checkin-alert] Call error:', e.message);
    return null;
  }
}

// ── CORE PROCESSOR (called every minute) ─────────────────────────────────

export async function processCheckinAlerts() {
  try {
    const now = new Date();
    const dow = now.getDay();
    if (dow === 0 || dow === 6) return; // weekdays only

    const todayStr = now.toISOString().split('T')[0];
    const nowMins = now.getHours() * 60 + now.getMinutes();

    ensureTables();
    const tenants = D().prepare("SELECT id FROM tenants").all();

  for (const { id: tenantId } of tenants) {
    try {
      const config = getConfig(tenantId);
      if (!config.enabled) continue;

      // Parse trigger time
      const [expH, expM] = (config.expected_arrival_time || '09:00').split(':').map(Number);
      const triggerMins = expH * 60 + expM + (config.grace_minutes || 15);
      if (nowMins < triggerMins) continue;
      // Don't fire alerts after noon — too late to be useful
      if (nowMins > 720) continue;

      const centre = D().prepare('SELECT service_name FROM tenant_settings WHERE tenant_id=?').get(tenantId);
      const centreName = centre?.service_name || 'the centre';

      // ── Phase 1: Create new alerts for missing children ──
      // Find children who should be here today but haven't signed in
      // and don't already have an alert for today
      const missing = D().prepare(`
        SELECT c.id as child_id, c.first_name, c.last_name,
          c.expected_arrival_time,
          c.parent1_name, c.parent1_phone,
          pc.name as pc_name, pc.phone as pc_phone
        FROM children c
        LEFT JOIN parent_contacts pc ON pc.child_id = c.id
          AND pc.tenant_id = c.tenant_id AND pc.is_primary = 1
        LEFT JOIN attendance_sessions a ON a.child_id = c.id
          AND a.tenant_id = c.tenant_id AND a.date = ?
        WHERE c.tenant_id = ?
          AND c.active = 1
          AND (a.id IS NULL OR (a.sign_in IS NULL AND (a.absent IS NULL OR a.absent = 0)))
          AND c.id NOT IN (
            SELECT child_id FROM checkin_alerts
            WHERE tenant_id = ? AND alert_date = ?
          )
      `).all(todayStr, tenantId, tenantId, todayStr);

      for (const child of missing) {
        const phone = child.pc_phone || child.parent1_phone;
        if (!phone) continue;

        const parentName = child.pc_name || child.parent1_name || 'Parent';
        const childName = `${child.first_name} ${child.last_name}`;
        const expectedArrival = child.expected_arrival_time || config.expected_arrival_time;
        const alertId = uuid();

        D().prepare(`INSERT INTO checkin_alerts
          (id, tenant_id, child_id, alert_date, expected_arrival, triggered_at, status)
          VALUES (?,?,?,?,?,datetime('now'),'pending')`)
          .run(alertId, tenantId, child.child_id, todayStr, expectedArrival);

        // Build SMS
        const smsBody = (config.alert_message || '')
          .replace(/\{parent_name\}/g, parentName)
          .replace(/\{child_name\}/g, childName)
          .replace(/\{centre_name\}/g, centreName);

        if (config.alert_method === 'call_only') {
          const callSid = await makeCall(phone, alertId, tenantId);
          D().prepare(`UPDATE checkin_alerts SET status='call_initiated',
            call_initiated_at=datetime('now'), sms_to=?, call_sid=? WHERE id=? AND tenant_id=?`)
            .run(phone, callSid || 'failed', alertId, tenantId);
        } else {
          const smsSid = await sendSMS(phone, smsBody, tenantId);
          D().prepare(`UPDATE checkin_alerts SET status='sms_sent',
            sms_sent_at=datetime('now'), sms_to=?, sms_sid=? WHERE id=? AND tenant_id=?`)
            .run(phone, smsSid || 'failed', alertId, tenantId);
        }

        // In-app notification to admins
        try {
          const admins = D().prepare(
            "SELECT user_id FROM tenant_members WHERE tenant_id=? AND role IN ('admin','director','manager')"
          ).all(tenantId);
          for (const a of admins) {
            D().prepare(`INSERT INTO notifications
              (id, tenant_id, user_id, type, title, body, channel, status, created_at)
              VALUES (?,?,?,'safety',?,?,'in_app','pending',datetime('now'))`)
              .run(uuid(), tenantId, a.user_id,
                'Check-in alert',
                `${childName} has not arrived — parent has been notified`);
          }
        } catch (e) {}

        console.log(`[checkin-alert] Alert created: ${childName} — ${config.alert_method === 'call_only' ? 'call' : 'SMS'} to ${phone}`);

        try {
          D().prepare('INSERT INTO audit_log (id,user_id,tenant_id,action,details,ip_address,user_agent) VALUES (?,?,?,?,?,?,?)')
            .run(uuid(), null, tenantId, 'checkin_alert_triggered',
              JSON.stringify({ entity_type: 'child', entity_id: child.child_id,
                category: 'safety', alert_id: alertId, child_name: childName,
                contact_method: config.alert_method, phone }), null, 'system:scheduler');
        } catch (e) {}
      }

      // ── Phase 2: Escalate SMS → call if no reply ──
      if (config.alert_method === 'sms_then_call') {
        const waitMins = config.sms_wait_minutes || 10;
        const toEscalate = D().prepare(`
          SELECT ca.*, c.first_name, c.last_name,
            c.parent1_phone, pc.phone as pc_phone
          FROM checkin_alerts ca
          JOIN children c ON c.id = ca.child_id AND c.tenant_id = ca.tenant_id
          LEFT JOIN parent_contacts pc ON pc.child_id = ca.child_id
            AND pc.tenant_id = ca.tenant_id AND pc.is_primary = 1
          WHERE ca.tenant_id = ?
            AND ca.status = 'sms_sent'
            AND ca.alert_date = ?
            AND (julianday('now') - julianday(ca.sms_sent_at)) * 24 * 60 >= ?
        `).all(tenantId, todayStr, waitMins);

        for (const alert of toEscalate) {
          const phone = alert.pc_phone || alert.parent1_phone || alert.sms_to;
          if (!phone) continue;
          const callSid = await makeCall(phone, alert.id, tenantId);
          D().prepare(`UPDATE checkin_alerts SET status='call_initiated',
            call_initiated_at=datetime('now'), call_sid=? WHERE id=? AND tenant_id=?`)
            .run(callSid || 'failed', alert.id, tenantId);
          console.log(`[checkin-alert] Escalated to call: ${alert.first_name} ${alert.last_name}`);
          try {
            D().prepare('INSERT INTO audit_log (id,user_id,tenant_id,action,details,ip_address,user_agent) VALUES (?,?,?,?,?,?,?)')
              .run(uuid(), null, tenantId, 'checkin_alert_escalated_to_call',
                JSON.stringify({ entity_type: 'child', entity_id: alert.child_id,
                  category: 'safety', alert_id: alert.id, phone, call_sid: callSid }),
                null, 'system:scheduler');
          } catch (e) {}
        }
      }

      // ── Phase 3: Escalate to director if no call response ──
      if (config.escalate_to_director) {
        const dirMins = config.director_escalation_minutes || 15;
        const toDirector = D().prepare(`
          SELECT ca.*, c.first_name, c.last_name
          FROM checkin_alerts ca
          JOIN children c ON c.id = ca.child_id
          WHERE ca.tenant_id = ?
            AND ca.status = 'call_initiated'
            AND ca.alert_date = ?
            AND (julianday('now') - julianday(ca.call_initiated_at)) * 24 * 60 >= ?
        `).all(tenantId, todayStr, dirMins);

        for (const alert of toDirector) {
          D().prepare(`UPDATE checkin_alerts SET status='escalated',
            director_alerted_at=datetime('now') WHERE id=? AND tenant_id=?`).run(alert.id, tenantId);
          try {
            const directors = D().prepare(
              "SELECT user_id FROM tenant_members WHERE tenant_id=? AND role IN ('director','admin')"
            ).all(tenantId);
            for (const d of directors) {
              D().prepare(`INSERT INTO notifications
                (id, tenant_id, user_id, type, title, body, channel, status, created_at)
                VALUES (?,?,?,'safety',?,?,'in_app','pending',datetime('now'))`)
                .run(uuid(), tenantId, d.user_id,
                  'URGENT: No response from parent',
                  `${alert.first_name} ${alert.last_name} has not arrived and parent has not responded to SMS or phone call. Manual follow-up required.`);
            }
          } catch (e) {}
          console.log(`[checkin-alert] Escalated to director: ${alert.first_name} ${alert.last_name}`);
          try {
            D().prepare('INSERT INTO audit_log (id,user_id,tenant_id,action,details,ip_address,user_agent) VALUES (?,?,?,?,?,?,?)')
              .run(uuid(), null, tenantId, 'checkin_alert_escalated_to_director',
                JSON.stringify({ entity_type: 'child', entity_id: alert.child_id,
                  category: 'safety', alert_id: alert.id,
                  child_name: `${alert.first_name} ${alert.last_name}` }),
                null, 'system:scheduler');
          } catch (e) {}
        }
      }
    } catch (e) {
      console.error(`[checkin-alert] Error for tenant ${tenantId}:`, e.message);
    }
  }
  } catch(outerErr) {
    console.error('[checkin-alert] processor error:', outerErr.message);
  }
}

// ── Auto-resolve when child signs in ─────────────────────────────────────
// Called from attendance sign-in handler
export function resolveOnArrival(childId, tenantId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    D().prepare(`UPDATE checkin_alerts SET status='child_arrived',
      resolved_at=datetime('now'), resolution='arrived'
      WHERE child_id=? AND tenant_id=? AND alert_date=?
      AND status NOT IN ('resolved','child_arrived')`)
      .run(childId, tenantId, today);
  } catch (e) {}
}

// ── REST ENDPOINTS ───────────────────────────────────────────────────────

// GET /api/checkin-alerts — list of alerts (last 100)
router.get('/', requireAuth, requireTenant, (req, res) => {
  try {
    ensureTables();
    const alerts = D().prepare(
      `SELECT ca.*, c.first_name, c.last_name, c.room_id
       FROM checkin_alerts ca
       JOIN children c ON c.id=ca.child_id
       WHERE ca.tenant_id=? ORDER BY ca.alert_date DESC, ca.created_at DESC LIMIT 100`
    ).all(req.tenantId);
    res.json({ alerts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/checkin-alerts/config
router.get('/config', requireAuth, requireTenant, (req, res) => {
  ensureTables();
  res.json(getConfig(req.tenantId));
});

// PUT /api/checkin-alerts/config
router.put('/config', requireAuth, requireTenant, (req, res) => {
  try {
    const f = req.body;
    D().prepare(`INSERT INTO checkin_alert_config
      (id, tenant_id, enabled, grace_minutes, expected_arrival_time,
       alert_method, sms_wait_minutes, escalate_to_director,
       director_escalation_minutes, alert_message, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(tenant_id) DO UPDATE SET
        enabled=excluded.enabled, grace_minutes=excluded.grace_minutes,
        expected_arrival_time=excluded.expected_arrival_time,
        alert_method=excluded.alert_method, sms_wait_minutes=excluded.sms_wait_minutes,
        escalate_to_director=excluded.escalate_to_director,
        director_escalation_minutes=excluded.director_escalation_minutes,
        alert_message=excluded.alert_message, updated_at=datetime('now')`)
      .run(uuid(), req.tenantId,
        f.enabled ? 1 : 0, f.grace_minutes || 15,
        f.expected_arrival_time || '09:00',
        f.alert_method || 'sms_then_call', f.sms_wait_minutes || 10,
        f.escalate_to_director ? 1 : 0, f.director_escalation_minutes || 15,
        f.alert_message || 'Hi {parent_name}, {child_name} has not arrived at {centre_name} yet. Reply YES if on the way or NO if not attending today.');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/checkin-alerts/today
router.get('/today', requireAuth, requireTenant, (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const alerts = D().prepare(`
      SELECT ca.*,
        c.first_name || ' ' || c.last_name as child_name,
        c.room_id, r.name as room_name
      FROM checkin_alerts ca
      JOIN children c ON c.id = ca.child_id
      LEFT JOIN rooms r ON r.id = c.room_id
      WHERE ca.tenant_id = ? AND ca.alert_date = ?
      ORDER BY ca.created_at DESC
    `).all(req.tenantId, today);
    res.json({ alerts, date: today });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/checkin-alerts/resolve/:id
router.post('/resolve/:id', requireAuth, requireTenant, (req, res) => {
  try {
    D().prepare(`UPDATE checkin_alerts SET status='resolved',
      resolved_at=datetime('now'), resolution=?
      WHERE id=? AND tenant_id=?`)
      .run(req.body.resolution || 'manual', req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TWILIO WEBHOOKS (no auth) ────────────────────────────────────────────

// POST /api/checkin-alerts/twiml/:id — TwiML for voice call
router.post('/twiml/:id', (req, res) => {
  try {
    const alert = D().prepare(`
      SELECT ca.*, c.first_name, ts.service_name
      FROM checkin_alerts ca
      JOIN children c ON c.id = ca.child_id
      LEFT JOIN tenant_settings ts ON ts.tenant_id = ca.tenant_id
      WHERE ca.id = ?
    `).get(req.params.id);

    const child = alert?.first_name || 'your child';
    const centre = alert?.service_name || 'the centre';
    const base = getBaseUrl();

    res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" action="${base}/api/checkin-alerts/gather/${req.params.id}" method="POST" timeout="8" numDigits="1">
    <Say voice="Polly.Nicole">
      Hello, this is ${centre} calling. We noticed that ${child} has not yet arrived today.
      If ${child} is on the way, please press 1 or say yes.
      If ${child} will not be attending today, please press 2 or say no.
    </Say>
  </Gather>
  <Say voice="Polly.Nicole">We did not receive a response. A staff member will follow up shortly. Goodbye.</Say>
</Response>`);
  } catch (e) {
    res.type('text/xml').send('<Response><Say>Thank you for calling. Goodbye.</Say></Response>');
  }
});

// POST /api/checkin-alerts/gather/:id — handle Gather result
router.post('/gather/:id', (req, res) => {
  try {
    const speech = (req.body.SpeechResult || '').toLowerCase();
    const digit = req.body.Digits;

    if (digit === '1' || speech.includes('yes') || speech.includes('coming') || speech.includes('way')) {
      D().prepare(`UPDATE checkin_alerts SET status='resolved', call_outcome='answered_yes',
        resolved_at=datetime('now'), resolution='arriving' WHERE id=?`).run(req.params.id);
      res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="Polly.Nicole">Thank you. We look forward to seeing them soon. Goodbye.</Say></Response>`);
    } else if (digit === '2' || speech.includes('no') || speech.includes('not') || speech.includes('sick') || speech.includes('absent')) {
      const alert = D().prepare('SELECT * FROM checkin_alerts WHERE id=?').get(req.params.id);
      if (alert) {
        D().prepare("UPDATE attendance_sessions SET absent=1, absent_reason='Parent confirmed via phone' WHERE child_id=? AND date=? AND tenant_id=?")
          .run(alert.child_id, alert.alert_date, alert.tenant_id);
      }
      D().prepare(`UPDATE checkin_alerts SET status='resolved', call_outcome='answered_no',
        resolved_at=datetime('now'), resolution='absent_confirmed' WHERE id=?`).run(req.params.id);
      // Trigger casual spot offer
      if (alert) {
        const child = D().prepare('SELECT room_id FROM children WHERE id=?').get(alert.child_id);
        if (child?.room_id) {
          createSpotOffer({ tenantId: alert.tenant_id, roomId: child.room_id, date: alert.alert_date, source: 'checkin_alert', sourceId: alert.id, vacatedChildId: alert.child_id }).catch(e => console.error('[checkin-alert] spot offer error:', e.message));
        }
      }
      res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="Polly.Nicole">Thank you for letting us know. We hope to see them next time. Goodbye.</Say></Response>`);
    } else {
      D().prepare(`UPDATE checkin_alerts SET call_outcome='no_clear_response' WHERE id=?`).run(req.params.id);
      res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="Polly.Nicole">We did not get a clear response. A staff member will follow up. Goodbye.</Say></Response>`);
    }
  } catch (e) {
    res.type('text/xml').send('<Response><Say>Thank you. Goodbye.</Say></Response>');
  }
});

// POST /api/checkin-alerts/call-status/:id — Twilio status callback
router.post('/call-status/:id', (req, res) => {
  try {
    const status = req.body.CallStatus;
    if (status === 'no-answer' || status === 'busy' || status === 'failed') {
      D().prepare(`UPDATE checkin_alerts SET call_outcome=? WHERE id=? AND call_outcome IS NULL`)
        .run(status === 'no-answer' ? 'no_answer' : status, req.params.id);
    }
  } catch (e) {}
  res.sendStatus(200);
});

// POST /api/checkin-alerts/sms-reply — Twilio inbound SMS webhook
router.post('/sms-reply', (req, res) => {
  try {
    // Normalise phone: Twilio sends E.164 (+61412222001), DB may store local with spaces (0412 222 001)
    const raw = (req.body.From || '').replace(/\s/g,'');
    const norm = raw.startsWith('+61') ? '0' + raw.slice(3) : raw;
    const body = (req.body.Body || '').trim().toUpperCase();
    const today = new Date().toISOString().split('T')[0];

    const alert = D().prepare(`
      SELECT * FROM checkin_alerts
      WHERE REPLACE(REPLACE(sms_to,' ',''),'+61','0') = ?
        AND alert_date = ? AND status = 'sms_sent'
      LIMIT 1
    `).get(norm, today);

    if (!alert) {
      res.type('text/xml').send('<Response><Message>We could not match your reply. Please contact the centre directly.</Message></Response>');
      return;
    }

    if (body === 'YES' || body.startsWith('Y')) {
      D().prepare(`UPDATE checkin_alerts SET status='resolved', sms_response='yes',
        sms_response_at=datetime('now'), resolved_at=datetime('now'), resolution='arriving'
        WHERE id=? AND tenant_id=?`).run(alert.id, alert.tenant_id);
      try {
        D().prepare('INSERT INTO audit_log (id,user_id,tenant_id,action,details,ip_address,user_agent) VALUES (?,?,?,?,?,?,?)')
          .run(uuid(), null, alert.tenant_id, 'checkin_alert_resolved',
            JSON.stringify({ entity_type: 'child', entity_id: alert.child_id,
              category: 'safety', alert_id: alert.id, resolution: 'arriving', via: 'sms_yes' }),
            null, 'twilio:sms-webhook');
      } catch (e) {}
      res.type('text/xml').send('<Response><Message>Thank you! We look forward to seeing them soon.</Message></Response>');
    } else if (body === 'NO' || body.startsWith('N')) {
      D().prepare("UPDATE attendance_sessions SET absent=1, absent_reason='Parent confirmed absent via SMS' WHERE child_id=? AND date=? AND tenant_id=?")
        .run(alert.child_id, alert.alert_date, alert.tenant_id);
      D().prepare(`UPDATE checkin_alerts SET status='resolved', sms_response='no',
        sms_response_at=datetime('now'), resolved_at=datetime('now'), resolution='absent_confirmed'
        WHERE id=? AND tenant_id=?`).run(alert.id, alert.tenant_id);
      try {
        D().prepare('INSERT INTO audit_log (id,user_id,tenant_id,action,details,ip_address,user_agent) VALUES (?,?,?,?,?,?,?)')
          .run(uuid(), null, alert.tenant_id, 'checkin_alert_resolved',
            JSON.stringify({ entity_type: 'child', entity_id: alert.child_id,
              category: 'safety', alert_id: alert.id, resolution: 'absent_confirmed', via: 'sms_no' }),
            null, 'twilio:sms-webhook');
      } catch (e) {}
      // Trigger casual spot offer
      const child = D().prepare('SELECT room_id FROM children WHERE id=?').get(alert.child_id);
      if (child?.room_id) {
        createSpotOffer({ tenantId: alert.tenant_id, roomId: child.room_id, date: alert.alert_date, source: 'checkin_alert', sourceId: alert.id, vacatedChildId: alert.child_id }).catch(e => console.error('[checkin-alert] spot offer error:', e.message));
      }
      res.type('text/xml').send('<Response><Message>Thank you for letting us know. We hope to see them next time!</Message></Response>');
    } else {
      res.type('text/xml').send('<Response><Message>Please reply YES if on the way or NO if not attending today.</Message></Response>');
    }
  } catch (e) {
    res.type('text/xml').send('<Response></Response>');
  }
});

export default router;
