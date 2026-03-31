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
const inp = { padding: "7px 10px", borderRadius: 7, border: "1px solid #DDD6EE", fontSize: 12, width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 11, color: "#7A6E8A", fontWeight: 600, display: "block", marginBottom: 3 };
const card = { background: "#fff", borderRadius: 12, border: "1px solid #EDE8F4", padding: 16, marginBottom: 12 };
const btnP = { background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontWeight: 700, fontSize: 12 };
const btnS = { background: lp, color: purple, border: `1px solid ${purple}40`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontSize: 12 };

function ageLabel(dob) {
  if (!dob) return ""; const d = new Date(dob), now = new Date();
  const m = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
  if (m < 24) return `${m}mo`; const y = Math.floor(m / 12), mo = m % 12;
  return mo ? `${y}y ${mo}mo` : `${y}y`;
}

function fmtDate(s) { if (!s) return "—"; return new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }

const TABS = [
  { id: "profile",    icon: "👤", label: "Profile" },
  { id: "focus",      icon: "🧠", label: "AI Focus" },
  { id: "attendance", icon: "📅", label: "Attendance" },
  { id: "medical",    icon: "💊", label: "Medical" },
  { id: "dietary",    icon: "🥗", label: "Dietary" },
  { id: "immunise",   icon: "💉", label: "Immunisation" },
  { id: "permissions",icon: "✅", label: "Permissions" },
  { id: "notes",      icon: "📝", label: "Educator Notes" },
  { id: "messaging",  icon: "💬", label: "Messages" },
  { id: "payments",   icon: "💳", label: "Payments" },
  { id: "log",        icon: "📋", label: "Event Log" },
];

export default function ChildrenModule() {
  const [children, setChildren] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("profile");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ch, rm, att] = await Promise.allSettled([
        API("/api/children"),
        API("/api/rooms"),
        API("/api/children/attendance-today"),
      ]);
      if (ch.status === "fulfilled" && Array.isArray(ch.value)) setChildren(ch.value);
      if (rm.status === "fulfilled" && Array.isArray(rm.value)) setRooms(rm.value);
      if (att.status === "fulfilled" && Array.isArray(att.value)) setAttendance(att.value);
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = children.filter(c =>
    `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  const refreshSelected = async (id) => {
    try {
      const r = await API(`/api/children/${id || selected?.id}`);
      if (r.id) { setSelected(r); setChildren(prev => prev.map(c => c.id === r.id ? r : c)); }
    } catch (e) {}
  };

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#8A7F96" }}>Loading children...</div>;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 100px)", overflow: "hidden" }}>
      {/* Sidebar list */}
      <div style={{ width: 220, flexShrink: 0, background: "#FDFBF9", borderRight: "1px solid #EDE8F4", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 12px 8px" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search children..."
            style={{ ...inp, fontSize: 12 }} />
          <button onClick={() => setShowAdd(true)} style={{ ...btnP, width: "100%", marginTop: 8, fontSize: 12 }}>+ Add Child</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.map(c => {
            const room = rooms.find(r => r.id === c.room_id);
            const sel = selected?.id === c.id;
            return (
              <div key={c.id} onClick={async () => { setSelected(c); setTab("profile"); try { const full = await API(`/api/children/${c.id}`); if (full.id) setSelected(full); } catch(e) {} }}
                style={{ padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid #F5F0FB",
                  background: sel ? lp : "transparent", borderLeft: `3px solid ${sel ? purple : "transparent"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ChildAvatar child={c} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: sel ? 800 : 600, fontSize: 13, color: "#3D3248", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.first_name} {c.last_name}
                    </div>
                    <div style={{ fontSize: 10, color: "#8A7F96" }}>
                      {ageLabel(c.dob)} · {room?.name || "Unassigned"}
                      {(()=>{ const a=attendance.find(x=>x.id===c.id); if(!a) return null;
                        if(a.absent) return <span style={{marginLeft:6,fontSize:9,fontWeight:700,color:"#C06B73",background:"#FFEBEE",padding:"1px 5px",borderRadius:8}}>ABSENT</span>;
                        if(a.sign_in&&!a.sign_out) return <span style={{marginLeft:6,fontSize:9,fontWeight:700,color:"#2E7D32",background:"#E8F5E9",padding:"1px 5px",borderRadius:8}}>IN {a.sign_in}</span>;
                        if(a.sign_out) return <span style={{marginLeft:6,fontSize:9,fontWeight:700,color:"#5B8DB5",background:"#E3F2FD",padding:"1px 5px",borderRadius:8}}>OUT {a.sign_out}</span>;
                        return null; })()}
                    </div>
                    {c.allergies && c.allergies !== "None" && (
                      <div style={{ fontSize: 9, color: "#B71C1C", fontWeight: 700, marginTop: 1 }}>⚠ {c.allergies.substring(0, 20)}</div>
                    )}
                    {c.parent1_name && (
                      <div style={{ fontSize: 9, color: "#8A7F96", marginTop: 1, display:"flex", alignItems:"center", gap:4 }}>
                        👤 {c.parent1_name}
                        {c.parent1_phone && <a href={`tel:${c.parent1_phone}`} onClick={e=>e.stopPropagation()}
                          style={{ color:"#5B8DB5", textDecoration:"none", fontWeight:700 }}>📞</a>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail pane */}
      {selected ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Child header */}
          <div style={{ padding: "16px 20px 0", borderBottom: "1px solid #EDE8F4", background: "#fff", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
              <ChildAvatar child={selected} size={52} />
              <div>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "100%" }}>
                <h2 style={{ margin: 0, color: "#3D3248", fontSize: 20 }}>{selected.first_name} {selected.last_name}</h2>
                <button
                  onClick={async () => { if (!confirm(`Archive ${selected.first_name} ${selected.last_name}? They will be removed from active lists but their records are preserved.`)) return; await API(`/api/children/${selected.id}`, { method: "DELETE" }); setSelected(null); load(); }} // error: caught by caller
                  style={{ marginLeft: 12, padding: "5px 12px", borderRadius: 8, border: "1px solid #FFCDD2", background: "#FFF5F5", color: "#C06B73", cursor: "pointer", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                  Archive Child
                </button>
              </div>
                <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 2 }}>
                  {ageLabel(selected.dob)} · DOB {fmtDate(selected.dob)} · {rooms.find(r => r.id === selected.room_id)?.name || "Unassigned"}
                  {selected.enrolled_date && ` · Enrolled ${fmtDate(selected.enrolled_date)}`}
                </div>
                {selected.allergies && selected.allergies !== "None" && (
                  <div style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 5, background: "#FFEBEE", border: "1px solid #FFCDD2", borderRadius: 20, padding: "3px 10px", fontSize: 11, color: "#B71C1C", fontWeight: 700 }}>
                    ⚠ {selected.allergies}
                  </div>
                )}
              </div>
            </div>
            {/* Tab bar */}
            <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{ padding: "7px 12px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
                    background: tab === t.id ? lp : "transparent", color: tab === t.id ? purple : "#6B5F7A",
                    borderBottom: tab === t.id ? `2px solid ${purple}` : "2px solid transparent", whiteSpace: "nowrap" }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            {tab === "profile"    && <ProfileTab key={selected.id} child={selected} rooms={rooms} onSaved={refreshSelected} />}
            {tab === "focus"      && <FocusTab key={selected.id} child={selected} />}
            {tab === "attendance" && <AttendanceTab key={selected.id} child={selected} />}
            {tab === "medical"    && <MedicalTab key={selected.id} child={selected} onSaved={refreshSelected} />}
            {tab === "dietary"    && <DietaryTab key={selected.id} child={selected} onSaved={refreshSelected} />}
            {tab === "immunise"   && <ImmunisationTab key={selected.id} child={selected} />}
            {tab === "permissions"&& <PermissionsTab key={selected.id} child={selected} />}
            {tab === "notes"      && <EducatorNotesTab key={selected.id} child={selected} />}
            {tab === "messaging"  && <ParentMessagingTab key={selected.id} child={selected} />}
            {tab === "payments"   && <PaymentsTab key={selected.id} child={selected} />}
            {tab === "log"        && <EventLogTab key={selected.id} child={selected} />}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#B0AAB9", fontSize: 14 }}>
          Select a child to view their profile
        </div>
      )}

      {showAdd && <AddChildModal rooms={rooms} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function ChildAvatar({ child, size = 36 }) {
  const colors = ["#C9929E", "#9B7DC0", "#6BA38B", "#D4A26A", "#5B8DB5"];
  const color = colors[(child.first_name?.charCodeAt(0) || 0) % colors.length];
  if (child.photo_url) return <img src={child.photo_url} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: color + "30", border: `2px solid ${color}40`,
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, fontWeight: 700, color, flexShrink: 0 }}>
      {child.first_name?.[0]}{child.last_name?.[0]}
    </div>
  );
}

