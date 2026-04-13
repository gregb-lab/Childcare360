/**
 * server/ccs-absences.js — CCS Absence Allowance Tracking
 *
 * Australian CCS rule: max 53 absences per child per financial year (1 Jul – 30 Jun).
 * Medical certificate absences are exempt. Limit is stored in DB, not hardcoded.
 *
 *   GET  /api/ccs-absences                     — all children summary
 *   GET  /api/ccs-absences/regulations/current  — current CCS regulations
 *   GET  /api/ccs-absences/:childId             — single child detail
 *   POST /api/ccs-absences/:childId/medical-cert — upload medical cert
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';
import { mkdirSync } from 'fs';
import { extname } from 'path';
import multer from 'multer';

const router = Router();
router.use(requireAuth, requireTenant);

// ── LAZY MIGRATIONS ──────────────────────────────────────────────────────────
let _migrated = false;
function ensureTables() {
  if (_migrated) return;
  try { D().exec(`CREATE TABLE IF NOT EXISTS ccs_regulations (
    id TEXT PRIMARY KEY, tenant_id TEXT, regulation_key TEXT NOT NULL,
    regulation_value TEXT NOT NULL, description TEXT,
    effective_from TEXT DEFAULT '2024-07-01', effective_to TEXT,
    source_url TEXT, last_checked TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(tenant_id, regulation_key, effective_from)
  )`); } catch(e) {}
  try { D().exec(`CREATE TABLE IF NOT EXISTS ccs_absence_summary (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, child_id TEXT NOT NULL,
    financial_year TEXT NOT NULL, total_absences INTEGER DEFAULT 0,
    exempt_absences INTEGER DEFAULT 0, counted_absences INTEGER DEFAULT 0,
    max_allowed INTEGER DEFAULT 53, warning_sent_at TEXT, breach_notified_at TEXT,
    last_calculated TEXT DEFAULT (datetime('now')),
    UNIQUE(tenant_id, child_id, financial_year)
  )`); } catch(e) {}
  // Seed default regulation
  try { D().prepare("INSERT OR IGNORE INTO ccs_regulations (id,tenant_id,regulation_key,regulation_value,description,effective_from,source_url) VALUES(?,NULL,'max_absences_per_year','53','Maximum CCS-approved absences per child per financial year (1 Jul - 30 Jun)','2024-07-01','https://www.servicesaustralia.gov.au/child-care-subsidy-absences')")
    .run(uuid()); } catch(e) {}
  // Add columns to child_leave and attendance_sessions
  ['has_medical_cert INTEGER DEFAULT 0','medical_cert_url TEXT','ccs_exempt INTEGER DEFAULT 0'].forEach(c => {
    try { D().exec('ALTER TABLE child_leave ADD COLUMN ' + c); } catch(e) {}
  });
  ['ccs_exempt INTEGER DEFAULT 0','medical_cert_url TEXT'].forEach(c => {
    try { D().exec('ALTER TABLE attendance_sessions ADD COLUMN ' + c); } catch(e) {}
  });
  _migrated = true;
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function getFinancialYear(date) {
  const d = date ? new Date(date) : new Date();
  const year = d.getFullYear(), month = d.getMonth() + 1;
  return month >= 7 ? year + '-' + String(year + 1).slice(2) : (year - 1) + '-' + String(year).slice(2);
}

function getFYRange(fy) {
  const startYear = parseInt(fy.split('-')[0]);
  return { start: startYear + '-07-01', end: (startYear + 1) + '-06-30' };
}

function getMaxAbsences(tenantId) {
  try {
    const sql = "SELECT regulation_value FROM ccs_regulations WHERE (tenant_id=? OR tenant_id IS NULL) AND regulation_key='max_absences_per_year' AND (effective_to IS NULL OR effective_to>=date('now')) ORDER BY tenant_id DESC, effective_from DESC LIMIT 1";
    return parseInt(D().prepare(sql).get(tenantId)?.regulation_value || '53');
  } catch(e) { return 53; }
}

export function recalcChildAbsences(childId, tenantId, fy) {
  ensureTables();
  const currentFY = fy || getFinancialYear();
  const { start, end } = getFYRange(currentFY);
  const maxAllowed = getMaxAbsences(tenantId);

  const r = D().prepare(
    'SELECT COUNT(*) as total, SUM(CASE WHEN ccs_exempt=1 THEN 1 ELSE 0 END) as exempt FROM attendance_sessions WHERE tenant_id=? AND child_id=? AND absent=1 AND date>=? AND date<=?'
  ).get(tenantId, childId, start, end);

  const total = r?.total || 0, exempt = r?.exempt || 0, counted = total - exempt;

  // Upsert summary
  const sql = "INSERT INTO ccs_absence_summary (id,tenant_id,child_id,financial_year,total_absences,exempt_absences,counted_absences,max_allowed,last_calculated) VALUES(?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(tenant_id,child_id,financial_year) DO UPDATE SET total_absences=excluded.total_absences,exempt_absences=excluded.exempt_absences,counted_absences=excluded.counted_absences,max_allowed=excluded.max_allowed,last_calculated=datetime('now')";
  D().prepare(sql).run(uuid(), tenantId, childId, currentFY, total, exempt, counted, maxAllowed);

  // Get child name
  const child = D().prepare('SELECT first_name, last_name FROM children WHERE id=?').get(childId);

  return {
    child_id: childId,
    child_name: child ? child.first_name + ' ' + child.last_name : '',
    financial_year: currentFY,
    total_absences: total, exempt_absences: exempt, counted_absences: counted,
    max_allowed: maxAllowed, remaining: Math.max(0, maxAllowed - counted),
    pct_used: maxAllowed > 0 ? Math.round(counted / maxAllowed * 100) : 0,
    is_approaching: counted >= Math.floor(maxAllowed * 0.8),
    is_breached: counted >= maxAllowed,
  };
}

export async function runCCSAbsenceCheck(tenantId) {
  ensureTables();
  const currentFY = getFinancialYear();
  const children = D().prepare("SELECT id, first_name, last_name FROM children WHERE tenant_id=? AND active=1").all(tenantId);
  const results = { warnings: 0, breaches: 0 };
  for (const child of children) {
    const s = recalcChildAbsences(child.id, tenantId, currentFY);
    const existing = D().prepare('SELECT warning_sent_at, breach_notified_at FROM ccs_absence_summary WHERE tenant_id=? AND child_id=? AND financial_year=?').get(tenantId, child.id, currentFY);
    if (s.is_approaching && !existing?.warning_sent_at) {
      notifyAbsence(child, s, tenantId, 'warning'); results.warnings++;
      D().prepare('UPDATE ccs_absence_summary SET warning_sent_at=datetime("now") WHERE tenant_id=? AND child_id=? AND financial_year=?').run(tenantId, child.id, currentFY);
    }
    if (s.is_breached && !existing?.breach_notified_at) {
      notifyAbsence(child, s, tenantId, 'breach'); results.breaches++;
      D().prepare('UPDATE ccs_absence_summary SET breach_notified_at=datetime("now") WHERE tenant_id=? AND child_id=? AND financial_year=?').run(tenantId, child.id, currentFY);
    }
  }
  return results;
}

function notifyAbsence(child, summary, tenantId, type) {
  const title = type === 'breach'
    ? 'CCS absence limit reached \u2014 ' + child.first_name + ' ' + child.last_name
    : 'CCS absence warning \u2014 ' + child.first_name + ' ' + child.last_name;
  const body = type === 'breach'
    ? child.first_name + ' has used all ' + summary.max_allowed + ' CCS-approved absences for ' + summary.financial_year + '. Further absences may not attract CCS.'
    : child.first_name + ' has used ' + summary.counted_absences + ' of ' + summary.max_allowed + ' CCS absences (' + summary.pct_used + '%) for ' + summary.financial_year + '.';
  try {
    const admins = D().prepare("SELECT user_id FROM tenant_members WHERE tenant_id=? AND role IN ('admin','director','manager','owner')").all(tenantId);
    const nq = 'INSERT INTO notifications (id,tenant_id,user_id,type,title,body,created_at) VALUES(?,?,?,?,?,?,datetime(\'now\'))';
    admins.forEach(a => { try { D().prepare(nq).run(uuid(), tenantId, a.user_id, 'ccs_absence', title, body); } catch(e) {} });
  } catch(e) {}
}

// ── ROUTES ───────────────────────────────────────────────────────────────────

// GET all children summary
router.get('/', (req, res) => {
  try {
    ensureTables();
    const currentFY = getFinancialYear();
    const maxAllowed = getMaxAbsences(req.tenantId);
    const children = D().prepare("SELECT id FROM children WHERE tenant_id=? AND active=1").all(req.tenantId);
    const summaries = children.map(c => recalcChildAbsences(c.id, req.tenantId, currentFY)).filter(s => s.total_absences > 0);
    summaries.sort((a, b) => b.counted_absences - a.counted_absences);
    res.json({
      financial_year: currentFY, max_allowed: maxAllowed, summaries,
      total_approaching: summaries.filter(s => s.is_approaching && !s.is_breached).length,
      total_breached: summaries.filter(s => s.is_breached).length,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET regulations
router.get('/regulations/current', (req, res) => {
  try {
    ensureTables();
    const regs = D().prepare("SELECT * FROM ccs_regulations WHERE (tenant_id=? OR tenant_id IS NULL) AND (effective_to IS NULL OR effective_to>=date('now')) ORDER BY tenant_id DESC, effective_from DESC").all(req.tenantId);
    res.json({ regulations: regs });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET single child detail
router.get('/:childId', (req, res) => {
  try {
    ensureTables();
    const currentFY = getFinancialYear();
    const summary = recalcChildAbsences(req.params.childId, req.tenantId);
    const { start, end } = getFYRange(currentFY);
    const absences = D().prepare(
      "SELECT a.date, a.absent_reason, a.ccs_exempt, a.medical_cert_url FROM attendance_sessions a WHERE a.tenant_id=? AND a.child_id=? AND a.absent=1 AND a.date>=? AND a.date<=? ORDER BY a.date DESC"
    ).all(req.tenantId, req.params.childId, start, end);
    res.json({ summary, absences, financial_year: currentFY });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST medical certificate
const certDir = './uploads/medical-certs';
try { mkdirSync(certDir, { recursive: true }); } catch(e) {}
const certUpload = multer({
  storage: multer.diskStorage({
    destination: (_r, _f, cb) => cb(null, certDir),
    filename: (_r, f, cb) => cb(null, uuid() + extname(f.originalname).toLowerCase()),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_r, f, cb) => cb(null, ['image/jpeg','image/png','application/pdf'].includes(f.mimetype)),
});

router.post('/:childId/medical-cert', certUpload.single('certificate'), (req, res) => {
  try {
    ensureTables();
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const certUrl = '/uploads/medical-certs/' + req.file.filename;
    const { leave_id, absence_date } = req.body;

    if (leave_id) {
      D().prepare("UPDATE child_leave SET has_medical_cert=1, medical_cert_url=?, ccs_exempt=1, updated_at=datetime('now') WHERE id=? AND tenant_id=?")
        .run(certUrl, leave_id, req.tenantId);
      const leave = D().prepare('SELECT start_date, end_date, child_id FROM child_leave WHERE id=? AND tenant_id=?').get(leave_id, req.tenantId);
      if (leave) {
        D().prepare("UPDATE attendance_sessions SET ccs_exempt=1, medical_cert_url=? WHERE child_id=? AND tenant_id=? AND date>=? AND date<=? AND absent=1")
          .run(certUrl, leave.child_id, req.tenantId, leave.start_date, leave.end_date);
      }
    }
    if (absence_date) {
      D().prepare("UPDATE attendance_sessions SET ccs_exempt=1, medical_cert_url=? WHERE child_id=? AND tenant_id=? AND date=? AND absent=1")
        .run(certUrl, req.params.childId, req.tenantId, absence_date);
    }

    const summary = recalcChildAbsences(req.params.childId, req.tenantId);
    res.json({ ok: true, cert_url: certUrl, summary });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default router;
