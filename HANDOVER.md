# LittleSteps v1.6.0 → v1.7.0 — Comprehensive Handover

## QUICK START

```bash
# On the VM (Ubuntu):
cd /home/greg/littlesteps-app
kill -9 $(lsof -t -i:3003) 2>/dev/null
systemctl stop littlesteps 2>/dev/null
rm -f data/littlesteps.db
tar xf /media/sf_VM_Shared_Folder/littlesteps-v1.7.0-YYYYMMDD.tar.gz --strip-components=1
npx vite build
nohup node server/index.js > littlesteps.log 2>&1 &
sleep 3 && curl -s http://localhost:3003/health
```

---

## 1. PROJECT OVERVIEW

**LittleSteps** is a comprehensive Australian childcare centre management platform with multi-tenant architecture, JWT auth with MFA, AI-powered rostering with NQF ratio compliance, AI sick cover agent, full childcare management (children, rooms, observations, learning plans, invoicing, documents, compliance), and Owner/Platform admin portal.

**Tech Stack:** React 18 + Vite | Express.js + better-sqlite3 | Recharts | JWT + bcryptjs + otplib (TOTP)
**Port:** 3003 | **DB:** SQLite at `data/littlesteps.db` (auto-created with seed data)
**Current Version:** 1.6.0 | **Target Version:** 1.7.0

---

## 2. FILE STRUCTURE & LINE COUNTS

```
littlesteps-app/
├── package.json                 (35 lines — deps: react 18, express, better-sqlite3, bcryptjs, jsonwebtoken, otplib, recharts, helmet, cors, multer)
├── vite.config.js               (19 lines)
├── index.html                   (Vite entry)
├── deploy.sh / littlesteps.service (deployment helpers — service is DISABLED)
├── src/
│   ├── main.jsx                 (14 lines — React entry)
│   ├── App.jsx                  (1,742 lines — Main app shell, all views, sidebar nav, state management)
│   ├── AuthModule.jsx           (940 lines — Login/register/MFA/OAuth/password reset)
│   ├── RosteringModule.jsx      (678 lines — AI Rostering module, 6 tabs)
│   ├── OwnerPortalModule.jsx    (1,514 lines — Multi-tenant platform admin)
│   ├── LearningModule.jsx       (1,487 lines — Learning plans, observations, EYLF)
│   ├── ComplianceModule.jsx     (355 lines — NQF compliance dashboard)
│   ├── InvoicingModule.jsx      (163 lines — Invoicing/CCS)
│   └── nqf-data.js              (348 lines — NQF reference data)
├── server/
│   ├── index.js                 (122 lines — Express setup, route mounting, health check)
│   ├── db.js                    (1,236 lines — 47 table schema, indexes, seed data)
│   ├── middleware.js            (103 lines — JWT auth, tenant isolation, rate limiting)
│   ├── auth.js                  (545 lines — Auth routes: login, register, MFA, OAuth, refresh)
│   ├── api.js                   (205 lines — Core CRUD: rooms, children, observations, clock)
│   ├── rostering.js             (466 lines — AI rostering, 24 endpoints)
│   ├── platform.js              (552 lines — Platform admin APIs)
│   ├── documents.js             (307 lines — Document management)
│   ├── compliance.js            (289 lines — Compliance engine, auto-scan)
│   ├── invoicing.js             (196 lines — Invoicing/CCS)
│   └── enrolment.js             (98 lines — Enrolment applications)
└── data/littlesteps.db          (auto-created, excluded from tar)
```

**Total: ~11,400 lines. All styling is inline JSX (no CSS files). No React Router — tab-based nav via useState.**

---

## 3. DATABASE SCHEMA (47 Tables)

### Core
- `tenants` — Orgs (name, domain, subscription, region AU/NZ/GUAM/MY)
- `users` — Accounts (email, password_hash, mfa_enabled, mfa_secret, locked)
- `tenant_members` — User↔Tenant with role (owner/admin/educator/parent)
- `sessions`, `verification_codes`, `invitations`, `audit_log`

