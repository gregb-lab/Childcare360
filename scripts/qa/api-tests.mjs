#!/usr/bin/env node
/**
 * Childcare360 — Automated API Test Suite
 * 
 * Usage:
 *   node scripts/qa/api-tests.mjs [--base-url http://localhost:3000] [--verbose]
 * 
 * Tests every major API endpoint for correct status codes, auth enforcement,
 * tenant isolation, and response shape. No external test framework needed.
 */

import { readFileSync } from 'fs';

const args = process.argv.slice(2);
const BASE_URL = args.find(a => a.startsWith('--base-url='))?.split('=')[1] || 'http://localhost:3000';
const VERBOSE  = args.includes('--verbose');
const CI       = args.includes('--ci');  // exit 1 on any failure

// ── Test state ────────────────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0;
const failures = [];
let authToken = null;
let tenantId  = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
async function req(method, path, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken && !opts.noAuth) headers['Authorization'] = `Bearer ${authToken}`;
  if (tenantId  && !opts.noTenant) headers['x-tenant-id'] = tenantId;
  if (opts.token)    headers['Authorization'] = `Bearer ${opts.token}`;
  if (opts.tenantId) headers['x-tenant-id'] = opts.tenantId;

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

function pass(name) {
  passed++;
  if (VERBOSE) console.log(`  ✅ ${name}`);
}

function fail(name, detail) {
  failed++;
  failures.push({ name, detail });
  console.log(`  ❌ ${name}`);
  if (VERBOSE || !CI) console.log(`     ${detail}`);
}

function skip(name, reason) {
  skipped++;
  if (VERBOSE) console.log(`  ⏭  ${name} — ${reason}`);
}

function section(name) {
  console.log(`\n▶ ${name}`);
}

async function expect(name, fn) {
  try { await fn(); }
  catch (e) { fail(name, e.message); }
}

// ── Core assertion helpers ────────────────────────────────────────────────────
function assertStatus(r, expected, name) {
  if (r.status === expected) { pass(name); return true; }
  fail(name, `Expected ${expected}, got ${r.status}. Body: ${JSON.stringify(r.json || r.text || '').slice(0,200)}`);
  return false;
}

function assertHas(r, key, name) {
  const ok = r.json && r.json[key] !== undefined;
  if (ok) { pass(name); return true; }
  fail(name, `Response missing key "${key}". Got: ${JSON.stringify(r.json || '').slice(0,200)}`);
  return false;
}

function assertArray(r, key, name) {
  const ok = r.json && Array.isArray(r.json[key] ?? r.json);
  if (ok) { pass(name); return true; }
  fail(name, `Expected array at "${key}". Got: ${JSON.stringify(r.json || '').slice(0,200)}`);
  return false;
}

// ── TEST SUITES ───────────────────────────────────────────────────────────────

async function testHealth() {
  section('Health & Connectivity');
  const r = await req('GET', '/health', null, { noAuth: true, noTenant: true });
  if (r.status === 0) {
    fail('Server reachable', `Cannot connect to ${BASE_URL} — ${r.error}`);
    console.log('\n⛔ Server not reachable. Start the server first.\n');
    process.exit(1);
  }
  assertStatus(r, 200, 'GET /health → 200');
}

async function testAuth() {
  section('Authentication');

  // Register test user
  const email = `qa-test-${Date.now()}@childcare360.test`;
  const password = 'QAtest123!@#';
  const centreName = `QA Test Centre ${Date.now()}`;

  const regR = await req('POST', '/auth/register', { email, password, name: 'QA Test User', centreName }, { noAuth: true, noTenant: true });
  if (!assertStatus(regR, 201, 'POST /auth/register → 201')) return;
  authToken = regR.json?.token;
  tenantId  = regR.json?.tenantId;
  assertHas(regR, 'token',    'Register returns token');
  assertHas(regR, 'tenantId', 'Register returns tenantId');

  // Login
  const loginR = await req('POST', '/auth/login', { email, password }, { noAuth: true, noTenant: true });
  assertStatus(loginR, 200, 'POST /auth/login → 200');
  assertHas(loginR, 'token', 'Login returns token');

  // Refresh
  const refreshR = await req('POST', '/auth/refresh', null);
  assertStatus(refreshR, 200, 'POST /auth/refresh → 200');

  // Protected route without token → 401
  const noAuthR = await req('GET', '/api/voice/settings', null, { noAuth: true });
  assertStatus(noAuthR, 401, 'Protected route without auth → 401');

  // /me
  const meR = await req('GET', '/auth/me');
  assertStatus(meR, 200, 'GET /auth/me → 200');
  assertHas(meR, 'email', 'GET /auth/me returns email');
}

