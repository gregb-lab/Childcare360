import { useState, useEffect, useCallback } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}), ...opts.headers },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};

const purple = "#8B6DAF";
const lightPurple = "#F0EBF8";
const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: "20px 24px" };

const STATUS_COLORS = {
  planning:        ["#546E7A", "#ECEFF1"],
  permission_sent: ["#1565C0", "#E3F2FD"],
  confirmed:       ["#2E7D32", "#E8F5E9"],
  completed:       ["#6A1B9A", "#F3E5F5"],
  cancelled:       ["#B71C1C", "#FFEBEE"],
};

const PERM_COLORS = {
  pending:  ["#E65100", "#FFF3E0"],
  approved: ["#2E7D32", "#E8F5E9"],
  denied:   ["#B71C1C", "#FFEBEE"],
  not_sent: ["#757575", "#F5F5F5"],
};

function Badge({ text, color, bg }) {
  return <span style={{ background: bg, color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{text}</span>;
}

export default function ExcursionsModule() {
  const [excursions, setExcursions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [view, setView] = useState("list"); // list | create | detail
  const [children, setChildren] = useState([]);
  const [educators, setEducators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "", description: "", destination: "", excursion_date: "",
    departure_time: "09:00", return_time: "14:00",
    transport_method: "walking", max_children: 20, min_educators: 2,
  });

  const load = useCallback(async () => {
    try {
      const [ex, ch, ed] = await Promise.all([
        API("/api/excursions"),
        API("/api/children"),
        API("/api/educators"),
      ]);
      if (Array.isArray(ex)) setExcursions(ex);
      if (Array.isArray(ch)) setChildren(ch);
      if (Array.isArray(ed)) setEducators(ed.filter(e => e.status === "active"));
    } catch (e) {}
  }, []);

  const loadDetail = useCallback(async (id) => {
    setLoading(true);
    try {
      const d = await API(`/api/excursions/${id}`);
      setDetail(d);
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (selected) loadDetail(selected); }, [selected, loadDetail]);

  const createExcursion = async () => {
    if (!form.title || !form.excursion_date || !form.destination) return;
    setSaving(true);
    try {
      const d = await API("/api/excursions", { method: "POST", body: JSON.stringify(form) });
      if (d.id) {
        await load();
        setSelected(d.id);
        setView("detail");
      }
    } catch (e) {}
    setSaving(false);
  };

  const assignAllRoomChildren = async (room) => {
    if (!selected) return;
    const roomChildren = children.filter(c => c.room_id === room.id || c.room_name === room.name);
    try {
      await API(`/api/excursions/${selected}/children`, {
        method: "POST",
        body: JSON.stringify({ child_ids: roomChildren.map(c => c.id) }),
      });
      loadDetail(selected);
    } catch (e) {}
  };

  const toggleChild = async (childId) => {
    if (!detail) return;
    const isAssigned = detail.children?.some(c => c.child_id === childId || c.id === childId);
    if (isAssigned) {
      await API(`/api/excursions/${selected}/children/${childId}`, { method: "DELETE" });
    } else {
      await API(`/api/excursions/${selected}/children`, { method: "POST", body: JSON.stringify({ child_ids: [childId] }) });
    }
    loadDetail(selected);
  };

  const toggleEducator = async (educatorId) => {
    if (!detail) return;
    const isAssigned = detail.educators?.some(e => e.educator_id === educatorId || e.id === educatorId);
    if (!isAssigned) {
      await API(`/api/excursions/${selected}/educators`, { method: "POST", body: JSON.stringify({ educator_id: educatorId, role: "attending" }) });
      loadDetail(selected);
    }
  };

  const sendPermissions = async () => {
    if (!selected) return;
    await API(`/api/excursions/${selected}/send-permission`, { method: "POST" });
    loadDetail(selected);
    load();
  };

  const updateStatus = async (status) => {
    if (!selected) return;
    await API(`/api/excursions/${selected}`, { method: "PUT", body: JSON.stringify({ status }) });
    loadDetail(selected);
    load();
  };

  const excursionsByStatus = {
    upcoming: excursions.filter(e => ["planning", "permission_sent", "confirmed"].includes(e.status)),
    past: excursions.filter(e => ["completed", "cancelled"].includes(e.status)),
  };

  return (
    <div style={{ padding: "0 24px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, color: "#3D3248" }}>Excursions</h2>
          <p style={{ margin: "4px 0 0", color: "#8A7F96", fontSize: 13 }}>
            {excursionsByStatus.upcoming.length} upcoming · {excursionsByStatus.past.length} past
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {view !== "list" && (
            <button onClick={() => { setView("list"); setSelected(null); setDetail(null); }}
              style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #EDE8F4", background: "#FDFBF9", color: "#555", cursor: "pointer", fontSize: 13 }}>
              ← Back
            </button>
          )}
          {view === "list" && (
            <button onClick={() => setView("create")}
              style={{ background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
              + New Excursion
            </button>
          )}
        </div>
      </div>

      {/* LIST VIEW */}
      {view === "list" && (
        <div>
          {excursionsByStatus.upcoming.length === 0 && excursionsByStatus.past.length === 0 && (
            <div style={{ ...card, textAlign: "center", color: "#8A7F96", padding: 48 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🚌</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>No excursions yet</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>Click "New Excursion" to plan your first outing</div>
            </div>
          )}

          {excursionsByStatus.upcoming.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#8A7F96", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>Upcoming</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {excursionsByStatus.upcoming.map(ex => <ExcursionCard key={ex.id} ex={ex} onClick={() => { setSelected(ex.id); setView("detail"); }} />)}
              </div>
            </div>
          )}

          {excursionsByStatus.past.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#8A7F96", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>Past Excursions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {excursionsByStatus.past.map(ex => <ExcursionCard key={ex.id} ex={ex} onClick={() => { setSelected(ex.id); setView("detail"); }} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE VIEW */}
      {view === "create" && (
        <div style={{ ...card }}>
          <h3 style={{ margin: "0 0 20px", color: "#3D3248" }}>New Excursion</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>Title *</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Cronulla Beach Walk"
                style={{ width: "100%", padding: "9px 14px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>Destination *</label>
              <input value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })}
                placeholder="e.g. Cronulla Beach, NSW"
                style={{ width: "100%", padding: "9px 14px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>Date *</label>
              <input type="date" value={form.excursion_date} onChange={e => setForm({ ...form, excursion_date: e.target.value })}
                style={{ width: "100%", padding: "9px 14px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>Transport</label>
              <select value={form.transport_method} onChange={e => setForm({ ...form, transport_method: e.target.value })}
                style={{ width: "100%", padding: "9px 14px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 14 }}>
                {["walking", "bus", "van", "train", "other"].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>Departure Time</label>
              <input type="time" value={form.departure_time} onChange={e => setForm({ ...form, departure_time: e.target.value })}
                style={{ width: "100%", padding: "9px 14px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>Return Time</label>
              <input type="time" value={form.return_time} onChange={e => setForm({ ...form, return_time: e.target.value })}
                style={{ width: "100%", padding: "9px 14px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>Max Children</label>
              <input type="number" value={form.max_children} onChange={e => setForm({ ...form, max_children: parseInt(e.target.value) })}
                style={{ width: "100%", padding: "9px 14px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>Min. Educators Required</label>
              <input type="number" value={form.min_educators} onChange={e => setForm({ ...form, min_educators: parseInt(e.target.value) })}
                style={{ width: "100%", padding: "9px 14px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>Description</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                rows={3} placeholder="Brief description of the excursion..."
                style={{ width: "100%", padding: "9px 14px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 14, boxSizing: "border-box", resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button onClick={() => setView("list")}
              style={{ padding: "10px 24px", borderRadius: 8, border: "1px solid #EDE8F4", background: "#FDFBF9", color: "#555", cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={createExcursion} disabled={saving || !form.title || !form.excursion_date || !form.destination}
              style={{ background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "10px 28px", cursor: "pointer", fontWeight: 700,
                opacity: (saving || !form.title || !form.excursion_date || !form.destination) ? 0.6 : 1 }}>
              {saving ? "Creating..." : "Create Excursion →"}
            </button>
          </div>
        </div>
      )}

      {/* DETAIL VIEW */}
      {view === "detail" && selected && (
        loading ? (
          <div style={{ ...card, textAlign: "center", color: "#8A7F96", padding: 48 }}>Loading...</div>
        ) : detail ? (
          <ExcursionDetail
            excursion={detail}
            children={children}
            educators={educators}
            onToggleChild={toggleChild}
            onToggleEducator={toggleEducator}
            onSendPermissions={sendPermissions}
            onUpdateStatus={updateStatus}
            onRefresh={() => loadDetail(selected)}
          />
        ) : null
      )}
    </div>
  );
}

function ExcursionCard({ ex, onClick }) {
  const [col, bg] = STATUS_COLORS[ex.status] || ["#555", "#EEE"];
  const approvedCount = ex.children_count ? (ex.approved_count || 0) : null;
  return (
    <div onClick={onClick} style={{ ...card, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "box-shadow 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
          🚌
        </div>
        <div>
          <div style={{ fontWeight: 700, color: "#3D3248", fontSize: 15 }}>{ex.title}</div>
          <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 3 }}>
            📍 {ex.destination} · 📅 {ex.excursion_date} · {ex.departure_time} → {ex.return_time}
          </div>
          {approvedCount !== null && (
            <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>
              {approvedCount}/{ex.children_count || 0} permissions received
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Badge text={ex.status?.replace("_", " ")} color={col} bg={bg} />
        <span style={{ color: "#CCC", fontSize: 18 }}>›</span>
      </div>
    </div>
  );
}

function ExcursionDetail({ excursion, children, educators, onToggleChild, onToggleEducator, onSendPermissions, onUpdateStatus, onRefresh }) {
  const [detailTab, setDetailTab] = useState("overview");
  const assignedChildIds = new Set((excursion.children || []).map(c => c.child_id || c.id));
  const assignedEduIds = new Set((excursion.educators || []).map(e => e.educator_id || e.id));

  const permStats = (excursion.children || []).reduce((acc, c) => {
    acc[c.permission_status || "pending"] = (acc[c.permission_status || "pending"] || 0) + 1;
    return acc;
  }, {});

  const tabs = ["overview", "children", "educators", "permissions"];

  return (
    <div>
      {/* Header card */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h3 style={{ margin: 0, color: "#3D3248", fontSize: 20 }}>{excursion.title}</h3>
            <div style={{ color: "#8A7F96", fontSize: 13, marginTop: 6 }}>
              📍 {excursion.destination} · 🚌 {excursion.transport_method} · 📅 {excursion.excursion_date}
            </div>
            <div style={{ color: "#8A7F96", fontSize: 13, marginTop: 2 }}>
              ⏰ {excursion.departure_time} → {excursion.return_time} · 👶 Max {excursion.max_children} children · 👥 Min {excursion.min_educators} educators
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexDirection: "column", alignItems: "flex-end" }}>
            {(() => { const [col, bg] = STATUS_COLORS[excursion.status] || ["#555", "#EEE"]; return <Badge text={excursion.status?.replace("_", " ")} color={col} bg={bg} />; })()}
            {/* Action buttons per status */}
            {excursion.status === "planning" && assignedChildIds.size > 0 && (
              <button onClick={onSendPermissions}
                style={{ background: "#1565C0", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                ✉ Send Permission Notes
              </button>
            )}
            {excursion.status === "permission_sent" && (
              <button onClick={() => onUpdateStatus("confirmed")}
                style={{ background: "#2E7D32", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                ✓ Confirm Excursion
              </button>
            )}
            {excursion.status === "confirmed" && (
              <button onClick={() => onUpdateStatus("completed")}
                style={{ background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Mark Completed
              </button>
            )}
          </div>
        </div>
        {excursion.description && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#555", borderTop: "1px solid #EDE8F4", paddingTop: 12 }}>{excursion.description}</div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "#F8F5F1", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setDetailTab(t)}
            style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, textTransform: "capitalize",
              background: detailTab === t ? "#fff" : "transparent", color: detailTab === t ? purple : "#8A7F96",
              boxShadow: detailTab === t ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>
            {t}
          </button>
        ))}
      </div>

      {/* Overview */}
      {detailTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
          {[
            { label: "Children Assigned", value: assignedChildIds.size, icon: "👶" },
            { label: "Educators Assigned", value: assignedEduIds.size, icon: "👥" },
            { label: "Permissions Approved", value: permStats.approved || 0, icon: "✅" },
            { label: "Permissions Pending", value: permStats.pending || 0, icon: "⏳" },
          ].map(s => (
            <div key={s.label} style={{ ...card, textAlign: "center" }}>
              <div style={{ fontSize: 28 }}>{s.icon}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: purple, marginTop: 6 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Children */}
      {detailTab === "children" && (
        <div style={{ ...card }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 14, color: "#3D3248" }}>Assign Children ({assignedChildIds.size} assigned)</h3>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {children.map(c => {
              const isOn = assignedChildIds.has(c.id);
              return (
                <div key={c.id} onClick={() => onToggleChild(c.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10,
                    border: `2px solid ${isOn ? purple : "#EDE8F4"}`, background: isOn ? lightPurple : "#FDFBF9", cursor: "pointer" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: lightPurple, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, color: purple }}>
                    {c.first_name?.[0]}{c.last_name?.[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#3D3248", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.first_name} {c.last_name}
                    </div>
                    {c.room_name && <div style={{ fontSize: 11, color: "#8A7F96" }}>{c.room_name}</div>}
                  </div>
                  <span style={{ fontSize: 18, color: isOn ? purple : "#DDD" }}>{isOn ? "✓" : "+"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Educators */}
      {detailTab === "educators" && (
        <div style={{ ...card }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>Assign Educators ({assignedEduIds.size} assigned)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {educators.map(e => {
              const isOn = assignedEduIds.has(e.id);
              return (
                <div key={e.id} onClick={() => onToggleEducator(e.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10,
                    border: `2px solid ${isOn ? "#2E7D32" : "#EDE8F4"}`, background: isOn ? "#E8F5E9" : "#FDFBF9", cursor: "pointer" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: lightPurple, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 14, fontWeight: 700, color: purple }}>
                    {e.first_name?.[0]}{e.last_name?.[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#3D3248" }}>{e.first_name} {e.last_name}</div>
                    <div style={{ fontSize: 11, color: "#8A7F96" }}>{e.qualification}</div>
                  </div>
                  {isOn && <span style={{ color: "#2E7D32", fontSize: 18 }}>✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Permissions */}
      {detailTab === "permissions" && (
        <div style={{ ...card }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 14, color: "#3D3248" }}>Permission Status</h3>
            {excursion.status === "planning" && (
              <button onClick={onSendPermissions}
                style={{ background: "#1565C0", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                ✉ Send Permission Notes
              </button>
            )}
          </div>
          {(excursion.children || []).length === 0 ? (
            <div style={{ textAlign: "center", color: "#8A7F96", padding: 32 }}>No children assigned yet</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: lightPurple }}>
                  {["Child", "Room", "Permission Status", "Approved By", "Date"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: purple, fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(excursion.children || []).map((ec) => {
                  const [col, bg] = PERM_COLORS[ec.permission_status || "not_sent"] || ["#555", "#EEE"];
                  const child = children.find(c => c.id === (ec.child_id || ec.id));
                  return (
                    <tr key={ec.id || ec.child_id} style={{ borderBottom: "1px solid #F0EBF8" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                        {child ? `${child.first_name} ${child.last_name}` : ec.child_name || "—"}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#8A7F96" }}>{child?.room_name || "—"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <Badge text={(ec.permission_status || "not sent").replace("_", " ")} color={col} bg={bg} />
                      </td>
                      <td style={{ padding: "10px 12px", color: "#8A7F96" }}>{ec.permission_granted_by || "—"}</td>
                      <td style={{ padding: "10px 12px", color: "#8A7F96" }}>
                        {ec.permission_granted_at ? new Date(ec.permission_granted_at).toLocaleDateString("en-AU") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
