import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const router = Router();

// Public permission response endpoint (no auth)
router.get('/permission/:token', (req, res) => {
  try {
    const exc_child = D().prepare('SELECT ec.*, e.title, e.destination, e.excursion_date, e.departure_time, e.return_time, e.transport_method, e.permission_note_html, c.first_name, c.last_name FROM excursion_children ec JOIN excursions e ON ec.excursion_id = e.id JOIN children c ON ec.child_id = c.id WHERE ec.permission_token = ?').get(req.params.token);
    if (!exc_child) return res.status(404).json({ error: 'Invalid token' });
    res.json(exc_child);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/permission/:token/respond', (req, res) => {
  try {
    const { status, granted_by } = req.body; // status: 'approved' | 'denied'
    const exc_child = D().prepare('SELECT id, excursion_id, child_id, tenant_id FROM excursion_children WHERE permission_token = ?').get(req.params.token);
    if (!exc_child) return res.status(404).json({ error: 'Invalid token' });
    D().prepare('UPDATE excursion_children SET permission_status = ?, permission_granted_by = ?, permission_granted_at = datetime(\'now\') WHERE permission_token = ?')
      .run(status, granted_by||'Parent', req.params.token);
    // Log event
    try {
      D().prepare('INSERT INTO child_event_log (id,tenant_id,child_id,event_type,description) VALUES(?,?,?,?,?)')
        .run(uuid(), exc_child.tenant_id, exc_child.child_id, 'excursion', `Permission ${status} for excursion by ${granted_by || 'parent'}`);
    } catch(e) {}
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All routes below require auth
router.use(requireAuth, requireTenant);

// GET all excursions
router.get('/', (req, res) => {
  try {
    const excursions = D().prepare(`
      SELECT e.*,
        (SELECT COUNT(*) FROM excursion_children ec WHERE ec.excursion_id = e.id) as total_children,
        (SELECT COUNT(*) FROM excursion_children ec WHERE ec.excursion_id = e.id AND ec.permission_status = 'approved') as approved_count,
        (SELECT COUNT(*) FROM excursion_educators ee WHERE ee.excursion_id = e.id) as educator_count
      FROM excursions e
      WHERE e.tenant_id = ?
      ORDER BY e.excursion_date DESC
    `).all(req.tenantId);
    res.json(excursions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single excursion with children + educators
router.get('/:id', (req, res) => {
  try {
    const exc = D().prepare('SELECT * FROM excursions WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
    if (!exc) return res.status(404).json({ error: 'Not found' });
    const children = D().prepare(`SELECT ec.*, c.first_name, c.last_name, c.photo_url, r.name as room_name
      FROM excursion_children ec JOIN children c ON ec.child_id = c.id
      LEFT JOIN rooms r ON c.room_id = r.id
      WHERE ec.excursion_id = ? ORDER BY c.first_name`).all(req.params.id);
    const educators = D().prepare(`SELECT ee.*, e.first_name, e.last_name, e.qualification
      FROM excursion_educators ee JOIN educators e ON ee.educator_id = e.id
      WHERE ee.excursion_id = ?`).all(req.params.id);
    res.json({ ...exc, children, educators });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create excursion
router.post('/', (req, res) => {
  try {
    const { title, description, destination, excursion_date, departure_time, return_time, transport_method, max_children, min_educators, permission_deadline } = req.body;
    const id = uuid();
    D().prepare(`INSERT INTO excursions (id,tenant_id,title,description,destination,excursion_date,departure_time,return_time,transport_method,max_children,min_educators,status,permission_deadline,created_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,'planning',?,?)`)
      .run(id, req.tenantId, title, description||null, destination, excursion_date, departure_time||null, return_time||null, transport_method||'walking', max_children||null, min_educators||2, permission_deadline||null, req.userId);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update excursion
router.put('/:id', (req, res) => {
  try {
    const fields = ['title','description','destination','excursion_date','departure_time','return_time','transport_method','max_children','min_educators','status','permission_note_html','permission_deadline'];
    const updates = {};
    fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const setClause = fields.filter(f => f in updates).map(f => f + ' = ?').join(', ');
    D().prepare((() => 'UPDATE excursions SET ' + setClause + ' WHERE id = ? AND tenant_id = ?')()).run(...fields.filter(f => f in updates).map(f => updates[f]), req.params.id, req.tenantId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET children assigned to excursion
router.get('/:id/children', (req, res) => {
  try {
    const children = D().prepare(`SELECT ec.*, c.first_name, c.last_name, c.photo_url, r.name as room_name
      FROM excursion_children ec JOIN children c ON ec.child_id = c.id
      LEFT JOIN rooms r ON c.room_id = r.id
      WHERE ec.excursion_id = ? AND ec.tenant_id = ? ORDER BY c.first_name`).all(req.params.id, req.tenantId);
    res.json(children);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST assign children (bulk by room or array)
router.post('/:id/children', (req, res) => {
  try {
    // BUG 2 hardening: tolerate body arriving as a JSON string (used to happen
    // when callers double-stringified). express.json normally parses it for us
    // but defending against the same class of regression here is cheap.
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const { child_ids, room_id } = body || {};

    // Verify the parent excursion exists and belongs to this tenant — otherwise
    // we'd silently insert orphan rows.
    const excursion = D().prepare('SELECT id FROM excursions WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
    if (!excursion) return res.status(404).json({ error: 'Excursion not found' });

    let ids = Array.isArray(child_ids) ? [...child_ids] : [];
    if (room_id) {
      const roomKids = D().prepare('SELECT id FROM children WHERE room_id = ? AND tenant_id = ? AND active = 1').all(room_id, req.tenantId);
      ids = [...new Set([...ids, ...roomKids.map(k => k.id)])];
    }

    if (!ids.length) {
      return res.status(400).json({ error: 'No child_ids or room_id provided' });
    }

    const inserted = [];
    const skipped = [];
    ids.forEach(cid => {
      // Tenant-scoped existence check so we don't collide with other tenants
      const existing = D().prepare(
        'SELECT id FROM excursion_children WHERE excursion_id = ? AND child_id = ? AND tenant_id = ?'
      ).get(req.params.id, cid, req.tenantId);
      if (existing) { skipped.push(cid); return; }
      const eid = uuid();
      D().prepare(
        'INSERT INTO excursion_children (id,excursion_id,child_id,tenant_id,permission_status,permission_token) VALUES(?,?,?,?,\'pending\',?)'
      ).run(eid, req.params.id, cid, req.tenantId, uuid());
      inserted.push(eid);
    });
    res.json({ inserted: inserted.length, skipped: skipped.length, requested: ids.length });
  } catch (err) {
    console.error('[excursions:assign-children]', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE child from excursion
router.delete('/:id/children/:childId', (req, res) => {
  try {
    D().prepare('DELETE FROM excursion_children WHERE excursion_id = ? AND child_id = ? AND tenant_id = ?').run(req.params.id, req.params.childId, req.tenantId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST assign educators — accepts either { educator_ids: [...] } (bulk)
// or { educator_id: 'xxx' } (single). The UI sends the singular form when
// toggling individual educators on/off.
router.post('/:id/educators', (req, res) => {
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const ids = Array.isArray(body?.educator_ids)
      ? body.educator_ids
      : (body?.educator_id ? [body.educator_id] : []);

    if (!ids.length) return res.status(400).json({ error: 'No educator_ids provided' });

    const excursion = D().prepare('SELECT id FROM excursions WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
    if (!excursion) return res.status(404).json({ error: 'Excursion not found' });

    const inserted = [];
    ids.forEach(eid => {
      const existing = D().prepare(
        'SELECT id FROM excursion_educators WHERE excursion_id = ? AND educator_id = ? AND tenant_id = ?'
      ).get(req.params.id, eid, req.tenantId);
      if (!existing) {
        const id = uuid();
        D().prepare('INSERT INTO excursion_educators (id,excursion_id,educator_id,tenant_id) VALUES(?,?,?,?)').run(id, req.params.id, eid, req.tenantId);
        inserted.push(id);
      }
    });
    res.json({ success: true, inserted: inserted.length });
  } catch (err) {
    console.error('[excursions:assign-educators]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST send permission notes (mark as sent)
router.post('/:id/send-permission', (req, res) => {
  try {
    D().prepare('UPDATE excursions SET status = \'permission_sent\' WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
    // In production this would send emails; for now just mark sent
    const children = D().prepare('SELECT ec.*, c.first_name, c.last_name FROM excursion_children ec JOIN children c ON ec.child_id = c.id WHERE ec.excursion_id = ? AND ec.tenant_id = ?').all(req.params.id, req.tenantId);
    res.json({ success: true, notified: children.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE excursion
router.delete('/:id', (req, res) => {
  try {
    D().prepare('DELETE FROM excursion_educators WHERE excursion_id = ?').run(req.params.id);
    D().prepare('DELETE FROM excursion_children WHERE excursion_id = ?').run(req.params.id);
    D().prepare('DELETE FROM excursions WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
