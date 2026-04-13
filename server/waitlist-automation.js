/**
 * server/waitlist-automation.js — v2.16.0
 * Automated waitlist → enrolment pipeline:
 *   GET  /api/waitlist-auto/queue     — ordered waitlist with placement readiness
 *   POST /api/waitlist-auto/offer/:id — offer a place to waitlist family
 *   POST /api/waitlist-auto/accept/:id — accept offer → auto-create enrolment application
 *   POST /api/waitlist-auto/decline/:id
 *   GET  /api/waitlist-auto/availability — real-time room availability + projected dates
 *   POST /api/waitlist-auto/bulk-notify — notify all eligible families of availability
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

// ── Enriched waitlist queue ───────────────────────────────────────────────────
r.get('/queue', (req, res) => {
  try {
    const { room_id, status } = req.query;
    const where = ['w.tenant_id=?'];
    const vals  = [req.tenantId];
    if (room_id) { where.push('w.preferred_room=?'); vals.push(room_id); }
    if (status)  { where.push('w.status=?'); vals.push(status); }
    else         { where.push("w.status IN ('waiting','offered')"); }

    const items = D().prepare(`
      SELECT w.*,
        CAST((julianday('now') - julianday(w.created_at)) AS INTEGER) as days_waiting,
        (SELECT COUNT(*)+1 FROM waitlist w2
         WHERE w2.tenant_id=w.tenant_id AND w2.status='waiting'
           AND w2.preferred_room=w.preferred_room
           AND w2.created_at < w.created_at) as queue_position
      FROM waitlist w
      WHERE ${where.join(' AND ')}
      ORDER BY w.priority DESC, w.created_at ASC
    `).all(...vals);

    // Enrich with availability
    const rooms = D().prepare('SELECT * FROM rooms WHERE tenant_id=?').all(req.tenantId);
    const roomMap = {};
    rooms.forEach(r => {
      const enrolled = D().prepare(
        'SELECT COUNT(*) as n FROM children WHERE tenant_id=? AND room_id=? AND active=1'
      ).get(req.tenantId, r.id)?.n || 0;
      roomMap[r.id] = { ...r, enrolled, available: Math.max(0, r.capacity - enrolled) };
    });

    const enriched = items.map(item => {
      const room = rooms.find(r => r.id === item.preferred_room || r.age_group === item.preferred_room);
      const availability = room ? roomMap[room.id]?.available : null;
      const dob = item.child_dob ? new Date(item.child_dob) : null;
      const ageMonths = dob ? ((d) => { const n=new Date(); return (n.getFullYear()-d.getFullYear())*12+(n.getMonth()-d.getMonth()); })(new Date(dob)) : null;

      return {
        ...item,
        preferred_days: JSON.parse(item.preferred_days || '[]'),
        room_name: room?.name || item.preferred_room,
        room_available_places: availability,
        child_age_months: ageMonths,
        ready_for_offer: availability > 0,
        offer_expiry: item.offer_date
          ? new Date(new Date(item.offer_date).getTime() + 7*86400000).toISOString().split('T')[0]
          : null,
      };
    });

    const stats = {
      total_waiting: enriched.filter(i => i.status === 'waiting').length,
      offers_pending: enriched.filter(i => i.status === 'offered').length,
      ready_to_offer: enriched.filter(i => i.ready_for_offer && i.status === 'waiting').length,
    };

    res.json({ queue: enriched, stats, rooms: Object.values(roomMap) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Real-time room availability
r.get('/availability', (req, res) => {
  try {
    const rooms = D().prepare('SELECT * FROM rooms WHERE tenant_id=? ORDER BY name').all(req.tenantId);

    const availability = rooms.map(room => {
      const enrolled = D().prepare(
        'SELECT COUNT(*) as n FROM children WHERE tenant_id=? AND room_id=? AND active=1'
      ).get(req.tenantId, room.id)?.n || 0;

      const waitingCount = D().prepare(
        "SELECT COUNT(*) as n FROM waitlist WHERE tenant_id=? AND preferred_room=? AND status='waiting'"
      ).get(req.tenantId, room.id)?.n || 0;

      const available = Math.max(0, room.capacity - enrolled);

      // Project next available date based on children transitioning out
      const nextTransition = D().prepare(`
        SELECT MIN(date(c.dob, '+' || 
          CASE r.age_group 
            WHEN '0-2' THEN '2 years'
            WHEN '2-3' THEN '3 years'  
            WHEN '3-4' THEN '4 years'
            WHEN '4-5' THEN '5 years'
            ELSE '5 years'
          END)) as transition_date
        FROM children c
        JOIN rooms r ON r.id=c.room_id
        WHERE c.tenant_id=? AND c.room_id=? AND c.active=1
      `).get(req.tenantId, room.id)?.transition_date;

      return {
        id: room.id,
        name: room.name,
        age_group: room.age_group,
        capacity: room.capacity,
        enrolled,
        available,
        waiting_families: waitingCount,
        can_accommodate: available > 0,
        next_availability_date: available > 0 ? 'Now' : nextTransition || 'Unknown',
      };
    });

    res.json({ availability });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Offer a place to a waitlist family
r.post('/offer/:id', (req, res) => {
  try {
    const { room_id, start_date, message, offered_by } = req.body;
    const item = D().prepare('SELECT * FROM waitlist WHERE id=? AND tenant_id=?')
      .get(req.params.id, req.tenantId);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (item.status !== 'waiting') return res.status(409).json({ error: 'Not in waiting status' });

    const offerExpiry = new Date(Date.now() + 7*86400000).toISOString().split('T')[0];

    D().prepare(`
      UPDATE waitlist SET status='offered', offer_date=date('now'),
        notes=COALESCE(notes||' | ','') || 'Place offered ' || date('now') || '. Expires ' || ?
      WHERE id=?
    `).run(offerExpiry, req.params.id);

    // Create a message thread to notify the family
    const threadId = uuid();
    D().prepare(`
      INSERT INTO message_threads (id,tenant_id,subject,last_message_preview,unread_parent)
      VALUES (?,?,?,?,1)
    `).run(threadId, req.tenantId,
           `Place Available — ${item.child_name}`,
           `A place is available for ${item.child_name}. Please respond by ${offerExpiry}.`);

    const defaultMsg = `Dear ${item.parent_name},\n\nWe are pleased to advise that a place is now available for ${item.child_name} at our centre!\n\n${message || ''}\n\nProposed start date: ${start_date || 'To be confirmed'}\n\nPlease confirm acceptance by ${offerExpiry} or this offer will be passed to the next family on our waitlist.\n\nTo accept, please reply to this message or contact us directly.\n\nKind regards,\nThe Team`;

    D().prepare(`
      INSERT INTO thread_messages (id,tenant_id,thread_id,sender_type,sender_name,body)
      VALUES (?,?,?,'admin',?,'${defaultMsg.replace(/'/g,"''")}')
    `).run(uuid(), req.tenantId, threadId, offered_by || 'Centre');

    res.json({ ok: true, offer_expiry: offerExpiry, thread_id: threadId,
               message: `Offer sent to ${item.parent_name} for ${item.child_name}` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Accept offer → auto-create enrolment application
r.post('/accept/:id', (req, res) => {
  try {
    const { start_date, room_id } = req.body;
    const item = D().prepare('SELECT * FROM waitlist WHERE id=? AND tenant_id=?')
      .get(req.params.id, req.tenantId);
    if (!item) return res.status(404).json({ error: 'Not found' });

    // Create enrolment application from waitlist data
    const enrolId = uuid();
    D().prepare(`
      INSERT INTO enrolment_applications
        (id, tenant_id, child_name, child_dob, parent_name, parent_email, parent_phone,
         preferred_start_date, preferred_room, preferred_days, status, notes, source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(enrolId, req.tenantId,
           item.child_name, item.child_dob,
           item.parent_name, item.parent_email, item.parent_phone,
           start_date || item.preferred_start, room_id || item.preferred_room,
           item.preferred_days,
           'pending',
           `Auto-created from waitlist. Waitlist ID: ${item.id}`,
           'waitlist');

    // Update waitlist status
    D().prepare("UPDATE waitlist SET status='accepted', updated_at=datetime('now') WHERE id=? AND tenant_id=?")
      .run(req.params.id);

    res.json({ ok: true, enrolment_id: enrolId,
               message: `Enrolment application created for ${item.child_name}` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/decline/:id', (req, res) => {
  try {
    const { reason } = req.body;
    D().prepare(`
      UPDATE waitlist SET status='declined',
        notes=COALESCE(notes||' | ','') || 'Offer declined: ' || COALESCE(?,'No reason given')
      WHERE id=? AND tenant_id=?
    `).run(reason||null, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Bulk notify all waiting families when a place opens
r.post('/bulk-notify', (req, res) => {
  try {
    const { room_id, message } = req.body;

    const room = room_id ? D().prepare('SELECT * FROM rooms WHERE id=? AND tenant_id=?')
      .get(room_id, req.tenantId) : null;

    const waiting = D().prepare(`
      SELECT * FROM waitlist
      WHERE tenant_id=? AND status='waiting'
      ${room_id ? "AND preferred_room=?" : ""}
      ORDER BY priority DESC, created_at ASC
    `).all(...[req.tenantId, ...(room_id ? [room_id] : [])]);

    let notified = 0;
    for (const item of waiting) {
      if (!item.parent_email) continue;
      // Log notification
      D().prepare(`
        INSERT INTO notification_log (id,tenant_id,channel,subject,body,entity_type,entity_id,status)
        VALUES (?,?,'email',?,?,?,?,'queued')
      `).run(uuid(), req.tenantId,
             `Availability Update${room ? ` — ${room.name}` : ''}`,
             message || `Places may be becoming available. Please contact us to discuss your child's enrolment.`,
             'waitlist', item.id);
      notified++;
    }

    res.json({ ok: true, notified, message: `Notified ${notified} families` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
