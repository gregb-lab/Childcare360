import { useState, useEffect, useCallback } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}) },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};
const toast = (msg, type = "success") => { if (window.showToast) window.showToast(msg, type); };

const P = "#7C3AED", PL = "#EDE4F0", DARK = "#3D3248", MUTED = "#8A7F96";
const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: "20px 24px" };
const btnP = { padding: "9px 18px", borderRadius: 9, border: "none", background: P, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 };
const btnS = { padding: "9px 18px", borderRadius: 9, border: `1px solid ${P}`, background: "#fff", color: P, fontWeight: 600, cursor: "pointer", fontSize: 14 };

const PRIORITIES = { urgent: { label: "Urgent", color: "#DC2626", bg: "#FEF2F2" }, high: { label: "High", color: "#D97706", bg: "#FFFBEB" }, normal: { label: "Normal", color: "#2563EB", bg: "#EFF6FF" }, low: { label: "Low", color: MUTED, bg: "#F9FAFB" } };
const CATEGORIES = ["ratio_breach", "certification_expiry", "documentation", "policy_review", "incident_followup", "nqf_standard", "general"];
const CAT_LABELS = { ratio_breach: "Ratio Breach", certification_expiry: "Cert Expiry", documentation: "Documentation", policy_review: "Policy Review", incident_followup: "Incident Follow-up", nqf_standard: "NQF Standard", general: "General" };