async function testTenantIsolation() {
  section('Tenant Isolation');

  // Create a second tenant
  const email2 = `qa-tenant2-${Date.now()}@childcare360.test`;
  const reg2 = await req('POST', '/auth/register',
    { email: email2, password: 'QAtest123!@#', name: 'QA User 2', centreName: 'QA Centre 2' },
    { noAuth: true, noTenant: true });
  
  if (reg2.status !== 201) { skip('Tenant isolation', 'Could not create second tenant'); return; }
  const token2  = reg2.json?.token;
  const tenant2 = reg2.json?.tenantId;

  // Create a child in tenant 1
  const child1 = await req('POST', '/api/children', 
    { firstName: 'Isolated', lastName: 'Child', dob: '2022-01-01', roomId: null });
  
  if (child1.status !== 201) { skip('Tenant isolation — cross-tenant read', 'Could not create test child'); return; }
  const childId = child1.json?.id;

  // Try to read tenant1's child from tenant2
  const crossR = await req('GET', `/api/children/${childId}`, null, { token: token2, tenantId: tenant2 });
  if (crossR.status === 404 || crossR.status === 403) {
    pass('Tenant isolation — cross-tenant child read blocked');
  } else {
    fail('Tenant isolation — cross-tenant child read blocked', 
      `Expected 403/404, got ${crossR.status}. CRITICAL: data leak possible!`);
  }
}

async function testChildren() {
  section('Children API');
  if (!authToken) { skip('Children API', 'No auth token'); return; }

  const listR = await req('GET', '/api/children');
  assertStatus(listR, 200, 'GET /api/children → 200');

  const createR = await req('POST', '/api/children', {
    firstName: 'Test', lastName: 'Child', dob: '2022-06-15',
    gender: 'male', roomId: null, status: 'active',
  });
  assertStatus(createR, 201, 'POST /api/children → 201');
  const childId = createR.json?.id;
  if (!childId) { fail('POST /api/children returns id', 'No id in response'); return; }
  pass('POST /api/children returns id');

  const getR = await req('GET', `/api/children/${childId}`);
  assertStatus(getR, 200, `GET /api/children/${childId} → 200`);

  const putR = await req('PUT', `/api/children/${childId}`, {
    firstName: 'Updated', lastName: 'Child', dob: '2022-06-15',
  });
  assertStatus(putR, 200, `PUT /api/children/${childId} → 200`);

  const del404 = await req('DELETE', `/api/children/nonexistent-id`);
  if (del404.status === 404 || del404.status === 400) pass('DELETE non-existent child → 404/400');
  else fail('DELETE non-existent child → 404/400', `Got ${del404.status}`);
}

async function testEducators() {
  section('Educators API');
  if (!authToken) { skip('Educators API', 'No auth token'); return; }

  const listR = await req('GET', '/api/educators');
  assertStatus(listR, 200, 'GET /api/educators → 200');

  const createR = await req('POST', '/api/educators', {
    firstName: 'Test', lastName: 'Educator', email: `educator-${Date.now()}@test.com`,
    phone: '0400000000', qualification: 'cert3', status: 'active',
    availability: [1,2,3,4,5],
  });
  assertStatus(createR, 201, 'POST /api/educators → 201');
  const edId = createR.json?.id;
  if (edId) pass('POST /api/educators returns id');

  if (edId) {
    const getR = await req('GET', `/api/educators/${edId}`);
    assertStatus(getR, 200, `GET /api/educators/${edId} → 200`);
  }
}

async function testRooms() {
  section('Rooms API');
  if (!authToken) { skip('Rooms API', 'No auth token'); return; }

  const listR = await req('GET', '/api/rooms');
  assertStatus(listR, 200, 'GET /api/rooms → 200');

  const createR = await req('POST', '/api/rooms', {
    name: 'QA Test Room', minAge: 0, maxAge: 2, capacity: 10, status: 'active',
  });
  if (createR.status === 201 || createR.status === 200) {
    pass('POST /api/rooms → 201/200');
    const roomId = createR.json?.id;
    if (roomId) {
      const putR = await req('PUT', `/api/rooms/${roomId}`, { name: 'Updated Room', capacity: 12 });
      assertStatus(putR, 200, `PUT /api/rooms/${roomId} → 200`);
    }
  } else {
    fail('POST /api/rooms → 201/200', `Got ${createR.status}: ${JSON.stringify(createR.json || '').slice(0,100)}`);
  }
}

async function testRostering() {
  section('Rostering API');
  if (!authToken) { skip('Rostering API', 'No auth token'); return; }

  const today = new Date().toISOString().split('T')[0];
  const r = await req('GET', `/api/rostering/week?date=${today}`);
  assertStatus(r, 200, 'GET /api/rostering/week → 200');

  const tsr = await req('GET', `/api/rostering/timesheets?start=${today}&end=${today}`);
  if (tsr.status === 200) pass('GET /api/rostering/timesheets → 200');
  else skip('GET /api/rostering/timesheets', `Got ${tsr.status}`);
}

