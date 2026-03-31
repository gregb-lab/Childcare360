import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant, requireRole } from './middleware.js';
import { NIP_SCHEDULE, upsertCompliance } from './documents.js';

const router = Router();
router.use(requireAuth);
router.use(requireTenant);

// ═══════════════════════════════════════════════════════════════════════════════
// ██  COMPLIANCE DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

// ── Get all compliance items for the centre ─────────────────────────────────
router.get('/overview', (req, res) => {
  const items = D().prepare(`
    SELECT ci.*, c.first_name, c.last_name, c.room_id, r.name as room_name
    FROM compliance_items ci
    JOIN children c ON c.id = ci.child_id
    LEFT JOIN rooms r ON r.id = c.room_id
    WHERE ci.tenant_id = ? AND c.active = 1
    ORDER BY
      CASE ci.status WHEN 'non_compliant' THEN 0 WHEN 'expiring_soon' THEN 1 WHEN 'review_needed' THEN 2 ELSE 3 END,
      ci.days_until_expiry ASC
  `).all(req.tenantId);
  const summary = {
    total: items.length,
    nonCompliant: items.filter(i => i.status === 'non_compliant').length,
    expiringSoon: items.filter(i => i.status === 'expiring_soon').length,
    reviewNeeded: items.filter(i => i.status === 'review_needed').length,
    current: items.filter(i => i.status === 'current').length,
  };
  res.json({ items, summary });
});

// ── Get compliance for a specific child ─────────────────────────────────────
router.get('/child/:childId', (req, res) => {
  const items = D().prepare('SELECT * FROM compliance_items WHERE child_id=? AND tenant_id=? ORDER BY status,category')
    .all(req.params.childId, req.tenantId);
  const canAttend = checkAttendanceEligibility(req.params.childId, req.tenantId);
  res.json({ items, canAttend });
});

// ── Check if child can attend today (gating) ────────────────────────────────
router.get('/can-attend/:childId', (req, res) => {
  res.json(checkAttendanceEligibility(req.params.childId, req.tenantId));
});

