/**
 * server/integrations.js — v2.9.0
 *
 * Integration Hub for Australian childcare regulatory systems:
 *
 *  PRODA / CCSS (Services Australia)
 *    → Requires formal software registration: ccs.software.provider.support@servicesaustralia.gov.au
 *    → Until registered: we manage credentials, build submission packages, and link to PEP
 *
 *  ACECQA / NQA IT System
 *    → No public API — service ratings fetched/stored manually
 *    → We provide direct deep-links into NQA ITS and store ratings locally
 *
 *  National Educator Register (NER / WWCC)
 *    → State-based — no national API
 *    → We track check dates, expiry alerts, WWCC numbers with compliance status
 *
 *  ABN Validation (ABR — Australian Business Register)
 *    → Public API via api.abr.business.gov.au — no registration required
 *    → We validate provider ABNs and store results
 *
 *  AIR (Australian Immunisation Register)
 *    → Accessible via Medicare/myGov — no direct API for providers
 *    → We track immunisation status with parent-uploaded AIR statements
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION REGISTRY — what's available and how to set up
// ─────────────────────────────────────────────────────────────────────────────

const INTEGRATION_REGISTRY = {
  ccss_proda: {
    name: 'Services Australia CCSS / PRODA',
    description: 'Submit session reports and manage CCS enrolments via the Child Care Subsidy System.',
    status_type: 'registered_software',
    setup_steps: [
      'Register as a PRODA organisation at servicesaustralia.gov.au/proda',
      'Email ccs.software.provider.support@servicesaustralia.gov.au to register Childcare360 as approved software',
      'Receive Software ID and activation code from Services Australia',
      'Enter your PRODA Provider ID and Service ID below',
      'Link Childcare360 in PRODA under My Linked Services',
    ],
    fields: ['proda_provider_id','proda_service_id','software_id','activation_code'],
    documentation_url: 'https://www.education.gov.au/early-childhood/providers/howto/child-care-subsidy-system/software-providers',
    contact: 'ccs.software.provider.support@servicesaustralia.gov.au',
    can_automate: false,  // Requires formal software registration cert
    note: 'Until software registration is complete, use this system to prepare reports, then submit via the Provider Entry Point (PEP).',
    pep_url: 'https://online.humanservices.gov.au/childcareprovider/',
  },
  acecqa_nqa: {
    name: 'ACECQA / NQA IT System',
    description: 'Access NQF ratings, improvement plans, and service approval status.',
    status_type: 'web_portal',
    setup_steps: [
      'Log in to the NQA IT System at systems.acecqa.gov.au',
      'Enter your Service Approval Number and PRODA credentials below',
      'Ratings and approval data are synced manually — click Refresh to update',
    ],
    fields: ['service_approval_number','nqa_its_username'],
    documentation_url: 'https://www.acecqa.gov.au/resources/national-quality-agenda-it-system',
    contact: 'info@acecqa.gov.au',
    can_automate: false,
    note: 'ACECQA has no public API. Ratings are updated quarterly after A&R visits.',
    portal_url: 'https://systems.acecqa.gov.au/applications/login',
  },
  ner_wwcc: {
    name: 'National Educator Register / WWCC',
    description: 'Track Working With Children Check status for all educators. Checks are state-specific.',
    status_type: 'manual_tracking',
    setup_steps: [
      'No API integration available — WWCC checks are performed on state portals',
      'Enter educator WWCC numbers below and set expiry dates',
      'Childcare360 will alert you 90, 60, and 30 days before expiry',
    ],
    state_portals: {
      NSW: 'https://wwccheck.ccyp.nsw.gov.au/',
      VIC: 'https://www.workingwithchildren.vic.gov.au/individuals/verify-a-working-with-children-check',
      QLD: 'https://www.bluecard.qld.gov.au/verify/',
      WA:  'https://workingwithchildren.wa.gov.au/verify',
      SA:  'https://screening.sa.gov.au/types-of-checks/wwcc',
      TAS: 'https://www.justice.tas.gov.au/working_with_children',
      ACT: 'https://www.accesscanberra.act.gov.au/s/article/working-with-vulnerable-people-wwvp-registration',
      NT:  'https://ocpe.nt.gov.au/working-with-children',
    },
    can_automate: false,
    note: 'The National Educator Register (NER) is a separate ACECQA system. Educator details are submitted via the NQA IT System.',
    ner_url: 'https://systems.acecqa.gov.au',
  },
  abr_abn: {
    name: 'ABN Lookup (Australian Business Register)',
    description: 'Validate provider and contractor ABNs via the free ABR public API.',
    status_type: 'api_available',
    setup_steps: [
      'Request a free ABR GUID at abr.business.gov.au/Tools/AbnLookup',
      'Enter your ABR GUID below',
      'ABN validation will work immediately for providers and contractors',
    ],
    fields: ['abr_guid'],
    documentation_url: 'https://abr.business.gov.au/Tools/AbnLookup',
    can_automate: true,
    endpoint: 'https://abr.business.gov.au/abrxmlsearch/AbrXmlSearch.asmx',
  },
  air_immunisation: {
    name: 'AIR — Australian Immunisation Register',
    description: 'Track immunisation compliance. Families provide AIR statements via myGov.',
    status_type: 'manual_upload',
    setup_steps: [
      'No direct API for childcare providers',
      'Families download their child\'s AIR statement from myGov',
      'Upload statements via the Parent Portal — Childcare360 parses the PDF and stores the data',
      'Set automated reminders for overdue or expired immunisation records',
    ],
    can_automate: false,
    mygov_url: 'https://my.gov.au',
    note: 'CCS is withheld for children who are not up to date with vaccinations on the National Immunisation Program schedule.',
  },
};

// ── Get integration registry + current status ─────────────────────────────────
r.get('/registry', (req, res) => {
  try {
    const creds = D().prepare(
      'SELECT integration, status, last_tested, last_test_result, enabled FROM integration_credentials WHERE tenant_id=?'
    ).all(req.tenantId);

    const credMap = creds.reduce((m,c) => ({...m,[c.integration]:c}), {});

    const registry = Object.entries(INTEGRATION_REGISTRY).map(([key, info]) => ({
      key,
      ...info,
      configured: !!credMap[key],
      enabled: credMap[key]?.enabled === 1,
      status: credMap[key]?.status || 'not_configured',
      last_tested: credMap[key]?.last_tested,
      last_test_result: credMap[key]?.last_test_result,
    }));

    res.json({ integrations: registry });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Get/save credentials for an integration ───────────────────────────────────
r.get('/credentials/:integration', (req, res) => {
  try {
    const cred = D().prepare(
      'SELECT * FROM integration_credentials WHERE tenant_id=? AND integration=?'
    ).get(req.tenantId, req.params.integration);
    if (!cred) return res.json({ configured: false });

    // Return config but mask secrets
    const extra = JSON.parse(cred.extra_config || '{}');
    res.json({
      configured: true,
      enabled: cred.enabled === 1,
      status: cred.status,
      last_tested: cred.last_tested,
      last_test_result: cred.last_test_result,
      credential_key: cred.credential_key,
      credential_secret: cred.credential_secret ? '••••••••' : null,
      endpoint: cred.endpoint,
      extra_config: extra,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.post('/credentials/:integration', (req, res) => {
  try {
    const { credential_key, credential_secret, endpoint, extra_config, enabled } = req.body;
    const existing = D().prepare(
      'SELECT id FROM integration_credentials WHERE tenant_id=? AND integration=?'
    ).get(req.tenantId, req.params.integration);

    if (existing) {
      D().prepare(`
        UPDATE integration_credentials SET
          credential_key=COALESCE(?,credential_key),
          credential_secret=COALESCE(?,credential_secret),
          endpoint=COALESCE(?,endpoint),
          extra_config=COALESCE(?,extra_config),
          enabled=COALESCE(?,enabled),
          status='configured', updated_at=datetime('now')
        WHERE tenant_id=? AND integration=?
      `).run(credential_key||null,
             credential_secret && credential_secret !== '••••••••' ? credential_secret : null,
             endpoint||null,
             extra_config ? JSON.stringify(extra_config) : null,
             enabled!=null ? (enabled?1:0) : null,
             req.tenantId, req.params.integration);
    } else {
      D().prepare(`
        INSERT INTO integration_credentials
          (id,tenant_id,integration,credential_key,credential_secret,endpoint,extra_config,enabled,status)
        VALUES (?,?,?,?,?,?,?,?,'configured')
      `).run(uuid(), req.tenantId, req.params.integration,
             credential_key||null, credential_secret||null, endpoint||null,
             extra_config ? JSON.stringify(extra_config) : '{}', enabled?1:0);
    }

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ABN Validation (real API — ABR is publicly accessible) ───────────────────
r.post('/validate-abn', async (req, res) => {
  try {
    const { abn } = req.body;
    if (!abn) return res.status(400).json({ error: 'abn required' });

    const cleanABN = abn.replace(/\s/g, '');

    // ABN validation algorithm (Australian Government standard)
    const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
    const digits = cleanABN.split('').map(Number);
    digits[0] -= 1;
    const sum = digits.reduce((s, d, i) => s + d * weights[i], 0);
    const valid = sum % 89 === 0;

    if (!valid) {
      return res.json({ valid: false, abn: cleanABN, error: 'Invalid ABN checksum' });
    }

    // Try ABR lookup if GUID configured
    const cred = D().prepare(
      "SELECT credential_key FROM integration_credentials WHERE tenant_id=? AND integration='abr_abn'"
    ).get(req.tenantId);

    let abrData = null;
    if (cred?.credential_key) {
      try {
        const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${cleanABN}&callback=callback&guid=${cred.credential_key}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const text = await resp.text();
        const json = text.replace(/^callback\(/, '').replace(/\)$/, '');
        abrData = JSON.parse(json);
      } catch(e) {
        // ABR lookup failed — still return local validation
      }
    }

    // Log
    D().prepare(`
      INSERT INTO integration_log (id,tenant_id,integration,action,direction,payload_summary,success,created_at)
      VALUES (?,?,'abr_abn','validate_abn','outbound',?,?,datetime('now'))
    `).run(uuid(), req.tenantId, `ABN: ${cleanABN}`, valid?1:0);

    res.json({
      valid,
      abn: cleanABN,
      formatted: cleanABN.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4'),
      abr_data: abrData,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PRODA / CCSS setup status ─────────────────────────────────────────────────
r.get('/proda/status', (req, res) => {
  try {
    const cred = D().prepare(
      "SELECT * FROM integration_credentials WHERE tenant_id=? AND integration='ccss_proda'"
    ).get(req.tenantId);

    const extra = JSON.parse(cred?.extra_config || '{}');
    const hasProviderID = !!(cred?.credential_key);
    const hasServiceID  = !!(extra.proda_service_id);
    const hasSoftwareID = !!(extra.software_id);

    // Recent submission stats
    const stats = D().prepare(`
      SELECT status, COUNT(*) as n,
             SUM(ccs_amount_cents)/100.0 as ccs_total,
             SUM(gap_fee_cents)/100.0 as gap_total
      FROM ccs_submission_queue WHERE tenant_id=?
      GROUP BY status
    `).all(req.tenantId);

    res.json({
      configured: hasProviderID,
      proda_provider_id: cred?.credential_key,
      proda_service_id: extra.proda_service_id,
      software_registered: hasSoftwareID,
      software_id: extra.software_id,
      setup_complete: hasProviderID && hasServiceID && hasSoftwareID,
      pep_url: INTEGRATION_REGISTRY.ccss_proda.pep_url,
      submission_stats: stats,
      next_steps: !hasProviderID ? ['Register with PRODA', 'Enter Provider ID'] :
                  !hasServiceID  ? ['Enter your Service ID from PRODA'] :
                  !hasSoftwareID ? ['Register Childcare360 as approved software with Services Australia', 'Enter Software ID'] :
                  ['System ready — session reports auto-submitted on approval'],
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── NER / WWCC educator check status ─────────────────────────────────────────
r.get('/ner/educators', (req, res) => {
  try {
    const educators = D().prepare(`
      SELECT e.id, e.first_name, e.last_name, e.qualification,
             e.wwcc_number, e.wwcc_state, e.wwcc_expiry, e.wwcc_verified,
             e.first_aid_expiry, e.cpr_expiry, e.anaphylaxis_expiry,
             CASE
               WHEN e.wwcc_expiry < date('now') THEN 'expired'
               WHEN e.wwcc_expiry < date('now', '+30 days') THEN 'expiring_soon'
               WHEN e.wwcc_expiry < date('now', '+90 days') THEN 'expiring_warning'
               WHEN e.wwcc_number IS NULL THEN 'missing'
               ELSE 'current'
             END as wwcc_status,
             CASE
               WHEN e.first_aid_expiry < date('now') THEN 'expired'
               WHEN e.first_aid_expiry < date('now', '+30 days') THEN 'expiring_soon'
               ELSE 'current'
             END as first_aid_status
      FROM educators e
      WHERE e.tenant_id=?
      ORDER BY
        CASE WHEN e.wwcc_expiry < date('now') THEN 1
             WHEN e.wwcc_expiry < date('now', '+30 days') THEN 2
             WHEN e.wwcc_number IS NULL THEN 3
             ELSE 4 END,
        e.last_name
    `).all(req.tenantId);

    const summary = {
      total: educators.length,
      expired: educators.filter(e => e.wwcc_status === 'expired').length,
      expiring_soon: educators.filter(e => e.wwcc_status === 'expiring_soon').length,
      missing: educators.filter(e => e.wwcc_status === 'missing').length,
      current: educators.filter(e => e.wwcc_status === 'current').length,
    };

    const state_portals = INTEGRATION_REGISTRY.ner_wwcc.state_portals;

    res.json({ educators, summary, state_portals });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Update educator WWCC details
r.put('/ner/educators/:id', (req, res) => {
  try {
    const { wwcc_number, wwcc_state, wwcc_expiry, wwcc_verified } = req.body;
    D().prepare(`
      UPDATE educators SET
        wwcc_number=COALESCE(?,wwcc_number),
        wwcc_state=COALESCE(?,wwcc_state),
        wwcc_expiry=COALESCE(?,wwcc_expiry),
        wwcc_verified=COALESCE(?,wwcc_verified)
      WHERE id=? AND tenant_id=?
    `).run(wwcc_number||null, wwcc_state||null, wwcc_expiry||null,
           wwcc_verified!=null?(wwcc_verified?1:0):null,
           req.params.id, req.tenantId);

    // Log
    D().prepare(`
      INSERT INTO integration_log (id,tenant_id,integration,action,direction,payload_summary,success,created_at)
      VALUES (?,?,'ner_wwcc','wwcc_updated','inbound',?,1,datetime('now'))
    `).run(uuid(), req.tenantId, `Educator ${req.params.id} WWCC updated`);

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Integration activity log ──────────────────────────────────────────────────
r.get('/log', (req, res) => {
  try {
    const { integration, limit = 50 } = req.query;
    const where = ['tenant_id=?'];
    const vals  = [req.tenantId];
    if (integration) { where.push('integration=?'); vals.push(integration); }

    const logs = D().prepare(`
      SELECT * FROM integration_log
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC LIMIT ?
    `).all(...vals, parseInt(limit));

    res.json({ logs });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
