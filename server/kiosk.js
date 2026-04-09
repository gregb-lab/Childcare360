/**
 * server/kiosk.js — v2.13.0
 * Kiosk / tablet sign-in mode
 *   /api/kiosk/status          — today's sign-in status per child
 *   /api/kiosk/lookup          — look up child by PIN (no auth needed)
 *   /api/kiosk/signin          — sign child in
 *   /api/kiosk/signout         — sign child out
 *   /api/kiosk/pins            — admin: manage PINs
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();

const today = () => new Date().toISOString().split('T')[0];
const now   = () => new Date().toISOString();

// ── Public kiosk endpoints (PIN-verified, no JWT needed) ─────────────────────
// These endpoints accept x-tenant-id header but not JWT auth

function requireTenantHeader(req, res, next) {
  const tid = req.headers['x-tenant-id'];
  if (!tid) return res.status(400).json({ error: 'x-tenant-id required' });
  req.tenantId = tid;
  next();
}

// Look up child by PIN — returns child info if found
r.post('/lookup', requireTenantHeader, (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'pin required' });

    const pinRecord = D().prepare(`
      SELECT kp.*, c.first_name, c.last_name, c.dob, c.room_id,
             c.photo_url, r.name as room_name,
             c.medical_conditions, c.allergies
      FROM kiosk_pins kp
      JOIN children c ON c.id = kp.child_id
      LEFT JOIN rooms r ON r.id = c.room_id
      WHERE kp.tenant_id=? AND kp.pin=? AND kp.active=1 AND c.active=1
    `).get(req.tenantId, pin.toString().trim());

    if (!pinRecord) return res.status(404).json({ error: 'PIN not found' });

    // Check current sign-in status
    const session = D().prepare(`
      SELECT * FROM kiosk_sessions
      WHERE tenant_id=? AND child_id=? AND session_date=?
      ORDER BY created_at DESC LIMIT 1
    `).get(req.tenantId, pinRecord.child_id, today());

    res.json({
      found: true,
      child: {
        id: pinRecord.child_id,
        first_name: pinRecord.first_name,
        last_name: pinRecord.last_name,
        room_name: pinRecord.room_name,
        photo_url: pinRecord.photo_url,
        medical_conditions: pinRecord.medical_conditions,
        allergies: pinRecord.allergies,
      },
      status: session?.signed_out_at ? 'signed_out'
            : session?.signed_in_at  ? 'signed_in'
            : 'not_signed_in',
      signed_in_at:  session?.signed_in_at  || null,
      signed_out_at: session?.signed_out_at || null,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Sign child in via PIN
r.post('/signin', requireTenantHeader, (req, res) => {
  try {
    const { pin, signed_in_by, temp_check } = req.body;
    if (!pin) return res.status(400).json({ error: 'pin required' });

    const pinRecord = D().prepare(
      'SELECT * FROM kiosk_pins WHERE tenant_id=? AND pin=? AND active=1'
    ).get(req.tenantId, pin.toString().trim());

    if (!pinRecord) return res.status(404).json({ error: 'PIN not found' });

    // Check not already signed in today
    const existing = D().prepare(`
      SELECT * FROM kiosk_sessions
      WHERE tenant_id=? AND child_id=? AND session_date=? AND signed_out_at IS NULL
    `).get(req.tenantId, pinRecord.child_id, today());

    if (existing?.signed_in_at) {
      return res.status(409).json({
        error: 'Child already signed in today',
        signed_in_at: existing.signed_in_at
      });
    }

    const id = uuid();
    D().prepare(`
      INSERT INTO kiosk_sessions
        (id, tenant_id, child_id, pin, session_date, signed_in_at, signed_in_by, sign_in_temp_check)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(id, req.tenantId, pinRecord.child_id, pin, today(), now(),
           signed_in_by || 'Kiosk', temp_check ? 1 : 0);

    // Also update attendance_sessions if that table exists
    try {
      D().prepare(`
        INSERT OR IGNORE INTO attendance_sessions
          (id, tenant_id, child_id, date, sign_in, absent)
        VALUES (?,?,?,?,?,0)
      `).run(uuid(), req.tenantId, pinRecord.child_id, today(),
             new Date().toTimeString().slice(0,5));
    } catch(e) { /* attendance_sessions may not exist */ }

    const child = D().prepare(
      'SELECT first_name, last_name FROM children WHERE id=?'
    ).get(pinRecord.child_id);

    res.json({
      ok: true,
      session_id: id,
      child_name: `${child.first_name} ${child.last_name}`,
      signed_in_at: now(),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Sign child out via PIN
r.post('/signout', requireTenantHeader, (req, res) => {
  try {
    const { pin, signed_out_by, note } = req.body;
    if (!pin) return res.status(400).json({ error: 'pin required' });

    const pinRecord = D().prepare(
      'SELECT * FROM kiosk_pins WHERE tenant_id=? AND pin=? AND active=1'
    ).get(req.tenantId, pin.toString().trim());

    if (!pinRecord) return res.status(404).json({ error: 'PIN not found' });

    const session = D().prepare(`
      SELECT * FROM kiosk_sessions
      WHERE tenant_id=? AND child_id=? AND session_date=? AND signed_in_at IS NOT NULL AND signed_out_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `).get(req.tenantId, pinRecord.child_id, today());

    if (!session) return res.status(409).json({ error: 'Child not currently signed in' });

    const signOutTime = now();
    D().prepare(`
      UPDATE kiosk_sessions SET signed_out_at=?, signed_out_by=?, sign_out_note=?
      WHERE id=?
    `).run(signOutTime, signed_out_by || 'Kiosk', note || null, session.id);

    // Update attendance_sessions
    try {
      D().prepare(`
        UPDATE attendance_sessions SET sign_out=?, hours=?
        WHERE tenant_id=? AND child_id=? AND date=?
      `).run(
        new Date().toTimeString().slice(0,5),
        Math.round((new Date(signOutTime) - new Date(session.signed_in_at)) / 3600000 * 10) / 10,
        req.tenantId, pinRecord.child_id, today()
      );
    } catch(e) { /* ignore */ }

    const child = D().prepare('SELECT first_name, last_name FROM children WHERE id=? AND tenant_id=?')
      .get(pinRecord.child_id);

    res.json({
      ok: true,
      child_name: `${child.first_name} ${child.last_name}`,
      signed_out_at: signOutTime,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Today's sign-in status for all children (for display board)
r.get('/status', requireTenantHeader, (req, res) => {
  try {
    const sessions = D().prepare(`
      SELECT ks.*, c.first_name, c.last_name, c.photo_url,
             r.name as room_name, r.id as room_id
      FROM kiosk_sessions ks
      JOIN children c ON c.id=ks.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE ks.tenant_id=? AND ks.session_date=?
      ORDER BY ks.signed_in_at DESC
    `).all(req.tenantId, today());

    const summary = {
      signed_in: sessions.filter(s => s.signed_in_at && !s.signed_out_at).length,
      signed_out: sessions.filter(s => s.signed_out_at).length,
      total: sessions.length,
    };

    res.json({ sessions, summary, date: today() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Authenticated admin endpoints ─────────────────────────────────────────────
r.use(requireAuth, requireTenant);

// Get all PINs for this tenant
r.get('/pins', (req, res) => {
  try {
    const pins = D().prepare(`
      SELECT kp.*, c.first_name, c.last_name, c.room_id, r.name as room_name
      FROM kiosk_pins kp
      JOIN children c ON c.id=kp.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE kp.tenant_id=? AND kp.active=1
      ORDER BY c.last_name, c.first_name
    `).all(req.tenantId);
    res.json({ pins });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Set or update PIN for a child
r.post('/pins', (req, res) => {
  try {
    const { child_id, pin, pin_hint } = req.body;
    if (!child_id || !pin) return res.status(400).json({ error: 'child_id and pin required' });
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN must be 4-6 digits' });

    // Check PIN not already used by another child in this tenant
    const conflict = D().prepare(
      'SELECT child_id FROM kiosk_pins WHERE tenant_id=? AND pin=? AND child_id!=? AND active=1'
    ).get(req.tenantId, pin, child_id);
    if (conflict) return res.status(409).json({ error: 'PIN already in use by another child' });

    D().prepare(`
      INSERT INTO kiosk_pins (id, tenant_id, child_id, pin, pin_hint, active)
      VALUES (?,?,?,?,?,1)
      ON CONFLICT(tenant_id, child_id) DO UPDATE SET pin=excluded.pin, pin_hint=excluded.pin_hint, active=1
    `).run(uuid(), req.tenantId, child_id, pin, pin_hint || null);

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.delete('/pins/:childId', (req, res) => {
  try {
    D().prepare('UPDATE kiosk_pins SET active=0 WHERE tenant_id=? AND child_id=?')
      .run(req.tenantId, req.params.childId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin view of today's attendance via kiosk
r.get('/today', (req, res) => {
  try {
    const { room_id } = req.query;
    const where = ['ks.tenant_id=?', 'ks.session_date=?'];
    const vals  = [req.tenantId, today()];
    if (room_id) { where.push('c.room_id=?'); vals.push(room_id); }

    const sessions = D().prepare(`
      SELECT ks.*, c.first_name, c.last_name, c.photo_url, c.room_id,
             r.name as room_name
      FROM kiosk_sessions ks
      JOIN children c ON c.id=ks.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE ${where.join(' AND ')}
      ORDER BY ks.signed_in_at DESC
    `).all(...vals);

    // Children with PINs but not yet signed in
    const notSignedIn = D().prepare(`
      SELECT c.id, c.first_name, c.last_name, c.photo_url, c.room_id,
             r.name as room_name
      FROM kiosk_pins kp
      JOIN children c ON c.id=kp.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE kp.tenant_id=? AND kp.active=1 AND c.active=1
        AND c.id NOT IN (SELECT child_id FROM kiosk_sessions WHERE tenant_id=? AND session_date=?)
        ${room_id ? 'AND c.room_id=?' : ''}
      ORDER BY c.last_name
    `).all(...([req.tenantId, req.tenantId, today()].concat(room_id ? [room_id] : [])));

    // Build summary (matching /board endpoint format)
    const summary = {
      signed_in: sessions.filter(s => s.signed_in_at && !s.signed_out_at).length,
      signed_out: sessions.filter(s => s.signed_out_at).length,
      total: sessions.length,
    };

    // Also include children signed in via attendance_sessions (Clock In/Out module)
    try {
      const attendanceSessions = D().prepare(`
        SELECT a.child_id, a.sign_in, a.sign_out, c.first_name, c.last_name, c.photo_url, c.room_id, r.name as room_name
        FROM attendance_sessions a
        JOIN children c ON c.id=a.child_id
        LEFT JOIN rooms r ON r.id=c.room_id
        WHERE a.tenant_id=? AND a.date=? AND a.sign_in IS NOT NULL AND a.absent=0
      `).all(req.tenantId, today());
      // Add attendance-based sign-ins to summary if not already in kiosk sessions
      const kioskChildIds = new Set(sessions.map(s => s.child_id));
      attendanceSessions.forEach(a => {
        if (!kioskChildIds.has(a.child_id)) {
          summary.signed_in += a.sign_in && !a.sign_out ? 1 : 0;
          summary.signed_out += a.sign_out ? 1 : 0;
          summary.total += 1;
        }
      });
    } catch(e) {}

    res.json({ sessions, not_signed_in: notSignedIn, summary, date: today() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Auto-generate PINs for all children without one
r.post('/pins/auto-generate', (req, res) => {
  try {
    const children = D().prepare(`
      SELECT c.id FROM children c
      WHERE c.tenant_id=? AND c.active=1
        AND c.id NOT IN (SELECT child_id FROM kiosk_pins WHERE tenant_id=? AND active=1)
    `).all(req.tenantId, req.tenantId);

    // Get all existing PINs to avoid collisions
    const existing = new Set(
      D().prepare('SELECT pin FROM kiosk_pins WHERE tenant_id=? AND active=1')
        .all(req.tenantId).map(p => p.pin)
    );

    let count = 0;
    const ins = D().prepare(`
      INSERT OR IGNORE INTO kiosk_pins (id, tenant_id, child_id, pin, active)
      VALUES (?,?,?,?,1)
    `);

    D().transaction(() => {
      for (const child of children) {
        let pin;
        let attempts = 0;
        do {
          pin = String(Math.floor(1000 + Math.random() * 9000)); // 4-digit
          attempts++;
        } while (existing.has(pin) && attempts < 100);
        existing.add(pin);
        ins.run(uuid(), req.tenantId, child.id, pin);
        count++;
      }
    })();

    res.json({ ok: true, generated: count });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
