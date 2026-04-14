// ═══════════════════════════════════════════════════════════════════════════
//  Childcare360 — Casual Spot Management
//
//  When a child is absent (check-in alert NO, planned leave, manual),
//  this module offers the spot to eligible waitlist families via SMS,
//  tracks responses, and creates confirmed casual bookings.
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const router = Router();

// ── DB MIGRATIONS ────────────────────────────────────────────────────────

let _init = false;
function ensureTables() {
  if (_init) return;
  try {
    D().prepare(`CREATE TABLE IF NOT EXISTS spot_offers (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      room_id TEXT NOT NULL, offer_date TEXT NOT NULL,
      source TEXT NOT NULL, source_id TEXT, vacated_child_id TEXT,
      spots_available INTEGER DEFAULT 1,
      fill_mode TEXT DEFAULT 'director_choice',
      status TEXT DEFAULT 'open',
      broadcast_sent_at TEXT, broadcast_count INTEGER DEFAULT 0,
      winner_waitlist_id TEXT, winner_confirmed_at TEXT, winner_booking_id TEXT,
      revenue_cents INTEGER DEFAULT 0, director_note TEXT,
      expires_at TEXT, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();

    D().prepare(`CREATE TABLE IF NOT EXISTS spot_offer_responses (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      offer_id TEXT NOT NULL, waitlist_id TEXT NOT NULL,
      parent_name TEXT, parent_phone TEXT, child_name TEXT,
      sms_sent_at TEXT, sms_sid TEXT,
      response TEXT, response_at TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();

    D().prepare(`CREATE TABLE IF NOT EXISTS casual_spot_config (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL UNIQUE,
      fill_mode TEXT DEFAULT 'director_choice',
      auto_broadcast INTEGER DEFAULT 1,
      broadcast_delay_minutes INTEGER DEFAULT 15,
      offer_expiry_hours INTEGER DEFAULT 4,
      sms_offer_template TEXT DEFAULT 'Hi {parent_name}! A casual spot has opened in {room_name} on {date}. Fee: ${'{fee}'}. Reply ACCEPT to claim it!',
      sms_winner_template TEXT DEFAULT 'Great news {parent_name}! The spot in {room_name} on {date} is yours. Reply CONFIRM to secure it.',
      sms_loser_template TEXT DEFAULT 'Hi {parent_name}, sorry — the spot in {room_name} on {date} has been filled.',
      notify_director_immediately INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();

    // Add casual columns to waitlist
    try { D().prepare('ALTER TABLE waitlist ADD COLUMN wants_casual INTEGER DEFAULT 1').run(); } catch (e) {}
    try { D().prepare('ALTER TABLE waitlist ADD COLUMN casual_days TEXT').run(); } catch (e) {}
    // Add spot_offer_id to casual_bookings
    try { D().prepare('ALTER TABLE casual_bookings ADD COLUMN spot_offer_id TEXT').run(); } catch (e) {}
    try { D().prepare('ALTER TABLE casual_bookings ADD COLUMN revenue_source TEXT DEFAULT \'casual\'').run(); } catch (e) {}

    _init = true;
  } catch (e) { console.error('[casual-spots] init error:', e.message); }
}

// ── HELPERS ──────────────────────────────────────────────────────────────

function getConfig(tenantId) {
  ensureTables();
  return D().prepare('SELECT * FROM casual_spot_config WHERE tenant_id=?').get(tenantId) || {
    fill_mode: 'director_choice', auto_broadcast: 1, broadcast_delay_minutes: 15,
    offer_expiry_hours: 4,
    sms_offer_template: 'Hi {parent_name}! A casual spot has opened in {room_name} on {date}. Fee: ${fee}. Reply ACCEPT to claim it!',
    sms_winner_template: 'Great news {parent_name}! The spot in {room_name} on {date} is yours. Reply CONFIRM to secure it.',
    sms_loser_template: 'Hi {parent_name}, sorry — the spot in {room_name} on {date} has been filled.',
    notify_director_immediately: 1,
  };
}

async function sendSMS(to, body, tenantId) {
  try {
    const s = D().prepare('SELECT * FROM voice_settings WHERE tenant_id=?').get(tenantId);
    const sid = process.env.TWILIO_ACCOUNT_SID || s?.twilio_account_sid;
    const tok = process.env.TWILIO_AUTH_TOKEN || s?.twilio_auth_token;
    const from = process.env.TWILIO_PHONE_NUMBER || s?.twilio_phone_number;
    if (!sid || !tok || !from) return null;
    const mod = await import('twilio');
    const client = (mod.default || mod)(sid, tok);
    const msg = await client.messages.create({ body, to, from });
    return msg.sid;
  } catch (e) { console.error('[casual-spots] SMS error:', e.message); return null; }
}

function getRoomCapacity(roomId, tenantId, date) {
  const room = D().prepare('SELECT * FROM rooms WHERE id=? AND tenant_id=?').get(roomId, tenantId);
  if (!room) return { available: 0, capacity: 0, enrolled: 0 };

  const enrolled = D().prepare('SELECT COUNT(*) as n FROM children WHERE room_id=? AND tenant_id=? AND active=1').get(roomId, tenantId)?.n || 0;
  const absent = D().prepare(`SELECT COUNT(*) as n FROM attendance_sessions a JOIN children c ON c.id=a.child_id
    WHERE c.room_id=? AND a.tenant_id=? AND a.date=? AND a.absent=1`).get(roomId, tenantId, date)?.n || 0;
  const casualBooked = D().prepare(`SELECT COUNT(*) as n FROM casual_bookings
    WHERE room_id=? AND tenant_id=? AND requested_date=? AND status IN ('confirmed','pending_confirm')`).get(roomId, tenantId, date)?.n || 0;

  const effective = enrolled - absent + casualBooked;
  return {
    room_id: roomId, room_name: room.name, age_group: room.age_group,
    capacity: room.capacity, enrolled, absent_today: absent,
    casual_booked: casualBooked, effective, available: Math.max(0, room.capacity - effective),
  };
}

function getEligibleWaitlist(roomId, tenantId, date) {
  ensureTables();
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(date + 'T12:00:00').getDay()];
  return D().prepare(`SELECT * FROM waitlist WHERE tenant_id=? AND status IN ('waiting','offered')
    AND wants_casual=1 AND (preferred_room=? OR preferred_room IS NULL OR preferred_room='')
    ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, position ASC`)
    .all(tenantId, roomId)
    .filter(w => {
      try { const d = JSON.parse(w.casual_days || w.preferred_days || '[]'); return !d.length || d.includes(dow); } catch { return true; }
    });
}

function getDailyFee(roomId, tenantId) {
  try {
    return D().prepare(`SELECT daily_fee FROM fee_schedules WHERE tenant_id=? AND room_id=? AND active=1
      AND effective_from <= date('now') ORDER BY effective_from DESC LIMIT 1`).get(tenantId, roomId)?.daily_fee || 0;
  } catch { return 0; }
}

// ── CORE: Create spot offer ──────────────────────────────────────────────

export async function createSpotOffer({ tenantId, roomId, date, source, sourceId, vacatedChildId }) {
  ensureTables();
  const cap = getRoomCapacity(roomId, tenantId, date);
  if (cap.available <= 0) { console.log(`[casual-spots] No capacity in ${roomId} on ${date}`); return null; }

  const config = getConfig(tenantId);
  const fee = getDailyFee(roomId, tenantId);
  const offerId = uuid();
  const expires = new Date(Date.now() + (config.offer_expiry_hours || 4) * 3600000).toISOString();

  D().prepare(`INSERT INTO spot_offers (id,tenant_id,room_id,offer_date,source,source_id,vacated_child_id,
    spots_available,fill_mode,status,revenue_cents,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(offerId, tenantId, roomId, date, source, sourceId || null, vacatedChildId || null,
      cap.available, config.fill_mode || 'director_choice', config.auto_broadcast ? 'open' : 'pending', fee * 100, expires);

  // Notify admins
  if (config.notify_director_immediately) {
    const room = D().prepare('SELECT name FROM rooms WHERE id=?').get(roomId);
    const admins = D().prepare("SELECT user_id FROM tenant_members WHERE tenant_id=? AND role IN ('admin','director','manager','owner')").all(tenantId);
    for (const a of admins) {
      try {
        D().prepare(`INSERT INTO notifications (id,tenant_id,user_id,type,title,body,channel,status,created_at)
          VALUES (?,?,?,'casual_spot',?,?,'in_app','pending',datetime('now'))`)
          .run(uuid(), tenantId, a.user_id, `Casual spot — ${room?.name}`,
            `Spot available in ${room?.name} on ${new Date(date + 'T12:00:00').toLocaleDateString('en-AU')} (${source.replace('_',' ')})`);
      } catch (e) {}
    }
  }

  // Auto-broadcast after delay
  if (config.auto_broadcast) {
    const delay = (config.broadcast_delay_minutes || 15) * 60000;
    setTimeout(() => { broadcastOffer(offerId, tenantId).catch(e => console.error('[casual-spots] auto-broadcast:', e.message)); }, delay);
  }

  console.log(`[casual-spots] Offer ${offerId} created: ${roomId} on ${date} (${source})`);
  return offerId;
}

// ── CORE: Broadcast to waitlist ──────────────────────────────────────────

export async function broadcastOffer(offerId, tenantId) {
  ensureTables();
  const offer = D().prepare('SELECT * FROM spot_offers WHERE id=? AND tenant_id=?').get(offerId, tenantId);
  if (!offer || offer.status === 'filled' || offer.status === 'cancelled') return 0;

  const config = getConfig(tenantId);
  const room = D().prepare('SELECT * FROM rooms WHERE id=?').get(offer.room_id);
  const fee = offer.revenue_cents / 100;
  const dateFmt = new Date(offer.offer_date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  const eligible = getEligibleWaitlist(offer.room_id, tenantId, offer.offer_date);

  if (!eligible.length) {
    D().prepare("UPDATE spot_offers SET status='expired', updated_at=datetime('now') WHERE id=?").run(offerId);
    return 0;
  }

  let count = 0;
  for (const w of eligible) {
    const phone = (w.parent_phone || '').replace(/\s/g, '');
    if (!phone) continue;
    const respId = uuid();
    D().prepare(`INSERT INTO spot_offer_responses (id,tenant_id,offer_id,waitlist_id,parent_name,parent_phone,child_name,status)
      VALUES (?,?,?,?,?,?,?,'pending')`)
      .run(respId, tenantId, offerId, w.id, w.parent_name, phone, w.child_name);

    const body = (config.sms_offer_template || '').replace(/\{parent_name\}/g, (w.parent_name || '').split(' ')[0] || 'there')
      .replace(/\{room_name\}/g, room?.name || 'the room').replace(/\{date\}/g, dateFmt).replace(/\{fee\}/g, fee.toFixed(2));
    const sid = await sendSMS(phone, body, tenantId);
    if (sid) { D().prepare("UPDATE spot_offer_responses SET sms_sent_at=datetime('now'), sms_sid=? WHERE id=?").run(sid, respId); count++; }
  }

  D().prepare("UPDATE spot_offers SET status='broadcasting', broadcast_sent_at=datetime('now'), broadcast_count=?, updated_at=datetime('now') WHERE id=?").run(count, offerId);
  console.log(`[casual-spots] Broadcast to ${count} families for offer ${offerId}`);
  return count;
}

// ── CORE: Select winner ──────────────────────────────────────────────────

export async function selectWinner(offerId, responseId, tenantId) {
  ensureTables();
  const offer = D().prepare('SELECT * FROM spot_offers WHERE id=? AND tenant_id=?').get(offerId, tenantId);
  const resp = D().prepare('SELECT * FROM spot_offer_responses WHERE id=? AND offer_id=?').get(responseId, offerId);
  if (!offer || !resp) return { error: 'Not found' };

  const config = getConfig(tenantId);
  const room = D().prepare('SELECT * FROM rooms WHERE id=? AND tenant_id=?').get(offer.room_id, offer.tenant_id);
  const dateFmt = new Date(offer.offer_date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

  const bookingId = uuid();
  D().prepare(`INSERT INTO casual_bookings (id,tenant_id,room_id,requested_date,session_type,status,requested_by,fee_cents,notes,spot_offer_id,revenue_source,created_at)
    VALUES (?,?,?,?,'full_day','pending_confirm',?,?,?,'spot_offer',datetime('now'))`)
    .run(bookingId, tenantId, offer.room_id, offer.offer_date, resp.waitlist_id, offer.revenue_cents,
      `Casual spot — ${resp.child_name}`, offerId);

  D().prepare("UPDATE spot_offers SET status='pending_confirm', winner_waitlist_id=?, winner_booking_id=?, updated_at=datetime('now') WHERE id=?")
    .run(resp.waitlist_id, bookingId, offerId);
  D().prepare("UPDATE spot_offer_responses SET status='winner' WHERE id=?").run(responseId);

  // SMS winner
  const winBody = (config.sms_winner_template || '').replace(/\{parent_name\}/g, (resp.parent_name || '').split(' ')[0] || 'there')
    .replace(/\{room_name\}/g, room?.name || 'the room').replace(/\{date\}/g, dateFmt);
  await sendSMS(resp.parent_phone, winBody + ' Reply CONFIRM to secure.', tenantId);

  // Notify losers
  const losers = D().prepare("SELECT * FROM spot_offer_responses WHERE offer_id=? AND id!=? AND status='pending'").all(offerId, responseId);
  for (const l of losers) {
    if (!l.parent_phone) continue;
    const lBody = (config.sms_loser_template || '').replace(/\{parent_name\}/g, (l.parent_name || '').split(' ')[0] || 'there')
      .replace(/\{room_name\}/g, room?.name || 'the room').replace(/\{date\}/g, dateFmt);
    await sendSMS(l.parent_phone, lBody, tenantId);
    D().prepare("UPDATE spot_offer_responses SET status='notified_loss' WHERE id=?").run(l.id);
  }

  return { ok: true, booking_id: bookingId };
}

// ── REST ENDPOINTS ───────────────────────────────────────────────────────

router.get('/config', requireAuth, requireTenant, (req, res) => {
  res.json(getConfig(req.tenantId));
});

router.put('/config', requireAuth, requireTenant, (req, res) => {
  try {
    ensureTables();
    const c = req.body;
    D().prepare(`INSERT INTO casual_spot_config (id,tenant_id,fill_mode,auto_broadcast,broadcast_delay_minutes,
      offer_expiry_hours,sms_offer_template,sms_winner_template,sms_loser_template,notify_director_immediately)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(tenant_id) DO UPDATE SET fill_mode=excluded.fill_mode, auto_broadcast=excluded.auto_broadcast,
        broadcast_delay_minutes=excluded.broadcast_delay_minutes, offer_expiry_hours=excluded.offer_expiry_hours,
        sms_offer_template=excluded.sms_offer_template, sms_winner_template=excluded.sms_winner_template,
        sms_loser_template=excluded.sms_loser_template, notify_director_immediately=excluded.notify_director_immediately,
        updated_at=datetime('now')`)
      .run(uuid(), req.tenantId, c.fill_mode || 'director_choice', c.auto_broadcast ? 1 : 0,
        c.broadcast_delay_minutes || 15, c.offer_expiry_hours || 4,
        c.sms_offer_template, c.sms_winner_template, c.sms_loser_template, c.notify_director_immediately ? 1 : 0);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/capacity', requireAuth, requireTenant, (req, res) => {
  try {
    ensureTables();
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const rooms = D().prepare('SELECT * FROM rooms WHERE tenant_id=?').all(req.tenantId);
    res.json({ date, rooms: rooms.map(r => getRoomCapacity(r.id, req.tenantId, date)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/offers', requireAuth, requireTenant, (req, res) => {
  try {
    ensureTables();
    const { status, date } = req.query;
    let sql = `SELECT so.*, r.name as room_name, r.age_group,
      c.first_name || ' ' || c.last_name as vacated_child_name,
      (SELECT COUNT(*) FROM spot_offer_responses sor WHERE sor.offer_id=so.id) as response_count,
      (SELECT COUNT(*) FROM spot_offer_responses sor WHERE sor.offer_id=so.id AND sor.response='accept') as accept_count
      FROM spot_offers so JOIN rooms r ON r.id=so.room_id
      LEFT JOIN children c ON c.id=so.vacated_child_id
      WHERE so.tenant_id=?`;
    const p = [req.tenantId];
    if (status) { sql += ' AND so.status=?'; p.push(status); }
    if (date) { sql += ' AND so.offer_date=?'; p.push(date); }
    sql += ' ORDER BY so.created_at DESC LIMIT 50';
    res.json({ offers: D().prepare(sql).all(...p) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/offers', requireAuth, requireTenant, async (req, res) => {
  try {
    const { room_id, date, source = 'manual' } = req.body;
    if (!room_id || !date) return res.status(400).json({ error: 'room_id and date required' });
    const id = await createSpotOffer({ tenantId: req.tenantId, roomId: room_id, date, source, sourceId: null, vacatedChildId: null });
    res.json({ ok: true, offer_id: id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/offers/:id/broadcast', requireAuth, requireTenant, async (req, res) => {
  try {
    const count = await broadcastOffer(req.params.id, req.tenantId);
    res.json({ ok: true, broadcast_count: count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/offers/:id/responses', requireAuth, requireTenant, (req, res) => {
  try {
    ensureTables();
    const rows = D().prepare(`SELECT sor.*, w.priority, w.position FROM spot_offer_responses sor
      LEFT JOIN waitlist w ON w.id=sor.waitlist_id WHERE sor.offer_id=? AND sor.tenant_id=?
      ORDER BY CASE sor.response WHEN 'accept' THEN 1 ELSE 2 END, sor.response_at ASC`).all(req.params.id, req.tenantId);
    res.json({ responses: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/offers/:id/select-winner', requireAuth, requireTenant, async (req, res) => {
  try {
    const { response_id } = req.body;
    if (!response_id) return res.status(400).json({ error: 'response_id required' });
    res.json(await selectWinner(req.params.id, response_id, req.tenantId));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/resolve/:id', requireAuth, requireTenant, (req, res) => {
  try {
    D().prepare("UPDATE spot_offers SET status=?, updated_at=datetime('now') WHERE id=? AND tenant_id=?")
      .run(req.body.status || 'cancelled', req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/analytics', requireAuth, requireTenant, (req, res) => {
  try {
    ensureTables();
    const days = parseInt(req.query.period) || 30;
    const offered = D().prepare(`SELECT COUNT(*) as total,
      SUM(CASE WHEN status='filled' THEN 1 ELSE 0 END) as filled,
      SUM(CASE WHEN status IN ('open','broadcasting','pending_confirm') THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status='expired' THEN 1 ELSE 0 END) as expired
      FROM spot_offers WHERE tenant_id=? AND created_at >= date('now','-'||?||' days')`).get(req.tenantId, days);

    const revenue = D().prepare(`SELECT COALESCE(SUM(fee_cents),0) as total_cents, COUNT(*) as bookings
      FROM casual_bookings WHERE tenant_id=? AND revenue_source='spot_offer' AND status='confirmed'
      AND created_at >= date('now','-'||?||' days')`).get(req.tenantId, days);

    const byRoom = D().prepare(`SELECT r.name as room_name, COUNT(so.id) as offers,
      SUM(CASE WHEN so.status='filled' THEN 1 ELSE 0 END) as filled,
      SUM(CASE WHEN so.status='filled' THEN so.revenue_cents ELSE 0 END) as revenue_cents
      FROM spot_offers so JOIN rooms r ON r.id=so.room_id
      WHERE so.tenant_id=? AND so.created_at >= date('now','-'||?||' days')
      GROUP BY r.id ORDER BY filled DESC`).all(req.tenantId, days);

    const bySource = D().prepare(`SELECT source, COUNT(*) as offers,
      SUM(CASE WHEN status='filled' THEN 1 ELSE 0 END) as filled
      FROM spot_offers WHERE tenant_id=? AND created_at >= date('now','-'||?||' days')
      GROUP BY source`).all(req.tenantId, days);

    const fillRate = offered?.total > 0 ? Math.round((offered.filled || 0) / offered.total * 100) : 0;
    res.json({
      period_days: days,
      summary: { spots_offered: offered?.total || 0, spots_filled: offered?.filled || 0, spots_active: offered?.active || 0, spots_expired: offered?.expired || 0, fill_rate_pct: fillRate, revenue_generated: (revenue?.total_cents || 0) / 100, bookings_created: revenue?.bookings || 0 },
      by_room: byRoom.map(r => ({ ...r, revenue: r.revenue_cents / 100, fill_rate: r.offers > 0 ? Math.round(r.filled / r.offers * 100) : 0 })),
      by_source: bySource.map(s => ({ ...s, fill_rate: s.offers > 0 ? Math.round(s.filled / s.offers * 100) : 0 })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SMS WEBHOOK (no auth — Twilio calls this) ────────────────────────────

router.post('/sms-response', async (req, res) => {
  try {
    ensureTables();
    const from = (req.body.From || '').replace(/\s/g, '');
    const body = (req.body.Body || '').trim().toUpperCase();

    // Check for CONFIRM on pending booking
    if (body === 'CONFIRM' || (body.startsWith('Y') && body.length < 10)) {
      const booking = D().prepare(`SELECT cb.*, so.tenant_id FROM casual_bookings cb
        JOIN spot_offers so ON so.id=cb.spot_offer_id
        WHERE cb.status='pending_confirm' AND so.winner_waitlist_id IN (SELECT id FROM waitlist WHERE parent_phone LIKE ?)
        LIMIT 1`).get('%' + from.slice(-8));
      if (booking) {
        D().prepare("UPDATE casual_bookings SET status='confirmed', confirmed_at=datetime('now') WHERE id=?").run(booking.id);
        D().prepare("UPDATE spot_offers SET status='filled', winner_confirmed_at=datetime('now'), updated_at=datetime('now') WHERE winner_booking_id=?").run(booking.id);
        res.type('text/xml').send(`<Response><Message>Confirmed! See you at ${booking.room_id ? 'the centre' : 'the centre'}. Please sign in at reception.</Message></Response>`);
        return;
      }
    }

    // Check for ACCEPT/DECLINE on broadcast
    const pending = D().prepare(`SELECT sor.*, so.tenant_id, so.fill_mode, so.id as offer_id, r.name as room_name
      FROM spot_offer_responses sor JOIN spot_offers so ON so.id=sor.offer_id JOIN rooms r ON r.id=so.room_id
      WHERE sor.parent_phone LIKE ? AND sor.status='pending' AND so.status='broadcasting'
      ORDER BY sor.created_at DESC LIMIT 1`).get('%' + from.slice(-8));

    if (!pending) { res.type('text/xml').send('<Response></Response>'); return; }

    if (body === 'ACCEPT' || body.startsWith('Y')) {
      D().prepare("UPDATE spot_offer_responses SET response='accept', response_at=datetime('now'), status='accepted' WHERE id=?").run(pending.id);
      if (pending.fill_mode === 'auto_first') {
        await selectWinner(pending.offer_id, pending.id, pending.tenant_id);
        res.type('text/xml').send('<Response><Message>You got it! The spot is reserved. Reply CONFIRM to secure.</Message></Response>');
      } else {
        // Notify director
        const admins = D().prepare("SELECT user_id FROM tenant_members WHERE tenant_id=? AND role IN ('admin','director','manager')").all(pending.tenant_id);
        for (const a of admins) {
          try { D().prepare(`INSERT INTO notifications (id,tenant_id,user_id,type,title,body,channel,status,created_at)
            VALUES (?,?,?,'casual_spot_response',?,?,'in_app','pending',datetime('now'))`)
            .run(uuid(), pending.tenant_id, a.user_id, `${pending.parent_name} wants spot`,
              `${pending.child_name} accepted the ${pending.room_name} spot — select winner in Casual Spots`); } catch (e) {}
        }
        res.type('text/xml').send(`<Response><Message>Thanks! Your interest has been noted. We'll confirm shortly.</Message></Response>`);
      }
    } else if (body === 'DECLINE' || body.startsWith('N')) {
      D().prepare("UPDATE spot_offer_responses SET response='decline', response_at=datetime('now'), status='declined' WHERE id=?").run(pending.id);
      res.type('text/xml').send('<Response><Message>No problem. We\'ll let you know when another spot opens.</Message></Response>');
    } else {
      res.type('text/xml').send('<Response><Message>Reply ACCEPT to claim the spot or DECLINE to pass.</Message></Response>');
    }
  } catch (e) {
    console.error('[casual-spots] SMS webhook error:', e.message);
    res.type('text/xml').send('<Response></Response>');
  }
});

export default router;
