// ═══════════════════════════════════════════════════════════════════════════
//  Childcare360 — 9-Room Centre Demo Seeder (v2.9.4)
//  Run: node server/seed-9room.js   (from app root)
//  Safe to re-run — uses INSERT OR IGNORE throughout
//  Creates: 9 rooms, 15 educators, 96 children, medical plans, immunisations,
//  rosters, attendance, incidents, observations, parent contacts, and more
// ═══════════════════════════════════════════════════════════════════════════

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';
import bcrypt from 'bcryptjs';

const DB_PATH = path.join(process.cwd(), 'data', 'childcare360.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

const T = 'demo-tenant-001';
const ADMIN = 'demo-admin-001';
const uuid = () => randomUUID();
const today = new Date().toISOString().split('T')[0];
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const addDays = (base, n) => { const d = new Date(base + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().split('T')[0]; };
const monday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().split('T')[0]; })();
const lastMonday = addDays(monday, -7);
const nextMonday = addDays(monday, 7);

console.log('═══════════════════════════════════════════════════════════');
console.log('  Childcare360 — 9-Room Centre Seeder');
console.log('  Date:', today, ' Monday:', monday);
console.log('═══════════════════════════════════════════════════════════');

// ── STEP 0: Clear existing demo data ─────────────────────────────────────────
console.log('\n[0/12] Clearing existing demo data...');
const clearTables = [
  'roster_entries', 'roster_periods', 'roster_templates',
  'attendance_sessions', 'daily_updates', 'incidents',
  'immunisation_records', 'medical_plans', 'medications', 'medication_log',
  'observations', 'learning_stories', 'learning_story_outcomes',
  'child_dietary', 'authorised_pickups', 'child_permissions',
  'parent_contacts', 'compliance_items', 'parent_feedback',
  'enrolment_applications', 'staff_wellbeing', 'educator_absences',
  'educator_availability', 'educator_room_preferences',
  'leave_requests', 'shift_fill_requests', 'shift_fill_attempts',
  'children', 'educators', 'rooms',
];
for (const table of clearTables) {
  try { db.prepare(`DELETE FROM ${table} WHERE tenant_id=?`).run(T); } catch (e) {}
}
console.log('  ✓ Cleared', clearTables.length, 'tables');

// ── STEP 1: Rooms ─────────────────────────────────────────────────────────────
console.log('\n[1/12] Creating 9 rooms...');
const ROOMS = [
  { id: 'room-butterflies', name: 'Butterflies', age_group: '0-2', capacity: 8, current_children: 8 },
  { id: 'room-ladybirds', name: 'Ladybirds', age_group: '3-4', capacity: 15, current_children: 12 },
  { id: 'room-dragonflies', name: 'Dragonflies', age_group: '3-4', capacity: 15, current_children: 12 },
  { id: 'room-caterpillars', name: 'Caterpillars', age_group: '3-4', capacity: 12, current_children: 10 },
  { id: 'room-possums', name: 'Possums', age_group: '4-5', capacity: 15, current_children: 12 },
  { id: 'room-koalas', name: 'Koalas', age_group: '4-5', capacity: 15, current_children: 12 },
  { id: 'room-joeys', name: 'Joeys (Pre-K)', age_group: '4-5', capacity: 12, current_children: 10 },
  { id: 'room-wallabies', name: 'Wallabies (Pre-K)', age_group: '4-5', capacity: 12, current_children: 10 },
  { id: 'room-kookaburras', name: 'Kookaburras (Pre-K)', age_group: '4-5', capacity: 12, current_children: 10 },
];
for (const r of ROOMS) {
  db.prepare('INSERT OR REPLACE INTO rooms (id,tenant_id,name,age_group,capacity,current_children,created_at) VALUES(?,?,?,?,?,?,?)').run(r.id, T, r.name, r.age_group, r.capacity, r.current_children, now());
}
console.log('  ✓', ROOMS.length, 'rooms created');

