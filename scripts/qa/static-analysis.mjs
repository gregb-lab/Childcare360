#!/usr/bin/env node
/**
 * Childcare360 — Static Code Analyser
 * 
 * Scans server/ and src/ for common bugs without running the app:
 * - Missing tenant_id in DB queries
 * - Mid-file import statements (ESM violation)
 * - Missing try/catch on async routes
 * - Hardcoded secrets or credentials
 * - Unescaped SQL (injection risk)
 * - Missing auth middleware on routes
 * - require() usage in ESM files
 * - Console.log left in production paths
 * - TODO/FIXME/HACK comments
 * 
 * Usage: node scripts/qa/static-analysis.mjs [--fix-report]
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';

const ROOT = process.cwd();
const SERVER_DIR = join(ROOT, 'server');
const SRC_DIR    = join(ROOT, 'src');
const FIX_REPORT = process.argv.includes('--fix-report');
const VERBOSE    = process.argv.includes('--verbose');

let totalIssues = 0;
const report = { critical: [], high: [], medium: [], info: [] };

function issue(severity, file, line, message, snippet = '') {
  totalIssues++;
  const rel = relative(ROOT, file);
  const entry = { file: rel, line, message, snippet: snippet.trim().slice(0, 120) };
  report[severity].push(entry);
}

function scanFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines   = content.split('\n');
  const rel     = relative(ROOT, filePath);
  const isServer = filePath.includes('/server/');
  const isSrc    = filePath.includes('/src/');

  // Track import positions for mid-file detection
  let firstNonImportLine = null;
  let inImportBlock = true;

  lines.forEach((line, i) => {
    const ln = i + 1;
    const trimmed = line.trim();

    // ── ESM: imports must be at top ──────────────────────────────────────────
    if (isServer) {
      if (trimmed.startsWith('import ') && firstNonImportLine !== null && inImportBlock) {
        issue('critical', filePath, ln,
          'Import statement after non-import code (ESM violation — will crash Node)',
          line);
      }
      if (!trimmed.startsWith('import ') && !trimmed.startsWith('//') &&
          !trimmed.startsWith('*') && trimmed !== '' && inImportBlock) {
        inImportBlock = false;
        firstNonImportLine = ln;
      }
    }

    // ── require() in ESM server files ────────────────────────────────────────
    if (isServer && /\brequire\s*\(/.test(line) && !line.includes('//')) {
      issue('critical', filePath, ln,
        'require() used in ES module file — use import instead',
        line);
    }

    // ── SQL queries missing tenant_id ────────────────────────────────────────
    if (isServer && filePath !== join(SERVER_DIR, 'db.js')) {
      const hasSql = /prepare\s*\(\s*[`'"]/.test(line) ||
                     /\.query\s*\(\s*[`'"]/.test(line);
      if (hasSql) {
        const sqlMatch = line.match(/[`'"]([^`'"]+)[`'"]/);
        const sql = sqlMatch ? sqlMatch[1].toLowerCase() : '';
        const isSelect = sql.includes('select') || sql.includes('insert') ||
                         sql.includes('update') || sql.includes('delete');
        const hasTenant = sql.includes('tenant_id') || sql.includes('tenant');
        // Check next 3 lines too for multi-line queries
        const context = lines.slice(i, i + 4).join(' ').toLowerCase();
        const contextHasTenant = context.includes('tenant_id') || context.includes('tenant');
        // Skip schema/migration-style queries
        const isMigration = sql.includes('create table') || sql.includes('alter table');
        if (isSelect && !contextHasTenant && !isMigration) {
          issue('high', filePath, ln,
            'DB query may be missing tenant_id filter — potential data leak',
            line);
        }
      }
    }

    // ── Async route handler without try/catch ────────────────────────────────
    if (isServer && /router\.(get|post|put|patch|delete)\s*\(/.test(line)) {
      // Check if the callback is async
      const hasAsync = line.includes('async') ||
                       (lines[i + 1] || '').includes('async');
      if (hasAsync) {
        // Look for try/catch in the next 20 lines
        const block = lines.slice(i, i + 25).join('\n');
        if (!block.includes('try {') && !block.includes('try{')) {
          issue('medium', filePath, ln,
            'Async route handler without try/catch — unhandled promise rejection possible',
            line);
        }
      }
    }

    // ── Hardcoded secrets ─────────────────────────────────────────────────────
    const secretPatterns = [
      { re: /sk_live_[a-zA-Z0-9]{20,}/, name: 'Stripe live secret key' },
      { re: /sk_test_[a-zA-Z0-9]{20,}/, name: 'Stripe test key' },
      { re: /AIza[0-9A-Za-z\\-_]{35}/, name: 'Google API key' },
      { re: /key_[a-zA-Z0-9]{32,}/, name: 'Retell API key' },
      { re: /(password|secret|apikey)\s*[:=]\s*['"][^'"]{8,}['"]/i, name: 'Hardcoded credential' },
      { re: /jwt_secret\s*[:=]\s*['"][^'"]{4,}['"]/i, name: 'Hardcoded JWT secret' },
    ];
    secretPatterns.forEach(({ re, name }) => {
      if (re.test(line) && !line.includes('process.env') && !line.includes('//')) {
        issue('critical', filePath, ln, `${name} may be hardcoded — use process.env`, line);
      }
    });

    // ── Missing auth on route definitions ────────────────────────────────────
    if (isServer && filePath !== join(SERVER_DIR, 'auth.js')) {
      if (/router\.(get|post|put|patch|delete)\s*\(['"`]/.test(line)) {
        // Check if requireAuth appears on the same line or very next line
        const context2 = lines.slice(Math.max(0, i - 1), i + 2).join(' ');
        const isPublic = line.includes('/health') || line.includes('/webhook') ||
                         line.includes('/audio') || line.includes('/ping') ||
                         line.includes('retell/ping');
        if (!context2.includes('requireAuth') && !context2.includes('requireTenant') && !isPublic) {
          issue('info', filePath, ln,
            'Route defined without requireAuth — verify this is intentionally public',
            line);
        }
      }
    }

    // ── TODO / FIXME / HACK ───────────────────────────────────────────────────
    if (/\b(TODO|FIXME|HACK|XXX|BUG)\b/.test(line)) {
      const type = line.match(/\b(TODO|FIXME|HACK|XXX|BUG)\b/)[1];
      issue('info', filePath, ln, `${type} comment found`, line);
    }

    // ── console.log in server code ────────────────────────────────────────────
    if (isServer && /console\.log\s*\(/.test(line) && !line.includes('//')) {
      // Only flag excessive logging — not startup messages or intentional debug
      if (!line.includes('[') && !line.includes('✓') && !line.includes('error')) {
        issue('info', filePath, ln,
          'console.log in server code — consider using structured logging',
          line);
      }
    }

    // ── Direct string concatenation in SQL (injection risk) ───────────────────
    if (isServer) {
      if (/prepare\s*\([`'"].*\$\{/.test(line) || /prepare\s*\([`'"].*\+\s*[a-zA-Z]/.test(line)) {
        issue('critical', filePath, ln,
          'Possible SQL injection — string interpolation in prepared statement (use ? placeholders)',
          line);
      }
    }

    // ── Frontend: missing error boundaries / loading states ───────────────────
    if (isSrc && filePath.endsWith('.jsx')) {
      if (/async.*fetch|await.*API\(/.test(line)) {
        const block40 = lines.slice(Math.max(0, i - 5), i + 40).join('\n');
        if (!block40.includes('catch') && !block40.includes('error') && !block40.includes('Error')) {
          issue('medium', filePath, ln,
            'Async fetch without catch handler — unhandled errors may silently fail',
            line);
        }
      }
    }
  });

  // ── File-level checks ─────────────────────────────────────────────────────

  // Check index.js mounts all imported routers
  if (filePath === join(SERVER_DIR, 'index.js')) {
    const imports = [...content.matchAll(/import\s+(\w+)Routes?\s+from/g)].map(m => m[1].toLowerCase());
    const mounts  = [...content.matchAll(/app\.use\s*\(\s*['"`]([^'"`]+)['"`]/g)].map(m => m[0]);
    imports.forEach(name => {
      const mounted = content.includes(`${name}Routes`) && mounts.some(m => m.includes(name));
      if (!mounted && name !== 'global' && name !== 'v2' && name !== 'retell') {
        // This is approximate — don't flag as error, just info
        // issue('info', filePath, 0, `Import "${name}Routes" may not be mounted via app.use`, '');
      }
    });
  }

  // db.js — check for missing tenant_id in CREATE TABLE
  if (filePath === join(SERVER_DIR, 'db.js')) {
    const tableMatches = [...content.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)(?=\n\s*\);)/g)];
    tableMatches.forEach(([_, tableName, cols]) => {
      const exempt = ['users', 'tenants', 'platform_admins', 'public_holidays',
                      'immunisation_schedule', 'story_prompts', 'award_classifications'];
      if (!cols.includes('tenant_id') && !exempt.includes(tableName)) {
        issue('high', filePath, 0,
          `Table "${tableName}" may be missing tenant_id column`,
          `CREATE TABLE IF NOT EXISTS ${tableName}`);
      }
    });
  }
}

function walkDir(dir, ext) {
  if (!statSync(dir, { throwIfNoEntry: false })) return;
  readdirSync(dir).forEach(file => {
    const full = join(dir, file);
    const stat = statSync(full);
    if (stat.isDirectory() && file !== 'node_modules' && file !== '.git') {
      walkDir(full, ext);
    } else if (stat.isFile() && ext.includes(extname(file))) {
      scanFile(full);
    }
  });
}

// ── Run ───────────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════');
console.log('  Childcare360 — Static Code Analyser');
console.log(`  Root: ${ROOT}`);
console.log(`  Time: ${new Date().toISOString()}`);
console.log('═══════════════════════════════════════════════════');

walkDir(SERVER_DIR, ['.js', '.mjs']);
walkDir(SRC_DIR,    ['.jsx', '.js']);

// ── Report ────────────────────────────────────────────────────────────────────
const severities = [
  { key: 'critical', label: '🔴 CRITICAL', desc: 'Will crash or create security vulnerabilities' },
  { key: 'high',     label: '🟠 HIGH',     desc: 'Data integrity or security risk' },
  { key: 'medium',   label: '🟡 MEDIUM',   desc: 'Reliability issue, should fix before launch' },
  { key: 'info',     label: '🔵 INFO',     desc: 'Code quality improvements' },
];

severities.forEach(({ key, label, desc }) => {
  const items = report[key];
  if (!items.length) return;
  console.log(`\n${label} (${items.length}) — ${desc}`);
  items.slice(0, FIX_REPORT ? 999 : 20).forEach(({ file, line, message, snippet }) => {
    console.log(`  ${file}:${line || '?'}`);
    console.log(`    ${message}`);
    if (snippet && VERBOSE) console.log(`    → ${snippet}`);
  });
  if (!FIX_REPORT && items.length > 20) console.log(`  ... and ${items.length - 20} more (run with --fix-report to see all)`);
});

console.log('\n═══════════════════════════════════════════════════');
console.log(`  Total issues: ${totalIssues}`);
console.log(`  🔴 Critical: ${report.critical.length}  🟠 High: ${report.high.length}  🟡 Medium: ${report.medium.length}  🔵 Info: ${report.info.length}`);
console.log('═══════════════════════════════════════════════════');

if (report.critical.length > 0) process.exit(1);
