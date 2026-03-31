/**
 * DashboardWidgets.jsx
 * Drop-in dashboard widgets for App.jsx DashboardView.
 * Usage in App.jsx DashboardView:
 *   import { NECWRWidget, AttendancePatternsWidget, ComplianceTodoWidget } from './DashboardWidgets.jsx';
 *   // Then render <NECWRWidget /> <AttendancePatternsWidget /> <ComplianceTodoWidget /> in the dashboard grid
 */
import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}) },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};

const P = "#7C3AED", PL = "#EDE4F0", DARK = "#3D3248", MUTED = "#8A7F96";
const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: "20px 24px" };

// ─── NECWR Nagger Widget ──────────────────────────────────────────────────────
export function NECWRWidget({ onNavigate }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API("/api/operations/necwr-alerts")
      .then(r => setAlerts(r.alerts || r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const urgent = alerts.filter(a => a.severity === "urgent" || a.days_remaining <= 7);
  const warning = alerts.filter(a => a.severity !== "urgent" && a.days_remaining > 7 && a.days_remaining <= 30);

  if (loading) return (
    <div style={{ ...card }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: DARK }}>⚠️ NECWR Alerts</h3>
      <div style={{ color: MUTED, fontSize: 13 }}>Loading…</div>
    </div>
  );

  if (alerts.length === 0) return (
    <div style={{ ...card }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700, color: DARK }}>✅ NECWR — All Clear</h3>
      <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>No educator registration issues detected.</p>
    </div>
  );

  return (
    <div style={{ ...card }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: DARK, display: "flex", alignItems: "center", gap: 8 }}>
          ⚠️ NECWR Alerts
          {urgent.length > 0 && <span style={{ background: "#DC2626", color: "#fff", fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 10 }}>{urgent.length} urgent</span>}
        </h3>
        {onNavigate && <button onClick={() => onNavigate("educators")} style={{ background: "none", border: "none", color: P, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>View Educators →</button>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[...urgent, ...warning].slice(0, 5).map((a, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: urgent.includes(a) ? "#FEF2F2" : "#FFFBEB", border: `1px solid ${urgent.includes(a) ? "#FCA5A5" : "#FDE68A"}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{a.educator_name}</div>
              <div style={{ fontSize: 12, color: MUTED }}>{a.message || a.type?.replace(/_/g, " ")}</div>
            </div>
            {a.days_remaining != null && (
              <span style={{ fontSize: 12, fontWeight: 700, color: urgent.includes(a) ? "#DC2626" : "#D97706", whiteSpace: "nowrap" }}>
                {a.days_remaining <= 0 ? "Overdue" : `${a.days_remaining}d`}
              </span>
            )}
          </div>
        ))}
        {alerts.length > 5 && <div style={{ fontSize: 12, color: MUTED, textAlign: "center" }}>+{alerts.length - 5} more</div>}
      </div>
    </div>
  );
}

// ─── Attendance Patterns Widget ───────────────────────────────────────────────
export function AttendancePatternsWidget() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("hourly"); // hourly | daily

  useEffect(() => {
    API("/api/operations/attendance-patterns")
      .then(r => setData(r.patterns || r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const chartData = view === "hourly"
    ? (data.hourly || data).map(d => ({ name: d.hour != null ? `${d.hour}:00` : d.label, value: d.count || d.avg_children || 0 }))
    : (data.daily || []).map(d => ({ name: d.day_name || d.day, value: d.count || d.avg_children || 0 }));

  const peak = chartData.reduce((max, d) => d.value > max.value ? d : max, { value: 0 });

  return (
    <div style={{ ...card }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: DARK }}>📊 Attendance Patterns</h3>
        <div style={{ display: "flex", gap: 6 }}>
          {["hourly", "daily"].map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: "4px 10px", borderRadius: 7, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", background: view === v ? P : "#F3F4F6", color: view === v ? "#fff" : MUTED }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div style={{ color: MUTED, fontSize: 13, textAlign: "center", padding: 20 }}>Loading…</div>
        : chartData.length === 0 ? <div style={{ color: MUTED, fontSize: 13, textAlign: "center", padding: 20 }}>No attendance data yet</div>
        : (
          <>
            {peak.value > 0 && (
              <div style={{ marginBottom: 12, padding: "6px 12px", background: PL, borderRadius: 8, fontSize: 12, color: DARK }}>
                Peak: <strong>{peak.name}</strong> — avg <strong>{Math.round(peak.value)}</strong> children
              </div>
            )}
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: MUTED }} />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.name === peak.name ? P : PL} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
    </div>
  );
}

// ─── Compliance To-Do Summary Widget ─────────────────────────────────────────
export function ComplianceTodoWidget({ onNavigate }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API("/api/v2/todo?status=open&limit=5")
      .then(r => setTodos(r.todos || r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const PRIO_COLOR = { urgent: "#DC2626", high: "#D97706", normal: "#2563EB", low: MUTED };
  const overdue = todos.filter(t => t.due_date && new Date(t.due_date) < new Date());

  return (
    <div style={{ ...card }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: DARK, display: "flex", alignItems: "center", gap: 8 }}>
          ✅ Compliance To-Do
          {overdue.length > 0 && <span style={{ background: "#DC2626", color: "#fff", fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 10 }}>{overdue.length} overdue</span>}
        </h3>
        {onNavigate && <button onClick={() => onNavigate("todo")} style={{ background: "none", border: "none", color: P, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>View All →</button>}
      </div>
      {loading ? <div style={{ color: MUTED, fontSize: 13 }}>Loading…</div>
        : todos.length === 0 ? (
          <div style={{ textAlign: "center", padding: "12px 0", color: MUTED, fontSize: 13 }}>🎉 No open items</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {todos.map((t, i) => {
              const isOverdue = t.due_date && new Date(t.due_date) < new Date();
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: i < todos.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: PRIO_COLOR[t.priority] || MUTED, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                  {t.due_date && <span style={{ fontSize: 11, color: isOverdue ? "#DC2626" : MUTED, whiteSpace: "nowrap", fontWeight: isOverdue ? 700 : 400 }}>{t.due_date}</span>}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

// ─── Room Groups Summary Widget ───────────────────────────────────────────────
export function RoomGroupsWidget({ onNavigate }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API("/api/roster-enhanced/room-groups")
      .then(r => setGroups(r.groups || r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ ...card }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: DARK }}>🏠 Room Groups</h3>
        {onNavigate && <button onClick={() => onNavigate("rooms")} style={{ background: "none", border: "none", color: P, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Manage →</button>}
      </div>
      {loading ? <div style={{ color: MUTED, fontSize: 13 }}>Loading…</div>
        : groups.length === 0 ? <div style={{ color: MUTED, fontSize: 13 }}>No room groups configured</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {groups.map((g, i) => {
              const rooms = Array.isArray(g.room_ids) ? g.room_ids : JSON.parse(g.room_ids || "[]");
              return (
                <div key={i} style={{ padding: "8px 12px", borderRadius: 8, background: "#F9F8FF", border: "1px solid #EDE8F4" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{g.name}</div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{g.description || `${rooms.length} room(s) • ${g.ratio_basis || "youngest"} ratio`}</div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
