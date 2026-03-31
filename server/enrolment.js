import { Router } from 'express';
import { D, uuid, auditLog } from './db.js';
import { requireAuth, requireTenant, requireRole } from './middleware.js';

const router = Router();

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
  const invoices = D().prepare(`SELECT i.*, c.first_name, c.last_name FROM invoices i JOIN children c ON c.id=i.child_id WHERE i.child_id IN (${placeholders}) AND i.status != 'draft' ORDER BY i.created_at DESC`).all(...childIds);
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
router.put('/applications/:id', requireAuth, requireTenant, requireRole('owner','admin','director'), (req, res) => {
  const { status, reviewNotes } = req.body;
  D().prepare("UPDATE enrolment_applications SET status=?,reviewed_by=?,reviewed_at=datetime('now'),review_notes=?,updated_at=datetime('now') WHERE id=? AND tenant_id=?")
    .run(status, req.userId, reviewNotes, req.params.id, req.tenantId);
  // If approved, create the child record
  if (status === 'approved') {
    const app = D().prepare('SELECT * FROM enrolment_applications WHERE id=?').get(req.params.id);
    if (app) {
      const childId = uuid();
      D().prepare('INSERT INTO children (id,tenant_id,first_name,last_name,dob,room_id,allergies,enrolled_date) VALUES(?,?,?,?,?,?,?,?)')
        .run(childId, req.tenantId, app.child_first_name, app.child_last_name, app.child_dob, app.preferred_room, app.child_allergies, new Date().toISOString().split('T')[0]);
      // Create parent contacts
      if (app.parent1_name) {
        D().prepare('INSERT INTO parent_contacts (id,tenant_id,child_id,name,relationship,email,phone,is_primary,receives_notifications) VALUES(?,?,?,?,?,?,?,1,1)')
          .run(uuid(), req.tenantId, childId, app.parent1_name, 'parent', app.parent1_email, app.parent1_phone);
      }
      if (app.parent2_name) {
        D().prepare('INSERT INTO parent_contacts (id,tenant_id,child_id,name,relationship,email,phone,is_primary,receives_notifications) VALUES(?,?,?,?,?,?,?,0,1)')
          .run(uuid(), req.tenantId, childId, app.parent2_name, 'parent', app.parent2_email, app.parent2_phone);
      }
      auditLog(req.userId, req.tenantId, 'enrolment_approved', { appId: req.params.id, childId }, req.ip, req.headers['user-agent']);
    }
  }
  res.json({ success: true });
});

export default router;

// ── WAITLIST ROUTES ─────────────────────────────────────────────────────────

router.get('/waitlist', requireAuth, requireTenant, (req, res) => {
  const rows = D().prepare(`SELECT w.*, r.name as room_name FROM waitlist w LEFT JOIN rooms r ON r.id=w.preferred_room WHERE w.tenant_id=? ORDER BY CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, w.created_at ASC`).all(req.tenantId);
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
  D().prepare(`UPDATE waitlist SET child_name=COALESCE(?,child_name), child_dob=COALESCE(?,child_dob), parent_name=COALESCE(?,parent_name), parent_email=COALESCE(?,parent_email), parent_phone=COALESCE(?,parent_phone), preferred_room=COALESCE(?,preferred_room), preferred_days=COALESCE(?,preferred_days), preferred_start=COALESCE(?,preferred_start), notes=COALESCE(?,notes), priority=COALESCE(?,priority), status=COALESCE(?,status), updated_at=datetime('now') WHERE id=? AND tenant_id=?`).run(child_name, child_dob, parent_name, parent_email, parent_phone, preferred_room, preferred_days ? JSON.stringify(preferred_days) : null, preferred_start, notes, priority, status, req.params.id, req.tenantId);
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
  D().prepare(`INSERT INTO enrolment_applications (id,tenant_id,status,child_first_name,preferred_room,preferred_days,preferred_start_date,parent1_name,parent1_email,parent1_phone,additional_notes,submitted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(appId, req.tenantId, 'submitted', entry.child_name, entry.preferred_room, entry.preferred_days, entry.preferred_start, entry.parent_name, entry.parent_email, entry.parent_phone, entry.notes);
  D().prepare("UPDATE waitlist SET status='converted',updated_at=datetime('now') WHERE id=?").run(req.params.id);
  res.json({ id: appId, ok: true });
});
