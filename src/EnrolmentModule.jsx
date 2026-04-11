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

const purple = "#8B6DAF", lp = "#F0EBF8", lp2 = "#F8F5FC";
const inp  = { padding: "8px 11px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 13, width: "100%", boxSizing: "border-box", background: "#fff" };
const lbl  = { fontSize: 10, color: "#7A6E8A", fontWeight: 700, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" };
const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: 18, marginBottom: 14, boxShadow: "0 2px 8px rgba(139,109,175,0.05)" };
const btnP = (bg = purple) => ({ background: bg, color: "#fff", border: "none", borderRadius: 9, padding: "9px 20px", cursor: "pointer", fontWeight: 700, fontSize: 13 });
const btnS = { background: lp, color: purple, border: `1px solid ${purple}30`, borderRadius: 9, padding: "8px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const btnGhost = { background: "none", border: "none", cursor: "pointer", color: purple, fontSize: 12, fontWeight: 600 };

const fmtDate = s => s ? new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
const ageFromDob = dob => { if (!dob) return ""; const m = (new Date() - new Date(dob)) / (1000 * 60 * 60 * 24 * 30.5); return m < 24 ? `${Math.round(m)}m` : `${Math.round(m/12)}y ${Math.round(m%12)}m`; };

const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const STATUS_CONFIG = {
  enquiry:    { label: "Enquiry",     color: "#8A7F96", bg: "#F5F5F5" },
  submitted:  { label: "Application", color: "#5B8DB5", bg: "#E8F0F8" },
  reviewing:  { label: "Application", color: "#D4A26A", bg: "#FFF6E8" },
  offered:    { label: "Offered",     color: "#0284C7", bg: "#E0F2FE" },
  approved:   { label: "Accepted",    color: "#6BA38B", bg: "#EDF8F3" },
  accepted:   { label: "Accepted",    color: "#6BA38B", bg: "#EDF8F3" },
  enrolled:   { label: "Enrolled",    color: "#3D3248", bg: "#F0EBF8" },
  waitlisted: { label: "Waitlisted",  color: "#9B7DC0", bg: "#F3EEFF" },
  rejected:   { label: "Rejected",    color: "#B45960", bg: "#FFEBEE" },
};
const PRIORITY_CONFIG = {
  urgent: { label: "Urgent",  color: "#B45960", bg: "#FFEBEE" },
  high:   { label: "High",    color: "#D4A26A", bg: "#FFF6E8" },
  normal: { label: "Normal",  color: "#6BA38B", bg: "#EDF8F3" },
  low:    { label: "Low",     color: "#8A7F96", bg: "#F5F5F5" },
};

function StatusBadge({ status }) {
  const c = STATUS_CONFIG[status] || { label: status, color: "#888", bg: "#F5F5F5" };
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 10, color: c.color, background: c.bg }}>{c.label}</span>;
}
function PriorityBadge({ priority }) {
  const c = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.normal;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 10, color: c.color, background: c.bg }}>{c.label}</span>;
}

