// ─── Public API — /v1/* — external developer endpoints ────────────────────
//
// Authenticated by API key (Authorization: Bearer c360_sk_… or X-API-Key).
// All routes are read-only at the moment; write scopes are reserved for v2.
//
// Note the path prefix is /v1 (not /api/v1) so external integrators can
// distinguish the public API from the internal /api/* surface that's only
// reachable with a JWT.
//
// Column names below match the actual schema (verified against the demo
// tenant DB), not the brief — the spec assumed e.g. invoices.amount_cents
// and waitlist_entries, but the real tables are invoices.amount_due and
// waitlist.

import { Router } from 'express';
import { D } from './db.js';
import { requireApiKey } from './middleware.js';

const router = Router();
router.use(requireApiKey);

// ── helpers ─────────────────────────────────────────────────────────────────
const paginate = (req) => ({
  limit: Math.min(parseInt(req.query.limit, 10) || 50, 200),
  offset: parseInt(req.query.offset, 10) || 0,
});

const withPagination = (res, total, limit, offset) => {
  res.set('X-Total-Count', String(total));
  res.set('X-Limit', String(limit));
  res.set('X-Offset', String(offset));
};

// ════════════════════════════════════════════════════════════════════════════
// CHILDREN
// ════════════════════════════════════════════════════════════════════════════

