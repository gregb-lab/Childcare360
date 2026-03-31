import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant, requireRole } from './middleware.js';

// Wrap route handlers for consistent error responses
const wrap = fn => (req, res, next) => {
  try {
    const result = fn(req, res, next);
    if (result && typeof result.catch === 'function') {
      result.catch(e => { if (!res.headersSent) res.status(500).json({ error: e.message }); });
    }
  } catch(e) { if (!res.headersSent) res.status(500).json({ error: e.message }); }
};

const r = Router();

// Ensure table exists
function initWellbeing() {
  D().prepare('CREATE TABLE IF NOT EXISTS staff_wellbeing (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    user_id TEXT NOT NULL REFERENCES users(id),
    date TEXT NOT NULL,
    energy_level INTEGER,
    stress_level INTEGER,
    workload_rating INTEGER,
    support_rating INTEGER,
    notes TEXT,
    concerns TEXT DEFAULT \'[]\',
    anonymous INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime(\'now\')),
    UNIQUE(user_id, date)
  )').run();
}

// ── POST /api/wellbeing/checkin ──────────────────────────────────────────────
r.post('/checkin', requireAuth, (req, res) => {
  initWellbeing();
  const { date, energy_level, stress_level, workload_rating, support_rating, notes, concerns, anonymous } = req.body;
  if (!date || !energy_level || !stress_level) return res.status(400).json({ error: 'date, energy_level, stress_level required' });
  const tenantId = req.tenantId || D().prepare('SELECT tenant_id FROM children LIMIT 1').get()?.tenant_id || 'default';
  const id = uuid();
  D().prepare('INSERT INTO staff_wellbeing (id,tenant_id,user_id,date,energy_level,stress_level,workload_rating,support_rating,notes,concerns,anonymous)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,date) DO UPDATE SET
      energy_level=excluded.energy_level, stress_level=excluded.stress_level,
      workload_rating=excluded.workload_rating, support_rating=excluded.support_rating,
      notes=excluded.notes, concerns=excluded.concerns, anonymous=excluded.anonymous')
    .run(id, tenantId, req.userId, date, energy_level, stress_level, workload_rating || null, support_rating || null, notes || null, concerns || '[]', anonymous ? 1 : 0);
  res.json({ id, ok: true });
});

// ── GET /api/wellbeing/my?days=30 ───────────────────────────────────────────
r.get('/my', requireAuth, (req, res) => {
  initWellbeing();
  const days = parseInt(req.query.days) || 30;
  const rows = const _wbArg1 = '-' + days + ' days'; const _wbRows1 = D().prepare('SELECT * FROM staff_wellbeing WHERE user_id=? AND date >= date(\'now\',?,\'localtime\') ORDER BY date DESC').all(req.userId, _wbArg1);
  res.json(_wbRows1);
});

// ── GET /api/wellbeing/team-pulse ─────────────────────────────────────────────
r.get('/team-pulse', requireAuth, requireTenant, (req, res) => {
  initWellbeing();
  const today = new Date().toISOString().slice(0, 10);
  const records = D().prepare('SELECT sw.*, u.name FROM staff_wellbeing sw LEFT JOIN users u ON u.id=sw.user_id WHERE sw.tenant_id=? AND sw.date=?').all(req.tenantId, today);
  // Aggregate concerns from last 7 days (anonymous only)
  const recent = D().prepare('SELECT concerns FROM staff_wellbeing WHERE tenant_id=? AND date >= date(\'now\',\'-7 days\',\'localtime\') AND anonymous=1').all(req.tenantId);
  const concernCounts = {};
  recent.forEach(row => {
    try { JSON.parse(row.concerns || '[]').forEach(c => { concernCounts[c] = (concernCounts[c] || 0) + 1; }); } catch {}
  });
  const concerns = Object.entries(concernCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([area, count]) => ({ area, count }));
  // Mask names if anonymous
  const maskedRecords = records.map(r => ({ ...r, name: r.anonymous ? 'Anonymous' : r.name, user_id: r.anonymous ? null : r.user_id }));
  res.json({ records: maskedRecords, concerns, date: today });
});

// ── GET /api/wellbeing/history?days=30 (manager only) ──────────────────────
r.get('/history', requireAuth, requireTenant, requireRole('admin', 'director'), (req, res) => {
  initWellbeing();
  const days = parseInt(req.query.days) || 30;
  const rows = const _wbArg2 = '-' + days + ' days'; const _wbRows2 = D().prepare('SELECT sw.*, u.name FROM staff_wellbeing sw LEFT JOIN users u ON u.id=sw.user_id WHERE sw.tenant_id=? AND sw.date >= date(\'now\',?,\'localtime\') ORDER BY sw.date DESC').all(req.tenantId, _wbArg2);
  // Mask anonymous
  res.json(rows.map(r => ({ ...r, name: r.anonymous ? 'Anonymous' : r.name, user_id: r.anonymous ? null : r.user_id, notes: r.anonymous ? null : r.notes })));
});

export default r;
