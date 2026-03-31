/**
 * server/ratio-report.js — v2.6.2
 *
 * NQF Educator:Child Ratio Report
 * - Pulls clock_records (educators) + attendance_sessions (children)
 * - Generates 30-minute slot snapshots for any date range
 * - Supports whole-centre or per-room view
 * - Returns breach alerts
 *
 * Australian NQF ratios (Education and Care Services National Regulations):
 *   0–2  years → 1 educator : 4 children
 *   2–3  years → 1 educator : 5 children
 *   3–6  years → 1 educator : 11 children (1:10 in some states)
 *   Over 6     → 1 educator : 15 children (OSHC)
 */

import { Router } from 'express';
import { D } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const router = Router();
router.use(requireAuth);
router.use(requireTenant);

// NQF ratio by age_group slug
const NQF_RATIO = {
  '0-2': 4, '0-24m': 4, 'babies': 4, 'nursery': 4,
  '2-3': 5, '24-36m': 5, 'toddlers': 5,
  '3-4': 11, '3-5': 11, '3-6': 11, 'preschool': 11, 'pre-k': 11, 'kindy': 11,
  '4-5': 11, 'kindergarten': 11,
  'oshc': 15, 'school_age': 15,
};

function getRatio(ageGroup) {
  if (!ageGroup) return 11;
  const key = ageGroup.toLowerCase().replace(/\s+/g,'');
  return NQF_RATIO[key] || NQF_RATIO[ageGroup.toLowerCase()] || 11;
}

