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
      SELECT sub.dow,
        AVG(sub.daily_count) as avg_present
      FROM (
        SELECT a.date, strftime('%w', a.date) as dow,
          COUNT(CASE WHEN a.absent=0 AND a.sign_in IS NOT NULL THEN 1 END) as daily_count
        FROM attendance_sessions a
        WHERE a.tenant_id=? AND a.date >= ?
        GROUP BY a.date
      ) sub
      WHERE sub.dow BETWEEN '1' AND '5'
      GROUP BY sub.dow
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
        CAST(COALESCE(SUM(total_fee), 0) * 100 AS INTEGER) as billed_cents,
        CAST(COALESCE(SUM(CASE WHEN status='paid' THEN total_fee ELSE 0 END), 0) * 100 AS INTEGER) as collected_cents,
        CAST(COALESCE(SUM(CASE WHEN status='overdue' THEN total_fee ELSE 0 END), 0) * 100 AS INTEGER) as overdue_cents
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

// ── Attendance vs Scheduled forecast with casual opportunities ───────────────
r.get('/attendance-forecast', (req, res) => {
  try {
    const db = D();
    const weeks = parseInt(req.query.weeks) || 12;
    const roomFilter = req.query.room_id ? 'AND c.room_id = ?' : '';
    const roomParams = req.query.room_id ? [req.tenantId, req.query.room_id] : [req.tenantId];
    const from = daysAgo(weeks * 7);

    // Historical daily attendance
    const histSql = 'SELECT a.date, strftime(\'%w\', a.date) as dow, COUNT(DISTINCT a.child_id) as scheduled, COUNT(DISTINCT CASE WHEN a.sign_in IS NOT NULL THEN a.child_id END) as attended, COUNT(DISTINCT CASE WHEN a.absent=1 THEN a.child_id END) as marked_absent FROM attendance_sessions a JOIN children c ON c.id=a.child_id WHERE a.tenant_id=? ' + roomFilter + ' AND a.date >= ? AND a.date < ? AND strftime(\'%w\', a.date) NOT IN (\'0\',\'6\') GROUP BY a.date ORDER BY a.date ASC';
    const historical = db.prepare(histSql).all(...roomParams, from, today());

    // Average rate by day of week
    const byDayOfWeek = {};
    for (let d = 1; d <= 5; d++) {
      const dayData = historical.filter(h => parseInt(h.dow) === d);
      if (!dayData.length) { byDayOfWeek[d] = { avg_rate: 85, sample_size: 0 }; continue; }
      const rates = dayData.map(h => h.scheduled > 0 ? Math.round(h.attended / h.scheduled * 1000) / 10 : 85);
      const avgRate = Math.round(rates.reduce((a, b) => a + b, 0) / rates.length * 10) / 10;
      const avgSched = Math.round(dayData.reduce((a, b) => a + b.scheduled, 0) / dayData.length);
      byDayOfWeek[d] = { avg_rate: avgRate, sample_size: dayData.length, avg_scheduled: avgSched, avg_attended: Math.round(avgSched * avgRate / 100), avg_no_shows: avgSched - Math.round(avgSched * avgRate / 100) };
    }

    // Next 7 weekdays forecast
    const enrolled = db.prepare('SELECT COUNT(*) as n FROM children WHERE tenant_id=? AND active=1' + (req.query.room_id ? ' AND room_id=?' : '')).get(...roomParams)?.n || 0;
    const forecastDays = [];
    for (let i = 1; i <= 10 && forecastDays.length < 5; i++) {
      const fd = daysAhead(i);
      const dow = new Date(fd + 'T12:00:00').getDay();
      if (dow === 0 || dow === 6) continue;
      const rate = byDayOfWeek[dow] || { avg_rate: 85, sample_size: 0 };
      const expected = Math.round(enrolled * rate.avg_rate / 100);
      const noShows = enrolled - expected;
      // Std dev from historical
      const dayHist = historical.filter(h => parseInt(h.dow) === dow);
      let stdDev = 5;
      if (dayHist.length > 1) {
        const r2 = dayHist.map(h => h.scheduled > 0 ? h.attended / h.scheduled * 100 : 85);
        const mean = r2.reduce((a, b) => a + b, 0) / r2.length;
        stdDev = Math.round(Math.sqrt(r2.reduce((a, b) => a + (b - mean) ** 2, 0) / r2.length) * 10) / 10;
      }
      forecastDays.push({
        date: fd, day_of_week: dow, day_name: ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][dow],
        scheduled: enrolled, expected_attended: expected, expected_no_shows: noShows,
        attendance_rate_pct: rate.avg_rate, std_dev_pct: stdDev,
        casual_opportunity: noShows,
        confidence: dayHist.length >= 10 ? 'high' : dayHist.length >= 5 ? 'medium' : 'low',
        historical_samples: dayHist.length,
      });
    }

    // ── KNOWN ABSENCES: query attendance_sessions for future absent=1 ──
    const knownAbsences = {};
    try {
      const futureAbsent = db.prepare(
        'SELECT a.date, COUNT(*) as count FROM attendance_sessions a WHERE a.tenant_id=? AND a.absent=1 AND a.date>=date(\'now\') AND a.date<=date(\'now\',\'+10 days\') GROUP BY a.date'
      ).all(req.tenantId);
      futureAbsent.forEach(row => { knownAbsences[row.date] = row.count; });
    } catch(e) {}

    // Adjust each forecast day with confirmed absences
    forecastDays.forEach(day => {
      const confirmed = knownAbsences[day.date] || 0;
      const remaining = day.scheduled - confirmed;
      const predicted = Math.max(0, Math.round(remaining * (1 - day.attendance_rate_pct / 100)));
      day.confirmed_absences = confirmed;
      day.predicted_absences = predicted;
      day.total_expected_absent = confirmed + predicted;
      day.expected_attended = day.scheduled - day.total_expected_absent;
      day.expected_no_shows = day.total_expected_absent;
      day.casual_opportunity = day.total_expected_absent;
      day.casual_confirmed = confirmed;
      day.casual_predicted = predicted;
      if (confirmed > 0) { day.has_confirmed_absences = true; if (day.confidence === 'low') day.confidence = 'medium'; }
    });

    const avgRate = historical.length > 0 ? Math.round(historical.reduce((a, b) => a + (b.scheduled > 0 ? b.attended / b.scheduled * 100 : 85), 0) / historical.length * 10) / 10 : 85;
    res.json({
      summary: {
        avg_attendance_rate_pct: avgRate, historical_weeks_analysed: weeks, total_days_analysed: historical.length,
        next_week_scheduled: forecastDays.reduce((a, b) => a + b.scheduled, 0),
        next_week_expected: forecastDays.reduce((a, b) => a + b.expected_attended, 0),
        casual_opportunity_next_week: forecastDays.reduce((a, b) => a + b.casual_opportunity, 0),
        confirmed_absences_next_week: forecastDays.reduce((a, b) => a + (b.confirmed_absences || 0), 0),
        predicted_absences_next_week: forecastDays.reduce((a, b) => a + (b.predicted_absences || 0), 0),
      },
      by_day_of_week: byDayOfWeek,
      forecast_days: forecastDays,
      historical_daily: historical.slice(-30),
    });
  } catch (e) { console.error('[analytics/attendance-forecast]', e.message); res.status(500).json({ error: e.message }); }
});