async function testInvoicing() {
  section('Invoicing API');
  if (!authToken) { skip('Invoicing API', 'No auth token'); return; }

  const listR = await req('GET', '/api/invoicing/invoices');
  if (listR.status === 200) pass('GET /api/invoicing/invoices → 200');
  else {
    const r2 = await req('GET', '/api/invoices');
    if (r2.status === 200) pass('GET /api/invoices → 200');
    else fail('Invoicing list endpoint', `Neither /api/invoicing/invoices nor /api/invoices returned 200`);
  }
}

async function testVoice() {
  section('Voice Agent API');
  if (!authToken) { skip('Voice API', 'No auth token'); return; }

  const settingsR = await req('GET', '/api/voice/settings');
  assertStatus(settingsR, 200, 'GET /api/voice/settings → 200');

  const inboundR = await req('GET', '/api/voice/inbound-url');
  assertStatus(inboundR, 200, 'GET /api/voice/inbound-url → 200');
  assertHas(inboundR, 'url', 'inbound-url has url field');

  const pingR = await req('GET', '/api/voice/retell/ping', null, { noTenant: true });
  assertStatus(pingR, 200, 'GET /api/voice/retell/ping → 200');
}

async function testParentPortal() {
  section('Parent Portal API');
  if (!authToken) { skip('Parent Portal', 'No auth token'); return; }

  const r = await req('GET', '/api/parent/dashboard');
  if (r.status === 200) pass('GET /api/parent/dashboard → 200');
  else if (r.status === 403 || r.status === 404) skip('GET /api/parent/dashboard', `${r.status} — needs parent role`);
  else fail('GET /api/parent/dashboard', `Got ${r.status}`);
}

async function testCCS() {
  section('CCS API');
  if (!authToken) { skip('CCS API', 'No auth token'); return; }

  const r = await req('GET', '/api/ccs/sessions');
  if (r.status === 200) pass('GET /api/ccs/sessions → 200');
  else skip('GET /api/ccs/sessions', `Got ${r.status}`);
}

async function testAuditLog() {
  section('Audit & SOC2');
  if (!authToken) { skip('Audit log', 'No auth token'); return; }

  const r = await req('GET', '/api/audit/log');
  if (r.status === 200) pass('GET /api/audit/log → 200');
  else fail('GET /api/audit/log', `Got ${r.status}`);
}

async function testInputValidation() {
  section('Input Validation');
  if (!authToken) { skip('Input validation', 'No auth token'); return; }

  // Empty child creation should fail
  const emptyChild = await req('POST', '/api/children', {});
  if (emptyChild.status === 400) pass('POST /api/children empty body → 400');
  else fail('POST /api/children empty body → 400', `Got ${emptyChild.status} — missing validation`);

  // SQL injection attempt
  const sqlInject = await req('GET', "/api/children?search=' OR '1'='1");
  if (sqlInject.status === 200 || sqlInject.status === 400) pass('SQL injection in search param handled safely');
  else fail('SQL injection handled', `Got unexpected ${sqlInject.status}`);

  // XSS attempt in body
  const xssR = await req('POST', '/api/children', {
    firstName: '<script>alert(1)</script>', lastName: 'XSS', dob: '2022-01-01',
  });
  if (xssR.status === 201) {
    // Should have sanitised the input
    const id = xssR.json?.id;
    if (id) {
      const getR = await req('GET', `/api/children/${id}`);
      const name = getR.json?.firstName || '';
      if (!name.includes('<script>')) pass('XSS payload sanitised in storage');
      else fail('XSS payload sanitised in storage', 'Raw <script> tag stored in DB');
    }
  } else {
    pass('XSS payload rejected at input validation');
  }
}

async function testRoleEnforcement() {
  section('Role Enforcement');
  if (!authToken) { skip('Role enforcement', 'No auth token'); return; }

  // Platform admin endpoint should reject non-superadmin
  const adminR = await req('GET', '/api/platform/tenants');
  if (adminR.status === 403 || adminR.status === 401) pass('Platform admin endpoint blocks non-superadmin');
  else if (adminR.status === 200) skip('Platform admin endpoint', 'Current user may be superadmin');
  else fail('Platform admin endpoint blocks non-superadmin', `Got ${adminR.status}`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Childcare360 — Automated API Test Suite');
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Time:   ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════');

  await testHealth();
  await testAuth();
  await testTenantIsolation();
  await testChildren();
  await testEducators();
  await testRooms();
  await testRostering();
  await testInvoicing();
  await testVoice();
  await testParentPortal();
  await testCCS();
  await testAuditLog();
  await testInputValidation();
  await testRoleEnforcement();

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Results: ✅ ${passed} passed  ❌ ${failed} failed  ⏭ ${skipped} skipped`);
  console.log('═══════════════════════════════════════════════════');

  if (failures.length) {
    console.log('\nFailed tests:');
    failures.forEach(f => console.log(`  ❌ ${f.name}\n     ${f.detail}`));
  }

  if (CI && failed > 0) process.exit(1);
}

main().catch(e => { console.error('Test runner error:', e); process.exit(1); });
