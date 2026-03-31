// ═══════════════════════════════════════════════════════════════════════════
//  Childcare360 — Parent Portal API  (v2.8.2)
//  FIXES: sql-injection-risk (sinceDate interpolation) + sql-missing-tenant-id
//         on child_documents, daily_updates, learning_stories (×2),
//         weekly_reports, child_eylf_progress, child_absences
// ═══════════════════════════════════════════════════════════════════════════
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth } from './middleware.js';

const r = Router();
r.use(requireAuth);

// ── Helper: get email of logged-in user ──────────────────────────────────────
function userEmail(userId) {
  return D().prepare('SELECT email FROM users WHERE id=?').get(userId)?.email || null;
}

// ── Helper: get child IDs belonging to this parent ───────────────────────────
function parentChildIds(userId) {
  const email = userEmail(userId);
  if (!email) return [];
  const membership = D().prepare(
    "SELECT role FROM tenant_members WHERE user_id=? AND role IN ('owner','admin','director','educator','manager') LIMIT 1"
  ).get(userId);
  if (membership) {
    const tenantIds = D().prepare(
      "SELECT DISTINCT tenant_id FROM tenant_members WHERE user_id=? AND role IN ('owner','admin','director','educator','manager')"
    ).all(userId).map(row => row.tenant_id);
    if (tenantIds.length) {
      const ph = tenantIds.map(() => '?').join(',');
      return D().prepare(
        `SELECT id as child_id FROM children WHERE tenant_id IN (${ph}) AND active=1`
      ).all(...tenantIds).map(row => row.child_id);
    }
  }
  return D().prepare('SELECT DISTINCT child_id FROM parent_contacts WHERE email=?')
    .all(email).map(row => row.child_id);
}

// ── Helper: look up tenant_id for a child ────────────────────────────────────
// The parent portal does not use requireTenant middleware, so tenant_id must
// be derived from the child row itself for every tenant-scoped query.
function childTenantId(childId) {
  return D().prepare('SELECT tenant_id FROM children WHERE id=?').get(childId)?.tenant_id || null;
}

