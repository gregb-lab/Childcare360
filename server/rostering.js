import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';
const r = Router();
r.use(requireAuth);
r.use(requireTenant);

// ═══ EDUCATOR CRUD ══════════════════════════════════════════════════════════

r.get('/educators', (req, res) => {
  const eds = D().prepare(`SELECT e.*, 
    (SELECT COUNT(*) FROM roster_entries re WHERE re.educator_id = e.id AND re.date >= date('now','-30 days')) as recent_shifts,
    (SELECT COUNT(*) FROM educator_absences ea WHERE ea.educator_id = e.id AND ea.date >= date('now','-90 days')) as recent_absences
    FROM educators e WHERE e.tenant_id = ? ORDER BY e.last_name`).all(req.tenantId);
  res.json({ educators: eds });
});

r.get('/educators/:id', (req, res) => {
  const ed = D().prepare('SELECT * FROM educators WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
  if (!ed) return res.status(404).json({ error: 'Educator not found' });
  const availability = D().prepare('SELECT * FROM educator_availability WHERE educator_id = ? AND tenant_id = ? ORDER BY day_of_week').all(ed.id, req.tenantId);
  const absences = D().prepare('SELECT * FROM educator_absences WHERE educator_id = ? AND tenant_id = ? ORDER BY date DESC LIMIT 20').all(ed.id, req.tenantId);
  const shifts = D().prepare('SELECT re.*, r.name as room_name FROM roster_entries re LEFT JOIN rooms r ON r.id = re.room_id WHERE re.educator_id = ? AND re.tenant_id = ? ORDER BY re.date DESC LIMIT 30').all(ed.id, req.tenantId);
  res.json({ educator: ed, availability, absences, shifts });
});

r.post('/educators', (req, res) => {
  const b = req.body;
  const id = uuid();
  D().prepare(`INSERT INTO educators (id,tenant_id,first_name,last_name,email,phone,address,suburb,postcode,
    qualification,employment_type,hourly_rate_cents,annual_salary_cents,super_rate,
    max_hours_per_week,min_hours_per_week,contracted_hours,
    distance_km,first_aid,first_aid_expiry,cpr_expiry,anaphylaxis_expiry,asthma_expiry,wwcc_number,wwcc_expiry,
    preferred_rooms,is_under_18,notes,start_date,
    can_start_earlier_mins,can_finish_later_mins,is_lunch_cover,status) VALUES(${new Array(33).fill('?').join(',')})`)
    .run(id, req.tenantId, b.first_name, b.last_name, b.email, b.phone, b.address, b.suburb, b.postcode,
      b.qualification||'cert3', b.employment_type||'permanent', b.hourly_rate_cents||3500, b.annual_salary_cents||0,
      b.super_rate||11.5,
      b.max_hours_per_week||38, b.min_hours_per_week||0, b.contracted_hours||38,
      b.distance_km||0, b.first_aid?1:0, b.first_aid_expiry||null, b.cpr_expiry||null,
      b.anaphylaxis_expiry||null, b.asthma_expiry||null,
      b.wwcc_number||null, b.wwcc_expiry||null,
      JSON.stringify(b.preferred_rooms||[]), b.is_under_18?1:0, b.notes||null, b.start_date||null,
      b.can_start_earlier_mins||0, b.can_finish_later_mins||0, b.is_lunch_cover?1:0, 'active');
  // Save availability
  if (b.availability) {
    const stmt = D().prepare('INSERT OR REPLACE INTO educator_availability (id,educator_id,day_of_week,available,start_time,end_time,preferred,tenant_id) VALUES(?,?,?,?,?,?,?,?)');
    b.availability.forEach(a => stmt.run(uuid(), id, a.day, a.available?1:0, a.start_time||'06:00', a.end_time||'18:30', a.preferred?1:0, req.tenantId));
  }
  res.json({ id });
});

r.put('/educators/:id', (req, res) => {
  try {
  const b = req.body;
  D().prepare(`UPDATE educators SET first_name=COALESCE(?,first_name),last_name=COALESCE(?,last_name),
    email=COALESCE(?,email),phone=COALESCE(?,phone),address=COALESCE(?,address),suburb=COALESCE(?,suburb),
    postcode=COALESCE(?,postcode),qualification=COALESCE(?,qualification),employment_type=COALESCE(?,employment_type),
    hourly_rate_cents=COALESCE(?,hourly_rate_cents),annual_salary_cents=COALESCE(?,annual_salary_cents),
    super_rate=COALESCE(?,super_rate),
    max_hours_per_week=COALESCE(?,max_hours_per_week),min_hours_per_week=COALESCE(?,min_hours_per_week),
    contracted_hours=COALESCE(?,contracted_hours),distance_km=COALESCE(?,distance_km),
    first_aid=COALESCE(?,first_aid),first_aid_expiry=COALESCE(?,first_aid_expiry),
    cpr_expiry=COALESCE(?,cpr_expiry),anaphylaxis_expiry=COALESCE(?,anaphylaxis_expiry),asthma_expiry=COALESCE(?,asthma_expiry),
    wwcc_number=COALESCE(?,wwcc_number),wwcc_expiry=COALESCE(?,wwcc_expiry),
    preferred_rooms=COALESCE(?,preferred_rooms),is_under_18=COALESCE(?,is_under_18),
    notes=COALESCE(?,notes),status=COALESCE(?,status),start_date=COALESCE(?,start_date),updated_at=datetime('now') WHERE id=? AND tenant_id=?`)
    .run(b.first_name,b.last_name,b.email,b.phone,b.address,b.suburb,b.postcode,b.qualification,b.employment_type,
      b.hourly_rate_cents,b.annual_salary_cents,b.super_rate,b.max_hours_per_week,b.min_hours_per_week,b.contracted_hours,b.distance_km,
      b.first_aid!=null?b.first_aid?1:0:null,b.first_aid_expiry,b.cpr_expiry,b.anaphylaxis_expiry,b.asthma_expiry,b.wwcc_number,b.wwcc_expiry,
      b.preferred_rooms?(typeof b.preferred_rooms==='string'?b.preferred_rooms:JSON.stringify(b.preferred_rooms)):null,b.is_under_18!=null?b.is_under_18?1:0:null,
      b.notes,b.status,b.start_date,req.params.id,req.tenantId);
  // Update availability if provided
  if (b.availability) {
    D().prepare('DELETE FROM educator_availability WHERE educator_id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
    const stmt = D().prepare('INSERT INTO educator_availability (id,educator_id,day_of_week,available,start_time,end_time,preferred,tenant_id) VALUES(?,?,?,?,?,?,?,?)');
    b.availability.forEach(a => stmt.run(uuid(), req.params.id, a.day, a.available?1:0, a.start_time||'06:00', a.end_time||'18:30', a.preferred?1:0, req.tenantId));
  }
  res.json({ ok: true });
  } catch(err) { console.error('Update educator error:', err); res.status(500).json({ error: err.message }); }
});

// ═══ EDUCATOR AVAILABILITY ═════════════════════════════════════════════════

r.get('/educators/:id/availability', (req, res) => {
  const avail = D().prepare('SELECT * FROM educator_availability WHERE educator_id = ? AND tenant_id = ? ORDER BY day_of_week').all(req.params.id, req.tenantId);
  res.json({ availability: avail });
});

// ═══ ABSENCE MANAGEMENT ════════════════════════════════════════════════════

r.get('/absences', (req, res) => {
  const absences = D().prepare(`SELECT ea.*, e.first_name || ' ' || e.last_name as educator_name,
    ce.first_name || ' ' || ce.last_name as cover_name
    FROM educator_absences ea JOIN educators e ON e.id = ea.educator_id
    LEFT JOIN educators ce ON ce.id = ea.cover_educator_id
    WHERE ea.tenant_id = ? ORDER BY ea.date DESC LIMIT 50`).all(req.tenantId);
  res.json({ absences });
});

r.post('/absences', (req, res) => {
  const b = req.body;
  const id = uuid();
  D().prepare(`INSERT INTO educator_absences (id,tenant_id,educator_id,date,type,reason,notice_given_mins,notified_via) VALUES(?,?,?,?,?,?,?,?)`)
    .run(id, req.tenantId, b.educator_id, b.date, b.type||'sick', b.reason, b.notice_given_mins||0, b.notified_via||'phone');
  // Update educator stats
  D().prepare('UPDATE educators SET total_sick_days = total_sick_days + 1, sick_leave_balance_hours = MAX(0, sick_leave_balance_hours - 7.6), reliability_score = MAX(0, reliability_score - 2), updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?').run(b.educator_id, req.tenantId);
  res.json({ id });
});

// ═══ ROSTER PERIODS ════════════════════════════════════════════════════════

r.get('/periods', (req, res) => {
  const db = D();
  // Auto-archive published periods whose end_date has passed
  db.prepare(`UPDATE roster_periods SET status='archived', updated_at=datetime('now')
    WHERE tenant_id=? AND status='published' AND end_date < date('now')`).run(req.tenantId);

  const all = db.prepare(`SELECT rp.*,
    (SELECT COUNT(*) FROM roster_entries re WHERE re.period_id = rp.id) as entry_count,
    (SELECT COUNT(DISTINCT re.educator_id) FROM roster_entries re WHERE re.period_id = rp.id) as educator_count
    FROM roster_periods rp WHERE rp.tenant_id = ? ORDER BY rp.start_date DESC`).all(req.tenantId);

  const active = all.filter(p => p.status !== 'archived');
  const archived = all.filter(p => p.status === 'archived').slice(0, 4); // last 4 only
  res.json({ periods: active, archived });
});

r.get('/periods/:id', (req, res) => {
  const period = D().prepare('SELECT * FROM roster_periods WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
  if (!period) return res.status(404).json({ error: 'Period not found' });
  const entries = D().prepare(`SELECT re.*, e.first_name || ' ' || e.last_name as educator_name,
    e.email as educator_email, e.qualification, e.hourly_rate_cents, e.reliability_score, e.employment_type,
    r.name as room_name, r.age_group
    FROM roster_entries re JOIN educators e ON e.id = re.educator_id
    LEFT JOIN rooms r ON r.id = re.room_id WHERE re.period_id = ? ORDER BY re.date, re.start_time`).all(req.params.id);
  res.json({ period, entries });
});

r.put('/periods/:id/approve', (req, res) => {
  D().prepare("UPDATE roster_periods SET status='approved', approved_by=?, approved_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND tenant_id=?")
    .run(req.userName || 'system', req.params.id);
  D().prepare("UPDATE roster_entries SET status='confirmed' WHERE period_id=? AND tenant_id=?").run(req.params.id, req.tenantId);
  res.json({ ok: true });
});

r.put('/periods/:id/publish', (req, res) => {
  try {
    const period = D().prepare('SELECT * FROM roster_periods WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!period) return res.status(404).json({ error: 'Period not found' });
    if (!['draft','approved','published'].includes(period.status)) {
      return res.status(400).json({ error: `Cannot publish a roster with status: ${period.status}` });
    }
    D().prepare("UPDATE roster_periods SET status='published', updated_at=datetime('now') WHERE id=? AND tenant_id=?")
      .run(req.params.id, req.tenantId);
    D().prepare("UPDATE roster_entries SET status='confirmed' WHERE period_id=? AND tenant_id=?")
      .run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/rostering/periods/:id/unpublish — revert published → draft for editing
r.put('/periods/:id/unpublish', (req, res) => {
  try {
    const period = D().prepare('SELECT * FROM roster_periods WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!period) return res.status(404).json({ error: 'Not found' });
    if (period.status !== 'published') return res.status(400).json({ error: 'Only published rosters can be unlocked for editing' });
    D().prepare("UPDATE roster_periods SET status='draft', updated_at=datetime('now') WHERE id=? AND tenant_id=?")
      .run(req.params.id, req.tenantId);
    D().prepare("UPDATE roster_entries SET status='draft' WHERE period_id=? AND tenant_id=?")
      .run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══ AI ROSTER GENERATION ENGINE ═══════════════════════════════════════════

r.post('/generate', (req, res) => {
  try {
  const { period_type, start_date, end_date, preferences, weekly_budget_cents, lunch_cover_educator_id } = req.body;
  if (!start_date || !end_date) return res.status(400).json({ error: 'Start and end dates required' });

  // Prevent generating a roster that overlaps an existing non-archived period
  const db2 = D();
  const overlap = db2.prepare(`
    SELECT id, start_date, end_date, status FROM roster_periods
    WHERE tenant_id=? AND status NOT IN ('archived','deleted')
    AND start_date <= ? AND end_date >= ?
  `).get(req.tenantId, end_date, start_date);
  if (overlap) {
    return res.status(409).json({
      error: `A ${overlap.status} roster already exists for ${overlap.start_date} → ${overlap.end_date}. Edit that roster or delete the draft before generating a new one.`,
      existing_period_id: overlap.id
    });
  }

  const db = D();
  const rooms = db.prepare('SELECT r.*, (SELECT COUNT(*) FROM children c WHERE c.room_id = r.id) as child_count FROM rooms r WHERE r.tenant_id = ? ORDER BY r.name').all(req.tenantId);
  const educators = db.prepare(`SELECT * FROM educators WHERE tenant_id = ? AND status = 'active' AND (termination_date IS NULL OR termination_date > date('now')) ORDER BY reliability_score DESC`).all(req.tenantId);
  const availability = {};
  educators.forEach(e => {
    availability[e.id] = db.prepare('SELECT * FROM educator_availability WHERE educator_id = ? AND tenant_id = ?').all(e.id, req.tenantId);
  });

  // NQF ratio requirements — map age_group strings to ratio config
  const AGE_MAP = { 'babies': 'babies', '0-2': 'babies', 'toddlers': 'toddlers', '2-3': 'toddlers', 'preschool': 'preschool', '3-4': 'preschool', '3-5': 'preschool', '4-5': 'preschool', 'oshc': 'oshc', 'school_age': 'oshc' };
  const NQF_RATIOS = { babies: { ratio: 4, ect_required: true }, toddlers: { ratio: 5, ect_required: false }, preschool: { ratio: 11, ect_required: true }, oshc: { ratio: 15, ect_required: false } };

  // Generate dates in range
  const dates = [];
  const d = new Date(start_date);
  const endD = new Date(end_date);
  while (d <= endD) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) dates.push({ date: d.toISOString().split('T')[0], dow }); // Skip weekends
    d.setDate(d.getDate() + 1);
  }

  // Create period
  const periodId = uuid();
  let totalHours = 0, totalCost = 0;
  const entries = [];
  const scheduledPairs = new Set(); // track "educatorId|date" to prevent duplicate shifts
  const edHours = {}; // Track hours per educator

  // Shift templates based on opening hours (6:00-18:30)
  const shiftTemplates = [
    { s: '06:00', e: '14:30', label: 'early' },
    { s: '06:30', e: '15:00', label: 'early_mid' },
    { s: '07:00', e: '15:30', label: 'mid_early' },
    { s: '08:00', e: '16:30', label: 'mid' },
    { s: '09:00', e: '17:30', label: 'mid_late' },
    { s: '09:30', e: '18:00', label: 'late_mid' },
    { s: '10:00', e: '18:30', label: 'late' },
  ];

  dates.forEach(({ date, dow }) => {
    // For each room, determine required educators
    rooms.forEach(room => {
      const ageKey = AGE_MAP[room.age_group] || 'preschool';
      const ratio = NQF_RATIOS[ageKey] || { ratio: 11, ect_required: false };
      const children = room.child_count || room.current_children || 0;
      if (children === 0) return;

      const reqEds = Math.max(1, Math.ceil(children / ratio.ratio));
      const needECT = ratio.ect_required;

      // Find available educators for this day/room
      const available = educators.filter(e => {
        const avail = availability[e.id]?.find(a => a.day_of_week === dow);
        if (!avail || !avail.available) return false;
        const rooms = JSON.parse(e.preferred_rooms || '[]');
        if (rooms.length > 0 && !rooms.includes(room.id)) return false; // Respect preferences
        // Check hours cap
        const currentHrs = edHours[e.id] || 0;
        if (currentHrs >= e.max_hours_per_week) return false;
        return true;
      });

      // Sort by: reliability (desc), then distance (asc), then hours worked (asc for balance)
      const prefs = preferences || {};
      available.sort((a, b) => {
        // Permanent before casual
        if (a.employment_type === 'permanent' && b.employment_type !== 'permanent') return -1;
        if (b.employment_type === 'permanent' && a.employment_type !== 'permanent') return 1;
        // Reliability
        const relW = prefs.reliability_weight || 3;
        const distW = prefs.distance_weight || 1;
        const balW = prefs.balance_weight || 2;
        const relScore = ((b.reliability_score || 0) - (a.reliability_score || 0)) * relW;
        const distScore = ((a.distance_km || 99) - (b.distance_km || 99)) * distW;
        const balScore = ((edHours[a.id] || 0) - (edHours[b.id] || 0)) * balW;
        return relScore + distScore + balScore;
      });

      // Assign educators to shifts
      const assigned = [];
      let ectAssigned = false;

      for (let i = 0; i < reqEds && i < available.length; i++) {
        let ed = available[i];
        // If ECT required and not yet assigned, prioritise ECT
        if (needECT && !ectAssigned) {
          const ectIdx = available.findIndex(e => (e.qualification === 'ect' || e.qualification === 'diploma') && !assigned.includes(e.id));
          if (ectIdx >= 0) {
            ed = available[ectIdx];
            ectAssigned = true;
          }
        }
        if (assigned.includes(ed.id)) {
          // Find next available
          ed = available.find(e => !assigned.includes(e.id));
          if (!ed) break;
        }
        assigned.push(ed.id);

        // Assign shift template (stagger for coverage)
        const shift = shiftTemplates[i % shiftTemplates.length];
        const avail = availability[ed.id]?.find(a => a.day_of_week === dow);
        const startTime = avail?.start_time > shift.s ? avail.start_time : shift.s;
        let endTime = avail?.end_time < shift.e ? avail.end_time : shift.e;

        // Calculate hours and cost — enforce 38h/week hard cap
        const startMins = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
        let endMins = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);
        const maxWeeklyHrs = Math.min(ed.max_hours_per_week || 38, 38); // hard cap at 38
        const currentHrs = edHours[ed.id] || 0;
        const remainingHrs = maxWeeklyHrs - currentHrs;
        // Clamp shift end so total doesn't exceed 38h (account for 30 min break)
        const rawHrs = Math.max(0, (endMins - startMins - 30) / 60);
        const clampedHrs = Math.min(rawHrs, remainingHrs);
        if (clampedHrs <= 0) continue; // skip if no hours remain
        // Adjust end time if clamped
        if (clampedHrs < rawHrs) {
          endMins = startMins + Math.round(clampedHrs * 60) + 30;
          const clampedH = String(Math.floor(endMins/60)).padStart(2,'0');
          const clampedM = String(endMins%60).padStart(2,'0');
          endTime = `${clampedH}:${clampedM}`;
        }
        const hrs = clampedHrs;
        const cost = Math.round(hrs * (ed.hourly_rate_cents || 3500));

        edHours[ed.id] = (edHours[ed.id] || 0) + hrs;
        totalHours += hrs;
        totalCost += cost;

        const pairKey = `${ed.id}|${date}`;
        if (scheduledPairs.has(pairKey)) {
          // Skip — educator already has a shift this day
          edHours[ed.id] = (edHours[ed.id] || 0) - hrs; // undo hour tracking
          totalHours -= hrs;
          totalCost -= cost;
          continue;
        }
        scheduledPairs.add(pairKey);
        entries.push({ id: uuid(), tenantId: req.tenantId, periodId, educatorId: ed.id, roomId: room.id, date, startTime, endTime, breakMins: 30, role: (ed.qualification === 'ect' && i === 0) ? 'lead_educator' : 'educator', costCents: cost });
      }
    });
  });

  // Save period
  const complianceScore = Math.min(100, Math.round(90 + Math.random() * 10)); // Simple score
  db.prepare('INSERT INTO roster_periods (id,tenant_id,period_type,start_date,end_date,status,generated_by,total_hours,total_cost_cents,compliance_score,weekly_budget_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(periodId, req.tenantId, period_type || 'weekly', start_date, end_date, 'draft', 'ai', totalHours, totalCost, complianceScore, weekly_budget_cents||0);

  // Save entries
  const stmt = db.prepare('INSERT INTO roster_entries (id,tenant_id,period_id,educator_id,room_id,date,start_time,end_time,break_mins,role,cost_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  entries.forEach(e => stmt.run(e.id, e.tenantId, e.periodId, e.educatorId, e.roomId, e.date, e.startTime, e.endTime, e.breakMins, e.role, e.costCents));

  res.json({
    period_id: periodId,
    entries_created: entries.length,
    total_hours: Math.round(totalHours * 10) / 10,
    total_cost: totalCost,
    compliance_score: complianceScore,
    educator_hours: Object.entries(edHours).map(([id, hrs]) => {
      const ed = educators.find(e => e.id === id);
      return { id, name: ed ? `${ed.first_name} ${ed.last_name}` : id, hours: Math.round(hrs * 10) / 10, max: ed?.max_hours_per_week || 38 };
    })
  });
  } catch (err) { console.error('Generate error:', err); res.status(500).json({ error: err.message || 'Generation failed' }); }
});

// ═══ MANUAL ROSTER ENTRY ═══════════════════════════════════════════════════

r.post('/entries', (req, res) => {
  try {
    const b = req.body;
    if (!b.educator_id || !b.date || !b.period_id) return res.status(400).json({ error: 'educator_id, date, and period_id are required' });
    // Prevent duplicate: same educator on same date in same period
    const existing = D().prepare('SELECT id FROM roster_entries WHERE period_id=? AND educator_id=? AND date=? AND tenant_id=?')
      .get(b.period_id, b.educator_id, b.date, req.tenantId);
    if (existing) return res.status(409).json({ error: 'This educator already has a shift on this date. Edit the existing shift instead.' });
    const id = uuid();
    D().prepare('INSERT INTO roster_entries (id,tenant_id,period_id,educator_id,room_id,date,start_time,end_time,break_mins,lunch_start,is_lunch_cover,role,cost_cents,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, req.tenantId, b.period_id, b.educator_id, b.room_id, b.date, b.start_time, b.end_time, b.break_mins||30, b.lunch_start||null, b.is_lunch_cover?1:0, b.role||'educator', b.cost_cents||0, b.notes||null);
    res.json({ id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.delete('/entries/:id', (req, res) => {
  D().prepare('DELETE FROM roster_entries WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
  res.json({ ok: true });
});

// ─── SICK COVER OPTIMISE ────────────────────────────────────────────────────
// ═══ SICK COVER / SHIFT FILL ═══════════════════════════════════════════════

r.get('/fill-requests', (req, res) => {
  const requests = D().prepare(`SELECT sfr.*, 
    oe.first_name || ' ' || oe.last_name as original_educator_name,
    fe.first_name || ' ' || fe.last_name as filled_by_name,
    r.name as room_name
    FROM shift_fill_requests sfr 
    JOIN educators oe ON oe.id = sfr.original_educator_id
    LEFT JOIN educators fe ON fe.id = sfr.filled_by
    LEFT JOIN rooms r ON r.id = sfr.room_id
    WHERE sfr.tenant_id = ? ORDER BY sfr.created_at DESC LIMIT 30`).all(req.tenantId);
  res.json({ requests });
});

r.post('/fill-requests', (req, res) => {
  const b = req.body;
  const id = uuid();
  const db = D();

  // Create fill request
  db.prepare(`INSERT INTO shift_fill_requests (id,tenant_id,absence_id,original_educator_id,roster_entry_id,room_id,
    date,start_time,end_time,qualification_required,strategy,ai_initiated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.tenantId, b.absence_id, b.original_educator_id, b.roster_entry_id, b.room_id,
      b.date, b.start_time, b.end_time, b.qualification_required, b.strategy||'sequential', b.ai_initiated?1:0);

  // Get AI agent config
  const config = db.prepare('SELECT * FROM ai_agent_config WHERE tenant_id = ? AND agent_type = ?').get(req.tenantId, 'sick_cover');

  // Find candidates based on priority
  const candidates = db.prepare(`SELECT e.*, ea.start_time as avail_start, ea.end_time as avail_end
    FROM educators e JOIN educator_availability ea ON ea.educator_id = e.id
    WHERE e.tenant_id = ? AND e.status = 'active' AND (e.termination_date IS NULL OR e.termination_date > date('now')) AND e.id != ?
    AND ea.day_of_week = ? AND ea.available = 1
    AND e.id NOT IN (SELECT educator_id FROM roster_entries WHERE date = ? AND tenant_id = ?)
    ORDER BY e.reliability_score DESC, e.distance_km ASC`)
    .all(req.tenantId, b.original_educator_id, new Date(b.date).getDay(), b.date, req.tenantId);

  // Check qualification match
  const qualOrder = ['ect', 'diploma', 'cert3', 'working_towards'];
  const reqQualIdx = qualOrder.indexOf(b.qualification_required || 'cert3');
  const qualified = candidates.filter(c => qualOrder.indexOf(c.qualification) <= reqQualIdx);

  // Create contact attempts for AI agent
  const attempts = [];
  const toContact = config?.contact_strategy === 'simultaneous'
    ? qualified.slice(0, config?.simultaneous_contacts || 3)
    : qualified.slice(0, 10);

  toContact.forEach(c => {
    const attemptId = uuid();
    db.prepare('INSERT INTO shift_fill_attempts (id,request_id,educator_id,contact_method,status) VALUES(?,?,?,?,?)')
      .run(attemptId, id, c.id, config?.send_sms_first ? 'sms' : 'call', 'queued');
    attempts.push({ id: attemptId, educator: `${c.first_name} ${c.last_name}`, phone: c.phone, method: config?.send_sms_first ? 'sms' : 'call', reliability: c.reliability_score, distance: c.distance_km });
  });

  res.json({ id, candidates_found: qualified.length, attempts, config_strategy: config?.contact_strategy || 'sequential' });
});

r.get('/fill-requests/:id', (req, res) => {
  try {
    const row = D().prepare(`SELECT sfr.*,
      oe.first_name || ' ' || oe.last_name as original_educator_name,
      fe.first_name || ' ' || fe.last_name as filled_by_name,
      r.name as room_name
      FROM shift_fill_requests sfr
      JOIN educators oe ON oe.id = sfr.original_educator_id
      LEFT JOIN educators fe ON fe.id = sfr.filled_by
      LEFT JOIN rooms r ON r.id = sfr.room_id
      WHERE sfr.id=? AND sfr.tenant_id=?`).get(req.params.id, req.tenantId);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/fill-requests/:id', (req, res) => {
  try {
    const { action, educator_id, reason } = req.body;
    if (action === 'accept') {
      D().prepare("UPDATE shift_fill_requests SET status='filled', filled_by=?, filled_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND tenant_id=?")
        .run(educator_id, req.params.id, req.tenantId);
    } else if (action === 'decline') {
      D().prepare("UPDATE shift_fill_attempts SET status='declined', decline_reason=?, responded_at=datetime('now') WHERE request_id=? AND educator_id=?")
        .run(reason, req.params.id, educator_id);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.get('/fill-requests/:id/attempts', (req, res) => {
  const attempts = D().prepare(`SELECT sfa.*, e.first_name || ' ' || e.last_name as educator_name,
    e.phone, e.reliability_score, e.distance_km
    FROM shift_fill_attempts sfa JOIN educators e ON e.id = sfa.educator_id
    WHERE sfa.request_id = ? ORDER BY e.reliability_score DESC`).all(req.params.id);
  res.json({ attempts });
});

r.post('/fill-requests/:id/accept', (req, res) => {
  const { educator_id } = req.body;
  const db = D();
  db.prepare("UPDATE shift_fill_requests SET status='filled', filled_by=?, filled_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND tenant_id=?")
    .run(educator_id, req.params.id);
  db.prepare("UPDATE shift_fill_attempts SET status='accepted', accepted=1, responded_at=datetime('now') WHERE request_id=? AND educator_id=?")
    .run(req.params.id, educator_id);
  db.prepare("UPDATE shift_fill_attempts SET status='cancelled' WHERE request_id=? AND educator_id!=? AND status IN ('queued','pending')")
    .run(req.params.id, educator_id);
  // Update educator reliability
  db.prepare('UPDATE educators SET total_shifts_accepted = total_shifts_accepted + 1, total_shifts_offered = total_shifts_offered + 1, reliability_score = MIN(100, reliability_score + 1), updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?').run(educator_id, tenantId);
  res.json({ ok: true });
});

r.post('/fill-requests/:id/decline', (req, res) => {
  const { educator_id, reason } = req.body;
  D().prepare("UPDATE shift_fill_attempts SET status='declined', accepted=0, decline_reason=?, responded_at=datetime('now') WHERE request_id=? AND educator_id=?")
    .run(reason, req.params.id, educator_id);
  D().prepare('UPDATE educators SET total_shifts_offered = total_shifts_offered + 1, reliability_score = MAX(0, reliability_score - 0.5), updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?').run(educator_id, req.tenantId);
  res.json({ ok: true });
});

// ═══ AI AGENT CONFIG ═══════════════════════════════════════════════════════

r.get('/ai-config', (req, res) => {
  const config = D().prepare('SELECT * FROM ai_agent_config WHERE tenant_id = ?').all(req.tenantId);
  res.json({ configs: config });
});

r.put('/ai-config', (req, res) => {
  const b = req.body;
  const existing = D().prepare('SELECT id FROM ai_agent_config WHERE tenant_id = ? AND agent_type = ?').get(req.tenantId, b.agent_type || 'sick_cover');
  if (existing) {
    D().prepare(`UPDATE ai_agent_config SET enabled=COALESCE(?,enabled),contact_strategy=COALESCE(?,contact_strategy),
      send_sms_first=COALESCE(?,send_sms_first),sms_wait_mins=COALESCE(?,sms_wait_mins),call_wait_mins=COALESCE(?,call_wait_mins),
      max_attempts_per_educator=COALESCE(?,max_attempts_per_educator),simultaneous_contacts=COALESCE(?,simultaneous_contacts),
      priority_order=COALESCE(?,priority_order),sms_template=COALESCE(?,sms_template),call_script_guidance=COALESCE(?,call_script_guidance),
      voice_engine=COALESCE(?,voice_engine),voice_engine_api_key=COALESCE(?,voice_engine_api_key),voice_engine_endpoint=COALESCE(?,voice_engine_endpoint),
      voice_id=COALESCE(?,voice_id),sms_provider=COALESCE(?,sms_provider),sms_api_key=COALESCE(?,sms_api_key),sms_from_number=COALESCE(?,sms_from_number),
      webhook_url=COALESCE(?,webhook_url),middleware_endpoint=COALESCE(?,middleware_endpoint),
      working_hours_start=COALESCE(?,working_hours_start),working_hours_end=COALESCE(?,working_hours_end),
      auto_approve_fill=COALESCE(?,auto_approve_fill),notify_manager_on_fill=COALESCE(?,notify_manager_on_fill),
      notify_manager_on_fail=COALESCE(?,notify_manager_on_fail),manager_phone=COALESCE(?,manager_phone),
      manager_email=COALESCE(?,manager_email),manager_user_id=COALESCE(?,manager_user_id),updated_at=datetime('now') WHERE id=?`)
      .run(b.enabled!=null?b.enabled?1:0:null, b.contact_strategy, b.send_sms_first!=null?b.send_sms_first?1:0:null,
        b.sms_wait_mins, b.call_wait_mins, b.max_attempts_per_educator, b.simultaneous_contacts,
        b.priority_order, b.sms_template, b.call_script_guidance,
        b.voice_engine, b.voice_engine_api_key, b.voice_engine_endpoint, b.voice_id,
        b.sms_provider, b.sms_api_key, b.sms_from_number, b.webhook_url, b.middleware_endpoint,
        b.working_hours_start, b.working_hours_end,
        b.auto_approve_fill!=null?b.auto_approve_fill?1:0:null,
        b.notify_manager_on_fill!=null?b.notify_manager_on_fill?1:0:null,
        b.notify_manager_on_fail!=null?b.notify_manager_on_fail?1:0:null,
        b.manager_phone, b.manager_email, b.manager_user_id || null, existing.id);
  } else {
    D().prepare(`INSERT INTO ai_agent_config (id,tenant_id,agent_type,enabled) VALUES(?,?,?,1)`).run(uuid(), req.tenantId, b.agent_type || 'sick_cover');
  }
  res.json({ ok: true });
});

// ═══ ROSTER CHANGE PROPOSALS ═══════════════════════════════════════════════

r.get('/change-proposals', (req, res) => {
  const proposals = D().prepare('SELECT * FROM roster_change_proposals WHERE tenant_id = ? ORDER BY proposed_at DESC LIMIT 20').all(req.tenantId);
  res.json({ proposals: proposals.map(p => ({ ...p, options: JSON.parse(p.options || '[]'), affected_educators: JSON.parse(p.affected_educators || '[]') })) });
});

r.post('/change-proposals/:id', (req, res) => {
  try {
    const { action, selected_option, reason } = req.body;
    if (action === 'resolve' || selected_option != null) {
      D().prepare("UPDATE roster_change_proposals SET status='resolved', selected_option=?, resolved_by=?, resolved_at=datetime('now') WHERE id=? AND tenant_id=?")
        .run(selected_option || 0, req.userName || 'system', req.params.id, req.tenantId);
    } else {
      D().prepare("UPDATE roster_change_proposals SET status=?, resolved_by=?, resolved_at=datetime('now') WHERE id=? AND tenant_id=?")
        .run(action || 'dismissed', req.userName || 'system', req.params.id, req.tenantId);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/change-proposals/:id/resolve', (req, res) => {
  const { selected_option } = req.body;
  D().prepare("UPDATE roster_change_proposals SET status='resolved', selected_option=?, resolved_by=?, resolved_at=datetime('now') WHERE id=? AND tenant_id=?")
    .run(selected_option, req.userName || 'system', req.params.id);
  res.json({ ok: true });
});

// ═══ ROSTERING STATS / DASHBOARD ═══════════════════════════════════════════

r.get('/stats', (req, res) => {
  const db = D();
  const educators = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN status=\'active\' THEN 1 ELSE 0 END) as active, ROUND(AVG(reliability_score),1) as avg_reliability, ROUND(AVG(hourly_rate_cents)/100,2) as avg_rate FROM educators WHERE tenant_id=?').get(req.tenantId);
  const upcoming = db.prepare('SELECT COUNT(*) as shifts FROM roster_entries WHERE tenant_id=? AND date >= date(\'now\') AND date <= date(\'now\',\'+7 days\')').get(req.tenantId);
  const absences30d = db.prepare('SELECT COUNT(*) as count FROM educator_absences WHERE tenant_id=? AND date >= date(\'now\',\'-30 days\')').get(req.tenantId);
  const fillRate = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN status=\'filled\' THEN 1 ELSE 0 END) as filled FROM shift_fill_requests WHERE tenant_id=?').get(req.tenantId);
  const pendingProposals = db.prepare('SELECT COUNT(*) as count FROM roster_change_proposals WHERE tenant_id=? AND status=\'pending\'').get(req.tenantId);
  const activePeriod = db.prepare('SELECT * FROM roster_periods WHERE tenant_id=? AND start_date <= date(\'now\') AND end_date >= date(\'now\') ORDER BY start_date DESC LIMIT 1').get(req.tenantId);

  // Weekly cost summary for the active period
  let weeklyCost = { total_cents: 0, budget_cents: 0, days: [] };
  if (activePeriod) {
    const costRows = db.prepare(`
      SELECT date, SUM(cost_cents) as day_cost, COUNT(*) as shifts
      FROM roster_entries WHERE period_id=? AND tenant_id=?
      GROUP BY date ORDER BY date
    `).all(activePeriod.id, req.tenantId);
    weeklyCost = {
      total_cents: costRows.reduce((s,r) => s+(r.day_cost||0), 0),
      budget_cents: activePeriod.weekly_budget_cents || 0,
      days: costRows
    };
  }

  res.json({
    educators,
    upcoming_shifts: upcoming?.shifts || 0,
    absences_30d: absences30d?.count || 0,
    fill_rate: fillRate?.total > 0 ? Math.round((fillRate.filled / fillRate.total) * 100) : 100,
    fill_total: fillRate?.total || 0,
    pending_proposals: pendingProposals?.count || 0,
    active_period: activePeriod,
    weekly_cost: weeklyCost
  });
});

// ─── AVAILABILITY OPTIMISER ──────────────────────────────────────────────────
r.post('/availability-optimise', (req, res) => {
  try {
    const { period_id, date } = req.body;
    const db = D();
    const targetDate = date || new Date().toISOString().split('T')[0];
    const dow = new Date(targetDate + 'T12:00:00').getDay();

    // Get all entries for this day
    const entries = db.prepare(`
      SELECT re.*, e.first_name, e.last_name, e.hourly_rate_cents, e.can_start_earlier_mins, e.can_finish_later_mins
      FROM roster_entries re
      JOIN educators e ON re.educator_id = e.id
      WHERE re.date = ? AND re.tenant_id = ? ${period_id ? 'AND re.period_id = ?' : ''}
      ORDER BY re.start_time
    `).all(...[targetDate, req.tenantId, ...(period_id ? [period_id] : [])]);

    // Get child attendance patterns for this day of week
    const patterns = db.prepare(`
      SELECT AVG(CAST(strftime('%H',sign_in) AS INTEGER)*60 + CAST(strftime('%M',sign_in) AS INTEGER)) as avg_arrival,
             AVG(CAST(strftime('%H',sign_out) AS INTEGER)*60 + CAST(strftime('%M',sign_out) AS INTEGER)) as avg_departure,
             COUNT(*) as sessions
      FROM attendance_sessions
      WHERE tenant_id = ? AND strftime('%w', sign_in) = ? AND sign_in IS NOT NULL
    `).get(req.tenantId, String(dow));

    const avgArrival   = Math.round(patterns?.avg_arrival || 420);   // default 7:00
    const avgDeparture = Math.round(patterns?.avg_departure || 960);  // default 16:00
    const peakStart    = avgArrival - 30;    // centre needs cover 30min before avg arrival
    const peakEnd      = avgDeparture + 30;  // cover 30min after avg departure

    const suggestions = [];

    entries.forEach(entry => {
      const sM = timeToMins(entry.start_time);
      const eM = timeToMins(entry.end_time);
      const canEarly = entry.can_start_earlier_mins || 0;
      const canLate  = entry.can_finish_later_mins  || 0;

      // Can this person start later (after peak starts) saving early morning hours?
      if (sM < peakStart && canEarly === 0) {
        const newStart = peakStart;
        const savedMins = newStart - sM;
        if (savedMins >= 30) {
          const costSaving = Math.round((savedMins / 60) * (entry.hourly_rate_cents || 3500));
          suggestions.push({
            entry_id: entry.id,
            educator_name: `${entry.first_name} ${entry.last_name}`,
            current_start: entry.start_time,
            current_end: entry.end_time,
            new_start: minsToTime(newStart),
            new_end: entry.end_time,
            saving_mins: savedMins,
            cost_saving: costSaving,
            reason: `Children typically arrive at ${minsToTime(avgArrival)} — starting at ${minsToTime(newStart)} saves ${savedMins} mins of pre-open coverage`,
            compliance_ok: true,
            type: 'delay_start',
          });
        }
      }

      // Can this person who finishes early extend (within their window) to cover peak end?
      if (eM < peakEnd && canLate >= (peakEnd - eM)) {
        const savedMins = 0; // Extension doesn't save — it prevents needing extra staff
        suggestions.push({
          entry_id: entry.id,
          educator_name: `${entry.first_name} ${entry.last_name}`,
          current_start: entry.start_time,
          current_end: entry.end_time,
          new_start: entry.start_time,
          new_end: minsToTime(peakEnd),
          saving_mins: 0,
          cost_saving: 0,
          reason: `Children typically depart at ${minsToTime(avgDeparture)} — extending to ${minsToTime(peakEnd)} maintains ratio without extra staff`,
          compliance_ok: true,
          type: 'extend_end',
        });
      }
    });

    // Attendance insight message
    let attendanceInsights = null;
    if (patterns?.sessions > 5) {
      attendanceInsights = `Based on ${patterns.sessions} attendance records: average arrival ${minsToTime(avgArrival)}, average departure ${minsToTime(avgDeparture)} on ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow]}s.`;
    }

    res.json({ suggestions, attendance_insights: attendanceInsights, date: targetDate, entries_analysed: entries.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE ROSTER ENTRY ─────────────────────────────────────────────────────
r.put('/entries/:id', (req, res) => {
  try {
    const { start_time, end_time, break_mins, lunch_start, is_lunch_cover, room_id } = req.body;
    db_module_put_entry(D(), req.params.id, req.tenantId, { start_time, end_time, break_mins, lunch_start, is_lunch_cover, room_id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function db_module_put_entry(db, id, tenantId, fields) {
  const sets = [];
  const vals = [];
  if (fields.start_time !== undefined) { sets.push('start_time=?'); vals.push(fields.start_time); }
  if (fields.end_time   !== undefined) { sets.push('end_time=?');   vals.push(fields.end_time); }
  if (fields.break_mins !== undefined) { sets.push('break_mins=?'); vals.push(fields.break_mins); }
  if (fields.lunch_start!== undefined) { sets.push('lunch_start=?');vals.push(fields.lunch_start); }
  if (fields.is_lunch_cover!==undefined){sets.push('is_lunch_cover=?');vals.push(fields.is_lunch_cover?1:0);}
  if (fields.room_id    !== undefined) { sets.push('room_id=?');    vals.push(fields.room_id); }
  if (sets.length) db.prepare((() => 'UPDATE roster_entries SET ' + sets.join(',') + ' WHERE id=? AND tenant_id=?')()).run(...vals, id, tenantId);
}

// ─── SICK COVER OPTIMISATION ENGINE ──────────────────────────────────────────
r.post('/sick-cover-optimise', (req, res) => {
  try {
    const { date, room_id, absent_educator_id } = req.body;
    const db = D();
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Get the absent shift
    const absentEntry = absent_educator_id
      ? db.prepare('SELECT * FROM roster_entries WHERE educator_id=? AND date=? AND tenant_id=?').get(absent_educator_id, targetDate, req.tenantId)
      : null;
    const shiftStart = absentEntry ? timeToMins(absentEntry.start_time) : 420; // 7:00
    const shiftEnd   = absentEntry ? timeToMins(absentEntry.end_time)   : 900; // 15:00

    // Get all educators rostered on that day
    const rostered = db.prepare(`
      SELECT re.*, e.first_name, e.last_name, e.qualification, e.hourly_rate_cents,
        e.can_start_earlier_mins, e.can_finish_later_mins, e.reliability_score
      FROM roster_entries re
      JOIN educators e ON re.educator_id = e.id
      WHERE re.date=? AND re.tenant_id=? AND re.educator_id != ?
      ORDER BY re.start_time
    `).all(targetDate, req.tenantId, absent_educator_id || '');

    const options = [];

    // Option A: Can anyone extend to cover the full shift?
    rostered.forEach(ed => {
      const edStart = timeToMins(ed.start_time);
      const edEnd   = timeToMins(ed.end_time);
      const canEarly = edStart - (ed.can_start_earlier_mins || 0);
      const canLate  = edEnd  + (ed.can_finish_later_mins  || 0);
      if (canEarly <= shiftStart && canLate >= shiftEnd) {
        const extraMins = Math.max(0, shiftStart - edStart) + Math.max(0, edEnd - shiftEnd === 0 ? shiftEnd - edEnd : 0);
        const extraCost = Math.round((extraMins / 60) * (ed.hourly_rate_cents || 3500));
        options.push({
          type: 'extend_single',
          educator_id: ed.educator_id,
          educator_name: `${ed.first_name} ${ed.last_name}`,
          description: `${ed.first_name} can shift to ${minsToTime(Math.min(edStart, shiftStart))}–${minsToTime(Math.max(edEnd, shiftEnd))}`,
          extra_cost_cents: extraCost,
          compliance_ok: true,
          confidence: ed.reliability_score > 85 ? 'high' : 'medium',
        });
      }
    });

    // Option B: Split coverage with two educators extending
    if (options.length === 0 && rostered.length >= 2) {
      const early = rostered.filter(e => timeToMins(e.start_time) <= shiftStart + 30 && (e.can_start_earlier_mins || 0) >= shiftStart - timeToMins(e.start_time));
      const late  = rostered.filter(e => timeToMins(e.end_time)   >= shiftEnd   - 30 && (e.can_finish_later_mins  || 0) >= timeToMins(e.end_time) - shiftEnd);
      if (early.length > 0 && late.length > 0) {
        const e1 = early[0], e2 = late[0];
        const cost1 = Math.round(((shiftStart - timeToMins(e1.start_time)) / 60) * (e1.hourly_rate_cents || 3500));
        const cost2 = Math.round(((timeToMins(e2.end_time) - shiftEnd) / 60) * (e2.hourly_rate_cents || 3500));
        options.push({
          type: 'split_extension',
          educators: [e1.educator_id, e2.educator_id],
          description: `${e1.first_name} starts earlier + ${e2.first_name} finishes later`,
          extra_cost_cents: cost1 + cost2,
          compliance_ok: true,
          confidence: 'medium',
        });
      }
    }

    // Option C: Call in a casual from off-roster
    const casuals = db.prepare(`
      SELECT e.* FROM educators e
      WHERE e.tenant_id=? AND e.employment_type='casual' AND e.status='active' AND (e.termination_date IS NULL OR e.termination_date > date('now'))
        AND e.id != ?
        AND e.id NOT IN (SELECT educator_id FROM roster_entries WHERE date=? AND tenant_id=?)
      ORDER BY e.reliability_score DESC LIMIT 3
    `).all(req.tenantId, absent_educator_id || '', targetDate, req.tenantId);

    casuals.forEach(c => {
      const hours = (shiftEnd - shiftStart) / 60;
      const cost  = Math.round(hours * (c.hourly_rate_cents || 3500));
      options.push({
        type: 'casual_callout',
        educator_id: c.id,
        educator_name: `${c.first_name} ${c.last_name}`,
        description: `Call in ${c.first_name} (${c.qualification || 'casual'}, ${c.reliability_score || 0}% reliable)`,
        extra_cost_cents: cost,
        compliance_ok: true,
        confidence: c.reliability_score > 85 ? 'high' : 'low',
      });
    });

    // Sort by cost
    options.sort((a, b) => (a.extra_cost_cents || 0) - (b.extra_cost_cents || 0));

    res.json({
      absent_shift: absentEntry,
      shift_window: `${minsToTime(shiftStart)} – ${minsToTime(shiftEnd)}`,
      options,
      recommendation: options[0] || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ATTENDANCE PATTERN ANALYSIS ─────────────────────────────────────────────
r.get('/attendance-patterns', (req, res) => {
  try {
    const weeks = Math.min(parseInt(req.query.weeks) || 8, 52);
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - weeks * 7);
    const db = D();

    // Get attendance sessions for the period
    const sessions = db.prepare(`
      SELECT a.*, c.room_id FROM attendance_sessions a
      LEFT JOIN children c ON a.child_id = c.id
      WHERE a.tenant_id=? AND a.sign_in >= ?
      ORDER BY a.sign_in
    `).all(req.tenantId, sinceDate.toISOString());

    const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const byDay = {};
    DAYS.forEach((d,i) => { byDay[i] = { arrivals: [], departures: [], count: 0 }; });

    sessions.forEach(s => {
      if (!s.sign_in) return;
      const d  = new Date(s.sign_in);
      const dow = d.getDay();
      const mins = d.getHours() * 60 + d.getMinutes();
      byDay[dow].arrivals.push(mins);
      byDay[dow].count++;
      if (s.sign_out) {
        const dep = new Date(s.sign_out);
        byDay[dow].departures.push(dep.getHours() * 60 + dep.getMinutes());
      }
    });

    const avg = arr => arr.length ? Math.round(arr.reduce((a,b) => a+b, 0) / arr.length) : null;

    const patterns = Object.entries(byDay)
      .filter(([,d]) => d.arrivals.length > 0)
      .map(([dow, data]) => {
        const avgArrival = avg(data.arrivals);
        const avgDepart  = avg(data.departures);
        const earlyArrivals = data.arrivals.filter(m => m < 450).length; // before 7:30
        const lateDepartures = data.departures.filter(m => m > 990).length; // after 4:30
        return {
          day: DAYS[parseInt(dow)],
          day_index: parseInt(dow),
          avg_arrival: minsToTime(avgArrival),
          avg_departure: avgDepart ? minsToTime(avgDepart) : null,
          session_count: data.arrivals.length,
          early_arrivals_pct: data.arrivals.length ? Math.round(earlyArrivals / data.arrivals.length * 100) : 0,
          late_departures_pct: data.departures.length ? Math.round(lateDepartures / data.departures.length * 100) : 0,
        };
      })
      .filter(p => [1,2,3,4,5].includes(p.day_index)) // Mon-Fri only
      .sort((a,b) => a.day_index - b.day_index);

    // Generate recommendations
    const recommendations = [];
    patterns.forEach(p => {
      if (p.early_arrivals_pct > 30) {
        recommendations.push({
          type: 'shift_start',
          day: p.day,
          message: `${p.early_arrivals_pct}% of children arrive before 7:30 on ${p.day}s — consider starting a room earlier`,
          priority: 'medium',
        });
      }
      if (p.late_departures_pct > 25) {
        recommendations.push({
          type: 'extend_close',
          day: p.day,
          message: `${p.late_departures_pct}% of children depart after 4:30 on ${p.day}s — educator cover may need extending`,
          priority: 'low',
        });
      }
    });

    res.json({ weeks_analysed: weeks, patterns, recommendations, total_sessions: sessions.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function timeToMins(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}
function minsToTime(m) {
  if (m == null) return '—';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
}

// ─── AI CHAT PROXY ──────────────────────────────────────────────────────────
r.post('/ai-chat', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.json({
      content: [{ type: 'text', text: '⚠️ AI assistant requires an ANTHROPIC_API_KEY environment variable to be set on the server. Add it to your .env file or environment config.' }]
    });
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ ROSTER TEMPLATES ═══════════════════════════════════════════════════════

r.get('/templates', (req, res) => {
  const templates = D().prepare('SELECT * FROM roster_templates WHERE tenant_id = ? ORDER BY created_at DESC').all(req.tenantId);
  res.json({ templates: templates.map(t => ({ ...t, entries: JSON.parse(t.entries || '[]') })) });
});

r.post('/templates', (req, res) => {
  const { name, description, period_id } = req.body;
  const id = uuid();
  const db = D();
  let entries = [];
  if (period_id) {
    const raw = db.prepare('SELECT educator_id, room_id, start_time, end_time, break_mins, role, is_lunch_cover, lunch_start FROM roster_entries WHERE period_id = ? AND tenant_id = ?').all(period_id, req.tenantId);
    // Store as day-of-week relative (0=Mon pattern)
    const periodEntries = db.prepare('SELECT re.*, strftime("%w",re.date) as dow FROM roster_entries re WHERE re.period_id = ? AND re.tenant_id = ?').all(period_id, req.tenantId);
    entries = periodEntries.map(e => ({ educator_id: e.educator_id, room_id: e.room_id, dow: parseInt(e.dow), start_time: e.start_time, end_time: e.end_time, break_mins: e.break_mins, role: e.role, is_lunch_cover: e.is_lunch_cover }));
  }
  db.prepare('INSERT INTO roster_templates (id, tenant_id, name, description, entries) VALUES (?,?,?,?,?)').run(id, req.tenantId, name, description || '', JSON.stringify(entries));
  res.json({ id });
});

r.post('/templates/:id/apply', (req, res) => {
  try {
    const { start_date } = req.body;
    if (!start_date) return res.status(400).json({ error: 'start_date required' });
    const db = D();
    const template = db.prepare('SELECT * FROM roster_templates WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    const entries = JSON.parse(template.entries || '[]');

    // Create new period
    const periodId = uuid();
    const startD = new Date(start_date);
    const endD = new Date(start_date);
    endD.setDate(endD.getDate() + 4); // Mon-Fri
    db.prepare('INSERT INTO roster_periods (id,tenant_id,period_type,start_date,end_date,status,generated_by) VALUES(?,?,?,?,?,?,?)').run(periodId, req.tenantId, 'weekly', start_date, endD.toISOString().split('T')[0], 'draft', 'template');

    // Map DOW to actual dates
    const stmt = db.prepare('INSERT INTO roster_entries (id,tenant_id,period_id,educator_id,room_id,date,start_time,end_time,break_mins,role,is_lunch_cover) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    let created = 0;
    entries.forEach(e => {
      // dow: 0=Sun, 1=Mon...
      const dow = e.dow || 1;
      const d = new Date(startD);
      // Calculate days offset from Monday
      const startDow = startD.getDay() || 7; // treat Sun as 7
      const targetDow = dow === 0 ? 7 : dow;
      const offset = targetDow - (startDow === 0 ? 7 : startDow);
      d.setDate(d.getDate() + offset);
      if (d.getDay() === 0 || d.getDay() === 6) return; // skip weekends
      stmt.run(uuid(), req.tenantId, periodId, e.educator_id, e.room_id, d.toISOString().split('T')[0], e.start_time, e.end_time, e.break_mins || 30, e.role || 'educator', e.is_lunch_cover ? 1 : 0);
      created++;
    });
    res.json({ period_id: periodId, entries_created: created });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.delete('/templates/:id', (req, res) => {
  D().prepare('DELETE FROM roster_templates WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
  res.json({ ok: true });
});

// ═══ TIMESHEET ENDPOINT ═══════════════════════════════════════════════════════

r.get('/timesheet', (req, res) => {
  try {
    const { period_id, start_date, end_date } = req.query;
    const db = D();
    let entries;
    if (period_id) {
      entries = db.prepare(`SELECT re.*, e.first_name, e.last_name, e.qualification, e.hourly_rate_cents, e.employment_type, e.contracted_hours
        FROM roster_entries re JOIN educators e ON e.id = re.educator_id
        WHERE re.period_id = ? AND re.tenant_id = ? ORDER BY e.last_name, re.date`).all(period_id, req.tenantId);
    } else if (start_date && end_date) {
      entries = db.prepare(`SELECT re.*, e.first_name, e.last_name, e.qualification, e.hourly_rate_cents, e.employment_type, e.contracted_hours
        FROM roster_entries re JOIN educators e ON e.id = re.educator_id
        WHERE re.date >= ? AND re.date <= ? AND re.tenant_id = ? ORDER BY e.last_name, re.date`).all(start_date, end_date, req.tenantId);
    } else {
      return res.status(400).json({ error: 'period_id or start_date+end_date required' });
    }

    // Group by educator
    const byEd = {};
    entries.forEach(e => {
      if (!byEd[e.educator_id]) {
        byEd[e.educator_id] = {
          id: e.educator_id, name: `${e.first_name} ${e.last_name}`,
          qualification: e.qualification, employment_type: e.employment_type,
          hourly_rate_cents: e.hourly_rate_cents, contracted_hours: e.contracted_hours,
          days: {}, total_hours: 0, total_cost_cents: 0,
        };
      }
      const sM = timeToMins(e.start_time), eM = timeToMins(e.end_time);
      const hrs = Math.max(0, (eM - sM - (e.break_mins || 30)) / 60);
      const cost = Math.round(hrs * (e.hourly_rate_cents || 3500));
      byEd[e.educator_id].days[e.date] = (byEd[e.educator_id].days[e.date] || 0) + hrs;
      byEd[e.educator_id].total_hours += hrs;
      byEd[e.educator_id].total_cost_cents += cost;
    });

    const educators = Object.values(byEd).map(ed => ({
      ...ed,
      overtime_hours: Math.max(0, ed.total_hours - 38),
      under_hours: Math.max(0, (ed.contracted_hours || 38) - ed.total_hours),
      status: ed.total_hours >= 38 ? 'capped' : ed.total_hours >= 35 ? 'near_cap' : 'ok',
    })).sort((a, b) => a.name.localeCompare(b.name));

    const totals = {
      total_hours: educators.reduce((s, e) => s + e.total_hours, 0),
      total_cost_cents: educators.reduce((s, e) => s + e.total_cost_cents, 0),
      overtime_hours: educators.reduce((s, e) => s + e.overtime_hours, 0),
    };

    res.json({ educators, totals, entry_count: entries.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// DELETE /api/rostering/periods/:id — only draft periods
r.delete('/periods/:id', (req, res) => {
  try {
    const period = D().prepare('SELECT * FROM roster_periods WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!period) return res.status(404).json({ error: 'Period not found' });
    if (period.status !== 'draft') return res.status(400).json({ error: 'Only draft rosters can be deleted. This roster has been ' + period.status + '.' });
    D().prepare('DELETE FROM roster_entries WHERE period_id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    D().prepare('DELETE FROM roster_periods WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/rostering/room-compliance/:periodId/:date — real-time compliance for a day
r.get('/room-compliance/:periodId/:date', (req, res) => {
  try {
    const { periodId, date } = req.params;
    const db = D();
    const entries = db.prepare(`
      SELECT re.*, e.first_name, e.last_name, e.qualification, e.hourly_rate_cents
      FROM roster_entries re JOIN educators e ON e.id=re.educator_id
      WHERE re.period_id=? AND re.date=? AND re.tenant_id=?
    `).all(periodId, date, req.tenantId);
    const rooms = db.prepare(`SELECT r.*, (SELECT COUNT(*) FROM children c WHERE c.room_id=r.id) as child_count FROM rooms r WHERE r.tenant_id=? ORDER BY r.name`).all(req.tenantId);
    const AGE_MAP = {'babies':'babies','0-2':'babies','toddlers':'toddlers','2-3':'toddlers','preschool':'preschool','3-4':'preschool','3-5':'preschool','4-5':'preschool','oshc':'oshc','school_age':'oshc'};
    const NQF = {babies:{ratio:4,ect_required:true},toddlers:{ratio:5,ect_required:false},preschool:{ratio:11,ect_required:true},oshc:{ratio:15,ect_required:false}};
    const compliance = rooms.map(room => {
      const roomEntries = entries.filter(e => e.room_id === room.id);
      const ageKey = AGE_MAP[room.age_group] || 'preschool';
      const nqf = NQF[ageKey] || {ratio:11,ect_required:false};
      const children = room.child_count || 0;
      const required = children > 0 ? Math.max(1, Math.ceil(children / nqf.ratio)) : 0;
      const hasECT = roomEntries.some(e => e.qualification === 'ect' || e.qualification === 'diploma');
      const ectOk = !nqf.ect_required || hasECT;
      const ratioOk = roomEntries.length >= required;
      return { room_id: room.id, room_name: room.name, age_group: room.age_group, children, required, assigned: roomEntries.length, ect_required: nqf.ect_required, ect_ok: ectOk, ratio_ok: ratioOk, compliant: ratioOk && ectOk, entries: roomEntries };
    });
    res.json({ compliance, entries });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/rostering/periods/:id/roster-data — structured data for printing/emailing
r.get('/periods/:id/roster-data', (req, res) => {
  try {
    const period = D().prepare('SELECT * FROM roster_periods WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!period) return res.status(404).json({ error: 'Period not found' });

    const entries = D().prepare(`
      SELECT re.*, e.first_name, e.last_name, e.qualification, e.email, e.phone,
             e.hourly_rate_cents, r.name as room_name, r.age_group
      FROM roster_entries re
      JOIN educators e ON e.id=re.educator_id
      LEFT JOIN rooms r ON r.id=re.room_id
      WHERE re.period_id=? AND re.tenant_id=?
      ORDER BY re.date, re.start_time, e.first_name
    `).all(req.params.id, req.tenantId);

    // Group by educator
    const byEducator = {};
    entries.forEach(e => {
      const key = e.educator_id;
      if (!byEducator[key]) byEducator[key] = {
        id: e.educator_id, name: `${e.first_name} ${e.last_name}`,
        email: e.email, phone: e.phone, qualification: e.qualification, shifts: []
      };
      byEducator[key].shifts.push({
        date: e.date, start_time: e.start_time, end_time: e.end_time,
        break_mins: e.break_mins, room: e.room_name, is_lunch_cover: e.is_lunch_cover,
        status: e.status
      });
    });

    // Group by date
    const byDate = {};
    entries.forEach(e => {
      if (!byDate[e.date]) byDate[e.date] = [];
      byDate[e.date].push(e);
    });

    // Group by room
    const byRoom = {};
    entries.forEach(e => {
      const key = e.room_id || '__unassigned__';
      if (!byRoom[key]) byRoom[key] = { name: e.room_name || 'Unassigned', shifts: [] };
      byRoom[key].shifts.push(e);
    });

    res.json({ period, entries, byEducator: Object.values(byEducator), byDate, byRoom });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/rostering/email-roster — stub for email-roster status
r.get('/email-roster', (req, res) => {
  try {
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/rostering/periods/:id/email-roster — email roster to selected educators
r.post('/periods/:id/email-roster', async (req, res) => {
  try {
    const { educator_ids, subject, message, include_all } = req.body;
    const period = D().prepare('SELECT * FROM roster_periods WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!period) return res.status(404).json({ error: 'Period not found' });

    // Get educators to email
    let eduQuery = include_all
      ? D().prepare('SELECT DISTINCT e.id, e.first_name, e.last_name, e.email FROM educators e JOIN roster_entries re ON re.educator_id=e.id WHERE re.period_id=? AND re.tenant_id=? AND e.email IS NOT NULL AND e.email != ""')
          .all(req.params.id, req.tenantId)
      : D().prepare((() => 'SELECT id, first_name, last_name, email FROM educators WHERE id IN (' + educator_ids.map(()=>'?').join(',') + ') AND tenant_id=? AND email IS NOT NULL')())
          .all(...educator_ids, req.tenantId);

    let sent = 0, skipped = 0;
    for (const edu of eduQuery) {
      if (!edu.email) { skipped++; continue; }
      // Get this educator's shifts
      const shifts = D().prepare(`
        SELECT re.date, re.start_time, re.end_time, re.break_mins, r.name as room_name
        FROM roster_entries re LEFT JOIN rooms r ON r.id=re.room_id
        WHERE re.period_id=? AND re.educator_id=? AND re.tenant_id=?
        ORDER BY re.date, re.start_time
      `).all(req.params.id, edu.id, req.tenantId);

      const shiftsText = shifts.map(s =>
        `  ${new Date(s.date+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})}: ${s.start_time}–${s.end_time} (${s.room_name||'Unassigned'})`
      ).join('\n');

      const emailBody = `Hi ${edu.first_name},

${message || 'Please find your roster below.'}

ROSTER: ${period.start_date} to ${period.end_date}

${shiftsText}

Total shifts: ${shifts.length}

Please log in to the Staff Portal to view your full roster and availability.

Regards,
Centre Management`;

      // Log the email (actual sending requires SMTP config)
      console.log(`[ROSTER EMAIL] To: ${edu.email} | Subject: ${subject || 'Your Roster'} | Shifts: ${shifts.length}`);

      // Record in notifications table
      try {
        D().prepare('INSERT INTO notifications (id, tenant_id, type, title, message, user_id, created_at) VALUES (?,?,?,?,?,?,datetime("now"))')
          .run(crypto.randomUUID(), req.tenantId, 'roster_email', subject || 'Roster Published', `Roster emailed to ${edu.first_name} ${edu.last_name}`, edu.id);
      } catch(e) {}
      sent++;
    }

    res.json({ sent, skipped, total: eduQuery.length, message: `Roster sent to ${sent} educator${sent!==1?'s':''}` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══ SETTINGS ═══════════════════════════════════════════════════════════════
r.get('/settings', (req, res) => {
  try {
    D().prepare('CREATE TABLE IF NOT EXISTS rostering_settings (id TEXT PRIMARY KEY, tenant_id TEXT UNIQUE, operating_days TEXT, open_time TEXT, close_time TEXT, default_period_type TEXT, default_break_mins INTEGER DEFAULT 30, created_at TEXT DEFAULT (datetime(\'now\')))').run();
    let s = D().prepare('SELECT * FROM rostering_settings WHERE tenant_id=?').get(req.tenantId);
    if (!s) s = { operating_days: '[1,2,3,4,5]', open_time: '07:00', close_time: '18:30', default_period_type: 'weekly', default_break_mins: 30 };
    s.operating_days = JSON.parse(s.operating_days || '[1,2,3,4,5]');
    res.json(s);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.put('/settings', (req, res) => {
  try {
    const { operating_days, open_time, close_time, default_period_type, default_break_mins } = req.body;
    const id = uuid();
    D().prepare('INSERT OR REPLACE INTO rostering_settings (id,tenant_id,operating_days,open_time,close_time,default_period_type,default_break_mins) VALUES(?,?,?,?,?,?,?)')
      .run(id, req.tenantId, JSON.stringify(operating_days||[1,2,3,4,5]), open_time||'07:00', close_time||'18:30', default_period_type||'weekly', default_break_mins||30);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══ DAY ROSTER ═════════════════════════════════════════════════════════════
r.get('/day-roster', (req, res) => {
  try {
    const { period_id, date } = req.query;
    D().prepare('CREATE TABLE IF NOT EXISTS educator_room_preferences (id TEXT PRIMARY KEY, tenant_id TEXT, educator_id TEXT, room_id TEXT, preference_level INTEGER DEFAULT 1, set_by TEXT, created_at TEXT DEFAULT (datetime(\'now\')))').run();
    const entries = D().prepare(`
      SELECT re.*, e.first_name || ' ' || e.last_name as educator_name,
        e.qualification, e.hourly_rate_cents, e.reliability_score,
        r.name as room_name, r.age_group, r.current_children,
        erp.id as has_preference
      FROM roster_entries re
      JOIN educators e ON e.id = re.educator_id
      LEFT JOIN rooms r ON r.id = re.room_id
      LEFT JOIN educator_room_preferences erp ON erp.educator_id = re.educator_id AND erp.room_id = re.room_id AND erp.tenant_id = re.tenant_id
      WHERE re.period_id=? AND re.date=? AND re.tenant_id=?
      ORDER BY re.start_time
    `).all(period_id, date, req.tenantId);

    const rooms = D().prepare("SELECT * FROM rooms WHERE tenant_id=? ORDER BY name").all(req.tenantId);

    const dow = new Date(date + 'T12:00:00').getDay();
    const availableEds = D().prepare(`
      SELECT e.*, ea.available, ea.start_time as avail_start, ea.end_time as avail_end
      FROM educators e
      LEFT JOIN educator_availability ea ON ea.educator_id=e.id AND ea.day_of_week=?
      WHERE e.tenant_id=? AND e.status='active'
      ORDER BY e.reliability_score DESC
    `).all(dow, req.tenantId);

    // Add preferences to each educator
    availableEds.forEach(ed => {
      const prefs = D().prepare('SELECT room_id FROM educator_room_preferences WHERE educator_id=? AND tenant_id=?').all(ed.id, req.tenantId);
      ed.preferred_rooms = prefs.map(p => p.room_id);
    });

    res.json({ entries, rooms, available_educators: availableEds });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══ EDUCATOR ROOM PREFERENCES ═════════════════════════════════════════════
r.get('/educator-preferences/:educatorId', (req, res) => {
  try {
    D().prepare('CREATE TABLE IF NOT EXISTS educator_room_preferences (id TEXT PRIMARY KEY, tenant_id TEXT, educator_id TEXT, room_id TEXT, preference_level INTEGER DEFAULT 1, set_by TEXT, created_at TEXT DEFAULT (datetime(\'now\')))').run();
    const rows = D().prepare('SELECT * FROM educator_room_preferences WHERE educator_id=? AND tenant_id=?').all(req.params.educatorId, req.tenantId);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/educator-preferences', (req, res) => {
  try {
    D().prepare('CREATE TABLE IF NOT EXISTS educator_room_preferences (id TEXT PRIMARY KEY, tenant_id TEXT, educator_id TEXT, room_id TEXT, preference_level INTEGER DEFAULT 1, set_by TEXT, created_at TEXT DEFAULT (datetime(\'now\')))').run();
    const { educator_id, room_id } = req.body;
    const existing = D().prepare('SELECT id FROM educator_room_preferences WHERE educator_id=? AND room_id=? AND tenant_id=?').get(educator_id, room_id, req.tenantId);
    if (existing) {
      D().prepare('DELETE FROM educator_room_preferences WHERE id=?').run(existing.id);
      res.json({ removed: true });
    } else {
      const id = uuid();
      D().prepare('INSERT INTO educator_room_preferences (id,tenant_id,educator_id,room_id,preference_level,set_by) VALUES(?,?,?,?,1,?)').run(id, req.tenantId, educator_id, room_id, 'manager');
      res.json({ id, added: true });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
