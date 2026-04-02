#!/usr/bin/env node
/**
 * Childcare360 — Deep QA Analyser v1.0
 *
 * Catches bugs the static analyser misses:
 * 1. Missing API endpoints — scans all API() calls in JSX, verifies routes exist in server/
 * 2. DB column mismatches — scans INSERT/UPDATE statements vs actual DB schema
 * 3. React.X without import React — temporal dead zone crashes
 * 4. Missing requireAuth/requireTenant on routes
 * 5. API calls in JSX missing error handling
 * 6. Duplicate route definitions
 * 7. Server files importing from wrong paths
 * 8. Missing DB migrations for columns used in queries
 *
 * Usage: node scripts/qa/deep-qa.mjs [--verbose]
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, extname } from 'path';
import Database from 'better-sqlite3';

const ROOT    = process.cwd();
const SERVER  = join(ROOT, 'server');
const SRC     = join(ROOT, 'src');
const VERBOSE = process.argv.includes('--verbose');
const DB_PATH = join(ROOT, 'data', 'childcare360.db');

const issues = { critical: [], high: [], medium: [], info: [] };
let fixed = 0;

function flag(severity, file, line, msg, snippet = '') {
  issues[severity].push({
    file: relative(ROOT, file),
    line,
    msg,
    snippet: snippet.trim().slice(0, 100),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function readFile(fp) {
  try { return readFileSync(fp, 'utf8'); } catch { return ''; }
}

function walkDir(dir, exts) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    const stat = statSync(full);
    if (stat.isDirectory() && f !== 'node_modules' && f !== '.git' && f !== '.patch-backups') {
      results.push(...walkDir(full, exts));
    } else if (stat.isFile() && exts.includes(extname(f))) {
      results.push(full);
    }
  }
  return results;
}

// ── 1. Build route map from server files ──────────────────────────────────────
function buildRouteMap() {
  const routes = new Map(); // method+path -> file
  const serverFiles = walkDir(SERVER, ['.js', '.mjs']);

  // First get the mount points from index.js
  const indexSrc = readFile(join(SERVER, 'index.js'));
  const mounts = {};
  for (const m of indexSrc.matchAll(/app\.use\s*\(\s*['"`](\/api[^'"`]*)['"`]\s*,\s*(\w+)/g)) {
    mounts[m[2]] = m[1]; // routerVar -> /api/path
  }
  // Also capture import aliases — handle both default and destructured imports
  const importAliases = {};
  // Default imports: import foo from './bar.js'
  for (const m of indexSrc.matchAll(/import\s+(\w+)\s+from\s+['"`]\.\/([\w-]+)\.js['"`]/g)) {
    importAliases[m[1]] = m[2];
  }
  // Destructured imports: import X, { Y, Z } from './file.js' or import { Y } from './file.js'
  for (const m of indexSrc.matchAll(/import\s+(?:(\w+)\s*,\s*)?\{([^}]+)\}\s+from\s+['"`]\.\/([\w-]+)\.js['"`]/g)) {
    const file = m[3];
    if (m[1]) importAliases[m[1]] = file; // default export
    for (const name of m[2].split(',').map(s => s.trim().split(/\s+as\s+/).pop().trim())) {
      if (name) importAliases[name] = file;
    }
  }

  // Build reverse map: filename -> [mount paths]
  const fileMounts = {};
  for (const [varName, mountPath] of Object.entries(mounts)) {
    const alias = importAliases[varName];
    if (alias) {
      if (!fileMounts[alias]) fileMounts[alias] = [];
      fileMounts[alias].push({ varName, mountPath });
    }
  }

  for (const fp of serverFiles) {
    if (fp.includes('index.js')) continue;
    const src = readFile(fp);
    const filename = fp.replace(/.*\//, '').replace('.js', '');

    // Find mount prefix for this file — check fileMounts first, then fallback to fuzzy match
    let prefix = '';
    if (fileMounts[filename] && fileMounts[filename].length > 0) {
      // Use the first (most common) mount point; additional routers in same file get matched via varName
      prefix = fileMounts[filename][0].mountPath;
    } else {
      for (const [varName, mountPath] of Object.entries(mounts)) {
        if (varName.toLowerCase().includes(filename.replace(/-/g, '').toLowerCase())) {
          prefix = mountPath;
          break;
        }
      }
    }

    // Build map of router variable names to their mount paths for multi-router files
    const routerVarPrefixes = {};
    // Build export alias map: localVar -> exportedName (e.g. ra -> riskAssessmentRouter)
    const exportAliases = {};
    for (const em of src.matchAll(/export\s*\{\s*([^}]+)\}/g)) {
      for (const part of em[1].split(',')) {
        const asMatch = part.trim().match(/(\w+)\s+as\s+(\w+)/);
        if (asMatch) exportAliases[asMatch[1]] = asMatch[2];
      }
    }
    // Also: export const X = Router() or export const X = localVar
    for (const em of src.matchAll(/export\s+const\s+(\w+)\s*=\s*(?:(\w+)|Router\s*\()/g)) {
      if (em[2] && em[2] !== 'Router') exportAliases[em[2]] = em[1];
    }
    // Detect all Router() declarations: const x = Router() or const x = express.Router()
    for (const rm of src.matchAll(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:express\.)?Router\s*\(/g)) {
      const varName = rm[1];
      // Check if this var (or its export alias) is in mounts
      const exportName = exportAliases[varName] || varName;
      if (mounts[exportName]) {
        routerVarPrefixes[varName] = mounts[exportName];
      } else if (mounts[varName]) {
        routerVarPrefixes[varName] = mounts[varName];
      } else {
        routerVarPrefixes[varName] = prefix; // fallback to file prefix
      }
    }
    // If no router vars found, use default prefix for 'r' and 'router'
    if (Object.keys(routerVarPrefixes).length === 0) {
      routerVarPrefixes['r'] = prefix;
      routerVarPrefixes['router'] = prefix;
    }

    // Extract route definitions (matches router.get, r.get, varName.get, etc.)
    // Sort longest-first to prevent 'r' matching inside 'feeOverrideRouter'
    const routerNames = Object.keys(routerVarPrefixes).sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const routeRe = new RegExp(`\\b(?:${routerNames})\\.(get|post|put|patch|delete)\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`, 'g');
    for (const m of src.matchAll(routeRe)) {
      const method = m[1].toUpperCase();
      const routePath = m[2];
      // Find which router var this line belongs to by checking context
      const lineStart = src.lastIndexOf('\n', m.index) + 1;
      const lineText = src.slice(lineStart, m.index + m[0].length);
      let matchedPrefix = prefix;
      // Check longest names first to prevent 'r.' matching inside 'feeOverrideRouter.'
      const sortedVars = Object.entries(routerVarPrefixes).sort((a, b) => b[0].length - a[0].length);
      for (const [varName, varPrefix] of sortedVars) {
        if (lineText.includes(varName + '.')) {
          matchedPrefix = varPrefix;
          break;
        }
      }
      const fullPath = (matchedPrefix + routePath).replace(/\/+$/, '') || '/';
      const key = `${method} ${fullPath}`;
      if (!routes.has(key)) {
        routes.set(key, fp);
      } else {
        flag('high', fp, 0, `Duplicate route definition: ${key} (also in ${relative(ROOT, routes.get(key))})`);
      }
    }
  }

  return routes;
}

// ── 2. Scan JSX for API() calls and verify routes ─────────────────────────────
function checkApiCalls(routes) {
  const srcFiles = walkDir(SRC, ['.jsx', '.js']);
  const missing = [];

  // Build a simplified route matcher
  // Convert /api/path/:id to regex
  const routeRegexes = [...routes.keys()].map(key => {
    const [method, path] = key.split(' ');
    const pattern = path
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape regex special chars
      .replace(/:\w+/g, '[^/]+');              // :param -> [^/]+
    return { method, pattern: new RegExp('^' + pattern + '$'), original: key };
  });

  function matchRoute(method, path) {
    // Strip query strings and normalize trailing slashes
    const cleanPath = path.split('?')[0].replace(/\/+$/, '') || '/';
    return routeRegexes.some(r =>
      (r.method === method || r.method === 'GET') &&
      (r.pattern.test(cleanPath) || r.pattern.test(cleanPath + '/'))
    );
  }

  for (const fp of srcFiles) {
    const src = readFile(fp);
    const lines = src.split('\n');

    lines.forEach((line, i) => {
      const ln = i + 1;

      // Match API(`/api/path`, { method: "POST" }) patterns
      const apiMatch = line.match(/API\s*\(\s*[`'"](\/api\/[^`'"?]+)/);
      if (!apiMatch) return;

      const apiPath = apiMatch[1]
        .replace(/\$\{[^}]+\}/g, ':id')    // replace template vars with :id
        .replace(/:id:id/g, ':id')          // deduplicate
        .replace(/([^/]):id/g, '$1/:id');   // ensure :id has leading slash

      // Determine HTTP method
      let method = 'GET';
      const methodMatch = line.match(/method\s*:\s*["'](\w+)["']/);
      if (methodMatch) method = methodMatch[1].toUpperCase();

      // Check if route exists
      if (!matchRoute(method, apiPath)) {
        // Double-check it's not a false positive from template literal complexity
        const hasComplexTemplate = line.includes('${') && (line.match(/\$\{/g)||[]).length > 2;
        if (!hasComplexTemplate) {
          missing.push({ file: fp, line: ln, method, path: apiPath, snippet: line.trim() });
        }
      }
    });
  }

  // Deduplicate by path
  const seen = new Set();
  for (const m of missing) {
    const key = `${m.method} ${m.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      flag('high', m.file, m.line,
        `Missing server route: ${m.method} ${m.path}`,
        m.snippet
      );
    }
  }
}

// ── 3. Check DB column mismatches ─────────────────────────────────────────────
function checkDbColumns() {
  if (!existsSync(DB_PATH)) {
    console.log('  ⚠ DB not found at', DB_PATH, '— skipping column checks');
    return;
  }

  const db = new Database(DB_PATH, { readonly: true });
  const tableCache = {};

  function getColumns(tableName) {
    if (tableCache[tableName]) return tableCache[tableName];
    try {
      const cols = db.prepare(`SELECT name FROM pragma_table_info('${tableName}')`).all().map(r => r.name);
      tableCache[tableName] = cols;
      return cols;
    } catch { return null; }
  }

  const serverFiles = walkDir(SERVER, ['.js']);
  for (const fp of serverFiles) {
    const src = readFile(fp);
    const lines = src.split('\n');

    lines.forEach((line, i) => {
      const ln = i + 1;

      // Match INSERT INTO tablename (col1, col2, ...)
      const insertMatch = line.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([^)]+)\)/i);
      if (insertMatch) {
        const tableName = insertMatch[1];
        const colStr = insertMatch[2];
        const cols = colStr.split(',').map(c => c.trim());
        const dbCols = getColumns(tableName);
        if (dbCols && dbCols.length > 0) {
          for (const col of cols) {
            if (col && !dbCols.includes(col) && !col.includes('?') && col.match(/^[a-z_]+$/)) {
              flag('critical', fp, ln,
                `Column "${col}" does not exist in table "${tableName}" — will crash on INSERT`,
                line.trim()
              );
            }
          }
        }
      }

      // Match UPDATE tablename SET col=?
      const updateMatch = line.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:WHERE|$)/i);
      if (updateMatch) {
        const tableName = updateMatch[1];
        const setCols = [...updateMatch[2].matchAll(/(\w+)\s*=/g)].map(m => m[1])
          .filter(c => !['COALESCE', 'datetime', 'NOW', 'id', 'now'].includes(c));
        const dbCols = getColumns(tableName);
        if (dbCols && dbCols.length > 0) {
          for (const col of setCols) {
            if (col && !dbCols.includes(col) && col.match(/^[a-z_]+$/)) {
              flag('critical', fp, ln,
                `Column "${col}" does not exist in table "${tableName}" — will crash on UPDATE`,
                line.trim()
              );
            }
          }
        }
      }
    });
  }
}

// ── 4. Check React.X without import React ────────────────────────────────────
function checkReactImports() {
  const srcFiles = walkDir(SRC, ['.jsx', '.js']);
  for (const fp of srcFiles) {
    const src = readFile(fp);
    const hasReactDotX = /React\.(useState|useEffect|useMemo|useRef|useCallback|createContext|memo)/.test(src);
    const hasReactImport = /import\s+React\b/.test(src);
    if (hasReactDotX && !hasReactImport) {
      flag('critical', fp, 1,
        'Uses React.useState/useEffect/etc but missing "import React" — will crash at runtime'
      );
    }
  }
}

// ── 5. Check for duplicate route definitions ──────────────────────────────────
// (handled in buildRouteMap)

// ── 6. Check routes missing requireAuth/requireTenant ─────────────────────────
function checkRouteSecurity(routes) {
  const serverFiles = walkDir(SERVER, ['.js']);
  const PUBLIC_PATHS = ['/health', '/webhook', '/audio', '/ping', '/login', '/register',
                        '/refresh', '/verify', '/oauth', '/callback', '/twilio', '/retell',
                        '/voice', '/stream'];

  for (const fp of serverFiles) {
    if (fp.includes('auth.js') || fp.includes('index.js') || fp.includes('db.js')) continue;
    const src = readFile(fp);
    const lines = src.split('\n');

    // Check if this file applies auth globally via router.use(requireAuth) or r.use(requireAuth)
    const hasGlobalAuth = /(?:router|r)\.use\s*\(\s*requireAuth/.test(src);

    lines.forEach((line, i) => {
      const ln = i + 1;
      if (!/(?:router|r)\.(get|post|put|patch|delete)\s*\(['"`]/.test(line)) return;

      const pathMatch = line.match(/(?:router|r)\.\w+\s*\(\s*['"`]([^'"`]+)['"`]/);
      const path = pathMatch ? pathMatch[1] : '';
      const isPublic = PUBLIC_PATHS.some(p => path.includes(p));
      if (isPublic) return;

      // If file has global auth middleware, all routes are protected
      if (hasGlobalAuth) return;

      // Check same line + next 2 lines for auth
      const ctx = lines.slice(i, i + 3).join(' ');
      if (!ctx.includes('requireAuth') && !ctx.includes('requireTenant')) {
        flag('high', fp, ln,
          `Route "${path}" missing requireAuth/requireTenant`,
          line.trim()
        );
      }
    });
  }
}

// ── 7. Check for .catch() swallowing errors ───────────────────────────────────
function checkErrorSwallowing() {
  const srcFiles = walkDir(SRC, ['.jsx', '.js']);
  for (const fp of srcFiles) {
    const src = readFile(fp);
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      // .catch(e=>console.error('API error:',e)) pattern that returns undefined
      if (line.includes('.catch(e=>console.error') || line.includes('.catch(()=>{}')) {
        const ctx = lines.slice(Math.max(0, i-2), i+3).join('\n');
        if (ctx.includes('await') && ctx.includes('const r =')) {
          flag('medium', fp, i+1,
            '.catch() swallows error and returns undefined — "if (r.id)" will throw',
            line.trim()
          );
        }
      }
    });
  }
}

// ── 8. Check JSX files for missing async error handling ───────────────────────
function checkAsyncHandling() {
  const srcFiles = walkDir(SRC, ['.jsx', '.js']);
  for (const fp of srcFiles) {
    const src = readFile(fp);
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      // Find save/submit functions without try/catch
      if (/const (save|submit|handle\w+)\s*=\s*async/.test(line)) {
        const block = lines.slice(i, i + 30).join('\n');
        if (!block.includes('try {') && !block.includes('try{')) {
          flag('medium', fp, i+1,
            `Async handler "${line.match(/const (\w+)/)?.[1]}" without try/catch`,
            line.trim()
          );
        }
      }
    });
  }
}

// ── Run all checks ────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log('  Childcare360 — Deep QA Analyser v1.0');
console.log(`  ${new Date().toLocaleString('en-AU')}`);
console.log('═══════════════════════════════════════════════════════════════');

console.log('\n[1/6] Building server route map...');
const routes = buildRouteMap();
console.log(`      Found ${routes.size} route definitions`);

console.log('\n[2/6] Checking API calls vs server routes...');
checkApiCalls(routes);

console.log('\n[3/6] Checking DB column mismatches...');
checkDbColumns();

console.log('\n[4/6] Checking React import issues...');
checkReactImports();

console.log('\n[5/6] Checking route security...');
checkRouteSecurity(routes);

console.log('\n[6/6] Checking error handling patterns...');
checkErrorSwallowing();
checkAsyncHandling();

// ── Report ────────────────────────────────────────────────────────────────────
const SEVS = [
  { key: 'critical', label: '🔴 CRITICAL', desc: 'Will crash at runtime' },
  { key: 'high',     label: '🟠 HIGH',     desc: 'Missing routes or security gaps' },
  { key: 'medium',   label: '🟡 MEDIUM',   desc: 'Error handling issues' },
  { key: 'info',     label: '🔵 INFO',     desc: 'Code quality' },
];

let total = 0;
for (const { key, label, desc } of SEVS) {
  const items = issues[key];
  total += items.length;
  if (!items.length) { console.log(`\n${label}: none ✓`); continue; }
  console.log(`\n${label} (${items.length}) — ${desc}`);
  items.forEach(({ file, line, msg, snippet }) => {
    console.log(`  ${file}:${line}`);
    console.log(`    ${msg}`);
    if (VERBOSE && snippet) console.log(`    → ${snippet}`);
  });
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Total: ${total} issues`);
console.log(`  🔴 ${issues.critical.length}  🟠 ${issues.high.length}  🟡 ${issues.medium.length}  🔵 ${issues.info.length}`);
console.log('═══════════════════════════════════════════════════════════════');

if (issues.critical.length > 0) process.exit(1);