### Centre Management
- `rooms` — age_group (0-2/2-3/3-4/4-5), capacity, current_children. IDs: room-joeys, room-possums, room-koalas, room-kookas
- `children` — name, DOB, room_id, enrolment dates, CCS data, medical info, emergency contacts
- `observations`, `daily_plans`, `clock_records`, `child_documents`, `immunisation_records`, `medical_plans`, `medications`, `medication_log`, `parent_contacts`

### Finance
- `fee_schedules`, `ccs_details`, `invoices`, `payments`, `payment_methods`, `attendance_sessions`

### Compliance & Admin
- `compliance_items`, `notifications`, `incidents`, `enrolment_applications`, `waitlist`
- `platform_admins`, `tenant_subscriptions`, `tenant_metrics`

### AI Features (v1.5.0)
- `staff_wellbeing`, `nqs_self_assessment`, `qip_goals`, `ccs_session_reports`, `parent_feedback`

### AI Rostering (v1.6.0) — 9 Tables
- **`educators`** — Full profiles: name, email, phone, address, suburb, postcode, lat/lng, distance_km, qualification (ect/diploma/cert3/working_towards), employment_type (permanent/part_time/casual/contract), hourly_rate_cents, annual_salary_cents, super_rate, leave balances, max/min/contracted hours, reliability_score (0-100), shifts_offered/accepted, sick_days, late_arrivals, no_shows, avg_response_time_mins, first_aid/CPR/anaphylaxis/asthma expiry, WWCC, preferred_rooms JSON, is_under_18, start_date, status
- **`educator_availability`** — day_of_week 0-6, available, start_time, end_time, preferred
- **`educator_absences`** — date, type (sick/personal/annual/no_show), reason, cover_found
- **`roster_periods`** — period_type, start/end date, status (draft/approved/published), generated_by (ai/manual), total_hours, total_cost_cents, compliance_score
- **`roster_entries`** — period_id, educator_id, room_id, date, start/end time, break_mins, role (educator/lead_educator), is_cover, cost_cents. NOTE: This table is defined TWICE in db.js (once in core schema, once in rostering schema) — the second definition overwrites the first
- **`shift_fill_requests`** — absence_id, educator_id, room_id, date, times, qualification_required, status (open/filled/cancelled), strategy (sequential/simultaneous)
- **`shift_fill_attempts`** — request_id, educator_id, contact_method (sms/call), response, accepted, ai_transcript
- **`ai_agent_config`** — contact_strategy, sms_wait/call_wait mins, priority_order, sms_template, call_script_guidance, voice_engine, sms_provider, webhook_url
- **`roster_change_proposals`** — trigger_type, options JSON, status (pending/resolved/rejected)

### Seed Data (auto-created on first run)
- 1 tenant: "Sunshine Learning Centre" (AU)
- 1 admin user: **admin@littlesteps.com.au / LittleSteps2024!**
- 4 rooms: Joeys (0-2, 12 kids), Possums (2-3, 15), Koalas (3-4, 22), Kookaburras (4-5, 20)
- 10 children with parent contacts, CCS details
- 10 educators (Cronulla/Sutherland Shire): Sarah Mitchell ECT $42/hr 95% rel, James Chen DIP $38/hr 88%, Emily Watson DIP $38/hr 92%, Priya Sharma C3 $32/hr 85%, Tom Bradley C3 casual $35/hr 72%, Mei Lin ECT $42/hr 97%, Alex Nguyen WT $29/hr 65% (under 18), Rachel Foster C3 PT $32/hr 90%, Liam O'Brien DIP casual $38/hr 78%, Sophie Martinez C3 casual $32/hr 82%
- 70 availability patterns, 5 absences, AI config, demo roster period with 30 entries

---

