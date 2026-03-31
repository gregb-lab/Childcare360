// ═══════════════════════════════════════════════════════════════════════════
//  Childcare360 — Rich Demo Data Seeder  (v1.9.6)
//  Run: node server/seed-rich.js   (from app root)
//  Safe to re-run — uses INSERT OR IGNORE throughout
// ═══════════════════════════════════════════════════════════════════════════

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'data', 'childcare360.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

const TENANT = 'demo-tenant-001';
const ADMIN_USER = 'demo-admin-001';

const today = new Date().toISOString().split('T')[0];
const monday = (() => {
  const d = new Date(); const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().split('T')[0];
})();
const addDays = (base, n) => {
  const d = new Date(base + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
};
const lastMonday  = addDays(monday, -7);
const prevMonday  = addDays(monday, -14);
const nextMonday  = addDays(monday,  7);

console.log('\n🌱 Childcare360 — Rich Seed (v1.9.6)');
console.log('   Today:', today, '| This week:', monday);

const existingChildren  = db.prepare("SELECT id,first_name,last_name,room_id,dob FROM children WHERE tenant_id=? AND active=1 ORDER BY rowid").all(TENANT);
const existingEducators = db.prepare("SELECT id,first_name,last_name,qualification,hourly_rate_cents FROM educators WHERE tenant_id=? ORDER BY rowid").all(TENANT);
const existingRooms     = db.prepare("SELECT id,name,age_group FROM rooms WHERE tenant_id=?").all(TENANT);
const childMap  = Object.fromEntries(existingChildren.map(c => [`${c.first_name} ${c.last_name}`, c]));
const allEdIds  = existingEducators.map(e => e.id);
const roomIds   = ['room-joeys','room-possums','room-koalas','room-kookas'];

console.log('  Found:', existingChildren.length, 'children,', existingEducators.length, 'educators,', existingRooms.length, 'rooms\n');

// ── 1. ADDITIONAL CHILDREN ────────────────────────────────────────────────────
const additionalKids = [
  { fn:'Matilda',  ln:'Singh',          dob:'2024-07-12', room:'room-joeys',    al:'None',                         p1:'Arjun Singh',          p1e:'arjun.singh@email.com',   p1p:'0412 444 101', enr:'2025-09-01' },
  { fn:'Henry',    ln:'Kowalski',       dob:'2024-09-03', room:'room-joeys',    al:'Dairy intolerance',            p1:'Marek Kowalski',       p1e:'marek.k2@email.com',      p1p:'0412 444 102', enr:'2025-11-01' },
  { fn:'Zoe',      ln:'Tran',           dob:'2024-11-20', room:'room-joeys',    al:'None',                         p1:'Mai Tran',             p1e:'mai.tran2@email.com',     p1p:'0412 444 103', enr:'2026-01-15' },
  { fn:'Felix',    ln:'Okonkwo',        dob:'2024-06-28', room:'room-joeys',    al:'None',                         p1:'Chidi Okonkwo',        p1e:'chidi.o@email.com',       p1p:'0412 444 104', enr:'2025-08-15' },
  { fn:'Ruby',     ln:'Ahmed',          dob:'2023-02-14', room:'room-possums',  al:'Sesame seeds',                 p1:'Omar Ahmed',           p1e:'omar.a@email.com',        p1p:'0412 444 201', enr:'2025-03-01' },
  { fn:'Archer',   ln:'Brown',          dob:'2022-12-05', room:'room-possums',  al:'None',                         p1:'Sam Brown',            p1e:'sam.b@email.com',         p1p:'0412 444 202', enr:'2025-01-20' },
  { fn:'Poppy',    ln:'Laroche',        dob:'2023-04-22', room:'room-possums',  al:'Tree nuts',                    p1:'Camille Laroche',      p1e:'camille.l2@email.com',    p1p:'0412 444 203', enr:'2025-05-10' },
  { fn:'Connor',   ln:'Murphy',         dob:'2023-01-18', room:'room-possums',  al:'None',                         p1:'Brigid Murphy',        p1e:'brigid.m@email.com',      p1p:'0412 444 204', enr:'2025-02-01' },
  { fn:'Sienna',   ln:'Papadopoulos',   dob:'2023-07-30', room:'room-possums',  al:'None',                         p1:'Demetria Papadopoulos',p1e:'demetria.p@email.com',    p1p:'0412 444 205', enr:'2025-09-15' },
  { fn:'Oscar',    ln:'Fernandez',      dob:'2022-03-10', room:'room-koalas',   al:'Latex allergy',                p1:'Ana Fernandez',        p1e:'ana.f@email.com',         p1p:'0412 444 301', enr:'2024-04-01' },
  { fn:'Charlotte',ln:'Kim',            dob:'2021-11-28', room:'room-koalas',   al:'None',                         p1:'Ji-yeon Kim',          p1e:'jiyeon.k@email.com',      p1p:'0412 444 302', enr:'2024-01-01' },
  { fn:'Hamish',   ln:'MacGregor',      dob:'2022-01-15', room:'room-koalas',   al:'Eczema - fragrance-free only', p1:'Fiona MacGregor',      p1e:'fiona.m@email.com',       p1p:'0412 444 303', enr:'2024-02-15' },
  { fn:'Anika',    ln:'Patel',          dob:'2022-05-08', room:'room-koalas',   al:'None',                         p1:'Vikram Patel',         p1e:'vikram.p@email.com',      p1p:'0412 444 304', enr:'2024-06-01' },
  { fn:'Leo',      ln:'Santos',         dob:'2021-09-25', room:'room-koalas',   al:'None',                         p1:'Carla Santos',         p1e:'carla.s@email.com',       p1p:'0412 444 305', enr:'2023-10-01' },
  { fn:'Billie',   ln:'Foster',         dob:'2022-06-14', room:'room-koalas',   al:'Gluten sensitivity',           p1:'Rachel Foster',        p1e:'rachel.f2@email.com',     p1p:'0412 444 306', enr:'2024-07-15' },
  { fn:'Finn',     ln:'McCarthy',       dob:'2021-02-22', room:'room-kookas',   al:'None',                         p1:'Declan McCarthy',      p1e:'declan.mc@email.com',     p1p:'0412 444 401', enr:'2023-03-01' },
  { fn:'Sophie',   ln:'Nakamura',       dob:'2020-12-01', room:'room-kookas',   al:'None',                         p1:'Yuki Nakamura',        p1e:'yuki.n@email.com',        p1p:'0412 444 402', enr:'2023-01-01' },
  { fn:'Riley',    ln:'Taufa',          dob:'2021-04-17', room:'room-kookas',   al:'None',                         p1:'Siosaia Taufa',        p1e:'siosaia.t2@email.com',    p1p:'0412 444 403', enr:'2023-05-01' },
  { fn:'Chloe',    ln:'Okafor',         dob:'2021-08-09', room:'room-kookas',   al:'Soy intolerance',              p1:'Emeka Okafor',         p1e:'emeka.o@email.com',       p1p:'0412 444 404', enr:'2023-09-01' },
  { fn:'Angus',    ln:'Reid',           dob:'2020-11-30', room:'room-kookas',   al:'Bee sting - EpiPen carried',   p1:'Fiona Reid',           p1e:'fiona.r@email.com',       p1p:'0412 444 405', enr:'2022-12-01' },
  { fn:'Isabelle', ln:'Nguyen',         dob:'2021-06-03', room:'room-kookas',   al:'None',                         p1:'Thi Nguyen',           p1e:'thi.n2@email.com',        p1p:'0412 444 406', enr:'2023-07-01' },
];

let kidsAdded = 0;
additionalKids.forEach(k => {
  const ex = db.prepare("SELECT id FROM children WHERE tenant_id=? AND first_name=? AND last_name=?").get(TENANT, k.fn, k.ln);
  if (ex) return;
  const cid = randomUUID();
  db.prepare('INSERT OR IGNORE INTO children (id,tenant_id,first_name,last_name,dob,room_id,allergies,enrolled_date,active) VALUES(?,?,?,?,?,?,?,?,1)')
    .run(cid, TENANT, k.fn, k.ln, k.dob, k.room, k.al, k.enr);
  db.prepare('INSERT OR IGNORE INTO parent_contacts (id,tenant_id,child_id,name,relationship,email,phone,is_primary,receives_notifications) VALUES(?,?,?,?,?,?,?,1,1)')
    .run(randomUUID(), TENANT, cid, k.p1, 'parent', k.p1e, k.p1p);
  kidsAdded++;
});
const allChildren = db.prepare("SELECT id,first_name,last_name,room_id,dob FROM children WHERE tenant_id=? AND active=1 ORDER BY rowid").all(TENANT);
const allChildMap = Object.fromEntries(allChildren.map(c => [`${c.first_name} ${c.last_name}`, c]));
console.log('  [1/12] Children:', allChildren.length, 'total (added', kidsAdded, 'new)');

// ── 2. MEDICAL PLANS ─────────────────────────────────────────────────────────
const medPlansData = [
  { child:'Olivia Chen',    type:'anaphylaxis', title:'Anaphylaxis Action Plan - Olivia Chen',
    triggers:'Peanuts (all forms), tree nuts, peanut oil',
    symptoms:'Hives, facial swelling, vomiting, difficulty breathing, collapse',
    action:'1. Lay child flat\n2. Administer EpiPen Jr to outer thigh\n3. Call 000\n4. Second EpiPen after 5 mins if no improvement\n5. Contact parents\n6. Do NOT substitute antihistamine',
    medications:'EpiPen Jr x2 (Possums room fridge - RED BAG)', doctor:'Dr Amanda Lowe, Cronulla Medical Centre, 02 9527 1234', review:addDays(today,180) },
  { child:'Noah Williams',  type:'asthma', title:'Asthma Action Plan - Noah Williams',
    triggers:'Exercise, cold air, dust, smoke, pollen',
    symptoms:'Wheeze, cough, shortness of breath, chest tightness',
    action:'1. Sit upright, stay calm\n2. 4 puffs Ventolin via spacer\n3. Wait 4 mins - if no improvement 4 more puffs\n4. If no improvement - CALL 000\n5. Contact parents',
    medications:'Ventolin HFA 100mcg + spacer (Kookaburras first aid box)', doctor:'Dr Peter Nguyen, Caringbah Family Practice, 02 9524 5678', review:addDays(today,365) },
  { child:'Jack OBrien',    type:'allergy', title:'Bee/Wasp Sting Allergy Plan - Jack OBrien',
    triggers:'Bee and wasp stings',
    symptoms:'Local swelling, hives, risk of anaphylaxis',
    action:'1. Remove sting by scraping\n2. Apply ice pack\n3. If spreading hives - administer antihistamine\n4. If airway symptoms - treat as anaphylaxis, call 000',
    medications:'Claratyne Syrup (Kookaburras first aid box)', doctor:'Dr Lisa Park, Sutherland Hospital Allergy Clinic, 02 9540 7777', review:addDays(today,365) },
  { child:'Angus Reid',     type:'anaphylaxis', title:'Anaphylaxis Action Plan - Angus Reid (Bee Sting)',
    triggers:'Bee stings, wasp stings',
    symptoms:'Rapid swelling, hives, throat tightening, collapse',
    action:'1. Remove stinger (scrape sideways)\n2. Administer EpiPen Jr immediately\n3. Call 000\n4. Lie flat, legs elevated\n5. Contact parents: Fiona Reid 0412 444 405',
    medications:'EpiPen Jr (carried by child in red pouch)', doctor:'Dr James Morrison, Caringbah Allergy Clinic, 02 9524 9000', review:addDays(today,270) },
  { child:'Hamish MacGregor',type:'skin', title:'Eczema Management Plan - Hamish MacGregor',
    triggers:'Fragrant products, heat, wool, stress',
    symptoms:'Red, itchy, dry or cracked skin on arms, legs, face',
    action:'1. Apply QV Cream twice daily\n2. Use only fragrance-free sunscreen\n3. Do NOT use scented soaps or wipes\n4. If skin breaks - document and notify parents',
    medications:'QV Cream (provided by parents), Egoderm if flare (office)', doctor:'Dr Sonia Mehta, Dermatologist, Kogarah, 02 9588 1234', review:addDays(today,180) },
];

let mpAdded = 0;
medPlansData.forEach(mp => {
  const c = allChildMap[mp.child]; if (!c) return;
  const ex = db.prepare("SELECT id FROM medical_plans WHERE child_id=? AND plan_type=?").get(c.id, mp.type);
  if (ex) return;
  try {
    db.prepare("INSERT OR IGNORE INTO medical_plans (id,tenant_id,child_id,plan_type,condition_name,severity,triggers,symptoms,action_steps,medications,doctor_name,review_date,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'current',?,datetime('now'),datetime('now'))")
      .run(randomUUID(),TENANT,c.id,mp.type,mp.title,'moderate',
        JSON.stringify([mp.triggers]),JSON.stringify([mp.symptoms]),
        JSON.stringify(mp.action.split('\n')),JSON.stringify([mp.medications]),
        mp.doctor,mp.review,'');
    mpAdded++;
  } catch(e) { console.error('  medplan err:', e.message); }
});
console.log('  [2/12] Medical plans:', mpAdded, 'added');

// ── 3. MEDICATIONS ───────────────────────────────────────────────────────────
const medsData = [
  { child:'Olivia Chen',    name:'EpiPen Jr (Primary)',             dosage:'0.15mg single dose', freq:'As needed - anaphylaxis only',         route:'intramuscular', reason:'Peanut anaphylaxis',         rx:1, refrig:1, expiry:addDays(today,180) },
  { child:'Olivia Chen',    name:'EpiPen Jr (Backup)',              dosage:'0.15mg single dose', freq:'Backup - use if primary unavailable',  route:'intramuscular', reason:'Peanut anaphylaxis backup',   rx:1, refrig:1, expiry:addDays(today,120) },
  { child:'Noah Williams',  name:'Ventolin HFA 100mcg',             dosage:'4 puffs via spacer', freq:'As per asthma action plan',            route:'inhaled',       reason:'Asthma',                      rx:1, refrig:0, expiry:addDays(today,365) },
  { child:'Jack OBrien',    name:'Claratyne Syrup 1mg/mL',          dosage:'5mL',                freq:'Once daily or as needed for reaction', route:'oral',          reason:'Bee sting allergy',           rx:0, refrig:0, expiry:addDays(today,270) },
  { child:'Ava Nguyen',     name:'Lacteeze Drops',                  dosage:'3 drops per feed',   freq:'As needed with dairy',                route:'oral',          reason:'Lactase deficiency',          rx:0, refrig:1, expiry:addDays(today,90) },
  { child:'Ava Nguyen',     name:'EpiPen Jr (Precautionary)',       dosage:'0.15mg single dose', freq:'As needed - severe allergic reaction', route:'intramuscular', reason:'Dairy allergy - precautionary',rx:1, refrig:1, expiry:addDays(today,12) },
  { child:'Angus Reid',     name:'EpiPen Jr (Carried)',             dosage:'0.15mg single dose', freq:'As needed - anaphylaxis only',         route:'intramuscular', reason:'Bee sting anaphylaxis',       rx:1, refrig:0, expiry:addDays(today,270) },
  { child:'Hamish MacGregor',name:'QV Intensive Moisturiser',       dosage:'Apply liberally',    freq:'Twice daily',                         route:'topical',       reason:'Eczema management',           rx:0, refrig:0, expiry:addDays(today,300) },
  { child:'Hamish MacGregor',name:'Egoderm Ointment 0.5%',          dosage:'Thin layer to affected areas', freq:'Flare-ups only as directed',  route:'topical',       reason:'Eczema acute flare',          rx:1, refrig:0, expiry:addDays(today,365) },
];

let medsAdded = 0;
medsData.forEach(m => {
  const c = allChildMap[m.child]; if (!c) return;
  const ex = db.prepare("SELECT id FROM medications WHERE child_id=? AND name=?").get(c.id, m.name);
  if (ex) return;
  try {
    db.prepare("INSERT INTO medications (id,tenant_id,child_id,name,dosage,frequency,route,reason,storage,requires_refrigeration,parent_consent,consent_date,expiry_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?,'active',datetime('now'),datetime('now'))")
      .run(randomUUID(),TENANT,c.id,m.name,m.dosage,m.freq,m.route,m.reason,
        m.refrig ? 'refrigerated' : 'room_temperature',
        m.refrig, addDays(today,-30), m.expiry);
    medsAdded++;
  } catch(e) { console.error('  med err:', e.message); }
});
console.log('  [3/12] Medications:', medsAdded, 'added');

// ── 4. MEDICATION LOGS ────────────────────────────────────────────────────────
const noahId   = allChildMap['Noah Williams']?.id;
const ventolin = noahId ? db.prepare("SELECT id FROM medications WHERE child_id=? AND name LIKE 'Ventolin%'").get(noahId) : null;
let logsAdded = 0;
if (ventolin) {
  const logs = [
    { t: addDays(today,-14)+' 10:23:00', dose:'4 puffs via spacer', notes:'Mild wheeze during outdoor play. Settled after 10 mins. Parents notified by SMS.' },
    { t: addDays(today,-7)+' 14:05:00',  dose:'4 puffs via spacer', notes:'Post-activity wheeze. Responded well. Parents notified.' },
    { t: addDays(today,-2)+' 09:45:00',  dose:'4 puffs via spacer', notes:'Arrived with existing wheeze — parents advised at drop-off. Monitored all day.' },
  ];
  logs.forEach(l => {
    try {
      db.prepare("INSERT OR IGNORE INTO medication_log (id,tenant_id,child_id,medication_id,administered_by,dose_given,time_given,notes,parent_notified,created_at) VALUES(?,?,?,?,?,?,?,?,1,datetime('now'))")
        .run(randomUUID(),TENANT,noahId,ventolin.id,ADMIN_USER,l.dose,l.t,l.notes);
      logsAdded++;
    } catch(e) {}
  });
}
console.log('  [4/12] Medication logs:', logsAdded, 'added');

// ── 5. IMMUNISATION RECORDS ──────────────────────────────────────────────────
const immunData = [
  { child:'Olivia Chen',    vax:'Hexavalent (DTaP-IPV-Hib-HepB)', dose:3, given:addDays(today,-400), due:null,            status:'current'  },
  { child:'Olivia Chen',    vax:'MMR',                             dose:1, given:addDays(today,-200), due:addDays(today,1095), status:'current' },
  { child:'Liam Patel',     vax:'Hexavalent (DTaP-IPV-Hib-HepB)', dose:2, given:addDays(today,-180), due:addDays(today,30),  status:'due_soon' },
  { child:'Liam Patel',     vax:'Meningococcal B',                 dose:2, given:addDays(today,-180), due:addDays(today,30),  status:'due_soon' },
  { child:'Isla Thompson',  vax:'MMR',                             dose:1, given:addDays(today,-365), due:addDays(today,730), status:'current' },
  { child:'Isla Thompson',  vax:'MMRV',                            dose:2, given:addDays(today,-180), due:null,               status:'current' },
  { child:'Noah Williams',  vax:'DTPa Booster',                    dose:4, given:null,                due:addDays(today,-30), status:'overdue'  },
  { child:'Noah Williams',  vax:'MMR',                             dose:2, given:addDays(today,-400), due:null,               status:'current'  },
  { child:'Ava Nguyen',     vax:'Hexavalent (DTaP-IPV-Hib-HepB)', dose:3, given:addDays(today,-300), due:null,               status:'current'  },
  { child:'Jack OBrien',    vax:'DTPa Booster',                    dose:4, given:addDays(today,-700), due:addDays(today,1200),status:'current'  },
  { child:'Oscar Fernandez',vax:'MMR',                             dose:1, given:addDays(today,-400), due:null,               status:'current'  },
  { child:'Charlotte Kim',  vax:'DTPa Booster',                    dose:4, given:addDays(today,-600), due:null,               status:'current'  },
  { child:'Finn McCarthy',  vax:'MMR',                             dose:2, given:addDays(today,-800), due:null,               status:'current'  },
  { child:'Sophie Nakamura',vax:'MMR',                             dose:2, given:addDays(today,-750), due:null,               status:'current'  },
  { child:'Angus Reid',     vax:'DTPa Booster',                    dose:4, given:addDays(today,-100), due:null,               status:'current'  },
  { child:'Hamish MacGregor',vax:'MMR',                            dose:1, given:addDays(today,-380), due:addDays(today,1100),status:'current'  },
  { child:'Ethan Brown',    vax:'MMR',                             dose:1, given:addDays(today,-420), due:null,               status:'current'  },
  { child:'Mia Garcia',     vax:'Hexavalent (DTaP-IPV-Hib-HepB)', dose:1, given:addDays(today,-90),  due:addDays(today,60),  status:'due_soon' },
];

let immunAdded = 0;
immunData.forEach(im => {
  const c = allChildMap[im.child]; if (!c) return;
  const ex = db.prepare("SELECT id FROM immunisation_records WHERE child_id=? AND vaccine_name=? AND dose_number=?").get(c.id, im.vax, im.dose);
  if (ex) return;
  try {
    db.prepare("INSERT INTO immunisation_records (id,tenant_id,child_id,vaccine_name,dose_number,date_given,next_due_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))")
      .run(randomUUID(),TENANT,c.id,im.vax,im.dose,im.given,im.due,im.status);
    immunAdded++;
  } catch(e) {}
});
console.log('  [5/12] Immunisation records:', immunAdded, 'added');

// ── 6. OBSERVATIONS / LEARNING STORIES ──────────────────────────────────────
const ed0id = existingEducators[0]?.id || ADMIN_USER;
const ed1id = existingEducators[1]?.id || ADMIN_USER;
const ed5id = existingEducators[5]?.id || ADMIN_USER;

const obsData = [
  { child:'Olivia Chen', edId:ed5id, type:'learning_story',
    narrative:'During morning free play, Olivia gathered three children and announced "We\'re making a restaurant!" She assigned roles, negotiating fairly when Connor wanted to be chef: "You can be the head chef and I\'ll be the manager." She spent 35 minutes creating paper menus with drawn food labels, taking orders on a notepad, and preparing playdough dishes. When Archer knocked over the kitchen she calmly helped rebuild it. This demonstrates sophisticated social negotiation, emergent literacy through symbolic writing, and remarkable emotional regulation.',
    domains:'["social","language","literacy","emotional"]', eylf:'["1.1","1.2","3.2","5.1","5.2"]',
    follow_up:'Introduce real menus as provocation. Consider a class restaurant project.',
    ts: addDays(today,-3)+' 10:45:00' },
  { child:'Olivia Chen', edId:ed0id, type:'observation',
    narrative:'Olivia independently selected a counting book and read it to Ruby and Poppy, pointing to numerals. At 7 she said "Seven! That\'s how old I\'ll be when I go to big school — well, not seven, but big." She self-corrected, demonstrating metacognitive awareness. The three girls counted room objects together, with Olivia leading accurate one-to-one correspondence up to 12.',
    domains:'["cognitive","language","numeracy"]', eylf:'["4.1","4.2","5.1"]',
    follow_up:'Provide further numeracy provocations. Olivia shows readiness for number writing.',
    ts: addDays(today,-8)+' 09:20:00' },
  { child:'Noah Williams', edId:ed0id, type:'learning_story',
    narrative:'Noah\'s asthma required him to sit out of vigorous outdoor play. Rather than becoming frustrated, he observed from the veranda, narrating what he saw: "Finn is being a lion now — he was a dragon before. I think he changed because Chloe said there\'s no dragons at school." His running commentary revealed sophisticated theory of mind. After 20 minutes he joined as "zookeeper", naturally adapting the game to suit his energy levels.',
    domains:'["language","social","emotional","cognitive"]', eylf:'["1.4","3.1","5.1","5.2"]',
    follow_up:'Share with parents — demonstrates remarkable resilience. Explore interest in animals.',
    ts: addDays(today,-5)+' 11:30:00' },
  { child:'Liam Patel', edId:ed1id, type:'jotting',
    narrative:'Liam pulled himself to standing using the low shelf today — first time! He stood for approximately 8 seconds before sitting back down, then immediately tried again with great determination. He looked up with a huge grin, clearly proud of himself.',
    domains:'["physical","social"]', eylf:'["1.1","3.1","3.2"]',
    follow_up:'Document as milestone. Share with parents at pickup. Plan environment enhancements for early walking.',
    ts: addDays(today,-2)+' 14:15:00' },
  { child:'Isla Thompson', edId:ed0id, type:'observation',
    narrative:'During watercolour and tissue paper collage, Isla worked for 40 uninterrupted minutes. She deliberately experimented with colour mixing — testing blue and yellow to "make green" on a separate paper before using it. When the result surprised her she said "It went different green than I thought." She produced a detailed landscape using 6 distinct mixed shades. Her concentration and intrinsic motivation were exceptional.',
    domains:'["creative","physical","cognitive","language"]', eylf:'["3.1","4.1","5.1"]',
    follow_up:'Display in room — ask Isla to write about her process. Provide more colour mixing.',
    ts: addDays(today,-6)+' 13:00:00' },
  { child:'Jack OBrien', edId:ed1id, type:'learning_story',
    narrative:'During the STEM challenge (tallest free-standing tower with 20 blocks), Jack immediately used a wide-base strategy. When his tower fell at 14 blocks he paused, studied it, and declared "The bottom needs to be more wider." His second attempt reached 18 blocks. His third attempt used blocks from another pile — "I borrowed from the other pile — it\'s still tallest." When challenged he engaged in animated reasoning about rules. This demonstrates problem-solving persistence, spatial thinking, and emerging fairness concepts.',
    domains:'["cognitive","physical","social","language"]', eylf:'["4.1","4.2","5.1","2.1"]',
    follow_up:'Extend with engineering challenges. Jack shows advanced STEM aptitude.',
    ts: addDays(today,-1)+' 09:50:00' },
  { child:'Oscar Fernandez', edId:ed0id, type:'jotting',
    narrative:'Oscar found a worm on the path and gathered a group. "It\'s sleeping," said Archer. "No, worms don\'t sleep like that, they go underground," Oscar corrected. He carefully placed it in the garden bed with a leaf "so it has a blanket." His empathy for living creatures and habitat knowledge are consistent and well-developed.',
    domains:'["cognitive","social","science"]', eylf:'["2.1","4.1"]',
    follow_up:'Build on science interest — magnifying glasses, invertebrate books.',
    ts: addDays(today,-4)+' 10:05:00' },
  { child:'Mia Garcia', edId:ed1id, type:'jotting',
    narrative:'Mia responded consistently to her name across 5 separate instances today — definite language milestone. She also initiated peekaboo with a cloth three times independently, covering her own face. Lovely social engagement and beginning to anticipate the game structure.',
    domains:'["language","social","cognitive"]', eylf:'["1.1","2.1","3.1"]',
    follow_up:'Document for portfolio. Offer more social games. Share with parents.',
    ts: addDays(today,-1)+' 15:00:00' },
  { child:'Charlotte Kim', edId:ed5id, type:'learning_story',
    narrative:'Charlotte brought a book about Korean traditional dress (Hanbok) to share at morning circle. She spoke for nearly four minutes, explaining colours and when they\'re worn, answering questions with confidence and a little nervous giggling. "My halmoni made mine — that means grandma in Korean." Three children asked Charlotte to help them draw Hanbok afterwards. This spontaneous cultural sharing was powerful — Charlotte demonstrated pride in her heritage and sophisticated oral language skills.',
    domains:'["social","language","cultural_identity"]', eylf:'["1.2","2.1","5.1","5.2"]',
    follow_up:'Create cultural celebrations display. Invite Charlotte\'s grandmother in to speak.',
    ts: addDays(today,-3)+' 09:15:00' },
  { child:'Hamish MacGregor', edId:ed0id, type:'observation',
    narrative:'Hamish independently used the feelings chart this morning — first unprompted use observed. He pointed to "frustrated" then "I need help please." He explained Oscar had taken the blue car he was using. We worked through a problem-solving conversation and he practised using an assertive (not aggressive) tone to ask Oscar directly. Resolved positively with Hamish looking genuinely pleased with himself.',
    domains:'["emotional","social","language"]', eylf:'["1.4","3.1"]',
    follow_up:'Celebrate self-initiated regulation strategies. Share with parents as positive progress.',
    ts: addDays(today,-7)+' 08:55:00' },
  { child:'Finn McCarthy', edId:ed1id, type:'observation',
    narrative:'Finn read aloud from "My Weird School" during free reading for 18 minutes with strong decoding and self-correction. He encountered "catastrophe", sounded it out syllable by syllable, then used picture context: "Is that like a disaster? Yeah, the building fell over — disaster." Excellent metacognitive reading strategies for his age.',
    domains:'["literacy","cognitive","language"]', eylf:'["4.1","5.1","5.2"]',
    follow_up:'Discuss with parents — likely ready for more challenging texts. Note in school transition plan.',
    ts: addDays(today,-5)+' 13:45:00' },
  { child:'Ethan Brown', edId:ed5id, type:'jotting',
    narrative:'Ethan spent the entire outdoor session building a series of small ramps for his toy cars, testing angles and adjusting with remarkable persistence. After each failed roll he muttered "too steep" or "needs more slope" and modified his design. He independently discovered the concept of a gentler gradient without any adult instruction.',
    domains:'["cognitive","physical","science"]', eylf:'["4.1","4.2"]',
    follow_up:'Provide ramp materials indoors. Introduce more cause-and-effect physics play.',
    ts: addDays(today,-2)+' 11:00:00' },
];

let obsAdded = 0;
obsData.forEach(obs => {
  const c = allChildMap[obs.child]; if (!c) return;
  try {
    db.prepare("INSERT OR IGNORE INTO observations (id,tenant_id,child_id,educator_id,type,narrative,domains,eylf_outcomes,follow_up,timestamp) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(randomUUID(),TENANT,c.id,obs.edId,obs.type,obs.narrative,obs.domains,obs.eylf,obs.follow_up,obs.ts);
    obsAdded++;
  } catch(e) {}
});
console.log('  [6/12] Observations/learning stories:', obsAdded, 'added');

// ── 7. ADDITIONAL ROSTER PERIODS ─────────────────────────────────────────────
const rosterShifts = [
  [0,'room-joeys',   '06:30','15:00'], [2,'room-joeys',   '09:00','18:00'],
  [1,'room-possums', '07:00','15:30'], [3,'room-possums', '09:30','18:30'],
  [5,'room-koalas',  '06:00','14:30'], [7,'room-koalas',  '10:00','18:30'],
  [0,'room-kookas',  '06:30','14:30'], [8,'room-kookas',  '09:00','17:30'],
];

const newPeriods = [
  { start:prevMonday, end:addDays(prevMonday,6), status:'approved', hours:224, cost:980000, score:98 },
  { start:lastMonday, end:addDays(lastMonday,6), status:'approved', hours:224, cost:996000, score:94 },
  { start:nextMonday, end:addDays(nextMonday,6), status:'draft',    hours:0,   cost:0,      score:0  },
];

let periodsAdded = 0;
let entriesAdded = 0;
newPeriods.forEach(rp => {
  let pid;
  const ex = db.prepare("SELECT id FROM roster_periods WHERE tenant_id=? AND start_date=?").get(TENANT, rp.start);
  if (ex) {
    pid = ex.id;
    // Period exists — check if entries were wiped (e.g. by old DROP TABLE bug)
    const ec = db.prepare("SELECT COUNT(*) as c FROM roster_entries WHERE period_id=?").get(pid).c;
    if (ec > 0) return; // entries intact
    // else fall through to re-insert entries
  } else {
    pid = randomUUID();
    db.prepare("INSERT OR IGNORE INTO roster_periods (id,tenant_id,period_type,start_date,end_date,status,generated_by,total_hours,total_cost_cents,compliance_score) VALUES(?,?,'weekly',?,?,?,?,?,?,?)")
      .run(pid,TENANT,rp.start,rp.end,rp.status,'ai',rp.hours,rp.cost,rp.score);
    periodsAdded++;
  }
  if (rp.status !== 'draft') {
    for (let di = 0; di < 5; di++) {
      const date = addDays(rp.start, di);
      rosterShifts.forEach(([eiIdx, roomId, s, e]) => {
        const ed = existingEducators[eiIdx]; if (!ed) return;
        const cost = Math.round(((parseInt(e.split(':')[0])*60+parseInt(e.split(':')[1]))-(parseInt(s.split(':')[0])*60+parseInt(s.split(':')[1]))-30)/60 * (ed.hourly_rate_cents||3500));
        try {
          db.prepare("INSERT INTO roster_entries (id,tenant_id,period_id,educator_id,room_id,date,start_time,end_time,break_mins,cost_cents,status) VALUES(?,?,?,?,?,?,?,?,30,?,'completed')")
            .run(randomUUID(),TENANT,pid,ed.id,roomId,date,s,e,cost);
          entriesAdded++;
        } catch(e2) { console.error('  entry err:', e2.message); }
      });
    }
  }
});
console.log('  [7/12] Roster periods:', periodsAdded, 'new,', entriesAdded, 'entries added/restored');

// ── 8. ROSTER TEMPLATES ───────────────────────────────────────────────────────
let tplAdded = 0;
const tplEntries = rosterShifts.map(([eiIdx, roomId, s, e]) => ({ educator_id: existingEducators[eiIdx]?.id, room_id: roomId, start_time: s, end_time: e, day_of_week: 0 })).filter(t => t.educator_id);

[
  { name:'Standard Week', desc:'Full-week template: all 4 rooms, 8 educators, NQF compliant.', entries: tplEntries },
  { name:'High-Attendance Week', desc:'Extended coverage for busy term weeks. 10 educators across all rooms.', entries: [...tplEntries, ...[
    { educator_id: existingEducators[4]?.id, room_id:'room-kookas',  start_time:'07:30', end_time:'16:30', day_of_week:0 },
    { educator_id: existingEducators[9]?.id, room_id:'room-possums', start_time:'09:00', end_time:'17:30', day_of_week:0 },
  ].filter(t=>t.educator_id)] },
].forEach(tpl => {
  const ex = db.prepare("SELECT id FROM roster_templates WHERE tenant_id=? AND name=?").get(TENANT, tpl.name);
  if (ex) return;
  try {
    db.prepare("INSERT INTO roster_templates (id,tenant_id,name,description,entries,created_at) VALUES(?,?,?,?,?,datetime('now'))")
      .run(randomUUID(),TENANT,tpl.name,tpl.desc,JSON.stringify(tpl.entries));
    tplAdded++;
  } catch(e) {}
});
console.log('  [8/12] Roster templates:', tplAdded, 'added');

// ── 9. ENROLMENT APPLICATIONS ────────────────────────────────────────────────
const enrolData = [
  { cfn:'Isabelle', cln:'Laroche',   dob:'2024-03-07', g:'female', lang:'French',   al:'None', di:'None',       room:'room-joeys',   days:'["Wednesday","Friday"]',                           start:addDays(today,42),
    p1n:'Camille Laroche',   p1e:'camille.l@email.com',  p1p:'0412 333 106', p1a:'14 Palmerston Rd, Cronulla NSW 2230',  p1crn:'CRN200101',
    ec1:'Pierre Laroche', ec1p:'0498 123 456', ec1r:'Father', dr:'Dr Marie Beaumont', drp:'02 9527 5678', status:'submitted',    sub:addDays(today,-5)  },
  { cfn:'Hugo',     cln:'Schmidt',   dob:'2023-04-11', g:'male',   lang:'German',   al:'None', di:'Vegetarian', room:'room-possums', days:'["Tuesday","Thursday"]',                           start:addDays(today,30),
    p1n:'Klaus Schmidt',     p1e:'k.schmidt@email.com',  p1p:'0412 333 102', p1a:'7 Baden St, Miranda NSW 2228',         p1crn:'CRN200102',
    ec1:'Greta Schmidt',  ec1p:'0412 888 202', ec1r:'Mother', dr:'Dr Hans Weber, Miranda Medical', drp:'02 9522 0000', status:'under_review', sub:addDays(today,-12) },
  { cfn:'Priya',    cln:'Sharma',    dob:'2024-01-30', g:'female', lang:'Hindi',    al:'None', di:'No beef',    room:'room-joeys',   days:'["Monday","Tuesday","Wednesday","Thursday","Friday"]', start:addDays(today,7),
    p1n:'Deepa Sharma',      p1e:'deepa.s@email.com',    p1p:'0412 333 103', p1a:'33 Kingsway, Caringbah NSW 2229',      p1crn:'CRN200103',
    ec1:'Raj Sharma',     ec1p:'0412 777 103', ec1r:'Father', dr:'Dr Priti Nair, Caringbah Family Practice', drp:'02 9524 5678', status:'approved', sub:addDays(today,-20) },
  { cfn:'Felix',    cln:'OConnor',   dob:'2022-10-05', g:'male',   lang:'English',  al:'None', di:'None',       room:'room-koalas',  days:'["Monday","Wednesday"]',                           start:addDays(today,55),
    p1n:'Brigid OConnor',    p1e:'brigid.oc@email.com',  p1p:'0412 333 104', p1a:'9 Ewos Pde, Cronulla NSW 2230',        p1crn:'CRN200104',
    ec1:'Patrick OConnor', ec1p:'0412 666 104', ec1r:'Father', dr:'Dr Sean Murphy, Cronulla Health Centre', drp:'02 9527 3000', status:'draft', sub:null },
  { cfn:'Amara',    cln:'Johnson',   dob:'2021-05-18', g:'female', lang:'English',  al:'None', di:'None',       room:'room-kookas',  days:'["Monday","Tuesday","Wednesday","Thursday","Friday"]', start:addDays(today,14),
    p1n:'Bianca Johnson',    p1e:'bianca.j@email.com',   p1p:'0412 555 501', p1a:'22 Elizabeth Dr, Caringbah South NSW 2229', p1crn:'CRN200105',
    ec1:'Derek Johnson',  ec1p:'0412 444 501', ec1r:'Father', dr:'Dr Rosa Park, Caringbah Family Clinic', drp:'02 9524 4567', status:'submitted', sub:addDays(today,-3) },
];

let enrolAdded = 0;
enrolData.forEach(a => {
  const ex = db.prepare("SELECT id FROM enrolment_applications WHERE child_first_name=? AND child_last_name=? AND tenant_id=?").get(a.cfn, a.cln, TENANT);
  if (ex) return;
  try {
    db.prepare('INSERT OR IGNORE INTO enrolment_applications (id,tenant_id,status,child_first_name,child_last_name,child_dob,child_gender,child_language,child_allergies,child_dietary,child_immunisation_status,preferred_room,preferred_days,preferred_start_date,parent1_name,parent1_email,parent1_phone,parent1_address,parent1_crn,emergency_contact1_name,emergency_contact1_phone,emergency_contact1_relationship,doctor_name,doctor_phone,sunscreen_consent,photo_consent,excursion_consent,authorised_medical_treatment,authorised_ambulance,submitted_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,1,1,1,?,datetime(\'now\'),datetime(\'now\'))')
      .run(randomUUID(),TENANT,a.status,a.cfn,a.cln,a.dob,a.g,a.lang,a.al,a.di,'current',a.room,a.days,a.start,a.p1n,a.p1e,a.p1p,a.p1a,a.p1crn,a.ec1,a.ec1p,a.ec1r,a.dr,a.drp,a.sub);
    enrolAdded++;
  } catch(e) {}
});
console.log('  [9/12] Enrolment applications:', enrolAdded, 'added');

// ── 10. ADDITIONAL INCIDENTS ─────────────────────────────────────────────────
const incData = [
  { type:'incident',    sev:'minor',    title:'Graze on knee - outdoor play',      child:'Noah Williams',
    desc:'Noah grazed knee on path during running games. Wound cleaned with saline, covered with plaster. Parent notified at pickup.', loc:'Outdoor area', fa:1, faD:'Wound cleaned with saline, plaster applied', status:'closed', dt:addDays(today,-10) },
  { type:'near_miss',   sev:'moderate', title:'Loose fence paling identified',
    desc:'Educator Rachel Foster identified a loose fence paling in back garden during outdoor play. Area cordoned off immediately. Maintenance notified. No children in proximity.', loc:'Back garden fence', fa:0, status:'closed', dt:addDays(today,-7) },
  { type:'incident',    sev:'minor',    title:'Paint in eye - art activity',        child:'Isla Thompson',
    desc:'Isla got watercolour paint in right eye while reaching across art table. Eye rinsed with clean water for 5 minutes. No redness noted. Parents notified.', loc:'Koalas room - art table', fa:1, faD:'Eye irrigated with clean water 5 minutes', status:'closed', dt:addDays(today,-4) },
  { type:'incident',    sev:'moderate', title:'Mild allergic reaction - Olivia Chen', child:'Olivia Chen',
    desc:'Olivia developed minor hives approximately 15 minutes after morning tea. Cross-contamination with nut traces from improperly cleaned surface suspected. EpiPen NOT required. Parents called immediately. Hives resolved in 45 minutes. Full kitchen review completed.', loc:'Possums room - morning tea area', fa:1, faD:'Monitored closely. EpiPen on standby. Hives self-resolved.', status:'closed', dt:addDays(today,-14) },
  { type:'behavioural', sev:'minor',    title:'Biting incident - toddler room',
    desc:'Connor bit Sienna on forearm during toy dispute. Mark visible but skin not broken. Both children comforted. Parents of both children notified same day. Biting plan reviewed and strategies reinforced with team.', loc:'Possums room', fa:0, status:'closed', dt:addDays(today,-8) },
  { type:'near_miss',   sev:'low',      title:'Child not visible during outdoor transition', child:'Anika Patel',
    desc:'Brief head count discrepancy during transition from outdoor to indoor. Anika found in outdoor equipment shed examining tricycles. No safety risk - shed is within secure zone. Buddy system reinforced for all transitions.', loc:'Outdoor equipment shed', fa:0, status:'closed', dt:addDays(today,-3) },
];

let incAdded = 0;
incData.forEach(inc => {
  const c = inc.child ? allChildMap[inc.child] : null;
  try {
    db.prepare("INSERT OR IGNORE INTO incidents (id,tenant_id,child_id,type,severity,title,description,location,first_aid_given,first_aid_details,parent_notified,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))")
      .run(randomUUID(),TENANT,c?.id||null,inc.type,inc.sev,inc.title,inc.desc,inc.loc,inc.fa?1:0,inc.faD||null,c?1:0,inc.status,inc.dt+'T09:00:00');
    incAdded++;
  } catch(e) {}
});
console.log('  [10/12] Incidents:', incAdded, 'added');

// ── 11. COMPLIANCE ITEMS ─────────────────────────────────────────────────────
const compData = [
  { child:'Noah Williams',  cat:'immunisation', type:'immunisation_overdue',   label:'DTPa Booster - OVERDUE',                      status:'overdue',     expiry:addDays(today,-30) },
  { child:'Liam Patel',     cat:'immunisation', type:'immunisation_due',       label:'Hexavalent dose 3 - due in 30 days',          status:'due_soon',    expiry:addDays(today,30)  },
  { child:'Mia Garcia',     cat:'immunisation', type:'immunisation_due',       label:'Hexavalent dose 2 - due in 60 days',          status:'due_soon',    expiry:addDays(today,60)  },
  { child:'Ava Nguyen',     cat:'medical',      type:'medication_expiry',      label:'EpiPen Jr (Precautionary) - expires in 12 days', status:'expiring', expiry:addDays(today,12)  },
  { child:'Olivia Chen',    cat:'medical',      type:'medical_plan_review',    label:'Anaphylaxis Action Plan - annual review due', status:'due_soon',    expiry:addDays(today,45)  },
  { child:'Matilda Singh',  cat:'enrolment',    type:'missing_document',       label:'Emergency contact 2 details missing',         status:'outstanding', expiry:null               },
  { child:'Henry Kowalski', cat:'enrolment',    type:'missing_document',       label:'CCS details not yet submitted',               status:'outstanding', expiry:null               },
  { child:'Olivia Chen',    cat:'medical',      type:'epipen_primary_current', label:'EpiPen Jr (Primary) - current',               status:'current',     expiry:addDays(today,180) },
  { child:'Angus Reid',     cat:'medical',      type:'epipen_carried_current', label:'EpiPen Jr (Carried) - current',               status:'current',     expiry:addDays(today,270) },
  { child:'Jack OBrien',    cat:'medical',      type:'allergy_plan_current',   label:'Bee sting allergy plan - current',            status:'current',     expiry:addDays(today,365) },
];

let compAdded = 0;
compData.forEach(ci => {
  const c = allChildMap[ci.child]; if (!c) return;
  const ex = db.prepare("SELECT id FROM compliance_items WHERE child_id=? AND item_type=?").get(c.id, ci.type);
  if (ex) return;
  try {
    const days = ci.expiry ? Math.round((new Date(ci.expiry) - new Date()) / 86400000) : null;
    db.prepare("INSERT INTO compliance_items (id,tenant_id,child_id,category,item_type,item_label,status,expiry_date,days_until_expiry,last_checked,created_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))")
      .run(randomUUID(),TENANT,c.id,ci.cat,ci.type,ci.label,ci.status,ci.expiry,days);
    compAdded++;
  } catch(e) {}
});
console.log('  [11/12] Compliance items:', compAdded, 'added');

// ── 12. PARENT FEEDBACK ───────────────────────────────────────────────────────
const fbData = [
  { child:'Olivia Chen',    pn:'Wei Chen',      type:'compliment', r:5, msg:"The learning stories are absolutely beautiful. The detail and care in the observations really shows how well the educators know Olivia. She talks about Mrs Mei constantly at home. We feel so lucky.", sent:0.96, cat:'staff_quality' },
  { child:'Noah Williams',  pn:'Kate Williams', type:'compliment', r:5, msg:"We were nervous about Noah's asthma when he started, but the educators have been incredible. They know exactly what to do and always call us promptly. He's thriving here.", sent:0.94, cat:'health_safety' },
  { child:'Isla Thompson',  pn:'Mark Thompson', type:'compliment', r:5, msg:"Isla's love of art has exploded since joining Koalas. The art provocations are wonderful — sophisticated and clearly intentional. She comes home covered in paint and absolutely beaming.", sent:0.91, cat:'program' },
  { child:'Jack OBrien',    pn:'Fiona OBrien',  type:'suggestion', r:4, msg:"The app is great but it would be nice to get more regular photo updates during the day. Even one or two candid shots would mean the world to parents.", sent:0.72, cat:'communication', resp:1, respText:"Thank you Fiona — we're working on improving in-day photo sharing. Keep an eye out for updates!", respAt:addDays(today,-2) },
  { child:'Liam Patel',     pn:'Raj Patel',     type:'compliment', r:5, msg:"Liam is our first child in childcare and we were anxious. James and the Joeys team made it the most gentle, supported experience. We genuinely trust this team with our son.", sent:0.93, cat:'staff_quality' },
  { child:'Noah Williams',  pn:'James Williams',type:'concern',    r:3, msg:"Small thing but the outdoor area seems a bit limited for the Kookaburras age group — the equipment looks a bit young for them. Not a major issue, just noticed.", sent:0.65, cat:'facilities', resp:1, respText:"Thank you James. We have submitted a grant application for new loose parts play equipment for Kookaburras — hope to have this in place by Term 2!", respAt:addDays(today,-1) },
  { child:'Charlotte Kim',  pn:'Ji-yeon Kim',   type:'compliment', r:5, msg:"When Charlotte shared her Hanbok book and the educators made it a whole learning moment for the class — we cried. To see our cultural identity valued so genuinely in this setting is everything.", sent:0.97, cat:'cultural_inclusion' },
  { child:'Ethan Brown',    pn:'Lisa Brown',     type:'suggestion', r:4, msg:"Would it be possible to have a bit more communication about what Ethan eats each day? Sometimes he says he didn't eat much and I'm not sure if I should worry.", sent:0.68, cat:'communication' },
  { child:'Finn McCarthy',  pn:'Declan McCarthy',type:'compliment', r:5, msg:"Finn's reading has gone through the roof this term. Whatever you're doing in Kookaburras is working brilliantly. He came home asking to go to the library last weekend!", sent:0.92, cat:'program' },
];

let fbAdded = 0;
fbData.forEach(fb => {
  const c = allChildMap[fb.child];
  try {
    db.prepare("INSERT OR IGNORE INTO parent_feedback (id,tenant_id,child_id,parent_name,feedback_type,rating,message,sentiment_score,category,responded,response_text,responded_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))")
      .run(randomUUID(),TENANT,c?.id||null,fb.pn,fb.type,fb.r,fb.msg,fb.sent,fb.cat,fb.resp||0,fb.respText||null,fb.respAt||null);
    fbAdded++;
  } catch(e) {}
});
console.log('  [12/12] Parent feedback:', fbAdded, 'added');

// ── Done ─────────────────────────────────────────────────────────────────────
db.pragma('foreign_keys = ON');
db.close();

const finalChildren = db.prepare ? 0 : 0; // db is closed
console.log(`
═══════════════════════════════════════════════════════════
  ✅ Rich seed complete!
     Children:            ${allChildren.length} total across 4 rooms
     Medical plans:       ${mpAdded}
     Medications:         ${medsAdded}
     Med logs:            ${logsAdded}
     Immunisations:       ${immunAdded}
     Observations:        ${obsAdded}
     Roster periods:      ${periodsAdded} + 2 templates
     Enrolments:          ${enrolAdded} applications
     Incidents:           ${incAdded}
     Compliance items:    ${compAdded}
     Parent feedback:     ${fbAdded}
═══════════════════════════════════════════════════════════
`);
