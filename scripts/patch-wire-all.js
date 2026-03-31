#!/usr/bin/env node
/**
 * patch-wire-all.js  — v2.5.0
 *
 * Wires everything into place in one run:
 *   1. server/index.js  — mount /api/stories route
 *   2. src/App.jsx      — add WeeklyStoryModule sidebar + render
 *   3. src/App.jsx      — replace portal buttons with PortalEmulator
 *   4. src/App.jsx      — fix staff/parent tab key normalisation
 *
 * Run from project root:
 *   node scripts/patch-wire-all.js
 *   node scripts/patch-wire-all.js --dry   (preview only)
 */
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY  = process.argv.includes('--dry');

function read(rel)  { const p = path.join(ROOT, rel); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; }
function write(rel, content) {
  if (DRY) { console.log(`  [dry] would write ${rel}`); return; }
  fs.writeFileSync(path.join(ROOT, rel), content, 'utf8');
}
function backup(rel, content) {
  if (DRY) return;
  fs.writeFileSync(path.join(ROOT, rel + '.bak'), content, 'utf8');
}

let totalPatched = 0;

function patch(file, description, search, replace) {
  const src = read(file);
  if (!src) { console.warn(`  ⚠  ${file} not found — skip: ${description}`); return src; }
  if (src.includes(replace.slice(0, 40))) { console.log(`  ✓  Already applied: ${description}`); return src; }
  if (!src.includes(search.trim().slice(0, 60))) { console.warn(`  ⚠  Pattern not found: ${description}`); return src; }
  const result = src.replace(search, replace);
  if (result !== src) { console.log(`  ✓  ${description}`); totalPatched++; return result; }
  console.warn(`  ⚠  Replace had no effect: ${description}`);
  return src;
}

console.log('\n🔧  Childcare360 v2.5.0 — Wire-All Patch\n');