// Generate 30-min slot labels for a day: ["06:00","06:30",...,"20:00"]
function daySlots(startHour = 6, endHour = 20) {
  const slots = [];
  for (let h = startHour; h <= endHour; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00`);
    if (h < endHour) slots.push(`${String(h).padStart(2,'0')}:30`);
  }
  return slots;
}

// Convert "HH:MM" to minutes since midnight
function toMins(t) {
  if (!t) return -1;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Is a slot time within [clockIn, clockOut)?
function isActive(slotTime, inTime, outTime) {
  const s = toMins(slotTime);
  const i = toMins(inTime);
  const o = outTime ? toMins(outTime) : toMins('20:00');
  return s >= i && s < o;
}

// ── GET /api/ratio-report/rooms — list rooms with ratios ─────────────────────
router.get('/rooms', (req, res) => {
  try {
    const rooms = D().prepare(
      `SELECT r.*, COUNT(c.id) as child_count
       FROM rooms r
       LEFT JOIN children c ON c.room_id=r.id AND c.tenant_id=r.tenant_id AND c.active=1
       WHERE r.tenant_id=?
       GROUP BY r.id ORDER BY r.name ASC`
    ).all(req.tenantId);
    res.json({ rooms: rooms.map(r => ({ ...r, nqf_ratio: getRatio(r.age_group) })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/ratio-report — generate ratio report ────────────────────────────
// Query params: date_from, date_to, room_id (optional), view=centre|room
router.get('/', (req, res) => {
  try {
    const { date_from, date_to, room_id, view = 'centre' } = req.query;
    const tid = req.tenantId;

    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'date_from and date_to required (YYYY-MM-DD)' });
    }

    // ── 1. Get rooms ─────────────────────────────────────────────────────────
    const roomsQuery = room_id
      ? D().prepare(`SELECT * FROM rooms WHERE id=? AND tenant_id=?`).all(room_id, tid)
      : D().prepare(`SELECT * FROM rooms WHERE tenant_id=? ORDER BY name ASC`).all(tid);

    // ── 2. Get all children with their room assignment ────────────────────────
    const children = D().prepare(
      `SELECT c.id, c.first_name, c.last_name, c.room_id, c.dob,
              r.age_group, r.name as room_name
       FROM children c
       JOIN rooms r ON r.id=c.room_id
       WHERE c.tenant_id=? AND c.active=1`
    ).all(tid);

    // ── 3. Get attendance sessions for date range ─────────────────────────────
    const sessions = D().prepare(
      `SELECT a.child_id, a.date, a.sign_in, a.sign_out, a.absent
       FROM attendance_sessions a
       WHERE a.tenant_id=? AND a.date BETWEEN ? AND ? AND a.absent=0
         AND a.sign_in IS NOT NULL`
    ).all(tid, date_from, date_to);

    // ── 4. Get educator clock records for date range ──────────────────────────
    const clockRecords = D().prepare(
      `SELECT cr.id, cr.member_id, cr.date, cr.clock_in, cr.clock_out,
              e.id as educator_id, e.first_name, e.last_name,
              e.qualification
       FROM clock_records cr
       LEFT JOIN educators e ON e.id = cr.member_id OR e.user_id = cr.member_id
       WHERE cr.tenant_id=? AND cr.date BETWEEN ? AND ?
         AND cr.clock_in IS NOT NULL`
    ).all(tid, date_from, date_to);

    // ── 5. Generate date list ─────────────────────────────────────────────────
    const dates = [];
    let cur = new Date(date_from + 'T00:00:00');
    const end = new Date(date_to + 'T00:00:00');
    while (cur <= end) {
      const dow = cur.getDay();
      if (dow >= 1 && dow <= 5) { // Mon–Fri only
        dates.push(cur.toISOString().split('T')[0]);
      }
      cur.setDate(cur.getDate() + 1);
    }

    // ── 6. Build report grid ─────────────────────────────────────────────────
    const slots = daySlots(6, 19);
    const report = [];
    let totalBreaches = 0;
    let totalSlots = 0;
    let worstBreach = null;

    for (const date of dates) {
      const dateSessions  = sessions.filter(s => s.date === date);
      const dateClocks    = clockRecords.filter(c => c.date === date);
      const dayData = { date, slots: [], summary: { breaches: 0, ok: 0, noChildren: 0 } };

      for (const slot of slots) {
        if (view === 'room') {
          // Per-room breakdown
          const roomBreakdown = roomsQuery.map(room => {
            const ratio = getRatio(room.age_group);
            const roomChildren = dateSessions
              .filter(s => {
                const ch = children.find(c => c.id === s.child_id);
                return ch && ch.room_id === room.id && isActive(slot, s.sign_in, s.sign_out);
              }).length;

            const roomEducators = dateClocks.filter(c =>
              isActive(slot, c.clock_in, c.clock_out)
            );

            const eduCount = roomEducators.length;
            const required = roomChildren > 0 ? Math.ceil(roomChildren / ratio) : 0;
            const breach = roomChildren > 0 && eduCount < required;

            return {
              room_id: room.id,
              room_name: room.name,
              age_group: room.age_group,
              nqf_ratio: ratio,
              children: roomChildren,
              educators: eduCount,
              required,
              breach,
              ratio_achieved: roomChildren > 0 && eduCount > 0
                ? `1:${Math.round(roomChildren / eduCount)}` : '—',
            };
          });

          const anyBreach = roomBreakdown.some(r => r.breach);
          if (anyBreach) {
            dayData.summary.breaches++;
            totalBreaches++;
            if (!worstBreach || roomBreakdown.reduce((a,r)=>a+(r.children-r.required*1),0) >
                                (worstBreach.deficit||0)) {
              worstBreach = { date, slot, rooms: roomBreakdown.filter(r=>r.breach) };
            }
          } else if (roomBreakdown.some(r => r.children > 0)) {
            dayData.summary.ok++;
          } else {
            dayData.summary.noChildren++;
          }
          totalSlots++;
          dayData.slots.push({ slot, rooms: roomBreakdown, breach: anyBreach });

        } else {
          // Centre-wide view
          const presentChildren = dateSessions.filter(s =>
            isActive(slot, s.sign_in, s.sign_out)
          );

          // Group children by age group for weighted ratio
          const byAgeGroup = {};
          presentChildren.forEach(s => {
            const ch = children.find(c => c.id === s.child_id);
            if (!ch) return;
            const ag = ch.age_group || '3-4';
            if (!byAgeGroup[ag]) byAgeGroup[ag] = { count: 0, ratio: getRatio(ag), room_name: ch.room_name };
            byAgeGroup[ag].count++;
          });

          const totalChildren = presentChildren.length;
          const activeEducators = dateClocks.filter(c =>
            isActive(slot, c.clock_in, c.clock_out)
          ).length;

          // Required = sum of required per age group
          const required = Object.values(byAgeGroup).reduce((sum, ag) =>
            sum + Math.ceil(ag.count / ag.ratio), 0);

          const breach = totalChildren > 0 && activeEducators < required;
          if (breach) { dayData.summary.breaches++; totalBreaches++; }
          else if (totalChildren > 0) dayData.summary.ok++;
          else dayData.summary.noChildren++;
          totalSlots++;

          dayData.slots.push({
            slot,
            children: totalChildren,
            educators: activeEducators,
            required,
            breach,
            ageBreakdown: byAgeGroup,
            ratio_achieved: totalChildren > 0 && activeEducators > 0
              ? `1:${Math.round(totalChildren / activeEducators)}` : '—',
          });
        }
      }

      report.push(dayData);
    }

    const complianceRate = totalSlots > 0
      ? Math.round(((totalSlots - totalBreaches) / totalSlots) * 100)
      : 100;

    res.json({
      date_from, date_to, view,
      rooms: roomsQuery.map(r => ({ ...r, nqf_ratio: getRatio(r.age_group) })),
      report,
      summary: {
        total_slots: totalSlots,
        breach_slots: totalBreaches,
        compliance_pct: complianceRate,
        worst_breach: worstBreach,
        dates_covered: dates.length,
      },
    });
  } catch (e) {
    console.error('[ratio-report]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/ratio-report/live — current live ratios (now) ───────────────────
router.get('/live', (req, res) => {
  try {
    const tid = req.tenantId;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const slotMins = Math.floor(now.getMinutes() / 30) * 30;
    const currentSlot = `${String(now.getHours()).padStart(2,'0')}:${String(slotMins).padStart(2,'0')}`;

    const rooms = D().prepare(`SELECT * FROM rooms WHERE tenant_id=? ORDER BY name ASC`).all(tid);
    const children = D().prepare(
      `SELECT c.id, c.first_name, c.last_name, c.room_id, c.dob, c.active,
              r.age_group, r.name as room_name
       FROM children c JOIN rooms r ON r.id=c.room_id
       WHERE c.tenant_id=? AND c.active=1`
    ).all(tid);
    const sessions = D().prepare(`SELECT * FROM attendance_sessions WHERE tenant_id=? AND date=? AND absent=0 AND sign_in IS NOT NULL`).all(tid, today);
    const clocks = D().prepare(
      `SELECT cr.id, cr.member_id, cr.date, cr.clock_in, cr.clock_out,
              e.first_name, e.last_name, e.qualification
       FROM clock_records cr
       LEFT JOIN educators e ON e.id=cr.member_id OR e.user_id=cr.member_id
       WHERE cr.tenant_id=? AND cr.date=? AND cr.clock_in IS NOT NULL
         AND (cr.clock_out IS NULL OR cr.clock_out > ?)`
    ).all(tid, today, currentSlot);

    const roomStats = rooms.map(room => {
      const ratio = getRatio(room.age_group);
      const roomChildren = sessions.filter(s => {
        const ch = children.find(c => c.id === s.child_id);
        return ch && ch.room_id === room.id && isActive(currentSlot, s.sign_in, s.sign_out);
      }).length;
      const roomEducators = clocks.filter(c => isActive(currentSlot, c.clock_in, c.clock_out)).length;
      const required = roomChildren > 0 ? Math.ceil(roomChildren / ratio) : 0;
      return {
        room_id: room.id,
        room_name: room.name,
        age_group: room.age_group,
        nqf_ratio: ratio,
        children: roomChildren,
        educators: roomEducators,
        required,
        breach: roomChildren > 0 && roomEducators < required,
        ok: roomChildren === 0 || roomEducators >= required,
      };
    });

    const totalChildren = sessions.filter(s => isActive(currentSlot, s.sign_in, s.sign_out)).length;
    const totalEducators = clocks.filter(c => isActive(currentSlot, c.clock_in, c.clock_out)).length;
    const breachCount = roomStats.filter(r => r.breach).length;

    res.json({
      as_of: new Date().toISOString(),
      slot: currentSlot,
      total_children: totalChildren,
      total_educators: totalEducators,
      breach_count: breachCount,
      all_ok: breachCount === 0,
      rooms: roomStats,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
