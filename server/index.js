import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
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
        const first = db.prepare('SELECT id, name FROM tenants ORDER BY created_at LIMIT 1').get();
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
// ── One-shot CN seed endpoint ─────────────────────────────────────────────
// Hit: GET /admin-seed-cn?token=childcare360seed
// Remove the SEED_TOKEN env var after seeding to disable this endpoint
app.get('/admin-seed-cn', (req, res) => {
  const token = process.env.SEED_TOKEN || 'childcare360seed';
  if (req.query.token !== token) return res.status(403).json({ error: 'Invalid token' });
  try {
    const db = _D();
    const first = db.prepare('SELECT id, name FROM tenants ORDER BY created_at LIMIT 1').get();
    if (!first) return res.status(500).json({ error: 'No tenant found' });
    const TENANT = process.env.SEED_TENANT || first.id;

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
    return res.json({ ok: true, tenant: TENANT, roomsAdded, kidsAdded, kidsSkipped, parentsAdded, totalChildren: total.cnt });
  } catch(e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
});

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