// ── Manually resolve/update a compliance item ───────────────────────────────
router.put('/item/:itemId', requireAuth, requireTenant, requireRole('owner','admin','director'), (req, res) => {
  const { status, notes, expiryDate } = req.body;
  const daysUntil = expiryDate ? Math.ceil((new Date(expiryDate)-Date.now())/86400000) : null;
  D().prepare("UPDATE compliance_items SET status=COALESCE(?,status),notes=COALESCE(?,notes),expiry_date=COALESCE(?,expiry_date),days_until_expiry=?,last_checked=datetime('now') WHERE id=? AND tenant_id=?")
    .run(status, notes, expiryDate, daysUntil, req.params.itemId, req.tenantId);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██  ATTENDANCE ELIGIBILITY — Children can't attend unless compliant
// ═══════════════════════════════════════════════════════════════════════════════
function checkAttendanceEligibility(childId, tenantId) {
  const child = D().prepare('SELECT * FROM children WHERE id=? AND tenant_id=?').get(childId, tenantId);
  if (!child) return { eligible: false, reason: 'Child not found' };

  const blocks = [];
  const warnings = [];

  // 1. Immunisation check
  const immDocs = D().prepare("SELECT COUNT(*) as c FROM child_documents WHERE child_id=? AND tenant_id=? AND category='immunisation'").get(childId, tenantId)?.c || 0;
  if (immDocs === 0) blocks.push({ category: 'immunisation', reason: 'No immunisation records on file' });

  const overdueImm = D().prepare("SELECT * FROM compliance_items WHERE child_id=? AND tenant_id=? AND category='immunisation' AND status='non_compliant'").all(childId, tenantId);
  if (overdueImm.length > 0) blocks.push({ category: 'immunisation', reason: `${overdueImm.length} overdue immunisation(s)` });

  // 2. Medical plan check — anaphylaxis/asthma plans must be current
  const allergies = (child.allergies || '').toLowerCase();
  if (allergies.includes('anaphylaxis') || allergies.includes('ana')) {
    const anaPlan = D().prepare("SELECT * FROM medical_plans WHERE child_id=? AND tenant_id=? AND plan_type='anaphylaxis' AND status='current'").get(childId, tenantId);
    if (!anaPlan) blocks.push({ category: 'medical_plan', reason: 'Anaphylaxis plan required but not on file' });
    else if (anaPlan.review_date && anaPlan.review_date < new Date().toISOString().split('T')[0]) {
      blocks.push({ category: 'medical_plan', reason: 'Anaphylaxis plan expired — review overdue' });
    }
    // Check EpiPen on site
    const epipen = D().prepare("SELECT * FROM medications WHERE child_id=? AND tenant_id=? AND (name LIKE '%epipen%' OR name LIKE '%adrenaline%') AND status='active'").get(childId, tenantId);
    if (!epipen) blocks.push({ category: 'medication', reason: 'EpiPen/adrenaline autoinjector not registered on site' });
    else if (epipen.expiry_date && epipen.expiry_date < new Date().toISOString().split('T')[0]) {
      blocks.push({ category: 'medication', reason: 'EpiPen expired — replace immediately' });
    }
  }

  if (allergies.includes('asthma')) {
    const asthmaPlan = D().prepare("SELECT * FROM medical_plans WHERE child_id=? AND tenant_id=? AND plan_type='asthma' AND status='current'").get(childId, tenantId);
    if (!asthmaPlan) blocks.push({ category: 'medical_plan', reason: 'Asthma action plan required but not on file' });
    else if (asthmaPlan.review_date && asthmaPlan.review_date < new Date().toISOString().split('T')[0]) {
      warnings.push({ category: 'medical_plan', reason: 'Asthma plan review overdue' });
    }
  }

  // 3. Medication expiry check
  const expiredMeds = D().prepare("SELECT * FROM medications WHERE child_id=? AND tenant_id=? AND status='active' AND expiry_date < ?")
    .all(childId, tenantId, new Date().toISOString().split('T')[0]);
  expiredMeds.forEach(m => blocks.push({ category: 'medication', reason: `Medication expired: ${m.name}` }));

  // 4. Medication consent check
  const noConsent = D().prepare("SELECT * FROM medications WHERE child_id=? AND tenant_id=? AND status='active' AND parent_consent=0")
    .all(childId, tenantId);
  noConsent.forEach(m => warnings.push({ category: 'medication', reason: `No parent consent for: ${m.name}` }));

  // 5. Pending review items
  const pending = D().prepare("SELECT * FROM compliance_items WHERE child_id=? AND tenant_id=? AND status='review_needed'").all(childId, tenantId);
  pending.forEach(p => warnings.push({ category: p.category, reason: p.item_label }));

  return {
    eligible: blocks.length === 0,
    childName: `${child.first_name} ${child.last_name}`,
    blocks,
    warnings,
    summary: blocks.length === 0
      ? (warnings.length > 0 ? `May attend — ${warnings.length} warning(s)` : 'All clear ✓')
      : `CANNOT ATTEND — ${blocks.length} blocking issue(s)`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ██  AUTOMATED COMPLIANCE SCAN — Replaces daily manual check
// ═══════════════════════════════════════════════════════════════════════════════
export function runDailyComplianceScan(tenantId) {
  console.log(`\n  🔍 Running daily compliance scan for tenant: ${tenantId}`);
  const today = new Date().toISOString().split('T')[0];
  const children = D().prepare("SELECT * FROM children WHERE tenant_id=? AND active=1").all(tenantId);
  let alerts = 0;

  children.forEach(child => {
    const ageMonths = Math.floor((Date.now()-new Date(child.dob).getTime())/(30.44*86400000));

    // ── Immunisation ──
    const immDocs = D().prepare("SELECT COUNT(*) as c FROM child_documents WHERE child_id=? AND tenant_id=? AND category='immunisation'").get(child.id, tenantId)?.c || 0;
    if (immDocs === 0) {
      upsertCompliance(tenantId, child.id, 'immunisation', 'no_imm_records', 'No immunisation records on file', 'non_compliant', null, null);
      alerts++;
    }

    // Check next-due immunisations
    const immRecords = D().prepare('SELECT * FROM immunisation_records WHERE child_id=? AND tenant_id=?').all(child.id, tenantId);
    immRecords.forEach(r => {
      if (r.next_due_date) {
        const daysUntil = Math.ceil((new Date(r.next_due_date)-Date.now())/86400000);
        if (daysUntil < 0) {
          upsertCompliance(tenantId, child.id, 'immunisation', 'overdue_'+r.vaccine_name, `${r.vaccine_name} — OVERDUE`, 'non_compliant', r.next_due_date, r.id);
          queueNotification(tenantId, child.id, 'immunisation_overdue', 'urgent',
            `Immunisation Overdue: ${child.first_name} ${child.last_name}`,
            `${r.vaccine_name} was due on ${r.next_due_date}. Please arrange this immunisation as soon as possible. Your child cannot attend until immunisation records are current.`);
          alerts++;
        } else if (daysUntil <= 30) {
          upsertCompliance(tenantId, child.id, 'immunisation', 'expiring_'+r.vaccine_name, `${r.vaccine_name} — Due in ${daysUntil} days`, 'expiring_soon', r.next_due_date, r.id);
          if (daysUntil <= 14) {
            queueNotification(tenantId, child.id, 'immunisation_reminder', 'normal',
              `Immunisation Reminder: ${child.first_name} ${child.last_name}`,
              `${r.vaccine_name} is due on ${r.next_due_date} (${daysUntil} days). Please schedule this vaccination and provide updated records to the centre.`);
          }
          alerts++;
        }
      }
    });

    // ── Medical plan reviews ──
    const plans = D().prepare("SELECT * FROM medical_plans WHERE child_id=? AND tenant_id=? AND status='current'").all(child.id, tenantId);
    plans.forEach(p => {
      if (p.review_date) {
        const daysUntil = Math.ceil((new Date(p.review_date)-Date.now())/86400000);
        if (daysUntil < 0) {
          upsertCompliance(tenantId, child.id, 'medical_plan', p.plan_type+'_expired', `${p.condition_name} plan — REVIEW OVERDUE`, 'non_compliant', p.review_date, p.id);
          queueNotification(tenantId, child.id, 'medical_plan_expired', 'urgent',
            `Medical Plan Review Overdue: ${child.first_name} ${child.last_name}`,
            `The ${p.condition_name} management plan was due for review on ${p.review_date}. Please provide an updated plan from your child's doctor. Your child may not be able to attend until this is resolved.`);
          alerts++;
        } else if (daysUntil <= 30) {
          upsertCompliance(tenantId, child.id, 'medical_plan', p.plan_type+'_expiring', `${p.condition_name} plan — Review in ${daysUntil} days`, 'expiring_soon', p.review_date, p.id);
          if (daysUntil <= 14) {
            queueNotification(tenantId, child.id, 'medical_plan_reminder', 'normal',
              `Medical Plan Review Due: ${child.first_name} ${child.last_name}`,
              `The ${p.condition_name} management plan for ${child.first_name} is due for review on ${p.review_date}. Please schedule a review with your child's doctor and provide the updated plan.`);
          }
          alerts++;
        }
      }
    });

    // ── Medication expiry ──
    const meds = D().prepare("SELECT * FROM medications WHERE child_id=? AND tenant_id=? AND status='active'").all(child.id, tenantId);
    meds.forEach(m => {
      if (m.expiry_date) {
        const daysUntil = Math.ceil((new Date(m.expiry_date)-Date.now())/86400000);
        if (daysUntil < 0) {
          upsertCompliance(tenantId, child.id, 'medication', 'med_expired_'+m.id.slice(0,8), `${m.name} — EXPIRED`, 'non_compliant', m.expiry_date, m.id);
          queueNotification(tenantId, child.id, 'medication_expired', 'urgent',
            `Medication Expired: ${child.first_name} ${child.last_name}`,
            `${m.name} (held at the centre) expired on ${m.expiry_date}. Please provide a replacement with a current expiry date as soon as possible.`);
          alerts++;
        } else if (daysUntil <= 30) {
          upsertCompliance(tenantId, child.id, 'medication', 'med_expiring_'+m.id.slice(0,8), `${m.name} — Expires in ${daysUntil} days`, 'expiring_soon', m.expiry_date, m.id);
          if (daysUntil <= 14) {
            queueNotification(tenantId, child.id, 'medication_expiring', 'normal',
              `Medication Expiring Soon: ${child.first_name} ${child.last_name}`,
              `${m.name} held at the centre will expire on ${m.expiry_date} (${daysUntil} days). Please provide a replacement.`);
          }
          alerts++;
        }
      }
    });
  });

  console.log(`  ✓ Compliance scan complete: ${children.length} children checked, ${alerts} alerts generated`);
  return { childrenChecked: children.length, alerts };
}

// ── Queue notification (to parents, CC centre manager) ──────────────────────
function queueNotification(tenantId, childId, type, priority, subject, body) {
  // Check if similar notification was already sent recently (within 3 days)
  const recent = D().prepare(
    "SELECT id FROM notifications WHERE tenant_id=? AND child_id=? AND type=? AND created_at > datetime('now','-3 days')"
  ).get(tenantId, childId, type);
  if (recent) return; // Don't spam

  const parents = D().prepare(
    'SELECT email,name FROM parent_contacts WHERE child_id=? AND tenant_id=? AND receives_notifications=1 AND email IS NOT NULL'
  ).all(childId, tenantId);

  // CC the centre admin/director
  const admins = D().prepare(`
    SELECT u.email, u.name FROM tenant_members tm JOIN users u ON u.id=tm.user_id
    WHERE tm.tenant_id=? AND tm.role IN ('admin','director') AND tm.active=1
  `).all(tenantId);

  const recipients = parents.map(p => ({ email: p.email, name: p.name }));
  const cc = admins.map(a => ({ email: a.email, name: a.name }));

  D().prepare(
    'INSERT INTO notifications (id,tenant_id,child_id,type,priority,subject,body,recipients,cc,status) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(uuid(), tenantId, childId, type, priority, subject, body, JSON.stringify(recipients), JSON.stringify(cc), 'pending');

  console.log(`  📧 Notification queued: [${priority}] ${subject}`);
  recipients.forEach(r => console.log(`     → ${r.name} <${r.email}>`));
  cc.forEach(c => console.log(`     CC: ${c.name} <${c.email}>`));
}

// ── Get notifications ───────────────────────────────────────────────────────
router.get('/notifications', (req, res) => {
  const { status, childId, limit } = req.query;
  let sql = 'SELECT n.*, c.first_name, c.last_name FROM notifications n LEFT JOIN children c ON c.id=n.child_id WHERE n.tenant_id=?';
  const params = [req.tenantId];
  if (status) { sql += ' AND n.status=?'; params.push(status); }
  if (childId) { sql += ' AND n.child_id=?'; params.push(childId); }
  sql += ' ORDER BY n.created_at DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }
  const rows = D().prepare(sql).all(...params);
  res.json(rows.map(r => ({ ...r, recipients: JSON.parse(r.recipients||'[]'), cc: JSON.parse(r.cc||'[]') })));
});

// ── Mark notification as sent ───────────────────────────────────────────────
router.put('/notifications/:id/send', requireAuth, requireTenant, requireRole('owner','admin','director'), (req, res) => {
  D().prepare("UPDATE notifications SET status='sent',sent_at=datetime('now') WHERE id=? AND tenant_id=?")
    .run(req.params.id, req.tenantId);
  res.json({ success: true });
});

// ── Trigger manual compliance scan ──────────────────────────────────────────
router.post('/scan', requireAuth, requireTenant, requireRole('owner','admin','director'), (req, res) => {
  const result = runDailyComplianceScan(req.tenantId);
  res.json(result);
});

// ── Centre-wide attendance report ───────────────────────────────────────────
router.get('/attendance-report', (req, res) => {
  const children = D().prepare("SELECT * FROM children WHERE tenant_id=? AND active=1 ORDER BY first_name").all(req.tenantId);
  const report = children.map(c => ({
    childId: c.id, name: `${c.first_name} ${c.last_name}`, room_id: c.room_id,
    ...checkAttendanceEligibility(c.id, req.tenantId),
  }));
  const summary = {
    total: report.length,
    canAttend: report.filter(r => r.eligible).length,
    blocked: report.filter(r => !r.eligible).length,
    withWarnings: report.filter(r => r.eligible && r.warnings.length > 0).length,
  };
  res.json({ report, summary });
});

export default router;