## 4. SIDEBAR NAVIGATION

```javascript
const navItems = [
  { id: "dashboard",   label: "Dashboard",      icon: "dashboard" },
  { id: "educators",   label: "Educators",      icon: "people" },      // Basic list in App.jsx
  { id: "rooms",       label: "Rooms",          icon: "room" },
  { id: "roster",      label: "Rostering",      icon: "smart_toy" },   // → <RosteringModule />
  { id: "clockinout",  label: "Clock In/Out",   icon: "clock" },
  { id: "compliance",  label: "Ratios & Quals", icon: "shield" },
  // divider
  { id: "children",    label: "Children",       icon: "children_icon" },
  { id: "documents",   label: "Documents",      icon: "documents" },
  { id: "learning",    label: "Learning Plans", icon: "learning" },
  { id: "observations",label: "Observations",   icon: "observation" },
  // divider
  { id: "invoicing",   label: "Invoicing",      icon: "invoicing" },
  { id: "reports",     label: "Reports",        icon: "chart" },
  { id: "settings",    label: "Settings",       icon: "settings" },
  // divider
  { id: "owner_portal",label: "Owner Portal",   icon: "platform" },    // Platform admin only
];
```

---

## 5. ROSTERING MODULE — CURRENT STATE

**File:** `src/RosteringModule.jsx` (678 lines) — `export function RosteringModule()`

### 6 Tabs:
1. **Dashboard** 📊 — 6 metric cards + AI cost cards (phone calls, SMS, AI processing, total) + reliability pie + qualification bar + recent fill requests
2. **Educators** 👩‍🏫 — Search/filter/sort list + detail panel + full editor form (5 sub-sections: Personal, Employment, Availability, Compliance, Notes)
3. **Roster** 📅 — AI Generator form (period/start/end dates + Generate button) + period sidebar list + visual day-by-day grid grouped by room with colour-coded qualification badges, shift bars, compliance indicators (✓/⚠ ECT), hours summary per educator
4. **Sick Cover** 📱 — Report absence form + fill request list + 8-step journey visualization + AI call transcript display (currently hardcoded demo)
5. **Changes** 🔔 — Change proposal cards with resolve options (badge count on tab)
6. **Settings** ⚙️ — Sub-tabs: AI Agent config, Messaging templates (SMS + call script), Integrations (SMS provider, Voice engine, Middleware/webhooks), Costs & Usage (monthly breakdown, provider pricing table, usage history)

### Backend: `server/rostering.js` (466 lines, 24 endpoints at /api/rostering/)
- Educator CRUD: GET/POST/PUT educators, GET availability
- Absences: GET/POST (auto-updates reliability stats: sick_days++, reliability-=2)
- Periods: GET list, GET detail (with joined entries→educators→rooms), PUT approve, PUT publish
- **POST /generate** — AI Roster Generation (try/catch wrapped):
  1. Fetch active educators sorted by reliability, fetch availability
  2. Fetch rooms with child counts
  3. Generate weekday dates in range
  4. Per date+room: calc required educators via NQF ratios (babies 1:4 ECT req, toddlers 1:5, preschool 1:11 ECT req, OSHC 1:15)
  5. Filter available educators (day, room preference, max hours cap)
  6. Sort: permanent first, then weighted (reliability×3 + distance×1 + balance×2)
  7. Assign to 7 staggered shift templates (06:00-14:30 through 10:00-18:30)
  8. Ensure ECT if required, calc hours/cost, save period + entries
- Manual entries: POST/DELETE
- Fill requests: GET list, POST create (finds candidates, creates attempts), GET attempts, POST accept/decline
- AI config: GET/PUT (upsert)
- Change proposals: GET, POST resolve
- Stats: GET dashboard statistics