// ─── FROW — defined outside ProfileTab to prevent remount on rerender ──────────
function FRow({ label, k, type = "text", opts, f, u, ed, inp, lbl }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      {opts ? (
        <select key={k} style={inp} value={f[k] || ""} onChange={e => u(k, e.target.value)} disabled={!ed}>
          {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : type === "date" ? (
        <DatePicker key={k} value={f[k] || ""} onChange={v => u(k, v)} disabled={!ed} />
      ) : (
        <input key={k} type={type} value={f[k] || ""} onChange={e => u(k, e.target.value)} disabled={!ed}
          style={{ ...inp, background: ed ? "#fff" : "#FAFAFA" }} />
      )}
    </div>
  );
}

// ─── PROFILE TAB ─────────────────────────────────────────────────────────────
function ProfileTab({ child, rooms, onSaved }) {
  const [ed, setEd] = useState(false);
  const [f, setF] = useState({ ...child });
  const [saving, setSaving] = useState(false);

  const [saveErr, setSaveErr] = useState('');
  const save = async () => {
    setSaving(true); setSaveErr('');
    try {
      const r = await API(`/api/children/${child.id}`, { method: "PUT", body: f });
      if (!r.error) toast("Changes saved");
      if (r.error) { setSaveErr(r.error); setSaving(false); return; }
      setEd(false); onSaved(child.id);
    } catch(e) { setSaveErr('Failed to save. Please try again.'); }
    setSaving(false);
  };

  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  // FRow defined above ProfileTab

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        {ed ? (
          <>
            <button onClick={() => { setF({ ...child }); setEd(false); }} style={btnS}>Cancel</button>
            <button onClick={save} disabled={saving} style={btnP}>{saving ? "Saving…" : "Save"}</button>
          </>
        ) : (
          <button onClick={() => setEd(true)} style={btnS}>✏️ Edit</button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={card}>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700 }}>👤 Child Details</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <FRow label="First Name" k="first_name" f={f} u={u} ed={ed} inp={inp} lbl={lbl} />
            <FRow label="Last Name" k="last_name" f={f} u={u} ed={ed} inp={inp} lbl={lbl} />
            <FRow label="Date of Birth" k="dob" type="date" f={f} u={u} ed={ed} inp={inp} lbl={lbl} />
            <FRow label="Gender" k="gender" opts={[["","Select"],["male","Male"],["female","Female"],["other","Other/Non-binary"]]} />
            <FRow label="Room" k="room_id" opts={[["","Unassigned"], ...rooms.map(r => [r.id, r.name])]} f={f} u={u} ed={ed} inp={inp} lbl={lbl} />
            <FRow label="Enrolled Date" k="enrolled_date" type="date" f={f} u={u} ed={ed} inp={inp} lbl={lbl} />
          </div>
        </div>

        <div style={card}>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700 }}>📞 Primary Contact</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <FRow label="Parent / Guardian" k="parent1_name" />
            <FRow label="Relationship" k="parent1_relationship" opts={[["mother","Mother"],["father","Father"],["guardian","Guardian"],["other","Other"]]} f={f} u={u} ed={ed} inp={inp} lbl={lbl} />
            <FRow label="Email" k="parent1_email" type="email" f={f} u={u} ed={ed} inp={inp} lbl={lbl} />
            <FRow label="Phone" k="parent1_phone" f={f} u={u} ed={ed} inp={inp} lbl={lbl} />
          </div>
        </div>

        <div style={card}>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700 }}>📞 Secondary Contact</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <FRow label="Parent / Guardian 2" k="parent2_name" />
            <FRow label="Email" k="parent2_email" type="email" f={f} u={u} ed={ed} inp={inp} lbl={lbl} />
            <FRow label="Phone" k="parent2_phone" f={f} u={u} ed={ed} inp={inp} lbl={lbl} />
            <FRow label="Centrelink CRN" k="centrelink_crn" f={f} u={u} ed={ed} inp={inp} lbl={lbl} />
          </div>
        </div>

        <div style={card}>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700 }}>🏥 Medical Summary</h4>
          <div style={{ display: "grid", gap: 8 }}>
            <FRow label="Known Allergies" k="allergies" f={f} u={u} ed={ed} inp={inp} lbl={lbl} />
            <div>
              <label style={lbl}>Notes</label>
              <textarea value={f.medical_notes || ""} onChange={e => u("medical_notes", e.target.value)} disabled={!ed}
                style={{ ...inp, height: 60, resize: "vertical" }} />
            </div>
          </div>
        </div>

        <div style={{ ...card, gridColumn: "span 2" }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700 }}>🔑 Authorised Collection Persons</h4>
          <AuthCollectionList childId={child.id} editable={ed} />
        </div>
      </div>
    </div>
  );
}

