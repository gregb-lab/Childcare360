# Childcare360 Handover

## Current Version: 2.2.27

## Architecture
- React 18 + Vite frontend (src/)
- Express.js + better-sqlite3 backend (server/)
- SQLite DB at data/childcare360.db (auto-created)
- JWT auth, bcryptjs, otplib (TOTP MFA)
- Port 3003

## v2.2.29 Changes (2026-03-17)

### Staff Self-Service Portal (new module)
New `StaffPortalModule.jsx` + `server/staff.js` giving educators their own view
of the system — accessed via "Staff Portal" in the left nav.

**My Dashboard tab**
- Welcome banner with profile photo, name, qualification and employment type
- Certification alert banner (clickable → Certifications tab) when any cert is
  expiring within 60 days or expired
- Today's scheduled shifts highlighted
- Quick stats: shifts this week, pending leave requests, upcoming shifts count
- Upcoming shifts list (next 5)
- Quick-action buttons: Availability, Leave, Shifts, Profile

**My Shifts tab**
- All upcoming shifts from today forward, each showing date, room, times, status badge
- "TODAY" pill on today's shift
- Recent shifts (last 14 days) collapsible below

**Availability tab** (mirrors EducatorsModule but self-service)
- Full weekly availability grid with Can Start Earlier / Can Stay Later minute controls
- Time validation: end time must be after start time
- Special Availability Periods: add date ranges with day selectors, early/late flags, notes
- All changes fed directly to the AI rostering engine
- Save button triggers toast confirmation

**Leave tab**
- View all leave requests with status badges (pending / approved / denied)
- Submit new leave request: type, start/end (DatePicker), auto-calculated working days

**My Profile tab**
- Read-only: name, email, qualification, employment type, start date, rate, super rate
- Editable: phone, street address, suburb, state, postcode
- Save triggers toast confirmation

**Certifications tab**
- Colour-coded cert cards: green (valid), amber (expiring ≤60 days), red (expired)
- Responsible Person eligibility status banner
- Linked certification documents listed below

**API: server/staff.js** (new file, mounted at `/api/staff`)
- `GET  /api/staff/me` — educator profile for logged-in user (matched by user_id, then email)
- `PUT  /api/staff/me` — update phone/address/suburb/state/postcode only
- `GET  /api/staff/my-shifts` — upcoming + recent 14 days
- `PUT  /api/staff/my-availability` — update weekly availability
- `POST /api/staff/my-special-availability` — add special period
- `DELETE /api/staff/my-special-availability/:id` — remove period
- `GET  /api/staff/my-leave` — list own leave requests
- `POST /api/staff/my-leave` — submit leave request

### Global DatePicker — full codebase rollout
`src/DatePicker.jsx` (extracted from EducatorsModule in v2.2.28) now imported and
active in every module that had native `<input type="date">` elements.

Newly wired modules in this release:
- **ChildrenModule** — FRow component now routes type=date → DatePicker (DOB, enrolled date, 7 inline inputs in medical/immunisation forms)
- **ComplianceModule** — Inp component patched (4 date fields)
- **InvoicingModule** — Inp component patched (3 date fields: period start/end, effective from)
- **EnrolmentModule** — 2 direct date inputs replaced
- **ExcursionsModule** — excursion date replaced
- **DailyUpdatesModule** — date field replaced
- **LearningJourneyModule** — date field replaced
- **MedicationRegisterModule** — F component patched (expiry date)
- **ParentPortalModule** — Field component patched + 3 direct inputs (absence dates, filter date)
- **RosteringModule** — both F component instances patched (all cert/compliance dates, start date, 4 direct rostering form dates); hourly rate input changed from type=number to text/inputMode=decimal fixing the spinner bug
- **LearningModule** — filter date replaced
- **SOC2Module** — from/to date filters replaced

Remaining native `<input type="date">` in App.jsx (2 instances: roster week-start selector, legacy EducatorModal) — these are intentional and acceptable.

