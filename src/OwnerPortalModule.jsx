import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend, AreaChart, Area } from "recharts";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token");
  return fetch(path, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then((r) => r.json());
};

// ─── Theme constants ──────────────────────────────────────────────────────────
const card = { background: "#FFFFFF", borderRadius: 14, padding: 20, border: "1px solid #E8E0D8", boxShadow: "0 2px 12px rgba(80,60,90,0.04)", transition: "all 0.25s ease", marginBottom: 16 };
const btnPrimary = { background: "linear-gradient(135deg, #8B6DAF, #9B7DC0)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", cursor: "pointer", fontSize: 13, fontWeight: 700, boxShadow: "0 3px 10px rgba(139,109,175,0.2)", transition: "all 0.2s ease" };
const btnSecondary = { background: "#F8F5F1", color: "#5C4E6A", border: "1px solid #D9D0C7", borderRadius: 10, padding: "8px 16px", cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s ease" };
const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #D9D0C7", background: "#F8F5F1", color: "#3D3248", fontSize: 13, boxSizing: "border-box", transition: "border-color 0.2s, box-shadow 0.2s", outline: "none" };
const labelStyle = { display: "block", fontSize: 11, fontWeight: 700, color: "#8A7F96", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" };
const PLAN_COLORS = { trial: "#D4A26A", starter: "#6BA38B", professional: "#8B6DAF", enterprise: "#7B9DC8" };
const PLAN_NAMES = { trial: "Trial", starter: "Starter", professional: "Professional", enterprise: "Enterprise" };
const STATUS_COLORS = { active: "#6BA38B", trial: "#D4A26A", suspended: "#C06B73", cancelled: "#8A7F96" };
const SERVICE_LABELS = { long_day_care: "Long Day Care", preschool: "Preschool", family_day_care: "Family Day Care", oshc: "OSHC", kindergarten: "Kindergarten" };

const Badge = ({ text, color }) => (
  <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, color, background: color + "14", letterSpacing: "0.04em" }}>
    {text}
  </span>
);