function AuthCollectionList({ childId, editable }) {
  const [list, setList] = useState([]);
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState({ name: "", relationship: "", phone: "", photo_id_type: "" });

  useEffect(() => {
    API(`/api/children/${childId}/collection-persons`).then(r => { if (Array.isArray(r)) setList(r); }).catch(() => {});
  }, [childId]);

  const add = async () => {
    let r;
    try { r = await API(`/api/children/${childId}/collection-persons`, { method: "POST", body: nf }); toast("Person added"); }
    catch(e) { toast("Failed to add person.", "error"); return; }
    if (r.id) { setList(p => [...p, r]); setAdding(false); setNf({ name: "", relationship: "", phone: "", photo_id_type: "" }); }
  };
  const remove = async (id) => {
    await API(`/api/children/${childId}/collection-persons/${id}`, { method: "DELETE" });
    setList(p => p.filter(x => x.id !== id));
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {list.map(p => (
          <div key={p.id} style={{ background: "#F8F5F1", borderRadius: 8, padding: "8px 12px", border: "1px solid #E8E0D8", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 18 }}>👤</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</div>
              <div style={{ fontSize: 10, color: "#8A7F96" }}>{p.relationship} · {p.phone}</div>
              {p.photo_id_type && <div style={{ fontSize: 9, color: "#5B8DB5" }}>ID: {p.photo_id_type}</div>}
            </div>
            {editable && <button onClick={() => remove(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#B71C1C", fontSize: 14 }}>✕</button>}
          </div>
        ))}
      </div>
      {editable && !adding && <button onClick={() => setAdding(true)} style={btnS}>+ Add Person</button>}
      {adding && (
        <div style={{ background: lp, borderRadius: 10, padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
          {[["name","Name"],["relationship","Relationship"],["phone","Phone"],["photo_id_type","Photo ID Type"]].map(([k, l]) => (
            <div key={k}><label style={lbl}>{l}</label><input style={inp} value={nf[k]} onChange={e => setNf(p => ({ ...p, [k]: e.target.value }))} /></div>
          ))}
          <button onClick={add} style={btnP}>Add</button>
        </div>
      )}
    </div>
  );
}

// ─── AI FOCUS TAB ────────────────────────────────────────────────────────────
function FocusTab({ child }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");

  const analyse = async () => {
    setLoading(true);
    try {
      const r = await API(`/api/children/${child.id}/ai-focus`, { method: "POST" });
      setData(r);
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => {
    API(`/api/children/${child.id}/focus`).then(r => { if (r.focus) setData(r); }).catch(() => {});
    API(`/api/children/${child.id}/educator-notes`).then(r => { if (Array.isArray(r)) setNotes(r); }).catch(() => {});
  }, [child.id]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    const r = await API(`/api/children/${child.id}/educator-notes`, { method: "POST", body: { note: newNote } }); if (!r.error) toast("Note saved");
    if (r.id) { setNotes(p => [r, ...p]); setNewNote(""); }
  };

  const EYLF_OUTCOMES = [
    { id: 1, label: "Strong Sense of Identity", icon: "🧑" },
    { id: 2, label: "Connected with Community", icon: "🤝" },
    { id: 3, label: "Strong Sense of Wellbeing", icon: "💚" },
    { id: 4, label: "Confident & Involved Learner", icon: "🌟" },
    { id: 5, label: "Effective Communicator", icon: "💬" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* AI Analysis */}
        <div style={{ gridColumn: "span 2", ...card, background: "linear-gradient(135deg,#EDE4F0,#E8F0F5)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>🧠 AI Focus Analysis</h4>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#5C4E6A" }}>
                Analysed from attendance patterns, event log, observations and educator notes
              </p>
            </div>
            <button onClick={analyse} disabled={loading} style={btnP}>{loading ? "Analysing…" : "🔄 Run Analysis"}</button>
          </div>

          {data?.focus ? (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12 }}>
                {(data.focus.areas || []).map((area, i) => (
                  <div key={i} style={{ background: "#fff", borderRadius: 10, padding: "10px 14px", border: "1px solid #E0D8F0" }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{area.icon || "📌"}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#3D3248" }}>{area.title}</div>
                    <div style={{ fontSize: 11, color: "#5C4E6A", marginTop: 4, lineHeight: 1.5 }}>{area.description}</div>
                    <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8, background: area.priority === "high" ? "#FFEBEE" : area.priority === "medium" ? "#FFF8E1" : "#E8F5E9",
                      fontSize: 10, fontWeight: 700, color: area.priority === "high" ? "#B71C1C" : area.priority === "medium" ? "#E65100" : "#2E7D32" }}>
                      {area.priority?.toUpperCase()} PRIORITY
                    </div>
                  </div>
                ))}
              </div>

              {/* AI Reasoning */}
              <div style={{ background: "rgba(139,109,175,0.06)", borderRadius: 10, padding: "10px 14px", border: "1px solid rgba(139,109,175,0.15)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: purple, marginBottom: 6 }}>🔍 How AI reached these conclusions</div>
                <div style={{ fontSize: 11, color: "#5C4E6A", lineHeight: 1.7 }}>{data.reasoning || "Analysis based on attendance frequency, punctuality patterns, educator observations, and developmental milestones compared to age norms."}</div>
              </div>

              {/* EYLF Outcomes progress */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#3D3248", marginBottom: 8 }}>EYLF Outcome Progress</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
                  {EYLF_OUTCOMES.map(o => {
                    const score = (data.eylf || {})[o.id] || 0;
                    return (
                      <div key={o.id} style={{ textAlign: "center", padding: "8px 6px", background: "#fff", borderRadius: 8, border: "1px solid #EDE8F4" }}>
                        <div style={{ fontSize: 18 }}>{o.icon}</div>
                        <div style={{ fontSize: 9, color: "#8A7F96", marginTop: 2, lineHeight: 1.3 }}>{o.label}</div>
                        <div style={{ marginTop: 6, background: "#EDE8F4", borderRadius: 20, height: 6, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 20, background: score > 70 ? "#2E7D32" : score > 40 ? "#E65100" : "#B71C1C", width: `${score}%`, transition: "width 0.4s" }} />
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: purple, marginTop: 2 }}>{score}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#B0AAB9", fontSize: 13 }}>
              Click "Run Analysis" to generate AI focus areas and EYLF outcome progress for {child.first_name}
            </div>
          )}
        </div>

        {/* Educator Notes */}
        <div style={{ gridColumn: "span 2", ...card }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700 }}>📝 Educator Notes</h4>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add an educator observation or note..."
              style={{ ...inp, height: 52, resize: "none", flex: 1 }} />
            <button onClick={addNote} style={{ ...btnP, alignSelf: "flex-end" }}>Add Note</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {notes.length === 0 ? (
              <div style={{ textAlign: "center", padding: 20, color: "#B0AAB9", fontSize: 12 }}>No educator notes yet</div>
            ) : notes.map(n => (
              <div key={n.id} style={{ background: "#FDFBF9", borderRadius: 8, padding: "10px 12px", border: "1px solid #EDE8F4" }}>
                <div style={{ fontSize: 12, color: "#3D3248", lineHeight: 1.6 }}>{n.note}</div>
                <div style={{ fontSize: 10, color: "#B0AAB9", marginTop: 4 }}>{n.educator_name || "Educator"} · {fmtDate(n.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ATTENDANCE TAB ──────────────────────────────────────────────────────────
function AttendanceTab({ child }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    API(`/api/children/${child.id}/attendance-summary`).then(r => { if (r) setData(r); }).catch(() => {});
  }, [child.id]);

  const DAYS = ["Mon","Tue","Wed","Thu","Fri"];

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 14 }}>
        {[
          { label: "Total Days", value: data?.total_days || 0, icon: "📅", color: purple },
          { label: "Absences", value: data?.absences || 0, icon: "❌", color: "#B71C1C" },
          { label: "Early Arrivals", value: `${data?.early_pct || 0}%`, icon: "⏰", color: "#2E7D32" },
          { label: "Late Departures", value: `${data?.late_pct || 0}%`, icon: "🕐", color: "#E65100" },
        ].map(s => (
          <div key={s.label} style={{ ...card, textAlign: "center", padding: "16px 12px" }}>
            <div style={{ fontSize: 22 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, marginTop: 4 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#8A7F96" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* Day-of-week patterns */}
        <div style={card}>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700 }}>📊 Day-of-Week Pattern</h4>
          <div style={{ display: "flex", gap: 6 }}>
            {DAYS.map(d => {
              const pct = data?.day_patterns?.[d.toLowerCase()] || 0;
              return (
                <div key={d} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ height: 80, background: "#EDE8F4", borderRadius: 6, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: purple, borderRadius: "6px 6px 0 0", height: `${pct}%` }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#8A7F96", marginTop: 3 }}>{d}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: purple }}>{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Arrival/departure stats */}
        <div style={card}>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700 }}>🕐 Arrival & Departure Stats</h4>
          {[
            { label: "Avg Arrival", value: data?.avg_arrival || "07:45" },
            { label: "Avg Departure", value: data?.avg_departure || "16:30" },
            { label: "Earliest Arrival", value: data?.earliest_arrival || "07:00" },
            { label: "Latest Departure", value: data?.latest_departure || "18:30" },
          ].map(s => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F5F0FB" }}>
              <span style={{ fontSize: 12, color: "#8A7F96" }}>{s.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#3D3248" }}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* Recent attendance */}
        <div style={{ ...card, gridColumn: "span 2" }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700 }}>📋 Recent Attendance</h4>
          <AttendanceGrid childId={child.id} />
        </div>
      </div>
    </div>
  );
}

function AttendanceGrid({ childId }) {
  const [records, setRecords] = useState([]);
  useEffect(() => {
    API(`/api/children/${childId}/attendance?limit=20`).then(r => { if (Array.isArray(r)) setRecords(r); }).catch(() => {});
  }, [childId]);

  if (!records.length) return <div style={{ textAlign: "center", padding: 20, color: "#B0AAB9", fontSize: 12 }}>No attendance records</div>;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: "2px solid #EDE8F4" }}>
          {["Date","Arrival","Departure","Hours","Status"].map(h => (
            <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, color: "#8A7F96", fontWeight: 700, textTransform: "uppercase" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {records.map((r, i) => (
          <tr key={i} style={{ borderBottom: "1px solid #F5F0FB" }}>
            <td style={{ padding: "7px 10px", color: "#3D3248", fontWeight: 500 }}>{fmtDate(r.date)}</td>
            <td style={{ padding: "7px 10px" }}>{r.sign_in || "—"}</td>
            <td style={{ padding: "7px 10px" }}>{r.sign_out || "—"}</td>
            <td style={{ padding: "7px 10px", fontWeight: 700, color: purple }}>{r.hours?.toFixed(1) || "—"}h</td>
            <td style={{ padding: "7px 10px" }}>
              <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                background: r.status === "absent" ? "#FFEBEE" : r.status === "late" ? "#FFF8E1" : "#E8F5E9",
                color: r.status === "absent" ? "#B71C1C" : r.status === "late" ? "#E65100" : "#2E7D32" }}>
                {r.status || "present"}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── MEDICAL TAB ─────────────────────────────────────────────────────────────
function MedicalTab({ child, onSaved }) {
  const [medications, setMedications] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [showAddMed, setShowAddMed] = useState(false);
  const [showAddEq, setShowAddEq] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, e] = await Promise.all([
        API(`/api/children/${child.id}/medications`),
        API(`/api/children/${child.id}/equipment`),
      ]);
      if (Array.isArray(m)) setMedications(m);
      if (Array.isArray(e)) setEquipment(e);
    } catch (err) {}
  }, [child.id]);

  useEffect(() => { load(); }, [load]);

  const isExpiringSoon = (date) => {
    if (!date) return false;
    const d = new Date(date), now = new Date();
    return (d - now) / (1000 * 60 * 60 * 24) <= 30;
  };

  return (
    <div>
      {/* Medical Plans section */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>📋 Medical & Anaphylaxis Plans</h4>
        </div>
        <MedicalPlansSection child={child} />
      </div>

      {/* Medication Register */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>💊 Medication Register</h4>
          <button onClick={() => setShowAddMed(true)} style={btnS}>+ Add Medication</button>
        </div>
        {medications.length === 0 ? (
          <div style={{ textAlign: "center", padding: 20, color: "#B0AAB9", fontSize: 12 }}>No medications registered</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #EDE8F4" }}>
                {["Medication","Dose","Frequency","Location","Expiry","Status"].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, color: "#8A7F96", fontWeight: 700, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {medications.map(m => (
                <tr key={m.id} style={{ borderBottom: "1px solid #F5F0FB", background: isExpiringSoon(m.expiry_date) ? "#FFF8E1" : "transparent" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 700, color: "#3D3248" }}>{m.name}</td>
                  <td style={{ padding: "8px 10px" }}>{m.dose || m.dosage || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{m.frequency || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{m.location || "—"}</td>
                  <td style={{ padding: "8px 10px", color: isExpiringSoon(m.expiry_date) ? "#E65100" : "#3D3248", fontWeight: isExpiringSoon(m.expiry_date) ? 700 : 400 }}>
                    {fmtDate(m.expiry_date)}
                    {isExpiringSoon(m.expiry_date) && <span style={{ marginLeft: 4, fontSize: 10 }}>⚠ Expiring</span>}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                      background: m.active ? "#E8F5E9" : "#F5F5F5", color: m.active ? "#2E7D32" : "#9E9E9E" }}>
                      {m.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {showAddMed && <MedicationForm childId={child.id} onSaved={() => { setShowAddMed(false); load(); }} onClose={() => setShowAddMed(false)} />}
      </div>

      {/* Equipment Register */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>🩺 Equipment Register</h4>
          <button onClick={() => setShowAddEq(true)} style={btnS}>+ Add Equipment</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {equipment.length === 0 ? (
            <div style={{ width: "100%", textAlign: "center", padding: 20, color: "#B0AAB9", fontSize: 12 }}>No equipment registered (e.g. EpiPen, inhaler)</div>
          ) : equipment.map(eq => (
            <div key={eq.id} style={{ background: "#FDFBF9", borderRadius: 8, padding: "10px 14px", border: `1px solid ${isExpiringSoon(eq.expiry_date) ? "#FFCC80" : "#EDE8F4"}` }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: "#3D3248" }}>{eq.name}</div>
              <div style={{ fontSize: 10, color: "#8A7F96" }}>Location: {eq.location || "—"}</div>
              {eq.expiry_date && <div style={{ fontSize: 10, color: isExpiringSoon(eq.expiry_date) ? "#E65100" : "#8A7F96", fontWeight: isExpiringSoon(eq.expiry_date) ? 700 : 400 }}>
                Expires: {fmtDate(eq.expiry_date)} {isExpiringSoon(eq.expiry_date) && "⚠"}
              </div>}
            </div>
          ))}
        </div>
        {showAddEq && <EquipmentForm childId={child.id} onSaved={() => { setShowAddEq(false); load(); }} onClose={() => setShowAddEq(false)} />}
      </div>
    </div>
  );
}

function MedicalPlansSection({ child }) {
  const [plans, setPlans] = useState([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    API(`/api/children/${child.id}/medical-plans`).then(r => { if (Array.isArray(r)) setPlans(r); }).catch(() => {});
  }, [child.id]);

  const add = async (f) => {
    let r;
    try { r = await API(`/api/children/${child.id}/medical-plans`, { method: "POST", body: f }); if(r.error){alert(r.error);return;} }
    catch(e) { toast("Failed to save medical plan.", "error"); return; }
    if (r.id) { setPlans(p => [...p, r]); setShowAdd(false); }
  };

  const PLAN_TYPES = [
    { id: "anaphylaxis", label: "Anaphylaxis Action Plan", icon: "⚠️", color: "#B71C1C" },
    { id: "asthma", label: "Asthma Action Plan", icon: "🫁", color: "#1565C0" },
    { id: "diabetes", label: "Diabetes Management Plan", icon: "🩸", color: "#4A148C" },
    { id: "general", label: "General Medical Plan", icon: "📋", color: "#2E7D32" },
    { id: "risk_minimisation", label: "Risk Minimisation Plan", icon: "🛡️", color: "#E65100" },
    { id: "communication", label: "Medical Communication Plan", icon: "📢", color: "#7E5BA3" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12 }}>
        {PLAN_TYPES.map(pt => {
          const plan = plans.find(p => p.plan_type === pt.id);
          const expiring = plan?.expiry_date && (new Date(plan.expiry_date) - new Date()) / (1000*60*60*24) <= 30;
          return (
            <div key={pt.id} style={{ background: plan ? "#fff" : "#FAFAFA", borderRadius: 10, padding: "10px 14px",
              border: `1px solid ${plan ? pt.color + "40" : "#EDE8F4"}`,
              borderLeft: `4px solid ${plan ? pt.color : "#EDE8F4"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontSize: 18 }}>{pt.icon}</div>
                {plan ? (
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 10, background: expiring ? "#FFF3E0" : "#E8F5E9",
                    color: expiring ? "#E65100" : "#2E7D32", fontWeight: 700 }}>{expiring ? "EXPIRING" : "✓ ACTIVE"}</span>
                ) : (
                  <span style={{ fontSize: 9, color: "#B0AAB9" }}>NOT ON FILE</span>
                )}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#3D3248", marginTop: 4 }}>{pt.label}</div>
              {plan && (
                <div style={{ fontSize: 10, color: "#8A7F96", marginTop: 2 }}>
                  Expires: {fmtDate(plan.expiry_date)}
                  {plan.document_url && <a href={plan.document_url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 6, color: purple }}>View</a>}
                </div>
              )}
              {!plan && pt.id === "anaphylaxis" && (child.allergies?.toLowerCase().includes("anaphyl") || child.allergies?.toLowerCase().includes("peanut") || child.allergies?.toLowerCase().includes("nut")) && (
                <div style={{ fontSize: 9, color: "#B71C1C", fontWeight: 700, marginTop: 4 }}>⚠ Allergy on file — plan required!</div>
              )}
            </div>
          );
        })}
      </div>
      <button onClick={() => setShowAdd(true)} style={btnS}>+ Upload / Add Medical Plan</button>
      {showAdd && (
        <div style={{ marginTop: 12, background: lp, borderRadius: 10, padding: 14 }}>
          <MedicalPlanForm planTypes={PLAN_TYPES} onSave={add} onClose={() => setShowAdd(false)} />
        </div>
      )}
    </div>
  );
}

function MedicalPlanForm({ planTypes, onSave, onClose }) {
  const [f, setF] = useState({ plan_type: "general", expiry_date: "", notes: "" });
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
      <div>
        <label style={lbl}>Plan Type</label>
        <select style={inp} value={f.plan_type} onChange={e => setF(p => ({ ...p, plan_type: e.target.value }))}>
          {planTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.label}</option>)}
        </select>
      </div>
      <div>
        <label style={lbl}>Expiry Date</label>
        <DatePicker value={f.expiry_date} onChange={v => setF(p => ({ ...p, expiry_date: v }))}/>
      </div>
      <div>
        <label style={lbl}>Notes</label>
        <input style={inp} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} placeholder="Optional" />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => onSave(f)} style={btnP}>Save</button>
        <button onClick={onClose} style={btnS}>✕</button>
      </div>
    </div>
  );
}

function MedicationForm({ childId, onSaved, onClose }) {
  const [f, setF] = useState({ name: "", dose: "", frequency: "", location: "", expiry_date: "", instructions: "", active: true });
  const save = async () => {
    let r;
    try { r = await API(`/api/children/${childId}/medications`, { method: "POST", body: f }); if(r.error){alert(r.error);return;} }
    catch(e) { toast("Failed to save medication.", "error"); return; }
    if (r.id) onSaved();
  };
  return (
    <div style={{ marginTop: 12, background: lp, borderRadius: 10, padding: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
        {[["name","Medication Name"],["dose","Dose"],["frequency","Frequency"],["location","Storage Location"],["expiry_date","Expiry Date","date"],["instructions","Instructions"]].map(([k, l, t]) => (
          <div key={k}>
            <label style={lbl}>{l}</label>
            <input type={t || "text"} style={inp} value={f[k] || ""} onChange={e => setF(p => ({ ...p, [k]: e.target.value }))} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnS}>Cancel</button>
        <button onClick={save} style={btnP}>Save Medication</button>
      </div>
    </div>
  );
}

function EquipmentForm({ childId, onSaved, onClose }) {
  const [f, setF] = useState({ name: "", location: "", expiry_date: "", notes: "" });
  const save = async () => {
    let r;
    try { r = await API(`/api/children/${childId}/equipment`, { method: "POST", body: f }); if(r.error){alert(r.error);return;} }
    catch(e) { toast("Failed to save equipment.", "error"); return; }
    if (r.id) onSaved();
  };
  return (
    <div style={{ marginTop: 12, background: lp, borderRadius: 10, padding: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
        {[["name","Equipment Name"],["location","Location"],["expiry_date","Expiry","date"]].map(([k, l, t]) => (
          <div key={k}>
            <label style={lbl}>{l}</label>
            <input type={t || "text"} style={inp} value={f[k] || ""} onChange={e => setF(p => ({ ...p, [k]: e.target.value }))} />
          </div>
        ))}
        <button onClick={save} style={{ ...btnP, alignSelf: "flex-end" }}>Save</button>
      </div>
    </div>
  );
}

// ─── DIETARY TAB ─────────────────────────────────────────────────────────────
function DietaryTab({ child, onSaved }) {
  const [reqs, setReqs] = useState([]);
  const [parReqs, setParReqs] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddPar, setShowAddPar] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([
        API(`/api/children/${child.id}/dietary`),
        API(`/api/children/${child.id}/parental-requests`),
      ]);
      if (Array.isArray(d)) setReqs(d);
      if (Array.isArray(p)) setParReqs(p);
    } catch (e) {}
  }, [child.id]);

  useEffect(() => { load(); }, [load]);

  const SEVERITY = { anaphylactic: { color: "#B71C1C", bg: "#FFEBEE", label: "ANAPHYLACTIC" }, severe: { color: "#E65100", bg: "#FFF3E0", label: "SEVERE" }, moderate: { color: "#F57C00", bg: "#FFF8E1", label: "MODERATE" }, mild: { color: "#2E7D32", bg: "#E8F5E9", label: "MILD" }, preference: { color: "#5B8DB5", bg: "#E3F2FD", label: "PREFERENCE" } };

  return (
    <div>
      {/* Dietary Requirements */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>🥗 Dietary Requirements & Allergies</h4>
          <button onClick={() => setShowAdd(true)} style={btnS}>+ Add Requirement</button>
        </div>
        {reqs.length === 0 ? (
          <div style={{ textAlign: "center", padding: 20, color: "#B0AAB9", fontSize: 12 }}>No dietary requirements on file</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {reqs.map(r => {
              const sev = SEVERITY[r.severity] || SEVERITY.mild;
              return (
                <div key={r.id} style={{ background: sev.bg, borderRadius: 10, padding: "12px 16px", border: `1px solid ${sev.color}30`, borderLeft: `4px solid ${sev.color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: 13, color: "#3D3248" }}>{r.name}</span>
                        <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: sev.color, color: "#fff" }}>{sev.label}</span>
                        {r.is_anaphylactic && <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 9, fontWeight: 700, background: "#B71C1C", color: "#fff" }}>⚠ ANAPHYLACTIC</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#5C4E6A", marginTop: 4 }}>{r.description || r.notes}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontSize: 10, color: "#8A7F96" }}>{r.category}</div>
                      {r.mrmp_attached && <div style={{ fontSize: 10, color: "#2E7D32", fontWeight: 700, marginTop: 2 }}>✓ MRMP on file</div>}
                      {r.mcp_attached && <div style={{ fontSize: 10, color: "#7E5BA3", fontWeight: 700, marginTop: 2 }}>✓ MCP on file</div>}
                    </div>
                  </div>
                  {r.action_required && (
                    <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8, background: "rgba(183,28,28,0.08)", fontSize: 11, color: "#B71C1C" }}>
                      <strong>Action:</strong> {r.action_required}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {showAdd && <DietaryForm childId={child.id} onSaved={() => { setShowAdd(false); load(); }} onClose={() => setShowAdd(false)} />}
      </div>

      {/* Parental Requests */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>🙏 Parental Requests & Cultural Requirements</h4>
          <button onClick={() => setShowAddPar(true)} style={btnS}>+ Add Request</button>
        </div>
        {parReqs.length === 0 ? (
          <div style={{ textAlign: "center", padding: 20, color: "#B0AAB9", fontSize: 12 }}>No parental requests on file</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {parReqs.map(r => (
              <div key={r.id} style={{ background: "#F8F5F1", borderRadius: 8, padding: "10px 14px", border: "1px solid #E8E0D8" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#3D3248" }}>{r.category}: {r.title}</div>
                    <div style={{ fontSize: 11, color: "#5C4E6A", marginTop: 3, lineHeight: 1.5 }}>{r.description}</div>
                  </div>
                  <span style={{ fontSize: 9, padding: "3px 8px", borderRadius: 10, background: r.active ? lp : "#F5F5F5", color: r.active ? purple : "#9E9E9E", fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>
                    {r.active ? "ACTIVE" : "INACTIVE"}
                  </span>
                </div>
                {r.acknowledged_by && <div style={{ fontSize: 10, color: "#2E7D32", marginTop: 4 }}>✓ Acknowledged by {r.acknowledged_by}</div>}
              </div>
            ))}
          </div>
        )}
        {showAddPar && <ParentalRequestForm childId={child.id} onSaved={() => { setShowAddPar(false); load(); }} onClose={() => setShowAddPar(false)} />}
      </div>
    </div>
  );
}

function DietaryForm({ childId, onSaved, onClose }) {
  const [f, setF] = useState({ name: "", category: "allergy", severity: "mild", description: "", is_anaphylactic: false, risk_minimisation_plan_url: "", risk_minimisation_plan_date: "", medical_communication_plan_url: "", medical_communication_plan_date: "", action_required: "" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!f.name.trim()) { alert("Name is required"); return; }
    setSaving(true);
    let r;
    try { r = await API(`/api/children/${childId}/dietary`, { method: "POST", body: f }); if(r.error){alert(r.error);return;} }
    catch(e) { toast("Failed to save dietary requirement.", "error"); return; }
    setSaving(false);
    if (r.id) onSaved();
  };
  return (
    <div style={{ marginTop: 12, background: lp, borderRadius: 12, padding: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div><label style={lbl}>Name / Allergen *</label><input style={inp} value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Peanut Allergy, Halal, Vegan" /></div>
        <div><label style={lbl}>Category</label>
          <select style={inp} value={f.category} onChange={e => setF(p => ({ ...p, category: e.target.value }))}>
            <option value="allergy">Medical Allergy</option><option value="intolerance">Intolerance</option>
            <option value="religious">Religious/Cultural</option><option value="lifestyle">Lifestyle</option><option value="other">Other</option>
          </select>
        </div>
        <div><label style={lbl}>Severity</label>
          <select style={inp} value={f.severity} onChange={e => setF(p => ({ ...p, severity: e.target.value }))}>
            <option value="anaphylactic">Anaphylactic</option><option value="severe">Severe</option>
            <option value="moderate">Moderate</option><option value="mild">Mild</option><option value="preference">Preference</option>
          </select>
        </div>
        <div style={{ gridColumn: "span 3" }}><label style={lbl}>Description / Notes</label><textarea style={{ ...inp, height: 48, resize: "none" }} value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} /></div>
        <div><label style={lbl}>Emergency Action</label><input style={inp} value={f.action_required} onChange={e => setF(p => ({ ...p, action_required: e.target.value }))} placeholder="e.g. Use EpiPen, call 000" /></div>
        <div style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: 6, justifyContent: "center", paddingTop: 16 }}>
          <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={!!f.is_anaphylactic} onChange={e => setF(p => ({ ...p, is_anaphylactic: e.target.checked, severity: e.target.checked ? "anaphylactic" : p.severity }))} />
            ⚠ <strong>Anaphylactic Risk</strong> — EpiPen required
          </label>
        </div>

        {/* Plan attachment fields shown when anaphylactic is ticked */}
        {f.is_anaphylactic && (
          <>
            <div style={{ gridColumn: "span 3", background: "#FFEBEE", borderRadius: 8, padding: "12px 14px", border: "1px solid #FFCDD2" }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: "#B71C1C", marginBottom: 8 }}>⚠ Anaphylaxis Plans Required (ACECQA / ACCC Regulation 90)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                <div style={{ gridColumn: "span 2" }}>
                  <label style={lbl}>Medical Risk Minimisation Plan — Document URL</label>
                  <input style={inp} value={f.risk_minimisation_plan_url} onChange={e => setF(p => ({ ...p, risk_minimisation_plan_url: e.target.value }))} placeholder="https://… or filename if uploaded to Documents" />
                </div>
                <div>
                  <label style={lbl}>MRMP Date</label>
                  <DatePicker value={f.risk_minimisation_plan_date} onChange={v => setF(p => ({ ...p, risk_minimisation_plan_date: v }))}/>
                </div>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <label style={{ fontSize: 10, color: "#2E7D32", fontWeight: 700 }}>
                    {f.risk_minimisation_plan_url ? "✓ Plan linked" : "⚠ Plan not yet uploaded"}
                  </label>
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <label style={lbl}>Medical Communication Plan — Document URL</label>
                  <input style={inp} value={f.medical_communication_plan_url} onChange={e => setF(p => ({ ...p, medical_communication_plan_url: e.target.value }))} placeholder="https://… or filename if uploaded to Documents" />
                </div>
                <div>
                  <label style={lbl}>MCP Date</label>
                  <DatePicker value={f.medical_communication_plan_date} onChange={v => setF(p => ({ ...p, medical_communication_plan_date: v }))}/>
                </div>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <label style={{ fontSize: 10, color: "#2E7D32", fontWeight: 700 }}>
                    {f.medical_communication_plan_url ? "✓ Plan linked" : "⚠ Plan not yet uploaded"}
                  </label>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnS}>Cancel</button>
        <button onClick={save} disabled={saving} style={btnP}>{saving ? "Saving…" : "Save Requirement"}</button>
      </div>
    </div>
  );
}

function ParentalRequestForm({ childId, onSaved, onClose }) {
  const [f, setF] = useState({ category: "cultural", title: "", description: "", active: true });
  const save = async () => {
    let r;
    try { r = await API(`/api/children/${childId}/parental-requests`, { method: "POST", body: f }); if(r.error){alert(r.error);return;} }
    catch(e) { toast("Failed to save request.", "error"); return; }
    if (r.id) onSaved();
  };
  return (
    <div style={{ marginTop: 12, background: lp, borderRadius: 12, padding: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div><label style={lbl}>Category</label>
          <select style={inp} value={f.category} onChange={e => setF(p => ({ ...p, category: e.target.value }))}>
            <option value="cultural">Cultural</option><option value="religious">Religious</option>
            <option value="medical">Medical Preference</option><option value="activity">Activity Restriction</option><option value="other">Other</option>
          </select>
        </div>
        <div><label style={lbl}>Title</label><input style={inp} value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} placeholder="Brief title" /></div>
        <div style={{ gridColumn: "span 3" }}><label style={lbl}>Full Description</label><textarea style={{ ...inp, height: 60, resize: "none" }} value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
        <button onClick={onClose} style={btnS}>Cancel</button>
        <button onClick={save} style={btnP}>Save Request</button>
      </div>
    </div>
  );
}

// ─── IMMUNISATION TAB ────────────────────────────────────────────────────────
function ImmunisationTab({ child }) {
  const [records, setRecords] = useState([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    API(`/api/children/${child.id}/immunisations`).then(r => { if (Array.isArray(r)) setRecords(r); }).catch(() => {});
  }, [child.id]);

  const SCHEDULE = [
    { age: "Birth", vaccines: ["Hepatitis B"] },
    { age: "2 months", vaccines: ["Hep B","Rotavirus","DTaP","Hib","IPV","PCV13"] },
    { age: "4 months", vaccines: ["Rotavirus","DTaP","Hib","IPV","PCV13"] },
    { age: "6 months", vaccines: ["Hep B","Rotavirus","DTaP","Hib","IPV","Influenza"] },
    { age: "12 months", vaccines: ["MMR","Varicella","PCV13","Hep A"] },
    { age: "15 months", vaccines: ["Hib","PCV13","DTaP"] },
    { age: "18 months", vaccines: ["Hep A","Influenza"] },
    { age: "2 years", vaccines: ["Influenza"] },
    { age: "4–6 years", vaccines: ["DTaP","IPV","MMR","Varicella","Influenza"] },
  ];

  const given = (vaccine) => records.some(r => r.vaccine_name?.toLowerCase().includes(vaccine.toLowerCase()) && r.given);
  const upcoming = (vaccine) => records.some(r => r.vaccine_name?.toLowerCase().includes(vaccine.toLowerCase()) && !r.given && r.due_date);

  const addRecord = async (f) => {
    let r;
    try { r = await API(`/api/children/${child.id}/immunisations`, { method: "POST", body: f }); if(r.error){alert(r.error);return;} }
    catch(e) { toast("Failed to save immunisation.", "error"); return; }
    if (r.id) { setRecords(p => [...p, r]); setShowAdd(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>💉 Immunisation Schedule & Records</h4>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "#8A7F96" }}>National Immunisation Program schedule — automatic reminders sent to family 30 days before due</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={btnS}>+ Add Record</button>
      </div>

      {/* Schedule overview */}
      <div style={card}>
        <h4 style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700 }}>NIP Schedule Overview</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SCHEDULE.map(s => (
            <div key={s.age} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 90, fontSize: 11, fontWeight: 700, color: "#5C4E6A", flexShrink: 0, paddingTop: 4 }}>{s.age}</div>
              <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 5 }}>
                {s.vaccines.map(v => {
                  const done = given(v), due = upcoming(v);
                  return (
                    <span key={v} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, fontWeight: 600,
                      background: done ? "#E8F5E9" : due ? "#FFF3E0" : "#F5F5F5",
                      color: done ? "#2E7D32" : due ? "#E65100" : "#8A7F96",
                      border: `1px solid ${done ? "#A5D6A7" : due ? "#FFCC80" : "#E0E0E0"}` }}>
                      {done ? "✓" : due ? "⏰" : ""} {v}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Records table */}
      {records.length > 0 && (
        <div style={card}>
          <h4 style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700 }}>Recorded Immunisations</h4>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #EDE8F4" }}>
                {["Vaccine","Given Date","Due Date","Batch #","Provider","Status"].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, color: "#8A7F96", fontWeight: 700, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid #F5F0FB" }}>
                  <td style={{ padding: "7px 10px", fontWeight: 700, color: "#3D3248" }}>{r.vaccine_name}</td>
                  <td style={{ padding: "7px 10px" }}>{fmtDate(r.given_date || r.date_given)}</td>
                  <td style={{ padding: "7px 10px", color: r.due_date && new Date(r.due_date) < new Date() && !r.given ? "#B71C1C" : "#3D3248" }}>{fmtDate(r.due_date)}</td>
                  <td style={{ padding: "7px 10px" }}>{r.batch_number || "—"}</td>
                  <td style={{ padding: "7px 10px" }}>{r.provider || "—"}</td>
                  <td style={{ padding: "7px 10px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                      background: r.given ? "#E8F5E9" : "#FFF3E0", color: r.given ? "#2E7D32" : "#E65100" }}>
                      {r.given ? "Given" : "Due"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div style={{ ...card, background: lp }}>
          <ImmunisationForm onSave={addRecord} onClose={() => setShowAdd(false)} />
        </div>
      )}
    </div>
  );
}

function ImmunisationForm({ onSave, onClose }) {
  const [f, setF] = useState({ vaccine_name: "", given: true, given_date: "", due_date: "", batch_number: "", provider: "", notes: "" });
  return (
    <div>
      <h4 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700 }}>Add Immunisation Record</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div><label style={lbl}>Vaccine Name</label><input style={inp} value={f.vaccine_name} onChange={e => setF(p => ({ ...p, vaccine_name: e.target.value }))} /></div>
        <div><label style={lbl}>Given Date</label><DatePicker value={f.given_date} onChange={v => setF(p => ({ ...p, given_date: v }))}/></div>
        <div><label style={lbl}>Due Date</label><DatePicker value={f.due_date} onChange={v => setF(p => ({ ...p, due_date: v }))}/></div>
        <div><label style={lbl}>Batch #</label><input style={inp} value={f.batch_number} onChange={e => setF(p => ({ ...p, batch_number: e.target.value }))} /></div>
        <div><label style={lbl}>Provider</label><input style={inp} value={f.provider} onChange={e => setF(p => ({ ...p, provider: e.target.value }))} /></div>
        <div style={{ display: "flex", alignItems: "center", paddingTop: 18 }}>
          <label style={{ fontSize: 12, display: "flex", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={f.given} onChange={e => setF(p => ({ ...p, given: e.target.checked }))} /> Already given
          </label>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnS}>Cancel</button>
        <button onClick={() => onSave(f)} style={btnP}>Save Record</button>
      </div>
    </div>
  );
}

// ─── PERMISSIONS TAB ─────────────────────────────────────────────────────────
function PermissionsTab({ child }) {
  const [perms, setPerms] = useState([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    API(`/api/children/${child.id}/permissions`).then(r => { if (Array.isArray(r)) setPerms(r); }).catch(() => {});
  }, [child.id]);

  const ONGOING_PERMS = [
    { id: "panadol", label: "Administer Panadol", icon: "💊", description: "Centre may administer Panadol when child has fever/pain" },
    { id: "sunscreen", label: "Apply Sunscreen", icon: "☀️", description: "Educators may apply SPF 50+ sunscreen" },
    { id: "social_media", label: "Social Media Use", icon: "📸", description: "Photos/videos may be used on centre's social media" },
    { id: "transport", label: "Excursion Transport", icon: "🚌", description: "Permission for transportation on centre excursions" },
    { id: "water_play", label: "Water Play", icon: "💧", description: "May participate in supervised water play activities" },
    { id: "photos_internal", label: "Photography — Internal", icon: "📷", description: "Photos for internal documentation and learning journey" },
    { id: "first_aid", label: "First Aid Treatment", icon: "🩹", description: "Authorise educators to administer first aid" },
    { id: "sharing_info", label: "Information Sharing", icon: "📤", description: "Share relevant child information with allied health providers" },
  ];

  const toggle = async (permType, currentVal) => {
    const existing = perms.find(p => p.permission_type === permType);
    if (existing) {
      const r = await API(`/api/children/${child.id}/permissions/${existing.id}`, { method: "PUT", body: { granted: !currentVal } }).catch(e=>console.error('API error:',e));
      if (r.id) setPerms(prev => prev.map(p => p.id === r.id ? r : p));
    } else {
      const r = await API(`/api/children/${child.id}/permissions`, { method: "POST", body: { permission_type: permType, granted: true } }).catch(e=>console.error('API error:',e));
      if (r.id) setPerms(p => [...p, r]);
    }
  };

  return (
    <div>
      {/* Ongoing permissions */}
      <div style={card}>
        <h4 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700 }}>✅ Ongoing Permissions</h4>
        <p style={{ margin: "0 0 14px", fontSize: 11, color: "#8A7F96" }}>Standing permissions granted by parent/guardian. Updated date logged in audit trail.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {ONGOING_PERMS.map(op => {
            const existing = perms.find(p => p.permission_type === op.id);
            const granted = existing?.granted ?? false;
            return (
              <div key={op.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10,
                background: granted ? "#E8F5E9" : "#F8F5F1", border: `1px solid ${granted ? "#A5D6A7" : "#E8E0D8"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{op.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#3D3248" }}>{op.label}</div>
                    <div style={{ fontSize: 10, color: "#8A7F96" }}>{op.description}</div>
                    {existing?.granted_date && <div style={{ fontSize: 9, color: "#2E7D32" }}>Granted {fmtDate(existing.granted_date)}</div>}
                  </div>
                </div>
                <label style={{ cursor: "pointer", position: "relative", flexShrink: 0 }}>
                  <input type="checkbox" checked={granted} onChange={() => toggle(op.id, granted)} style={{ display: "none" }} />
                  <div style={{ width: 40, height: 22, borderRadius: 11, background: granted ? "#2E7D32" : "#CCC", position: "relative", transition: "background 0.2s" }}>
                    <div style={{ position: "absolute", top: 3, left: granted ? 20 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                  </div>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom / one-time permissions */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>📝 Custom & Excursion Permissions</h4>
          <button onClick={() => setShowAdd(true)} style={btnS}>+ Add Permission</button>
        </div>
        <PermissionsList childId={child.id} perms={perms.filter(p => !ONGOING_PERMS.find(o => o.id === p.permission_type))} onRefresh={() => {
          API(`/api/children/${child.id}/permissions`).then(r => { if (Array.isArray(r)) setPerms(r); }).catch(() => {});
        }} />
        {showAdd && <CustomPermissionForm childId={child.id} onSaved={() => {
          setShowAdd(false);
          API(`/api/children/${child.id}/permissions`).then(r => { if (Array.isArray(r)) setPerms(r); }).catch(() => {});
        }} onClose={() => setShowAdd(false)} />}
      </div>
    </div>
  );
}

function PermissionsList({ perms }) {
  if (!perms.length) return <div style={{ textAlign: "center", padding: 20, color: "#B0AAB9", fontSize: 12 }}>No custom permissions</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {perms.map(p => (
        <div key={p.id} style={{ background: "#FDFBF9", borderRadius: 8, padding: "8px 12px", border: "1px solid #EDE8F4" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#3D3248" }}>{p.permission_type}</div>
            <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: p.granted ? "#E8F5E9" : "#FFEBEE", color: p.granted ? "#2E7D32" : "#B71C1C", fontWeight: 700 }}>
              {p.granted ? "GRANTED" : "DENIED"}
            </span>
          </div>
          {p.notes && <div style={{ fontSize: 11, color: "#5C4E6A", marginTop: 3 }}>{p.notes}</div>}
          <div style={{ fontSize: 10, color: "#B0AAB9", marginTop: 2 }}>{fmtDate(p.created_at)} · {p.granted_by || "Centre"}</div>
        </div>
      ))}
    </div>
  );
}

function CustomPermissionForm({ childId, onSaved, onClose }) {
  const [f, setF] = useState({ permission_type: "", granted: true, notes: "", expiry_date: "" });
  const save = async () => {
    const r = await API(`/api/children/${childId}/permissions`, { method: "POST", body: f });
    if (r.id) onSaved();
  };
  return (
    <div style={{ marginTop: 12, background: lp, borderRadius: 12, padding: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
        <div><label style={lbl}>Permission Description</label><input style={inp} value={f.permission_type} onChange={e => setF(p => ({ ...p, permission_type: e.target.value }))} placeholder="e.g. Excursion to Taronga Zoo 15 Mar" /></div>
        <div><label style={lbl}>Notes</label><input style={inp} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} /></div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={save} style={btnP}>Save</button>
          <button onClick={onClose} style={btnS}>✕</button>
        </div>
      </div>
    </div>
  );
}

// ─── PAYMENTS TAB ────────────────────────────────────────────────────────────
function PaymentsTab({ child }) {
  const [invoices, setInvoices] = useState([]);
  const [ccs, setCcs] = useState(null);

  useEffect(() => {
    API(`/api/children/${child.id}/invoices`).then(r => { if (Array.isArray(r)) setInvoices(r); }).catch(() => {});
    API(`/api/children/${child.id}/ccs`).then(r => { if (r) setCcs(r); }).catch(() => {});
  }, [child.id]);

  const outstanding = invoices.filter(i => i.status === "unpaid" || i.status === "overdue");
  const paid = invoices.filter(i => i.status === "paid");
  const total_outstanding = outstanding.reduce((a, i) => a + (i.amount_cents || 0), 0);

  return (
    <div>
      {/* CCS Status */}
      <div style={{ ...card, background: ccs?.active ? "linear-gradient(135deg,#E8F5E9,#F1F8E9)" : "linear-gradient(135deg,#FFEBEE,#FFF8E1)", border: `1px solid ${ccs?.active ? "#A5D6A7" : "#FFCDD2"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700 }}>🏛️ Childcare Subsidy (CCS) Status</h4>
            {ccs ? (
              <>
                <div style={{ fontSize: 12, color: "#5C4E6A", marginBottom: 4 }}>
                  CRN: <strong>{child.centrelink_crn || "Not on file"}</strong> · 
                  Status: <strong style={{ color: ccs.active ? "#2E7D32" : "#B71C1C" }}>{ccs.active ? "Active" : "Inactive / Not Applied"}</strong>
                </div>
                {ccs.hours_approved && <div style={{ fontSize: 12, color: "#5C4E6A" }}>Approved hours: <strong>{ccs.hours_approved}hrs/fortnight</strong></div>}
                {!ccs.active && (
                  <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "#FFEBEE", border: "1px solid #FFCDD2", fontSize: 11, color: "#B71C1C", fontWeight: 700 }}>
                    ⚠ CCS not active — full fee applies. Parent notification recommended.
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: "#E65100", fontWeight: 700 }}>
                ⚠ No CCS information on file. CRN: {child.centrelink_crn || "Not provided"}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#8A7F96" }}>Outstanding Balance</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: total_outstanding > 0 ? "#B71C1C" : "#2E7D32" }}>
              ${(total_outstanding / 100).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 14 }}>
        {[
          { label: "Total Invoiced", value: `$${(invoices.reduce((a, i) => a + (i.amount_cents || 0), 0) / 100).toFixed(2)}`, icon: "📄", color: purple },
          { label: "Total Paid", value: `$${(paid.reduce((a, i) => a + (i.amount_cents || 0), 0) / 100).toFixed(2)}`, icon: "✅", color: "#2E7D32" },
          { label: "Overdue", value: outstanding.filter(i => i.status === "overdue").length, icon: "⚠️", color: "#B71C1C" },
        ].map(s => (
          <div key={s.label} style={{ ...card, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 20 }}>{s.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color, marginTop: 4 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#8A7F96" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Invoice list */}
      <div style={card}>
        <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700 }}>Invoice History</h4>
        {invoices.length === 0 ? (
          <div style={{ textAlign: "center", padding: 20, color: "#B0AAB9", fontSize: 12 }}>No invoices yet</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #EDE8F4" }}>
                {["Invoice #","Period","Amount","CCS Applied","Gap Fee","Status","Due"].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, color: "#8A7F96", fontWeight: 700, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.slice(0, 10).map(inv => (
                <tr key={inv.id} style={{ borderBottom: "1px solid #F5F0FB", background: inv.status === "overdue" ? "#FFF8F8" : "transparent" }}>
                  <td style={{ padding: "7px 10px", fontWeight: 700, color: purple }}>{inv.invoice_number}</td>
                  <td style={{ padding: "7px 10px" }}>{fmtDate(inv.period_start)}</td>
                  <td style={{ padding: "7px 10px", fontWeight: 700 }}>${((inv.amount_cents || 0) / 100).toFixed(2)}</td>
                  <td style={{ padding: "7px 10px", color: "#2E7D32" }}>${((inv.ccs_amount_cents || 0) / 100).toFixed(2)}</td>
                  <td style={{ padding: "7px 10px", fontWeight: 700 }}>${((inv.gap_fee_cents || 0) / 100).toFixed(2)}</td>
                  <td style={{ padding: "7px 10px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                      background: inv.status === "paid" ? "#E8F5E9" : inv.status === "overdue" ? "#FFEBEE" : "#FFF3E0",
                      color: inv.status === "paid" ? "#2E7D32" : inv.status === "overdue" ? "#B71C1C" : "#E65100" }}>
                      {inv.status}
                    </span>
                  </td>
                  <td style={{ padding: "7px 10px" }}>{fmtDate(inv.due_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── EVENT LOG TAB ────────────────────────────────────────────────────────────
function EventLogTab({ child }) {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    API(`/api/children/${child.id}/events?type=${filter}`).then(r => {
      if (Array.isArray(r)) setEvents(r);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [child.id, filter]);

  const EVENT_TYPES = { attendance: { icon: "📅", color: "#5B8DB5", label: "Attendance" }, medical: { icon: "💊", color: "#B71C1C", label: "Medical" }, excursion: { icon: "🚌", color: "#E65100", label: "Excursion" }, room_change: { icon: "🚪", color: "#7E5BA3", label: "Room Change" }, room_override: { icon: "⚠️", color: "#E65100", label: "Room Override" }, document: { icon: "📄", color: "#2E7D32", label: "Document" }, permission: { icon: "✅", color: "#2E8B57", label: "Permission" }, incident: { icon: "🩹", color: "#B71C1C", label: "Incident" }, note: { icon: "📝", color: "#8A7F96", label: "Note" }, immunisation: { icon: "💉", color: "#1565C0", label: "Immunisation" }, payment: { icon: "💳", color: "#4A148C", label: "Payment" }, system: { icon: "🔧", color: "#8A7F96", label: "System" } };

  const FILTERS = [["all","All"],["attendance","Attendance"],["medical","Medical"],["document","Documents"],["incident","Incidents"],["permission","Permissions"]];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>📋 Complete Event Log</h4>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "#8A7F96" }}>Full audit trail — all events recorded for compliance and government audit requirements</p>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {FILTERS.map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11,
                background: filter === v ? lp : "#F8F5F1", color: filter === v ? purple : "#6B5F7A", fontWeight: filter === v ? 700 : 500 }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#8A7F96" }}>Loading events...</div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#B0AAB9", fontSize: 13 }}>No events in this category</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {events.map(ev => {
            const type = EVENT_TYPES[ev.event_type] || EVENT_TYPES.system;
            return (
              <div key={ev.id} style={{ display: "flex", gap: 12, padding: "10px 14px", background: "#fff", borderRadius: 10, border: "1px solid #EDE8F4", borderLeft: `4px solid ${type.color}` }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: type.color + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                  {type.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <span style={{ fontSize: 10, background: type.color + "15", color: type.color, borderRadius: 10, padding: "2px 7px", fontWeight: 700 }}>{type.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#3D3248", marginLeft: 8 }}>{ev.description}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#B0AAB9", flexShrink: 0, marginLeft: 8 }}>
                      {new Date(ev.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  {ev.performed_by && <div style={{ fontSize: 10, color: "#8A7F96", marginTop: 2 }}>By: {ev.performed_by}</div>}
                  {ev.details && <div style={{ fontSize: 11, color: "#5C4E6A", marginTop: 4, padding: "5px 8px", background: "#FAFAFA", borderRadius: 6 }}>{typeof ev.details === "string" ? ev.details : JSON.stringify(ev.details, null, 2)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ADD CHILD MODAL ──────────────────────────────────────────────────────────
function AddChildModal({ rooms, onClose, onSaved }) {
  const [f, setF] = useState({ first_name: "", last_name: "", dob: "", room_id: "", parent1_name: "", parent1_email: "", parent1_phone: "", allergies: "None" });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!f.first_name || !f.last_name || !f.dob) return alert("First name, last name and date of birth are required");
    setSaving(true);
    try {
      const r = await API("/api/children", { method: "POST", body: f });
      if (r.error) { alert(r.error); return; }
    } catch(e) { alert('Failed to add child: ' + e.message); return; }
    setSaving(false); onSaved();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 520, maxWidth: "90vw" }}>
        <h3 style={{ margin: "0 0 18px", color: "#3D3248" }}>Add New Child</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[["first_name","First Name"],["last_name","Last Name"]].map(([k, l]) => (
            <div key={k}><label style={lbl}>{l}</label><input style={inp} value={f[k]} onChange={e => setF(p => ({ ...p, [k]: e.target.value }))} /></div>
          ))}
          <div><label style={lbl}>Date of Birth</label><DatePicker value={f.dob} onChange={v => setF(p => ({ ...p, dob: v }))}/></div>
          <div><label style={lbl}>Room</label>
            <select style={inp} value={f.room_id} onChange={e => setF(p => ({ ...p, room_id: e.target.value }))}>
              <option value="">Unassigned</option>{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Parent / Guardian</label><input style={inp} value={f.parent1_name} onChange={e => setF(p => ({ ...p, parent1_name: e.target.value }))} /></div>
          <div><label style={lbl}>Parent Email</label><input type="email" style={inp} value={f.parent1_email} onChange={e => setF(p => ({ ...p, parent1_email: e.target.value }))} /></div>
          <div><label style={lbl}>Parent Phone</label><input style={inp} value={f.parent1_phone} onChange={e => setF(p => ({ ...p, parent1_phone: e.target.value }))} /></div>
          <div><label style={lbl}>Known Allergies</label><input style={inp} value={f.allergies} onChange={e => setF(p => ({ ...p, allergies: e.target.value }))} placeholder="None" /></div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnS}>Cancel</button>
          <button onClick={save} disabled={saving} style={btnP}>{saving ? "Saving…" : "Add Child"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── EDUCATOR NOTES TAB ──────────────────────────────────────────────────────
function EducatorNotesTab({ child }) {
  const [notes, setNotes] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [f, setF] = useState({ note_date: new Date().toISOString().split("T")[0], category: "general", content: "", visible_to_parents: false });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  const load = useCallback(() => {
    API(`/api/register/educator-notes?child_id=${child.id}`).then(r => { if (Array.isArray(r)) setNotes(r); }).catch(() => {});
  }, [child.id]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!f.content.trim()) return;
    setSaving(true);
    try {
      try { await API("/api/register/educator-notes", { method: "POST", body: { ...f, child_id: child.id } }); }
      catch(e) { toast("Failed to save note.", "error"); return; }
      setF({ note_date: new Date().toISOString().split("T")[0], category: "general", content: "", visible_to_parents: false });
      setShowAdd(false);
      load();
    } catch (e) {}
    setSaving(false);
  };

  const del = async (id) => {
    if (!confirm("Delete this note?")) return;
    await API(`/api/register/educator-notes/${id}`, { method: "DELETE" }).catch(e=>console.error('API error:',e));
    load();
  };

  const CAT_COLORS = { general: "#8B6DAF", behaviour: "#D4A26A", development: "#2E8B57", health: "#C06B73", family: "#5B8DB5", incident: "#B71C1C" };
  const filtered = filter ? notes.filter(n => n.category === filter) : notes;

  return (
    <div>
      <div style={{ ...card }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>📝 Educator Notes</h4>
          <button onClick={() => setShowAdd(!showAdd)} style={btnS}>{showAdd ? "Cancel" : "+ Add Note"}</button>
        </div>

        {/* Category filter */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
          {["", "general", "behaviour", "development", "health", "family", "incident"].map(cat => (
            <button key={cat || "all"} onClick={() => setFilter(cat)}
              style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${filter === cat ? CAT_COLORS[cat] || purple : "#EDE8F4"}`, background: filter === cat ? (CAT_COLORS[cat] || purple) + "15" : "#fff", color: filter === cat ? CAT_COLORS[cat] || purple : "#555", cursor: "pointer", fontSize: 11, fontWeight: filter === cat ? 700 : 500 }}>
              {cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : "All"}
            </button>
          ))}
        </div>

        {/* Add form */}
        {showAdd && (
          <div style={{ background: lp, borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><label style={lbl}>Date</label><DatePicker value={f.note_date} onChange={v => setF(p => ({ ...p, note_date: v }))}/></div>
              <div><label style={lbl}>Category</label>
                <select style={inp} value={f.category} onChange={e => setF(p => ({ ...p, category: e.target.value }))}>
                  {["general","behaviour","development","health","family","incident"].map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginBottom: 2 }}>
                  <input type="checkbox" checked={f.visible_to_parents} onChange={e => setF(p => ({ ...p, visible_to_parents: e.target.checked }))} />
                  Visible to parents
                </label>
              </div>
              <div style={{ gridColumn: "span 3" }}>
                <label style={lbl}>Note</label>
                <textarea style={{ ...inp, height: 80, resize: "vertical" }} value={f.content}
                  onChange={e => setF(p => ({ ...p, content: e.target.value }))}
                  placeholder="Add your observation, note, or comment about this child…" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowAdd(false)} style={btnS}>Cancel</button>
              <button onClick={save} disabled={saving} style={btnP}>{saving ? "Saving…" : "Save Note"}</button>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: "#B0AAB9", fontSize: 12 }}>No educator notes on file for {child.first_name}.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(note => {
              const catColor = CAT_COLORS[note.category] || "#8A7F96";
              return (
                <div key={note.id} style={{ background: "#FDFBF9", borderRadius: 10, padding: "12px 14px", border: "1px solid #EDE8F4", borderLeft: `3px solid ${catColor}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 11, color: "#3D3248" }}>
                        {new Date(note.note_date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: catColor + "15", color: catColor, fontWeight: 700, border: `1px solid ${catColor}30` }}>
                        {note.category}
                      </span>
                      <span style={{ fontSize: 10, color: "#8A7F96" }}>by {note.educator_name || "Staff"}</span>
                      {note.visible_to_parents ? <span style={{ fontSize: 9, color: "#2E7D32", fontWeight: 700 }}>👪 Parent visible</span> : null}
                    </div>
                    <button onClick={() => del(note.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C06B73", fontSize: 12, padding: "0 2px" }}>✕</button>
                  </div>
                  <div style={{ fontSize: 12, color: "#3D3248", marginTop: 6, lineHeight: 1.6 }}>{note.content}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PARENT MESSAGING TAB ────────────────────────────────────────────────────
function ParentMessagingTab({ child }) {
  const [messages, setMessages] = useState([]);
  const [showCompose, setShowCompose] = useState(false);
  const [f, setF] = useState({ subject: "", body: "", message_type: "general", to_parent_email: child.parent1_email || "" });
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    API(`/api/register/parent-messages?child_id=${child.id}`).then(r => { if (Array.isArray(r)) setMessages(r); }).catch(() => {});
  }, [child.id]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!f.body.trim()) return;
    setSending(true);
    try {
      try { await API("/api/register/parent-messages", { method: "POST", body: { ...f, child_id: child.id } }); }
      catch(e) { toast("Failed to send message.", "error"); return; }
      setF({ subject: "", body: "", message_type: "general", to_parent_email: child.parent1_email || "" });
      setShowCompose(false);
      load();
    } catch (e) {}
    setSending(false);
  };

  const MSG_TYPES = {
    general: { label: "General", color: "#8B6DAF", icon: "💬" },
    medication: { label: "Medication", color: "#C06B73", icon: "💊" },
    subsidy: { label: "Subsidy / CCS", color: "#2E7D32", icon: "💰" },
    immunisation: { label: "Immunisation", color: "#5B8DB5", icon: "💉" },
    excursion: { label: "Excursion", color: "#D4A26A", icon: "🚌" },
    incident: { label: "Incident", color: "#B71C1C", icon: "🩹" },
    invoice: { label: "Invoice", color: "#7E5BA3", icon: "📄" },
    reminder: { label: "Reminder", color: "#F57C00", icon: "🔔" },
  };

  return (
    <div>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>💬 Parent Messages</h4>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {child.parent1_email && <span style={{ fontSize: 10, color: "#8A7F96" }}>📧 {child.parent1_email}</span>}
            <button onClick={() => setShowCompose(!showCompose)} style={btnP}>{showCompose ? "Cancel" : "✉ Compose"}</button>
          </div>
        </div>

        {/* Compose form */}
        {showCompose && (
          <div style={{ background: lp, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Message Type</label>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4 }}>
                {Object.entries(MSG_TYPES).map(([k, v]) => (
                  <button key={k} onClick={() => setF(p => ({ ...p, message_type: k }))}
                    style={{ padding: "4px 10px", borderRadius: 20, border: `2px solid ${f.message_type === k ? v.color : "#DDD6EE"}`, background: f.message_type === k ? v.color + "15" : "#fff", color: f.message_type === k ? v.color : "#555", cursor: "pointer", fontSize: 11, fontWeight: f.message_type === k ? 700 : 500 }}>
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><label style={lbl}>To (Email)</label>
                <input style={inp} value={f.to_parent_email} onChange={e => setF(p => ({ ...p, to_parent_email: e.target.value }))} placeholder="parent@email.com" />
              </div>
              <div><label style={lbl}>Subject</label>
                <input style={inp} value={f.subject} onChange={e => setF(p => ({ ...p, subject: e.target.value }))} placeholder={`Re: ${child.first_name} ${child.last_name}`} />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={lbl}>Message</label>
                <textarea style={{ ...inp, height: 90, resize: "vertical" }} value={f.body} onChange={e => setF(p => ({ ...p, body: e.target.value }))} placeholder="Type your message to the parent/guardian…" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowCompose(false)} style={btnS}>Cancel</button>
              <button onClick={send} disabled={sending} style={{ ...btnP, background: MSG_TYPES[f.message_type]?.color || purple }}>
                {sending ? "Sending…" : "✉ Send Message"}
              </button>
            </div>
          </div>
        )}

        {/* Quick-send templates */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#8A7F96", marginBottom: 6 }}>QUICK MESSAGES</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { label: "Medication expiring", type: "medication", sub: "Medication Expiry Reminder", body: `Hi, this is a reminder that ${child.first_name}'s medication at Sunshine Early Learning Centre is expiring soon. Please bring in a replacement and updated medical plan.` },
              { label: "Subsidy reminder", type: "subsidy", sub: "CCS Subsidy Action Required", body: `Hi, we wanted to let you know that ${child.first_name}'s Childcare Subsidy (CCS) may be impacted. Please log in to your MyGov account and ensure your CCS assessment is current.` },
              { label: "Immunisation due", type: "immunisation", sub: "Immunisation Reminder", body: `Hi, ${child.first_name} has an upcoming immunisation due. Please ensure their immunisation schedule is up to date and upload a copy of their updated AIR record.` },
            ].map(tmpl => (
              <button key={tmpl.label} onClick={() => { setF(p => ({ ...p, message_type: tmpl.type, subject: tmpl.sub, body: tmpl.body })); setShowCompose(true); }}
                style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid #EDE8F4", background: "#FDFBF9", color: "#5C4E6A", cursor: "pointer", fontSize: 11 }}>
                🔔 {tmpl.label}
              </button>
            ))}
          </div>
        </div>

        {/* Message history */}
        {messages.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: "#B0AAB9", fontSize: 12 }}>No messages sent for {child.first_name} yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {messages.map(msg => {
              const mt = MSG_TYPES[msg.message_type] || MSG_TYPES.general;
              return (
                <div key={msg.id} style={{ background: "#FDFBF9", borderRadius: 10, padding: "12px 14px", border: "1px solid #EDE8F4", borderLeft: `3px solid ${mt.color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 14 }}>{mt.icon}</span>
                      <span style={{ fontWeight: 700, fontSize: 12, color: "#3D3248" }}>{msg.subject || "(No subject)"}</span>
                      <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: mt.color + "15", color: mt.color, fontWeight: 700 }}>{mt.label}</span>
                    </div>
                    <span style={{ fontSize: 10, color: "#8A7F96", whiteSpace: "nowrap" }}>
                      {new Date(msg.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#5C4E6A", lineHeight: 1.6 }}>{msg.body}</div>
                  {msg.to_parent_email && <div style={{ fontSize: 10, color: "#8A7F96", marginTop: 4 }}>→ {msg.to_parent_email} · by {msg.from_name || "Staff"}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
