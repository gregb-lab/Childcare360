// ─── Live Intelligent Run Sheet ────────────────────────────────────────────
//
// Real-time view of who is on duty, who is signed in, ratio status, and
// AI-style optimisation suggestions. Snapshots and accepted suggestions are
// persisted so the owner portal can report on cost savings.
//
// Mounted at /api/runsheet-live (separate from the legacy /api/runsheet
// classroom activity sheet — both serve different purposes).
//
// The hot path is calculateRunSheetState(tenantId, date). Everything else
// (suggestion accept/dismiss, cost-savings report) reads from tables that
// the calculator writes.

import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

// ── helpers ─────────────────────────────────────────────────────────────────
const localDate = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};
const weekStartOf = (dateStr) => {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const dow = d.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Map a child's age in months to the compliance_rules age_group string
function ageGroupFor(months) {
  if (months < 24) return '0-24';
  if (months < 36) return '24-36';
  if (months < 60) return '36-preschool';
  return 'over-preschool';
}

// ════════════════════════════════════════════════════════════════════════════
// CORE INTELLIGENCE
// ════════════════════════════════════════════════════════════════════════════

export function calculateRunSheetState(tenantId, date) {
  const db = D();

  // 1. Children currently signed in (sign_in set, sign_out null)
  const children = db.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.room_id, c.dob,
      CAST((julianday('now') - julianday(c.dob)) / 30.44 AS INTEGER) as age_months,
      a.sign_in
    FROM children c
    JOIN attendance_sessions a ON a.child_id = c.id
                                AND a.tenant_id = c.tenant_id
                                AND a.date = ?
    WHERE c.tenant_id = ?
      AND a.sign_in IS NOT NULL
      AND a.sign_out IS NULL
  `).all(date, tenantId);

  // 2. Educators currently clocked in. clock_records uses member_id (legacy)
  //    or educator_id (newer column) — coalesce both. Date column is `date`.
  const educators = db.prepare(`
    SELECT DISTINCT
      e.id, e.first_name, e.last_name, e.qualification, e.role_title,
      e.is_float, e.preferred_room_id,
      COALESCE(e.nc_hours_per_week, 2) as nc_hours_per_week,
      COALESCE(e.is_trainee, 0) as is_trainee,
      COALESCE(e.hourly_rate_cents, 3500) as hourly_rate_cents,
      cr.id as clock_record_id, cr.clock_in,
      (SELECT room_id FROM roster_entries
       WHERE educator_id = e.id AND date = ? AND tenant_id = ?
       ORDER BY start_time LIMIT 1) as roster_room_id
    FROM educators e
    JOIN clock_records cr
      ON COALESCE(cr.educator_id, cr.member_id) = e.id
     AND cr.tenant_id = e.tenant_id
     AND cr.date = ?
     AND cr.clock_out IS NULL
    WHERE e.tenant_id = ?
    ORDER BY cr.clock_in
  `).all(date, tenantId, date, tenantId);

  // Resolved current room: roster entry → preferred_room_id → null (float)
  educators.forEach(e => {
    e.current_room_id = e.roster_room_id || e.preferred_room_id || null;
  });

  // 3. NC schedule for the current week
  const ws = weekStartOf(date);
  const ncBlocks = db.prepare(`
    SELECT * FROM non_contact_schedule
    WHERE tenant_id = ? AND week_start = ?
    ORDER BY day_of_week, start_time
  `).all(tenantId, ws);

  // 4. Jurisdiction + compliance ratios
  const jurisdiction = db.prepare(
    'SELECT * FROM tenant_jurisdiction WHERE tenant_id = ?'
  ).get(tenantId);
  const country = jurisdiction?.country || 'AU';
  const state = jurisdiction?.state || null;

  // Prefer state-specific rule; fall back to national
  const ratioRules = db.prepare(`
    SELECT * FROM compliance_rules
    WHERE country = ? AND rule_type = 'ratio'
      AND (state = ? OR state IS NULL)
    ORDER BY (state IS NULL) ASC
  `).all(country, state);

  const requiredFor = (ageGroup, count) => {
    if (count === 0) return 0;
    const rule = ratioRules.find(r => r.age_group === ageGroup);
    const ratio = rule?.ratio_children || 11;
    return Math.ceil(count / ratio);
  };

  // 5. Group children by age band
  const byAge = {
    '0-24': children.filter(c => c.age_months < 24),
    '24-36': children.filter(c => c.age_months >= 24 && c.age_months < 36),
    '36-preschool': children.filter(c => c.age_months >= 36 && c.age_months < 60),
    'over-preschool': children.filter(c => c.age_months >= 60),
  };

  const required = {
    '0-24': requiredFor('0-24', byAge['0-24'].length),
    '24-36': requiredFor('24-36', byAge['24-36'].length),
    '36-preschool': requiredFor('36-preschool', byAge['36-preschool'].length),
    'over-preschool': requiredFor('over-preschool', byAge['over-preschool'].length),
  };

  const totalRequired = Object.values(required).reduce((a, b) => a + b, 0);
  const totalPresent = educators.length;
  const spareEducators = Math.max(0, totalPresent - totalRequired);

  // 6. ECT requirement (service-level, AU/NQF default thresholds)
  const preschoolAndUnder =
    byAge['0-24'].length + byAge['24-36'].length + byAge['36-preschool'].length;
  let ectRequired = 0;
  if (preschoolAndUnder >= 60) ectRequired = 2;
  else if (preschoolAndUnder >= 25) ectRequired = 1;

  const ectOnDuty = educators.filter(e =>
    e.qualification === 'ect' || (e.role_title || '').toLowerCase().includes('teacher')
  ).length;

  // 7. Educators owed NC time this week
  const todayDow = (() => {
    const d = new Date(date + 'T00:00:00');
    const js = d.getDay(); // 0=Sun..6=Sat
    return js === 0 ? 6 : js - 1; // → 0=Mon..6=Sun (matches non_contact_schedule.day_of_week)
  })();

  const ncByEducator = new Map();
  ncBlocks.forEach(b => {
    const cur = ncByEducator.get(b.educator_id) || 0;
    const sh = parseInt(b.start_time.slice(0, 2), 10) + parseInt(b.start_time.slice(3, 5), 10) / 60;
    const eh = parseInt(b.end_time.slice(0, 2), 10) + parseInt(b.end_time.slice(3, 5), 10) / 60;
    ncByEducator.set(b.educator_id, cur + Math.max(0, eh - sh));
  });

  const ncPending = educators.filter(e => {
    const entitled = e.nc_hours_per_week || 0;
    const scheduled = ncByEducator.get(e.id) || 0;
    return entitled > 0 && scheduled < entitled;
  });

  // 8. Per-room counts
  const rooms = db.prepare(`
    SELECT id, name, age_group, capacity FROM rooms
    WHERE tenant_id = ? ORDER BY name
  `).all(tenantId);

  const roomState = rooms.map(room => {
    const childrenInRoom = children.filter(c => c.room_id === room.id);
    const educatorsInRoom = educators.filter(e => e.current_room_id === room.id);
    // Use the dominant age group for ratio calc — fall back to 36-preschool
    let primaryAgeGroup = '36-preschool';
    if (childrenInRoom.length) {
      const ages = childrenInRoom.map(c => ageGroupFor(c.age_months));
      const counts = ages.reduce((acc, a) => ((acc[a] = (acc[a] || 0) + 1), acc), {});
      primaryAgeGroup = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    }
    const minRequired = requiredFor(primaryAgeGroup, childrenInRoom.length);
    return {
      id: room.id,
      name: room.name,
      capacity: room.capacity,
      children_present: childrenInRoom.length,
      educators_on_duty: educatorsInRoom.length,
      min_required: minRequired,
      compliant: educatorsInRoom.length >= minRequired,
      primary_age_group: primaryAgeGroup,
      educator_ids: educatorsInRoom.map(e => e.id),
    };
  });

  // 9. SUGGESTIONS ────────────────────────────────────────────────────────────
  const suggestions = [];
  const currentHour = new Date().getHours();

  // — A) Move spare educator to NC time
  if (spareEducators > 0 && ncPending.length > 0) {
    for (const educator of ncPending.slice(0, spareEducators)) {
      const hourlyDollars = (educator.hourly_rate_cents || 3500) / 100;
      const ncHoursNeeded = educator.nc_hours_per_week || 2;
      // "saving" here = the value of programming time being put to productive use
      // (i.e. the labour cost that's now turned into compliance work instead of idle floor cover)
      const savingCents = Math.round(ncHoursNeeded * hourlyDollars * 100);
      suggestions.push({
        id: uuid(),
        suggestion_type: 'move_to_nc',
        educator_id: educator.id,
        educator_name: `${educator.first_name} ${educator.last_name}`,
        from_room_id: educator.current_room_id,
        to_room_id: null,
        reason: `${educator.first_name} is owed ${ncHoursNeeded}hrs non-contact time this week. Attendance is low enough to release them now — ${totalPresent - 1} educators still maintains compliance.`,
        estimated_saving_cents: savingCents,
        action_label: 'Release for NC time',
      });
    }
  }

  // — B) Cross-room cover (donor → short room)
  const roomsWithSpares = roomState.filter(r => r.educators_on_duty > r.min_required && r.children_present > 0);
  const roomsShort = roomState.filter(r => r.educators_on_duty < r.min_required && r.children_present > 0);

  for (const shortRoom of roomsShort) {
    const donor = roomsWithSpares.find(d => d.educators_on_duty - d.min_required > 0);
    if (!donor) continue;
    const donorEducator = educators.find(e =>
      e.current_room_id === donor.id && (e.is_float || true) // float educators preferred but anyone works
    );
    if (!donorEducator) continue;
    suggestions.push({
      id: uuid(),
      suggestion_type: 'move_to_room',
      educator_id: donorEducator.id,
      educator_name: `${donorEducator.first_name} ${donorEducator.last_name}`,
      from_room_id: donor.id,
      to_room_id: shortRoom.id,
      reason: `${shortRoom.name} has a compliance shortfall (${shortRoom.educators_on_duty}/${shortRoom.min_required}). ${donor.name} has a spare educator. Moving ${donorEducator.first_name} maintains compliance across both rooms.`,
      estimated_saving_cents: 0,
      action_label: `Move to ${shortRoom.name}`,
    });
    // Mark donor used so we don't double-allocate them
    donor.educators_on_duty -= 1;
  }

  // — C) Lunch cover window
  if (spareEducators > 0 && currentHour >= 11 && currentHour <= 13) {
    const cover = educators.find(e => e.is_float) || educators[0];
    if (cover) {
      suggestions.push({
        id: uuid(),
        suggestion_type: 'lunch_cover',
        educator_id: cover.id,
        educator_name: `${cover.first_name} ${cover.last_name}`,
        from_room_id: cover.current_room_id,
        to_room_id: null,
        reason: `Lunch window — ${cover.first_name} can rotate lunch breaks across rooms, keeping ratios maintained.`,
        estimated_saving_cents: 0,
        action_label: 'Assign to lunch covers',
      });
    }
  }

  // — D) Ratio breach warning
  if (totalPresent < totalRequired) {
    suggestions.push({
      id: uuid(),
      suggestion_type: 'ratio_breach_warning',
      educator_id: null,
      from_room_id: null,
      to_room_id: null,
      reason: `⚠ RATIO BREACH: ${totalPresent} educators on duty but ${totalRequired} required for ${children.length} children present. Immediate action required.`,
      estimated_saving_cents: 0,
      action_label: 'View compliance details',
    });
  }

  // — E) ECT shortfall
  if (ectOnDuty < ectRequired) {
    suggestions.push({
      id: uuid(),
      suggestion_type: 'ratio_breach_warning',
      educator_id: null,
      from_room_id: null,
      to_room_id: null,
      reason: `⚠ ECT SHORTFALL: ${ectOnDuty} early childhood teacher(s) on duty, ${ectRequired} required (${preschoolAndUnder} children in scope).`,
      estimated_saving_cents: 0,
      action_label: 'View ECT compliance',
    });
  }

  // 10. Cost rate (current vs minimum staffing)
  const totalHourlyCents = educators.reduce((sum, e) => sum + (e.hourly_rate_cents || 3500), 0);
  const minimumRequiredCents = totalRequired * 3500; // assume award baseline
  const overstaffingCentsPerHour = Math.max(0, totalHourlyCents - minimumRequiredCents);

  // 11. Persist pending suggestions for today (replacing previous pending set)
  db.prepare(`DELETE FROM run_sheet_suggestions WHERE tenant_id=? AND date=? AND status='pending'`)
    .run(tenantId, date);

  const insertSugg = db.prepare(`
    INSERT OR IGNORE INTO run_sheet_suggestions
      (id, tenant_id, date, suggested_at, suggestion_type, educator_id,
       from_room_id, to_room_id, reason, estimated_saving_cents, status, expires_at)
    VALUES (?,?,?, datetime('now'), ?,?,?,?,?,?, 'pending', datetime('now','+2 hours'))
  `);
  for (const s of suggestions) {
    insertSugg.run(
      s.id, tenantId, date, s.suggestion_type, s.educator_id || null,
      s.from_room_id || null, s.to_room_id || null, s.reason,
      s.estimated_saving_cents || 0
    );
  }

  // 12. Snapshot (persist for owner-portal reporting)
  let complianceStatus;
  if (totalPresent < totalRequired || ectOnDuty < ectRequired) complianceStatus = 'breach';
  else if (spareEducators > 0) complianceStatus = 'overstaffed';
  else complianceStatus = 'optimal';

  const snapshotId = uuid();
  const snapshotData = {
    children_present: children.length,
    educators_on_duty: totalPresent,
    required_educators: totalRequired,
    spare_educators: spareEducators,
    by_age: Object.fromEntries(Object.entries(byAge).map(([k, v]) => [k, v.length])),
  };
  try {
    db.prepare(`
      INSERT INTO run_sheet_snapshots
        (id, tenant_id, date, snapshot_time, total_children_present,
         total_educators_on_duty, compliance_status, spare_educator_minutes,
         estimated_cost_per_hour, data_json)
      VALUES (?,?,?, datetime('now'), ?,?,?,?,?,?)
    `).run(snapshotId, tenantId, date, children.length, totalPresent,
           complianceStatus, spareEducators * 60,
           Math.round(totalHourlyCents / 100), JSON.stringify(snapshotData));
  } catch (e) { /* non-fatal — snapshot is best-effort */ }

  return {
    date,
    snapshot_time: new Date().toISOString(),
    children_present: children.length,
    educators_on_duty: totalPresent,
    required_educators: totalRequired,
    spare_educators: spareEducators,
    compliance_status: complianceStatus,
    ect_required: ectRequired,
    ect_on_duty: ectOnDuty,
    ect_compliant: ectOnDuty >= ectRequired,
    by_age: Object.fromEntries(Object.entries(byAge).map(([k, v]) => [k, v.length])),
    nc_pending_educators: ncPending.map(e => ({
      id: e.id,
      name: `${e.first_name} ${e.last_name}`,
      hours_owed: e.nc_hours_per_week,
    })),
    overstaffing_cost_per_hour_dollars: Math.round(overstaffingCentsPerHour / 100),
    suggestions: suggestions.map(s => ({ ...s, expires_in_minutes: 120 })),
    by_room: roomState,
    educators_detail: educators.map(e => ({
      id: e.id,
      name: `${e.first_name} ${e.last_name}`,
      room_id: e.current_room_id,
      qualification: e.qualification,
      is_float: !!e.is_float,
      is_trainee: !!e.is_trainee,
      nc_hours_owed: e.nc_hours_per_week,
      clocked_in_at: e.clock_in,
      hourly_rate_cents: e.hourly_rate_cents,
    })),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// REST ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════

// GET /api/runsheet-live/live — full live state
r.get('/live', (req, res) => {
  try {
    const date = req.query.date || localDate();
    const state = calculateRunSheetState(req.tenantId, date);
    res.json(state);
  } catch (e) {
    console.error('[runsheet-live]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/runsheet-live/suggestions/:id/accept
r.post('/suggestions/:id/accept', (req, res) => {
  try {
    const db = D();
    const suggestion = db.prepare(
      'SELECT * FROM run_sheet_suggestions WHERE id=? AND tenant_id=?'
    ).get(req.params.id, req.tenantId);
    if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' });

    db.prepare(`
      UPDATE run_sheet_suggestions
      SET status='accepted', accepted_by_user_id=?, accepted_at=datetime('now')
      WHERE id=?
    `).run(req.userId || null, req.params.id);

    const today = localDate();

    // Apply the suggestion
    if (suggestion.suggestion_type === 'move_to_room' && suggestion.to_room_id) {
      db.prepare(`
        UPDATE roster_entries SET room_id=?
        WHERE educator_id=? AND date=? AND tenant_id=?
      `).run(suggestion.to_room_id, suggestion.educator_id, today, req.tenantId);
    }

    if (suggestion.suggestion_type === 'move_to_nc') {
      const now = new Date();
      const startTime = `${String(now.getHours()).padStart(2, '0')}:00`;
      const endTime = `${String(Math.min(now.getHours() + 2, 23)).padStart(2, '0')}:00`;
      const ws = weekStartOf(today);
      const dow = (() => {
        const js = now.getDay();
        return js === 0 ? 6 : js - 1;
      })();
      db.prepare(`
        INSERT INTO non_contact_schedule
          (id, tenant_id, educator_id, week_start, day_of_week,
           start_time, end_time, nc_type, hours_allocated)
        VALUES (?,?,?,?,?,?,?,'programming',2)
      `).run(uuid(), req.tenantId, suggestion.educator_id, ws, dow, startTime, endTime);
    }

    // Cost-savings rollup
    db.prepare(`
      INSERT INTO daily_cost_savings (id, tenant_id, date, suggestions_accepted, savings_cents)
      VALUES (?,?,?, 1, ?)
      ON CONFLICT(tenant_id, date) DO UPDATE SET
        suggestions_accepted = suggestions_accepted + 1,
        savings_cents = savings_cents + excluded.savings_cents
    `).run(uuid(), req.tenantId, today, suggestion.estimated_saving_cents || 0);

    res.json({ ok: true, suggestion });
  } catch (e) {
    console.error('[suggestions/accept]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/runsheet-live/suggestions/:id/dismiss
r.post('/suggestions/:id/dismiss', (req, res) => {
  try {
    D().prepare(`
      UPDATE run_sheet_suggestions
      SET status='dismissed', dismissed_at=datetime('now')
      WHERE id=? AND tenant_id=?
    `).run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/runsheet-live/cost-savings?days=30
r.get('/cost-savings', (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const rows = D().prepare(`
      SELECT date, savings_cents, suggestions_accepted, suggestions_made,
             nc_hours_utilized, overstaffing_hours_acted_on
      FROM daily_cost_savings
      WHERE tenant_id=? AND date >= date('now', ?)
      ORDER BY date DESC
    `).all(req.tenantId, `-${days} days`);
    const totalSavingsCents = rows.reduce((s, r) => s + (r.savings_cents || 0), 0);
    const totalAccepted = rows.reduce((s, r) => s + (r.suggestions_accepted || 0), 0);
    res.json({
      days,
      total_savings_cents: totalSavingsCents,
      total_savings_dollars: Math.round(totalSavingsCents / 100),
      total_suggestions_accepted: totalAccepted,
      daily: rows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default r;
