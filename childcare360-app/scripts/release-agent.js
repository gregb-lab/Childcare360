#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════╗
 * ║     Childcare360 — Autonomous Release Agent          ║
 * ╠══════════════════════════════════════════════════════╣
 * ║  Phases: Static → AI Semantic → Auto-fix → Package   ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * Usage:
 *   node scripts/release-agent.js                  # analyse only
 *   node scripts/release-agent.js --fix            # analyse + auto-fix criticals
 *   node scripts/release-agent.js --fix --package  # full release pipeline
 *   node scripts/release-agent.js --skip-ai        # static checks only (no API cost)
 *   node scripts/release-agent.js --fix --package --version 2.3.0
 *
 * Exit codes:
 *   0 = clean (or all criticals fixed)
 *   1 = unfixed critical issues remain
 *   2 = fatal error
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const FIX      = args.includes('--fix');
const PACKAGE  = args.includes('--package');
const SKIP_AI  = args.includes('--skip-ai');
const DRY_RUN  = args.includes('--dry-run');
const VERBOSE  = args.includes('--verbose');
const vIdx     = args.indexOf('--version');
const TARGET_VERSION = vIdx !== -1 ? args[vIdx + 1] : null;
const MAX_RETRIES = 2;
const AI_MODEL = 'claude-sonnet-4-20250514';

// ─── Terminal colours ──────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', white: '\x1b[37m', blue: '\x1b[34m',
};
const log  = (...a) => console.log(...a);
const ok   = (m) => log(`  ${c.green}✓${c.reset}  ${m}`);
const fail = (m) => log(`  ${c.red}✗${c.reset}  ${m}`);
const warn = (m) => log(`  ${c.yellow}⚠${c.reset}  ${m}`);
const info = (m) => log(`  ${c.cyan}ℹ${c.reset}  ${m}`);
const hdr  = (m) => log(`\n${c.bold}${c.cyan}── ${m} ${'─'.repeat(Math.max(0, 50 - m.length))}${c.reset}`);

// ─── Files to analyse ─────────────────────────────────────────────────────────
// Discover JSX files dynamically from src/
function discoverFiles() {
  const srcDir = path.join(ROOT, 'src');
  const serverDir = path.join(ROOT, 'server');

  const jsx = fs.existsSync(srcDir)
    ? fs.readdirSync(srcDir)
        .filter(f => f.endsWith('.jsx') || f.endsWith('.js'))
        .map(f => `src/${f}`)
    : [];

  const server = fs.existsSync(serverDir)
    ? fs.readdirSync(serverDir)
        .filter(f => f.endsWith('.js'))
        .map(f => `server/${f}`)
    : [];

  return { jsx, server };
}

// Tables that MUST always be scoped by tenant_id in queries
const TENANT_SCOPED_TABLES = [
  'rooms', 'children', 'educators', 'roster_entries', 'shift_fill_requests',
  'shift_fill_attempts', 'educator_absences', 'leave_requests', 'learning_stories',
  'story_photos', 'story_children', 'story_eylf_outcomes', 'learning_albums',
  'eylf_progressions', 'weekly_reports', 'compliance_scans', 'equipment_register',
  'families', 'parent_messages', 'enrolment_applications', 'waitlist_entries',
  'invoices', 'invoice_items', 'ccs_claims', 'excursions', 'excursion_children',
  'excursion_permissions', 'audit_log', 'tenant_members', 'educator_notes',
  'educator_availability', 'lunch_cover_sessions', 'roster_templates', 'roster_periods',
];