### Known Issues Already Fixed
- ✅ Generate endpoint wrapped in try/catch (was silently crashing)
- ✅ PUT educator includes super_rate, anaphylaxis_expiry, asthma_expiry, start_date
- ✅ Editor hourly rate displays in dollars not cents
- ✅ Foreign key constraint fixes (child UUIDs, room IDs room-joeys etc.)
- ✅ Age group mapping in generator (0-2→babies, 2-3→toddlers, etc.)
- ✅ Version numbers consistent at 1.6.0

---

## 6. AUTH SYSTEM

**Files:** `src/AuthModule.jsx` (940 lines) + `server/auth.js` (545 lines) + `server/middleware.js` (103 lines)

- Email/password + Google OAuth + Apple OAuth
- TOTP MFA + Email MFA (6-digit codes)
- Session management with refresh tokens
- Password reset, account lockout
- JWT stored: `localStorage.getItem("ls_token")`, tenant: `localStorage.getItem("ls_tenant")`
- All APIs: `Authorization: Bearer {token}` + `x-tenant-id: {tenant}`
- Middleware attaches: `req.userId`, `req.tenantId`, `req.tenantRole`, `req.userName`
- Roles: owner, admin, educator, parent (from tenant_members.role)

---

## 7. DEPLOYMENT NOTES

- **Target:** Ubuntu VM at `/home/greg/littlesteps-app`
- **Shared folder:** `/media/sf_VM_Shared_Folder/`
- **Port:** 3003
- **File naming:** `littlesteps-v{version}-{YYYYMMDD}.tar.gz`
- **ALWAYS `rm -f data/littlesteps.db`** before starting if schema changed (auto-recreates with seed)
- **systemd service is DISABLED** — start manually with `nohup node server/index.js > littlesteps.log 2>&1 &`
- After deploying, user may need **Ctrl+Shift+R** (hard refresh) to clear browser cache

---

## 8. COLOUR SCHEME

| Element | Hex |
|---------|-----|
| Primary purple | #8B6DAF / #7E5BA3 |
| Background | #FDFBF9 |
| Card border | #E8E0D8 |
| Text primary | #3D3248 |
| Text secondary | #5C4E6A |
| Text tertiary | #8A7F96 / #A89DB5 |
| Success/ECT green | #2E8B57 / #6BA38B |
| Warning gold | #D4A26A |
| Error rose | #C06B73 / #C9828A |
| Diploma purple | #7E5BA3 |
| Input bg | #FDFBF9 |
| Section bg | #F8F5F1 |

Border radius: 8-14px cards, 6-10px buttons. All inline styles, no CSS files.

---

## 9. VERSION REFERENCES TO UPDATE (all locations)

1. `package.json` → `"version"`
2. `src/App.jsx` → Sidebar `v1.x.x`
3. `server/index.js` → Banner + health check `version`
4. `src/AuthModule.jsx` → Login page footer

---

## 10. ALL CHANGES TO BUILD IN v1.7.0

### A. ROSTERING IMPROVEMENTS

**1. Educator Setup — Single Editable Tab**
- Already has editor with 5 sections (Personal, Employment, Availability, Compliance, Notes)
- All fields editable. Rate in dollars not cents. Availability grid with day/time toggles
- Verify completeness and that save works for all fields

**2. Fix Generate Roster Button**
- try/catch already added to backend. Verify end-to-end: select dates → Generate → period appears → click to view visual grid
- If rooms have 0 children, generator skips them — ensure seed data has children in rooms

**3. Inbound AI Sick Cover Agent**
Currently the Sick Cover tab has HARDCODED demo transcript and journey. Build the real flow:
- Educators call a configured phone number (shown as "1300 SICK COVER" in UI, configurable in Settings)
- AI voice agent (Vapi/Bland/Retell) answers: takes name, date, shift, reason
- **Region-aware sick certificate reminders:**
  - **Australia:** Medical cert required if >2 consecutive days (Fair Work Act)
  - **New Zealand:** Cert can be requested after 3+ consecutive days
  - **Guam:** Medical cert for 3+ days (varies by employer)
  - **Malaysia:** Medical cert required for any sick leave claim (Employment Act 1955)
