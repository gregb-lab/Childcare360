import { useState, useEffect, useCallback } from "react";
import DatePicker from "./DatePicker.jsx";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}) },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};
const toast = (msg, type = "success") => { if (window.showToast) window.showToast(msg, type); };

const purple = "#8B6DAF", lp = "#F0EBF8";
const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: "18px 22px", marginBottom: 14, boxShadow: "0 2px 8px rgba(139,109,175,0.04)" };
const inp = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #D9D0C7", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" };
const lbl = { fontSize: 10, color: "#8A7F96", fontWeight: 700, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" };

const SEV_CONFIG = {
  minor:    { label: "Minor",    color: "#E65100", bg: "#FFF3E0" },
  moderate: { label: "Moderate", color: "#C62828", bg: "#FFEBEE" },
  serious:  { label: "Serious",  color: "#B71C1C", bg: "#FFCDD2" },
  critical: { label: "Critical", color: "#fff",    bg: "#B71C1C" },
};
const TYPE_CONFIG = {
  incident:  { label: "Incident",  emoji: "⚠️" },
  injury:    { label: "Injury",    emoji: "🩹" },
  trauma:    { label: "Trauma",    emoji: "😢" },
  illness:   { label: "Illness",   emoji: "🤒" },
  near_miss: { label: "Near Miss", emoji: "⚡" },
  hazard:    { label: "Hazard",    emoji: "🚧" },
};

const BLANK_FORM = {
  child_id: "", date: new Date().toISOString().slice(0,10), time: new Date().toTimeString().slice(0,5),
  type: "incident", severity: "minor", title: "", description: "", location: "",
  action_taken: "", first_aid_given: false, first_aid_by: "", reported_by: "",
  parent_notified: false, parent_notified_at: "", parent_notified_method: "phone",
  witness: "", follow_up_required: false, follow_up_notes: "",
  regulatory_report_required: false, regulatory_reported_at: "",
};

export default function IncidentModule() {
  const [incidents, setIncidents] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState({ from: "", to: "", severity: "", type: "" });
  const [detail, setDetail] = useState(null);

  const u = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.from) params.set("from", filter.from);
      if (filter.to) params.set("to", filter.to);
      if (filter.severity) params.set("severity", filter.severity);
      if (filter.type) params.set("type", filter.type);
      const [inc, ch] = await Promise.all([
        API(`/api/incidents?${params}`),
        API("/api/children"),
      ]);
      if (Array.isArray(inc)) setIncidents(inc);
      if (Array.isArray(ch)) setChildren(ch);
    } catch(e) {}
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setForm(BLANK_FORM);
    setEditId(null);
    setShowForm(true);
    setDetail(null);
  };

  const openEdit = (inc) => {
    setForm({ ...BLANK_FORM, ...inc, first_aid_given: !!inc.first_aid_given, parent_notified: !!inc.parent_notified, follow_up_required: !!inc.follow_up_required, regulatory_report_required: !!inc.regulatory_report_required });
    setEditId(inc.id);
    setShowForm(true);
    setDetail(null);
  };

  const save = async () => {
    if (!form.date || !form.type) { toast("Date and type are required", "error"); return; }
    setSaving(true);
    try {
      const r = editId
        ? await API(`/api/incidents/${editId}`, { method: "PUT", body: form })
        : await API("/api/incidents", { method: "POST", body: form });
      if (r.error) { toast(r.error, "error"); } else {
        toast(editId ? "Incident updated" : "Incident recorded");
        setShowForm(false); setEditId(null); setForm(BLANK_FORM);
        load();
      }
    } catch(e) { toast("Save failed", "error"); }
    setSaving(false);
  };

  const del = async (id) => {
    if (!(await window.showConfirm("Delete this incident record? This cannot be undone."))) return;
    try { await API(`/api/incidents/${id}`, { method: "DELETE" }); toast("Deleted"); load(); }
    catch(e) { toast("Delete failed", "error"); }
  };

  const SevBadge = ({ s }) => {
    const c = SEV_CONFIG[s] || SEV_CONFIG.minor;
    return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: c.bg, color: c.color, border: `1px solid ${c.color}30` }}>{c.label}</span>;
  };

  const stats = {
    total: incidents.length,
    minor: incidents.filter(i => i.severity === "minor").length,
    moderate: incidents.filter(i => i.severity === "moderate" || i.severity === "serious").length,
    regulatory: incidents.filter(i => i.regulatory_report_required).length,
    followUp: incidents.filter(i => i.follow_up_required && !i.follow_up_notes).length,
  };

  const exportCSV = () => {
    const rows = [["Date","Time","Type","Severity","Child","Title","Location","Action Taken","First Aid","Parent Notified","Reported By","Regulatory Report"]];
    incidents.forEach(i => rows.push([i.date, i.time||"", TYPE_CONFIG[i.type]?.label||i.type, SEV_CONFIG[i.severity]?.label||i.severity, i.first_name?`${i.first_name} ${i.last_name}`:"", i.title||"", i.location||"", i.action_taken||"", i.first_aid_given?"Yes":"No", i.parent_notified?"Yes":"No", i.reported_by||"", i.regulatory_report_required?"Yes":"No"]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\\n");
    const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv); a.download = "incident_register.csv"; a.click();
  };

  return (
    <div style={{ padding: "0 24px 24px", flex: 1, minHeight: 0, overflowY: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, color: "#3D3248" }}>⚠️ Incident Register</h2>
          <p style={{ margin: "4px 0 0", color: "#8A7F96", fontSize: 13 }}>Regulation 87 — Incident, Injury, Trauma & Illness Records</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportCSV} style={{ padding: "9px 16px", background: "#E8F5E9", color: "#2E7D32", border: "1px solid #A5D6A7", borderRadius: 9, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>⬇ Export CSV</button>
          <button onClick={openNew} style={{ padding: "9px 20px", background: purple, color: "#fff", border: "none", borderRadius: 9, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>+ Record Incident</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          ["Total Records", stats.total, "#3D3248"],
          ["Minor", stats.minor, "#E65100"],
          ["Mod/Serious", stats.moderate, "#C62828"],
          ["Regulatory", stats.regulatory, "#B71C1C"],
          ["Follow-up Due", stats.followUp, stats.followUp > 0 ? "#C62828" : "#2E7D32"],
        ].map(([l, v, c]) => (
          <div key={l} style={{ ...card, textAlign: "center", padding: "14px 10px", marginBottom: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: c, lineHeight: 1 }}>{v}</div>
            <div style={{ fontSize: 10, color: "#8A7F96", marginTop: 4, fontWeight: 600 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
          <div><label style={lbl}>From</label><input type="date" value={filter.from} onChange={e => setFilter(f => ({...f, from: e.target.value}))} style={inp}/></div>
          <div><label style={lbl}>To</label><input type="date" value={filter.to} onChange={e => setFilter(f => ({...f, to: e.target.value}))} style={inp}/></div>
          <div>
            <label style={lbl}>Type</label>
            <select value={filter.type} onChange={e => setFilter(f => ({...f, type: e.target.value}))} style={inp}>
              <option value="">All Types</option>
              {Object.entries(TYPE_CONFIG).map(([v,l]) => <option key={v} value={v}>{l.emoji} {l.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Severity</label>
            <select value={filter.severity} onChange={e => setFilter(f => ({...f, severity: e.target.value}))} style={inp}>
              <option value="">All Severities</option>
              {Object.entries(SEV_CONFIG).map(([v,l]) => <option key={v} value={v}>{l.label}</option>)}
            </select>
          </div>
          <button onClick={() => setFilter({ from: "", to: "", severity: "", type: "" })}
            style={{ padding: "9px 14px", background: lp, color: purple, border: `1px solid ${purple}30`, borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 12, height: 38, marginTop: 20 }}>
            Clear
          </button>
        </div>
      </div>

      {/* Incident Form Modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "20px 0" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 760, width: "94%", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{editId ? "Edit Incident" : "Record Incident / Injury"}</h3>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#8A7F96" }}>×</button>
            </div>

            {/* Regulatory notice */}
            <div style={{ background: "#FFF3E0", border: "1px solid #FFB74D", borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: "#E65100" }}>
              <strong>Regulation 87 (Aust):</strong> All incidents, injuries, trauma and illness must be recorded. Serious incidents must be reported to the regulatory authority within 24 hours.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Child</label>
                <select value={form.child_id} onChange={e => u("child_id", e.target.value)} style={inp}>
                  <option value="">Select child (optional)</option>
                  {children.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Date *</label><DatePicker value={form.date} onChange={v => u("date", v)} /></div>
              <div><label style={lbl}>Time</label><input type="time" value={form.time} onChange={e => u("time", e.target.value)} style={inp}/></div>
              <div>
                <label style={lbl}>Type *</label>
                <select value={form.type} onChange={e => u("type", e.target.value)} style={inp}>
                  {Object.entries(TYPE_CONFIG).map(([v, l]) => <option key={v} value={v}>{l.emoji} {l.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Severity *</label>
                <select value={form.severity} onChange={e => u("severity", e.target.value)} style={inp}>
                  {Object.entries(SEV_CONFIG).map(([v, l]) => <option key={v} value={v}>{l.label}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Location</label><input value={form.location} onChange={e => u("location", e.target.value)} placeholder="e.g. Outdoor play area" style={inp}/></div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Title / Brief Summary</label>
              <input value={form.title} onChange={e => u("title", e.target.value)} placeholder="e.g. Minor fall from climbing equipment" style={inp}/>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Description</label>
                <textarea value={form.description} onChange={e => u("description", e.target.value)} rows={3} placeholder="Detailed description of what happened..." style={{ ...inp, resize: "vertical" }}/>
              </div>
              <div>
                <label style={lbl}>Action Taken</label>
                <textarea value={form.action_taken} onChange={e => u("action_taken", e.target.value)} rows={3} placeholder="What was done in response..." style={{ ...inp, resize: "vertical" }}/>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Reported By</label>
                <input value={form.reported_by} onChange={e => u("reported_by", e.target.value)} placeholder="Staff member name" style={inp}/>
              </div>
              <div>
                <label style={lbl}>Witness</label>
                <input value={form.witness} onChange={e => u("witness", e.target.value)} placeholder="Witness name (if any)" style={inp}/>
              </div>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: 2 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={form.first_aid_given} onChange={e => u("first_aid_given", e.target.checked)}/>
                  🩹 First Aid Given
                </label>
                {form.first_aid_given && (
                  <input value={form.first_aid_by} onChange={e => u("first_aid_by", e.target.value)} placeholder="First aid administered by" style={{ ...inp, marginTop: 6, fontSize: 12 }}/>
                )}
              </div>
            </div>

            {/* Parent notification */}
            <div style={{ background: "#F8F5FC", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, marginBottom: form.parent_notified ? 10 : 0 }}>
                <input type="checkbox" checked={form.parent_notified} onChange={e => u("parent_notified", e.target.checked)}/>
                📞 Parent / Guardian Notified
              </label>
              {form.parent_notified && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={lbl}>Notified At</label>
                    <input type="time" value={form.parent_notified_at} onChange={e => u("parent_notified_at", e.target.value)} style={inp}/>
                  </div>
                  <div>
                    <label style={lbl}>Method</label>
                    <select value={form.parent_notified_method} onChange={e => u("parent_notified_method", e.target.value)} style={inp}>
                      <option value="phone">Phone</option><option value="in_person">In Person</option>
                      <option value="sms">SMS</option><option value="email">Email</option><option value="app">App</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Regulatory reporting */}
            <div style={{ background: "#FFEBEE", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                <input type="checkbox" checked={form.regulatory_report_required} onChange={e => u("regulatory_report_required", e.target.checked)}/>
                🏛️ Regulatory Report Required (Serious Incident)
              </label>
              {form.regulatory_report_required && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: "#B71C1C", marginBottom: 8 }}>⚠ Serious incidents must be reported to the regulatory authority within 24 hours via the ACECQA/state portal.</div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <label style={{ ...lbl, margin: 0 }}>Reported At:</label>
                    <input type="datetime-local" value={form.regulatory_reported_at} onChange={e => u("regulatory_reported_at", e.target.value)} style={{ ...inp, width: "auto" }}/>
                  </div>
                </div>
              )}
            </div>

            {/* Follow-up */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                <input type="checkbox" checked={form.follow_up_required} onChange={e => u("follow_up_required", e.target.checked)}/>
                🔄 Follow-up Required
              </label>
              {form.follow_up_required && (
                <textarea value={form.follow_up_notes} onChange={e => u("follow_up_notes", e.target.value)} rows={2}
                  placeholder="Follow-up actions, outcome, review notes..." style={{ ...inp, resize: "vertical" }}/>
              )}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "11px 0", borderRadius: 9, border: "1px solid #DDD", background: "#FDFBF9", color: "#555", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ flex: 2, padding: "11px 0", borderRadius: 9, border: "none", background: purple, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 14, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving…" : editId ? "Save Changes" : "Record Incident"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incident list */}
      {loading ? <div style={{ padding: 40, textAlign: "center", color: "#8A7F96" }}>Loading...</div> : (
        <div>
          {incidents.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#8A7F96" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: "#5C4E6A" }}>No Incidents Recorded</div>
              <div style={{ fontSize: 13 }}>All clear — no incidents to report for the selected period</div>
            </div>
          ) : incidents.map(inc => (
            <div key={inc.id} style={{ ...card, cursor: "pointer" }} onClick={() => setDetail(detail?.id === inc.id ? null : inc)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 18 }}>{TYPE_CONFIG[inc.type]?.emoji || "⚠️"}</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#3D3248" }}>{inc.title || `${TYPE_CONFIG[inc.type]?.label || inc.type} — ${inc.date}`}</span>
                    <SevBadge s={inc.severity} />
                    {inc.regulatory_report_required && <span style={{ fontSize: 10, fontWeight: 700, color: "#B71C1C", background: "#FFCDD2", padding: "2px 8px", borderRadius: 10 }}>🏛 Regulatory</span>}
                    {inc.follow_up_required && !inc.follow_up_notes && <span style={{ fontSize: 10, fontWeight: 700, color: "#E65100", background: "#FFF3E0", padding: "2px 8px", borderRadius: 10 }}>⚡ Follow-up due</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#8A7F96", display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span>📅 {inc.date}{inc.time ? ` at ${inc.time}` : ""}</span>
                    {inc.first_name && <span>👶 {inc.first_name} {inc.last_name}</span>}
                    {inc.room_name && <span>🏠 {inc.room_name}</span>}
                    {inc.location && <span>📍 {inc.location}</span>}
                    {inc.reported_by && <span>👤 {inc.reported_by}</span>}
                    {inc.parent_notified ? <span style={{ color: "#2E7D32" }}>✓ Parent notified</span> : <span style={{ color: "#E65100" }}>⚠ Parent not yet notified</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 12 }}>
                  <button onClick={e => { e.stopPropagation(); openEdit(inc); }} style={{ padding: "5px 10px", background: lp, color: purple, border: `1px solid ${purple}30`, borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Edit</button>
                  <button onClick={e => { e.stopPropagation(); del(inc.id); }} style={{ padding: "5px 10px", background: "#FFEBEE", color: "#C06B73", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12 }}>Delete</button>
                </div>
              </div>
              {detail?.id === inc.id && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #F0EBF8" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, fontSize: 13 }}>
                    {inc.description && <div><div style={lbl}>Description</div><div>{inc.description}</div></div>}
                    {inc.action_taken && <div><div style={lbl}>Action Taken</div><div>{inc.action_taken}</div></div>}
                    {inc.first_aid_given && <div><div style={lbl}>First Aid</div><div>Administered{inc.first_aid_by ? ` by ${inc.first_aid_by}` : ""}</div></div>}
                    {inc.witness && <div><div style={lbl}>Witness</div><div>{inc.witness}</div></div>}
                    {inc.parent_notified && <div><div style={lbl}>Parent Notification</div><div>Notified{inc.parent_notified_at ? ` at ${inc.parent_notified_at}` : ""} via {inc.parent_notified_method}</div></div>}
                    {inc.follow_up_notes && <div><div style={lbl}>Follow-up Notes</div><div>{inc.follow_up_notes}</div></div>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