// Files that are intentionally platform-wide (cross-tenant admin) - exempt from tenant_id check
const PLATFORM_ADMIN_FILES = ['server/platform.js', 'server/admin.js'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function readFile(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8');
}

function writeFile(relPath, content) {
  if (DRY_RUN) { info(`[dry-run] would write ${relPath}`); return; }
  fs.writeFileSync(path.join(ROOT, relPath), content, 'utf8');
}

function lineOf(content, index) {
  return content.substring(0, index).split('\n').length;
}

function extractLines(content, lineNum, context = 30) {
  const lines = content.split('\n');
  const start = Math.max(0, lineNum - context - 1);
  const end   = Math.min(lines.length, lineNum + context);
  return lines.slice(start, end)
    .map((l, i) => `${start + i + 1}: ${l}`)
    .join('\n');
}

function dedup(findings) {
  const seen = new Set();
  return findings.filter(f => {
    const key = `${f.file}:${f.line}:${f.rule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Read which files are actually imported in server/index.js
function getMountedRoutes() {
  const indexContent = readFile('server/index.js');
  if (!indexContent) return new Set();
  const mounted = new Set();
  // Match: import X from './foo' or import X from './foo.js'
  for (const m of indexContent.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)) {
    mounted.add(m[1].replace(/\.js$/, ''));
  }
  return mounted;
}

// ─── Phase 1: Static analysis ─────────────────────────────────────────────────
function runStaticAnalysis() {
  const findings = [];
  const FILES = discoverFiles();
  const mountedRoutes = getMountedRoutes();

  // ── JSX checks ──────────────────────────────────────────────────────────────
  for (const file of FILES.jsx) {
    const content = readFile(file);
    if (!content) continue;

    // 1. <form> tags (critical)
    for (const m of content.matchAll(/<form[\s>]/g)) {
      findings.push({
        severity: 'critical', file, line: lineOf(content, m.index),
        rule: 'no-form-tags',
        description: '<form> tag detected — React hydration conflict risk.',
        fix_hint: 'Replace <form onSubmit={X}> with <div>, move handler to button onClick.',
        fixable_without_ai: true,
      });
    }

    // 2. react-router imports (critical)
    const rrMatch = content.match(/from ['"]react-router/);
    if (rrMatch) {
      findings.push({
        severity: 'critical', file, line: lineOf(content, rrMatch.index),
        rule: 'no-react-router',
        description: 'React Router import — navigation uses useState activeTab only.',
        fix_hint: 'Remove react-router import and use useState tab switching.',
      });
    }

    // 3. CSS file imports (critical)
    for (const m of content.matchAll(/import\s+['"][^'"]+\.css['"]/g)) {
      findings.push({
        severity: 'critical', file, line: lineOf(content, m.index),
        rule: 'no-css-imports',
        description: `CSS file import detected: ${m[0]}`,
        fix_hint: 'Remove CSS import. Convert all styles to inline style={{}} objects.',
        fixable_without_ai: true,
      });
    }

    // 4. console.log in production (warning)
    for (const m of content.matchAll(/console\.log\(/g)) {
      findings.push({
        severity: 'warning', file, line: lineOf(content, m.index),
        rule: 'no-console-log',
        description: 'console.log() in production component.',
        fix_hint: 'Remove or guard with: if (process.env.NODE_ENV !== "production")',
      });
    }
  }

  // ── Server checks ────────────────────────────────────────────────────────────
  for (const file of FILES.server) {
    const content = readFile(file);
    if (!content) continue;

    // Skip schema/seed file for most checks
    const isDbFile = file === 'server/db.js';
    const isPlatformAdmin = PLATFORM_ADMIN_FILES.includes(file);

    // 5. Hardcoded credentials (critical)
    if (!isDbFile) {
      const credPatterns = [
        { re: /(?:password|passwd)\s*[=:]\s*['"](?!.{0,5}123|test|hash|example|process\.env)([^'"]{8,})['"]/gi, label: 'hardcoded password' },
        { re: /(?:apiKey|api_key|apikey)\s*[=:]\s*['"](?!your_|<|{|process\.env|sk-ant-)([^'"]{12,})['"]/gi, label: 'hardcoded API key' },
        { re: /jwt_secret\s*[=:]\s*['"](?!your_|<|{|process\.env|dummy|changeme)([^'"]{10,})['"]/gi, label: 'hardcoded JWT secret' },
      ];
      for (const { re, label } of credPatterns) {
        for (const m of content.matchAll(re)) {
          if (m[0].includes('process.env') || m[0].includes('bcrypt')) continue;
          findings.push({
            severity: 'critical', file, line: lineOf(content, m.index),
            rule: 'hardcoded-credential',
            description: `Possible ${label}: ${m[0].substring(0, 60)}`,
            fix_hint: 'Move value to environment variable accessed via process.env.YOUR_KEY',
          });
        }
      }
    }

    // 6. Async route handlers without try/catch (warning)
    if (!isDbFile) {
      for (const m of content.matchAll(/router\.(get|post|put|delete|patch)\s*\([^,\n]+,\s*async\s*(?:\([^)]*\)|\w+)\s*=>/g)) {
        const after = content.substring(m.index, m.index + 400);
        if (!after.includes('try {') && !after.includes('try{')) {
          findings.push({
            severity: 'warning', file, line: lineOf(content, m.index),
            rule: 'async-missing-try-catch',
            description: 'Async route handler without try/catch — unhandled rejections crash the server.',
            fix_hint: 'Wrap handler body in try { ... } catch (e) { res.status(500).json({ error: e.message }); }',
          });
        }
      }
    }

    // 7. SQL queries on tenant-scoped tables without tenant_id (critical)
    //    Skip: db.js (schema), platform admin files (intentionally cross-tenant)
    if (!isDbFile && !isPlatformAdmin) {
      for (const m of content.matchAll(/db(?:\.prepare|\(\))?\s*(?:\.prepare)?\s*\(\s*[`'"]([^`'"]+)[`'"]\s*\)/g)) {
        const sql = m[1].toLowerCase();
        if (sql.includes('create table') || sql.includes('alter table') ||
            sql.includes('drop table') || sql.includes('pragma') ||
            sql.includes('insert into sessions') || sql.includes('insert into verification')) continue;

        const touched = TENANT_SCOPED_TABLES.find(t =>
          new RegExp(`\\bfrom\\s+${t}\\b|\\binto\\s+${t}\\b|\\bupdate\\s+${t}\\b|\\bjoin\\s+${t}\\b`).test(sql)
        );
        if (touched && !sql.includes('tenant_id')) {
          findings.push({
            severity: 'critical', file, line: lineOf(content, m.index),
            rule: 'sql-missing-tenant-id',
            description: `SQL on '${touched}' lacks tenant_id scope — data leak across tenants.`,
            fix_hint: `Add WHERE tenant_id = ? (or AND tenant_id = ?) to the prepared statement.`,
          });
        }
      }
    }

    // 8. String interpolation in SQL (SQL injection risk) (critical)
    if (!isDbFile) {
      for (const m of content.matchAll(/\.prepare\s*\(\s*`[^`]*\$\{[^}]*(?:req\.|body\.|params\.|query\.)[^}]*\}[^`]*`\s*\)/g)) {
        findings.push({
          severity: 'critical', file, line: lineOf(content, m.index),
          rule: 'sql-injection-risk',
          description: 'SQL injection risk: user input interpolated directly into query string.',
          fix_hint: 'Use parameterised query with ? placeholders and pass values separately to .run()/.get()/.all()',
        });
      }
    }

    // 9. Route files not imported in server/index.js
    //    Only check files that export a router (skip db, middleware, seeders)
    const skipMountCheck = ['server/db.js', 'server/middleware.js', 'server/seed-cn.js',
                            'server/index.js', 'server/retell.js'];
    if (!skipMountCheck.includes(file)) {
      const baseName = path.basename(file, '.js');
      if (!mountedRoutes.has(baseName)) {
        // Only warn if the file actually has router.get/post/etc
        if (content.includes('router.get') || content.includes('router.post') ||
            content.includes('router.put') || content.includes('router.delete')) {
          findings.push({
            severity: 'warning', file, line: 1,
            rule: 'route-not-mounted',
            description: `server/${baseName}.js defines routes but isn't imported in server/index.js`,
            fix_hint: `Add: import ${baseName}Routes from './${baseName}.js' and app.use('/api/${baseName}', ${baseName}Routes) in server/index.js`,
          });
        }
      }
    }
  }

  // ── Cross-file checks ────────────────────────────────────────────────────────

  // 10. Version consistency between package.json and App.jsx
  const pkg = readFile('package.json');
  const appJsx = readFile('src/App.jsx');
  if (pkg && appJsx) {
    try {
      const pkgVersion = JSON.parse(pkg).version;
      const vMatch = appJsx.match(/v(\d+\.\d+\.\d+)/);
      if (vMatch && vMatch[1] !== pkgVersion) {
        findings.push({
          severity: 'warning', file: 'src/App.jsx', line: 1,
          rule: 'version-mismatch',
          description: `Version mismatch: package.json has ${pkgVersion}, App.jsx shows v${vMatch[1]}`,
          fix_hint: `Update version string in App.jsx sidebar to v${pkgVersion}`,
          fixable_without_ai: true,
        });
      }
    } catch {}
  }

  return dedup(findings);
}

