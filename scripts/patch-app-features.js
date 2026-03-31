#!/usr/bin/env node
/**
 * patch-app-features.js
 * Wires TodoModule, ActivityLogModule and DashboardWidgets into App.jsx
 *
 * Run from project root: node scripts/patch-app-features.js
 * Dry run:               node scripts/patch-app-features.js --dry
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT  = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'src', 'App.jsx');
const DRY    = process.argv.includes('--dry');

if (!fs.existsSync(TARGET)) { console.error('❌  src/App.jsx not found'); process.exit(1); }

let src = fs.readFileSync(TARGET, 'utf8');
let patched = 0;

function apply(description, search, replace) {
  if (!src.includes(search)) {
    // Try without trailing whitespace differences
    const searchTrimLines = search.split('\n').map(l => l.trimEnd()).join('\n');
    const srcNorm = src.split('\n').map(l => l.trimEnd()).join('\n');
    if (!srcNorm.includes(searchTrimLines)) {
      console.warn(`  ⚠  Patch "${description}" — pattern not found, skipping`);
      return false;
    }
    src = srcNorm.replace(searchTrimLines, replace);
  } else {
    src = src.replace(search, replace);
  }
  console.log(`  ✓  ${description}`);
  patched++;
  return true;
}

// ─── 1. Add imports after existing module imports ──────────────────────────────
// Look for the last import of a *Module from './ pattern
const importBlock = `import TodoModule from './TodoModule.jsx';
import ActivityLogModule from './ActivityLogModule.jsx';
import { NECWRWidget, AttendancePatternsWidget, ComplianceTodoWidget, RoomGroupsWidget } from './DashboardWidgets.jsx';`;

if (src.includes('TodoModule')) {
  console.log('  ℹ  Imports already present — skipping');
} else {
  // Find the last import line that imports from a local './...Module'
  const lastImportIdx = (() => {
    const lines = src.split('\n');
    let last = -1;
    lines.forEach((line, i) => { if (line.match(/^import .+ from ['"]\.\/[A-Z]/)) last = i; });
    return last;
  })();
  if (lastImportIdx >= 0) {
    const lines = src.split('\n');
    lines.splice(lastImportIdx + 1, 0, importBlock);
    src = lines.join('\n');
    console.log('  ✓  Module imports added');
    patched++;
  } else {
    console.warn('  ⚠  Could not find import insertion point — add imports manually');
  }
}

// ─── 2. Add state for new tabs ─────────────────────────────────────────────────
// Find the activeTab useState and add if not present
const TODO_STATE = `const [showTodo, setShowTodo] = useState(false); // v2.4.1`;
if (!src.includes('showTodo') && !src.includes('"todo"')) {
  // Try to find an existing activeTab state to add near it
  const stateInsert = `useState("dashboard")`;
  if (src.includes(stateInsert)) {
    src = src.replace(stateInsert, `useState("dashboard") // main nav\n  const [activeSubTab, setActiveSubTab] = useState(null);`);
    console.log('  ✓  Sub-tab state added');
    patched++;
  }
}

// ─── 3. Add sidebar nav items ─────────────────────────────────────────────────
// Find "Compliance" or a known sidebar entry and add To-Do + Activity Log after/near it
const SIDEBAR_ENTRIES = `{/* v2.4.1: To-Do List */}
            <button onClick={() => setActiveTab("todo")}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", borderRadius:10,
                background: activeTab==="todo" ? "rgba(255,255,255,0.15)" : "transparent",
                border:"none", color:"#fff", cursor:"pointer", width:"100%", textAlign:"left", fontSize:14 }}>
              ✅ <span>To-Do List</span>
            </button>
            {/* v2.4.1: Activity Log */}
            <button onClick={() => setActiveTab("activitylog")}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", borderRadius:10,
                background: activeTab==="activitylog" ? "rgba(255,255,255,0.15)" : "transparent",
                border:"none", color:"#fff", cursor:"pointer", width:"100%", textAlign:"left", fontSize:14 }}>
              📋 <span>Activity Log</span>
            </button>`;

if (src.includes('v2.4.1: To-Do List')) {
  console.log('  ℹ  Sidebar entries already present — skipping');
} else {
  // Look for WaitlistModule or Wellbeing or Incidents nav entry to insert after
  const anchors = [
    'activeTab==="waitlist"',
    'activeTab==="wellbeing"',
    'activeTab==="incidents"',
    'activeTab==="documents"',
    'activeTab==="compliance"',
  ];
  let inserted = false;
  for (const anchor of anchors) {
    const idx = src.lastIndexOf(anchor);
    if (idx >= 0) {
      // Find the end of this button block (closing </button>)
      const after = src.indexOf('</button>', idx);
      if (after >= 0) {
        src = src.slice(0, after + 9) + '\n            ' + SIDEBAR_ENTRIES + src.slice(after + 9);
        console.log(`  ✓  Sidebar entries added after "${anchor}"`);
        patched++;
        inserted = true;
        break;
      }
    }
  }
  if (!inserted) console.warn('  ⚠  Sidebar insertion point not found — add nav entries manually');
}

// ─── 4. Add tab render cases ───────────────────────────────────────────────────
const TAB_RENDERS = `
      {/* v2.4.1: To-Do List */}
      {activeTab === "todo" && <TodoModule />}
      {/* v2.4.1: Activity Log */}
      {activeTab === "activitylog" && <ActivityLogModule />}`;

if (src.includes('v2.4.1: To-Do List') && src.includes('TodoModule />')) {
  console.log('  ℹ  Tab renders already present — skipping');
} else {
  // Find an existing tab render to insert near (WaitlistModule or last known module)
  const renderAnchors = [
    'activeTab === "waitlist"',
    'activeTab==="waitlist"',
    'WaitlistModule',
    'StaffWellbeingModule',
    'IncidentModule',
  ];
  let inserted = false;
  for (const anchor of renderAnchors) {
    const idx = src.lastIndexOf(anchor);
    if (idx >= 0) {
      // Find the end of this render line (closing />} or /> or similar)
      const lineEnd = src.indexOf('\n', idx);
      if (lineEnd >= 0) {
        src = src.slice(0, lineEnd + 1) + TAB_RENDERS + '\n' + src.slice(lineEnd + 1);
        console.log(`  ✓  Tab renders added after "${anchor}"`);
        patched++;
        inserted = true;
        break;
      }
    }
  }
  if (!inserted) console.warn('  ⚠  Tab render insertion point not found — add renders manually');
}

// ─── 5. Wire DashboardWidgets into DashboardView ─────────────────────────────
// Find the dashboard area and add our widgets
const DASHBOARD_WIDGETS = `
              {/* v2.4.1: NECWR + Attendance + To-Do widgets */}
              <NECWRWidget onNavigate={setActiveTab} />
              <AttendancePatternsWidget />
              <ComplianceTodoWidget onNavigate={setActiveTab} />
              <RoomGroupsWidget onNavigate={setActiveTab} />`;

if (src.includes('v2.4.1: NECWR')) {
  console.log('  ℹ  Dashboard widgets already present — skipping');
} else {
  // Look for the dashboard metrics cards grid container
  const dashAnchors = ['DashboardView', 'activeTab === "dashboard"', 'activeTab==="dashboard"'];
  let inserted = false;
  for (const anchor of dashAnchors) {
    const idx = src.indexOf(anchor);
    if (idx >= 0) {
      // Look for a grid or card section in the next 3000 chars
      const section = src.slice(idx, idx + 3000);
      const gridIdx = section.search(/gridTemplateColumns|display.*grid/);
      if (gridIdx >= 0) {
        // Find the closing of that grid div and append widgets before it
        const absIdx = idx + gridIdx;
        // Find the next </div> that closes the grid
        const closeIdx = src.indexOf('</div>', absIdx + 50);
        if (closeIdx >= 0) {
          src = src.slice(0, closeIdx) + DASHBOARD_WIDGETS + '\n              ' + src.slice(closeIdx);
          console.log('  ✓  Dashboard widgets injected into grid');
          patched++;
          inserted = true;
          break;
        }
      }
    }
  }
  if (!inserted) {
    console.warn('  ⚠  Dashboard widget injection point not found');
    console.warn('     Manually add: <NECWRWidget onNavigate={setActiveTab} /> etc. in DashboardView grid');
  }
}

// ─── Write ──────────────────────────────────────────────────────────────────────
if (DRY) {
  console.log(`\n[dry-run] ${patched} patch(es) would be applied`);
} else if (patched > 0) {
  fs.writeFileSync(TARGET + '.bak', fs.readFileSync(TARGET));
  fs.writeFileSync(TARGET, src, 'utf8');
  console.log(`\n✅  ${patched} patch(es) applied to src/App.jsx`);
  console.log('   Backup: src/App.jsx.bak');
  console.log('   Run: npx vite build');
} else {
  console.log('\nNo changes made');
}