// GET /v1/children
router.get('/children', (req, res) => {
  try {
    const { limit, offset } = paginate(req);
    const total = D().prepare(
      'SELECT COUNT(*) as n FROM children WHERE tenant_id = ?'
    ).get(req.tenantId).n;
    const rows = D().prepare(`
      SELECT id, first_name, last_name, dob, room_id, gender, language,
             active, enrolled_date, created_at, updated_at
      FROM children
      WHERE tenant_id = ?
      ORDER BY last_name, first_name
      LIMIT ? OFFSET ?
    `).all(req.tenantId, limit, offset);
    withPagination(res, total, limit, offset);
    res.json({ data: rows, total, limit, offset });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /v1/children/:id
router.get('/children/:id', (req, res) => {
  try {
    const row = D().prepare(
      'SELECT * FROM children WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenantId);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// ATTENDANCE
// ════════════════════════════════════════════════════════════════════════════

// GET /v1/attendance?date=YYYY-MM-DD
// GET /v1/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/attendance', (req, res) => {
  try {
    const { limit, offset } = paginate(req);
    const { date, from, to } = req.query;
    let where = 'a.tenant_id = ?';
    const params = [req.tenantId];
    if (date) { where += ' AND a.date = ?'; params.push(date); }
    else if (from && to) { where += ' AND a.date >= ? AND a.date <= ?'; params.push(from, to); }

    const total = D().prepare(
      `SELECT COUNT(*) as n FROM attendance_sessions a WHERE ${where}`
    ).get(...params).n;

    const rows = D().prepare(`
      SELECT a.id, a.child_id, a.date, a.sign_in, a.sign_out, a.hours,
             a.absent, a.absent_reason,
             c.first_name, c.last_name,
             r.name as room_name
      FROM attendance_sessions a
      JOIN children c ON c.id = a.child_id
      LEFT JOIN rooms r ON r.id = c.room_id
      WHERE ${where}
      ORDER BY a.date DESC, a.sign_in
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    withPagination(res, total, limit, offset);
    res.json({ data: rows, total, limit, offset });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// ROOMS
// ════════════════════════════════════════════════════════════════════════════

// GET /v1/rooms — rooms with current enrolment counts
router.get('/rooms', (req, res) => {
  try {
    const rooms = D().prepare(`
      SELECT r.id, r.name, r.age_group, r.capacity, r.created_at,
        (SELECT COUNT(*) FROM children c
          WHERE c.room_id = r.id AND c.tenant_id = r.tenant_id AND c.active = 1
        ) as enrolled_count
      FROM rooms r
      WHERE r.tenant_id = ?
      ORDER BY r.name
    `).all(req.tenantId);
    res.json({ data: rooms });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// EDUCATORS
// ════════════════════════════════════════════════════════════════════════════

// GET /v1/educators
router.get('/educators', (req, res) => {
  try {
    const { limit, offset } = paginate(req);
    const total = D().prepare(
      'SELECT COUNT(*) as n FROM educators WHERE tenant_id = ?'
    ).get(req.tenantId).n;
    const rows = D().prepare(`
      SELECT id, first_name, last_name, role_title, qualification,
             employment_type, status, created_at
      FROM educators
      WHERE tenant_id = ?
      ORDER BY last_name, first_name
      LIMIT ? OFFSET ?
    `).all(req.tenantId, limit, offset);
    withPagination(res, total, limit, offset);
    res.json({ data: rows, total, limit, offset });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// INCIDENTS
// ════════════════════════════════════════════════════════════════════════════

// GET /v1/incidents?from=&to=&severity=
router.get('/incidents', (req, res) => {
  try {
    const { limit, offset } = paginate(req);
    const { from, to, severity } = req.query;
    let where = 'i.tenant_id = ?';
    const params = [req.tenantId];
    if (from) { where += ' AND i.date >= ?'; params.push(from); }
    if (to) { where += ' AND i.date <= ?'; params.push(to); }
    if (severity) { where += ' AND i.severity = ?'; params.push(severity); }

    const total = D().prepare(
      `SELECT COUNT(*) as n FROM incidents i WHERE ${where}`
    ).get(...params).n;

    const rows = D().prepare(`
      SELECT i.id, i.date, i.time, i.type, i.severity, i.title,
             i.location, i.action_taken, i.parent_notified, i.status,
             c.first_name, c.last_name
      FROM incidents i
      LEFT JOIN children c ON c.id = i.child_id
      WHERE ${where}
      ORDER BY i.date DESC, i.time DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    withPagination(res, total, limit, offset);
    res.json({ data: rows, total, limit, offset });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// WAITLIST
// ════════════════════════════════════════════════════════════════════════════

// GET /v1/waitlist
//
// Note the actual table is `waitlist`, not `waitlist_entries`. Column names
// also differ from the brief — the real schema uses child_name, parent_name,
// preferred_room (not session_type / desired_start_date).
router.get('/waitlist', (req, res) => {
  try {
    const { limit, offset } = paginate(req);
    const total = D().prepare(
      'SELECT COUNT(*) as n FROM waitlist WHERE tenant_id = ?'
    ).get(req.tenantId).n;
    const rows = D().prepare(`
      SELECT id, child_name, child_dob,
             parent_name, parent_email, parent_phone,
             preferred_room, preferred_start, preferred_days,
             priority, status, position, notes,
             created_at, updated_at, offer_date
      FROM waitlist
      WHERE tenant_id = ?
      ORDER BY priority DESC, created_at ASC
      LIMIT ? OFFSET ?
    `).all(req.tenantId, limit, offset);
    withPagination(res, total, limit, offset);
    res.json({ data: rows, total, limit, offset });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// INVOICES
// ════════════════════════════════════════════════════════════════════════════

// GET /v1/invoices?status=&from=&to=
//
// Real schema uses issued_at (not invoice_date), period_start/period_end,
// amount_due / amount_paid (not amount_cents).
router.get('/invoices', (req, res) => {
  try {
    const { limit, offset } = paginate(req);
    const { status, from, to } = req.query;
    let where = 'tenant_id = ?';
    const params = [req.tenantId];
    if (status) { where += ' AND status = ?'; params.push(status); }
    if (from) { where += ' AND issued_at >= ?'; params.push(from); }
    if (to) { where += ' AND issued_at <= ?'; params.push(to); }

    const total = D().prepare(
      `SELECT COUNT(*) as n FROM invoices WHERE ${where}`
    ).get(...params).n;

    const rows = D().prepare(`
      SELECT id, invoice_number, period_start, period_end,
             due_date, status, amount_due, amount_paid,
             child_id, issued_at, paid_at, created_at
      FROM invoices
      WHERE ${where}
      ORDER BY issued_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    withPagination(res, total, limit, offset);
    res.json({ data: rows, total, limit, offset });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
