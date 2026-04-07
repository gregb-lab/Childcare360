import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { D, uuid, auditLog } from './db.js';
import { requireAuth, requireTenant, requireRole } from './middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const router = Router();
router.use(requireAuth);
router.use(requireTenant);

const store = multer.diskStorage({
  destination: (req, _f, cb) => {
    const dir = path.join(UPLOAD_DIR, req.tenantId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_r, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage: store, limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_r, file, cb) => {
    const ok = ['.pdf','.jpg','.jpeg','.png','.gif','.doc','.docx','.heic','.webp'];
    cb(null, ok.includes(path.extname(file.originalname).toLowerCase()));
  },
});

// ── Australian NIP Schedule ─────────────────────────────────────────────────
export const NIP_SCHEDULE = [
  { vaccine:'Hepatitis B', months:0, dose:1 },
  { vaccine:'DTPa-hepB-IPV-Hib', months:2, dose:1 },
  { vaccine:'Pneumococcal (13vPCV)', months:2, dose:1 },
  { vaccine:'Rotavirus', months:2, dose:1 },
  { vaccine:'DTPa-hepB-IPV-Hib', months:4, dose:2 },
  { vaccine:'Pneumococcal (13vPCV)', months:4, dose:2 },
  { vaccine:'Rotavirus', months:4, dose:2 },
  { vaccine:'DTPa-hepB-IPV-Hib', months:6, dose:3 },
  { vaccine:'MMR', months:12, dose:1 },
  { vaccine:'Meningococcal ACWY', months:12, dose:1 },
  { vaccine:'Pneumococcal (13vPCV)', months:12, dose:3 },
  { vaccine:'DTPa', months:18, dose:4 },
  { vaccine:'Hib (booster)', months:18, dose:4 },
  { vaccine:'MMRV', months:18, dose:2 },
  { vaccine:'DTPa-IPV', months:48, dose:5 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ██  UPLOAD DOCUMENT
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/upload/:childId', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { childId } = req.params;
    const { category, docType, notes } = req.body;
    const child = D().prepare('SELECT id FROM children WHERE id=? AND tenant_id=?').get(childId, req.tenantId);
    if (!child) return res.status(404).json({ error: 'Child not found' });

    const docId = uuid();
    D().prepare(
      'INSERT INTO child_documents (id,tenant_id,child_id,category,doc_type,file_name,file_path,file_size,mime_type,uploaded_by,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
    ).run(docId, req.tenantId, childId, category||'other', docType||'other',
      req.file.originalname, req.file.path, req.file.size, req.file.mimetype, req.userId, notes||'');

    auditLog(req.userId, req.tenantId, 'doc_uploaded', { childId, docId, category, file: req.file.originalname }, req.ip, req.headers['user-agent']);
    setTimeout(() => analyseDocument(docId, req.tenantId), 100);

    res.json({ id: docId, fileName: req.file.originalname, status: 'processing' });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ── List documents for a child ──────────────────────────────────────────────
router.get('/child/:childId', (req, res) => {
  const docs = D().prepare(
    'SELECT d.*, u.name as uploaded_by_name FROM child_documents d LEFT JOIN users u ON u.id=d.uploaded_by WHERE d.child_id=? AND d.tenant_id=? ORDER BY d.created_at DESC'
  ).all(req.params.childId, req.tenantId);
  res.json(docs.map(d => ({ ...d, ai_extracted: JSON.parse(d.ai_extracted||'{}') })));
});

// ── Download/view a document ────────────────────────────────────────────────
router.get('/file/:docId', (req, res) => {
  const doc = D().prepare('SELECT * FROM child_documents WHERE id=? AND tenant_id=?').get(req.params.docId, req.tenantId);
  if (!doc || !doc.file_path) return res.status(404).json({ error: 'Document not found' });
  if (!fs.existsSync(doc.file_path)) return res.status(404).json({ error: 'File missing from storage' });
  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${doc.file_name}"`);
  fs.createReadStream(doc.file_path).pipe(res);
});

// ── Delete document ─────────────────────────────────────────────────────────
router.delete('/:docId', requireAuth, requireTenant, requireRole('owner','admin','director'), (req, res) => {
  const doc = D().prepare('SELECT * FROM child_documents WHERE id=? AND tenant_id=?').get(req.params.docId, req.tenantId);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (doc.file_path && fs.existsSync(doc.file_path)) fs.unlinkSync(doc.file_path);
  D().prepare('DELETE FROM child_documents WHERE id=?').run(req.params.docId);
  auditLog(req.userId, req.tenantId, 'doc_deleted', { docId: req.params.docId, file: doc.file_name }, req.ip, req.headers['user-agent']);
  res.json({ success: true });
});

// ── Re-trigger AI analysis ──────────────────────────────────────────────────
router.post('/reanalyse/:docId', (req, res) => {
  const doc = D().prepare('SELECT id FROM child_documents WHERE id=? AND tenant_id=?').get(req.params.docId, req.tenantId);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  setTimeout(() => analyseDocument(req.params.docId, req.tenantId), 100);
  res.json({ status: 'processing' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  IMMUNISATION RECORDS
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/immunisations/:childId', (req, res) => {
  const records = D().prepare('SELECT * FROM immunisation_records WHERE child_id=? AND tenant_id=? ORDER BY date_given DESC')
    .all(req.params.childId, req.tenantId);
  const child = D().prepare('SELECT dob FROM children WHERE id=? AND tenant_id=?').get(req.params.childId, req.tenantId);
  const ageMonths = child ? Math.floor((Date.now() - new Date(child.dob).getTime()) / (30.44*86400000)) : 0;
  const due = NIP_SCHEDULE.filter(v => v.months <= ageMonths);
  const given = records.map(r => r.vaccine_name + '_' + r.dose_number);
  const overdue = due.filter(v => !given.includes(v.vaccine + '_' + v.dose));
  res.json({ records, schedule: { ageMonths, expected: due.length, recorded: records.length, overdue } });
});

router.post('/immunisations/:childId', (req, res) => {
  const { vaccineName, doseNumber, dateGiven, batchNumber, provider, nextDueDate } = req.body;
  const id = uuid();
  D().prepare(
    'INSERT INTO immunisation_records (id,tenant_id,child_id,vaccine_name,dose_number,date_given,batch_number,provider,next_due_date,status) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id, req.tenantId, req.params.childId, vaccineName, doseNumber||1, dateGiven, batchNumber, provider, nextDueDate, 'current');
  res.json({ id });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  MEDICAL PLANS
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/medical-plans/:childId', (req, res) => {
  const plans = D().prepare('SELECT * FROM medical_plans WHERE child_id=? AND tenant_id=? ORDER BY created_at DESC')
    .all(req.params.childId, req.tenantId);
  res.json(plans.map(p => ({
    ...p, triggers: JSON.parse(p.triggers||'[]'), symptoms: JSON.parse(p.symptoms||'[]'),
    action_steps: JSON.parse(p.action_steps||'[]'), medications: JSON.parse(p.medications||'[]'),
  })));
});

router.post('/medical-plans/:childId', (req, res) => {
  const p = req.body;
  const id = uuid();
  D().prepare(
    'INSERT INTO medical_plans (id,tenant_id,child_id,plan_type,condition_name,severity,triggers,symptoms,action_steps,medications,doctor_name,doctor_phone,hospital_preference,review_date,status,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(id, req.tenantId, req.params.childId, p.planType, p.conditionName, p.severity||'moderate',
    JSON.stringify(p.triggers||[]), JSON.stringify(p.symptoms||[]), JSON.stringify(p.actionSteps||[]),
    JSON.stringify(p.medications||[]), p.doctorName, p.doctorPhone, p.hospitalPreference,
    p.reviewDate, 'current', p.notes||'');
  res.json({ id });
});

router.put('/medical-plans/:planId', (req, res) => {
  const p = req.body;
  D().prepare(
    "UPDATE medical_plans SET condition_name=COALESCE(?,condition_name), severity=COALESCE(?,severity), triggers=COALESCE(?,triggers), symptoms=COALESCE(?,symptoms), action_steps=COALESCE(?,action_steps), medications=COALESCE(?,medications), doctor_name=COALESCE(?,doctor_name), doctor_phone=COALESCE(?,doctor_phone), hospital_preference=COALESCE(?,hospital_preference), review_date=COALESCE(?,review_date), status=COALESCE(?,status), notes=COALESCE(?,notes), updated_at=datetime('now') WHERE id=? AND tenant_id=?"
  ).run(p.conditionName, p.severity, p.triggers?JSON.stringify(p.triggers):null,
    p.symptoms?JSON.stringify(p.symptoms):null, p.actionSteps?JSON.stringify(p.actionSteps):null,
    p.medications?JSON.stringify(p.medications):null, p.doctorName, p.doctorPhone,
    p.hospitalPreference, p.reviewDate, p.status, p.notes, req.params.planId, req.tenantId);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  MEDICATIONS
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/medications/:childId', (req, res) => {
  res.json(D().prepare('SELECT * FROM medications WHERE child_id=? AND tenant_id=? ORDER BY status,name')
    .all(req.params.childId, req.tenantId));
});

router.post('/medications/:childId', (req, res) => {
  const m = req.body;
  const id = uuid();
  D().prepare(
    'INSERT INTO medications (id,tenant_id,child_id,name,dosage,frequency,route,reason,prescriber,pharmacy,expiry_date,quantity_held,storage,requires_refrigeration,parent_consent,consent_date,administration_plan,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(id, req.tenantId, req.params.childId, m.name, m.dosage, m.frequency, m.route||'oral',
    m.reason, m.prescriber, m.pharmacy, m.expiryDate, m.quantityHeld||0, m.storage||'room_temperature',
    m.requiresRefrigeration?1:0, m.parentConsent?1:0, m.consentDate, m.administrationPlan||'', 'active');
  res.json({ id });
});

router.put('/medications/:medId', (req, res) => {
  const m = req.body;
  D().prepare(
    "UPDATE medications SET name=COALESCE(?,name), dosage=COALESCE(?,dosage), frequency=COALESCE(?,frequency), expiry_date=COALESCE(?,expiry_date), quantity_held=COALESCE(?,quantity_held), status=COALESCE(?,status), updated_at=datetime('now') WHERE id=? AND tenant_id=?"
  ).run(m.name, m.dosage, m.frequency, m.expiryDate, m.quantityHeld, m.status, req.params.medId, req.tenantId);
  res.json({ success: true });
});

// ── Medication administration log ───────────────────────────────────────────
router.get('/med-log/:childId', (req, res) => {
  res.json(D().prepare(
    'SELECT ml.*, m.name as med_name, u1.name as admin_name, u2.name as witness_name FROM medication_log ml JOIN medications m ON m.id=ml.medication_id LEFT JOIN users u1 ON u1.id=ml.administered_by LEFT JOIN users u2 ON u2.id=ml.witnessed_by WHERE ml.child_id=? AND ml.tenant_id=? ORDER BY ml.time_given DESC'
  ).all(req.params.childId, req.tenantId));
});

router.post('/med-log/:childId', (req, res) => {
  const l = req.body;
  const id = uuid();
  D().prepare(
    'INSERT INTO medication_log (id,tenant_id,child_id,medication_id,administered_by,witnessed_by,dose_given,time_given,notes,parent_notified) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id, req.tenantId, req.params.childId, l.medicationId, req.userId, l.witnessedBy,
    l.doseGiven, l.timeGiven||new Date().toISOString(), l.notes||'', l.parentNotified?1:0);
  res.json({ id });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  PARENT CONTACTS
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/parents/:childId', (req, res) => {
  res.json(D().prepare('SELECT * FROM parent_contacts WHERE child_id=? AND tenant_id=? ORDER BY is_primary DESC')
    .all(req.params.childId, req.tenantId));
});

router.post('/parents/:childId', (req, res) => {
  const p = req.body;
  const id = uuid();
  D().prepare(
    'INSERT INTO parent_contacts (id,tenant_id,child_id,name,relationship,email,phone,is_primary,receives_notifications) VALUES(?,?,?,?,?,?,?,?,?)'
  ).run(id, req.tenantId, req.params.childId, p.name, p.relationship||'parent', p.email, p.phone, p.isPrimary?1:0, p.receivesNotifications!==false?1:0);
  res.json({ id });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  AI DOCUMENT ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════
function analyseDocument(docId, tenantId) {
  try {
    const doc = D().prepare('SELECT * FROM child_documents WHERE id=? AND tenant_id=?').get(docId, tenantId);
    if (!doc) return;
    console.log(`  🤖 AI Analysing: ${doc.file_name} (${doc.category}/${doc.doc_type})`);
    D().prepare("UPDATE child_documents SET ai_status='processing' WHERE id=? AND tenant_id=?").run(docId, req.tenantId);

    const child = D().prepare('SELECT * FROM children WHERE id=? AND tenant_id=?').get(doc.child_id, req.tenantId);
    let extracted = { type: doc.category, docType: doc.doc_type };

    if (doc.category === 'immunisation') {
      const ageMonths = child ? Math.floor((Date.now()-new Date(child.dob).getTime())/(30.44*86400000)) : 24;
      const due = NIP_SCHEDULE.filter(v => v.months <= ageMonths);
      const existing = D().prepare('SELECT COUNT(*) as c FROM immunisation_records WHERE child_id=? AND tenant_id=?').get(doc.child_id, tenantId)?.c || 0;
      extracted.analysis = {
        childAge: ageMonths, expectedVaccinations: due.length, recordedVaccinations: existing,
        note: 'Immunisation document received. AI has flagged this for review. Upload the Australian Immunisation Register (AIR) statement for best results.',
        actionRequired: existing < due.length,
      };
      if (existing < due.length) {
        upsertCompliance(tenantId, doc.child_id, 'immunisation', 'imm_review', 'Immunisation — Review needed', 'review_needed', null, docId);
      }
    } else if (doc.category === 'medical_plan') {
      const planMap = {
        anaphylaxis_plan:{c:'Anaphylaxis',s:'severe',t:'anaphylaxis'}, asthma_plan:{c:'Asthma',s:'moderate',t:'asthma'},
        allergy_plan:{c:'Allergy',s:'moderate',t:'allergy'}, epilepsy_plan:{c:'Epilepsy',s:'severe',t:'epilepsy'},
        diabetes_plan:{c:'Diabetes',s:'severe',t:'diabetes'}, medical_plan_other:{c:'Medical condition',s:'moderate',t:'other'},
      };
      const info = planMap[doc.doc_type] || planMap.medical_plan_other;
      const reviewDate = new Date(Date.now()+365*86400000).toISOString().split('T')[0];
      const existing = D().prepare("SELECT id FROM medical_plans WHERE child_id=? AND tenant_id=? AND plan_type=? AND status='current'").get(doc.child_id, tenantId, info.t);
      if (!existing) {
        D().prepare('INSERT INTO medical_plans (id,tenant_id,child_id,plan_type,condition_name,severity,review_date,status,source_doc_id) VALUES(?,?,?,?,?,?,?,?,?)')
          .run(uuid(), tenantId, doc.child_id, info.t, info.c, info.s, reviewDate, 'current', docId);
      } else {
        D().prepare("UPDATE medical_plans SET source_doc_id=?,review_date=?,updated_at=datetime('now') WHERE id=?").run(docId, reviewDate, existing.id);
      }
      upsertCompliance(tenantId, doc.child_id, 'medical_plan', info.t+'_plan', info.c+' management plan', 'current', reviewDate, docId);
      extracted.analysis = { planType: info.t, condition: info.c, reviewDate, updated: !!existing };
    } else if (doc.category === 'medication') {
      const medId = uuid();
      D().prepare('INSERT INTO medications (id,tenant_id,child_id,name,status,source_doc_id) VALUES(?,?,?,?,?,?)')
        .run(medId, tenantId, doc.child_id, 'Pending review — see uploaded document', 'pending_review', docId);
      upsertCompliance(tenantId, doc.child_id, 'medication', 'med_review', 'Medication — Review required', 'review_needed', null, docId);
      extracted.analysis = { medicationId: medId, actionRequired: true, note: 'Medication document filed. Fill in details.' };
    } else {
      extracted.analysis = { note: 'Document filed successfully. Manual review recommended.' };
    }

    D().prepare("UPDATE child_documents SET ai_extracted=?,ai_status='complete' WHERE id=? AND tenant_id=?").run(JSON.stringify(extracted), docId, req.tenantId);
    console.log(`  ✓ AI complete: ${doc.file_name}`);
  } catch (err) {
    console.error('  ✗ AI error:', err.message);
    D().prepare("UPDATE child_documents SET ai_status='error',ai_extracted=? WHERE id=? AND tenant_id=?").run(JSON.stringify({error:err.message}), docId, req.tenantId);
  }
}

function upsertCompliance(tenantId, childId, category, itemType, label, status, expiryDate, relatedId) {
  const existing = D().prepare('SELECT id FROM compliance_items WHERE child_id=? AND tenant_id=? AND item_type=?').get(childId, tenantId, itemType);
  const daysUntil = expiryDate ? Math.ceil((new Date(expiryDate)-Date.now())/(86400000)) : null;
  if (existing) {
    D().prepare("UPDATE compliance_items SET status=?,expiry_date=?,days_until_expiry=?,related_id=?,last_checked=datetime('now') WHERE id=?")
      .run(status, expiryDate, daysUntil, relatedId, existing.id);
  } else {
    D().prepare('INSERT INTO compliance_items (id,tenant_id,child_id,category,item_type,item_label,status,expiry_date,days_until_expiry,related_id,related_table) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(uuid(), tenantId, childId, category, itemType, label, status, expiryDate, daysUntil, relatedId, category);
  }
}

export { upsertCompliance };

// ═══════════════════════════════════════════════════════════════════════════════
// ██  DOCUMENT MANAGEMENT (v1.8.0)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/documents — list docs by filter (status=pending_review, scope=children|educators)
router.get('/', (req, res) => {
  try {
    const { status, scope } = req.query;
    let docs = [];
    if (status === 'pending_review') {
      // child docs pending review
      const childDocs = D().prepare(`
        SELECT cd.*, c.first_name||' '||c.last_name as child_name, 'child' as doc_scope
        FROM child_documents cd
        LEFT JOIN children c ON cd.child_id = c.id
        WHERE cd.tenant_id = ? AND cd.ai_status = 'review_needed'
        ORDER BY cd.created_at DESC
      `).all(req.tenantId);
      // educator docs pending
      const edDocs = D().prepare(`
        SELECT ed.*, e.first_name||' '||e.last_name as educator_name, 'educator' as doc_scope
        FROM educator_documents ed
        LEFT JOIN educators e ON ed.educator_id = e.id
        WHERE ed.tenant_id = ? AND ed.created_at >= date('now','-7 days')
        ORDER BY ed.created_at DESC
        LIMIT 0
      `).all(req.tenantId);
      docs = [...childDocs, ...edDocs];
    } else if (scope === 'children') {
      docs = D().prepare(`
        SELECT cd.*, c.first_name||' '||c.last_name as child_name, 'child' as doc_scope
        FROM child_documents cd
        LEFT JOIN children c ON cd.child_id = c.id
        WHERE cd.tenant_id = ?
        ORDER BY cd.created_at DESC
      `).all(req.tenantId);
    } else if (scope === 'educators') {
      docs = D().prepare(`
        SELECT ed.*, e.first_name||' '||e.last_name as educator_name, 'educator' as doc_scope
        FROM educator_documents ed
        LEFT JOIN educators e ON ed.educator_id = e.id
        WHERE ed.tenant_id = ?
        ORDER BY ed.created_at DESC
      `).all(req.tenantId);
    } else {
      docs = D().prepare(`
        SELECT cd.*, c.first_name||' '||c.last_name as child_name, 'child' as doc_scope
        FROM child_documents cd
        LEFT JOIN children c ON cd.child_id = c.id
        WHERE cd.tenant_id = ?
        ORDER BY cd.created_at DESC LIMIT 100
      `).all(req.tenantId);
    }
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/:id/download — serve file
router.get('/:id/download', (req, res) => {
  try {
    const doc = D().prepare('SELECT * FROM child_documents WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
              || D().prepare('SELECT * FROM educator_documents WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const fp = doc.storage_path || doc.file_path;
    if (!fp) return res.status(404).json({ error: 'File not found' });
    res.download(fp, doc.file_name || 'document');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/documents/:id/approve
router.put('/:id/approve', (req, res) => {
  try {
    D().prepare("UPDATE child_documents SET ai_status='complete' WHERE id=? AND tenant_id=?").run(req.params.id, req.tenantId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/documents/:id/deny
router.put('/:id/deny', (req, res) => {
  try {
    D().prepare("UPDATE child_documents SET ai_status='denied' WHERE id=? AND tenant_id=?").run(req.params.id, req.tenantId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /expiring — documents expiring within N days
router.get('/expiring', requireAuth, requireTenant, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 60;
    let educatorDocs = [];
    try {
      educatorDocs = D().prepare(`
        SELECT ed.id, ed.document_type, ed.label, ed.expiry_date, ed.educator_id as person_id,
          e.first_name || ' ' || e.last_name as person_name, 'educator' as person_type
        FROM educator_documents ed
        JOIN educators e ON e.id = ed.educator_id
        WHERE ed.tenant_id=? AND ed.expiry_date IS NOT NULL
        AND ed.expiry_date <= date('now', '+' || ? || ' days')
        ORDER BY ed.expiry_date ASC
      `).all(req.tenantId, String(days));
    } catch(e) {}

    // Also include educator cert expiries (WWCC, first aid, etc.)
    let certExpiries = [];
    try {
      certExpiries = D().prepare(`
        SELECT e.id as person_id, e.first_name || ' ' || e.last_name as person_name, 'educator' as person_type,
          'WWCC' as document_type, e.wwcc_number as label, e.wwcc_expiry as expiry_date
        FROM educators e
        WHERE e.tenant_id=? AND e.status='active' AND e.wwcc_expiry IS NOT NULL
        AND e.wwcc_expiry <= date('now', '+' || ? || ' days')
        UNION ALL
        SELECT e.id, e.first_name || ' ' || e.last_name, 'educator',
          'First Aid', 'First Aid Certificate', e.first_aid_expiry
        FROM educators e
        WHERE e.tenant_id=? AND e.status='active' AND e.first_aid_expiry IS NOT NULL
        AND e.first_aid_expiry <= date('now', '+' || ? || ' days')
        UNION ALL
        SELECT e.id, e.first_name || ' ' || e.last_name, 'educator',
          'CPR', 'CPR Certificate', e.cpr_expiry
        FROM educators e
        WHERE e.tenant_id=? AND e.status='active' AND e.cpr_expiry IS NOT NULL
        AND e.cpr_expiry <= date('now', '+' || ? || ' days')
        ORDER BY expiry_date ASC
      `).all(req.tenantId, String(days), req.tenantId, String(days), req.tenantId, String(days));
    } catch(e) {}

    let medicalPlans = [];
    try {
      medicalPlans = D().prepare(`
        SELECT mp.id, mp.plan_type as document_type, mp.condition_name as label, mp.review_date as expiry_date,
          c.first_name || ' ' || c.last_name as person_name, 'child' as person_type, c.id as person_id
        FROM medical_plans mp JOIN children c ON c.id = mp.child_id
        WHERE mp.tenant_id=? AND mp.review_date IS NOT NULL
        AND mp.review_date <= date('now', '+' || ? || ' days')
        ORDER BY mp.review_date ASC
      `).all(req.tenantId, String(days));
    } catch(e) {}

    res.json({ educator_docs: [...educatorDocs, ...certExpiries], medical_plans: medicalPlans });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default router;
