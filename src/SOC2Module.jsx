import { useState, useEffect, useCallback } from 'react';

const API = (path, opts = {}) => {
  const token = localStorage.getItem('c360_token');
  const tenantId = localStorage.getItem('c360_tenant');
  return fetch(`/api/audit${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
      ...(opts.headers || {})
    }
  });
};

const STATUS_COLORS = { pass: '#22c55e', warn: '#f59e0b', fail: '#ef4444' };
const STATUS_BG = { pass: '#f0fdf4', warn: '#fffbeb', fail: '#fef2f2' };
const STATUS_ICONS = { pass: '✅', warn: '⚠️', fail: '❌' };

const ACTION_LABELS = {
  login_success: '🔐 Login', login_failed: '🚫 Failed Login', logout: '🚪 Logout',
  register: '👤 Register', password_reset: '🔑 Password Reset',
  mfa_enabled: '🛡️ MFA Enabled', mfa_verified: '✔️ MFA Verified',
  invite_sent: '📧 Invite Sent', create_tenant: '🏢 Org Created',
  doc_uploaded: '📄 Doc Upload', doc_deleted: '🗑️ Doc Deleted',
  invoice_generated: '💰 Invoice', enrolment_approved: '✅ Enrolment',
  'post:/api/children': '👶 Child Created', 'put:/api/children/:id': '✏️ Child Updated',
  'delete:/api/children/:id': '🗑️ Child Deleted',
  'post:/api/rostering/entries': '📅 Shift Added', 'delete:/api/rostering/entries/:id': '🗑️ Shift Deleted',
  manual_compliance_note: '📝 Manual Note', audit_export: '📊 Audit Export'
};

function formatAction(action) {
  return ACTION_LABELS[action] || action.replace(/_/g, ' ').replace(/^(post|put|patch|delete):/, m => m.slice(0,-1).toUpperCase() + ' ');
}

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString('en-AU', { day:'numeric', month:'short' });
}

// ── Compliance Checklist Tab ──────────────────────────────────────────────────
function ComplianceTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API('/compliance').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8B6DAF' }}>Loading compliance status…</div>;
  if (!data) return <div style={{ padding: 40, color: '#ef4444' }}>Failed to load compliance data</div>;

  const categories = [...new Set(data.checks.map(c => c.category))];

  return (
    <div style={{ padding: 24 }}>
      {/* Score card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div style={{ background: 'linear-gradient(135deg, #8B6DAF, #6B4E8F)', borderRadius: 16, padding: 24, color: '#fff', textAlign: 'center' }}>
          <div style={{ fontSize: 52, fontWeight: 800 }}>{data.score}%</div>
          <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>SOC2 Readiness Score</div>
        </div>
        <div style={{ background: '#f0fdf4', borderRadius: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#22c55e' }}>{data.passed}</div>
          <div style={{ fontSize: 13, color: '#166534' }}>Passing Controls</div>
        </div>
        <div style={{ background: '#fffbeb', borderRadius: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#f59e0b' }}>{data.warned}</div>
          <div style={{ fontSize: 13, color: '#92400e' }}>Warnings</div>
        </div>
        <div style={{ background: '#fef2f2', borderRadius: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#ef4444' }}>{data.failed}</div>
          <div style={{ fontSize: 13, color: '#991b1b' }}>Failed Controls</div>
        </div>
        <div style={{ background: '#f8faff', borderRadius: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>{data.stats.mfaPercent}%</div>
          <div style={{ fontSize: 13, color: '#1e40af' }}>MFA Adoption</div>
          <div style={{ fontSize: 11, color: '#93c5fd', marginTop: 4 }}>Target: 80%+</div>
        </div>
        <div style={{ background: '#fdf4ff', borderRadius: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#a855f7' }}>{data.stats.recentAuditCount.toLocaleString()}</div>
          <div style={{ fontSize: 13, color: '#7e22ce' }}>Audit Events (30d)</div>
        </div>
      </div>

      {/* Checks by category */}
      {categories.map(cat => (
        <div key={cat} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#5C4E6A', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cat}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.checks.filter(c => c.category === cat).map(check => (
              <div key={check.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: STATUS_BG[check.status], borderRadius: 12, padding: '14px 18px',
                border: `1px solid ${STATUS_COLORS[check.status]}33`
              }}>
                <span style={{ fontSize: 20 }}>{STATUS_ICONS[check.status]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#2d1f3d' }}>{check.name}</div>
                  <div style={{ fontSize: 12, color: '#6B5E7A', marginTop: 2 }}>{check.detail}</div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                  background: STATUS_COLORS[check.status], color: '#fff', textTransform: 'uppercase'
                }}>{check.status}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* What to do next */}
      {(data.warned > 0 || data.failed > 0) && (
        <div style={{ background: '#fff8f0', border: '1px solid #fed7aa', borderRadius: 16, padding: 20, marginTop: 8 }}>
          <h3 style={{ margin: '0 0 12px', color: '#92400e', fontSize: 14, fontWeight: 700 }}>📋 Action Items</h3>
          {data.checks.filter(c => c.status !== 'pass').map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 13, color: '#78350f' }}>
              <span>{STATUS_ICONS[c.status]}</span>
              <span><strong>{c.name}:</strong> {c.detail}</span>
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 12, color: '#a16207' }}>
            💡 <strong>Tip:</strong> For SOC2 Type I readiness, resolve all ❌ items and aim to address ⚠️ warnings. 
            For Type II you'll need 6-12 months of audit log evidence — the system is collecting this automatically.
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 11, color: '#9CA3AF', textAlign: 'right' }}>
        Report generated {new Date(data.generatedAt).toLocaleString('en-AU')}
      </div>
    </div>
  );
}

// ── Audit Log Tab ─────────────────────────────────────────────────────────────
function AuditLogTab() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [actions, setActions] = useState([]);
  const [expanded, setExpanded] = useState(null);

  const LIMIT = 50;

  useEffect(() => {
    API('/actions').then(r => r.json()).then(setActions).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: LIMIT });
    if (search) params.set('search', search);
    if (actionFilter) params.set('action', actionFilter);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    API(`/logs?${params}`).then(r => r.json()).then(d => {
      setLogs(d.logs || []);
      setTotal(d.total || 0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [page, search, actionFilter, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (actionFilter) params.set('action', actionFilter);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    const token = localStorage.getItem('c360_token');
    const tenantId = localStorage.getItem('c360_tenant');
    const resp = await fetch(`/api/audit/logs/export?${params}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(tenantId ? { 'x-tenant-id': tenantId } : {}) }
    });
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const pages = Math.ceil(total / LIMIT);

  return (
    <div style={{ padding: 24 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="🔍 Search events, users, actions…"
          style={{ flex: '1 1 200px', padding: '8px 14px', borderRadius: 8, border: '1px solid #E8E0F0', fontSize: 13, outline: 'none' }}
        />
        <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E8E0F0', fontSize: 13, color: '#5C4E6A', background: '#fff' }}>
          <option value="">All Actions</option>
          {actions.map(a => <option key={a.action} value={a.action}>{formatAction(a.action)} ({a.count})</option>)}
        </select>
        <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E8E0F0', fontSize: 13 }} />
        <span style={{ fontSize: 12, color: '#9CA3AF' }}>to</span>
        <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E8E0F0', fontSize: 13 }} />
        <button onClick={handleExport} style={{
          padding: '8px 16px', borderRadius: 8, background: '#8B6DAF', color: '#fff',
          border: 'none', fontSize: 13, cursor: 'pointer', fontWeight: 600
        }}>⬇️ Export CSV</button>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: '#6B5E7A' }}>{total.toLocaleString()} events found</span>
        <span style={{ fontSize: 13, color: '#9CA3AF' }}>Page {page} of {pages || 1}</span>
      </div>

      {/* Log table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#8B6DAF' }}>Loading…</div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>No audit events found</div>
      ) : (
        <div style={{ border: '1px solid #E8E0F0', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8F5FC', borderBottom: '1px solid #E8E0F0' }}>
                {['Time', 'User', 'Action', 'IP Address', 'Details'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#5C4E6A', fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <>
                  <tr key={log.id} onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    style={{ borderBottom: '1px solid #F3EFF8', cursor: 'pointer', background: expanded === log.id ? '#FAF7FF' : i % 2 === 0 ? '#fff' : '#FDFCFF' }}>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#9CA3AF', fontSize: 12 }}>
                      <span title={log.created_at}>{timeAgo(log.created_at)}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 600, color: '#2d1f3d', fontSize: 12 }}>{log.user_name || '—'}</div>
                      <div style={{ color: '#9CA3AF', fontSize: 11 }}>{log.user_email || 'System'}</div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: log.action.includes('fail') || log.action.includes('delete') ? '#fef2f2' : '#f0fdf4',
                        color: log.action.includes('fail') || log.action.includes('delete') ? '#dc2626' : '#15803d'
                      }}>{formatAction(log.action)}</span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6B7280', fontSize: 11, fontFamily: 'monospace' }}>
                      {log.ip_address || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6B7280', fontSize: 11 }}>
                      {typeof log.details === 'object' ? Object.entries(log.details).slice(0,2).map(([k,v]) => `${k}: ${JSON.stringify(v)}`).join(', ') : (log.details || '—')}
                    </td>
                  </tr>
                  {expanded === log.id && (
                    <tr key={log.id + '_exp'} style={{ background: '#FAF7FF' }}>
                      <td colSpan={5} style={{ padding: '12px 24px 16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#8B6DAF', marginBottom: 4 }}>FULL DETAILS</div>
                            <pre style={{ fontSize: 11, background: '#F3EFF8', padding: 10, borderRadius: 8, margin: 0, overflow: 'auto', color: '#2d1f3d' }}>
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#8B6DAF', marginBottom: 4 }}>USER AGENT</div>
                            <div style={{ fontSize: 11, color: '#6B7280', background: '#F3EFF8', padding: 10, borderRadius: 8, wordBreak: 'break-word' }}>
                              {log.user_agent || '—'}
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#8B6DAF', marginTop: 12, marginBottom: 4 }}>TIMESTAMP (UTC)</div>
                            <div style={{ fontSize: 11, color: '#6B7280', fontFamily: 'monospace' }}>{log.created_at}</div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E8E0F0', background: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', color: '#5C4E6A', fontSize: 13 }}>← Prev</button>
          <span style={{ padding: '6px 14px', fontSize: 13, color: '#6B5E7A' }}>{page} / {pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page === pages}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E8E0F0', background: '#fff', cursor: page === pages ? 'not-allowed' : 'pointer', color: '#5C4E6A', fontSize: 13 }}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ── Sessions Tab ──────────────────────────────────────────────────────────────
function SessionsTab() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API('/sessions').then(r => r.json()).then(d => { setSessions(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const revoke = async (id) => {
    if (!confirm('Revoke this session? The user will be logged out immediately.')) return;
    await API(`/sessions/${id}`, { method: 'DELETE' });
    setSessions(s => s.filter(x => x.id !== id));
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#2d1f3d' }}>Active Sessions</h3>
        <span style={{ fontSize: 13, color: '#9CA3AF' }}>{sessions.length} active</span>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#8B6DAF' }}>Loading…</div>
      ) : sessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔐</div>
          No active sessions found
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sessions.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#FDFCFF', border: '1px solid #E8E0F0', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#8B6DAF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                {(s.name || s.email || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#2d1f3d' }}>{s.name || '—'}</div>
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>{s.email}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: '#6B7280' }}>
                <div>Started {timeAgo(s.created_at)}</div>
                <div style={{ color: '#9CA3AF' }}>Expires {timeAgo(s.expires_at)}</div>
              </div>
              <button onClick={() => revoke(s.id)} style={{
                padding: '6px 12px', borderRadius: 8, background: '#fef2f2', color: '#dc2626',
                border: '1px solid #fecaca', fontSize: 12, cursor: 'pointer', fontWeight: 600
              }}>Revoke</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 20, background: '#FFF8F0', border: '1px solid #FED7AA', borderRadius: 12, padding: 16, fontSize: 13, color: '#92400e' }}>
        <strong>SOC2 Requirement:</strong> Review and revoke unused sessions regularly. JWT tokens automatically expire after 4 hours. Refresh tokens expire after 30 days.
      </div>
    </div>
  );
}

// ── Policy Docs Tab ───────────────────────────────────────────────────────────
function PolicyTab() {
  const policies = [
    {
      name: 'Access Control Policy',
      category: 'CC6',
      status: 'built-in',
      items: [
        'Role-based access: owner, admin, manager, educator, parent',
        'Tenant isolation — users cannot access other organisations data',
        'Account lockout after 10 failed login attempts',
        'Password minimum: 10 chars, uppercase, lowercase, number, special char',
        'JWT sessions expire after 4 hours',
        'MFA support via TOTP (Google Authenticator compatible)',
        'All access events audit logged with IP and user agent'
      ]
    },
    {
      name: 'Audit & Monitoring Policy',
      category: 'CC4 / CC7',
      status: 'built-in',
      items: [
        'All authentication events logged (success, failure, logout)',
        'All data mutations logged (create, update, delete)',
        'All document access and uploads logged',
        'Audit logs retained for 365 days then auto-purged',
        'Audit logs exportable as CSV for auditor review',
        'Failed login spikes visible in compliance dashboard'
      ]
    },
    {
      name: 'Data Protection Policy',
      category: 'PI — Privacy',
      status: 'built-in',
      items: [
        'Passwords hashed with bcrypt (12 rounds)',
        'JWT secrets stored as environment variables — never in code',
        'Password and token fields stripped from all API responses',
        'Children medical records access-controlled and audit-logged',
        'TLS/HTTPS enforced for all connections (Railway)',
        'Multi-tenant data isolation — SQL scoped by tenant_id'
      ]
    },
    {
      name: 'Incident Response Plan',
      category: 'CC7',
      status: 'manual',
      items: [
        'Detect: Monitor Railway deploy logs and compliance dashboard for anomalies',
        'Contain: Revoke compromised sessions via Sessions tab above',
        'Lock accounts: Platform admin can set locked=1 via platform admin panel',
        'Assess: Export audit logs for the affected period as evidence',
        'Notify: Contact affected tenants within 72 hours (GDPR/Privacy Act)',
        'Document: Add a manual compliance note recording the incident and response'
      ]
    },
    {
      name: 'Backup & Recovery Policy',
      category: 'A1',
      status: 'manual',
      items: [
        'Railway volume snapshots enabled (automatic)',
        'Recommended: Weekly manual database download via Railway CLI',
        'RTO Target: 4 hours (time to restore service)',
        'RPO Target: 24 hours (maximum data loss acceptable)',
        'Test restore procedure quarterly — document results'
      ]
    },
    {
      name: 'Vendor / Sub-processor Register',
      category: 'CC9',
      status: 'manual',
      items: [
        'Railway (infrastructure) — SOC2 Type II certified',
        'Anthropic (AI roster assistant) — Enterprise DPA available',
        'Obtain SOC2 reports from vendors annually',
        'Review vendor security posture as part of annual review'
      ]
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ background: '#F0EBF8', borderRadius: 12, padding: 16, marginBottom: 24, fontSize: 13, color: '#5C4E6A' }}>
        <strong>📋 About these policies</strong> — Items marked <strong>Built-In</strong> are technical controls already implemented in Childcare360. Items marked <strong>Manual</strong> require documented procedures and human action. For SOC2 certification, you'll need to produce written policy documents based on these and share them with your auditor.
      </div>
      {policies.map(p => (
        <div key={p.name} style={{ marginBottom: 20, border: '1px solid #E8E0F0', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: '#F8F5FC', borderBottom: '1px solid #E8E0F0' }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#2d1f3d' }}>{p.name}</span>
              <span style={{ marginLeft: 10, fontSize: 11, color: '#8B6DAF', fontWeight: 600 }}>{p.category}</span>
            </div>
            <span style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: p.status === 'built-in' ? '#f0fdf4' : '#fffbeb',
              color: p.status === 'built-in' ? '#15803d' : '#92400e',
              border: `1px solid ${p.status === 'built-in' ? '#86efac' : '#fde68a'}`
            }}>{p.status === 'built-in' ? '✅ Built-In' : '📋 Manual Procedure'}</span>
          </div>
          <div style={{ padding: '14px 20px' }}>
            {p.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13, color: '#374151' }}>
                <span style={{ color: '#8B6DAF', flexShrink: 0 }}>•</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main SOC2 Module ──────────────────────────────────────────────────────────
export default function SOC2Module({ tenantId }) {
  const [tab, setTab] = useState('compliance');

  const tabs = [
    { id: 'compliance', label: '🛡️ Compliance Status' },
    { id: 'audit', label: '📋 Audit Log' },
    { id: 'sessions', label: '🔐 Active Sessions' },
    { id: 'policy', label: '📄 Policies' }
  ];

  return (
    <div style={{ background: '#F8F5FC', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #2d1f3d 0%, #4a3560 100%)', padding: '24px 32px 0', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 28 }}>🛡️</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>SOC2 Compliance Centre</h1>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.7, marginTop: 2 }}>Security controls, audit trails, and compliance monitoring</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '10px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              borderRadius: '10px 10px 0 0',
              background: tab === t.id ? '#F8F5FC' : 'transparent',
              color: tab === t.id ? '#8B6DAF' : 'rgba(255,255,255,0.7)'
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ background: '#fff', minHeight: 'calc(100vh - 120px)' }}>
        {tab === 'compliance' && <ComplianceTab />}
        {tab === 'audit' && <AuditLogTab />}
        {tab === 'sessions' && <SessionsTab />}
        {tab === 'policy' && <PolicyTab />}
      </div>
    </div>
  );
}
