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
const TARGET_VERSION = (vIdx !== -1 && args[vIdx + 1] && /^\d+\.\d+\.\d+$/.test(args[vIdx + 1]))
  ? args[vIdx + 1]
  : null;
const MAX_RETRIES = 2;
const AI_MODEL = 'claude-sonnet-4-6';

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
const FILES = {
  jsx: [
    'src/App.jsx',
    'src/AuthModule.jsx',
    'src/RosteringModule.jsx',
    'src/EducatorsModule.jsx',
    'src/ChildrenModule.jsx',
    'src/RoomsModule.jsx',
    'src/LearningModule.jsx',
    'src/LearningJourneyModule.jsx',
    'src/ComplianceModule.jsx',
    'src/InvoicingModule.jsx',
    'src/OwnerPortalModule.jsx',
    'src/StaffPortalModule.jsx',
    'src/ParentPortalModule.jsx',
    'src/MessagingModule.jsx',
    'src/VoiceAgentModule.jsx',
    'src/RunSheetModule.jsx',
    'src/DailyUpdatesModule.jsx',
    'src/EnrolmentModule.jsx',
    'src/ExcursionsModule.jsx',
    'src/DocumentsModule.jsx',
    'src/IncidentModule.jsx',
    'src/MedicationRegisterModule.jsx',
    'src/WaitlistModule.jsx',
    'src/StaffWellbeingModule.jsx',
    'src/SOC2Module.jsx',
  ],
  server: [
    'server/index.js',
    'server/db.js',
    'server/middleware.js',
    'server/auth.js',
    'server/api.js',
    'server/rostering.js',
    'server/roster-enhancements.js',
    'server/operations.js',
    'server/v2-features.js',
    'server/retell.js',
    'server/voice.js',
    'server/shift-voice.js',
    'server/educators.js',
    'server/children.js',
    'server/learning.js',
    'server/platform.js',
    'server/compliance.js',
    'server/invoicing.js',
    'server/enrolment.js',
    'server/waitlist.js',
    'server/documents.js',
    'server/messaging.js',
    'server/staff.js',
    'server/parent.js',
    'server/incidents.js',
    'server/wellbeing.js',
    'server/ai.js',
    'server/audit.js',
    'server/settings.js',
    'server/reports.js',
    'server/runsheet.js',
    'server/daily-updates.js',
    'server/excursions.js',
    'server/register.js',
  ],
};

// Tables that MUST always be scoped by tenant_id in queries
const TENANT_SCOPED_TABLES = [
  // Core
  'rooms', 'children', 'educators', 'educator_availability', 'educator_notes',
  'educator_absences', 'educator_documents', 'educator_room_assignments',
  'leave_requests', 'clock_records', 'age_group_settings',
  // Rostering
  'roster_periods', 'roster_entries', 'roster_templates', 'roster_change_proposals',
  'roster_compliance_alerts', 'roster_cost_cache',
  'shift_fill_requests', 'shift_fill_attempts', 'shift_swaps',
  'lunch_cover_sessions', 'non_contact_time', 'room_movements', 'room_groups',
  'room_group_schedules', 'attendance_forecasts', 'rp_coverage_log',
  'qualification_compliance_log', 'staffing_agencies', 'agency_bookings',
  'award_classifications', 'fatigue_rules', 'public_holidays',
  'pay_periods', 'pay_lines', 'performance_reviews',
  // Children & families
  'observations', 'daily_plans', 'daily_updates', 'child_dietary',
  'child_documents', 'child_event_log', 'child_permissions', 'child_eylf_progress',
  'immunisation_records', 'medical_plans', 'medications', 'medication_log',
  'authorised_pickups', 'parental_requests', 'parent_contacts', 'parent_messages',
  'parent_feedback', 'parent_learning_input',
  // Learning
  'learning_stories', 'story_photos', 'learning_albums', 'weekly_reports',
  'families', 'family_children',
  // Compliance & admin
  'compliance_items', 'compliance_todo', 'nqs_self_assessment', 'qip_goals',
  'equipment_register', 'notifications', 'notification_templates',
  'audit_log', 'activity_log', 'broadcast_queue',
  // Invoicing
  'invoices', 'payments', 'ccs_details', 'ccs_session_reports',
  'attendance_sessions', 'fee_schedules',
  // Enrolment & comms
  'enrolment_applications', 'waitlist', 'messages',
  'excursions', 'excursion_children', 'excursion_educators',
  // Staff & voice
  'staff_wellbeing', 'necwr_submissions',
  'voice_calls', 'voice_call_turns', 'voice_settings', 'ai_agent_config',
  // Incidents
  'incidents',
  // Tenant-level (membership)
  'tenant_members',
];

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

