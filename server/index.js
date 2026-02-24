import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { initDatabase, cleanExpired } from './db.js';
import authRoutes from './auth.js';
import apiRoutes from './api.js';
import documentRoutes from './documents.js';
import complianceRoutes, { runDailyComplianceScan } from './compliance.js';
import invoicingRoutes from './invoicing.js';
import enrolmentRoutes from './enrolment.js';
import platformRoutes from './platform.js';
import rosteringRoutes from './rostering.js';
import educatorsRoutes from './educators.js';
import childrenRoutes from './children.js';
import dailyUpdatesRoutes from './daily-updates.js';
import excursionsRoutes from './excursions.js';
import messagingRoutes from './messaging.js';
import registerRoutes from './register.js';
import learningRoutes from './learning.js';
import wellbeingRoutes from './wellbeing.js';
import settingsRoutes from './settings.js';
import waitlistRoutes from './waitlist.js';
import parentRoutes from './parent.js';
import aiRoutes from './ai.js';
import auditRoutes from './audit.js';
import voiceRoutes, { webhookRouter } from './voice.js';
import { globalAuditMiddleware } from './middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Log all unhandled errors so they appear in Railway logs
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.message, err.stack?.split('\n')[1]);
});
const PORT = process.env.PORT || 3003;
const isProd = process.env.NODE_ENV === 'production';

// Ensure uploads directory exists
// Use Railway volume for uploads if available
const uploadsDir = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'uploads')
  : path.join(__dirname, '..', 'uploads');
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });


console.log('\n  ╔══════════════════════════════════════════╗');
console.log('  ║  Childcare360 v1.9.7 — Starting Server    ║');
console.log('  ╚══════════════════════════════════════════╝\n');

// ── Init database ──
initDatabase();

// -- Auto-seed if SEED_ON_START is set --
if (process.env.SEED_ON_START === 'true') {
  import('child_process').then(({ execFile }) => {
    console.log('  [SEED] SEED_ON_START detected - running seed-rich.js...');
    const seedPath = path.join(__dirname, 'seed-rich.js');
    const cwd = path.join(__dirname, '..');
    execFile('node', [seedPath], { cwd }, (err, stdout) => {
      if (err) { console.error('  [SEED] Seed failed:', err.message); return; }
      console.log('  [SEED] Seed complete!');
    });
  });
}

// ── Express app ──
const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: isProd ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

// CORS — allow dev frontend
app.use(cors({
  origin: isProd ? false : ['http://localhost:5173', 'http://localhost:3003', 'http://localhost:3002'],
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Required for Twilio webhooks

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Request logging (non-static)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      const status = res.statusCode;
      const color = status < 400 ? '\x1b[32m' : status < 500 ? '\x1b[33m' : '\x1b[31m';
      console.log(`  ${color}${req.method} ${req.path} → ${status}\x1b[0m (${ms}ms)`);
    });
  }
  next();
});

// ── Routes ──
app.use(globalAuditMiddleware);
app.use('/auth', authRoutes);
// Twilio webhooks mounted BEFORE /api auth middleware
app.use('/api/voice/webhook', webhookRouter);

app.use('/api', apiRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/invoicing', invoicingRoutes);
app.use('/api/enrolment', enrolmentRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/rostering', rosteringRoutes);
app.use('/api/educators', educatorsRoutes);
app.use('/api/children', childrenRoutes);
app.use('/api/daily-updates', dailyUpdatesRoutes);
app.use('/api/excursions', excursionsRoutes);
app.use('/api/messaging', messagingRoutes);
app.use('/api/register', registerRoutes);
app.use('/api/learning', learningRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/wellbeing', wellbeingRoutes);
app.use('/api/settings', settingsRoutes);

// ── Health check ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.9.7', uptime: process.uptime() });
});

// ── Serve uploads ──
app.use('/uploads', express.static(uploadsDir));

// ── Serve frontend (production) ──
const distPath = path.join(__dirname, '..', 'dist');
const BASE_PATH = (process.env.BASE_PATH || '/').replace(/\/$/, '') || '/';
// Serve static assets
if (BASE_PATH === '/') {
  app.use(express.static(distPath));
} else {
  app.use(BASE_PATH, express.static(distPath));
  app.use(express.static(distPath));
}
// SPA catch-all
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/') && !req.path.startsWith('/auth/')) {
    const indexPath = path.join(distPath, 'index.html');
    if (!existsSync(indexPath)) {
      return res.status(200).send(`<!DOCTYPE html><html><head><title>Childcare360 — Build Required</title>
<style>body{font-family:system-ui,sans-serif;background:#F0EBF8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{background:#fff;border-radius:16px;padding:40px;max-width:520px;width:90%;box-shadow:0 8px 32px rgba(139,109,175,.2)}
h2{color:#8B6DAF;margin:0 0 10px}p{color:#5C4E6A;font-size:14px}
pre{background:#F8F5F1;border-radius:8px;padding:12px 16px;font-size:13px;margin:6px 0}</style></head>
<body><div class="box"><h2>🔨 Frontend Not Built</h2>
<p>The server is running but the frontend hasn't been compiled yet.</p>
<p><strong>Run on the VM:</strong></p>
<pre>cd /root/childcare360-app</pre>
<pre>npm install</pre>
<pre>npm run build</pre>
<pre>PORT=3003 npm run start</pre>
<p style="color:#8A7F96;font-size:12px">If you see "vite not found" — make sure to use the latest tar from the shared folder.</p>
</div></body></html>`);
    }
    res.sendFile(indexPath, (err) => {
      if (err && !res.headersSent) res.status(500).json({ error: 'Failed to serve frontend' });
    });
  }
});

// ── Error handler ──
app.use((err, req, res, _next) => {
  console.error('  ✗ Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Periodic cleanup + daily compliance scan ──
setInterval(() => { try { cleanExpired(); } catch(e) {} }, 3600000);

// Import D for compliance scans
import { D } from './db.js';

// Run compliance scan every 6 hours for all tenants
setInterval(() => {
  try {
    const tenants = D().prepare('SELECT id FROM tenants').all();
    tenants.forEach(t => runDailyComplianceScan(t.id));
  } catch(e) { console.error('Compliance scan error:', e.message); }
}, 6 * 3600000);

// Run initial compliance scan 10s after startup
setTimeout(() => {
  try {
    const tenants = D().prepare('SELECT id FROM tenants').all();
    tenants.forEach(t => runDailyComplianceScan(t.id));
  } catch(e) {}
}, 10000);

// ── Start ──
app.listen(PORT, '0.0.0.0', () => {
  console.log(`  ✓ Server listening on http://0.0.0.0:${PORT}`);
  console.log(`  ✓ Environment: ${isProd ? 'production' : 'development'}`);
  console.log(`  ✓ Auth: Email/Password, Google OAuth, Apple OAuth, TOTP, Email MFA`);
  console.log(`  ✓ Multi-tenant isolation enabled`);
  console.log(`  ✓ Document store + AI analysis enabled`);
  console.log(`  ✓ Compliance engine: auto-scan every 6 hours\n`);
});
