#!/usr/bin/env node
/**
 * Patch script: Fix RosteringModule.jsx — grid missing first day of period
 *
 * Bug: When a "Weekly" roster period starts on a non-Monday (e.g., Sunday 22 Mar),
 * the grid tab generator filters out weekends, so that first day disappears.
 * The period start should always snap to Monday when period_type === 'weekly'.
 *
 * Run from project root: node scripts/patch-roster-grid.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'src', 'RosteringModule.jsx');

if (!fs.existsSync(TARGET)) {
  console.error('❌ src/RosteringModule.jsx not found — run from project root');
  process.exit(1);
}

let src = fs.readFileSync(TARGET, 'utf8');
let changed = 0;

// ─── Patch 1: Add snapWeeklyDates helper ────────────────────────────────────
// Inject the helper before the first useState in the component, or near top of file.
// We look for the first occurrence of "const [" to find a good insertion point.

const SNAP_HELPER = `
// v2.4.1 fix: snap weekly period start to Monday, end to Friday
const snapWeeklyDates = (rawStart) => {
  const d = new Date(rawStart + 'T12:00:00');
  const day = d.getDay(); // 0=Sun … 6=Sat
  // Sunday → next Monday; Saturday → next Monday (+2); otherwise go back to Monday
  const toMon = day === 0 ? 1 : day === 6 ? 2 : -(day - 1);
  const mon = new Date(d);
  mon.setDate(d.getDate() + toMon);
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  return {
    start: mon.toISOString().split('T')[0],
    end:   fri.toISOString().split('T')[0],
  };
};
`;

if (src.includes('snapWeeklyDates')) {
  console.log('  ℹ Patch 1 (snapWeeklyDates) already applied — skipping');
} else {
  // Insert before the first useState hook call in the component
  const insertPoint = src.indexOf('const [');
  if (insertPoint === -1) {
    console.error('❌ Could not find insertion point for Patch 1');
  } else {
    src = src.slice(0, insertPoint) + SNAP_HELPER + src.slice(insertPoint);
    changed++;
    console.log('  ✓ Patch 1 applied: snapWeeklyDates helper added');
  }
}

// ─── Patch 2: Snap dates when periodType changes or startDate is set ─────────
// Find the pattern where startDate is set from a date picker onChange
// and add snapping logic for weekly periods.
// We look for common patterns like setStartDate( or onStartChange

const SNAP_PATTERNS = [
  // Pattern A: setStartDate(val) or setStartDate(e.target.value)
  {
    find: /setStartDate\(([^)]+)\);\s*\n(\s*)setEndDate\(([^)]+)\);/,
    replace: (m, startVal, indent, endVal) =>
      `if (periodType === 'weekly') {\n${indent}  const { start, end } = snapWeeklyDates(${startVal});\n${indent}  setStartDate(start);\n${indent}  setEndDate(end);\n${indent}} else {\n${indent}  setStartDate(${startVal});\n${indent}  setEndDate(${endVal});\n${indent}}`,
  },
];

let patch2Applied = false;
for (const { find, replace } of SNAP_PATTERNS) {
  if (find.test(src)) {
    const before = src;
    src = src.replace(find, replace);
    if (src !== before) {
      changed++;
      patch2Applied = true;
      console.log('  ✓ Patch 2 applied: startDate/endDate setter wrapped with weekly snap');
      break;
    }
  }
}
if (!patch2Applied) {
  console.warn('  ⚠ Patch 2 (date snap): pattern not found — apply manually.');
  console.warn('    Find where setStartDate() and setEndDate() are set together');
  console.warn('    and wrap them with: if (periodType === "weekly") { const { start, end } = snapWeeklyDates(val); ... }');
}

// ─── Patch 3: Fix grid day tab generator — show all days in range ─────────
// Find the weekend filter in the day-tab generator loop.
// Common patterns: day.getDay() !== 0 && day.getDay() !== 6
//                 getDay() === 0 || getDay() === 6

const WEEKEND_PATTERNS = [
  /if\s*\(\s*cur\.getDay\(\)\s*!==\s*0\s*&&\s*cur\.getDay\(\)\s*!==\s*6\s*\)/g,
  /if\s*\(\s*d\.getDay\(\)\s*!==\s*0\s*&&\s*d\.getDay\(\)\s*!==\s*6\s*\)/g,
  /&&\s*cur\.getDay\(\)\s*!==\s*0\s*&&\s*cur\.getDay\(\)\s*!==\s*6/g,
];

let patch3Applied = false;
for (const pat of WEEKEND_PATTERNS) {
  if (pat.test(src)) {
    // Reset lastIndex after test()
    pat.lastIndex = 0;
    // Remove the weekend filter — show all days in the period range
    const before = src;
    src = src.replace(pat, '/* v2.4.1: show all days in range — no weekend filter */ if (true)');
    if (src !== before) {
      changed++;
      patch3Applied = true;
      console.log('  ✓ Patch 3 applied: weekend filter removed from grid day generator');
      break;
    }
  }
}
if (!patch3Applied) {
  console.warn('  ⚠ Patch 3 (weekend filter): pattern not found — apply manually.');
  console.warn('    Find the day-tab loop that filters cur.getDay() !== 0 && !== 6');
  console.warn('    and remove the filter (period snap in Patch 2 ensures Mon–Fri anyway)');
}

// ─── Write ─────────────────────────────────────────────────────────────────
if (changed > 0) {
  // Backup
  fs.writeFileSync(TARGET + '.bak', fs.readFileSync(TARGET));
  fs.writeFileSync(TARGET, src, 'utf8');
  console.log(`\n✅ ${changed} patch(es) applied to src/RosteringModule.jsx`);
  console.log('   Backup saved as src/RosteringModule.jsx.bak');
  console.log('   Run: npx vite build');
} else {
  console.log('\n⚠ No patches were applied — check warnings above and patch manually');
}