// ── STEP 2: Educators ─────────────────────────────────────────────────────────
console.log('\n[2/12] Creating 15 educators...');
const EDUCATORS = [
  { fn:'Megan',ln:'Holliday',q:'ect',emp:'permanent',rate:4500,room:'room-butterflies',email:'megan.h@sunshinelc.com.au',phone:'0412 345 001',wwcc:'WWC0045123',wwcc_exp:addDays(today,400),role:'Nominated Supervisor',rp:1,el:0 },
  { fn:'Priya',ln:'Ramasamy',q:'ect',emp:'permanent',rate:4300,room:'room-ladybirds',email:'priya.r@sunshinelc.com.au',phone:'0412 345 002',wwcc:'WWC0045234',wwcc_exp:addDays(today,350),role:'Educational Leader',rp:0,el:1 },
  { fn:'Daniel',ln:'Kemp',q:'ect',emp:'permanent',rate:4200,room:'room-possums',email:'daniel.k@sunshinelc.com.au',phone:'0412 345 003',wwcc:'WWC0056789',wwcc_exp:addDays(today,600),role:'Room Leader',rp:0,el:0 },
  { fn:'Linh',ln:'Tran',q:'ect',emp:'permanent',rate:4200,room:'room-koalas',email:'linh.t@sunshinelc.com.au',phone:'0412 345 004',wwcc:'WWC0067890',wwcc_exp:addDays(today,500),role:'Room Leader',rp:0,el:0 },
  { fn:'Fatima',ln:'Al-Rashid',q:'diploma',emp:'permanent',rate:3700,room:'room-dragonflies',email:'fatima.a@sunshinelc.com.au',phone:'0412 345 005',wwcc:'WWC0078901',wwcc_exp:addDays(today,450),role:'Room Leader',rp:0,el:0 },
  { fn:'Brooke',ln:'Sullivan',q:'diploma',emp:'permanent',rate:3600,room:'room-butterflies',email:'brooke.s@sunshinelc.com.au',phone:'0412 345 006',wwcc:'WWC0089012',wwcc_exp:addDays(today,380),role:'Educator',rp:0,el:0 },
  { fn:'Jayden',ln:'Osei-Mensah',q:'diploma',emp:'part_time',rate:3600,room:'room-ladybirds',email:'jayden.o@sunshinelc.com.au',phone:'0412 345 007',wwcc:'WWC0090123',wwcc_exp:addDays(today,300),role:'Educator',rp:0,el:0 },
  { fn:'Tessa',ln:'Moretti',q:'cert3',emp:'permanent',rate:3200,room:'room-possums',email:'tessa.m@sunshinelc.com.au',phone:'0412 345 008',wwcc:'WWC0012345',wwcc_exp:addDays(today,550),role:'Educator',rp:0,el:0 },
  { fn:'Marcus',ln:'Whitfield',q:'cert3',emp:'permanent',rate:3200,room:'room-koalas',email:'marcus.w@sunshinelc.com.au',phone:'0412 345 009',wwcc:'WWC0023456',wwcc_exp:addDays(today,420),role:'Educator',rp:0,el:0 },
  { fn:'Aroha',ln:'Ngata',q:'cert3',emp:'permanent',rate:3100,room:'room-caterpillars',email:'aroha.n@sunshinelc.com.au',phone:'0412 345 010',wwcc:'WWC0034567',wwcc_exp:addDays(today,365),role:'Educator',rp:0,el:0 },
  { fn:'Samira',ln:'Hadid',q:'cert3',emp:'part_time',rate:3100,room:'room-joeys',email:'samira.h@sunshinelc.com.au',phone:'0412 345 011',wwcc:'WWC0045678',wwcc_exp:addDays(today,500),role:'Educator',rp:0,el:0 },
  { fn:'Chloe',ln:'Papadimitriou',q:'cert3',emp:'casual',rate:3400,room:'room-wallabies',email:'chloe.p@sunshinelc.com.au',phone:'0412 345 012',wwcc:'WWC0078234',wwcc_exp:addDays(today,21),role:'Educator',rp:0,el:0 },
  { fn:'Ryan',ln:'Gallagher',q:'working_towards',emp:'casual',rate:2900,room:'room-kookaburras',email:'ryan.g@sunshinelc.com.au',phone:'0412 345 013',wwcc:'WWC0091567',wwcc_exp:addDays(today,24),role:'Educator',rp:0,el:0 },
  { fn:'Nina',ln:'Kovac',q:'diploma',emp:'casual',rate:3800,room:'room-dragonflies',email:'nina.k@sunshinelc.com.au',phone:'0412 345 014',wwcc:'WWC0056234',wwcc_exp:addDays(today,600),role:'Relief Educator',rp:0,el:0 },
  { fn:'Ethan',ln:'Bunjaku',q:'working_towards_diploma',emp:'casual',rate:3000,room:'room-caterpillars',email:'ethan.b@sunshinelc.com.au',phone:'0412 345 015',wwcc:'WWC0067345',wwcc_exp:addDays(today,500),role:'Educator',rp:0,el:0,u18:1 },
];