- Call recorded and transcribed (stored in shift_fill_attempts.ai_transcript + new recording_url column)
- System notifies centre manager (SMS + email), creates shift_fill_request, starts finding replacement
- Journey visualization shows real-time progress with timestamps
- **New endpoint needed:** POST /api/rostering/inbound-call (webhook from voice provider)
- **New table needed:** `ai_usage_log` (id, tenant_id, type call/sms/ai, provider, cost_cents, duration_secs, timestamp, fill_request_id)

**4. AI Cost Tracking — Real Data**
- Dashboard already shows cost cards. Settings has Costs & Usage section
- Replace hardcoded demo data with real tracking from ai_usage_log table
- New endpoint: GET /api/rostering/usage-stats?from=&to=

**5. Visual Roster**
- Already colour-coded by qualification with shift bars, compliance badges, room grouping, hours summary
- Verify looks correct after build

**6. Merge Old Roster View**
- App.jsx `{ id: "roster" }` already renders `<RosteringModule />`
- Remove the old `function RosterView(...)` (~line 809 in App.jsx) and its state variables (rosterEntries, rosterPeriod, rosterStartDate, addRosterEntry, removeRosterEntry)

### B. NEW — STAFF PORTAL MODULE

New module for educators/staff when logged in. Create `src/StaffPortalModule.jsx` and `server/staff-portal.js`.

**Features:**

1. **My Availability** — View/edit own weekly availability (uses educator_availability table via self-service PUT endpoint)

2. **Leave Requests** — Submit and track leave
   - New table: `leave_requests` (id, tenant_id, educator_id, type [annual/personal/sick/unpaid/study/parental], start_date, end_date, half_day boolean, reason, status [pending/approved/rejected], approved_by, approved_at, affects_roster boolean, notes, created_at)
   - When approved, auto-check for rostered shifts in period → create shift_fill_requests
   - Show leave balance and history

3. **Superannuation** — View/update super details
   - Add to educators table: super_fund_name, super_fund_usi, super_member_number
   - Staff can update own super details

4. **Shift Requests** — Swap, pickup, or drop shifts
   - New table: `shift_requests` (id, tenant_id, educator_id, type [swap/pickup/drop], target_entry_id, swap_with_educator_id, reason, status [pending/approved/rejected], reviewed_by, created_at)

5. **General Requests** — Equipment, training, schedule requests
   - New table: `staff_requests` (id, tenant_id, educator_id, category [equipment/training/schedule/uniform/other], subject, description, priority [low/medium/high], status [open/in_progress/resolved/closed], response, responded_by, created_at)

6. **Feedback** — Anonymous or named feedback to management
   - New table: `staff_feedback` (id, tenant_id, educator_id nullable, anonymous boolean, category [suggestion/concern/praise/other], subject, message, status [unread/read/actioned], response, created_at)

7. **Risk Notifications** — Report safety/maintenance issues
   - New table: `risk_notifications` (id, tenant_id, reported_by, category [safety/maintenance/security/health/other], severity [low/medium/high/critical], title, description, location, photo_url, status [reported/acknowledged/in_progress/resolved], assigned_to, resolution_notes, created_at, resolved_at)
   - Critical severity → immediate manager notification
   - Examples: "Front gate not closing", "Broken tile", "Smoke detector beeping"

8. **Centre Messages** — Receive messages from management (part of Messaging module below)

### C. NEW — NOTIFICATIONS & MESSAGING MODULE

Add to main application. Create `src/MessagingModule.jsx` and `server/messaging.js`.

**1. Notification Bell** — Top header bar, bell icon with unread count
   - New table: `user_notifications` (id, tenant_id, user_id, type [system/roster/leave/compliance/message/risk/general], title, body, link_to, read boolean, created_at)
   - Triggers: roster published, leave approved/rejected, shift fill request, compliance alert, new message, risk notification, staff feedback

