/**
 * server/checklists.js — NQF Compliance Checklists
 *   GET  /api/checklists              — list all checklists
 *   POST /api/checklists              — create checklist
 *   PUT  /api/checklists/:id          — update checklist
 *   DELETE /api/checklists/:id        — delete checklist
 *   POST /api/checklists/:id/complete — complete checklist for today
 *   GET  /api/checklists/:id/history  — completion history
 *   GET  /api/checklists/templates    — built-in NQF templates
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const router = Router();
router.use(requireAuth, requireTenant);

// Migration: fix template_id NOT NULL + FK constraint that blocks completions from the checklists table
// Runs on first request since D() may not be ready at import time
let _migrated = false;
function migrateCompletions() {
  if (_migrated) return;
  _migrated = true;
  try {
    const info = D().prepare("SELECT sql FROM sqlite_master WHERE name='checklist_completions'").get();
    if (info?.sql?.includes('REFERENCES checklist_templates')) {
      const hasData = D().prepare('SELECT COUNT(*) as c FROM checklist_completions').get().c;
      if (hasData === 0) {
        D().exec('DROP TABLE checklist_completions');
        D().exec(`CREATE TABLE checklist_completions (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
          template_id TEXT,
          checklist_id TEXT,
          completed_by TEXT NOT NULL, educator_id TEXT,
          date TEXT NOT NULL DEFAULT (date('now','localtime')),
          completed_date TEXT,
          responses TEXT NOT NULL DEFAULT '[]',
          items_data TEXT,
          notes TEXT, completed_at TEXT DEFAULT (datetime('now'))
        )`);
        console.log('  ✓ Migrated checklist_completions: removed FK constraint on template_id');
      }
    }
  } catch(e) { console.error('checklist migration:', e.message); }
}
router.use((req, res, next) => { migrateCompletions(); next(); });

// Built-in NQF checklist templates
const NQF_TEMPLATES = [
  {
    id: 'tpl_opening',
    title: 'Opening Checklist',
    category: 'daily',
    frequency: 'daily',
    icon: '🌅',
    items: [
      { id: '1', text: 'Responsible Person designated and recorded for today', required: true },
      { id: '2', text: 'Staff:child ratios met at opening', required: true },
      { id: '3', text: 'All areas unlocked and accessible', required: false },
      { id: '4', text: 'Playground safety check completed', required: true },
      { id: '5', text: 'All hazards identified and addressed', required: true },
      { id: '6', text: 'First aid kit checked and stocked', required: false },
      { id: '7', text: 'Medication authorisations reviewed for today', required: true },
      { id: '8', text: 'Attendance roll prepared', required: true },
      { id: '9', text: 'UV index checked — sun protection applied if UV 3+', required: true },
      { id: '10', text: 'Emergency evacuation plan visible and current', required: false },
    ]
  },
  {
    id: 'tpl_closing',
    title: 'Closing Checklist',
    category: 'daily',
    frequency: 'daily',
    icon: '🌙',
    items: [
      { id: '1', text: 'All children signed out and accounted for', required: true },
      { id: '2', text: 'Final headcount completed', required: true },
      { id: '3', text: 'All rooms, bathrooms and storage areas checked — no children remain', required: true },
      { id: '4', text: 'Incident reports completed and signed', required: true },
      { id: '5', text: 'Medication records completed', required: true },
      { id: '6', text: 'Daily information records finalised', required: false },
      { id: '7', text: 'All windows and doors locked', required: false },
      { id: '8', text: 'Outdoor equipment stored safely', required: false },
      { id: '9', text: 'Attendance register completed and filed', required: true },
      { id: '10', text: 'Staff sign out completed', required: false },
    ]
  },
  {
    id: 'tpl_playground',
    title: 'Playground Safety Check',
    category: 'safety',
    frequency: 'daily',
    icon: '🛝',
    items: [
      { id: '1', text: 'Fences and gates secure and locked', required: true },
      { id: '2', text: 'Ground surfaces free of hazards (glass, sharp objects, animal droppings)', required: true },
      { id: '3', text: 'Equipment checked for damage, splinters, loose fittings', required: true },
      { id: '4', text: 'Shade structures intact and positioned correctly', required: false },
      { id: '5', text: 'Water features safe and hygienic', required: false },
      { id: '6', text: 'Sandpit covered and free of contaminants', required: false },
      { id: '7', text: 'Plants checked — no toxic plants accessible', required: false },
      { id: '8', text: 'Soft fall surfaces intact under climbing equipment', required: true },
      { id: '9', text: 'No standing water or slip hazards', required: true },
      { id: '10', text: 'Bike/ride-on toys in safe condition', required: false },
    ]
  },
  {
    id: 'tpl_nappy',
    title: 'Nappy Change & Hygiene',
    category: 'health',
    frequency: 'daily',
    icon: '🧴',
    items: [
      { id: '1', text: 'Nappy change area sanitised and restocked', required: true },
      { id: '2', text: 'Adequate gloves, wipes, nappy bags available', required: true },
      { id: '3', text: 'Handwashing facilities stocked (soap, paper towels)', required: true },
      { id: '4', text: 'Nappy change authorisation forms current', required: false },
      { id: '5', text: 'Bins emptied and fresh liners fitted', required: false },
    ]
  },
  {
    id: 'tpl_weekly_health',
    title: 'Weekly Health & Safety Check',
    category: 'safety',
    frequency: 'weekly',
    icon: '🏥',
    items: [
      { id: '1', text: 'First aid kit fully stocked — nothing expired', required: true },
      { id: '2', text: 'Emergency contact lists current and visible', required: true },
      { id: '3', text: 'Evacuation diagrams current and visible in each room', required: true },
      { id: '4', text: 'Fire extinguishers in place and within service date', required: true },
      { id: '5', text: 'Smoke alarms tested', required: false },
      { id: '6', text: 'Emergency lighting tested', required: false },
      { id: '7', text: 'All chemicals stored safely and labelled', required: true },
      { id: '8', text: 'Anaphylaxis action plans current and accessible', required: true },
      { id: '9', text: 'Staff CPR/First Aid certificates current', required: true },
      { id: '10', text: 'Incident register reviewed', required: false },
    ]
  },
  {
    id: 'tpl_vehicle',
    title: 'Vehicle / Excursion Check',
    category: 'excursion',
    frequency: 'as_needed',
    icon: '🚌',
    items: [
      { id: '1', text: 'Vehicle roadworthy and registration current', required: true },
      { id: '2', text: 'Excursion risk assessment completed', required: true },
      { id: '3', text: 'Parent authorisation forms received for all children', required: true },
      { id: '4', text: 'Child:educator ratios confirmed for excursion', required: true },
      { id: '5', text: 'Medical information and EpiPens packed', required: true },
      { id: '6', text: 'First aid kit in vehicle', required: true },
      { id: '7', text: 'Mobile phone charged and working', required: true },
      { id: '8', text: 'Roll taken before departure and on return', required: true },
      { id: '9', text: 'Bus/transport seats and belts checked', required: true },
      { id: '10', text: 'Centre notified of estimated return time', required: false },
    ]
  },
];

// GET /api/checklists/templates
router.get('/templates', (req, res) => {
  res.json({ templates: NQF_TEMPLATES });
});

// GET /api/checklists
router.get('/', (req, res) => {
  try {
    const rows = D().prepare(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM checklist_completions cc WHERE cc.checklist_id=c.id AND cc.completed_date=date('now')) as completed_today
      FROM checklists c
      WHERE c.tenant_id=? AND c.status='active'
      ORDER BY c.category, c.title
    `).all(req.tenantId);
    const result = rows.map(r => ({ ...r, items: JSON.parse(r.items || '[]') }));
    res.json({ checklists: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/checklists
router.post('/', (req, res) => {
  try {
    const { title, category = 'daily', frequency = 'daily', room_id, items = [], template_id } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const id = uuid();
    D().prepare(`
      INSERT INTO checklists (id, tenant_id, title, category, frequency, room_id, items)
      VALUES (?,?,?,?,?,?,?)
    `).run(id, req.tenantId, title, category, frequency, room_id || null, JSON.stringify(items));
    res.json({ id, ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/checklists/:id
router.put('/:id', (req, res) => {
  try {
    const { title, category, frequency, room_id, items, status } = req.body;
    D().prepare(`
      UPDATE checklists SET title=COALESCE(?,title), category=COALESCE(?,category),
        frequency=COALESCE(?,frequency), room_id=COALESCE(?,room_id),
        items=COALESCE(?,items), status=COALESCE(?,status)
      WHERE id=? AND tenant_id=?
    `).run(title, category, frequency, room_id, items ? JSON.stringify(items) : null,
           status, req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/checklists/:id
router.delete('/:id', (req, res) => {
  try {
    D().prepare('UPDATE checklists SET status=? WHERE id=? AND tenant_id=?')
       .run('archived', req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/checklists/:id/complete
router.post('/:id/complete', (req, res) => {
  try {
    const checklist = D().prepare('SELECT * FROM checklists WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId);
    if (!checklist) return res.status(404).json({ error: 'Checklist not found' });
    const { completed_by, notes, items_data } = req.body;
    const id = uuid();
    const today = new Date().toISOString().split('T')[0];
    D().prepare(`
      INSERT INTO checklist_completions (id, checklist_id, template_id, tenant_id, completed_date, date, completed_by, notes, items_data, responses)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(id, req.params.id, checklist.template_id || req.params.id, req.tenantId, today, today,
           completed_by || req.userId || 'Staff', notes || '',
           JSON.stringify(items_data || []), JSON.stringify(items_data || []));
    D().prepare(`UPDATE checklists SET last_completed=?, completed_by=? WHERE id=? AND tenant_id=?`)
       .run(today, completed_by || req.userId || 'Staff', req.params.id, req.tenantId);
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/checklists/:id/history
router.get('/:id/history', (req, res) => {
  try {
    const rows = D().prepare(`
      SELECT * FROM checklist_completions
      WHERE checklist_id=? AND tenant_id=?
      ORDER BY completed_date DESC LIMIT 30
    `).all(req.params.id, req.tenantId);
    const result = rows.map(r => ({ ...r, items_data: JSON.parse(r.items_data || '[]') }));
    res.json({ history: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