// ─── Built-in deterministic fixes (no AI needed) ──────────────────────────────
function applyBuiltinFix(file, content, finding) {
  let updated = content;

  if (finding.rule === 'no-form-tags') {
    // Strategy: for each <form onSubmit={handler}> block:
    //   1. capture the handler name
    //   2. replace <form ...> with <div>
    //   3. replace </form> with </div>
    //   4. replace <button type="submit" in same block with <button onClick={handler}
    
    // Replace <form onSubmit={X}> — capture handler
    updated = updated.replace(/<form\s+onSubmit=\{([^}]+)\}(\s*[^>]*)>/g, (match, handler, rest) => {
      // Store handler name for submit button replacement below
      updated._lastFormHandler = handler.trim();
      return `<div${rest}>`;
    });
    // Simple <form> with no onSubmit
    updated = updated.replace(/<form(\s[^>]*)?>/g, '<div$1>');
    // Replace </form>
    updated = updated.replace(/<\/form>/g, '</div>');
    // Replace type="submit" buttons — add onClick if not already there
    // We can't easily pair them per-form block, so just remove type="submit" 
    // (buttons default to type="button" inside a div, so submit won't fire)
    updated = updated.replace(/<button\s+type="submit"/g, '<button type="button"');
    updated = updated.replace(/<button\s+type='submit'/g, "<button type='button'");
    return updated !== content ? updated : null;
  }

  if (finding.rule === 'no-css-imports') {
    // Remove the entire import line
    updated = updated.replace(/^import\s+['"][^'"]+\.css['"]\s*;?\s*\n/gm, '');
    return updated !== content ? updated : null;
  }

  if (finding.rule === 'version-mismatch') {
    try {
      const pkg = JSON.parse(readFile('package.json'));
      updated = updated.replace(/v\d+\.\d+\.\d+/, `v${pkg.version}`);
      return updated !== content ? updated : null;
    } catch { return null; }
  }

  return null; // No built-in fix for this rule
}

