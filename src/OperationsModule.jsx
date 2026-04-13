/**
 * OperationsModule.jsx — v2.7.0
 * Daily Operations hub: Visitor sign-in, Evacuation, Sleep tracking,
 * Hazard/Maintenance, Responsible Person log, Handover forms,
 * Room check-in, Shift bidding
 */
import { useState, useEffect, useCallback } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t?{Authorization:`Bearer ${t}`}:{}), ...(tid?{"x-tenant-id":tid}:{}) },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {})
  }).then(r => r.json());
};

const P = "#7C3AED", PL = "#EDE4F0", DARK = "#3D3248", MUTED = "#8A7F96";
const DANGER = "#DC2626", WARN = "#D97706", OK = "#16A34A";
const card = { background:"#fff", borderRadius:14, border:"1px solid #EDE8F4", padding:"18px 22px" };
const btnP = { padding:"9px 18px", borderRadius:9, border:"none", background:P, color:"#fff", fontWeight:700, cursor:"pointer", fontSize:13 };
const btnS = { padding:"9px 18px", borderRadius:9, border:`1px solid ${P}`, background:"#fff", color:P, fontWeight:600, cursor:"pointer", fontSize:13 };
const btnD = { padding:"9px 18px", borderRadius:9, border:"none", background:DANGER, color:"#fff", fontWeight:700, cursor:"pointer", fontSize:13 };
const inp = { padding:"8px 12px", borderRadius:8, border:"1px solid #DDD6EE", fontSize:13, width:"100%", boxSizing:"border-box", fontFamily:"inherit" };
const lbl = { fontSize:11, color:MUTED, fontWeight:700, display:"block", marginBottom:4, textTransform:"uppercase" };

// Local date — toISOString() is UTC and returns yesterday for the first ~10h
// of the day in AEST. Build the YYYY-MM-DD from local components.
const today = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
};
const fmtTime = t => t ? t.slice(0,5) : "—";
const fmtDate = d => d ? new Date(d+"T12:00").toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}) : "—";

const TABS = [
  { id:"visitors",   icon:"🚪", label:"Visitor Sign-In" },
  { id:"evacuation", icon:"🚨", label:"Evacuation" },
  { id:"sleep",      icon:"😴", label:"Sleep Tracking" },
  { id:"hazards",    icon:"⚠️", label:"Hazards & Maintenance" },
  { id:"rp",         icon:"🛡️", label:"Responsible Person" },
  { id:"handover",   icon:"📋", label:"Handover" },
  { id:"room_ci",    icon:"🏠", label:"Room Check-In" },
  { id:"shifts",     icon:"📅", label:"Shift Bidding" },
];