### Toast notifications — full codebase rollout
`const toast = (msg, type) => { if (window.showToast) window.showToast(msg, type); };`
added to every module that lacked it. `alert("Failed…")` calls replaced with
`toast(…, "error")` throughout. Save confirmations added to ChildrenModule profile,
collection persons, educator notes; WaitlistModule add/remove; ExcursionsModule save;
MessagingModule template save; DailyUpdatesModule save.

### Bug fixes
- ParentPortalModule Field and Check components corrupted by previous DatePicker patch — fixed
- RosteringModule hourly rate spinner bug — fixed (text input, converts on blur)

## v2.2.28 Changes (2026-03-17)

### Custom DatePicker component (EducatorsModule)
Replaces all native `<input type="date">` across the Educators module with a custom
inline datepicker that:
- Opens anchored to the field (not top-left of screen)
- Uses `position: fixed` with viewport-aware placement (flips above field if near
  bottom of screen)
- Day view: click Month name → Month picker; click Year → Year picker
- Month and Year views both show a "← Days" back-button to return to day grid
- Min/max date constraints enforced (disabled days rendered in grey, unclickable)
- "Today" shortcut button in day view
- Clear button (✕) appears when a date is set
- Displays date in browser locale (undefined locale, respects system settings)
- Affected inputs: DOB, Start Date, all cert expiries (First Aid / CPR / Anaphylaxis /
  Asthma / WWCC), special availability period start/end, leave request start/end,
  document expiry dates in pending queue and saved docs edit mode, all wizard steps

### Document viewer popup (EducatorsModule → Documents tab)
- Document labels in the saved documents table are now clickable (underlined)
  and open a full-screen overlay viewer
- Images (JPG, PNG, WebP, GIF) render inline in the viewer
- PDFs render via an `<iframe>` in the viewer
- Documents uploaded without drag-and-drop (name-only records) show a placeholder
  with label, category, filename and expiry — with a note explaining preview requires
  drag-and-drop upload
- 📄 icon appears next to label when data_url is available for the doc
- Viewer closes on backdrop click or ✕ button

### Document data storage
- `data_url TEXT` column added to `educator_documents` table (migration applied)
- Documents POST and PUT routes updated to accept and store `data_url`
- When saving a pending AI-analysed document, the base64 data URL is persisted so
  it can be retrieved for inline preview on subsequent loads

### Educator photo propagation — Parent Portal
- Observation cards in the Parent Portal now show a circular educator avatar (36px)
  next to the educator name / date line
- Uses `educator_photo_url` field returned by the learning stories API
- Falls back to first-letter initial if no photo

### Learning stories API — educator photo join
- `GET /api/learning/families/:id/stories` and `GET /api/learning/stories` both now
  LEFT JOIN the `educators` table to retrieve `photo_url as educator_photo_url`
  (matched by email or educator_id)

### Remaining date inputs outside Educators module
Native `<input type="date">` in other modules (Invoicing, Rostering, etc.) are left
as-is for this release; the custom DatePicker is currently scoped to EducatorsModule.

## v2.2.27 Changes (2026-03-17)

### EducatorsModule — Full Rebuild
1. **Add Educator Wizard** (7 steps, skip-able):
   - Step 1: Photo upload + First/Last name + DOB
   - Step 2: Contact details — email, phone, full address with AU state selector
   - Step 3: Employment — qualification picklist, type, start date, hourly rate (text input), contracted hours, TFN
   - Step 4: Certifications — First Aid checkbox, all expiry dates, WWCC
   - Step 5: Availability — weekly grid with start/end times
   - Step 6: Bank & Super — full super fund + bank details
   - Step 7: Review & submit
   - Photo stored as base64 data URL, shown throughout system

2. **Number inputs fixed** — All monetary/numeric inputs use text inputMode="decimal" not type="number", eliminating keyboard-increment bug

