// ═══════════════════════════════════════════════════════════════════════════
//  Childcare360 — Rostering Enhancement Schema Migration (v2.3.0)
//  15 new tables + ALTER TABLEs + comprehensive seed data
// ═══════════════════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';
const uuid = () => randomUUID();

// ── Schema creation (call from initDatabase) ─────────────────────────────

export function applyRosterEnhancements(db) {
  console.log('[v2.3.0] Applying rostering enhancement schema...');

  // #1 Responsible Person coverage
  db.exec(`
    CREATE TABLE IF NOT EXISTS rp_coverage (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      educator_id TEXT NOT NULL REFERENCES educators(id) ON DELETE CASCADE,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      role TEXT DEFAULT 'responsible_person',
      is_backup INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, date, educator_id, start_time)
    );
    CREATE INDEX IF NOT EXISTS idx_rp_coverage_date ON rp_coverage(tenant_id, date);
  `);

  // #2 Multi-day absences
  [
    "ALTER TABLE educator_absences ADD COLUMN start_date TEXT",
    "ALTER TABLE educator_absences ADD COLUMN end_date TEXT",
    "ALTER TABLE educator_absences ADD COLUMN expected_return_date TEXT",
    "ALTER TABLE educator_absences ADD COLUMN medical_cert_required INTEGER DEFAULT 0",
    "ALTER TABLE educator_absences ADD COLUMN medical_cert_provided INTEGER DEFAULT 0",
  ].forEach(sql => { try { db.exec(sql); } catch(e) {} });
  try { db.exec("UPDATE educator_absences SET start_date=date, end_date=date WHERE start_date IS NULL"); } catch(e) {}

  // #3 Child attendance forecasting
  db.exec(`
    CREATE TABLE IF NOT EXISTS child_booked_days (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL,
      session_type TEXT DEFAULT 'full_day',
      start_time TEXT DEFAULT '07:00',
      end_time TEXT DEFAULT '18:00',
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, child_id, day_of_week, effective_from)
    );
    CREATE INDEX IF NOT EXISTS idx_booked_days_room ON child_booked_days(tenant_id, room_id, day_of_week);
    CREATE INDEX IF NOT EXISTS idx_booked_days_child ON child_booked_days(child_id);

    CREATE TABLE IF NOT EXISTS daily_attendance_forecast (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      booked_count INTEGER DEFAULT 0,
      expected_count INTEGER DEFAULT 0,
      actual_count INTEGER,
      ratio_required TEXT,
      educators_required INTEGER DEFAULT 1,
      notes TEXT,
      generated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, room_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_forecast_date ON daily_attendance_forecast(tenant_id, date);
  `);

  // #4 Non-contact time
  db.exec(`
    CREATE TABLE IF NOT EXISTS non_contact_blocks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      roster_entry_id TEXT REFERENCES roster_entries(id) ON DELETE CASCADE,
      educator_id TEXT NOT NULL REFERENCES educators(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      block_type TEXT NOT NULL DEFAULT 'programming',
      description TEXT,
      approved_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_noncontact_date ON non_contact_blocks(tenant_id, date);
    CREATE INDEX IF NOT EXISTS idx_noncontact_educator ON non_contact_blocks(educator_id, date);
  `);

  // #5 Qualification mix rules
  db.exec(`
    CREATE TABLE IF NOT EXISTS qualification_mix_rules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      rule_type TEXT NOT NULL,
      description TEXT NOT NULL,
      children_threshold INTEGER,
      min_ect INTEGER DEFAULT 0,
      min_diploma_pct REAL DEFAULT 0,
      min_cert3_pct REAL DEFAULT 0,
      region TEXT DEFAULT 'AU',
      regulation_ref TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_qualmix_tenant ON qualification_mix_rules(tenant_id);
  `);

  // #6 Shift swaps
  db.exec(`
    CREATE TABLE IF NOT EXISTS shift_swaps (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      requester_id TEXT NOT NULL REFERENCES educators(id),
      requester_entry_id TEXT NOT NULL REFERENCES roster_entries(id),
      target_id TEXT NOT NULL REFERENCES educators(id),
      target_entry_id TEXT NOT NULL REFERENCES roster_entries(id),
      reason TEXT,
      status TEXT DEFAULT 'pending',
      requested_at TEXT DEFAULT (datetime('now')),
      responded_at TEXT,
      target_response TEXT,
      approved_by TEXT REFERENCES users(id),
      approved_at TEXT,
      decline_reason TEXT,
      compliance_check_passed INTEGER,
      compliance_notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_shift_swaps_tenant ON shift_swaps(tenant_id, status);
  `);

  // #7 Room-to-room movements
  db.exec(`
    CREATE TABLE IF NOT EXISTS educator_room_movements (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      roster_entry_id TEXT REFERENCES roster_entries(id),
      educator_id TEXT NOT NULL REFERENCES educators(id),
      date TEXT NOT NULL,
      from_room_id TEXT REFERENCES rooms(id),
      to_room_id TEXT NOT NULL REFERENCES rooms(id),
      start_time TEXT NOT NULL,
      end_time TEXT,
      reason TEXT DEFAULT 'ratio_balance',
      initiated_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_movements_date ON educator_room_movements(tenant_id, date);
  `);

  // #8 Public holidays + penalty rates
  db.exec(`
    CREATE TABLE IF NOT EXISTS public_holidays (
      id TEXT PRIMARY KEY,
      tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
      region TEXT NOT NULL DEFAULT 'AU',
      state TEXT,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      is_gazetted INTEGER DEFAULT 1,
      centre_open INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, date, region)
    );
    CREATE INDEX IF NOT EXISTS idx_ph_date ON public_holidays(date);

    CREATE TABLE IF NOT EXISTS penalty_rate_rules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
      region TEXT NOT NULL DEFAULT 'AU',
      award_name TEXT DEFAULT 'Children''s Services Award 2010',
      condition_type TEXT NOT NULL,
      multiplier REAL NOT NULL DEFAULT 1.0,
      description TEXT,
      applies_to_employment_type TEXT DEFAULT 'all',
      min_hours_threshold REAL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_penalty_tenant ON penalty_rate_rules(tenant_id);
  `);

  // #9 Award classifications
  db.exec(`
    CREATE TABLE IF NOT EXISTS award_classifications (
      id TEXT PRIMARY KEY,
      region TEXT NOT NULL DEFAULT 'AU',
      award_name TEXT DEFAULT 'Children''s Services Award 2010',
      level TEXT NOT NULL,
      sub_level TEXT,
      title TEXT NOT NULL,
      description TEXT,
      base_hourly_cents INTEGER NOT NULL,
      base_annual_cents INTEGER,
      casual_loading_pct REAL DEFAULT 25.0,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(region, level, sub_level, effective_from)
    );
    CREATE INDEX IF NOT EXISTS idx_award_level ON award_classifications(level);
  `);

  // Educator enhancement columns
  [
    "ALTER TABLE educators ADD COLUMN award_classification TEXT",
    "ALTER TABLE educators ADD COLUMN award_level TEXT",
    "ALTER TABLE educators ADD COLUMN is_nominated_supervisor INTEGER DEFAULT 0",
    "ALTER TABLE educators ADD COLUMN is_educational_leader INTEGER DEFAULT 0",
    "ALTER TABLE educators ADD COLUMN max_consecutive_days INTEGER DEFAULT 5",
    "ALTER TABLE educators ADD COLUMN roster_role TEXT DEFAULT 'educator'",
  ].forEach(sql => { try { db.exec(sql); } catch(e) {} });

  // #10 Staffing agencies
  db.exec(`
    CREATE TABLE IF NOT EXISTS staffing_agencies (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      min_notice_hours INTEGER DEFAULT 2,
      hourly_rate_cents INTEGER DEFAULT 5500,
      agency_fee_pct REAL DEFAULT 15.0,
      qualifications_available TEXT DEFAULT '["cert3","diploma"]',
      preferred INTEGER DEFAULT 0,
      rating REAL DEFAULT 3.0,
      total_bookings INTEGER DEFAULT 0,
      total_cancellations INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agency_tenant ON staffing_agencies(tenant_id);

    CREATE TABLE IF NOT EXISTS agency_bookings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      agency_id TEXT NOT NULL REFERENCES staffing_agencies(id),
      shift_fill_request_id TEXT REFERENCES shift_fill_requests(id),
      roster_entry_id TEXT REFERENCES roster_entries(id),
      room_id TEXT REFERENCES rooms(id),
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      qualification_required TEXT,
      agency_educator_name TEXT,
      agency_educator_qualification TEXT,
      agency_educator_wwcc TEXT,
      status TEXT DEFAULT 'requested',
      cost_cents INTEGER DEFAULT 0,
      agency_fee_cents INTEGER DEFAULT 0,
      confirmed_at TEXT,
      cancelled_at TEXT,
      cancel_reason TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agency_booking_date ON agency_bookings(tenant_id, date);
  `);

  // #11 Split shift + penalty tracking on roster_entries
  [
    "ALTER TABLE roster_entries ADD COLUMN is_split_shift INTEGER DEFAULT 0",
    "ALTER TABLE roster_entries ADD COLUMN split_group_id TEXT",
    "ALTER TABLE roster_entries ADD COLUMN split_sequence INTEGER DEFAULT 0",
    "ALTER TABLE roster_entries ADD COLUMN penalty_multiplier REAL DEFAULT 1.0",
    "ALTER TABLE roster_entries ADD COLUMN penalty_reason TEXT",
    "ALTER TABLE roster_entries ADD COLUMN actual_start TEXT",
    "ALTER TABLE roster_entries ADD COLUMN actual_end TEXT",
  ].forEach(sql => { try { db.exec(sql); } catch(e) {} });

  // #12 Role coverage requirements
  db.exec(`
    CREATE TABLE IF NOT EXISTS role_coverage_requirements (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      role_type TEXT NOT NULL,
      min_count INTEGER DEFAULT 1,
      must_be_onsite INTEGER DEFAULT 1,
      reasonably_available INTEGER DEFAULT 0,
      notes TEXT,
      regulation_ref TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, role_type)
    );
    CREATE INDEX IF NOT EXISTS idx_role_coverage ON role_coverage_requirements(tenant_id);
  `);

  // #13 Float / supernumerary assignments
  db.exec(`
    CREATE TABLE IF NOT EXISTS float_assignments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      roster_entry_id TEXT REFERENCES roster_entries(id),
      educator_id TEXT NOT NULL REFERENCES educators(id),
      date TEXT NOT NULL,
      assignment_type TEXT NOT NULL DEFAULT 'float',
      primary_room_id TEXT REFERENCES rooms(id),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, educator_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_float_date ON float_assignments(tenant_id, date);
  `);

  // #14 Pay periods
  db.exec(`
    CREATE TABLE IF NOT EXISTS pay_periods (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      period_type TEXT DEFAULT 'fortnightly',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      pay_date TEXT,
      status TEXT DEFAULT 'open',
      total_hours REAL DEFAULT 0,
      total_gross_cents INTEGER DEFAULT 0,
      total_super_cents INTEGER DEFAULT 0,
      total_penalty_cents INTEGER DEFAULT 0,
      exported INTEGER DEFAULT 0,
      exported_at TEXT,
      export_format TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, start_date)
    );
    CREATE INDEX IF NOT EXISTS idx_pay_period_date ON pay_periods(tenant_id, start_date);

    CREATE TABLE IF NOT EXISTS pay_period_entries (
      id TEXT PRIMARY KEY,
      pay_period_id TEXT NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
      educator_id TEXT NOT NULL REFERENCES educators(id),
      roster_entry_id TEXT REFERENCES roster_entries(id),
      date TEXT NOT NULL,
      ordinary_hours REAL DEFAULT 0,
      overtime_hours REAL DEFAULT 0,
      penalty_hours REAL DEFAULT 0,
      base_rate_cents INTEGER DEFAULT 0,
      penalty_multiplier REAL DEFAULT 1.0,
      penalty_reason TEXT,
      gross_cents INTEGER DEFAULT 0,
      super_cents INTEGER DEFAULT 0,
      leave_type TEXT,
      leave_hours REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ppe_period ON pay_period_entries(pay_period_id);
    CREATE INDEX IF NOT EXISTS idx_ppe_educator ON pay_period_entries(educator_id);
  `);

  // #15 Fatigue rules
  db.exec(`
    CREATE TABLE IF NOT EXISTS fatigue_rules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
      region TEXT NOT NULL DEFAULT 'AU',
      award_name TEXT DEFAULT 'Children''s Services Award 2010',
      max_consecutive_days INTEGER DEFAULT 5,
      min_break_between_shifts_hours REAL DEFAULT 10,
      max_hours_per_day REAL DEFAULT 10,
      max_hours_per_week REAL DEFAULT 38,
      max_hours_per_fortnight REAL DEFAULT 76,
      overtime_daily_threshold REAL DEFAULT 7.6,
      overtime_weekly_threshold REAL DEFAULT 38,
      broken_shift_max_span_hours REAL DEFAULT 12,
      active INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, region)
    );
    CREATE INDEX IF NOT EXISTS idx_fatigue_tenant ON fatigue_rules(tenant_id);
  `);

  // Tenant enhancement columns
  [
    "ALTER TABLE tenants ADD COLUMN operating_hours_start TEXT DEFAULT '06:30'",
    "ALTER TABLE tenants ADD COLUMN operating_hours_end TEXT DEFAULT '18:30'",
    "ALTER TABLE tenants ADD COLUMN region TEXT DEFAULT 'AU'",
    "ALTER TABLE tenants ADD COLUMN state TEXT DEFAULT 'NSW'",
    "ALTER TABLE tenants ADD COLUMN pay_cycle TEXT DEFAULT 'fortnightly'",
    "ALTER TABLE tenants ADD COLUMN approved_places INTEGER DEFAULT 40",
  ].forEach(sql => { try { db.exec(sql); } catch(e) {} });

  // Shift fill request escalation columns
  [
    "ALTER TABLE shift_fill_requests ADD COLUMN escalated_to_agency INTEGER DEFAULT 0",
    "ALTER TABLE shift_fill_requests ADD COLUMN agency_booking_id TEXT",
    "ALTER TABLE shift_fill_requests ADD COLUMN internal_attempts_exhausted INTEGER DEFAULT 0",
    "ALTER TABLE shift_fill_requests ADD COLUMN escalation_time TEXT",
  ].forEach(sql => { try { db.exec(sql); } catch(e) {} });

  // ══ v2.4.0 TABLES ═══════════════════════════════════════════════════════

  // Activity log — paper trail for educators + children
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT,
      category TEXT DEFAULT 'general',
      performed_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_activity_tenant ON activity_log(tenant_id, created_at);
  `);

  // Broadcast approval queue
  db.exec(`
    CREATE TABLE IF NOT EXISTS broadcast_queue (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      audience TEXT DEFAULT 'all_parents',
      channel TEXT DEFAULT 'email',
      subject TEXT,
      body TEXT NOT NULL,
      recipient_name TEXT,
      recipient_email TEXT,
      scheduled_at TEXT,
      status TEXT DEFAULT 'pending_approval',
      created_by TEXT,
      approved_by TEXT,
      approved_at TEXT,
      reject_reason TEXT,
      sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_broadcast_tenant ON broadcast_queue(tenant_id, status);
  `);

  // Parent learning input (weekly goals)
  db.exec(`
    CREATE TABLE IF NOT EXISTS parent_learning_input (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      week_start TEXT NOT NULL,
      goals TEXT,
      focus_areas TEXT,
      notes TEXT,
      submitted_by TEXT,
      submitted_at TEXT DEFAULT (datetime('now')),
      educator_viewed INTEGER DEFAULT 0,
      educator_viewed_at TEXT,
      UNIQUE(tenant_id, child_id, week_start)
    );
    CREATE INDEX IF NOT EXISTS idx_pli_child ON parent_learning_input(child_id, week_start);
  `);

  // Compliance to-do items
  db.exec(`
    CREATE TABLE IF NOT EXISTS compliance_todo (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      compliance_type TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      priority TEXT DEFAULT 'medium',
      resource_url TEXT,
      resource_label TEXT,
      regulation TEXT,
      status TEXT DEFAULT 'open',
      resolved_by TEXT,
      resolved_at TEXT,
      resolution_note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_compliance_todo ON compliance_todo(tenant_id, status);
  `);

  // Room transfers (billing audit trail)
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_transfers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      old_room_id TEXT REFERENCES rooms(id),
      new_room_id TEXT NOT NULL REFERENCES rooms(id),
      effective_date TEXT NOT NULL,
      old_daily_fee REAL,
      new_daily_fee REAL,
      fee_difference REAL,
      reason TEXT,
      transferred_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_room_transfer ON room_transfers(tenant_id, child_id);
  `);

  // daily_run_sheets publish columns
  [
    "ALTER TABLE daily_run_sheets ADD COLUMN published_to_parents INTEGER DEFAULT 0",
    "ALTER TABLE daily_run_sheets ADD COLUMN published_at TEXT",
    "ALTER TABLE daily_run_sheets ADD COLUMN published_by TEXT",
    "ALTER TABLE daily_run_sheets ADD COLUMN emailed_at TEXT",
  ].forEach(sql => { try { db.exec(sql); } catch(e) {} });

  console.log('[v2.4.0] ✓ v2.4.0 tables created (activity_log, broadcast_queue, parent_learning_input, compliance_todo, room_transfers)');

  // ══ v2.4.1 — Room Grouping for Rostering ═══════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_groups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      location TEXT,
      combined_ratio_strategy TEXT DEFAULT 'youngest_child',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_room_groups_tenant ON room_groups(tenant_id);

    CREATE TABLE IF NOT EXISTS room_group_members (
      id TEXT PRIMARY KEY,
      room_group_id TEXT NOT NULL REFERENCES room_groups(id) ON DELETE CASCADE,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      UNIQUE(room_group_id, room_id)
    );
    CREATE INDEX IF NOT EXISTS idx_rgm_group ON room_group_members(room_group_id);

    CREATE TABLE IF NOT EXISTS room_group_schedules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      room_group_id TEXT NOT NULL REFERENCES room_groups(id) ON DELETE CASCADE,
      day_of_week INTEGER,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      schedule_type TEXT DEFAULT 'recurring',
      specific_date TEXT,
      reason TEXT DEFAULT 'ratio_optimisation',
      min_educators INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_rgs_group ON room_group_schedules(room_group_id);
    CREATE INDEX IF NOT EXISTS idx_rgs_tenant ON room_group_schedules(tenant_id);

    CREATE TABLE IF NOT EXISTS room_group_roster_entries (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      room_group_id TEXT NOT NULL REFERENCES room_groups(id),
      educator_id TEXT NOT NULL REFERENCES educators(id),
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      break_mins INTEGER DEFAULT 0,
      cost_cents INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_rgre_date ON room_group_roster_entries(tenant_id, date);
  `);

  console.log('[v2.4.1] ✓ Room grouping tables created');
}

// ── Seed data (call from seedDemoData with edIds + roomIds in scope) ─────

export function seedRosterEnhancements(db, tenantId, edIds, roomIds) {
  console.log('[v2.3.0] Seeding rostering enhancement data...');

  // #1 RP Coverage — Sarah (ECT, idx 0) and Mei (ECT, idx 5) as RPs
  const rpDays = ['2026-02-23','2026-02-24','2026-02-25','2026-02-26','2026-02-27'];
  rpDays.forEach(date => {
    db.prepare('INSERT OR IGNORE INTO rp_coverage (id,tenant_id,date,educator_id,start_time,end_time,role,is_backup) VALUES(?,?,?,?,?,?,?,?)')
      .run(uuid(), tenantId, date, edIds[0], '06:30', '15:00', 'responsible_person', 0);
    db.prepare('INSERT OR IGNORE INTO rp_coverage (id,tenant_id,date,educator_id,start_time,end_time,role,is_backup) VALUES(?,?,?,?,?,?,?,?)')
      .run(uuid(), tenantId, date, edIds[5], '09:00', '18:30', 'responsible_person', 0);
    db.prepare('INSERT OR IGNORE INTO rp_coverage (id,tenant_id,date,educator_id,start_time,end_time,role,is_backup) VALUES(?,?,?,?,?,?,?,?)')
      .run(uuid(), tenantId, date, edIds[1], '07:00', '15:30', 'responsible_person', 1);
  });

  // #3 Child booked days
  try {
    const children = db.prepare("SELECT id, room_id FROM children WHERE tenant_id=? AND active=1 LIMIT 12").all(tenantId);
    const patterns = [
      [1,1,1,1,1],[1,1,0,1,1],[1,0,1,0,1],[0,1,1,1,0],[1,1,1,1,1],[1,1,1,0,0],
      [0,0,1,1,1],[1,1,0,1,0],[1,1,1,1,1],[0,1,0,1,1],[1,1,1,1,0],[1,0,1,1,1],
    ];
    children.forEach((child, idx) => {
      const pat = patterns[idx % patterns.length];
      for (let d = 0; d < 5; d++) {
        if (pat[d]) {
          db.prepare('INSERT OR IGNORE INTO child_booked_days (id,tenant_id,child_id,room_id,day_of_week,session_type,start_time,end_time,effective_from,active) VALUES(?,?,?,?,?,?,?,?,?,?)')
            .run(uuid(), tenantId, child.id, child.room_id, d + 1, 'full_day', '07:00', '18:00', '2026-01-01', 1);
        }
      }
    });
  } catch(e) { console.warn('[v2.3.0] Booked days seed skipped:', e.message); }

  // #3 Attendance forecast
  const forecastDays = ['2026-02-23','2026-02-24','2026-02-25','2026-02-26','2026-02-27'];
  const roomForecasts = [
    { room: 0, counts: [8,7,6,8,7] },
    { room: 1, counts: [12,11,10,12,11] },
    { room: 2, counts: [15,14,13,15,14] },
    { room: 3, counts: [18,17,16,18,16] },
  ];
  roomForecasts.forEach(rf => {
    if (!roomIds[rf.room]) return;
    forecastDays.forEach((date, di) => {
      const booked = rf.counts[di];
      const ratios = [4, 5, 11, 11];
      const educatorsReq = Math.ceil(booked / ratios[rf.room]);
      db.prepare('INSERT OR IGNORE INTO daily_attendance_forecast (id,tenant_id,room_id,date,booked_count,expected_count,educators_required,ratio_required) VALUES(?,?,?,?,?,?,?,?)')
        .run(uuid(), tenantId, roomIds[rf.room], date, booked, Math.round(booked * 0.92), educatorsReq, `1:${ratios[rf.room]}`);
    });
  });

  // #4 Non-contact blocks for ECTs
  try {
    const sarahEntry = db.prepare("SELECT id FROM roster_entries WHERE tenant_id=? AND educator_id=? AND date='2026-02-25' LIMIT 1").get(tenantId, edIds[0]);
    const meiEntry = db.prepare("SELECT id FROM roster_entries WHERE tenant_id=? AND educator_id=? AND date='2026-02-26' LIMIT 1").get(tenantId, edIds[5]);
    if (sarahEntry) db.prepare('INSERT OR IGNORE INTO non_contact_blocks (id,tenant_id,roster_entry_id,educator_id,date,start_time,end_time,block_type,description) VALUES(?,?,?,?,?,?,?,?,?)').run(uuid(), tenantId, sarahEntry.id, edIds[0], '2026-02-25', '13:00', '15:00', 'programming', 'Weekly program planning and documentation');
    if (meiEntry) db.prepare('INSERT OR IGNORE INTO non_contact_blocks (id,tenant_id,roster_entry_id,educator_id,date,start_time,end_time,block_type,description) VALUES(?,?,?,?,?,?,?,?,?)').run(uuid(), tenantId, meiEntry.id, edIds[5], '2026-02-26', '10:00', '12:00', 'programming', 'Learning story documentation');
  } catch(e) {}

  // #5 Qualification mix rules (NQF)
  [
    { type:'diploma_minimum', desc:'At least 50% of educators must hold or be actively working towards a Diploma (Reg 126)', children:0, ect:0, dipPct:50, reg:'Regulation 126' },
    { type:'ect_small_service', desc:'Services with 1-24 approved places: access to ECT for ≥20hrs/week', children:24, ect:1, dipPct:0, reg:'Regulation 127(1)' },
    { type:'ect_medium_service', desc:'Services with 25-59 approved places: 1 full-time ECT', children:59, ect:1, dipPct:0, reg:'Regulation 127(2)' },
    { type:'ect_large_service', desc:'Services with 60-79 approved places: 2 ECTs, 1 full-time', children:79, ect:2, dipPct:0, reg:'Regulation 127(3)' },
    { type:'ect_very_large', desc:'Services with 80+ approved places: 2 full-time ECTs', children:999, ect:2, dipPct:0, reg:'Regulation 127(4)' },
    { type:'min_one_educator', desc:'At least one educator must be working directly with children in each room at all times', children:0, ect:0, dipPct:0, reg:'Regulation 132' },
  ].forEach(r => {
    db.prepare('INSERT OR IGNORE INTO qualification_mix_rules (id,tenant_id,rule_type,description,children_threshold,min_ect,min_diploma_pct,region,regulation_ref) VALUES(?,?,?,?,?,?,?,?,?)').run(uuid(), tenantId, r.type, r.desc, r.children, r.ect, r.dipPct, 'AU', r.reg);
  });

  // #6 Shift swap demo
  try {
    const entries = db.prepare("SELECT id, educator_id FROM roster_entries WHERE tenant_id=? AND date='2026-02-25' LIMIT 6").all(tenantId);
    const e0 = entries.find(e => e.educator_id === edIds[0]);
    const e1 = entries.find(e => e.educator_id === edIds[1]);
    if (e0 && e1) db.prepare('INSERT OR IGNORE INTO shift_swaps (id,tenant_id,requester_id,requester_entry_id,target_id,target_entry_id,reason,status) VALUES(?,?,?,?,?,?,?,?)').run(uuid(), tenantId, edIds[0], e0.id, edIds[1], e1.id, 'Dentist appointment Wednesday morning — can we swap?', 'pending');
  } catch(e) {}

  // #7 Room movements
  db.prepare('INSERT OR IGNORE INTO educator_room_movements (id,tenant_id,educator_id,date,from_room_id,to_room_id,start_time,end_time,reason) VALUES(?,?,?,?,?,?,?,?,?)').run(uuid(), tenantId, edIds[7], '2026-02-24', roomIds[1], roomIds[0], '12:00', '13:00', 'lunch_cover');
  db.prepare('INSERT OR IGNORE INTO educator_room_movements (id,tenant_id,educator_id,date,from_room_id,to_room_id,start_time,end_time,reason) VALUES(?,?,?,?,?,?,?,?,?)').run(uuid(), tenantId, edIds[7], '2026-02-25', roomIds[2], roomIds[1], '11:30', '12:30', 'ratio_balance');

  // #8 NSW 2026 public holidays
  [
    { name:"New Year's Day", date:'2026-01-01', open:0 },
    { name:'Australia Day', date:'2026-01-26', open:0 },
    { name:'Good Friday', date:'2026-04-03', open:0 },
    { name:'Easter Saturday', date:'2026-04-04', open:0 },
    { name:'Easter Monday', date:'2026-04-06', open:0 },
    { name:'Anzac Day', date:'2026-04-25', open:0 },
    { name:"Queen's Birthday", date:'2026-06-08', open:0 },
    { name:'Bank Holiday', date:'2026-08-03', open:0 },
    { name:'Christmas Day', date:'2026-12-25', open:0 },
    { name:'Boxing Day', date:'2026-12-28', open:0 },
  ].forEach(h => {
    db.prepare('INSERT OR IGNORE INTO public_holidays (id,tenant_id,region,state,name,date,centre_open) VALUES(?,?,?,?,?,?,?)').run(uuid(), tenantId, 'AU', 'NSW', h.name, h.date, h.open ? 1 : 0);
  });

  // #8 Penalty rate rules (Children's Services Award 2010)
  [
    { cond:'public_holiday', mult:2.5, desc:'Public holiday — 250% (permanent)', applies:'permanent' },
    { cond:'public_holiday', mult:2.75, desc:'Public holiday — 275% (casual incl. loading)', applies:'casual' },
    { cond:'saturday', mult:1.5, desc:'Saturday — 150% (permanent)', applies:'permanent' },
    { cond:'saturday', mult:1.75, desc:'Saturday — 175% (casual)', applies:'casual' },
    { cond:'sunday', mult:2.0, desc:'Sunday — 200% (permanent)', applies:'permanent' },
    { cond:'sunday', mult:2.25, desc:'Sunday — 225% (casual)', applies:'casual' },
    { cond:'overtime_daily', mult:1.5, desc:'First 2hrs overtime — 150%', applies:'all', minHrs:7.6 },
    { cond:'overtime_daily', mult:2.0, desc:'After 2hrs overtime — 200%', applies:'all', minHrs:9.6 },
    { cond:'overtime_weekly', mult:1.5, desc:'Weekly hours >38 — 150%', applies:'permanent', minHrs:38 },
    { cond:'early_morning', mult:1.15, desc:'Shift before 06:00 — 115%', applies:'all' },
    { cond:'late_evening', mult:1.15, desc:'Shift after 18:30 — 115%', applies:'all' },
    { cond:'casual_loading', mult:1.25, desc:'Casual loading — 25%', applies:'casual' },
    { cond:'broken_shift_allowance', mult:1.0, desc:'Split shift allowance — flat $18.67', applies:'all' },
  ].forEach(r => {
    db.prepare('INSERT OR IGNORE INTO penalty_rate_rules (id,tenant_id,region,condition_type,multiplier,description,applies_to_employment_type,min_hours_threshold) VALUES(?,?,?,?,?,?,?,?)').run(uuid(), tenantId, 'AU', r.cond, r.mult, r.desc, r.applies, r.minHrs || null);
  });

  // #9 Award classifications (Children's Services Award 2010, effective 1 Jul 2025)
  [
    { lvl:'1', sub:'1', title:'Support Worker Level 1.1', desc:'No formal qualification required', cents:2588, annual:49674 },
    { lvl:'1', sub:'2', title:'Support Worker Level 1.2', desc:'After 12 months at 1.1', cents:2649, annual:50841 },
    { lvl:'2', sub:'1', title:'Support Worker Level 2.1', desc:'Holds or studying Cert III', cents:2715, annual:52108 },
    { lvl:'2', sub:'2', title:'Support Worker Level 2.2', desc:'After 12 months at 2.1', cents:2778, annual:53317 },
    { lvl:'3', sub:'1', title:"Children's Services Worker Level 3.1", desc:'Holds Cert III', cents:2881, annual:55313 },
    { lvl:'3', sub:'2', title:"Children's Services Worker Level 3.2", desc:'After 12 months at 3.1', cents:2960, annual:56833 },
    { lvl:'3', sub:'3', title:"Children's Services Worker Level 3.3", desc:'After 24 months at 3.1', cents:3029, annual:58147 },
    { lvl:'4', sub:'1', title:"Children's Services Worker Level 4.1", desc:'Holds or studying Diploma', cents:3118, annual:59852 },
    { lvl:'4', sub:'2', title:"Children's Services Worker Level 4.2", desc:'After 12 months at 4.1', cents:3205, annual:61527 },
    { lvl:'4', sub:'3', title:"Children's Services Worker Level 4.3", desc:'Holds Diploma, after 24 months', cents:3326, annual:63856 },
    { lvl:'5', sub:'1', title:'ECT Level 5.1', desc:'ECT first year', cents:3555, annual:68239 },
    { lvl:'5', sub:'2', title:'ECT Level 5.2', desc:'ECT after 12 months', cents:3700, annual:71011 },
    { lvl:'5', sub:'3', title:'ECT Level 5.3', desc:'ECT after 24 months', cents:3876, annual:74383 },
    { lvl:'5', sub:'4', title:'ECT Level 5.4', desc:'ECT after 36 months', cents:4070, annual:78111 },
    { lvl:'6', sub:'1', title:'Director/Coordinator Level 6.1', desc:'Service director first year', cents:4202, annual:80663 },
    { lvl:'6', sub:'2', title:'Director/Coordinator Level 6.2', desc:'Director after 12 months', cents:4369, annual:83872 },
    { lvl:'6', sub:'3', title:'Director/Coordinator Level 6.3', desc:'Director after 24 months', cents:4534, annual:87039 },
  ].forEach(a => {
    db.prepare('INSERT OR IGNORE INTO award_classifications (id,region,level,sub_level,title,description,base_hourly_cents,base_annual_cents,effective_from) VALUES(?,?,?,?,?,?,?,?,?)').run(uuid(), 'AU', a.lvl, a.sub, a.title, a.desc, a.cents, a.annual, '2025-07-01');
  });

  // #10 Staffing agencies
  [
    { name:'Aussie Early Learning Agency', contact:'Karen White', phone:'02 9555 0101', email:'bookings@aelagency.com.au', rate:5500, fee:15, quals:'["cert3","diploma","ect"]', pref:1, rating:4.2, bookings:12 },
    { name:'KidsCover Staffing', contact:'Mike Burns', phone:'02 9555 0202', email:'shifts@kidscover.com.au', rate:5800, fee:18, quals:'["cert3","diploma"]', pref:0, rating:3.8, bookings:5 },
    { name:'ChildCare Casuals NSW', contact:'Tina Yang', phone:'1300 222 333', email:'urgent@ccasuals.com.au', rate:6000, fee:20, quals:'["cert3","diploma","ect"]', pref:0, rating:3.5, bookings:3 },
  ].forEach(a => {
    db.prepare('INSERT OR IGNORE INTO staffing_agencies (id,tenant_id,name,contact_name,phone,email,hourly_rate_cents,agency_fee_pct,qualifications_available,preferred,rating,total_bookings) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(uuid(), tenantId, a.name, a.contact, a.phone, a.email, a.rate, a.fee, a.quals, a.pref ? 1 : 0, a.rating, a.bookings);
  });

  // #12 Role coverage requirements
  [
    { role:'responsible_person', min:1, onsite:1, avail:0, notes:'Must be physically present at all times', reg:'Regulation 150' },
    { role:'nominated_supervisor', min:1, onsite:0, avail:1, notes:'Must be reasonably available to staff', reg:'Regulation 24' },
    { role:'educational_leader', min:1, onsite:0, avail:1, notes:'Must guide curriculum development', reg:'Regulation 118' },
    { role:'first_aider', min:1, onsite:1, avail:0, notes:'At least one educator with current first aid on duty', reg:'Regulation 136' },
  ].forEach(r => {
    db.prepare('INSERT OR IGNORE INTO role_coverage_requirements (id,tenant_id,role_type,min_count,must_be_onsite,reasonably_available,notes,regulation_ref) VALUES(?,?,?,?,?,?,?,?)').run(uuid(), tenantId, r.role, r.min, r.onsite, r.avail, r.notes, r.reg);
  });

  // #13 Float assignment — Rachel is Friday float
  try {
    const friEntry = db.prepare("SELECT id FROM roster_entries WHERE tenant_id=? AND educator_id=? AND date='2026-02-27' LIMIT 1").get(tenantId, edIds[7]);
    if (friEntry) db.prepare('INSERT OR IGNORE INTO float_assignments (id,tenant_id,roster_entry_id,educator_id,date,assignment_type,primary_room_id,notes) VALUES(?,?,?,?,?,?,?,?)').run(uuid(), tenantId, friEntry.id, edIds[7], '2026-02-27', 'float', roomIds[1], 'Primary in Possums, float to Joeys for ratio support');
  } catch(e) {}

  // #14 Pay period
  db.prepare('INSERT OR IGNORE INTO pay_periods (id,tenant_id,period_type,start_date,end_date,pay_date,status,total_hours,total_gross_cents) VALUES(?,?,?,?,?,?,?,?,?)').run(uuid(), tenantId, 'fortnightly', '2026-02-23', '2026-03-08', '2026-03-12', 'open', 520, 1820000);

  // #15 Fatigue rules
  db.prepare('INSERT OR IGNORE INTO fatigue_rules (id,tenant_id,region,max_consecutive_days,min_break_between_shifts_hours,max_hours_per_day,max_hours_per_week,max_hours_per_fortnight,overtime_daily_threshold,overtime_weekly_threshold) VALUES(?,?,?,?,?,?,?,?,?,?)').run(uuid(), tenantId, 'AU', 5, 10, 10, 38, 76, 7.6, 38);

  // Update educator roles + award levels
  try {
    db.prepare("UPDATE educators SET is_nominated_supervisor=1, is_responsible_person=1, roster_role='responsible_person', award_classification='5', award_level='5.4' WHERE id=?").run(edIds[0]); // Sarah — ECT
    db.prepare("UPDATE educators SET is_educational_leader=1, is_responsible_person=1, roster_role='responsible_person', award_classification='5', award_level='5.3' WHERE id=?").run(edIds[5]); // Mei — ECT
    db.prepare("UPDATE educators SET award_classification='4', award_level='4.3' WHERE id=?").run(edIds[1]); // James — Diploma
    db.prepare("UPDATE educators SET award_classification='4', award_level='4.2' WHERE id=?").run(edIds[2]); // Emily — Diploma
    db.prepare("UPDATE educators SET award_classification='3', award_level='3.2' WHERE id=?").run(edIds[3]); // Priya — Cert3
    db.prepare("UPDATE educators SET award_classification='3', award_level='3.1' WHERE id=?").run(edIds[4]); // Tom — Cert3 casual
    db.prepare("UPDATE educators SET award_classification='2', award_level='2.1' WHERE id=?").run(edIds[6]); // Alex — working_towards
    db.prepare("UPDATE educators SET roster_role='float', award_classification='3', award_level='3.2' WHERE id=?").run(edIds[7]); // Rachel — float
    db.prepare("UPDATE educators SET award_classification='4', award_level='4.1' WHERE id=?").run(edIds[8]); // Liam — Diploma casual
    db.prepare("UPDATE educators SET award_classification='3', award_level='3.1' WHERE id=?").run(edIds[9]); // Sophie — Cert3 casual
  } catch(e) {}

  // Room groups — common area groupings for ratio optimisation
  try {
    const morningGroupId = uuid();
    const afternoonGroupId = uuid();
    const allRoomsGroupId = uuid();

    // Morning group: Joeys + Possums combined before 8:30am (babies + toddlers in one area)
    db.prepare('INSERT OR IGNORE INTO room_groups (id,tenant_id,name,description,location,combined_ratio_strategy) VALUES(?,?,?,?,?,?)').run(morningGroupId, tenantId, 'Early Morning Combined', 'Joeys + Possums combined before most arrivals', 'Main play hall', 'youngest_child');
    db.prepare('INSERT OR IGNORE INTO room_group_members (id,room_group_id,room_id) VALUES(?,?,?)').run(uuid(), morningGroupId, roomIds[0]); // Joeys
    db.prepare('INSERT OR IGNORE INTO room_group_members (id,room_group_id,room_id) VALUES(?,?,?)').run(uuid(), morningGroupId, roomIds[1]); // Possums

    // Afternoon group: Koalas + Kookaburras combined after 4pm
    db.prepare('INSERT OR IGNORE INTO room_groups (id,tenant_id,name,description,location,combined_ratio_strategy) VALUES(?,?,?,?,?,?)').run(afternoonGroupId, tenantId, 'Late Afternoon Combined', 'Koalas + Kookaburras combined as children depart', 'Outdoor area', 'youngest_child');
    db.prepare('INSERT OR IGNORE INTO room_group_members (id,room_group_id,room_id) VALUES(?,?,?)').run(uuid(), afternoonGroupId, roomIds[2]); // Koalas
    db.prepare('INSERT OR IGNORE INTO room_group_members (id,room_group_id,room_id) VALUES(?,?,?)').run(uuid(), afternoonGroupId, roomIds[3]); // Kookaburras

    // All rooms combined for very early / very late
    db.prepare('INSERT OR IGNORE INTO room_groups (id,tenant_id,name,description,location,combined_ratio_strategy) VALUES(?,?,?,?,?,?)').run(allRoomsGroupId, tenantId, 'Before/After Hours All Rooms', 'All children combined during low-attendance periods', 'Main play hall', 'youngest_child');
    roomIds.forEach(rid => {
      db.prepare('INSERT OR IGNORE INTO room_group_members (id,room_group_id,room_id) VALUES(?,?,?)').run(uuid(), allRoomsGroupId, rid);
    });

    // Schedules: Mon-Fri recurring
    for (let dow = 1; dow <= 5; dow++) {
      db.prepare('INSERT OR IGNORE INTO room_group_schedules (id,tenant_id,room_group_id,day_of_week,start_time,end_time,schedule_type,reason,min_educators) VALUES(?,?,?,?,?,?,?,?,?)').run(uuid(), tenantId, morningGroupId, dow, '06:30', '08:30', 'recurring', 'ratio_optimisation', 2);
      db.prepare('INSERT OR IGNORE INTO room_group_schedules (id,tenant_id,room_group_id,day_of_week,start_time,end_time,schedule_type,reason,min_educators) VALUES(?,?,?,?,?,?,?,?,?)').run(uuid(), tenantId, afternoonGroupId, dow, '16:00', '18:30', 'recurring', 'ratio_optimisation', 2);
      db.prepare('INSERT OR IGNORE INTO room_group_schedules (id,tenant_id,room_group_id,day_of_week,start_time,end_time,schedule_type,reason,min_educators) VALUES(?,?,?,?,?,?,?,?,?)').run(uuid(), tenantId, allRoomsGroupId, dow, '06:30', '07:00', 'recurring', 'very_early', 1);
      db.prepare('INSERT OR IGNORE INTO room_group_schedules (id,tenant_id,room_group_id,day_of_week,start_time,end_time,schedule_type,reason,min_educators) VALUES(?,?,?,?,?,?,?,?,?)').run(uuid(), tenantId, allRoomsGroupId, dow, '18:00', '18:30', 'recurring', 'very_late', 1);
    }
  } catch(e) { console.warn('[v2.4.1] Room groups seed skipped:', e.message); }

  console.log('[v2.3.0] ✓ Rostering enhancement seed data complete');
}
