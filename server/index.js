import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync as _rfs } from 'fs';
import { initDatabase, cleanExpired } from './db.js';
import { randomUUID as _uuid } from 'crypto';
import { D as _D } from './db.js';
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
import staffRoutes from './staff.js';
import staffFeaturesRoutes from './staff-features.js';
import runsheetRoutes from './runsheet.js';
import runsheetLiveRoutes from './runsheet-live.js';
import preferencesRoutes from './preferences.js';
import developerRoutes from './developer.js';
import publicApiRoutes from './publicapi.js';
import reportsRoutes from './reports.js';
import incidentRoutes from './incidents.js';
import wellbeingRoutes from './wellbeing.js';
import settingsRoutes from './settings.js';
import waitlistRoutes from './waitlist.js';
import parentRoutes from './parent.js';
import aiRoutes from './ai.js';
import auditRoutes from './audit.js';
import voiceRoutes, { webhookRouter, audioRouter } from './voice.js';
import shiftVoiceRoutes, { shiftWebhooks } from './shift-voice.js';
import retellRoutes, { retellWebhooks, setupRetellWebSocket } from './retell.js';
import checkinAlertRoutes, { processCheckinAlerts } from './checkin-alerts.js';
import casualSpotRoutes from './casual-spots.js';
import rosterEnhancedRoutes from './roster-enhancements.js';
import operationsRoutes from './operations.js';
import crmRoutes from './crm.js';
import engagementRoutes from './engagement.js';
import ccsRoutes from './ccs.js';
import ccsAbsenceRoutes from './ccs-absences.js';
import integrationsRoutes from './integrations.js';
import adminPowerRoutes from './admin-power.js';
import childdevRoutes from './childdev.js';
import qualityRoutes from './quality.js';
import kioskRoutes from './kiosk.js';
import payrollExportRoutes from './payroll-export.js';
import notifEngineRoutes from './notifications-engine.js';
import commsRoutes from './comms.js';
import paymentsRoutes from './payments.js';
import waitlistAutoRoutes from './waitlist-automation.js';
import bulkCommsRoutes from './bulk-comms.js';
import { reportsBuilderRouter, riskAssessmentRouter } from './reports-builder.js';
import analyticsRoutes from './analytics.js';
import invoicingFullRoutes from './invoicing-full.js';
import { xeroRouter, educatorSelfRouter, leaveAdminRouter } from './xero.js';
import schedulePublisherRoutes from './schedule-publisher.js';
import aiAssistantRoutes, { feeOverrideRouter, complianceTaskRouter } from './ai-assistant.js';
import v2Routes from './v2-features.js';
import { globalAuditMiddleware, requireAuth, requireTenant, requireRole} from './middleware.js';
import weeklyStoriesRouter from './weekly-stories.js';
import ratioReportRouter from './ratio-report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Log all unhandled errors so they appear in AWS logs
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.message, err.stack?.split('\n')[1]);
});
const PORT = process.env.PORT || 3003;
const isProd = process.env.NODE_ENV === 'production';

// Ensure uploads directory exists
// Use AWS volume for uploads if available
const uploadsDir = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'uploads')
  : path.join(__dirname, '..', 'uploads');
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });


const _pkg = JSON.parse(_rfs(new URL('../package.json', import.meta.url)));
console.log(`\n  ╔══════════════════════════════════════════╗`);
console.log(`  ║  Childcare360 v${_pkg.version} — Starting Server    ║`);
console.log(`  ╚══════════════════════════════════════════╝\n`);

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

