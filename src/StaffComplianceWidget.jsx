/**
 * StaffComplianceWidget.jsx
 * Embed in StaffPortalModule.jsx — shows compliance alerts, resource links,
 * and NECWR status for the logged-in educator.
 *
 * Usage:
 *   import StaffComplianceWidget from './StaffComplianceWidget.jsx';
 *   <StaffComplianceWidget educatorId={currentEducatorId} />
 */
import { useState, useEffect } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}) },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};

const P = "#7C3AED", PL = "#EDE4F0", DARK = "#3D3248", MUTED = "#8A7F96";
const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: "20px 24px" };

const SEVERITY_CONFIG = {
  urgent: { color: "#DC2626", bg: "#FEF2F2", border: "#FCA5A5", icon: "🚨" },
  warning: { color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", icon: "⚠️" },
  info: { color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE", icon: "ℹ️" },
};

export default function StaffComplianceWidget({ educatorId }) {
  const [alerts, setAlerts] = useState([]);
  const [resources, setResources] = useState([]);
  const [necwr, setNecwr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState("alerts");

  useEffect(() => {
    if (!educatorId) return;
    setLoading(true);
    Promise.all([
      API(`/api/v2/compliance/educator-alerts/${educatorId}`).catch(() => ({ alerts: [] })),
      API("/api/v2/compliance/resource-links").catch(() => ({ links: [] })),
      API(`/api/educators/${educatorId}`).catch(() => null),
    ]).then(([alertRes, linkRes, eduRes]) => {
      setAlerts(alertRes.alerts || alertRes.data || []);
      setResources(linkRes.links || linkRes.data || []);
      if (eduRes) {
        const edu = eduRes.educator || eduRes.data || eduRes;
        setNecwr({ status: edu.necwr_status, number: edu.necwr_number, submitted_at: edu.necwr_submitted_at });
      }
    }).finally(() => setLoading(false));
  }, [educatorId]);

  const urgentCount = alerts.filter(a => a.severity === "urgent").length;
  const tabs = [
    { key: "alerts", label: "Alerts", badge: urgentCount },
    { key: "resources", label: "Resources" },
    { key: "necwr", label: "NECWR" },
  ];

  return (
    <div style={{ ...card, marginTop: 20 }}>
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: DARK }}>🛡️ Compliance Centre</h3>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: "1px solid #EDE8F4", paddingBottom: 8 }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveSection(tab.key)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer",
              background: activeSection === tab.key ? PL : "transparent",
              color: activeSection === tab.key ? P : MUTED, position: "relative" }}>
            {tab.label}
            {tab.badge > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "#DC2626", color: "#fff", borderRadius: "50%", width: 16, height: 16, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{tab.badge}</span>}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: MUTED, fontSize: 13 }}>Loading…</div>}

      {/* Alerts */}
      {!loading && activeSection === "alerts" && (
        alerts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "16px 0", color: MUTED }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>All compliance checks clear</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>No action required from you right now.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {alerts.map((a, i) => {
              const sev = SEVERITY_CONFIG[a.severity] || SEVERITY_CONFIG.info;
              return (
                <div key={i} style={{ padding: "12px 14px", borderRadius: 10, background: sev.bg, border: `1px solid ${sev.border}` }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{sev.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: DARK }}>{a.title || a.type?.replace(/_/g, " ")}</div>
                      <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{a.message || a.detail}</div>
                      {a.due_date && <div style={{ fontSize: 12, marginTop: 4, color: sev.color, fontWeight: 600 }}>Action required by: {a.due_date}</div>}
                      {a.action_url && (
                        <a href={a.action_url} target="_blank" rel="noreferrer"
                          style={{ display: "inline-block", marginTop: 8, fontSize: 12, color: P, fontWeight: 600, textDecoration: "none" }}>
                          Take action →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Resource Links */}
      {!loading && activeSection === "resources" && (
        resources.length === 0 ? (
          <div style={{ textAlign: "center", padding: "16px 0", color: MUTED, fontSize: 13 }}>No resources configured by management yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {resources.map((r, i) => (
              <a key={i} href={r.url} target="_blank" rel="noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: "#F9F8FF", border: "1px solid #EDE8F4", textDecoration: "none" }}>
                <span style={{ fontSize: 22 }}>{r.icon || "📄"}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: DARK }}>{r.title}</div>
                  {r.description && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{r.description}</div>}
                </div>
                <span style={{ marginLeft: "auto", color: P, fontSize: 16 }}>→</span>
              </a>
            ))}
          </div>
        )
      )}

      {/* NECWR Status */}
      {!loading && activeSection === "necwr" && (
        <div>
          {necwr ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ padding: "14px 16px", borderRadius: 10, background: necwr.status === "current" ? "#F0FDF4" : necwr.status === "pending" ? "#FFFBEB" : "#FEF2F2", border: `1px solid ${necwr.status === "current" ? "#86EFAC" : necwr.status === "pending" ? "#FDE68A" : "#FCA5A5"}` }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: DARK }}>
                  {necwr.status === "current" ? "✅ Registration Current" : necwr.status === "pending" ? "⏳ Submission Pending" : "⚠️ Registration Required"}
                </div>
                {necwr.number && <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>NECWR Number: {necwr.number}</div>}
                {necwr.submitted_at && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Submitted: {necwr.submitted_at?.slice(0, 10)}</div>}
              </div>
              <div style={{ fontSize: 13, color: MUTED, padding: "0 4px" }}>
                The National Education and Care Workforce Register (NECWR) tracks your qualifications and employment history. Contact your director if your status needs updating.
              </div>
              <a href="https://www.acecqa.gov.au/necwr" target="_blank" rel="noreferrer"
                style={{ padding: "9px 16px", borderRadius: 9, border: `1px solid ${P}`, color: P, fontWeight: 600, fontSize: 13, textDecoration: "none", textAlign: "center" }}>
                Visit ACECQA NECWR Portal →
              </a>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: MUTED, textAlign: "center", padding: "16px 0" }}>NECWR data not available. Contact your director.</div>
          )}
        </div>
      )}
    </div>
  );
}