// ─── Phase 2: AI semantic analysis ────────────────────────────────────────────
const ANALYSIS_SYSTEM = `You are a senior code reviewer for Childcare360, an Australian childcare SaaS platform (React 18 + Vite + Express.js + better-sqlite3 + JWT).

CRITICAL RULES — violations are severity "critical":
1. No <form> tags in JSX — use onClick/onChange handlers only
2. Every SQL prepared statement on tenant-scoped tables MUST include tenant_id
3. No hardcoded credentials/secrets (use process.env)
4. All async Express route handlers MUST have try/catch
5. No react-router imports — tab navigation via useState only
6. No CSS file imports in JSX — inline style={{}} only
7. No string interpolation of user input into SQL (SQL injection)
8. JWT must be verified before accessing req.user.tenant_id

NOTE: server/platform.js is a platform admin file — cross-tenant queries are intentional there, do NOT flag missing tenant_id in that file.

Tenant-scoped tables (always need WHERE tenant_id = ?):
rooms, children, educators, roster_entries, shift_fill_requests, educator_absences,
leave_requests, learning_stories, compliance_scans, families, invoices, excursions,
enrolment_applications, waitlist_entries, audit_log, tenant_members

SEVERITY GUIDE:
- critical: data leak, security flaw, server crash risk, violates above rules
- warning: likely bug, missing validation, unhandled edge case, deprecated usage
- info: suggestion, minor improvement, style inconsistency

Respond ONLY with valid JSON — no markdown, no backticks, no explanation outside the JSON:
{
  "findings": [
    {
      "severity": "critical" | "warning" | "info",
      "line": <number or null>,
      "rule": "kebab-case-rule-name",
      "description": "one sentence describing the exact bug",
      "fix_hint": "one sentence describing the exact fix"
    }
  ]
}

Be precise. Only report real bugs you can see in the code. Ignore things that look intentional.`;

