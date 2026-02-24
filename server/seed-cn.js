// ═══════════════════════════════════════════════════════════════════════════
//  Childcare360 — CN Centre Real Data Seeder
//  Source: 2026_Rolls_CN___MB.xlsx  (CN sheet only)
//  Run: node server/seed-cn.js   (from app root)
//  Safe to re-run — uses INSERT OR IGNORE throughout
//  ⚠️  Change TENANT below to match your actual tenant ID
// ═══════════════════════════════════════════════════════════════════════════

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');
const path = require('path');

// Match db.js path exactly — use Railway volume mount or local data dir
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? process.env.RAILWAY_VOLUME_MOUNT_PATH
  : path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'childcare360.db');
console.log('  DB path:', DB_PATH);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

// ── Tenant ID — uses SEED_TENANT env var or falls back to first tenant in DB ─
const envTenant = process.env.SEED_TENANT;
let TENANT = envTenant || 'demo-tenant-001';
if (!envTenant) {
  const firstTenant = db.prepare('SELECT id FROM tenants ORDER BY created_at LIMIT 1').get();
  if (firstTenant) TENANT = firstTenant.id;
}
// ──────────────────────────────────────────────────────────────────────────

console.log('\n🌱 Childcare360 — CN Centre Real Data Seeder');
console.log('   Target tenant:', TENANT, '\n');

// Verify tenant exists
const tenant = db.prepare('SELECT id, name FROM tenants WHERE id = ?').get(TENANT);
if (!tenant) {
  console.error('❌ Tenant not found:', TENANT);
  console.error('   Run the app first to create the tenant, then run this seeder.');
  process.exit(1);
}
console.log('✅ Tenant found:', tenant.name);

// ── 1. ROOMS ──────────────────────────────────────────────────────────────
const ROOMS = [
  { id: 'cn-sprouts-1',   name: 'Sprouts Room 1',   age_group: '0-2',  capacity: 8  },
  { id: 'cn-sprouts-2',   name: 'Sprouts Room 2',   age_group: '0-2',  capacity: 12 },
  { id: 'cn-buds-1',      name: 'Buds Room 1',      age_group: '2-3',  capacity: 15 },
  { id: 'cn-buds-2',      name: 'Buds Room 2',      age_group: '2-3',  capacity: 10 },
  { id: 'cn-blossoms-1',  name: 'Blossoms Room 1',  age_group: '3-4',  capacity: 10 },
  { id: 'cn-blossoms-2',  name: 'Blossoms Room 2',  age_group: '3-4',  capacity: 15 },
  { id: 'cn-oaks-1',      name: 'Oaks Room 1',      age_group: '4-5',  capacity: 20 },
];

let roomsAdded = 0;
for (const r of ROOMS) {
  const exists = db.prepare('SELECT id FROM rooms WHERE id = ? OR (tenant_id = ? AND name = ?)').get(r.id, TENANT, r.name);
  if (!exists) {
    db.prepare('INSERT OR IGNORE INTO rooms (id, tenant_id, name, age_group, capacity) VALUES (?,?,?,?,?)')
      .run(r.id, TENANT, r.name, r.age_group, r.capacity);
    roomsAdded++;
    console.log('  + Room:', r.name);
  }
}
console.log(`✅ Rooms: ${roomsAdded} added (${ROOMS.length - roomsAdded} already existed)\n`);

// ── 2. CHILDREN DATA ──────────────────────────────────────────────────────
// Format: { fn, ln, dob, room, days:[Mon,Tue,Wed,Thu,Fri], parent, phone, email, comments }
// days = array of day names the child attends

