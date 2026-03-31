import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Railway mounts persistent volume at /app/data, fallback to local data dir
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? process.env.RAILWAY_VOLUME_MOUNT_PATH
  : path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'childcare360.db');
let db;

export function initDatabase() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(DB_PATH);

    // ─── MIGRATE: add missing children columns ───────────────────────────────
    const childrenAlterCols = [
      ['parent1_name','TEXT'],['parent1_email','TEXT'],['parent1_phone','TEXT'],
      ['parent1_relationship','TEXT DEFAULT \'parent\''],
      ['parent2_name','TEXT'],['parent2_email','TEXT'],['parent2_phone','TEXT'],
      ['centrelink_crn','TEXT'],['medical_notes','TEXT'],['gender','TEXT'],
      ['language','TEXT'],['indigenous','INTEGER DEFAULT 0'],
      ['doctor_name','TEXT'],['doctor_phone','TEXT'],['medicare_number','TEXT'],
      ['enrolled_date','TEXT'],
    ];
    for (const [col, type] of childrenAlterCols) {
      try { db.prepare(`ALTER TABLE children ADD COLUMN ${col} ${type}`).run(); } catch(e) {}
    // ─── Rostering flexibility columns ─────────────────────────────────────────
  const rosterAlterCols = [
    ['lunch_start', 'TEXT'],
    ['is_lunch_cover', 'INTEGER DEFAULT 0'],
  ];
  for (const [col, type] of rosterAlterCols) {
    try { db.prepare(`ALTER TABLE roster_entries ADD COLUMN ${col} ${type}`).run(); } catch(e) {}
  }
  const educatorFlexCols = [
    ['can_start_earlier_mins', 'INTEGER DEFAULT 0'],
    ['can_finish_later_mins', 'INTEGER DEFAULT 0'],
    ['is_lunch_cover', 'INTEGER DEFAULT 0'],
    ['weekly_budget_cents', 'INTEGER DEFAULT 0'],
  ];
  for (const [col, type] of educatorFlexCols) {
    try { db.prepare(`ALTER TABLE educators ADD COLUMN ${col} ${type}`).run(); } catch(e) {}
  }
  try { db.prepare('ALTER TABLE roster_periods ADD COLUMN weekly_budget_cents INTEGER DEFAULT 0').run(); } catch(e) {}

  // Roster templates table
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS roster_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      entries TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();
  } catch(e) {}

    }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, abn TEXT, address TEXT,
      phone TEXT, email TEXT, service_type TEXT DEFAULT 'long_day_care',
      nqs_rating TEXT, timezone TEXT DEFAULT 'Australia/Sydney',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT, name TEXT NOT NULL, phone TEXT,
      auth_provider TEXT DEFAULT 'email', provider_id TEXT,
      mfa_enabled INTEGER DEFAULT 0, mfa_secret TEXT, mfa_method TEXT DEFAULT 'email',
      email_verified INTEGER DEFAULT 0, avatar_url TEXT,
      locked INTEGER DEFAULT 0, failed_attempts INTEGER DEFAULT 0, last_login TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tenant_members (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'educator',
      qualification TEXT, first_aid INTEGER DEFAULT 0,
      wwcc TEXT, wwcc_expiry TEXT, is_under_18 INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1, invited_by TEXT,
      joined_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, tenant_id)
    );
    CREATE TABLE IF NOT EXISTS verification_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code TEXT NOT NULL, type TEXT NOT NULL,
      expires_at TEXT NOT NULL, used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id TEXT REFERENCES tenants(id),
      token_hash TEXT NOT NULL UNIQUE, ip_address TEXT, user_agent TEXT,
      expires_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      email TEXT NOT NULL COLLATE NOCASE,
      role TEXT NOT NULL DEFAULT 'educator',
      invited_by TEXT NOT NULL REFERENCES users(id),
      token TEXT UNIQUE NOT NULL, accepted INTEGER DEFAULT 0,
      expires_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY, user_id TEXT, tenant_id TEXT,
      action TEXT NOT NULL, details TEXT, ip_address TEXT, user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL, age_group TEXT NOT NULL,
      capacity INTEGER DEFAULT 20, current_children INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS age_group_settings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL,
      label TEXT NOT NULL,
      sub TEXT NOT NULL,
      min_months INTEGER NOT NULL DEFAULT 0,
      max_months INTEGER NOT NULL DEFAULT 999,
      ratio INTEGER NOT NULL DEFAULT 10,
      color TEXT NOT NULL DEFAULT '#8B6DAF',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, group_id)
    );
    CREATE TABLE IF NOT EXISTS children (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL, last_name TEXT NOT NULL, dob TEXT NOT NULL,
      room_id TEXT REFERENCES rooms(id),
      allergies TEXT DEFAULT 'None', emergency_contact TEXT,
      enrolled_date TEXT, domains TEXT DEFAULT '{}',
      eylf_progress TEXT DEFAULT '{}', notes TEXT DEFAULT '',
      learning_goals TEXT DEFAULT '[]', photo_url TEXT, active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      educator_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL DEFAULT 'jotting', narrative TEXT NOT NULL,
      domains TEXT DEFAULT '[]', eylf_outcomes TEXT DEFAULT '[]',
      progress_updates TEXT DEFAULT '{}', media TEXT DEFAULT '[]',
      follow_up TEXT DEFAULT '', timestamp TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS daily_plans (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      room_id TEXT NOT NULL REFERENCES rooms(id),
      educator_id TEXT NOT NULL REFERENCES users(id),
      date TEXT NOT NULL, focus_domains TEXT DEFAULT '[]',
      activities TEXT DEFAULT '[]', differentiation TEXT DEFAULT '{}',
      reflections TEXT DEFAULT '{}', notes TEXT DEFAULT '',
      child_count INTEGER DEFAULT 0, status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS clock_records (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL, clock_in TEXT, clock_out TEXT,
      break_start TEXT, break_end TEXT, total_break_mins INTEGER DEFAULT 0,
      date TEXT NOT NULL
    );
    -- roster_entries defined below with enhanced schema

    -- ─── DOCUMENT STORE & COMPLIANCE ────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS child_documents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT,
      file_size INTEGER DEFAULT 0,
      mime_type TEXT,
      uploaded_by TEXT REFERENCES users(id),
      ai_extracted TEXT DEFAULT '{}',
      ai_status TEXT DEFAULT 'pending',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS immunisation_records (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      vaccine_name TEXT NOT NULL,
      dose_number INTEGER DEFAULT 1,
      date_given TEXT,
      batch_number TEXT,
      provider TEXT,
      next_due_date TEXT,
      status TEXT DEFAULT 'current',
      source_doc_id TEXT REFERENCES child_documents(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS medical_plans (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      plan_type TEXT NOT NULL,
      condition_name TEXT NOT NULL,
      severity TEXT DEFAULT 'moderate',
      triggers TEXT DEFAULT '[]',
      symptoms TEXT DEFAULT '[]',
      action_steps TEXT DEFAULT '[]',
      medications TEXT DEFAULT '[]',
      doctor_name TEXT,
      doctor_phone TEXT,
      hospital_preference TEXT,
      review_date TEXT,
      status TEXT DEFAULT 'current',
      source_doc_id TEXT REFERENCES child_documents(id),
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS medications (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      dosage TEXT,
      frequency TEXT,
      route TEXT DEFAULT 'oral',
      reason TEXT,
      prescriber TEXT,
      pharmacy TEXT,
      expiry_date TEXT,
      quantity_held INTEGER,
      storage TEXT DEFAULT 'room_temperature',
      requires_refrigeration INTEGER DEFAULT 0,
      parent_consent INTEGER DEFAULT 0,
      consent_date TEXT,
      administration_plan TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      source_doc_id TEXT REFERENCES child_documents(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS compliance_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      item_type TEXT NOT NULL,
      item_label TEXT NOT NULL,
      status TEXT DEFAULT 'current',
      expiry_date TEXT,
      days_until_expiry INTEGER,
      related_id TEXT,
      related_table TEXT,
      last_checked TEXT DEFAULT (datetime('now')),
      auto_resolved INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT REFERENCES children(id),
      type TEXT NOT NULL,
      priority TEXT DEFAULT 'normal',
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      recipients TEXT DEFAULT '[]',
      cc TEXT DEFAULT '[]',
      status TEXT DEFAULT 'pending',
      sent_at TEXT,
      error TEXT,
      related_compliance_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS medication_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      medication_id TEXT NOT NULL REFERENCES medications(id),
      administered_by TEXT REFERENCES users(id),
      witnessed_by TEXT REFERENCES users(id),
      dose_given TEXT,
      time_given TEXT NOT NULL,
      notes TEXT DEFAULT '',
      parent_notified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tm_tenant ON tenant_members(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_tm_user ON tenant_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_ch_tenant ON children(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_obs_tenant ON observations(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_obs_child ON observations(child_id);
    CREATE INDEX IF NOT EXISTS idx_dp_tenant ON daily_plans(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_rooms_tenant ON rooms(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_docs_child ON child_documents(child_id);
    CREATE INDEX IF NOT EXISTS idx_docs_tenant ON child_documents(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_imm_child ON immunisation_records(child_id);
    CREATE INDEX IF NOT EXISTS idx_medplan_child ON medical_plans(child_id);
    CREATE INDEX IF NOT EXISTS idx_meds_child ON medications(child_id);
    CREATE INDEX IF NOT EXISTS idx_compliance_child ON compliance_items(child_id);
    CREATE INDEX IF NOT EXISTS idx_compliance_tenant ON compliance_items(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_compliance_status ON compliance_items(status);
    CREATE INDEX IF NOT EXISTS idx_notif_tenant ON notifications(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_medlog_child ON medication_log(child_id);

    CREATE TABLE IF NOT EXISTS parent_contacts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      relationship TEXT DEFAULT 'parent',
      email TEXT,
      phone TEXT,
      is_primary INTEGER DEFAULT 0,
      receives_notifications INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_parents_child ON parent_contacts(child_id);

    CREATE TABLE IF NOT EXISTS educator_room_assignments (
      id TEXT, educator_id TEXT NOT NULL, room_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL, assigned_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY(educator_id, room_id)
    );

    -- ─── INVOICING & CCS ────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS fee_schedules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      room_id TEXT REFERENCES rooms(id),
      name TEXT NOT NULL,
      daily_fee REAL NOT NULL,
      hourly_rate REAL,
      session_hours REAL DEFAULT 11,
      effective_from TEXT,
      effective_to TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ccs_details (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      crn TEXT,
      parent_crn TEXT,
      ccs_percentage REAL DEFAULT 0,
      ccs_hours_fortnight REAL DEFAULT 72,
      annual_cap REAL,
      income_bracket TEXT,
      higher_rate INTEGER DEFAULT 0,
      accs INTEGER DEFAULT 0,
      accs_type TEXT,
      last_synced TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      invoice_number TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      sessions TEXT DEFAULT '[]',
      total_fee REAL DEFAULT 0,
      ccs_amount REAL DEFAULT 0,
      gap_fee REAL DEFAULT 0,
      adjustments REAL DEFAULT 0,
      amount_due REAL DEFAULT 0,
      amount_paid REAL DEFAULT 0,
      status TEXT DEFAULT 'draft',
      due_date TEXT,
      issued_at TEXT,
      paid_at TEXT,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      invoice_id TEXT REFERENCES invoices(id),
      child_id TEXT REFERENCES children(id),
      amount REAL NOT NULL,
      method TEXT DEFAULT 'card',
      reference TEXT,
      status TEXT DEFAULT 'completed',
      payment_date TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT DEFAULT 'card',
      last_four TEXT,
      brand TEXT,
      expiry_month INTEGER,
      expiry_year INTEGER,
      is_default INTEGER DEFAULT 0,
      token TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      sign_in TEXT,
      sign_out TEXT,
      hours REAL,
      absent INTEGER DEFAULT 0,
      absent_reason TEXT,
      fee_charged REAL,
      ccs_applied REAL DEFAULT 0,
      gap REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ─── ENROLMENT APPLICATIONS ─────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS enrolment_applications (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      parent_user_id TEXT REFERENCES users(id),
      status TEXT DEFAULT 'draft',
      child_first_name TEXT,
      child_last_name TEXT,
      child_dob TEXT,
      child_gender TEXT,
      child_indigenous TEXT DEFAULT 'no',
      child_language TEXT DEFAULT 'English',
      child_cultural_needs TEXT,
      child_allergies TEXT DEFAULT 'None',
      child_medical_conditions TEXT,
      child_dietary TEXT DEFAULT 'None',
      child_immunisation_status TEXT DEFAULT 'pending',
      preferred_room TEXT,
      preferred_days TEXT DEFAULT '[]',
      preferred_start_date TEXT,
      parent1_name TEXT,
      parent1_email TEXT,
      parent1_phone TEXT,
      parent1_address TEXT,
      parent1_employer TEXT,
      parent1_work_phone TEXT,
      parent1_crn TEXT,
      parent2_name TEXT,
      parent2_email TEXT,
      parent2_phone TEXT,
      emergency_contact1_name TEXT,
      emergency_contact1_phone TEXT,
      emergency_contact1_relationship TEXT,
      emergency_contact2_name TEXT,
      emergency_contact2_phone TEXT,
      emergency_contact2_relationship TEXT,
      authorised_pickup TEXT DEFAULT '[]',
      authorised_medical_treatment INTEGER DEFAULT 0,
      authorised_ambulance INTEGER DEFAULT 0,
      sunscreen_consent INTEGER DEFAULT 0,
      photo_consent INTEGER DEFAULT 0,
      excursion_consent INTEGER DEFAULT 0,
      doctor_name TEXT,
      doctor_phone TEXT,
      doctor_address TEXT,
      medicare_number TEXT,
      medicare_ref TEXT,
      private_health TEXT,
      family_court_orders INTEGER DEFAULT 0,
      court_order_details TEXT,
      additional_notes TEXT,
      submitted_at TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      review_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_child ON invoices(child_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_ccs_child ON ccs_details(child_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_child ON attendance_sessions(child_id);
    CREATE INDEX IF NOT EXISTS idx_enrolment_tenant ON enrolment_applications(tenant_id);

    -- ═══ PLATFORM-LEVEL TABLES (Owner Portal) ════════════════════════════════
    CREATE TABLE IF NOT EXISTS platform_admins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'owner',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id)
    );
    CREATE TABLE IF NOT EXISTS tenant_subscriptions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      plan TEXT NOT NULL DEFAULT 'trial',
      status TEXT NOT NULL DEFAULT 'active',
      max_children INTEGER DEFAULT 30,
      max_educators INTEGER DEFAULT 15,
      monthly_price_cents INTEGER DEFAULT 0,
      trial_ends_at TEXT,
      billing_email TEXT,
      stripe_customer_id TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      next_billing_at TEXT,
      cancelled_at TEXT,
      UNIQUE(tenant_id)
    );
    CREATE TABLE IF NOT EXISTS tenant_metrics (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      active_children INTEGER DEFAULT 0,
      active_educators INTEGER DEFAULT 0,
      occupancy_pct REAL DEFAULT 0,
      compliance_pct REAL DEFAULT 0,
      revenue_cents INTEGER DEFAULT 0,
      attendance_pct REAL DEFAULT 0,
      incidents INTEGER DEFAULT 0,
      parent_engagement_pct REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, date)
    );
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT REFERENCES children(id),
      type TEXT NOT NULL DEFAULT 'incident',
      severity TEXT NOT NULL DEFAULT 'minor',
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      reported_by TEXT,
      witnessed_by TEXT,
      parent_notified INTEGER DEFAULT 0,
      parent_notified_at TEXT,
      first_aid_given INTEGER DEFAULT 0,
      first_aid_details TEXT,
      doctor_visit INTEGER DEFAULT 0,
      follow_up_required INTEGER DEFAULT 0,
      follow_up_notes TEXT,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS waitlist (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_name TEXT NOT NULL,
      child_dob TEXT,
      parent_name TEXT NOT NULL,
      parent_email TEXT,
      parent_phone TEXT,
      preferred_room TEXT,
      preferred_start TEXT,
      preferred_days TEXT DEFAULT '[]',
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'waiting',
      notes TEXT,
      position INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS staff_wellbeing (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      date TEXT NOT NULL,
      energy_level INTEGER,
      stress_level INTEGER,
      workload_rating INTEGER,
      support_rating INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, date)
    );
    CREATE TABLE IF NOT EXISTS nqs_self_assessment (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      quality_area INTEGER NOT NULL,
      standard TEXT NOT NULL,
      element TEXT,
      current_rating TEXT DEFAULT 'working_towards',
      evidence TEXT,
      improvement_notes TEXT,
      target_date TEXT,
      assessed_by TEXT,
      assessed_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS qip_goals (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      quality_area INTEGER NOT NULL,
      goal TEXT NOT NULL,
      actions TEXT,
      responsible TEXT,
      timeline TEXT,
      progress INTEGER DEFAULT 0,
      status TEXT DEFAULT 'not_started',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_platform_admin ON platform_admins(user_id);
    CREATE INDEX IF NOT EXISTS idx_tenant_sub ON tenant_subscriptions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_tenant_metrics ON tenant_metrics(tenant_id, date);
    CREATE INDEX IF NOT EXISTS idx_incidents_tenant ON incidents(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_waitlist_tenant ON waitlist(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_wellbeing_tenant ON staff_wellbeing(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_nqs_tenant ON nqs_self_assessment(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_qip_tenant ON qip_goals(tenant_id);

    -- ═══ CCS SESSION REPORTS ════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS ccs_session_reports (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      week_starting TEXT NOT NULL,
      session_type TEXT DEFAULT 'standard',
      hours_submitted REAL DEFAULT 0,
      fee_charged_cents INTEGER DEFAULT 0,
      ccs_percentage REAL DEFAULT 0,
      ccs_amount_cents INTEGER DEFAULT 0,
      gap_fee_cents INTEGER DEFAULT 0,
      absent_days INTEGER DEFAULT 0,
      allowable_absences_used INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      submitted_at TEXT,
      response_code TEXT,
      response_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- ═══ PARENT FEEDBACK ════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS parent_feedback (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT REFERENCES children(id),
      parent_name TEXT,
      feedback_type TEXT DEFAULT 'general',
      rating INTEGER,
      message TEXT,
      sentiment_score REAL,
      category TEXT,
      responded INTEGER DEFAULT 0,
      response_text TEXT,
      responded_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ccs_reports_tenant ON ccs_session_reports(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_ccs_reports_child ON ccs_session_reports(child_id);
    CREATE INDEX IF NOT EXISTS idx_parent_feedback_tenant ON parent_feedback(tenant_id);

    -- ═══ ENHANCED EDUCATOR PROFILES ═════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS educators (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id),
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      suburb TEXT,
      postcode TEXT,
      lat REAL,
      lng REAL,
      distance_km REAL,
      qualification TEXT DEFAULT 'cert3',
      wwcc_number TEXT,
      wwcc_expiry TEXT,
      first_aid INTEGER DEFAULT 0,
      first_aid_expiry TEXT,
      cpr_expiry TEXT,
      anaphylaxis_expiry TEXT,
      asthma_expiry TEXT,
      is_under_18 INTEGER DEFAULT 0,
      employment_type TEXT DEFAULT 'permanent',
      salary_type TEXT DEFAULT 'hourly',
      hourly_rate_cents INTEGER DEFAULT 3500,
      annual_salary_cents INTEGER,
      super_rate REAL DEFAULT 11.5,
      leave_balance_hours REAL DEFAULT 0,
      sick_leave_balance_hours REAL DEFAULT 0,
      preferred_rooms TEXT DEFAULT '[]',
      max_hours_per_week REAL DEFAULT 38,
      min_hours_per_week REAL DEFAULT 0,
      contracted_hours REAL DEFAULT 38,
      reliability_score REAL DEFAULT 80,
      total_shifts_offered INTEGER DEFAULT 0,
      total_shifts_accepted INTEGER DEFAULT 0,
      total_sick_days INTEGER DEFAULT 0,
      total_late_arrivals INTEGER DEFAULT 0,
      total_no_shows INTEGER DEFAULT 0,
      avg_response_time_mins INTEGER,
      notes TEXT,
      status TEXT DEFAULT 'active',
      start_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- ═══ EDUCATOR WEEKLY AVAILABILITY ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS educator_availability (
      id TEXT PRIMARY KEY,
      educator_id TEXT NOT NULL REFERENCES educators(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL,
      available INTEGER DEFAULT 1,
      start_time TEXT DEFAULT '06:00',
      end_time TEXT DEFAULT '18:30',
      preferred INTEGER DEFAULT 0,
      notes TEXT,
      UNIQUE(educator_id, day_of_week)
    );

    -- ═══ EDUCATOR ABSENCE LOG ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS educator_absences (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      educator_id TEXT NOT NULL REFERENCES educators(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      type TEXT DEFAULT 'sick',
      reason TEXT,
      notice_given_mins INTEGER,
      notified_via TEXT DEFAULT 'phone',
      approved INTEGER DEFAULT 0,
      approved_by TEXT,
      cover_found INTEGER DEFAULT 0,
      cover_educator_id TEXT REFERENCES educators(id),
      shift_fill_request_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ═══ ROSTER PERIODS ═════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS roster_periods (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      period_type TEXT DEFAULT 'weekly',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      generated_by TEXT DEFAULT 'manual',
      approved_by TEXT,
      approved_at TEXT,
      total_hours REAL DEFAULT 0,
      total_cost_cents INTEGER DEFAULT 0,
      compliance_score REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- ═══ ENHANCED ROSTER ENTRIES ════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS roster_entries (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      period_id TEXT REFERENCES roster_periods(id) ON DELETE CASCADE,
      educator_id TEXT NOT NULL REFERENCES educators(id) ON DELETE CASCADE,
      room_id TEXT REFERENCES rooms(id),
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      break_mins INTEGER DEFAULT 30,
      role TEXT DEFAULT 'educator',
      status TEXT DEFAULT 'scheduled',
      is_cover INTEGER DEFAULT 0,
      original_educator_id TEXT,
      cost_cents INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ═══ SHIFT FILL REQUESTS (Sick Cover) ═══════════════════════════════════════
    CREATE TABLE IF NOT EXISTS shift_fill_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      absence_id TEXT REFERENCES educator_absences(id),
      original_educator_id TEXT NOT NULL REFERENCES educators(id),
      roster_entry_id TEXT REFERENCES roster_entries(id),
      room_id TEXT REFERENCES rooms(id),
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      qualification_required TEXT,
      status TEXT DEFAULT 'open',
      strategy TEXT DEFAULT 'sequential',
      filled_by TEXT REFERENCES educators(id),
      filled_at TEXT,
      ai_initiated INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- ═══ SHIFT FILL ATTEMPTS (AI Agent Contact Log) ═════════════════════════════
    CREATE TABLE IF NOT EXISTS shift_fill_attempts (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES shift_fill_requests(id) ON DELETE CASCADE,
      educator_id TEXT NOT NULL REFERENCES educators(id),
      contact_method TEXT DEFAULT 'sms',
      contacted_at TEXT DEFAULT (datetime('now')),
      response TEXT,
      responded_at TEXT,
      accepted INTEGER,
      decline_reason TEXT,
      response_time_mins INTEGER,
      call_duration_secs INTEGER,
      ai_transcript TEXT,
      status TEXT DEFAULT 'pending'
    );

    -- ═══ AI AGENT CONFIGURATION ═════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS ai_agent_config (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      agent_type TEXT DEFAULT 'sick_cover',
      enabled INTEGER DEFAULT 1,
      contact_strategy TEXT DEFAULT 'sequential',
      send_sms_first INTEGER DEFAULT 1,
      sms_wait_mins INTEGER DEFAULT 10,
      call_wait_mins INTEGER DEFAULT 15,
      max_attempts_per_educator INTEGER DEFAULT 2,
      simultaneous_contacts INTEGER DEFAULT 1,
      priority_order TEXT DEFAULT 'reliability_desc',
      sms_template TEXT DEFAULT 'Hi {name}, a shift has become available at {centre} on {date} from {start} to {end} in the {room} room. Are you available to cover? Reply YES or NO.',
      call_script_guidance TEXT DEFAULT 'Greet the educator warmly. Explain that a shift needs covering due to staff absence. Provide the date, time, and room details. Ask if they are available. If yes, confirm the details. If no, thank them and end the call.',
      voice_engine TEXT DEFAULT 'none',
      voice_engine_api_key TEXT,
      voice_engine_endpoint TEXT,
      voice_id TEXT,
      sms_provider TEXT DEFAULT 'none',
      sms_api_key TEXT,
      sms_from_number TEXT,
      webhook_url TEXT,
      middleware_endpoint TEXT,
      working_hours_start TEXT DEFAULT '05:00',
      working_hours_end TEXT DEFAULT '21:00',
      exclude_days TEXT DEFAULT '[]',
      auto_approve_fill INTEGER DEFAULT 0,
      notify_manager_on_fill INTEGER DEFAULT 1,
      notify_manager_on_fail INTEGER DEFAULT 1,
      manager_phone TEXT,
      manager_email TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, agent_type)
    );

    -- ═══ ROSTER CHANGE PROPOSALS ════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS roster_change_proposals (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      trigger_type TEXT NOT NULL,
      trigger_detail TEXT,
      description TEXT NOT NULL,
      options TEXT DEFAULT '[]',
      selected_option INTEGER,
      status TEXT DEFAULT 'pending',
      proposed_at TEXT DEFAULT (datetime('now')),
      resolved_by TEXT,
      resolved_at TEXT,
      affected_educators TEXT DEFAULT '[]',
      notifications_sent INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_educators_tenant ON educators(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_educator_avail ON educator_availability(educator_id);
    CREATE INDEX IF NOT EXISTS idx_absences_tenant ON educator_absences(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_absences_date ON educator_absences(date);
    CREATE INDEX IF NOT EXISTS idx_roster_period ON roster_entries(period_id);
    CREATE INDEX IF NOT EXISTS idx_roster_date ON roster_entries(date);
    CREATE INDEX IF NOT EXISTS idx_roster_educator ON roster_entries(educator_id);
    CREATE INDEX IF NOT EXISTS idx_fill_req_tenant ON shift_fill_requests(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_fill_attempts ON shift_fill_attempts(request_id);
    CREATE INDEX IF NOT EXISTS idx_change_proposals ON roster_change_proposals(tenant_id, status);
  `);

  // ═══ v1.8.0 MIGRATIONS ══════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS educator_documents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      educator_id TEXT NOT NULL REFERENCES educators(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      document_type TEXT,
      label TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      mime_type TEXT,
      storage_path TEXT,
      expiry_date TEXT,
      uploaded_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS leave_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      educator_id TEXT NOT NULL REFERENCES educators(id) ON DELETE CASCADE,
      leave_type TEXT NOT NULL DEFAULT 'annual',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days_requested REAL DEFAULT 1,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      approved_by TEXT REFERENCES users(id),
      approved_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS child_dietary (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'allergy',
      description TEXT NOT NULL,
      severity TEXT DEFAULT 'moderate',
      action_required TEXT,
      notified_kitchen INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS child_permissions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      permission_type TEXT NOT NULL,
      granted INTEGER DEFAULT 0,
      granted_by TEXT,
      granted_at TEXT,
      notes TEXT,
      expiry_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS authorised_pickups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      relationship TEXT,
      phone TEXT,
      photo_url TEXT,
      id_verified INTEGER DEFAULT 0,
      notes TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS parental_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      category TEXT NOT NULL DEFAULT 'other',
      request TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      acknowledged_by TEXT REFERENCES users(id),
      acknowledged_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS child_event_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      description TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS daily_updates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      educator_id TEXT REFERENCES educators(id),
      update_date TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      sleep_start TEXT,
      sleep_end TEXT,
      sleep_checks TEXT DEFAULT '[]',
      meal_type TEXT,
      ate_amount TEXT,
      food_details TEXT,
      diaper_type TEXT,
      notes TEXT,
      photo_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS excursions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      destination TEXT NOT NULL,
      excursion_date TEXT NOT NULL,
      departure_time TEXT,
      return_time TEXT,
      transport_method TEXT DEFAULT 'walking',
      risk_assessment_url TEXT,
      max_children INTEGER,
      min_educators INTEGER DEFAULT 1,
      status TEXT DEFAULT 'planning',
      permission_note_html TEXT,
      permission_deadline TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS excursion_children (
      id TEXT PRIMARY KEY,
      excursion_id TEXT NOT NULL REFERENCES excursions(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL,
      permission_status TEXT DEFAULT 'pending',
      permission_method TEXT DEFAULT 'portal',
      permission_granted_by TEXT,
      permission_granted_at TEXT,
      permission_token TEXT UNIQUE,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS excursion_educators (
      id TEXT PRIMARY KEY,
      excursion_id TEXT NOT NULL REFERENCES excursions(id) ON DELETE CASCADE,
      educator_id TEXT NOT NULL REFERENCES educators(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL,
      role TEXT DEFAULT 'educator',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT REFERENCES children(id),
      from_user_id TEXT REFERENCES users(id),
      from_name TEXT,
      from_type TEXT DEFAULT 'staff',
      to_type TEXT DEFAULT 'family',
      subject TEXT,
      body TEXT NOT NULL,
      read_at TEXT,
      parent_email TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ed_docs_educator ON educator_documents(educator_id);
    CREATE INDEX IF NOT EXISTS idx_leave_educator ON leave_requests(educator_id);
    CREATE INDEX IF NOT EXISTS idx_dietary_child ON child_dietary(child_id);
    CREATE INDEX IF NOT EXISTS idx_perms_child ON child_permissions(child_id);
    CREATE INDEX IF NOT EXISTS idx_pickups_child ON authorised_pickups(child_id);
    CREATE INDEX IF NOT EXISTS idx_eventlog_child ON child_event_log(child_id);
    CREATE INDEX IF NOT EXISTS idx_dailyup_child ON daily_updates(child_id);
    CREATE INDEX IF NOT EXISTS idx_dailyup_date ON daily_updates(update_date);
    CREATE INDEX IF NOT EXISTS idx_excursions_tenant ON excursions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_exc_children ON excursion_children(excursion_id);
    CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_messages_child ON messages(child_id);
    CREATE TABLE IF NOT EXISTS notification_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      trigger_type TEXT NOT NULL,
      channel TEXT DEFAULT 'email',
      subject TEXT,
      body_html TEXT NOT NULL DEFAULT '',
      days_before INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notif_tmpl_tenant ON notification_templates(tenant_id);
  `);
  // v1.8.0 ALTER TABLE additions (SQLite requires try/catch)
  const alters = [
    'ALTER TABLE educators ADD COLUMN photo_url TEXT',
    'ALTER TABLE educators ADD COLUMN tax_file_number TEXT',
    'ALTER TABLE educators ADD COLUMN bank_bsb TEXT',
    'ALTER TABLE educators ADD COLUMN bank_account TEXT',
    'ALTER TABLE educators ADD COLUMN bank_account_name TEXT',
    'ALTER TABLE educators ADD COLUMN super_fund_name TEXT',
    'ALTER TABLE educators ADD COLUMN super_fund_usi TEXT',
    'ALTER TABLE educators ADD COLUMN super_member_number TEXT',
    'ALTER TABLE educators ADD COLUMN google_place_id TEXT',
    'ALTER TABLE educators ADD COLUMN travel_time_mins INTEGER',
    'ALTER TABLE educators ADD COLUMN travel_time_updated_at TEXT',
    'ALTER TABLE educators ADD COLUMN can_start_earlier_mins INTEGER DEFAULT 0',
    'ALTER TABLE educators ADD COLUMN can_finish_later_mins INTEGER DEFAULT 0',
    'ALTER TABLE educators ADD COLUMN is_lunch_cover INTEGER DEFAULT 0',
    'ALTER TABLE children ADD COLUMN crn TEXT',
    'ALTER TABLE children ADD COLUMN parent_crn TEXT',
    'ALTER TABLE children ADD COLUMN ccs_percentage REAL DEFAULT 0',
    'ALTER TABLE children ADD COLUMN gender TEXT',
    'ALTER TABLE children ADD COLUMN indigenous TEXT DEFAULT \'no\'',
    'ALTER TABLE children ADD COLUMN language TEXT DEFAULT \'English\'',
    'ALTER TABLE children ADD COLUMN doctor_name TEXT',
    'ALTER TABLE children ADD COLUMN doctor_phone TEXT',
    'ALTER TABLE children ADD COLUMN medicare_number TEXT',
    'ALTER TABLE notifications ADD COLUMN channel TEXT DEFAULT \'in_app\'',
    'ALTER TABLE notifications ADD COLUMN trigger_type TEXT',
    'ALTER TABLE notifications ADD COLUMN user_id TEXT',
    'ALTER TABLE notifications ADD COLUMN recipient_name TEXT',
    'ALTER TABLE notifications ADD COLUMN message TEXT',
    'ALTER TABLE notifications ADD COLUMN read_at TEXT',
    'ALTER TABLE notifications ADD COLUMN title TEXT',
    'ALTER TABLE ai_agent_config ADD COLUMN manager_user_id TEXT',
    'ALTER TABLE roster_entries ADD COLUMN lunch_start TEXT',
    'ALTER TABLE roster_entries ADD COLUMN is_lunch_cover INTEGER DEFAULT 0',
    // v1.9.0 columns
    'ALTER TABLE roster_entries ADD COLUMN lunch_end TEXT',
    'ALTER TABLE roster_entries ADD COLUMN lunch_cover_educator_id TEXT',
    'ALTER TABLE child_dietary ADD COLUMN is_anaphylactic INTEGER DEFAULT 0',
    'ALTER TABLE child_dietary ADD COLUMN risk_minimisation_plan_url TEXT',
    'ALTER TABLE child_dietary ADD COLUMN risk_minimisation_plan_date TEXT',
    'ALTER TABLE child_dietary ADD COLUMN medical_communication_plan_url TEXT',
    'ALTER TABLE child_dietary ADD COLUMN medical_communication_plan_date TEXT',
    'ALTER TABLE children ADD COLUMN photo_url TEXT',
    'ALTER TABLE children ADD COLUMN preferred_name TEXT',
    'ALTER TABLE children ADD COLUMN cultural_background TEXT',
    'ALTER TABLE children ADD COLUMN home_language TEXT',
    'ALTER TABLE educators ADD COLUMN hourly_rate_dollars REAL DEFAULT 0',
    'ALTER TABLE educators ADD COLUMN dob TEXT',
    'ALTER TABLE educators ADD COLUMN role_title TEXT',
    'ALTER TABLE educators ADD COLUMN is_responsible_person INTEGER DEFAULT 0',
    'ALTER TABLE educators ADD COLUMN food_safety_supervisor INTEGER DEFAULT 0',
    'ALTER TABLE educators ADD COLUMN child_protection_date TEXT',
    'ALTER TABLE educators ADD COLUMN child_protection_expiry TEXT',
    'ALTER TABLE educators ADD COLUMN anaphylaxis_expiry TEXT',
    'ALTER TABLE educators ADD COLUMN asthma_expiry TEXT',
  ];
  alters.forEach(sql => { try { db.exec(sql); } catch(e) {} });

  // v1.9.0 new tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS equipment_register (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      category TEXT NOT NULL DEFAULT 'medication',
      name TEXT NOT NULL,
      description TEXT,
      location TEXT,
      quantity INTEGER DEFAULT 1,
      expiry_date TEXT,
      batch_number TEXT,
      supplier TEXT,
      child_id TEXT REFERENCES children(id),
      requires_prescription INTEGER DEFAULT 0,
      storage_instructions TEXT,
      disposal_instructions TEXT,
      last_checked_date TEXT,
      last_checked_by TEXT REFERENCES users(id),
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_equip_tenant ON equipment_register(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_equip_child ON equipment_register(child_id);
    CREATE INDEX IF NOT EXISTS idx_equip_expiry ON equipment_register(expiry_date);
    CREATE TABLE IF NOT EXISTS lunch_cover_sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      roster_entry_id TEXT REFERENCES roster_entries(id) ON DELETE CASCADE,
      cover_educator_id TEXT REFERENCES educators(id),
      room_id TEXT REFERENCES rooms(id),
      date TEXT NOT NULL,
      cover_start TEXT NOT NULL,
      cover_end TEXT NOT NULL,
      status TEXT DEFAULT 'scheduled',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_lunch_date ON lunch_cover_sessions(date);
    CREATE TABLE IF NOT EXISTS educator_notes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      educator_id TEXT REFERENCES educators(id),
      educator_name TEXT,
      note_date TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      content TEXT NOT NULL,
      visible_to_parents INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ed_notes_child ON educator_notes(child_id);
    CREATE TABLE IF NOT EXISTS parent_messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT REFERENCES children(id),
      from_type TEXT DEFAULT 'centre',
      from_user_id TEXT REFERENCES users(id),
      from_name TEXT,
      to_parent_email TEXT,
      subject TEXT,
      body TEXT NOT NULL,
      message_type TEXT DEFAULT 'general',
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pmsg_child ON parent_messages(child_id);
    CREATE INDEX IF NOT EXISTS idx_pmsg_tenant ON parent_messages(tenant_id);
  `);
;

  // v1.9.1 Learning Journey tables
  try { initLearningTables(db); } catch(e) { console.log('Learning tables:', e.message); }


  // v1.9.7 Voice / AI Agent tables
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS voice_settings (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
        twilio_account_sid TEXT,
        twilio_auth_token TEXT,
        twilio_phone_number TEXT,
        tts_provider TEXT DEFAULT 'twilio',
        tts_voice TEXT DEFAULT 'alice',
        ai_persona TEXT DEFAULT 'You are a friendly assistant for a childcare centre. Be warm, concise, and professional.',
        inbound_greeting TEXT DEFAULT 'Hello, thank you for calling. How can I help you today?',
        outbound_greeting TEXT DEFAULT 'Hello, this is an automated call from your childcare centre.',
        active INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS voice_calls (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        call_sid TEXT UNIQUE,
        direction TEXT NOT NULL DEFAULT 'outbound',
        status TEXT DEFAULT 'initiated',
        from_number TEXT,
        to_number TEXT,
        purpose TEXT,
        context_type TEXT,
        context_id TEXT,
        duration_seconds INTEGER DEFAULT 0,
        recording_url TEXT,
        recording_sid TEXT,
        transcript TEXT DEFAULT '[]',
        outcome TEXT,
        initiated_by TEXT REFERENCES users(id),
        started_at TEXT DEFAULT (datetime('now')),
        ended_at TEXT,
        error_message TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_calls_tenant ON voice_calls(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_calls_sid ON voice_calls(call_sid);
      CREATE INDEX IF NOT EXISTS idx_calls_context ON voice_calls(context_type, context_id);

      CREATE TABLE IF NOT EXISTS voice_call_turns (
        id TEXT PRIMARY KEY,
        call_id TEXT NOT NULL REFERENCES voice_calls(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence REAL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_turns_call ON voice_call_turns(call_id);
    `);
  } catch(e) { console.log('Voice tables:', e.message); }

  // Seed demo data if fresh DB
  seedDemoData(db);
  console.log('  ✓ Database initialised:', DB_PATH);
  return db;
}

function seedDemoData(db) {
  const existing = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (existing.c > 0) return;

  console.log('  → Seeding demo data...');
  db.pragma('foreign_keys = OFF');
  // bcryptjs hashSync for demo password
  const hash = bcrypt.hashSync('Childcare3602024!', 12);
  const tenantId = 'demo-tenant-001';
  const adminId = 'demo-admin-001';

  db.prepare('INSERT INTO tenants (id,name,abn,address,phone,email,service_type) VALUES(?,?,?,?,?,?,?)')
    .run(tenantId, 'Sunshine Early Learning Centre', '12 345 678 901', '42 Ocean St, Cronulla NSW 2230', '02 9544 1234', 'admin@sunshinelc.com.au', 'long_day_care');

  db.prepare('INSERT INTO users (id,email,password_hash,name,phone,auth_provider,email_verified) VALUES(?,?,?,?,?,?,1)')
    .run(adminId, 'admin@sunshinelc.com.au', hash, 'Centre Admin', '0412 345 678', 'email');

  db.prepare('INSERT INTO tenant_members (id,user_id,tenant_id,role,qualification,first_aid) VALUES(?,?,?,?,?,?)')
    .run(randomUUID(), adminId, tenantId, 'admin', 'Diploma of Early Childhood', 1);

  const rooms = [
    { id: 'room-joeys', name: 'Joeys (Nursery)', age: '0-2', cap: 8 },
    { id: 'room-possums', name: 'Possums (Toddlers)', age: '2-3', cap: 12 },
    { id: 'room-koalas', name: 'Koalas (Pre-K)', age: '3-4', cap: 16 },
    { id: 'room-kookas', name: 'Kookaburras (Kindy)', age: '4-5', cap: 20 },
  ];
  rooms.forEach(r => db.prepare('INSERT INTO rooms (id,tenant_id,name,age_group,capacity) VALUES(?,?,?,?,?)').run(r.id, tenantId, r.name, r.age, r.cap));

  const kids = [
    { fn:'Olivia', ln:'Chen', dob:'2023-03-15', room:'room-possums', allergies:'Peanuts — ANAPHYLAXIS', p1:'Wei Chen', p1e:'wei.chen@email.com', p1p:'0412 111 001', p2:'Sarah Chen', p2e:'sarah.chen@email.com' },
    { fn:'Liam', ln:'Patel', dob:'2024-01-20', room:'room-joeys', allergies:'None', p1:'Raj Patel', p1e:'raj.patel@email.com', p1p:'0412 111 002', p2:'Priya Patel', p2e:'priya.patel@email.com' },
    { fn:'Isla', ln:'Thompson', dob:'2022-08-10', room:'room-koalas', allergies:'Egg allergy', p1:'Mark Thompson', p1e:'mark.t@email.com', p1p:'0412 111 003' },
    { fn:'Noah', ln:'Williams', dob:'2021-11-22', room:'room-kookas', allergies:'Asthma', p1:'Kate Williams', p1e:'kate.w@email.com', p1p:'0412 111 004', p2:'James Williams', p2e:'james.w@email.com' },
    { fn:'Ava', ln:'Nguyen', dob:'2023-06-05', room:'room-possums', allergies:'Dairy intolerance', p1:'Minh Nguyen', p1e:'minh.n@email.com', p1p:'0412 111 005' },
    { fn:'Ethan', ln:'Brown', dob:'2022-12-01', room:'room-koalas', allergies:'None', p1:'Lisa Brown', p1e:'lisa.brown@email.com', p1p:'0412 111 006' },
    { fn:'Mia', ln:'Garcia', dob:'2024-04-18', room:'room-joeys', allergies:'None', p1:'Maria Garcia', p1e:'maria.g@email.com', p1p:'0412 111 007' },
    { fn:'Jack', ln:'OBrien', dob:'2021-07-30', room:'room-kookas', allergies:'Bee sting allergy', p1:'Fiona OBrien', p1e:'fiona.ob@email.com', p1p:'0412 111 008' },
  ];
  const childIds = [];
  kids.forEach(k => {
    const cid = randomUUID();
    childIds.push(cid);
    db.prepare('INSERT INTO children (id,tenant_id,first_name,last_name,dob,room_id,allergies,enrolled_date) VALUES(?,?,?,?,?,?,?,?)')
      .run(cid, tenantId, k.fn, k.ln, k.dob, k.room, k.allergies, '2024-01-15');
    db.prepare('INSERT INTO parent_contacts (id,tenant_id,child_id,name,relationship,email,phone,is_primary,receives_notifications) VALUES(?,?,?,?,?,?,?,1,1)')
      .run(randomUUID(), tenantId, cid, k.p1, 'parent', k.p1e, k.p1p);
    if (k.p2) {
      db.prepare('INSERT INTO parent_contacts (id,tenant_id,child_id,name,relationship,email,phone,is_primary,receives_notifications) VALUES(?,?,?,?,?,?,?,0,1)')
        .run(randomUUID(), tenantId, cid, k.p2, 'parent', k.p2e, null);
    }
  });

  console.log('  ✓ Demo: 1 tenant, 1 admin, 4 rooms, 8 children seeded');
  console.log('  ✓ Login: admin@sunshinelc.com.au / Childcare3602024!');

  // ── Platform Owner ──
  const ownerId = 'platform-owner-001';
  db.prepare('INSERT INTO users (id,email,password_hash,name,phone,auth_provider,email_verified) VALUES(?,?,?,?,?,?,1)')
    .run(ownerId, 'owner@childcare360.com.au', hash, 'Platform Owner', '0400 000 001', 'email');
  db.prepare('INSERT INTO platform_admins (id,user_id,role) VALUES(?,?,?)').run(randomUUID(), ownerId, 'owner');
  console.log('  ✓ Owner login: owner@childcare360.com.au / Childcare3602024!');

  // ── Additional demo tenants for owner portal ──
  const tenants2 = [
    { id:'demo-tenant-002', name:'Little Explorers Preschool', abn:'23 456 789 012', addr:'15 Park Rd, Hurstville NSW 2220', phone:'02 9580 5678', email:'admin@littleexplorers.com.au', type:'preschool' },
    { id:'demo-tenant-003', name:'Tiny Tots Family Day Care', abn:'34 567 890 123', addr:'8 Elm St, Miranda NSW 2228', phone:'02 9525 9012', email:'admin@tinytots.com.au', type:'family_day_care' },
    { id:'demo-tenant-004', name:'Harbour Kids OSHC', abn:'45 678 901 234', addr:'22 Bay St, Rockdale NSW 2216', phone:'02 9567 3456', email:'admin@harbourkids.com.au', type:'oshc' },
    { id:'demo-tenant-005', name:'Rainbow Valley Early Learning', abn:'56 789 012 345', addr:'100 Pacific Hwy, Roseville NSW 2069', phone:'02 9416 7890', email:'admin@rainbowvalley.com.au', type:'long_day_care' },
  ];
  tenants2.forEach(t => {
    db.prepare('INSERT INTO tenants (id,name,abn,address,phone,email,service_type) VALUES(?,?,?,?,?,?,?)').run(t.id,t.name,t.abn,t.addr,t.phone,t.email,t.type);
  });

  // ── Subscriptions for all tenants ──
  const plans = [
    { tid:'demo-tenant-001', plan:'professional', price:14900, kids:60, eds:25 },
    { tid:'demo-tenant-002', plan:'starter', price:7900, kids:30, eds:12 },
    { tid:'demo-tenant-003', plan:'trial', price:0, kids:15, eds:6 },
    { tid:'demo-tenant-004', plan:'professional', price:14900, kids:80, eds:30 },
    { tid:'demo-tenant-005', plan:'enterprise', price:29900, kids:120, eds:50 },
  ];
  plans.forEach(p => {
    db.prepare('INSERT INTO tenant_subscriptions (id,tenant_id,plan,status,max_children,max_educators,monthly_price_cents,trial_ends_at,started_at,next_billing_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(), p.tid, p.plan, p.plan==='trial'?'trial':'active', p.kids, p.eds, p.price,
        p.plan==='trial'?'2026-03-18':null, '2025-06-01', '2026-03-01');
  });

  // ── Demo metrics (last 30 days) for each tenant ──
  const now = new Date();
  [tenantId, ...tenants2.map(t=>t.id)].forEach((tid,ti) => {
    const baseKids = [32,18,8,45,72][ti];
    const baseEds = [12,7,3,16,28][ti];
    for (let d = 29; d >= 0; d--) {
      const dt = new Date(now); dt.setDate(dt.getDate() - d);
      if (dt.getDay()===0||dt.getDay()===6) continue; // skip weekends
      const ds = dt.toISOString().split('T')[0];
      const jitter = () => Math.round((Math.random()-0.5)*4);
      const kids = Math.max(0,baseKids+jitter());
      const occ = Math.min(100, Math.round((kids/((baseKids*1.3)||1))*100));
      db.prepare('INSERT OR IGNORE INTO tenant_metrics (id,tenant_id,date,active_children,active_educators,occupancy_pct,compliance_pct,revenue_cents,attendance_pct,incidents,parent_engagement_pct) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(randomUUID(), tid, ds, kids, Math.max(0,baseEds+jitter()), occ,
          85+Math.round(Math.random()*15), kids*12500+Math.round(Math.random()*50000),
          75+Math.round(Math.random()*20), Math.random()>0.85?1:0, 60+Math.round(Math.random()*35));
    }
  });

  // ── Demo waitlist entries ──
  const wl = [
    { tid:tenantId, cn:'Sophie Anderson', dob:'2024-09-12', pn:'Emma Anderson', pe:'emma.a@email.com', pp:'0412 222 001', room:'room-joeys', pri:'high' },
    { tid:tenantId, cn:'Leo Martinez', dob:'2023-05-20', pn:'Carlos Martinez', pe:'carlos.m@email.com', pp:'0412 222 002', room:'room-possums', pri:'normal' },
    { tid:tenantId, cn:'Zara Ali', dob:'2024-02-08', pn:'Fatima Ali', pe:'fatima.a@email.com', pp:'0412 222 003', room:'room-joeys', pri:'normal' },
    { tid:'demo-tenant-002', cn:'Chloe Park', dob:'2023-11-30', pn:'Ji-hyun Park', pe:'jihyun@email.com', pp:'0412 222 004', room:null, pri:'high' },
  ];
  wl.forEach((w,i) => {
    db.prepare('INSERT INTO waitlist (id,tenant_id,child_name,child_dob,parent_name,parent_email,parent_phone,preferred_room,priority,position,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(), w.tid, w.cn, w.dob, w.pn, w.pe, w.pp, w.room, w.pri, i+1, 'waiting');
  });

  // ── Demo incidents ──
  const incidents = [
    { tid:tenantId, type:'incident', sev:'minor', title:'Minor bump on playground', desc:'Child bumped head on slide. Ice applied. Parents notified.', loc:'Outdoor playground', fa:1 },
    { tid:tenantId, type:'near_miss', sev:'moderate', title:'Unsecured gate noticed', desc:'Back gate found ajar during outdoor play. Secured immediately. No children exited.', loc:'Back garden gate', fa:0 },
    { tid:'demo-tenant-002', type:'incident', sev:'minor', title:'Allergic reaction — mild rash', desc:'Child developed mild rash after morning tea. Antihistamine administered per action plan.', loc:'Possum room', fa:1 },
  ];
  incidents.forEach(inc => {
    db.prepare('INSERT INTO incidents (id,tenant_id,type,severity,title,description,location,first_aid_given,status) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(), inc.tid, inc.type, inc.sev, inc.title, inc.desc, inc.loc, inc.fa?1:0, 'closed');
  });

  // ── Demo staff wellbeing check-ins ──
  const wellbeingData = [
    { tid:'demo-tenant-001', uid:adminId, date:'2026-02-17', energy:7, stress:4, workload:5, support:8, notes:'Good week overall' },
    { tid:'demo-tenant-001', uid:adminId, date:'2026-02-10', energy:6, stress:6, workload:7, support:7, notes:'Understaffed on Monday' },
    { tid:'demo-tenant-001', uid:adminId, date:'2026-02-03', energy:8, stress:3, workload:5, support:9, notes:'Great support from management' },
    { tid:'demo-tenant-002', uid:ownerId, date:'2026-02-17', energy:5, stress:7, workload:8, support:5, notes:'Ratio pressure with absences' },
    { tid:'demo-tenant-002', uid:ownerId, date:'2026-02-10', energy:4, stress:8, workload:9, support:4, notes:'Feeling overwhelmed this week' },
    { tid:'demo-tenant-003', uid:ownerId, date:'2026-02-17', energy:7, stress:3, workload:4, support:8, notes:'Small group, manageable' },
    { tid:'demo-tenant-004', uid:ownerId, date:'2026-02-17', energy:6, stress:5, workload:6, support:7, notes:'' },
    { tid:'demo-tenant-004', uid:ownerId, date:'2026-02-10', energy:7, stress:4, workload:5, support:8, notes:'After-school rush is hectic but ok' },
    { tid:'demo-tenant-004', uid:ownerId, date:'2026-02-03', energy:5, stress:7, workload:8, support:5, notes:'Need more casual staff' },
    { tid:'demo-tenant-005', uid:ownerId, date:'2026-02-17', energy:8, stress:3, workload:4, support:9, notes:'Well staffed, great team' },
    { tid:'demo-tenant-005', uid:ownerId, date:'2026-02-10', energy:7, stress:4, workload:5, support:8, notes:'' },
    { tid:'demo-tenant-005', uid:ownerId, date:'2026-02-03', energy:9, stress:2, workload:3, support:9, notes:'Best week this term' },
  ];
  wellbeingData.forEach(w => {
    db.prepare('INSERT OR IGNORE INTO staff_wellbeing (id,tenant_id,user_id,date,energy_level,stress_level,workload_rating,support_rating,notes) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(), w.tid, w.uid, w.date, w.energy, w.stress, w.workload, w.support, w.notes);
  });

  console.log('  ✓ Platform: 5 tenants, subscriptions, 30-day metrics, waitlist, incidents, wellbeing seeded');

  // ── More incidents for trend analysis (spread across tenants, times, types) ──
  const moreIncidents = [
    { tid:tenantId, type:'incident', sev:'minor', title:'Finger caught in door', desc:'Child caught finger in bathroom door. Cold compress applied.', loc:'Bathroom', fa:1, dt:'2026-02-01' },
    { tid:tenantId, type:'incident', sev:'minor', title:'Tripped on outdoor equipment', desc:'Child tripped on balance beam. Grazed knee cleaned.', loc:'Outdoor playground', fa:1, dt:'2026-02-03' },
    { tid:tenantId, type:'incident', sev:'moderate', title:'Allergic reaction at morning tea', desc:'Hives appeared after morning tea. Antihistamine given per action plan.', loc:'Dining area', fa:1, dt:'2026-02-05' },
    { tid:tenantId, type:'near_miss', sev:'minor', title:'Cleaning product left accessible', desc:'Cleaning spray left on low shelf. Removed immediately.', loc:'Craft room', fa:0, dt:'2026-02-07' },
    { tid:tenantId, type:'incident', sev:'minor', title:'Bitten by another child', desc:'Child bitten on arm during play. Ice applied, both families notified.', loc:'Indoor play area', fa:1, dt:'2026-02-10' },
    { tid:tenantId, type:'incident', sev:'minor', title:'Bump on head from block', desc:'Child hit by falling block tower. No visible injury, monitored.', loc:'Block corner', fa:0, dt:'2026-02-12' },
    { tid:'demo-tenant-002', type:'incident', sev:'minor', title:'Scraped knee on concrete', desc:'Child fell running on concrete. Cleaned and bandaged.', loc:'Outdoor courtyard', fa:1, dt:'2026-02-02' },
    { tid:'demo-tenant-002', type:'incident', sev:'moderate', title:'Asthma episode during sport', desc:'Child had asthma attack during outdoor play. Ventolin administered per plan.', loc:'Outdoor playground', fa:1, dt:'2026-02-08' },
    { tid:'demo-tenant-002', type:'near_miss', sev:'moderate', title:'Child almost left unattended', desc:'Educator-child ratio briefly exceeded during transition. Rectified within 2 minutes.', loc:'Transition area', fa:0, dt:'2026-02-14' },
    { tid:'demo-tenant-004', type:'incident', sev:'minor', title:'Splinter from wooden equipment', desc:'Child got splinter from climbing frame. Removed and antiseptic applied.', loc:'Outdoor playground', fa:1, dt:'2026-02-04' },
    { tid:'demo-tenant-004', type:'incident', sev:'minor', title:'Pushed by peer at afternoon tea', desc:'Child pushed off chair. No injury, behaviour guidance provided.', loc:'Dining area', fa:0, dt:'2026-02-09' },
    { tid:'demo-tenant-004', type:'hazard', sev:'minor', title:'Broken swing seat discovered', desc:'Cracked swing seat found during morning check. Equipment isolated.', loc:'Outdoor playground', fa:0, dt:'2026-02-11' },
    { tid:'demo-tenant-005', type:'incident', sev:'minor', title:'Sand thrown in eyes', desc:'Child had sand thrown in eyes by peer. Eyes flushed with water.', loc:'Sandpit', fa:1, dt:'2026-02-06' },
    { tid:'demo-tenant-005', type:'incident', sev:'moderate', title:'Febrile convulsion', desc:'Child experienced febrile convulsion. Ambulance called, parents notified immediately.', loc:'Sleep room', fa:1, dt:'2026-02-13' },
    { tid:'demo-tenant-005', type:'near_miss', sev:'minor', title:'Medication almost given to wrong child', desc:'Educator caught medication error before administration. Process reviewed.', loc:'Office', fa:0, dt:'2026-02-15' },
    { tid:tenantId, type:'incident', sev:'minor', title:'Cut lip from fall', desc:'Child fell and cut lip on toy. Cold compress applied.', loc:'Indoor play area', fa:1, dt:'2026-01-20' },
    { tid:tenantId, type:'incident', sev:'minor', title:'Sunburn noticed at pickup', desc:'Mild sunburn on shoulders despite sunscreen. Hat policy reviewed.', loc:'Outdoor playground', fa:0, dt:'2026-01-25' },
    { tid:'demo-tenant-004', type:'incident', sev:'minor', title:'Twisted ankle during games', desc:'Child twisted ankle during group game. Ice applied, rested.', loc:'Hall', fa:1, dt:'2026-01-28' },
  ];
  moreIncidents.forEach(inc => {
    db.prepare('INSERT INTO incidents (id,tenant_id,type,severity,title,description,location,first_aid_given,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(), inc.tid, inc.type, inc.sev, inc.title, inc.desc, inc.loc, inc.fa?1:0, 'closed', inc.dt+'T10:00:00Z');
  });

  // ── NQS Self-Assessments for demo tenant ──
  const nqsAssessments = [
    { qa:1, std:'1.1', el:'1.1.1', rating:'meeting', evidence:'Approved learning framework guides curriculum. Regular programming cycle documented.', notes:'' },
    { qa:1, std:'1.1', el:'1.1.2', rating:'meeting', evidence:'Educators respond to children interests observed in play. Weekly reflections documented.', notes:'' },
    { qa:1, std:'1.1', el:'1.1.3', rating:'exceeding', evidence:'All age groups catered for with age-appropriate programs. EYLF V2.0 outcomes mapped.', notes:'' },
    { qa:1, std:'1.2', el:'1.2.1', rating:'meeting', evidence:'Educators facilitate and extend learning through intentional teaching strategies.', notes:'Working towards embedding critical reflection in daily practice' },
    { qa:1, std:'1.2', el:'1.2.2', rating:'working_towards', evidence:'Responsive to children but documentation could be stronger.', notes:'Target: improve observation-to-planning links' },
    { qa:2, std:'2.1', el:'2.1.1', rating:'meeting', evidence:'Wellbeing embedded in daily routine. Children show sense of belonging.', notes:'' },
    { qa:2, std:'2.1', el:'2.1.2', rating:'meeting', evidence:'Health practices promoted including handwashing, nutrition education.', notes:'' },
    { qa:2, std:'2.2', el:'2.2.1', rating:'exceeding', evidence:'Comprehensive safety procedures. All risk assessments current. NQF ratios always met.', notes:'' },
    { qa:3, std:'3.1', el:'3.1.1', rating:'meeting', evidence:'Environment supports learning and development. Outdoor area well-resourced.', notes:'' },
    { qa:3, std:'3.2', el:'3.2.1', rating:'working_towards', evidence:'Some resources need updating. Budget allocated for next quarter.', notes:'Target: refresh indoor learning materials by April' },
    { qa:4, std:'4.1', el:'4.1.1', rating:'meeting', evidence:'All staff meet qualification requirements. ECT employed.', notes:'' },
    { qa:4, std:'4.2', el:'4.2.1', rating:'exceeding', evidence:'Strong professional development culture. Regular team meetings and peer observations.', notes:'' },
    { qa:5, std:'5.1', el:'5.1.1', rating:'meeting', evidence:'Respectful relationships between educators and children observed.', notes:'' },
    { qa:5, std:'5.2', el:'5.2.1', rating:'meeting', evidence:'Children supported to collaborate and learn from each other.', notes:'' },
    { qa:6, std:'6.1', el:'6.1.1', rating:'exceeding', evidence:'Strong family partnerships. Regular parent evenings, portfolio sharing, daily app updates.', notes:'' },
    { qa:6, std:'6.2', el:'6.2.1', rating:'meeting', evidence:'Community partnerships with local library, fire station visits, Aboriginal elder visits.', notes:'' },
    { qa:7, std:'7.1', el:'7.1.1', rating:'meeting', evidence:'Governance structures clear. Policies reviewed annually.', notes:'' },
    { qa:7, std:'7.1', el:'7.1.2', rating:'meeting', evidence:'Management systems support day-to-day operations effectively.', notes:'' },
    { qa:7, std:'7.2', el:'7.2.1', rating:'working_towards', evidence:'QIP exists but needs more rigorous review process.', notes:'This is what we are building!' },
  ];
  nqsAssessments.forEach(a => {
    db.prepare('INSERT INTO nqs_self_assessment (id,tenant_id,quality_area,standard,element,current_rating,evidence,improvement_notes,assessed_by) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(), tenantId, a.qa, a.std, a.el, a.rating, a.evidence, a.notes, 'Demo Director');
  });

  // ── QIP Goals ──
  const qipGoals = [
    { qa:1, goal:'Strengthen observation-to-planning documentation cycle', actions:'1. Train all educators on EYLF observation templates\\n2. Implement weekly peer review of observations\\n3. Link observations to forward planning in Childcare360', responsible:'Educational Leader', timeline:'March 2026', progress:40, status:'in_progress' },
    { qa:3, goal:'Refresh indoor learning materials and environments', actions:'1. Audit current resources against EYLF outcomes\\n2. Purchase new materials ($2,500 budget)\\n3. Redesign creative arts corner', responsible:'Room Leaders', timeline:'April 2026', progress:20, status:'in_progress' },
    { qa:7, goal:'Establish quarterly QIP review process', actions:'1. Schedule quarterly QIP review meetings\\n2. Involve families in review process\\n3. Document evidence of continuous improvement', responsible:'Director', timeline:'June 2026', progress:10, status:'not_started' },
    { qa:2, goal:'Enhance outdoor risk-benefit assessment practices', actions:'1. Review current risk assessments\\n2. Implement daily safety checklists\\n3. Train staff on risk-benefit approach', responsible:'WHS Officer', timeline:'February 2026', progress:75, status:'in_progress' },
    { qa:6, goal:'Increase Aboriginal and Torres Strait Islander perspectives', actions:'1. Engage local Aboriginal community elder\\n2. Include Aboriginal perspectives in programming\\n3. Celebrate significant cultural dates', responsible:'Educational Leader', timeline:'Ongoing', progress:30, status:'in_progress' },
  ];
  qipGoals.forEach(g => {
    db.prepare('INSERT INTO qip_goals (id,tenant_id,quality_area,goal,actions,responsible,timeline,progress,status) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(), tenantId, g.qa, g.goal, g.actions, g.responsible, g.timeline, g.progress, g.status);
  });

  // ── CCS Session Reports (demo data) ──
  const ccsReports = [
    { tid:tenantId, cid:childIds[0], week:'2026-02-10', hrs:40, fee:42000, pct:72, ccs:30240, gap:11760, abs:0, status:'submitted' },
    { tid:tenantId, cid:childIds[1], week:'2026-02-10', hrs:24, fee:25200, pct:85, ccs:21420, gap:3780, abs:1, status:'submitted' },
    { tid:tenantId, cid:childIds[2], week:'2026-02-10', hrs:40, fee:42000, pct:50, ccs:21000, gap:21000, abs:0, status:'submitted' },
    { tid:tenantId, cid:childIds[0], week:'2026-02-03', hrs:40, fee:42000, pct:72, ccs:30240, gap:11760, abs:0, status:'approved' },
    { tid:tenantId, cid:childIds[1], week:'2026-02-03', hrs:24, fee:25200, pct:85, ccs:21420, gap:3780, abs:0, status:'approved' },
    { tid:tenantId, cid:childIds[0], week:'2026-01-27', hrs:32, fee:33600, pct:72, ccs:24192, gap:9408, abs:1, status:'approved' },
  ];
  ccsReports.forEach(r => {
    db.prepare('INSERT INTO ccs_session_reports (id,tenant_id,child_id,week_starting,hours_submitted,fee_charged_cents,ccs_percentage,ccs_amount_cents,gap_fee_cents,absent_days,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(), r.tid, r.cid, r.week, r.hrs, r.fee, r.pct, r.ccs, r.gap, r.abs, r.status);
  });

  // ── Parent Feedback (for sentiment analysis) ──
  const parentFeedback = [
    { tid:tenantId, pn:'Sarah Johnson', type:'compliment', rating:5, msg:'The educators are amazing! My daughter loves coming here every day. The learning stories are wonderful.', sent:0.92, cat:'staff_quality' },
    { tid:tenantId, pn:'Michael Chen', type:'suggestion', rating:4, msg:'Would be great to have more outdoor nature play. Otherwise very happy with the care.', sent:0.65, cat:'program' },
    { tid:tenantId, pn:'Emma Wilson', type:'concern', rating:3, msg:'My son came home with paint on his clothes again. Can the smocks be used more consistently?', sent:0.25, cat:'operations' },
    { tid:tenantId, pn:'David Thompson', type:'compliment', rating:5, msg:'Thank you for the detailed daily reports. I feel so connected to my child\'s day.', sent:0.88, cat:'communication' },
    { tid:tenantId, pn:'Lisa Nguyen', type:'concern', rating:2, msg:'The pickup process is quite slow. Sometimes waiting 10+ minutes for my child to be brought out.', sent:-0.35, cat:'operations' },
    { tid:tenantId, pn:'James Brown', type:'compliment', rating:5, msg:'Absolutely wonderful centre. Both my children have thrived here. Staff are so caring.', sent:0.95, cat:'staff_quality' },
    { tid:tenantId, pn:'Rachel Kim', type:'suggestion', rating:4, msg:'Could we get more notice about themed dress-up days? Sometimes find out too late.', sent:0.4, cat:'communication' },
    { tid:'demo-tenant-002', pn:'Amanda Scott', type:'compliment', rating:5, msg:'The preschool program is excellent. My daughter is so ready for school now.', sent:0.9, cat:'program' },
    { tid:'demo-tenant-002', pn:'Peter Walsh', type:'concern', rating:2, msg:'Invoicing is confusing. Hard to understand the CCS calculations.', sent:-0.5, cat:'billing' },
    { tid:'demo-tenant-004', pn:'Samantha Lee', type:'compliment', rating:4, msg:'OSHC has been great for after school. Kids enjoy the activities.', sent:0.75, cat:'program' },
    { tid:'demo-tenant-004', pn:'Robert Clarke', type:'concern', rating:3, msg:'Homework time could be better structured. My son needs more support.', sent:0.1, cat:'program' },
    { tid:'demo-tenant-005', pn:'Catherine Hughes', type:'compliment', rating:5, msg:'Five stars! The best centre we have been to. Amazing team.', sent:0.97, cat:'staff_quality' },
    { tid:'demo-tenant-005', pn:'Mark Taylor', type:'suggestion', rating:4, msg:'Love the app updates but would appreciate more photos during the day.', sent:0.55, cat:'communication' },
    { tid:'demo-tenant-005', pn:'Jennifer Adams', type:'compliment', rating:5, msg:'The EYLF learning portfolios are incredible. Such detailed observations.', sent:0.91, cat:'program' },
  ];
  parentFeedback.forEach(f => {
    db.prepare('INSERT INTO parent_feedback (id,tenant_id,parent_name,feedback_type,rating,message,sentiment_score,category) VALUES(?,?,?,?,?,?,?,?)')
      .run(randomUUID(), f.tid, f.pn, f.type, f.rating, f.msg, f.sent, f.cat);
  });

  // ── Educators with comprehensive profiles ──
  const eds = [
    { fn:'Sarah', ln:'Mitchell', email:'sarah.m@sunshinelc.com.au', phone:'0412 345 678', addr:'12 Beach Rd, Cronulla', suburb:'Cronulla', post:'2230', qual:'ect', emp:'permanent', rate:4200, salary:87360, hrs:38, dist:1.2, rel:95, sick:2, late:0, noshow:0, offered:45, accepted:43, fa:1, faExp:'2027-06-15', cpr:'2026-12-01', wwcc:'WWC0012345', wwccExp:'2026-06-15', rooms:'["room-joeys","room-koalas"]', start:'2023-01-15' },
    { fn:'James', ln:'Chen', email:'james.c@sunshinelc.com.au', phone:'0423 456 789', addr:'5 Kingsway, Miranda', suburb:'Miranda', post:'2228', qual:'diploma', emp:'permanent', rate:3800, salary:79040, hrs:38, dist:4.5, rel:88, sick:5, late:2, noshow:0, offered:40, accepted:35, fa:1, faExp:'2026-08-20', cpr:'2026-08-20', wwcc:'WWC0012346', wwccExp:'2026-03-20', rooms:'["room-joeys","room-possums"]', start:'2023-06-01' },
    { fn:'Emily', ln:'Watson', email:'emily.w@sunshinelc.com.au', phone:'0434 567 890', addr:'88 The Esplanade, Cronulla', suburb:'Cronulla', post:'2230', qual:'diploma', emp:'permanent', rate:3800, salary:79040, hrs:38, dist:0.8, rel:92, sick:3, late:1, noshow:0, offered:38, accepted:35, fa:1, faExp:'2026-03-01', cpr:'2026-03-01', wwcc:'WWC0012347', wwccExp:'2025-12-01', rooms:'["room-possums","room-koalas"]', start:'2022-02-01' },
    { fn:'Priya', ln:'Sharma', email:'priya.s@sunshinelc.com.au', phone:'0445 678 901', addr:'22 Railway Pde, Sutherland', suburb:'Sutherland', post:'2232', qual:'cert3', emp:'permanent', rate:3200, salary:66560, hrs:38, dist:6.0, rel:85, sick:4, late:3, noshow:1, offered:50, accepted:40, fa:1, faExp:'2027-01-10', cpr:'2027-01-10', wwcc:'WWC0012348', wwccExp:'2026-08-10', rooms:'["room-joeys","room-possums"]', start:'2024-01-10' },
    { fn:'Tom', ln:'Bradley', email:'tom.b@sunshinelc.com.au', phone:'0456 789 012', addr:'14 Oak St, Engadine', suburb:'Engadine', post:'2233', qual:'cert3', emp:'casual', rate:3500, salary:null, hrs:25, dist:9.5, rel:72, sick:6, late:4, noshow:2, offered:60, accepted:38, fa:0, faExp:null, cpr:null, wwcc:'WWC0012349', wwccExp:'2026-01-30', rooms:'["room-possums","room-koalas","room-kookas"]', start:'2024-06-01' },
    { fn:'Mei', ln:'Lin', email:'mei.l@sunshinelc.com.au', phone:'0467 890 123', addr:'7 Surf Lane, Woolooware', suburb:'Woolooware', post:'2230', qual:'ect', emp:'permanent', rate:4200, salary:87360, hrs:38, dist:1.8, rel:97, sick:1, late:0, noshow:0, offered:30, accepted:30, fa:1, faExp:'2027-08-28', cpr:'2027-02-28', wwcc:'WWC0012350', wwccExp:'2027-02-28', rooms:'["room-koalas"]', start:'2022-08-15' },
    { fn:'Alex', ln:'Nguyen', email:'alex.n@sunshinelc.com.au', phone:'0478 901 234', addr:'3 School Pde, Gymea', suburb:'Gymea', post:'2227', qual:'working_towards', emp:'casual', rate:2900, salary:null, hrs:20, dist:5.2, rel:65, sick:8, late:5, noshow:3, offered:35, accepted:18, fa:1, faExp:'2026-11-15', cpr:'2026-11-15', wwcc:'WWC0012351', wwccExp:'2026-05-15', rooms:'["room-kookas"]', start:'2025-01-20', u18:1 },
    { fn:'Rachel', ln:'Foster', email:'rachel.f@sunshinelc.com.au', phone:'0489 012 345', addr:'45 President Ave, Caringbah', suburb:'Caringbah', post:'2229', qual:'cert3', emp:'part_time', rate:3200, salary:null, hrs:30, dist:3.1, rel:90, sick:2, late:1, noshow:0, offered:28, accepted:25, fa:1, faExp:'2027-05-20', cpr:'2027-05-20', wwcc:'WWC0012352', wwccExp:'2026-11-20', rooms:'["room-joeys","room-possums","room-koalas"]', start:'2023-11-01' },
    { fn:'Liam', ln:'O\'Brien', email:'liam.o@sunshinelc.com.au', phone:'0490 123 456', addr:'9 Cook St, Kurnell', suburb:'Kurnell', post:'2231', qual:'diploma', emp:'casual', rate:3800, salary:null, hrs:15, dist:7.8, rel:78, sick:3, late:2, noshow:1, offered:25, accepted:18, fa:1, faExp:'2026-09-01', cpr:'2026-09-01', wwcc:'WWC0012353', wwccExp:'2027-03-15', rooms:'["room-joeys","room-possums","room-koalas","room-kookas"]', start:'2024-09-01' },
    { fn:'Sophie', ln:'Martinez', email:'sophie.m@sunshinelc.com.au', phone:'0401 234 567', addr:'28 Ewos Pde, Cronulla', suburb:'Cronulla', post:'2230', qual:'cert3', emp:'casual', rate:3200, salary:null, hrs:20, dist:0.5, rel:82, sick:4, late:2, noshow:0, offered:30, accepted:24, fa:0, faExp:null, cpr:null, wwcc:'WWC0012354', wwccExp:'2027-01-10', rooms:'["room-possums","room-koalas"]', start:'2025-03-01' },
  ];
  const edIds = [];
  eds.forEach(e => {
    const eid = randomUUID();
    edIds.push(eid);
    db.prepare(`INSERT INTO educators (id,tenant_id,first_name,last_name,email,phone,address,suburb,postcode,
      qualification,employment_type,hourly_rate_cents,annual_salary_cents,max_hours_per_week,distance_km,
      reliability_score,total_sick_days,total_late_arrivals,total_no_shows,total_shifts_offered,total_shifts_accepted,
      first_aid,first_aid_expiry,cpr_expiry,wwcc_number,wwcc_expiry,preferred_rooms,start_date,is_under_18,status) VALUES(${new Array(30).fill('?').join(',')})`)
      .run(eid, tenantId, e.fn, e.ln, e.email, e.phone, e.addr, e.suburb, e.post,
        e.qual, e.emp, e.rate, e.salary, e.hrs, e.dist,
        e.rel, e.sick, e.late, e.noshow, e.offered, e.accepted,
        e.fa?1:0, e.faExp, e.cpr, e.wwcc, e.wwccExp, e.rooms, e.start, e.u18?1:0, 'active');
  });

  // ── Educator availability (weekly patterns) ──
  edIds.forEach((eid, idx) => {
    const patterns = [
      [1,1,1,1,1,0,0], // Mon-Fri permanent
      [1,1,1,1,1,0,0],
      [1,1,1,1,1,0,0],
      [1,1,1,1,1,0,0],
      [1,0,1,0,1,0,0], // casual M/W/F
      [1,1,1,1,1,0,0],
      [0,1,0,1,0,1,0], // casual T/Th/Sat
      [1,1,1,1,0,0,0], // part-time M-Th
      [0,0,1,1,1,0,0], // casual W-F
      [1,1,0,0,1,1,0], // casual M/T/F/Sa
    ];
    const starts = ['06:00','06:30','07:00','06:00','07:30','06:00','08:00','06:30','07:00','07:00'];
    const ends = ['18:30','18:00','16:00','18:30','17:00','18:30','15:00','17:30','18:00','16:30'];
    const pat = patterns[idx] || [1,1,1,1,1,0,0];
    for (let d = 0; d < 7; d++) {
      db.prepare('INSERT OR IGNORE INTO educator_availability (id,educator_id,day_of_week,available,start_time,end_time,preferred) VALUES(?,?,?,?,?,?,?)')
        .run(randomUUID(), eid, d, pat[d], starts[idx]||'06:00', ends[idx]||'18:30', d < 5 ? 1 : 0);
    }
  });

  // ── Recent absences ──
  const absences = [
    { eid:4, date:'2026-02-17', type:'sick', reason:'Gastro', notice:30, via:'sms', cover:1, coverEid:8 },
    { eid:6, date:'2026-02-14', type:'sick', reason:'Flu', notice:60, via:'phone', cover:1, coverEid:4 },
    { eid:1, date:'2026-02-10', type:'personal', reason:'Family emergency', notice:120, via:'phone', cover:1, coverEid:0 },
    { eid:4, date:'2026-02-03', type:'sick', reason:'Migraine', notice:15, via:'sms', cover:0 },
    { eid:6, date:'2026-01-27', type:'no_show', reason:'No contact', notice:0, via:'none', cover:0 },
  ];
  absences.forEach(a => {
    db.prepare('INSERT INTO educator_absences (id,tenant_id,educator_id,date,type,reason,notice_given_mins,notified_via,approved,cover_found,cover_educator_id) VALUES(?,?,?,?,?,?,?,?,1,?,?)')
      .run(randomUUID(), tenantId, edIds[a.eid], a.date, a.type, a.reason, a.notice, a.via, a.cover?1:0, a.coverEid!=null?edIds[a.coverEid]:null);
  });

  // ── AI Agent Config ──
  db.prepare(`INSERT INTO ai_agent_config (id,tenant_id,agent_type,enabled,contact_strategy,send_sms_first,sms_wait_mins,call_wait_mins,
    max_attempts_per_educator,simultaneous_contacts,priority_order,sms_template,call_script_guidance,
    voice_engine,sms_provider,working_hours_start,working_hours_end,auto_approve_fill,notify_manager_on_fill,notify_manager_on_fail,
    manager_phone,manager_email) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(randomUUID(), tenantId, 'sick_cover', 1, 'sequential', 1, 10, 15, 2, 1, 'reliability_desc',
      'Hi {name}, a shift has become available at {centre} on {date} from {start} to {end} in the {room} room. Are you available to cover? Reply YES or NO.',
      'Greet the educator by name. Explain a shift needs covering due to a colleague being unwell. Provide the date, time, room, and age group. Ask if they are available. If yes, confirm details and let them know the roster manager will be in touch. If no, thank them warmly. Keep the tone friendly and professional.',
      'none', 'none', '05:00', '21:00', 0, 1, 1, '0400 000 001', 'admin@sunshinelc.com.au');

  // ── Demo roster period with entries ──
  const periodId = randomUUID();
  db.prepare('INSERT OR IGNORE INTO roster_periods (id,tenant_id,period_type,start_date,end_date,status,generated_by,total_hours,total_cost_cents,compliance_score) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(periodId, tenantId, 'weekly', '2026-02-23', '2026-03-01', 'draft', 'ai', 280, 980000, 96);

  const rosterDays = ['2026-02-23','2026-02-24','2026-02-25','2026-02-26','2026-02-27'];
  const roomIds = ['room-joeys','room-possums','room-koalas','room-kookas'];
  const rosterAssignments = [
    // Mon
    { day:0, eid:0, room:0, s:'06:30', e:'15:00' }, { day:0, eid:2, room:0, s:'09:00', e:'18:00' },
    { day:0, eid:1, room:1, s:'07:00', e:'15:30' }, { day:0, eid:3, room:1, s:'09:30', e:'18:30' },
    { day:0, eid:5, room:2, s:'06:00', e:'14:30' }, { day:0, eid:7, room:2, s:'10:00', e:'18:30' },
    // Tue
    { day:1, eid:0, room:0, s:'06:30', e:'15:00' }, { day:1, eid:3, room:0, s:'09:00', e:'18:00' },
    { day:1, eid:1, room:1, s:'07:00', e:'15:30' }, { day:1, eid:2, room:1, s:'09:30', e:'18:30' },
    { day:1, eid:5, room:2, s:'06:00', e:'14:30' }, { day:1, eid:7, room:2, s:'10:00', e:'18:00' },
    // Wed
    { day:2, eid:5, room:0, s:'06:00', e:'14:30' }, { day:2, eid:2, room:0, s:'09:00', e:'18:00' },
    { day:2, eid:0, room:1, s:'06:30', e:'15:00' }, { day:2, eid:3, room:1, s:'09:30', e:'18:30' },
    { day:2, eid:1, room:2, s:'07:00', e:'15:30' }, { day:2, eid:7, room:2, s:'10:00', e:'18:00' },
    // Thu
    { day:3, eid:0, room:0, s:'06:30', e:'15:00' }, { day:3, eid:1, room:0, s:'09:00', e:'18:00' },
    { day:3, eid:5, room:1, s:'06:00', e:'14:30' }, { day:3, eid:3, room:1, s:'09:30', e:'18:30' },
    { day:3, eid:2, room:2, s:'07:00', e:'15:30' }, { day:3, eid:7, room:2, s:'10:00', e:'18:00' },
    // Fri
    { day:4, eid:0, room:0, s:'06:30', e:'15:00' }, { day:4, eid:3, room:0, s:'09:00', e:'18:00' },
    { day:4, eid:1, room:1, s:'07:00', e:'15:30' }, { day:4, eid:2, room:1, s:'09:30', e:'18:30' },
    { day:4, eid:5, room:2, s:'06:00', e:'14:30' }, { day:4, eid:8, room:2, s:'09:00', e:'18:00' },
  ];
  rosterAssignments.forEach(ra => {
    const hrs = ((parseInt(ra.e.split(':')[0])*60+parseInt(ra.e.split(':')[1])) - (parseInt(ra.s.split(':')[0])*60+parseInt(ra.s.split(':')[1])) - 30) / 60;
    const cost = Math.round(hrs * (eds[ra.eid]?.rate || 3500));
    try { db.prepare('INSERT OR IGNORE INTO roster_entries (id,tenant_id,period_id,educator_id,room_id,date,start_time,end_time,break_mins,cost_cents) VALUES(?,?,?,?,?,?,?,?,30,?)')
      .run(randomUUID(), tenantId, periodId, edIds[ra.eid], roomIds[ra.room], rosterDays[ra.day], ra.s, ra.e, cost); } catch(e) {}
  });

  // ── v1.8.0 seed: child permissions ──
  const defaultPerms = ['photo_social_media','photo_centre_use','panadol','sunscreen','walking_excursion','swimming','media'];
  childIds.slice(0,4).forEach(cid => {
    defaultPerms.forEach(pt => {
      try { db.prepare('INSERT INTO child_permissions (id,tenant_id,child_id,permission_type,granted,granted_by,granted_at) VALUES(?,?,?,?,1,?,datetime(\'now\'))').run(randomUUID(), tenantId, cid, pt, 'Parent'); } catch(e) {}
    });
  });
  // ── v1.8.0 seed: authorised pickups ──
  const pickupData2 = [
    { cid: childIds[0], name:'Wei Chen', rel:'Father', phone:'0412 111 001' },
    { cid: childIds[0], name:'Grandma Chen', rel:'Grandmother', phone:'0412 999 001' },
    { cid: childIds[1], name:'Raj Patel', rel:'Father', phone:'0412 111 002' },
    { cid: childIds[2], name:'Mark Thompson', rel:'Father', phone:'0412 111 003' },
    { cid: childIds[3], name:'Kate Williams', rel:'Mother', phone:'0412 111 004' },
  ];
  pickupData2.forEach(p => {
    try { db.prepare('INSERT INTO authorised_pickups (id,tenant_id,child_id,name,relationship,phone,id_verified,active) VALUES(?,?,?,?,?,?,1,1)').run(randomUUID(), tenantId, p.cid, p.name, p.rel, p.phone); } catch(e) {}
  });
  // ── v1.8.0 seed: excursion ──
  const excId = randomUUID();
  try {
    db.prepare('INSERT INTO excursions (id,tenant_id,title,description,destination,excursion_date,departure_time,return_time,transport_method,max_children,min_educators,status,permission_deadline) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(excId, tenantId, 'Cronulla Aquatic Centre Visit', 'Swimming excursion for Kookaburras room', 'Cronulla Aquatic Centre, Elouera Rd, Cronulla NSW 2230', '2026-03-15', '09:30', '12:30', 'bus', 15, 3, 'permission_sent', '2026-03-10');
    childIds.slice(0,3).forEach(cid => {
      db.prepare('INSERT INTO excursion_children (id,excursion_id,child_id,tenant_id,permission_status,permission_token) VALUES(?,?,?,?,?,?)').run(randomUUID(), excId, cid, tenantId, 'pending', randomUUID());
    });
  } catch(e) {}
  console.log('  ✓ v1.8.0: permissions, pickups, excursion seeded');
  // ── v1.9.2: Waitlist, Live Updates, Med Register, Invoicing seed ─────────────
  try {
    const kids = db.prepare("SELECT id,first_name,last_name,room_id,dob FROM children WHERE tenant_id=? AND active=1 ORDER BY rowid").all('demo-tenant-001');
    if (!kids.length) throw new Error('no kids');
    const tenantId = 'demo-tenant-001';
    const adminId  = 'demo-admin-001';
    const today    = new Date().toISOString().slice(0,10);
    const d = (n) => { const dt=new Date(); dt.setDate(dt.getDate()+n); return dt.toISOString().slice(0,10); };

    // ── WAITLIST (richer entries) ──────────────────────────────────────────────
    const waitlistExtra = [
      { cn:'Amelia Nguyen',     dob:'2024-08-22', pn:'Thi Nguyen',       pe:'thi.nguyen@email.com',     pp:'0412 333 101', room:'room-joeys',    days:['Monday','Wednesday','Friday'], pri:'high',   status:'waiting',   notes:'Sibling discount applicable — older sibling Noah already enrolled', start:d(30) },
      { cn:'Hugo Schmidt',      dob:'2023-04-11', pn:'Klaus Schmidt',     pe:'k.schmidt@email.com',      pp:'0412 333 102', room:'room-possums',  days:['Tuesday','Thursday'],          pri:'normal', status:'waiting',   notes:'Family relocating from Germany, flexible start date', start:d(45) },
      { cn:'Priya Sharma',      dob:'2024-01-30', pn:'Deepa Sharma',      pe:'deepa.s@email.com',        pp:'0412 333 103', room:'room-joeys',    days:['Monday','Tuesday','Wednesday','Thursday','Friday'], pri:'urgent', status:'waiting', notes:'Single parent, needs full-time care ASAP', start:d(7) },
      { cn:'Felix OConnor',     dob:'2022-10-05', pn:'Brigid OConnor',    pe:'brigid.oc@email.com',      pp:'0412 333 104', room:'room-koalas',   days:['Monday','Wednesday'],          pri:'normal', status:'contacted', notes:'Toured centre on 15 Feb — very interested. Following up this week', start:d(60) },
      { cn:'Mele Taufa',        dob:'2023-09-19', pn:'Siosaia Taufa',     pe:'siosaia.t@email.com',      pp:'0412 333 105', room:'room-possums',  days:['Monday','Tuesday','Thursday'], pri:'normal', status:'waiting',   notes:'Pacific Islander family, requested Pasifika cultural inclusion', start:d(30) },
      { cn:'Isabelle Laroche',  dob:'2024-03-07', pn:'Camille Laroche',   pe:'camille.l@email.com',      pp:'0412 333 106', room:'room-joeys',    days:['Wednesday','Friday'],          pri:'normal', status:'waiting',   notes:'French-speaking family', start:d(50) },
      { cn:'Ryan Kowalski',     dob:'2022-07-14', pn:'Marek Kowalski',    pe:'marek.k@email.com',        pp:'0412 333 107', room:'room-koalas',   days:['Monday','Tuesday','Wednesday'], pri:'low',   status:'offered',   notes:'Offered Thursday spot — waiting on family response', start:d(14) },
      { cn:'Lily-Mae Tran',     dob:'2021-12-01', pn:'Mai Tran',          pe:'mai.tran@email.com',       pp:'0412 333 108', room:'room-kookas',   days:['Monday','Wednesday','Friday'], pri:'normal', status:'waiting',   notes:'Kindy transition — needs full-day care', start:d(21) },
    ];
    waitlistExtra.forEach((w,i) => {
      try {
        db.prepare('INSERT OR IGNORE INTO waitlist (id,tenant_id,child_name,child_dob,parent_name,parent_email,parent_phone,preferred_room,preferred_days,preferred_start,priority,status,notes,position,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime("now",?))')
          .run(randomUUID(),tenantId,w.cn,w.dob,w.pn,w.pe,w.pp,w.room,JSON.stringify(w.days),w.start,w.pri,w.status,w.notes,i+4,`-${i+1} days`);
      } catch(e){}
    });

    // ── DAILY LIVE UPDATES (today + last 3 days for each child) ───────────────
    const meals = ['morning_tea','lunch','afternoon_tea'];
    const ateAmounts = ['all','most','half','little','none'];
    const diaperTypes = ['wet','dirty','dry'];
    const mealDetails = [
      ['Weetbix with milk and banana','Chicken pasta with veggies','Apple slices and cheese'],
      ['Toast with Vegemite','Lamb and veg casserole','Yoghurt and fruit'],
      ['Fruit salad','Spaghetti bolognaise','Rice crackers and hummus'],
      ['Porridge with honey','Beef stir-fry with rice','Carrot and celery sticks'],
    ];
    kids.forEach((kid, ki) => {
      for (let dayOffset = 0; dayOffset <= 3; dayOffset++) {
        const dt = new Date(); dt.setDate(dt.getDate()-dayOffset);
        if (dt.getDay()===0||dt.getDay()===6) continue;
        const updateDate = dt.toISOString().slice(0,10);
        const menu = mealDetails[ki % mealDetails.length];

        // Sleep
        try {
          db.prepare('INSERT OR IGNORE INTO daily_updates (id,tenant_id,child_id,educator_id,update_date,category,sleep_start,sleep_end,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,datetime("now",?))')
            .run(randomUUID(),tenantId,kid.id,null,updateDate,'sleep',
              `${11+ki%2}:${ki%2===0?'00':'30'}`, `${12+ki%3}:${ki%3===0?'00':'30'}`,
              dayOffset===0?'Settled well after gentle back rub':'Slept soundly',
              `-${dayOffset} days`);
        } catch(e){}

        // Meals
        meals.forEach((meal,mi) => {
          try {
            db.prepare('INSERT OR IGNORE INTO daily_updates (id,tenant_id,child_id,educator_id,update_date,category,meal_type,ate_amount,food_details,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,datetime("now",?))')
              .run(randomUUID(),tenantId,kid.id,null,updateDate,'food',meal,
                ateAmounts[(ki+mi+dayOffset)%ateAmounts.length],
                menu[mi]||menu[0],
                ateAmounts[(ki+mi+dayOffset)%ateAmounts.length]==='all'?'Great appetite today!':
                ateAmounts[(ki+mi+dayOffset)%ateAmounts.length]==='none'?'Not feeling hungry, had extra water':'Ate well overall',
                `-${dayOffset} days`);
          } catch(e){}
        });

        // Nappy/diaper (only younger kids)
        if (['room-joeys','room-possums'].includes(kid.room_id)) {
          for (let dc=0; dc<2+ki%2; dc++) {
            try {
              db.prepare('INSERT OR IGNORE INTO daily_updates (id,tenant_id,child_id,educator_id,update_date,category,diaper_type,notes,created_at) VALUES(?,?,?,?,?,?,?,?,datetime("now",?))')
                .run(randomUUID(),tenantId,kid.id,null,updateDate,'nappy',
                  diaperTypes[(ki+dc)%diaperTypes.length],
                  'Normal, no concerns',
                  `-${dayOffset*24+dc} hours`);
            } catch(e){}
          }
        }

        // Activity note
        const activities = [
          'Engaged enthusiastically in sand play, demonstrating fine motor skills and creativity',
          'Participated in group storytime — asked thoughtful questions about characters',
          'Built an elaborate block tower, exploring concepts of balance and height',
          'Joined in Ramadan celebration activities, showed curiosity and respect',
          'Completed a puzzle independently, showing persistence and problem-solving',
          'Painted with watercolours, experimenting with colour mixing',
          'Practised counting during morning circle — correctly identified numerals to 10',
          'Took turns and shared resources during dramatic play',
        ];
        try {
          db.prepare('INSERT OR IGNORE INTO daily_updates (id,tenant_id,child_id,educator_id,update_date,category,notes,created_at) VALUES(?,?,?,?,?,?,?,datetime("now",?))')
            .run(randomUUID(),tenantId,kid.id,null,updateDate,'activity',
              activities[(ki+dayOffset)%activities.length],
              `-${dayOffset} days -1 hour`);
        } catch(e){}
      }
    });

    // ── EQUIPMENT / MED REGISTER ──────────────────────────────────────────────
    const regItems = [
      // Child-specific medications
      { cat:'epipen',     name:'EpiPen Jr — Olivia Chen',       child:kids.find(k=>k.first_name==='Olivia')?.id, qty:2, expiry:d(180), batch:'EP2025-A14', supplier:'Mylan Australia',         rx:1, storage:'Room fridge — red emergency bag', disposal:'Return to pharmacy', notes:'ANAPHYLAXIS action plan on file. Check monthly.',  loc:'Possums room fridge — RED BAG' },
      { cat:'epipen',     name:'EpiPen Jr — Olivia Chen (Spare)',child:kids.find(k=>k.first_name==='Olivia')?.id, qty:1, expiry:d(120), batch:'EP2025-A15', supplier:'Mylan Australia',         rx:1, storage:'Office emergency kit',            disposal:'Return to pharmacy', notes:'Backup — kept in office safe',                       loc:'Office emergency safe' },
      { cat:'medication', name:'Ventolin HFA 100mcg — Noah Williams', child:kids.find(k=>k.first_name==='Noah')?.id, qty:1, expiry:d(365), batch:'VT2025-B22', supplier:'GlaxoSmithKline', rx:1, storage:'Koalas room first aid box',     disposal:'Pharmacy disposal',  notes:'Asthma management plan on file. Blue puffer.', loc:'Kookaburras room first aid' },
      { cat:'medication', name:'Antihistamine — Jack OBrien',    child:kids.find(k=>k.first_name==='Jack')?.id,   qty:1, expiry:d(270), batch:'AH2025-C09', supplier:'Pharmacist supply',       rx:0, storage:'Kookaburras first aid box',    disposal:'Regular bin when expired', notes:'Bee sting allergy — action plan on file', loc:'Kookaburras room first aid' },
      // Shared medications
      { cat:'sunscreen',  name:'SPF 50+ Sunscreen (pump)',        child:null, qty:4, expiry:d(400), batch:'SS2025-D01', supplier:'Cancer Council NSW',  rx:0, storage:'All rooms + outdoor area', disposal:'Regular bin when expired', notes:'Apply before outdoor play. Check all children.', loc:'Each room + outdoor shed' },
      { cat:'sunscreen',  name:'SPF 50+ Sunscreen — Sensitive Skin', child:null, qty:2, expiry:d(380), batch:'SS2025-D02', supplier:'Cancer Council NSW', rx:0, storage:'Office + Nursery', disposal:'Regular bin when expired', notes:'For children with sensitive skin — use instead of standard.', loc:'Office & Joeys room' },
      { cat:'first_aid',  name:'First Aid Kit — Room Joeys',     child:null, qty:1, expiry:d(365), batch:null, supplier:'St John Ambulance',  rx:0, storage:'Joeys room wall cabinet', disposal:'N/A', notes:'Inspect weekly. Restock after every use.', loc:'Joeys room — wall cabinet' },
      { cat:'first_aid',  name:'First Aid Kit — Room Possums',   child:null, qty:1, expiry:d(365), batch:null, supplier:'St John Ambulance',  rx:0, storage:'Possums room shelf',     disposal:'N/A', notes:'Inspect weekly.',                         loc:'Possums room — upper shelf' },
      { cat:'first_aid',  name:'First Aid Kit — Room Koalas',    child:null, qty:1, expiry:d(365), batch:null, supplier:'St John Ambulance',  rx:0, storage:'Koalas room cabinet',    disposal:'N/A', notes:'Inspect weekly.',                         loc:'Koalas room — locked cabinet' },
      { cat:'first_aid',  name:'First Aid Kit — Room Kookaburras', child:null, qty:1, expiry:d(365), batch:null, supplier:'St John Ambulance', rx:0, storage:'Kookaburras room',       disposal:'N/A', notes:'Inspect weekly.',                         loc:'Kookaburras room — shelf' },
      { cat:'first_aid',  name:'Portable First Aid Kit (Excursions)', child:null, qty:1, expiry:d(300), batch:null, supplier:'St John Ambulance', rx:0, storage:'Office — excursion bag', disposal:'N/A', notes:'Check before every excursion.',   loc:'Office — blue excursion bag' },
      { cat:'equipment',  name:'AED Defibrillator',              child:null, qty:1, expiry:d(730), batch:'AED-2023-001', supplier:'Zoll Medical',      rx:0, storage:'Main entrance wall', disposal:'Specialist disposal', notes:'Annual service due June 2026. Pads last checked Feb 2026.', loc:'Main entrance — wall mount' },
      { cat:'equipment',  name:'Nebuliser',                      child:null, qty:1, expiry:null,   batch:null, supplier:'Omron Healthcare', rx:0, storage:'Office',              disposal:'Specialist disposal', notes:'For use with asthma action plans only. Clean after each use.', loc:'Office — locked drawer' },
      { cat:'medication', name:'Paracetamol Suspension 5mg/5ml', child:null, qty:2, expiry:d(200), batch:'PA2025-E11', supplier:'Chemist Warehouse', rx:0, storage:'Office locked medication cabinet', disposal:'Pharmacy', notes:'Parental authorisation required before administration. Do NOT use without signed consent.', loc:'Office — locked med cabinet' },
      { cat:'medication', name:'Ibuprofen Suspension',           child:null, qty:1, expiry:d(150), batch:'IB2025-E12', supplier:'Chemist Warehouse', rx:0, storage:'Office locked medication cabinet', disposal:'Pharmacy', notes:'Parental authorisation required. Check for contraindications.', loc:'Office — locked med cabinet' },
      // About to expire — to trigger warning
      { cat:'epipen',     name:'EpiPen Jr — Ava Nguyen',          child:kids.find(k=>k.first_name==='Ava')?.id,   qty:1, expiry:d(14),  batch:'EP2025-F01', supplier:'Mylan Australia', rx:1, storage:'Possums room fridge', disposal:'Return to pharmacy', notes:'⚠️ EXPIRING SOON — order replacement immediately', loc:'Possums room fridge' },
    ];
    regItems.forEach(item => {
      try {
        db.prepare('INSERT OR IGNORE INTO equipment_register (id,tenant_id,category,name,description,location,quantity,expiry_date,batch_number,supplier,child_id,requires_prescription,storage_instructions,disposal_instructions,last_checked_date,last_checked_by,status,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(randomUUID(),tenantId,item.cat,item.name,null,item.loc,item.qty,item.expiry||null,item.batch||null,item.supplier,item.child||null,item.rx,item.storage,item.disposal,today,adminId,'active',item.notes,adminId);
      } catch(e){}
    });

    // ── FEE SCHEDULES ─────────────────────────────────────────────────────────
    const feeSchedules = [
      { id:'fee-joeys-ft',    room:'room-joeys',    name:'Joeys Full Day',    daily:165, hrs:11, from:'2025-01-01' },
      { id:'fee-possums-ft',  room:'room-possums',  name:'Possums Full Day',  daily:145, hrs:11, from:'2025-01-01' },
      { id:'fee-koalas-ft',   room:'room-koalas',   name:'Koalas Full Day',   daily:135, hrs:11, from:'2025-01-01' },
      { id:'fee-kookas-ft',   room:'room-kookas',   name:'Kookaburras Full Day', daily:125, hrs:11, from:'2025-01-01' },
    ];
    feeSchedules.forEach(fs => {
      try {
        db.prepare('INSERT OR IGNORE INTO fee_schedules (id,tenant_id,room_id,name,daily_fee,hourly_rate,session_hours,effective_from,active) VALUES(?,?,?,?,?,?,?,?,1)')
          .run(fs.id,tenantId,fs.room,fs.name,fs.daily,fs.daily/fs.hrs,fs.hrs,fs.from);
      } catch(e){}
    });

    // ── CCS DETAILS per child ─────────────────────────────────────────────────
    const ccsData = [
      { child:'Olivia',  crn:'CRN100001', income:85000,  pct:90 },
      { child:'Liam',    crn:'CRN100002', income:110000, pct:85 },
      { child:'Isla',    crn:'CRN100003', income:95000,  pct:88 },
      { child:'Noah',    crn:'CRN100004', income:130000, pct:81 },
      { child:'Ava',     crn:'CRN100005', income:78000,  pct:90 },
      { child:'Ethan',   crn:'CRN100006', income:155000, pct:76 },
      { child:'Mia',     crn:'CRN100007', income:92000,  pct:88 },
      { child:'Jack',    crn:'CRN100008', income:175000, pct:72 },
    ];
    ccsData.forEach(c => {
      const kid = kids.find(k=>k.first_name===c.child);
      if (!kid) return;
      try {
        db.prepare('INSERT OR IGNORE INTO ccs_details (id,tenant_id,child_id,crn,annual_income,ccs_percentage,approved_hours_per_fortnight,activity_test_result,last_updated) VALUES(?,?,?,?,?,?,?,?,?)')
          .run(randomUUID(),tenantId,kid.id,c.crn,c.income,c.pct,100,'activity',today);
      } catch(e){}
    });

    // ── INVOICES (last 3 months + this month) ─────────────────────────────────
    const daysAttended = {'Monday':1,'Tuesday':1,'Wednesday':1,'Thursday':1,'Friday':1};
    const childDays = [
      { child:'Olivia', days:['Monday','Tuesday','Wednesday'], feeId:'fee-possums-ft', daily:145 },
      { child:'Liam',   days:['Monday','Wednesday','Friday'],  feeId:'fee-joeys-ft',   daily:165 },
      { child:'Isla',   days:['Monday','Tuesday','Thursday'],  feeId:'fee-koalas-ft',  daily:135 },
      { child:'Noah',   days:['Monday','Tuesday','Wednesday','Thursday','Friday'], feeId:'fee-kookas-ft', daily:125 },
      { child:'Ava',    days:['Tuesday','Thursday'],           feeId:'fee-possums-ft', daily:145 },
      { child:'Ethan',  days:['Monday','Wednesday','Friday'],  feeId:'fee-koalas-ft',  daily:135 },
      { child:'Mia',    days:['Tuesday','Wednesday','Thursday'], feeId:'fee-joeys-ft', daily:165 },
      { child:'Jack',   days:['Monday','Tuesday','Wednesday','Thursday'], feeId:'fee-kookas-ft', daily:125 },
    ];
    let invNum = 1001;
    for (let mo = 3; mo >= 0; mo--) {
      const mDate = new Date(); mDate.setMonth(mDate.getMonth()-mo);
      const mStr = mDate.toISOString().slice(0,7);
      const isCurrentMonth = mo === 0;

      childDays.forEach(cd => {
        const kid = kids.find(k=>k.first_name===cd.child);
        if (!kid) return;
        const ccsPct = ccsData.find(c=>c.child===cd.child)?.pct || 85;
        // Count working days this child attends in month
        const daysInMonth = new Date(mDate.getFullYear(), mDate.getMonth()+1, 0).getDate();
        let sessionCount = 0;
        for (let day=1; day<=daysInMonth; day++) {
          const wd = new Date(mDate.getFullYear(), mDate.getMonth(), day).getDay();
          const wdName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][wd];
          if (cd.days.includes(wdName)) sessionCount++;
        }
        const grossFee = Math.round(sessionCount * cd.daily * 100); // cents
        const ccsAmt = Math.round(grossFee * ccsPct / 100);
        const parentPayable = grossFee - ccsAmt;
        const invId = randomUUID();
        const invoiceDate = `${mStr}-01`;
        const dueDate = `${mStr}-14`;
        const status = isCurrentMonth ? 'sent' : (Math.random()>0.15 ? 'paid' : 'overdue');
        try {
          db.prepare('INSERT OR IGNORE INTO invoices (id,tenant_id,child_id,invoice_number,invoice_date,due_date,period_start,period_end,fee_schedule_id,sessions,gross_fee_cents,ccs_amount_cents,parent_payable_cents,status,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            .run(invId,tenantId,kid.id,`INV-${invNum++}`,invoiceDate,dueDate,
              invoiceDate,`${mStr}-${daysInMonth<10?'0':''}${daysInMonth}`,
              cd.feeId, sessionCount, grossFee, ccsAmt, parentPayable,
              status, `Monthly invoice — ${cd.days.length} days/week attendance`,
              invoiceDate+'T08:00:00Z');
          // Add payment record for paid invoices
          if (status === 'paid') {
            try {
              db.prepare('INSERT OR IGNORE INTO payments (id,tenant_id,invoice_id,amount_cents,payment_date,payment_method,reference,notes) VALUES(?,?,?,?,?,?,?,?)')
                .run(randomUUID(),tenantId,invId,parentPayable,dueDate,
                  ['bank_transfer','direct_debit','credit_card'][invNum%3],
                  `PAY-${invNum}-${kid.first_name.toUpperCase()}`,
                  'Automated payment received');
            } catch(e){}
          }
        } catch(e){}
      });
    }

    // ── PARENT USERS (for parent portal login) ────────────────────────────────
    const parentLogins = [
      { email:'wei.chen@email.com',   name:'Wei Chen',    child:'Olivia' },
      { email:'raj.patel@email.com',  name:'Raj Patel',   child:'Liam' },
      { email:'mark.t@email.com',     name:'Mark Thompson', child:'Isla' },
      { email:'kate.w@email.com',     name:'Kate Williams', child:'Noah' },
    ];
    const phash = bcrypt.hashSync('Parent2024!', 12);
    parentLogins.forEach(pl => {
      try {
        const uid = randomUUID();
        db.prepare('INSERT OR IGNORE INTO users (id,email,password_hash,name,auth_provider,email_verified) VALUES(?,?,?,?,?,1)')
          .run(uid,pl.email,phash,pl.name,'email');
      } catch(e){}
    });

    console.log('  ✓ v1.9.2: Waitlist(8), Daily Updates, Med Register(16), Fee Schedules, Invoices(4 months), Parent logins seeded');
  } catch(e) { console.log('  ⚠ v1.9.2 seed error:', e.message); }

  // ── v1.9.2b: Attendance sessions for peak-time graph ──────────────────────
  try {
    const kids = db.prepare("SELECT id,room_id FROM children WHERE tenant_id='demo-tenant-001' AND active=1").all();
    if (kids.length) {
      // Typical LDC arrival windows per age group
      const arrivalProfiles = {
        'room-joeys':   { arrMin:420, arrMax:540, depMin:870, depMax:990 }, // 7-9am, 2:30-4:30pm
        'room-possums': { arrMin:420, arrMax:570, depMin:870, depMax:1020 }, // 7-9:30am, 2:30-5pm
        'room-koalas':  { arrMin:450, arrMax:570, depMin:900, depMax:1050 }, // 7:30-9:30am, 3-5:30pm
        'room-kookas':  { arrMin:480, arrMax:540, depMin:900, depMax:1080 }, // 8-9am, 3-6pm
      };
      for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
        const dt = new Date(); dt.setDate(dt.getDate() - daysAgo);
        const dow = dt.getDay();
        if (dow === 0 || dow === 6) continue; // skip weekends
        const dateStr = dt.toISOString().slice(0,10);
        kids.forEach((kid, ki) => {
          // ~80% attendance rate
          if (Math.random() > 0.82) return;
          const prof = arrivalProfiles[kid.room_id] || arrivalProfiles['room-koalas'];
          const jitter = () => Math.round((Math.random() - 0.5) * 20);
          const arrMins = Math.round(prof.arrMin + Math.random() * (prof.arrMax - prof.arrMin)) + jitter();
          const depMins = Math.round(prof.depMin + Math.random() * (prof.depMax - prof.depMin)) + jitter();
          const fmt = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
          const hours = Math.round((depMins - arrMins) / 60 * 10) / 10;
          try {
            db.prepare('INSERT OR IGNORE INTO attendance_sessions (id,tenant_id,child_id,date,sign_in,sign_out,hours,absent,fee_charged,ccs_applied,gap) VALUES(?,?,?,?,?,?,?,0,?,?,?)')
              .run(randomUUID(), 'demo-tenant-001', kid.id, dateStr, fmt(arrMins), fmt(depMins), hours,
                hours * 13.50, hours * 13.50 * 0.85, hours * 13.50 * 0.15);
          } catch(e){}
        });
      }
      console.log('  ✓ v1.9.2b: 30 days attendance sessions seeded for peak-time graph');
    }
  } catch(e) { console.log('  ⚠ v1.9.2b seed error:', e.message); }

  db.pragma('foreign_keys = ON');
}

export function D() {
  if (!db) throw new Error('Database not initialised');
  return db;
}
export function uuid() { return randomUUID(); }

export function auditLog(userId, tenantId, action, details, ip, ua) {
  D().prepare('INSERT INTO audit_log (id,user_id,tenant_id,action,details,ip_address,user_agent) VALUES (?,?,?,?,?,?,?)')
    .run(uuid(), userId, tenantId, action, typeof details === 'string' ? details : JSON.stringify(details), ip, ua);
}
export function cleanExpired() {
  D().prepare("DELETE FROM verification_codes WHERE expires_at < datetime('now') OR used = 1").run();
  D().prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  D().prepare("DELETE FROM invitations WHERE expires_at < datetime('now') AND accepted = 0").run();
  // SOC2: Retain audit logs for 365 days then purge
  D().prepare("DELETE FROM audit_log WHERE created_at < datetime('now', '-365 days')").run();
}

// ── v1.9.1 Learning Journey tables (appended)
function initLearningTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS families (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      family_name TEXT NOT NULL,
      email TEXT,
      email2 TEXT,
      phone TEXT,
      address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_families_tenant ON families(tenant_id);

    CREATE TABLE IF NOT EXISTS family_children (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL,
      UNIQUE(family_id, child_id)
    );
    CREATE INDEX IF NOT EXISTS idx_fam_children ON family_children(family_id);

    CREATE TABLE IF NOT EXISTS learning_stories (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'group',
      event_name TEXT,
      group_name TEXT,
      room_id TEXT REFERENCES rooms(id),
      date TEXT NOT NULL,
      child_ids TEXT NOT NULL DEFAULT '[]',
      eylf_outcomes TEXT NOT NULL DEFAULT '[]',
      eylf_sub_outcomes TEXT NOT NULL DEFAULT '{}',
      tags TEXT NOT NULL DEFAULT '[]',
      photos TEXT NOT NULL DEFAULT '[]',
      ai_enhanced INTEGER DEFAULT 0,
      ai_explanation TEXT,
      ai_progression_suggestions TEXT DEFAULT '[]',
      visible_to_parents INTEGER DEFAULT 1,
      album_id TEXT,
      educator_id TEXT REFERENCES users(id),
      educator_name TEXT,
      published INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_stories_tenant ON learning_stories(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_stories_date ON learning_stories(date);
    CREATE INDEX IF NOT EXISTS idx_stories_room ON learning_stories(room_id);

    CREATE TABLE IF NOT EXISTS story_photos (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      story_id TEXT REFERENCES learning_stories(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      caption TEXT,
      tagged_child_ids TEXT NOT NULL DEFAULT '[]',
      tagged_labels TEXT NOT NULL DEFAULT '[]',
      ai_suggested_tags TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_photos_story ON story_photos(story_id);
    CREATE INDEX IF NOT EXISTS idx_photos_tenant ON story_photos(tenant_id);

    CREATE TABLE IF NOT EXISTS learning_albums (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      cover_story_id TEXT REFERENCES learning_stories(id),
      tags TEXT NOT NULL DEFAULT '[]',
      child_ids TEXT NOT NULL DEFAULT '[]',
      event_name TEXT,
      story_count INTEGER DEFAULT 0,
      photo_count INTEGER DEFAULT 0,
      ai_generated_name INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_albums_tenant ON learning_albums(tenant_id);

    CREATE TABLE IF NOT EXISTS child_eylf_progress (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      eylf_outcome INTEGER NOT NULL,
      sub_outcome TEXT,
      level INTEGER DEFAULT 1,
      notes TEXT,
      progressed_by TEXT REFERENCES users(id),
      progressed_at TEXT DEFAULT (datetime('now')),
      story_id TEXT REFERENCES learning_stories(id),
      UNIQUE(tenant_id, child_id, eylf_outcome, sub_outcome)
    );
    CREATE INDEX IF NOT EXISTS idx_eylf_child ON child_eylf_progress(child_id);

    CREATE TABLE IF NOT EXISTS weekly_reports (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      week_start TEXT NOT NULL,
      week_end TEXT NOT NULL,
      summary TEXT,
      eylf_summary TEXT DEFAULT '{}',
      progressions TEXT DEFAULT '[]',
      regressions TEXT DEFAULT '[]',
      observations_count INTEGER DEFAULT 0,
      ai_generated INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, child_id, week_start)
    );
    CREATE INDEX IF NOT EXISTS idx_weekly_child ON weekly_reports(child_id);
  `);

  // v1.9.9 ElevenLabs TTS columns
  [
    'ALTER TABLE voice_settings ADD COLUMN elevenlabs_api_key TEXT',
    'ALTER TABLE voice_settings ADD COLUMN elevenlabs_voice_id TEXT DEFAULT \'21m00Tcm4TlvDq8ikWAM\'',
    'ALTER TABLE voice_settings ADD COLUMN elevenlabs_model TEXT DEFAULT \'eleven_flash_v2_5\'',
    'ALTER TABLE voice_settings ADD COLUMN call_language TEXT DEFAULT \'en-AU\'',
    // v2.2.9 — Retell AI provider
    'ALTER TABLE voice_settings ADD COLUMN voice_provider TEXT DEFAULT \'twilio\'',
    'ALTER TABLE voice_settings ADD COLUMN retell_api_key TEXT',
    'ALTER TABLE voice_settings ADD COLUMN retell_agent_id TEXT',
    'ALTER TABLE voice_settings ADD COLUMN retell_phone_number_id TEXT',
    'ALTER TABLE voice_settings ADD COLUMN retell_llm_id TEXT',
  ].forEach(sql => { try { db.prepare(sql).run(); } catch(e) {} });
}