// ─── Phase 1: Static analysis ─────────────────────────────────────────────────
function runStaticAnalysis() {
  const findings = [];

  // ── JSX checks ──────────────────────────────────────────────────────────────
  for (const file of FILES.jsx) {
    const content = readFile(file);
    if (!content) { warn(`File not found, skipping: ${file}`); continue; }

    // 1. <form> tags (critical)
    for (const m of content.matchAll(/<form[\s>]/g)) {
      findings.push({
        severity: 'critical', file, line: lineOf(content, m.index),
        rule: 'no-form-tags',
        description: '<form> tag detected — React hydration conflict risk.',
        fix_hint: 'Replace <form> with <div>. Move submit to button onClick.',
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
    for (const m of content.matchAll(/import ['"][^'"]+\.css['"]/g)) {
      findings.push({
        severity: 'critical', file, line: lineOf(content, m.index),
        rule: 'no-css-imports',
        description: `CSS file import detected: ${m[0]}`,
        fix_hint: 'Remove CSS import. Convert all styles to inline style={{}} objects.',
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

    // 5. Inline style missing (objects using className for non-existent CSS)
    // Skip — too many false positives with Tailwind-style class names
  }

  // ── Server checks ────────────────────────────────────────────────────────────
  for (const file of FILES.server) {
    const content = readFile(file);
    if (!content) { warn(`File not found, skipping: ${file}`); continue; }

    // 6. Hardcoded credentials (critical)
    const credPatterns = [
      // Match password = "something" but not bcrypt hashes, env refs, or test values
      { re: /(?:password|passwd)\s*[=:]\s*['"](?!.{0,5}123|test|hash|example|process\.env)([^'"]{6,})['"]/gi, label: 'hardcoded password' },
      { re: /(?:apiKey|api_key|apikey)\s*[=:]\s*['"](?!your_|<|{|process\.env)([^'"]{12,})['"]/gi, label: 'hardcoded API key' },
      { re: /(?:secret|jwt_secret)\s*[=:]\s*['"](?!your_|<|{|process\.env|dummy)([^'"]{10,})['"]/gi, label: 'hardcoded secret' },
    ];
    for (const { re, label } of credPatterns) {
      for (const m of content.matchAll(re)) {
        if (m[0].includes('process.env') || m[0].includes('bcrypt')) continue;
        findings.push({
          severity: 'critical', file, line: lineOf(content, m.index),
          rule: 'hardcoded-credential',
          description: `Possible ${label}: ${m[0].substring(0, 50)}`,
          fix_hint: 'Move value to environment variable accessed via process.env.YOUR_KEY',
        });
      }
    }

    // 7. Async route handlers without try/catch (warning) — skip db.js (schema file)
    if (file !== 'server/db.js') {
      for (const m of content.matchAll(/router\.(get|post|put|delete|patch)\s*\([^,\n]+,\s*async\s*(?:\([^)]*\)|\w+)\s*=>/g)) {
        // Use 2000 chars to accommodate handlers with substantial setup code before try{}
        const after = content.substring(m.index, m.index + 2000);
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

    // 8. SQL queries on tenant-scoped tables without tenant_id (critical) — skip db.js
    if (file !== 'server/db.js') {
      // Match both db.prepare() and D().prepare() — the codebase uses D() throughout server files
      for (const m of content.matchAll(/(?:db|D\(\))\.prepare\s*\(\s*`([^`]+)`\s*\)/g)) {
        const sql = m[1].toLowerCase();
        if (sql.includes('create table') || sql.includes('alter table') ||
            sql.includes('drop table') || sql.includes('pragma')) continue;

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

    // 9. String interpolation in SQL (SQL injection risk) (critical)
    // Match both db.prepare() and D().prepare()
    if (file !== 'server/db.js') {
      for (const m of content.matchAll(/(?:db|D\(\))\.prepare\s*\(\s*`[^`]*\$\{[^}]*(?:req\.|body\.|params\.|query\.)[^}]*\}[^`]*`\s*\)/g)) {
        findings.push({
          severity: 'critical', file, line: lineOf(content, m.index),
          rule: 'sql-injection-risk',
          description: 'SQL injection risk: user input interpolated directly into query string.',
          fix_hint: 'Use parameterised query with ? placeholders and pass values separately to .run()/.get()/.all()',
        });
      }
    }
  }

  // ── Cross-file checks ────────────────────────────────────────────────────────

  // 10. Routes not mounted in server/index.js
  const indexContent = readFile('server/index.js');
  if (indexContent) {
    const routeFiles = FILES.server.filter(f =>
      !['server/index.js', 'server/db.js', 'server/middleware.js'].includes(f)
    );
    for (const file of routeFiles) {
      const name = path.basename(file, '.js');
      // ESM Node.js requires explicit .js extensions in imports — check both forms
      const importVariants = [
        `'./${name}'`,   `"./${name}"`,
        `'./${name}.js'`, `"./${name}.js"`,
        `'./server/${name}'`,   `"./server/${name}"`,
        `'./server/${name}.js'`, `"./server/${name}.js"`,
      ];
      const mounted = importVariants.some(v => indexContent.includes(v));
      if (!mounted) {
        findings.push({
          severity: 'warning', file, line: 1,
          rule: 'route-not-mounted',
          description: `server/${name}.js may not be imported in server/index.js`,
          fix_hint: `Import and mount the router from server/${name}.js in server/index.js`,
        });
      }
    }
  }

  // 11. Version consistency between package.json and App.jsx
  const pkg = readFile('package.json');
  const appJsx = readFile('src/App.jsx');
  if (pkg && appJsx) {
    try {
      const pkgVersion = JSON.parse(pkg).version;
      if (!pkgVersion) throw new Error('No version field in package.json');
      const vMatch = appJsx.match(/v(\d+\.\d+\.\d+)/);
      if (vMatch && vMatch[1] !== pkgVersion) {
        findings.push({
          severity: 'warning', file: 'src/App.jsx', line: 1,
          rule: 'version-mismatch',
          description: `Version mismatch: package.json has ${pkgVersion}, App.jsx shows v${vMatch[1]}`,
          fix_hint: `Update version string in App.jsx sidebar to v${pkgVersion}`,
        });
      }
    } catch {}
  }

  return dedup(findings);
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
8. No DB queries missing .catch() or try/catch
9. JWT must be verified before accessing req.user.tenant_id

Tenant-scoped tables (always need WHERE tenant_id = ?):
rooms, children, educators, roster_entries, shift_fill_requests, educator_absences,
leave_requests, learning_stories, compliance_scans, families, invoices, excursions,
enrolment_applications, waitlist_entries, audit_log, tenant_members

SEVERITY GUIDE:
- critical: data leak, security flaw, server crash risk, violates above rules
- warning: likely bug, missing validation, unhandled edge case, deprecated usage
- info: suggestion, minor improvement, style inconsistency

Respond ONLY with valid JSON — no markdown, no backticks, no explanation:
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

async function callAI(messages, maxTokens = 2000) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in environment');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: maxTokens,
      system: ANALYSIS_SYSTEM,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body.substring(0, 200)}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function analyzeFile(file, content) {
  const MAX_CHARS = 100_000;
  const truncated = content.length > MAX_CHARS;
  const body = truncated
    ? content.substring(0, MAX_CHARS) + '\n\n// [TRUNCATED — file too large for single-pass analysis]'
    : content;

  const text = await callAI([{
    role: 'user',
    content: `Review this file for bugs. File: ${file}\n\n\`\`\`\n${body}\n\`\`\``,
  }]);

  const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```\s*$/m, '').trim();

  try {
    const result = JSON.parse(clean);
    return (result.findings || []).map(f => ({ ...f, file, source: 'ai' }));
  } catch {
    if (VERBOSE) warn(`Could not parse AI response for ${file}:\n${clean.substring(0, 200)}`);
    return [];
  }
}

async function runAIAnalysis() {
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

    // Polite delay to avoid API rate limits
    await new Promise(r => setTimeout(r, 250));
  }

  return dedup(all);
}

// ─── Auto-fix (search/replace strategy) ──────────────────────────────────────
// Instead of rewriting entire large files, we ask Claude for a precise
// search-string → replacement-string pair. Reliable within token limits.

const FIX_SYSTEM = `You are fixing a specific bug in a Childcare360 source file.

You will be given:
- The file path and the bug description
- The surrounding code (±30 lines around the bug)
- The full file for context

Respond ONLY with valid JSON — no markdown, no explanation:
{
  "search": "<exact multi-line string to find — must appear exactly once in the full file>",
  "replace": "<replacement string that fixes the bug>"
}

Rules:
- "search" must be a verbatim substring of the file (copy/paste exact)
- Include enough context in "search" that it is unique (2-5 lines is ideal)  
- "replace" must preserve all surrounding logic and formatting
- Never break existing functionality
- For no-form-tags: replace <form with <div, keep all attributes/children
- For sql-missing-tenant-id: add AND tenant_id = ? to WHERE clause and bind it
- For async-missing-try-catch: wrap the handler body in try/catch
- For no-css-imports: remove the import line entirely
- Never add explanatory comments in the replacement`;

async function generateFix(file, content, finding) {
  const context = finding.line
    ? extractLines(content, finding.line, 30)
    : content.substring(0, 2000);

  const prompt = `Fix this bug in ${file}.

Bug: [${finding.rule}] ${finding.description}
Fix hint: ${finding.fix_hint}
${finding.line ? `Location: line ${finding.line}` : ''}

Code around the bug:
\`\`\`
${context}
\`\`\`

Full file (for uniqueness verification of search string):
\`\`\`
${content.substring(0, 80_000)}
\`\`\``;

  const text = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 1000,
      system: FIX_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  }).then(r => r.json()).then(d => d.content?.[0]?.text || '');

  const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  const patch = JSON.parse(clean);

  if (!patch.search || patch.replace === undefined) throw new Error('Invalid patch structure');
  if (!content.includes(patch.search)) throw new Error(`Search string not found in file:\n${patch.search.substring(0, 100)}`);
  if ((content.match(new RegExp(patch.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length > 1) {
    throw new Error('Search string is not unique — would create ambiguous replacement');
  }

  return patch;
}

async function autoFix(allFindings) {
  const criticals = allFindings.filter(f => f.severity === 'critical');
  const byFile = {};
  for (const f of criticals) {
    if (!byFile[f.file]) byFile[f.file] = [];
    byFile[f.file].push(f);
  }

  const fixed  = [];
  const failed = [];

  for (const [file, bugs] of Object.entries(byFile)) {
    log(`\n  ${c.bold}${file}${c.reset} — ${bugs.length} critical bug(s)`);

    for (const bug of bugs) {
      process.stdout.write(`    ${c.dim}[${bug.rule}] line ${bug.line || '?'}...${c.reset} `);

      let content = readFile(file);
      let attempt = 0;
      let succeeded = false;

      while (attempt < MAX_RETRIES && !succeeded) {
        attempt++;
        try {
          const patch = await generateFix(file, content, bug);
          const newContent = content.replace(patch.search, patch.replace);

          // Sanity check — file shouldn't shrink drastically
          if (newContent.length < content.length * 0.8) {
            throw new Error(`Replacement would shrink file by ${Math.round((1 - newContent.length / content.length) * 100)}%`);
          }

          if (!DRY_RUN) {
            // Backup original on first fix to this file
            const bakPath = file + '.bak';
            if (!fs.existsSync(path.join(ROOT, bakPath))) {
              writeFile(bakPath, content);
            }
            writeFile(file, newContent);
          }

          content = newContent; // Use updated content for next bug in same file
          process.stdout.write(`${c.green}✓ fixed${c.reset}${DRY_RUN ? ' (dry-run)' : ''}\n`);
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
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    warn(`Invalid version string "${version}" — defaulting to 0.0.1`);
    return '0.0.1';
  }
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
    // Target the sidebar version string specifically — avoids replacing version numbers
    // that appear earlier in the file (comments, import paths, etc.)
    // Matches patterns like: "v2.4.0" or v2.4.0 near "Childcare360" or "version" context
    let updated = app;
    // Try specific sidebar patterns first (most reliable)
    const sidebarPatterns = [
      /(Childcare360[^<]*v)\d+\.\d+\.\d+/,
      /(v)\d+\.\d+\.\d+(?=\s*<\/(?:span|div|p|small))/,
    ];
    let patched = false;
    for (const pat of sidebarPatterns) {
      const attempt = app.replace(pat, `$1${version}`);
      if (attempt !== app) { updated = attempt; patched = true; break; }
    }
    // Fallback: replace first version string (original behaviour)
    if (!patched) updated = app.replace(/v\d+\.\d+\.\d+/, `v${version}`);

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

  const tarCmd = [
    `cd ${ROOT}`,
    `&& tar czf ${tarName}`,
    `--exclude='./data'`,
    `--exclude='./node_modules'`,
    `--exclude='./.env'`,
    `--exclude='./dist'`,
    `--exclude='./.git'`,
    `--exclude='./*.tar.gz'`,
    `--exclude='./*.bak'`,
    `--exclude='./src/*.bak'`,
    `--exclude='./server/*.bak'`,
    `--exclude='./scripts/*.bak'`,
    `--exclude='./RELEASE_BUG_REPORT.md'`,
    `.`,
  ].join(' ');

  if (!DRY_RUN) {
    try {
      execSync(tarCmd, { stdio: 'pipe' });
      ok(`Created: ${c.green}${tarName}${c.reset}`);
    } catch (e) {
      fail(`tar failed: ${e.message}`);
      process.exit(2);
    }
  } else {
    info(`[dry-run] would create: ${tarName}`);
  }

  // 4. Print deploy snippet
  log(`\n${c.bold}${c.green}Deploy snippet:${c.reset}`);
  log(`${c.dim}${'─'.repeat(58)}`);
  log(`kill -9 $(lsof -t -i:3003) 2>/dev/null`);
  log(`cd ~/childcare360-app`);
  log(`tar xf /media/sf_VM_Shared_Folder/${tarName} --strip-components=1`);
  log(`npm install`);
  log(`npx vite build`);
  log(`nohup node server/index.js > childcare360.log 2>&1 &`);
  log(`sleep 3 && curl -s http://localhost:3003/health${c.reset}`);

  return tarName;
}

// ─── Report writer ────────────────────────────────────────────────────────────
function writeReport({ staticFindings, aiFindings, fixResults, version }) {
  const all      = dedup([...staticFindings, ...aiFindings]);
  const critical = all.filter(f => f.severity === 'critical');
  const warnings = all.filter(f => f.severity === 'warning');
  const infos    = all.filter(f => f.severity === 'info');

  const now = new Date().toISOString();
  const pkg = JSON.parse(readFile('package.json') || '{"version":"?"}');

  let md = `# Childcare360 Release Bug Report\n\n`;
  md += `**Generated:** ${now}  \n`;
  md += `**Version checked:** ${pkg.version}  \n`;
  md += `**Mode:** ${SKIP_AI ? 'Static only' : 'Static + AI semantic'}${FIX ? ' + auto-fix' : ''}${DRY_RUN ? ' (dry-run)' : ''}  \n\n`;

  md += `## Summary\n\n`;
  md += `| Severity | Found | Auto-fixed |\n`;
  md += `|----------|-------|------------|\n`;
  md += `| 🔴 Critical | ${critical.length} | ${fixResults.fixed.length} file(s) |\n`;
  md += `| 🟡 Warning | ${warnings.length} | — |\n`;
  md += `| ℹ️ Info | ${infos.length} | — |\n\n`;

  if (fixResults.failed.length > 0) {
    md += `## ❌ Auto-fix Failures (Manual Action Required)\n\n`;
    for (const f of fixResults.failed) {
      md += `- **${f.file}** \`[${f.rule}]\` — ${f.error}\n`;
    }
    md += '\n';
  }

  if (critical.length > 0) {
    md += `## 🔴 Critical Issues\n\n`;
    for (const f of critical) {
      const fixedFlag = fixResults.fixed.includes(f.file) ? ' ✅ auto-fixed' : '';
      md += `### \`${f.file}\` line ${f.line || '?'} — \`${f.rule}\`${fixedFlag}\n`;
      md += `**Issue:** ${f.description}  \n`;
      md += `**Fix:** ${f.fix_hint}  \n`;
      md += `**Detected by:** ${f.source === 'ai' ? 'AI semantic analysis' : 'Static analysis'}  \n\n`;
    }
  }

  if (warnings.length > 0) {
    md += `## 🟡 Warnings\n\n`;
    for (const f of warnings) {
      md += `- **${f.file}**:${f.line || '?'} \`[${f.rule}]\` — ${f.description}\n`;
    }
    md += '\n';
  }

  if (infos.length > 0) {
    md += `## ℹ️ Info\n\n`;
    for (const f of infos) {
      md += `- **${f.file}**:${f.line || '?'} — ${f.description}\n`;
    }
    md += '\n';
  }

  md += `## Files Analysed\n\n`;
  md += `\`\`\`\n`;
  md += [...FILES.jsx, ...FILES.server].join('\n');
  md += `\n\`\`\`\n\n`;

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
      const [key, ...vals] = line.split('=');
      if (key && !key.startsWith('#') && !process.env[key.trim()]) {
        process.env[key.trim()] = vals.join('=').trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }

  const pkg = JSON.parse(readFile('package.json') || '{"version":"0.0.0"}');
  info(`Current version: ${c.cyan}${pkg.version}${c.reset}`);

  let staticFindings = [];
  let aiFindings     = [];
  let fixResults     = { fixed: [], failed: [] };

  // ── Phase 1: Static ──────────────────────────────────────────────────────
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

  // ── Phase 2: AI ───────────────────────────────────────────────────────────
  if (!SKIP_AI) {
    hdr('Phase 2 — AI Semantic Analysis');
    if (!process.env.ANTHROPIC_API_KEY) {
      warn('ANTHROPIC_API_KEY not found — skipping AI analysis');
      info('Set it in .env or as an environment variable to enable AI checks');
    } else {
      aiFindings = await runAIAnalysis();
    }
  } else {
    info('AI analysis skipped (--skip-ai flag)');
  }

  // ── Auto-fix ──────────────────────────────────────────────────────────────
  const allCritical = dedup([...staticFindings, ...aiFindings]).filter(f => f.severity === 'critical');

  if (FIX && allCritical.length > 0) {
    hdr('Auto-fix — Critical Issues');
    fixResults = await autoFix(allCritical);

    // Re-run static on fixed files to verify
    if (fixResults.fixed.length > 0 && !DRY_RUN) {
      log('');
      info('Re-running static checks on fixed files...');
      const recheck = runStaticAnalysis().filter(f =>
        f.severity === 'critical' && fixResults.fixed.includes(f.file)
      );
      if (recheck.length === 0) {
        ok('All fixed files now pass static checks');
      } else {
        for (const f of recheck) warn(`Still present after fix: ${f.file}:${f.line} [${f.rule}]`);
      }
    }
  } else if (FIX && allCritical.length === 0) {
    info('No critical issues to fix');
  }

  // ── Report ────────────────────────────────────────────────────────────────
  hdr('Report');
  const reportPath = writeReport({ staticFindings, aiFindings, fixResults, version: pkg.version });
  ok(`Written: ${reportPath}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  hdr('Summary');
  const allFindings = dedup([...staticFindings, ...aiFindings]);
  const totalCrit   = allFindings.filter(f => f.severity === 'critical').length;
  const totalWarn   = allFindings.filter(f => f.severity === 'warning').length;
  const unfixed     = totalCrit - fixResults.fixed.length + fixResults.failed.length;

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  log(`\n  ${'─'.repeat(46)}`);
  log(`  Critical: ${totalCrit === 0 ? c.green : c.red}${totalCrit}${c.reset}  (${fixResults.fixed.length} auto-fixed, ${c.red}${unfixed} remaining${c.reset})`);
  log(`  Warnings: ${totalWarn === 0 ? c.green : c.yellow}${totalWarn}${c.reset}`);
  log(`  Time:     ${elapsed}s`);
  log(`  ${'─'.repeat(46)}\n`);

  // ── Package ───────────────────────────────────────────────────────────────
  if (PACKAGE) {
    if (unfixed > 0) {
      fail(`Cannot package: ${unfixed} critical issue(s) remain unfixed.`);
      fail(`Run with --fix to attempt auto-fixing, then re-run with --package`);
      process.exit(1);
    }
    const newVersion = TARGET_VERSION || bumpPatch(pkg.version);
    packageRelease(newVersion);
  }

  if (unfixed > 0 && !PACKAGE) {
    log(`${c.yellow}  Run with --fix to attempt auto-fixing critical issues.${c.reset}\n`);
  }

  process.exit(unfixed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(`\n${c.red}${c.bold}Fatal: ${e.message}${c.reset}`);
  if (VERBOSE) console.error(e.stack);
  process.exit(2);
});