const MetricCard = ({ label, value, sub, color = "#8B6DAF", prefix = "", suffix = "" }) => (
  <div style={{ ...card, flex: "1 1 0", minWidth: 140, padding: 16, cursor: "default" }}
    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 25px rgba(80,60,90,0.08)"; }}
    onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 12px rgba(80,60,90,0.04)"; }}>
    <div style={{ fontSize: 10, color: "#8A7F96", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: "-0.03em", lineHeight: 1.2 }}>{prefix}{typeof value === "number" ? value.toLocaleString() : value}{suffix}</div>
    {sub && <div style={{ fontSize: 11, color: "#A89DB5", marginTop: 2 }}>{sub}</div>}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// OWNER PORTAL — Main Component
// ═══════════════════════════════════════════════════════════════════════════════
export function OwnerPortal() {
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [comparison, setComparison] = useState([]);
  const [revenueData, setRevenueData] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [wellbeing, setWellbeing] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [incidentTrends, setIncidentTrends] = useState(null);
  const [nqsReport, setNqsReport] = useState(null);
  const [sentiment, setSentiment] = useState(null);
  const [predictions, setPredictions] = useState(null);
  const [ccsData, setCcsData] = useState(null);
  const [showProvision, setShowProvision] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [seedTenant, setSeedTenant] = useState('');
  const [seedTenantList, setSeedTenantList] = useState([]);

  useEffect(() => {
    API('/api/platform/tenants').then(r => setSeedTenantList(r.tenants || [])).catch(() => {});
  }, []);

  const runCNSeed = async () => {
    if (!seedTenant) { alert('Please select a centre first.'); return; }
    const chosen = seedTenantList.find(t => t.id === seedTenant);
    if (!window.confirm('Import CN children into "' + (chosen?.name || seedTenant) + '"?\n\nAdds ~127 children across 7 rooms. Safe to re-run.')) return;
    setSeeding(true); setSeedResult(null);
    try {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const r = await fetch('/run-seed-cn?token=childcare360seed&tenant=' + encodeURIComponent(seedTenant), { headers: { Authorization: 'Bearer ' + token } });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }
      setSeedResult(data);
      if (data.ok) load();
    } catch(e) { setSeedResult({ error: e.message }); }
    setSeeding(false);
  };
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenantDetail, setTenantDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, ts, cmp, rev, inc, wl, wb, al] = await Promise.all([
        API("/api/platform/metrics/overview"),
        API("/api/platform/tenants"),
        API("/api/platform/metrics/comparison"),
        API("/api/platform/metrics/revenue"),
        API("/api/platform/incidents"),
        API("/api/platform/waitlist").catch(() => ({ waitlist: [] })),
        API("/api/platform/wellbeing").catch(() => ({ wellbeing: [] })),
        API("/api/platform/audit?limit=100").catch(() => ({ logs: [] })),
      ]);
      setOverview(ov);
      setTenants(ts.tenants || []);
      setComparison(cmp.comparison || []);
      setRevenueData(rev.revenue || []);
      setIncidents(inc.incidents || []);
      setWaitlist(wl.waitlist || []);
      setWellbeing(wb.wellbeing || []);
      setAuditLog(al.logs || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadTenantDetail = async (id) => {
    setSelectedTenant(id);
    const d = await API(`/api/platform/tenants/${id}`);
    setTenantDetail(d);
  };

  // Lazy-load feature data when tab selected
  const loadFeature = useCallback(async (featureTab) => {
    try {
      if (featureTab === "trends" && !incidentTrends) {
        const d = await API("/api/platform/incidents/trends");
        setIncidentTrends(d);
      } else if (featureTab === "nqs" && !nqsReport) {
        const d = await API("/api/platform/nqs/report");
        setNqsReport(d);
      } else if (featureTab === "sentiment" && !sentiment) {
        const d = await API("/api/platform/sentiment");
        setSentiment(d);
      } else if (featureTab === "predictions" && !predictions) {
        const d = await API("/api/platform/occupancy/predict");
        setPredictions(d);
      } else if (featureTab === "ccs" && !ccsData) {
        const d = await API("/api/platform/ccs/overview");
        setCcsData(d);
      }
    } catch (e) { console.error("Feature load error:", e); }
  }, [incidentTrends, nqsReport, sentiment, predictions, ccsData]);

  const switchTab = (t) => {
    setTab(t);
    loadFeature(t);
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "centres", label: "Centres", icon: "🏫" },
    { id: "revenue", label: "Revenue", icon: "💰" },
    { id: "occupancy", label: "Occupancy", icon: "📈" },
    { id: "predictions", label: "Predictive AI", icon: "🔮" },
    { id: "compliance", label: "Compliance", icon: "🛡️" },
    { id: "nqs", label: "NQS & QIP", icon: "⭐" },
    { id: "wellbeing", label: "Staff Wellbeing", icon: "💜" },
    { id: "sentiment", label: "Parent Sentiment", icon: "💬" },
    { id: "incidents", label: "Incidents", icon: "⚠️" },
    { id: "trends", label: "Incident Trends", icon: "📉" },
    { id: "ccs", label: "CCS Submissions", icon: "🏛️" },
    { id: "audit", label: "Audit Log", icon: "📋" },
    { id: "competitive", label: "Market Intel", icon: "🎯" },
  ];

  if (loading && !overview) {
    return (
      <div style={{ textAlign: "center", padding: 60, animation: "fadeIn 0.5s ease-out" }}>
        <div style={{ fontSize: 48, marginBottom: 16, animation: "softBounce 2s ease-in-out infinite" }}>🏢</div>
        <div style={{ fontSize: 16, color: "#8A7F96", fontWeight: 600 }}>Loading Owner Portal...</div>
        <div style={{ width: 120, height: 3, borderRadius: 2, margin: "16px auto 0", background: "linear-gradient(90deg, #F3EEE8 25%, #C4AED6 50%, #F3EEE8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.8s ease-in-out infinite" }} />
      </div>
    );
  }

  return (
    <div>
      {/* Portal Header */}
      <div style={{ ...card, background: "linear-gradient(135deg, #EDE4F0, #F0EBE6)", border: "1px solid #D9D0C7", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#3D3248" }}>Childcare360 Owner Portal</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#8A7F96" }}>Multi-tenant SaaS management · Platform-wide analytics</p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {seedResult && <span style={{fontSize:11,color:seedResult.ok?'#2E7D32':'#C06B73',background:seedResult.ok?'#E8F5E9':'#FFEBEE',padding:'4px 10px',borderRadius:8}}>{seedResult.ok ? `✓ ${seedResult.kidsAdded} added into ${seedResult.tenant} (${seedResult.totalChildren} total)` : `✗ ${seedResult.error||JSON.stringify(seedResult)}`}</span>}
          <select value={seedTenant} onChange={e=>setSeedTenant(e.target.value)} style={{padding:'8px 10px',borderRadius:8,border:'1px solid #DDD6EE',fontSize:12,color:'#3D3248'}}>
            <option value=''>— Select centre to seed —</option>
            {seedTenantList.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={runCNSeed} disabled={seeding||!seedTenant} style={{...btnPrimary,background:'linear-gradient(135deg,#2E7D32,#43A047)',opacity:(seeding||!seedTenant)?0.6:1}}>{seeding?'Importing...':'🏫 Import CN Children'}</button>
          <button onClick={() => setShowProvision(true)} style={btnPrimary}>+ Provision New Centre</button>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => switchTab(t.id)} style={{
            ...btnSecondary, background: tab === t.id ? "rgba(139,109,175,0.10)" : "#F8F5F1",
            color: tab === t.id ? "#7E5BA3" : "#6B5F7A", fontWeight: tab === t.id ? 700 : 500, border: tab === t.id ? "1px solid rgba(139,109,175,0.2)" : "1px solid #D9D0C7",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* Tab Content */}
      <div key={tab} style={{ animation: "fadeInUp 0.35s ease-out" }}>
        {tab === "overview" && <OverviewTab overview={overview} tenants={tenants} comparison={comparison} />}
        {tab === "centres" && <CentresTab tenants={tenants} onSelect={loadTenantDetail} detail={tenantDetail} selectedId={selectedTenant} onRefresh={load} />}
        {tab === "revenue" && <RevenueTab overview={overview} revenueData={revenueData} tenants={tenants} />}
        {tab === "occupancy" && <OccupancyTab tenants={tenants} comparison={comparison} waitlist={waitlist} overview={overview} />}
        {tab === "predictions" && <PredictiveOccupancyTab data={predictions} />}
        {tab === "compliance" && <ComplianceTab comparison={comparison} tenants={tenants} />}
        {tab === "nqs" && <NqsQipTab data={nqsReport} />}
        {tab === "wellbeing" && <WellbeingTab wellbeing={wellbeing} tenants={tenants} />}
        {tab === "sentiment" && <ParentSentimentTab data={sentiment} />}
        {tab === "incidents" && <IncidentsTab incidents={incidents} />}
        {tab === "trends" && <IncidentTrendsTab data={incidentTrends} />}
        {tab === "ccs" && <CcsSubmissionsTab data={ccsData} onRefresh={() => { setCcsData(null); loadFeature("ccs"); }} />}
        {tab === "audit" && <AuditTab entries={auditLog} />}
        {tab === "competitive" && <CompetitiveTab />}
      </div>

      {/* Provision Modal */}
      {showProvision && <ProvisionModal onClose={() => setShowProvision(false)} onDone={() => { setShowProvision(false); load(); }} />}
    </div>
  );
}

// ═══ OVERVIEW TAB ════════════════════════════════════════════════════════════
function OverviewTab({ overview, tenants, comparison }) {
  if (!overview) return null;
  const o = overview;
  const mrrDollars = ((o.mrr_cents || 0) / 100).toFixed(0);
  const arrDollars = ((o.mrr_cents || 0) * 12 / 100).toFixed(0);

  return (
    <div>
      {/* KPI Row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <MetricCard label="Active Centres" value={o.active_centres + o.trial_centres} sub={`${o.trial_centres} on trial`} color="#8B6DAF" />
        <MetricCard label="Total Children" value={o.total_children} sub={`${o.total_waitlist} on waitlists`} color="#C9929E" />
        <MetricCard label="Total Educators" value={o.total_educators} sub={`across ${o.total_rooms} rooms`} color="#6BA38B" />
        <MetricCard label="MRR" value={mrrDollars} prefix="$" sub={`ARR: $${parseInt(arrDollars).toLocaleString()}`} color="#8B6DAF" />
        <MetricCard label="30-Day Incidents" value={o.incidents_30d} color={o.incidents_30d > 5 ? "#C06B73" : "#6BA38B"} />
      </div>

      {/* Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Plan Distribution */}
        <div style={card}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>Subscription Mix</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={(o.planDistribution || []).map(p => ({ ...p, fill: PLAN_COLORS[p.plan] || "#8B6DAF" }))} dataKey="count" nameKey="plan" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                {(o.planDistribution || []).map((p, i) => <Cell key={i} fill={PLAN_COLORS[p.plan] || "#8B6DAF"} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [v, PLAN_NAMES[n] || n]} contentStyle={{ background: "#fff", border: "1px solid #E8E0D8", borderRadius: 10, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            {(o.planDistribution || []).map(p => (
              <div key={p.plan} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#5C4E6A" }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: PLAN_COLORS[p.plan] }} />
                {PLAN_NAMES[p.plan]} ({p.count})
              </div>
            ))}
          </div>
        </div>

        {/* Centre Comparison */}
        <div style={card}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>Occupancy by Centre</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={comparison.map(c => ({ name: c.name?.split(" ")[0] || "?", occupancy: Math.round(c.avg_occupancy || 0), compliance: Math.round(c.avg_compliance || 0) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D8" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#8A7F96" }} />
              <YAxis tick={{ fontSize: 11, fill: "#8A7F96" }} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E8E0D8", borderRadius: 10, fontSize: 12 }} />
              <Bar dataKey="occupancy" fill="#8B6DAF" radius={[4, 4, 0, 0]} name="Occupancy %" />
              <Bar dataKey="compliance" fill="#6BA38B" radius={[4, 4, 0, 0]} name="Compliance %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quick Status Grid */}
      <div style={card}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>Centre Status Overview</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
          {tenants.map(t => (
            <div key={t.id} style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid #E8E0D8", background: "#FDFBF9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#3D3248" }}>{t.name}</div>
                <div style={{ fontSize: 11, color: "#8A7F96" }}>{SERVICE_LABELS[t.service_type] || t.service_type} · {t.child_count} children · {t.educator_count} staff</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Badge text={PLAN_NAMES[t.plan] || "—"} color={PLAN_COLORS[t.plan] || "#8A7F96"} />
                <Badge text={t.sub_status || "—"} color={STATUS_COLORS[t.sub_status] || "#8A7F96"} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══ CENTRES TAB ═════════════════════════════════════════════════════════════
function CentresTab({ tenants, onSelect, detail, selectedId, onRefresh }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: selectedId ? "360px 1fr" : "1fr", gap: 16 }}>
      {/* Centres List */}
      <div>
        <div style={{ ...card, padding: 0 }}>
          {tenants.map(t => (
            <div key={t.id} onClick={() => onSelect(t.id)} style={{
              padding: "14px 18px", borderBottom: "1px solid #E8E0D8", cursor: "pointer", transition: "all 0.2s",
              background: selectedId === t.id ? "rgba(139,109,175,0.06)" : "transparent",
            }}
              onMouseEnter={e => { if (selectedId !== t.id) e.currentTarget.style.background = "#FDFBF9"; }}
              onMouseLeave={e => { if (selectedId !== t.id) e.currentTarget.style.background = "transparent"; }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#3D3248", marginBottom: 2 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: "#8A7F96" }}>
                    {SERVICE_LABELS[t.service_type] || t.service_type} · ABN: {t.abn || "Not set"}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: "#5C4E6A" }}>👶 {t.child_count}/{t.max_children || "∞"}</span>
                    <span style={{ fontSize: 11, color: "#5C4E6A" }}>👩‍🏫 {t.educator_count}/{t.max_educators || "∞"}</span>
                    <span style={{ fontSize: 11, color: "#5C4E6A" }}>🏠 {t.room_count} rooms</span>
                    {t.waitlist_count > 0 && <span style={{ fontSize: 11, color: "#D4A26A" }}>📋 {t.waitlist_count} waiting</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Badge text={PLAN_NAMES[t.plan] || "—"} color={PLAN_COLORS[t.plan] || "#8A7F96"} />
                  <div style={{ fontSize: 11, color: "#8A7F96", marginTop: 4 }}>
                    ${((t.monthly_price_cents || 0) / 100).toFixed(0)}/mo
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Centre Detail Panel */}
      {selectedId && detail && (
        <div style={{ animation: "slideInRight 0.3s ease-out" }}>
          <CentreDetailPanel detail={detail} onRefresh={onRefresh} />
        </div>
      )}
    </div>
  );
}

function CentreDetailPanel({ detail, onRefresh }) {
  const { tenant, subscription, members, rooms, children, incidents, waitlist } = detail;
  const [subTab, setSubTab] = useState("info");

  const subTabs = [
    { id: "info", label: "Details" }, { id: "staff", label: `Staff (${members?.length || 0})` },
    { id: "rooms", label: `Rooms (${rooms?.length || 0})` }, { id: "children", label: `Children (${children?.length || 0})` },
    { id: "waitlist", label: `Waitlist (${waitlist?.length || 0})` }, { id: "incidents", label: "Incidents" },
  ];

  return (
    <div>
      <div style={{ ...card, padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#3D3248" }}>{tenant?.name}</h3>
            <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 2 }}>{tenant?.address}</div>
          </div>
          <Badge text={subscription?.status || "—"} color={STATUS_COLORS[subscription?.status] || "#8A7F96"} />
        </div>

        {/* Sub-tabs */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16 }}>
          {subTabs.map(t => (
            <button key={t.id} onClick={() => setSubTab(t.id)} style={{
              padding: "6px 12px", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600,
              background: subTab === t.id ? "rgba(139,109,175,0.10)" : "transparent",
              color: subTab === t.id ? "#7E5BA3" : "#8A7F96", transition: "all 0.15s"
            }}>{t.label}</button>
          ))}
        </div>

        {subTab === "info" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>
            <div><span style={{ color: "#8A7F96" }}>Email:</span> <span style={{ color: "#3D3248", fontWeight: 600 }}>{tenant?.email}</span></div>
            <div><span style={{ color: "#8A7F96" }}>Phone:</span> <span style={{ color: "#3D3248", fontWeight: 600 }}>{tenant?.phone}</span></div>
            <div><span style={{ color: "#8A7F96" }}>ABN:</span> <span style={{ color: "#3D3248", fontWeight: 600 }}>{tenant?.abn}</span></div>
            <div><span style={{ color: "#8A7F96" }}>Type:</span> <span style={{ color: "#3D3248", fontWeight: 600 }}>{SERVICE_LABELS[tenant?.service_type]}</span></div>
            <div><span style={{ color: "#8A7F96" }}>Plan:</span> <Badge text={PLAN_NAMES[subscription?.plan] || "—"} color={PLAN_COLORS[subscription?.plan] || "#8A7F96"} /></div>
            <div><span style={{ color: "#8A7F96" }}>Price:</span> <span style={{ color: "#3D3248", fontWeight: 600 }}>${((subscription?.monthly_price_cents || 0) / 100).toFixed(2)}/mo</span></div>
            <div><span style={{ color: "#8A7F96" }}>Max children:</span> <span style={{ color: "#3D3248", fontWeight: 600 }}>{subscription?.max_children}</span></div>
            <div><span style={{ color: "#8A7F96" }}>Max educators:</span> <span style={{ color: "#3D3248", fontWeight: 600 }}>{subscription?.max_educators}</span></div>
            <div><span style={{ color: "#8A7F96" }}>NQS Rating:</span> <span style={{ color: "#3D3248", fontWeight: 600 }}>{tenant?.nqs_rating || "Not assessed"}</span></div>
            <div><span style={{ color: "#8A7F96" }}>Created:</span> <span style={{ color: "#3D3248", fontWeight: 600 }}>{tenant?.created_at?.split("T")[0]}</span></div>
          </div>
        )}

        {subTab === "staff" && (
          <div>
            {(members || []).map(m => (
              <div key={m.id} style={{ padding: "8px 0", borderBottom: "1px solid #F0EBE6", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <div><span style={{ fontWeight: 700, color: "#3D3248" }}>{m.name}</span> <span style={{ color: "#8A7F96" }}>({m.email})</span></div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Badge text={m.role} color={m.role === "admin" ? "#8B6DAF" : "#6BA38B"} />
                  {m.last_login && <span style={{ fontSize: 10, color: "#A89DB5" }}>Last: {m.last_login?.split("T")[0]}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {subTab === "rooms" && (
          <div style={{ display: "grid", gap: 8 }}>
            {(rooms || []).map(r => (
              <div key={r.id} style={{ padding: 10, borderRadius: 10, background: "#F8F5F1", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#3D3248" }}>{r.name}</span>
                <span style={{ fontSize: 11, color: "#8A7F96" }}>Cap: {r.capacity} · Age: {r.age_group}</span>
              </div>
            ))}
          </div>
        )}

        {subTab === "children" && (
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {(children || []).map(c => (
              <div key={c.id} style={{ padding: "6px 0", borderBottom: "1px solid #F0EBE6", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ fontWeight: 600, color: "#3D3248" }}>{c.first_name} {c.last_name}</span>
                <span style={{ color: "#8A7F96" }}>DOB: {c.dob} {c.allergies && c.allergies !== "None" ? "⚠️" : ""}</span>
              </div>
            ))}
          </div>
        )}

        {subTab === "waitlist" && (
          <div>
            {(waitlist || []).length === 0 ? <div style={{ fontSize: 12, color: "#A89DB5", textAlign: "center", padding: 20 }}>No waitlist entries</div> :
              (waitlist || []).map((w, i) => (
                <div key={w.id} style={{ padding: "8px 0", borderBottom: "1px solid #F0EBE6", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <div>
                    <span style={{ fontWeight: 700, color: "#5C4E6A", marginRight: 8 }}>#{i + 1}</span>
                    <span style={{ fontWeight: 600, color: "#3D3248" }}>{w.child_name}</span>
                    <span style={{ color: "#8A7F96" }}> — {w.parent_name}</span>
                  </div>
                  <Badge text={w.priority} color={w.priority === "high" ? "#C06B73" : "#D4A26A"} />
                </div>
              ))}
          </div>
        )}

        {subTab === "incidents" && (
          <div>
            {(incidents || []).length === 0 ? <div style={{ fontSize: 12, color: "#A89DB5", textAlign: "center", padding: 20 }}>No incidents</div> :
              (incidents || []).map(inc => (
                <div key={inc.id} style={{ padding: "8px 0", borderBottom: "1px solid #F0EBE6", fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600, color: "#3D3248" }}>{inc.title}</span>
                    <Badge text={inc.severity} color={inc.severity === "minor" ? "#D4A26A" : inc.severity === "moderate" ? "#C9828A" : "#C06B73"} />
                  </div>
                  <div style={{ color: "#8A7F96", marginTop: 2 }}>{inc.description?.slice(0, 100)}</div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ REVENUE TAB ═════════════════════════════════════════════════════════════
function RevenueTab({ overview, revenueData, tenants }) {
  const o = overview || {};
  const mrrDollars = ((o.mrr_cents || 0) / 100);
  const chartData = revenueData.map(r => ({ date: r.date?.slice(5), revenue: Math.round((r.total_revenue || 0) / 100), children: r.total_children }));

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <MetricCard label="Monthly Recurring Revenue" value={mrrDollars.toFixed(0)} prefix="$" color="#8B6DAF" />
        <MetricCard label="Annual Run Rate" value={(mrrDollars * 12).toFixed(0)} prefix="$" color="#7B9DC8" />
        <MetricCard label="Avg Revenue / Centre" value={tenants.length ? (mrrDollars / tenants.length).toFixed(0) : 0} prefix="$" suffix="/mo" color="#6BA38B" />
        <MetricCard label="Active Subscriptions" value={(o.active_centres || 0) + (o.trial_centres || 0)} sub={`${o.suspended_centres || 0} suspended`} color="#D4A26A" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div style={card}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>Daily Revenue (90 days)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B6DAF" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#8B6DAF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D8" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#8A7F96" }} interval={6} />
              <YAxis tick={{ fontSize: 10, fill: "#8A7F96" }} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E8E0D8", borderRadius: 10, fontSize: 12 }} formatter={v => [`$${v}`, "Revenue"]} />
              <Area type="monotone" dataKey="revenue" stroke="#8B6DAF" fill="url(#revGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={card}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>Revenue by Plan</h3>
          <div style={{ display: "grid", gap: 10 }}>
            {(o.planDistribution || []).map(p => {
              const rev = ((p.revenue || 0) / 100).toFixed(0);
              const pct = o.mrr_cents ? Math.round((p.revenue / o.mrr_cents) * 100) : 0;
              return (
                <div key={p.plan} style={{ padding: "10px 14px", borderRadius: 10, background: "#F8F5F1" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: PLAN_COLORS[p.plan] }}>{PLAN_NAMES[p.plan]}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#3D3248" }}>${rev}/mo</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "#E8E0D8" }}>
                    <div style={{ height: 4, borderRadius: 2, background: PLAN_COLORS[p.plan], width: `${pct}%`, transition: "width 0.5s ease" }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#A89DB5", marginTop: 4 }}>{p.count} centres · {pct}% of MRR</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ COMPLIANCE TAB ══════════════════════════════════════════════════════════
function ComplianceTab({ comparison }) {
  return (
    <div>
      <div style={card}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>Cross-Centre Compliance Comparison</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={comparison.map(c => ({
            name: c.name?.split(" ").slice(0, 2).join(" ") || "?",
            compliance: Math.round(c.avg_compliance || 0),
            attendance: Math.round(c.avg_attendance || 0),
            engagement: Math.round(c.avg_engagement || 0),
          }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D8" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#8A7F96" }} />
            <YAxis tick={{ fontSize: 10, fill: "#8A7F96" }} domain={[0, 100]} />
            <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E8E0D8", borderRadius: 10, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="compliance" fill="#6BA38B" name="Compliance %" radius={[4, 4, 0, 0]} />
            <Bar dataKey="attendance" fill="#8B6DAF" name="Attendance %" radius={[4, 4, 0, 0]} />
            <Bar dataKey="engagement" fill="#D4A26A" name="Parent Engagement %" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
        {comparison.map(c => {
          const comp = Math.round(c.avg_compliance || 0);
          const color = comp >= 95 ? "#6BA38B" : comp >= 80 ? "#D4A26A" : "#C06B73";
          return (
            <div key={c.id} style={{ ...card, padding: 16, marginBottom: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#3D3248" }}>{c.name}</span>
                <span style={{ fontSize: 20, fontWeight: 800, color }}>{comp}%</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11 }}>
                <div><span style={{ color: "#8A7F96" }}>Attendance:</span> <span style={{ fontWeight: 600, color: "#3D3248" }}>{Math.round(c.avg_attendance || 0)}%</span></div>
                <div><span style={{ color: "#8A7F96" }}>Engagement:</span> <span style={{ fontWeight: 600, color: "#3D3248" }}>{Math.round(c.avg_engagement || 0)}%</span></div>
                <div><span style={{ color: "#8A7F96" }}>Incidents:</span> <span style={{ fontWeight: 600, color: c.total_incidents > 3 ? "#C06B73" : "#3D3248" }}>{c.total_incidents || 0}</span></div>
                <div><span style={{ color: "#8A7F96" }}>Type:</span> <span style={{ fontWeight: 600, color: "#3D3248" }}>{SERVICE_LABELS[c.service_type] || c.service_type}</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══ INCIDENTS TAB ═══════════════════════════════════════════════════════════
function IncidentsTab({ incidents }) {
  const sevColors = { minor: "#D4A26A", moderate: "#C9828A", major: "#C06B73", critical: "#B45960" };

  return (
    <div style={card}>
      <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>All Incidents (Last 100)</h3>
      {incidents.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#A89DB5" }}>No incidents recorded ✨</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #E8E0D8" }}>
              {["Centre", "Title", "Type", "Severity", "Child", "Status", "Date"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8A7F96", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {incidents.map(inc => (
              <tr key={inc.id} style={{ borderBottom: "1px solid #F0EBE6", transition: "background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#FDFBF9"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "10px" }}><span style={{ fontWeight: 600, color: "#3D3248" }}>{inc.tenant_name}</span></td>
                <td style={{ padding: "10px", color: "#5C4E6A" }}>{inc.title}</td>
                <td style={{ padding: "10px" }}><Badge text={inc.type} color="#8A7F96" /></td>
                <td style={{ padding: "10px" }}><Badge text={inc.severity} color={sevColors[inc.severity] || "#8A7F96"} /></td>
                <td style={{ padding: "10px", color: "#5C4E6A" }}>{inc.child_name || "—"}</td>
                <td style={{ padding: "10px" }}><Badge text={inc.status} color={inc.status === "open" ? "#C9828A" : "#6BA38B"} /></td>
                <td style={{ padding: "10px", color: "#A89DB5" }}>{inc.created_at?.split("T")[0]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ═══ OCCUPANCY & WAITLIST TAB ═══════════════════════════════════════════════
function OccupancyTab({ tenants, comparison, waitlist, overview }) {
  const o = overview || {};
  const totalChildren = tenants.reduce((s, t) => s + (t.child_count || 0), 0);
  const totalCapacity = tenants.reduce((s, t) => s + (t.max_children || 0), 0);
  const avgOccupancy = totalCapacity > 0 ? Math.round((totalChildren / totalCapacity) * 100) : 0;
  const totalWaitlist = tenants.reduce((s, t) => s + (t.waitlist_count || 0), 0);

  const occupancyData = tenants.map(t => ({
    name: t.name?.length > 18 ? t.name.slice(0, 18) + "…" : t.name,
    enrolled: t.child_count || 0,
    capacity: t.max_children || 0,
    occupancy: t.max_children > 0 ? Math.round(((t.child_count || 0) / t.max_children) * 100) : 0,
    waitlist: t.waitlist_count || 0,
  }));

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Avg Occupancy" value={avgOccupancy} suffix="%" color={avgOccupancy >= 85 ? "#6BA38B" : avgOccupancy >= 70 ? "#D4A26A" : "#C06B73"} sub={avgOccupancy >= 85 ? "Healthy" : "Below target"} />
        <MetricCard label="Total Enrolled" value={totalChildren} sub={`of ${totalCapacity} capacity`} color="#8B6DAF" />
        <MetricCard label="Total Waitlist" value={totalWaitlist} sub={`across ${tenants.length} centres`} color="#C9929E" />
        <MetricCard label="Revenue at Risk" value={totalCapacity > 0 ? Math.round((totalCapacity - totalChildren) * 120) : 0} prefix="$" suffix="/wk" sub="unfilled spots × avg fee" color="#D4A26A" />
      </div>

      {/* Occupancy chart */}
      <div style={{ ...card, padding: 20, marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>Centre Occupancy vs Capacity</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={occupancyData} barGap={4}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#8A7F96" }} />
            <YAxis tick={{ fontSize: 10, fill: "#8A7F96" }} />
            <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E8E0D8", borderRadius: 10, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="enrolled" fill="#8B6DAF" name="Enrolled" radius={[4, 4, 0, 0]} />
            <Bar dataKey="capacity" fill="#E8E0D8" name="Capacity" radius={[4, 4, 0, 0]} />
            <Bar dataKey="waitlist" fill="#C9929E" name="Waitlist" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Centre occupancy detail */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {occupancyData.map(c => {
          const color = c.occupancy >= 90 ? "#6BA38B" : c.occupancy >= 75 ? "#D4A26A" : "#C06B73";
          return (
            <div key={c.name} style={{ ...card, padding: 16, marginBottom: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#3D3248" }}>{c.name}</span>
                <Badge text={`${c.occupancy}%`} color={color} />
              </div>
              <div style={{ height: 8, borderRadius: 4, background: "#F0EBE6", marginBottom: 10, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 4, background: `linear-gradient(90deg, ${color}, ${color}cc)`, width: `${Math.min(c.occupancy, 100)}%`, transition: "width 0.5s ease" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, fontSize: 11 }}>
                <div><span style={{ color: "#8A7F96" }}>Enrolled</span><div style={{ fontWeight: 700, color: "#3D3248" }}>{c.enrolled}</div></div>
                <div><span style={{ color: "#8A7F96" }}>Capacity</span><div style={{ fontWeight: 700, color: "#3D3248" }}>{c.capacity}</div></div>
                <div><span style={{ color: "#8A7F96" }}>Waitlist</span><div style={{ fontWeight: 700, color: c.waitlist > 0 ? "#C9929E" : "#3D3248" }}>{c.waitlist}</div></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Waitlist table */}
      {waitlist.length > 0 && (
        <div style={{ ...card, marginTop: 16, padding: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>Active Waitlist Entries ({waitlist.length})</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #E8E0D8" }}>
                {["Centre", "Child Name", "Age Group", "Priority", "Applied", "Status"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8A7F96", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {waitlist.slice(0, 20).map((w, i) => (
                <tr key={w.id || i} style={{ borderBottom: "1px solid #F0EBE6" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#FDFBF9"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "10px", fontWeight: 600, color: "#3D3248" }}>{w.tenant_name || "—"}</td>
                  <td style={{ padding: "10px", color: "#5C4E6A" }}>{w.child_name || "—"}</td>
                  <td style={{ padding: "10px" }}><Badge text={w.age_group || "unknown"} color="#8A7F96" /></td>
                  <td style={{ padding: "10px" }}><Badge text={w.priority || "normal"} color={w.priority === "high" ? "#C06B73" : "#D4A26A"} /></td>
                  <td style={{ padding: "10px", color: "#A89DB5" }}>{w.created_at?.split("T")[0] || "—"}</td>
                  <td style={{ padding: "10px" }}><Badge text={w.status || "waiting"} color={w.status === "offered" ? "#6BA38B" : "#D4A26A"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {waitlist.length > 20 && <div style={{ textAlign: "center", padding: 10, fontSize: 11, color: "#A89DB5" }}>Showing 20 of {waitlist.length} entries</div>}
        </div>
      )}
    </div>
  );
}

// ═══ STAFF WELLBEING TAB (UNIQUE DIFFERENTIATOR) ════════════════════════════
function WellbeingTab({ wellbeing, tenants }) {
  // wellbeing is already aggregated by tenant from the API: { tenant_name, avg_energy, avg_stress, avg_workload, avg_support, responses }
  const totalResponses = wellbeing.reduce((s, w) => s + (w.responses || 0), 0);
  const globalAvgStress = wellbeing.length > 0
    ? (wellbeing.reduce((s, w) => s + (w.avg_stress || 0), 0) / wellbeing.length).toFixed(1)
    : "—";
  const globalAvgSupport = wellbeing.length > 0
    ? (wellbeing.reduce((s, w) => s + (w.avg_support || 0), 0) / wellbeing.length).toFixed(1)
    : "—";
  const atRiskCount = wellbeing.filter(t => (t.avg_stress || 0) > 6 || (t.avg_support || 0) < 5).length;

  return (
    <div>
      <div style={{ ...card, background: "linear-gradient(135deg, #F0E8F5, #EDE4F0)", border: "1px solid #D9D0C7", padding: "18px 22px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>💜</div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#3D3248" }}>Educator Wellbeing Monitor</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#5C4E6A", lineHeight: 1.5 }}>
              Industry-first: anonymous staff wellbeing check-ins tracking energy, stress, workload and team support across all centres. Addresses the #1 sector challenge — educator retention and burnout (91% of centres report staffing shortages).
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Avg Stress Level" value={globalAvgStress} suffix="/10" color={parseFloat(globalAvgStress) > 6 ? "#C06B73" : "#6BA38B"} sub={parseFloat(globalAvgStress) > 6 ? "Above healthy range" : "Healthy range"} />
        <MetricCard label="Avg Team Support" value={globalAvgSupport} suffix="/10" color={parseFloat(globalAvgSupport) >= 7 ? "#6BA38B" : "#D4A26A"} />
        <MetricCard label="At-Risk Centres" value={atRiskCount} color={atRiskCount > 0 ? "#C06B73" : "#6BA38B"} sub="high stress or low support" />
        <MetricCard label="Check-In Responses" value={totalResponses} sub={`from ${wellbeing.length} centres`} color="#8B6DAF" />
      </div>

      {/* Per-centre wellbeing cards */}
      {wellbeing.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {wellbeing.map((t, i) => {
            const stress = t.avg_stress || 0;
            const riskLevel = stress > 7 ? "high" : stress > 5 ? "medium" : "low";
            const riskColor = riskLevel === "high" ? "#C06B73" : riskLevel === "medium" ? "#D4A26A" : "#6BA38B";
            return (
              <div key={i} style={{ ...card, padding: 16, marginBottom: 0, borderLeft: `3px solid ${riskColor}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#3D3248" }}>{t.tenant_name}</span>
                  <Badge text={`${riskLevel} risk`} color={riskColor} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                  {[
                    { label: "Energy", val: (t.avg_energy||0).toFixed(1), icon: "⚡", good: (t.avg_energy||0) >= 6 },
                    { label: "Stress", val: (t.avg_stress||0).toFixed(1), icon: "😰", good: (t.avg_stress||0) <= 5 },
                    { label: "Workload", val: (t.avg_workload||0).toFixed(1), icon: "📋", good: (t.avg_workload||0) <= 6 },
                    { label: "Support", val: (t.avg_support||0).toFixed(1), icon: "🤝", good: (t.avg_support||0) >= 7 },
                  ].map(m => (
                    <div key={m.label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 8, background: m.good ? "rgba(107,163,139,0.06)" : "rgba(192,107,115,0.06)" }}>
                      <span>{m.icon}</span>
                      <div>
                        <div style={{ fontSize: 10, color: "#8A7F96" }}>{m.label}</div>
                        <div style={{ fontWeight: 700, color: m.good ? "#6BA38B" : "#C06B73" }}>{m.val}/10</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 10, color: "#A89DB5" }}>{t.responses} check-in{t.responses !== 1 ? "s" : ""} (last 30 days)</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>💜</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#5C4E6A", marginBottom: 6 }}>No wellbeing check-ins yet</div>
          <div style={{ fontSize: 12, color: "#A89DB5" }}>Once educators begin submitting anonymous wellbeing surveys, cross-centre trends and risk indicators will appear here.</div>
        </div>
      )}
    </div>
  );
}

// ═══ AUDIT LOG TAB ══════════════════════════════════════════════════════════
function AuditTab({ entries }) {
  const actionColors = {
    login: "#6BA38B", logout: "#8A7F96", create: "#8B6DAF", update: "#D4A26A",
    delete: "#C06B73", provision: "#7B9DC8", suspend: "#C9828A", reactivate: "#6BA38B",
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#3D3248" }}>Platform Audit Log</h3>
        <span style={{ fontSize: 11, color: "#A89DB5" }}>Last 100 entries</span>
      </div>
      {entries.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#A89DB5" }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#5C4E6A" }}>No audit entries yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>All platform actions are logged here for compliance and governance.</div>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #E8E0D8" }}>
              {["Timestamp", "User", "Centre", "Action", "Details"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8A7F96", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.id || i} style={{ borderBottom: "1px solid #F0EBE6", transition: "background 0.15s" }}
                onMouseEnter={ev => ev.currentTarget.style.background = "#FDFBF9"}
                onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "10px", color: "#A89DB5", fontSize: 11, whiteSpace: "nowrap" }}>{e.created_at ? new Date(e.created_at).toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                <td style={{ padding: "10px", fontWeight: 600, color: "#3D3248" }}>{e.user_name || e.user_email || "System"}</td>
                <td style={{ padding: "10px", color: "#5C4E6A" }}>{e.tenant_name || "Platform"}</td>
                <td style={{ padding: "10px" }}><Badge text={e.action || "unknown"} color={actionColors[e.action] || "#8A7F96"} /></td>
                <td style={{ padding: "10px", color: "#5C4E6A", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.details || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ═══ PREDICTIVE OCCUPANCY AI TAB ═════════════════════════════════════════════
function PredictiveOccupancyTab({ data }) {
  if (!data) return <div style={{ ...card, textAlign: "center", padding: 40 }}><div style={{ fontSize: 36, animation: "softBounce 2s ease-in-out infinite" }}>🔮</div><div style={{ color: "#8A7F96", marginTop: 12 }}>Loading predictions...</div></div>;

  const { predictions, seasonal } = data;
  const declining = predictions.filter(p => p.risk === "declining");
  const atCapacity = predictions.filter(p => p.risk === "at_capacity");
  const totalProjectedRevenue3m = predictions.reduce((s, p) => s + (p.revenue_3m || 0), 0);
  const riskColors = { stable: "#8A7F96", declining: "#C06B73", recovering: "#D4A26A", at_capacity: "#7B9DC8", healthy: "#6BA38B" };

  return (
    <div>
      <div style={{ ...card, background: "linear-gradient(135deg, #EDE4F0, #E8F0ED)", padding: "18px 22px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>🔮</div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#3D3248" }}>Predictive Occupancy Intelligence</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#5C4E6A", lineHeight: 1.5 }}>AI-powered forecasting analyses enrolment trends, waitlist velocity, and seasonal patterns to project occupancy 3–6 months ahead. Proactive alerts flag centres at risk of declining enrolment.</p>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Declining Centres" value={declining.length} color={declining.length > 0 ? "#C06B73" : "#6BA38B"} sub="need intervention" />
        <MetricCard label="At Capacity" value={atCapacity.length} color="#7B9DC8" sub="waitlist management" />
        <MetricCard label="Projected Revenue (3mo)" value={Math.round(totalProjectedRevenue3m).toLocaleString()} prefix="$" color="#8B6DAF" />
        <MetricCard label="Centres Analysed" value={predictions.length} color="#6BA38B" />
      </div>

      {/* Per-centre predictions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12, marginBottom: 20 }}>
        {predictions.map(p => (
          <div key={p.id} style={{ ...card, padding: 16, marginBottom: 0, borderLeft: `3px solid ${riskColors[p.risk] || "#8A7F96"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#3D3248" }}>{p.name}</span>
              <Badge text={p.risk.replace("_", " ")} color={riskColors[p.risk]} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 11, marginBottom: 10 }}>
              <div style={{ textAlign: "center", padding: "8px 4px", background: "#F8F5F1", borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: "#8A7F96" }}>Now</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#3D3248" }}>{p.current_occupancy}%</div>
                <div style={{ fontSize: 10, color: "#A89DB5" }}>{p.current_enrolled}/{p.capacity}</div>
              </div>
              <div style={{ textAlign: "center", padding: "8px 4px", background: "rgba(139,109,175,0.06)", borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: "#8A7F96" }}>3 Months</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: p.occupancy_3m >= 85 ? "#6BA38B" : p.occupancy_3m >= 70 ? "#D4A26A" : "#C06B73" }}>{p.occupancy_3m}%</div>
                <div style={{ fontSize: 10, color: "#A89DB5" }}>{p.predict_3m} kids</div>
              </div>
              <div style={{ textAlign: "center", padding: "8px 4px", background: "rgba(139,109,175,0.06)", borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: "#8A7F96" }}>6 Months</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: p.occupancy_6m >= 85 ? "#6BA38B" : p.occupancy_6m >= 70 ? "#D4A26A" : "#C06B73" }}>{p.occupancy_6m}%</div>
                <div style={{ fontSize: 10, color: "#A89DB5" }}>{p.predict_6m} kids</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#5C4E6A" }}>
              <span>Growth: <strong style={{ color: p.monthly_growth >= 0 ? "#6BA38B" : "#C06B73" }}>{p.monthly_growth >= 0 ? "+" : ""}{p.monthly_growth}/mo</strong></span>
              <span>Waitlist: <strong>{p.waitlist}</strong></span>
              <span>Rev 3mo: <strong>${(p.revenue_3m || 0).toLocaleString()}</strong></span>
            </div>
          </div>
        ))}
      </div>

      {/* Seasonal patterns */}
      {seasonal?.length > 0 && (
        <div style={{ ...card, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>Seasonal Occupancy Patterns</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={seasonal}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE6" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#8A7F96" }} tickFormatter={m => ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)-1] || m} />
              <YAxis tick={{ fontSize: 10, fill: "#8A7F96" }} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E8E0D8", borderRadius: 10, fontSize: 12 }} />
              <Area type="monotone" dataKey="avg_occupancy" stroke="#8B6DAF" fill="rgba(139,109,175,0.15)" name="Avg Occupancy %" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ═══ NQS SELF-ASSESSMENT & QIP BUILDER TAB ══════════════════════════════════
function NqsQipTab({ data }) {
  if (!data) return <div style={{ ...card, textAlign: "center", padding: 40 }}><div style={{ fontSize: 36, animation: "softBounce 2s ease-in-out infinite" }}>⭐</div><div style={{ color: "#8A7F96", marginTop: 12 }}>Loading NQS data...</div></div>;

  const { summary, qaBreakdown, goals, assessments } = data;
  const QA_NAMES = { 1: "Educational Program & Practice", 2: "Children's Health & Safety", 3: "Physical Environment", 4: "Staffing Arrangements", 5: "Relationships with Children", 6: "Partnerships with Families & Communities", 7: "Governance & Leadership" };
  const ratingColors = { exceeding: "#6BA38B", meeting: "#8B6DAF", working_towards: "#D4A26A", significant_improvement: "#C06B73" };
  const ratingLabels = { exceeding: "Exceeding", meeting: "Meeting", working_towards: "Working Towards", significant_improvement: "Significant Improvement" };
  const statusColors = { not_started: "#8A7F96", in_progress: "#D4A26A", completed: "#6BA38B", on_hold: "#C9828A" };

  return (
    <div>
      <div style={{ ...card, background: "linear-gradient(135deg, #F0EBE6, #EDE4F0)", padding: "18px 22px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>⭐</div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#3D3248" }}>NQS Self-Assessment & Quality Improvement Plan</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#5C4E6A", lineHeight: 1.5 }}>Self-assessment against all 7 NQS Quality Areas with evidence mapping and integrated QIP goal tracking. Links directly to daily operations data — no competitor offers this level of integration.</p>
          </div>
        </div>
      </div>

      {/* Centre summaries */}
      {summary.map(s => {
        const total = s.total_elements || 1;
        const centreQA = qaBreakdown.filter(q => q.tenant_id === s.tenant_id);
        const centreGoals = goals.filter(g => g.tenant_id === s.tenant_id);

        return (
          <div key={s.tenant_id} style={{ ...card, padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#3D3248" }}>{s.tenant_name}</h3>
              <div style={{ display: "flex", gap: 6 }}>
                <Badge text={`${s.exceeding} Exceeding`} color="#6BA38B" />
                <Badge text={`${s.meeting} Meeting`} color="#8B6DAF" />
                <Badge text={`${s.working_towards} Working Towards`} color="#D4A26A" />
              </div>
            </div>

            {/* Rating progress bar */}
            <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginBottom: 16 }}>
              <div style={{ width: `${(s.exceeding/total)*100}%`, background: "#6BA38B", transition: "width 0.5s" }} />
              <div style={{ width: `${(s.meeting/total)*100}%`, background: "#8B6DAF", transition: "width 0.5s" }} />
              <div style={{ width: `${(s.working_towards/total)*100}%`, background: "#D4A26A", transition: "width 0.5s" }} />
              {s.sig_improvement > 0 && <div style={{ width: `${(s.sig_improvement/total)*100}%`, background: "#C06B73", transition: "width 0.5s" }} />}
            </div>

            {/* QA breakdown grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginBottom: 16 }}>
              {centreQA.map(qa => {
                const qaTotal = qa.elements || 1;
                const pctExceeding = Math.round((qa.exceeding / qaTotal) * 100);
                const pctMeeting = Math.round(((qa.exceeding + qa.meeting) / qaTotal) * 100);
                const overallColor = qa.working_towards > 0 ? "#D4A26A" : qa.exceeding > qa.meeting ? "#6BA38B" : "#8B6DAF";
                return (
                  <div key={qa.quality_area} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #E8E0D8", background: "#FDFBF9" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#8A7F96", textTransform: "uppercase", letterSpacing: "0.04em" }}>QA{qa.quality_area}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#3D3248", marginBottom: 6, lineHeight: 1.3 }}>{QA_NAMES[qa.quality_area]}</div>
                    <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
                      <div style={{ width: `${pctExceeding}%`, background: "#6BA38B" }} />
                      <div style={{ width: `${pctMeeting - pctExceeding}%`, background: "#8B6DAF" }} />
                      <div style={{ width: `${100 - pctMeeting}%`, background: "#D4A26A" }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#A89DB5" }}>{qa.exceeding}E · {qa.meeting}M · {qa.working_towards}W</div>
                  </div>
                );
              })}
            </div>

            {/* QIP Goals for this centre */}
            {centreGoals.length > 0 && (
              <div>
                <h4 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#5C4E6A", textTransform: "uppercase", letterSpacing: "0.06em" }}>Quality Improvement Goals ({centreGoals.length})</h4>
                <div style={{ display: "grid", gap: 8 }}>
                  {centreGoals.map(g => (
                    <div key={g.id} style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #E8E0D8", background: "#fff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Badge text={`QA${g.quality_area}`} color="#8B6DAF" />
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#3D3248" }}>{g.goal}</span>
                        </div>
                        <Badge text={g.status.replace("_", " ")} color={statusColors[g.status] || "#8A7F96"} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#F0EBE6", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 3, background: g.progress >= 75 ? "#6BA38B" : g.progress >= 40 ? "#D4A26A" : "#C9828A", width: `${g.progress}%`, transition: "width 0.5s" }} />
                        </div>
                        <span style={{ fontWeight: 700, color: "#3D3248", minWidth: 32 }}>{g.progress}%</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "#A89DB5" }}>
                        <span>Responsible: {g.responsible}</span>
                        <span>Timeline: {g.timeline}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {summary.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>⭐</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#5C4E6A" }}>No NQS assessments yet</div>
          <div style={{ fontSize: 12, color: "#A89DB5", marginTop: 4 }}>Centres can complete self-assessments against all 7 NQS Quality Areas once set up.</div>
        </div>
      )}
    </div>
  );
}

// ═══ PARENT SENTIMENT ANALYSIS TAB ══════════════════════════════════════════
function ParentSentimentTab({ data }) {
  if (!data) return <div style={{ ...card, textAlign: "center", padding: 40 }}><div style={{ fontSize: 36, animation: "softBounce 2s ease-in-out infinite" }}>💬</div><div style={{ color: "#8A7F96", marginTop: 12 }}>Loading sentiment data...</div></div>;

  const { overview, byCentre, byCategory, recent, atRisk } = data;
  const o = overview || {};
  const sentimentColor = (s) => s >= 0.6 ? "#6BA38B" : s >= 0.2 ? "#D4A26A" : "#C06B73";
  const typeColors = { compliment: "#6BA38B", suggestion: "#D4A26A", concern: "#C06B73", general: "#8A7F96" };
  const catLabels = { staff_quality: "Staff Quality", program: "Program/Curriculum", operations: "Operations", communication: "Communication", billing: "Billing/Fees" };

  return (
    <div>
      <div style={{ ...card, background: "linear-gradient(135deg, #EDE4F0, #E8EDF0)", padding: "18px 22px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>💬</div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#3D3248" }}>Parent Sentiment Analysis</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#5C4E6A", lineHeight: 1.5 }}>AI analyses parent feedback patterns to surface satisfaction trends before families leave. Categorises feedback by type, rates sentiment, and identifies at-risk centres needing attention.</p>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Total Feedback" value={o.total || 0} color="#8B6DAF" sub={`${o.unresponded || 0} unresponded`} />
        <MetricCard label="Avg Rating" value={o.avg_rating || "—"} suffix="/5" color={(o.avg_rating||0) >= 4 ? "#6BA38B" : "#D4A26A"} />
        <MetricCard label="Avg Sentiment" value={((o.avg_sentiment||0)*100).toFixed(0)} suffix="%" color={sentimentColor(o.avg_sentiment||0)} sub={o.avg_sentiment >= 0.6 ? "Positive" : o.avg_sentiment >= 0.2 ? "Mixed" : "Negative"} />
        <MetricCard label="Compliments" value={o.compliments || 0} color="#6BA38B" />
        <MetricCard label="Concerns" value={o.concerns || 0} color="#C06B73" sub={`${o.suggestions||0} suggestions`} />
        <MetricCard label="At-Risk Centres" value={atRisk?.length || 0} color={atRisk?.length > 0 ? "#C06B73" : "#6BA38B"} sub="low sentiment" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* By Centre */}
        <div style={card}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>Sentiment by Centre</h3>
          {byCentre?.map(c => (
            <div key={c.tenant_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #F0EBE6" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#3D3248" }}>{c.centre}</div>
                <div style={{ fontSize: 10, color: "#A89DB5" }}>{c.count} reviews · {c.concerns} concerns · {c.unresponded} pending</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: sentimentColor(c.avg_sentiment) }}>{c.avg_rating}★</div>
                <div style={{ fontSize: 10, color: sentimentColor(c.avg_sentiment) }}>{((c.avg_sentiment)*100).toFixed(0)}% positive</div>
              </div>
            </div>
          ))}
        </div>

        {/* By Category */}
        <div style={card}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>Feedback Categories</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byCategory} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10, fill: "#8A7F96" }} />
              <YAxis dataKey="category" type="category" tick={{ fontSize: 10, fill: "#8A7F96" }} width={100} tickFormatter={c => catLabels[c] || c} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E8E0D8", borderRadius: 10, fontSize: 12 }} />
              <Bar dataKey="count" fill="#8B6DAF" radius={[0, 4, 4, 0]} name="Feedback Count" />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 8 }}>
            {byCategory?.map(c => (
              <div key={c.category} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11, borderBottom: "1px solid #F0EBE6" }}>
                <span style={{ color: "#5C4E6A" }}>{catLabels[c.category] || c.category}</span>
                <span style={{ color: sentimentColor(c.avg_sentiment), fontWeight: 600 }}>{c.avg_rating}★ · {((c.avg_sentiment||0)*100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent feedback feed */}
      <div style={card}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>Recent Parent Feedback</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {recent?.slice(0, 12).map(f => (
            <div key={f.id} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #E8E0D8", background: f.responded ? "#fff" : "rgba(201,146,158,0.04)", borderLeft: `3px solid ${typeColors[f.feedback_type] || "#8A7F96"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#3D3248" }}>{f.parent_name}</span>
                  <Badge text={f.feedback_type} color={typeColors[f.feedback_type]} />
                  <span style={{ fontSize: 10, color: "#A89DB5" }}>{f.tenant_name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#D4A26A" }}>{"★".repeat(f.rating||0)}</span>
                  {!f.responded && <Badge text="needs reply" color="#C06B73" />}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#5C4E6A", lineHeight: 1.5 }}>{f.message}</div>
              <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 10, color: "#A89DB5" }}>
                <span>Sentiment: <strong style={{ color: sentimentColor(f.sentiment_score||0) }}>{((f.sentiment_score||0)*100).toFixed(0)}%</strong></span>
                <span>Category: {catLabels[f.category] || f.category}</span>
                <span>{f.created_at?.split("T")[0]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══ INCIDENT TREND ANALYSIS TAB ════════════════════════════════════════════
function IncidentTrendsTab({ data }) {
  if (!data) return <div style={{ ...card, textAlign: "center", padding: 40 }}><div style={{ fontSize: 36, animation: "softBounce 2s ease-in-out infinite" }}>📉</div><div style={{ color: "#8A7F96", marginTop: 12 }}>Analysing incident patterns...</div></div>;

  const { byType, byLocation, byCentre, monthly, byHour, hotspots } = data;
  const sevColors = { minor: "#D4A26A", moderate: "#C9828A", major: "#C06B73", critical: "#B45960" };
  const totalIncidents = byCentre?.reduce((s, c) => s + c.count, 0) || 0;
  const totalSerious = byCentre?.reduce((s, c) => s + (c.moderate || 0) + (c.serious || 0), 0) || 0;

  return (
    <div>
      <div style={{ ...card, background: "linear-gradient(135deg, #F0E8E8, #EDE4F0)", padding: "18px 22px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>📉</div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#3D3248" }}>Incident Trend Analysis</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#5C4E6A", lineHeight: 1.5 }}>AI identifies patterns in incidents across centres — by location, time of day, type, and severity. Highlights safety hotspots and enables proactive risk management improvements.</p>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Total Incidents" value={totalIncidents} color="#8B6DAF" />
        <MetricCard label="Moderate+" value={totalSerious} color={totalSerious > 5 ? "#C06B73" : "#D4A26A"} sub="need review" />
        <MetricCard label="Hotspot Locations" value={hotspots?.length || 0} color="#C9828A" sub="repeat locations" />
        <MetricCard label="Months Tracked" value={monthly?.length || 0} color="#6BA38B" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Monthly trend chart */}
        <div style={card}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>Monthly Incident Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE6" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#8A7F96" }} tickFormatter={m => m?.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: "#8A7F96" }} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E8E0D8", borderRadius: 10, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="minor" stackId="a" fill="#D4A26A" name="Minor" />
              <Bar dataKey="moderate" stackId="a" fill="#C9828A" name="Moderate" />
              <Bar dataKey="serious" stackId="a" fill="#C06B73" name="Serious" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Time-of-day pattern */}
        <div style={card}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>Time-of-Day Pattern</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={byHour}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE6" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#8A7F96" }} tickFormatter={h => `${h}:00`} />
              <YAxis tick={{ fontSize: 10, fill: "#8A7F96" }} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E8E0D8", borderRadius: 10, fontSize: 12 }} labelFormatter={h => `${h}:00–${h}:59`} />
              <Area type="monotone" dataKey="count" stroke="#C9828A" fill="rgba(201,130,138,0.2)" name="Incidents" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {/* By centre */}
        <div style={card}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>By Centre</h3>
          {byCentre?.map(c => (
            <div key={c.centre} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F0EBE6" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#3D3248" }}>{c.centre}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <Badge text={`${c.minor}m`} color="#D4A26A" />
                {c.moderate > 0 && <Badge text={`${c.moderate}mod`} color="#C9828A" />}
                {c.serious > 0 && <Badge text={`${c.serious}srs`} color="#C06B73" />}
              </div>
            </div>
          ))}
        </div>

        {/* Hotspot locations */}
        <div style={card}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>⚠️ Location Hotspots</h3>
          <p style={{ fontSize: 11, color: "#8A7F96", margin: "0 0 10px" }}>Locations with repeat incidents</p>
          {hotspots?.map(h => (
            <div key={h.location} style={{ padding: "8px 10px", borderRadius: 8, background: h.count >= 4 ? "rgba(192,107,115,0.06)" : "rgba(212,162,106,0.06)", marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#3D3248" }}>{h.location}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: h.count >= 4 ? "#C06B73" : "#D4A26A" }}>{h.count}×</span>
              </div>
              <div style={{ fontSize: 10, color: "#A89DB5", marginTop: 2 }}>Types: {h.types}</div>
            </div>
          ))}
          {(!hotspots || hotspots.length === 0) && <div style={{ textAlign: "center", padding: 20, color: "#A89DB5", fontSize: 12 }}>No repeat locations found ✨</div>}
        </div>

        {/* By type */}
        <div style={card}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#3D3248" }}>By Type & Severity</h3>
          {byType?.map((t, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #F0EBE6" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Badge text={t.type} color="#8A7F96" />
                <Badge text={t.severity} color={sevColors[t.severity] || "#8A7F96"} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#3D3248" }}>{t.count}</span>
                {t.first_aid_count > 0 && <span style={{ fontSize: 10, color: "#C06B73" }}>🩹 {t.first_aid_count}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══ CCS SUBMISSIONS TAB ════════════════════════════════════════════════════
function CcsSubmissionsTab({ data, onRefresh }) {
  if (!data) return <div style={{ ...card, textAlign: "center", padding: 40 }}><div style={{ fontSize: 36, animation: "softBounce 2s ease-in-out infinite" }}>🏛️</div><div style={{ color: "#8A7F96", marginTop: 12 }}>Loading CCS data...</div></div>;

  const { overview, byCentre, weekly } = data;
  const o = overview || {};
  const fmtDollars = (cents) => `$${((cents||0)/100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  const statusColors = { draft: "#8A7F96", submitted: "#D4A26A", approved: "#6BA38B", rejected: "#C06B73" };

  const submitReport = async (id) => {
    await API(`/api/platform/ccs/submit/${id}`, { method: "POST" });
    onRefresh();
  };
  const submitAll = async () => {
    const draftIds = weekly?.filter(r => r.status === "draft").map(r => r.id) || [];
    if (draftIds.length === 0) return;
    await API("/api/platform/ccs/submit-batch", { method: "POST", body: { ids: draftIds } });
    onRefresh();
  };

  return (
    <div>
      <div style={{ ...card, background: "linear-gradient(135deg, #E8EDF0, #EDE4F0)", padding: "18px 22px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>🏛️</div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#3D3248" }}>CCS Session Report Management</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#5C4E6A", lineHeight: 1.5 }}>Manage Child Care Subsidy session reports across all centres. Track submissions, CCS amounts, gap fees, and absence counts. Submit directly to Services Australia CCSS.</p>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Total Session Reports" value={o.total_reports || 0} color="#8B6DAF" />
        <MetricCard label="Approved" value={o.approved || 0} color="#6BA38B" sub={`${o.pending||0} pending`} />
        <MetricCard label="Total Fees Charged" value={fmtDollars(o.total_fees)} color="#3D3248" />
        <MetricCard label="CCS Subsidies" value={fmtDollars(o.total_ccs)} color="#6BA38B" sub={`${((o.total_ccs/(o.total_fees||1))*100).toFixed(0)}% of fees`} />
        <MetricCard label="Gap Fees (Families)" value={fmtDollars(o.total_gap)} color="#D4A26A" />
        <MetricCard label="Total Hours" value={o.total_hours || 0} color="#8A7F96" sub={`${o.total_absences||0} absent days`} />
      </div>

      {/* Per centre breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12, marginBottom: 20 }}>
        {byCentre?.map(c => (
          <div key={c.tenant_id} style={{ ...card, padding: 16, marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#3D3248" }}>{c.centre}</span>
              <Badge text={`${c.reports} reports`} color="#8A7F96" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11 }}>
              <div><span style={{ color: "#8A7F96" }}>Fees:</span> <strong style={{ color: "#3D3248" }}>{fmtDollars(c.total_fees)}</strong></div>
              <div><span style={{ color: "#8A7F96" }}>CCS:</span> <strong style={{ color: "#6BA38B" }}>{fmtDollars(c.total_ccs)}</strong></div>
              <div><span style={{ color: "#8A7F96" }}>Gap:</span> <strong style={{ color: "#D4A26A" }}>{fmtDollars(c.total_gap)}</strong></div>
              <div><span style={{ color: "#8A7F96" }}>Avg CCS%:</span> <strong style={{ color: "#8B6DAF" }}>{c.avg_ccs_pct}%</strong></div>
              <div><span style={{ color: "#8A7F96" }}>Hours:</span> <strong>{c.total_hours}</strong></div>
              <div><span style={{ color: "#8A7F96" }}>Status:</span> <strong style={{ color: "#6BA38B" }}>{c.approved} ✓</strong> <strong style={{ color: "#D4A26A" }}>{c.pending} ⏳</strong></div>
            </div>
          </div>
        ))}
      </div>

      {/* Session reports table */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#3D3248" }}>Session Reports</h3>
          {weekly?.some(r => r.status === "draft") && (
            <button onClick={submitAll} style={btnPrimary}>Submit All Drafts to CCSS</button>
          )}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #E8E0D8" }}>
              {["Centre", "Child", "Week", "Hours", "Fee", "CCS%", "CCS Amt", "Gap Fee", "Absences", "Status", ""].map(h => (
                <th key={h} style={{ padding: "8px 6px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8A7F96", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weekly?.map(r => (
              <tr key={r.id} style={{ borderBottom: "1px solid #F0EBE6", transition: "background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#FDFBF9"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "8px 6px", fontWeight: 600, color: "#3D3248" }}>{r.tenant_name}</td>
                <td style={{ padding: "8px 6px", color: "#5C4E6A" }}>{r.child_name || "—"}</td>
                <td style={{ padding: "8px 6px", color: "#A89DB5" }}>{r.week_starting}</td>
                <td style={{ padding: "8px 6px" }}>{r.hours_submitted}h</td>
                <td style={{ padding: "8px 6px" }}>{fmtDollars(r.fee_charged_cents)}</td>
                <td style={{ padding: "8px 6px", fontWeight: 600, color: "#8B6DAF" }}>{r.ccs_percentage}%</td>
                <td style={{ padding: "8px 6px", color: "#6BA38B", fontWeight: 600 }}>{fmtDollars(r.ccs_amount_cents)}</td>
                <td style={{ padding: "8px 6px", color: "#D4A26A" }}>{fmtDollars(r.gap_fee_cents)}</td>
                <td style={{ padding: "8px 6px" }}>{r.absent_days || 0}</td>
                <td style={{ padding: "8px 6px" }}><Badge text={r.status} color={statusColors[r.status] || "#8A7F96"} /></td>
                <td style={{ padding: "8px 6px" }}>
                  {r.status === "draft" && (
                    <button onClick={() => submitReport(r.id)} style={{ ...btnSecondary, fontSize: 10, padding: "4px 10px" }}>Submit</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══ COMPETITIVE INTELLIGENCE TAB ════════════════════════════════════════════
function CompetitiveTab() {
  const competitors = [
    { name: "Xplor Education", share: "8,700+ centres (AU/NZ)", price: "$$$ (Office + Playground add-on)", strengths: ["Largest AU market share", "CCS automated submissions", "30+ built-in reports", "SSO for multi-site operators", "AWS AU-hosted & PCI DSS L1", "Catholic Early EdCare saves 40hrs/mo"], weaknesses: ["Expensive (parent app is separate add-on)", "Poor offboarding experience", "Bugs/glitches reported frequently", "Limited parent booking control", "Complex UI for non-technical staff"], nps: "4.1/5" },
    { name: "OWNA", share: "3,000+ centres", price: "$$ ($79–$349/mo inc GST)", strengths: ["True all-in-one (no add-ons)", "Excellent customer service (instant phone)", "Free tier + no lock-in contracts", "HR & Payroll built-in with SEEK integration", "AI ratio prediction & rostering", "No setup costs, fast 5-day onboarding"], weaknesses: ["CCS module stability concerns", "Parent invoicing confusing (reported)", "Reports require Excel export for formatting", "Half-day absences don't show in overview", "QIP feature underdeveloped"], nps: "4.7/5" },
    { name: "Storypark", share: "6,700+ AU services", price: "$$", strengths: ["Best-in-class learning portfolios", "Beautiful family engagement & photo sharing", "Strong EYLF/NQS curriculum templates", "Educator collaboration tools", "Printed album feature from app"], weaknesses: ["Weaker billing/CCS integration", "Not a full CCMS replacement", "App glitches lose educator work", "Parents find navigation confusing", "Limited admin automation"], nps: "4.5/5" },
    { name: "Kidsoft", share: "Established AU (merging with OWNA)", price: "$$", strengths: ["Strong CCS billing engine", "Victorian govt preferred provider", "Long track record in AU market"], weaknesses: ["Primarily billing-focused only", "Minimal learning/engagement features", "Being absorbed into OWNA platform", "Limited future as standalone product"], nps: "4.2/5" },
    { name: "brightwheel", share: "US-dominant, growing internationally", price: "$$", strengths: ["Beautiful modern UX/UI", "Strong photo sharing & daily reports", "Simple QR check-in/out kiosks", "Learning assessments built-in", "Good billing automation"], weaknesses: ["US-centric (CCS not native)", "No NQS/NQF mapping", "Limited AU regulatory compliance", "No educator wellbeing features"], nps: "4.6/5" },
    { name: "Child Care Central", share: "AU (Brisbane-based)", price: "$$", strengths: ["Strong CCS foundation (Harmony Web)", "Australian-owned with local support", "Sub-20 second phone wait times", "Single login for all features"], weaknesses: ["Older UI/UX design", "Smaller feature set than OWNA/Xplor", "Less learning documentation", "Limited multi-site management"], nps: "4.0/5" },
  ];

  const uniqueFeatures = [
    { feature: "AI-Powered EYLF Observations", desc: "Claude AI generates learning observations mapped to EYLF V2.0 outcomes and MTOP V2.0 — no competitor offers real AI-generated pedagogical documentation. Educators save 30+ minutes per child per week.", status: "built", impact: "high" },
    { feature: "Real-Time NQF Ratio Engine", desc: "Live ratio compliance with instant alerts when staff:child ratios breach NQF Regulation 123 thresholds. Competitors only show static reports.", status: "built", impact: "high" },
    { feature: "AI Document Analysis", desc: "Upload immunisation records, medical plans, court orders — AI extracts and validates data, flags expiring documents, auto-populates compliance checklists.", status: "built", impact: "high" },
    { feature: "Multi-Tenant Owner Dashboard", desc: "Real-time cross-centre KPIs, revenue analytics, compliance comparison — deeper analytics than OWNA HQ with AI-powered insights and trend detection.", status: "built", impact: "high" },
    { feature: "Educator Wellbeing Monitor", desc: "Anonymous staff wellness tracking across energy, stress, workload, satisfaction. Industry-first — directly addresses the #1 sector challenge: 91% of centres report staffing shortages from burnout.", status: "built", impact: "high" },
    { feature: "Occupancy & Revenue Forecasting", desc: "Cross-centre occupancy tracking with waitlist analytics and revenue-at-risk calculations for unfilled spots. Helps owners optimise staffing and marketing spend.", status: "built", impact: "high" },
    { feature: "Predictive Occupancy AI", desc: "AI analyses enrolment patterns, waitlist velocity, and seasonal trends to project occupancy 3–6 months ahead. Risk-flags declining centres, projects revenue impact, and shows seasonal demand patterns. Owner Portal → Predictive AI tab.", status: "built", impact: "high" },
    { feature: "NQS Self-Assessment & QIP Builder", desc: "Self-assessment against all 7 NQS Quality Areas with evidence mapping, per-element ratings, and integrated QIP goal tracking with progress bars and responsible parties. Links directly to daily operations data. Owner Portal → NQS & QIP tab.", status: "built", impact: "high" },
    { feature: "Parent Sentiment Analysis", desc: "AI-powered feedback categorisation (compliment/concern/suggestion) with sentiment scoring, star ratings, category breakdown (staff quality, operations, communication, billing), and at-risk centre detection. Owner Portal → Parent Sentiment tab.", status: "built", impact: "high" },
    { feature: "Incident Trend Analysis", desc: "Cross-centre incident pattern recognition: monthly trends, time-of-day heat mapping, location hotspot detection, type/severity breakdown, and first-aid tracking. Identifies safety improvement opportunities proactively. Owner Portal → Incident Trends tab.", status: "built", impact: "high" },
    { feature: "Integrated CCS Submissions", desc: "CCS session report management across all centres: track hours, fees, CCS percentages, gap fees, and absence counts. Single-click and batch submission to Services Australia CCSS with status tracking. Owner Portal → CCS Submissions tab.", status: "built", impact: "high" },
  ];

  const statusColors = { built: "#6BA38B", planned: "#D4A26A", concept: "#8A7F96" };
  const impactColors = { high: "#C06B73", medium: "#D4A26A", low: "#8A7F96" };

  return (
    <div>
      {/* Market Overview */}
      <div style={{ ...card, padding: "20px 24px" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800, color: "#3D3248" }}>Australian Childcare Software Market</h3>
        <p style={{ fontSize: 13, color: "#5C4E6A", lineHeight: 1.6, margin: "0 0 16px" }}>
          The AU childcare management software market is led by Xplor Education (8,700+ centres) and OWNA (3,000+ centres), with Storypark (6,700+ services) strong in learning documentation. Key purchasing drivers: CCS integration reliability, ease of use for non-technical educators, all-in-one pricing (vs module add-ons), and customer support quality. Common pain points across all platforms: complex parent billing, notification reliability issues, poor offline functionality, and lack of AI-powered features. Childcare360 differentiates through AI-first pedagogy tools, real-time compliance engines, educator wellbeing monitoring, and transparent no-lock-in pricing from $79/mo.
        </p>
      </div>

      {/* Competitor Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12, marginBottom: 20 }}>
        {competitors.map(c => (
          <div key={c.name} style={{ ...card, marginBottom: 0, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#3D3248" }}>{c.name}</h4>
                <div style={{ fontSize: 11, color: "#8A7F96" }}>{c.share} · {c.price}</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#8B6DAF" }}>{c.nps}</div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6BA38B", marginBottom: 4 }}>STRENGTHS</div>
              {c.strengths.map((s, i) => <div key={i} style={{ fontSize: 11, color: "#5C4E6A", marginBottom: 2 }}>✓ {s}</div>)}
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#C06B73", marginBottom: 4 }}>WEAKNESSES</div>
              {c.weaknesses.map((w, i) => <div key={i} style={{ fontSize: 11, color: "#8A7F96", marginBottom: 2 }}>✗ {w}</div>)}
            </div>
          </div>
        ))}
      </div>

      {/* Unique Differentiators */}
      <div style={card}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: "#3D3248" }}>🎯 Childcare360 Unique Differentiators</h3>
        <p style={{ fontSize: 12, color: "#8A7F96", marginBottom: 16 }}>Features that set Childcare360 apart from every competitor in the Australian market.</p>
        <div style={{ display: "grid", gap: 10 }}>
          {uniqueFeatures.map((f, i) => (
            <div key={i} style={{ padding: "14px 18px", borderRadius: 12, border: "1px solid #E8E0D8", background: f.status === "built" ? "rgba(107,163,139,0.04)" : "#FDFBF9", display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: (statusColors[f.status] || "#8A7F96") + "14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                {f.status === "built" ? "✓" : "◎"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#3D3248" }}>{f.feature}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Badge text={f.status} color={statusColors[f.status]} />
                    <Badge text={`${f.impact} impact`} color={impactColors[f.impact]} />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#5C4E6A", lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══ PROVISION MODAL ════════════════════════════════════════════════════════
function ProvisionModal({ onClose, onDone }) {
  const [form, setForm] = useState({ name: "", email: "", abn: "", address: "", phone: "", service_type: "long_day_care", plan: "trial", admin_name: "", admin_email: "", admin_password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const u = (k, v) => setForm({ ...form, [k]: v });

  const save = async () => {
    if (!form.name || !form.email) return setError("Centre name and email are required");
    setSaving(true);
    setError(null);
    try {
      const res = await API("/api/platform/tenants", { method: "POST", body: form });
      if (res.error) throw new Error(res.error);
      onDone();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(60,45,70,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)", animation: "fadeIn 0.2s ease-out" }}>
      <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E8E0D8", width: 560, maxHeight: "90vh", overflowY: "auto", padding: 28, boxShadow: "0 20px 60px rgba(80,60,90,0.12)", animation: "scaleIn 0.3s ease-out" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#3D3248" }}>Provision New Centre</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#A89DB5" }}>✕</button>
        </div>

        {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(201,130,138,0.08)", border: "1px solid rgba(201,130,138,0.15)", color: "#C06B73", fontSize: 12, marginBottom: 16 }}>{error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Centre Name *</label>
            <input style={inputStyle} value={form.name} onChange={e => u("name", e.target.value)} placeholder="e.g. Sunshine Early Learning Centre" />
          </div>
          <div>
            <label style={labelStyle}>Centre Email *</label>
            <input style={inputStyle} value={form.email} onChange={e => u("email", e.target.value)} placeholder="admin@centre.com.au" />
          </div>
          <div>
            <label style={labelStyle}>ABN</label>
            <input style={inputStyle} value={form.abn} onChange={e => u("abn", e.target.value)} placeholder="12 345 678 901" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Address</label>
            <input style={inputStyle} value={form.address} onChange={e => u("address", e.target.value)} placeholder="42 Ocean St, Cronulla NSW 2230" />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input style={inputStyle} value={form.phone} onChange={e => u("phone", e.target.value)} placeholder="02 9544 1234" />
          </div>
          <div>
            <label style={labelStyle}>Service Type</label>
            <select style={inputStyle} value={form.service_type} onChange={e => u("service_type", e.target.value)}>
              <option value="long_day_care">Long Day Care</option>
              <option value="preschool">Preschool / Kindergarten</option>
              <option value="family_day_care">Family Day Care</option>
              <option value="oshc">OSHC (Before/After School)</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Subscription Plan</label>
            <select style={inputStyle} value={form.plan} onChange={e => u("plan", e.target.value)}>
              <option value="trial">Trial (30 days free)</option>
              <option value="starter">Starter ($79/mo — 30 kids)</option>
              <option value="professional">Professional ($149/mo — 60 kids)</option>
              <option value="enterprise">Enterprise ($299/mo — 120 kids)</option>
            </select>
          </div>

          <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #E8E0D8", paddingTop: 14, marginTop: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#5C4E6A", marginBottom: 10 }}>Centre Admin Account</div>
          </div>
          <div>
            <label style={labelStyle}>Admin Name</label>
            <input style={inputStyle} value={form.admin_name} onChange={e => u("admin_name", e.target.value)} placeholder="Jane Smith" />
          </div>
          <div>
            <label style={labelStyle}>Admin Email</label>
            <input style={inputStyle} value={form.admin_email} onChange={e => u("admin_email", e.target.value)} placeholder="jane@centre.com.au" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Temporary Password</label>
            <input style={inputStyle} value={form.admin_password} onChange={e => u("admin_password", e.target.value)} placeholder="Welcome2Childcare360!" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Provisioning..." : "Provision Centre"}
          </button>
        </div>
      </div>
    </div>
  );
}