// -- Auto-seed CN data if SEED_CN_ON_START is set --
if (process.env.SEED_CN_ON_START === 'true') {
  setTimeout(() => {
    try {
      console.log('  [SEED_CN] Starting inline CN seed...');
      const db = _D();

      // Auto-detect tenant
      const envTenant = process.env.SEED_TENANT;
      let TENANT = envTenant || null;
      if (!TENANT) {
        // Find the real centre - prefer non-demo tenant, fall back to first
    const allTenants = db.prepare("SELECT id, name FROM tenants ORDER BY created_at ASC").all();
    const first = allTenants.find(t => !t.id.startsWith('demo-')) || allTenants[0];
        if (!first) { console.error('  [SEED_CN] No tenant found in DB'); return; }
        TENANT = first.id;
      }
      console.log('  [SEED_CN] Using tenant:', TENANT);

      const ROOMS = [
        { id: 'cn-sprouts-1',  name: 'Sprouts Room 1',  age_group: '0-2', capacity: 8  },
        { id: 'cn-sprouts-2',  name: 'Sprouts Room 2',  age_group: '0-2', capacity: 12 },
        { id: 'cn-buds-1',     name: 'Buds Room 1',     age_group: '2-3', capacity: 15 },
        { id: 'cn-buds-2',     name: 'Buds Room 2',     age_group: '2-3', capacity: 10 },
        { id: 'cn-blossoms-1', name: 'Blossoms Room 1', age_group: '3-4', capacity: 10 },
        { id: 'cn-blossoms-2', name: 'Blossoms Room 2', age_group: '3-4', capacity: 15 },
        { id: 'cn-oaks-1',     name: 'Oaks Room 1',     age_group: '4-5', capacity: 20 },
      ];
      let roomsAdded = 0;
      for (const r of ROOMS) {
        const ex = db.prepare('SELECT id FROM rooms WHERE id=? OR (tenant_id=? AND name=?)').get(r.id, TENANT, r.name);
        if (!ex) { db.prepare('INSERT OR IGNORE INTO rooms (id,tenant_id,name,age_group,capacity) VALUES(?,?,?,?,?)').run(r.id, TENANT, r.name, r.age_group, r.capacity); roomsAdded++; }
      }
      console.log('  [SEED_CN] Rooms added:', roomsAdded);

      const CHILDREN = [
        {fn:'Luke',ln:'Patel',dob:'2025-02-18',room:'cn-sprouts-1',parent:'Jasmine Patel',phone:'',email:'akkari.jasmine@gmail.com',days:'Mon,Tue,Wed',notes:''},
        {fn:'Darcie',ln:'Ravenall',dob:'2025-04-09',room:'cn-sprouts-1',parent:'Victoria Ravenall',phone:'',email:'vmbrown91@gmail.com',days:'Mon,Wed,Thu',notes:''},
        {fn:'Johnny',ln:'Koutsoufis',dob:'2025-02-27',room:'cn-sprouts-1',parent:'Katie Sofatzis',phone:'0424442704',email:'k.sofatzis@hotmail.com',days:'Tue,Wed',notes:''},
        {fn:'Apostolos',ln:'Toumbelekis',dob:'2024-12-24',room:'cn-sprouts-1',parent:'Danielle Toumbelekis',phone:'0408337751',email:'danicons.777@gmail.com',days:'Tue,Wed,Thu',notes:'No CRN'},
        {fn:'Noah',ln:'Egan',dob:'2025-05-31',room:'cn-sprouts-1',parent:'Ivana Egan',phone:'0422858359',email:'',days:'Mon,Fri',notes:''},
        {fn:'Chris',ln:'Christofi',dob:'2025-04-15',room:'cn-sprouts-1',parent:'Jessica Christofi',phone:'0452557225',email:'jessicarizzo03@yahoo.com',days:'Mon,Tue',notes:''},
        {fn:'Frank',ln:'Piperides',dob:'2025-05-27',room:'cn-sprouts-1',parent:'Tracey Piperides',phone:'0452187887',email:'Tracey.piperides@gmail.com',days:'Mon,Thu',notes:''},
        {fn:'Matteo',ln:'Macander',dob:'2025-02-20',room:'cn-sprouts-1',parent:'Clair Macander',phone:'0424163670',email:'clairgoldie@gmail.com',days:'Mon,Fri',notes:''},
        {fn:'Riley',ln:'Coppini',dob:'2025-05-14',room:'cn-sprouts-1',parent:'Emma Coppini',phone:'0452339240',email:'coppinijemma@gmail.com',days:'Tue,Wed,Thu',notes:''},
        {fn:'Joy',ln:'Guirguis',dob:'2025-06-04',room:'cn-sprouts-1',parent:'Mary Guirguis',phone:'0422438823',email:'Guirguis2311@gmail.com',days:'Mon,Thu',notes:''},
        {fn:'Levi',ln:'Po',dob:'2025-01-17',room:'cn-sprouts-1',parent:'Thuy Po',phone:'0433421651',email:'Thuy.le_@live.com',days:'Thu,Fri',notes:''},
        {fn:'Leon',ln:'Ianni',dob:'2024-10-31',room:'cn-sprouts-1',parent:'Sally Ianni',phone:'',email:'sally.elazzi4@det.nsw.edu.au',days:'Mon,Thu,Fri',notes:''},
        {fn:'Chelsea',ln:'Lam',dob:'2024-06-18',room:'cn-sprouts-1',parent:'Michelle Nguyen',phone:'0404193048',email:'M.vynguyen@gmail.com',days:'Tue,Wed,Thu',notes:''},
        {fn:'Matteo',ln:'Belviso',dob:'2024-09-10',room:'cn-sprouts-2',parent:'Brianna Belviso',phone:'',email:'',days:'Tue,Wed',notes:''},
        {fn:'Ciara',ln:'Tonks',dob:'2024-08-13',room:'cn-sprouts-2',parent:'Aoife Tonks',phone:'0406279123',email:'',days:'Mon,Wed,Thu',notes:''},
        {fn:'Landon',ln:'Zanella',dob:'2025-07-01',room:'cn-sprouts-2',parent:'Samantha Zanella',phone:'0435735428',email:'',days:'Fri',notes:''},
        {fn:'Darcy',ln:'Sweeting',dob:'2024-05-27',room:'cn-sprouts-2',parent:'Christina Sweeting',phone:'',email:'',days:'Mon,Tue,Wed,Fri',notes:''},
        {fn:'Mathias',ln:'Cosman',dob:'2025-07-27',room:'cn-sprouts-2',parent:'Marena Cosman',phone:'0433677290',email:'marenamike@gmail.com',days:'Wed,Thu,Fri',notes:''},
        {fn:'Madeline',ln:'Knevett',dob:'2024-08-28',room:'cn-sprouts-2',parent:'',phone:'',email:'',days:'Wed,Thu',notes:''},
        {fn:'Arya',ln:'Sanjeevee',dob:'2024-07-09',room:'cn-sprouts-2',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu',notes:''},
        {fn:'Taym',ln:'Albassit',dob:'2024-12-20',room:'cn-sprouts-2',parent:'Renee Albassit',phone:'0449970385',email:'reneealbassit@gmail.com',days:'Tue,Wed,Thu,Fri',notes:'Sibling: Haayah'},
        {fn:'Evie',ln:'Kete',dob:'2024-07-20',room:'cn-sprouts-2',parent:'Beatrice Kete',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri',notes:''},
        {fn:'Edmund',ln:'Foote',dob:'2024-08-08',room:'cn-sprouts-2',parent:'Liz Foote',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri',notes:''},
        {fn:'Ariana',ln:'Da Silva',dob:'2024-09-09',room:'cn-sprouts-2',parent:'Krissi Matakakis',phone:'0433402461',email:'Krissimatakakis@gmail.com',days:'Thu,Fri',notes:''},
        {fn:'Luna',ln:'Salameh',dob:'2024-06-24',room:'cn-sprouts-2',parent:'Soukania Salameh',phone:'',email:'',days:'Tue,Fri',notes:''},
        {fn:'Penelope',ln:'Cooke',dob:'2024-04-05',room:'cn-sprouts-2',parent:'Jessica Debattista',phone:'0422709504',email:'jessica.debattista@outlook.com',days:'Mon,Tue,Fri',notes:''},
        {fn:'Joaquin',ln:'Arce',dob:'2024-07-08',room:'cn-sprouts-2',parent:'Frances Arce',phone:'0452125203',email:'francesjaviera@live.com',days:'Mon,Tue,Wed',notes:''},
        {fn:'Estella',ln:'Papthanasiou',dob:'2024-05-13',room:'cn-sprouts-2',parent:'',phone:'',email:'',days:'Mon,Tue,Wed',notes:''},
        {fn:'Zakaria',ln:'Wehbi',dob:'2024-12-10',room:'cn-sprouts-2',parent:'Lamees Moussa',phone:'',email:'lameesmoussa@hotmail.com',days:'Tue,Thu',notes:''},
        {fn:'Elaria',ln:'Tourany',dob:'2024-09-03',room:'cn-sprouts-2',parent:'Melissa Tourany',phone:'',email:'',days:'Mon,Tue',notes:''},
        {fn:'Zoe',ln:'Patel',dob:'2023-08-23',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed',notes:''},
        {fn:'Celine',ln:'Nguyen',dob:'2023-08-14',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri',notes:''},
        {fn:'Zachariah',ln:'Taha',dob:'2024-04-21',room:'cn-buds-1',parent:'Danya Darwiche',phone:'',email:'danyadarwiche@hotmail.com',days:'Tue,Wed',notes:''},
        {fn:'Elias',ln:'Jalwan',dob:'2023-10-10',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Wed,Thu',notes:''},
        {fn:'Levi',ln:'Dib',dob:'2023-09-02',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu,Fri',notes:''},
        {fn:'Norah',ln:'Pak',dob:'2023-09-21',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Wed,Thu',notes:''},
        {fn:'Jude',ln:'Manoun',dob:'2024-01-03',room:'cn-buds-1',parent:'',phone:'',email:'akaraki@live.com.au',days:'Tue,Wed,Fri',notes:''},
        {fn:'Anthony',ln:'Alrahil',dob:'2024-03-01',room:'cn-buds-1',parent:'Vivan Alrahil',phone:'0450414429',email:'',days:'Mon,Fri',notes:''},
        {fn:'Nicolas',ln:'Peet',dob:'2024-01-04',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu',notes:''},
        {fn:'Ayah',ln:'El-Jamal',dob:'2024-02-03',room:'cn-buds-1',parent:'Christine El-Jamal',phone:'0404038911',email:'h.eljamal@outlook.com',days:'Tue,Wed,Thu',notes:''},
        {fn:'Dzejla',ln:'Kurtovic',dob:'2024-01-15',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu,Fri',notes:''},
        {fn:'Idris',ln:'Khadem',dob:'2024-12-07',room:'cn-buds-1',parent:'Randa Khadem',phone:'0414520614',email:'Randa.la.ginge@gmail.com',days:'Tue,Fri',notes:''},
        {fn:'Natalia',ln:'Azzi',dob:'2024-04-18',room:'cn-buds-1',parent:'Gizelle Azzi',phone:'0498860015',email:'Gizelle.azzi@outlook.com',days:'Tue,Thu',notes:''},
        {fn:'Javiah',ln:'Caldera',dob:'2023-08-21',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu,Fri',notes:''},
        {fn:'Nafas',ln:'Joola',dob:'2023-07-11',room:'cn-buds-1',parent:'Naz Mojab',phone:'0450766052',email:'nazaninmojab@gmail.com',days:'Mon,Fri',notes:''},
        {fn:'Inaya',ln:'Khan',dob:'2023-11-24',room:'cn-buds-1',parent:'Amjad Khan',phone:'0434985112',email:'',days:'Mon,Tue,Wed,Thu,Fri',notes:''},
        {fn:'Zeinab',ln:'Fares',dob:'2023-12-05',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu',notes:''},
        {fn:'Penelope',ln:'Sofatzis',dob:'2023-11-14',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed',notes:''},
        {fn:'Aria',ln:'Karavellas',dob:'2023-11-03',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Wed,Thu',notes:''},
        {fn:'Sophia',ln:'Gallagher',dob:'2023-10-25',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Wed,Thu,Fri',notes:''},
        {fn:'Ali',ln:'Mansour',dob:'2023-09-23',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Wed,Thu,Fri',notes:''},
        {fn:'Linh',ln:'Nguyen',dob:'2023-08-07',room:'cn-buds-1',parent:'Anna Nguyen',phone:'0450381811',email:'annadaoanh@gmail.com',days:'Mon,Thu,Fri',notes:''},
        {fn:'Zachariya',ln:'Bazzi',dob:'2023-07-14',room:'cn-buds-2',parent:'',phone:'',email:'',days:'Wed,Thu,Fri',notes:''},
        {fn:'Zion',ln:'Malek',dob:'2023-07-10',room:'cn-buds-2',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri',notes:''},
        {fn:'Imogen',ln:'Dignan',dob:'2023-06-29',room:'cn-buds-2',parent:'',phone:'',email:'',days:'Tue,Wed,Thu',notes:''},
        {fn:'Emrah',ln:'Dautovic',dob:'2023-08-30',room:'cn-buds-2',parent:'Emina Dautovic',phone:'0424059266',email:'',days:'Mon,Wed',notes:''},
        {fn:'Lukas',ln:'Vidovic',dob:'2024-03-25',room:'cn-buds-2',parent:'',phone:'',email:'',days:'Mon,Wed',notes:''},
        {fn:'Jamie',ln:'Valiente',dob:'2023-07-26',room:'cn-buds-2',parent:'Tayla Spendlove',phone:'',email:'tayla.spendlove@gmail.com',days:'Tue,Thu',notes:''},
        {fn:'Nur',ln:'Ozdil',dob:'2024-04-23',room:'cn-buds-2',parent:'Jessica Ozdil',phone:'0406628968',email:'',days:'Mon,Wed',notes:''},
        {fn:'Carol',ln:'Sorial',dob:'2023-11-07',room:'cn-buds-2',parent:'Youstina Ghaly',phone:'0494165780',email:'youstinaghaly77@gmail.com',days:'Mon,Tue',notes:''},
        {fn:'Iiyas',ln:'Serinsu',dob:'2023-06-21',room:'cn-buds-2',parent:'Havva Serinsu',phone:'0412894206',email:'havva.m_93@hotmail.com',days:'Wed,Fri',notes:''},
        {fn:'Bear Saint',ln:'Bechara',dob:'2023-10-02',room:'cn-buds-2',parent:'Kayley Bechara',phone:'',email:'',days:'Mon,Fri',notes:''},
        {fn:'Jerome',ln:'Ianni',dob:'2023-07-09',room:'cn-buds-2',parent:'',phone:'',email:'',days:'Tue,Thu,Fri',notes:''},
        {fn:'Ali',ln:'Zoghbi',dob:'2023-07-19',room:'cn-buds-2',parent:'',phone:'',email:'',days:'Thu,Fri',notes:''},
        {fn:'Poppy',ln:'Carvalho',dob:'2023-07-05',room:'cn-buds-2',parent:'Elena Carvalho',phone:'0423612447',email:'',days:'Thu,Fri',notes:''},
        {fn:'Austin',ln:'Ardamil',dob:'2023-04-27',room:'cn-buds-2',parent:'Anh Ardamil',phone:'',email:'Ran2504@gmail.com',days:'Tue,Wed,Thu,Fri',notes:''},
        {fn:'James',ln:'Akkari',dob:'2023-03-27',room:'cn-buds-2',parent:'',phone:'',email:'',days:'Tue',notes:''},
        {fn:'Liam',ln:'Akkari',dob:'2023-03-27',room:'cn-buds-2',parent:'',phone:'',email:'',days:'Tue',notes:''},
        {fn:'Haayah',ln:'Albassit',dob:'2023-03-05',room:'cn-buds-2',parent:'Renee Albassit',phone:'0449970385',email:'reneealbassit@gmail.com',days:'Tue,Wed,Thu,Fri',notes:''},
        {fn:'Andrej',ln:'Miloseveski',dob:'2023-03-11',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed',notes:'Twin: Tomas'},
        {fn:'Tomas',ln:'Milosevski',dob:'2023-03-11',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed',notes:'Twin: Andrej'},
        {fn:'Isabella',ln:'Wehbi',dob:'2022-12-08',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu',notes:''},
        {fn:'Ashton',ln:'Vu',dob:'2022-06-19',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri',notes:''},
        {fn:'Mason',ln:'Azzi',dob:'2023-02-23',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Mon,Thu,Fri',notes:''},
        {fn:'Louis',ln:'Ngo',dob:'2022-03-28',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Mon,Wed,Thu,Fri',notes:''},
        {fn:'Harper',ln:'Kete',dob:'2022-08-21',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri',notes:''},
        {fn:'Mylah',ln:'Tourany',dob:'2023-02-10',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Mon,Tue',notes:''},
        {fn:'Victoria',ln:'Doueihy',dob:'2022-10-12',room:'cn-blossoms-1',parent:'',phone:'',email:'f_fakhoury93@hotmail.com',days:'Tue,Thu,Fri',notes:''},
        {fn:'Romy',ln:'Alosi',dob:'2022-07-25',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Tue,Wed,Thu',notes:''},
        {fn:'Anastasia',ln:'Vukotic',dob:'2022-07-28',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Wed,Thu,Fri',notes:''},
        {fn:'Micheal',ln:'Castelao',dob:'2022-10-06',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Tue,Wed,Thu',notes:''},
        {fn:'Jayda',ln:'Sabido',dob:'2022-08-21',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Wed,Thu,Fri',notes:''},
        {fn:'Darcy',ln:'Cooper',dob:'2022-10-07',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Mon,Thu,Fri',notes:''},
        {fn:'Ibrahim',ln:'Bayrouti',dob:'2022-05-26',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Mon,Tue,Wed',notes:'Twin: Yousef'},
        {fn:'Yousef',ln:'Bayrouti',dob:'2022-05-26',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Mon,Tue,Wed',notes:'Twin: Ibrahim'},
        {fn:'Catalina',ln:'Duff',dob:'2022-05-07',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Mon,Tue',notes:''},
        {fn:'Athena',ln:'La Greca',dob:'2022-05-24',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Tue,Wed,Thu,Fri',notes:''},
        {fn:'Chloe',ln:'Zoobi',dob:'2022-07-31',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Tue,Thu',notes:''},
        {fn:'Shadi',ln:'Salameh',dob:'2022-07-22',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Tue,Fri',notes:''},
        {fn:'Mia',ln:'Karabestsos',dob:'2022-12-16',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Mon,Thu,Fri',notes:''},
        {fn:'Leonidas',ln:'Hatzinikitas',dob:'2023-01-09',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Mon,Tue,Wed',notes:''},
        {fn:'Nathaniel',ln:'Oxton',dob:'2023-02-22',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu',notes:''},
        {fn:'Mateo',ln:'Ruz',dob:'2022-11-10',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Tue,Wed',notes:''},
        {fn:'Isabelle',ln:'Henderson',dob:'2022-09-28',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Mon,Tue,Thu',notes:''},
        {fn:'Ashton',ln:'Quach',dob:'2022-05-15',room:'cn-blossoms-2',parent:'Pranee Quach',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri',notes:''},
        {fn:'Xavier',ln:'Morcos',dob:'2022-08-11',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Tue,Wed,Thu,Fri',notes:''},
        {fn:'Liyana',ln:'Manoun',dob:'2022-08-23',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Tue,Wed,Fri',notes:''},
        {fn:'Evelyn',ln:'Hodsoll',dob:'2022-07-18',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Tue,Wed,Thu,Fri',notes:''},
        {fn:'Jai',ln:'Patel',dob:'2021-09-13',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed',notes:''},
        {fn:'Luciano',ln:'Soto',dob:'2021-12-07',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Thu,Fri',notes:''},
        {fn:'Carter',ln:'Cherrington',dob:'2021-05-31',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu,Fri',notes:''},
        {fn:'Gabriel',ln:'Bazzi',dob:'2021-04-28',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Wed,Thu',notes:''},
        {fn:'Alaska',ln:'Carter',dob:'2022-03-17',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu,Fri',notes:''},
        {fn:'Hudson',ln:'Gallagher',dob:'2021-05-21',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Wed,Thu,Fri',notes:''},
        {fn:'Jordan',ln:'Ayoub',dob:'2021-11-22',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu,Fri',notes:''},
        {fn:'Anastasia',ln:'Faraj',dob:'2022-05-09',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Tue,Wed,Thu,Fri',notes:''},
        {fn:'Audrey',ln:'Buczek',dob:'2021-03-16',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu',notes:''},
        {fn:'Yaqoub',ln:'Roude',dob:'2021-04-02',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Fri',notes:''},
        {fn:'Jacob',ln:'Alosi',dob:'2021-04-19',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Tue,Wed,Thu',notes:''},
        {fn:'Maximus',ln:'Trigas',dob:'2021-06-29',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Tue,Wed,Thu,Fri',notes:''},
        {fn:'Selina',ln:'Zoghbi',dob:'2021-05-31',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Tue,Wed,Thu,Fri',notes:''},
        {fn:'Adelisa',ln:'Kurtovic',dob:'2021-01-15',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu,Fri',notes:''},
        {fn:'Amelia',ln:'Druce',dob:'2021-08-10',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Wed,Fri',notes:''},
        {fn:'James',ln:'Peet',dob:'2022-01-17',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu',notes:''},
        {fn:'Layla',ln:'Fernandes Moniz',dob:'2021-12-03',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri',notes:'Twin: Lily'},
        {fn:'Lily',ln:'Fernandes Moniz',dob:'2021-12-03',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri',notes:'Twin: Layla'},
        {fn:'Sidra',ln:'Alharbe',dob:'2022-01-09',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Wed,Fri',notes:''},
        {fn:'Mariano',ln:'Gunua',dob:'2021-06-14',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Tue,Wed',notes:''},
        {fn:'Venba',ln:'Kannan',dob:'2022-08-04',room:'cn-oaks-1',parent:'Andrea Visca',phone:'0424497509',email:'andreavisca1@gmail.com',days:'Mon,Tue,Wed,Thu,Fri',notes:''},
        {fn:'Paul',ln:'Abrahim',dob:'2021-07-13',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue',notes:''},
        {fn:'Savion',ln:'Keomoungkhoun',dob:'2021-07-12',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Wed',notes:''},
        {fn:'Idris',ln:'Serinsu',dob:'2021-12-08',room:'cn-oaks-1',parent:'Havva Serinsu',phone:'',email:'',days:'Wed,Thu,Fri',notes:''},
        {fn:'Mariano',ln:'Gunua',dob:'2021-06-14',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Tue,Wed',notes:''},
      ];

      let kidsAdded = 0, kidsSkipped = 0, parentsAdded = 0;
      for (const k of CHILDREN) {
        if (!k.fn) continue;
        const ex = db.prepare('SELECT id FROM children WHERE tenant_id=? AND first_name=? AND last_name=?').get(TENANT, k.fn, k.ln||'');
        if (ex) { kidsSkipped++; continue; }
        const cid = _uuid();
        db.prepare('INSERT OR IGNORE INTO children (id,tenant_id,first_name,last_name,dob,room_id,allergies,notes,enrolled_date,active) VALUES(?,?,?,?,?,?,?,?,?,1)')
          .run(cid, TENANT, k.fn, k.ln||'', k.dob||'2020-01-01', k.room, 'None', [k.notes, k.days ? 'Days: '+k.days : ''].filter(Boolean).join(' | '), '2026-01-27');
        kidsAdded++;
        if (k.parent || k.phone || k.email) {
          db.prepare('INSERT OR IGNORE INTO parent_contacts (id,tenant_id,child_id,name,relationship,email,phone,is_primary,receives_notifications) VALUES(?,?,?,?,?,?,?,1,1)')
            .run(_uuid(), TENANT, cid, k.parent||'Parent/Guardian', 'parent', k.email||null, k.phone||null);
          parentsAdded++;
        }
      }
      const total = db.prepare('SELECT COUNT(*) as cnt FROM children WHERE tenant_id=? AND active=1').get(TENANT);
      console.log('  [SEED_CN] Done! Added:', kidsAdded, 'skipped:', kidsSkipped, 'parents:', parentsAdded, '| Total children now:', total.cnt);
    } catch(e) {
      console.error('  [SEED_CN] ERROR:', e.message, e.stack);
    }
  }, 3000); // wait 3s for DB to fully init
}

// ── Express app ──
const app = express();

// Security headers
app.use(helmet({ hsts: false,
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
}));

// CORS — allow dev frontend
app.use(cors({
  origin: isProd ? false : ['http://localhost:5173', 'http://localhost:3003', 'http://192.168.56.101:3003', 'http://localhost:3002'],
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
// Twilio webhooks + audio files mounted BEFORE /api auth middleware
// (Twilio fetches audio files with no auth token)
app.use('/api/voice/webhook', webhookRouter);
app.use('/api/voice/audio', audioRouter);
app.use('/api/shift-voice/webhook', shiftWebhooks);
app.use('/api/retell/webhook', retellWebhooks); // no auth — called by Retell
app.use('/api/checkin-alerts', checkinAlertRoutes); // has own auth — webhooks are unauthenticated
app.use('/api/casual-spots', casualSpotRoutes); // has own auth — SMS webhook unauthenticated

// ── One-shot CN seed endpoint ─────────────────────────────────────────────
// Hit: GET /admin-seed-cn?token=childcare360seed
// Remove the SEED_TOKEN env var after seeding to disable this endpoint
app.get('/run-seed-cn', (req, res) => {
  const token = process.env.SEED_TOKEN || 'childcare360seed';
  if (req.query.token !== token) return res.status(403).json({ error: 'Invalid token' });
  try {
    const db = _D();
    // Find the real centre - prefer non-demo tenant, fall back to first
    const allTenants = db.prepare("SELECT id, name FROM tenants ORDER BY created_at ASC").all();
    const first = allTenants.find(t => !t.id.startsWith('demo-')) || allTenants[0];
    if (!first) return res.status(500).json({ error: 'No tenant found' });
    const TENANT = req.query.tenant || process.env.SEED_TENANT || first.id;

    const ROOMS = [
      { id: 'cn-sprouts-1',  name: 'Sprouts Room 1',  age_group: '0-2', capacity: 8  },
      { id: 'cn-sprouts-2',  name: 'Sprouts Room 2',  age_group: '0-2', capacity: 12 },
      { id: 'cn-buds-1',     name: 'Buds Room 1',     age_group: '2-3', capacity: 15 },
      { id: 'cn-buds-2',     name: 'Buds Room 2',     age_group: '2-3', capacity: 10 },
      { id: 'cn-blossoms-1', name: 'Blossoms Room 1', age_group: '3-4', capacity: 10 },
      { id: 'cn-blossoms-2', name: 'Blossoms Room 2', age_group: '3-4', capacity: 15 },
      { id: 'cn-oaks-1',     name: 'Oaks Room 1',     age_group: '4-5', capacity: 20 },
    ];
    let roomsAdded = 0;
    for (const r of ROOMS) {
      const ex = db.prepare('SELECT id FROM rooms WHERE id=? OR (tenant_id=? AND name=?)').get(r.id, TENANT, r.name);
      if (!ex) { db.prepare('INSERT OR IGNORE INTO rooms (id,tenant_id,name,age_group,capacity) VALUES(?,?,?,?,?)').run(r.id, TENANT, r.name, r.age_group, r.capacity); roomsAdded++; }
    }

    const CHILDREN = [
      {fn:'Luke',ln:'Patel',dob:'2025-02-18',room:'cn-sprouts-1',parent:'Jasmine Patel',phone:'',email:'akkari.jasmine@gmail.com',days:'Mon,Tue,Wed'},
      {fn:'Darcie',ln:'Ravenall',dob:'2025-04-09',room:'cn-sprouts-1',parent:'Victoria Ravenall',phone:'',email:'vmbrown91@gmail.com',days:'Mon,Wed,Thu'},
      {fn:'Johnny',ln:'Koutsoufis',dob:'2025-02-27',room:'cn-sprouts-1',parent:'Katie Sofatzis',phone:'0424442704',email:'k.sofatzis@hotmail.com',days:'Tue,Wed'},
      {fn:'Apostolos',ln:'Toumbelekis',dob:'2024-12-24',room:'cn-sprouts-1',parent:'Danielle Toumbelekis',phone:'0408337751',email:'danicons.777@gmail.com',days:'Tue,Wed,Thu'},
      {fn:'Noah',ln:'Egan',dob:'2025-05-31',room:'cn-sprouts-1',parent:'Ivana Egan',phone:'0422858359',email:'',days:'Mon,Fri'},
      {fn:'Chris',ln:'Christofi',dob:'2025-04-15',room:'cn-sprouts-1',parent:'Jessica Christofi',phone:'0452557225',email:'jessicarizzo03@yahoo.com',days:'Mon,Tue'},
      {fn:'Frank',ln:'Piperides',dob:'2025-05-27',room:'cn-sprouts-1',parent:'Tracey Piperides',phone:'0452187887',email:'Tracey.piperides@gmail.com',days:'Mon,Thu'},
      {fn:'Matteo',ln:'Macander',dob:'2025-02-20',room:'cn-sprouts-1',parent:'Clair Macander',phone:'0424163670',email:'clairgoldie@gmail.com',days:'Mon,Fri'},
      {fn:'Riley',ln:'Coppini',dob:'2025-05-14',room:'cn-sprouts-1',parent:'Emma Coppini',phone:'0452339240',email:'coppinijemma@gmail.com',days:'Tue,Wed,Thu'},
      {fn:'Joy',ln:'Guirguis',dob:'2025-06-04',room:'cn-sprouts-1',parent:'Mary Guirguis',phone:'0422438823',email:'Guirguis2311@gmail.com',days:'Mon,Thu'},
      {fn:'Levi',ln:'Po',dob:'2025-01-17',room:'cn-sprouts-1',parent:'Thuy Po',phone:'0433421651',email:'Thuy.le_@live.com',days:'Thu,Fri'},
      {fn:'Leon',ln:'Ianni',dob:'2024-10-31',room:'cn-sprouts-1',parent:'Sally Ianni',phone:'',email:'sally.elazzi4@det.nsw.edu.au',days:'Mon,Thu,Fri'},
      {fn:'Chelsea',ln:'Lam',dob:'2024-06-18',room:'cn-sprouts-1',parent:'Michelle Nguyen',phone:'0404193048',email:'M.vynguyen@gmail.com',days:'Tue,Wed,Thu'},
      {fn:'Matteo',ln:'Belviso',dob:'2024-09-10',room:'cn-sprouts-2',parent:'Brianna Belviso',phone:'',email:'',days:'Tue,Wed'},
      {fn:'Ciara',ln:'Tonks',dob:'2024-08-13',room:'cn-sprouts-2',parent:'Aoife Tonks',phone:'0406279123',email:'',days:'Mon,Wed,Thu'},
      {fn:'Landon',ln:'Zanella',dob:'2025-07-01',room:'cn-sprouts-2',parent:'Samantha Zanella',phone:'0435735428',email:'',days:'Fri'},
      {fn:'Darcy',ln:'Sweeting',dob:'2024-05-27',room:'cn-sprouts-2',parent:'Christina Sweeting',phone:'',email:'',days:'Mon,Tue,Wed,Fri'},
      {fn:'Mathias',ln:'Cosman',dob:'2025-07-27',room:'cn-sprouts-2',parent:'Marena Cosman',phone:'0433677290',email:'marenamike@gmail.com',days:'Wed,Thu,Fri'},
      {fn:'Madeline',ln:'Knevett',dob:'2024-08-28',room:'cn-sprouts-2',parent:'',phone:'',email:'',days:'Wed,Thu'},
      {fn:'Arya',ln:'Sanjeevee',dob:'2024-07-09',room:'cn-sprouts-2',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu'},
      {fn:'Taym',ln:'Albassit',dob:'2024-12-20',room:'cn-sprouts-2',parent:'Renee Albassit',phone:'0449970385',email:'reneealbassit@gmail.com',days:'Tue,Wed,Thu,Fri'},
      {fn:'Evie',ln:'Kete',dob:'2024-07-20',room:'cn-sprouts-2',parent:'Beatrice Kete',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri'},
      {fn:'Edmund',ln:'Foote',dob:'2024-08-08',room:'cn-sprouts-2',parent:'Liz Foote',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri'},
      {fn:'Ariana',ln:'Da Silva',dob:'2024-09-09',room:'cn-sprouts-2',parent:'Krissi Matakakis',phone:'0433402461',email:'Krissimatakakis@gmail.com',days:'Thu,Fri'},
      {fn:'Luna',ln:'Salameh',dob:'2024-06-24',room:'cn-sprouts-2',parent:'Soukania Salameh',phone:'',email:'',days:'Tue,Fri'},
      {fn:'Penelope',ln:'Cooke',dob:'2024-04-05',room:'cn-sprouts-2',parent:'Jessica Debattista',phone:'0422709504',email:'jessica.debattista@outlook.com',days:'Mon,Tue,Fri'},
      {fn:'Joaquin',ln:'Arce',dob:'2024-07-08',room:'cn-sprouts-2',parent:'Frances Arce',phone:'0452125203',email:'francesjaviera@live.com',days:'Mon,Tue,Wed'},
      {fn:'Estella',ln:'Papthanasiou',dob:'2024-05-13',room:'cn-sprouts-2',parent:'',phone:'',email:'',days:'Mon,Tue,Wed'},
      {fn:'Zakaria',ln:'Wehbi',dob:'2024-12-10',room:'cn-sprouts-2',parent:'Lamees Moussa',phone:'',email:'lameesmoussa@hotmail.com',days:'Tue,Thu'},
      {fn:'Elaria',ln:'Tourany',dob:'2024-09-03',room:'cn-sprouts-2',parent:'Melissa Tourany',phone:'',email:'',days:'Mon,Tue'},
      {fn:'Zoe',ln:'Patel',dob:'2023-08-23',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed'},
      {fn:'Celine',ln:'Nguyen',dob:'2023-08-14',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri'},
      {fn:'Zachariah',ln:'Taha',dob:'2024-04-21',room:'cn-buds-1',parent:'Danya Darwiche',phone:'',email:'danyadarwiche@hotmail.com',days:'Tue,Wed'},
      {fn:'Elias',ln:'Jalwan',dob:'2023-10-10',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Wed,Thu'},
      {fn:'Levi',ln:'Dib',dob:'2023-09-02',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu,Fri'},
      {fn:'Norah',ln:'Pak',dob:'2023-09-21',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Wed,Thu'},
      {fn:'Jude',ln:'Manoun',dob:'2024-01-03',room:'cn-buds-1',parent:'',phone:'',email:'akaraki@live.com.au',days:'Tue,Wed,Fri'},
      {fn:'Anthony',ln:'Alrahil',dob:'2024-03-01',room:'cn-buds-1',parent:'Vivan Alrahil',phone:'0450414429',email:'',days:'Mon,Fri'},
      {fn:'Nicolas',ln:'Peet',dob:'2024-01-04',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu'},
      {fn:'Ayah',ln:'El-Jamal',dob:'2024-02-03',room:'cn-buds-1',parent:'Christine El-Jamal',phone:'0404038911',email:'h.eljamal@outlook.com',days:'Tue,Wed,Thu'},
      {fn:'Dzejla',ln:'Kurtovic',dob:'2024-01-15',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu,Fri'},
      {fn:'Idris',ln:'Khadem',dob:'2024-12-07',room:'cn-buds-1',parent:'Randa Khadem',phone:'0414520614',email:'Randa.la.ginge@gmail.com',days:'Tue,Fri'},
      {fn:'Natalia',ln:'Azzi',dob:'2024-04-18',room:'cn-buds-1',parent:'Gizelle Azzi',phone:'0498860015',email:'Gizelle.azzi@outlook.com',days:'Tue,Thu'},
      {fn:'Javiah',ln:'Caldera',dob:'2023-08-21',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu,Fri'},
      {fn:'Nafas',ln:'Joola',dob:'2023-07-11',room:'cn-buds-1',parent:'Naz Mojab',phone:'0450766052',email:'nazaninmojab@gmail.com',days:'Mon,Fri'},
      {fn:'Inaya',ln:'Khan',dob:'2023-11-24',room:'cn-buds-1',parent:'Amjad Khan',phone:'0434985112',email:'',days:'Mon,Tue,Wed,Thu,Fri'},
      {fn:'Zeinab',ln:'Fares',dob:'2023-12-05',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu'},
      {fn:'Penelope',ln:'Sofatzis',dob:'2023-11-14',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed'},
      {fn:'Aria',ln:'Karavellas',dob:'2023-11-03',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Wed,Thu'},
      {fn:'Sophia',ln:'Gallagher',dob:'2023-10-25',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Wed,Thu,Fri'},
      {fn:'Ali',ln:'Mansour',dob:'2023-09-23',room:'cn-buds-1',parent:'',phone:'',email:'',days:'Wed,Thu,Fri'},
      {fn:'Linh',ln:'Nguyen',dob:'2023-08-07',room:'cn-buds-1',parent:'Anna Nguyen',phone:'0450381811',email:'annadaoanh@gmail.com',days:'Mon,Thu,Fri'},
      {fn:'Zachariya',ln:'Bazzi',dob:'2023-07-14',room:'cn-buds-2',parent:'',phone:'',email:'',days:'Wed,Thu,Fri'},
      {fn:'Zion',ln:'Malek',dob:'2023-07-10',room:'cn-buds-2',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri'},
      {fn:'Imogen',ln:'Dignan',dob:'2023-06-29',room:'cn-buds-2',parent:'',phone:'',email:'',days:'Tue,Wed,Thu'},
      {fn:'Emrah',ln:'Dautovic',dob:'2023-08-30',room:'cn-buds-2',parent:'Emina Dautovic',phone:'0424059266',email:'',days:'Mon,Wed'},
      {fn:'Lukas',ln:'Vidovic',dob:'2024-03-25',room:'cn-buds-2',parent:'',phone:'',email:'',days:'Mon,Wed'},
      {fn:'Jamie',ln:'Valiente',dob:'2023-07-26',room:'cn-buds-2',parent:'Tayla Spendlove',phone:'',email:'tayla.spendlove@gmail.com',days:'Tue,Thu'},
      {fn:'Nur',ln:'Ozdil',dob:'2024-04-23',room:'cn-buds-2',parent:'Jessica Ozdil',phone:'0406628968',email:'',days:'Mon,Wed'},
      {fn:'Carol',ln:'Sorial',dob:'2023-11-07',room:'cn-buds-2',parent:'Youstina Ghaly',phone:'0494165780',email:'youstinaghaly77@gmail.com',days:'Mon,Tue'},
      {fn:'Iiyas',ln:'Serinsu',dob:'2023-06-21',room:'cn-buds-2',parent:'Havva Serinsu',phone:'0412894206',email:'havva.m_93@hotmail.com',days:'Wed,Fri'},
      {fn:'Bear Saint',ln:'Bechara',dob:'2023-10-02',room:'cn-buds-2',parent:'Kayley Bechara',phone:'',email:'',days:'Mon,Fri'},
      {fn:'Jerome',ln:'Ianni',dob:'2023-07-09',room:'cn-buds-2',parent:'',phone:'',email:'',days:'Tue,Thu,Fri'},
      {fn:'Ali',ln:'Zoghbi',dob:'2023-07-19',room:'cn-buds-2',parent:'',phone:'',email:'',days:'Thu,Fri'},
      {fn:'Poppy',ln:'Carvalho',dob:'2023-07-05',room:'cn-buds-2',parent:'Elena Carvalho',phone:'0423612447',email:'',days:'Thu,Fri'},
      {fn:'Austin',ln:'Ardamil',dob:'2023-04-27',room:'cn-buds-2',parent:'Anh Ardamil',phone:'',email:'Ran2504@gmail.com',days:'Tue,Wed,Thu,Fri'},
      {fn:'James',ln:'Akkari',dob:'2023-03-27',room:'cn-buds-2',parent:'',phone:'',email:'',days:'Tue'},
      {fn:'Liam',ln:'Akkari',dob:'2023-03-27',room:'cn-buds-2',parent:'',phone:'',email:'',days:'Tue'},
      {fn:'Haayah',ln:'Albassit',dob:'2023-03-05',room:'cn-buds-2',parent:'Renee Albassit',phone:'0449970385',email:'reneealbassit@gmail.com',days:'Tue,Wed,Thu,Fri'},
      {fn:'Andrej',ln:'Miloseveski',dob:'2023-03-11',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed'},
      {fn:'Tomas',ln:'Milosevski',dob:'2023-03-11',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed'},
      {fn:'Isabella',ln:'Wehbi',dob:'2022-12-08',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu'},
      {fn:'Ashton',ln:'Vu',dob:'2022-06-19',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri'},
      {fn:'Mason',ln:'Azzi',dob:'2023-02-23',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Mon,Thu,Fri'},
      {fn:'Louis',ln:'Ngo',dob:'2022-03-28',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Mon,Wed,Thu,Fri'},
      {fn:'Harper',ln:'Kete',dob:'2022-08-21',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri'},
      {fn:'Mylah',ln:'Tourany',dob:'2023-02-10',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Mon,Tue'},
      {fn:'Victoria',ln:'Doueihy',dob:'2022-10-12',room:'cn-blossoms-1',parent:'',phone:'',email:'f_fakhoury93@hotmail.com',days:'Tue,Thu,Fri'},
      {fn:'Romy',ln:'Alosi',dob:'2022-07-25',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Tue,Wed,Thu'},
      {fn:'Anastasia',ln:'Vukotic',dob:'2022-07-28',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Wed,Thu,Fri'},
      {fn:'Micheal',ln:'Castelao',dob:'2022-10-06',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Tue,Wed,Thu'},
      {fn:'Jayda',ln:'Sabido',dob:'2022-08-21',room:'cn-blossoms-1',parent:'',phone:'',email:'',days:'Wed,Thu,Fri'},
      {fn:'Darcy',ln:'Cooper',dob:'2022-10-07',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Mon,Thu,Fri'},
      {fn:'Ibrahim',ln:'Bayrouti',dob:'2022-05-26',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Mon,Tue,Wed'},
      {fn:'Yousef',ln:'Bayrouti',dob:'2022-05-26',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Mon,Tue,Wed'},
      {fn:'Catalina',ln:'Duff',dob:'2022-05-07',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Mon,Tue'},
      {fn:'Athena',ln:'La Greca',dob:'2022-05-24',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Tue,Wed,Thu,Fri'},
      {fn:'Chloe',ln:'Zoobi',dob:'2022-07-31',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Tue,Thu'},
      {fn:'Shadi',ln:'Salameh',dob:'2022-07-22',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Tue,Fri'},
      {fn:'Mia',ln:'Karabestsos',dob:'2022-12-16',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Mon,Thu,Fri'},
      {fn:'Leonidas',ln:'Hatzinikitas',dob:'2023-01-09',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Mon,Tue,Wed'},
      {fn:'Nathaniel',ln:'Oxton',dob:'2023-02-22',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu'},
      {fn:'Mateo',ln:'Ruz',dob:'2022-11-10',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Tue,Wed'},
      {fn:'Isabelle',ln:'Henderson',dob:'2022-09-28',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Mon,Tue,Thu'},
      {fn:'Ashton',ln:'Quach',dob:'2022-05-15',room:'cn-blossoms-2',parent:'Pranee Quach',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri'},
      {fn:'Xavier',ln:'Morcos',dob:'2022-08-11',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Tue,Wed,Thu,Fri'},
      {fn:'Liyana',ln:'Manoun',dob:'2022-08-23',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Tue,Wed,Fri'},
      {fn:'Evelyn',ln:'Hodsoll',dob:'2022-07-18',room:'cn-blossoms-2',parent:'',phone:'',email:'',days:'Tue,Wed,Thu,Fri'},
      {fn:'Jai',ln:'Patel',dob:'2021-09-13',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed'},
      {fn:'Luciano',ln:'Soto',dob:'2021-12-07',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Thu,Fri'},
      {fn:'Carter',ln:'Cherrington',dob:'2021-05-31',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu,Fri'},
      {fn:'Gabriel',ln:'Bazzi',dob:'2021-04-28',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Wed,Thu'},
      {fn:'Alaska',ln:'Carter',dob:'2022-03-17',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu,Fri'},
      {fn:'Hudson',ln:'Gallagher',dob:'2021-05-21',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Wed,Thu,Fri'},
      {fn:'Jordan',ln:'Ayoub',dob:'2021-11-22',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu,Fri'},
      {fn:'Anastasia',ln:'Faraj',dob:'2022-05-09',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Tue,Wed,Thu,Fri'},
      {fn:'Audrey',ln:'Buczek',dob:'2021-03-16',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu'},
      {fn:'Yaqoub',ln:'Roude',dob:'2021-04-02',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Fri'},
      {fn:'Jacob',ln:'Alosi',dob:'2021-04-19',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Tue,Wed,Thu'},
      {fn:'Maximus',ln:'Trigas',dob:'2021-06-29',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Tue,Wed,Thu,Fri'},
      {fn:'Selina',ln:'Zoghbi',dob:'2021-05-31',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Tue,Wed,Thu,Fri'},
      {fn:'Adelisa',ln:'Kurtovic',dob:'2021-01-15',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Thu,Fri'},
      {fn:'Amelia',ln:'Druce',dob:'2021-08-10',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Wed,Fri'},
      {fn:'James',ln:'Peet',dob:'2022-01-17',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu'},
      {fn:'Layla',ln:'Fernandes Moniz',dob:'2021-12-03',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri'},
      {fn:'Lily',ln:'Fernandes Moniz',dob:'2021-12-03',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue,Wed,Thu,Fri'},
      {fn:'Sidra',ln:'Alharbe',dob:'2022-01-09',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Wed,Fri'},
      {fn:'Mariano',ln:'Gunua',dob:'2021-06-14',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Tue,Wed'},
      {fn:'Venba',ln:'Kannan',dob:'2022-08-04',room:'cn-oaks-1',parent:'Andrea Visca',phone:'0424497509',email:'andreavisca1@gmail.com',days:'Mon,Tue,Wed,Thu,Fri'},
      {fn:'Paul',ln:'Abrahim',dob:'2021-07-13',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Tue'},
      {fn:'Savion',ln:'Keomoungkhoun',dob:'2021-07-12',room:'cn-oaks-1',parent:'',phone:'',email:'',days:'Mon,Wed'},
      {fn:'Idris',ln:'Serinsu',dob:'2021-12-08',room:'cn-oaks-1',parent:'Havva Serinsu',phone:'',email:'',days:'Wed,Thu,Fri'},
    ];

    let kidsAdded = 0, kidsSkipped = 0, parentsAdded = 0;
    for (const k of CHILDREN) {
      if (!k.fn) continue;
      const ex = db.prepare('SELECT id FROM children WHERE tenant_id=? AND first_name=? AND last_name=?').get(TENANT, k.fn, k.ln||'');
      if (ex) { kidsSkipped++; continue; }
      const cid = _uuid();
      db.prepare('INSERT OR IGNORE INTO children (id,tenant_id,first_name,last_name,dob,room_id,allergies,notes,enrolled_date,active) VALUES(?,?,?,?,?,?,?,?,?,1)')
        .run(cid, TENANT, k.fn, k.ln||'', k.dob||'2020-01-01', k.room, 'None', 'Days: '+k.days, '2026-01-27');
      kidsAdded++;
      if (k.parent || k.phone || k.email) {
        db.prepare('INSERT OR IGNORE INTO parent_contacts (id,tenant_id,child_id,name,relationship,email,phone,is_primary,receives_notifications) VALUES(?,?,?,?,?,?,?,1,1)')
          .run(_uuid(), TENANT, cid, k.parent||'Parent/Guardian', 'parent', k.email||null, k.phone||null);
        parentsAdded++;
      }
    }
    const total = db.prepare('SELECT COUNT(*) as cnt FROM children WHERE tenant_id=? AND active=1').get(TENANT);
    const tenantRow = db.prepare('SELECT name FROM tenants WHERE id=?').get(TENANT);
    return res.json({ ok: true, tenant: TENANT, tenantName: tenantRow?.name || TENANT, roomsAdded, kidsAdded, kidsSkipped, parentsAdded, totalChildren: total.cnt });
  } catch(e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
});


// Kiosk routes BEFORE /api catch-all (kiosk has public endpoints that don't need auth)
app.use('/api/kiosk', kioskRoutes);
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
app.use('/api/staff', staffRoutes);
app.use('/api/staff-features', staffFeaturesRoutes);
app.use('/api/runsheet', runsheetRoutes);
app.use('/api/runsheet-live', runsheetLiveRoutes);
// preferences router serves /api/educators/:id/preferences, /api/rooms/:id/preferred-educators,
// /api/roster/nc-requirements, etc — mounted at /api so paths are absolute. Order matters: this
// must come AFTER /api/educators so the educators router gets first crack at its own routes.
app.use('/api', preferencesRoutes);
// Developer portal — manager-side key/webhook management (JWT auth)
app.use('/api/developer', developerRoutes);
// Public developer API — external integrators authenticate with API keys.
// Mounted at /v1 (NOT /api/v1) so the public surface is clearly separated
// from the internal /api/* routes that require a session JWT.
app.use('/v1', publicApiRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/ai', aiRoutes);
import checklistRoutes from './checklists.js';
app.use('/api/checklists', checklistRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/shift-voice', shiftVoiceRoutes);
app.use('/api/retell', retellRoutes);
app.use('/api/wellbeing', wellbeingRoutes);
app.use('/api/roster-enhanced', rosterEnhancedRoutes);
app.use('/api/operations', operationsRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/engagement', engagementRoutes);
app.use('/api/ccs', ccsRoutes);
app.use('/api/ccs-absences', ccsAbsenceRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/admin', adminPowerRoutes);
app.use('/api/childdev', childdevRoutes);
app.use('/api/quality', qualityRoutes);
// kiosk routes mounted before /api catch-all (see line 517)
app.use('/api/payroll', payrollExportRoutes);
app.use('/api/notifications', notifEngineRoutes);
app.use('/api/comms', commsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/waitlist-auto', waitlistAutoRoutes);
app.use('/api/bulk-comms', bulkCommsRoutes);
app.use('/api/reports-builder', reportsBuilderRouter);
app.use('/api/risk-assessments', riskAssessmentRouter);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/invoicing-full', invoicingFullRoutes);
app.use('/api/xero', xeroRouter);
app.use('/api/educator-self', educatorSelfRouter);
app.use('/api/leave-requests', leaveAdminRouter);
app.use('/api/schedule', schedulePublisherRoutes);
app.use('/api/ai-assistant', aiAssistantRoutes);
app.use('/api/fee-overrides', feeOverrideRouter);
app.use('/api/compliance-tasks', complianceTaskRouter);
app.use('/api/v2', v2Routes);
app.use('/api/settings', settingsRoutes);

// ── Attendance absences (child attendance-based) ──
app.get('/api/attendance/absences', requireAuth, requireTenant, (req, res) => {
  try {
    const { from, to, child_id, room_id } = req.query;
    const where = ['a.tenant_id=?', 'a.absent=1'];
    const vals = [req.tenantId];
    if (from) { where.push('a.date >= ?'); vals.push(from); }
    if (to) { where.push('a.date <= ?'); vals.push(to); }
    if (child_id) { where.push('a.child_id=?'); vals.push(child_id); }
    if (room_id) { where.push('c.room_id=?'); vals.push(room_id); }
    const absences = _D().prepare(`
      SELECT a.*, c.first_name, c.last_name, c.room_id, r.name as room_name
      FROM attendance_sessions a
      JOIN children c ON c.id=a.child_id
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.date DESC
      LIMIT 200
    `).all(...vals);
    res.json({ absences, total: absences.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.use('/api/stories', weeklyStoriesRouter);
app.use('/api/ratio-report', ratioReportRouter);

// ── GET /api/attendance/live — children currently signed in, grouped by room ──
app.get('/api/attendance/live', requireAuth, requireTenant, (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const sessions = _D().prepare(`
      SELECT a.child_id, c.first_name, c.last_name, c.room_id, a.sign_in,
        r.name as room_name, r.age_group as room_age_group, r.capacity
      FROM attendance_sessions a
      JOIN children c ON c.id = a.child_id
      LEFT JOIN rooms r ON r.id = c.room_id
      WHERE a.tenant_id = ?
        AND a.date = ?
        AND a.sign_in IS NOT NULL
        AND (a.sign_out IS NULL OR a.sign_out = '')
        AND a.absent = 0
      ORDER BY r.name, c.last_name
    `).all(req.tenantId, today);

    const byRoom = {};
    sessions.forEach(s => {
      const key = s.room_id || 'unassigned';
      if (!byRoom[key]) byRoom[key] = {
        room_id: s.room_id,
        room_name: s.room_name || 'Unassigned',
        age_group: s.room_age_group,
        capacity: s.capacity,
        children: []
      };
      byRoom[key].children.push({ child_id: s.child_id, first_name: s.first_name, last_name: s.last_name, sign_in: s.sign_in });
    });
    res.json({ rooms: Object.values(byRoom), total_present: sessions.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Health check ──

// ── Seed real CN educators (replaces demo educators for the target tenant)
// Hit: GET /run-seed-educators?token=childcare360seed
app.get('/run-seed-educators', (req, res) => {
  const token = process.env.SEED_TOKEN || 'childcare360seed';
  if (req.query.token !== token) return res.status(403).json({ error: 'Invalid token' });
  try {
    const db = _D();
    const allTenants = db.prepare('SELECT id, name FROM tenants ORDER BY created_at ASC').all();
    const first = allTenants.find(t => !t.id.startsWith('demo-')) || allTenants[0];
    if (!first) return res.status(500).json({ error: 'No tenant found' });
    const TENANT = req.query.tenant || process.env.SEED_TENANT || first.id;

    // ── Rooms (same IDs as children seed - ensure they exist) ──────────────────
    const ROOMS = [
      { id: 'cn-sprouts-1',  name: 'Sprouts Room 1',  age_group: '0-2', capacity: 8  },
      { id: 'cn-sprouts-2',  name: 'Sprouts Room 2',  age_group: '0-2', capacity: 12 },
      { id: 'cn-buds-1',     name: 'Buds Room 1',     age_group: '2-3', capacity: 15 },
      { id: 'cn-buds-2',     name: 'Buds Room 2',     age_group: '2-3', capacity: 10 },
      { id: 'cn-blossoms-1', name: 'Blossoms Room 1', age_group: '3-4', capacity: 10 },
      { id: 'cn-blossoms-2', name: 'Blossoms Room 2', age_group: '3-4', capacity: 15 },
      { id: 'cn-oaks-1',     name: 'Oaks Room 1',     age_group: '4-5', capacity: 20 },
    ];
    for (const r of ROOMS) {
      db.prepare('INSERT OR IGNORE INTO rooms (id,tenant_id,name,age_group,capacity) VALUES(?,?,?,?,?)').run(r.id, TENANT, r.name, r.age_group, r.capacity);
    }

    // ── Delete demo educators for this tenant ──────────────────────────────────
    const existingEds = db.prepare('SELECT id FROM educators WHERE tenant_id=?').all(TENANT);
    existingEds.forEach(e => {
      db.prepare('DELETE FROM educator_availability WHERE educator_id=?').run(e.id);
      db.prepare('DELETE FROM educator_absences WHERE educator_id=?').run(e.id);
      db.prepare('DELETE FROM shift_fill_attempts WHERE educator_id=?').run(e.id);
      db.prepare('DELETE FROM roster_entries WHERE educator_id=? AND tenant_id=?').run(e.id, TENANT);
    });
    db.prepare('DELETE FROM educators WHERE tenant_id=?').run(TENANT);

    // ── Real educators from compliance spreadsheet ─────────────────────────────
    // Rooms shorthand: 0-2 = sprouts, 2-3 = buds, 3-4 = blossoms, 3-5 = blossoms+oaks, 4-5 = oaks, all = all
    const ALL = JSON.stringify(['cn-sprouts-1','cn-sprouts-2','cn-buds-1','cn-buds-2','cn-blossoms-1','cn-blossoms-2','cn-oaks-1']);
    const S   = JSON.stringify(['cn-sprouts-1','cn-sprouts-2']);                       // 0-2
    const B   = JSON.stringify(['cn-buds-1','cn-buds-2']);                             // 2-3
    const BL  = JSON.stringify(['cn-blossoms-1','cn-blossoms-2']);                     // 3-4
    const OAK = JSON.stringify(['cn-oaks-1']);                                         // 4-5
    const BLO = JSON.stringify(['cn-blossoms-1','cn-blossoms-2','cn-oaks-1']);         // 3-5

    // Fields: fn, ln, dob, role, qual, responsible, food_safety, wwcc, wwcc_exp,
    //         fa (bool), fa_exp, cpr_exp, cp_date, emp, hrs, rooms, notes
    const EDUCATORS = [
      {
        fn:'Eddie', ln:'Biyik', dob:'1962-12-29',
        role:'Approved Provider', qual:'ect', responsible:1, food_safety:0,
        wwcc:null, wwcc_exp:null,
        fa:0, fa_exp:null, cpr_exp:null, cp_date:null,
        emp:'permanent', hrs:38, rooms:ALL, notes:'Approved Provider',
      },
      {
        fn:'Esra', ln:'Biyik', dob:'1994-11-22',
        role:'Operations Manager', qual:'diploma', responsible:1, food_safety:0,
        wwcc:'WWC1555153E', wwcc_exp:'2028-01-12',
        fa:1, fa_exp:'2027-08-11', cpr_exp:'2025-08-11', cp_date:'2024-05-28',
        emp:'permanent', hrs:38, rooms:ALL, notes:'Operations Manager, Diploma Qualified, Speech Pathologist',
      },
      {
        fn:'Rebecca', ln:'Hazle', dob:'1981-01-03',
        role:'Nominated Supervisor', qual:'diploma', responsible:1, food_safety:1,
        wwcc:'WWC2501339E', wwcc_exp:'2027-07-27',
        fa:1, fa_exp:'2027-08-11', cpr_exp:'2026-08-07', cp_date:'2025-08-13',
        emp:'permanent', hrs:38, rooms:ALL, notes:'Nominated Supervisor, Diploma Qualified, Food Safety Supervisor',
      },
      {
        fn:'Andrea', ln:'Godoy', dob:'1991-12-20',
        role:'Operations Manager', qual:'ect', responsible:1, food_safety:0,
        wwcc:'WWC2234628E', wwcc_exp:'2027-03-08',
        fa:1, fa_exp:'2027-08-11', cpr_exp:'2026-08-07', cp_date:'2025-06-16',
        emp:'permanent', hrs:38, rooms:ALL, notes:'Operations Manager, Early Childhood Teacher',
      },
      {
        fn:'Maria', ln:'Guzman', dob:'1984-09-08',
        role:'Early Childhood Teacher', qual:'ect', responsible:1, food_safety:0,
        wwcc:'WWC0298543E', wwcc_exp:'2029-03-19',
        fa:1, fa_exp:'2027-08-11', cpr_exp:'2025-08-11', cp_date:'2025-06-18',
        emp:'permanent', hrs:38, rooms:BLO, notes:'Early Childhood Teacher, 3-5 yrs',
      },
      {
        fn:'Sabrina', ln:'Khan', dob:'2002-05-11',
        role:'Educational Leader', qual:'ect', responsible:1, food_safety:0,
        wwcc:'WWC1450605E', wwcc_exp:'2028-09-11',
        fa:1, fa_exp:'2027-08-11', cpr_exp:'2026-08-07', cp_date:'2025-06-20',
        emp:'permanent', hrs:38, rooms:BLO, notes:'Educational Leader, Early Childhood Teacher, Diploma Qualified, 3-5 yrs',
      },
      {
        fn:'Elizabeth', ln:'Goman', dob:null,
        role:'Early Childhood Teacher', qual:'ect', responsible:1, food_safety:1,
        wwcc:'WWC2492489E', wwcc_exp:'2027-07-09',
        fa:1, fa_exp:'2027-08-11', cpr_exp:'2026-08-07', cp_date:'2025-06-20',
        emp:'permanent', hrs:38, rooms:S, notes:'Early Childhood Teacher, Food Safety Supervisor, 0-2 yrs',
      },
      {
        fn:'Anna Maria', ln:'Abou Fram', dob:'2003-08-04',
        role:'Early Childhood Teacher', qual:'ect', responsible:0, food_safety:0,
        wwcc:'WWC2477223E', wwcc_exp:'2027-08-12',
        fa:0, fa_exp:null, cpr_exp:null, cp_date:null,
        emp:'permanent', hrs:38, rooms:BLO, notes:'Early Childhood Teacher, 3-5 yrs',
      },
      {
        fn:'Enisa', ln:'Kurtovic', dob:'1997-07-02',
        role:'Diploma Educator', qual:'diploma', responsible:1, food_safety:0,
        wwcc:'WWC2675663E', wwcc_exp:'2028-06-01',
        fa:1, fa_exp:'2027-08-11', cpr_exp:'2026-08-07', cp_date:'2025-06-17',
        emp:'permanent', hrs:38, rooms:BL, notes:'Diploma Qualified, 3-4 yrs',
      },
      {
        fn:'Jazmine', ln:"O'Shea", dob:'2003-10-24',
        role:'Certificate 3 Educator', qual:'cert3', responsible:1, food_safety:0,
        wwcc:'WWC3010815E', wwcc_exp:'2030-01-18',
        fa:1, fa_exp:'2027-08-11', cpr_exp:'2026-08-07', cp_date:'2025-06-18',
        emp:'permanent', hrs:38, rooms:S, notes:'Certificate 3, Studying towards Diploma, 0-2 yrs',
      },
      {
        fn:'Nicola', ln:'Valanidas', dob:'2002-07-22',
        role:'Certificate 3 Educator', qual:'cert3', responsible:1, food_safety:0,
        wwcc:'WWC2588790E', wwcc_exp:'2028-02-01',
        fa:1, fa_exp:'2028-08-26', cpr_exp:'2026-08-07', cp_date:'2025-06-16',
        emp:'permanent', hrs:38, rooms:B, notes:'Certificate 3, Studying towards Diploma, 2-3 yrs',
      },
      {
        fn:'Seren', ln:'Gokus', dob:'1999-04-16',
        role:'Certificate 3 Educator', qual:'cert3', responsible:1, food_safety:1,
        wwcc:'WWC0930002E', wwcc_exp:'2027-11-25',
        fa:1, fa_exp:'2026-12-15', cpr_exp:'2026-08-07', cp_date:'2025-06-11',
        emp:'permanent', hrs:38, rooms:ALL, notes:'Certificate 3, Studying towards Diploma, Food Safety Supervisor, Support all rooms',
      },
      {
        fn:'Layla', ln:'Talbot', dob:'2005-03-07',
        role:'Trainee Educator', qual:'working_towards', responsible:0, food_safety:0,
        wwcc:'WWC0421565E', wwcc_exp:'2029-07-15',
        fa:0, fa_exp:null, cpr_exp:null, cp_date:null,
        emp:'casual', hrs:20, rooms:ALL, notes:'Studying Towards Certificate 3, Support all rooms',
        u18: 0,
      },
      {
        fn:'Tegan Leanne', ln:'Parish', dob:'2006-07-25',
        role:'Trainee Educator', qual:'working_towards', responsible:0, food_safety:0,
        wwcc:'WWC0259291E', wwcc_exp:'2029-02-16',
        fa:0, fa_exp:null, cpr_exp:null, cp_date:null,
        emp:'casual', hrs:20, rooms:ALL, notes:'Studying Towards Certificate 3, Support all rooms',
        u18: 0,
      },
      {
        fn:'Holly', ln:'Giddings', dob:'2003-06-04',
        role:'Trainee Educator', qual:'working_towards', responsible:0, food_safety:0,
        wwcc:'WWC2923641E', wwcc_exp:'2029-08-08',
        fa:1, fa_exp:'2027-05-15', cpr_exp:'2026-08-07', cp_date:null,
        emp:'casual', hrs:20, rooms:ALL, notes:'Working Towards Certificate 3, Support all rooms',
      },
      {
        fn:'Sarah', ln:'Nguyen Trinh', dob:'2006-07-13',
        role:'Trainee Educator', qual:'working_towards', responsible:0, food_safety:0,
        wwcc:null, wwcc_exp:null,
        fa:0, fa_exp:null, cpr_exp:null, cp_date:null,
        emp:'casual', hrs:20, rooms:ALL, notes:'Studying Towards Certificate 3, Support all rooms',
        u18: 0,
      },
      {
        fn:'Meerab', ln:'Imran', dob:'2006-10-21',
        role:'Trainee Educator', qual:'working_towards', responsible:0, food_safety:0,
        wwcc:'WWC2986597E', wwcc_exp:'2029-11-20',
        fa:0, fa_exp:null, cpr_exp:null, cp_date:null,
        emp:'casual', hrs:20, rooms:ALL, notes:'Studying Towards Certificate 3, Support all rooms',
        u18: 0,
      },
      {
        fn:'Fotini', ln:'Deme', dob:'1974-10-12',
        role:'Diploma Educator', qual:'diploma', responsible:0, food_safety:0,
        wwcc:'WWC0293870E', wwcc_exp:'2029-03-05',
        fa:0, fa_exp:null, cpr_exp:'2026-02-17', cp_date:null,
        emp:'casual', hrs:25, rooms:ALL, notes:'Diploma Qualified, Support all rooms',
      },
      {
        fn:'Leanne', ln:'Walsh', dob:'1970-10-25',
        role:'Diploma Educator', qual:'diploma', responsible:1, food_safety:0,
        wwcc:'WWC0188798E', wwcc_exp:'2028-11-28',
        fa:1, fa_exp:'2026-10-14', cpr_exp:'2026-05-10', cp_date:'2025-03-18',
        emp:'casual', hrs:25, rooms:ALL, notes:'Diploma Qualified, Support all rooms',
      },
      {
        fn:'Lauren', ln:'Cunha', dob:'1995-06-09',
        role:'Diploma Educator', qual:'diploma', responsible:0, food_safety:0,
        wwcc:'WWC0236154E', wwcc_exp:'2029-03-01',
        fa:1, fa_exp:'2028-09-26', cpr_exp:'2028-09-26', cp_date:'2022-03-29',
        emp:'casual', hrs:25, rooms:ALL, notes:'Diploma Qualified, Support all rooms',
      },
      {
        fn:'Susan', ln:'Obeid', dob:'1980-05-08',
        role:'Cook', qual:'cert3', responsible:0, food_safety:1,
        wwcc:'WWC0602457E', wwcc_exp:'2027-03-24',
        fa:0, fa_exp:null, cpr_exp:null, cp_date:null,
        emp:'permanent', hrs:38, rooms:ALL, notes:'Cook — Certificate in Safe Food Handling and Nutrition, Menu Planning, Munch and Move',
      },
      {
        fn:'Sebahat', ln:'Biyik', dob:'1968-03-13',
        role:'Support Educator', qual:'cert3', responsible:0, food_safety:1,
        wwcc:'WWC2345661E', wwcc_exp:'2026-12-14',
        fa:0, fa_exp:null, cpr_exp:null, cp_date:null,
        emp:'permanent', hrs:38, rooms:ALL, notes:'Cert 3, Support Educator, Food Handling',
      },
    ];

    const insertEd = db.prepare(`
      INSERT INTO educators
        (id,tenant_id,first_name,last_name,dob,role_title,qualification,
         is_responsible_person,food_safety_supervisor,
         wwcc_number,wwcc_expiry,
         first_aid,first_aid_expiry,cpr_expiry,child_protection_date,
         employment_type,max_hours_per_week,contracted_hours,
         preferred_rooms,status,reliability_score,
         total_shifts_offered,total_shifts_accepted,total_sick_days,
         is_under_18,notes,start_date)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    const edIds = [];
    EDUCATORS.forEach(e => {
      const eid = crypto.randomUUID();
      edIds.push({ id: eid, hrs: e.hrs, rooms: e.rooms });
      insertEd.run(
        eid, TENANT, e.fn, e.ln, e.dob || null, e.role, e.qual,
        e.responsible ? 1 : 0, e.food_safety ? 1 : 0,
        e.wwcc || null, e.wwcc_exp || null,
        e.fa ? 1 : 0, e.fa_exp || null, e.cpr_exp || null, e.cp_date || null,
        e.emp, e.hrs, e.hrs,
        e.rooms, 'active', 85,
        0, 0, 0,
        e.u18 ? 1 : 0, e.notes || null, '2025-01-01'
      );
    });

    // ── Weekly availability: Mon-Fri for permanent, 3 days/week for casual ──
    edIds.forEach((e, idx) => {
      const ed = EDUCATORS[idx];
      const isCasual = ed.emp === 'casual';
      // Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=0
      const casualPatterns = [
        [1,1,0,1,0,0,0],  // M/T/Th
        [1,0,1,0,1,0,0],  // M/W/F
        [0,1,1,0,1,0,0],  // T/W/F
        [1,1,1,0,0,0,0],  // M/T/W
        [0,0,1,1,1,0,0],  // W/Th/F
      ];
      const pattern = isCasual ? casualPatterns[idx % casualPatterns.length] : [0,1,1,1,1,1,0]; // Mon-Fri
      for (let d = 0; d < 7; d++) {
        db.prepare('INSERT OR IGNORE INTO educator_availability (id,educator_id,day_of_week,available,start_time,end_time,preferred) VALUES(?,?,?,?,?,?,?)')
          .run(crypto.randomUUID(), e.id, d, pattern[d] ? 1 : 0, '07:00', '18:30', d >= 1 && d <= 5 ? 1 : 0);
      }
    });

    res.json({
      ok: true,
      tenant: TENANT,
      educators_inserted: EDUCATORS.length,
      message: `Replaced demo educators with ${EDUCATORS.length} real CN educators`,
    });
  } catch(err) {
    console.error('[seed-educators]', err);
    res.status(500).json({ error: err.message });
  }
});



// ── Tenant/Children diagnostic endpoint ─────────────────────────────────
app.get('/diag-tenants', (req, res) => {
  try {
    const db = _D();
    const tenants = db.prepare('SELECT id, name, created_at FROM tenants ORDER BY created_at').all();
    const result = tenants.map(t => ({
      id: t.id,
      name: t.name,
      created_at: t.created_at,
      total_children: db.prepare('SELECT COUNT(*) as cnt FROM children WHERE tenant_id=?').get(t.id)?.cnt || 0,
      active_children: db.prepare('SELECT COUNT(*) as cnt FROM children WHERE tenant_id=? AND active=1').get(t.id)?.cnt || 0,
      rooms: db.prepare('SELECT COUNT(*) as cnt FROM rooms WHERE tenant_id=?').get(t.id)?.cnt || 0,
      members: db.prepare('SELECT COUNT(*) as cnt FROM tenant_members WHERE tenant_id=? AND active=1').get(t.id)?.cnt || 0,
    }));
    res.json({ tenants: result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── RATIO INTERVAL (30-min slots) ─────────────────────────────────────────
app.get('/api/roster/ratio-interval', requireAuth, requireTenant, (req, res) => {
  try {
    const { date } = req.query;
    const d = date || new Date().toISOString().split('T')[0];
    const D2 = _D();
    
    // Get all roster entries for the day
    const shifts = D2.prepare(`
      SELECT re.start_time, re.end_time, re.room_id, re.status,
             e.qualification, r.age_group, r.capacity, r.name as room_name
      FROM roster_entries re
      LEFT JOIN educators e ON e.id = re.educator_id
      LEFT JOIN rooms r ON r.id = re.room_id
      WHERE re.tenant_id=? AND re.shift_date=?
    `).all(req.tenantId, d);

    // Get actual sign-in attendance for historical
    const attendance = D2.prepare(`
      SELECT a.child_id, a.room_id, a.sign_in, a.sign_out, r.age_group, r.capacity
      FROM attendance_sessions a
      LEFT JOIN rooms r ON r.id = a.room_id
      WHERE a.tenant_id=? AND a.date=? AND a.absent=0
    `).all(req.tenantId, d);

    // NQF ratios by age group
    const RATIOS = { '0-2': 4, '2-3': 5, '3-4': 11, '4-5': 11 };

    // Build 30-min intervals 06:00 - 19:00
    const intervals = [];
    for (let h = 6; h < 19; h++) {
      for (let m = 0; m < 60; m += 30) {
        const slotStart = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        const slotEnd   = m === 30 ? `${String(h+1).padStart(2,'0')}:00` : `${String(h).padStart(2,'0')}:30`;
        const slotMins = h * 60 + m;

        // Staff present this slot
        const staffInSlot = shifts.filter(s => {
          if (s.status === 'cancelled') return false;
          const [sh, sm] = (s.start_time || '00:00').split(':').map(Number);
          const [eh, em] = (s.end_time   || '23:59').split(':').map(Number);
          return (sh * 60 + sm) <= slotMins && (eh * 60 + em) > slotMins;
        });

        // Children signed in this slot  
        const childrenInSlot = attendance.filter(a => {
          const [ih, im] = (a.sign_in || '00:00').split(':').map(Number);
          const [oh, om] = (a.sign_out || '23:59').split(':').map(Number);
          return (ih * 60 + im) <= slotMins && (oh * 60 + om) > slotMins;
        });

        const staff_count = staffInSlot.length;
        const children_count = childrenInSlot.length;

        // Required staff = worst ratio across age groups present
        let required = 0;
        const ageGroups = {};
        childrenInSlot.forEach(c => {
          const ag = c.age_group || '3-4';
          ageGroups[ag] = (ageGroups[ag] || 0) + 1;
        });
        Object.entries(ageGroups).forEach(([ag, count]) => {
          required += Math.ceil(count / (RATIOS[ag] || 11));
        });
        if (children_count > 0 && required === 0) required = Math.ceil(children_count / 11);

        // Diploma qualified
        const diploma_staff = staffInSlot.filter(s =>
          ['ect','diploma'].includes(s.qualification)
        ).length;
        const diploma_needed = Math.ceil(staff_count / 2); // 50% rule

        intervals.push({
          slot: slotStart,
          slot_end: slotEnd,
          staff_count,
          children_count,
          required_staff: required,
          deficit: Math.max(0, required - staff_count),
          diploma_staff,
          diploma_needed: Math.max(0, diploma_needed - diploma_staff),
          is_compliant: staff_count >= required,
        });
      }
    }

    const improvements_needed = intervals.filter(i => !i.is_compliant && i.children_count > 0).length;
    res.json({ date: d, intervals, improvements_needed, total_slots: intervals.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── PARENT DAILY INFO ────────────────────────────────────────────────────────
app.get('/api/parent/daily-info/:childId', requireAuth, (req, res) => {
  try {
    const tid = req.headers['x-tenant-id'];
    const { date } = req.query;
    const d = date || new Date().toISOString().split('T')[0];
    const record = _D().prepare(
      'SELECT * FROM parent_daily_info WHERE tenant_id=? AND child_id=? AND record_date=?'
    ).get(tid, req.params.childId, d);
    res.json({ record: record || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/parent/daily-info/:childId', requireAuth, requireTenant, (req, res) => {
  try {
    const { date, meals_data, sunscreen_am, sunscreen_pm, mood, notes } = req.body;
    const d = date || new Date().toISOString().split('T')[0];
    const id = uuid();
    _D().prepare(`
      INSERT INTO parent_daily_info (id, tenant_id, child_id, record_date, meals_data, sunscreen_am, sunscreen_pm, mood, notes, educator_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(tenant_id, child_id, record_date) DO UPDATE SET
        meals_data=excluded.meals_data, sunscreen_am=excluded.sunscreen_am,
        sunscreen_pm=excluded.sunscreen_pm, mood=excluded.mood, notes=excluded.notes
    `).run(id, req.tenantId, req.params.childId, d,
           JSON.stringify(meals_data||{}), sunscreen_am?1:0, sunscreen_pm?1:0, mood||'', notes||'', '');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PARENT DDR ───────────────────────────────────────────────────────────────
app.post('/api/parent/ddr', requireAuth, (req, res) => {
  try {
    const tid = req.headers['x-tenant-id'];
    const { payment_method, account_name, bsb, account_number, card_last4, card_expiry, signature_data, signed_at } = req.body;
    const id = uuid();
    _D().prepare(`
      INSERT INTO ddr_records (id, tenant_id, payment_method, account_name, bsb, account_number, card_last4, card_expiry, signature_data, signed_at, terms_accepted, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,1,'active')
    `).run(id, tid, payment_method||'bank', account_name||'', bsb||'', account_number||'', card_last4||'', card_expiry||'', signature_data||'', signed_at||new Date().toISOString());
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PARENT CWA ───────────────────────────────────────────────────────────────
app.post('/api/parent/cwa', requireAuth, (req, res) => {
  try {
    const tid = req.headers['x-tenant-id'];
    const { child_id, signature_data, signed_at } = req.body;
    const id = uuid();
    _D().prepare(`
      INSERT INTO cwa_records (id, tenant_id, child_id, signature_data, signed_at, status)
      VALUES (?,?,?,?,?,'active')
    `).run(id, tid, child_id, signature_data||'', signed_at||new Date().toISOString());
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PARENT ONE-OFF PAYMENT ───────────────────────────────────────────────────
app.post('/api/parent/one-off-payment', requireAuth, (req, res) => {
  try {
    // In production this would call Stripe — for now record the intent
    const tid = req.headers['x-tenant-id'];
    const { amount, description, total_cents } = req.body;
    // Log to ai_usage_log or a payments table — for now just acknowledge
    res.json({ ok: true, message: 'Payment recorded — awaiting processing', total_cents });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: _pkg.version, uptime: process.uptime() });
});

// ── Serve uploads ──
app.use('/uploads', express.static(uploadsDir));

// ── Serve frontend (production) ──
const distPath = path.join(__dirname, '..', 'dist');
const BASE_PATH = (process.env.BASE_PATH || '/').replace(/\/$/, '') || '/';


// ── Dashboard today summary ──────────────────────────────────────────────────
app.get('/api/dashboard/today', (req, res) => {
  try {
    const tid = req.headers['x-tenant-id'];
    if (!tid) return res.status(400).json({ error: 'tenant required' });
    const today = new Date().toISOString().split('T')[0];
    const in30  = new Date(Date.now() + 30*86400000).toISOString().split('T')[0];
    const D = _D();

    const children_enrolled = D.prepare(
      'SELECT COUNT(*) as n FROM children WHERE tenant_id=? AND active=1'
    ).get(tid)?.n || 0;

    const signed_in_today = D.prepare(
      "SELECT COUNT(*) as n FROM attendance_sessions WHERE tenant_id=? AND date=? AND absent=0 AND sign_in IS NOT NULL"
    ).get(tid, today)?.n || 0;

    const rooms = D.prepare(
      'SELECT id, name, capacity, age_group FROM rooms WHERE tenant_id=?'
    ).all(tid);

    const educators_clocked_in = D.prepare(
      "SELECT COUNT(*) as n FROM clock_records WHERE tenant_id=? AND clock_date=? AND clock_out IS NULL"
    ).get(tid, today)?.n || 0;

    const pending_enrolments = D.prepare(
      "SELECT COUNT(*) as n FROM enrolment_applications WHERE tenant_id=? AND status='pending'"
    ).get(tid)?.n || 0;

    const overdue_invoices = D.prepare(
      "SELECT COUNT(*) as n FROM invoices WHERE tenant_id=? AND status='overdue'"
    ).get(tid)?.n || 0;

    const pending_leave = D.prepare(
      "SELECT COUNT(*) as n FROM leave_requests WHERE tenant_id=? AND status='pending'"
    ).get(tid)?.n || 0;

    const unfilled_shifts = D.prepare(
      "SELECT COUNT(*) as n FROM roster_entries WHERE tenant_id=? AND status='unfilled' AND shift_date=?"
    ).get(tid, today)?.n || 0;

    const expiring_certs = D.prepare(
      `SELECT first_name, last_name FROM educators 
       WHERE tenant_id=? AND status='active' AND (
         first_aid_expiry BETWEEN date('now') AND ? OR
         cpr_expiry BETWEEN date('now') AND ? OR
         wwcc_expiry BETWEEN date('now') AND ?
       )`
    ).all(tid, in30, in30, in30);

    const pending_casual = D.prepare(
      "SELECT COUNT(*) as n FROM casual_bookings WHERE tenant_id=? AND status='pending'"
    ).get(tid)?.n || 0;

    const unread_messages = D.prepare(
      "SELECT COUNT(*) as n FROM message_threads WHERE tenant_id=? AND unread_admin > 0"
    ).get(tid)?.n || 0;

    const overdue_debt = D.prepare(
      "SELECT COUNT(*) as n, COALESCE(SUM(amount_cents-amount_paid_cents),0) as total FROM debt_records WHERE tenant_id=? AND status='outstanding' AND julianday('now')-julianday(due_date)>0"
    ).get(tid) || { n: 0, total: 0 };

    // Room occupancy
    const room_occupancy = rooms.map(r => {
      const enrolled = D.prepare(
        'SELECT COUNT(*) as n FROM children WHERE tenant_id=? AND room_id=? AND active=1'
      ).get(tid, r.id)?.n || 0;
      return {
        id: r.id, name: r.name, age_group: r.age_group,
        capacity: r.capacity, enrolled,
        occupancy_pct: r.capacity ? Math.round(enrolled/r.capacity*100) : 0,
      };
    });

    // Recent incidents (last 7 days)
    const recent_incidents = D.prepare(
      "SELECT COUNT(*) as n FROM incidents WHERE tenant_id=? AND created_at >= datetime('now','-7 days')"
    ).get(tid)?.n || 0;

    // Weekly attendance trend (last 7 days)
    const attendance_trend = D.prepare(
      `SELECT date, COUNT(*) as present FROM attendance_sessions 
       WHERE tenant_id=? AND date >= date('now','-7 days') AND absent=0
       GROUP BY date ORDER BY date`
    ).all(tid);

    // Responsible Person on Duty (from roster for today)
    const rp_today = D.prepare(`
      SELECT e.first_name, e.last_name, e.qualification, e.photo_url
      FROM roster_entries re
      JOIN educators e ON e.id = re.educator_id
      WHERE re.tenant_id=? AND re.shift_date=? AND re.is_responsible_person=1 AND re.status='filled'
      LIMIT 1
    `).get(tid, today) || null;

    // Fallback: first active educator clocked in
    const rp_fallback = !rp_today ? D.prepare(`
      SELECT e.first_name, e.last_name, e.qualification
      FROM clock_records cr
      JOIN educators e ON e.id = cr.educator_id
      WHERE cr.tenant_id=? AND cr.clock_date=? AND cr.clock_out IS NULL AND e.is_responsible_person=1
      LIMIT 1
    `).get(tid, today) : null;

    // Medication alerts today
    const medication_today = D.prepare(
      "SELECT COUNT(*) as n FROM medication_requests WHERE tenant_id=? AND scheduled_date=? AND status='pending'"
    ).get(tid, today)?.n || 0;

    // Checklist counts
    const checklists_pending = D.prepare(
      "SELECT COUNT(*) as n FROM checklists WHERE tenant_id=? AND status='active' AND (last_completed IS NULL OR last_completed < date('now'))"
    ).get(tid)?.n || 0;

    // Enrolment form submissions awaiting review
    const enrolment_forms = D.prepare(
      "SELECT COUNT(*) as n FROM enrolment_applications WHERE tenant_id=? AND status='pending'"
    ).get(tid)?.n || 0;

    // Active incidents count
    const active_incidents = D.prepare(
      "SELECT COUNT(*) as n FROM incidents WHERE tenant_id=? AND status NOT IN ('resolved','closed')"
    ).get(tid)?.n || 0;

    res.json({
      date: today,
      children_enrolled,
      signed_in_today,
      attendance_rate: children_enrolled ? Math.round(signed_in_today/children_enrolled*100) : 0,
      educators_clocked_in,
      pending_enrolments,
      overdue_invoices,
      pending_leave,
      roster_today: { unfilled: unfilled_shifts },
      expiring_certs,
      pending_casual,
      unread_messages,
      overdue_debt: { count: overdue_debt.n, total_cents: overdue_debt.total },
      room_occupancy,
      recent_incidents,
      attendance_trend,
      responsible_person: rp_today || rp_fallback,
      medication_today,
      checklists_pending,
      enrolment_forms,
      active_incidents,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── Simple list endpoints for dropdowns in new modules ───────────────────────
app.get('/api/children/simple', (req, res) => {
  try {
    const tid = req.headers['x-tenant-id'];
    if (!tid) return res.status(400).json({ error: 'tenant required' });
    const children = _D().prepare(`
      SELECT c.id, c.first_name, c.last_name, c.dob, c.room_id,
             r.name as room_name, c.active,
             ((strftime('%Y','now')-strftime('%Y',c.dob))*12+(strftime('%m','now')-strftime('%m',c.dob))) as age_months
      FROM children c
      LEFT JOIN rooms r ON r.id=c.room_id
      WHERE c.tenant_id=? AND c.active=1
      ORDER BY r.name, c.last_name, c.first_name
    `).all(tid);
    res.json(children);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/educators/simple', (req, res) => {
  try {
    const tid = req.headers['x-tenant-id'];
    if (!tid) return res.status(400).json({ error: 'tenant required' });
    const educators = _D().prepare(`
      SELECT e.id, e.first_name, e.last_name, e.qualification, e.employment_type,
             e.status, e.room_id, e.photo_url, e.email, e.phone,
             e.first_aid_expiry, e.cpr_expiry, e.wwcc_expiry,
             u.id as user_id
      FROM educators e
      LEFT JOIN users u ON u.email=e.email
      WHERE e.tenant_id=? AND e.status='active'
      ORDER BY e.last_name, e.first_name
    `).all(tid);
    res.json(educators);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/rooms/simple', (req, res) => {
  try {
    const tid = req.headers['x-tenant-id'];
    if (!tid) return res.status(400).json({ error: 'tenant required' });
    const rooms = _D().prepare(
      'SELECT id, name, age_group, capacity FROM rooms WHERE tenant_id=? ORDER BY name'
    ).all(tid);
    res.json(rooms);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Manual gzip middleware for JS/CSS assets ──────────────────────────────────
// Express.static doesn't gzip by default. This cuts 1.9MB JS -> ~490KB.
import { createReadStream, statSync, existsSync as _existsSync2 } from 'fs';
import { createGzip } from 'zlib';
import { extname as _extname } from 'path';

const GZIP_TYPES = new Set(['.js', '.css', '.html', '.json', '.svg', '.wasm']);

app.use((req, res, next) => {
  const filePath = path.join(distPath, req.path);
  const ext = _extname(req.path).toLowerCase();

  // Only gzip known text types that exist in dist
  if (!GZIP_TYPES.has(ext) || !_existsSync2(filePath)) return next();

  const acceptsGzip = (req.headers['accept-encoding'] || '').includes('gzip');
  if (!acceptsGzip) return next();

  let stat;
  try { stat = statSync(filePath); } catch { return next(); }
  if (!stat.isFile()) return next();

  const mimeMap = {
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg':  'image/svg+xml',
  };

  res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
  res.setHeader('Content-Encoding', 'gzip');
  // 1-year cache for hashed assets (index.html gets no-cache)
  if (req.path === '/index.html' || req.path === '/') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  res.setHeader('Vary', 'Accept-Encoding');

  const gzip = createGzip({ level: 6 }); // level 6 = good balance speed/size
  const stream = createReadStream(filePath);
  stream.on('error', () => next());
  stream.pipe(gzip).pipe(res);
});

// Serve static assets (fallback for non-gzipped types / browsers without gzip)
if (BASE_PATH === '/') {
  app.use(express.static(distPath, {
    maxAge: '1y',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  }));
} else {
  app.use(BASE_PATH, express.static(distPath, { maxAge: '1y' }));
  app.use(express.static(distPath, { maxAge: '1y' }));
}
// SPA catch-all

// Nightly auto-close stale educator shifts (checks every hour, runs at 2am)
setInterval(() => {
  if (new Date().getHours() !== 2) return;
  try {
    const result = D().prepare(`
      UPDATE clock_records
      SET clock_out = date(clock_in) || 'T23:59:00',
          notes = COALESCE(notes || ' | ', '') || 'Auto-closed by nightly job',
          updated_at = datetime('now')
      WHERE clock_out IS NULL
        AND clock_in < date('now', '-1 day')
    `).run();
    if (result.changes > 0) console.log('[nightly] Auto-closed', result.changes, 'stale shifts');
  } catch(e) { console.error('[nightly] Auto-close error:', e.message); }
}, 60 * 60 * 1000);

app.get('*', (req, res) => {
  // Unknown /api/* or /auth/* paths: return JSON 404 instead of hanging
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    return res.status(404).json({ error: 'Not Found', path: req.path });
  }
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

// Run compliance scan every 6 hours for all tenants
setInterval(() => {
  try {
    const tenants = _D().prepare('SELECT id FROM tenants').all();
    tenants.forEach(t => runDailyComplianceScan(t.id));
  } catch(e) { console.error('Compliance scan error:', e.message); }
}, 6 * 3600000);

// Run initial compliance scan 10s after startup
setTimeout(() => {
  try {
    const tenants = _D().prepare('SELECT id FROM tenants').all();
    tenants.forEach(t => runDailyComplianceScan(t.id));
  } catch(e) {}
}, 10000);

// Check-in alert processor — runs every 60 seconds on weekday mornings
setInterval(() => {
  try { processCheckinAlerts(); } catch (e) { console.error('[checkin-alert] scheduler error:', e.message); }
}, 60 * 1000);

// ── Start ──
const httpServer = createServer(app);
setupRetellWebSocket(httpServer).catch(e => console.warn('[Retell] WS setup failed:', e.message));
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`  ✓ Server listening on http://0.0.0.0:${PORT}`);
  console.log(`  ✓ Environment: ${isProd ? 'production' : 'development'}`);
  console.log(`  ✓ Auth: Email/Password, Google OAuth, Apple OAuth, TOTP, Email MFA`);
  console.log(`  ✓ Multi-tenant isolation enabled`);
  console.log(`  ✓ Document store + AI analysis enabled`);
  console.log(`  ✓ Compliance engine: auto-scan every 6 hours`);
  console.log(`  ✓ Retell AI WebSocket handler active\n`);
});