// ── Room-level roster capacity with casual spots ─────────────────────────────
r.get('/roster-capacity', (req, res) => {
  try {
    const db = D();
    const targetDate = req.query.date || today();
    const dow = new Date(targetDate + 'T12:00:00').getDay();

    const rooms = db.prepare('SELECT r.id, r.name, r.age_group, r.capacity, COUNT(DISTINCT c.id) as enrolled FROM rooms r LEFT JOIN children c ON c.room_id=r.id AND c.tenant_id=r.tenant_id AND c.active=1 WHERE r.tenant_id=? GROUP BY r.id').all(req.tenantId);

    const result = rooms.map(room => {
      const hist = db.prepare('SELECT COUNT(DISTINCT a.child_id) as scheduled, COUNT(DISTINCT CASE WHEN a.sign_in IS NOT NULL THEN a.child_id END) as attended FROM attendance_sessions a JOIN children c ON c.id=a.child_id WHERE a.tenant_id=? AND c.room_id=? AND strftime(\'%w\',a.date)=? AND a.date>=? AND a.date<?').get(req.tenantId, room.id, String(dow), daysAgo(84), today());
      const histRate = hist?.scheduled > 0 ? Math.round(hist.attended / hist.scheduled * 100) : 85;

      // Confirmed absences for this room on target date
      let confirmedAbsent = 0;
      try { confirmedAbsent = db.prepare('SELECT COUNT(*) as n FROM attendance_sessions a JOIN children c ON c.id=a.child_id WHERE a.tenant_id=? AND c.room_id=? AND a.date=? AND a.absent=1').get(req.tenantId, room.id, targetDate)?.n || 0; } catch(e) {}

      const remaining = room.enrolled - confirmedAbsent;
      const predictedAbsent = Math.max(0, Math.round(remaining * (1 - histRate / 100)));
      const totalAbsent = confirmedAbsent + predictedAbsent;
      const expected = room.enrolled - totalAbsent;

      let rostered = 0;
      try { rostered = db.prepare('SELECT COUNT(DISTINCT member_id) as n FROM roster_entries WHERE tenant_id=? AND room_id=? AND date=? AND shift_type!=\'off\'').get(req.tenantId, room.id, targetDate)?.n || 0; } catch (e) {}
      const ratio = room.age_group === 'babies' ? 4 : room.age_group === 'toddlers' ? 5 : 11;
      const requiredForExpected = Math.max(1, Math.ceil(expected / ratio));
      return {
        room_id: room.id, room_name: room.name, age_group: room.age_group, capacity: room.capacity,
        enrolled: room.enrolled, historical_attendance_rate: histRate,
        confirmed_absences: confirmedAbsent, predicted_absences: predictedAbsent,
        expected_attended: expected, expected_no_shows: totalAbsent, casual_opportunity: totalAbsent,
        casual_confirmed: confirmedAbsent, casual_predicted: predictedAbsent,
        rostered_educators: rostered, required_for_expected: requiredForExpected,
        educator_surplus_if_forecast_correct: rostered - requiredForExpected,
        can_offer_casual: totalAbsent > 0,
      };
    });

    res.json({
      date: targetDate, rooms: result,
      total_enrolled: result.reduce((a, b) => a + b.enrolled, 0),
      total_expected: result.reduce((a, b) => a + b.expected_attended, 0),
      total_casual_opportunity: result.reduce((a, b) => a + b.casual_opportunity, 0),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default r;
