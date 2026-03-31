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
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');        // safe with WAL, 3x faster writes
  db.pragma('cache_size = -131072');        // 128MB page cache
  db.pragma('mmap_size = 536870912');       // 512MB memory-mapped I/O
  db.pragma('temp_store = MEMORY');         // temp tables in RAM
  db.pragma('busy_timeout = 5000');         // 5s wait on lock contention
  db.pragma('page_size = 4096');            // optimal for most OS block sizes
  try { db.exec(`CREATE TABLE IF NOT EXISTS educator_special_availability (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, educator_id TEXT NOT NULL,
    start_date TEXT NOT NULL, end_date TEXT NOT NULL, available_days TEXT DEFAULT '[]',
    can_start_early INTEGER DEFAULT 0, early_start_time TEXT,
    can_stay_late INTEGER DEFAULT 0, late_end_time TEXT, notes TEXT,
    created_at TEXT DEFAULT (datetime('now')))`); } catch(e) {}
    // v2.6.7: staff messages, cert links, PD requests
  try { db.exec("CREATE TABLE IF NOT EXISTS staff_messages (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, from_user_id TEXT NOT NULL, to_user_id TEXT, to_role TEXT, subject TEXT DEFAULT '', body TEXT NOT NULL, thread_id TEXT, reply_to_id TEXT, read_at TEXT, created_at TEXT DEFAULT (datetime('now')))"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS cert_training_links (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, cert_type TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, provider TEXT, notes TEXT, cost_est REAL DEFAULT 0, created_by TEXT, created_at TEXT DEFAULT (datetime('now')))"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS pd_requests (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, educator_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, provider TEXT, url TEXT, start_date TEXT, end_date TEXT, location TEXT, delivery_mode TEXT DEFAULT 'in_person', cost_est REAL DEFAULT 0, cost_approved REAL, expected_outcomes TEXT, status TEXT DEFAULT 'pending', manager_notes TEXT, manager_feedback TEXT, approved_by TEXT, approved_at TEXT, completed_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))"); } catch(e) {}

  // v2.7.0: new critical feature tables
  const v270tables = [
    `CREATE TABLE IF NOT EXISTS visitor_logs (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, visitor_name TEXT NOT NULL,
      visitor_type TEXT DEFAULT 'visitor', company TEXT, purpose TEXT,
      host_educator_id TEXT, wwcc_number TEXT, wwcc_verified INTEGER DEFAULT 0,
      vaccination_status TEXT DEFAULT 'not_checked',
      sign_in TEXT NOT NULL DEFAULT (datetime('now','localtime')), sign_out TEXT,
      date TEXT NOT NULL DEFAULT (date('now','localtime')), inducted INTEGER DEFAULT 0,
      notes TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_visitor_tenant_date ON visitor_logs(tenant_id, date)`,
    `CREATE TABLE IF NOT EXISTS evacuation_drills (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, drill_type TEXT DEFAULT 'fire',
      started_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), completed_at TEXT,
      duration_seconds INTEGER, total_children INTEGER DEFAULT 0, total_educators INTEGER DEFAULT 0,
      all_accounted INTEGER DEFAULT 0, missing_count INTEGER DEFAULT 0,
      notes TEXT, conducted_by TEXT, reviewed_by TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_evac_tenant ON evacuation_drills(tenant_id, started_at)`,
    `CREATE TABLE IF NOT EXISTS evacuation_headcounts (
      id TEXT PRIMARY KEY, drill_id TEXT NOT NULL, child_id TEXT, educator_id TEXT,
      person_type TEXT DEFAULT 'child', accounted INTEGER DEFAULT 0, location TEXT, notes TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_hc_drill ON evacuation_headcounts(drill_id)`,
    `CREATE TABLE IF NOT EXISTS sleep_records (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, child_id TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT (date('now','localtime')), sleep_start TEXT, sleep_end TEXT,
      duration_mins INTEGER, sleep_position TEXT DEFAULT 'back', room_id TEXT,
      checks TEXT DEFAULT '[]', last_check TEXT, next_check_due TEXT,
      alert_sent INTEGER DEFAULT 0, notes TEXT, recorded_by TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_sleep_tenant_date ON sleep_records(tenant_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_sleep_child_date ON sleep_records(child_id, date)`,
    `CREATE TABLE IF NOT EXISTS hazard_reports (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, report_type TEXT DEFAULT 'hazard',
      title TEXT NOT NULL, description TEXT, location TEXT, risk_level TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'open', photo_urls TEXT DEFAULT '[]', reported_by TEXT,
      assigned_to TEXT, due_date TEXT, resolved_at TEXT, resolution_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_hazard_tenant_status ON hazard_reports(tenant_id, status)`,
    `CREATE TABLE IF NOT EXISTS rp_daily_log (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, date TEXT NOT NULL DEFAULT (date('now','localtime')),
      educator_id TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT,
      signed_by_educator INTEGER DEFAULT 0, signed_by_director INTEGER DEFAULT 0,
      notes TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_rp_tenant_date ON rp_daily_log(tenant_id, date)`,
    `CREATE TABLE IF NOT EXISTS handover_forms (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, date TEXT NOT NULL DEFAULT (date('now','localtime')),
      shift_type TEXT DEFAULT 'end_of_day', room_id TEXT, submitted_by TEXT,
      children_present INTEGER DEFAULT 0, incidents_summary TEXT, medications_given TEXT,
      sleep_notes TEXT, meals_notes TEXT, behaviour_notes TEXT, outstanding_tasks TEXT,
      messages_for_families TEXT, general_notes TEXT, acknowledged_by TEXT, acknowledged_at TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_handover_tenant_date ON handover_forms(tenant_id, date)`,
    `CREATE TABLE IF NOT EXISTS room_checkins (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, educator_id TEXT NOT NULL,
      room_id TEXT NOT NULL, clock_record_id TEXT,
      checked_in_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), checked_out_at TEXT,
      date TEXT NOT NULL DEFAULT (date('now','localtime')), created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_roomci_tenant_date ON room_checkins(tenant_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_roomci_edu ON room_checkins(educator_id, date)`,
    `CREATE TABLE IF NOT EXISTS shift_bids (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, roster_entry_id TEXT NOT NULL,
      educator_id TEXT NOT NULL, status TEXT DEFAULT 'pending', ai_score REAL DEFAULT 0,
      note TEXT, submitted_at TEXT DEFAULT (datetime('now')), decided_at TEXT, decided_by TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_bid_entry ON shift_bids(roster_entry_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_bid_educator ON shift_bids(educator_id, tenant_id)`,
    `CREATE TABLE IF NOT EXISTS crm_enquiries (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, first_name TEXT, last_name TEXT,
      email TEXT, phone TEXT, child_first_name TEXT, child_dob TEXT, child_age_months INTEGER,
      preferred_start_date TEXT, preferred_room TEXT, days_requested TEXT DEFAULT '[]',
      message TEXT, source TEXT DEFAULT 'website', status TEXT DEFAULT 'new',
      assigned_to TEXT, last_contact TEXT, next_follow_up TEXT, notes TEXT,
      lost_reason TEXT, tour_id TEXT, waitlist_position INTEGER,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_crm_tenant_status ON crm_enquiries(tenant_id, status, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_crm_followup ON crm_enquiries(tenant_id, next_follow_up)`,
    `CREATE TABLE IF NOT EXISTS tour_bookings (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, enquiry_id TEXT, family_name TEXT NOT NULL,
      family_email TEXT, family_phone TEXT, child_name TEXT, child_dob TEXT,
      booked_date TEXT NOT NULL, booked_time TEXT NOT NULL, duration_mins INTEGER DEFAULT 30,
      conducted_by TEXT, status TEXT DEFAULT 'confirmed', reminder_sent INTEGER DEFAULT 0,
      notes TEXT, outcome TEXT, followup_done INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_tour_tenant_date ON tour_bookings(tenant_id, booked_date)`,
    `CREATE INDEX IF NOT EXISTS idx_tour_status ON tour_bookings(tenant_id, status)`,
  ];
  v270tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });

  // v2.8.0: Events+RSVP, Community Posts, Story Reactions, Policy Docs, Checklists
  const v280tables = [
    // ── CENTRE EVENTS + RSVP ──────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS centre_events (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT, event_type TEXT DEFAULT 'general',
      event_date TEXT NOT NULL, start_time TEXT, end_time TEXT, location TEXT,
      all_rooms INTEGER DEFAULT 1, room_ids TEXT DEFAULT '[]',
      rsvp_required INTEGER DEFAULT 0, rsvp_deadline TEXT,
      max_attendees INTEGER, photo_url TEXT,
      created_by TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_event_tenant_date ON centre_events(tenant_id, event_date)`,

    `CREATE TABLE IF NOT EXISTS event_rsvps (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES centre_events(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL, child_id TEXT, parent_user_id TEXT,
      status TEXT DEFAULT 'attending', guest_count INTEGER DEFAULT 1,
      notes TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvp_unique ON event_rsvps(event_id, child_id)`,
    `CREATE INDEX IF NOT EXISTS idx_rsvp_event ON event_rsvps(event_id)`,

    // ── COMMUNITY POSTS (family shares from home) ─────────────────────────────
    `CREATE TABLE IF NOT EXISTS community_posts (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      author_user_id TEXT NOT NULL, author_name TEXT,
      author_type TEXT DEFAULT 'parent',
      child_id TEXT REFERENCES children(id), 
      title TEXT, body TEXT NOT NULL,
      photo_urls TEXT DEFAULT '[]',
      visibility TEXT DEFAULT 'centre',
      pinned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_cpost_tenant ON community_posts(tenant_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_cpost_child ON community_posts(child_id, tenant_id)`,

    // ── STORY REACTIONS & COMMENTS ────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS story_reactions (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      story_id TEXT NOT NULL, story_type TEXT DEFAULT 'observation',
      user_id TEXT NOT NULL, reaction TEXT DEFAULT 'heart',
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_reaction_unique ON story_reactions(story_id, user_id, reaction)`,
    `CREATE INDEX IF NOT EXISTS idx_reaction_story ON story_reactions(story_id)`,

    `CREATE TABLE IF NOT EXISTS story_comments (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      story_id TEXT NOT NULL, story_type TEXT DEFAULT 'observation',
      author_user_id TEXT NOT NULL, author_name TEXT, author_type TEXT DEFAULT 'parent',
      body TEXT NOT NULL, reply_to_id TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_comment_story ON story_comments(story_id, created_at)`,

    // ── POLICY DOCUMENTS LIBRARY ──────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS policy_documents (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      title TEXT NOT NULL, category TEXT DEFAULT 'policy',
      description TEXT, file_url TEXT, file_name TEXT, file_size INTEGER,
      version TEXT DEFAULT '1.0', status TEXT DEFAULT 'active',
      requires_acknowledgement INTEGER DEFAULT 0,
      visible_to_parents INTEGER DEFAULT 0,
      created_by TEXT, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_policydoc_tenant ON policy_documents(tenant_id, status)`,

    `CREATE TABLE IF NOT EXISTS policy_acknowledgements (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      document_id TEXT NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL, educator_id TEXT,
      acknowledged_at TEXT DEFAULT (datetime('now')),
      version TEXT)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_ack_unique ON policy_acknowledgements(document_id, user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ack_doc ON policy_acknowledgements(document_id)`,

    // ── CUSTOM CHECKLISTS ─────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS checklist_templates (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT,
      category TEXT DEFAULT 'daily', frequency TEXT DEFAULT 'daily',
      room_ids TEXT DEFAULT '[]', assign_to_role TEXT DEFAULT 'educator',
      items TEXT NOT NULL DEFAULT '[]',
      active INTEGER DEFAULT 1,
      created_by TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_checklist_tenant ON checklist_templates(tenant_id, active)`,

    `CREATE TABLE IF NOT EXISTS checklist_completions (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      template_id TEXT NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
      completed_by TEXT NOT NULL, educator_id TEXT,
      date TEXT NOT NULL DEFAULT (date('now','localtime')),
      responses TEXT NOT NULL DEFAULT '[]',
      notes TEXT, completed_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_checkcomp_tenant_date ON checklist_completions(tenant_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_checkcomp_template ON checklist_completions(template_id, date)`,
  ];
  v280tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.9.0: CCS enhancements + integration hub tables
  const v290tables = [
    // ── CCS FAMILY DETAILS (enhanced) ────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS ccs_family_details (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      parent1_name TEXT, parent1_crn TEXT, parent1_dob TEXT,
      parent2_name TEXT, parent2_crn TEXT, parent2_dob TEXT,
      combined_income REAL, income_year TEXT,
      ccs_percentage REAL DEFAULT 0,
      higher_rate_eligible INTEGER DEFAULT 0,
      higher_rate_percentage REAL DEFAULT 0,
      activity_hours_p1 INTEGER DEFAULT 72,
      activity_hours_p2 INTEGER DEFAULT 72,
      subsidised_hours_fortnight INTEGER DEFAULT 72,
      accs_eligible INTEGER DEFAULT 0,
      accs_type TEXT,
      immunisation_compliant INTEGER DEFAULT 1,
      first_nations INTEGER DEFAULT 0,
      preschool_program INTEGER DEFAULT 0,
      enrolment_id TEXT,
      enrolment_status TEXT DEFAULT 'not_submitted',
      last_income_update TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_ccsfam_child ON ccs_family_details(child_id, tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ccsfam_tenant ON ccs_family_details(tenant_id)`,

    // ── CCS SESSION REPORTS QUEUE (for CCSS submission) ───────────────────────
    `CREATE TABLE IF NOT EXISTS ccs_submission_queue (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id),
      fortnight_start TEXT NOT NULL,
      fortnight_end TEXT NOT NULL,
      sessions TEXT NOT NULL DEFAULT '[]',
      total_hours REAL DEFAULT 0,
      total_fee_cents INTEGER DEFAULT 0,
      ccs_percentage REAL DEFAULT 0,
      ccs_amount_cents INTEGER DEFAULT 0,
      gap_fee_cents INTEGER DEFAULT 0,
      absences INTEGER DEFAULT 0,
      allowable_absences_used INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      proda_provider_id TEXT,
      proda_service_id TEXT,
      submitted_at TEXT,
      submission_ref TEXT,
      response_status TEXT,
      response_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_ccsq_tenant_status ON ccs_submission_queue(tenant_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_ccsq_child ON ccs_submission_queue(child_id, fortnight_start)`,

    // ── INTEGRATION CREDENTIALS & STATUS ─────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS integration_credentials (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      integration TEXT NOT NULL,
      label TEXT,
      credential_key TEXT, credential_secret TEXT,
      endpoint TEXT, api_key TEXT,
      extra_config TEXT DEFAULT '{}',
      status TEXT DEFAULT 'not_configured',
      last_tested TEXT, last_test_result TEXT,
      enabled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_intcred_unique ON integration_credentials(tenant_id, integration)`,

    // ── INTEGRATION AUDIT LOG ─────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS integration_log (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      integration TEXT NOT NULL,
      action TEXT NOT NULL,
      direction TEXT DEFAULT 'outbound',
      payload_summary TEXT,
      response_code INTEGER,
      response_summary TEXT,
      success INTEGER DEFAULT 0,
      duration_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_intlog_tenant ON integration_log(tenant_id, integration, created_at)`,
  ];
  v290tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.10.0: Recruitment, Appraisals, Occupancy, Debt, Casual Bookings
  const v2100tables = [
    // ── RECRUITMENT ───────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS job_postings (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT, requirements TEXT,
      employment_type TEXT DEFAULT 'permanent',
      hours_per_week REAL, salary_min REAL, salary_max REAL,
      location TEXT, room_preference TEXT,
      status TEXT DEFAULT 'draft',
      posted_date TEXT, closing_date TEXT,
      seek_listing_id TEXT,
      applications_count INTEGER DEFAULT 0,
      created_by TEXT, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON job_postings(tenant_id, status)`,

    `CREATE TABLE IF NOT EXISTS job_applications (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      job_id TEXT NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
      applicant_name TEXT NOT NULL, applicant_email TEXT, applicant_phone TEXT,
      qualification TEXT, years_experience INTEGER DEFAULT 0,
      resume_url TEXT, cover_letter TEXT,
      wwcc_number TEXT, wwcc_state TEXT,
      referees TEXT DEFAULT '[]',
      status TEXT DEFAULT 'new',
      rating INTEGER, interview_date TEXT, interview_notes TEXT,
      offer_date TEXT, offer_accepted INTEGER,
      rejection_reason TEXT,
      source TEXT DEFAULT 'direct',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_apps_job ON job_applications(job_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_apps_tenant ON job_applications(tenant_id, status)`,

    // ── STAFF APPRAISALS (enhanced) ───────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS appraisal_templates (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      name TEXT NOT NULL, description TEXT,
      sections TEXT NOT NULL DEFAULT '[]',
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_apptmpl_tenant ON appraisal_templates(tenant_id)`,

    `CREATE TABLE IF NOT EXISTS appraisals (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      educator_id TEXT NOT NULL REFERENCES educators(id),
      template_id TEXT,
      reviewer_id TEXT,
      review_period_start TEXT, review_period_end TEXT,
      due_date TEXT,
      status TEXT DEFAULT 'pending',
      overall_rating REAL,
      educator_self_assessment TEXT DEFAULT '{}',
      reviewer_assessment TEXT DEFAULT '{}',
      agreed_goals TEXT DEFAULT '[]',
      strengths TEXT, development_areas TEXT,
      educator_comments TEXT, reviewer_comments TEXT,
      signed_by_educator INTEGER DEFAULT 0,
      signed_by_reviewer INTEGER DEFAULT 0,
      signed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_appr_educator ON appraisals(educator_id, tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_appr_tenant ON appraisals(tenant_id, status)`,

    // ── OCCUPANCY FORECASTING ─────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS occupancy_snapshots (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      snapshot_date TEXT NOT NULL,
      room_id TEXT REFERENCES rooms(id),
      enrolled INTEGER DEFAULT 0,
      capacity INTEGER DEFAULT 0,
      attending INTEGER DEFAULT 0,
      occupancy_pct REAL DEFAULT 0,
      revenue_day_cents INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_snap_unique ON occupancy_snapshots(tenant_id, snapshot_date, room_id)`,
    `CREATE INDEX IF NOT EXISTS idx_snap_tenant_date ON occupancy_snapshots(tenant_id, snapshot_date)`,

    // ── DEBT MANAGEMENT ───────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS debt_records (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id),
      invoice_id TEXT,
      amount_cents INTEGER NOT NULL,
      amount_paid_cents INTEGER DEFAULT 0,
      due_date TEXT,
      days_overdue INTEGER DEFAULT 0,
      status TEXT DEFAULT 'outstanding',
      reminder_1_sent TEXT, reminder_2_sent TEXT, reminder_3_sent TEXT,
      payment_plan INTEGER DEFAULT 0,
      payment_plan_amount_cents INTEGER,
      payment_plan_frequency TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_debt_tenant ON debt_records(tenant_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_debt_child ON debt_records(child_id)`,

    // ── CASUAL BOOKINGS ────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS casual_bookings (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id),
      room_id TEXT REFERENCES rooms(id),
      requested_date TEXT NOT NULL,
      session_type TEXT DEFAULT 'full_day',
      start_time TEXT, end_time TEXT,
      status TEXT DEFAULT 'pending',
      requested_by TEXT,
      confirmed_by TEXT,
      confirmed_at TEXT,
      declined_reason TEXT,
      fee_cents INTEGER DEFAULT 0,
      ccs_applied INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_casual_tenant_date ON casual_bookings(tenant_id, requested_date)`,
    `CREATE INDEX IF NOT EXISTS idx_casual_child ON casual_bookings(child_id)`,
    `CREATE INDEX IF NOT EXISTS idx_casual_status ON casual_bookings(tenant_id, status)`,
  ];
  v2100tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.11.0: Menu planning, milestones, transition reports
  const v2110tables = [
    // ── MENU PLANNING ─────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS menu_plans (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      week_starting TEXT NOT NULL,
      plan_name TEXT DEFAULT 'Weekly Menu',
      status TEXT DEFAULT 'draft',
      approved_by TEXT, approved_at TEXT,
      notes TEXT,
      created_by TEXT, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_week ON menu_plans(tenant_id, week_starting)`,

    `CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      menu_plan_id TEXT NOT NULL REFERENCES menu_plans(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL,
      meal_type TEXT NOT NULL,
      description TEXT NOT NULL,
      allergens TEXT DEFAULT '[]',
      is_vegetarian INTEGER DEFAULT 0,
      is_halal INTEGER DEFAULT 0,
      notes TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_menu_items_plan ON menu_items(menu_plan_id)`,

    `CREATE TABLE IF NOT EXISTS dietary_requirements (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      requirement_type TEXT NOT NULL,
      description TEXT, severity TEXT DEFAULT 'intolerance',
      allergens TEXT DEFAULT '[]',
      action_plan TEXT,
      medical_cert_url TEXT, review_date TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_dietary_child ON dietary_requirements(child_id)`,
    `CREATE INDEX IF NOT EXISTS idx_dietary_tenant ON dietary_requirements(tenant_id)`,

    // ── DEVELOPMENTAL MILESTONES ───────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS milestone_records (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      domain TEXT NOT NULL,
      milestone_key TEXT NOT NULL,
      milestone_label TEXT NOT NULL,
      age_months_expected INTEGER,
      achieved INTEGER DEFAULT 0,
      achieved_date TEXT,
      notes TEXT,
      observation_id TEXT,
      recorded_by TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_milestone_unique ON milestone_records(child_id, milestone_key)`,
    `CREATE INDEX IF NOT EXISTS idx_milestone_child ON milestone_records(child_id)`,
    `CREATE INDEX IF NOT EXISTS idx_milestone_tenant ON milestone_records(tenant_id, domain)`,

    // ── TRANSITION REPORTS ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS transition_reports (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      report_type TEXT DEFAULT 'school_readiness',
      report_date TEXT NOT NULL,
      target_school TEXT,
      transition_date TEXT,
      communication TEXT,
      literacy TEXT,
      numeracy TEXT,
      social_emotional TEXT,
      physical_development TEXT,
      independence TEXT,
      interests TEXT,
      learning_style TEXT,
      strengths TEXT,
      areas_for_support TEXT,
      recommendations TEXT,
      educator_notes TEXT,
      family_input TEXT,
      eylf_outcomes TEXT DEFAULT '{}',
      status TEXT DEFAULT 'draft',
      shared_with_family INTEGER DEFAULT 0,
      shared_with_school INTEGER DEFAULT 0,
      prepared_by TEXT,
      reviewed_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_trans_child ON transition_reports(child_id)`,
    `CREATE INDEX IF NOT EXISTS idx_trans_tenant ON transition_reports(tenant_id, status)`,
  ];
  v2110tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.12.0: QIP enhancements, educator portfolio, surveys, doc prompts
  const v2120tables = [
    // ── EDUCATOR PORTFOLIO ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS educator_portfolio_entries (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      educator_id TEXT NOT NULL REFERENCES educators(id) ON DELETE CASCADE,
      entry_type TEXT DEFAULT 'reflection',
      title TEXT NOT NULL, body TEXT,
      evidence_urls TEXT DEFAULT '[]',
      nqs_links TEXT DEFAULT '[]',
      eylf_links TEXT DEFAULT '[]',
      visibility TEXT DEFAULT 'private',
      tags TEXT DEFAULT '[]',
      reviewer_id TEXT,
      reviewer_feedback TEXT,
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_portfolio_educator ON educator_portfolio_entries(educator_id, tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_portfolio_tenant ON educator_portfolio_entries(tenant_id, created_at)`,

    // ── PARENT SURVEYS ────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS surveys (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT,
      survey_type TEXT DEFAULT 'satisfaction',
      status TEXT DEFAULT 'draft',
      questions TEXT NOT NULL DEFAULT '[]',
      target_audience TEXT DEFAULT 'parents',
      open_date TEXT, close_date TEXT,
      response_count INTEGER DEFAULT 0,
      created_by TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_survey_tenant ON surveys(tenant_id, status)`,

    `CREATE TABLE IF NOT EXISTS survey_responses (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
      respondent_user_id TEXT,
      respondent_child_id TEXT,
      answers TEXT NOT NULL DEFAULT '[]',
      nps_score INTEGER,
      completed INTEGER DEFAULT 0,
      submitted_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_survresp_survey ON survey_responses(survey_id)`,
    `CREATE INDEX IF NOT EXISTS idx_survresp_tenant ON survey_responses(tenant_id, submitted_at)`,

    // ── DOCUMENTATION PROMPTS / STORY TEMPLATES ───────────────────────────────
    `CREATE TABLE IF NOT EXISTS story_prompts (
      id TEXT PRIMARY KEY, tenant_id TEXT,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      prompt_text TEXT NOT NULL,
      eylf_suggested TEXT DEFAULT '[]',
      age_groups TEXT DEFAULT '[]',
      is_system INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_prompts_tenant ON story_prompts(tenant_id, category)`,

    // ── SMART NOTIFICATIONS ───────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS smart_alerts (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      priority TEXT DEFAULT 'normal',
      entity_type TEXT,
      entity_id TEXT,
      action_url TEXT,
      dismissed INTEGER DEFAULT 0,
      dismissed_by TEXT,
      dismissed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_alerts_tenant ON smart_alerts(tenant_id, dismissed, created_at)`,
  ];
  v2120tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.13.0: Kiosk mode, payroll export, notification engine
  const v2130tables = [
    // ── KIOSK SESSIONS ────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS kiosk_sessions (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      pin TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id),
      session_date TEXT NOT NULL,
      signed_in_at TEXT, signed_in_by TEXT,
      signed_out_at TEXT, signed_out_by TEXT,
      sign_in_temp_check INTEGER DEFAULT 0,
      sign_out_note TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_kiosk_tenant_date ON kiosk_sessions(tenant_id, session_date)`,
    `CREATE INDEX IF NOT EXISTS idx_kiosk_child ON kiosk_sessions(child_id, session_date)`,

    `CREATE TABLE IF NOT EXISTS kiosk_pins (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      pin TEXT NOT NULL,
      pin_hint TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_kiosk_pin_child ON kiosk_pins(tenant_id, child_id)`,
    `CREATE INDEX IF NOT EXISTS idx_kiosk_pin_lookup ON kiosk_pins(tenant_id, pin, active)`,

    // ── PAYROLL EXPORTS ───────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS payroll_exports (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      period_start TEXT NOT NULL, period_end TEXT NOT NULL,
      export_type TEXT DEFAULT 'csv',
      status TEXT DEFAULT 'pending',
      total_hours REAL DEFAULT 0,
      total_cost_cents INTEGER DEFAULT 0,
      educator_count INTEGER DEFAULT 0,
      file_url TEXT,
      generated_by TEXT,
      generated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_payroll_tenant ON payroll_exports(tenant_id, period_start)`,

    // ── SCHEDULED NOTIFICATIONS ───────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS notification_rules (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      rule_type TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      days_before INTEGER DEFAULT 0,
      channels TEXT DEFAULT '["in_app"]',
      subject_template TEXT, body_template TEXT,
      active INTEGER DEFAULT 1,
      last_run TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_notif_rules_tenant ON notification_rules(tenant_id, active)`,

    `CREATE TABLE IF NOT EXISTS notification_log (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      rule_id TEXT,
      recipient_user_id TEXT, recipient_email TEXT,
      channel TEXT DEFAULT 'in_app',
      subject TEXT, body TEXT,
      entity_type TEXT, entity_id TEXT,
      status TEXT DEFAULT 'sent',
      sent_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_notif_log_tenant ON notification_log(tenant_id, sent_at)`,
    `CREATE INDEX IF NOT EXISTS idx_notif_log_user ON notification_log(recipient_user_id)`,
  ];
  v2130tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.15.0: Digital signatures, bulk comms, portfolios, Stripe
  const v2150tables = [
    // ── DIGITAL SIGNATURES ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS digital_signatures (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      document_type TEXT NOT NULL,
      document_id TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      signer_role TEXT DEFAULT 'parent',
      signer_user_id TEXT,
      signature_data TEXT,
      signed_at TEXT DEFAULT (datetime('now')),
      ip_address TEXT,
      device_info TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_sig_doc ON digital_signatures(document_type, document_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sig_tenant ON digital_signatures(tenant_id, signed_at)`,

    // ── BULK COMMUNICATIONS ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS bulk_messages (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      message_type TEXT DEFAULT 'general',
      subject TEXT, body TEXT NOT NULL,
      channels TEXT DEFAULT '["email"]',
      target_audience TEXT DEFAULT 'all_families',
      target_room_ids TEXT DEFAULT '[]',
      recipient_count INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      scheduled_for TEXT,
      sent_at TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_bulk_msg_tenant ON bulk_messages(tenant_id, created_at)`,

    `CREATE TABLE IF NOT EXISTS bulk_message_recipients (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      message_id TEXT NOT NULL REFERENCES bulk_messages(id) ON DELETE CASCADE,
      child_id TEXT, parent_name TEXT, email TEXT, phone TEXT,
      status TEXT DEFAULT 'pending',
      sent_at TEXT, error TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_bulk_rcpt_msg ON bulk_message_recipients(message_id)`,

    // ── CHILD PORTFOLIO ───────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS portfolio_exports (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id),
      export_type TEXT DEFAULT 'pdf',
      date_from TEXT, date_to TEXT,
      include_stories INTEGER DEFAULT 1,
      include_milestones INTEGER DEFAULT 1,
      include_observations INTEGER DEFAULT 1,
      include_photos INTEGER DEFAULT 1,
      story_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      share_token TEXT UNIQUE,
      share_expires TEXT,
      generated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_portfolio_child ON portfolio_exports(child_id)`,
    `CREATE INDEX IF NOT EXISTS idx_portfolio_token ON portfolio_exports(share_token)`,

    // ── STRIPE / ONLINE PAYMENTS ───────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS stripe_accounts (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL UNIQUE,
      stripe_account_id TEXT,
      stripe_publishable_key TEXT,
      stripe_secret_key_enc TEXT,
      connected INTEGER DEFAULT 0,
      connect_type TEXT DEFAULT 'standard',
      currency TEXT DEFAULT 'AUD',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,

    `CREATE TABLE IF NOT EXISTS payment_requests (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT REFERENCES children(id),
      invoice_id TEXT,
      amount_cents INTEGER NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      stripe_payment_intent_id TEXT,
      stripe_checkout_url TEXT,
      paid_at TEXT,
      paid_amount_cents INTEGER,
      payment_method TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_payment_req_tenant ON payment_requests(tenant_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_payment_req_child ON payment_requests(child_id)`,
  ];
  v2150tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });

  // Add signature fields to incidents if missing
  ['parent_signature_data','parent_signed_at','director_signature_data','director_signed_at'].forEach(col => {
    try { db.exec(`ALTER TABLE incidents ADD COLUMN ${col} TEXT`); } catch(e) {}
  });
  // Add signature fields to medication_log if missing  
  ['parent_signature_data','parent_signed_at'].forEach(col => {
    try { db.exec(`ALTER TABLE medication_log ADD COLUMN ${col} TEXT`); } catch(e) {}
  });


  // v2.14.0: Parent messaging threads, immunisation improvements, health events
  const v2140tables = [
    // ── PARENT MESSAGE THREADS (two-way) ─────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS message_threads (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT REFERENCES children(id),
      subject TEXT NOT NULL,
      last_message_at TEXT DEFAULT (datetime('now')),
      last_message_preview TEXT,
      unread_admin INTEGER DEFAULT 0,
      unread_parent INTEGER DEFAULT 0,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_threads_tenant ON message_threads(tenant_id, last_message_at)`,
    `CREATE INDEX IF NOT EXISTS idx_threads_child ON message_threads(child_id)`,

    `CREATE TABLE IF NOT EXISTS thread_messages (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      thread_id TEXT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
      sender_type TEXT NOT NULL,
      sender_name TEXT, sender_user_id TEXT,
      body TEXT NOT NULL,
      attachments TEXT DEFAULT '[]',
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_tmsg_thread ON thread_messages(thread_id, created_at)`,

    // ── HEALTH & WELLNESS EVENTS ──────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS health_events (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id),
      event_type TEXT NOT NULL,
      event_date TEXT NOT NULL,
      description TEXT,
      temperature REAL,
      symptoms TEXT DEFAULT '[]',
      action_taken TEXT,
      parent_notified INTEGER DEFAULT 0,
      parent_notified_at TEXT,
      follow_up_required INTEGER DEFAULT 0,
      follow_up_notes TEXT,
      recorded_by TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_health_child ON health_events(child_id, event_date)`,
    `CREATE INDEX IF NOT EXISTS idx_health_tenant ON health_events(tenant_id, event_date)`,

    // ── IMMUNISATION SCHEDULE REFERENCE ──────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS immunisation_schedule (
      id TEXT PRIMARY KEY,
      vaccine TEXT NOT NULL, schedule_name TEXT,
      age_months INTEGER, age_label TEXT,
      is_required INTEGER DEFAULT 1,
      country_code TEXT DEFAULT 'AU',
      notes TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_immschedule_age ON immunisation_schedule(age_months)`,
  ];
  v2140tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });

  // Seed AU immunisation schedule (NHMRC 2025)
  const immScheduleCount = D().prepare('SELECT COUNT(*) as n FROM immunisation_schedule').get()?.n || 0;
  if (!immScheduleCount) {
    const schedule = [
      { id:'imm1',  vaccine:'Hepatitis B',                         age:0,   label:'Birth',            required:1 },
      { id:'imm2',  vaccine:'Hepatitis B',                         age:2,   label:'2 months',          required:1 },
      { id:'imm3',  vaccine:'Rotavirus',                           age:2,   label:'2 months',          required:1 },
      { id:'imm4',  vaccine:'Diphtheria, Tetanus, Pertussis (DTP)',age:2,   label:'2 months',          required:1 },
      { id:'imm5',  vaccine:'Hib (Haemophilus influenzae type b)', age:2,   label:'2 months',          required:1 },
      { id:'imm6',  vaccine:'Pneumococcal (PCV)',                  age:2,   label:'2 months',          required:1 },
      { id:'imm7',  vaccine:'Polio (IPV)',                         age:2,   label:'2 months',          required:1 },
      { id:'imm8',  vaccine:'Hepatitis B',                         age:4,   label:'4 months',          required:1 },
      { id:'imm9',  vaccine:'Rotavirus',                           age:4,   label:'4 months',          required:1 },
      { id:'imm10', vaccine:'DTP',                                 age:4,   label:'4 months',          required:1 },
      { id:'imm11', vaccine:'Hib',                                 age:4,   label:'4 months',          required:1 },
      { id:'imm12', vaccine:'Pneumococcal (PCV)',                  age:4,   label:'4 months',          required:1 },
      { id:'imm13', vaccine:'Polio (IPV)',                         age:4,   label:'4 months',          required:1 },
      { id:'imm14', vaccine:'DTP',                                 age:6,   label:'6 months',          required:1 },
      { id:'imm15', vaccine:'Hepatitis B',                         age:6,   label:'6 months',          required:1 },
      { id:'imm16', vaccine:'Hib',                                 age:6,   label:'6 months',          required:1 },
      { id:'imm17', vaccine:'Polio (IPV)',                         age:6,   label:'6 months',          required:1 },
      { id:'imm18', vaccine:'Pneumococcal (PCV)',                  age:12,  label:'12 months',         required:1 },
      { id:'imm19', vaccine:'Meningococcal ACWY',                  age:12,  label:'12 months',         required:1 },
      { id:'imm20', vaccine:'MMR (Measles, Mumps, Rubella)',       age:12,  label:'12 months',         required:1 },
      { id:'imm21', vaccine:'Hib',                                 age:12,  label:'12 months',         required:1 },
      { id:'imm22', vaccine:'Varicella (Chickenpox)',              age:18,  label:'18 months',         required:1 },
      { id:'imm23', vaccine:'MMR',                                 age:18,  label:'18 months',         required:1 },
      { id:'imm24', vaccine:'DTP',                                 age:18,  label:'18 months',         required:1 },
      { id:'imm25', vaccine:'Pneumococcal (PCV)',                  age:18,  label:'18 months',         required:1 },
      { id:'imm26', vaccine:'Meningococcal B',                     age:18,  label:'18 months',         required:0 },
      { id:'imm27', vaccine:'Influenza',                           age:6,   label:'Annual from 6m',    required:0 },
      { id:'imm28', vaccine:'DTP booster',                         age:48,  label:'4 years',           required:1 },
      { id:'imm29', vaccine:'MMR booster',                         age:48,  label:'4 years',           required:1 },
      { id:'imm30', vaccine:'Varicella booster',                   age:48,  label:'4 years',           required:1 },
      { id:'imm31', vaccine:'Polio booster',                       age:48,  label:'4 years',           required:1 },
    ];
    const ins = db.prepare('INSERT OR IGNORE INTO immunisation_schedule (id,vaccine,age_months,age_label,is_required,country_code) VALUES (?,?,?,?,?,?)');
    schedule.forEach(v => ins.run(v.id, v.vaccine, v.age, v.label, v.required, 'AU'));
  }


  // v2.18.0: Risk assessments, report builder, emergency contacts
  const v2180tables = [
    // ── EXCURSION RISK ASSESSMENT ─────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS risk_assessments (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      excursion_id TEXT REFERENCES excursions(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      assessment_date TEXT NOT NULL,
      location TEXT,
      assessor TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      status TEXT DEFAULT 'draft',
      overall_risk_level TEXT DEFAULT 'low',
      hazards TEXT DEFAULT '[]',
      emergency_plan TEXT,
      medical_kit_checked INTEGER DEFAULT 0,
      ratios_confirmed INTEGER DEFAULT 0,
      transport_checked INTEGER DEFAULT 0,
      parent_permissions_complete INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_risk_excursion ON risk_assessments(excursion_id)`,
    `CREATE INDEX IF NOT EXISTS idx_risk_tenant ON risk_assessments(tenant_id, status)`,

    // ── SAVED REPORTS ─────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS saved_reports (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      report_type TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      last_run TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_saved_reports_tenant ON saved_reports(tenant_id)`,
  ];
  v2180tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.19.0: AI assistant, child fee overrides, compliance nagger
  const v2190tables = [
    // ── CHILD FEE OVERRIDES ───────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS child_fee_overrides (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      override_type TEXT DEFAULT 'fixed',
      daily_rate_cents INTEGER,
      discount_pct REAL DEFAULT 0,
      discount_reason TEXT,
      session_rates TEXT DEFAULT '{}',
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_override_child ON child_fee_overrides(child_id, effective_from)`,
    `CREATE INDEX IF NOT EXISTS idx_fee_override_tenant ON child_fee_overrides(tenant_id)`,

    // ── COMPLIANCE NAGGER TASKS ───────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS compliance_tasks (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      task_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      assigned_to TEXT,
      entity_type TEXT,
      entity_id TEXT,
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'open',
      completed_at TEXT,
      completed_by TEXT,
      auto_generated INTEGER DEFAULT 0,
      recurrence TEXT,
      next_due TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_ctask_tenant ON compliance_tasks(tenant_id, status, due_date)`,
    `CREATE INDEX IF NOT EXISTS idx_ctask_assigned ON compliance_tasks(assigned_to, status)`,

    // ── AI WRITING SESSIONS ───────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS ai_writing_sessions (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      educator_id TEXT,
      child_id TEXT,
      session_type TEXT DEFAULT 'observation',
      prompt_used TEXT,
      generated_text TEXT,
      final_text TEXT,
      eylf_suggested TEXT DEFAULT '[]',
      rating INTEGER,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_ai_session_tenant ON ai_writing_sessions(tenant_id, created_at)`,
  ];
  v2190tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.21.0: Full invoicing + payments build-out
  const v2210tables = [
    // ── INVOICE LINE ITEMS ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS invoice_line_items (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity REAL DEFAULT 1,
      unit_price_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      item_type TEXT DEFAULT 'fee',
      date TEXT,
      sort_order INTEGER DEFAULT 0)`,
    `CREATE INDEX IF NOT EXISTS idx_line_items_invoice ON invoice_line_items(invoice_id)`,

    // ── INVOICE TEMPLATES ─────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS invoice_templates (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      header_html TEXT, footer_html TEXT,
      logo_url TEXT,
      payment_terms TEXT DEFAULT 'Due within 14 days',
      bank_name TEXT, bank_bsb TEXT, bank_account TEXT,
      include_ccs_breakdown INTEGER DEFAULT 1,
      colour TEXT DEFAULT '#7C3AED',
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_inv_tmpl_tenant ON invoice_templates(tenant_id)`,

    // ── PAYMENT PLANS ─────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS payment_plans (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id),
      invoice_id TEXT REFERENCES invoices(id),
      total_amount_cents INTEGER NOT NULL,
      amount_paid_cents INTEGER DEFAULT 0,
      instalment_amount_cents INTEGER NOT NULL,
      frequency TEXT DEFAULT 'weekly',
      start_date TEXT NOT NULL,
      next_due_date TEXT,
      instalments_total INTEGER,
      instalments_paid INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_payment_plan_child ON payment_plans(child_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payment_plan_tenant ON payment_plans(tenant_id, status)`,

    // ── CREDIT NOTES ──────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS credit_notes (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id),
      invoice_id TEXT REFERENCES invoices(id),
      credit_number TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'available',
      applied_to_invoice TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_credit_tenant ON credit_notes(tenant_id, status)`,
  ];
  v2210tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.22.0: Xero integration, educator self-service
  const v2220tables = [
    `CREATE TABLE IF NOT EXISTS xero_connections (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL UNIQUE,
      xero_tenant_id TEXT, xero_tenant_name TEXT,
      access_token TEXT, refresh_token TEXT, token_expiry TEXT,
      connected INTEGER DEFAULT 0,
      account_code_fees TEXT DEFAULT '200',
      account_code_ccs TEXT DEFAULT '201',
      last_sync TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS xero_sync_log (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      sync_type TEXT, status TEXT, records_synced INTEGER DEFAULT 0,
      error TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS educator_leave_requests (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      educator_id TEXT NOT NULL REFERENCES educators(id),
      leave_type TEXT NOT NULL,
      start_date TEXT NOT NULL, end_date TEXT NOT NULL,
      days REAL DEFAULT 1,
      reason TEXT, status TEXT DEFAULT 'pending',
      approved_by TEXT, approved_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_leave_educator ON educator_leave_requests(educator_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_leave_tenant ON educator_leave_requests(tenant_id, status, start_date)`,
    `CREATE TABLE IF NOT EXISTS educator_availability_weekly (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      educator_id TEXT NOT NULL REFERENCES educators(id),
      week_start TEXT NOT NULL,
      availability TEXT DEFAULT '{}',
      notes TEXT,
      submitted_at TEXT DEFAULT (datetime('now')),
      UNIQUE(educator_id, week_start))`,
  ];
  v2220tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.21.1: Upgrade clock_records to use educator_id, proper columns
  try {
    db.exec(`ALTER TABLE clock_records ADD COLUMN educator_id TEXT`);
    db.exec(`UPDATE clock_records SET educator_id=member_id WHERE educator_id IS NULL`);
  } catch(e) {}
  try { db.exec(`ALTER TABLE clock_records ADD COLUMN clock_date TEXT`); } catch(e) {}
  try { db.exec(`UPDATE clock_records SET clock_date=date WHERE clock_date IS NULL`); } catch(e) {}
  try { db.exec(`ALTER TABLE clock_records ADD COLUMN clock_in TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE clock_records ADD COLUMN clock_out TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE clock_records ADD COLUMN hours_worked REAL DEFAULT 0`); } catch(e) {}
  try { db.exec(`ALTER TABLE clock_records ADD COLUMN total_break_minutes INTEGER DEFAULT 0`); } catch(e) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_clock_educator_date ON clock_records(educator_id, clock_date)`); } catch(e) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_clock_tenant_date ON clock_records(tenant_id, clock_date)`); } catch(e) {}


  // v2.22.1: Schedule publish history, report schedule management
  const v2221tables = [
    `CREATE TABLE IF NOT EXISTS schedule_publish_history (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      published_by TEXT,
      educator_count INTEGER DEFAULT 0,
      message TEXT,
      published_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_sched_hist_tenant ON schedule_publish_history(tenant_id, published_at)`,

    `CREATE TABLE IF NOT EXISTS report_schedules (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      report_type TEXT NOT NULL,
      config TEXT DEFAULT '{}',
      frequency TEXT DEFAULT 'weekly',
      day_of_week INTEGER DEFAULT 1,
      time TEXT DEFAULT '08:00',
      recipients TEXT DEFAULT '[]',
      last_run TEXT,
      next_run TEXT,
      enabled INTEGER DEFAULT 1,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_report_sched_tenant ON report_schedules(tenant_id, enabled)`,
  ];
  v2221tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });



  // ── TIER 1 NEW TABLES ─────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS checklists (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'daily',
      frequency TEXT DEFAULT 'daily',
      room_id TEXT,
      items TEXT DEFAULT '[]',
      status TEXT DEFAULT 'active',
      last_completed TEXT,
      completed_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS checklist_completions (
      id TEXT PRIMARY KEY,
      checklist_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      completed_date TEXT,
      completed_by TEXT,
      notes TEXT,
      items_data TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ratio_snapshots (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      snapshot_date TEXT,
      time_slot TEXT,
      room_id TEXT,
      children_count INTEGER DEFAULT 0,
      staff_count INTEGER DEFAULT 0,
      required_staff INTEGER DEFAULT 0,
      is_compliant INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS medication_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL,
      medication_name TEXT,
      dosage TEXT,
      instructions TEXT,
      scheduled_date TEXT,
      scheduled_time TEXT,
      administered_at TEXT,
      administered_by TEXT,
      status TEXT DEFAULT 'pending',
      parent_authorisation INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS cwa_records (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL,
      family_account_id TEXT,
      ccs_enrolment_id TEXT,
      signed_by TEXT,
      signature_data TEXT,
      signed_at TEXT,
      effective_from TEXT,
      effective_to TEXT,
      session_details TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ddr_records (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      family_account_id TEXT,
      child_id TEXT,
      payment_method TEXT DEFAULT 'bank',
      account_name TEXT,
      bsb TEXT,
      account_number TEXT,
      card_last4 TEXT,
      card_expiry TEXT,
      debit_limit_cents INTEGER DEFAULT 25000,
      signature_data TEXT,
      signed_at TEXT,
      terms_accepted INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS parent_daily_info (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL,
      record_date TEXT,
      meals_data TEXT DEFAULT '{}',
      sunscreen_am INTEGER DEFAULT 0,
      sunscreen_pm INTEGER DEFAULT 0,
      mood TEXT,
      sleep_minutes INTEGER,
      notes TEXT,
      educator_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, child_id, record_date)
    );
    CREATE TABLE IF NOT EXISTS visitor_register (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      visitor_name TEXT NOT NULL,
      visitor_type TEXT DEFAULT 'visitor',
      organisation TEXT,
      purpose TEXT,
      host_name TEXT,
      sign_in TEXT,
      sign_out TEXT,
      visit_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Ensure educator_availability has all rostering schema columns
  [
    ['day_of_week', 'INTEGER'],
    ['available', 'INTEGER DEFAULT 1'],
    ['start_time', 'TEXT DEFAULT "06:00"'],
    ['end_time', 'TEXT DEFAULT "18:30"'],
    ['preferred', 'INTEGER DEFAULT 0'],
    ['notes', 'TEXT'],
    ['tenant_id', 'TEXT'],
  ].forEach(([col, type]) => {
    try { db.exec(`ALTER TABLE educator_availability ADD COLUMN ${col} ${type}`); } catch(e) {}
  });

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
      parent1_name TEXT, parent1_email TEXT, parent1_phone TEXT,
      parent1_relationship TEXT DEFAULT 'parent',
      parent2_name TEXT, parent2_email TEXT, parent2_phone TEXT,
      centrelink_crn TEXT, medical_notes TEXT,
      gender TEXT, language TEXT, indigenous INTEGER DEFAULT 0,
      doctor_name TEXT, doctor_phone TEXT, medicare_number TEXT,
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
      weekly_budget_cents INTEGER DEFAULT 0,
      can_start_earlier_mins INTEGER DEFAULT 0,
      can_finish_later_mins INTEGER DEFAULT 0,
      is_lunch_cover INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
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
      weekly_budget_cents INTEGER DEFAULT 0,
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
      lunch_start TEXT,
      lunch_end TEXT,
      is_lunch_cover INTEGER DEFAULT 0,
      lunch_cover_educator_id TEXT,
      qualification_required TEXT,
      is_responsible_person INTEGER DEFAULT 0,
      non_contact INTEGER DEFAULT 0,
      award_classification TEXT,
      penalty_rate_multiplier REAL DEFAULT 1.0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
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
    CREATE TABLE IF NOT EXISTS educator_special_availability (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      educator_id TEXT NOT NULL REFERENCES educators(id) ON DELETE CASCADE,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      available_days TEXT DEFAULT '[]',
      can_start_early INTEGER DEFAULT 0,
      early_start_time TEXT,
      can_stay_late INTEGER DEFAULT 0,
      late_end_time TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ─── STAFF PORTAL MESSAGING ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS staff_messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT,
      to_role TEXT,
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      thread_id TEXT,
      reply_to_id TEXT,
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_staff_msg_to ON staff_messages(to_user_id, tenant_id);
    CREATE INDEX IF NOT EXISTS idx_staff_msg_from ON staff_messages(from_user_id, tenant_id);

    -- ─── CERTIFICATION TRAINING LINKS ───────────────────────────────────────
    CREATE TABLE IF NOT EXISTS cert_training_links (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      cert_type TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      provider TEXT,
      notes TEXT,
      cost_est REAL DEFAULT 0,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ─── PROFESSIONAL DEVELOPMENT REQUESTS ──────────────────────────────────
    CREATE TABLE IF NOT EXISTS pd_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      educator_id TEXT NOT NULL REFERENCES educators(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      provider TEXT,
      url TEXT,
      start_date TEXT,
      end_date TEXT,
      location TEXT,
      delivery_mode TEXT DEFAULT 'in_person',
      cost_est REAL DEFAULT 0,
      cost_approved REAL,
      expected_outcomes TEXT,
      status TEXT DEFAULT 'pending',
      manager_notes TEXT,
      manager_feedback TEXT,
      approved_by TEXT,
      approved_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pd_educator ON pd_requests(educator_id, tenant_id);

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

  // ── v2.6.2 migration: columns that were previously in an early-run ALTER block
  // that executed before db.exec() (tables didn't exist yet on fresh DBs).
  // Now run here, after all CREATE TABLE statements, so they apply to existing DBs.
  // Fresh DBs already have these columns from the updated CREATE TABLE definitions.
  [
    // children — parent/guardian fields
    'ALTER TABLE children ADD COLUMN parent1_name TEXT',
    'ALTER TABLE children ADD COLUMN parent1_email TEXT',
    'ALTER TABLE children ADD COLUMN parent1_phone TEXT',
    "ALTER TABLE children ADD COLUMN parent1_relationship TEXT DEFAULT 'parent'",
    'ALTER TABLE children ADD COLUMN parent2_name TEXT',
    'ALTER TABLE children ADD COLUMN parent2_email TEXT',
    'ALTER TABLE children ADD COLUMN parent2_phone TEXT',
    'ALTER TABLE children ADD COLUMN centrelink_crn TEXT',
    'ALTER TABLE children ADD COLUMN medical_notes TEXT',
    'ALTER TABLE children ADD COLUMN gender TEXT',
    'ALTER TABLE children ADD COLUMN language TEXT',
    'ALTER TABLE children ADD COLUMN indigenous INTEGER DEFAULT 0',
    'ALTER TABLE children ADD COLUMN doctor_name TEXT',
    'ALTER TABLE children ADD COLUMN doctor_phone TEXT',
    'ALTER TABLE children ADD COLUMN medicare_number TEXT',
    // roster_periods — budget tracking (new, not in any prior alter block)
    'ALTER TABLE roster_periods ADD COLUMN weekly_budget_cents INTEGER DEFAULT 0',
    // roster_entries — compliance columns (new, not in prior alter blocks)
    'ALTER TABLE roster_entries ADD COLUMN qualification_required TEXT',
    'ALTER TABLE roster_entries ADD COLUMN is_responsible_person INTEGER DEFAULT 0',
    'ALTER TABLE roster_entries ADD COLUMN non_contact INTEGER DEFAULT 0',
    'ALTER TABLE roster_entries ADD COLUMN award_classification TEXT',
    'ALTER TABLE roster_entries ADD COLUMN penalty_rate_multiplier REAL DEFAULT 1.0',
    'ALTER TABLE roster_entries ADD COLUMN updated_at TEXT',
    // educators — budget (new, not in prior alter blocks)
    'ALTER TABLE educators ADD COLUMN weekly_budget_cents INTEGER DEFAULT 0',
  ].forEach(sql => { try { db.exec(sql); } catch(e) {} });

  // roster_templates — standalone CREATE (safe to run after main exec)
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS roster_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      entries TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    )`);
  } catch(e) {}

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

  // ── v2.6.2: Weekly Stories table ──────────────────────────────────────────
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS weekly_stories (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'child',
        child_id TEXT REFERENCES children(id) ON DELETE CASCADE,
        room_id TEXT REFERENCES rooms(id),
        period TEXT NOT NULL DEFAULT 'week',
        year INTEGER,
        term INTEGER,
        week_start TEXT NOT NULL,
        week_end TEXT NOT NULL,
        script TEXT NOT NULL DEFAULT '',
        music_track_id TEXT DEFAULT 'gentle-piano',
        music_track_url TEXT,
        photo_urls TEXT DEFAULT '[]',
        management_photos TEXT DEFAULT '[]',
        educators_featured TEXT DEFAULT '[]',
        centre_message TEXT DEFAULT '',
        ai_generated INTEGER DEFAULT 0,
        status TEXT DEFAULT 'draft',
        published_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_stories_tenant_week ON weekly_stories(tenant_id, week_start);
      CREATE INDEX IF NOT EXISTS idx_stories_child ON weekly_stories(child_id);
      CREATE INDEX IF NOT EXISTS idx_stories_room_wk ON weekly_stories(room_id);
      CREATE INDEX IF NOT EXISTS idx_stories_status ON weekly_stories(tenant_id, status);
    `);
  } catch(e) { console.log('weekly_stories table:', e.message); }

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

  // ═══ v2.6.2 — Missing columns + roster-schema-migration tables ══════════════
  // roster-schema-migration.js (26 tables) was never called from initDatabase().
  // All its tables are inlined here so fresh and existing DBs both work correctly.
  // Missing educator columns caused "no such column: termination_date" on roster create.

  // ── Missing educators columns ──────────────────────────────────────────────
  const educatorV241Cols = [
    'ALTER TABLE educators ADD COLUMN termination_date TEXT',
    'ALTER TABLE educators ADD COLUMN award_classification TEXT DEFAULT \'level_3\'',
    'ALTER TABLE educators ADD COLUMN is_nominated_supervisor INTEGER DEFAULT 0',
    'ALTER TABLE educators ADD COLUMN is_educational_leader INTEGER DEFAULT 0',
    'ALTER TABLE educators ADD COLUMN necwr_status TEXT DEFAULT \'not_submitted\'',
    'ALTER TABLE educators ADD COLUMN necwr_submitted_at TEXT',
    'ALTER TABLE educators ADD COLUMN necwr_number TEXT',
    'ALTER TABLE educators ADD COLUMN agency_id TEXT',
    'ALTER TABLE educators ADD COLUMN is_agency_staff INTEGER DEFAULT 0',
    'ALTER TABLE educators ADD COLUMN non_contact_hours_per_week REAL DEFAULT 0',
    'ALTER TABLE educators ADD COLUMN fatigue_consecutive_days INTEGER DEFAULT 0',
  ];
  educatorV241Cols.forEach(sql => { try { db.exec(sql); } catch(e) {} });

  // ── educator_availability: add tenant_id for direct tenant-scoped queries ──
  // (previously only scoped via JOIN through educators — now directly queryable)
  try { db.exec('ALTER TABLE educator_availability ADD COLUMN tenant_id TEXT'); } catch(e) {}
  // Add index for the new column
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_educator_avail_tenant ON educator_availability(tenant_id)'); } catch(e) {}
  // Note: back-fill of tenant_id runs after seedDemoData() so it catches all rows.

  // ── Multi-day absence support (start_date / end_date) ─────────────────────
  [
    'ALTER TABLE educator_absences ADD COLUMN start_date TEXT',
    'ALTER TABLE educator_absences ADD COLUMN end_date TEXT',
    'ALTER TABLE educator_absences ADD COLUMN days_count INTEGER DEFAULT 1',
    'ALTER TABLE educator_absences ADD COLUMN leave_request_id TEXT',
  ].forEach(sql => { try { db.exec(sql); } catch(e) {} });

  // ── Roster entries: qualification_required (used by fill requests) ─────────
  [
    'ALTER TABLE roster_entries ADD COLUMN qualification_required TEXT',
    'ALTER TABLE roster_entries ADD COLUMN is_responsible_person INTEGER DEFAULT 0',
    'ALTER TABLE roster_entries ADD COLUMN non_contact INTEGER DEFAULT 0',
    'ALTER TABLE roster_entries ADD COLUMN award_classification TEXT',
    'ALTER TABLE roster_entries ADD COLUMN penalty_rate_multiplier REAL DEFAULT 1.0',
  ].forEach(sql => { try { db.exec(sql); } catch(e) {} });

  // ── shift_fill_requests: agency cascade columns ────────────────────────────
  [
    'ALTER TABLE shift_fill_requests ADD COLUMN escalated_to_agency INTEGER DEFAULT 0',
    'ALTER TABLE shift_fill_requests ADD COLUMN agency_id TEXT',
    'ALTER TABLE shift_fill_requests ADD COLUMN agency_booking_id TEXT',
  ].forEach(sql => { try { db.exec(sql); } catch(e) {} });

  // ── v2.6.2: 26 missing roster-schema-migration tables ─────────────────────
  try {
    db.exec(`
      -- Staffing agencies
      CREATE TABLE IF NOT EXISTS staffing_agencies (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        contact_name TEXT,
        email TEXT,
        phone TEXT,
        markup_pct REAL DEFAULT 20,
        min_notice_hours INTEGER DEFAULT 2,
        qualifications_supplied TEXT DEFAULT '[]',
        notes TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_agencies_tenant ON staffing_agencies(tenant_id);

      -- Agency bookings (shift_fill_requests → agency cascade)
      CREATE TABLE IF NOT EXISTS agency_bookings (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        request_id TEXT REFERENCES shift_fill_requests(id) ON DELETE CASCADE,
        agency_id TEXT REFERENCES staffing_agencies(id),
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        qualification_required TEXT,
        room_id TEXT REFERENCES rooms(id),
        status TEXT DEFAULT 'requested',
        agency_ref TEXT,
        educator_name TEXT,
        educator_qualification TEXT,
        hourly_rate_cents INTEGER,
        markup_pct REAL DEFAULT 20,
        total_cost_cents INTEGER,
        confirmed_at TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_agency_bookings_tenant ON agency_bookings(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_agency_bookings_request ON agency_bookings(request_id);

      -- Public holidays (penalty rate trigger)
      CREATE TABLE IF NOT EXISTS public_holidays (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        name TEXT NOT NULL,
        jurisdiction TEXT DEFAULT 'NSW',
        penalty_multiplier REAL DEFAULT 2.5,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(tenant_id, date)
      );
      CREATE INDEX IF NOT EXISTS idx_holidays_tenant_date ON public_holidays(tenant_id, date);

      -- Award rate classifications
      CREATE TABLE IF NOT EXISTS award_classifications (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        level TEXT NOT NULL,
        label TEXT NOT NULL,
        base_rate_cents INTEGER NOT NULL,
        casual_loading_pct REAL DEFAULT 25,
        saturday_multiplier REAL DEFAULT 1.5,
        sunday_multiplier REAL DEFAULT 2.0,
        public_holiday_multiplier REAL DEFAULT 2.5,
        evening_multiplier REAL DEFAULT 1.15,
        evening_start_time TEXT DEFAULT '18:00',
        effective_from TEXT,
        award_name TEXT DEFAULT 'Children Services Award 2010',
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(tenant_id, level)
      );
      CREATE INDEX IF NOT EXISTS idx_award_class_tenant ON award_classifications(tenant_id);

      -- Fatigue rules
      CREATE TABLE IF NOT EXISTS fatigue_rules (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        max_consecutive_days INTEGER DEFAULT 5,
        min_hours_between_shifts REAL DEFAULT 10,
        max_hours_per_day REAL DEFAULT 12,
        max_hours_per_week REAL DEFAULT 38,
        alert_at_consecutive_days INTEGER DEFAULT 4,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(tenant_id)
      );

      -- Room groups (combined ratios for early/late)
      CREATE TABLE IF NOT EXISTS room_groups (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        room_ids TEXT DEFAULT '[]',
        ratio_basis TEXT DEFAULT 'youngest',
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_room_groups_tenant ON room_groups(tenant_id);

      CREATE TABLE IF NOT EXISTS room_group_schedules (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        group_id TEXT NOT NULL REFERENCES room_groups(id) ON DELETE CASCADE,
        schedule_type TEXT DEFAULT 'recurring',
        day_of_week INTEGER,
        specific_date TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_room_group_sched ON room_group_schedules(group_id);

      -- Activity log (educator + child paper trail)
      CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT,
        performed_by TEXT REFERENCES users(id),
        performed_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_activity_tenant ON activity_log(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);

      -- Broadcast queue (message approval workflow)
      CREATE TABLE IF NOT EXISTS broadcast_queue (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        channel TEXT DEFAULT 'email',
        recipients TEXT DEFAULT '[]',
        status TEXT DEFAULT 'pending',
        created_by TEXT REFERENCES users(id),
        approved_by TEXT REFERENCES users(id),
        approved_at TEXT,
        sent_at TEXT,
        scheduled_for TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_broadcast_tenant ON broadcast_queue(tenant_id);

      -- Parent learning input (weekly goals from families)
      CREATE TABLE IF NOT EXISTS parent_learning_input (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
        parent_user_id TEXT REFERENCES users(id),
        week_starting TEXT NOT NULL,
        goals TEXT DEFAULT '[]',
        interests TEXT,
        concerns TEXT,
        home_activities TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(tenant_id, child_id, week_starting)
      );
      CREATE INDEX IF NOT EXISTS idx_parent_input_child ON parent_learning_input(child_id);

      -- Compliance to-do list
      CREATE TABLE IF NOT EXISTS compliance_todo (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT,
        due_date TEXT,
        priority TEXT DEFAULT 'normal',
        status TEXT DEFAULT 'open',
        assigned_to TEXT REFERENCES users(id),
        resolved_by TEXT REFERENCES users(id),
        resolved_at TEXT,
        auto_generated INTEGER DEFAULT 0,
        source_scan_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_compliance_todo_tenant ON compliance_todo(tenant_id, status);

      -- Non-contact time tracking (ECT/Director planning time)
      CREATE TABLE IF NOT EXISTS non_contact_time (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        educator_id TEXT NOT NULL REFERENCES educators(id) ON DELETE CASCADE,
        roster_entry_id TEXT REFERENCES roster_entries(id),
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        hours REAL,
        activity TEXT DEFAULT 'planning',
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_nc_time_educator ON non_contact_time(educator_id);
      CREATE INDEX IF NOT EXISTS idx_nc_time_date ON non_contact_time(date);

      -- Shift swaps
      CREATE TABLE IF NOT EXISTS shift_swaps (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        requesting_educator_id TEXT NOT NULL REFERENCES educators(id),
        requested_educator_id TEXT REFERENCES educators(id),
        original_entry_id TEXT REFERENCES roster_entries(id),
        swap_entry_id TEXT REFERENCES roster_entries(id),
        status TEXT DEFAULT 'pending',
        reason TEXT,
        approved_by TEXT REFERENCES users(id),
        approved_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_shift_swaps_tenant ON shift_swaps(tenant_id);

      -- Room movement / floating assignments
      CREATE TABLE IF NOT EXISTS room_movements (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        educator_id TEXT NOT NULL REFERENCES educators(id),
        from_room_id TEXT REFERENCES rooms(id),
        to_room_id TEXT REFERENCES rooms(id),
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        reason TEXT DEFAULT 'ratio_support',
        approved_by TEXT REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_movements_tenant ON room_movements(tenant_id, date);

      -- Attendance forecasts (child attendance pattern prediction)
      CREATE TABLE IF NOT EXISTS attendance_forecasts (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        room_id TEXT REFERENCES rooms(id),
        forecast_date TEXT NOT NULL,
        day_of_week INTEGER,
        expected_children INTEGER DEFAULT 0,
        expected_absent INTEGER DEFAULT 0,
        confidence_pct REAL DEFAULT 80,
        basis TEXT DEFAULT 'historical',
        actual_children INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(tenant_id, room_id, forecast_date)
      );
      CREATE INDEX IF NOT EXISTS idx_forecast_tenant ON attendance_forecasts(tenant_id, forecast_date);

      -- RP coverage validation log
      CREATE TABLE IF NOT EXISTS rp_coverage_log (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        time_slot TEXT NOT NULL,
        rp_educator_id TEXT REFERENCES educators(id),
        is_covered INTEGER DEFAULT 0,
        gap_mins INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_rp_coverage_tenant ON rp_coverage_log(tenant_id, date);

      -- Qualification mix compliance log
      CREATE TABLE IF NOT EXISTS qualification_compliance_log (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        period_id TEXT REFERENCES roster_periods(id),
        date TEXT NOT NULL,
        total_educators INTEGER DEFAULT 0,
        diploma_or_above INTEGER DEFAULT 0,
        diploma_pct REAL DEFAULT 0,
        ect_count INTEGER DEFAULT 0,
        reg_126_met INTEGER DEFAULT 0,
        reg_127_met INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_qual_compliance ON qualification_compliance_log(tenant_id, date);

      -- NECWR submissions
      CREATE TABLE IF NOT EXISTS necwr_submissions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        educator_id TEXT NOT NULL REFERENCES educators(id),
        submission_type TEXT DEFAULT 'new_worker',
        submitted_at TEXT,
        response_code TEXT,
        necwr_number TEXT,
        status TEXT DEFAULT 'pending',
        form_data TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_necwr_educator ON necwr_submissions(educator_id);

      -- Pay periods
      CREATE TABLE IF NOT EXISTS pay_periods (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        pay_date TEXT,
        status TEXT DEFAULT 'open',
        total_gross_cents INTEGER DEFAULT 0,
        total_super_cents INTEGER DEFAULT 0,
        total_tax_cents INTEGER DEFAULT 0,
        total_net_cents INTEGER DEFAULT 0,
        educator_count INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(tenant_id, start_date)
      );
      CREATE INDEX IF NOT EXISTS idx_pay_periods_tenant ON pay_periods(tenant_id);

      -- Educator pay lines
      CREATE TABLE IF NOT EXISTS pay_lines (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        pay_period_id TEXT REFERENCES pay_periods(id) ON DELETE CASCADE,
        educator_id TEXT NOT NULL REFERENCES educators(id),
        hours_worked REAL DEFAULT 0,
        hours_public_holiday REAL DEFAULT 0,
        hours_saturday REAL DEFAULT 0,
        hours_sunday REAL DEFAULT 0,
        hours_evening REAL DEFAULT 0,
        base_rate_cents INTEGER DEFAULT 0,
        gross_cents INTEGER DEFAULT 0,
        super_cents INTEGER DEFAULT 0,
        tax_cents INTEGER DEFAULT 0,
        net_cents INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_pay_lines_period ON pay_lines(pay_period_id);

      -- Educator performance reviews
      CREATE TABLE IF NOT EXISTS performance_reviews (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        educator_id TEXT NOT NULL REFERENCES educators(id),
        reviewer_id TEXT REFERENCES users(id),
        review_date TEXT NOT NULL,
        review_period TEXT,
        overall_rating INTEGER,
        strengths TEXT,
        improvements TEXT,
        goals TEXT DEFAULT '[]',
        status TEXT DEFAULT 'draft',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_educator ON performance_reviews(educator_id);

      -- Roster compliance alerts
      CREATE TABLE IF NOT EXISTS roster_compliance_alerts (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        period_id TEXT REFERENCES roster_periods(id),
        date TEXT,
        alert_type TEXT NOT NULL,
        severity TEXT DEFAULT 'warning',
        regulation TEXT,
        description TEXT NOT NULL,
        room_id TEXT REFERENCES rooms(id),
        educator_id TEXT REFERENCES educators(id),
        resolved INTEGER DEFAULT 0,
        resolved_by TEXT REFERENCES users(id),
        resolved_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_roster_alerts_tenant ON roster_compliance_alerts(tenant_id, resolved);

      -- Cost calculations cache
      CREATE TABLE IF NOT EXISTS roster_cost_cache (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        period_id TEXT REFERENCES roster_periods(id) ON DELETE CASCADE,
        educator_id TEXT REFERENCES educators(id),
        date TEXT NOT NULL,
        hours_regular REAL DEFAULT 0,
        hours_overtime REAL DEFAULT 0,
        hours_public_holiday REAL DEFAULT 0,
        base_cost_cents INTEGER DEFAULT 0,
        penalty_cost_cents INTEGER DEFAULT 0,
        total_cost_cents INTEGER DEFAULT 0,
        calculated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_cost_cache_period ON roster_cost_cache(period_id);
    `);
    console.log('  ✓ v2.6.2: roster-schema-migration tables created');
  } catch(e) { console.log('  ⚠ v2.6.2 roster schema error:', e.message); }

  // ── Seed missing roster-enhancement data for demo tenant ──────────────────
  try {
    const hasFatigue = db.prepare("SELECT COUNT(*) as c FROM fatigue_rules WHERE tenant_id='demo-tenant-001'").get();
    if (!hasFatigue?.c) {
      db.prepare("INSERT OR IGNORE INTO fatigue_rules (id,tenant_id,max_consecutive_days,min_hours_between_shifts,max_hours_per_day,max_hours_per_week,alert_at_consecutive_days) VALUES(?,?,?,?,?,?,?)")
        .run(randomUUID(), 'demo-tenant-001', 5, 10, 12, 38, 4);

      // Award classifications (Children Services Award 2010 — NSW 2026 rates)
      const awardLevels = [
        { level:'level_1', label:'Level 1 — Entry/Unqualified',            rate:2438 },
        { level:'level_2', label:'Level 2 — Working Towards Cert III',     rate:2701 },
        { level:'level_3', label:'Level 3 — Certificate III',              rate:2985 },
        { level:'level_4', label:'Level 4 — Diploma',                      rate:3312 },
        { level:'level_5', label:'Level 5 — Diploma + Experience',         rate:3678 },
        { level:'level_6', label:'Level 6 — Bachelor/ECT',                 rate:4200 },
      ];
      awardLevels.forEach(a => {
        db.prepare("INSERT OR IGNORE INTO award_classifications (id,tenant_id,level,label,base_rate_cents,casual_loading_pct,saturday_multiplier,sunday_multiplier,public_holiday_multiplier,evening_multiplier) VALUES(?,?,?,?,?,25,1.5,2.0,2.5,1.15)")
          .run(randomUUID(), 'demo-tenant-001', a.level, a.label, a.rate);
      });

      // NSW 2026 public holidays
      const nsw2026Holidays = [
        { date:'2026-01-01', name:"New Year's Day" },
        { date:'2026-01-26', name:'Australia Day' },
        { date:'2026-04-03', name:'Good Friday' },
        { date:'2026-04-04', name:'Easter Saturday' },
        { date:'2026-04-05', name:'Easter Sunday' },
        { date:'2026-04-06', name:'Easter Monday' },
        { date:'2026-04-25', name:'ANZAC Day' },
        { date:'2026-06-08', name:"Queen's Birthday" },
        { date:'2026-08-03', name:'Bank Holiday' },
        { date:'2026-10-05', name:'Labour Day' },
        { date:'2026-12-25', name:'Christmas Day' },
        { date:'2026-12-26', name:'Boxing Day' },
        { date:'2026-12-28', name:'Boxing Day (observed)' },
      ];
      nsw2026Holidays.forEach(h => {
        db.prepare("INSERT OR IGNORE INTO public_holidays (id,tenant_id,date,name,jurisdiction,penalty_multiplier) VALUES(?,?,?,?,?,?)")
          .run(randomUUID(), 'demo-tenant-001', h.date, h.name, 'NSW', 2.5);
      });

      // 3 staffing agencies
      const agencies = [
        { name:'Childcare Staffing Solutions', contact:'Joanne Reid', email:'j.reid@css.com.au', phone:'02 9555 1234', markup:20 },
        { name:'Early Learning Recruitment', email:'ops@elr.com.au', phone:'02 9555 5678', markup:22 },
        { name:'Metro Casual Educators', email:'book@metrocasual.com.au', phone:'02 9555 9012', markup:18 },
      ];
      agencies.forEach(a => {
        db.prepare("INSERT OR IGNORE INTO staffing_agencies (id,tenant_id,name,contact_name,email,phone,markup_pct,min_notice_hours,qualifications_supplied) VALUES(?,?,?,?,?,?,?,?,?)")
          .run(randomUUID(), 'demo-tenant-001', a.name, a.contact||null, a.email, a.phone, a.markup, 2,
            '["cert3","diploma","ect"]');
      });

      // Room groups (early morning / late afternoon combines)
      const groupData = [
        { name:'Early Morning Combined', desc:'6:00–8:00 — Joeys + Possums combined', rooms:['room-joeys','room-possums'], start:'06:00', end:'08:00', dow:null },
        { name:'Late Afternoon Combined', desc:'5:00–6:30 — Koalas + Kookaburras combined', rooms:['room-koalas','room-kookas'], start:'17:00', end:'18:30', dow:null },
        { name:'Friday Combined', desc:'Friday 3:30–6:30 — all 4+ rooms combined', rooms:['room-koalas','room-kookas'], start:'15:30', end:'18:30', dow:5 },
      ];
      groupData.forEach(g => {
        const gid = randomUUID();
        db.prepare("INSERT OR IGNORE INTO room_groups (id,tenant_id,name,description,room_ids,ratio_basis) VALUES(?,?,?,?,?,?)")
          .run(gid, 'demo-tenant-001', g.name, g.desc, JSON.stringify(g.rooms), 'youngest');
        db.prepare("INSERT OR IGNORE INTO room_group_schedules (id,tenant_id,group_id,schedule_type,day_of_week,start_time,end_time) VALUES(?,?,?,?,?,?,?)")
          .run(randomUUID(), 'demo-tenant-001', gid, g.dow ? 'specific_day' : 'recurring', g.dow, g.start, g.end);
      });
      console.log('  ✓ v2.6.2: fatigue rules, award classifications, public holidays, agencies, room groups seeded');
    }
  } catch(e) { console.log('  ⚠ v2.6.2 roster seed error:', e.message); }

  // Seed demo data if fresh DB

  // ── v2.6.2: weekly_stories new columns for term/year stories ──────────────
  [
    "ALTER TABLE weekly_stories ADD COLUMN period TEXT DEFAULT 'week'",
    "ALTER TABLE weekly_stories ADD COLUMN year INTEGER",
    "ALTER TABLE weekly_stories ADD COLUMN term INTEGER",
    "ALTER TABLE weekly_stories ADD COLUMN management_photos TEXT DEFAULT '[]'",
    "ALTER TABLE weekly_stories ADD COLUMN educators_featured TEXT DEFAULT '[]'",
    "ALTER TABLE weekly_stories ADD COLUMN centre_message TEXT DEFAULT ''",
  ].forEach(sql => { try { db.exec(sql); } catch(e) {} });

  seedDemoData(db);

  // Back-fill educator_availability.tenant_id after seeding (catches both existing and freshly-seeded rows)
  try {
    db.exec(`UPDATE educator_availability SET tenant_id = (
      SELECT e.tenant_id FROM educators e WHERE e.id = educator_availability.educator_id
    ) WHERE tenant_id IS NULL`);
  } catch(e) {}

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
    try {
      db.prepare('INSERT OR IGNORE INTO nqs_self_assessment (id,tenant_id,quality_area,standard,element,current_rating,evidence,improvement_notes,assessed_by) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(randomUUID(), tenantId, a.qa, a.std, a.el, a.rating, a.evidence, a.notes, 'Demo Director');
    } catch(e) {}
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
    try {
      db.prepare('INSERT OR IGNORE INTO qip_goals (id,tenant_id,quality_area,goal,actions,responsible,timeline,progress,status) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(randomUUID(), tenantId, g.qa, g.goal, g.actions, g.responsible, g.timeline, g.progress, g.status);
    } catch(e) {}
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
    try {
      db.prepare('INSERT OR IGNORE INTO ccs_session_reports (id,tenant_id,child_id,week_starting,hours_submitted,fee_charged_cents,ccs_percentage,ccs_amount_cents,gap_fee_cents,absent_days,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(randomUUID(), r.tid, r.cid, r.week, r.hrs, r.fee, r.pct, r.ccs, r.gap, r.abs, r.status);
    } catch(e) {}
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
    try {
      db.prepare('INSERT OR IGNORE INTO parent_feedback (id,tenant_id,parent_name,feedback_type,rating,message,sentiment_score,category) VALUES(?,?,?,?,?,?,?,?)')
        .run(randomUUID(), f.tid, f.pn, f.type, f.rating, f.msg, f.sent, f.cat);
    } catch(e) {}
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
      db.prepare('INSERT OR IGNORE INTO educator_availability (id,educator_id,tenant_id,day_of_week,available,start_time,end_time,preferred) VALUES(?,?,?,?,?,?,?,?)')
        .run(randomUUID(), eid, tenantId, d, pat[d], starts[idx]||'06:00', ends[idx]||'18:30', d < 5 ? 1 : 0);
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
    .run(periodId, tenantId, 'weekly', '2026-02-23', '2026-02-27', 'draft', 'ai', 280, 980000, 96);

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
        db.prepare('INSERT OR IGNORE INTO ccs_details (id,tenant_id,child_id,crn,ccs_percentage,ccs_hours_fortnight,last_synced) VALUES(?,?,?,?,?,?,?)')
          .run(randomUUID(), tenantId, kid.id, c.crn, c.pct, 100, today);
      } catch(e){}
    });

    // ── INVOICES (last 3 months + this month) ─────────────────────────────────
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
          // total_fee, ccs_amount, gap_fee, amount_due are REAL (dollars), not cents
          const totalFeeDollars   = grossFee / 100;
          const ccsAmtDollars     = ccsAmt / 100;
          const parentPayDollars  = parentPayable / 100;
          const periodEnd = `${mStr}-${String(daysInMonth).padStart(2,'0')}`;
          db.prepare('INSERT OR IGNORE INTO invoices (id,tenant_id,child_id,invoice_number,period_start,period_end,due_date,sessions,total_fee,ccs_amount,gap_fee,amount_due,status,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            .run(invId, tenantId, kid.id, `INV-${invNum++}`,
              invoiceDate, periodEnd, dueDate,
              sessionCount, totalFeeDollars, ccsAmtDollars, parentPayDollars, parentPayDollars,
              status, `Monthly invoice — ${cd.days.length} days/week attendance`,
              invoiceDate + 'T08:00:00Z');
          // Add payment record for paid invoices
          if (status === 'paid') {
            try {
              // payments.amount is REAL (dollars); columns: amount, method, reference, status
              db.prepare('INSERT OR IGNORE INTO payments (id,tenant_id,invoice_id,child_id,amount,method,reference,status,payment_date) VALUES(?,?,?,?,?,?,?,?,?)')
                .run(randomUUID(), tenantId, invId, kid.id,
                  parentPayDollars,
                  ['bank_transfer','direct_debit','credit_card'][invNum % 3],
                  `PAY-${invNum}-${kid.first_name.toUpperCase()}`,
                  'completed', dueDate);
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
          .run(uid, pl.email, phash, pl.name, 'email');
        // Link parent to the tenant so they can access the parent portal
        db.prepare('INSERT OR IGNORE INTO tenant_members (id,user_id,tenant_id,role) VALUES(?,?,?,?)')
          .run(randomUUID(), uid, tenantId, 'parent');
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


  // ── v2.6.2 seed: Rich story data for testing weekly/term/year stories ────────
  try {
    const kids = db.prepare("SELECT id, first_name, last_name, room_id FROM children WHERE tenant_id='demo-tenant-001' AND active=1 ORDER BY rowid").all();
    if (kids.length) {
      const tid = 'demo-tenant-001';
      const adminId = 'demo-admin-001';
      const edList = db.prepare("SELECT id, first_name FROM educators WHERE tenant_id=? ORDER BY rowid LIMIT 4").all(tid);
      const edId0 = edList[0]?.id;
      const edId1 = edList[1]?.id || edList[0]?.id;

      // Date helpers
      const ago = (n) => { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; };
      const yr = (y,m,d) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

      const EYLF = [1,2,3,4,5];
      const observations_data = [
        // Last week
        { child: kids[0], date: ago(1), narrative: "Olivia demonstrated remarkable curiosity during our nature walk today. She carefully collected leaves of different shapes and sizes, asking thoughtful questions about why they change colour. She counted 12 leaves and sorted them by size — showing strong numeracy skills and scientific thinking.", type: "learning", edu: edId0 },
        { child: kids[0], date: ago(2), narrative: "During free play, Olivia led a group of three friends in a pretend café game. She assigned roles, created a menu using drawings, and used real counting when 'charging' for items. Her language skills and social confidence are blossoming.", type: "learning", edu: edId0 },
        { child: kids[1], date: ago(1), narrative: "Liam showed wonderful persistence with the new puzzle today. After initial frustration, he took a breath and tried a different strategy — rotating pieces and working from the edges. When he finished, his pride was infectious! He immediately invited two friends to 'look what I did'.", type: "observation", edu: edId1 },
        { child: kids[2], date: ago(2), narrative: "Isla engaged beautifully with the watercolour painting activity. She experimented with mixing colours, narrating her process: 'Blue and yellow makes green — it's like magic!' She created a detailed picture of her family with careful attention to each person.", type: "learning", edu: edId0 },
        { child: kids[3], date: ago(1), narrative: "Noah showed outstanding leadership skills during outdoor play today. When a younger child fell and was upset, Noah immediately came to comfort them, fetched a tissue, and stayed with them until they felt better. He then organised a new game to include the child.", type: "observation", edu: edId1 },
        // 2 weeks ago
        { child: kids[0], date: ago(8), narrative: "Olivia spent the morning deeply engaged with the block construction area. She built an elaborate multi-storey 'apartment building' and explained each floor's purpose in detail. She problem-solved independently when her structure was unstable, adding a wider base.", type: "jotting", edu: edId0 },
        { child: kids[0], date: ago(9), narrative: "During story time, Olivia predicted what would happen next in the book before the page was turned — correctly twice! She related the story to her own experience: 'That happened to me at the beach!' Excellent comprehension and personal connection.", type: "learning", edu: edId1 },
        { child: kids[1], date: ago(10), narrative: "Liam showed growing independence in his self-care routine today. He carefully put on his own shoes and attempted the velcro straps multiple times without giving up. He celebrated with a big smile when he succeeded. Beautiful moment of self-efficacy.", type: "observation", edu: edId0 },
        // Term (2+ months ago)
        { child: kids[0], date: yr(2026,1,15), narrative: "Olivia's first week back — she settled beautifully, greeting each friend by name. She showed the new children around the room, pointing out her favourite areas with pride. Already demonstrating community belonging.", type: "learning", edu: edId0 },
        { child: kids[0], date: yr(2026,1,28), narrative: "Extraordinary creative play today. Olivia directed a 20-minute dramatic play sequence about a vet clinic, assigning roles and narrating the story as it unfolded. Her vocabulary, imagination and leadership continue to impress.", type: "learning", edu: edId1 },
        { child: kids[0], date: yr(2026,2,10), narrative: "Olivia has been exploring number patterns in everything she sees. Today she found patterns in the floor tiles, in the leaves outside, and arranged paint drops in sequences. Mathematical thinking emerging in beautiful, creative ways.", type: "jotting", edu: edId0 },
        { child: kids[0], date: yr(2026,2,20), narrative: "Wonderful moment during group time — Olivia brought a book from home and insisted on 'reading' it to the class. She retold the story from memory with remarkable accuracy and expression, holding the book and turning pages at appropriate moments.", type: "learning", edu: edId1 },
        // Year (spread across 2025)
        { child: kids[0], date: yr(2025,3,5), narrative: "Olivia's first excursion to the library — her excitement was contagious! She carefully chose three books and whispered respectfully the whole time. She's developed a deep love of stories this year.", type: "learning", edu: edId0 },
        { child: kids[0], date: yr(2025,5,15), narrative: "Olivia confidently taught a small group how to plant seeds in the garden today. She recalled every step from our project last week and used correct vocabulary: 'seedling', 'roots', 'nutrients'. Peer teaching at its finest.", type: "learning", edu: edId0 },
        { child: kids[0], date: yr(2025,7,22), narrative: "Mid-year: Olivia's growth has been remarkable. She navigates complex social situations with empathy, her fine motor skills have blossomed, and she approaches challenges with a 'growth mindset'. A truly remarkable child.", type: "learning", edu: edId1 },
        { child: kids[0], date: yr(2025,10,3), narrative: "Olivia's language has exploded this term. She's using sophisticated vocabulary ('fascinating', 'I hypothesis that...', 'actually, I think...'), asking deep questions and engaging in philosophical conversations with peers and educators.", type: "learning", edu: edId0 },
        { child: kids[0], date: yr(2025,11,15), narrative: "As the year draws to a close, Olivia has become a cornerstone of our community. Her kindness, curiosity and joy are gifts to everyone around her. She's grown immeasurably — in confidence, in skills, and in her sense of who she is.", type: "learning", edu: edId1 },
      ];

      const obsStmt = db.prepare('INSERT OR IGNORE INTO observations (id,tenant_id,child_id,educator_id,type,narrative,domains,eylf_outcomes,timestamp) VALUES(?,?,?,?,?,?,?,?,?)');
      observations_data.forEach(o => {
        try { obsStmt.run(randomUUID(), tid, o.child.id, o.edu, o.type, o.narrative, '[]', '[1,4]', o.date+'T09:30:00'); } catch(e){}
      });

      // Learning stories
      const storyData = [
        // Last week
        { title:"Nature Explorers", content:"This week our children became scientists! Armed with magnifying glasses, they explored our garden discovering bugs, leaves and puddles. Olivia led the group in collecting specimens for our 'nature museum'. The curiosity and wonder on every face was extraordinary.", date: ago(3), room:'room-possums', kids:[kids[0]?.id,kids[4]?.id].filter(Boolean) },
        { title:"Master Builders", content:"The block corner became an engineering workshop this week. Children worked collaboratively to build the tallest tower possible, problem-solving and negotiating as they went. Concepts of balance, weight and measurement emerged naturally.", date: ago(4), room:'room-koalas', kids:[kids[2]?.id,kids[5]?.id].filter(Boolean) },
        // 2 weeks ago
        { title:"Our Garden Project", content:"Week two of our garden project — children planted sunflower seeds, watered them carefully and made predictions about how tall they would grow. The anticipation and responsibility they're showing is beautiful.", date: ago(9), room:'room-possums', kids:[kids[0]?.id,kids[1]?.id,kids[4]?.id].filter(Boolean) },
        { title:"Friendship Week", content:"We celebrated friendship this week with activities exploring what makes a good friend. Children drew portraits of their friends, wrote friendship cards and shared what they love about the people in their lives.", date: ago(11), room:'room-koalas', kids:[kids[2]?.id,kids[3]?.id,kids[5]?.id].filter(Boolean) },
        // Term stories
        { title:"Welcome to Term 1!", content:"What an incredible start to the year! Children arrived with such energy and curiosity, diving straight into new experiences. This term we focused on building our community, getting to know each other, and establishing our learning routines.", date: yr(2026,1,30), room:'room-possums', kids:[kids[0]?.id].filter(Boolean) },
        { title:"Our Sustainability Project", content:"This term's big project — exploring sustainability. Children investigated recycling, created art from repurposed materials, and planted our vegetable garden. The depth of their thinking about caring for our world has been remarkable.", date: yr(2026,2,14), room:'room-possums', kids:[kids[0]?.id,kids[4]?.id].filter(Boolean) },
        { title:"Families and Community", content:"A beautiful exploration of families in all their wonderful diversity. Children shared family photos, cooked traditional recipes and taught each other words in different languages. Our community became richer for it.", date: yr(2026,2,25), room:'room-possums', kids:[kids[0]?.id].filter(Boolean) },
        // Year stories (2025)
        { title:"Olivia Finds Her Voice", content:"A milestone moment this term — Olivia volunteered to lead morning circle for the first time. Her confidence in sharing her ideas with the group has grown enormously. From tentative whispers in January to a clear, proud voice leading her peers.", date: yr(2025,4,10), room:'room-possums', kids:[kids[0]?.id].filter(Boolean) },
        { title:"The Great Bug Hunt", content:"Our most popular project this year! Children spent three weeks investigating the insects in our garden. They created field guides, wrote observational journals and presented their findings to families. Scientific thinking at its most beautiful.", date: yr(2025,6,20), room:'room-possums', kids:[kids[0]?.id].filter(Boolean) },
        { title:"100 Days Smarter!", content:"We celebrated our 100th day of the year with 100-themed activities. Children showed how much they've grown — literally and figuratively. Looking back at their work from Term 1, every child could see their own progress.", date: yr(2025,9,5), room:'room-possums', kids:[kids[0]?.id,kids[4]?.id].filter(Boolean) },
        { title:"End of Year Celebration", content:"What a year to remember! Every child has grown in ways that continue to amaze us. Their kindness, curiosity, resilience and joy fill our room every single day. We are so proud of each and every one of them.", date: yr(2025,12,5), room:'room-possums', kids:[kids[0]?.id].filter(Boolean) },
      ];

      const stmtStory = db.prepare('INSERT OR IGNORE INTO learning_stories (id,tenant_id,title,content,type,room_id,date,child_ids,eylf_outcomes,visible_to_parents,educator_id,published) VALUES(?,?,?,?,?,?,?,?,?,1,?,1)');
      storyData.forEach(s => {
        try { stmtStory.run(randomUUID(), tid, s.title, s.content, 'group', s.room, s.date, JSON.stringify(s.kids), JSON.stringify([1,4,5]), edId0); } catch(e){}
      });

      // Daily activity updates (the kind that feed stories)
      const activityNotes = [
        // Last week
        { note:"Painted with watercolours — mixed colours independently and created a beautiful rainbow landscape", day: ago(1) },
        { note:"Engaged in dramatic play as a 'doctor' — used correct vocabulary and showed empathy to patients", day: ago(2) },
        { note:"Built a marble run and tested different slopes to make the marble go faster — physics in action!", day: ago(3) },
        { note:"Read a picture book to two younger friends, using different voices for each character", day: ago(4) },
        { note:"Collaborated with peers to create a large floor map of our neighbourhood using blocks and toys", day: ago(5) },
        // 2 weeks ago
        { note:"Participated enthusiastically in yoga session — helped demonstrate poses to peers", day: ago(8) },
        { note:"Created a detailed self-portrait using mirrors — remarkable attention to detail", day: ago(9) },
        { note:"Explored musical instruments — experimented with rhythm and composed a simple song", day: ago(10) },
        // Term
        { note:"Led the composting activity — remembered every step and taught two friends how to do it", day: yr(2026,2,5) },
        { note:"Shared a story about her weekend in morning meeting — spoke clearly and answered questions confidently", day: yr(2026,2,12) },
        { note:"Completed a 48-piece puzzle independently — first time achieving this milestone!", day: yr(2026,1,22) },
        // Year
        { note:"First day back — settled beautifully and immediately included new children in play", day: yr(2025,2,3) },
        { note:"Science experiment: making volcanoes with bicarb and vinegar — squealed with delight!", day: yr(2025,5,20) },
        { note:"Helped organise the book corner — categorised books by type and made labels", day: yr(2025,8,10) },
        { note:"Year-end concert practice — performed a song with growing confidence each rehearsal", day: yr(2025,11,20) },
      ];

      const stmtAct = db.prepare('INSERT OR IGNORE INTO daily_updates (id,tenant_id,child_id,educator_id,update_date,category,notes) VALUES(?,?,?,?,?,?,?)');
      activityNotes.forEach(a => {
        try { stmtAct.run(randomUUID(), tid, kids[0].id, edId0, a.day, 'activity', a.note); } catch(e){}
      });
      // Add some for other children too
      try { stmtAct.run(randomUUID(), tid, kids[1]?.id, edId0, ago(1), 'activity', 'Completed first solo painting — chose colours purposefully and described his artwork in detail'); } catch(e){}
      try { stmtAct.run(randomUUID(), tid, kids[2]?.id, edId0, ago(2), 'activity', 'Led the group in a nature scavenger hunt — used observational skills and helped friends find items'); } catch(e){}
      try { stmtAct.run(randomUUID(), tid, kids[3]?.id, edId1, ago(1), 'activity', 'Constructed an elaborate train track system, negotiating with peers and problem-solving independently'); } catch(e){}

      // EYLF progress records
      const eylfData = [
        { child: kids[0], outcome:1, sub:'belonging', level:4, note:'Strong sense of identity and belonging in our community', date: ago(5) },
        { child: kids[0], outcome:4, sub:'problem_solving', level:4, note:'Approaches new challenges with confidence and creativity', date: ago(10) },
        { child: kids[0], outcome:5, sub:'language', level:5, note:'Rich, sophisticated vocabulary and excellent communication skills', date: ago(7) },
        { child: kids[0], outcome:3, sub:'wellbeing', level:4, note:'Demonstrates excellent emotional regulation and self-care', date: ago(14) },
        { child: kids[0], outcome:2, sub:'community', level:4, note:'Shows deep understanding of community roles and responsibilities', date: ago(20) },
        // Term records (older)
        { child: kids[0], outcome:1, sub:'identity', level:3, note:'Beginning to articulate personal values and preferences with confidence', date: yr(2026,2,1) },
        { child: kids[0], outcome:4, sub:'literacy', level:4, note:'Recognising and writing own name, showing interest in letters', date: yr(2026,1,20) },
        // Year records
        { child: kids[0], outcome:4, sub:'numeracy', level:3, note:'Counting to 20, beginning to recognise number patterns', date: yr(2025,4,1) },
        { child: kids[0], outcome:5, sub:'communication', level:4, note:'Using complex sentences and narrative structure in storytelling', date: yr(2025,7,1) },
        { child: kids[0], outcome:1, sub:'confidence', level:5, note:'Outstanding growth in self-confidence and agency across the year', date: yr(2025,11,1) },
      ];

      const stmtEylf = db.prepare('INSERT OR IGNORE INTO child_eylf_progress (id,tenant_id,child_id,eylf_outcome,sub_outcome,level,notes,progressed_by,progressed_at) VALUES(?,?,?,?,?,?,?,?,?)');
      eylfData.forEach(e => {
        try { stmtEylf.run(randomUUID(), tid, e.child.id, e.outcome, e.sub, e.level, e.note, edId0, e.date+'T10:00:00'); } catch(e){}
      });

      console.log('  ✓ v2.6.2: Story seed data added — observations, learning stories, activities, EYLF progress, photos');

      // ── Story photos — real Unsplash childcare/kids photos (free to use) ────
      // Attach photos to learning stories so they appear in story player
      const storyRows = db.prepare("SELECT id FROM learning_stories WHERE tenant_id=? ORDER BY rowid LIMIT 11").all(tid);
      const photoSets = [
        // Week stories (last 2 stories)
        ["https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=600","https://images.unsplash.com/photo-1544776193-352d25ca82cd?w=600"],
        ["https://images.unsplash.com/photo-1484820540004-14229fe36ca4?w=600","https://images.unsplash.com/photo-1612169998381-5e6bbaa02e05?w=600","https://images.unsplash.com/photo-1509062522246-3755977927d7?w=600"],
        ["https://images.unsplash.com/photo-1471897488648-5eae4ac6d485?w=600","https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=600"],
        ["https://images.unsplash.com/photo-1474978528675-4a50a4508dc5?w=600","https://images.unsplash.com/photo-1567593810070-7a3d471af022?w=600"],
        // Term stories
        ["https://images.unsplash.com/photo-1602081957921-9137a5d6eaee?w=600","https://images.unsplash.com/photo-1503444200347-fa86187a2797?w=600","https://images.unsplash.com/photo-1604881990409-b9f246db39da?w=600"],
        ["https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=600","https://images.unsplash.com/photo-1543248939-ff40856f65d4?w=600"],
        ["https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=600","https://images.unsplash.com/photo-1594381898411-846e7d193883?w=600","https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=600"],
        // Year stories
        ["https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=600","https://images.unsplash.com/photo-1484820540004-14229fe36ca4?w=600","https://images.unsplash.com/photo-1471897488648-5eae4ac6d485?w=600","https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=600"],
        ["https://images.unsplash.com/photo-1602081957921-9137a5d6eaee?w=600","https://images.unsplash.com/photo-1604881990409-b9f246db39da?w=600","https://images.unsplash.com/photo-1503444200347-fa86187a2797?w=600"],
        ["https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=600","https://images.unsplash.com/photo-1612169998381-5e6bbaa02e05?w=600","https://images.unsplash.com/photo-1509062522246-3755977927d7?w=600","https://images.unsplash.com/photo-1567593810070-7a3d471af022?w=600"],
        ["https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=600","https://images.unsplash.com/photo-1484820540004-14229fe36ca4?w=600","https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=600","https://images.unsplash.com/photo-1602081957921-9137a5d6eaee?w=600","https://images.unsplash.com/photo-1471897488648-5eae4ac6d485?w=600"],
      ];
      const stmtPhoto = db.prepare('INSERT OR IGNORE INTO story_photos (id,tenant_id,story_id,url,caption,tagged_child_ids,sort_order) VALUES(?,?,?,?,?,?,?)');
      storyRows.forEach((row, si) => {
        const photos = photoSets[si % photoSets.length] || [];
        photos.forEach((url, pi) => {
          try { stmtPhoto.run(randomUUID(), tid, row.id, url, null, JSON.stringify(kids[0]?[kids[0].id]:[]), pi); } catch(e){}
        });
      });

      // Also seed photo_url on some daily_updates so they show in the photo collage
      const photoUrls = [
        "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=400",
        "https://images.unsplash.com/photo-1484820540004-14229fe36ca4?w=400",
        "https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=400",
        "https://images.unsplash.com/photo-1471897488648-5eae4ac6d485?w=400",
        "https://images.unsplash.com/photo-1612169998381-5e6bbaa02e05?w=400",
        "https://images.unsplash.com/photo-1602081957921-9137a5d6eaee?w=400",
        "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=400",
        "https://images.unsplash.com/photo-1543248939-ff40856f65d4?w=400",
      ];
      // Update some of the activity daily_updates rows with photos
      const actRows = db.prepare("SELECT id FROM daily_updates WHERE tenant_id=? AND child_id=? AND category='activity' AND photo_url IS NULL LIMIT 8").all(tid, kids[0]?.id);
      actRows.forEach((row, i) => {
        try { db.prepare("UPDATE daily_updates SET photo_url=? WHERE id=?").run(photoUrls[i % photoUrls.length], row.id); } catch(e){}
      });
    }
  } catch(e) { console.log('  ⚠ v2.6.2 story seed error:', e.message); }

  // ── v2.6.2 seed: Educator clock records for ratio report testing ──────────
  try {
    const edList = db.prepare("SELECT id, user_id FROM educators WHERE tenant_id='demo-tenant-001' ORDER BY rowid LIMIT 8").all();
    if (edList.length > 0) {
      const stmtClock = db.prepare('INSERT OR IGNORE INTO clock_records (id,tenant_id,member_id,clock_in,clock_out,date) VALUES(?,?,?,?,?,?)');
      const shifts = [
        { start: '07:00', end: '15:30' },
        { start: '08:00', end: '16:30' },
        { start: '09:00', end: '17:30' },
        { start: '11:30', end: '20:00' },
      ];
      for (let d = 0; d < 30; d++) {
        const date = new Date(); date.setDate(date.getDate() - d);
        if (date.getDay() === 0 || date.getDay() === 6) continue;
        const dateStr = date.toISOString().split('T')[0];
        edList.forEach((ed, idx) => {
          const shift = shifts[idx % shifts.length];
          // ~85% attendance
          if (Math.random() > 0.85) return;
          const memberId = ed.id;
          try {
            const [sh,sm] = shift.start.split(':').map(Number);
            const [eh,em] = shift.end.split(':').map(Number);
            const hrs = Math.round(((eh*60+em)-(sh*60+sm)-30)/60*10)/10;
            stmtClock.run(randomUUID(), 'demo-tenant-001', memberId, memberId, shift.start, shift.end, dateStr, dateStr, hrs, 30);
          } catch(e){}
        });
      }
      console.log('  ✓ v2.6.2: Educator clock records seeded for ratio report (30 days)');
    }
  } catch(e) { console.log('  ⚠ v2.6.2 clock seed error:', e.message); }

  try { db.exec(`CREATE TABLE IF NOT EXISTS educator_special_availability (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, educator_id TEXT NOT NULL,
    start_date TEXT NOT NULL, end_date TEXT NOT NULL, available_days TEXT DEFAULT '[]',
    can_start_early INTEGER DEFAULT 0, early_start_time TEXT,
    can_stay_late INTEGER DEFAULT 0, late_end_time TEXT, notes TEXT,
    created_at TEXT DEFAULT (datetime('now')))`); } catch(e) {}
    // v2.6.7: staff messages, cert links, PD requests
  try { db.exec("CREATE TABLE IF NOT EXISTS staff_messages (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, from_user_id TEXT NOT NULL, to_user_id TEXT, to_role TEXT, subject TEXT DEFAULT '', body TEXT NOT NULL, thread_id TEXT, reply_to_id TEXT, read_at TEXT, created_at TEXT DEFAULT (datetime('now')))"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS cert_training_links (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, cert_type TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, provider TEXT, notes TEXT, cost_est REAL DEFAULT 0, created_by TEXT, created_at TEXT DEFAULT (datetime('now')))"); } catch(e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS pd_requests (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, educator_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, provider TEXT, url TEXT, start_date TEXT, end_date TEXT, location TEXT, delivery_mode TEXT DEFAULT 'in_person', cost_est REAL DEFAULT 0, cost_approved REAL, expected_outcomes TEXT, status TEXT DEFAULT 'pending', manager_notes TEXT, manager_feedback TEXT, approved_by TEXT, approved_at TEXT, completed_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))"); } catch(e) {}


  // v2.8.0: Events+RSVP, Community Posts, Story Reactions, Policy Docs, Checklists
  const v280tables = [
    // ── CENTRE EVENTS + RSVP ──────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS centre_events (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT, event_type TEXT DEFAULT 'general',
      event_date TEXT NOT NULL, start_time TEXT, end_time TEXT, location TEXT,
      all_rooms INTEGER DEFAULT 1, room_ids TEXT DEFAULT '[]',
      rsvp_required INTEGER DEFAULT 0, rsvp_deadline TEXT,
      max_attendees INTEGER, photo_url TEXT,
      created_by TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_event_tenant_date ON centre_events(tenant_id, event_date)`,

    `CREATE TABLE IF NOT EXISTS event_rsvps (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES centre_events(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL, child_id TEXT, parent_user_id TEXT,
      status TEXT DEFAULT 'attending', guest_count INTEGER DEFAULT 1,
      notes TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvp_unique ON event_rsvps(event_id, child_id)`,
    `CREATE INDEX IF NOT EXISTS idx_rsvp_event ON event_rsvps(event_id)`,

    // ── COMMUNITY POSTS (family shares from home) ─────────────────────────────
    `CREATE TABLE IF NOT EXISTS community_posts (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      author_user_id TEXT NOT NULL, author_name TEXT,
      author_type TEXT DEFAULT 'parent',
      child_id TEXT REFERENCES children(id), 
      title TEXT, body TEXT NOT NULL,
      photo_urls TEXT DEFAULT '[]',
      visibility TEXT DEFAULT 'centre',
      pinned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_cpost_tenant ON community_posts(tenant_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_cpost_child ON community_posts(child_id, tenant_id)`,

    // ── STORY REACTIONS & COMMENTS ────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS story_reactions (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      story_id TEXT NOT NULL, story_type TEXT DEFAULT 'observation',
      user_id TEXT NOT NULL, reaction TEXT DEFAULT 'heart',
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_reaction_unique ON story_reactions(story_id, user_id, reaction)`,
    `CREATE INDEX IF NOT EXISTS idx_reaction_story ON story_reactions(story_id)`,

    `CREATE TABLE IF NOT EXISTS story_comments (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      story_id TEXT NOT NULL, story_type TEXT DEFAULT 'observation',
      author_user_id TEXT NOT NULL, author_name TEXT, author_type TEXT DEFAULT 'parent',
      body TEXT NOT NULL, reply_to_id TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_comment_story ON story_comments(story_id, created_at)`,

    // ── POLICY DOCUMENTS LIBRARY ──────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS policy_documents (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      title TEXT NOT NULL, category TEXT DEFAULT 'policy',
      description TEXT, file_url TEXT, file_name TEXT, file_size INTEGER,
      version TEXT DEFAULT '1.0', status TEXT DEFAULT 'active',
      requires_acknowledgement INTEGER DEFAULT 0,
      visible_to_parents INTEGER DEFAULT 0,
      created_by TEXT, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_policydoc_tenant ON policy_documents(tenant_id, status)`,

    `CREATE TABLE IF NOT EXISTS policy_acknowledgements (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      document_id TEXT NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL, educator_id TEXT,
      acknowledged_at TEXT DEFAULT (datetime('now')),
      version TEXT)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_ack_unique ON policy_acknowledgements(document_id, user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ack_doc ON policy_acknowledgements(document_id)`,

    // ── CUSTOM CHECKLISTS ─────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS checklist_templates (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT,
      category TEXT DEFAULT 'daily', frequency TEXT DEFAULT 'daily',
      room_ids TEXT DEFAULT '[]', assign_to_role TEXT DEFAULT 'educator',
      items TEXT NOT NULL DEFAULT '[]',
      active INTEGER DEFAULT 1,
      created_by TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_checklist_tenant ON checklist_templates(tenant_id, active)`,

    `CREATE TABLE IF NOT EXISTS checklist_completions (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      template_id TEXT NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
      completed_by TEXT NOT NULL, educator_id TEXT,
      date TEXT NOT NULL DEFAULT (date('now','localtime')),
      responses TEXT NOT NULL DEFAULT '[]',
      notes TEXT, completed_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_checkcomp_tenant_date ON checklist_completions(tenant_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_checkcomp_template ON checklist_completions(template_id, date)`,
  ];
  v280tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.9.0: CCS enhancements + integration hub tables
  const v290tables = [
    // ── CCS FAMILY DETAILS (enhanced) ────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS ccs_family_details (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      parent1_name TEXT, parent1_crn TEXT, parent1_dob TEXT,
      parent2_name TEXT, parent2_crn TEXT, parent2_dob TEXT,
      combined_income REAL, income_year TEXT,
      ccs_percentage REAL DEFAULT 0,
      higher_rate_eligible INTEGER DEFAULT 0,
      higher_rate_percentage REAL DEFAULT 0,
      activity_hours_p1 INTEGER DEFAULT 72,
      activity_hours_p2 INTEGER DEFAULT 72,
      subsidised_hours_fortnight INTEGER DEFAULT 72,
      accs_eligible INTEGER DEFAULT 0,
      accs_type TEXT,
      immunisation_compliant INTEGER DEFAULT 1,
      first_nations INTEGER DEFAULT 0,
      preschool_program INTEGER DEFAULT 0,
      enrolment_id TEXT,
      enrolment_status TEXT DEFAULT 'not_submitted',
      last_income_update TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_ccsfam_child ON ccs_family_details(child_id, tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ccsfam_tenant ON ccs_family_details(tenant_id)`,

    // ── CCS SESSION REPORTS QUEUE (for CCSS submission) ───────────────────────
    `CREATE TABLE IF NOT EXISTS ccs_submission_queue (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id),
      fortnight_start TEXT NOT NULL,
      fortnight_end TEXT NOT NULL,
      sessions TEXT NOT NULL DEFAULT '[]',
      total_hours REAL DEFAULT 0,
      total_fee_cents INTEGER DEFAULT 0,
      ccs_percentage REAL DEFAULT 0,
      ccs_amount_cents INTEGER DEFAULT 0,
      gap_fee_cents INTEGER DEFAULT 0,
      absences INTEGER DEFAULT 0,
      allowable_absences_used INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      proda_provider_id TEXT,
      proda_service_id TEXT,
      submitted_at TEXT,
      submission_ref TEXT,
      response_status TEXT,
      response_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_ccsq_tenant_status ON ccs_submission_queue(tenant_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_ccsq_child ON ccs_submission_queue(child_id, fortnight_start)`,

    // ── INTEGRATION CREDENTIALS & STATUS ─────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS integration_credentials (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      integration TEXT NOT NULL,
      label TEXT,
      credential_key TEXT, credential_secret TEXT,
      endpoint TEXT, api_key TEXT,
      extra_config TEXT DEFAULT '{}',
      status TEXT DEFAULT 'not_configured',
      last_tested TEXT, last_test_result TEXT,
      enabled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_intcred_unique ON integration_credentials(tenant_id, integration)`,

    // ── INTEGRATION AUDIT LOG ─────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS integration_log (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      integration TEXT NOT NULL,
      action TEXT NOT NULL,
      direction TEXT DEFAULT 'outbound',
      payload_summary TEXT,
      response_code INTEGER,
      response_summary TEXT,
      success INTEGER DEFAULT 0,
      duration_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_intlog_tenant ON integration_log(tenant_id, integration, created_at)`,
  ];
  v290tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.10.0: Recruitment, Appraisals, Occupancy, Debt, Casual Bookings
  const v2100tables = [
    // ── RECRUITMENT ───────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS job_postings (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT, requirements TEXT,
      employment_type TEXT DEFAULT 'permanent',
      hours_per_week REAL, salary_min REAL, salary_max REAL,
      location TEXT, room_preference TEXT,
      status TEXT DEFAULT 'draft',
      posted_date TEXT, closing_date TEXT,
      seek_listing_id TEXT,
      applications_count INTEGER DEFAULT 0,
      created_by TEXT, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON job_postings(tenant_id, status)`,

    `CREATE TABLE IF NOT EXISTS job_applications (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      job_id TEXT NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
      applicant_name TEXT NOT NULL, applicant_email TEXT, applicant_phone TEXT,
      qualification TEXT, years_experience INTEGER DEFAULT 0,
      resume_url TEXT, cover_letter TEXT,
      wwcc_number TEXT, wwcc_state TEXT,
      referees TEXT DEFAULT '[]',
      status TEXT DEFAULT 'new',
      rating INTEGER, interview_date TEXT, interview_notes TEXT,
      offer_date TEXT, offer_accepted INTEGER,
      rejection_reason TEXT,
      source TEXT DEFAULT 'direct',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_apps_job ON job_applications(job_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_apps_tenant ON job_applications(tenant_id, status)`,

    // ── STAFF APPRAISALS (enhanced) ───────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS appraisal_templates (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      name TEXT NOT NULL, description TEXT,
      sections TEXT NOT NULL DEFAULT '[]',
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_apptmpl_tenant ON appraisal_templates(tenant_id)`,

    `CREATE TABLE IF NOT EXISTS appraisals (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      educator_id TEXT NOT NULL REFERENCES educators(id),
      template_id TEXT,
      reviewer_id TEXT,
      review_period_start TEXT, review_period_end TEXT,
      due_date TEXT,
      status TEXT DEFAULT 'pending',
      overall_rating REAL,
      educator_self_assessment TEXT DEFAULT '{}',
      reviewer_assessment TEXT DEFAULT '{}',
      agreed_goals TEXT DEFAULT '[]',
      strengths TEXT, development_areas TEXT,
      educator_comments TEXT, reviewer_comments TEXT,
      signed_by_educator INTEGER DEFAULT 0,
      signed_by_reviewer INTEGER DEFAULT 0,
      signed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_appr_educator ON appraisals(educator_id, tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_appr_tenant ON appraisals(tenant_id, status)`,

    // ── OCCUPANCY FORECASTING ─────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS occupancy_snapshots (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      snapshot_date TEXT NOT NULL,
      room_id TEXT REFERENCES rooms(id),
      enrolled INTEGER DEFAULT 0,
      capacity INTEGER DEFAULT 0,
      attending INTEGER DEFAULT 0,
      occupancy_pct REAL DEFAULT 0,
      revenue_day_cents INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_snap_unique ON occupancy_snapshots(tenant_id, snapshot_date, room_id)`,
    `CREATE INDEX IF NOT EXISTS idx_snap_tenant_date ON occupancy_snapshots(tenant_id, snapshot_date)`,

    // ── DEBT MANAGEMENT ───────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS debt_records (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id),
      invoice_id TEXT,
      amount_cents INTEGER NOT NULL,
      amount_paid_cents INTEGER DEFAULT 0,
      due_date TEXT,
      days_overdue INTEGER DEFAULT 0,
      status TEXT DEFAULT 'outstanding',
      reminder_1_sent TEXT, reminder_2_sent TEXT, reminder_3_sent TEXT,
      payment_plan INTEGER DEFAULT 0,
      payment_plan_amount_cents INTEGER,
      payment_plan_frequency TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_debt_tenant ON debt_records(tenant_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_debt_child ON debt_records(child_id)`,

    // ── CASUAL BOOKINGS ────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS casual_bookings (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id),
      room_id TEXT REFERENCES rooms(id),
      requested_date TEXT NOT NULL,
      session_type TEXT DEFAULT 'full_day',
      start_time TEXT, end_time TEXT,
      status TEXT DEFAULT 'pending',
      requested_by TEXT,
      confirmed_by TEXT,
      confirmed_at TEXT,
      declined_reason TEXT,
      fee_cents INTEGER DEFAULT 0,
      ccs_applied INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_casual_tenant_date ON casual_bookings(tenant_id, requested_date)`,
    `CREATE INDEX IF NOT EXISTS idx_casual_child ON casual_bookings(child_id)`,
    `CREATE INDEX IF NOT EXISTS idx_casual_status ON casual_bookings(tenant_id, status)`,
  ];
  v2100tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.11.0: Menu planning, milestones, transition reports
  const v2110tables = [
    // ── MENU PLANNING ─────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS menu_plans (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      week_starting TEXT NOT NULL,
      plan_name TEXT DEFAULT 'Weekly Menu',
      status TEXT DEFAULT 'draft',
      approved_by TEXT, approved_at TEXT,
      notes TEXT,
      created_by TEXT, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_week ON menu_plans(tenant_id, week_starting)`,

    `CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      menu_plan_id TEXT NOT NULL REFERENCES menu_plans(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL,
      meal_type TEXT NOT NULL,
      description TEXT NOT NULL,
      allergens TEXT DEFAULT '[]',
      is_vegetarian INTEGER DEFAULT 0,
      is_halal INTEGER DEFAULT 0,
      notes TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_menu_items_plan ON menu_items(menu_plan_id)`,

    `CREATE TABLE IF NOT EXISTS dietary_requirements (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      requirement_type TEXT NOT NULL,
      description TEXT, severity TEXT DEFAULT 'intolerance',
      allergens TEXT DEFAULT '[]',
      action_plan TEXT,
      medical_cert_url TEXT, review_date TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_dietary_child ON dietary_requirements(child_id)`,
    `CREATE INDEX IF NOT EXISTS idx_dietary_tenant ON dietary_requirements(tenant_id)`,

    // ── DEVELOPMENTAL MILESTONES ───────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS milestone_records (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      domain TEXT NOT NULL,
      milestone_key TEXT NOT NULL,
      milestone_label TEXT NOT NULL,
      age_months_expected INTEGER,
      achieved INTEGER DEFAULT 0,
      achieved_date TEXT,
      notes TEXT,
      observation_id TEXT,
      recorded_by TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_milestone_unique ON milestone_records(child_id, milestone_key)`,
    `CREATE INDEX IF NOT EXISTS idx_milestone_child ON milestone_records(child_id)`,
    `CREATE INDEX IF NOT EXISTS idx_milestone_tenant ON milestone_records(tenant_id, domain)`,

    // ── TRANSITION REPORTS ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS transition_reports (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      report_type TEXT DEFAULT 'school_readiness',
      report_date TEXT NOT NULL,
      target_school TEXT,
      transition_date TEXT,
      communication TEXT,
      literacy TEXT,
      numeracy TEXT,
      social_emotional TEXT,
      physical_development TEXT,
      independence TEXT,
      interests TEXT,
      learning_style TEXT,
      strengths TEXT,
      areas_for_support TEXT,
      recommendations TEXT,
      educator_notes TEXT,
      family_input TEXT,
      eylf_outcomes TEXT DEFAULT '{}',
      status TEXT DEFAULT 'draft',
      shared_with_family INTEGER DEFAULT 0,
      shared_with_school INTEGER DEFAULT 0,
      prepared_by TEXT,
      reviewed_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_trans_child ON transition_reports(child_id)`,
    `CREATE INDEX IF NOT EXISTS idx_trans_tenant ON transition_reports(tenant_id, status)`,
  ];
  v2110tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.12.0: QIP enhancements, educator portfolio, surveys, doc prompts
  const v2120tables = [
    // ── EDUCATOR PORTFOLIO ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS educator_portfolio_entries (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      educator_id TEXT NOT NULL REFERENCES educators(id) ON DELETE CASCADE,
      entry_type TEXT DEFAULT 'reflection',
      title TEXT NOT NULL, body TEXT,
      evidence_urls TEXT DEFAULT '[]',
      nqs_links TEXT DEFAULT '[]',
      eylf_links TEXT DEFAULT '[]',
      visibility TEXT DEFAULT 'private',
      tags TEXT DEFAULT '[]',
      reviewer_id TEXT,
      reviewer_feedback TEXT,
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_portfolio_educator ON educator_portfolio_entries(educator_id, tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_portfolio_tenant ON educator_portfolio_entries(tenant_id, created_at)`,

    // ── PARENT SURVEYS ────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS surveys (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT,
      survey_type TEXT DEFAULT 'satisfaction',
      status TEXT DEFAULT 'draft',
      questions TEXT NOT NULL DEFAULT '[]',
      target_audience TEXT DEFAULT 'parents',
      open_date TEXT, close_date TEXT,
      response_count INTEGER DEFAULT 0,
      created_by TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_survey_tenant ON surveys(tenant_id, status)`,

    `CREATE TABLE IF NOT EXISTS survey_responses (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
      respondent_user_id TEXT,
      respondent_child_id TEXT,
      answers TEXT NOT NULL DEFAULT '[]',
      nps_score INTEGER,
      completed INTEGER DEFAULT 0,
      submitted_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_survresp_survey ON survey_responses(survey_id)`,
    `CREATE INDEX IF NOT EXISTS idx_survresp_tenant ON survey_responses(tenant_id, submitted_at)`,

    // ── DOCUMENTATION PROMPTS / STORY TEMPLATES ───────────────────────────────
    `CREATE TABLE IF NOT EXISTS story_prompts (
      id TEXT PRIMARY KEY, tenant_id TEXT,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      prompt_text TEXT NOT NULL,
      eylf_suggested TEXT DEFAULT '[]',
      age_groups TEXT DEFAULT '[]',
      is_system INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_prompts_tenant ON story_prompts(tenant_id, category)`,

    // ── SMART NOTIFICATIONS ───────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS smart_alerts (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      priority TEXT DEFAULT 'normal',
      entity_type TEXT,
      entity_id TEXT,
      action_url TEXT,
      dismissed INTEGER DEFAULT 0,
      dismissed_by TEXT,
      dismissed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_alerts_tenant ON smart_alerts(tenant_id, dismissed, created_at)`,
  ];
  v2120tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.13.0: Kiosk mode, payroll export, notification engine
  const v2130tables = [
    // ── KIOSK SESSIONS ────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS kiosk_sessions (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      pin TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id),
      session_date TEXT NOT NULL,
      signed_in_at TEXT, signed_in_by TEXT,
      signed_out_at TEXT, signed_out_by TEXT,
      sign_in_temp_check INTEGER DEFAULT 0,
      sign_out_note TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_kiosk_tenant_date ON kiosk_sessions(tenant_id, session_date)`,
    `CREATE INDEX IF NOT EXISTS idx_kiosk_child ON kiosk_sessions(child_id, session_date)`,

    `CREATE TABLE IF NOT EXISTS kiosk_pins (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      pin TEXT NOT NULL,
      pin_hint TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_kiosk_pin_child ON kiosk_pins(tenant_id, child_id)`,
    `CREATE INDEX IF NOT EXISTS idx_kiosk_pin_lookup ON kiosk_pins(tenant_id, pin, active)`,

    // ── PAYROLL EXPORTS ───────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS payroll_exports (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      period_start TEXT NOT NULL, period_end TEXT NOT NULL,
      export_type TEXT DEFAULT 'csv',
      status TEXT DEFAULT 'pending',
      total_hours REAL DEFAULT 0,
      total_cost_cents INTEGER DEFAULT 0,
      educator_count INTEGER DEFAULT 0,
      file_url TEXT,
      generated_by TEXT,
      generated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_payroll_tenant ON payroll_exports(tenant_id, period_start)`,

    // ── SCHEDULED NOTIFICATIONS ───────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS notification_rules (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      rule_type TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      days_before INTEGER DEFAULT 0,
      channels TEXT DEFAULT '["in_app"]',
      subject_template TEXT, body_template TEXT,
      active INTEGER DEFAULT 1,
      last_run TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_notif_rules_tenant ON notification_rules(tenant_id, active)`,

    `CREATE TABLE IF NOT EXISTS notification_log (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      rule_id TEXT,
      recipient_user_id TEXT, recipient_email TEXT,
      channel TEXT DEFAULT 'in_app',
      subject TEXT, body TEXT,
      entity_type TEXT, entity_id TEXT,
      status TEXT DEFAULT 'sent',
      sent_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_notif_log_tenant ON notification_log(tenant_id, sent_at)`,
    `CREATE INDEX IF NOT EXISTS idx_notif_log_user ON notification_log(recipient_user_id)`,
  ];
  v2130tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.15.0: Digital signatures, bulk comms, portfolios, Stripe
  const v2150tables = [
    // ── DIGITAL SIGNATURES ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS digital_signatures (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      document_type TEXT NOT NULL,
      document_id TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      signer_role TEXT DEFAULT 'parent',
      signer_user_id TEXT,
      signature_data TEXT,
      signed_at TEXT DEFAULT (datetime('now')),
      ip_address TEXT,
      device_info TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_sig_doc ON digital_signatures(document_type, document_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sig_tenant ON digital_signatures(tenant_id, signed_at)`,

    // ── BULK COMMUNICATIONS ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS bulk_messages (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      message_type TEXT DEFAULT 'general',
      subject TEXT, body TEXT NOT NULL,
      channels TEXT DEFAULT '["email"]',
      target_audience TEXT DEFAULT 'all_families',
      target_room_ids TEXT DEFAULT '[]',
      recipient_count INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      scheduled_for TEXT,
      sent_at TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_bulk_msg_tenant ON bulk_messages(tenant_id, created_at)`,

    `CREATE TABLE IF NOT EXISTS bulk_message_recipients (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      message_id TEXT NOT NULL REFERENCES bulk_messages(id) ON DELETE CASCADE,
      child_id TEXT, parent_name TEXT, email TEXT, phone TEXT,
      status TEXT DEFAULT 'pending',
      sent_at TEXT, error TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_bulk_rcpt_msg ON bulk_message_recipients(message_id)`,

    // ── CHILD PORTFOLIO ───────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS portfolio_exports (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id),
      export_type TEXT DEFAULT 'pdf',
      date_from TEXT, date_to TEXT,
      include_stories INTEGER DEFAULT 1,
      include_milestones INTEGER DEFAULT 1,
      include_observations INTEGER DEFAULT 1,
      include_photos INTEGER DEFAULT 1,
      story_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      share_token TEXT UNIQUE,
      share_expires TEXT,
      generated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_portfolio_child ON portfolio_exports(child_id)`,
    `CREATE INDEX IF NOT EXISTS idx_portfolio_token ON portfolio_exports(share_token)`,

    // ── STRIPE / ONLINE PAYMENTS ───────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS stripe_accounts (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL UNIQUE,
      stripe_account_id TEXT,
      stripe_publishable_key TEXT,
      stripe_secret_key_enc TEXT,
      connected INTEGER DEFAULT 0,
      connect_type TEXT DEFAULT 'standard',
      currency TEXT DEFAULT 'AUD',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,

    `CREATE TABLE IF NOT EXISTS payment_requests (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT REFERENCES children(id),
      invoice_id TEXT,
      amount_cents INTEGER NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      stripe_payment_intent_id TEXT,
      stripe_checkout_url TEXT,
      paid_at TEXT,
      paid_amount_cents INTEGER,
      payment_method TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_payment_req_tenant ON payment_requests(tenant_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_payment_req_child ON payment_requests(child_id)`,
  ];
  v2150tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });

  // Add signature fields to incidents if missing
  ['parent_signature_data','parent_signed_at','director_signature_data','director_signed_at'].forEach(col => {
    try { db.exec(`ALTER TABLE incidents ADD COLUMN ${col} TEXT`); } catch(e) {}
  });
  // Add signature fields to medication_log if missing  
  ['parent_signature_data','parent_signed_at'].forEach(col => {
    try { db.exec(`ALTER TABLE medication_log ADD COLUMN ${col} TEXT`); } catch(e) {}
  });


  // v2.14.0: Parent messaging threads, immunisation improvements, health events
  const v2140tables = [
    // ── PARENT MESSAGE THREADS (two-way) ─────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS message_threads (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT REFERENCES children(id),
      subject TEXT NOT NULL,
      last_message_at TEXT DEFAULT (datetime('now')),
      last_message_preview TEXT,
      unread_admin INTEGER DEFAULT 0,
      unread_parent INTEGER DEFAULT 0,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_threads_tenant ON message_threads(tenant_id, last_message_at)`,
    `CREATE INDEX IF NOT EXISTS idx_threads_child ON message_threads(child_id)`,

    `CREATE TABLE IF NOT EXISTS thread_messages (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      thread_id TEXT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
      sender_type TEXT NOT NULL,
      sender_name TEXT, sender_user_id TEXT,
      body TEXT NOT NULL,
      attachments TEXT DEFAULT '[]',
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_tmsg_thread ON thread_messages(thread_id, created_at)`,

    // ── HEALTH & WELLNESS EVENTS ──────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS health_events (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id),
      event_type TEXT NOT NULL,
      event_date TEXT NOT NULL,
      description TEXT,
      temperature REAL,
      symptoms TEXT DEFAULT '[]',
      action_taken TEXT,
      parent_notified INTEGER DEFAULT 0,
      parent_notified_at TEXT,
      follow_up_required INTEGER DEFAULT 0,
      follow_up_notes TEXT,
      recorded_by TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_health_child ON health_events(child_id, event_date)`,
    `CREATE INDEX IF NOT EXISTS idx_health_tenant ON health_events(tenant_id, event_date)`,

    // ── IMMUNISATION SCHEDULE REFERENCE ──────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS immunisation_schedule (
      id TEXT PRIMARY KEY,
      vaccine TEXT NOT NULL, schedule_name TEXT,
      age_months INTEGER, age_label TEXT,
      is_required INTEGER DEFAULT 1,
      country_code TEXT DEFAULT 'AU',
      notes TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_immschedule_age ON immunisation_schedule(age_months)`,
  ];
  v2140tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });

  // Seed AU immunisation schedule (NHMRC 2025)
  const immScheduleCount = D().prepare('SELECT COUNT(*) as n FROM immunisation_schedule').get()?.n || 0;
  if (!immScheduleCount) {
    const schedule = [
      { id:'imm1',  vaccine:'Hepatitis B',                         age:0,   label:'Birth',            required:1 },
      { id:'imm2',  vaccine:'Hepatitis B',                         age:2,   label:'2 months',          required:1 },
      { id:'imm3',  vaccine:'Rotavirus',                           age:2,   label:'2 months',          required:1 },
      { id:'imm4',  vaccine:'Diphtheria, Tetanus, Pertussis (DTP)',age:2,   label:'2 months',          required:1 },
      { id:'imm5',  vaccine:'Hib (Haemophilus influenzae type b)', age:2,   label:'2 months',          required:1 },
      { id:'imm6',  vaccine:'Pneumococcal (PCV)',                  age:2,   label:'2 months',          required:1 },
      { id:'imm7',  vaccine:'Polio (IPV)',                         age:2,   label:'2 months',          required:1 },
      { id:'imm8',  vaccine:'Hepatitis B',                         age:4,   label:'4 months',          required:1 },
      { id:'imm9',  vaccine:'Rotavirus',                           age:4,   label:'4 months',          required:1 },
      { id:'imm10', vaccine:'DTP',                                 age:4,   label:'4 months',          required:1 },
      { id:'imm11', vaccine:'Hib',                                 age:4,   label:'4 months',          required:1 },
      { id:'imm12', vaccine:'Pneumococcal (PCV)',                  age:4,   label:'4 months',          required:1 },
      { id:'imm13', vaccine:'Polio (IPV)',                         age:4,   label:'4 months',          required:1 },
      { id:'imm14', vaccine:'DTP',                                 age:6,   label:'6 months',          required:1 },
      { id:'imm15', vaccine:'Hepatitis B',                         age:6,   label:'6 months',          required:1 },
      { id:'imm16', vaccine:'Hib',                                 age:6,   label:'6 months',          required:1 },
      { id:'imm17', vaccine:'Polio (IPV)',                         age:6,   label:'6 months',          required:1 },
      { id:'imm18', vaccine:'Pneumococcal (PCV)',                  age:12,  label:'12 months',         required:1 },
      { id:'imm19', vaccine:'Meningococcal ACWY',                  age:12,  label:'12 months',         required:1 },
      { id:'imm20', vaccine:'MMR (Measles, Mumps, Rubella)',       age:12,  label:'12 months',         required:1 },
      { id:'imm21', vaccine:'Hib',                                 age:12,  label:'12 months',         required:1 },
      { id:'imm22', vaccine:'Varicella (Chickenpox)',              age:18,  label:'18 months',         required:1 },
      { id:'imm23', vaccine:'MMR',                                 age:18,  label:'18 months',         required:1 },
      { id:'imm24', vaccine:'DTP',                                 age:18,  label:'18 months',         required:1 },
      { id:'imm25', vaccine:'Pneumococcal (PCV)',                  age:18,  label:'18 months',         required:1 },
      { id:'imm26', vaccine:'Meningococcal B',                     age:18,  label:'18 months',         required:0 },
      { id:'imm27', vaccine:'Influenza',                           age:6,   label:'Annual from 6m',    required:0 },
      { id:'imm28', vaccine:'DTP booster',                         age:48,  label:'4 years',           required:1 },
      { id:'imm29', vaccine:'MMR booster',                         age:48,  label:'4 years',           required:1 },
      { id:'imm30', vaccine:'Varicella booster',                   age:48,  label:'4 years',           required:1 },
      { id:'imm31', vaccine:'Polio booster',                       age:48,  label:'4 years',           required:1 },
    ];
    const ins = db.prepare('INSERT OR IGNORE INTO immunisation_schedule (id,vaccine,age_months,age_label,is_required,country_code) VALUES (?,?,?,?,?,?)');
    schedule.forEach(v => ins.run(v.id, v.vaccine, v.age, v.label, v.required, 'AU'));
  }


  // v2.18.0: Risk assessments, report builder, emergency contacts
  const v2180tables = [
    // ── EXCURSION RISK ASSESSMENT ─────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS risk_assessments (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      excursion_id TEXT REFERENCES excursions(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      assessment_date TEXT NOT NULL,
      location TEXT,
      assessor TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      status TEXT DEFAULT 'draft',
      overall_risk_level TEXT DEFAULT 'low',
      hazards TEXT DEFAULT '[]',
      emergency_plan TEXT,
      medical_kit_checked INTEGER DEFAULT 0,
      ratios_confirmed INTEGER DEFAULT 0,
      transport_checked INTEGER DEFAULT 0,
      parent_permissions_complete INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_risk_excursion ON risk_assessments(excursion_id)`,
    `CREATE INDEX IF NOT EXISTS idx_risk_tenant ON risk_assessments(tenant_id, status)`,

    // ── SAVED REPORTS ─────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS saved_reports (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      report_type TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      last_run TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_saved_reports_tenant ON saved_reports(tenant_id)`,
  ];
  v2180tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.19.0: AI assistant, child fee overrides, compliance nagger
  const v2190tables = [
    // ── CHILD FEE OVERRIDES ───────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS child_fee_overrides (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      override_type TEXT DEFAULT 'fixed',
      daily_rate_cents INTEGER,
      discount_pct REAL DEFAULT 0,
      discount_reason TEXT,
      session_rates TEXT DEFAULT '{}',
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_override_child ON child_fee_overrides(child_id, effective_from)`,
    `CREATE INDEX IF NOT EXISTS idx_fee_override_tenant ON child_fee_overrides(tenant_id)`,

    // ── COMPLIANCE NAGGER TASKS ───────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS compliance_tasks (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      task_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      assigned_to TEXT,
      entity_type TEXT,
      entity_id TEXT,
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'open',
      completed_at TEXT,
      completed_by TEXT,
      auto_generated INTEGER DEFAULT 0,
      recurrence TEXT,
      next_due TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_ctask_tenant ON compliance_tasks(tenant_id, status, due_date)`,
    `CREATE INDEX IF NOT EXISTS idx_ctask_assigned ON compliance_tasks(assigned_to, status)`,

    // ── AI WRITING SESSIONS ───────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS ai_writing_sessions (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      educator_id TEXT,
      child_id TEXT,
      session_type TEXT DEFAULT 'observation',
      prompt_used TEXT,
      generated_text TEXT,
      final_text TEXT,
      eylf_suggested TEXT DEFAULT '[]',
      rating INTEGER,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_ai_session_tenant ON ai_writing_sessions(tenant_id, created_at)`,
  ];
  v2190tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.21.0: Full invoicing + payments build-out
  const v2210tables = [
    // ── INVOICE LINE ITEMS ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS invoice_line_items (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity REAL DEFAULT 1,
      unit_price_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      item_type TEXT DEFAULT 'fee',
      date TEXT,
      sort_order INTEGER DEFAULT 0)`,
    `CREATE INDEX IF NOT EXISTS idx_line_items_invoice ON invoice_line_items(invoice_id)`,

    // ── INVOICE TEMPLATES ─────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS invoice_templates (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      header_html TEXT, footer_html TEXT,
      logo_url TEXT,
      payment_terms TEXT DEFAULT 'Due within 14 days',
      bank_name TEXT, bank_bsb TEXT, bank_account TEXT,
      include_ccs_breakdown INTEGER DEFAULT 1,
      colour TEXT DEFAULT '#7C3AED',
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_inv_tmpl_tenant ON invoice_templates(tenant_id)`,

    // ── PAYMENT PLANS ─────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS payment_plans (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id),
      invoice_id TEXT REFERENCES invoices(id),
      total_amount_cents INTEGER NOT NULL,
      amount_paid_cents INTEGER DEFAULT 0,
      instalment_amount_cents INTEGER NOT NULL,
      frequency TEXT DEFAULT 'weekly',
      start_date TEXT NOT NULL,
      next_due_date TEXT,
      instalments_total INTEGER,
      instalments_paid INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_payment_plan_child ON payment_plans(child_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payment_plan_tenant ON payment_plans(tenant_id, status)`,

    // ── CREDIT NOTES ──────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS credit_notes (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL REFERENCES children(id),
      invoice_id TEXT REFERENCES invoices(id),
      credit_number TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'available',
      applied_to_invoice TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_credit_tenant ON credit_notes(tenant_id, status)`,
  ];
  v2210tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.22.0: Xero integration, educator self-service
  const v2220tables = [
    `CREATE TABLE IF NOT EXISTS xero_connections (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL UNIQUE,
      xero_tenant_id TEXT, xero_tenant_name TEXT,
      access_token TEXT, refresh_token TEXT, token_expiry TEXT,
      connected INTEGER DEFAULT 0,
      account_code_fees TEXT DEFAULT '200',
      account_code_ccs TEXT DEFAULT '201',
      last_sync TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS xero_sync_log (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      sync_type TEXT, status TEXT, records_synced INTEGER DEFAULT 0,
      error TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS educator_leave_requests (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      educator_id TEXT NOT NULL REFERENCES educators(id),
      leave_type TEXT NOT NULL,
      start_date TEXT NOT NULL, end_date TEXT NOT NULL,
      days REAL DEFAULT 1,
      reason TEXT, status TEXT DEFAULT 'pending',
      approved_by TEXT, approved_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_leave_educator ON educator_leave_requests(educator_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_leave_tenant ON educator_leave_requests(tenant_id, status, start_date)`,
    `CREATE TABLE IF NOT EXISTS educator_availability_weekly (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      educator_id TEXT NOT NULL REFERENCES educators(id),
      week_start TEXT NOT NULL,
      availability TEXT DEFAULT '{}',
      notes TEXT,
      submitted_at TEXT DEFAULT (datetime('now')),
      UNIQUE(educator_id, week_start))`,
  ];
  v2220tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });


  // v2.21.1: Upgrade clock_records to use educator_id, proper columns
  try {
    db.exec(`ALTER TABLE clock_records ADD COLUMN educator_id TEXT`);
    db.exec(`UPDATE clock_records SET educator_id=member_id WHERE educator_id IS NULL`);
  } catch(e) {}
  try { db.exec(`ALTER TABLE clock_records ADD COLUMN clock_date TEXT`); } catch(e) {}
  try { db.exec(`UPDATE clock_records SET clock_date=date WHERE clock_date IS NULL`); } catch(e) {}
  try { db.exec(`ALTER TABLE clock_records ADD COLUMN clock_in TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE clock_records ADD COLUMN clock_out TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE clock_records ADD COLUMN hours_worked REAL DEFAULT 0`); } catch(e) {}
  try { db.exec(`ALTER TABLE clock_records ADD COLUMN total_break_minutes INTEGER DEFAULT 0`); } catch(e) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_clock_educator_date ON clock_records(educator_id, clock_date)`); } catch(e) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_clock_tenant_date ON clock_records(tenant_id, clock_date)`); } catch(e) {}


  // v2.22.1: Schedule publish history, report schedule management
  const v2221tables = [
    `CREATE TABLE IF NOT EXISTS schedule_publish_history (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      published_by TEXT,
      educator_count INTEGER DEFAULT 0,
      message TEXT,
      published_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_sched_hist_tenant ON schedule_publish_history(tenant_id, published_at)`,

    `CREATE TABLE IF NOT EXISTS report_schedules (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      report_type TEXT NOT NULL,
      config TEXT DEFAULT '{}',
      frequency TEXT DEFAULT 'weekly',
      day_of_week INTEGER DEFAULT 1,
      time TEXT DEFAULT '08:00',
      recipients TEXT DEFAULT '[]',
      last_run TEXT,
      next_run TEXT,
      enabled INTEGER DEFAULT 1,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_report_sched_tenant ON report_schedules(tenant_id, enabled)`,
  ];
  v2221tables.forEach(sql => { try { db.exec(sql); } catch(e) {} });



  // ── TIER 1 NEW TABLES ─────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS checklists (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'daily',
      frequency TEXT DEFAULT 'daily',
      room_id TEXT,
      items TEXT DEFAULT '[]',
      status TEXT DEFAULT 'active',
      last_completed TEXT,
      completed_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS checklist_completions (
      id TEXT PRIMARY KEY,
      checklist_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      completed_date TEXT,
      completed_by TEXT,
      notes TEXT,
      items_data TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ratio_snapshots (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      snapshot_date TEXT,
      time_slot TEXT,
      room_id TEXT,
      children_count INTEGER DEFAULT 0,
      staff_count INTEGER DEFAULT 0,
      required_staff INTEGER DEFAULT 0,
      is_compliant INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS medication_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL,
      medication_name TEXT,
      dosage TEXT,
      instructions TEXT,
      scheduled_date TEXT,
      scheduled_time TEXT,
      administered_at TEXT,
      administered_by TEXT,
      status TEXT DEFAULT 'pending',
      parent_authorisation INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS cwa_records (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL,
      family_account_id TEXT,
      ccs_enrolment_id TEXT,
      signed_by TEXT,
      signature_data TEXT,
      signed_at TEXT,
      effective_from TEXT,
      effective_to TEXT,
      session_details TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ddr_records (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      family_account_id TEXT,
      child_id TEXT,
      payment_method TEXT DEFAULT 'bank',
      account_name TEXT,
      bsb TEXT,
      account_number TEXT,
      card_last4 TEXT,
      card_expiry TEXT,
      debit_limit_cents INTEGER DEFAULT 25000,
      signature_data TEXT,
      signed_at TEXT,
      terms_accepted INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS parent_daily_info (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      child_id TEXT NOT NULL,
      record_date TEXT,
      meals_data TEXT DEFAULT '{}',
      sunscreen_am INTEGER DEFAULT 0,
      sunscreen_pm INTEGER DEFAULT 0,
      mood TEXT,
      sleep_minutes INTEGER,
      notes TEXT,
      educator_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, child_id, record_date)
    );
    CREATE TABLE IF NOT EXISTS visitor_register (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      visitor_name TEXT NOT NULL,
      visitor_type TEXT DEFAULT 'visitor',
      organisation TEXT,
      purpose TEXT,
      host_name TEXT,
      sign_in TEXT,
      sign_out TEXT,
      visit_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Ensure educator_availability has all rostering schema columns
  [
    ['day_of_week', 'INTEGER'],
    ['available', 'INTEGER DEFAULT 1'],
    ['start_time', 'TEXT DEFAULT "06:00"'],
    ['end_time', 'TEXT DEFAULT "18:30"'],
    ['preferred', 'INTEGER DEFAULT 0'],
    ['notes', 'TEXT'],
    ['tenant_id', 'TEXT'],
  ].forEach(([col, type]) => {
    try { db.exec(`ALTER TABLE educator_availability ADD COLUMN ${col} ${type}`); } catch(e) {}
  });

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


    -- ─── SCALE: Composite indexes for multi-tenant queries at 100k+ rows ────
    -- All high-frequency queries filter tenant_id first, then date/child/educator
    CREATE INDEX IF NOT EXISTS idx_att_tenant_date ON attendance_sessions(tenant_id, date);
    CREATE INDEX IF NOT EXISTS idx_att_child_date ON attendance_sessions(child_id, date);
    CREATE INDEX IF NOT EXISTS idx_ch_tenant_active ON children(tenant_id, active);
    CREATE INDEX IF NOT EXISTS idx_ch_room ON children(room_id, tenant_id);
    CREATE INDEX IF NOT EXISTS idx_edu_tenant_status ON educators(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_roster_tenant_date ON roster_entries(tenant_id, date);
    CREATE INDEX IF NOT EXISTS idx_roster_edu_date ON roster_entries(educator_id, date);
    CREATE INDEX IF NOT EXISTS idx_obs_child_date ON observations(child_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_du_child_date ON daily_updates(child_id, update_date);
    CREATE INDEX IF NOT EXISTS idx_du_tenant_date ON daily_updates(tenant_id, update_date);
    CREATE INDEX IF NOT EXISTS idx_inv_tenant_status ON invoices(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_leave_edu ON leave_requests(educator_id, tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_clock_tenant_date ON clock_records(tenant_id, date);
    CREATE INDEX IF NOT EXISTS idx_clock_member_date ON clock_records(member_id, date);
    CREATE INDEX IF NOT EXISTS idx_audit_tenant_ts ON audit_log(tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, tenant_id, read_at);
    CREATE INDEX IF NOT EXISTS idx_stories_tenant ON weekly_stories(tenant_id, status, period);
    CREATE INDEX IF NOT EXISTS idx_ls_tenant_date ON learning_stories(tenant_id, date);
    CREATE INDEX IF NOT EXISTS idx_staff_msg_thread ON staff_messages(thread_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_pd_tenant_status ON pd_requests(tenant_id, status);
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