// ── Helper: compute ISO date string for a named period ───────────────────────
// FIX (sql-injection-risk): the previous implementation stored SQLite date()
// expressions in a map and interpolated them directly into prepared statement
// strings via template literals — a textbook SQL injection vector.
// Date arithmetic is now done in JavaScript; the resulting ISO string is
// passed as a bound ? parameter.
function sinceDate(period) {
  if (period === 'all') return '1970-01-01';
  const days = { today: 0, week: 7, month: 30, year: 365 }[period] ?? 30;
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

// ── GET /api/parent/children ─────────────────────────────────────────────────
r.get('/children', (req, res) => {
  try {
    const childIds = parentChildIds(req.userId);
    if (!childIds.length) return res.json([]);
    const ph = childIds.map(() => '?').join(',');
    const children = D().prepare(`
      SELECT c.*, r.name as room_name,
        (SELECT COUNT(*) FROM learning_stories ls
          WHERE ls.tenant_id=c.tenant_id AND ls.published=1
            AND ls.child_ids LIKE '%'||c.id||'%') as story_count,
        (SELECT COUNT(*) FROM daily_updates du
          WHERE du.child_id=c.id AND du.tenant_id=c.tenant_id
            AND du.update_date=date('now','localtime')) as today_update_count
      FROM children c LEFT JOIN rooms r ON r.id=c.room_id
      WHERE c.id IN (${ph}) AND c.active=1
    `).all(...childIds);
    res.json(children);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /api/parent/children/:id — parent updates their child's contact info ──
r.put('/children/:id', (req, res) => {
  try {
    const childIds = parentChildIds(req.userId);
    if (!childIds.includes(req.params.id)) return res.status(403).json({ error: 'Access denied' });
    const { parent1_phone, parent2_phone, parent2_email } = req.body;
    D().prepare(`
      UPDATE children SET
        parent1_phone = COALESCE(?, parent1_phone),
        parent2_phone = COALESCE(?, parent2_phone),
        parent2_email = COALESCE(?, parent2_email),
        updated_at    = datetime('now')
      WHERE id = ?
    `).run(parent1_phone || null, parent2_phone || null, parent2_email || null, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/parent/alerts ───────────────────────────────────────────────────
r.get('/alerts', (req, res) => {
  try {
    const childIds = parentChildIds(req.userId);
    const alerts = [];
    if (childIds.length) {
      const ph = childIds.map(() => '?').join(',');
      const incidents = D().prepare(`
        SELECT du.*, c.first_name FROM daily_updates du
        JOIN children c ON c.id=du.child_id
        WHERE du.child_id IN (${ph})
          AND du.category='incident'
          AND du.update_date >= date('now','-7 days','localtime')
        ORDER BY du.created_at DESC LIMIT 5
      `).all(...childIds);
      incidents.forEach(i => alerts.push({
        severity: 'urgent',
        title:    `Incident — ${i.first_name}`,
        message:  i.summary || i.notes || 'An incident was recorded. Please contact the centre.',
      }));
    }
    res.json(alerts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/parent/documents/:childId ───────────────────────────────────────
r.get('/documents/:childId', (req, res) => {
  try {
    const childIds = parentChildIds(req.userId);
    if (!childIds.includes(req.params.childId)) return res.status(403).json({ error: 'Not authorised' });
    // FIX (sql-missing-tenant-id): child_documents is tenant-scoped
    const tenantId = childTenantId(req.params.childId);
    const docs = D().prepare(`
      SELECT * FROM child_documents
      WHERE child_id=? AND tenant_id=?
        AND (pending_review=0 OR pending_review IS NULL)
      ORDER BY created_at DESC
    `).all(req.params.childId, tenantId);
    res.json(docs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/parent/invoices ─────────────────────────────────────────────────
r.get('/invoices', (req, res) => {
  try {
    const childIds = parentChildIds(req.userId);
    if (!childIds.length) return res.json([]);
    const ph = childIds.map(() => '?').join(',');
    const invoices = D().prepare(`
      SELECT i.*, c.first_name, c.last_name
      FROM invoices i JOIN children c ON c.id=i.child_id
      WHERE i.child_id IN (${ph}) AND i.status != 'draft'
      ORDER BY i.created_at DESC LIMIT 30
    `).all(...childIds);
    res.json(invoices.map(inv => ({ ...inv, sessions: JSON.parse(inv.sessions || '[]') })));
  } catch { res.json([]); }
});

// ── GET /api/parent/daily-updates/:childId ───────────────────────────────────
r.get('/daily-updates/:childId', (req, res) => {
  try {
    const childIds = parentChildIds(req.userId);
    if (!childIds.includes(req.params.childId)) return res.status(403).json({ error: 'Not authorised' });
    const { date = new Date().toISOString().slice(0, 10) } = req.query;
    // FIX (sql-missing-tenant-id): daily_updates is tenant-scoped
    const tenantId = childTenantId(req.params.childId);
    const updates = D().prepare(`
      SELECT * FROM daily_updates
      WHERE child_id=? AND tenant_id=? AND update_date=?
      ORDER BY created_at DESC
    `).all(req.params.childId, tenantId, date);
    res.json(updates);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/parent/siblings ─────────────────────────────────────────────────
r.get('/siblings', (req, res) => {
  try {
    const childIds = parentChildIds(req.userId);
    if (!childIds.length) return res.json([]);
    const ph = childIds.map(() => '?').join(',');
    const children = D().prepare(`
      SELECT c.*, r.name as room_name
      FROM children c LEFT JOIN rooms r ON r.id=c.room_id
      WHERE c.id IN (${ph}) AND c.active=1
    `).all(...childIds);
    res.json(children);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/parent/messages ────────────────────────────────────────────────
r.post('/messages', (req, res) => {
  try {
    const { child_id, subject, body } = req.body;
    const user     = D().prepare('SELECT email, name FROM users WHERE id=?').get(req.userId);
    const email    = user?.email;
    if (!email || !body) return res.status(400).json({ error: 'body required' });
    const childIds      = parentChildIds(req.userId);
    const targetChildId = child_id || childIds[0];
    if (!targetChildId || !childIds.includes(targetChildId)) {
      return res.status(400).json({ error: 'No child found' });
    }
    const tenantId = childTenantId(targetChildId);
    if (!tenantId) return res.status(400).json({ error: 'No child found' });
    const id = uuid();
    try {
      D().prepare(`
        INSERT INTO parent_messages
          (id,tenant_id,child_id,parent_email,parent_name,subject,body,direction,created_at)
        VALUES(?,?,?,?,?,?,?,?,datetime('now'))
      `).run(id, tenantId, targetChildId, email, user?.name || email,
             subject || 'Message from Parent', body, 'inbound');
    } catch {
      // Older schema without direction column — fallback insert
      D().prepare(`
        INSERT INTO parent_messages
          (id,tenant_id,child_id,parent_email,parent_name,subject,body,created_at)
        VALUES(?,?,?,?,?,?,?,datetime('now'))
      `).run(id, tenantId, targetChildId, email, user?.name || email,
             subject || 'Message from Parent', body);
    }
    res.json({ id, ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/parent/learning/:childId ────────────────────────────────────────
r.get('/learning/:childId', (req, res) => {
  try {
    const childIds = parentChildIds(req.userId);
    if (!childIds.includes(req.params.childId)) return res.status(403).json({ error: 'Not authorised' });
    const { period = 'month' } = req.query;

    // FIX (sql-injection-risk): req.query.period was used to select a SQL
    //   date() expression string that was then interpolated directly into the
    //   prepared statement via a template literal — a textbook SQL injection
    //   vector.  sinceDate() computes the cutoff in JS and binds it via ?.
    // FIX (sql-missing-tenant-id): WHERE now includes tenant_id=?
    const since    = sinceDate(period);
    const tenantId = childTenantId(req.params.childId);

    const rows = D().prepare(`
      SELECT ls.*, u.name as educator_name
      FROM learning_stories ls
      LEFT JOIN users u ON u.id=ls.educator_id
      WHERE ls.tenant_id=? AND ls.published=1 AND ls.date >= ?
      ORDER BY ls.date DESC LIMIT 50
    `).all(tenantId, since);

    const stories = rows
      .filter(s => {
        try { return JSON.parse(s.child_ids || '[]').includes(req.params.childId); }
        catch { return false; }
      })
      .map(s => ({
        ...s,
        child_ids:     JSON.parse(s.child_ids     || '[]'),
        eylf_outcomes: JSON.parse(s.eylf_outcomes || '[]'),
        tags:          JSON.parse(s.tags          || '[]'),
        photo_rows:    [],
      }));
    res.json(stories);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/parent/learning/:childId/weekly-report ──────────────────────────
r.get('/learning/:childId/weekly-report', (req, res) => {
  try {
    const childIds = parentChildIds(req.userId);
    if (!childIds.includes(req.params.childId)) return res.status(403).json({ error: 'Not authorised' });

    // FIX (sql-missing-tenant-id): both weekly_reports and learning_stories
    //   queries now include tenant_id=? to prevent cross-tenant data leaks.
    const tenantId = childTenantId(req.params.childId);

    const rep = D().prepare(`
      SELECT * FROM weekly_reports
      WHERE child_id=? AND tenant_id=?
      ORDER BY week_start DESC LIMIT 1
    `).get(req.params.childId, tenantId);
    if (!rep) return res.json(null);

    const thirtyDaysAgo = sinceDate('month');
    const stories = D().prepare(`
      SELECT eylf_outcomes, child_ids FROM learning_stories
      WHERE tenant_id=? AND published=1 AND date >= ?
    `).all(tenantId, thirtyDaysAgo)
      .filter(s => {
        try { return JSON.parse(s.child_ids || '[]').includes(req.params.childId); }
        catch { return false; }
      });

    const counts = {};
    stories.forEach(s => {
      try {
        JSON.parse(s.eylf_outcomes || '[]').forEach(o => {
          counts[o] = (counts[o] || 0) + 1;
        });
      } catch {}
    });
    const maxCount = Math.max(1, ...Object.values(counts));
    const outcomes = {};
    Object.entries(counts).forEach(([k, v]) => {
      outcomes[k] = Math.round((v / maxCount) * 100);
    });

    res.json({
      ...rep,
      outcomes,
      eylf_summary: JSON.parse(rep.eylf_summary || '{}'),
      progressions: JSON.parse(rep.progressions  || '[]'),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/parent/eylf/:childId ────────────────────────────────────────────
r.get('/eylf/:childId', (req, res) => {
  try {
    const childIds = parentChildIds(req.userId);
    if (!childIds.includes(req.params.childId)) return res.status(403).json({ error: 'Not authorised' });
    // FIX (sql-missing-tenant-id): child_eylf_progress is tenant-scoped
    const tenantId = childTenantId(req.params.childId);
    const progress = D().prepare(`
      SELECT * FROM child_eylf_progress
      WHERE child_id=? AND tenant_id=?
      ORDER BY eylf_outcome, sub_outcome
    `).all(req.params.childId, tenantId);
    res.json(progress);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/parent/absences/:childId ────────────────────────────────────────
r.get('/absences/:childId', (req, res) => {
  try {
    const childIds = parentChildIds(req.userId);
    if (!childIds.includes(req.params.childId)) return res.status(403).json({ error: 'Not authorised' });
    // FIX (sql-missing-tenant-id): child_absences is tenant-scoped
    const tenantId = childTenantId(req.params.childId);
    const rows = D().prepare(`
      SELECT * FROM child_absences
      WHERE child_id=? AND tenant_id=?
      ORDER BY start_date DESC LIMIT 30
    `).all(req.params.childId, tenantId);
    res.json(rows);
  } catch { res.json([]); }
});

// ── POST /api/parent/absences/:childId ───────────────────────────────────────
r.post('/absences/:childId', (req, res) => {
  try {
    const childIds = parentChildIds(req.userId);
    if (!childIds.includes(req.params.childId)) return res.status(403).json({ error: 'Not authorised' });
    const { start_date, end_date, reason, notes } = req.body;
    if (!start_date || !reason) return res.status(400).json({ error: 'start_date and reason required' });
    const tenantId = childTenantId(req.params.childId);
    if (!tenantId) return res.status(400).json({ error: 'Child not found' });
    const id = uuid();
    try {
      D().prepare(`
        INSERT INTO child_absences
          (id,tenant_id,child_id,start_date,end_date,reason,notes,acknowledged,created_at)
        VALUES(?,?,?,?,?,?,?,0,datetime('now'))
      `).run(id, tenantId, req.params.childId, start_date, end_date || null, reason, notes || null);
    } catch {
      // Table may not exist in older deployments — create then retry
      D().prepare(`
        CREATE TABLE IF NOT EXISTS child_absences (
          id TEXT PRIMARY KEY, tenant_id TEXT, child_id TEXT,
          start_date TEXT, end_date TEXT, reason TEXT, notes TEXT,
          acknowledged INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
      D().prepare(`
        INSERT INTO child_absences
          (id,tenant_id,child_id,start_date,end_date,reason,notes,acknowledged)
        VALUES(?,?,?,?,?,?,?,0)
      `).run(id, tenantId, req.params.childId, start_date, end_date || null, reason, notes || null);
    }
    res.json({ id, ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default r;
