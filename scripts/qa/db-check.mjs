#!/usr/bin/env node
/**
 * Childcare360 — Database Integrity Checker
 * 
 * Runs directly against the SQLite DB to find data problems:
 * - Orphaned foreign key references
 * - Missing tenant_id on rows
 * - Duplicate unique values
 * - NULL in required fields
 * - Stale/inconsistent status values
 * 
 * Usage: node scripts/qa/db-check.mjs [--db /path/to/childcare360.db]
 */

import Database from 'better-sqlite3';
import { existsSync } from 'fs';

const args = process.argv.slice(2);
const dbPath = args.find(a => a.startsWith('--db='))?.split('=')[1] ||
               process.env.DB_PATH ||
               '/data/childcare360.db';

if (!existsSync(dbPath)) {
  console.error(`❌ Database not found at: ${dbPath}`);
  console.error('   Pass --db=/path/to/childcare360.db or set DB_PATH env var');
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
let passed = 0, failed = 0, warnings = 0;

function check(name, fn) {
  try {
    const result = fn();
    if (result === true || result === null) {
      passed++;
      console.log(`  ✅ ${name}`);
    } else {
      failed++;
      console.log(`  ❌ ${name}`);
      if (result) console.log(`     ${result}`);
    }
  } catch (e) {
    warnings++;
    console.log(`  ⚠️  ${name} — ${e.message}`);
  }
}

function warn(name, fn) {
  try {
    const result = fn();
    if (result === null) { passed++; return; }
    warnings++;
    console.log(`  ⚠️  ${name}`);
    if (result) console.log(`     ${result}`);
  } catch (e) {
    warnings++;
    console.log(`  ⚠️  ${name} — ${e.message}`);
  }
}

function tableExists(name) {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function count(table, where = '') {
  return db.prepare(`SELECT COUNT(*) as n FROM ${table}${where ? ' WHERE ' + where : ''}`).get()?.n || 0;
}

console.log('═══════════════════════════════════════════════════');
console.log('  Childcare360 — Database Integrity Checker');
console.log(`  DB: ${dbPath}`);
console.log(`  Time: ${new Date().toISOString()}`);
console.log('═══════════════════════════════════════════════════');

// ── 1. SCHEMA CHECKS ─────────────────────────────────────────────────────────
console.log('\n▶ Schema Integrity');

const coreTablesRequired = [
  'users', 'tenants', 'tenant_members', 'children', 'educators',
  'rooms', 'roster_entries', 'invoices', 'payments', 'audit_log',
  'voice_settings', 'voice_calls', 'learning_stories', 'notifications',
];

coreTablesRequired.forEach(t => {
  check(`Table "${t}" exists`, () => {
    if (!tableExists(t)) return `Table missing — run server to apply migrations`;
    return true;
  });
});

// Check critical columns exist
const colChecks = [
  ['roster_entries', 'updated_at'],
  ['roster_entries', 'tenant_id'],
  ['educators', 'reliability_score'],
  ['children', 'tenant_id'],
  ['invoices', 'tenant_id'],
  ['voice_settings', 'retell_agent_id'],
  ['voice_settings', 'retell_llm_id'],
  ['voice_settings', 'voice_provider'],
];

colChecks.forEach(([table, col]) => {
  check(`Column ${table}.${col} exists`, () => {
    if (!tableExists(table)) return `Table ${table} not found`;
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes(col)) return `Column missing — run migration`;
    return true;
  });
});

// ── 2. DATA INTEGRITY ─────────────────────────────────────────────────────────
console.log('\n▶ Data Integrity');

// Orphaned roster entries (educator or room doesn't exist)
check('No orphaned roster_entries (educator)', () => {
  if (!tableExists('roster_entries') || !tableExists('educators')) return true;
  const n = db.prepare(`
    SELECT COUNT(*) as n FROM roster_entries r
    LEFT JOIN educators e ON e.id = r.educator_id AND e.tenant_id = r.tenant_id
    WHERE r.educator_id IS NOT NULL AND e.id IS NULL
  `).get()?.n || 0;
  return n === 0 ? true : `${n} roster entries reference non-existent educators`;
});

check('No orphaned roster_entries (room)', () => {
  if (!tableExists('roster_entries') || !tableExists('rooms')) return true;
  const n = db.prepare(`
    SELECT COUNT(*) as n FROM roster_entries r
    LEFT JOIN rooms rm ON rm.id = r.room_id AND rm.tenant_id = r.tenant_id
    WHERE r.room_id IS NOT NULL AND rm.id IS NULL
  `).get()?.n || 0;
  return n === 0 ? true : `${n} roster entries reference non-existent rooms`;
});

// Children with no tenant
check('All children have tenant_id', () => {
  if (!tableExists('children')) return true;
  const n = count('children', 'tenant_id IS NULL OR tenant_id = ""');
  return n === 0 ? true : `${n} children missing tenant_id — critical isolation issue`;
});

// Educators with no tenant
check('All educators have tenant_id', () => {
  if (!tableExists('educators')) return true;
  const n = count('educators', 'tenant_id IS NULL OR tenant_id = ""');
  return n === 0 ? true : `${n} educators missing tenant_id`;
});

// Invoices with no tenant
check('All invoices have tenant_id', () => {
  if (!tableExists('invoices')) return true;
  const n = count('invoices', 'tenant_id IS NULL OR tenant_id = ""');
  return n === 0 ? true : `${n} invoices missing tenant_id`;
});

// Duplicate user emails
check('No duplicate user emails', () => {
  if (!tableExists('users')) return true;
  const dups = db.prepare(`
    SELECT email, COUNT(*) as n FROM users GROUP BY email HAVING n > 1
  `).all();
  return dups.length === 0 ? true : `${dups.length} duplicate emails: ${dups.map(d => d.email).join(', ')}`;
});

// Duplicate tenant members
check('No duplicate tenant memberships', () => {
  if (!tableExists('tenant_members')) return true;
  const dups = db.prepare(`
    SELECT user_id, tenant_id, COUNT(*) as n FROM tenant_members
    GROUP BY user_id, tenant_id HAVING n > 1
  `).all();
  return dups.length === 0 ? true : `${dups.length} duplicate tenant_member entries`;
});

// Invoices with negative total
check('No invoices with negative total', () => {
  if (!tableExists('invoices')) return true;
  const n = db.prepare(`SELECT COUNT(*) as n FROM invoices WHERE total < 0`).get()?.n || 0;
  return n === 0 ? true : `${n} invoices have negative totals`;
});

// Roster entries with end before start
check('No roster entries with end_time before start_time', () => {
  if (!tableExists('roster_entries')) return true;
  const n = db.prepare(`
    SELECT COUNT(*) as n FROM roster_entries
    WHERE end_time IS NOT NULL AND start_time IS NOT NULL AND end_time <= start_time
  `).get()?.n || 0;
  return n === 0 ? true : `${n} roster entries have invalid time range (end <= start)`;
});

// Voice calls stuck in-progress
warn('Voice calls not stuck in-progress > 2 hours', () => {
  if (!tableExists('voice_calls')) return null;
  const n = db.prepare(`
    SELECT COUNT(*) as n FROM voice_calls
    WHERE status = 'in-progress'
    AND created_at < datetime('now', '-2 hours')
  `).get()?.n || 0;
  return n === 0 ? null : `${n} voice calls stuck in-progress for >2 hours — may need cleanup`;
});

// ── 3. PERFORMANCE RED FLAGS ──────────────────────────────────────────────────
console.log('\n▶ Performance & Scale');

const bigTables = [
  'children', 'educators', 'roster_entries', 'invoices',
  'audit_log', 'learning_stories', 'voice_calls', 'notifications',
];

bigTables.forEach(table => {
  if (!tableExists(table)) return;
  const n = count(table);
  const indexes = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=? AND name NOT LIKE 'sqlite_%'
  `).all(table).map(r => r.name);
  const hasIdx = indexes.length > 0;
  warn(`${table} (${n} rows) has indexes`, () =>
    hasIdx ? null : `No custom indexes on ${table} — will be slow at scale. Add index on tenant_id at minimum.`
  );
});

// Check index on common query patterns
const indexChecks = [
  ['children', 'tenant_id'],
  ['educators', 'tenant_id'],
  ['roster_entries', 'tenant_id'],
  ['roster_entries', 'date'],
  ['audit_log', 'tenant_id'],
  ['invoices', 'tenant_id'],
];

indexChecks.forEach(([table, col]) => {
  if (!tableExists(table)) return;
  const indexes = db.prepare(`
    SELECT il.name FROM pragma_index_list(?) il
    JOIN pragma_index_info(il.name) ii ON 1=1
    WHERE ii.name = ?
  `).all(table, col);
  warn(`Index on ${table}(${col})`, () =>
    indexes.length > 0 ? null : `Missing index on ${table}(${col}) — add for production scale`
  );
});

// ── 4. SUMMARY ───────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════');

// Stats
const tables = db.prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table'").get()?.n || 0;
const totalRows = bigTables.reduce((sum, t) => sum + (tableExists(t) ? count(t) : 0), 0);
console.log(`\n  Database stats:`);
console.log(`    Tables:    ${tables}`);
console.log(`    Key rows:  ${totalRows.toLocaleString()}`);
console.log(`    File:      ${dbPath}`);

console.log(`\n  Results: ✅ ${passed} passed  ❌ ${failed} failed  ⚠️  ${warnings} warnings`);
console.log('═══════════════════════════════════════════════════\n');

db.close();
if (failed > 0) process.exit(1);
