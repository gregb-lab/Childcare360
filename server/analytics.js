/**
 * server/analytics.js — v2.20.0
 * Attendance & operational analytics:
 *   GET /api/analytics/attendance      — detailed attendance trends
 *   GET /api/analytics/rooms           — room utilisation analytics
 *   GET /api/analytics/forecast        — 4-week attendance forecast
 *   GET /api/analytics/revenue         — revenue trends from invoices
 *   GET /api/analytics/educator-hours  — educator hours trends
 *   GET /api/analytics/overview        — centre KPI overview for dashboard
 */
import { Router } from 'express';
import { D } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

const today = () => new Date().toISOString().split('T')[0];
const daysAgo = n => new Date(Date.now() - n*86400000).toISOString().split('T')[0];
const daysAhead = n => new Date(Date.now() + n*86400000).toISOString().split('T')[0];

// ── Attendance analytics ──────────────────────────────────────────────────────
r.get('/attendance', (req, res) => {
  try {
    const { weeks = 12, room_id } = req.query;
    const from = daysAgo(parseInt(weeks) * 7);

    // Daily attendance
    const daily = D().prepare(`
      SELECT a.date,
        COUNT(CASE WHEN a.absent=0 AND a.sign_in IS NOT NULL THEN 1 END) as present,
        COUNT(CASE WHEN a.absent=1 THEN 1 END) as absent,
        COUNT(*) as total_sessions,
        ROUND(AVG(a.hours),1) as avg_hours
      FROM attendance_sessions a
      JOIN children c ON c.id=a.child_id
      WHERE a.tenant_id=? AND a.date >= ?
        ${room_id ? 'AND c.room_id=?' : ''}
      GROUP BY a.date
      ORDER BY a.date
    `).all(...[req.tenantId, from, ...(room_id ? [room_id] : [])]);

    // Day-of-week breakdown
    const byDow = D().prepare(`
      SELECT strftime('%w', a.date) as dow,
        COUNT(CASE WHEN a.absent=0 AND a.sign_in IS NOT NULL THEN 1 END) as present,
        COUNT(*) as total,
        ROUND(100.0 * COUNT(CASE WHEN a.absent=0 THEN 1 END) / COUNT(*), 1) as attendance_rate
      FROM attendance_sessions a
      JOIN children c ON c.id=a.child_id
      WHERE a.tenant_id=? AND a.date >= ?
        ${room_id ? 'AND c.room_id=?' : ''}
        AND strftime('%w', a.date) BETWEEN '1' AND '5'
      GROUP BY dow
      ORDER BY dow
    `).all(...[req.tenantId, from, ...(room_id ? [room_id] : [])]);

    const DOW_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dowEnriched = byDow.map(d => ({
      ...d,
      day_name: DOW_NAMES[parseInt(d.dow)],
      avg_present: Math.round(d.present / (daily.length / 5 || 1)),
    }));

    // Weekly summary
    const weekly = D().prepare(`
      SELECT strftime('%Y-W%W', a.date) as week,
        MIN(a.date) as week_start,
        COUNT(CASE WHEN a.absent=0 AND a.sign_in IS NOT NULL THEN 1 END) as total_present,
        ROUND(100.0 * COUNT(CASE WHEN a.absent=0 THEN 1 END) / COUNT(*), 1) as attendance_rate
      FROM attendance_sessions a
      JOIN children c ON c.id=a.child_id
      WHERE a.tenant_id=? AND a.date >= ?
        ${room_id ? 'AND c.room_id=?' : ''}
      GROUP BY week
      ORDER BY week
    `).all(...[req.tenantId, from, ...(room_id ? [room_id] : [])]);

    // Peak hour analysis from sign_in times
    const hourly = D().prepare(`
      SELECT CAST(strftime('%H', a.sign_in) AS INTEGER) as hour,
        COUNT(*) as arrivals
      FROM attendance_sessions a
      JOIN children c ON c.id=a.child_id
      WHERE a.tenant_id=? AND a.date >= ? AND a.sign_in IS NOT NULL
        ${room_id ? 'AND c.room_id=?' : ''}
      GROUP BY hour
      ORDER BY hour
    `).all(...[req.tenantId, from, ...(room_id ? [room_id] : [])]);

    // Children with most absences
    const absentees = D().prepare(`
      SELECT c.first_name, c.last_name, r.name as room,
        COUNT(CASE WHEN a.absent=1 THEN 1 END) as absences,
        COUNT(*) as total_days,
        ROUND(100.0 * COUNT(CASE WHEN a.absent=1 THEN 1 END) / COUNT(*), 1) as absence_rate
      FROM attendance_sessions a
      JOIN children c ON c.id=a.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE a.tenant_id=? AND a.date >= ?
      GROUP BY c.id
      HAVING absences > 0
      ORDER BY absences DESC
      LIMIT 10
    `).all(req.tenantId, from);

    res.json({ daily, weekly, by_dow: dowEnriched, hourly, absentees });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Room utilisation ──────────────────────────────────────────────────────────
r.get('/rooms', (req, res) => {
  try {
    const from = daysAgo(30);

    const rooms = D().prepare(`
      SELECT r.id, r.name, r.age_group, r.capacity,
        COUNT(CASE WHEN c.active=1 THEN 1 END) as enrolled
      FROM rooms r
      LEFT JOIN children c ON c.room_id=r.id AND c.tenant_id=r.tenant_id
      WHERE r.tenant_id=?
      GROUP BY r.id
    `).all(req.tenantId);

    const roomStats = rooms.map(room => {
      const attendanceLast30 = D().prepare(`
        SELECT AVG(daily_present) as avg_daily,
               MAX(daily_present) as peak_day
        FROM (
          SELECT a.date, COUNT(*) as daily_present
          FROM attendance_sessions a
          JOIN children c ON c.id=a.child_id
          WHERE a.tenant_id=? AND c.room_id=? AND a.date >= ? AND a.absent=0
          GROUP BY a.date
        )
      `).get(req.tenantId, room.id, from);

      return {
        ...room,
        occupancy_pct: room.capacity > 0 ? Math.round(room.enrolled/room.capacity*100) : 0,
        avg_daily_attendance: Math.round(attendanceLast30?.avg_daily || 0),
        peak_attendance: attendanceLast30?.peak_day || 0,
        utilisation_pct: room.capacity > 0
          ? Math.round((attendanceLast30?.avg_daily || 0)/room.capacity*100) : 0,
      };
    });

    res.json({ rooms: roomStats });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Attendance forecast (simple trend-based) ──────────────────────────────────
r.get('/forecast', (req, res) => {
  try {
    // Get last 8 weeks of attendance by day-of-week
    const from = daysAgo(56);

    const byDow = D().prepare(`
      SELECT strftime('%w', a.date) as dow,
        AVG(daily_count) as avg_present
      FROM (
        SELECT a.date, strftime('%w', a.date) as dow,
          COUNT(CASE WHEN a.absent=0 AND a.sign_in IS NOT NULL THEN 1 END) as daily_count
        FROM attendance_sessions a
        WHERE a.tenant_id=? AND a.date >= ?
        GROUP BY a.date
      )
      WHERE dow BETWEEN '1' AND '5'
      GROUP BY dow
    `).all(req.tenantId, from);

    const avgByDow = {};
    byDow.forEach(d => { avgByDow[d.dow] = Math.round(d.avg_present || 0); });

    // Generate 4-week forecast
    const forecast = [];
    const start = new Date();
    start.setDate(start.getDate() + 1);

    for (let i = 0; i < 28; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dow = d.getDay().toString();
      if (dow < '1' || dow > '5') continue; // weekdays only

      const dateStr = d.toISOString().split('T')[0];
      forecast.push({
        date: dateStr,
        day_name: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][parseInt(dow)],
        forecast_present: avgByDow[dow] || 0,
        dow,
      });
    }

    // Total enrolled for reference
    const enrolled = D().prepare(
      'SELECT COUNT(*) as n FROM children WHERE tenant_id=? AND active=1'
    ).get(req.tenantId)?.n || 0;

    res.json({ forecast, enrolled, avg_by_dow: avgByDow });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Revenue analytics ─────────────────────────────────────────────────────────
r.get('/revenue', (req, res) => {
  try {
    const monthly = D().prepare(`
      SELECT strftime('%Y-%m', created_at) as month,
        COUNT(*) as invoice_count,
        SUM(total_cents) as billed_cents,
        SUM(CASE WHEN status='paid' THEN total_cents ELSE 0 END) as collected_cents,
        SUM(CASE WHEN status='overdue' THEN total_cents ELSE 0 END) as overdue_cents
      FROM invoices
      WHERE tenant_id=?
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `).all(req.tenantId);

    const currentMonth = new Date().toISOString().slice(0,7);
    const thisMonth = monthly.find(m => m.month === currentMonth) || {};
    const lastMonth = monthly[1] || {};

    const collectionRate = thisMonth.billed_cents
      ? Math.round(thisMonth.collected_cents / thisMonth.billed_cents * 100) : 0;

    res.json({
      monthly: monthly.map(m => ({
        ...m,
        billed: (m.billed_cents||0)/100,
        collected: (m.collected_cents||0)/100,
        overdue: (m.overdue_cents||0)/100,
      })),
      this_month: { ...thisMonth, billed: (thisMonth.billed_cents||0)/100, collected: (thisMonth.collected_cents||0)/100 },
      collection_rate: collectionRate,
      mom_change: lastMonth.collected_cents
        ? Math.round(((thisMonth.collected_cents||0) - lastMonth.collected_cents) / lastMonth.collected_cents * 100) : 0,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Educator hours trends ─────────────────────────────────────────────────────
r.get('/educator-hours', (req, res) => {
  try {
    const from = daysAgo(30);

    const weekly = D().prepare(`
      SELECT strftime('%Y-W%W', COALESCE(clock_date, date)) as week,
        MIN(COALESCE(clock_date, date)) as week_start,
        COUNT(DISTINCT educator_id) as educator_count,
        ROUND(SUM(COALESCE(hours_worked,0)), 1) as total_hours,
        ROUND(AVG(COALESCE(hours_worked,0)), 1) as avg_hours_per_shift
      FROM clock_records
      WHERE tenant_id=? AND COALESCE(clock_date, date) >= ? AND clock_out IS NOT NULL
      GROUP BY strftime('%Y-W%W', COALESCE(clock_date, date))
      ORDER BY week
    `).all(req.tenantId, from);

    const byEducator = D().prepare(`
      SELECT e.first_name, e.last_name, e.qualification,
        COUNT(*) as shifts,
        ROUND(SUM(COALESCE(cr.hours_worked, 0)), 1) as total_hours
      FROM clock_records cr
      JOIN educators e ON e.id=COALESCE(cr.educator_id, cr.member_id)
      WHERE cr.tenant_id=? AND COALESCE(cr.clock_date, cr.date) >= ? AND cr.clock_out IS NOT NULL
      GROUP BY COALESCE(cr.educator_id, cr.member_id)
      ORDER BY total_hours DESC
    `).all(req.tenantId, from);

    res.json({ weekly, by_educator: byEducator });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