// ─── MAIN MODULE ──────────────────────────────────────────────────────────────
export default function EnrolmentModule() {
  const [view, setView]               = useState("pipeline"); // pipeline | waitlist | new_waitlist | application
  const [applications, setApplications] = useState([]);
  const [waitlist, setWaitlist]       = useState([]);
  const [rooms, setRooms]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedApp, setSelectedApp] = useState(null);

  const [enrolledCount, setEnrolledCount] = useState(0);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [apps, wl, rm, children] = await Promise.all([
        API("/api/enrolment/applications"),
        API("/api/waitlist"),
        API("/api/rooms"),
        API("/api/children").catch(() => []),
      ]);
      if (Array.isArray(apps)) setApplications(apps.map(a => ({ ...a, preferred_days: tryParse(a.preferred_days) })));
      if (Array.isArray(wl))   setWaitlist(wl);
      if (Array.isArray(rm))   setRooms(rm);
      if (Array.isArray(children)) setEnrolledCount(children.filter(c => c.active === 1 || c.active === true).length);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const STATUS_ALIASES = { submitted: ["submitted", "reviewing"], approved: ["approved", "accepted"] };
  const filteredApps = statusFilter ? applications.filter(a => (STATUS_ALIASES[statusFilter] || [statusFilter]).includes(a.status)) : applications;

  const counts = {};
  applications.forEach(a => { counts[a.status] = (counts[a.status] || 0) + 1; });

  const openApp = (a) => { setSelectedApp(a); setView("application"); };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px 10px", background: "#fff", borderBottom: "1px solid #EDE8F4" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, color: "#3D3248", fontSize: 20 }}>📋 Enrolment & Waitlist</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8A7F96" }}>Application pipeline, approvals, and waitlist management</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {view !== "new_waitlist" && <button onClick={() => setView("new_waitlist")} style={btnS}>+ Add to Waitlist</button>}
            {(view === "application" || view === "new_waitlist") && <button onClick={() => setView("pipeline")} style={btnS}>← Back</button>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {[["pipeline","📥 Applications"],["waitlist","⏳ Waitlist"]].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: view === v ? 700 : 500, background: view === v ? lp : "transparent", color: view === v ? purple : "#6B5F7A" }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {view === "pipeline" && (
          <PipelineView
            applications={filteredApps}
            allApplications={applications}
            counts={counts}
            rooms={rooms}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            loading={loading}
            onOpen={openApp}
            onRefresh={load}
            enrolledCount={enrolledCount}
          />
        )}
        {view === "waitlist" && <WaitlistView waitlist={waitlist} rooms={rooms} onRefresh={load} />}
        {view === "new_waitlist" && <AddWaitlistForm rooms={rooms} onSaved={() => { load(); setView("waitlist"); }} onCancel={() => setView("waitlist")} />}
        {view === "application" && selectedApp && (
          <ApplicationDetailView
            app={selectedApp}
            rooms={rooms}
            onClose={() => { setSelectedApp(null); setView("pipeline"); }}
            onRefresh={async () => { await load(); const updated = await API(`/api/enrolment/applications`); if (Array.isArray(updated)) { const a = updated.find(x => x.id === selectedApp.id); if (a) setSelectedApp({ ...a, preferred_days: tryParse(a.preferred_days) }); } }}
          />
        )}
      </div>
    </div>
  );
}

function tryParse(v) { try { return JSON.parse(v || "[]"); } catch { return []; } }

