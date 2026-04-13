import { Router } from 'express';
import { D, uuid, auditLog } from './db.js';
import { requireAuth, requireTenant, requireRole } from './middleware.js';

const router = Router();

// ── GET / — list enrolment summary (children + counts) ─────────────────────
router.get('/', requireAuth, requireTenant, (req, res) => {
  try {
    const children = D().prepare(
      'SELECT id, first_name, last_name, dob, room_id, enrolled_date, active FROM children WHERE tenant_id=? ORDER BY first_name, last_name'
    ).all(req.tenantId);
    const applications = D().prepare(
      'SELECT id, status, child_first_name, child_last_name, submitted_at FROM enrolment_applications WHERE tenant_id=? ORDER BY submitted_at DESC LIMIT 50'
    ).all(req.tenantId);
    res.json({ children, applications });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PUBLIC: Parent enrolment (no tenant needed, just auth) ──────────────────
router.post('/apply', requireAuth, (req, res) => {
  const a = req.body;
  const id = uuid();
  const tenantId = a.tenantId || req.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Service ID required' });
  D().prepare(`INSERT INTO enrolment_applications (id,tenant_id,parent_user_id,status,
    child_first_name,child_last_name,child_dob,child_gender,child_indigenous,child_language,
    child_cultural_needs,child_allergies,child_medical_conditions,child_dietary,
    preferred_room,preferred_days,preferred_start_date,
    parent1_name,parent1_email,parent1_phone,parent1_address,parent1_employer,parent1_work_phone,parent1_crn,
    parent2_name,parent2_email,parent2_phone,
    emergency_contact1_name,emergency_contact1_phone,emergency_contact1_relationship,
    emergency_contact2_name,emergency_contact2_phone,emergency_contact2_relationship,
    authorised_pickup,authorised_medical_treatment,authorised_ambulance,
    sunscreen_consent,photo_consent,excursion_consent,
    doctor_name,doctor_phone,doctor_address,medicare_number,medicare_ref,private_health,
    family_court_orders,court_order_details,additional_notes,submitted_at)
    VALUES(${Array(48).fill('?').join(',')})`)
  .run(id,tenantId,req.userId,'submitted',
    a.childFirstName,a.childLastName,a.childDob,a.childGender,a.childIndigenous||'no',a.childLanguage||'English',
    a.childCulturalNeeds,a.childAllergies||'None',a.childMedicalConditions,a.childDietary||'None',
    a.preferredRoom,JSON.stringify(a.preferredDays||[]),a.preferredStartDate,
    a.parent1Name,a.parent1Email,a.parent1Phone,a.parent1Address,a.parent1Employer,a.parent1WorkPhone,a.parent1Crn,
    a.parent2Name,a.parent2Email,a.parent2Phone,
    a.emergency1Name,a.emergency1Phone,a.emergency1Relationship,
    a.emergency2Name,a.emergency2Phone,a.emergency2Relationship,
    JSON.stringify(a.authorisedPickup||[]),a.authorisedMedical?1:0,a.authorisedAmbulance?1:0,
    a.sunscreenConsent?1:0,a.photoConsent?1:0,a.excursionConsent?1:0,
    a.doctorName,a.doctorPhone,a.doctorAddress,a.medicareNumber,a.medicareRef,a.privateHealth,
    a.familyCourtOrders?1:0,a.courtOrderDetails,a.additionalNotes,new Date().toISOString());
  res.json({ id, status: 'submitted' });
});

// ── Parent: view own applications ───────────────────────────────────────────
router.get('/my-applications', requireAuth, (req, res) => {
  res.json(D().prepare('SELECT * FROM enrolment_applications WHERE parent_user_id=? ORDER BY created_at DESC').all(req.userId));
});

// ── Parent: my children's info at a centre ──────────────────────────────────
router.get('/my-children', requireAuth, (req, res) => {
  const pc = D().prepare('SELECT pc.child_id, c.first_name, c.last_name, c.dob, c.room_id, c.allergies, r.name as room_name, pc.tenant_id, t.name as centre_name FROM parent_contacts pc JOIN children c ON c.id=pc.child_id LEFT JOIN rooms r ON r.id=c.room_id JOIN tenants t ON t.id=pc.tenant_id WHERE pc.email=(SELECT email FROM users WHERE id=?)').all(req.userId);
  res.json(pc);
});

// ── Parent: my invoices ─────────────────────────────────────────────────────
router.get('/my-invoices', requireAuth, (req, res) => {
  const email = D().prepare('SELECT email FROM users WHERE id=?').get(req.userId)?.email;
  const childIds = D().prepare('SELECT child_id FROM parent_contacts WHERE email=?').all(email).map(r => r.child_id);
  if (!childIds.length) return res.json([]);
  const placeholders = childIds.map(() => '?').join(',');
  const invoices = D().prepare((() => { const _s = 'SELECT i.*, c.first_name, c.last_name FROM invoices i JOIN children c ON c.id=i.child_id WHERE i.child_id IN (' + placeholders + ") AND i.status != 'draft' ORDER BY i.created_at DESC"; return _s; })()).all(...childIds);
  res.json(invoices.map(r => ({ ...r, sessions: JSON.parse(r.sessions||'[]') })));
});

// ── CENTRE: list applications ───────────────────────────────────────────────
router.get('/applications', requireAuth, requireTenant, requireRole('owner','admin','director'), (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT * FROM enrolment_applications WHERE tenant_id=?';
  const p = [req.tenantId];
  if (status) { sql += ' AND status=?'; p.push(status); }
  res.json(D().prepare(sql + ' ORDER BY submitted_at DESC').all(...p));
});

// ── CENTRE: review application ──────────────────────────────────────────────
//
// BUG-ENR-02 fix: previously this handler had no try/catch, no transaction,
// and would silently fail when child_dob or child_last_name were null
// (children.dob is NOT NULL, last_name is NOT NULL). It also blindly wrote
// status='approved' BEFORE attempting the children INSERT, leaving the
// application in an inconsistent state when the INSERT threw.
//
// Fix: wrap status update + child + parent contacts in a single
// better-sqlite3 transaction so partial writes can't happen, default the
// NOT NULL fields, and return a proper error JSON.
//
// Also accepts partial consent updates from the UI: any of the
// authorised_*/sunscreen_consent/photo_consent/excursion_consent /
// consent_* keys in the body will be persisted.
router.put('/applications/:id', requireAuth, requireTenant, requireRole('owner','admin','director'), (req, res) => {
  try {
    const db = D();
    const { status, reviewNotes } = req.body;

    // Allow partial consent updates via the same endpoint
    const consentFields = [
      'authorised_medical_treatment', 'authorised_ambulance',
      'sunscreen_consent', 'photo_consent', 'excursion_consent',
      'consent_medical', 'consent_ambulance', 'consent_sunscreen',
      'consent_photos', 'consent_excursions',
    ];
    const consentUpdates = {};
    for (const f of consentFields) {
      if (req.body[f] !== undefined) consentUpdates[f] = req.body[f] ? 1 : 0;
    }

    const runUpdate = db.transaction(() => {
      // 1. Update the application row
      if (status !== undefined || reviewNotes !== undefined) {
        db.prepare(`
          UPDATE enrolment_applications
          SET status = COALESCE(?, status),
              reviewed_by = ?,
              reviewed_at = datetime('now'),
              review_notes = COALESCE(?, review_notes),
              updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(status || null, req.userId, reviewNotes || null, req.params.id, req.tenantId);
      }

      // 2. Apply any consent updates
      const validConsentKeys = Object.keys(consentUpdates).filter(f => consentFields.includes(f));
      if (validConsentKeys.length) {
        const setClause = validConsentKeys.map(f => f + ' = ?').join(', ');
        const values = validConsentKeys.map(f => consentUpdates[f]);
        db.prepare(
          'UPDATE enrolment_applications SET ' + setClause + ", updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
        ).run(...values, req.params.id, req.tenantId);
      }

      // 3. If approved, create the child record + parent contacts
      if (status === 'approved') {
        const app = db.prepare(
          'SELECT * FROM enrolment_applications WHERE id = ? AND tenant_id = ?'
        ).get(req.params.id, req.tenantId);
        if (!app) throw new Error('Application not found');

        // Don't create duplicate child records if approved twice
        const alreadyEnrolled = db.prepare(
          "SELECT id FROM children WHERE tenant_id = ? AND first_name = ? AND COALESCE(last_name,'') = COALESCE(?,'') AND COALESCE(dob,'') = COALESCE(?,'')"
        ).get(req.tenantId, app.child_first_name, app.child_last_name || '', app.child_dob || '');

        let childId = alreadyEnrolled?.id;
        if (!childId) {
          childId = uuid();
          // children.dob and children.last_name are NOT NULL — provide
          // safe fallbacks rather than crashing on incomplete applications.
          const safeDob = app.child_dob || new Date().toISOString().split('T')[0];
          const safeLast = app.child_last_name || '';
          // Look up the room — preferred_room may be a name like "Toddlers"
          // or a real room_id. If it doesn't match a real room we leave room_id
          // null rather than inserting garbage.
          let roomId = null;
          if (app.preferred_room) {
            const room = db.prepare(
              "SELECT id FROM rooms WHERE tenant_id = ? AND (id = ? OR LOWER(name) = LOWER(?))"
            ).get(req.tenantId, app.preferred_room, app.preferred_room);
            roomId = room?.id || null;
          }
          db.prepare(`
            INSERT INTO children (id, tenant_id, first_name, last_name, dob, room_id, allergies, enrolled_date)
            VALUES (?,?,?,?,?,?,?,?)
          `).run(childId, req.tenantId, app.child_first_name, safeLast, safeDob,
                 roomId, app.child_allergies || null,
                 new Date().toISOString().split('T')[0]);

          if (app.parent1_name) {
            db.prepare(`
              INSERT INTO parent_contacts
                (id, tenant_id, child_id, name, relationship, email, phone, is_primary, receives_notifications)
              VALUES (?,?,?,?,?,?,?,1,1)
            `).run(uuid(), req.tenantId, childId, app.parent1_name, 'parent',
                   app.parent1_email || null, app.parent1_phone || null);
          }
          if (app.parent2_name) {
            db.prepare(`
              INSERT INTO parent_contacts
                (id, tenant_id, child_id, name, relationship, email, phone, is_primary, receives_notifications)
              VALUES (?,?,?,?,?,?,?,0,1)
            `).run(uuid(), req.tenantId, childId, app.parent2_name, 'parent',
                   app.parent2_email || null, app.parent2_phone || null);
          }
        }
        return childId;
      }
      return null;
    });

    const childId = runUpdate();
    if (childId) {
      try {
        auditLog(req.userId, req.tenantId, 'enrolment_approved',
          { appId: req.params.id, childId }, req.ip, req.headers['user-agent']);
      } catch (e) { /* non-fatal */ }
    }
    res.json({ success: true, child_id: childId || null });
  } catch (err) {
    console.error('[enrolment:approve]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── CENTRE: create a new application directly (BUG-ENR-04) ────────────────
// Used by the manager-side "+ New Application" form. Mirrors the parent /apply
// route but lighter — only the fields the form actually collects.
router.post('/applications', requireAuth, requireTenant, requireRole('owner','admin','director'), (req, res) => {
  try {
    const b = req.body || {};
    if (!b.child_first_name || !b.parent1_name) {
      return res.status(400).json({ error: 'child_first_name and parent1_name required' });
    }
    const id = uuid();
    D().prepare(`
      INSERT INTO enrolment_applications
        (id, tenant_id, status,
         child_first_name, child_last_name, child_dob, child_gender,
         preferred_room, preferred_start_date,
         parent1_name, parent1_email, parent1_phone,
         additional_notes, submitted_at)
      VALUES (?,?,?, ?,?,?,?, ?,?, ?,?,?, ?, datetime('now'))
    `).run(id, req.tenantId, b.status || 'submitted',
           b.child_first_name, b.child_last_name || null, b.child_dob || null, b.child_gender || null,
           b.preferred_room || null, b.preferred_start_date || null,
           b.parent1_name, b.parent1_email || null, b.parent1_phone || null,
           b.additional_notes || null);
    res.json({ id, ok: true });
  } catch (err) {
    console.error('[enrolment:create-application]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── BUG-ENR-05 — DOCUMENT UPLOAD ──────────────────────────────────────────
// Stored as a base64 data_url in enrolment_documents — same convention used
// by educator_documents and child_documents elsewhere in the codebase. The
// upload UI sends JSON with { file_name, mime_type, file_size, data_url }.
router.get('/applications/:id/documents', requireAuth, requireTenant, (req, res) => {
  try {
    D().exec(`CREATE TABLE IF NOT EXISTS enrolment_documents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER DEFAULT 0,
      data_url TEXT,
      uploaded_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    const rows = D().prepare(`
      SELECT id, file_name, mime_type, file_size, uploaded_by, created_at
      FROM enrolment_documents
      WHERE application_id = ? AND tenant_id = ?
      ORDER BY created_at DESC
    `).all(req.params.id, req.tenantId);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/applications/:id/documents', requireAuth, requireTenant, (req, res) => {
  try {
    const { file_name, mime_type, file_size, data_url } = req.body || {};
    if (!file_name || !data_url) {
      return res.status(400).json({ error: 'file_name and data_url required' });
    }
    D().exec(`CREATE TABLE IF NOT EXISTS enrolment_documents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER DEFAULT 0,
      data_url TEXT,
      uploaded_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    const id = uuid();
    D().prepare(`
      INSERT INTO enrolment_documents
        (id, tenant_id, application_id, file_name, mime_type, file_size, data_url, uploaded_by)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(id, req.tenantId, req.params.id, file_name, mime_type || null,
           file_size || 0, data_url, req.userId || null);
    res.json({ id, ok: true });
  } catch (err) {
    console.error('[enrolment:upload-doc]', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/applications/:id/documents/:docId', requireAuth, requireTenant, (req, res) => {
  try {
    D().prepare(
      'DELETE FROM enrolment_documents WHERE id = ? AND application_id = ? AND tenant_id = ?'
    ).run(req.params.docId, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── BUG-ENR-07 — EMERGENCY CONTACTS ───────────────────────────────────────
router.get('/applications/:id/emergency-contacts', requireAuth, requireTenant, (req, res) => {
  try {
    D().exec(`CREATE TABLE IF NOT EXISTS enrolment_emergency_contacts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      name TEXT NOT NULL,
      relationship TEXT,
      phone TEXT,
      mobile TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    const rows = D().prepare(`
      SELECT * FROM enrolment_emergency_contacts
      WHERE application_id = ? AND tenant_id = ?
      ORDER BY created_at ASC
    `).all(req.params.id, req.tenantId);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/applications/:id/emergency-contacts', requireAuth, requireTenant, (req, res) => {
  try {
    const { name, relationship, phone, mobile } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    D().exec(`CREATE TABLE IF NOT EXISTS enrolment_emergency_contacts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      name TEXT NOT NULL,
      relationship TEXT,
      phone TEXT,
      mobile TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    const id = uuid();
    D().prepare(`
      INSERT INTO enrolment_emergency_contacts
        (id, tenant_id, application_id, name, relationship, phone, mobile)
      VALUES (?,?,?,?,?,?,?)
    `).run(id, req.tenantId, req.params.id, name, relationship || null, phone || null, mobile || null);
    res.json({ id, ok: true });
  } catch (err) {
    console.error('[enrolment:add-emergency]', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/applications/:id/emergency-contacts/:contactId', requireAuth, requireTenant, (req, res) => {
  try {
    D().prepare(
      'DELETE FROM enrolment_emergency_contacts WHERE id = ? AND application_id = ? AND tenant_id = ?'
    ).run(req.params.contactId, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── WAITLIST ROUTES ─────────────────────────────────────────────────────────

router.get('/waitlist', requireAuth, requireTenant, (req, res) => {
  const rows = D().prepare('SELECT w.*, r.name as room_name FROM waitlist w LEFT JOIN rooms r ON r.id=w.preferred_room WHERE w.tenant_id=? ORDER BY CASE w.priority WHEN \'urgent\' THEN 0 WHEN \'high\' THEN 1 WHEN \'normal\' THEN 2 ELSE 3 END, w.created_at ASC').all(req.tenantId);
  res.json(rows.map(r => ({ ...r, preferred_days: JSON.parse(r.preferred_days || '[]') })));
});

router.post('/waitlist', requireAuth, requireTenant, (req, res) => {
  const { child_name, child_dob, parent_name, parent_email, parent_phone, preferred_room, preferred_days, preferred_start, notes, priority = 'normal' } = req.body;
  if (!child_name || !parent_name) return res.status(400).json({ error: 'child_name and parent_name required' });
  const id = uuid();
  D().prepare('INSERT INTO waitlist (id,tenant_id,child_name,child_dob,parent_name,parent_email,parent_phone,preferred_room,preferred_days,preferred_start,notes,priority,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, req.tenantId, child_name, child_dob || null, parent_name, parent_email || null, parent_phone || null, preferred_room || null, JSON.stringify(preferred_days || []), preferred_start || null, notes || null, priority, 'waiting');
  res.json({ id, ok: true });
});

router.put('/waitlist/:id', requireAuth, requireTenant, (req, res) => {
  const { child_name, child_dob, parent_name, parent_email, parent_phone, preferred_room, preferred_days, preferred_start, notes, priority, status } = req.body;
  D().prepare('UPDATE waitlist SET child_name=COALESCE(?,child_name), child_dob=COALESCE(?,child_dob), parent_name=COALESCE(?,parent_name), parent_email=COALESCE(?,parent_email), parent_phone=COALESCE(?,parent_phone), preferred_room=COALESCE(?,preferred_room), preferred_days=COALESCE(?,preferred_days), preferred_start=COALESCE(?,preferred_start), notes=COALESCE(?,notes), priority=COALESCE(?,priority), status=COALESCE(?,status), updated_at=datetime(\'now\') WHERE id=? AND tenant_id=?').run(child_name, child_dob, parent_name, parent_email, parent_phone, preferred_room, preferred_days ? JSON.stringify(preferred_days) : null, preferred_start, notes, priority, status, req.params.id, req.tenantId);
  res.json({ ok: true });
});

router.delete('/waitlist/:id', requireAuth, requireTenant, (req, res) => {
  D().prepare('DELETE FROM waitlist WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId);
  res.json({ ok: true });
});

// Convert waitlist entry to enrolment application
router.post('/waitlist/:id/convert', requireAuth, requireTenant, (req, res) => {
  const entry = D().prepare('SELECT * FROM waitlist WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  const appId = uuid();
  D().prepare('INSERT INTO enrolment_applications (id,tenant_id,status,child_first_name,preferred_room,preferred_days,preferred_start_date,parent1_name,parent1_email,parent1_phone,additional_notes,submitted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,datetime(\'now\'))').run(appId, req.tenantId, 'submitted', entry.child_name, entry.preferred_room, entry.preferred_days, entry.preferred_start, entry.parent_name, entry.parent_email, entry.parent_phone, entry.notes);
  D().prepare("UPDATE waitlist SET status='converted',updated_at=datetime('now') WHERE id=? AND tenant_id=?").run(req.params.id, req.tenantId);
  res.json({ id: appId, ok: true });
});

// Export at the bottom of the file (was previously mid-file at line 111,
// which worked accidentally because routers are mutable but is bad practice).
export default router;
