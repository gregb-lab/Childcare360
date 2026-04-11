import { useState, useEffect, useCallback } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}) },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};

const P = "#7C3AED", PL = "#EDE4F0", DARK = "#3D3248", MUTED = "#8A7F96";
const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: "20px 24px" };
const btnP = { padding: "8px 16px", borderRadius: 9, border: "none", background: P, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 };
const btnS = { padding: "8px 16px", borderRadius: 9, border: `1px solid #DDD`, background: "#fff", color: DARK, fontWeight: 600, cursor: "pointer", fontSize: 13 };

const ENTITY_ICONS = { educator: "👤", child: "🧒", room: "🏠", roster: "📅", invoice: "💰", enrolment: "📋", incident: "⚠️", compliance: "✅", learning: "📚", document: "📄", excursion: "🚌", medication: "💊", setting: "⚙️", user: "🔐" };
const ACTION_COLORS = { created: "#16A34A", updated: "#2563EB", deleted: "#DC2626", approved: "#7C3AED", rejected: "#D97706", login: "#0891B2", published: "#7C3AED" };

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ActivityLogModule() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [educators, setEducators] = useState([]);
  const [children, setChildren] = useState([]);
  const PAGE_SIZE = 40;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      if (search) params.set("q", search);
      if (entityFilter !== "all") params.set("entity_type", entityFilter);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const res = await API(`/api/v2/activity-log?${params}`);
      setLogs(res.logs || res.data || []);
      setTotal(res.total || 0);
    } catch (e) { /* silent */ }
    finally { setLoading(false); }
  }, [page, search, entityFilter, dateFrom, dateTo]);

  useEffect(() => {
    API("/api/educators/simple").then(r => setEducators(r.educators || r.data || [])).catch(() => {});
    API("/api/children/simple").then(r => setChildren(r.children || r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { setPage(0); }, [search, entityFilter, dateFrom, dateTo]);
  useEffect(() => { load(); }, [load]);

  const resolveEntityName = (type, id) => {
    if (type === "educator") { const e = educators.find(x => x.id === id); return e ? `${e.first_name} ${e.last_name}` : id?.slice(0, 8); }
    if (type === "child") { const c = children.find(x => x.id === id); return c ? `${c.first_name} ${c.last_name}` : id?.slice(0, 8); }
    return id?.slice(0, 12);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ padding: "24px 28px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 26 }}>📋</span>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: DARK }}>Activity Log</h1>
          {total > 0 && <span style={{ background: PL, color: P, borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{total.toLocaleString()} entries</span>}
        </div>
        <p style={{ margin: "4px 0 0 38px", color: MUTED, fontSize: 14 }}>Full audit trail of all actions across educators, children, rostering and more</p>
      </div>

      {/* Filters */}
      <div style={{ ...card, marginBottom: 16, padding: "14px 20px" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search actions…"
            style={{ flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 8, border: "1px solid #DDD", fontSize: 14 }} />
          <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #DDD", fontSize: 13, color: DARK }}>
            <option value="all">All Types</option>
            {Object.keys(ENTITY_ICONS).map(k => <option key={k} value={k}>{ENTITY_ICONS[k]} {k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            title="From date" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD", fontSize: 13 }} />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            title="To date" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD", fontSize: 13 }} />
          {(search || entityFilter !== "all" || dateFrom || dateTo) && (
            <button style={btnS} onClick={() => { setSearch(""); setEntityFilter("all"); setDateFrom(""); setDateTo(""); }}>Clear</button>
          )}
        </div>
      </div>

      {/* Log entries */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: MUTED }}>Loading…</div>
      ) : logs.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 40, color: MUTED }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <div style={{ fontWeight: 600 }}>No activity found matching your filters</div>
        </div>
      ) : (
        <>
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9F8FF", borderBottom: "1px solid #EDE8F4" }}>
                  {["When", "Type", "Entity", "Action", "Detail", "By"].map(h => (
                    <th key={h} style={{ padding: "10px 16px", fontSize: 12, fontWeight: 700, color: MUTED, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const icon = ENTITY_ICONS[log.entity_type] || "📝";
                  const actionWord = (log.action || "").split("_")[0];
                  const actionColor = ACTION_COLORS[actionWord] || MUTED;
                  return (
                    <tr key={log.id || i} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                      <td style={{ padding: "10px 16px", fontSize: 12, color: MUTED, whiteSpace: "nowrap" }} title={log.performed_at}>{fmtTime(log.performed_at)}</td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ fontSize: 14 }}>{icon}</span>{" "}
                        <span style={{ fontSize: 12, color: MUTED }}>{log.entity_type}</span>
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: 13, color: DARK, maxWidth: 160 }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {resolveEntityName(log.entity_type, log.entity_id)}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ background: actionColor + "1A", color: actionColor, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, whiteSpace: "nowrap" }}>
                          {(log.action || "").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: 12, color: MUTED, maxWidth: 240 }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.detail}>{log.detail || "—"}</span>
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>
                        {log.performed_by_name || log.performed_by?.slice(0, 8) || "System"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
              <span style={{ fontSize: 13, color: MUTED }}>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...btnS, opacity: page === 0 ? 0.4 : 1 }} disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
                <span style={{ padding: "8px 12px", fontSize: 13, color: MUTED }}>Page {page + 1} / {totalPages}</span>
                <button style={{ ...btnS, opacity: page >= totalPages - 1 ? 0.4 : 1 }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