export default function OperationsModule() {
  const [tab, setTab] = useState("visitors");
  const [alerts, setAlerts] = useState({ visitors:0, sleep:0, hazards:0, shifts:0 });

  return (
    <div style={{ padding:"24px 28px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:24 }}>
        <span style={{ fontSize:28 }}>⚙️</span>
        <div>
          <h1 style={{ margin:0, fontSize:22, fontWeight:900, color:DARK }}>Daily Operations</h1>
          <p style={{ margin:"3px 0 0", fontSize:13, color:MUTED }}>Visitors · Evacuations · Sleep · Hazards · RP Log · Handover · Room Check-In · Shift Bidding</p>
        </div>
      </div>

      <div style={{ display:"flex", gap:6, marginBottom:0, flexWrap:"wrap", borderBottom:`1px solid #EDE8F4`, paddingBottom:12 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:"8px 14px", borderRadius:9, border:"none", cursor:"pointer", fontSize:13, fontWeight:tab===t.id?700:500,
              background:tab===t.id?P:"transparent", color:tab===t.id?"#fff":MUTED, whiteSpace:"nowrap" }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{display:'flex',gap:8,padding:'8px 24px',marginBottom:24,
        background:'#F5F3FF',borderBottom:'1px solid #EDE8F4'}}>
        <span style={{fontSize:12,color:'#6B7280',marginRight:4,lineHeight:'28px'}}>Quick Access:</span>
        {[
          { tab:'daily_updates', icon:'\u270F\uFE0F', label:'Live Updates' },
          { tab:'medication_register', icon:'\uD83D\uDC8A', label:'Medications' },
          { tab:'incidents', icon:'\u26A0\uFE0F', label:'Incidents' },
        ].map(q => (
          <button key={q.tab} onClick={() => window.dispatchEvent(new CustomEvent('c360-navigate',{detail:{tab:q.tab}}))}
            style={{fontSize:12,padding:'4px 10px',borderRadius:6,
              border:'1px solid #DDD6EE',background:'#fff',cursor:'pointer',fontFamily:'inherit'}}>
            {q.icon} {q.label}
          </button>
        ))}
      </div>

      {tab === "visitors"   && <VisitorTab />}
      {tab === "evacuation" && <EvacuationTab />}
      {tab === "sleep"      && <SleepTab />}
      {tab === "hazards"    && <HazardTab />}
      {tab === "rp"         && <RPLogTab />}
      {tab === "handover"   && <HandoverTab />}
      {tab === "room_ci"    && <RoomCheckinTab />}
      {tab === "shifts"     && <ShiftBiddingTab />}
    </div>
  );
}

// ─── Visitor Sign-In ──────────────────────────────────────────────────────────
function VisitorTab() {
  const [visitors, setVisitors] = useState([]);
  const [form, setForm] = useState({ visitor_name:"", visitor_type:"visitor", company:"", purpose:"", wwcc_number:"", vaccination_status:"not_checked" });
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    API(`/api/operations/visitors?date=${today()}`)
      .then(r => setVisitors(r.visitors || []))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const signIn = async () => {
    if (!form.visitor_name) return;
    await API("/api/operations/visitors", { method:"POST", body: form }).catch(e=>console.error('API error:',e));
    setForm({ visitor_name:"", visitor_type:"visitor", company:"", purpose:"", wwcc_number:"", vaccination_status:"not_checked" });
    setShowForm(false);
    load();
  };

  const signOut = async (id) => {
    await API(`/api/operations/visitors/${id}/sign-out`, { method:"PUT" }).catch(e=>console.error('API error:',e));
    load();
  };

  const typeColor = { visitor:"#5B8DB5", contractor:"#D97706", volunteer:"#16A34A", parent:"#7C3AED" };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontSize:13, color:MUTED }}>{visitors.filter(v=>!v.sign_out).length} visitors currently signed in</div>
        <button style={btnP} onClick={() => setShowForm(v=>!v)}>
          {showForm ? "Cancel" : "+ Sign In Visitor"}
        </button>
      </div>

      {showForm && (
        <div style={{ ...card, background:"#F8F5FC", border:"1px solid #DDD6EE" }}>
          <div style={{ fontWeight:700, fontSize:14, color:P, marginBottom:14 }}>Visitor Sign-In</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {[["visitor_name","Full Name *","text"],["company","Company / Organisation","text"],
              ["purpose","Purpose of Visit","text"],["wwcc_number","WWCC Number","text"]].map(([k,l,t]) => (
              <div key={k}>
                <label style={lbl}>{l}</label>
                <input type={t} value={form[k]} onChange={e => setForm(p=>({...p,[k]:e.target.value}))} style={inp} />
              </div>
            ))}
            <div>
              <label style={lbl}>Visitor Type</label>
              <select value={form.visitor_type} onChange={e => setForm(p=>({...p,visitor_type:e.target.value}))} style={inp}>
                {["visitor","contractor","volunteer","parent"].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Vaccination Status</label>
              <select value={form.vaccination_status} onChange={e => setForm(p=>({...p,vaccination_status:e.target.value}))} style={inp}>
                <option value="not_checked">Not checked</option>
                <option value="vaccinated">Vaccinated</option>
                <option value="exempt">Medical exemption</option>
                <option value="declined">Declined to state</option>
              </select>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:14 }}>
            <button style={btnP} onClick={signIn}>Sign In</button>
            <button style={btnS} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ fontWeight:700, fontSize:14, color:DARK, marginBottom:14 }}>
          Today's Visitors — {new Date().toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"})}
        </div>
        {loading ? <div style={{ color:MUTED, fontSize:13 }}>Loading…</div>
          : visitors.length === 0 ? (
            <div style={{ textAlign:"center", padding:"30px 0", color:MUTED }}>
              <div style={{ fontSize:36, marginBottom:8 }}>🚪</div>
              <div>No visitors today</div>
            </div>
          ) : (
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead><tr style={{ background:"#F8F5FC" }}>
                {["Name","Type","Company","Purpose","WWCC","Vaccination","In","Out","Action"].map(h => (
                  <th key={h} style={{ padding:"8px 10px", textAlign:"left", color:MUTED, fontWeight:700, fontSize:11, whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {visitors.map(v => (
                  <tr key={v.id} style={{ borderBottom:"1px solid #F0EBF8", background:!v.sign_out?"#FDFBFF":"#FAFAFA" }}>
                    <td style={{ padding:"8px 10px", fontWeight:600, color:DARK }}>{v.visitor_name}</td>
                    <td style={{ padding:"8px 10px" }}>
                      <span style={{ background:(typeColor[v.visitor_type]||P)+"22", color:typeColor[v.visitor_type]||P, padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:700 }}>
                        {v.visitor_type}
                      </span>
                    </td>
                    <td style={{ padding:"8px 10px", color:MUTED }}>{v.company||"—"}</td>
                    <td style={{ padding:"8px 10px", color:MUTED }}>{v.purpose||"—"}</td>
                    <td style={{ padding:"8px 10px", color:v.wwcc_number?OK:MUTED }}>{v.wwcc_number||"—"}</td>
                    <td style={{ padding:"8px 10px" }}>
                      <span style={{ fontSize:11, color:v.vaccination_status==="vaccinated"?OK:v.vaccination_status==="not_checked"?MUTED:WARN }}>
                        {v.vaccination_status.replace(/_/g," ")}
                      </span>
                    </td>
                    <td style={{ padding:"8px 10px", fontFamily:"monospace", color:DARK }}>{fmtTime(v.sign_in)}</td>
                    <td style={{ padding:"8px 10px", fontFamily:"monospace", color:v.sign_out?MUTED:P }}>
                      {v.sign_out ? fmtTime(v.sign_out) : "Still in"}
                    </td>
                    <td style={{ padding:"8px 10px" }}>
                      {!v.sign_out && (
                        <button onClick={() => signOut(v.id)}
                          style={{ padding:"4px 12px", borderRadius:7, border:"1px solid #EDE8F4", background:"#F8F5FC", color:P, cursor:"pointer", fontSize:11, fontWeight:600 }}>
                          Sign Out
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>
    </div>
  );
}

// ─── Evacuation ───────────────────────────────────────────────────────────────
function EvacuationTab() {
  const [drills, setDrills] = useState([]);
  const [activeDrill, setActiveDrill] = useState(null);
  const [headcounts, setHeadcounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    API("/api/operations/evacuation").then(r => setDrills(r.drills||[])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const startDrill = async (type) => {
    setStarting(true);
    const r = await API("/api/operations/evacuation", { method:"POST", body: { drill_type: type, conducted_by: "Admin" } }).catch(e=>console.error('API error:',e));
    if (r?.id) loadDrill(r.id);
    load();
    setStarting(false);
  };

  const loadDrill = async (id) => {
    const r = await API(`/api/operations/evacuation/${id}`).catch(e=>console.error('API error:',e));
    if (r?.drill) { setActiveDrill(r.drill); setHeadcounts(r.headcounts||[]); }
  };

  const toggleAccounted = async (drillId, hcId, val) => {
    await API(`/api/operations/evacuation/${drillId}/headcount/${hcId}`, { method:"PUT", body:{ accounted:val } }).catch(e=>console.error('API error:',e));
    const r = await API(`/api/operations/evacuation/${drillId}`).catch(e=>console.error('API error:',e));
    if (r?.drill) { setActiveDrill(r.drill); setHeadcounts(r.headcounts||[]); }
  };

  const completeDrill = async () => {
    const dur = activeDrill.started_at
      ? Math.round((Date.now() - new Date(activeDrill.started_at)) / 1000)
      : null;
    await API(`/api/operations/evacuation/${activeDrill.id}`, { // catch: .catch(e=>console.error('API error:',e))
      method:"PUT",
      body: { completed_at: new Date().toISOString(), duration_seconds: dur,
              all_accounted: headcounts.every(h=>h.accounted)?1:0,
              missing_count: headcounts.filter(h=>!h.accounted).length }
    });
    setActiveDrill(null);
    setHeadcounts([]);
    load();
  };

  const roomGroups = {};
  headcounts.forEach(h => {
    const r = h.room_name||"Unassigned";
    (roomGroups[r] = roomGroups[r]||[]).push(h);
  });

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {!activeDrill ? (
        <>
          <div style={{ ...card, background:"#FEF2F2", border:"1px solid #FCA5A5" }}>
            <div style={{ fontWeight:700, fontSize:14, color:DANGER, marginBottom:10 }}>Start Emergency Drill</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              {["fire","lockdown","earthquake","other"].map(type => (
                <button key={type} onClick={() => startDrill(type)} disabled={starting}
                  style={{ ...btnD, textTransform:"capitalize", opacity:starting?0.6:1 }}>
                  🚨 {type} Drill
                </button>
              ))}
            </div>
            <p style={{ margin:"10px 0 0", fontSize:12, color:MUTED }}>
              Starting a drill automatically loads all currently signed-in children for head count.
            </p>
          </div>

          <div style={card}>
            <div style={{ fontWeight:700, fontSize:14, color:DARK, marginBottom:14 }}>Drill History</div>
            {loading ? <div style={{ color:MUTED }}>Loading…</div>
              : drills.length === 0 ? <div style={{ color:MUTED, fontSize:13 }}>No drills recorded yet</div>
              : (
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead><tr style={{ background:"#F8F5FC" }}>
                    {["Date","Type","Started","Duration","Children","Educators","All Accounted"].map(h => (
                      <th key={h} style={{ padding:"8px 10px", textAlign:"left", color:MUTED, fontWeight:700, fontSize:11 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {drills.map(d => (
                      <tr key={d.id} style={{ borderBottom:"1px solid #F0EBF8", cursor:"pointer" }} onClick={() => loadDrill(d.id)}>
                        <td style={{ padding:"8px 10px" }}>{fmtDate(d.started_at?.split(" ")[0])}</td>
                        <td style={{ padding:"8px 10px", textTransform:"capitalize" }}>{d.drill_type}</td>
                        <td style={{ padding:"8px 10px", fontFamily:"monospace" }}>{d.started_at?.slice(11,16)}</td>
                        <td style={{ padding:"8px 10px" }}>{d.duration_seconds ? `${Math.round(d.duration_seconds/60)}m ${d.duration_seconds%60}s` : d.completed_at ? "—" : "Active"}</td>
                        <td style={{ padding:"8px 10px" }}>{d.total_children}</td>
                        <td style={{ padding:"8px 10px" }}>{d.total_educators}</td>
                        <td style={{ padding:"8px 10px" }}>
                          <span style={{ color:d.all_accounted?OK:DANGER, fontWeight:700 }}>
                            {d.completed_at ? (d.all_accounted?"✓ Yes":"✗ Missing: "+d.missing_count) : "In progress"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </div>
        </>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ ...card, background:"#FEF2F2", border:"2px solid "+DANGER }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ fontWeight:900, fontSize:18, color:DANGER }}>🚨 ACTIVE DRILL — {activeDrill.drill_type.toUpperCase()}</div>
              <div style={{ fontSize:13, color:MUTED }}>Started {activeDrill.started_at?.slice(11,16)}</div>
            </div>
            <div style={{ display:"flex", gap:20, marginBottom:16 }}>
              {[["Children",activeDrill.total_children],[`Accounted`,headcounts.filter(h=>h.accounted).length],[`Missing`,headcounts.filter(h=>!h.accounted).length]].map(([l,v]) => (
                <div key={l} style={{ textAlign:"center" }}>
                  <div style={{ fontSize:28, fontWeight:900, color:l==="Missing"&&v>0?DANGER:DARK }}>{v}</div>
                  <div style={{ fontSize:12, color:MUTED }}>{l}</div>
                </div>
              ))}
            </div>
            <button style={btnP} onClick={completeDrill}>✓ Complete Drill</button>
          </div>

          <div style={card}>
            <div style={{ fontWeight:700, fontSize:14, color:DARK, marginBottom:14 }}>Head Count — click each child to mark accounted</div>
            {Object.entries(roomGroups).map(([room, kids]) => (
              <div key={room} style={{ marginBottom:16 }}>
                <div style={{ fontWeight:700, fontSize:13, color:P, marginBottom:8 }}>🏠 {room}</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:8 }}>
                  {kids.map(hc => (
                    <div key={hc.id} onClick={() => toggleAccounted(activeDrill.id, hc.id, !hc.accounted)}
                      style={{ padding:"10px 12px", borderRadius:10, cursor:"pointer",
                        background:hc.accounted?"#E8F5E9":"#FEF2F2",
                        border:`1px solid ${hc.accounted?"#A5D6A7":"#FCA5A5"}` }}>
                      <div style={{ fontSize:20, marginBottom:4 }}>{hc.accounted?"✅":"❓"}</div>
                      <div style={{ fontWeight:600, fontSize:13, color:DARK }}>{hc.first_name} {hc.last_name}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sleep Tracking ───────────────────────────────────────────────────────────
function SleepTab() {
  const [records, setRecords] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [childId, setChildId] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      API(`/api/operations/sleep?date=${today()}`),
      API("/api/children/simple"),
    ]).then(([sr, cr]) => {
      setRecords(sr.records||[]);
      setChildren(Array.isArray(cr)?cr:(cr.children||cr.data||[]));
    }).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const startSleep = async () => {
    if (!childId) return;
    await API("/api/operations/sleep", { method:"POST", body:{ child_id:childId } }).catch(e=>console.error('API error:',e));
    setChildId("");
    load();
  };

  const doCheck = async (id) => { await API(`/api/operations/sleep/${id}/check`, { method:"PUT" }); load(); }; // catch: .catch(e=>console.error('API error:',e))
  const wakeUp  = async (id) => { await API(`/api/operations/sleep/${id}/wake`,  { method:"PUT" }); load(); }; // catch: .catch(e=>console.error('API error:',e))

  const sleeping  = records.filter(r => r.sleep_start && !r.sleep_end);
  const completed = records.filter(r => r.sleep_end);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ ...card }}>
        <div style={{ fontWeight:700, fontSize:14, color:DARK, marginBottom:14 }}>Start Sleep Record</div>
        <div style={{ display:"flex", gap:10, alignItems:"flex-end" }}>
          <div style={{ flex:1 }}>
            <label style={lbl}>Child</label>
            <select value={childId} onChange={e => setChildId(e.target.value)} style={inp}>
              <option value="">Select child…</option>
              {children.filter(c => !sleeping.find(s => s.child_id === c.id))
                .map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </div>
          <button style={btnP} onClick={startSleep}>Start Sleep</button>
        </div>
      </div>

      {sleeping.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight:700, fontSize:14, color:DARK, marginBottom:14 }}>
            😴 Currently Sleeping ({sleeping.length})
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:12 }}>
            {sleeping.map(s => {
              const overdue = s.check_overdue;
              const nextDue = s.next_check_due;
              return (
                <div key={s.id} style={{ padding:"14px 16px", borderRadius:12,
                  background:overdue?"#FEF2F2":"#F0F9FF",
                  border:`2px solid ${overdue?DANGER:"#BAE6FD"}` }}>
                  {overdue && <div style={{ color:DANGER, fontWeight:700, fontSize:12, marginBottom:6 }}>⚠️ CHECK OVERDUE</div>}
                  <div style={{ fontWeight:700, fontSize:14, color:DARK }}>{s.first_name} {s.last_name}</div>
                  <div style={{ fontSize:12, color:MUTED, marginTop:2 }}>
                    {s.room_name} · {s.age_months < 24 ? `${s.age_months}m (under 2, checks required)` : `${Math.floor(s.age_months/12)}y`}
                  </div>
                  <div style={{ display:"flex", gap:16, marginTop:8, fontSize:13 }}>
                    <span>Slept: <strong>{fmtTime(s.sleep_start)}</strong></span>
                    {nextDue && <span style={{ color:overdue?DANGER:P }}>Next check: <strong>{fmtTime(nextDue)}</strong></span>}
                  </div>
                  {s.checks && JSON.parse(s.checks||"[]").length > 0 && (
                    <div style={{ fontSize:11, color:MUTED, marginTop:4 }}>
                      Checks: {JSON.parse(s.checks).join(", ")}
                    </div>
                  )}
                  <div style={{ display:"flex", gap:8, marginTop:12 }}>
                    <button onClick={() => doCheck(s.id)} style={{ ...btnP, fontSize:12, padding:"6px 14px" }}>✓ Check</button>
                    <button onClick={() => wakeUp(s.id)}  style={{ ...btnS, fontSize:12, padding:"6px 14px" }}>☀️ Woke Up</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight:700, fontSize:14, color:DARK, marginBottom:14 }}>Completed Today</div>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead><tr style={{ background:"#F8F5FC" }}>
              {["Child","Room","Start","End","Duration","Checks"].map(h => (
                <th key={h} style={{ padding:"8px 10px", textAlign:"left", color:MUTED, fontWeight:700, fontSize:11 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {completed.map(s => (
                <tr key={s.id} style={{ borderBottom:"1px solid #F0EBF8" }}>
                  <td style={{ padding:"8px 10px", fontWeight:600 }}>{s.first_name} {s.last_name}</td>
                  <td style={{ padding:"8px 10px", color:MUTED }}>{s.room_name}</td>
                  <td style={{ padding:"8px 10px", fontFamily:"monospace" }}>{fmtTime(s.sleep_start)}</td>
                  <td style={{ padding:"8px 10px", fontFamily:"monospace" }}>{fmtTime(s.sleep_end)}</td>
                  <td style={{ padding:"8px 10px" }}>{s.duration_mins ? `${Math.floor(s.duration_mins/60)}h ${s.duration_mins%60}m` : "—"}</td>
                  <td style={{ padding:"8px 10px", color:OK }}>{JSON.parse(s.checks||"[]").length} checks</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sleeping.length === 0 && completed.length === 0 && !loading && (
        <div style={{ ...card, textAlign:"center", padding:"40px 20px", color:MUTED }}>
          <div style={{ fontSize:40, marginBottom:12 }}>😴</div>
          <div style={{ fontWeight:600, color:DARK }}>No sleep records today</div>
          <p style={{ fontSize:12 }}>Use the form above to start tracking a child's sleep.</p>
        </div>
      )}
    </div>
  );
}

// ─── Hazard & Maintenance ─────────────────────────────────────────────────────
function HazardTab() {
  const [hazards, setHazards] = useState([]);
  const [statusFilter, setStatusFilter] = useState("open");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ report_type:"hazard", title:"", description:"", location:"", risk_level:"medium", reported_by:"" });
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    API(`/api/operations/hazards?status=${statusFilter}`)
      .then(r => setHazards(r.hazards||[]))
      .finally(() => setLoading(false));
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.title) return;
    try {
      await API("/api/operations/hazards", { method:"POST", body:form });
      setShowForm(false);
      setForm({ report_type:"hazard", title:"", description:"", location:"", risk_level:"medium", reported_by:"" });
      load();
    } catch(e) { console.error('API error:', e); }
  };

  const updateStatus = async (id, status) => {
    await API(`/api/operations/hazards/${id}`, { method:"PUT", body:{ status } }).catch(e=>console.error('API error:',e));
    load();
  };

  const riskColor = { critical:DANGER, high:"#EA580C", medium:WARN, low:OK };
  const typeIcon  = { hazard:"⚠️", maintenance:"🔧", near_miss:"👁️" };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:4 }}>
          {["open","in_progress","resolved","all"].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{ padding:"7px 14px", borderRadius:8, border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
                background:statusFilter===s?P:"#F0EBF8", color:statusFilter===s?"#fff":P }}>
              {s.replace("_"," ")}
            </button>
          ))}
        </div>
        <button style={{ ...btnP, marginLeft:"auto" }} onClick={() => setShowForm(v=>!v)}>
          {showForm ? "Cancel" : "+ Report Hazard / Maintenance"}
        </button>
      </div>

      {showForm && (
        <div style={{ ...card, background:"#FFFBEB", border:"1px solid #FDE68A" }}>
          <div style={{ fontWeight:700, fontSize:14, color:WARN, marginBottom:14 }}>New Report</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div style={{ gridColumn:"span 2" }}>
              <label style={lbl}>Title *</label>
              <input value={form.title} onChange={e => setForm(p=>({...p,title:e.target.value}))} style={inp} placeholder="Brief description of the issue" />
            </div>
            <div>
              <label style={lbl}>Type</label>
              <select value={form.report_type} onChange={e => setForm(p=>({...p,report_type:e.target.value}))} style={inp}>
                <option value="hazard">Hazard</option>
                <option value="maintenance">Maintenance Required</option>
                <option value="near_miss">Near Miss</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Risk Level</label>
              <select value={form.risk_level} onChange={e => setForm(p=>({...p,risk_level:e.target.value}))} style={inp}>
                {["critical","high","medium","low"].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Location</label>
              <input value={form.location} onChange={e => setForm(p=>({...p,location:e.target.value}))} style={inp} placeholder="e.g. Playground, Room 2" />
            </div>
            <div>
              <label style={lbl}>Reported By</label>
              <input value={form.reported_by} onChange={e => setForm(p=>({...p,reported_by:e.target.value}))} style={inp} placeholder="Your name" />
            </div>
            <div style={{ gridColumn:"span 2" }}>
              <label style={lbl}>Description</label>
              <textarea value={form.description} onChange={e => setForm(p=>({...p,description:e.target.value}))} rows={3} style={{ ...inp, resize:"vertical" }} />
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:14 }}>
            <button style={btnP} onClick={submit}>Submit Report</button>
            <button style={btnS} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {loading ? <div style={{ color:MUTED }}>Loading…</div>
          : hazards.length === 0 ? (
            <div style={{ ...card, textAlign:"center", padding:"30px 0", color:MUTED }}>
              <div style={{ fontSize:36 }}>✅</div>
              <div style={{ marginTop:8 }}>No {statusFilter === "all" ? "" : statusFilter} issues</div>
            </div>
          ) : hazards.map(h => (
            <div key={h.id} style={{ ...card, borderLeft:`4px solid ${riskColor[h.risk_level]||WARN}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <span style={{ fontSize:16 }}>{typeIcon[h.report_type]||"⚠️"}</span>
                    <span style={{ fontWeight:700, fontSize:14, color:DARK }}>{h.title}</span>
                    <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20,
                      background:(riskColor[h.risk_level]||WARN)+"22", color:riskColor[h.risk_level]||WARN }}>
                      {h.risk_level}
                    </span>
                  </div>
                  {h.description && <div style={{ fontSize:12, color:MUTED, marginBottom:4 }}>{h.description}</div>}
                  <div style={{ fontSize:11, color:MUTED }}>
                    {h.location && `📍 ${h.location} · `}
                    {h.reported_by && `Reported by ${h.reported_by} · `}
                    {fmtDate(h.created_at?.split(" ")[0])}
                  </div>
                </div>
                <div style={{ display:"flex", gap:6, flexShrink:0, marginLeft:16 }}>
                  {h.status === "open" && (
                    <>
                      <button onClick={() => updateStatus(h.id,"in_progress")}
                        style={{ padding:"5px 12px", borderRadius:7, border:`1px solid ${WARN}`, background:"#FFFBEB", color:WARN, cursor:"pointer", fontSize:11, fontWeight:600 }}>
                        In Progress
                      </button>
                      <button onClick={() => updateStatus(h.id,"resolved")}
                        style={{ padding:"5px 12px", borderRadius:7, border:`1px solid ${OK}`, background:"#F0FDF4", color:OK, cursor:"pointer", fontSize:11, fontWeight:600 }}>
                        Resolve
                      </button>
                    </>
                  )}
                  {h.status === "in_progress" && (
                    <button onClick={() => updateStatus(h.id,"resolved")}
                      style={{ padding:"5px 12px", borderRadius:7, border:`1px solid ${OK}`, background:"#F0FDF4", color:OK, cursor:"pointer", fontSize:11, fontWeight:600 }}>
                      ✓ Resolve
                    </button>
                  )}
                  <span style={{ fontSize:11, padding:"5px 10px", borderRadius:7, fontWeight:700,
                    background:h.status==="resolved"?"#F0FDF4":h.status==="in_progress"?"#FFFBEB":"#FEF2F2",
                    color:h.status==="resolved"?OK:h.status==="in_progress"?WARN:DANGER }}>
                    {h.status.replace("_"," ")}
                  </span>
                </div>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ─── Responsible Person Log ───────────────────────────────────────────────────
function RPLogTab() {
  const [log, setLog] = useState([]);
  const [educators, setEducators] = useState([]);
  const [date, setDate] = useState(today());
  const [form, setForm] = useState({ educator_id:"", start_time:"", end_time:"" });
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      API(`/api/operations/rp-log?date=${date}`),
      API("/api/educators/simple"),
    ]).then(([r, er]) => {
      setLog(r.log||[]);
      setEducators(Array.isArray(er)?er:(er.educators||er.data||[]));
    });
  }, [date]);
  useEffect(() => { load(); }, [load]);

  const addEntry = async () => {
    if (!form.educator_id || !form.start_time) return;
    await API(`/api/operations/rp-log?date=${date}`, { method:"POST", body:form }).catch(e=>console.error('API error:',e));
    setForm({ educator_id:"", start_time:"", end_time:"" });
    setShowForm(false);
    load();
  };

  const sign = async (id, field) => {
    await API(`/api/operations/rp-log/${id}`, { method:"PUT", body:{ [field]: 1 } }).catch(e=>console.error('API error:',e));
    load();
  };

  // Eligible RPs: first aid + cpr + anaphylaxis current
  const eligible = educators.filter(e => {
    const cpr = e.cpr_expiry && new Date(e.cpr_expiry) > new Date();
    const ana = e.anaphylaxis_expiry && new Date(e.anaphylaxis_expiry) > new Date();
    return e.first_aid && cpr && ana;
  });

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ ...card, background:log.length>0&&log.some(l=>l.signed_by_educator&&l.signed_by_director)?"#F0FDF4":"#FFFBEB",
        border:`1px solid ${log.length>0&&log.some(l=>l.signed_by_educator&&l.signed_by_director)?"#A5D6A7":"#FDE68A"}` }}>
        <div style={{ fontWeight:700, fontSize:14, color:DARK, marginBottom:4 }}>
          Responsible Person Log — {fmtDate(date)}
        </div>
        <div style={{ fontSize:12, color:MUTED }}>
          A Responsible Person must be present at all times. The RP must hold current First Aid, CPR and Anaphylaxis certificates.
        </div>
      </div>

      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, width:"auto" }} />
        <button style={{ ...btnP, marginLeft:"auto" }} onClick={() => setShowForm(v=>!v)}>
          {showForm ? "Cancel" : "+ Add RP Entry"}
        </button>
      </div>

      {showForm && (
        <div style={{ ...card, background:"#F8F5FC", border:"1px solid #DDD6EE" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12 }}>
            <div>
              <label style={lbl}>Responsible Person *</label>
              <select value={form.educator_id} onChange={e => setForm(p=>({...p,educator_id:e.target.value}))} style={inp}>
                <option value="">Select eligible educator…</option>
                {eligible.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} — {e.qualification}</option>)}
              </select>
              {eligible.length === 0 && <div style={{ fontSize:11, color:DANGER, marginTop:3 }}>No eligible RP educators — certifications may be expired</div>}
            </div>
            <div>
              <label style={lbl}>Start Time *</label>
              <input type="time" value={form.start_time} onChange={e => setForm(p=>({...p,start_time:e.target.value}))} style={inp} />
            </div>
            <div>
              <label style={lbl}>End Time</label>
              <input type="time" value={form.end_time} onChange={e => setForm(p=>({...p,end_time:e.target.value}))} style={inp} />
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button style={btnP} onClick={addEntry}>Add Entry</button>
            <button style={btnS} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={card}>
        {log.length === 0 ? (
          <div style={{ textAlign:"center", padding:"30px 0", color:MUTED }}>
            <div style={{ fontSize:32 }}>🛡️</div>
            <div style={{ marginTop:8 }}>No RP entries for this date</div>
          </div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead><tr style={{ background:"#F8F5FC" }}>
              {["Responsible Person","Qualification","Start","End","Educator Signed","Director Signed"].map(h => (
                <th key={h} style={{ padding:"8px 10px", textAlign:"left", color:MUTED, fontWeight:700, fontSize:11 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {log.map(l => (
                <tr key={l.id} style={{ borderBottom:"1px solid #F0EBF8" }}>
                  <td style={{ padding:"8px 10px", fontWeight:600 }}>{l.first_name} {l.last_name}</td>
                  <td style={{ padding:"8px 10px", color:MUTED }}>{l.qualification}</td>
                  <td style={{ padding:"8px 10px", fontFamily:"monospace" }}>{fmtTime(l.start_time)}</td>
                  <td style={{ padding:"8px 10px", fontFamily:"monospace" }}>{l.end_time ? fmtTime(l.end_time) : "—"}</td>
                  <td style={{ padding:"8px 10px" }}>
                    {l.signed_by_educator
                      ? <span style={{ color:OK, fontWeight:700 }}>✓ Signed</span>
                      : <button onClick={() => sign(l.id,"signed_by_educator")} style={{ ...btnS, padding:"4px 10px", fontSize:11 }}>Sign</button>
                    }
                  </td>
                  <td style={{ padding:"8px 10px" }}>
                    {l.signed_by_director
                      ? <span style={{ color:OK, fontWeight:700 }}>✓ Signed</span>
                      : <button onClick={() => sign(l.id,"signed_by_director")} style={{ ...btnS, padding:"4px 10px", fontSize:11 }}>Sign</button>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Handover Form ────────────────────────────────────────────────────────────
function HandoverTab() {
  const [forms, setForms] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({
    shift_type:"end_of_day", room_id:"", submitted_by:"", children_present:"",
    incidents_summary:"", medications_given:"", sleep_notes:"", meals_notes:"",
    behaviour_notes:"", outstanding_tasks:"", messages_for_families:"", general_notes:""
  });

  const load = useCallback(() => {
    Promise.all([
      API(`/api/operations/handover?date=${today()}`),
      API("/api/rooms/simple"),
    ]).then(([r,rm]) => {
      setForms(r.forms||[]);
      setRooms(rm.rooms||rm||[]);
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    try {
      await API("/api/operations/handover", { method:"POST", body:{ ...form, children_present:parseInt(form.children_present)||0 } }).catch(e=>console.error('API error:',e));
      setShowForm(false);
      setForm({ shift_type:"end_of_day", room_id:"", submitted_by:"", children_present:"", incidents_summary:"", medications_given:"", sleep_notes:"", meals_notes:"", behaviour_notes:"", outstanding_tasks:"", messages_for_families:"", general_notes:"" });
      load();
    } catch(e) { console.error('API error:', e); }
  };

  const acknowledge = async (id) => {
    await API(`/api/operations/handover/${id}/acknowledge`, { method:"PUT", body:{ acknowledged_by:"Admin" } }).catch(e=>console.error('API error:',e));
    load();
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontSize:13, color:MUTED }}>End-of-shift notes for incoming educator</div>
        <button style={btnP} onClick={() => setShowForm(v=>!v)}>{showForm?"Cancel":"+ New Handover"}</button>
      </div>

      {showForm && (
        <div style={{ ...card, background:"#F8F5FC", border:"1px solid #DDD6EE" }}>
          <div style={{ fontWeight:700, fontSize:14, color:P, marginBottom:14 }}>Handover Form</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12 }}>
            <div>
              <label style={lbl}>Shift Type</label>
              <select value={form.shift_type} onChange={e => setForm(p=>({...p,shift_type:e.target.value}))} style={inp}>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="end_of_day">End of Day</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Room</label>
              <select value={form.room_id} onChange={e => setForm(p=>({...p,room_id:e.target.value}))} style={inp}>
                <option value="">All rooms</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Submitted By</label>
              <input value={form.submitted_by} onChange={e => setForm(p=>({...p,submitted_by:e.target.value}))} style={inp} placeholder="Your name" />
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {[["incidents_summary","Incidents / Accidents"],["medications_given","Medications Given"],
              ["sleep_notes","Sleep Notes"],["meals_notes","Meals / Feeding"],
              ["behaviour_notes","Behaviour Notes"],["outstanding_tasks","Outstanding Tasks"],
              ["messages_for_families","Messages for Families"],["general_notes","General Notes"]].map(([k,l]) => (
              <div key={k}>
                <label style={lbl}>{l}</label>
                <textarea value={form[k]} onChange={e => setForm(p=>({...p,[k]:e.target.value}))}
                  rows={2} style={{ ...inp, resize:"vertical" }} />
              </div>
            ))}
          </div>
          <div style={{ display:"flex", gap:8, marginTop:14 }}>
            <button style={btnP} onClick={submit}>Submit Handover</button>
            <button style={btnS} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {forms.length === 0 ? (
          <div style={{ ...card, textAlign:"center", padding:"30px 0", color:MUTED }}>
            <div style={{ fontSize:36 }}>📋</div>
            <div style={{ marginTop:8 }}>No handover forms today</div>
          </div>
        ) : forms.map(f => (
          <div key={f.id} style={{ ...card, cursor:"pointer", border:`1px solid ${selected?.id===f.id?P+"60":"#EDE8F4"}` }}
            onClick={() => setSelected(selected?.id===f.id?null:f)}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <span style={{ fontWeight:700, fontSize:14, color:DARK }}>{f.shift_type.replace("_"," ")} handover</span>
                <span style={{ fontSize:12, color:MUTED, marginLeft:10 }}>
                  {f.room_name||"All rooms"} · by {f.submitted_by||"Unknown"} · {f.created_at?.slice(11,16)}
                </span>
              </div>
              {f.acknowledged_at
                ? <span style={{ fontSize:12, color:OK, fontWeight:700 }}>✓ Acknowledged</span>
                : <button onClick={e => { e.stopPropagation(); acknowledge(f.id); }}
                    style={{ ...btnS, padding:"5px 12px", fontSize:11 }}>Acknowledge</button>
              }
            </div>
            {selected?.id === f.id && (
              <div style={{ marginTop:14, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                {[["incidents_summary","Incidents"],["medications_given","Medications"],["sleep_notes","Sleep"],
                  ["meals_notes","Meals"],["behaviour_notes","Behaviour"],["outstanding_tasks","Outstanding Tasks"],
                  ["messages_for_families","Family Messages"],["general_notes","General Notes"]].map(([k,l]) =>
                  f[k] ? (
                    <div key={k} style={{ padding:"10px 12px", borderRadius:8, background:"#F8F5FC" }}>
                      <div style={{ fontSize:11, fontWeight:700, color:MUTED, marginBottom:4 }}>{l.toUpperCase()}</div>
                      <div style={{ fontSize:13, color:DARK }}>{f[k]}</div>
                    </div>
                  ) : null
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Room Check-In ────────────────────────────────────────────────────────────
function RoomCheckinTab() {
  const [checkins, setCheckins] = useState([]);
  const [educators, setEducators] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [form, setForm] = useState({ educator_id:"", room_id:"" });

  const load = useCallback(() => {
    Promise.all([
      API(`/api/operations/room-checkins?date=${today()}`),
      API("/api/educators/simple"),
      API("/api/rooms/simple"),
    ]).then(([r,er,rm]) => {
      setCheckins(r.checkins||[]);
      setEducators(Array.isArray(er)?er:(er.educators||er.data||[]));
      setRooms(rm.rooms||rm||[]);
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  const checkIn = async () => {
    if (!form.educator_id || !form.room_id) return;
    await API("/api/operations/room-checkins", { method:"POST", body:form }).catch(e=>console.error('API error:',e));
    load();
  };

  const checkOut = async (id) => {
    await API(`/api/operations/room-checkins/${id}/checkout`, { method:"PUT" }).catch(e=>console.error('API error:',e));
    load();
  };

  const inRoom = checkins.filter(c => !c.checked_out_at);
  const roomGroups = {};
  inRoom.forEach(c => { (roomGroups[c.room_name] = roomGroups[c.room_name]||[]).push(c); });

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={card}>
        <div style={{ fontWeight:700, fontSize:14, color:DARK, marginBottom:14 }}>Check Into Room</div>
        <div style={{ display:"flex", gap:10, alignItems:"flex-end", flexWrap:"wrap" }}>
          <div style={{ flex:1, minWidth:180 }}>
            <label style={lbl}>Educator</label>
            <select value={form.educator_id} onChange={e => setForm(p=>({...p,educator_id:e.target.value}))} style={inp}>
              <option value="">Select educator…</option>
              {educators.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
          </div>
          <div style={{ flex:1, minWidth:140 }}>
            <label style={lbl}>Room</label>
            <select value={form.room_id} onChange={e => setForm(p=>({...p,room_id:e.target.value}))} style={inp}>
              <option value="">Select room…</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <button style={btnP} onClick={checkIn}>Check In</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:14 }}>
        {rooms.map(room => {
          const inRoom = checkins.filter(c => c.room_id===room.id && !c.checked_out_at);
          return (
            <div key={room.id} style={{ ...card, border:`1px solid ${inRoom.length>0?"#C4B5FD":"#EDE8F4"}` }}>
              <div style={{ fontWeight:700, fontSize:14, color:DARK, marginBottom:4 }}>{room.name}</div>
              <div style={{ fontSize:11, color:MUTED, marginBottom:10 }}>{room.age_group} · {inRoom.length} educators</div>
              {inRoom.length === 0
                ? <div style={{ fontSize:12, color:MUTED }}>No educators checked in</div>
                : inRoom.map(c => (
                  <div key={c.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid #F0EBF8" }}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:13 }}>{c.first_name} {c.last_name}</div>
                      <div style={{ fontSize:11, color:MUTED }}>In: {c.checked_in_at?.slice(11,16)}</div>
                    </div>
                    <button onClick={() => checkOut(c.id)}
                      style={{ padding:"4px 10px", borderRadius:7, border:"1px solid #EDE8F4", background:"#F8F5FC", color:P, cursor:"pointer", fontSize:11 }}>
                      Check Out
                    </button>
                  </div>
                ))
              }
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Shift Bidding ────────────────────────────────────────────────────────────
function ShiftBiddingTab() {
  const [shifts, setShifts] = useState([]);
  const [bids, setBids] = useState({});
  const [educators, setEducators] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      API("/api/operations/open-shifts"),
      API("/api/educators/simple"),
    ]).then(([sr, er]) => {
      setShifts(sr.shifts||[]);
      setEducators(Array.isArray(er)?er:(er.educators||er.data||[]));
    }).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadBids = async (entryId) => {
    const r = await API(`/api/operations/shift-bids?entry_id=${entryId}`).catch(e=>console.error('API error:',e));
    setBids(p => ({ ...p, [entryId]: r?.bids||[] }));
  };

  const placeBid = async (entryId, educatorId) => {
    await API("/api/operations/shift-bids", { method:"POST", body:{ roster_entry_id:entryId, educator_id:educatorId } }).catch(e=>console.error('API error:',e));
    loadBids(entryId);
  };

  const decide = async (bidId, status, entryId) => {
    await API(`/api/operations/shift-bids/${bidId}/decide`, { method:"PUT", body:{ status } }).catch(e=>console.error('API error:',e));
    load();
    loadBids(entryId);
  };

  const fmtShift = s => `${s.date} ${s.start_time?.slice(0,5)}–${s.end_time?.slice(0,5)}`;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ fontSize:13, color:MUTED }}>
        Open shifts that need filling. Educators can be assigned or bid; manager approves the best match.
      </div>

      {loading ? <div style={{ color:MUTED }}>Loading…</div>
        : shifts.length === 0 ? (
          <div style={{ ...card, textAlign:"center", padding:"40px 20px", color:MUTED }}>
            <div style={{ fontSize:36 }}>✅</div>
            <div style={{ marginTop:8, fontWeight:600, color:DARK }}>No unfilled shifts</div>
          </div>
        ) : shifts.map(shift => (
          <div key={shift.id} style={card}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:14, color:DARK }}>{shift.room_name || "Unassigned"}</div>
                <div style={{ fontSize:13, color:MUTED }}>{fmtShift(shift)} · {shift.age_group}</div>
                {shift.bid_count > 0 && (
                  <span style={{ fontSize:11, fontWeight:700, color:P, marginTop:4, display:"block" }}>{shift.bid_count} bid{shift.bid_count!==1?"s":""} pending</span>
                )}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => loadBids(shift.id)} style={btnS}>View Bids</button>
              </div>
            </div>

            {/* Quick assign */}
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom: bids[shift.id]?"12px":0 }}>
              <span style={{ fontSize:12, color:MUTED }}>Quick assign:</span>
              <select defaultValue="" style={{ ...inp, width:"auto", fontSize:12 }} id={`edu-${shift.id}`}>
                <option value="">Select educator…</option>
                {educators.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.qualification})</option>)}
              </select>
              <button onClick={() => {
                const sel = document.getElementById(`edu-${shift.id}`);
                if (sel?.value) placeBid(shift.id, sel.value);
              }} style={{ ...btnP, fontSize:12, padding:"6px 14px" }}>Assign & Bid</button>
            </div>

            {/* Bids list */}
            {bids[shift.id] && (
              <div style={{ borderTop:"1px solid #EDE8F4", paddingTop:12 }}>
                <div style={{ fontSize:12, fontWeight:700, color:MUTED, marginBottom:8 }}>BIDS (ranked by AI score)</div>
                {bids[shift.id].length === 0
                  ? <div style={{ fontSize:12, color:MUTED }}>No bids yet</div>
                  : bids[shift.id].map(b => (
                    <div key={b.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 12px", borderRadius:8, marginBottom:6,
                      background:b.status==="accepted"?"#F0FDF4":b.status==="declined"?"#F5F5F5":"#F8F5FC" }}>
                      <div style={{ flex:1 }}>
                        <span style={{ fontWeight:600, fontSize:13 }}>{b.first_name} {b.last_name}</span>
                        <span style={{ fontSize:11, color:MUTED, marginLeft:8 }}>{b.qualification}</span>
                      </div>
                      <div style={{ textAlign:"center", minWidth:60 }}>
                        <div style={{ fontSize:16, fontWeight:800, color:b.ai_score>70?OK:b.ai_score>50?WARN:DANGER }}>
                          {Math.round(b.ai_score)}
                        </div>
                        <div style={{ fontSize:10, color:MUTED }}>AI score</div>
                      </div>
                      <div style={{ display:"flex", gap:6 }}>
                        {b.status === "pending" && (
                          <>
                            <button onClick={() => decide(b.id,"accepted",shift.id)}
                              style={{ padding:"5px 12px", borderRadius:7, border:`1px solid ${OK}`, background:"#F0FDF4", color:OK, cursor:"pointer", fontSize:11, fontWeight:700 }}>
                              ✓ Accept
                            </button>
                            <button onClick={() => decide(b.id,"declined",shift.id)}
                              style={{ padding:"5px 12px", borderRadius:7, border:"1px solid #EDE8F4", background:"#F5F5F5", color:MUTED, cursor:"pointer", fontSize:11 }}>
                              Decline
                            </button>
                          </>
                        )}
                        {b.status !== "pending" && (
                          <span style={{ fontSize:11, fontWeight:700, color:b.status==="accepted"?OK:MUTED }}>{b.status}</span>
                        )}
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        ))
      }
    </div>
  );
}