3. **Super Fund autocomplete** — `super_funds` table stores funds per tenant; typing shows matching dropdown; "+ Add new fund" creates full APRA/SMSF record (ABN, USI, ESA, bank details for SMSF); selected fund auto-fills USI

4. **Profile photos** — Click avatar in header to upload; stored via `/api/educators/:id/photo`; shown on cards list and detail header; used in wizard

5. **Availability improvements**:
   - Time validation: end time must be after start time, inline error shown
   - "Can Start Earlier" + "Can Stay Later" columns with configurable minutes
   - Special Availability Periods: date-range + day picker + early/late flags + notes; surfaced to AI rostering engine
   - Save shows toast notification

6. **Documents tab — drag & drop + AI analysis**:
   - Drop zone accepts multiple files (PDF, JPG, PNG)
   - If `c360_anthropic_key` in localStorage: Claude AI classifies each document, suggests label, category, expiry, cert_field
   - Pending queue lets user edit suggestions before saving
   - "Save All" batch saves
   - If cert_field detected (e.g. first_aid_expiry), auto-updates educator record
   - Edit in-place: click Edit on any saved doc to modify label/category/expiry without re-upload
   - PUT /api/educators/:id/documents/:docId added

7. **Address fields** — street, suburb, state (AU_STATES selector), postcode; shown in Profile tab

8. **Start Date** — now saved on both wizard POST and existing editor; column migration added

9. **State selector** — dropdown of ACT/NSW/NT/QLD/SA/TAS/VIC/WA

### Dashboard improvements
- **Alerts bell** — clicking "N Active Alerts" navigates to Compliance tab
- **StatCards clickable** — Children→children, Educators→educators, Required/ECTs→compliance
- **Room Ratio card** → Rooms tab
- **Room Occupancy chart** → Rooms tab
- **Staff Qualifications card** → Educators tab
- **Recent Activity card** → Clock In/Out tab
- Cards show subtle "→ Section" label

### Date format
- All `toLocaleDateString("en-AU")` calls in header replaced with `undefined` locale (uses browser system locale)
- `fmtDate()` helper in EducatorsModule also uses undefined locale

### Global Toast System (App.jsx)
- `window.showToast(msg, type)` available anywhere
- Bottom-right, 3-second auto-dismiss, green/red/yellow variants
- Called from EducatorsModule on every save action
- ToastContainer renders inside ChildcareRosterApp

### DB changes
- New table: `super_funds` (tenant-scoped, fund_name/ABN/USI/ESA/SMSF bank details)
- New table: `educator_special_availability` (educator date-range availability with early/late flags)
- New columns on educators: `super_fund_abn`, `super_fund_id`, `start_date`, `address`, `suburb`, `state`, `postcode`, `dob`

### Server new routes (server/educators.js)
- `GET  /api/educators/super-funds` — list funds for tenant
- `POST /api/educators/super-funds` — create fund
- `GET  /api/educators/:id/special-availability` — list special periods
- `POST /api/educators/:id/special-availability` — add period
- `DELETE /api/educators/:id/special-availability/:id` — remove period
- `POST /api/educators/:id/photo` — save base64 photo URL
- `PUT  /api/educators/:id/documents/:docId` — edit document label/category/expiry

## Deploy
```bash
kill -9 $(lsof -t -i:3003) 2>/dev/null
cd ~/childcare360-app
tar xf /media/sf_VM_Shared_Folder/childcare360-v2.2.27-YYYYMMDDHHMM.tar.gz --strip-components=1
npm install && npx vite build
nohup node server/index.js > childcare360.log 2>&1 &
sleep 3 && curl -s http://localhost:3003/health
```

## Known items (by design, not bugs)
- Photo stored as base64 data URL in DB — fine for small images; production should move to S3
- AI document analysis requires `c360_anthropic_key` in localStorage (Settings → Integrations)
- Super fund list is tenant-scoped (each centre builds their own list)
- Special availability periods are informational for AI rostering; actual enforcement in rostering engine