const CHILDREN = [

  // ── Sprouts Room 1 (0-2 yrs) — Educator: Nicola ─────────────────────
  { fn:'Luke',       ln:'Patel',           dob:'2025-02-18', room:'cn-sprouts-1', days:['Mon','Tue','Wed'],           parent:'Jasmine Patel',        phone:'',           email:'akkari.jasmine@gmail.com',      comments:'' },
  { fn:'Darcie',     ln:'Ravenall',        dob:'2025-04-09', room:'cn-sprouts-1', days:['Mon','Wed','Thu'],           parent:'Victoria Ravenall',    phone:'',           email:'vmbrown91@gmail.com',            comments:'' },
  { fn:'Johnny',     ln:'Koutsoufis',      dob:'2025-02-27', room:'cn-sprouts-1', days:['Tue','Wed'],                parent:'Katie Sofatzis',       phone:'0424442704', email:'k.sofatzis@hotmail.com',         comments:'Parent name: Pipi Cousin / Katie' },
  { fn:'Apostolos',  ln:'Toumbelekis',     dob:'2024-12-24', room:'cn-sprouts-1', days:['Tue','Wed','Thu'],           parent:'Danielle Toumbelekis', phone:'0408337751', email:'danicons.777@gmail.com',         comments:'No CRN' },
  { fn:'Noah',       ln:'Egan',            dob:'2025-05-31', room:'cn-sprouts-1', days:['Mon','Fri'],                parent:'Ivana Egan',           phone:'0422858359', email:'',                               comments:'Andrea sister - Deen' },
  { fn:'Chris',      ln:'Christofi',       dob:'2025-04-15', room:'cn-sprouts-1', days:['Mon','Tue'],                parent:'Jessica Christofi',    phone:'0452557225', email:'jessicarizzo03@yahoo.com',        comments:'Pending confirmation' },
  { fn:'Mohammad',   ln:'Sammak',          dob:'2024-05-23', room:'cn-sprouts-1', days:['Tue'],                      parent:'Khadijah Sammak',      phone:'',           email:'',                               comments:'Also enrolled Room 2' },
  { fn:'Frank',      ln:'Piperides',       dob:'2025-05-27', room:'cn-sprouts-1', days:['Mon','Thu'],                parent:'Tracey Piperides',     phone:'0452187887', email:'Tracey.piperides@gmail.com',      comments:'' },
  { fn:'Matteo',     ln:'Macander',        dob:'2025-02-20', room:'cn-sprouts-1', days:['Mon','Fri'],                parent:'Clair Macander',       phone:'0424163670', email:'clairgoldie@gmail.com',           comments:'Waitlist Tue' },
  { fn:'Anika',      ln:'Paterno',         dob:'2024-08-26', room:'cn-sprouts-1', days:['Tue'],                      parent:'Joselle Paterno',      phone:'',           email:'',                               comments:'Waitlist Fri — also in Room 2' },
  { fn:'Giselle',    ln:'',                dob:'',           room:'cn-sprouts-1', days:['Wed'],                      parent:'',                     phone:'',           email:'',                               comments:'First name only in records' },
  { fn:'Riley',      ln:'Coppini',         dob:'2025-05-14', room:'cn-sprouts-1', days:['Tue','Wed','Thu'],           parent:'Emma Coppini',         phone:'0452339240', email:'coppinijemma@gmail.com',          comments:'' },
  { fn:'Kallum',     ln:'',                dob:'',           room:'cn-sprouts-1', days:['Mon','Wed'],                parent:'Katrina',              phone:'0405770396', email:'',                               comments:'Status: UNKNOWN' },
  { fn:'Joy',        ln:'Guirguis',        dob:'2025-06-04', room:'cn-sprouts-1', days:['Mon','Thu'],                parent:'Mary Guirguis',        phone:'0422438823', email:'Guirguis2311@gmail.com',          comments:'' },
  { fn:'Levi',       ln:'Po',              dob:'2025-01-17', room:'cn-sprouts-1', days:['Thu','Fri'],                parent:'Thuy Po',              phone:'0433421651', email:'Thuy.le_@live.com',               comments:'Waitlist Fri' },
  { fn:'Leon',       ln:'Ianni',           dob:'2024-10-31', room:'cn-sprouts-1', days:['Mon','Thu','Fri'],           parent:'Sally Ianni',          phone:'',           email:'sally.elazzi4@det.nsw.edu.au',    comments:'' },
  { fn:'Chelsea',    ln:'Lam',             dob:'2024-06-18', room:'cn-sprouts-1', days:['Tue','Wed','Thu'],           parent:'Michelle Nguyen',      phone:'0404193048', email:'M.vynguyen@gmail.com',            comments:'' },

  // ── Sprouts Room 2 (0-2 yrs) — Educator: Liz ─────────────────────────
  { fn:'Matteo',     ln:'Belviso',         dob:'2024-09-10', room:'cn-sprouts-2', days:['Tue','Wed'],                parent:'Brianna Belviso',      phone:'',           email:'',                               comments:'' },
  { fn:'Giselle',    ln:'(Room 2)',         dob:'',           room:'cn-sprouts-2', days:['Mon','Fri'],                parent:'Zeina',                phone:'',           email:'',                               comments:'Different Giselle to Room 1' },
  { fn:'Ciara',      ln:'Tonks',           dob:'2024-08-13', room:'cn-sprouts-2', days:['Mon','Wed','Thu'],           parent:'Aoife Tonks',          phone:'0406279123', email:'',                               comments:'' },
  { fn:'Landon',     ln:'Zanella',         dob:'2025-07-01', room:'cn-sprouts-2', days:['Fri'],                      parent:'Samantha Zanella',     phone:'0435735428', email:'',                               comments:'Waitlist flexible' },
  { fn:'Darcy',      ln:'Sweeting',        dob:'2024-05-27', room:'cn-sprouts-2', days:['Mon','Tue','Wed','Fri'],     parent:'Christina Sweeting',   phone:'',           email:'',                               comments:'' },
  { fn:'Mohammad',   ln:'Sammak (R2)',      dob:'2024-05-23', room:'cn-sprouts-2', days:['Mon','Fri'],                parent:'Khadijah Sammak',      phone:'',           email:'khadija_alameddine@hotmail.com',  comments:'Sibling — also in Room 1' },
  { fn:'Mathias',    ln:'Cosman',          dob:'2025-07-27', room:'cn-sprouts-2', days:['Wed','Thu','Fri'],           parent:'Marena Cosman',        phone:'0433677290', email:'marenamike@gmail.com',            comments:'' },
  { fn:'Charlize',   ln:'',                dob:'',           room:'cn-sprouts-2', days:['Thu','Fri'],                parent:'Victoria',             phone:'0416339206', email:'',                               comments:'First name only' },
  { fn:'Madeline',   ln:'Knevett',         dob:'2024-08-28', room:'cn-sprouts-2', days:['Wed','Thu'],                parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Anika',      ln:'Paterno (R2)',     dob:'2024-08-26', room:'cn-sprouts-2', days:['Thu'],                      parent:'Joselle Paterno',      phone:'0481537834', email:'joselle.reyes.reyes@gmail.com',   comments:'Pending Confirmation — sibling in Room 1' },
  { fn:'Arya',       ln:'Sanjeevee',       dob:'2024-07-09', room:'cn-sprouts-2', days:['Mon','Tue','Wed','Thu'],     parent:'',                     phone:'',           email:'',                               comments:'Waitlist Fri' },
  { fn:'Taym',       ln:'Albassit',        dob:'2024-12-20', room:'cn-sprouts-2', days:['Tue','Wed','Thu','Fri'],     parent:'Renee Albassit',       phone:'0449970385', email:'reneealbassit@gmail.com',         comments:'Sibling: Haayah Albassit (Buds 2)' },
  { fn:'Evie',       ln:'Kete',            dob:'2024-07-20', room:'cn-sprouts-2', days:['Mon','Tue','Wed','Thu','Fri'], parent:'Beatrice Kete',      phone:'',           email:'',                               comments:'Sibling: Harper Kete (Blossoms 1)' },
  { fn:'Edmund',     ln:'Foote',           dob:'2024-08-08', room:'cn-sprouts-2', days:['Mon','Tue','Wed','Thu','Fri'], parent:'Liz Foote',          phone:'',           email:'',                               comments:'' },
  { fn:'Ariana',     ln:'Da Silva',        dob:'2024-09-09', room:'cn-sprouts-2', days:['Thu','Fri'],                parent:'Krissi Matakakis',     phone:'0433402461', email:'Krissimatakakis@gmail.com',       comments:'' },
  { fn:'Luna',       ln:'Salameh',         dob:'2024-06-24', room:'cn-sprouts-2', days:['Tue','Fri'],                parent:'Soukania Salameh',     phone:'',           email:'',                               comments:'Sibling: Shadi Salameh (Blossoms 2)' },
  { fn:'Penelope',   ln:'Cooke',           dob:'2024-04-05', room:'cn-sprouts-2', days:['Mon','Tue','Fri'],           parent:'Jessica Debattista',   phone:'0422709504', email:'jessica.debattista@outlook.com',  comments:'' },
  { fn:'Joaquin',    ln:'Arce',            dob:'2024-07-08', room:'cn-sprouts-2', days:['Mon','Tue','Wed'],           parent:'Frances Arce',         phone:'0452125203', email:'francesjaviera@live.com',          comments:'' },
  { fn:'Estella',    ln:'Papthanasiou',    dob:'2024-05-13', room:'cn-sprouts-2', days:['Mon','Tue','Wed'],           parent:'Zelijana Papthanasiou',phone:'',           email:'',                               comments:'' },
  { fn:'Zakaria',    ln:'Wehbi',           dob:'2024-12-10', room:'cn-sprouts-2', days:['Tue','Thu'],                parent:'Lamees Moussa',        phone:'',           email:'lameesmoussa@hotmail.com',         comments:'Pending Eligibility' },
  { fn:'Elaria',     ln:'Tourany',         dob:'2024-09-03', room:'cn-sprouts-2', days:['Mon','Tue'],                parent:'Melissa Tourany',      phone:'',           email:'',                               comments:'Sibling: Mylah Tourany' },

  // ── Buds Room 1 (2-3 yrs) — Educator: Ana ────────────────────────────
  { fn:'Zoe',        ln:'Patel',           dob:'2023-08-23', room:'cn-buds-1',    days:['Mon','Tue','Wed'],           parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Aiden',      ln:'',                dob:'2024-01-12', room:'cn-buds-1',    days:['Mon','Fri'],                parent:'Andrea Visca',         phone:'0424497509', email:'andreavisca1@gmail.com',          comments:'' },
  { fn:'Celine',     ln:'Nguyen',          dob:'2023-08-14', room:'cn-buds-1',    days:['Mon','Tue','Wed','Thu','Fri'], parent:'',                   phone:'',           email:'',                               comments:'' },
  { fn:'Zachariah',  ln:'Taha',            dob:'2024-04-21', room:'cn-buds-1',    days:['Tue','Wed'],                parent:'Danya Darwiche',       phone:'',           email:'danyadarwiche@hotmail.com',        comments:'Biyik discount' },
  { fn:'Elias',      ln:'Jalwan',          dob:'2023-10-10', room:'cn-buds-1',    days:['Wed','Thu'],                parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Levi',       ln:'Dib',             dob:'2023-09-02', room:'cn-buds-1',    days:['Mon','Tue','Thu','Fri'],     parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Norah',      ln:'Pak',             dob:'2023-09-21', room:'cn-buds-1',    days:['Mon','Wed','Thu'],           parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Jude',       ln:'Manoun',          dob:'2024-01-03', room:'cn-buds-1',    days:['Tue','Wed','Fri'],           parent:'',                     phone:'',           email:'akaraki@live.com.au',              comments:'Sibling: Liyana Manoun' },
  { fn:'Anthony',    ln:'Alrahil',         dob:'2024-03-01', room:'cn-buds-1',    days:['Mon','Fri'],                parent:'Vivan Alrahil',        phone:'0450414429', email:'',                               comments:'Sibling: Sophia Alrahil' },
  { fn:'Nicolas',    ln:'Peet',            dob:'2024-01-04', room:'cn-buds-1',    days:['Mon','Tue','Wed','Thu'],     parent:'',                     phone:'',           email:'',                               comments:'Sibling: James Peet (Oaks)' },
  { fn:'Ayah',       ln:'El-Jamal',        dob:'2024-02-03', room:'cn-buds-1',    days:['Tue','Wed','Thu'],           parent:'Christine El-Jamal',   phone:'0404038911', email:'h.eljamal@outlook.com',           comments:'' },
  { fn:'Dzejla',     ln:'Kurtovic',        dob:'2024-01-15', room:'cn-buds-1',    days:['Mon','Tue','Thu','Fri'],     parent:'',                     phone:'',           email:'',                               comments:'Sibling: Adelisa Kurtovic (Oaks)' },
  { fn:'Idris',      ln:'Khadem',          dob:'2024-12-07', room:'cn-buds-1',    days:['Tue','Fri'],                parent:'Randa Khadem',         phone:'0414520614', email:'Randa.la.ginge@gmail.com',         comments:'Waitlist Thu' },
  { fn:'Natalia',    ln:'Azzi',            dob:'2024-04-18', room:'cn-buds-1',    days:['Tue','Thu'],                parent:'Gizelle Azzi',         phone:'0498860015', email:'Gizelle.azzi@outlook.com',         comments:'Sibling: Mason Azzi (Blossoms 1)' },
  { fn:'Javiah',     ln:'Caldera',         dob:'2023-08-21', room:'cn-buds-1',    days:['Mon','Tue','Thu','Fri'],     parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Alonso',     ln:'',                dob:'2023-10-13', room:'cn-buds-1',    days:['Mon','Tue','Wed'],           parent:'',                     phone:'',           email:'',                               comments:'First name only' },
  { fn:'Nafas',      ln:'Joola',           dob:'2023-07-11', room:'cn-buds-1',    days:['Mon','Fri'],                parent:'Naz Mojab',            phone:'0450766052', email:'nazaninmojab@gmail.com',           comments:'Waitlist Thu x2' },
  { fn:'Inaya',      ln:'Khan',            dob:'2023-11-24', room:'cn-buds-1',    days:['Mon','Tue','Wed','Thu','Fri'], parent:'Amjad Khan',         phone:'0434985112', email:'',                               comments:'Pending Eligibility' },
  { fn:'Zeinab',     ln:'Fares',           dob:'2023-12-05', room:'cn-buds-1',    days:['Mon','Tue','Wed','Thu'],     parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Penelope',   ln:'Sofatzis',        dob:'2023-11-14', room:'cn-buds-1',    days:['Mon','Tue','Wed'],           parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Aria',       ln:'Karavellas',      dob:'2023-11-03', room:'cn-buds-1',    days:['Wed','Thu'],                parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Sophia',     ln:'Gallagher',       dob:'2023-10-25', room:'cn-buds-1',    days:['Wed','Thu','Fri'],           parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Ali',        ln:'Mansour',         dob:'2023-09-23', room:'cn-buds-1',    days:['Wed','Thu','Fri'],           parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Linh',       ln:'Nguyen',          dob:'2023-08-07', room:'cn-buds-1',    days:['Mon','Thu','Fri'],           parent:'Anna Nguyen',          phone:'0450381811', email:'annadaoanh@gmail.com',             comments:'Waitlist Tue — Pending confirmation' },

  // ── Buds Room 2 (2-3 yrs) — Educator: Jazz ───────────────────────────
  { fn:'Zachariya',  ln:'Bazzi',           dob:'2023-07-14', room:'cn-buds-2',    days:['Wed','Thu','Fri'],           parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Zion',       ln:'Malek',           dob:'2023-07-10', room:'cn-buds-2',    days:['Mon','Tue','Wed','Thu','Fri'], parent:'',                   phone:'',           email:'',                               comments:'' },
  { fn:'Imogen',     ln:'Dignan',          dob:'2023-06-29', room:'cn-buds-2',    days:['Tue','Wed','Thu'],           parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Emrah',      ln:'Dautovic',        dob:'2023-08-30', room:'cn-buds-2',    days:['Mon','Wed'],                parent:'Emina Dautovic',       phone:'0424059266', email:'',                               comments:'Waitlist Fri — Pending Confirmation' },
  { fn:'Lukas',      ln:'Vidovic',         dob:'2024-03-25', room:'cn-buds-2',    days:['Mon','Wed'],                parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Jamie',      ln:'Valiente',        dob:'2023-07-26', room:'cn-buds-2',    days:['Tue','Thu'],                parent:'Tayla Spendlove',      phone:'',           email:'tayla.spendlove@gmail.com',        comments:'' },
  { fn:'Nur',        ln:'Ozdil',           dob:'2024-04-23', room:'cn-buds-2',    days:['Mon','Wed'],                parent:'Jessica Ozdil',        phone:'0406628968', email:'',                               comments:'Biyik discount' },
  { fn:'Carol',      ln:'Sorial',          dob:'2023-11-07', room:'cn-buds-2',    days:['Mon','Tue'],                parent:'Youstina Ghaly',       phone:'0494165780', email:'youstinaghaly77@gmail.com',        comments:'Waitlist Thu + 2 Fri' },
  { fn:'Iiyas',      ln:'Serinsu',         dob:'2023-06-21', room:'cn-buds-2',    days:['Wed','Fri'],                parent:'Havva Serinsu',        phone:'0412894206', email:'havva.m_93@hotmail.com',           comments:'Waitlist Tue — Sibling: Idris Serinsu (Oaks)' },
  { fn:'Bear Saint', ln:'Bechara',         dob:'2023-10-02', room:'cn-buds-2',    days:['Mon','Fri'],                parent:'Kayley Bechara',       phone:'',           email:'',                               comments:'' },
  { fn:'Jerome',     ln:'Ianni',           dob:'2023-07-09', room:'cn-buds-2',    days:['Tue','Thu','Fri'],           parent:'',                     phone:'',           email:'',                               comments:'Sibling: Leon Ianni (Sprouts 1)' },
  { fn:'Ali',        ln:'Zoghbi',          dob:'2023-07-19', room:'cn-buds-2',    days:['Thu','Fri'],                parent:'',                     phone:'',           email:'',                               comments:'Sibling: Selina Zoghbi (Oaks)' },
  { fn:'Poppy',      ln:'Carvalho',        dob:'2023-07-05', room:'cn-buds-2',    days:['Thu','Fri'],                parent:'Elena Carvalho',       phone:'0423612447', email:'',                               comments:'' },
  { fn:'Austin',     ln:'Ardamil',         dob:'2023-04-27', room:'cn-buds-2',    days:['Tue','Wed','Thu','Fri'],     parent:'Anh Ardamil',          phone:'',           email:'Ran2504@gmail.com',               comments:'' },
  { fn:'James',      ln:'Akkari',          dob:'2023-03-27', room:'cn-buds-2',    days:['Tue'],                      parent:'',                     phone:'',           email:'',                               comments:'Also in Blossoms 2' },
  { fn:'Liam',       ln:'Akkari',          dob:'2023-03-27', room:'cn-buds-2',    days:['Tue'],                      parent:'',                     phone:'',           email:'',                               comments:'Also in Blossoms 2' },
  { fn:'Haayah',     ln:'Albassit',        dob:'2023-03-05', room:'cn-buds-2',    days:['Tue','Wed','Thu','Fri'],     parent:'Renee Albassit',       phone:'0449970385', email:'reneealbassit@gmail.com',         comments:'Sibling: Taym Albassit (Sprouts 2)' },

  // ── Blossoms Room 1 (3-4 yrs) — Educator: Maria ───────────────────────
  { fn:'Andrej',     ln:'Miloseveski',     dob:'2023-03-11', room:'cn-blossoms-1', days:['Mon','Tue','Wed'],          parent:'',                     phone:'',           email:'',                               comments:'Twins with Tomas' },
  { fn:'Tomas',      ln:'Milosevski',      dob:'2023-03-11', room:'cn-blossoms-1', days:['Mon','Tue','Wed'],          parent:'',                     phone:'',           email:'',                               comments:'Twins with Andrej' },
  { fn:'Isabella',   ln:'Wehbi',           dob:'2022-12-08', room:'cn-blossoms-1', days:['Mon','Tue','Thu'],          parent:'',                     phone:'',           email:'',                               comments:'Sibling: Zakaria Wehbi (Sprouts 2)' },
  { fn:'Ashton',     ln:'Vu',              dob:'2022-06-19', room:'cn-blossoms-1', days:['Mon','Tue','Wed','Thu','Fri'], parent:'',                  phone:'',           email:'',                               comments:'' },
  { fn:'Joey',       ln:'Dakan',           dob:'',           room:'cn-blossoms-1', days:['Mon','Wed','Fri'],          parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Mason',      ln:'Azzi',            dob:'2023-02-23', room:'cn-blossoms-1', days:['Mon','Thu','Fri'],          parent:'',                     phone:'',           email:'',                               comments:'Sibling: Natalia Azzi (Buds 1)' },
  { fn:'Louis',      ln:'Ngo',             dob:'2022-03-28', room:'cn-blossoms-1', days:['Mon','Wed','Thu','Fri'],    parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Harper',     ln:'Kete',            dob:'2022-08-21', room:'cn-blossoms-1', days:['Mon','Tue','Wed','Thu','Fri'], parent:'',                  phone:'',           email:'',                               comments:'Sibling: Evie Kete (Sprouts 2)' },
  { fn:'Mylah',      ln:'Tourany',         dob:'2023-02-10', room:'cn-blossoms-1', days:['Mon','Tue'],                parent:'',                     phone:'',           email:'',                               comments:'Sibling: Elaria Tourany (Sprouts 2)' },
  { fn:'Victoria',   ln:'Doueihy',         dob:'2022-10-12', room:'cn-blossoms-1', days:['Tue','Thu','Fri'],          parent:'',                     phone:'',           email:'f_fakhoury93@hotmail.com',         comments:'Brother starts June' },
  { fn:'Romy',       ln:'Alosi',           dob:'2022-07-25', room:'cn-blossoms-1', days:['Tue','Wed','Thu'],          parent:'',                     phone:'',           email:'',                               comments:'Sibling: Jacob Alosi (Oaks)' },
  { fn:'Anastasia',  ln:'Vukotic',         dob:'2022-07-28', room:'cn-blossoms-1', days:['Wed','Thu','Fri'],          parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Micheal',    ln:'Castelao',        dob:'2022-10-06', room:'cn-blossoms-1', days:['Tue','Wed','Thu'],          parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Jayda',      ln:'Sabido',          dob:'2022-08-21', room:'cn-blossoms-1', days:['Wed','Thu','Fri'],          parent:'',                     phone:'',           email:'',                               comments:'' },

  // ── Blossoms Room 2 (3-4 yrs) — Educator: Niss ───────────────────────
  { fn:'Darcy',      ln:'Cooper',          dob:'2022-10-07', room:'cn-blossoms-2', days:['Mon','Thu','Fri'],          parent:'',                     phone:'',           email:'',                               comments:'Pending Confirmation' },
  { fn:'Ibrahim',    ln:'Bayrouti',        dob:'2022-05-26', room:'cn-blossoms-2', days:['Mon','Tue','Wed'],          parent:'',                     phone:'',           email:'',                               comments:'Twins with Yousef' },
  { fn:'Yousef',     ln:'Bayrouti',        dob:'2022-05-26', room:'cn-blossoms-2', days:['Mon','Tue','Wed'],          parent:'',                     phone:'',           email:'',                               comments:'Twins with Ibrahim' },
  { fn:'Catalina',   ln:'Duff',            dob:'2022-05-07', room:'cn-blossoms-2', days:['Mon','Tue'],                parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Rosette',    ln:'Phan',            dob:'',           room:'cn-blossoms-2', days:['Mon','Tue','Wed','Thu','Fri'], parent:'',                  phone:'',           email:'',                               comments:'Sibling September start' },
  { fn:'Athena',     ln:'La Greca',        dob:'2022-05-24', room:'cn-blossoms-2', days:['Tue','Wed','Thu','Fri'],    parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Yakup',      ln:'Agar',            dob:'',           room:'cn-blossoms-2', days:['Wed'],                      parent:'',                     phone:'',           email:'',                               comments:'Waitlist Thu + sister' },
  { fn:'Chloe',      ln:'Zoobi',           dob:'2022-07-31', room:'cn-blossoms-2', days:['Tue','Thu'],                parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Shadi',      ln:'Salameh',         dob:'2022-07-22', room:'cn-blossoms-2', days:['Tue','Fri'],                parent:'',                     phone:'',           email:'',                               comments:'Sibling: Luna Salameh (Sprouts 2)' },
  { fn:'Mia',        ln:'Karabestsos',     dob:'2022-12-16', room:'cn-blossoms-2', days:['Mon','Thu','Fri'],          parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Leonidas',   ln:'Hatzinikitas',    dob:'2023-01-09', room:'cn-blossoms-2', days:['Mon','Tue','Wed'],          parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Nathaniel',  ln:'Oxton',           dob:'2023-02-22', room:'cn-blossoms-2', days:['Mon','Tue','Wed','Thu'],    parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'James',      ln:'Akkari (B2)',      dob:'2023-03-27', room:'cn-blossoms-2', days:['Wed','Thu','Fri'],         parent:'',                     phone:'',           email:'',                               comments:'Also in Buds 2' },
  { fn:'JP',         ln:'',                dob:'',           room:'cn-blossoms-2', days:['Mon','Wed','Fri'],          parent:'Zeina',                phone:'',           email:'',                               comments:'' },
  { fn:'Sophia',     ln:'Alrahil',         dob:'',           room:'cn-blossoms-2', days:['Mon','Thu','Fri'],          parent:'',                     phone:'',           email:'',                               comments:'Sibling: Anthony Alrahil (Buds 1)' },
  { fn:'Liam',       ln:'Akkari (B2)',      dob:'2023-03-27', room:'cn-blossoms-2', days:['Wed','Thu','Fri'],         parent:'',                     phone:'',           email:'',                               comments:'Also in Buds 2' },
  { fn:'Mateo',      ln:'Ruz',             dob:'2022-11-10', room:'cn-blossoms-2', days:['Tue','Wed'],                parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Isabelle',   ln:'Henderson',       dob:'2022-09-28', room:'cn-blossoms-2', days:['Mon','Tue','Thu'],          parent:'',                     phone:'',           email:'',                               comments:'Brother starts August' },
  { fn:'Ashton',     ln:'Quach',           dob:'2022-05-15', room:'cn-blossoms-2', days:['Mon','Tue','Wed','Thu','Fri'], parent:'Pranee Quach',     phone:'',           email:'',                               comments:'' },
  { fn:'Xavier',     ln:'Morcos',          dob:'2022-08-11', room:'cn-blossoms-2', days:['Tue','Wed','Thu','Fri'],    parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Liyana',     ln:'Manoun',          dob:'2022-08-23', room:'cn-blossoms-2', days:['Tue','Wed','Fri'],          parent:'',                     phone:'',           email:'',                               comments:'Sibling: Jude Manoun (Buds 1)' },
  { fn:'Evelyn',     ln:'Hodsoll',         dob:'2022-07-18', room:'cn-blossoms-2', days:['Tue','Wed','Thu','Fri'],    parent:'',                     phone:'',           email:'',                               comments:'' },

  // ── Oaks Room 1 (4-5 yrs) — Educator: Sabrina ────────────────────────
  { fn:'Jai',        ln:'Patel',           dob:'2021-09-13', room:'cn-oaks-1',    days:['Mon','Tue','Wed'],           parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Luciano',    ln:'Soto',            dob:'2021-12-07', room:'cn-oaks-1',    days:['Mon','Thu','Fri'],           parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Carter',     ln:'Cherrington',     dob:'2021-05-31', room:'cn-oaks-1',    days:['Mon','Tue','Thu','Fri'],     parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Gabriel',    ln:'Bazzi',           dob:'2021-04-28', room:'cn-oaks-1',    days:['Wed','Thu'],                parent:'',                     phone:'',           email:'',                               comments:'Sibling: Zachariya Bazzi (Buds 2)' },
  { fn:'Alaska',     ln:'Carter',          dob:'2022-03-17', room:'cn-oaks-1',    days:['Mon','Tue','Thu','Fri'],     parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Hudson',     ln:'Gallagher',       dob:'2021-05-21', room:'cn-oaks-1',    days:['Wed','Thu','Fri'],           parent:'',                     phone:'',           email:'',                               comments:'Sibling: Sophia Gallagher (Buds 1)' },
  { fn:'Jordan',     ln:'Ayoub',           dob:'2021-11-22', room:'cn-oaks-1',    days:['Mon','Tue','Thu','Fri'],     parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Anastasia',  ln:'Faraj',           dob:'2022-05-09', room:'cn-oaks-1',    days:['Tue','Wed','Thu','Fri'],     parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Audrey',     ln:'Buczek',          dob:'2021-03-16', room:'cn-oaks-1',    days:['Mon','Tue','Thu'],           parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Yaqoub',     ln:'Roude',           dob:'2021-04-02', room:'cn-oaks-1',    days:['Mon','Tue','Wed','Fri'],     parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Jacob',      ln:'Alosi',           dob:'2021-04-19', room:'cn-oaks-1',    days:['Tue','Wed','Thu'],           parent:'',                     phone:'',           email:'',                               comments:'Sibling: Romy Alosi (Blossoms 1)' },
  { fn:'Maximus',    ln:'Trigas',          dob:'2021-06-29', room:'cn-oaks-1',    days:['Tue','Wed','Thu','Fri'],     parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Selina',     ln:'Zoghbi',          dob:'2021-05-31', room:'cn-oaks-1',    days:['Tue','Wed','Thu','Fri'],     parent:'',                     phone:'',           email:'',                               comments:'Sibling: Ali Zoghbi (Buds 2)' },
  { fn:'Adelisa',    ln:'Kurtovic',        dob:'2021-01-15', room:'cn-oaks-1',    days:['Mon','Tue','Thu','Fri'],     parent:'',                     phone:'',           email:'',                               comments:'Sibling: Dzejla Kurtovic (Buds 1)' },
  { fn:'Amelia',     ln:'Druce',           dob:'2021-08-10', room:'cn-oaks-1',    days:['Mon','Wed','Fri'],           parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'James',      ln:'Peet',            dob:'2022-01-17', room:'cn-oaks-1',    days:['Mon','Tue','Wed','Thu'],     parent:'',                     phone:'',           email:'',                               comments:'Sibling: Nicolas Peet (Buds 1)' },
  { fn:'Anna',       ln:'Lavender',        dob:'',           room:'cn-oaks-1',    days:['Thu','Fri'],                parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Johnson',    ln:'',                dob:'',           room:'cn-oaks-1',    days:['Mon','Tue','Thu','Fri'],     parent:'',                     phone:'',           email:'',                               comments:'First name only' },
  { fn:'Layla',      ln:'Fernandes Moniz', dob:'2021-12-03', room:'cn-oaks-1',    days:['Mon','Tue','Wed','Thu','Fri'], parent:'',                  phone:'',           email:'',                               comments:'Twins with Lily' },
  { fn:'Lily',       ln:'Fernandes Moniz', dob:'2021-12-03', room:'cn-oaks-1',    days:['Mon','Tue','Wed','Thu','Fri'], parent:'',                  phone:'',           email:'',                               comments:'Twins with Layla' },
  { fn:'Sidra',      ln:'Alharbe',         dob:'2022-01-09', room:'cn-oaks-1',    days:['Mon','Wed','Fri'],           parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Mariano',    ln:'Gunua',           dob:'2021-06-14', room:'cn-oaks-1',    days:['Tue','Wed'],                parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Venba',      ln:'Kannan',          dob:'2022-08-04', room:'cn-oaks-1',    days:['Mon','Tue','Wed','Thu','Fri'], parent:'Andrea Visca',      phone:'0424497509', email:'andreavisca1@gmail.com',          comments:'' },
  { fn:'Deen',       ln:'',                dob:'2022-04-11', room:'cn-oaks-1',    days:['Mon','Fri'],                parent:'Andrea Visca',         phone:'',           email:'',                               comments:'Pending Confirmation' },
  { fn:'Paul',       ln:'Abrahim',         dob:'2021-07-13', room:'cn-oaks-1',    days:['Mon','Tue'],                parent:'',                     phone:'',           email:'',                               comments:'' },
  { fn:'Savion',     ln:'Keomoungkhoun',   dob:'2021-07-12', room:'cn-oaks-1',    days:['Mon','Wed'],                parent:'',                     phone:'',           email:'',                               comments:'CCS 0% Pending eligibility' },
  { fn:'Idris',      ln:'Serinsu',         dob:'2021-12-08', room:'cn-oaks-1',    days:['Wed','Thu','Fri'],           parent:'Havva Serinsu',        phone:'',           email:'',                               comments:'Waitlist Tue — Sibling: Iiyas Serinsu (Buds 2)' },
  { fn:'Sofia',      ln:'Taha',            dob:'',           room:'cn-oaks-1',    days:['Mon','Tue'],                parent:'',                     phone:'',           email:'',                               comments:'' },
];

// ── 3. INSERT CHILDREN + PARENTS ──────────────────────────────────────────
const DAY_MAP = { Mon: 1, Tue: 1, Wed: 1, Thu: 1, Fri: 1 };

let kidsAdded = 0, kidsSkipped = 0, parentsAdded = 0;

for (const k of CHILDREN) {
  // Normalise last name — strip room tags like "(Room 2)", "(R2)", "(B2)"
  const cleanLn = (k.ln || '').replace(/\s*\(.*?\)\s*$/g, '').trim();
  const cleanFn = (k.fn || '').trim();
  if (!cleanFn) continue;

  // Check if child already exists
  const exists = db.prepare(
    'SELECT id FROM children WHERE tenant_id=? AND first_name=? AND last_name=?'
  ).get(TENANT, cleanFn, cleanLn);
  if (exists) { kidsSkipped++; continue; }

  const cid = randomUUID();
  const dob = k.dob || '2020-01-01'; // placeholder if unknown
  const notes = [
    k.comments ? `Notes: ${k.comments}` : '',
    k.days.length ? `Attending: ${k.days.join(', ')}` : '',
  ].filter(Boolean).join(' | ');

  db.prepare(`
    INSERT OR IGNORE INTO children
      (id, tenant_id, first_name, last_name, dob, room_id, allergies, notes, enrolled_date, active)
    VALUES (?,?,?,?,?,?,?,?,?,1)
  `).run(cid, TENANT, cleanFn, cleanLn, dob, k.room, 'None', notes, '2026-01-27');

  kidsAdded++;

  // Insert parent contact if we have one
  if (k.parent || k.phone || k.email) {
    db.prepare(`
      INSERT OR IGNORE INTO parent_contacts
        (id, tenant_id, child_id, name, relationship, email, phone, is_primary, receives_notifications)
      VALUES (?,?,?,?,?,?,?,1,1)
    `).run(
      randomUUID(), TENANT, cid,
      k.parent || 'Parent/Guardian',
      'parent',
      k.email || null,
      k.phone ? k.phone.replace(/\s/g,'') : null
    );
    parentsAdded++;
  }
}

console.log(`✅ Children: ${kidsAdded} added, ${kidsSkipped} already existed`);
console.log(`✅ Parent contacts: ${parentsAdded} added\n`);

// ── 4. SUMMARY ────────────────────────────────────────────────────────────
const totals = db.prepare('SELECT r.name, COUNT(c.id) as cnt FROM rooms r LEFT JOIN children c ON c.room_id = r.id AND c.tenant_id = r.tenant_id WHERE r.tenant_id = ? AND r.id LIKE \'cn-%\' GROUP BY r.id ORDER BY r.id').all(TENANT);
console.log('📊 Children per room (CN):');
for (const t of totals) {
  console.log(`   ${t.name.padEnd(22)} ${t.cnt} children`);
}

const grandTotal = db.prepare("SELECT COUNT(*) as cnt FROM children WHERE tenant_id = ? AND active = 1").get(TENANT);
console.log(`\n   Total active children in DB: ${grandTotal.cnt}`);
console.log('\n✅ CN seed complete!\n');