export default function TodoModule() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("open");
  const [catFilter, setCatFilter] = useState("all");
  const [prioFilter, setPrioFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", detail: "", category: "general", priority: "normal", due_date: "", assigned_to: "" });
  const [educators, setEducators] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tdRes, edRes] = await Promise.all([
        API(`/api/v2/todo?status=${filter}`),
        API("/api/educators/simple"),
      ]);
      setTodos(tdRes.todos || tdRes.data || []);
      setEducators(edRes.educators || edRes.data || []);
    } catch (e) { toast("Failed to load to-do list", "error"); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => setForm({ title: "", detail: "", category: "general", priority: "normal", due_date: "", assigned_to: "" });

  const save = async () => {
    if (!form.title.trim()) { toast("Title is required", "error"); return; }
    setSaving(true);
    try {
      if (editing) {
        await API(`/api/v2/todo/${editing.id}`, { method: "PUT", body: form });
        toast("Updated");
      } else {
        await API("/api/v2/todo", { method: "POST", body: form });
        toast("Created");
      }
      setCreating(false); setEditing(null); resetForm(); load();
    } catch (e) { toast("Save failed", "error"); }
    finally { setSaving(false); }
  };

  const resolve = async (id) => {
    try {
      await API(`/api/v2/todo/${id}/resolve`, { method: "POST" });
      toast("Marked resolved ✓");
      load();
    } catch (e) { toast("Failed", "error"); }
  };

  const del = async (id) => {
    if (!(await window.showConfirm("Delete this item?"))) return;
    try { await API(`/api/v2/todo/${id}`, { method: "DELETE" }); toast("Deleted"); load(); }
    catch (e) { toast("Failed", "error"); }
  };

  const startEdit = (t) => { setEditing(t); setForm({ title: t.title, detail: t.detail || "", category: t.category || "general", priority: t.priority || "normal", due_date: t.due_date || "", assigned_to: t.assigned_to || "" }); setCreating(true); };

  const filtered = todos.filter(t =>
    (catFilter === "all" || t.category === catFilter) &&
    (prioFilter === "all" || t.priority === prioFilter)
  );

  const urgentCount = todos.filter(t => t.priority === "urgent" && t.status !== "resolved").length;

  return (
    <div style={{ padding: "24px 28px", maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 26 }}>✅</span>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: DARK }}>Compliance To-Do</h1>
            {urgentCount > 0 && (
              <span style={{ background: "#DC2626", color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>
                {urgentCount} urgent
              </span>
            )}
          </div>
          <p style={{ margin: "4px 0 0 38px", color: MUTED, fontSize: 14 }}>Track and resolve compliance action items</p>
        </div>
        <button style={btnP} onClick={() => { setEditing(null); resetForm(); setCreating(true); }}>+ Add Item</button>
      </div>

      {/* Create / Edit form */}
      {creating && (
        <div style={{ ...card, marginBottom: 20, border: `1.5px solid ${P}` }}>
          <h3 style={{ margin: "0 0 16px", color: DARK, fontSize: 16 }}>{editing ? "Edit Item" : "New Compliance Item"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ fontSize: 13, color: MUTED, fontWeight: 600 }}>Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Renew Sarah Mitchell's First Aid certificate"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #DDD", fontSize: 14, marginTop: 4, boxSizing: "border-box" }} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ fontSize: 13, color: MUTED, fontWeight: 600 }}>Detail</label>
              <textarea value={form.detail} onChange={e => setForm(f => ({ ...f, detail: e.target.value }))}
                rows={2} placeholder="Additional context or steps..."
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #DDD", fontSize: 14, marginTop: 4, boxSizing: "border-box", resize: "vertical" }} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: MUTED, fontWeight: 600 }}>Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #DDD", fontSize: 14, marginTop: 4 }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, color: MUTED, fontWeight: 600 }}>Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #DDD", fontSize: 14, marginTop: 4 }}>
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, color: MUTED, fontWeight: 600 }}>Due Date</label>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #DDD", fontSize: 14, marginTop: 4, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: MUTED, fontWeight: 600 }}>Assign To</label>
              <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #DDD", fontSize: 14, marginTop: 4 }}>
                <option value="">Unassigned</option>
                {educators.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
            <button style={btnS} onClick={() => { setCreating(false); setEditing(null); resetForm(); }}>Cancel</button>
            <button style={{ ...btnP, opacity: saving ? 0.6 : 1 }} onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Update" : "Create"}</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {["open", "resolved", "all"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ ...filter === s ? btnP : btnS, textTransform: "capitalize", padding: "6px 14px" }}>
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #DDD", fontSize: 13, color: DARK }}>
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
          </select>
          <select value={prioFilter} onChange={e => setPrioFilter(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #DDD", fontSize: 13, color: DARK }}>
            <option value="all">All Priorities</option>
            {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: MUTED }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 40, color: MUTED }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
          <div style={{ fontWeight: 600 }}>{filter === "open" ? "No open items — everything is on track!" : "No items found"}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(t => {
            const prio = PRIORITIES[t.priority] || PRIORITIES.normal;
            const isOverdue = t.due_date && t.status !== "resolved" && new Date(t.due_date) < new Date();
            const assignee = educators.find(e => e.id === t.assigned_to);
            return (
              <div key={t.id} style={{ ...card, padding: "14px 20px", opacity: t.status === "resolved" ? 0.65 : 1, borderLeft: `4px solid ${prio.color}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  {/* Resolve checkbox */}
                  {t.status !== "resolved" && (
                    <button onClick={() => resolve(t.id)} title="Mark resolved"
                      style={{ marginTop: 2, width: 20, height: 20, borderRadius: 4, border: `2px solid ${P}`, background: "#fff", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    </button>
                  )}
                  {t.status === "resolved" && <span style={{ marginTop: 2, fontSize: 18 }}>✅</span>}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: DARK, textDecoration: t.status === "resolved" ? "line-through" : "none" }}>{t.title}</span>
                      <span style={{ background: prio.bg, color: prio.color, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>{prio.label}</span>
                      <span style={{ background: "#F3F4F6", color: MUTED, fontSize: 11, padding: "2px 8px", borderRadius: 10 }}>{CAT_LABELS[t.category] || t.category}</span>
                      {t.auto_generated ? <span style={{ background: "#EDE4F0", color: P, fontSize: 11, padding: "2px 8px", borderRadius: 10 }}>Auto</span> : null}
                    </div>
                    {t.detail && <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>{t.detail}</p>}
                    <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 12, color: MUTED }}>
                      {t.due_date && <span style={{ color: isOverdue ? "#DC2626" : MUTED, fontWeight: isOverdue ? 700 : 400 }}>Due {t.due_date}{isOverdue ? " ⚠ Overdue" : ""}</span>}
                      {assignee && <span>→ {assignee.first_name} {assignee.last_name}</span>}
                      {t.resolved_at && <span>Resolved {t.resolved_at?.slice(0, 10)}</span>}
                      <span>{t.created_at?.slice(0, 10)}</span>
                    </div>
                  </div>
                  {t.status !== "resolved" && (
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => startEdit(t)} style={{ background: "#F3F4F6", border: "none", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 13 }}>Edit</button>
                      <button onClick={() => del(t.id)} style={{ background: "#FEF2F2", border: "none", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 13, color: "#DC2626" }}>Del</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
