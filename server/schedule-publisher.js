/**
 * server/schedule-publisher.js — v2.20.0
 *   GET  /api/schedule/current         — current week's published roster
 *   POST /api/schedule/publish         — publish roster period to educators
 *   GET  /api/schedule/educator/:id    — educator's own schedule view
 *   GET  /api/schedule/medical-alerts  — children with medical needs for today
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

// ── Published schedule ────────────────────────────────────────────────────────
r.get('/current', (req, res) => {
  try {
    const { week_start } = req.query;
    const monday = week_start || (() => {
      const d = new Date();
      const day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      return d.toISOString().split('T')[0];
    })();
    const friday = new Date(new Date(monday+'T12:00').getTime() + 4*86400000).toISOString().split('T')[0];

    const shifts = D().prepare(`
      SELECT re.*, e.first_name, e.last_name, e.qualification, e.photo_url,
             r.name as room_name, r.age_group
      FROM roster_entries re
      JOIN educators e ON e.id=re.educator_id
      LEFT JOIN rooms r ON r.id=re.room_id
      WHERE re.tenant_id=? AND re.shift_date BETWEEN ? AND ?
      ORDER BY re.shift_date, re.start_time, e.last_name
    `).all(req.tenantId, monday, friday);

    // Group by date
    const byDate = {};
    shifts.forEach(s => {
      (byDate[s.shift_date] = byDate[s.shift_date] || []).push(s);
    });

    const rooms = D().prepare('SELECT * FROM rooms WHERE tenant_id=? ORDER BY name').all(req.tenantId);

    res.json({ week_start: monday, week_end: friday, shifts: byDate, rooms, total_shifts: shifts.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Publish to educators (notify via message thread) ─────────────────────────
r.post('/publish', (req, res) => {
  try {
    const { week_start, message } = req.body;
    if (!week_start) return res.status(400).json({ error: 'week_start required' });

    const friday = new Date(new Date(week_start+'T12:00').getTime() + 4*86400000).toISOString().split('T')[0];

    // Get all educators with shifts this week
    const educators = D().prepare(`
      SELECT DISTINCT e.id, e.first_name, e.last_name, u.email
      FROM roster_entries re
      JOIN educators e ON e.id=re.educator_id
      LEFT JOIN users u ON u.id=e.user_id
      WHERE re.tenant_id=? AND re.shift_date BETWEEN ? AND ?
    `).all(req.tenantId, week_start, friday);

    let notified = 0;
    for (const edu of educators) {
      // Get their specific shifts
      const myShifts = D().prepare(`
        SELECT re.shift_date, re.start_time, re.end_time, r.name as room_name
        FROM roster_entries re
        LEFT JOIN rooms r ON r.id=re.room_id
        WHERE re.tenant_id=? AND re.educator_id=? AND re.shift_date BETWEEN ? AND ?
        ORDER BY re.shift_date, re.start_time
      `).all(req.tenantId, edu.id, week_start, friday);

      const shiftSummary = myShifts.map(s =>
        `${new Date(s.shift_date+'T12:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'short'})}: ` +
        `${s.start_time||'TBC'} – ${s.end_time||'TBC'}${s.room_name ? ` (${s.room_name})` : ''}`
      ).join('\n');

      const body = `${message || 'Your schedule for the week of ' + week_start + ' is now available.'}\n\nYour shifts:\n${shiftSummary}\n\nPlease contact us if you have any questions.`;

      // Create staff message
      try {
        D().prepare(`
          INSERT INTO staff_messages
            (id, tenant_id, from_user_id, to_user_id, subject, body, created_at)
          VALUES (?,?,?,?,?,?,datetime('now'))
        `).run(uuid(), req.tenantId, null, edu.id,
               `Your Schedule — Week of ${week_start}`, body);
        notified++;
      } catch(e) { /* staff_messages may not exist */ }

      // Also log to notification_log
      D().prepare(`
        INSERT INTO notification_log
          (id,tenant_id,channel,subject,body,entity_type,entity_id,status,recipient_user_id)
        VALUES (?,?,'in_app',?,?,?,?,'sent',?)
      `).run(uuid(), req.tenantId,
             `Schedule Published — Week of ${week_start}`, body,
             'schedule', week_start, edu.id||null);
    }

    // Record publish history
    try {
      D().prepare(`INSERT INTO schedule_publish_history (id,tenant_id,week_start,educator_count,message,published_by) VALUES (?,?,?,?,?,?)`)
        .run(uuid(), req.tenantId, week_start, notified, message||null, req.userId||null);
    } catch(e) {}
    res.json({ ok: true, notified, message: `Schedule published to ${notified} educator${notified!==1?'s':''}` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Educator's own schedule ───────────────────────────────────────────────────
r.get('/educator/:educatorId', (req, res) => {
  try {
    const from = new Date().toISOString().split('T')[0];
    const to   = new Date(Date.now() + 28*86400000).toISOString().split('T')[0];

    const shifts = D().prepare(`
      SELECT re.shift_date, re.start_time, re.end_time, re.status,
             r.name as room_name, r.age_group,
             re.notes
      FROM roster_entries re
      LEFT JOIN rooms r ON r.id=re.room_id
      WHERE re.tenant_id=? AND re.educator_id=? AND re.shift_date BETWEEN ? AND ?
      ORDER BY re.shift_date, re.start_time
    `).all(req.tenantId, req.params.educatorId, from, to);

    const totalHours = shifts.reduce((s, shift) => {
      if (!shift.start_time || !shift.end_time) return s;
      const [sh,sm] = shift.start_time.split(':').map(Number);
      const [eh,em] = shift.end_time.split(':').map(Number);
      return s + (eh*60+em - sh*60-sm) / 60;
    }, 0);

    res.json({ shifts, total_hours: Math.round(totalHours*10)/10, from, to });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Medical alerts for today ──────────────────────────────────────────────────
r.get('/medical-alerts', (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    // Children signed in today WITH medical conditions/allergies
    const alerts = D().prepare(`
      SELECT c.id, c.first_name, c.last_name, c.room_id, r.name as room_name,
             c.medical_conditions, c.allergies,
             c.emergency_contact_name, c.emergency_contact_phone,
             mp.plan_type, mp.condition_name, mp.severity, mp.symptoms,
             mp.action_plan
      FROM attendance_sessions a
      JOIN children c ON c.id=a.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      LEFT JOIN medical_plans mp ON mp.child_id=c.id AND mp.tenant_id=c.tenant_id
      WHERE a.tenant_id=? AND a.date=? AND a.absent=0 AND a.sign_in IS NOT NULL
        AND (c.medical_conditions IS NOT NULL AND c.medical_conditions != ''
             OR c.allergies IS NOT NULL AND c.allergies != ''
             OR mp.id IS NOT NULL)
      GROUP BY c.id
      ORDER BY mp.severity DESC, r.name, c.last_name
    `).all(req.tenantId, todayStr);

    // Medications due today
    const medsDue = D().prepare(`
      SELECT c.first_name, c.last_name, r.name as room_name,
             m.medication_name, m.dose, m.frequency, m.instructions
      FROM medications m
      JOIN children c ON c.id=m.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE m.tenant_id=? AND m.active=1
        AND c.id IN (
          SELECT child_id FROM attendance_sessions
          WHERE tenant_id=? AND date=? AND absent=0 AND sign_in IS NOT NULL
        )
      ORDER BY r.name, c.last_name
    `).all(req.tenantId, req.tenantId, todayStr);

    res.json({
      alerts: alerts.map(a => ({
        ...a,
        symptoms: JSON.parse(a.symptoms || '[]'),
      })),
      meds_due: medsDue,
      date: todayStr,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── Publish history ───────────────────────────────────────────────────────────
r.get('/history', (req, res) => {
  try {
    const history = D().prepare(`
      SELECT * FROM schedule_publish_history
      WHERE tenant_id=?
      ORDER BY published_at DESC LIMIT 20
    `).all(req.tenantId);
    res.json({ history });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