// ─── PIPELINE VIEW ────────────────────────────────────────────────────────────
function PipelineView({ applications, allApplications, counts, rooms, statusFilter, setStatusFilter, loading, onOpen, onRefresh, enrolledCount = 0 }) {
  const [selected, setSelected] = useState(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const toggleSel = (id) => setSelected(p => { const s=new Set(p); s.has(id)?s.delete(id):s.add(id); return s; });
  const selectAll = () => setSelected(new Set(applications.map(a=>a.id)));
  const clearSel = () => setSelected(new Set());

  const bulkAction = async (newStatus) => {
    if(!selected.size) return;
    if(!window.confirm(`Set ${selected.size} application(s) to "${newStatus}"?`)) return;
    setBulkWorking(true);
    let done=0;
    for(const id of selected) {
      try { await API(`/api/enrolment/applications/${id}`,{method:"PUT",body:{status:newStatus,reviewNotes:`Bulk ${newStatus}`}}); done++; } catch(e) {}
    }
    clearSel(); onRefresh();
    toast(`${done} application(s) set to ${newStatus}`);
    setBulkWorking(false);
  };
  return (
    <div>
      {/* Summary bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, padding: 16, background: "#F5F0FB", borderRadius: 12, border: "1px solid #EDE8F4", alignItems: "center" }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#7C3AED" }}>{enrolledCount}</div>
          <div style={{ fontSize: 11, color: "#8A7F96", fontWeight: 600 }}>Currently Enrolled</div>
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#3D3248" }}>{allApplications.length}</div>
          <div style={{ fontSize: 11, color: "#8A7F96", fontWeight: 600 }}>Pipeline Applications</div>
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#D97706" }}>{allApplications.filter(a => a.status === "waitlisted").length}</div>
          <div style={{ fontSize: 11, color: "#8A7F96", fontWeight: 600 }}>On Waitlist</div>
        </div>
      </div>
      {/* Filter badges — canonical list, no duplicates */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {[
          { label: "All",        value: null,         color: "#3D3248", bg: "#F0EBF8" },
          { label: "Enquiry",    value: "enquiry",    color: "#8A7F96", bg: "#F5F5F5" },
          { label: "Application",value: "submitted",  color: "#5B8DB5", bg: "#E8F0F8", also: ["reviewing"] },
          { label: "Offered",    value: "offered",    color: "#0284C7", bg: "#E0F2FE" },
          { label: "Accepted",   value: "approved",   color: "#6BA38B", bg: "#EDF8F3", also: ["accepted"] },
          { label: "Enrolled",   value: "enrolled",   color: "#3D3248", bg: "#F0EBF8" },
          { label: "Waitlisted", value: "waitlisted", color: "#9B7DC0", bg: "#F3EEFF" },
          { label: "Rejected",   value: "rejected",   color: "#B45960", bg: "#FFEBEE" },
        ].map(b => {
          const active = b.value === null ? !statusFilter : statusFilter === b.value;
          const cnt = b.value === null ? allApplications.length : allApplications.filter(a => a.status === b.value || (b.also || []).includes(a.status)).length;
          return (
            <button key={b.label} onClick={() => setStatusFilter(active ? "" : b.value)}
              style={{ background: active ? b.bg : "#fff", border: `1px solid ${active ? b.color : "#EDE8F4"}`, borderRadius: 20, padding: "6px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: active ? 700 : 500, color: active ? b.color : "#8A7F96" }}>
              <span style={{ fontWeight: 800 }}>{cnt}</span> {b.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 50, color: "#B0AAB9" }}>Loading applications…</div>
      ) : applications.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#B0AAB9" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 14 }}>No {statusFilter || ""} applications yet.</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Applications submitted by parents appear here.</div>
        </div>
      ) : (
        <div>
          {/* Bulk action bar */}
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,padding:"8px 12px",background:"#F8F5FC",borderRadius:10,border:"1px solid #EDE8F4"}}>
            <input type="checkbox" checked={selected.size===applications.length&&applications.length>0}
              onChange={e=>e.target.checked?selectAll():clearSel()}
              style={{cursor:"pointer"}}/>
            <span style={{fontSize:12,color:"#8A7F96",flex:1}}>
              {selected.size>0 ? `${selected.size} selected` : `${applications.length} applications`}
            </span>
            {selected.size>0 && <>
              <button onClick={()=>bulkAction("approved")} disabled={bulkWorking}
                style={{padding:"5px 12px",borderRadius:7,border:"none",background:"#E8F5E9",color:"#2E7D32",cursor:"pointer",fontWeight:700,fontSize:11}}>
                ✓ Approve
              </button>
              <button onClick={()=>bulkAction("reviewing")} disabled={bulkWorking}
                style={{padding:"5px 12px",borderRadius:7,border:"none",background:"#FFF6E8",color:"#D4A26A",cursor:"pointer",fontWeight:700,fontSize:11}}>
                👁 Mark Reviewing
              </button>
              <button onClick={()=>bulkAction("rejected")} disabled={bulkWorking}
                style={{padding:"5px 12px",borderRadius:7,border:"none",background:"#FFEBEE",color:"#B45960",cursor:"pointer",fontWeight:700,fontSize:11}}>
                ✗ Reject
              </button>
            </>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {applications.map(a => (
              <div key={a.id} style={{display:"flex",alignItems:"center",gap:8}}>
                <input type="checkbox" checked={selected.has(a.id)} onChange={()=>toggleSel(a.id)} style={{cursor:"pointer",flexShrink:0}}/>
                <div style={{flex:1}}><ApplicationRow app={a} rooms={rooms} onClick={() => onOpen(a)} /></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


function ApplicationRow({ app: a, rooms, onClick }) {
  const room = rooms.find(r => r.id === a.preferred_room);
  const age = ageFromDob(a.child_dob);
  const days = tryParse(a.preferred_days);

  return (
    <div onClick={onClick} style={{ background: "#fff", borderRadius: 12, border: "1px solid #EDE8F4", padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 14px rgba(139,109,175,0.10)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"}>

      {/* Avatar */}
      <div style={{ width: 44, height: 44, borderRadius: "50%", background: purple + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: purple, flexShrink: 0 }}>
        {(a.child_first_name?.[0] || "?")}
      </div>

      {/* Child info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#3D3248" }}>{a.child_first_name} {a.child_last_name || ""}</div>
        <div style={{ fontSize: 11, color: "#9A8FB0" }}>{age && `Age: ${age} · `}{a.child_dob && `DOB: ${fmtDate(a.child_dob)}`}</div>
      </div>

      {/* Parent */}
      <div style={{ width: 180, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#3D3248" }}>{a.parent1_name}</div>
        <div style={{ fontSize: 11, color: "#9A8FB0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.parent1_email}</div>
      </div>

      {/* Room & days */}
      <div style={{ width: 140, minWidth: 0 }}>
        {room && <div style={{ fontSize: 11, fontWeight: 700, color: purple }}>{room.name}</div>}
        {days.length > 0 && <div style={{ fontSize: 10, color: "#9A8FB0" }}>{days.join(", ")}</div>}
        {a.preferred_start_date && <div style={{ fontSize: 10, color: "#9A8FB0" }}>Start: {fmtDate(a.preferred_start_date)}</div>}
      </div>

      {/* Submitted */}
      <div style={{ width: 100, fontSize: 11, color: "#9A8FB0", textAlign: "right" }}>
        <div>{fmtDate(a.submitted_at)}</div>
      </div>

      {/* Status */}
      <div style={{ width: 90, textAlign: "right", flexShrink: 0 }}>
        <StatusBadge status={a.status} />
      </div>
    </div>
  );
}

// ─── APPLICATION DETAIL ───────────────────────────────────────────────────────
function ApplicationDetailView({ app: a, rooms, onClose, onRefresh }) {
  const [reviewing, setReviewing] = useState(false);
  const [newStatus, setNewStatus] = useState(a.status);
  const [reviewNotes, setReviewNotes] = useState(a.review_notes || "");
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);

  const room = rooms.find(r => r.id === a.preferred_room);
  const days = tryParse(a.preferred_days);
  const authorisedPickup = tryParse(a.authorised_pickup);

  const saveReview = async () => {
    setSaving(true);
    try {
      const r = await API(`/api/enrolment/applications/${a.id}`, { method: "PUT", body: { status: newStatus, reviewNotes } });
      if (r.error) { window.showToast(r.error, 'error'); setSaving(false); return; }
      await onRefresh();
      setReviewing(false);
    } catch(e) { window.showToast('Failed to save review: ' + e.message, 'error'); }
    setSaving(false);
  };

  const convertToChild = async () => {
    if (!window.confirm(`Approve enrolment for ${a.child_first_name} ${a.child_last_name||""} and create their child record?`)) return;
    setConverting(true);
    try {
      const r = await API(`/api/enrolment/applications/${a.id}`, { method: "PUT", body: { status: "approved", reviewNotes: reviewNotes || "Approved — child record created." } });
      if (r.error) { window.showToast(r.error, 'error'); setConverting(false); return; }
      toast(`${a.child_first_name} enrolled successfully! Child record created.`);
      await onRefresh();
    } catch(e) { window.showToast("Failed to approve: " + e.message, 'error'); }
    setConverting(false);
  };

  const Section = ({ title, children }) => (
    <div style={card}>
      <h4 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 800, color: "#3D3248", borderBottom: "1px solid #F0EBF8", paddingBottom: 8 }}>{title}</h4>
      {children}
    </div>
  );

  const Field = ({ label, value }) => (
    <div style={{ marginBottom: 8 }}>
      <div style={lbl}>{label}</div>
      <div style={{ fontSize: 13, color: "#3D3248", fontWeight: 500 }}>{value || <span style={{ color: "#C0B8CC" }}>—</span>}</div>
    </div>
  );

  const Grid = ({ cols = 3, children }) => <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "0 16px" }}>{children}</div>;

  const Consent = ({ label, value }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ width: 18, height: 18, borderRadius: "50%", background: value ? "#6BA38B20" : "#F5F5F5", border: `2px solid ${value ? "#6BA38B" : "#DDD"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 }}>{value ? "✓" : "✗"}</span>
      <span style={{ fontSize: 12, color: value ? "#3D3248" : "#9A8FB0" }}>{label}</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <button onClick={onClose} style={{ ...btnGhost, marginBottom: 16, display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>← Back to Applications</button>

      {/* Header */}
      <div style={{ ...card, borderLeft: `4px solid ${purple}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#3D3248", marginBottom: 4 }}>{a.child_first_name} {a.child_last_name}</div>
            <div style={{ fontSize: 12, color: "#9A8FB0" }}>Application submitted {fmtDate(a.submitted_at)} · ID: {a.id?.slice(0, 8)}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <StatusBadge status={a.status} />
            {a.status !== "approved" && a.status !== "enrolled" && (
              <button onClick={convertToChild} disabled={converting} style={btnP("#6BA38B")}>{converting ? "Creating…" : "✓ Approve & Enrol"}</button>
            )}
            <button onClick={() => setReviewing(!reviewing)} style={reviewing ? btnS : btnP()}>{reviewing ? "Cancel" : "Update Status"}</button>
          </div>
        </div>

        {reviewing && (
          <div style={{ marginTop: 14, padding: "14px", background: lp2, borderRadius: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>New Status</label>
              <select style={inp} value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Review Notes</label>
              <input style={inp} value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Add notes for this decision…" />
            </div>
            <div style={{ gridColumn: "span 2", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={saveReview} disabled={saving} style={btnP()}>{saving ? "Saving…" : "Save Review"}</button>
            </div>
          </div>
        )}

        {a.review_notes && !reviewing && (
          <div style={{ marginTop: 10, padding: "10px 12px", background: "#FFF9F0", borderRadius: 8, fontSize: 12, color: "#5C4E6A", border: "1px solid #F0E0C0" }}>
            <strong>Review notes:</strong> {a.review_notes}
          </div>
        )}
      </div>

      {/* Child details */}
      <Section title="🧒 Child Information">
        <Grid>
          <Field label="First Name" value={a.child_first_name} />
          <Field label="Last Name" value={a.child_last_name} />
          <Field label="Date of Birth" value={`${fmtDate(a.child_dob)} (${ageFromDob(a.child_dob)})`} />
          <Field label="Gender" value={a.child_gender} />
          <Field label="Cultural Background" value={a.child_cultural_needs} />
          <Field label="Home Language" value={a.child_language} />
          <Field label="Indigenous Status" value={a.child_indigenous} />
          <Field label="Preferred Room" value={room?.name || a.preferred_room} />
          <Field label="Preferred Start" value={fmtDate(a.preferred_start_date)} />
        </Grid>
        {days.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={lbl}>Preferred Days</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {days.map(d => <span key={d} style={{ padding: "3px 10px", borderRadius: 10, background: purple + "18", color: purple, fontSize: 12, fontWeight: 700 }}>{d}</span>)}
            </div>
          </div>
        )}
      </Section>

      {/* Medical */}
      <Section title="🏥 Medical Information">
        <Grid>
          <Field label="Allergies" value={a.child_allergies} />
          <Field label="Medical Conditions" value={a.child_medical_conditions} />
          <Field label="Dietary Requirements" value={a.child_dietary} />
          <Field label="Immunisation Status" value={a.child_immunisation_status} />
          <Field label="Doctor" value={a.doctor_name} />
          <Field label="Doctor Phone" value={a.doctor_phone} />
          <Field label="Medicare Number" value={a.medicare_number} />
          <Field label="Medicare Ref" value={a.medicare_ref} />
          <Field label="Private Health" value={a.private_health} />
        </Grid>
        {a.family_court_orders ? <div style={{ marginTop: 8, padding: "8px 12px", background: "#FFEBEE", borderRadius: 8, fontSize: 12, color: "#B45960" }}><strong>⚠ Family Court Orders:</strong> {a.court_order_details || "On file"}</div> : null}
      </Section>

      {/* Parent 1 */}
      <Section title="👤 Parent / Guardian 1">
        <Grid>
          <Field label="Name" value={a.parent1_name} />
          <Field label="Email" value={a.parent1_email} />
          <Field label="Phone" value={a.parent1_phone} />
          <Field label="Address" value={a.parent1_address} />
          <Field label="Employer" value={a.parent1_employer} />
          <Field label="Work Phone" value={a.parent1_work_phone} />
          <Field label="CRN" value={a.parent1_crn} />
        </Grid>
      </Section>

      {/* Parent 2 */}
      {a.parent2_name && (
        <Section title="👤 Parent / Guardian 2">
          <Grid>
            <Field label="Name" value={a.parent2_name} />
            <Field label="Email" value={a.parent2_email} />
            <Field label="Phone" value={a.parent2_phone} />
          </Grid>
        </Section>
      )}

      {/* Emergency contacts */}
      <Section title="🚨 Emergency Contacts">
        <Grid cols={2}>
          {a.emergency_contact1_name && (
            <div style={{ padding: "10px 14px", background: lp2, borderRadius: 10, border: "1px solid #EDE8F4" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#3D3248", marginBottom: 4 }}>{a.emergency_contact1_name}</div>
              <div style={{ fontSize: 11, color: "#9A8FB0" }}>{a.emergency_contact1_relationship} · {a.emergency_contact1_phone}</div>
            </div>
          )}
          {a.emergency_contact2_name && (
            <div style={{ padding: "10px 14px", background: lp2, borderRadius: 10, border: "1px solid #EDE8F4" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#3D3248", marginBottom: 4 }}>{a.emergency_contact2_name}</div>
              <div style={{ fontSize: 11, color: "#9A8FB0" }}>{a.emergency_contact2_relationship} · {a.emergency_contact2_phone}</div>
            </div>
          )}
        </Grid>
        {authorisedPickup.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={lbl}>Authorised for Pickup</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {authorisedPickup.map((p, i) => <span key={i} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 10, background: "#F0EBF8", color: purple }}>{p}</span>)}
            </div>
          </div>
        )}
      </Section>

      {/* Consents */}
      <Section title="✅ Consents & Permissions">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
          <Consent label="Authorised medical treatment" value={a.authorised_medical_treatment} />
          <Consent label="Authorised ambulance" value={a.authorised_ambulance} />
          <Consent label="Sunscreen consent" value={a.sunscreen_consent} />
          <Consent label="Photo consent" value={a.photo_consent} />
          <Consent label="Excursion consent" value={a.excursion_consent} />
        </div>
      </Section>

      {a.additional_notes && (
        <Section title="📝 Additional Notes">
          <div style={{ fontSize: 13, color: "#4A3F5C", lineHeight: 1.7 }}>{a.additional_notes}</div>
        </Section>
      )}
    </div>
  );
}

// ─── WAITLIST VIEW ────────────────────────────────────────────────────────────
function WaitlistView({ waitlist, rooms, onRefresh }) {
  const [editId, setEditId] = useState(null);
  const [converting, setConverting] = useState(null);

  const convertToApp = async (id) => {
    if (!window.confirm("Convert this waitlist entry to an enrolment application?")) return;
    setConverting(id);
    await API(`/api/waitlist/${id}/convert`, { method: "POST" });
    await onRefresh();
    setConverting(null);
  };

  const remove = async (id) => {
    if (!window.confirm("Remove from waitlist?")) return;
    try { await API(`/api/waitlist/${id}`, { method: "DELETE" }); }
    catch(e) { window.showToast('Failed to remove: ' + e.message, 'error'); return; }
    onRefresh();
  };

  const updatePriority = async (id, priority) => {
    try { await API(`/api/waitlist/${id}`, { method: "PUT", body: { priority } }); }
    catch(e) { toast("Failed to update priority.", "error"); return; }
    onRefresh();
  };

  const active = waitlist.filter(w => w.status === "waiting");
  const converted = waitlist.filter(w => w.status !== "waiting");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "#8A7F96" }}>{active.length} on waitlist</div>
      </div>

      {active.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#B0AAB9" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 14 }}>Waitlist is empty</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {active.map((w, idx) => {
            const room = rooms.find(r => r.id === w.preferred_room);
            const days = tryParse(w.preferred_days);
            return (
              <div key={w.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #EDE8F4", padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                {/* Position */}
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: purple + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: purple, flexShrink: 0 }}>{idx + 1}</div>

                {/* Child info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#3D3248" }}>{w.child_name}</div>
                  <div style={{ fontSize: 11, color: "#9A8FB0" }}>{ageFromDob(w.child_dob)}{w.child_dob ? ` · DOB: ${fmtDate(w.child_dob)}` : ""}</div>
                </div>

                {/* Parent */}
                <div style={{ width: 180 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#3D3248" }}>{w.parent_name}</div>
                  <div style={{ fontSize: 11, color: "#9A8FB0" }}>{w.parent_email}</div>
                  {w.parent_phone && <div style={{ fontSize: 11, color: "#9A8FB0" }}>{w.parent_phone}</div>}
                </div>

                {/* Preferences */}
                <div style={{ width: 150 }}>
                  {room && <div style={{ fontSize: 11, fontWeight: 700, color: purple }}>{room.name}</div>}
                  {days.length > 0 && <div style={{ fontSize: 10, color: "#9A8FB0" }}>{days.join(", ")}</div>}
                  {w.preferred_start && <div style={{ fontSize: 10, color: "#9A8FB0" }}>Start: {fmtDate(w.preferred_start)}</div>}
                </div>

                {/* Priority */}
                <div style={{ width: 120 }}>
                  <select value={w.priority || "normal"} onChange={e => updatePriority(w.id, e.target.value)} style={{ ...inp, width: "auto", fontSize: 11, padding: "4px 8px" }}>
                    {Object.entries(PRIORITY_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
                  </select>
                </div>

                {/* Added date */}
                <div style={{ width: 80, fontSize: 11, color: "#9A8FB0", textAlign: "right" }}>{fmtDate(w.created_at)}</div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => convertToApp(w.id)} disabled={converting === w.id} style={{ ...btnP("#6BA38B"), padding: "6px 12px", fontSize: 11 }}>{converting === w.id ? "…" : "→ Enrol"}</button>
                  <button onClick={() => remove(w.id)} style={{ ...btnS, padding: "6px 10px", fontSize: 11 }}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Converted entries */}
      {converted.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#9A8FB0", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Converted to Applications</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {converted.map(w => (
              <div key={w.id} style={{ background: "#F8F5FC", borderRadius: 10, border: "1px solid #EDE8F4", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, opacity: 0.7 }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#3D3248" }}>{w.child_name}</div>
                <div style={{ fontSize: 12, color: "#9A8FB0" }}>{w.parent_name}</div>
                <StatusBadge status={w.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ADD WAITLIST FORM ────────────────────────────────────────────────────────
function AddWaitlistForm({ rooms, onSaved, onCancel }) {
  const [f, setF] = useState({ child_name: "", child_dob: "", parent_name: "", parent_email: "", parent_phone: "", preferred_room: "", preferred_days: [], preferred_start: "", notes: "", priority: "normal" });
  const [saving, setSaving] = useState(false);

  const toggle = (day) => setF(p => ({ ...p, preferred_days: p.preferred_days.includes(day) ? p.preferred_days.filter(d => d !== day) : [...p.preferred_days, day] }));

  const save = async () => {
    if (!f.child_name || !f.parent_name) return;
    setSaving(true);
    try {
      const r = await API("/api/waitlist", { method: "POST", body: f });
      if (r.error) { window.showToast(r.error, 'error'); return; }
    } catch(e) { window.showToast('Failed to add to waitlist: ' + e.message, 'error'); return; }
    onSaved();
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={card}>
        <h3 style={{ margin: "0 0 18px", color: "#3D3248" }}>Add to Waitlist</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div><label style={lbl}>Child's Full Name *</label><input style={inp} value={f.child_name} onChange={e => setF(p => ({ ...p, child_name: e.target.value }))} placeholder="e.g. Mia Johnson" autoFocus /></div>
          <div><label style={lbl}>Child's Date of Birth</label><DatePicker value={f.child_dob||""} onChange={v=>setF(p=>({...p,child_dob:v}))} /></div>
          <div><label style={lbl}>Parent / Guardian Name *</label><input style={inp} value={f.parent_name} onChange={e => setF(p => ({ ...p, parent_name: e.target.value }))} placeholder="e.g. Sarah Johnson" /></div>
          <div><label style={lbl}>Parent Email</label><input type="email" style={inp} value={f.parent_email} onChange={e => setF(p => ({ ...p, parent_email: e.target.value }))} placeholder="email@example.com" /></div>
          <div><label style={lbl}>Parent Phone</label><input style={inp} value={f.parent_phone} onChange={e => setF(p => ({ ...p, parent_phone: e.target.value }))} placeholder="04xx xxx xxx" /></div>
          <div>
            <label style={lbl}>Preferred Room</label>
            <select style={inp} value={f.preferred_room} onChange={e => setF(p => ({ ...p, preferred_room: e.target.value }))}>
              <option value="">Any room</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Preferred Start Date</label>
            <DatePicker value={f.preferred_start||""} onChange={v=>setF(p=>({...p,preferred_start:v}))} />
          </div>
          <div>
            <label style={lbl}>Priority</label>
            <select style={inp} value={f.priority} onChange={e => setF(p => ({ ...p, priority: e.target.value }))}>
              {Object.entries(PRIORITY_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={lbl}>Preferred Days</label>
          <div style={{ display: "flex", gap: 8 }}>
            {DAYS.map(d => (
              <button key={d} onClick={() => toggle(d)} style={{ padding: "6px 14px", borderRadius: 20, border: `2px solid ${f.preferred_days.includes(d) ? purple : "#DDD6EE"}`, background: f.preferred_days.includes(d) ? lp : "#fff", color: f.preferred_days.includes(d) ? purple : "#6B5F7A", cursor: "pointer", fontSize: 12, fontWeight: f.preferred_days.includes(d) ? 700 : 500 }}>{d}</button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={lbl}>Notes</label>
          <textarea style={{ ...inp, height: 80, resize: "vertical" }} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} placeholder="Any additional information or special requirements…" />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onCancel} style={btnS}>Cancel</button>
          <button onClick={save} disabled={saving || !f.child_name || !f.parent_name} style={{ ...btnP(), opacity: !f.child_name || !f.parent_name ? 0.5 : 1 }}>{saving ? "Saving…" : "Add to Waitlist"}</button>
        </div>
      </div>
    </div>
  );
}