// ════════════════════════════════════════════════════════════════
// 1. server/index.js — mount weekly-stories router
// ════════════════════════════════════════════════════════════════
let indexSrc = read('server/index.js');
if (indexSrc) {
  const alreadyMounted = indexSrc.includes("weekly-stories") || indexSrc.includes("weeklyStories");

  if (alreadyMounted) {
    console.log('  ✓  Already applied: weekly-stories route mounted');
  } else {
    // Find the last route mount line and insert after it
    // Common patterns: app.use('/api/...', ...)
    const importLines = [];
    const mountLines  = [];

    // Collect existing import style
    if (indexSrc.includes("import ")) {
      importLines.push(`import weeklyStoriesRouter from './weekly-stories.js';`);
    }
    mountLines.push(`app.use('/api/stories', weeklyStoriesRouter);`);

    // Find last import of a local server module
    const lines = indexSrc.split('\n');
    let lastImportIdx = -1, lastMountIdx = -1;
    lines.forEach((line, i) => {
      if (line.match(/^import .+ from '\.\//) ) lastImportIdx = i;
      if (line.match(/app\.use\(['"]\/api\//))  lastMountIdx  = i;
    });

    if (lastImportIdx >= 0) {
      lines.splice(lastImportIdx + 1, 0, importLines[0]);
      // Recalculate lastMountIdx after splice
      lastMountIdx = lines.findLastIndex(l => l.match(/app\.use\(['"]\/api\//));
    }
    if (lastMountIdx >= 0) {
      lines.splice(lastMountIdx + 1, 0, mountLines[0]);
    } else if (lastImportIdx >= 0) {
      // No existing mount lines found, add after imports
      lines.splice(lastImportIdx + 2, 0, '\n' + mountLines[0]);
    }

    indexSrc = lines.join('\n');
    console.log('  ✓  Mounted /api/stories route in server/index.js');
    totalPatched++;
    backup('server/index.js', read('server/index.js'));
    write('server/index.js', indexSrc);
  }
} else {
  console.warn('  ⚠  server/index.js not found');
}

// ════════════════════════════════════════════════════════════════
// 2. src/App.jsx — all changes
// ════════════════════════════════════════════════════════════════
let appSrc = read('src/App.jsx');
if (!appSrc) { console.error('  ✗  src/App.jsx not found — cannot continue'); process.exit(1); }
const appOrig = appSrc;

// ── 2a. Add imports ───────────────────────────────────────────────
const needsStoryImport    = !appSrc.includes('WeeklyStoryModule');
const needsEmulatorImport = !appSrc.includes('PortalEmulator');

if (needsStoryImport || needsEmulatorImport) {
  const lines = appSrc.split('\n');
  let lastLocalImport = -1;
  lines.forEach((l, i) => { if (l.match(/^import .+ from ['"]\.\/[A-Z]/)) lastLocalImport = i; });
  if (lastLocalImport >= 0) {
    const toAdd = [];
    if (needsStoryImport)    toAdd.push(`import WeeklyStoryModule from './WeeklyStoryModule.jsx';`);
    if (needsEmulatorImport) toAdd.push(`import PortalEmulator from './PortalEmulator.jsx';`);
    lines.splice(lastLocalImport + 1, 0, ...toAdd);
    appSrc = lines.join('\n');
    console.log('  ✓  Added imports: WeeklyStoryModule, PortalEmulator');
    totalPatched++;
  } else {
    console.warn('  ⚠  Could not find import insertion point');
  }
}

// ── 2b. Add portal emulator state variables ───────────────────────
if (!appSrc.includes('showPortalEmulator') && !appSrc.includes('portalEmulatorMode')) {
  // Find first useState in component
  const stateIdx = appSrc.indexOf('useState(');
  if (stateIdx >= 0) {
    const lineStart = appSrc.lastIndexOf('\n', stateIdx) + 1;
    const insert = `  const [showPortalEmulator, setShowPortalEmulator] = useState(false);
  const [portalEmulatorMode,  setPortalEmulatorMode]  = useState('parent');\n`;
    appSrc = appSrc.slice(0, lineStart) + insert + appSrc.slice(lineStart);
    console.log('  ✓  Portal emulator state added');
    totalPatched++;
  }
}

// ── 2c. Normalise portal tab keys ─────────────────────────────────
const staffVariants  = ['staff-portal','staff_portal','staffPortal','staffportal'];
const parentVariants = ['parent-portal','parent_portal','parentPortal','parentportal'];
let normCount = 0;
for (const v of staffVariants) {
  [`setActiveTab("${v}")`,`setActiveTab('${v}')`,`activeTab === "${v}"`,`activeTab === '${v}'`,`activeTab=="${v}"`,`activeTab=='${v}'`]
    .forEach(s => { if (appSrc.includes(s)) { appSrc = appSrc.replaceAll(s, s.replace(v, 'staff')); normCount++; } });
}
for (const v of parentVariants) {
  [`setActiveTab("${v}")`,`setActiveTab('${v}')`,`activeTab === "${v}"`,`activeTab === '${v}'`,`activeTab=="${v}"`,`activeTab=='${v}'`]
    .forEach(s => { if (appSrc.includes(s)) { appSrc = appSrc.replaceAll(s, s.replace(v, 'parent')); normCount++; } });
}
if (normCount) { console.log(`  ✓  Normalised ${normCount} portal tab key(s)`); totalPatched++; }

// ── 2d. Replace staff/parent sidebar buttons with emulator launchers ─
// Find the existing staff button and replace onClick
const staffBtnPatterns = [
  // Pattern: button with text "Staff Portal" and any onClick
  /onClick=\{[^}]*setActiveTab[^}]*['"]staff['"][^}]*\}([^>]*)>(\s*[^<]*Staff\s*Portal[^<]*</,
];
const STAFF_ONCLICK  = `onClick={() => { setPortalEmulatorMode('staff');  setShowPortalEmulator(true); }}`;
const PARENT_ONCLICK = `onClick={() => { setPortalEmulatorMode('parent'); setShowPortalEmulator(true); }}`;

// More reliable: find any button referencing staff in onClick near "Staff Portal" text
// Replace setActiveTab("staff") with portal emulator launch
if (appSrc.includes('setActiveTab("staff")') || appSrc.includes("setActiveTab('staff')")) {
  // Check if it's already an emulator call
  if (!appSrc.includes('setPortalEmulatorMode')) {
    appSrc = appSrc
      .replace(/onClick=\{[^}]*setActiveTab\(['"]staff['"]\)[^}]*\}/g, `onClick={() => { setPortalEmulatorMode('staff'); setShowPortalEmulator(true); }}`)
      .replace(/onClick=\{[^}]*setActiveTab\(['"]parent['"]\)[^}]*\}/g, `onClick={() => { setPortalEmulatorMode('parent'); setShowPortalEmulator(true); }}`);
    console.log('  ✓  Portal sidebar buttons now launch PortalEmulator');
    totalPatched++;
  } else {
    console.log('  ✓  Already applied: portal emulator buttons');
  }
}

// ── 2e. Add Stories sidebar nav entry ─────────────────────────────
if (!appSrc.includes('setActiveTab("stories")') && !appSrc.includes("setActiveTab('stories')")) {
  // Find a good anchor — the last sidebar button we can find
  const anchors = [
    'setActiveTab("compliance")', "setActiveTab('compliance')",
    'setActiveTab("invoicing")',  "setActiveTab('invoicing')",
    'setActiveTab("learning")',   "setActiveTab('learning')",
    'setActiveTab("waitlist")',   "setActiveTab('waitlist')",
  ];
  const STORY_BTN = `
            {/* v2.5.0: Weekly Stories */}
            <button
              onClick={() => setActiveTab("stories")}
              style={{
                display:"flex", alignItems:"center", gap:10, padding:"10px 16px",
                borderRadius:10, background: activeTab==="stories" ? "rgba(255,255,255,0.15)" : "transparent",
                border:"none", color:"#fff", cursor:"pointer", width:"100%", textAlign:"left", fontSize:14
              }}
            >
              ✨ <span>Weekly Stories</span>
            </button>`;
  let inserted = false;
  for (const anchor of anchors) {
    const idx = appSrc.lastIndexOf(anchor);
    if (idx >= 0) {
      // Find end of the button block containing this anchor
      const closeBtn = appSrc.indexOf('</button>', idx);
      if (closeBtn >= 0) {
        appSrc = appSrc.slice(0, closeBtn + 9) + STORY_BTN + appSrc.slice(closeBtn + 9);
        console.log('  ✓  Stories sidebar button added');
        totalPatched++;
        inserted = true;
        break;
      }
    }
  }
  if (!inserted) console.warn('  ⚠  Could not find sidebar insertion point for Stories button — add manually');
} else {
  console.log('  ✓  Already applied: Stories sidebar button');
}

// ── 2f. Add render blocks ──────────────────────────────────────────
// Stories render
if (!appSrc.includes('activeTab === "stories"') && !appSrc.includes('activeTab==="stories"')) {
  const renderAnchors = ['activeTab === "waitlist"', 'activeTab === "compliance"', 'activeTab === "learning"', 'WaitlistModule', 'ComplianceModule'];
  let inserted = false;
  for (const anchor of renderAnchors) {
    const idx = appSrc.lastIndexOf(anchor);
    if (idx >= 0) {
      const lineEnd = appSrc.indexOf('\n', idx);
      if (lineEnd >= 0) {
        appSrc = appSrc.slice(0, lineEnd + 1)
          + `      {activeTab === "stories" && <WeeklyStoryModule />}\n`
          + appSrc.slice(lineEnd + 1);
        console.log('  ✓  WeeklyStoryModule render block added');
        totalPatched++;
        inserted = true;
        break;
      }
    }
  }
  if (!inserted) console.warn('  ⚠  Could not find render insertion point — add {activeTab === "stories" && <WeeklyStoryModule />} manually');
} else {
  console.log('  ✓  Already applied: Stories render block');
}

// Staff/Parent render blocks
const hasStaffRender  = appSrc.includes('activeTab === "staff"')  && appSrc.includes('StaffPortalModule');
const hasParentRender = appSrc.includes('activeTab === "parent"') && appSrc.includes('ParentPortalModule');
if (!hasStaffRender || !hasParentRender) {
  const renderAnchors = ['activeTab === "stories"', 'activeTab === "waitlist"', 'ComplianceModule'];
  for (const anchor of renderAnchors) {
    const idx = appSrc.lastIndexOf(anchor);
    if (idx >= 0) {
      const lineEnd = appSrc.indexOf('\n', idx);
      if (lineEnd >= 0) {
        const toAdd = [];
        if (!hasStaffRender)  toAdd.push(`      {activeTab === "staff"  && <StaffPortalModule />}`);
        if (!hasParentRender) toAdd.push(`      {activeTab === "parent" && <ParentPortalModule />}`);
        appSrc = appSrc.slice(0, lineEnd + 1) + toAdd.join('\n') + '\n' + appSrc.slice(lineEnd + 1);
        console.log('  ✓  Staff/Parent portal render blocks added');
        totalPatched++;
        break;
      }
    }
  }
}

// ── 2g. Add PortalEmulator render (just before closing of main return) ─
if (!appSrc.includes('showPortalEmulator &&') && !appSrc.includes('PortalEmulator')) {
  // Find the last </div> near the end of the return statement
  const lastCloseDiv = appSrc.lastIndexOf('    </div>');
  if (lastCloseDiv >= 0) {
    const emulatorRender = `
      {/* v2.5.0: Portal Emulator overlay */}
      {showPortalEmulator && (
        <PortalEmulator
          mode={portalEmulatorMode}
          onClose={() => setShowPortalEmulator(false)}
        />
      )}`;
    appSrc = appSrc.slice(0, lastCloseDiv) + emulatorRender + '\n' + appSrc.slice(lastCloseDiv);
    console.log('  ✓  PortalEmulator overlay added to render');
    totalPatched++;
  } else {
    console.warn('  ⚠  Could not find position for PortalEmulator overlay — add manually before closing </div>');
  }
}

// ── Write App.jsx ──────────────────────────────────────────────────
if (appSrc !== appOrig) {
  backup('src/App.jsx', appOrig);
  write('src/App.jsx', appSrc);
  console.log('\n  App.jsx updated (backup: src/App.jsx.bak)');
}

// ── Summary ────────────────────────────────────────────────────────
console.log(`\n${totalPatched > 0 ? '✅' : 'ℹ'} ${totalPatched} change(s) applied`);
if (totalPatched > 0 && !DRY) {
  console.log('\nNext step: npx vite build\n');
}

console.log(`
── Manual check (verify these exist in App.jsx) ─────────────────────
1. import WeeklyStoryModule from './WeeklyStoryModule.jsx';
2. import PortalEmulator from './PortalEmulator.jsx';
3. const [showPortalEmulator, setShowPortalEmulator] = useState(false);
4. const [portalEmulatorMode, setPortalEmulatorMode] = useState('parent');
5. Staff sidebar button: onClick={() => { setPortalEmulatorMode('staff'); setShowPortalEmulator(true); }}
6. Parent sidebar button: onClick={() => { setPortalEmulatorMode('parent'); setShowPortalEmulator(true); }}
7. {activeTab === "stories" && <WeeklyStoryModule />}
8. {showPortalEmulator && <PortalEmulator mode={portalEmulatorMode} onClose={...} />}
─────────────────────────────────────────────────────────────────────
`);