async function callAI(messages, system, maxTokens = 2000) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: maxTokens, system, messages }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body.substring(0, 200)}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function analyzeFile(file, content) {
  const MAX_CHARS = 80_000;
  const body = content.length > MAX_CHARS
    ? content.substring(0, MAX_CHARS) + '\n// [TRUNCATED]'
    : content;

  const text = await callAI(
    [{ role: 'user', content: `Review this file for bugs. File: ${file}\n\`\`\`\n${body}\n\`\`\`` }],
    ANALYSIS_SYSTEM
  );

  const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  try {
    const result = JSON.parse(clean);
    return (result.findings || []).map(f => ({ ...f, file, source: 'ai' }));
  } catch {
    if (VERBOSE) warn(`Could not parse AI response for ${file}:\n${clean.substring(0, 200)}`);
    return [];
  }
}

async function runAIAnalysis(FILES) {
  const all = [];
  const allFiles = [...FILES.jsx, ...FILES.server];

  for (const file of allFiles) {
    const content = readFile(file);
    if (!content) continue;

    process.stdout.write(`  ${c.dim}${file.padEnd(45)}${c.reset}`);

    try {
      const findings = await analyzeFile(file, content);
      const crits = findings.filter(f => f.severity === 'critical').length;
      const warns = findings.filter(f => f.severity === 'warning').length;

      if (crits === 0 && warns === 0) {
        process.stdout.write(`${c.green}✓ clean${c.reset}\n`);
      } else {
        const parts = [];
        if (crits) parts.push(`${c.red}${crits} critical${c.reset}`);
        if (warns) parts.push(`${c.yellow}${warns} warn${c.reset}`);
        process.stdout.write(`${parts.join(', ')}\n`);
      }
      all.push(...findings);
    } catch (e) {
      process.stdout.write(`${c.red}error: ${e.message.substring(0, 60)}${c.reset}\n`);
    }

    await new Promise(r => setTimeout(r, 250));
  }

  return dedup(all);
}

// ─── AI-powered fix (search/replace strategy) ────────────────────────────────
const FIX_SYSTEM = `You are fixing a specific bug in a Childcare360 source file.
Respond ONLY with valid JSON:
{
  "search": "<exact substring to find — must appear exactly once>",
  "replace": "<replacement that fixes the bug>"
}
Rules:
- "search" must be verbatim from the file (2-5 lines for uniqueness)
- "replace" must preserve all surrounding logic
- For sql-missing-tenant-id: add AND tenant_id = ? to WHERE and bind it in .run()/.get()/.all()
- For async-missing-try-catch: wrap handler body in try/catch
- Never break existing functionality`;

