#!/usr/bin/env node
/**
 * Childcare360 — Master QA Runner
 * 
 * Runs all automated QA checks in sequence:
 *   1. Static code analysis (no server needed)
 *   2. DB integrity checks (needs DB path)
 *   3. Live API tests (needs running server)
 * 
 * Usage:
 *   node scripts/qa/run-all.mjs
 *   node scripts/qa/run-all.mjs --skip-api       # skip live API tests
 *   node scripts/qa/run-all.mjs --skip-db        # skip DB checks
 *   node scripts/qa/run-all.mjs --base-url=http://localhost:3000
 *   node scripts/qa/run-all.mjs --db=/data/childcare360.db
 * 
 * Exit codes:
 *   0 = all checks passed
 *   1 = one or more checks failed
 */

import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const SKIP_API  = args.includes('--skip-api');
const SKIP_DB   = args.includes('--skip-db');
const BASE_URL  = args.find(a => a.startsWith('--base-url='))?.split('=')[1] || 'http://localhost:3000';
const DB_PATH   = args.find(a => a.startsWith('--db='))?.split('=')[1] || '/data/childcare360.db';
const QA_DIR    = join(process.cwd(), 'scripts', 'qa');

let overallPass = true;

function banner(title) {
  const line = '═'.repeat(51);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

function run(script, extraArgs = []) {
  return new Promise((resolve) => {
    const child = spawn('node', [join(QA_DIR, script), ...extraArgs], { stdio: 'inherit' });
    child.on('close', code => resolve(code === 0));
  });
}

async function main() {
  const start = Date.now();

  banner('Childcare360 — Full QA Suite');
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log(`  Server:  ${SKIP_API ? 'skipped' : BASE_URL}`);
  console.log(`  DB:      ${SKIP_DB  ? 'skipped' : DB_PATH}`);

  const results = {};

  // ── 1. Static Analysis ────────────────────────────────────────────────────
  banner('Step 1/3 — Static Code Analysis');
  const staticOk = await run('static-analysis.mjs', ['--fix-report']);
  results.static = staticOk;
  if (!staticOk) overallPass = false;

  // ── 2. DB Integrity ───────────────────────────────────────────────────────
  if (!SKIP_DB) {
    banner('Step 2/3 — Database Integrity');
    if (existsSync(DB_PATH)) {
      const dbOk = await run('db-check.mjs', [`--db=${DB_PATH}`]);
      results.db = dbOk;
      if (!dbOk) overallPass = false;
    } else {
      console.log(`  ⚠️  DB not found at ${DB_PATH} — skipping`);
      console.log(`  Run server once to create DB, then re-run: --db=${DB_PATH}`);
      results.db = null;
    }
  } else {
    banner('Step 2/3 — Database Integrity (SKIPPED)');
    results.db = null;
  }

  // ── 3. Live API Tests ─────────────────────────────────────────────────────
  if (!SKIP_API) {
    banner('Step 3/3 — Live API Tests');
    const apiOk = await run('api-tests.mjs', [`--base-url=${BASE_URL}`, '--verbose']);
    results.api = apiOk;
    if (!apiOk) overallPass = false;
  } else {
    banner('Step 3/3 — Live API Tests (SKIPPED)');
    results.api = null;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  banner('QA Summary');

  const fmt = (v) => v === null ? '⏭ skipped' : v ? '✅ passed' : '❌ FAILED';
  console.log(`  Static analysis:  ${fmt(results.static)}`);
  console.log(`  DB integrity:     ${fmt(results.db)}`);
  console.log(`  Live API tests:   ${fmt(results.api)}`);
  console.log(`\n  Total time: ${elapsed}s`);

  if (overallPass) {
    console.log('\n  ✅ ALL CHECKS PASSED — ready to commit\n');
  } else {
    console.log('\n  ❌ CHECKS FAILED — fix issues before committing\n');
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