const edIds = [];
for (const e of EDUCATORS) {
  const id = uuid();
  edIds.push(id);
  db.prepare(`INSERT INTO educators (id,tenant_id,first_name,last_name,email,phone,qualification,employment_type,hourly_rate_cents,
    wwcc_number,wwcc_expiry,first_aid,first_aid_expiry,cpr_expiry,anaphylaxis_expiry,asthma_expiry,
    is_responsible_person,is_educational_leader,role_title,is_under_18,status,start_date,
    reliability_score,total_shifts_offered,total_shifts_accepted,total_sick_days,total_late_arrivals,total_no_shows,
    max_hours_per_week,contracted_hours,preferred_rooms,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id,T,e.fn,e.ln,e.email,e.phone,e.q,e.emp,e.rate,
      e.wwcc,e.wwcc_exp,addDays(today,180),addDays(today,120),addDays(today,180),addDays(today,180),
      e.rp,e.el,e.role,e.u18||0,'active',addDays(today,-Math.floor(Math.random()*1000+365)),
      85+Math.floor(Math.random()*15),50+Math.floor(Math.random()*100),45+Math.floor(Math.random()*90),Math.floor(Math.random()*5),Math.floor(Math.random()*3),Math.floor(Math.random()*2),
      e.emp==='part_time'?30:38,e.emp==='part_time'?30:38,JSON.stringify([e.room]),now(),now());
  // Availability Mon-Fri
  for (let d=1;d<=5;d++) {
    db.prepare('INSERT OR IGNORE INTO educator_availability (id,educator_id,tenant_id,day_of_week,available,start_time,end_time,preferred,notes) VALUES(?,?,?,?,1,?,?,1,?)')
      .run(uuid(),id,T,d,e.emp==='part_time'&&d>3?'08:00':'06:00',e.emp==='part_time'&&d>3?'14:00':'18:30','');
  }
}
console.log('  ✓', EDUCATORS.length, 'educators created');

// ── STEP 3: Children ──────────────────────────────────────────────────────────
console.log('\n[3/12] Creating 96 children...');
const CHILDREN = [
  // Butterflies (0-2) — 8 children
  {fn:'Aisha',ln:'Mahmoud',dob:'2025-01-15',g:'F',lang:'Arabic',room:'room-butterflies',allergy:null},
  {fn:'Leo',ln:'Zhang',dob:'2024-11-22',g:'M',lang:'Mandarin',room:'room-butterflies',allergy:null},
  {fn:'Mila',ln:'Petrovic',dob:'2025-03-08',g:'F',lang:'Serbian',room:'room-butterflies',allergy:null},
  {fn:'Oscar',ln:'Campbell',dob:'2024-07-19',g:'M',lang:'English',room:'room-butterflies',allergy:'Dairy intolerance'},
  {fn:'Zara',ln:'Singh',dob:'2025-06-03',g:'F',lang:'Punjabi',room:'room-butterflies',allergy:null},
  {fn:'Kai',ln:'Henderson',dob:'2024-09-28',g:'M',lang:'English',room:'room-butterflies',allergy:null},
  {fn:'Ivy',ln:'Nakamura',dob:'2024-05-14',g:'F',lang:'Japanese',room:'room-butterflies',allergy:'Egg allergy'},
  {fn:'Reuben',ln:"O'Malley",dob:'2025-08-11',g:'M',lang:'English',room:'room-butterflies',allergy:null},
  // Ladybirds (3-4) — 12 children
  {fn:'Amara',ln:'Okafor',dob:'2022-09-14',g:'F',lang:'Igbo',room:'room-ladybirds',allergy:null},
  {fn:'Lachlan',ln:'Stewart',dob:'2022-07-22',g:'M',lang:'English',room:'room-ladybirds',allergy:null},
  {fn:'Yuna',ln:'Park',dob:'2022-11-05',g:'F',lang:'Korean',room:'room-ladybirds',allergy:null},
  {fn:'Ibrahim',ln:'Hassan',dob:'2023-01-18',g:'M',lang:'Somali',room:'room-ladybirds',allergy:null},
  {fn:'Sophia',ln:'Kontou',dob:'2022-06-30',g:'F',lang:'Greek',room:'room-ladybirds',allergy:null},
  {fn:'Archer',ln:'Davies',dob:'2022-08-12',g:'M',lang:'English',room:'room-ladybirds',allergy:'Asthma'},
  {fn:'Aaliyah',ln:'Mohammed',dob:'2023-03-25',g:'F',lang:'Arabic',room:'room-ladybirds',allergy:null},
  {fn:'Finn',ln:"O'Sullivan",dob:'2022-12-01',g:'M',lang:'English',room:'room-ladybirds',allergy:null},
  {fn:'Mei-Ling',ln:'Wu',dob:'2022-10-17',g:'F',lang:'Cantonese',room:'room-ladybirds',allergy:null},
  {fn:'Hugo',ln:'Fernandez',dob:'2023-02-09',g:'M',lang:'Spanish',room:'room-ladybirds',allergy:null},
  {fn:'Isla',ln:'Kowalski',dob:'2022-05-28',g:'F',lang:'Polish',room:'room-ladybirds',allergy:null},
  {fn:'Jai',ln:'Kapoor',dob:'2022-07-04',g:'M',lang:'Hindi',room:'room-ladybirds',allergy:'Peanut allergy - ANAPHYLAXIS'},
  // Dragonflies (3-4) — 12 children
  {fn:'Matilda',ln:'Brown',dob:'2022-08-20',g:'F',lang:'English',room:'room-dragonflies',allergy:null},
  {fn:'Elijah',ln:'Tran',dob:'2022-06-15',g:'M',lang:'Vietnamese',room:'room-dragonflies',allergy:null},
  {fn:'Ava',ln:'Papadopoulos',dob:'2023-01-30',g:'F',lang:'Greek',room:'room-dragonflies',allergy:null},
  {fn:'Noah',ln:'Mancini',dob:'2022-11-12',g:'M',lang:'Italian',room:'room-dragonflies',allergy:null},
  {fn:'Sienna',ln:'Martins',dob:'2022-09-03',g:'F',lang:'Portuguese',room:'room-dragonflies',allergy:null},
  {fn:'Hamza',ln:'Ali',dob:'2023-02-22',g:'M',lang:'Urdu',room:'room-dragonflies',allergy:null},
  {fn:'Charlotte',ln:'Reeves',dob:'2022-07-09',g:'F',lang:'English',room:'room-dragonflies',allergy:'Eczema'},
  {fn:'Luka',ln:'Babic',dob:'2022-12-18',g:'M',lang:'Croatian',room:'room-dragonflies',allergy:null},
  {fn:'Jasmine',ln:'Nguyen',dob:'2023-03-14',g:'F',lang:'Vietnamese',room:'room-dragonflies',allergy:null},
  {fn:'Declan',ln:'Murphy',dob:'2022-05-25',g:'M',lang:'English',room:'room-dragonflies',allergy:null},
  {fn:'Anaya',ln:'Krishnan',dob:'2022-10-08',g:'F',lang:'Tamil',room:'room-dragonflies',allergy:null},
  {fn:'Xavier',ln:'Santos',dob:'2022-08-31',g:'M',lang:'Filipino',room:'room-dragonflies',allergy:null},
  // Caterpillars (3-4) — 10 children
  {fn:'Willow',ln:'McCarthy',dob:'2022-06-21',g:'F',lang:'English',room:'room-caterpillars',allergy:null},
  {fn:'Bodhi',ln:'Sharma',dob:'2022-09-15',g:'M',lang:'Hindi',room:'room-caterpillars',allergy:null},
  {fn:'Cleo',ln:'Antoniou',dob:'2023-01-07',g:'F',lang:'Greek',room:'room-caterpillars',allergy:null},
  {fn:'Max',ln:'Johansson',dob:'2022-11-28',g:'M',lang:'Swedish',room:'room-caterpillars',allergy:null},
  {fn:'Ruby',ln:'Takahashi',dob:'2022-07-16',g:'F',lang:'Japanese',room:'room-caterpillars',allergy:null},
  {fn:'Koby',ln:'Watene',dob:'2022-05-10',g:'M',lang:'Maori',room:'room-caterpillars',allergy:null},
  {fn:'Layla',ln:'Boutros',dob:'2023-03-02',g:'F',lang:'Arabic',room:'room-caterpillars',allergy:null},
  {fn:'Sebastian',ln:'Cruz',dob:'2022-08-24',g:'M',lang:'Spanish',room:'room-caterpillars',allergy:null},
  {fn:'Stella',ln:'Volkov',dob:'2022-10-30',g:'F',lang:'Russian',room:'room-caterpillars',allergy:null},
  {fn:'Archie',ln:'Flanagan',dob:'2022-12-14',g:'M',lang:'English',room:'room-caterpillars',allergy:null},
  // Possums (4-5) — 12 children
  {fn:'Poppy',ln:'Chen',dob:'2021-08-12',g:'F',lang:'Mandarin',room:'room-possums',allergy:null},
  {fn:'Harrison',ln:'Blake',dob:'2021-05-20',g:'M',lang:'English',room:'room-possums',allergy:null},
  {fn:'Freya',ln:'Lindqvist',dob:'2021-11-03',g:'F',lang:'Swedish',room:'room-possums',allergy:null},
  {fn:'Arjun',ln:'Nair',dob:'2022-01-17',g:'M',lang:'Malayalam',room:'room-possums',allergy:'Egg allergy - ANAPHYLAXIS'},
  {fn:'Maddison',ln:'Kelly',dob:'2021-07-29',g:'F',lang:'English',room:'room-possums',allergy:null},
  {fn:'Yusuf',ln:'Demir',dob:'2021-09-08',g:'M',lang:'Turkish',room:'room-possums',allergy:null},
  {fn:'Grace',ln:"O'Brien",dob:'2022-02-14',g:'F',lang:'English',room:'room-possums',allergy:null},
  {fn:'Theo',ln:'Papageorgiou',dob:'2021-06-25',g:'M',lang:'Greek',room:'room-possums',allergy:null},
  {fn:'Emily',ln:'Aziz',dob:'2021-10-19',g:'F',lang:'Arabic',room:'room-possums',allergy:null},
  {fn:'Cooper',ln:'Jenkins',dob:'2021-12-06',g:'M',lang:'English',room:'room-possums',allergy:null},
  {fn:'Hannah',ln:'Kim',dob:'2022-03-11',g:'F',lang:'Korean',room:'room-possums',allergy:null},
  {fn:'Ravi',ln:'Patel',dob:'2021-08-30',g:'M',lang:'Gujarati',room:'room-possums',allergy:null},
  // Koalas (4-5) — 12 children
  {fn:'Lily',ln:'Whitfield',dob:'2021-06-18',g:'F',lang:'English',room:'room-koalas',allergy:null},
  {fn:'Omar',ln:'Khalil',dob:'2021-09-22',g:'M',lang:'Arabic',room:'room-koalas',allergy:null},
  {fn:'Scarlett',ln:'Howard',dob:'2022-01-05',g:'F',lang:'English',room:'room-koalas',allergy:null},
  {fn:'Zac',ln:'Moretti',dob:'2021-07-14',g:'M',lang:'Italian',room:'room-koalas',allergy:null},
  {fn:'Eloise',ln:'Dubois',dob:'2021-11-27',g:'F',lang:'French',room:'room-koalas',allergy:null},
  {fn:'Kian',ln:"O'Dowd",dob:'2021-05-09',g:'M',lang:'English',room:'room-koalas',allergy:'Coeliac disease'},
  {fn:'Ayla',ln:'Bayraktar',dob:'2022-02-20',g:'F',lang:'Turkish',room:'room-koalas',allergy:null},
  {fn:'Charlie',ln:'Thomson',dob:'2021-08-03',g:'M',lang:'English',room:'room-koalas',allergy:null},
  {fn:'Nadia',ln:'Ivanovic',dob:'2021-10-16',g:'F',lang:'Serbian',room:'room-koalas',allergy:null},
  {fn:'Ethan',ln:'Russo',dob:'2021-12-30',g:'M',lang:'Italian',room:'room-koalas',allergy:null},
  {fn:'Maisie',ln:'Fitzgerald',dob:'2022-03-28',g:'F',lang:'English',room:'room-koalas',allergy:null},
  {fn:'Dhruv',ln:'Mehta',dob:'2021-06-02',g:'M',lang:'Hindi',room:'room-koalas',allergy:null},
  // Joeys (Pre-K) — 10 children
  {fn:'Charlotte',ln:'Nguyen',dob:'2021-02-15',g:'F',lang:'Vietnamese',room:'room-joeys',allergy:null},
  {fn:'Jack',ln:'Anderson',dob:'2020-11-28',g:'M',lang:'English',room:'room-joeys',allergy:null},
  {fn:'Sienna',ln:'Rizzo',dob:'2021-04-09',g:'F',lang:'Italian',room:'room-joeys',allergy:null},
  {fn:'Levi',ln:'Taufa',dob:'2021-01-22',g:'M',lang:'Tongan',room:'room-joeys',allergy:null},
  {fn:'Ava',ln:'MacGregor',dob:'2020-12-05',g:'F',lang:'English',room:'room-joeys',allergy:null},
  {fn:'Elias',ln:'Mitropoulos',dob:'2021-06-18',g:'M',lang:'Greek',room:'room-joeys',allergy:null},
  {fn:'Zoe',ln:'Ramirez',dob:'2021-03-30',g:'F',lang:'Spanish',room:'room-joeys',allergy:null},
  {fn:'Isaac',ln:'Worthington',dob:'2020-10-14',g:'M',lang:'English',room:'room-joeys',allergy:null},
  {fn:'Noor',ln:'Abdi',dob:'2021-07-21',g:'F',lang:'Somali',room:'room-joeys',allergy:null},
  {fn:'Owen',ln:'Sullivan',dob:'2021-05-03',g:'M',lang:'English',room:'room-joeys',allergy:null},
  // Wallabies (Pre-K) — 10 children
  {fn:'Phoebe',ln:'Leung',dob:'2021-01-10',g:'F',lang:'Cantonese',room:'room-wallabies',allergy:null},
  {fn:'Riley',ln:'Carr',dob:'2020-11-15',g:'M',lang:'English',room:'room-wallabies',allergy:null},
  {fn:'Lucia',ln:'Di Stefano',dob:'2021-05-22',g:'F',lang:'Italian',room:'room-wallabies',allergy:null},
  {fn:'Hunter',ln:'Dawson',dob:'2020-12-30',g:'M',lang:'English',room:'room-wallabies',allergy:null},
  {fn:'Maya',ln:'Samuels',dob:'2021-03-17',g:'F',lang:'English',room:'room-wallabies',allergy:null,indigenous:1},
  {fn:'Toby',ln:'McAllister',dob:'2021-06-08',g:'M',lang:'English',room:'room-wallabies',allergy:null},
  {fn:'Amira',ln:'Fayed',dob:'2021-02-25',g:'F',lang:'Arabic',room:'room-wallabies',allergy:null},
  {fn:'Jayden',ln:'Tuivaga',dob:'2020-10-20',g:'M',lang:'Samoan',room:'room-wallabies',allergy:null},
  {fn:'Heidi',ln:'Schmidt',dob:'2021-04-14',g:'F',lang:'German',room:'room-wallabies',allergy:null},
  {fn:'Beau',ln:'Atkinson',dob:'2021-07-01',g:'M',lang:'English',room:'room-wallabies',allergy:null},
  // Kookaburras (Pre-K) — 10 children
  {fn:'Sophie',ln:'Lawson',dob:'2021-02-08',g:'F',lang:'English',room:'room-kookaburras',allergy:null},
  {fn:'Aiden',ln:'Chung',dob:'2020-11-22',g:'M',lang:'Korean',room:'room-kookaburras',allergy:null},
  {fn:'Isabella',ln:'Rossi',dob:'2021-04-19',g:'F',lang:'Italian',room:'room-kookaburras',allergy:null},
  {fn:'Caleb',ln:'Wilson',dob:'2021-01-03',g:'M',lang:'English',room:'room-kookaburras',allergy:null},
  {fn:'Zahra',ln:'Ahmadi',dob:'2020-12-17',g:'F',lang:'Dari',room:'room-kookaburras',allergy:null},
  {fn:'Liam',ln:'Fletcher',dob:'2021-06-25',g:'M',lang:'English',room:'room-kookaburras',allergy:null},
  {fn:'Tia',ln:'Wharepapa',dob:'2021-03-12',g:'F',lang:'Maori',room:'room-kookaburras',allergy:null},
  {fn:'Mason',ln:'Gray',dob:'2020-10-28',g:'M',lang:'English',room:'room-kookaburras',allergy:null},
  {fn:'Alina',ln:'Petrov',dob:'2021-05-06',g:'F',lang:'Russian',room:'room-kookaburras',allergy:null},
  {fn:'Eli',ln:'Brennan',dob:'2021-07-30',g:'M',lang:'English',room:'room-kookaburras',allergy:null},
];

const childIds = [];
const childByName = {};
for (const c of CHILDREN) {
  const id = uuid();
  childIds.push(id);
  childByName[c.fn + ' ' + c.ln] = id;
  db.prepare(`INSERT INTO children (id,tenant_id,first_name,last_name,dob,gender,language,room_id,allergies,enrolled_date,indigenous,active,doctor_name,doctor_phone,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id,T,c.fn,c.ln,c.dob,c.g,c.lang,c.room,c.allergy||null,addDays(today,-Math.floor(Math.random()*365+60)),c.indigenous||0,1,
      'Dr '+['Smith','Patel','Nguyen','Brown','Lee','Chen','Sharma','Wilson'][Math.floor(Math.random()*8)],
      '02 9'+Math.floor(1000+Math.random()*9000)+' '+Math.floor(1000+Math.random()*9000),now());
  // Parent contact
  db.prepare('INSERT OR IGNORE INTO parent_contacts (id,tenant_id,child_id,name,relationship,phone,email,is_primary,created_at) VALUES(?,?,?,?,?,?,?,1,?)')
    .run(uuid(),T,id,c.ln+' Family','parent','04'+Math.floor(10000000+Math.random()*90000000),c.fn.toLowerCase()+'.parent@email.com',now());
}
console.log('  ✓', CHILDREN.length, 'children +', CHILDREN.length, 'parent contacts');

// ── STEP 4: Medical Plans ─────────────────────────────────────────────────────
console.log('\n[4/12] Creating medical plans & medications...');
const medPlans = [
  { child: 'Jai Kapoor', type: 'anaphylaxis', condition: 'Peanut Anaphylaxis', severity: 'severe', triggers: 'Peanuts, tree nuts, peanut oil, peanut butter', symptoms: 'Hives, swelling, difficulty breathing, loss of consciousness', actions: '1. Remove allergen. 2. Lay child flat. 3. Administer EpiPen Jr (thigh). 4. Call 000. 5. Call parent.', meds: 'EpiPen Jr 0.15mg x2 (RED BAG in Ladybirds fridge)', doctor: 'Dr Anika Desai', dphone: '02 9522 4567' },
  { child: 'Arjun Nair', type: 'anaphylaxis', condition: 'Egg Anaphylaxis', severity: 'severe', triggers: 'Eggs (all forms), egg products, mayonnaise, some vaccines', symptoms: 'Facial swelling, vomiting, wheeze, anaphylaxis', actions: '1. Remove allergen. 2. Administer EpiPen Jr. 3. Call 000. 4. Call parent.', meds: 'EpiPen Jr 0.15mg x1 (Possums first aid kit)', doctor: 'Dr Sanjay Menon', dphone: '02 9524 2345' },
  { child: 'Archer Davies', type: 'asthma', condition: 'Childhood Asthma', severity: 'moderate', triggers: 'Exercise, cold air, pollen, dust', symptoms: 'Coughing, wheezing, chest tightness, shortness of breath', actions: '1. Sit upright. 2. 4 puffs Ventolin via spacer. 3. Wait 4 min. 4. Repeat if needed. 5. Call 000 if no improvement.', meds: 'Ventolin HFA 100mcg + spacer (Ladybirds first aid box)', doctor: 'Dr Peter Llewelyn', dphone: '02 9527 6789' },
  { child: 'Kian O\'Dowd', type: 'allergy', condition: 'Coeliac Disease', severity: 'moderate', triggers: 'Gluten (wheat, barley, rye, oats)', symptoms: 'Abdominal pain, bloating, diarrhoea, fatigue', actions: '1. Strict gluten-free diet. 2. Separate utensils. 3. Do not share food. 4. Notify kitchen.', meds: 'No medications — dietary management only', doctor: 'Dr Claire Hartigan', dphone: '02 9540 8000' },
  { child: 'Charlotte Reeves', type: 'skin', condition: 'Atopic Eczema', severity: 'mild', triggers: 'Dry skin, heat, fragranced products, chlorine', symptoms: 'Red dry patches, itching, cracked skin', actions: '1. Apply QV Cream morning and afternoon. 2. Use fragrance-free soap/sunscreen. 3. Cotton clothing preferred.', meds: 'QV Cream 500g (in Dragonflies cupboard)', doctor: 'Dr Raj Kulkarni', dphone: '02 9588 5678' },
];
for (const m of medPlans) {
  const cid = childByName[m.child];
  if (!cid) { console.log('  ⚠ Child not found:', m.child); continue; }
  db.prepare(`INSERT INTO medical_plans (id,tenant_id,child_id,plan_type,condition_name,severity,triggers,symptoms,action_steps,medications,doctor_name,doctor_phone,review_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uuid(),T,cid,m.type,m.condition,m.severity,m.triggers,m.symptoms,m.actions,m.meds,m.doctor,m.dphone,addDays(today,180),'current',now(),now());
}
// Medications
const meds = [
  { child: 'Jai Kapoor', name: 'EpiPen Jr', dosage: '0.15mg', freq: 'As needed (anaphylaxis only)', route: 'intramuscular', reason: 'Peanut anaphylaxis', storage: 'refrigerated', refrig: 1, expiry: addDays(today, 200) },
  { child: 'Arjun Nair', name: 'EpiPen Jr', dosage: '0.15mg', freq: 'As needed (anaphylaxis only)', route: 'intramuscular', reason: 'Egg anaphylaxis', storage: 'room_temperature', refrig: 0, expiry: addDays(today, 300) },
  { child: 'Archer Davies', name: 'Ventolin HFA', dosage: '100mcg x 4 puffs', freq: 'As needed', route: 'inhalation via spacer', reason: 'Asthma', storage: 'room_temperature', refrig: 0, expiry: addDays(today, 150) },
  { child: 'Charlotte Reeves', name: 'QV Cream', dosage: 'Apply liberally', freq: 'Twice daily (AM and PM)', route: 'topical', reason: 'Eczema', storage: 'room_temperature', refrig: 0, expiry: addDays(today, 365) },
];
for (const m of meds) {
  const cid = childByName[m.child]; if (!cid) continue;
  db.prepare('INSERT INTO medications (id,tenant_id,child_id,name,dosage,frequency,route,reason,storage,requires_refrigeration,expiry_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(uuid(),T,cid,m.name,m.dosage,m.freq,m.route,m.reason,m.storage,m.refrig,m.expiry,'active',now(),now());
}
console.log('  ✓', medPlans.length, 'medical plans,', meds.length, 'medications');

// ── STEP 5: Immunisations ─────────────────────────────────────────────────────
console.log('\n[5/12] Creating immunisation records...');
let immCount = 0;
// 3 children with immunisations due soon
const immDueSoon = [
  { child: 'Leo Zhang', vaccine: 'Hexavalent (DTaP-IPV-Hib-HepB)', dose: 3, given: addDays(today, -120), next: addDays(today, 14), status: 'due_soon' },
  { child: 'Zara Singh', vaccine: 'Meningococcal B', dose: 2, given: addDays(today, -90), next: addDays(today, 7), status: 'due_soon' },
  { child: 'Oscar Campbell', vaccine: 'MMR', dose: 1, given: null, next: addDays(today, 21), status: 'due_soon' },
];
for (const imm of immDueSoon) {
  const cid = childByName[imm.child]; if (!cid) continue;
  db.prepare('INSERT INTO immunisation_records (id,tenant_id,child_id,vaccine_name,dose_number,date_given,next_due_date,status,given,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(uuid(),T,cid,imm.vaccine,imm.dose,imm.given,imm.next,imm.status,imm.given?1:0,now());
  immCount++;
}
// Baseline immunisations for a sample of other children (first 30)
const baseVaccines = ['Hepatitis B','DTaP-IPV-Hib-HepB','Rotavirus','PCV13','MMR','Varicella','Meningococcal ACWY'];
for (let i = 0; i < Math.min(30, childIds.length); i++) {
  const numVax = 3 + Math.floor(Math.random() * 4);
  for (let v = 0; v < numVax; v++) {
    const vax = baseVaccines[v % baseVaccines.length];
    db.prepare('INSERT INTO immunisation_records (id,tenant_id,child_id,vaccine_name,dose_number,date_given,next_due_date,status,given,created_at) VALUES(?,?,?,?,?,?,?,?,1,?)')
      .run(uuid(),T,childIds[i],vax,v+1,addDays(today,-Math.floor(Math.random()*365+30)),null,'current',now());
    immCount++;
  }
}
console.log('  ✓', immCount, 'immunisation records (3 due soon)');

// ── STEP 6: Attendance ────────────────────────────────────────────────────────
console.log('\n[6/12] Creating attendance history (last 30 days)...');
let attCount = 0;
for (let d = -30; d <= 0; d++) {
  const date = addDays(today, d);
  const dow = new Date(date + 'T12:00:00').getDay();
  if (dow === 0 || dow === 6) continue; // skip weekends
  for (const cid of childIds) {
    if (Math.random() < 0.12) continue; // ~12% absence rate
    const signIn = `${6 + Math.floor(Math.random() * 2)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;
    const signOut = `${15 + Math.floor(Math.random() * 3)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;
    const hrs = ((parseInt(signOut) - parseInt(signIn)) + (parseInt(signOut.split(':')[1]) - parseInt(signIn.split(':')[1])) / 60).toFixed(1);
    try {
      db.prepare('INSERT OR IGNORE INTO attendance_sessions (id,tenant_id,child_id,date,sign_in,sign_out,hours,absent,created_at) VALUES(?,?,?,?,?,?,?,0,?)')
        .run(uuid(),T,cid,date,signIn,signOut,parseFloat(hrs)||8,now());
      attCount++;
    } catch (e) {}
  }
}
console.log('  ✓', attCount, 'attendance records');

// ── STEP 7: Daily Updates ─────────────────────────────────────────────────────
console.log('\n[7/12] Creating daily updates (last 14 days)...');
let duCount = 0;
const categories = ['meal','sleep','activity','toileting','general'];
const mealNotes = ['Ate all lunch enthusiastically','Good appetite today - seconds of pasta','Mostly ate - left vegetables','Loved fruit salad at morning tea','Drank water well, ate half sandwich'];
const sleepNotes = ['Settled quickly, slept 1.5 hours','Took 20 mins to settle, 1hr sleep','Rested quietly but did not sleep','Deep sleep for 2 hours','Brief nap 40 mins'];
const actNotes = ['Enjoyed painting at easel','Built tower with blocks - very proud','Loved outdoor sandbox play','Participated in group singing','Explored sensory table with interest'];
for (let d = -14; d <= 0; d++) {
  const date = addDays(today, d);
  const dow = new Date(date + 'T12:00:00').getDay();
  if (dow === 0 || dow === 6) continue;
  // 20 random children per day
  const sample = [...childIds].sort(() => Math.random() - 0.5).slice(0, 20);
  for (const cid of sample) {
    const cat = categories[Math.floor(Math.random() * categories.length)];
    const notes = cat === 'meal' ? mealNotes : cat === 'sleep' ? sleepNotes : actNotes;
    db.prepare('INSERT INTO daily_updates (id,tenant_id,child_id,educator_id,update_date,category,notes,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(uuid(),T,cid,edIds[Math.floor(Math.random()*edIds.length)],date,cat,notes[Math.floor(Math.random()*notes.length)],now());
    duCount++;
  }
}
console.log('  ✓', duCount, 'daily updates');

// ── STEP 8: Observations / Learning Stories ───────────────────────────────────
console.log('\n[8/12] Creating observations & learning stories...');
let obsCount = 0;
const obsTypes = ['learning_story','observation','jotting'];
const obsNarrs = [
  'Today {name} demonstrated strong social skills during group play, initiating conversations with peers and sharing resources willingly.',
  '{name} showed great concentration during the counting activity, correctly identifying numbers 1-10 and attempting to write them independently.',
  'During outdoor play, {name} climbed the A-frame for the first time showing wonderful persistence and gross motor development.',
  '{name} engaged in creative storytelling using the puppet theatre, creating elaborate narratives with multiple characters.',
  '{name} showed empathy towards a friend who was upset, offering comfort and suggesting they play together.',
  'Wonderful problem-solving today — {name} worked out how to balance blocks to build a bridge without adult assistance.',
  '{name} expressed excitement about discovering worms in the garden, asking thoughtful questions about how they live underground.',
  '{name} painted a picture of their family and was able to name each person, demonstrating strong identity and belonging.',
];
for (let i = 0; i < 40; i++) {
  const cid = childIds[Math.floor(Math.random() * childIds.length)];
  const c = CHILDREN[childIds.indexOf(cid)];
  const narr = obsNarrs[i % obsNarrs.length].replace('{name}', c?.fn || 'Child');
  db.prepare(`INSERT INTO observations (id,tenant_id,child_id,educator_id,type,narrative,domains,eylf_outcomes,follow_up,timestamp) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(uuid(),T,cid,edIds[Math.floor(Math.random()*edIds.length)],obsTypes[i%3],narr,
      JSON.stringify(['social','language','cognitive'].slice(0,1+Math.floor(Math.random()*3))),
      JSON.stringify(['1.1','2.1','4.1','5.1'].slice(0,1+Math.floor(Math.random()*3))),
      i%4===0?'Continue to extend through intentional teaching':'',
      addDays(today,-Math.floor(Math.random()*60))+'T10:00:00');
  obsCount++;
}
console.log('  ✓', obsCount, 'observations');

// ── STEP 9: Incidents ─────────────────────────────────────────────────────────
console.log('\n[9/12] Creating incidents...');
const incidents = [
  { child: 'Lachlan Stewart', type: 'incident', sev: 'minor', title: 'Fall from outdoor equipment', desc: 'Lachlan slipped while climbing the A-frame and grazed his left knee. Cold compress applied, small bandaid placed. Lachlan settled quickly and continued playing.', loc: 'Outdoor playground', fa: 1, fad: 'Cold compress, bandaid to left knee' },
  { child: 'Poppy Chen', type: 'incident', sev: 'minor', title: 'Bumped heads during play', desc: 'Poppy and Harrison bumped heads while both reaching for the same toy. Ice pack applied to forehead. No swelling observed after 15 minutes.', loc: 'Possums room', fa: 1, fad: 'Ice pack to forehead' },
  { child: 'Koby Watene', type: 'behavioural', sev: 'low', title: 'Difficulty with transitions', desc: 'Koby became upset when asked to pack away blocks before lunch. Educator used calm voice and visual timer. Koby responded well to the 5-minute warning strategy.', loc: 'Caterpillars room', fa: 0, fad: null },
  { child: null, type: 'near_miss', sev: 'moderate', title: 'Gate left unlatched', desc: 'The front gate was found unlatched at 8:15am by Megan Holliday. No children were in the vicinity. Gate was immediately secured. Maintenance request lodged for self-closing mechanism.', loc: 'Front entrance', fa: 0, fad: null },
  { child: 'Ivy Nakamura', type: 'incident', sev: 'minor', title: 'Allergic reaction to face paint', desc: 'Ivy developed a mild rash on her cheek after face painting activity. Area washed with water. Rash subsided within 30 minutes. Parent notified at pickup.', loc: 'Butterflies room', fa: 1, fad: 'Washed affected area, cold compress' },
];
for (const inc of incidents) {
  const cid = inc.child ? childByName[inc.child] : null;
  db.prepare(`INSERT INTO incidents (id,tenant_id,child_id,type,severity,title,description,location,reported_by,parent_notified,first_aid_given,first_aid_details,status,date,time,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uuid(),T,cid,inc.type,inc.sev,inc.title,inc.desc,inc.loc,edIds[0],1,inc.fa?1:0,inc.fad,'closed',addDays(today,-Math.floor(Math.random()*30)),'10:'+String(Math.floor(Math.random()*60)).padStart(2,'0'),now(),now());
}
console.log('  ✓', incidents.length, 'incidents');

// ── STEP 10: Roster Periods & Entries ─────────────────────────────────────────
console.log('\n[10/12] Creating roster periods & shifts...');
const rosterPeriods = [
  { start: lastMonday, end: addDays(lastMonday, 4), status: 'published', name: 'Last Week' },
  { start: monday, end: addDays(monday, 4), status: 'approved', name: 'This Week' },
  { start: nextMonday, end: addDays(nextMonday, 4), status: 'draft', name: 'Next Week' },
];
let shiftCount = 0;
for (const rp of rosterPeriods) {
  const pid = uuid();
  db.prepare(`INSERT INTO roster_periods (id,tenant_id,period_type,start_date,end_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`)
    .run(pid,T,'weekly',rp.start,rp.end,rp.status,now(),now());
  // Create shifts: each educator gets 5 days in their primary room
  for (let di = 0; di < 5; di++) {
    const date = addDays(rp.start, di);
    for (let ei = 0; ei < EDUCATORS.length; ei++) {
      const ed = EDUCATORS[ei];
      if (ed.emp === 'casual' && Math.random() < 0.4) continue; // casuals don't always work
      if (ed.emp === 'part_time' && di > 3) continue; // part-timers work Mon-Thu
      const start = ei < 4 ? '06:30' : ei < 8 ? '07:00' : '08:00';
      const end = ei < 4 ? '15:00' : ei < 8 ? '15:30' : '16:00';
      const sM = parseInt(start)*60+parseInt(start.split(':')[1]||0);
      const eM = parseInt(end)*60+parseInt(end.split(':')[1]||0);
      const costCents = Math.round(((eM-sM-30)/60)*(ed.rate/100)*100);
      db.prepare(`INSERT INTO roster_entries (id,tenant_id,period_id,educator_id,room_id,date,start_time,end_time,break_mins,cost_cents,status,created_at) VALUES(?,?,?,?,?,?,?,?,30,?,?,?)`)
        .run(uuid(),T,pid,edIds[ei],ed.room,date,start,end,costCents,'confirmed',now());
      shiftCount++;
    }
  }
}
console.log('  ✓', rosterPeriods.length, 'periods,', shiftCount, 'shift entries');

// ── STEP 11: Staff Wellbeing ──────────────────────────────────────────────────
console.log('\n[11/12] Creating staff wellbeing & leave data...');
for (let d = -14; d <= 0; d += 7) {
  for (const eid of edIds.slice(0, 10)) {
    db.prepare('INSERT INTO staff_wellbeing (id,tenant_id,user_id,date,energy_level,stress_level,workload_rating,support_rating,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(uuid(),T,eid,addDays(today,d),3+Math.floor(Math.random()*3),2+Math.floor(Math.random()*3),3+Math.floor(Math.random()*2),3+Math.floor(Math.random()*2),'',now());
  }
}
// Leave requests
const leaveTypes = ['annual','personal','sick','study'];
for (let i = 0; i < 5; i++) {
  const eid = edIds[Math.floor(Math.random() * 10)];
  const startD = addDays(today, 5 + Math.floor(Math.random() * 30));
  db.prepare('INSERT INTO leave_requests (id,tenant_id,educator_id,leave_type,start_date,end_date,days_requested,reason,status,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(uuid(),T,eid,leaveTypes[i%4],startD,addDays(startD,Math.floor(Math.random()*3)),1+Math.floor(Math.random()*3),'Personal leave request',i<2?'pending':'approved','',now());
}
console.log('  ✓ Wellbeing check-ins + 5 leave requests');

// ── STEP 12: Compliance Items ─────────────────────────────────────────────────
console.log('\n[12/12] Creating compliance alerts...');
const compItems = [
  { cat:'educator',type:'wwcc_expiring',label:'WWCC Expiring — Chloe Papadimitriou',exp:addDays(today,21),days:21,status:'expiring',child:edIds[11] },
  { cat:'educator',type:'wwcc_expiring',label:'WWCC Expiring — Ryan Gallagher',exp:addDays(today,24),days:24,status:'expiring',child:edIds[12] },
  { cat:'immunisation',type:'immunisation_due',label:'Hexavalent dose 3 — Leo Zhang',exp:addDays(today,14),days:14,status:'due_soon',child:childByName['Leo Zhang'] },
  { cat:'immunisation',type:'immunisation_due',label:'Meningococcal B dose 2 — Zara Singh',exp:addDays(today,7),days:7,status:'due_soon',child:childByName['Zara Singh'] },
  { cat:'immunisation',type:'immunisation_due',label:'MMR dose 1 — Oscar Campbell',exp:addDays(today,21),days:21,status:'due_soon',child:childByName['Oscar Campbell'] },
  { cat:'medical',type:'medical_plan_review',label:'Anaphylaxis plan review — Jai Kapoor',exp:addDays(today,45),days:45,status:'current',child:childByName['Jai Kapoor'] },
  { cat:'medical',type:'medication_expiry',label:'Ventolin HFA expiry — Archer Davies',exp:addDays(today,150),days:150,status:'current',child:childByName['Archer Davies'] },
];
for (const ci of compItems) {
  db.prepare('INSERT INTO compliance_items (id,tenant_id,child_id,category,item_type,item_label,status,expiry_date,days_until_expiry,auto_resolved,created_at) VALUES(?,?,?,?,?,?,?,?,?,0,?)')
    .run(uuid(),T,ci.child||childIds[0],ci.cat,ci.type,ci.label,ci.status,ci.exp,ci.days,now());
}
console.log('  ✓', compItems.length, 'compliance alerts');

// ── DONE ──────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  ✅ Seeding complete!');
console.log('  • 9 rooms, 15 educators, 96 children');
console.log('  • 5 medical plans, 4 medications');
console.log('  • 3 immunisations due soon, 2 WWCCs expiring');
console.log('  • 3 roster periods with shifts');
console.log('  • Attendance, daily updates, observations, incidents');
console.log('═══════════════════════════════════════════════════════════');

db.close();