async function generateAIFix(file, content, finding) {
  const context = finding.line ? extractLines(content, finding.line, 30) : content.substring(0, 2000);

  const text = await callAI([{
    role: 'user',
    content: `Fix this bug in ${file}.\nBug: [${finding.rule}] ${finding.description}\nFix: ${finding.fix_hint}\n${finding.line ? `Line: ${finding.line}` : ''}\n\nContext:\n\`\`\`\n${context}\n\`\`\`\n\nFull file:\n\`\`\`\n${content.substring(0, 60_000)}\n\`\`\``
  }], FIX_SYSTEM, 1000);

  const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  const patch = JSON.parse(clean);

  if (!patch.search || patch.replace === undefined) throw new Error('Invalid patch structure');
  if (!content.includes(patch.search)) throw new Error(`Search string not found in file`);

  const occurrences = (content.match(new RegExp(patch.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  if (occurrences > 1) throw new Error(`Search string not unique (${occurrences} matches)`);

  return patch;
}

// ─── Auto-fix orchestrator ────────────────────────────────────────────────────
async function autoFix(allFindings) {
  const criticals = allFindings.filter(f => f.severity === 'critical');
  const byFile = {};
  for (const f of criticals) {
    if (!byFile[f.file]) byFile[f.file] = [];
    byFile[f.file].push(f);
  }

  const fixed  = [];
  const failed = [];
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  for (const [file, bugs] of Object.entries(byFile)) {
    log(`\n  ${c.bold}${file}${c.reset} — ${bugs.length} critical bug(s)`);

    for (const bug of bugs) {
      process.stdout.write(`    ${c.dim}[${bug.rule}] line ${bug.line || '?'}...${c.reset} `);

      let content = readFile(file);
      let succeeded = false;

      // Try built-in fix first (no API needed)
      const builtinResult = applyBuiltinFix(file, content, bug);
      if (builtinResult !== null) {
        if (!DRY_RUN) {
          const bakPath = file + '.bak';
          if (!fs.existsSync(path.join(ROOT, bakPath))) writeFile(bakPath, content);
          writeFile(file, builtinResult);
        }
        process.stdout.write(`${c.green}✓ fixed (built-in)${c.reset}${DRY_RUN ? ' [dry-run]' : ''}\n`);
        succeeded = true;
        if (!fixed.includes(file)) fixed.push(file);
        continue;
      }

      // Fall back to AI fix if API key available
      if (!hasApiKey) {
        process.stdout.write(`${c.yellow}⚠ skipped (no API key for AI fix)${c.reset}\n`);
        failed.push({ file, rule: bug.rule, error: 'ANTHROPIC_API_KEY not set — AI fix unavailable' });
        continue;
      }

      let attempt = 0;
      while (attempt < MAX_RETRIES && !succeeded) {
        attempt++;
        try {
          const patch = await generateAIFix(file, content, bug);
          const newContent = content.replace(patch.search, patch.replace);

          if (newContent.length < content.length * 0.8) {
            throw new Error(`Replacement shrinks file by ${Math.round((1 - newContent.length / content.length) * 100)}%`);
          }

          if (!DRY_RUN) {
            const bakPath = file + '.bak';
            if (!fs.existsSync(path.join(ROOT, bakPath))) writeFile(bakPath, content);
            writeFile(file, newContent);
          }

          content = newContent;
          process.stdout.write(`${c.green}✓ fixed (AI)${c.reset}${DRY_RUN ? ' [dry-run]' : ''}\n`);
          succeeded = true;
          if (!fixed.includes(file)) fixed.push(file);
        } catch (e) {
          if (attempt < MAX_RETRIES) {
            process.stdout.write(`retry... `);
          } else {
            process.stdout.write(`${c.red}✗ failed${c.reset}\n`);
            if (VERBOSE) fail(`  ${e.message}`);
            failed.push({ file, rule: bug.rule, error: e.message });
          }
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }
  }

  return { fixed, failed };
}

// ─── Version bump ─────────────────────────────────────────────────────────────
function bumpPatch(version) {
  const [maj, min, pat] = version.split('.').map(Number);
  return `${maj}.${min}.${pat + 1}`;
}

// ─── Package release ──────────────────────────────────────────────────────────
function packageRelease(version) {
  hdr('Packaging');

  // 1. Update package.json
  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const prevVersion = pkg.version;
  pkg.version = version;
  if (!DRY_RUN) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    ok(`package.json  ${c.dim}${prevVersion}${c.reset} → ${c.green}${version}${c.reset}`);
  } else {
    info(`[dry-run] package.json: ${prevVersion} → ${version}`);
  }

  // 2. Update version label in App.jsx
  const appPath = path.join(ROOT, 'src/App.jsx');
  if (fs.existsSync(appPath)) {
    const app = fs.readFileSync(appPath, 'utf8');
    const updated = app.replace(/v\d+\.\d+\.\d+/, `v${version}`);
    if (updated !== app) {
      if (!DRY_RUN) {
        fs.writeFileSync(appPath, updated, 'utf8');
        ok(`App.jsx sidebar version → v${version}`);
      } else {
        info(`[dry-run] App.jsx version → v${version}`);
      }
    }
  }

  // 3. Create tarball
  const ts = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 12);
  const tarName = `childcare360-v${version}-${ts}.tar.gz`;

  const excludes = [
    '--exclude=./data',
    '--exclude=./node_modules',
    '--exclude=./.env',
    '--exclude=./*.bak',
    '--exclude=./src/*.bak',
    '--exclude=./server/*.bak',
    '--exclude=./RELEASE_BUG_REPORT.md',
    `--exclude=./${tarName}`,
  ].join(' ');

  if (!DRY_RUN) {
    try {
      execSync(`cd ${ROOT} && tar czf ${tarName} ${excludes} .`, { stdio: 'pipe' });
      ok(`Created: ${c.green}${tarName}${c.reset}`);
    } catch (e) {
      fail(`tar failed: ${e.stderr?.toString().substring(0, 200) || e.message}`);
      process.exit(2);
    }
  } else {
    info(`[dry-run] would create: ${tarName}`);
  }

  // 4. Deploy snippet
  log(`\n${c.bold}${c.green}Deploy snippet:${c.reset}`);
  log(`${c.dim}${'─'.repeat(58)}`);
  log(`kill -9 $(lsof -t -i:3003) 2>/dev/null`);
  log(`cd ~/childcare360-app`);
  log(`tar xf /media/sf_VM_Shared_Folder/${tarName} --strip-components=1`);
  log(`npm install`);
  log(`npx vite build`);
  log(`nohup node server/index.js > childcare360.log 2>&1 &`);
  log(`sleep 3 && curl -s http://localhost:3003/health${c.reset}\n`);

  return tarName;
}

// ─── Report writer ────────────────────────────────────────────────────────────
function writeReport({ staticFindings, aiFindings, fixResults, version }) {
  const all      = dedup([...staticFindings, ...aiFindings]);
  const critical = all.filter(f => f.severity === 'critical');
  const warnings = all.filter(f => f.severity === 'warning');
  const infos    = all.filter(f => f.severity === 'info');
  const now      = new Date().toISOString();

  let md = `# Childcare360 Release Bug Report\n\n`;
  md += `**Generated:** ${now}  \n`;
  md += `**Version:** ${version}  \n`;
  md += `**Mode:** ${SKIP_AI ? 'Static only' : 'Static + AI semantic'}${FIX ? ' + auto-fix' : ''}${DRY_RUN ? ' (dry-run)' : ''}  \n\n`;
  md += `## Summary\n\n`;
  md += `| Severity | Found | Auto-fixed |\n|----------|-------|------------|\n`;
  md += `| 🔴 Critical | ${critical.length} | ${fixResults.fixed.length} file(s) |\n`;
  md += `| 🟡 Warning | ${warnings.length} | — |\n`;
  md += `| ℹ️ Info | ${infos.length} | — |\n\n`;

  if (fixResults.failed.length > 0) {
    md += `## ❌ Manual Action Required\n\n`;
    for (const f of fixResults.failed) {
      md += `- **${f.file}** \`[${f.rule}]\` — ${f.error}\n`;
    }
    md += '\n';
  }

  if (critical.length > 0) {
    md += `## 🔴 Critical Issues\n\n`;
    for (const f of critical) {
      const flag = fixResults.fixed.includes(f.file) ? ' ✅ auto-fixed' : '';
      md += `### \`${f.file}\` line ${f.line || '?'} — \`${f.rule}\`${flag}\n`;
      md += `**Issue:** ${f.description}  \n**Fix:** ${f.fix_hint}  \n**Detected by:** ${f.source === 'ai' ? 'AI' : 'Static'}  \n\n`;
    }
  }

  if (warnings.length > 0) {
    md += `## 🟡 Warnings\n\n`;
    for (const f of warnings) {
      md += `- **${f.file}**:${f.line || '?'} \`[${f.rule}]\` — ${f.description}\n`;
    }
    md += '\n';
  }

  md += `---\n*Generated by Childcare360 Release Agent*\n`;
  writeFile('RELEASE_BUG_REPORT.md', md);
  return 'RELEASE_BUG_REPORT.md';
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();

  log(`\n${c.bold}${c.magenta}╔══════════════════════════════════════════╗`);
  log(`║   🔍 Childcare360 Release Agent          ║`);
  log(`╚══════════════════════════════════════════╝${c.reset}`);

  const modeFlags = [
    SKIP_AI ? 'static-only' : 'static + AI',
    FIX     ? 'auto-fix'    : 'report-only',
    PACKAGE ? 'package'     : null,
    DRY_RUN ? 'DRY-RUN'    : null,
  ].filter(Boolean).join(' | ');
  log(`${c.dim}  Mode: ${modeFlags}${c.reset}\n`);

  // Load .env if present
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1 || line.startsWith('#')) continue;
      const key = line.substring(0, eqIdx).trim();
      const val = line.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && !process.env[key]) process.env[key] = val;
    }
  }

  const pkg = JSON.parse(readFile('package.json') || '{"version":"0.0.0"}');
  info(`Current version: ${c.cyan}${pkg.version}${c.reset}`);
  if (!process.env.ANTHROPIC_API_KEY && !SKIP_AI) {
    warn(`ANTHROPIC_API_KEY not set — AI analysis and AI-based fixes unavailable`);
    info(`Built-in fixes (form tags, CSS imports, version mismatch) will still work`);
  }

  const FILES = discoverFiles();
  info(`Found ${FILES.jsx.length} JSX files, ${FILES.server.length} server files`);

  let staticFindings = [];
  let aiFindings     = [];
  let fixResults     = { fixed: [], failed: [] };

  // ── Phase 1 ──────────────────────────────────────────────────────────────
  hdr('Phase 1 — Static Analysis');
  staticFindings = runStaticAnalysis();
  const sCrit = staticFindings.filter(f => f.severity === 'critical');
  const sWarn = staticFindings.filter(f => f.severity === 'warning');

  if (sCrit.length === 0 && sWarn.length === 0) {
    ok('All static checks passed');
  } else {
    for (const f of sCrit)  fail(`${c.red}CRITICAL${c.reset} ${f.file}:${f.line || '?'} [${f.rule}] — ${f.description}`);
    for (const f of sWarn)  warn(`${f.file}:${f.line || '?'} [${f.rule}] — ${f.description}`);
  }

  // ── Phase 2 ───────────────────────────────────────────────────────────────
  if (!SKIP_AI && process.env.ANTHROPIC_API_KEY) {
    hdr('Phase 2 — AI Semantic Analysis');
    aiFindings = await runAIAnalysis(FILES);
  } else if (!SKIP_AI) {
    info('AI analysis skipped — set ANTHROPIC_API_KEY in .env to enable');
  }

  // ── Auto-fix ──────────────────────────────────────────────────────────────
  const allCritical = dedup([...staticFindings, ...aiFindings]).filter(f => f.severity === 'critical');

  if (FIX && allCritical.length > 0) {
    hdr('Auto-fix — Critical Issues');
    fixResults = await autoFix(allCritical);

    if (fixResults.fixed.length > 0 && !DRY_RUN) {
      log('');
      info('Re-running static checks on fixed files...');
      const recheck = runStaticAnalysis().filter(f =>
        f.severity === 'critical' && fixResults.fixed.includes(f.file)
      );
      if (recheck.length === 0) {
        ok('All fixed files now pass static checks ✓');
      } else {
        for (const f of recheck) warn(`Still present after fix: ${f.file}:${f.line} [${f.rule}]`);
      }
    }
  } else if (FIX) {
    info('No critical issues to fix');
  }

  // ── Report ────────────────────────────────────────────────────────────────
  hdr('Report');
  writeReport({ staticFindings, aiFindings, fixResults, version: pkg.version });
  ok('Written: RELEASE_BUG_REPORT.md');

  // ── Summary ───────────────────────────────────────────────────────────────
  hdr('Summary');
  const allFindings = dedup([...staticFindings, ...aiFindings]);
  const totalCrit   = allFindings.filter(f => f.severity === 'critical').length;
  const totalWarn   = allFindings.filter(f => f.severity === 'warning').length;
  const unfixed     = Math.max(0, totalCrit - fixResults.fixed.length) + fixResults.failed.filter(f => !f.error.includes('no API key')).length;
  const elapsed     = ((Date.now() - startTime) / 1000).toFixed(1);

  log(`\n  ${'─'.repeat(46)}`);
  log(`  Critical: ${totalCrit === 0 ? c.green : c.red}${totalCrit}${c.reset}  (${fixResults.fixed.length} auto-fixed, ${unfixed > 0 ? c.red : c.green}${unfixed} remaining${c.reset})`);
  log(`  Warnings: ${totalWarn === 0 ? c.green : c.yellow}${totalWarn}${c.reset}`);
  log(`  Time:     ${elapsed}s`);
  log(`  ${'─'.repeat(46)}\n`);

  // ── Package ───────────────────────────────────────────────────────────────
  if (PACKAGE) {
    if (unfixed > 0) {
      fail(`Cannot package: ${unfixed} critical issue(s) remain unfixed.`);
      process.exit(1);
    }
    const newVersion = TARGET_VERSION || bumpPatch(pkg.version);
    packageRelease(newVersion);
  } else if (FIX && fixResults.fixed.length > 0) {
    info(`Fixes applied. Run with --package to create a release tar.`);
  }

  process.exit(unfixed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(`\n${c.red}${c.bold}Fatal: ${e.message}${c.reset}`);
  if (VERBOSE) console.error(e.stack);
  process.exit(2);
});