**2. In-App Messaging**
   - New table: `messages` (id, tenant_id, from_user_id, to_user_id nullable, to_role nullable, subject, body, type [direct/broadcast/announcement], parent_message_id, read_by JSON, pinned boolean, created_at)
   - Direct: staff↔manager. Broadcast: manager→all staff or →all parents. Announcements: pinned notices
   - Thread support via parent_message_id

**3. Notification Preferences**
   - New table: `notification_preferences` (id, user_id, notification_type, in_app boolean, email boolean, sms boolean)

### D. NEW — USER ROLES & PERMISSIONS SYSTEM (RBAC)

Replace simple role field with comprehensive RBAC.

**1. New Tables:**
- `roles` (id, tenant_id, name, description, is_system boolean, created_at)
- `role_permissions` (id, role_id, module TEXT, feature TEXT, access_level TEXT [none/read/read_write])

**2. System Roles (is_system=true, cannot be deleted):**
- Centre Director — full access to everything
- Administrator — everything except billing/subscription
- Lead Educator — rostering read/write, children read, observations read/write, compliance read
- Educator — roster read only, own availability write, children read, observations write
- Parent — own children read, own observations read, own invoices read

**3. Modules & Features for permission matrix:**
```
dashboard:        view_dashboard
educators:        view_educators, edit_educators, manage_availability, view_pay
rooms:            view_rooms, edit_rooms
roster:           view_roster, edit_roster, generate_roster, approve_roster, publish_roster
clockinout:       view_clock, manage_clock
compliance:       view_compliance, manage_compliance
children:         view_children, edit_children, view_medical, edit_medical
documents:        view_documents, upload_documents, manage_documents
learning:         view_plans, edit_plans
observations:     view_observations, write_observations
invoicing:        view_invoices, create_invoices, manage_payments
reports:          view_reports, export_reports
settings:         view_settings, edit_settings, manage_integrations, manage_roles
owner_portal:     view_platform, manage_tenants, manage_subscriptions
staff_portal:     own_availability, leave_requests, shift_requests, feedback, risk_reports
messaging:        view_messages, send_messages, broadcast, manage_announcements
```

**4. Permission Check:**
- Backend middleware: `requirePermission(module, feature, level)` — checks role_permissions for user's role
- Frontend utility: `hasPermission(module, feature, level)` — cached after login, used to show/hide UI elements
- Update `tenant_members`: add `role_id` column (references roles.id), keep `role` for backwards compat

**5. Admin UI:** Under Settings → "Roles & Permissions" section with role list, permission matrix editor (module × feature grid with none/read/read_write dropdowns), user-role assignment

---

## 11. API PATTERN FOR ALL NEW ENDPOINTS

```javascript
// Frontend
const API = (path, opts = {}) => {
  const t = localStorage.getItem("ls_token"), tid = localStorage.getItem("ls_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(tid ? { "x-tenant-id": tid } : {}), ...opts.headers },
    method: opts.method || "GET",
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};

// Backend route file pattern
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';
const r = Router();
r.use(requireAuth);
r.use(requireTenant);
// routes...
export default r;

// Mount in server/index.js
import newRoutes from './new-module.js';
app.use('/api/new-module', newRoutes);
```

---

## 12. BUILD PRIORITY ORDER

1. **Verify existing fixes** (generate button, editor saves, rate display)
2. **RBAC system** (needed before other modules — all new modules need permission checks)
3. **Notifications & Messaging** (needed by Staff Portal and Sick Cover)
4. **Staff Portal** (depends on RBAC + Messaging)
5. **Inbound AI agent improvements** (real webhook, recording, region-aware reminders)
6. **AI cost tracking** (real data from ai_usage_log)
7. **Clean up** (remove old RosterView, bump version to 1.7.0)

---

## END OF HANDOVER
