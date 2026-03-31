#!/usr/bin/env node
/**
 * patch-portal-buttons.js
 * Fixes Staff Portal and Parent Portal sidebar buttons that navigate to nothing.
 *
 * Root cause: The buttons dispatch navigation events or set activeTab to values
 * like "staff-portal" or "parent-portal" but the render block checks for
 * "staffportal" or "parentportal" (no hyphen) — mismatch causes blank screen.
 *
 * Also ensures the Staff and Parent portal modules are actually rendered in App.jsx.
 *
 * Run from project root: node scripts/patch-portal-buttons.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT   = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'src', 'App.jsx');
const DRY    = process.argv.includes('--dry');

if (!fs.existsSync(TARGET)) { console.error('❌ src/App.jsx not found'); process.exit(1); }

let src = fs.readFileSync(TARGET, 'utf8');
const orig = src;
let patched = 0;

function fix(description, search, replace) {
  if (src.includes(search)) {
    src = src.replace(search, replace);
    console.log(`  ✓  ${description}`);
    patched++;
    return true;
  }
  console.warn(`  ⚠  ${description} — pattern not found`);
  return false;
}

// ── Detect what tab key the portal buttons currently use ──────────────────────
const staffMatches = src.match(/["'](staff[^"']*portal[^"']*|staffportal|staff_portal|staff-portal)["']/gi) || [];
const parentMatches = src.match(/["'](parent[^"']*portal[^"']*|parentportal|parent_portal|parent-portal)["']/gi) || [];

console.log('\n  Detected staff portal keys:', [...new Set(staffMatches)].join(', ') || '(none)');
console.log('  Detected parent portal keys:', [...new Set(parentMatches)].join(', ') || '(none)');

// ── Strategy: normalise ALL variations to "staff" and "parent" ────────────────
// These are the simplest, shortest tab keys and least likely to conflict.

// Normalise staff portal tab key variants
const staffVariants = ['staff-portal', 'staff_portal', 'staffPortal', 'staffportal', 'StaffPortal'];
const parentVariants = ['parent-portal', 'parent_portal', 'parentPortal', 'parentportal', 'ParentPortal'];

let normPatched = 0;
for (const v of staffVariants) {
  // Replace in setActiveTab calls and tab comparisons (but NOT in import statements or component names)
  const patterns = [
    [`setActiveTab("${v}")`, `setActiveTab("staff")`],
    [`setActiveTab('${v}')`, `setActiveTab("staff")`],
    [`activeTab === "${v}"`, `activeTab === "staff"`],
    [`activeTab === '${v}'`, `activeTab === "staff"`],
    [`activeTab=="${v}"`, `activeTab==="staff"`],
    [`activeTab=='${v}'`, `activeTab==="staff"`],
    [`tab === "${v}"`, `tab === "staff"`],
    [`tab=="${v}"`, `tab==="staff"`],
  ];
  for (const [search, replace] of patterns) {
    if (src.includes(search)) { src = src.replaceAll(search, replace); normPatched++; }
  }
}
for (const v of parentVariants) {
  const patterns = [
    [`setActiveTab("${v}")`, `setActiveTab("parent")`],
    [`setActiveTab('${v}')`, `setActiveTab("parent")`],
    [`activeTab === "${v}"`, `activeTab === "parent"`],
    [`activeTab === '${v}'`, `activeTab === "parent"`],
    [`activeTab=="${v}"`, `activeTab==="parent"`],
    [`activeTab=='${v}'`, `activeTab==="parent"`],
    [`tab === "${v}"`, `tab === "parent"`],
    [`tab=="${v}"`, `tab==="parent"`],
  ];
  for (const [search, replace] of patterns) {
    if (src.includes(search)) { src = src.replaceAll(search, replace); normPatched++; }
  }
}
if (normPatched > 0) { console.log(`\n  ✓  Normalised ${normPatched} tab key reference(s) to "staff"/"parent"`); patched += normPatched; }

// ── Ensure StaffPortalModule and ParentPortalModule are imported ──────────────
const needsStaffImport  = !src.includes("StaffPortalModule");
const needsParentImport = !src.includes("ParentPortalModule");

if (needsStaffImport || needsParentImport) {
  // Find the last ./...Module import
  const lines = src.split('\n');
  let lastImportLine = -1;
  lines.forEach((l, i) => { if (l.match(/^import .+ from ['"]\.\/[A-Z]/)) lastImportLine = i; });
  if (lastImportLine >= 0) {
    const toAdd = [];
    if (needsStaffImport)  toAdd.push(`import StaffPortalModule from './StaffPortalModule.jsx';`);
    if (needsParentImport) toAdd.push(`import ParentPortalModule from './ParentPortalModule.jsx';`);
    lines.splice(lastImportLine + 1, 0, ...toAdd);
    src = lines.join('\n');
    console.log(`  ✓  Added missing portal module import(s)`);
    patched++;
  } else {
    console.warn('  ⚠  Could not find import insertion point — add portal imports manually');
  }
}

// ── Ensure render blocks exist for "staff" and "parent" tabs ─────────────────
const hasStaffRender  = src.includes('activeTab === "staff"') && src.includes('StaffPortalModule');
const hasParentRender = src.includes('activeTab === "parent"') && src.includes('ParentPortalModule');

// Build render lines to inject
const RENDERS_TO_ADD = [];
if (!hasStaffRender)  RENDERS_TO_ADD.push(`      {activeTab === "staff"  && <StaffPortalModule />}`);
if (!hasParentRender) RENDERS_TO_ADD.push(`      {activeTab === "parent" && <ParentPortalModule />}`);

if (RENDERS_TO_ADD.length > 0) {
  // Find a good injection point near other module renders
  const anchors = ['WaitlistModule', 'IncidentModule', 'MessagingModule', 'ComplianceModule', 'LearningModule'];
  let inserted = false;
  for (const anchor of anchors) {
    const idx = src.lastIndexOf(anchor);
    if (idx >= 0) {
      const lineEnd = src.indexOf('\n', idx);
      if (lineEnd >= 0) {
        src = src.slice(0, lineEnd + 1) + RENDERS_TO_ADD.join('\n') + '\n' + src.slice(lineEnd + 1);
        console.log(`  ✓  Render blocks added for staff/parent tabs`);
        patched++;
        inserted = true;
        break;
      }
    }
  }
  if (!inserted) {
    console.warn('  ⚠  Could not auto-inject render blocks. Add manually:');
    RENDERS_TO_ADD.forEach(r => console.warn(`     ${r}`));
  }
}

// ── Ensure the sidebar buttons actually call setActiveTab with correct key ────
// Look for buttons that say "Staff Portal" or "Parent Portal" as text
// and check they have the right onClick
const staffBtnOk  = src.includes('setActiveTab("staff")')  || src.includes("setActiveTab('staff')");
const parentBtnOk = src.includes('setActiveTab("parent")') || src.includes("setActiveTab('parent')");

if (!staffBtnOk) {
  // Try to find a Staff Portal nav item and fix its onClick
  const staffBtnPattern = /(Staff\s*Portal[^<]*<\/)/i;
  if (staffBtnPattern.test(src)) {
    // Add setActiveTab just before the closing tag pattern
    console.warn('  ⚠  Staff Portal button found but no setActiveTab("staff") — check onClick manually');
  } else {
    console.warn('  ⚠  No "Staff Portal" nav button found in App.jsx — may be labelled differently');
  }
}
if (!parentBtnOk) {
  console.warn('  ⚠  No setActiveTab("parent") found — check Parent Portal button onClick manually');
}

// ── Write ──────────────────────────────────────────────────────────────────────
if (src === orig) {
  console.log('\n  ℹ  No changes needed — portals may already be wired correctly');
  console.log('     If buttons still do nothing, check:');
  console.log('     1. The button onClick matches activeTab comparison (same string, exact case)');
  console.log('     2. The render block exists: {activeTab === "staff" && <StaffPortalModule />}');
  console.log('     3. StaffPortalModule.jsx and ParentPortalModule.jsx exist in src/');
} else if (DRY) {
  console.log(`\n  [dry-run] ${patched} change(s) would be applied`);
} else {
  fs.writeFileSync(TARGET + '.bak', orig);
  fs.writeFileSync(TARGET, src, 'utf8');
  console.log(`\n✅  ${patched} patch(es) applied to src/App.jsx`);
  console.log('   Backup: src/App.jsx.bak');
  console.log('   Run: npx vite build');
}

// ── Manual fix guide (always printed) ────────────────────────────────────────
console.log(`
── Manual verification checklist ──────────────────────────────────────
Search App.jsx for these exact patterns (all must match):

  Sidebar button (Staff):
    onClick={() => setActiveTab("staff")}   ← exact key "staff"

  Sidebar button (Parent):
    onClick={() => setActiveTab("parent")}  ← exact key "parent"

  Render block (Staff) — inside the main content area:
    {activeTab === "staff" && <StaffPortalModule />}

  Render block (Parent):
    {activeTab === "parent" && <ParentPortalModule />}

  Imports at top of App.jsx:
    import StaffPortalModule from './StaffPortalModule.jsx';
    import ParentPortalModule from './ParentPortalModule.jsx';
────────────────────────────────────────────────────────────────────────
`);
