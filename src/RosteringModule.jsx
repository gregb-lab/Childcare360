import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import DatePicker from "./DatePicker.jsx";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}), ...opts.headers },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};
const nextMon = () => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().split("T")[0]; };
const addDays = (s, n) => { const d = new Date(s); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; };
const fmtDate = d => new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const tM = t => { if (!t) return 0; const [h,m] = t.split(":").map(Number); return h*60+(m||0); };
const mT = m => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;

const toast = (msg, type = "success") => { if (window.showToast) window.showToast(msg, type); };

const card = { background: "#fff", borderRadius: 14, border: "1px solid #E8E0D8", padding: "16px 20px", marginBottom: 12, boxShadow: "0 2px 10px rgba(80,60,90,0.03)" };
const btnP = { background: "linear-gradient(135deg,#8B6DAF,#7E5BA3)", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 };
const btnS = { background: "#F8F5F1", color: "#5C4E6A", border: "1px solid #D9D0C7", borderRadius: 10, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const inp = { width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #D9D0C7", fontSize: 12, background: "#FDFBF9", boxSizing: "border-box", fontFamily: "inherit" };
const sel = { ...inp };
const lbl = { display: "block", fontSize: 9, fontWeight: 700, color: "#8A7F96", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" };
const Badge = ({ text, color }) => <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 6, fontSize: 9, fontWeight: 700, color, background: color + "14", border: "1px solid " + color + "30", whiteSpace: "nowrap" }}>{text}</span>;

const Q = {
  ect: { l: "ECT (Bachelor+)", c: "#2E8B57", s: "ECT", lv: 4 },
  diploma: { l: "Diploma", c: "#7E5BA3", s: "DIP", lv: 3 },
  cert3: { l: "Certificate III", c: "#D4A26A", s: "C3", lv: 2 },
  working_towards_diploma: { l: "Working Towards Dip", c: "#5B8DB5", s: "WTD", lv: 3 },
  working_towards: { l: "Working Towards Cert III", c: "#B87D47", s: "WTC3", lv: 1 },
};
const EMP = { permanent: "Permanent", part_time: "Part-Time", casual: "Casual", contract: "Contract" };
// Per-room ratios only — ECT is a SERVICE-LEVEL requirement under NQF, not
// per room. Service-wide ECT compliance comes from /api/compliance/check.
const NQF_RATIOS = { babies: { ratio: 4 }, toddlers: { ratio: 5 }, preschool: { ratio: 11 }, oshc: { ratio: 15 } };
const AGE_MAP = { "babies":"babies","0-2":"babies","toddlers":"toddlers","2-3":"toddlers","preschool":"preschool","3-4":"preschool","3-5":"preschool","4-5":"preschool","oshc":"oshc","school_age":"oshc" };
const ROOM_COLORS = ["#8B6DAF","#6BA38B","#C9929E","#D4A26A","#5B8DB5","#9B7DC0","#C06B73","#4A8A6E"];
const GANTT_START = 300, GANTT_END = 1200, GANTT_SPAN = GANTT_END - GANTT_START; // 5am–8pm range
const pct = m => Math.max(0, Math.min(100, (m - GANTT_START) / GANTT_SPAN * 100));

export function RosteringModule() {
  const [tab, setTab] = useState("roster");
  const [fullscreen, setFullscreen] = useState(false);
  const [data, setData] = useState({ stats: null, educators: [], periods: [], fills: [], config: null, proposals: [], templates: [] });
  const [selPeriod, setSelPeriod] = useState(null);
  const [selEd, setSelEd] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({ operating_days: [1,2,3,4,5], open_time: "07:00", close_time: "18:30", default_period_type: "weekly", default_break_mins: 30 });

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && fullscreen) setFullscreen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [fullscreen]);

  const [archived, setArchived] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stats, eRes, pRes, frRes, acRes, cpRes, tRes, sRes] = await Promise.all([
        API("/api/rostering/stats"), API("/api/rostering/educators"), API("/api/rostering/periods"),
        API("/api/rostering/fill-requests"), API("/api/rostering/ai-config"), API("/api/rostering/change-proposals"),
        API("/api/rostering/templates"), API("/api/rostering/settings"),
      ]);
      setData({ stats, educators: eRes.educators || [], periods: pRes.periods || [], fills: frRes.requests || [], config: acRes.configs?.[0] || null, proposals: cpRes.proposals || [], templates: tRes.templates || [] });
      setArchived(pRes.archived || []);
      if (sRes && !sRes.error) setSettings(sRes);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadPeriod = async id => { try { const d = await API("/api/rostering/periods/" + id); if (d && !d.error) { setSelPeriod(d); localStorage.setItem('c360_last_period_id', id); } else console.error("loadPeriod error:", d?.error); } catch(e) { console.error("loadPeriod:", e.message); } };
  useEffect(() => { const lastId = localStorage.getItem('c360_last_period_id'); if (lastId) loadPeriod(lastId); }, []);
  const loadEd = async id => { try { const d = await API("/api/rostering/educators/" + id); setSelEd(d); } catch(e) {} };

  const pendingCount = data.proposals.filter(p => p.status === "pending").length;
  const tabs = [
    { id: "roster", l: "Roster", i: "📅", b: pendingCount },
    { id: "sickcover", l: "Sick Cover", i: "📱" },
    { id: "nctime", l: "Non-Contact", i: "📚" },
    { id: "patterns", l: "Patterns", i: "📈" },
    { id: "educators", l: "Educators", i: "👩‍🏫" },
    { id: "timesheet", l: "Timesheet", i: "🕐" },
    { id: "shiftbidding", l: "Shift Bidding", i: "📅" },
  ];

  if (loading && !data.stats) return <div style={{ textAlign: "center", padding: 60 }}><div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div><p style={{ color: "#8A7F96", fontWeight: 600 }}>Loading AI Rostering…</p></div>;

  const fsStyle = fullscreen ? { position: "fixed", inset: 0, zIndex: 9999, background: "#F8F5F1", overflowY: "auto", padding: "0 0 40px" } : {};

  return (
    <div style={fsStyle}>
      <div style={{ ...card, background: "linear-gradient(135deg,#EDE4F0,#E8F0ED)", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#3D3248" }}>🤖 AI Rostering & Workforce Intelligence</h2>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "#5C4E6A" }}>AI roster generation · NQF compliance · Sick cover · Timesheet</p>
        </div>
        <button onClick={() => setFullscreen(f => !f)}
          title={fullscreen ? "Exit full screen" : "Full screen"}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(139,109,175,0.3)", background: fullscreen ? "#7C3AED" : "rgba(139,109,175,0.1)", color: fullscreen ? "#fff" : "#7C3AED", cursor: "pointer", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {fullscreen ? "⛶ Exit Full Screen" : "⛶ Full Screen"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ ...btnS, background: tab === t.id ? "rgba(139,109,175,0.10)" : "#F8F5F1", color: tab === t.id ? "#7E5BA3" : "#6B5F7A", fontWeight: tab === t.id ? 700 : 500, border: tab === t.id ? "1px solid rgba(139,109,175,0.25)" : "1px solid #D9D0C7", position: "relative" }}>
            {t.i} {t.l}{t.b > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "#C06B73", color: "#fff", fontSize: 8, fontWeight: 800, borderRadius: 8, padding: "1px 5px" }}>{t.b}</span>}
          </button>
        ))}
      </div>
      {tab === "roster" && <RosterTab educators={data.educators} periods={data.periods} templates={data.templates} archived={archived} sp={selPeriod} loadP={loadPeriod} reload={load} settings={settings} proposals={data.proposals} />}
      {tab === "sickcover" && <SickCoverTab educators={data?.educators || []} fills={data?.fills || []} reload={load} />}
      {tab === "nctime" && <NonContactTab />}
      {tab === "patterns" && <PatternsTab />}
      {tab === "educators" && <EducatorsTab educators={data.educators} loadEd={loadEd} selEd={selEd} setSelEd={setSelEd} reload={load} />}
      {tab === "timesheet" && <TimesheetTab educators={data.educators} periods={data.periods} />}
      {tab === "shiftbidding" && <ShiftBiddingRoster />}
    </div>
  );
}

function ShiftBiddingRoster() {
  const [shifts, setShifts] = useState([]);
  const [bids, setBids] = useState({});
  const load = useCallback(() => {
    API("/api/operations/open-shifts").then(r => setShifts(r.shifts||[])).catch(()=>{});
  }, []);
  useEffect(() => { load(); }, [load]);
  const loadBids = async (entryId) => {
    const r = await API(`/api/operations/shift-bids?entry_id=${entryId}`).catch(()=>({}));
    setBids(p => ({...p, [entryId]: r.bids||[]}));
  };
  const decideBid = async (bidId, status) => {
    await API(`/api/operations/shift-bids/${bidId}/decide`, { method:"PUT", body:{ status } }).catch(()=>{});
    load();
  };
  if (!shifts.length) return <div style={{padding:40,textAlign:"center",color:"#8A7F96"}}>No open shifts available for bidding.</div>;
  return (
    <div style={{padding:"0 4px"}}>
      <h3 style={{margin:"0 0 16px",fontSize:15,fontWeight:700}}>Open Shifts — Bidding</h3>
      {shifts.map(s => (
        <div key={s.id} style={{background:"#fff",borderRadius:12,border:"1px solid #EDE8F4",padding:"14px 18px",marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:13}}>{s.room_name} · {s.date} · {s.start_time}–{s.end_time}</div>
          <button onClick={()=>loadBids(s.id)} style={{marginTop:8,padding:"6px 14px",borderRadius:7,border:"1px solid #7C3AED",background:"#fff",color:"#7C3AED",fontWeight:600,fontSize:12,cursor:"pointer"}}>View Bids</button>
          {bids[s.id] && bids[s.id].map(b => (
            <div key={b.id} style={{marginTop:8,display:"flex",alignItems:"center",gap:10,fontSize:12}}>
              <span>{b.educator_name}</span>
              <button onClick={()=>decideBid(b.id,"approved")} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"#16A34A",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>Approve</button>
              <button onClick={()=>decideBid(b.id,"rejected")} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"#DC2626",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>Reject</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ═══ DASHBOARD ═══ */
function DashboardTab({ d }) {
  const s = d.stats || {}, ed = s.educators || {};
  const todayStr = new Date().toISOString().slice(0,10);
  const thisWeekShifts = (d.periods||[]).find(p=>p.status==="published"&&p.start_date<=todayStr&&p.end_date>=todayStr);

  const relData = [
    { name: "90-100%", v: d.educators.filter(e => (e.reliability_score||0) >= 90).length, fill: "#2E8B57" },
    { name: "75-89%", v: d.educators.filter(e => (e.reliability_score||0) >= 75 && (e.reliability_score||0) < 90).length, fill: "#D4A26A" },
    { name: "<75%", v: d.educators.filter(e => (e.reliability_score||0) < 75).length, fill: "#C06B73" },
  ];
  const qualData = Object.entries(Q).map(([k, v]) => ({ name: v.s, v: d.educators.filter(e => e.qualification === k).length, fill: v.c })).filter(x => x.v > 0);
  const MC = ({ icon, label, value, sfx, color, sub }) => (
    <div style={{ ...card, padding: "10px 12px", marginBottom: 0, textAlign: "center" }}>
      <div style={{ fontSize: 15 }}>{icon}</div>
      <div style={{ fontSize: 8, fontWeight: 700, color: "#8A7F96", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || "#3D3248" }}>{value}{sfx}</div>
      {sub && <div style={{ fontSize: 8, color: "#A89DB5" }}>{sub}</div>}
    </div>
  );
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 8, marginBottom: 14 }}>
        <MC icon="👩‍🏫" label="Active Staff" value={ed.active||0} sub={(ed.total||0)+" total"} color="#8B6DAF" />
        <MC icon="⭐" label="Avg Reliability" value={ed.avg_reliability||"—"} sfx="%" color={(ed.avg_reliability||0)>=85?"#2E8B57":"#D4A26A"} />
        <MC icon="📅" label="Next 7 Days" value={s.upcoming_shifts||0} sub="shifts" />
        <MC icon="🤒" label="Absences 30d" value={s.absences_30d||0} color={(s.absences_30d||0)>5?"#C06B73":"#2E8B57"} />
        <MC icon="✅" label="Fill Rate" value={s.fill_rate||100} sfx="%" color={(s.fill_rate||100)>=80?"#2E8B57":"#C06B73"} />
        <MC icon="🔔" label="Pending" value={s.pending_proposals||0} color={(s.pending_proposals||0)>0?"#D4A26A":"#2E8B57"} />
      </div>

      {/* This week's roster status */}
      {thisWeekShifts ? (
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"14px 20px",marginBottom:12,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#3D3248"}}>📅 Current Published Roster</div>
          <div style={{fontSize:12,color:"#8A7F96"}}>{thisWeekShifts.start_date} → {thisWeekShifts.end_date}</div>
          <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,background:"#E8F5E9",color:"#2E7D32"}}>Published</span>
          <div style={{fontSize:12,color:"#5C4E6A"}}>{thisWeekShifts.entry_count||0} shifts · {thisWeekShifts.educator_count||0} educators</div>
        </div>
      ) : (
        <div style={{background:"#FFF9F0",borderRadius:14,border:"1px dashed #F0C070",padding:"12px 20px",marginBottom:12,display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:20}}>📅</span>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:"#E65100"}}>No published roster for this week</div>
            <div style={{fontSize:11,color:"#8A7F96"}}>Go to the Roster tab to build and publish a roster</div>
          </div>
        </div>
      )}

      {/* Weekly Budget Tracker */}
      {d.weekly_cost && (d.weekly_cost.total_cents > 0 || d.weekly_cost.budget_cents > 0) && (()=>{
        const spent = d.weekly_cost.total_cents / 100;
        const budget = d.weekly_cost.budget_cents / 100;
        const pct = budget > 0 ? Math.min((spent/budget)*100, 100) : 0;
        const over = budget > 0 && spent > budget;
        const barColor = over ? "#C62828" : pct > 85 ? "#E65100" : "#2E7D32";
        return (
          <div style={{...card, marginBottom:12, padding:"14px 18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8}}>
              <div style={{fontWeight:700,fontSize:13,color:"#3D3248"}}>💰 Weekly Labour Cost</div>
              <div style={{fontSize:12,color:over?"#C62828":"#8A7F96",fontWeight:over?700:400}}>
                ${spent.toLocaleString("en-AU",{minimumFractionDigits:0,maximumFractionDigits:0})}
                {budget>0 && <span style={{color:"#A89DB5"}}> / ${budget.toLocaleString("en-AU",{minimumFractionDigits:0,maximumFractionDigits:0})} budget</span>}
                {over && <span style={{color:"#C62828",fontWeight:700}}> ⚠ OVER</span>}
              </div>
            </div>
            {budget > 0 && (
              <div style={{height:8,background:"#EDE8F4",borderRadius:4,overflow:"hidden"}}>
                <div style={{height:"100%",width:pct+"%",background:barColor,borderRadius:4,transition:"width 0.5s"}}/>
              </div>
            )}
            {d.weekly_cost.days?.length > 0 && (
              <div style={{display:"flex",gap:4,marginTop:8}}>
                {d.weekly_cost.days.map(day=>(
                  <div key={day.date} style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:9,color:"#A89DB5"}}>{new Date(day.date+"T12:00").toLocaleDateString("en-AU",{weekday:"short"})}</div>
                    <div style={{fontSize:11,fontWeight:600,color:"#5C4E6A"}}>${Math.round(day.day_cost/100)}</div>
                    <div style={{fontSize:9,color:"#A89DB5"}}>{day.shifts}sh</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={card}><h4 style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700 }}>Reliability Distribution</h4><ResponsiveContainer width="100%" height={160}><BarChart data={relData} layout="vertical" margin={{left:40,right:20,top:4,bottom:4}}><XAxis type="number" tick={{fontSize:10}} allowDecimals={false} label={{value:"Educators",position:"insideBottom",offset:-2,fontSize:10}}/><YAxis type="category" dataKey="name" tick={{fontSize:10}} width={60}/><Tooltip formatter={(v)=>[v+" educators","Count"]}/><Bar dataKey="v" radius={[0,4,4,0]}>{relData.map((x,i)=><Cell key={i} fill={x.fill}/>)}</Bar></BarChart></ResponsiveContainer></div>
        <div style={card}><h4 style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700 }}>Qualification Mix</h4><ResponsiveContainer width="100%" height={160}><BarChart data={qualData} margin={{left:10,right:10,top:4,bottom:30}}><XAxis dataKey="name" tick={{fontSize:9}} angle={-20} textAnchor="end" interval={0} label={{value:"Qualification",position:"insideBottom",offset:-20,fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false} label={{value:"Educators",angle:-90,position:"insideLeft",offset:10,fontSize:10}}/><Tooltip formatter={(v,n,p)=>[v+" educators",p.payload.name]}/><Bar dataKey="v" radius={[4,4,0,0]}>{qualData.map((x,i)=><Cell key={i} fill={x.fill}/>)}</Bar></BarChart></ResponsiveContainer></div>
      </div>
      {d.fills.length > 0 && <div style={card}><h4 style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700 }}>Recent Sick Cover</h4>{d.fills.slice(0,5).map(f=>(<div key={f.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid #F0EBE6",fontSize:11}}><div><strong>{f.original_educator_name}</strong> <span style={{color:"#A89DB5"}}>{f.date} · {f.room_name}</span></div><div style={{display:"flex",gap:4}}><Badge text={f.status} color={f.status==="filled"?"#2E8B57":"#D4A26A"}/>{f.filled_by_name&&<span style={{color:"#2E8B57",fontSize:10}}>→ {f.filled_by_name}</span>}</div></div>))}</div>}
    </div>
  );
}

/* ═══ EDUCATORS ═══ */
const STAFF_TYPE_LABELS = { cook:"Cook", admin:"Admin", cleaner:"Cleaner", maintenance:"Maintenance", student:"Student", volunteer:"Volunteer", coordinator:"Coordinator", other:"Support" };
const STAFF_TYPE_COLORS = { cook:"#E65100", admin:"#1565C0", cleaner:"#455A64", maintenance:"#6D4C41", student:"#2E7D32", volunteer:"#00838F", coordinator:"#5B21B6", other:"#757575" };
const isInRatio = (e) => (e.counts_in_ratio != null ? !!e.counts_in_ratio : !e.staff_type || e.staff_type === 'educator');

function EducatorsTab({ educators, loadEd, selEd, setSelEd, reload }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("reliability");
  const [editing, setEditing] = useState(null);

  const matches = (e) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (e.first_name+" "+e.last_name).toLowerCase().includes(s)||(e.suburb||"").toLowerCase().includes(s)||(e.qualification||"").includes(s);
  };
  const sorter = (a,b) => {
    if (sort==="reliability") return (b.reliability_score||0)-(a.reliability_score||0);
    if (sort==="name") return (a.last_name||"").localeCompare(b.last_name||"");
    if (sort==="distance") return (a.distance_km||99)-(b.distance_km||99);
    if (sort==="cost") return (a.hourly_rate_cents||0)-(b.hourly_rate_cents||0);
    return 0;
  };
  const educatorList = educators.filter(e => matches(e) && isInRatio(e)).sort(sorter);
  const supportList  = educators.filter(e => matches(e) && !isInRatio(e)).sort(sorter);

  if (editing!==null) return <EditorForm ed={editing==="new"?null:editing} onDone={()=>{setEditing(null);reload();}} />;

  const renderRow = (e) => {
    const rc=(e.reliability_score||0)>=90?"#2E8B57":(e.reliability_score||0)>=75?"#D4A26A":"#C06B73";
    const qx=Q[e.qualification]||{l:"?",c:"#999",s:"?"};
    const isSupport = !isInRatio(e);
    const stColor = STAFF_TYPE_COLORS[e.staff_type] || qx.c;
    return (
      <div key={e.id} onClick={()=>loadEd(e.id)} style={{...card,padding:10,marginBottom:4,cursor:"pointer",borderLeft:"3px solid "+stColor,...(selEd?.educator?.id===e.id?{boxShadow:"0 0 0 2px rgba(139,109,175,0.3)"}:{})}}>
        <div style={{display:"flex",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:"#3D3248"}}>{e.first_name} {e.last_name}{e.role_title && <span style={{fontSize:10,fontWeight:500,color:"#8A7F96",marginLeft:6}}>· {e.role_title}</span>}</div>
            <div style={{display:"flex",gap:3,marginTop:2,flexWrap:"wrap"}}>
              {isSupport ? <Badge text={STAFF_TYPE_LABELS[e.staff_type]||"Support"} color={stColor}/> : <Badge text={qx.l} color={qx.c}/>}
              <Badge text={EMP[e.employment_type]||""} color="#8A7F96"/>
              {!isSupport && e.first_aid?<Badge text="FA ✓" color="#2E8B57"/>:null}
              {!isSupport && e.is_under_18?<Badge text="U18" color="#D4A26A"/>:null}
            </div>
          </div>
          <div style={{textAlign:"right"}}><div style={{fontSize:16,fontWeight:800,color:rc}}>{Math.round(e.reliability_score||0)}%</div><div style={{fontSize:8,color:"#A89DB5"}}>reliability</div></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:4,fontSize:9,color:"#5C4E6A",marginTop:4}}>
          <div>📍 {e.distance_km?e.distance_km+"km":"—"}</div><div>💰 ${((e.hourly_rate_cents||0)/100).toFixed(0)}/hr</div><div>📅 {e.max_hours_per_week||38}h max</div><div>🤒 {e.total_sick_days||0} sick</div>
        </div>
      </div>
    );
  };

  const SectionHeader = ({ label, count, sub }) => (
    <div style={{fontSize:10,fontWeight:800,color:"#5C4E6A",textTransform:"uppercase",letterSpacing:"0.08em",padding:"12px 4px 6px",borderBottom:"1px solid #EDE8F4",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span>{label} ({count})</span>
      {sub && <span style={{fontSize:9,color:"#8A7F96",fontWeight:500,textTransform:"none",letterSpacing:0}}>{sub}</span>}
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: selEd?"1fr 380px":"1fr", gap: 14 }}>
      <div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <input placeholder="Search name, suburb, qualification…" value={q} onChange={e=>setQ(e.target.value)} style={{...inp,flex:1}} />
          <select value={sort} onChange={e=>setSort(e.target.value)} style={{...sel,width:130}}><option value="reliability">Reliability</option><option value="name">Name</option><option value="distance">Distance</option><option value="cost">Cost</option></select>
          <button onClick={()=>setEditing("new")} style={btnP}>+ Add</button>
        </div>
        <SectionHeader label="Educators" count={educatorList.length} sub="Count toward NQF ratios" />
        {educatorList.map(renderRow)}
        {educatorList.length === 0 && <div style={{padding:"12px 4px",fontSize:12,color:"#8A7F96"}}>No educators match.</div>}
        <SectionHeader label="Support Staff" count={supportList.length} sub="Not in ratios — cooks, admin, cleaners, maintenance, students" />
        {supportList.map(renderRow)}
        {supportList.length === 0 && <div style={{padding:"12px 4px",fontSize:12,color:"#8A7F96"}}>No support staff yet. Add a cook, admin, or cleaner via Add.</div>}
      </div>
      {selEd?.educator && <div style={{...card,padding:14,position:"sticky",top:16,maxHeight:"calc(100vh - 200px)",overflowY:"auto"}}><DetailPanel d={selEd} onEdit={()=>setEditing(selEd.educator)} onClose={()=>setSelEd(null)}/></div>}
    </div>
  );
}

function DetailPanel({ d, onEdit, onClose }) {
  const e=d.educator, av=d.availability||[], ab=d.absences||[];
  const rc=(e.reliability_score||0)>=90?"#2E8B57":(e.reliability_score||0)>=75?"#D4A26A":"#C06B73";
  const ar=e.total_shifts_offered>0?Math.round(e.total_shifts_accepted/e.total_shifts_offered*100):100;
  const qx=Q[e.qualification]||{l:e.qualification,c:"#999"};
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
        <div><h3 style={{margin:0,fontSize:15,fontWeight:800}}>{e.first_name} {e.last_name}</h3><div style={{display:"flex",gap:3,marginTop:3}}><Badge text={qx.l} color={qx.c}/><Badge text={EMP[e.employment_type]||""} color="#8A7F96"/><Badge text={e.status} color={e.status==="active"?"#2E8B57":"#C06B73"}/></div></div>
        <div style={{display:"flex",gap:6,alignItems:"flex-start"}}><button onClick={onEdit} style={btnP}>✏️ Edit</button><button onClick={onClose} style={btnS}>✕</button></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:3,fontSize:11,marginBottom:8}}>
        <div>📧 {e.email||"—"}</div><div>📱 {e.phone||"—"}</div>
        <div style={{gridColumn:"1/-1"}}>📍 {e.address||"—"} {e.suburb?"("+e.suburb+")":""} {e.distance_km?<strong style={{color:"#7E5BA3"}}>{e.distance_km}km</strong>:""}</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,fontSize:11,padding:"6px 8px",borderRadius:8,background:"#F8F5F1",marginBottom:8}}>
        <div><span style={{fontSize:8,color:"#8A7F96"}}>Rate</span><br/><strong>${((e.hourly_rate_cents||0)/100).toFixed(2)}/hr</strong></div>
        <div><span style={{fontSize:8,color:"#8A7F96"}}>Hours</span><br/><strong>{e.contracted_hours||e.max_hours_per_week||38}h/wk</strong></div>
        <div><span style={{fontSize:8,color:"#8A7F96"}}>Annual</span><br/><strong>{e.annual_salary_cents?"$"+(e.annual_salary_cents/100).toLocaleString():"Casual"}</strong></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:3,marginBottom:8}}>
        {[{l:"Reliability",v:Math.round(e.reliability_score||0)+"%",g:(e.reliability_score||0)>=80},{l:"Accept",v:ar+"%",g:ar>=80},{l:"Sick",v:e.total_sick_days||0,g:(e.total_sick_days||0)<=3},{l:"Late",v:e.total_late_arrivals||0,g:(e.total_late_arrivals||0)<=2},{l:"No-Show",v:e.total_no_shows||0,g:(e.total_no_shows||0)===0}].map(m=>(
          <div key={m.l} style={{textAlign:"center",padding:3,borderRadius:6,background:m.g?"rgba(46,139,87,0.06)":"rgba(192,107,115,0.06)"}}><div style={{fontSize:7,color:"#8A7F96",fontWeight:700}}>{m.l}</div><div style={{fontSize:13,fontWeight:800,color:m.g?"#2E8B57":"#C06B73"}}>{m.v}</div></div>
        ))}
      </div>
      {(e.can_start_earlier_mins||0)>0||e.can_finish_later_mins>0 ?
        <div style={{padding:"6px 10px",borderRadius:8,background:"rgba(91,141,181,0.06)",border:"1px solid rgba(91,141,181,0.15)",fontSize:10,marginBottom:8}}>
          🔧 Flex: can start {e.can_start_earlier_mins||0} min earlier · can finish {e.can_finish_later_mins||0} min later
        </div> : null}
      <div style={{fontSize:9,fontWeight:700,color:"#5C4E6A",marginBottom:3}}>WEEKLY AVAILABILITY</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:8}}>
        {DAYS.map((day,i)=>{const a=av.find(x=>x.day_of_week===i);return(
          <div key={i} style={{textAlign:"center",padding:"3px 1px",borderRadius:4,background:a?.available?"rgba(46,139,87,0.06)":"rgba(192,107,115,0.04)",border:"1px solid "+(a?.available?"rgba(46,139,87,0.15)":"rgba(192,107,115,0.12)")}}>
            <div style={{fontSize:8,fontWeight:700,color:a?.available?"#2E8B57":"#C06B73"}}>{day}</div>
            {a?.available?<div style={{fontSize:7,color:"#5C4E6A"}}>{(a.start_time||"").slice(0,5)}-{(a.end_time||"").slice(0,5)}</div>:<div style={{fontSize:7,color:"#C06B73"}}>Off</div>}
          </div>
        );})}
      </div>
      {ab.length>0&&<div><div style={{fontSize:9,fontWeight:700,color:"#5C4E6A",marginBottom:3}}>RECENT ABSENCES</div>{ab.slice(0,4).map(a=><div key={a.id} style={{display:"flex",justifyContent:"space-between",padding:"2px 0",borderBottom:"1px solid #F0EBE6",fontSize:9}}><span>{a.date} · {a.type} · {a.reason}</span><Badge text={a.cover_found?"covered":"open"} color={a.cover_found?"#2E8B57":"#C06B73"}/></div>)}</div>}
    </div>
  );
}

function EditorForm({ ed, onDone }) {
  const isNew=!ed;
  const [f,setF]=useState({
    first_name:"",last_name:"",email:"",phone:"",address:"",suburb:"",postcode:"",
    qualification:"cert3",employment_type:"permanent",hourly_rate_cents:3500,annual_salary_cents:0,
    super_rate:11.5,max_hours_per_week:38,min_hours_per_week:0,contracted_hours:38,distance_km:0,
    first_aid:false,first_aid_expiry:"",cpr_expiry:"",anaphylaxis_expiry:"",asthma_expiry:"",
    wwcc_number:"",wwcc_expiry:"",is_under_18:false,notes:"",
    start_date:new Date().toISOString().split("T")[0],
    can_start_earlier_mins:0,can_finish_later_mins:0,is_lunch_cover:false,
    ...(ed||{}),
  });
  const [avail,setAvail]=useState([0,1,2,3,4,5,6].map(d=>({day:d,available:d>=1&&d<=5,start_time:"06:00",end_time:"18:30",preferred:d>=1&&d<=5})));
  const [section,setSection]=useState("personal");
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    if(ed?.id) API("/api/rostering/educators/"+ed.id+"/availability").then(r=>{
      if(r.availability?.length) {
        const defaults=[0,1,2,3,4,5,6].map(d=>({day:d,available:d>=1&&d<=5,start_time:"06:00",end_time:"18:30",preferred:d>=1&&d<=5}));
        const fromApi=r.availability.map(a=>({day:a.day_of_week,available:!!a.available,start_time:a.start_time||"06:00",end_time:a.end_time||"18:30",preferred:!!a.preferred}));
        setAvail(defaults.map(d=>fromApi.find(a=>a.day===d.day)||d));
      }
    });
  },[ed?.id]);

  const u=(k,v)=>setF(p=>({...p,[k]:v}));
  const save=async()=>{
    if(!f.first_name||!f.last_name) return window.showToast("Name is required", 'error');
    try {
      setSaving(true);
      const body={...f,first_aid:f.first_aid?1:0,is_under_18:f.is_under_18?1:0,is_lunch_cover:f.is_lunch_cover?1:0,availability:avail};
      if(isNew) await API("/api/rostering/educators",{method:"POST",body}).catch(e=>console.error('API error:',e));
      else await API("/api/rostering/educators/"+ed.id,{method:"PUT",body}).catch(e=>console.error('API error:',e));
      setSaving(false); onDone();
    } catch(e) { console.error('API error:', e); }
  };

  const F=({label,k,type,ph,opts,span})=>(
    <div style={{gridColumn:span?"span "+span:undefined}}>
      <label style={lbl}>{label}</label>
      {opts?<select style={sel} value={f[k]||""} onChange={e=>u(k,e.target.value)}>{opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        :type==="check"?<label style={{display:"flex",alignItems:"center",gap:5,fontSize:12,cursor:"pointer"}}><input type="checkbox" checked={!!f[k]} onChange={e=>u(k,e.target.checked)}/> {ph||"Yes"}</label>
        :type==="area"?<textarea style={{...inp,height:70,resize:"vertical"}} value={f[k]||""} onChange={e=>u(k,e.target.value)} placeholder={ph}/>
        :type==="date"?<DatePicker value={f[k]||""} onChange={v=>u(k,v)} />
        :<input type={type==="number"?"text":type||"text"} inputMode={type==="number"?"decimal":undefined} style={inp} value={f[k]===undefined||f[k]===null?"":String(f[k])} onChange={e=>u(k,e.target.value)} onBlur={type==="number"?e=>{const n=parseFloat(e.target.value);u(k,isNaN(n)?0:n);}:undefined} placeholder={ph}/>}
    </div>
  );
  const secs=[["personal","👤 Personal"],["employment","💰 Employment"],["availability","📅 Availability"],["flexibility","🔧 Flexibility"],["compliance","🛡️ Compliance"],["notes","📝 Notes"]];
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}><button onClick={onDone} style={btnS}>← Back</button><h3 style={{margin:0,fontSize:15,fontWeight:800}}>{isNew?"Add New Educator":"Edit: "+f.first_name+" "+f.last_name}</h3></div>
        <button onClick={save} disabled={saving} style={{...btnP,padding:"10px 24px",opacity:saving?0.6:1}}>{saving?"Saving…":"💾 Save"}</button>
      </div>
      <div style={{display:"flex",gap:4,marginBottom:12}}>{secs.map(([id,l])=><button key={id} onClick={()=>setSection(id)} style={{...btnS,background:section===id?"rgba(139,109,175,0.1)":"#F8F5F1",color:section===id?"#7E5BA3":"#6B5F7A",fontWeight:section===id?700:500}}>{l}</button>)}</div>
      <div style={card}>
        {section==="personal"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}><F label="First Name *" k="first_name" ph="Sarah" tabIndex={1}/><F label="Last Name *" k="last_name" ph="Mitchell" tabIndex={2}/><F label="Email" k="email" type="email" ph="sarah@centre.com.au"/><F label="Phone" k="phone" ph="0412 345 678"/><F label="Address" k="address" span={2} ph="12 Beach Rd"/><F label="Suburb" k="suburb" ph="Cronulla"/><F label="Postcode" k="postcode" ph="2230"/><F label="Distance (km)" k="distance_km" type="number"/><F label="Under 18?" k="is_under_18" type="check" ph="Under 18"/><F label="Start Date" k="start_date" type="date" tabIndex={3}/></div>}
        {section==="employment"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <F label="Qualification" k="qualification" opts={Object.entries(Q).map(([k,v])=>[k,v.l])}/>
          <F label="Employment Type" k="employment_type" opts={Object.entries(EMP).map(([k,v])=>[k,v])}/>
          <div><label style={lbl}>Hourly Rate ($)</label><input type="text" inputMode="decimal" style={inp} value={((f.hourly_rate_cents||0)/100).toFixed(2)} onBlur={e=>{const v=parseFloat(e.target.value)||0;u("hourly_rate_cents",Math.round(v*100));}} onChange={e=>u("hourly_rate_cents",e.target.value)} placeholder="35.00"/></div>
          <div><label style={lbl}>Annual Salary ($)</label><input type="number" step="1" style={inp} value={f.annual_salary_cents?((f.annual_salary_cents||0)/100).toFixed(0):""} onChange={e=>u("annual_salary_cents",Math.round(parseFloat(e.target.value||0)*100))} placeholder="0 for casual"/></div>
          <F label="Super Rate (%)" k="super_rate" type="number" ph="11.5"/>
          <F label="Max Hours/Week" k="max_hours_per_week" type="number"/>
          <F label="Min Hours/Week" k="min_hours_per_week" type="number"/>
          <F label="Contracted Hours" k="contracted_hours" type="number"/>
        </div>}
        {section==="availability"&&<div>
          <p style={{margin:"0 0 10px",fontSize:11,color:"#5C4E6A"}}>Set weekly availability — the AI roster generator uses this to assign shifts.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
            {DAYS.map((day,i)=>{const a=avail.find(x=>x.day===i)||{day:i,available:false,start_time:"06:00",end_time:"18:30"};return(
              <div key={i} style={{padding:8,borderRadius:10,background:a.available?"rgba(46,139,87,0.05)":"rgba(192,107,115,0.03)",border:"1px solid "+(a.available?"rgba(46,139,87,0.15)":"rgba(192,107,115,0.12)"),textAlign:"center"}}>
                <div style={{fontSize:12,fontWeight:700,color:a.available?"#2E8B57":"#C06B73",marginBottom:6}}>{day}</div>
                <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,fontSize:11,cursor:"pointer",marginBottom:6}}><input type="checkbox" checked={a.available} onChange={e=>setAvail(avail.map(x=>x.day===i?{...x,available:e.target.checked}:x))}/> Avail</label>
                {a.available&&<><div style={{marginBottom:3}}><label style={{fontSize:8,color:"#8A7F96"}}>Start</label><input type="time" value={a.start_time} onChange={e=>setAvail(avail.map(x=>x.day===i?{...x,start_time:e.target.value}:x))} style={{...inp,padding:"3px 4px",fontSize:10,textAlign:"center"}}/></div><div><label style={{fontSize:8,color:"#8A7F96"}}>End</label><input type="time" value={a.end_time} onChange={e=>{
                    const v=e.target.value;
                    const row=avail.find(x=>x.day===i)||{};
                    if(v&&row.start_time&&v<=row.start_time){e.target.style.borderColor="#C9828A";}
                    else{e.target.style.borderColor="";}
                    setAvail(avail.map(x=>x.day===i?{...x,end_time:v}:x));
                  }}
                  onBlur={e=>{const row=avail.find(x=>x.day===i)||{};if(e.target.value&&row.start_time&&e.target.value<=row.start_time){if(window.showToast)window.showToast(`${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][i]}: End time must be after start time`,"error");setAvail(avail.map(x=>x.day===i?{...x,end_time:""}:x));}}}
                  style={{...inp,padding:"3px 4px",fontSize:10,textAlign:"center"}}/></div></>}
              </div>
            );})}
          </div>
        </div>}
        {section==="flexibility"&&<div>
          <p style={{margin:"0 0 14px",fontSize:11,color:"#5C4E6A"}}>Flexibility settings are used by the <strong>AI optimiser</strong> to adjust shifts when coverage gaps appear. Set per-day flexibility below.</p>
          <div style={{marginBottom:12}}>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,cursor:"pointer",padding:"10px 14px",background:"#F8F5F1",borderRadius:8,border:"1px solid #E8E0D8"}}><input type="checkbox" checked={!!f.is_lunch_cover} onChange={e=>u("is_lunch_cover",e.target.checked)}/> <span><strong>Lunch Cover Role</strong> — Available for lunch cover shifts</span></label>
          </div>
          <div style={{background:"#F8F5F1",borderRadius:10,overflow:"hidden",border:"1px solid #E8E0D8"}}>
            <div style={{display:"grid",gridTemplateColumns:"100px 1fr 1fr",background:"#EDE8F4"}}>
              {["Day","Can Start Earlier (mins)","Can Finish Later (mins)"].map(h=>(
                <div key={h} style={{padding:"8px 14px",fontSize:11,fontWeight:700,color:"#8A7F96",textAlign:h==="Day"?"left":"center"}}>{h}</div>
              ))}
            </div>
            {["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((day,i)=>{
              const earlyKey=`flex_early_${i}`,lateKey=`flex_late_${i}`;
              return(
                <div key={day} style={{display:"grid",gridTemplateColumns:"100px 1fr 1fr",borderTop:"1px solid #E8E0D8"}}>
                  <div style={{padding:"8px 14px",fontWeight:600,fontSize:12,display:"flex",alignItems:"center"}}>{day}</div>
                  <div style={{padding:"6px 12px",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <input type="text" inputMode="decimal" value={f[earlyKey]===undefined?"0":String(f[earlyKey])}
                      onChange={e=>u(earlyKey,e.target.value)}
                      onBlur={e=>{const n=parseInt(e.target.value)||0;u(earlyKey,n);}}
                      style={{...inp,textAlign:"center",width:80,padding:"5px 8px"}} placeholder="0"/>
                  </div>
                  <div style={{padding:"6px 12px",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <input type="text" inputMode="decimal" value={f[lateKey]===undefined?"0":String(f[lateKey])}
                      onChange={e=>u(lateKey,e.target.value)}
                      onBlur={e=>{const n=parseInt(e.target.value)||0;u(lateKey,n);}}
                      style={{...inp,textAlign:"center",width:80,padding:"5px 8px"}} placeholder="0"/>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{marginTop:8,fontSize:10,color:"#8A7F96"}}>Global fallback — Earlier: <input type="text" inputMode="decimal" value={f.can_start_earlier_mins===undefined?"0":String(f.can_start_earlier_mins)} onChange={e=>u("can_start_earlier_mins",e.target.value)} onBlur={e=>{u("can_start_earlier_mins",parseInt(e.target.value)||0);}} style={{width:36,border:"1px solid #DDD",borderRadius:4,padding:"2px 4px",fontSize:10,textAlign:"center"}}/> mins &nbsp; Later: <input type="text" inputMode="decimal" value={f.can_finish_later_mins===undefined?"0":String(f.can_finish_later_mins)} onChange={e=>u("can_finish_later_mins",e.target.value)} onBlur={e=>{u("can_finish_later_mins",parseInt(e.target.value)||0);}} style={{width:36,border:"1px solid #DDD",borderRadius:4,padding:"2px 4px",fontSize:10,textAlign:"center"}}/> mins (used when per-day is 0)</div>
        </div>}
        {section==="compliance"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}><F label="First Aid Cert" k="first_aid" type="check" ph="Current first aid"/><F label="First Aid Expiry" k="first_aid_expiry" type="date"/><F label="CPR Expiry" k="cpr_expiry" type="date"/><F label="Anaphylaxis Expiry" k="anaphylaxis_expiry" type="date"/><F label="Asthma Expiry" k="asthma_expiry" type="date"/><div/><F label="WWCC Number" k="wwcc_number" ph="WWC0012345"/><F label="WWCC Expiry" k="wwcc_expiry" type="date"/></div>}
        {section==="notes"&&<F label="Notes" k="notes" type="area" ph="Additional notes…" span={3}/>}
      </div>
    </div>
  );
}

/* ═══ GANTT COMPONENTS ═══ */
function TimeInput({ value, onChange, style }) {
  // Use native time input — fully functional, mobile-friendly, no custom parsing bugs
  return (
    <input
      type="time"
      value={value || ""}
      onChange={e => onChange(e.target.value)}
      style={{ ...style, textAlign:"center", cursor:"pointer" }}
    />
  );
}

function GanttBar({ entry, qColor, onDelete, onEdit }) {
  const sM = tM(entry.start_time||"07:00"), eM = tM(entry.end_time||"15:00");
  const bM = entry.break_mins || 30;
  const lunchStart = entry.lunch_start ? tM(entry.lunch_start) : Math.floor((sM+eM)/2) - Math.floor(bM/2);
  const lunchEnd = lunchStart + bM;
  const width = pct(eM) - pct(sM), left = pct(sM);
  const lLeft = pct(lunchStart) - pct(sM), lWidth = pct(lunchEnd) - pct(lunchStart);
  const hrs = ((eM - sM - bM) / 60).toFixed(1);
  const bg = entry.is_lunch_cover ? `repeating-linear-gradient(45deg,${qColor}30,${qColor}30 4px,${qColor}15 4px,${qColor}15 8px)` : qColor+"30";
  return (
    <div style={{ position:"absolute", left:left+"%", width:Math.max(width,0.5)+"%", top:4, bottom:4, borderRadius:6, overflow:"hidden", cursor:"pointer", boxShadow:"0 1px 3px rgba(0,0,0,0.1)", background:bg, border:"1px solid "+qColor+"50" }}
      title={`${entry.educator_name} · ${entry.start_time}–${entry.end_time} (${hrs}h) · ${entry.room_name||"No room"}`}>
      <div style={{ position:"absolute", left:lLeft+"%", width:Math.max(lWidth,0)+"%", top:0, bottom:0, background:"rgba(255,255,255,0.55)", borderLeft:"1px dashed "+qColor+"60", borderRight:"1px dashed "+qColor+"60" }}/>
      {width > 8 && <div style={{ position:"absolute", left:4, top:"50%", transform:"translateY(-50%)", fontSize:9, fontWeight:700, color:qColor, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"calc(100% - 20px)" }}>
        {entry.is_lunch_cover && "🍽 "}{entry.educator_name?.split(" ")[0]} {width>15?`${entry.start_time}–${entry.end_time}`:""}</div>}
      {onEdit && <button onClick={e=>{e.stopPropagation();onEdit(entry);}} style={{position:"absolute",left:2,top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,0.8)",border:"none",borderRadius:4,width:14,height:14,cursor:"pointer",fontSize:9,color:"#7C3AED",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,padding:0}}>✎</button>}
      {onDelete && <button onClick={e=>{e.stopPropagation();onDelete(entry.id)}} style={{ position:"absolute", right:2, top:"50%", transform:"translateY(-50%)", background:"rgba(255,255,255,0.8)", border:"none", borderRadius:"50%", width:14, height:14, cursor:"pointer", fontSize:10, color:"#C06B73", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1, padding:0 }}>×</button>}
    </div>
  );
}

function GanttTimeline({ openHour, closeHour }) {
  const startH = Math.max(5, (openHour || 7) - 1);
  const endH = Math.min(20, (closeHour || 19) + 1);
  const hours = []; for (let h = startH; h <= endH; h++) hours.push(h);
  return (
    <div style={{ position:"relative", height:20, borderBottom:"1px solid #EDE8F4", marginLeft:160 }}>
      {hours.map(h => {
        const isEdge = h < (openHour || 7) || h > (closeHour || 19);
        return (
          <div key={h} style={{ position:"absolute", left:pct(h*60)+"%", top:0, height:"100%", borderLeft:"1px solid " + (isEdge ? "#F5F0FB" : "#EDE8F4"), display:"flex", alignItems:"center" }}>
            <span style={{ fontSize:9, color: isEdge ? "#D6CEE0" : "#A89DB5", paddingLeft:2, fontWeight:600 }}>{h}:00</span>
          </div>
        );
      })}
    </div>
  );
}

function GanttRow({ label, sublabel, entries, qColors, onDelete, onEdit, highlight }) {
  return (
    <div style={{ display:"flex", borderBottom:"1px solid #F5F0FB", background:highlight?"#FAF7FF":undefined, minHeight:36 }}>
      <div style={{ width:160, flexShrink:0, padding:"4px 8px", display:"flex", flexDirection:"column", justifyContent:"center", borderRight:"1px solid #EDE8F4" }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#3D3248", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{label}</div>
        {sublabel && <div style={{ fontSize:9, color:"#A89DB5" }}>{sublabel}</div>}
      </div>
      <div style={{ flex:1, position:"relative" }}>
        {[6,7,8,9,10,11,12,13,14,15,16,17,18,19].map(h => (
          <div key={h} style={{ position:"absolute", left:pct(h*60)+"%", top:0, bottom:0, borderLeft:"1px solid #F0EBF820", pointerEvents:"none" }}/>
        ))}
        {entries.map(e => <GanttBar key={e.id} entry={e} qColor={qColors[e.qualification] || "#8B6DAF"} onDelete={onDelete} onEdit={onEdit} />)}
      </div>
    </div>
  );
}

/* ═══ NQF COMPLIANCE TIMELINE ═══ */
function NQFComplianceTimeline({ dayEntries, rooms }) {
  const roomList = useMemo(() => {
    const rMap = {};
    dayEntries.forEach(e => {
      if (!e.room_id) return;
      if (!rMap[e.room_id]) rMap[e.room_id] = { id: e.room_id, name: e.room_name || "?", entries: [], room: rooms.find(r => r.id === e.room_id) };
      rMap[e.room_id].entries.push(e);
    });
    return Object.values(rMap);
  }, [dayEntries, rooms]);

  if (!roomList.length) return null;

  const hours = []; for (let h = 6; h < 19; h++) hours.push(h);

  return (
    <div style={{ ...card, padding: "12px 16px", marginBottom: 8 }}>
      <h4 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700 }}>🛡️ NQF Compliance Timeline</h4>
      {roomList.map(({ id, name, entries, room }) => {
        const ageKey = AGE_MAP[room?.age_group] || "preschool";
        const nqf = NQF_RATIOS[ageKey] || { ratio: 11 };
        const children = room?.current_children || room?.child_count || 0;
        const reqEds = Math.max(1, Math.ceil(children / nqf.ratio));
        return (
          <div key={id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#3D3248", width: 120, flexShrink: 0 }}>{name}</span>
              <span style={{ fontSize: 9, color: "#8A7F96" }}>1:{nqf.ratio} · {children} children · needs {reqEds} educator{reqEds!==1?"s":""}</span>
            </div>
            <div style={{ display: "flex", height: 18, borderRadius: 4, overflow: "hidden", position: "relative" }}>
              {hours.map(h => {
                const hStart = h * 60, hEnd = (h + 1) * 60;
                // Count educators present this hour
                const present = entries.filter(e => {
                  const sM = tM(e.start_time||"07:00"), eM = tM(e.end_time||"15:00");
                  const lStart = e.lunch_start ? tM(e.lunch_start) : null;
                  const lEnd = lStart ? lStart + (e.break_mins||30) : null;
                  if (sM > hStart || eM <= hStart) return false;
                  if (lStart && lEnd && lStart <= hStart && lEnd > hStart) return false; // on break
                  return true;
                });
                // Per-room ratio only — ECT is service-wide, see banner above
                const compliant = present.length >= reqEds;
                const partial = present.length > 0 && present.length < reqEds;
                const bg = compliant ? "#2E8B57" : partial ? "#F5A623" : (hStart >= 6*60 && hStart < 19*60 && children > 0) ? "#C06B73" : "#E8E0D8";
                return (
                  <div key={h} style={{ flex: 1, background: bg, borderRight: "1px solid rgba(255,255,255,0.3)" }}
                    title={`${h}:00 — ${present.length} educator${present.length!==1?"s":""} (need ${reqEds})`}/>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 9, color: "#8A7F96", marginTop: 2 }}>
              <span>6am</span><span style={{flex:1,textAlign:"center"}}>12pm</span><span>7pm</span>
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 9 }}>
        {[["#2E8B57","Compliant"],["#F5A623","Partial"],["#C06B73","Under ratio"],["#E8E0D8","No children"]].map(([c,l])=>(
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 3 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: c }}/>{l}</div>
        ))}
      </div>
    </div>
  );
}

/* ═══ WEEK VIEW ═══ */
// ── SMART ROSTER BUILDER ──────────────────────────────────────────────────────
// Left: educator panel ranked by room fit | Right: room compliance cards for selected day
// Drag educator from left onto room on right to assign shift
function SmartRosterBuilder({ period, entries, educators, rooms, allDates, onDelete, onReload, onEditShift }) {
  const [selDay, setSelDay] = React.useState(allDates[0] || null);
  // Keep selDay in sync if allDates changes (period loaded after mount)
  React.useEffect(()=>{ if(!selDay && allDates.length>0) setSelDay(allDates[0]); },[allDates.length]);
  const [selRoomId, setSelRoomId] = React.useState(null);
  const [dragging, setDragging] = React.useState(null);
  const [dropTarget, setDropTarget] = React.useState(null);
  const [assignModal, setAssignModal] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const today = new Date().toISOString().slice(0,10);

  const AGE_MAP = {babies:"babies","0-2":"babies",toddlers:"toddlers","2-3":"toddlers",preschool:"preschool","3-4":"preschool","3-5":"preschool","4-5":"preschool",oshc:"oshc",school_age:"oshc"};
  // Per-room ratios only — ECT is a SERVICE-LEVEL requirement, checked
  // separately via /api/compliance/check.
  const NQF = {babies:{ratio:4,label:"0-2 yrs"},toddlers:{ratio:5,label:"2-3 yrs"},preschool:{ratio:11,label:"3-5 yrs"},oshc:{ratio:15,label:"OSHC"}};
  const qColors = {ect:"#2E8B57",diploma:"#7E5BA3",cert3:"#D4A26A",working_towards_diploma:"#5B8DB5",working_towards:"#B87D47"};
  const qLabel = {ect:"ECT",diploma:"Diploma",cert3:"Cert III",working_towards_diploma:"Wkg→Dip",working_towards:"Wkg→C3"};

  // Day entries
  const dayEntries = selDay ? entries.filter(e => e.date === selDay) : [];

  // Compute room compliance for selected day
  // Per-room: ratio only. Service-wide ECT compliance comes from /api/compliance/check.
  const roomCompliance = rooms.map(room => {
    const roomEnts = dayEntries.filter(e => e.room_id === room.id);
    const ageKey = AGE_MAP[room.age_group] || 'preschool';
    const nqf = NQF[ageKey] || {ratio:11,label:"?"};
    const children = room.current_children || room.child_count || 0;
    const required = children > 0 ? Math.max(1, Math.ceil(children / nqf.ratio)) : 1;
    const hasECT = roomEnts.some(e => e.qualification==='ect'||e.qualification==='diploma');
    const ratioOk = roomEnts.length >= required;
    const compliant = ratioOk;
    const coverageHrs = roomEnts.reduce((s,e)=>{
      const sM=tM(e.start_time||"07:00"),eM=tM(e.end_time||"15:00");
      return s+(eM-sM-(e.break_mins||30))/60;
    },0);
    const issues = [];
    if (!ratioOk) issues.push(`Need ${required-roomEnts.length} more educator${required-roomEnts.length>1?"s":""} (ratio 1:${nqf.ratio})`);
    return { ...room, nqf, children, required, assigned: roomEnts.length, hasECT, ectOk: true, ratioOk, compliant, coverageHrs, issues, entries: roomEnts };
  });

  // Selected room compliance object
  const selRoom = selRoomId ? roomCompliance.find(r => r.id === selRoomId) : null;

  // Educator scoring for left panel - ranked for selected room (or overall)
  const scoredEducators = React.useMemo(() => {
    const roomForScoring = selRoom || roomCompliance[0];
    const ageKey = roomForScoring ? AGE_MAP[roomForScoring.age_group] || 'preschool' : 'preschool';
    const nqf = NQF[ageKey] || {ect_required:false};
    const alreadyAssignedToRoom = selDay ? entries.filter(e=>e.date===selDay&&e.room_id===selRoomId).map(e=>e.educator_id) : [];
    const alreadyAssignedToDay = selDay ? entries.filter(e=>e.date===selDay).map(e=>e.educator_id) : [];

    return educators.map(ed => {
      // Week hours
      const weekHrs = entries.filter(e=>e.educator_id===ed.id).reduce((s,e)=>{
        const sM=tM(e.start_time||"07:00"),eM=tM(e.end_time||"15:00");
        return s+(eM-sM-(e.break_mins||30))/60;
      },0);
      // Get availability for this day
      const dow = selDay ? new Date(selDay+"T12:00:00").getDay() : 1;
      const avail = ed.availability?.find ? ed.availability.find(a=>a.day_of_week===dow) : null;
      const available = avail?.available;

      // Score: qualification match, reliability, already assigned
      let score = 0;
      if (nqf.ect_required && (ed.qualification==='ect'||ed.qualification==='diploma')) score += 50;
      score += (ed.reliability_score||50);
      score -= (ed.distance_km||0);
      if (alreadyAssignedToDay.includes(ed.id)) score -= 200; // already working today
      if (!available) score -= 300; // not available
      if (weekHrs >= 38) score -= 400; // at 38h cap
      const preferred = (() => {
        try { return JSON.parse(ed.preferred_rooms||'[]'); } catch{return [];}
      })();
      if (selRoomId && preferred.includes(selRoomId)) score += 30;

      const status = alreadyAssignedToRoom.includes(ed.id) ? 'assigned_room'
        : alreadyAssignedToDay.includes(ed.id) ? 'assigned_other'
        : weekHrs >= 38 ? 'capped'
        : !available ? 'unavailable'
        : 'available';

      return { ...ed, score, weekHrs, available: !!available, avail, status };
    }).sort((a,b) => b.score - a.score);
  }, [educators, entries, selRoomId, selDay, rooms]);

  // Compute next shift start time for a room (after last assigned shift)
  const nextShiftTime = (roomId) => {
    const roomDayShifts = dayEntries.filter(e=>e.room_id===roomId).sort((a,b)=>tM(b.end_time||"15:00")-tM(a.end_time||"15:00"));
    if (roomDayShifts.length === 0) return {start_time:"07:00",end_time:"15:00"};
    const lastEnd = roomDayShifts[0]?.end_time || "15:00";
    // Suggest shift that fills gap to 18:30
    const endMins = tM("18:30");
    const lastMins = tM(lastEnd);
    if (lastMins >= endMins) return {start_time:"07:00",end_time:"15:00"}; // wrap around
    return { start_time: lastEnd, end_time: "18:30" };
  };

  const handleDrop = (roomId) => {
    console.log('Drop fired:', dragging, '->', roomId, 'selDay:', selDay);
    if (!dragging || !selDay) { console.log('No dragging or selDay'); return; }
    const times = nextShiftTime(roomId);
    const ed = educators.find(e=>e.id===dragging);
    const avail = ed?.availability?.find ? ed.availability.find(a=>a.day_of_week===new Date(selDay+"T12:00:00").getDay()) : null;
    setAssignModal({
      educator_id: dragging,
      educator: ed,
      room_id: roomId,
      date: selDay,
      start_time: avail?.start_time || times.start_time,
      end_time: avail?.end_time || times.end_time,
      break_mins: 30,
    });
    setDragging(null);
    setDropTarget(null);
  };

  const saveAssignment = async () => {
    if (!assignModal) return;
    setSaving(true);
    try {
      await API("/api/rostering/entries", { method:"POST", body:{
        period_id: period.id,
        educator_id: assignModal.educator_id,
        room_id: assignModal.room_id,
        date: assignModal.date,
        start_time: assignModal.start_time,
        end_time: assignModal.end_time,
        break_mins: assignModal.break_mins || 30,
        cost_cents: Math.round(((tM(assignModal.end_time)-tM(assignModal.start_time)-assignModal.break_mins)/60)*(educators.find(e=>e.id===assignModal.educator_id)?.hourly_rate_cents||3500))
      }});
      toast("✓ Shift assigned");
      setAssignModal(null);
      // Fire the same event that delEntry/loadP listens to — keeps ALL views in sync
      if (period?.id) window.dispatchEvent(new CustomEvent("c360-roster-reload",{detail:{period_id:period.id}}));
      onReload();
    } catch(e) { toast("Save failed","error"); }
    setSaving(false);
  };

  const removeEntry = async (id) => {
    // Use parent's delEntry so all views stay in sync via the same loadP
    if (onDelete) { await onDelete(id); } else {
      try { await API("/api/rostering/entries/"+id,{method:"DELETE"}); onReload(); } catch(e){ toast("Remove failed","error"); }
    }
  };

  const statusConfig = {
    available:     { bg:"#E8F5E9", border:"#A5D6A7", dot:"#2E8B57", label:"Available"  },
    assigned_room: { bg:"#E3F2FD", border:"#90CAF9", dot:"#1565C0", label:"In this room" },
    assigned_other:{ bg:"#FFF3E0", border:"#FFCC80", dot:"#E65100", label:"Working today" },
    unavailable:   { bg:"#F5F5F5", border:"#E0E0E0", dot:"#BDBDBD", label:"Not available" },
    capped:        { bg:"#FFEBEE", border:"#EF9A9A", dot:"#C62828", label:"At 38h cap"  },
  };

  const complianceColor = (room) => room.compliant ? "#2E8B57" : room.assigned>0 ? "#E65100" : "#C06B73";
  const complianceBg   = (room) => room.compliant ? "#E8F5E9" : room.assigned>0 ? "#FFF3E0" : "#FFEBEE";

  return (
    <div>
      {/* Day selector */}
      <div style={{display:"flex",gap:4,marginBottom:12,overflowX:"auto",flexWrap:"nowrap",paddingBottom:2}}>
        {allDates.map(date=>{
          const d=new Date(date+"T12:00:00");
          const isActive=selDay===date;
          const isToday=date===today;
          const dEnts=entries.filter(e=>e.date===date);
          return(
            <button key={date} onClick={()=>{setSelDay(date);setSelRoomId(null);}}
              style={{flexShrink:0,padding:"6px 12px",borderRadius:8,border:isActive?"2px solid #7C3AED":"1px solid #EDE8F4",
                background:isActive?"#7C3AED":isToday?"rgba(124,58,237,0.06)":"#fff",
                color:isActive?"#fff":"#555",cursor:"pointer",textAlign:"center",minWidth:64}}>
              <div style={{fontSize:9,opacity:0.8,fontWeight:600}}>{DAYS[d.getDay()]}</div>
              <div style={{fontSize:13,fontWeight:800}}>{d.getDate()}</div>
              <div style={{fontSize:8,marginTop:1,opacity:0.7}}>{dEnts.length} shift{dEnts.length!==1?"s":""}</div>
            </button>
          );
        })}
      </div>

      {!selDay ? (
        <div style={{padding:40,textAlign:"center",color:"#A89DB5"}}>Select a day above to start building.</div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"260px 1fr",gap:16,alignItems:"start"}}>

          {/* ── LEFT: Educator panel ── */}
          <div>
            <div style={{fontWeight:800,fontSize:12,color:"#5C4E6A",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>
              {selRoom ? `Best fit for ${selRoom.name}` : "All Educators"} — drag to a room →
            </div>
            <div style={{fontSize:11,color:"#A89DB5",marginBottom:10,lineHeight:1.4}}>
              {selRoom
                ? selRoom.nqf?.ect_required
                  ? `Needs ECT/Diploma · 1:${selRoom.nqf.ratio} ratio · ${selRoom.required} educator${selRoom.required!==1?"s":""} for ${selRoom.children} children`
                  : `1:${selRoom.nqf?.ratio||11} ratio · ${selRoom.required} educator${selRoom.required!==1?"s":""} for ${selRoom.children} children`
                : "Click a room card to rank educators for that room"}
            </div>
            {scoredEducators.map(ed => {
              const sc = statusConfig[ed.status] || statusConfig.available;
              const canDrag = ed.status==="available" || ed.status==="assigned_room";
              return(
                <div key={ed.id}
                  draggable={canDrag}
                  onDragStart={()=>canDrag&&setDragging(ed.id)}
                  onDragEnd={()=>setDragging(null)}
                  style={{padding:"8px 10px",marginBottom:6,borderRadius:10,border:"1px solid "+sc.border,
                    background:dragging===ed.id?"rgba(124,58,237,0.08)":sc.bg,
                    cursor:canDrag?"grab":"default",opacity:ed.status==="unavailable"||ed.status==="capped"?0.5:1,
                    transition:"transform 0.1s",transform:dragging===ed.id?"scale(0.97)":"none"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:sc.dot,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:12,color:"#3D3248",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {ed.first_name} {ed.last_name}
                      </div>
                      <div style={{fontSize:10,color:"#8A7F96",display:"flex",gap:6,flexWrap:"wrap",marginTop:1}}>
                        <span style={{fontWeight:600,color:qColors[ed.qualification]||"#999"}}>{qLabel[ed.qualification]||ed.qualification}</span>
                        <span>{ed.weekHrs.toFixed(1)}h/38h</span>
                        {ed.avail&&<span>{ed.avail.start_time?.slice(0,5)}–{ed.avail.end_time?.slice(0,5)}</span>}
                        <span style={{color:sc.dot,fontWeight:600}}>{sc.label}</span>
                      </div>
                    </div>
                    <div style={{fontSize:10,color:"#A89DB5",fontWeight:700,flexShrink:0}}>⋮⋮</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── RIGHT: Rooms panel ── */}
          <div>
            <div style={{fontWeight:800,fontSize:12,color:"#5C4E6A",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>
              Rooms — {new Date(selDay+"T12:00:00").toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"short"})}
            </div>
            {roomCompliance.map(room=>{
              const isSelRoom = selRoomId===room.id;
              const isDragOver = dropTarget===room.id;
              const cc = complianceColor(room);
              const cb = complianceBg(room);
              return(
                <div key={room.id}
                  onClick={()=>setSelRoomId(isSelRoom?null:room.id)}
                  onDragOver={e=>{e.preventDefault();setDropTarget(room.id);}}
                  onDragLeave={()=>setDropTarget(null)}
                  onDrop={e=>{e.preventDefault();handleDrop(room.id);}}
                  style={{marginBottom:12,borderRadius:12,border:`2px solid ${isSelRoom?"#7C3AED":isDragOver?"#7C3AED":room.compliant?"#A5D6A7":"#FFCC80"}`,
                    background:isDragOver?"rgba(124,58,237,0.06)":isSelRoom?"rgba(124,58,237,0.03)":"#fff",
                    cursor:"pointer",transition:"all 0.15s",outline:isDragOver?"3px dashed #7C3AED":undefined,outlineOffset:2}}>

                  {/* Room header */}
                  <div style={{padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #F5F0FB"}}>
                    <div>
                      <div style={{fontWeight:800,fontSize:14,color:"#3D3248"}}>{room.name}</div>
                      <div style={{fontSize:11,color:"#8A7F96",marginTop:1}}>
                        {room.nqf?.label||room.age_group} · {room.children > 0 ? room.children+" children · 1:"+room.nqf?.ratio+" ratio" : <span style={{color:"#A89DB5",fontStyle:"italic"}}>No children enrolled</span>}
                      </div>
                    </div>
                    {/* Compliance badge */}
                    <div style={{textAlign:"right"}}>
                      <div style={{padding:"4px 10px",borderRadius:20,background:cb,color:cc,fontWeight:800,fontSize:11,marginBottom:3}}>
                        {room.compliant ? "✅ Compliant" : room.assigned>0 ? "⚠️ Partial" : "❌ Unstaffed"}
                      </div>
                      <div style={{fontSize:10,color:"#8A7F96"}}>{room.assigned}/{room.required} staff</div>
                    </div>
                  </div>

                  {/* Compliance issues */}
                  {room.issues.length>0&&(
                    <div style={{padding:"6px 14px",background:"#FFF8E7",borderBottom:"1px solid #FFE082"}}>
                      {room.issues.map((issue,i)=>(
                        <div key={i} style={{fontSize:11,color:"#E65100",fontWeight:600}}>⚠ {issue}</div>
                      ))}
                    </div>
                  )}

                  {/* Assigned educators */}
                  <div style={{padding:"8px 14px"}}>
                    {room.entries.length===0 ? (
                      <div style={{textAlign:"center",padding:"12px 0",color:"#BDBDBD",fontSize:12,fontStyle:"italic",
                        border:"2px dashed #EDE8F4",borderRadius:8}}>
                        {isDragOver ? "📥 Drop educator here" : "Drop an educator here to assign"}
                      </div>
                    ) : (
                      room.entries.sort((a,b)=>tM(a.start_time)-tM(b.start_time)).map(entry=>{
                        const hrs=((tM(entry.end_time||"15:00")-tM(entry.start_time||"07:00")-(entry.break_mins||30))/60).toFixed(1);
                        const qc=qColors[entry.qualification]||"#8B6DAF";
                        return(
                          <div key={entry.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",marginBottom:4,borderRadius:8,background:"#F8F5FC",border:"1px solid #EDE8F4"}}>
                            <div style={{width:8,height:8,borderRadius:"50%",background:qc,flexShrink:0}}/>
                            <div style={{flex:1}}>
                              <div style={{fontWeight:700,fontSize:12,color:"#3D3248"}}>{entry.educator_name}</div>
                              <div style={{fontSize:10,color:"#8A7F96"}}>{entry.start_time}–{entry.end_time} · {hrs}h · {qLabel[entry.qualification]||entry.qualification}</div>
                            </div>
                            <button onClick={e=>{e.stopPropagation();onEditShift&&onEditShift(entry);}} style={{background:"none",border:"none",cursor:"pointer",color:"#7C3AED",fontSize:13,padding:"2px 4px"}}>✎</button>
                            <button onClick={e=>{e.stopPropagation();removeEntry(entry.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#C06B73",fontSize:13,padding:"2px 4px"}}>×</button>
                          </div>
                        );
                      })
                    )}
                    {/* Coverage bar */}
                    <div style={{marginTop:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#8A7F96",marginBottom:3}}>
                        <span>Coverage {room.coverageHrs.toFixed(1)}h</span>
                        <span>{room.assigned}/{room.required} educators</span>
                      </div>
                      <div style={{height:6,borderRadius:3,background:"#EDE8F4",overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:3,background:room.compliant?"#2E8B57":room.assigned>0?"#E65100":"#C06B73",
                          width:Math.min(100,(room.assigned/Math.max(1,room.required))*100)+"%",transition:"width 0.3s"}}/>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {roomCompliance.length===0&&(
              <div style={{ flex: 1, minHeight: 0, width: '100%',padding:32,textAlign:"center",color:"#A89DB5",background:"#F8F5F1",borderRadius:12}}>
                No rooms found. Add rooms in the Rooms module first.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ASSIGN MODAL ── */}
      {assignModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:24,maxWidth:460,width:"92%",boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0,fontSize:15,fontWeight:800}}>➕ Assign to Room</h3>
              <button onClick={()=>setAssignModal(null)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#8A7F96"}}>×</button>
            </div>
            <div style={{background:"#F8F5FC",borderRadius:10,padding:"8px 14px",marginBottom:14,fontSize:12}}>
              <strong>{assignModal.educator?.first_name} {assignModal.educator?.last_name}</strong>
              {" → "}
              <strong>{rooms.find(r=>r.id===assignModal.room_id)?.name||"Room"}</strong>
              {" · "}{new Date(assignModal.date+"T12:00:00").toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"})}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
              <div>
                <label style={lbl}>Start Time</label>
                <input type="time" value={assignModal.start_time} onChange={e=>setAssignModal({...assignModal,start_time:e.target.value})} style={inp}/>
              </div>
              <div>
                <label style={lbl}>End Time</label>
                <input type="time" value={assignModal.end_time} onChange={e=>setAssignModal({...assignModal,end_time:e.target.value})} style={inp}/>
              </div>
              <div>
                <label style={lbl}>Break (min)</label>
                <input type="text" inputMode="numeric" value={assignModal.break_mins} onChange={e=>setAssignModal({...assignModal,break_mins:parseInt(e.target.value)||30})} style={inp}/>
              </div>
            </div>
            <div style={{padding:"8px 12px",background:"#F8F5FC",borderRadius:8,fontSize:11,color:"#5C4E6A",marginBottom:14}}>
              Hours: <strong>{((tM(assignModal.end_time)-tM(assignModal.start_time)-assignModal.break_mins)/60).toFixed(1)}h</strong>
              {" · "}Est. cost: <strong style={{color:"#2E7D32"}}>${(((tM(assignModal.end_time)-tM(assignModal.start_time)-assignModal.break_mins)/60)*(assignModal.educator?.hourly_rate_cents||3500)/100).toFixed(2)}</strong>
              {" · "}Week total after: <strong>{((assignModal.educator||{weekHrs:0}).weekHrs+(tM(assignModal.end_time)-tM(assignModal.start_time)-assignModal.break_mins)/60).toFixed(1)}h</strong>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setAssignModal(null)} style={{flex:1,padding:"9px 0",borderRadius:8,border:"1px solid #DDD",background:"#FDFBF9",color:"#555",cursor:"pointer",fontWeight:600,fontSize:13}}>Cancel</button>
              <button onClick={saveAssignment} disabled={saving} style={{flex:2,padding:"9px 0",borderRadius:8,border:"none",background:"#7C3AED",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13,opacity:saving?0.6:1}}>
                {saving?"Saving…":"✓ Assign Shift"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ── DRAG-AND-DROP ROSTER GRID (Deputy/Sling-style) ──────────────────────────
function DragRosterGrid({ entries, allDates, educators, rooms, period, onDelete, onEdit, onAddShift }) {
  const [dragEd, setDragEd] = React.useState(null);
  const [dragOver, setDragOver] = React.useState(null); // {edId, date}
  const [dropModal, setDropModal] = React.useState(null); // {edId, date, start_time, end_time}
  const today = new Date().toISOString().slice(0,10);
  const qColors = {ect:"#2E8B57",diploma:"#7E5BA3",cert3:"#D4A26A",working_towards_diploma:"#5B8DB5",working_towards:"#B87D47"};

  // All educators with shifts OR all active educators
  const rosterEdIds = [...new Set(entries.map(e=>e.educator_id))];
  const allActiveEds = educators.filter(e=>e.status==="active"||!e.status);
  const rosteredEds = allActiveEds.filter(e => rosterEdIds.includes(e.id));
  const unrosteredEds = allActiveEds.filter(e => !rosterEdIds.includes(e.id));
  const [showUnrostered, setShowUnrostered] = React.useState(false);
  const displayEds = rosteredEds;

  const getAvailability = (ed, date) => {
    const dow = new Date(date+"T12:00:00").getDay();
    return ed.availability?.find(a=>a.day_of_week===dow);
  };

  const handleDrop = (edId, date) => {
    const ed = educators.find(e=>e.id===edId);
    const avail = getAvailability(ed||{}, date);
    setDropModal({
      edId, date,
      start_time: avail?.start_time||"07:00",
      end_time: avail?.end_time||"15:00",
      room_id: "",
      break_mins: 30,
    });
    setDragEd(null);
    setDragOver(null);
  };

  const totalHrs = (edId) => entries.filter(e=>e.educator_id===edId).reduce((s,e)=>{
    const sM=tM(e.start_time||"07:00"),eM=tM(e.end_time||"15:00");
    return s+(eM-sM-(e.break_mins||30))/60;
  },0);

  const dayCost = (date) => entries.filter(e=>e.date===date).reduce((a,e)=>{
    const sM=tM(e.start_time||"07:00"),eM=tM(e.end_time||"15:00");
    return a+((eM-sM-(e.break_mins||30))/60)*((e.hourly_rate_cents||3500)/100);
  },0);

  const dayShiftCount = (date) => entries.filter(e=>e.date===date).length;

  return (
    <div>
      <div style={{fontSize:11,color:"#8A7F96",marginBottom:8,padding:"6px 10px",background:"#F8F5FC",borderRadius:8,display:"inline-block"}}>
        💡 <strong>Drag</strong> an educator name onto a day cell to add a shift · <strong>Click</strong> any shift to edit · <strong>Click</strong> an empty cell to add
      </div>
      <div style={{overflowX:"auto"}}>
        <div style={{minWidth:Math.max(700, 160 + allDates.length*120)}}>
          {/* Header row */}
          <div style={{display:"grid",gridTemplateColumns:`160px repeat(${allDates.length},1fr)`,background:"#3D3248",borderRadius:"10px 10px 0 0",overflow:"hidden"}}>
            <div style={{padding:"8px 12px",fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.5)",borderRight:"1px solid rgba(255,255,255,0.1)"}}>EDUCATOR</div>
            {allDates.map(date=>{
              const d=new Date(date+"T12:00:00");
              const isToday=date===today;
              const shifts=dayShiftCount(date);
              const cost=dayCost(date);
              return(
                <div key={date} style={{padding:"6px 8px",textAlign:"center",borderLeft:"1px solid rgba(255,255,255,0.08)",background:isToday?"rgba(139,109,175,0.3)":undefined}}>
                  <div style={{fontSize:10,fontWeight:700,color:isToday?"#C9A8FF":"rgba(255,255,255,0.9)"}}>{DAYS[d.getDay()]}</div>
                  <div style={{fontSize:14,fontWeight:800,color:"#fff",lineHeight:1.2}}>{d.getDate()}</div>
                  <div style={{fontSize:8,color:"rgba(255,255,255,0.5)",marginTop:1}}>{d.toLocaleString("default",{month:"short"})}</div>
                  <div style={{fontSize:8,color:"rgba(255,255,255,0.4)",marginTop:2}}>{shifts} shift{shifts!==1?"s":""} · ${cost.toFixed(0)}</div>
                </div>
              );
            })}
          </div>

          {/* Educator rows */}
          {displayEds.map((ed,i)=>{
            const edHrs=totalHrs(ed.id);
            const over=edHrs>=38,warn=edHrs>=34&&edHrs<38;
            const qc=qColors[ed.qualification]||"#8B6DAF";
            const edEntries=entries.filter(e=>e.educator_id===ed.id);
            return(
              <div key={ed.id} style={{display:"grid",gridTemplateColumns:`160px repeat(${allDates.length},1fr)`,borderBottom:"1px solid #F0EBF8",background:i%2===0?"#FDFBF9":"#fff"}}>
                {/* Educator name - draggable */}
                <div draggable onDragStart={()=>setDragEd(ed.id)} onDragEnd={()=>setDragEd(null)}
                  style={{padding:"6px 10px",borderRight:"1px solid #EDE8F4",cursor:"grab",display:"flex",flexDirection:"column",justifyContent:"center",background:dragEd===ed.id?"rgba(139,109,175,0.08)":undefined}}>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{width:5,height:5,borderRadius:"50%",background:qc,flexShrink:0}}/>
                    <span style={{fontSize:11,fontWeight:700,color:"#3D3248",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ed.first_name} {ed.last_name}</span>
                  </div>
                  <div style={{fontSize:9,color:over?"#C62828":warn?"#E65100":"#A89DB5",fontWeight:over||warn?700:400,marginTop:1}}>
                    {Q[ed.qualification]?.s||"—"} · {edHrs.toFixed(1)}h{over?" ⚠":warn?" ⚡":""}
                  </div>
                </div>

                {/* Day cells */}
                {allDates.map(date=>{
                  const dayShifts=edEntries.filter(e=>e.date===date);
                  const isDragOver=dragOver?.edId===ed.id&&dragOver?.date===date;
                  const isToday=date===today;
                  return(
                    <div key={date}
                      onDragOver={e=>{e.preventDefault();if(dragEd)setDragOver({edId:ed.id,date});}}
                      onDragLeave={()=>setDragOver(null)}
                      onDrop={e=>{e.preventDefault();if(dragEd)handleDrop(dragEd,date);}}
                      onClick={()=>{ if(dayShifts.length===0 && !dragEd) onAddShift&&onAddShift(ed.id,date); }}
                      style={{padding:"3px 4px",borderLeft:"1px solid #F0EBF8",minHeight:48,display:"flex",flexDirection:"column",gap:2,
                        background:isDragOver?"rgba(139,109,175,0.12)":isToday?"rgba(139,109,175,0.03)":undefined,
                        cursor:dayShifts.length===0?"pointer":undefined,
                        outline:isDragOver?"2px dashed #8B6DAF":undefined,outlineOffset:-2,
                        transition:"background 0.1s"}}>
                      {dayShifts.length===0 ? (
                        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#E0D6E8",fontSize:10,fontWeight:600}}>
                          {isDragOver ? "Drop to add →" : "＋"}
                        </div>
                      ) : dayShifts.map(s=>{
                        const sM=tM(s.start_time||"07:00"),eM=tM(s.end_time||"15:00");
                        const hrs=((eM-sM-(s.break_mins||30))/60).toFixed(1);
                        const qColor=qColors[s.qualification]||"#8B6DAF";
                        return(
                          <div key={s.id} onClick={e=>{e.stopPropagation();onEdit&&onEdit(s);}}
                            style={{padding:"3px 5px",borderRadius:5,background:qColor+"25",border:"1px solid "+qColor+"50",fontSize:9,color:"#3D3248",cursor:"pointer",position:"relative"}}
                            title="Click to edit">
                            <div style={{fontWeight:700,color:qColor}}>{s.start_time}–{s.end_time}</div>
                            <div style={{color:"#6B5F7A",fontSize:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.room_name||"No room"} · {hrs}h</div>
                            <button onClick={e=>{e.stopPropagation();onDelete(s.id);}}
                              style={{position:"absolute",top:1,right:2,background:"none",border:"none",cursor:"pointer",color:"#C06B73",fontSize:9,lineHeight:1,padding:0,fontWeight:700}}>×</button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Footer - totals row */}
          <div style={{display:"grid",gridTemplateColumns:`160px repeat(${allDates.length},1fr)`,background:"#F8F5FC",borderTop:"2px solid #EDE8F4",borderRadius:showUnrostered?"0":"0 0 10px 10px",overflow:"hidden"}}>
            <div style={{padding:"6px 12px",fontSize:10,fontWeight:700,color:"#8A7F96",borderRight:"1px solid #EDE8F4"}}>DAILY TOTALS</div>
            {allDates.map(date=>{
              const cost=dayCost(date);
              const shifts=dayShiftCount(date);
              return(
                <div key={date} style={{padding:"6px 8px",textAlign:"center",borderLeft:"1px solid #EDE8F4"}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#7C3AED"}}>${cost.toFixed(0)}</div>
                  <div style={{fontSize:9,color:"#A89DB5"}}>{shifts} shift{shifts!==1?"s":""}</div>
                </div>
              );
            })}
          </div>

          {/* Unrostered educators */}
          {unrosteredEds.length>0&&(
            <div style={{borderTop:"1px solid #EDE8F4"}}>
              <button onClick={()=>setShowUnrostered(!showUnrostered)}
                style={{width:"100%",padding:"8px 12px",background:"#FAFAFA",border:"none",cursor:"pointer",fontSize:11,fontWeight:600,color:"#8A7F96",textAlign:"left",borderRadius:showUnrostered?"0":"0 0 10px 10px"}}>
                {showUnrostered?"▾":"▸"} {unrosteredEds.length} unrostered educator{unrosteredEds.length!==1?"s":""}
              </button>
              {showUnrostered&&unrosteredEds.map((ed,i)=>(
                <div key={ed.id} draggable onDragStart={()=>setDragEd(ed.id)} onDragEnd={()=>setDragEd(null)}
                  style={{display:"grid",gridTemplateColumns:`160px repeat(${allDates.length},1fr)`,borderBottom:"1px solid #F5F0FB",background:i%2===0?"#FEFCFA":"#fff",opacity:0.7}}>
                  <div style={{padding:"6px 10px",borderRight:"1px solid #EDE8F4",cursor:"grab",display:"flex",alignItems:"center",gap:5}}>
                    <div style={{width:5,height:5,borderRadius:"50%",background:qColors[ed.qualification]||"#8B6DAF",flexShrink:0}}/>
                    <span style={{fontSize:11,fontWeight:600,color:"#8A7F96"}}>{ed.first_name} {ed.last_name}</span>
                  </div>
                  {allDates.map(date=>(
                    <div key={date}
                      onDragOver={e=>{e.preventDefault();if(dragEd)setDragOver({edId:ed.id,date});}}
                      onDragLeave={()=>setDragOver(null)}
                      onDrop={e=>{e.preventDefault();if(dragEd)handleDrop(dragEd,date);}}
                      onClick={()=>onAddShift&&onAddShift(ed.id,date)}
                      style={{padding:"3px 4px",borderLeft:"1px solid #F0EBF8",minHeight:32,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",
                        background:dragOver?.edId===ed.id&&dragOver?.date===date?"rgba(139,109,175,0.12)":undefined}}>
                      <span style={{color:"#E0D6E8",fontSize:10}}>＋</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Drop modal - pre-filled shift assignment */}
      {dropModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:24,maxWidth:460,width:"92%",boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0,fontSize:15,fontWeight:800}}>➕ Add Shift</h3>
              <button onClick={()=>setDropModal(null)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#8A7F96"}}>×</button>
            </div>
            <div style={{background:"#F8F5FC",borderRadius:10,padding:"8px 14px",marginBottom:14,fontSize:12,color:"#5C4E6A"}}>
              <strong>{educators.find(e=>e.id===dropModal.edId)?.first_name} {educators.find(e=>e.id===dropModal.edId)?.last_name}</strong> · {new Date(dropModal.date+"T12:00:00").toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"short"})}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <div>
                <label style={lbl}>Start Time</label>
                <input type="time" value={dropModal.start_time} onChange={e=>setDropModal({...dropModal,start_time:e.target.value})} style={inp}/>
              </div>
              <div>
                <label style={lbl}>End Time</label>
                <input type="time" value={dropModal.end_time} onChange={e=>setDropModal({...dropModal,end_time:e.target.value})} style={inp}/>
              </div>
              <div>
                <label style={lbl}>Room</label>
                <select value={dropModal.room_id} onChange={e=>setDropModal({...dropModal,room_id:e.target.value})} style={sel}>
                  <option value="">No room</option>
                  {rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Break (mins)</label>
                <input type="text" inputMode="numeric" value={dropModal.break_mins} onChange={e=>setDropModal({...dropModal,break_mins:parseInt(e.target.value)||30})} style={inp}/>
              </div>
            </div>
            <div style={{fontSize:11,color:"#8A7F96",marginBottom:14}}>
              Hours: <strong style={{color:"#7C3AED"}}>{((tM(dropModal.end_time)-tM(dropModal.start_time)-dropModal.break_mins)/60).toFixed(1)}h</strong>
              {" · "}Cost est: <strong style={{color:"#2E7D32"}}>${(((tM(dropModal.end_time)-tM(dropModal.start_time)-dropModal.break_mins)/60)*(educators.find(e=>e.id===dropModal.edId)?.hourly_rate_cents||3500)/100).toFixed(2)}</strong>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setDropModal(null)} style={{flex:1,padding:"9px 0",borderRadius:8,border:"1px solid #DDD",background:"#FDFBF9",color:"#555",cursor:"pointer",fontWeight:600,fontSize:13}}>Cancel</button>
              <button onClick={async()=>{
                try{
                  const dRes=await API("/api/rostering/entries",{method:"POST",body:{
                    period_id:period.id,educator_id:dropModal.edId,date:dropModal.date,
                    room_id:dropModal.room_id||null,start_time:dropModal.start_time,
                    end_time:dropModal.end_time,break_mins:dropModal.break_mins||30,
                    cost_cents:Math.round(((tM(dropModal.end_time)-tM(dropModal.start_time)-dropModal.break_mins)/60)*(educators.find(e=>e.id===dropModal.edId)?.hourly_rate_cents||3500))
                  }});
                  if(dRes.error){toast("⚠ "+dRes.error,"error");return;}
                  toast("Shift added ✓");
                  setDropModal(null);
                  if(period.id) { window.dispatchEvent(new CustomEvent("c360-roster-reload",{detail:{period_id:period.id}})); }
                }catch(e){
                  const msg = e.message||"Save failed";
                  toast(msg.includes("already has a shift") ? "⚠ "+msg : "Save failed", "error");
                }
              }} style={{flex:2,padding:"9px 0",borderRadius:8,border:"none",background:"#7C3AED",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>
                ✓ Save Shift
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WeekView({ entries, allDates, educators, rooms, onDelete, onEdit, onAddShift }) {
  const qColors = {ect:"#2E8B57",diploma:"#7E5BA3",cert3:"#D4A26A",working_towards_diploma:"#5B8DB5",working_towards:"#B87D47"};
  const edIds = [...new Set(entries.map(e => e.educator_id))];
  // Show all days in the roster period (not just Mon-Fri)
  const weekDates = allDates;

  const dayCost = (date) => {
    const de = entries.filter(e => e.date === date);
    return de.reduce((a, e) => {
      const sM = tM(e.start_time||"07:00"), eM = tM(e.end_time||"15:00");
      return a + ((eM - sM - (e.break_mins||30)) / 60) * ((e.hourly_rate_cents||3500)/100);
    }, 0);
  };

  const dayCompliant = (date) => {
    const de = entries.filter(e => e.date === date);
    const roomMap = {};
    de.forEach(e => {
      if (!e.room_id) return;
      if (!roomMap[e.room_id]) roomMap[e.room_id] = { entries: [], room: rooms.find(r => r.id === e.room_id) };
      roomMap[e.room_id].entries.push(e);
    });
    return Object.values(roomMap).every(({ entries: re, room }) => {
      const ageKey = AGE_MAP[room?.age_group] || "preschool";
      const nqf = NQF_RATIOS[ageKey] || { ratio: 11 };
      const children = room?.current_children || 0;
      const req = Math.max(1, Math.ceil(children / nqf.ratio));
      return re.length >= req;
    });
  };

  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      {/* Header row */}
      <div style={{ display: "grid", gridTemplateColumns: `160px repeat(${weekDates.length},1fr)`, background: "linear-gradient(135deg,#EDE4F0,#E8F0ED)" }}>
        <div style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "#8A7F96" }}>EDUCATOR</div>
        {weekDates.map(date => {
          const d = new Date(date + "T12:00:00");
          const dc = entries.filter(e => e.date === date).length;
          const cost = dayCost(date);
          const compliant = dayCompliant(date);
          return (
            <div key={date} style={{ padding: "6px 10px", textAlign: "center", borderLeft: "1px solid rgba(255,255,255,0.4)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#3D3248" }}>{DAYS[d.getDay()]} {d.getDate()}</div>
              <div style={{ fontSize: 9, color: "#8A7F96" }}>{dc} shift{dc!==1?"s":""} · ${cost.toFixed(0)}</div>
              <div style={{ fontSize: 8, color: compliant ? "#2E8B57" : "#C06B73" }}>{compliant ? "✓ NQF OK" : "⚠ Check"}</div>
            </div>
          );
        })}
      </div>
      {/* Educator rows */}
      {edIds.map((edId, i) => {
        const edEntries = entries.filter(e => e.educator_id === edId);
        const edName = edEntries[0]?.educator_name || edId;
        const edQual = edEntries[0]?.qualification || "cert3";
        const qc = qColors[edQual] || "#999";
        const totalHrs = edEntries.reduce((a,e) => {
          const sM=tM(e.start_time||"07:00"),eM=tM(e.end_time||"15:00");
          return a+(eM-sM-(e.break_mins||30))/60;
        },0);
        const over = totalHrs >= 38, warn = totalHrs >= 34 && totalHrs < 38;
        return (
          <div key={edId} style={{ display: "grid", gridTemplateColumns: `160px repeat(${weekDates.length},1fr)`, borderTop: "1px solid #F5F0FB", background: i%2===0?"#FDFBF9":"#fff" }}>
            <div style={{ padding: "6px 10px", borderRight: "1px solid #EDE8F4", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap:4 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: qc, flexShrink: 0 }}/>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#3D3248", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{edName}</span>
              </div>
              <div style={{ fontSize: 9, color: over?"#C62828":warn?"#E65100":"#8A7F96", fontWeight: over||warn?700:400 }}>
                {totalHrs.toFixed(1)}h{over?" ⚠ AT CAP":warn?" ⚡ near cap":""}
              </div>
            </div>
            {weekDates.map(date => {
              const dayShifts = edEntries.filter(e => e.date === date);
              return (
                <div key={date} style={{ padding: "4px 6px", borderLeft: "1px solid #F5F0FB", minHeight: 44, display: "flex", flexDirection: "column", gap: 2, justifyContent: "center" }}>
                  {dayShifts.length === 0 ? (
                    <div onClick={()=>onAddShift&&onAddShift(edId,date)}
                      style={{ fontSize:9,color:"#D9D0C7",textAlign:"center",cursor:"pointer",padding:"4px 0",borderRadius:5 }}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(139,109,175,0.06)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      + add
                    </div>
                  ) : dayShifts.map(s => {
                    const sM=tM(s.start_time||"07:00"),eM=tM(s.end_time||"15:00");
                    const hrs=((eM-sM-(s.break_mins||30))/60).toFixed(1);
                    const qColor = qColors[s.qualification] || "#8B6DAF";
                    return (
                      <div key={s.id} onClick={()=>onEdit&&onEdit(s)}
                        style={{ padding:"2px 5px",borderRadius:5,background:qColor+"20",border:"1px solid "+qColor+"40",fontSize:9,color:"#3D3248",position:"relative",cursor:"pointer" }}
                        title="Click to edit shift">
                        <div style={{ fontWeight:700 }}>{s.start_time}–{s.end_time}</div>
                        <div style={{ color:"#8A7F96",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{s.room_name||"No room"} · {hrs}h</div>
                        <button onClick={e=>{e.stopPropagation();onDelete(s.id);}} style={{ position:"absolute",top:1,right:2,background:"none",border:"none",cursor:"pointer",color:"#C06B73",fontSize:9,lineHeight:1,padding:0 }}>×</button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
      {edIds.length === 0 && <div style={{ flex: 1, minHeight: 0, width: '100%', padding: 32, textAlign: "center", color: "#A89DB5" }}>No shifts for this period</div>}
    </div>
  );
}

/* ═══ AI ROSTER ASSISTANT ═══ */
function AIRosterAssistant({ entries, educators, rooms, period }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I'm your AI Roster Assistant. Ask me anything about this roster — compliance checks, coverage gaps, who can cover a shift, cost analysis, or swap suggestions." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async (overrideText) => {
    const userMsg = (overrideText !== undefined ? overrideText : input).trim();
    if (!userMsg || loading) return;
    if (overrideText === undefined) setInput("");
    else setInput("");
    setMessages(m => [...m, { role: "user", content: userMsg }]);
    setLoading(true);

    // Build context for AI
    const rosterSummary = entries.reduce((acc, e) => {
      const key = e.date;
      if (!acc[key]) acc[key] = [];
      const sM=tM(e.start_time||"07:00"),eM=tM(e.end_time||"15:00");
      const hrs=((eM-sM-(e.break_mins||30))/60).toFixed(1);
      acc[key].push(`${e.educator_name} (${e.qualification||"?"}) → ${e.room_name||"No room"} ${e.start_time}-${e.end_time} (${hrs}h)`);
      return acc;
    }, {});

    const ctx = `You are an AI roster assistant for a childcare centre. NQF ratios: babies 1:4, toddlers 1:5, preschool 1:11 (ECT required), OSHC 1:15.
Current roster period: ${period?.start_date||"?"} to ${period?.end_date||"?"}.
Educators: ${educators.map(e=>`${e.first_name} ${e.last_name} (${e.qualification||"cert3"}, ${e.employment_type||"?"}, ${e.max_hours_per_week||38}h max, reliability ${Math.round(e.reliability_score||80)}%)`).join('\n')}.
Rooms: ${rooms.map(r=>`${r.name} (${r.age_group||"?"}, ${r.current_children||0} children)`).join('\n')}.
Roster by day:\n${Object.entries(rosterSummary).map(([d,shifts])=>`${d}: ${shifts.join(", ")}`).join('\n')}
Be concise, practical and specific. Focus on compliance, costs, risks and actionable suggestions.`;

    try {
      const response = await fetch("/api/rostering/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(localStorage.getItem("c360_token") ? { Authorization: `Bearer ${localStorage.getItem("c360_token")}` } : {}), ...(localStorage.getItem("c360_tenant") ? { "x-tenant-id": localStorage.getItem("c360_tenant") } : {}) },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: ctx,
          messages: [...messages.slice(1), { role: "user", content: userMsg }]
        })
      });
      const data = await response.json();
      const text = data.content?.map(c => c.text || "").join("") || data.error || "Sorry, I couldn't process that.";
      setMessages(m => [...m, { role: "assistant", content: text }]);
    } catch (err) {
      setMessages(m => [...m, { role: "assistant", content: "Connection error. Try again." }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{ ...btnS, background: open ? "rgba(139,109,175,0.1)" : "#F8F5F1", color: open ? "#7E5BA3" : "#5C4E6A", border: open ? "1px solid rgba(139,109,175,0.25)" : "1px solid #D9D0C7" }}>
        🤖 AI Assistant {open ? "▲" : "▼"}
      </button>
      {open && (
        <div style={{ ...card, marginTop: 8, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #EDE8F4", background: "linear-gradient(135deg,#EDE4F0,#F8F5FF)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>🤖</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#3D3248" }}>AI Roster Assistant</div>
              <div style={{ fontSize: 9, color: "#8A7F96" }}>Ask about compliance, gaps, coverage, swaps, costs</div>
            </div>
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: m.role === "user" ? "#8B6DAF" : "#E8F0ED", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 }}>
                  {m.role === "user" ? "U" : "🤖"}
                </div>
                <div style={{ maxWidth: "75%", padding: "8px 10px", borderRadius: 10, background: m.role === "user" ? "rgba(139,109,175,0.1)" : "#F8F5F1", border: "1px solid " + (m.role === "user" ? "rgba(139,109,175,0.2)" : "#E8E0D8"), fontSize: 11, color: "#3D3248", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && <div style={{ display: "flex", gap: 8, alignItems: "center" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#E8F0ED", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>🤖</div><div style={{ fontSize: 11, color: "#8A7F96" }}>Thinking…</div></div>}
            <div ref={bottomRef}/>
          </div>
          <div style={{ padding: "8px 12px", borderTop: "1px solid #EDE8F4", display: "flex", gap: 6 }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Who can cover Tuesday 2pm? Are we NQF compliant on Wednesday? Show me cost breakdown…"
              style={{ ...inp, flex: 1, fontSize: 11 }}/>
            <button onClick={sendMessage} disabled={loading || !input.trim()} style={{ ...btnP, opacity: loading || !input.trim() ? 0.5 : 1, padding: "7px 14px" }}>Send</button>
          </div>
          <div style={{ padding: "4px 12px 8px", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["NQF compliance check", "Cost breakdown", "Who has most hours?", "Any gaps this week?"].map(q => (
              <button key={q} onClick={() => sendMessage(q)} style={{ ...btnS, padding: "2px 8px", fontSize: 9 }}>{q}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ ROSTER TAB (REDESIGNED) ═══ */
/* ═══ ROSTER TAB (REDESIGNED) ═══ */
function RosterTab({ educators, periods, templates, archived, sp, loadP, reload, settings, proposals }) {
  const [subView, setSubView] = useState("week"); // 'week' | 'day' | 'generate'
  const [selDay, setSelDay] = useState(null);
  const [selRoom, setSelRoom] = useState(null);
  const [dragEdId, setDragEdId] = useState(null); // educator being dragged
  const [showTemplates, setShowTemplates] = useState(false);
  const [editShift, setEditShift] = useState(null);

  // Generate form state
  const [gf, setGf] = useState({ period_type: settings?.default_period_type || "weekly", start_date: nextMon(), end_date: addDays(nextMon(), 4), weekly_budget_cents: 0, is_special: false, special_notes: "" });
  const [gRes, setGRes] = useState(null);
  const [gErr, setGErr] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [lunchCoverEdId, setLunchCoverEdId] = useState(null);

  // Period selector
  const [showNewPeriod, setShowNewPeriod] = useState(false);
  const [newPeriod, setNewPeriod] = useState({ name: "", start_date: nextMon(), end_date: addDays(nextMon(), 4) });

  // Derived data from selected period
  const period = sp?.period;
  const entries = sp?.entries || [];
  const rooms = sp?.rooms || [];
  const opDays = settings?.operating_days || [1, 2, 3, 4, 5];
  // Generate all dates in period range (not just dates with entries)
  const allDates = useMemo(() => {
    if (!period?.start_date || !period?.end_date) return [...new Set(entries.map(e => e.date))].sort();
    const dates = [];
    let cur = new Date(period.start_date + "T12:00:00");
    const end = new Date(period.end_date + "T12:00:00");
    while (cur <= end) {
      const dow = cur.getDay();
      if (period.is_special || opDays.includes(dow)) {
        dates.push(cur.toISOString().split("T")[0]);
      }
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }, [period?.start_date, period?.end_date, period?.is_special, opDays]);

  // Auto-select first day
  useEffect(() => {
    if (allDates.length > 0 && !selDay) setSelDay(allDates[0]);
  }, [allDates.length]);

  // Listen for roster reload events
  useEffect(() => {
    const handler = (e) => { if (e.detail?.period_id) loadP(e.detail.period_id); };
    window.addEventListener("roster-reload", handler);
    return () => window.removeEventListener("roster-reload", handler);
  }, [loadP]);

  const dayEntries = selDay ? entries.filter(e => e.date === selDay) : [];

  // Entry CRUD
  const delEntry = async id => {
    try { await API("/api/rostering/entries/" + id, { method: "DELETE" }); if (sp?.period?.id) loadP(sp.period.id); } catch (e) { toast("Delete failed", "error"); }
  };
  const saveEntry = async (body) => {
    try {
      const r = await API("/api/rostering/entries", { method: "POST", body: { ...body, period_id: period?.id, tenant_id: undefined } });
      if (r?.error) { toast(r.error, "error"); return; }
      if (period?.id) loadP(period.id);
      toast("Shift saved");
    } catch (e) { toast("Save failed", "error"); }
  };
  const updateEntry = async (id, body) => {
    try {
      await API("/api/rostering/entries/" + id, { method: "PUT", body });
      if (period?.id) loadP(period.id);
      toast("Shift updated");
    } catch (e) { toast("Update failed", "error"); }
  };

  // Generate roster
  // BUG-ROST-01 fix: moved setGenerating(false) into a `finally` block so it
  // ALWAYS runs. Previously it was after the try/catch, meaning if the catch
  // block itself threw (e.g. `e.message` on a non-Error rejection, or a
  // React unmount race), setGenerating(false) never executed and the button
  // stayed stuck on "⏳ Generating…" indefinitely.
  const handleGenerate = async () => {
    setGenerating(true); setGErr(null); setGRes(null);
    try {
      const r = await API("/api/rostering/generate", { method: "POST", body: { ...gf, lunch_cover_educator_id: lunchCoverEdId || null } });
      if (r?.error) {
        setGErr(r.error);
      } else {
        setGRes(r);
        toast(`Roster generated — ${r.entries_created || 0} shifts, ${r.compliance_score || 0}% compliance`);
        reload();
        if (r.period_id) { loadP(r.period_id); setTimeout(() => loadP(r.period_id), 1000); }
      }
    } catch (e) {
      const msg = (e && typeof e === "object" && e.message) ? e.message : String(e || "Unknown error");
      setGErr(msg);
    } finally {
      setGenerating(false);
    }
  };

  // Approve / Publish
  const approve = async id => { try { await API("/api/rostering/periods/" + id + "/approve", { method: "PUT" }); reload(); loadP(id); toast("Roster approved"); } catch (e) { toast("Approve failed", "error"); } };
  const publish = async id => { try { await API("/api/rostering/periods/" + id + "/publish", { method: "PUT" }); reload(); loadP(id); toast("Roster published"); } catch (e) { toast("Publish failed", "error"); } };
  const unpublish = async id => { try { await API("/api/rostering/periods/" + id + "/unpublish", { method: "PUT" }); reload(); loadP(id); toast("Roster reverted to draft"); } catch (e) { toast("Unpublish failed", "error"); } };
  const deletePeriod = async id => { if (!(await window.showConfirm("Delete this roster period and all its shifts? This cannot be undone."))) return; try { await API("/api/rostering/periods/" + id, { method: "DELETE" }); reload(); localStorage.removeItem("c360_last_period_id"); toast("Period deleted"); } catch (e) { toast("Delete failed", "error"); } };

  // Template actions
  const saveAsTemplate = async () => {
    const name = await window.showPrompt("Template name:");
    if (!name || !period?.id) return;
    try {
      await API("/api/rostering/templates", { method: "POST", body: { period_id: period.id, name } });
      reload(); toast("Template saved");
    } catch (e) { toast("Failed", "error"); }
  };
  const applyTemplate = async (templateId) => {
    const startDate = await window.showPrompt("Start date (YYYY-MM-DD):", nextMon());
    if (!startDate) return;
    try {
      const r = await API("/api/rostering/templates/" + templateId + "/apply", { method: "POST", body: { start_date: startDate } });
      if (r?.period_id) { loadP(r.period_id); reload(); toast("Template applied"); }
    } catch (e) { toast("Failed to apply", "error"); }
  };
  const deleteTemplate = async (id) => {
    if (!(await window.showConfirm("Delete this template?"))) return;
    try { await API("/api/rostering/templates/" + id, { method: "DELETE" }); reload(); toast("Template deleted"); } catch (e) { toast("Failed", "error"); }
  };

  // Room compliance for week overview
  const getRoomCompliance = (roomId, date) => {
    const re = entries.filter(e => e.room_id === roomId && e.date === date);
    const room = rooms.find(r => r.id === roomId);
    const ageKey = AGE_MAP[room?.age_group] || "preschool";
    const nqf = NQF_RATIOS[ageKey] || { ratio: 11, ect_required: false };
    const children = room?.current_children || room?.child_count || 0;
    const required = children > 0 ? Math.max(1, Math.ceil(children / nqf.ratio)) : 1;
    const hasECT = re.some(e => e.qualification === "ect" || e.qualification === "diploma");
    const ratioOk = re.length >= required;
    const ectOk = !nqf.ect_required || hasECT;
    const hrs = re.reduce((s, e) => { const sM = tM(e.start_time || "07:00"), eM = tM(e.end_time || "15:00"); return s + (eM - sM - (e.break_mins || 30)) / 60; }, 0);
    const cost = re.reduce((s, e) => { const sM = tM(e.start_time || "07:00"), eM = tM(e.end_time || "15:00"); return s + ((eM - sM - (e.break_mins || 30)) / 60) * ((e.hourly_rate_cents || 3500) / 100); }, 0);
    return { count: re.length, required, ratioOk, ectOk, compliant: ratioOk && ectOk, hrs: hrs.toFixed(1), cost: cost.toFixed(0), entries: re };
  };

  // Pending proposals count
  const pendingProposals = (proposals || []).filter(p => p.status === "pending");

  return (
    <div>
      {/* ── Period selector bar ── */}
      <div style={{ ...card, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: "#8A7F96" }}>PERIOD</label>
        <select value={period?.id || ""} onChange={e => { if (e.target.value) loadP(e.target.value); }}
          style={{ ...sel, width: 220, fontSize: 12 }}>
          <option value="">— Select a roster period —</option>
          {periods.map(p => <option key={p.id} value={p.id}>{p.period_type === "weekly" ? "Week" : "Fortnight"}: {fmtDate(p.start_date)} → {fmtDate(p.end_date)} {p.status !== "draft" ? `(${p.status})` : ""}{p.is_special ? " 🌟" : ""}</option>)}
        </select>
        {period && (
          <>
            <Badge text={period.status || "draft"} color={period.status === "published" ? "#2E8B57" : period.status === "approved" ? "#5B8DB5" : "#D4A26A"} />
            {period.status === "draft" && <button onClick={() => approve(period.id)} style={btnS}>✓ Approve</button>}
            {period.status === "draft" && <button onClick={() => deletePeriod(period.id)} style={{ ...btnS, color: "#C06B73", borderColor: "#FFCDD2" }}>🗑 Delete</button>}
            {period.status === "approved" && <button onClick={() => publish(period.id)} style={btnP}>📤 Publish</button>}
            {period.status === "approved" && <button onClick={() => unpublish(period.id)} style={btnS}>↩ Revert to Draft</button>}
            {period.status === "published" && <button onClick={() => unpublish(period.id)} style={btnS}>✏️ Edit (Unpublish)</button>}
            <button onClick={saveAsTemplate} style={btnS}>💾 Save as Template</button>
          </>
        )}
        <button onClick={() => setShowTemplates(!showTemplates)} style={btnS}>📋 Templates{templates.length > 0 ? ` (${templates.length})` : ""}</button>
        <div style={{ flex: 1 }} />
        {pendingProposals.length > 0 && (
          <div style={{ padding: "4px 10px", borderRadius: 8, background: "#FFF3E0", border: "1px solid #FFCC80", fontSize: 11, fontWeight: 600, color: "#E65100" }}>
            🔔 {pendingProposals.length} pending change{pendingProposals.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* ── Templates panel ── */}
      {showTemplates && (
        <div style={{ ...card, padding: 14 }}>
          <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700 }}>📋 Roster Templates</h4>
          {templates.length === 0 ? <p style={{ fontSize: 12, color: "#8A7F96" }}>No templates saved yet. Select a period and click "Save as Template".</p> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 8 }}>
              {templates.map(t => (
                <div key={t.id} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #EDE8F4", background: "#FDFBF9" }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: "#8A7F96", marginTop: 2 }}>{t.entry_count || "?"} shifts</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                    <button onClick={() => applyTemplate(t.id)} style={{ ...btnP, padding: "4px 10px", fontSize: 10 }}>Apply</button>
                    <button onClick={() => deleteTemplate(t.id)} style={{ ...btnS, padding: "4px 8px", fontSize: 10, color: "#C06B73" }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Sub-view tabs ── */}
      <div style={{ display: "flex", gap: 3, marginBottom: 12 }}>
        {[["week", "📊 Week Overview"], ["day", "📝 Day Editor"], ["generate", "🤖 Generate AI Roster"]].map(([id, l]) => (
          <button key={id} onClick={() => setSubView(id)}
            style={{ padding: "8px 16px", borderRadius: "8px 8px 0 0", border: subView === id ? "1px solid #8B6DAF" : "1px solid #D9D0C7", borderBottom: subView === id ? "2px solid #fff" : "1px solid #D9D0C7", background: subView === id ? "#fff" : "#F8F5F1", color: subView === id ? "#7C3AED" : "#6B5F7A", fontWeight: subView === id ? 700 : 500, fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginBottom: -1, position: "relative", zIndex: subView === id ? 1 : 0 }}>
            {l}
          </button>
        ))}
      </div>

      {/* ═══ WEEK OVERVIEW ═══ */}
      {subView === "week" && (
        <div style={{ ...card, padding: 16 }}>
          {!period ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#8A7F96" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📅</div>
              <p style={{ fontSize: 14, fontWeight: 600 }}>Select a roster period above, or generate a new one</p>
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: "#3D3248" }}>
                      <th style={{ padding: "8px 12px", textAlign: "left", color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: 700, width: 120 }}>ROOM</th>
                      {allDates.map(d => {
                        const dt = new Date(d + "T12:00:00");
                        const dayTotal = entries.filter(e => e.date === d);
                        const dayCost = dayTotal.reduce((s, e) => { const sM = tM(e.start_time || "07:00"), eM = tM(e.end_time || "15:00"); return s + ((eM - sM - (e.break_mins || 30)) / 60) * ((e.hourly_rate_cents || 3500) / 100); }, 0);
                        const isToday = d === new Date().toISOString().slice(0, 10);
                        return (
                          <th key={d} style={{ padding: "6px 8px", textAlign: "center", color: isToday ? "#C9A8FF" : "rgba(255,255,255,0.9)", background: isToday ? "rgba(139,109,175,0.3)" : undefined, minWidth: 90 }}>
                            <div style={{ fontSize: 10, fontWeight: 700 }}>{DAYS[dt.getDay()]}</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{dt.getDate()}</div>
                            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}>{dayTotal.length} shifts · ${dayCost.toFixed(0)}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((room, ri) => (
                      <tr key={room.id} style={{ background: ri % 2 === 0 ? "#FDFBF9" : "#fff" }}>
                        <td style={{ padding: "8px 12px", fontWeight: 700, color: "#3D3248", borderRight: "1px solid #EDE8F4", fontSize: 11 }}>
                          {room.name}
                          <div style={{ fontSize: 9, color: "#8A7F96", fontWeight: 400 }}>{room.current_children || 0} children</div>
                        </td>
                        {allDates.map(d => {
                          const c = getRoomCompliance(room.id, d);
                          const bg = c.compliant ? "rgba(46,139,87,0.08)" : c.count > 0 ? "rgba(245,166,35,0.08)" : "rgba(192,107,115,0.06)";
                          const borderColor = c.compliant ? "#A5D6A7" : c.count > 0 ? "#FFCC80" : "#FFCDD2";
                          return (
                            <td key={d} onClick={() => { setSelDay(d); setSelRoom(room.id); setSubView("day"); }}
                              style={{ padding: "6px 8px", textAlign: "center", cursor: "pointer", border: "1px solid #F0EBF8", background: bg, transition: "background 0.15s" }}
                              onMouseEnter={e => e.currentTarget.style.background = "rgba(139,109,175,0.12)"}
                              onMouseLeave={e => e.currentTarget.style.background = bg}>
                              <div style={{ fontSize: 16, fontWeight: 800, color: c.compliant ? "#2E8B57" : c.count > 0 ? "#F5A623" : "#C06B73" }}>
                                {c.count}/{c.required}
                              </div>
                              <div style={{ fontSize: 9, color: "#8A7F96" }}>{c.hrs}h · ${c.cost}</div>
                              {!c.ectOk && <div style={{ fontSize: 8, color: "#E65100" }}>⚠ ECT needed</div>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* NQF timeline for selected day */}
              {selDay && dayEntries.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#5C4E6A", marginBottom: 6 }}>Compliance for {fmtDate(selDay)}</div>
                  <NQFComplianceTimeline dayEntries={dayEntries} rooms={rooms} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ DAY EDITOR ═══ */}
      {subView === "day" && (
        <div>
          {!period ? (
            <div style={{ ...card, textAlign: "center", padding: "40px 0", color: "#8A7F96" }}>
              <p style={{ fontSize: 14, fontWeight: 600 }}>Select a roster period to edit shifts</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 12 }}>
              {/* Main: Timeline view */}
              <div>
                {/* Day selector */}
                <div style={{ display: "flex", gap: 3, marginBottom: 10, flexWrap: "wrap" }}>
                  {allDates.map(d => {
                    const dt = new Date(d + "T12:00:00");
                    const active = selDay === d;
                    const dayShifts = entries.filter(e => e.date === d).length;
                    return (
                      <button key={d} onClick={() => setSelDay(d)}
                        style={{ padding: "5px 12px", borderRadius: 8, border: active ? "2px solid #8B6DAF" : "1px solid #EDE8F4", background: active ? "#8B6DAF" : "#fff", color: active ? "#fff" : "#555", cursor: "pointer", fontSize: 11, fontWeight: active ? 700 : 500 }}>
                        {DAYS[dt.getDay()]} {dt.getDate()} <span style={{ fontSize: 9, opacity: 0.7 }}>({dayShifts})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Timeline with drag-drop rooms */}
                {selDay && (
                  <div style={card}>
                    <div style={{ fontSize: 10, color: "#8A7F96", marginBottom: 6, padding: "4px 8px", background: "#F8F5FC", borderRadius: 6, display: "inline-block" }}>
                      💡 <strong>Drag</strong> an educator from the right panel onto a room row to assign a shift · <strong>Click</strong> any shift bar to edit
                    </div>
                    <GanttTimeline openHour={tM(settings?.open_time || "07:00") / 60} closeHour={Math.ceil(tM(settings?.close_time || "18:30") / 60)} />
                    {rooms.map((room, ri) => {
                      const re = dayEntries.filter(e => e.room_id === room.id);
                      const c = getRoomCompliance(room.id, selDay);
                      const isDropTarget = selRoom === room.id && dragEdId;
                      const ageKey = AGE_MAP[room.age_group] || "preschool";
                      const nqf = NQF_RATIOS[ageKey] || { ratio: 11 };
                      return (
                        <div key={room.id}
                          onDragOver={e => { e.preventDefault(); setSelRoom(room.id); }}
                          onDragLeave={() => {}}
                          onDrop={e => {
                            e.preventDefault();
                            const edId = e.dataTransfer.getData("educatorId") || dragEdId;
                            if (!edId) return;
                            const ed = educators.find(x => x.id === edId);
                            const dow = new Date(selDay + "T12:00:00").getDay();
                            const avail = ed?.availability?.find(a => a.day_of_week === dow);
                            const startT = avail?.start_time || settings?.open_time || "07:00";
                            const endM = tM(startT) + 480; // 8 hour shift
                            setEditShift({
                              _isNew: true,
                              educator_id: edId,
                              educator_name: ed ? `${ed.first_name} ${ed.last_name}` : "?",
                              qualification: ed?.qualification,
                              room_id: room.id,
                              date: selDay,
                              start_time: startT,
                              end_time: mT(Math.min(endM, tM(settings?.close_time || "18:30"))),
                              break_mins: settings?.default_break_mins || 30,
                              is_lunch_cover: 0,
                              lunch_start: "",
                            });
                            setDragEdId(null);
                          }}
                          style={{ display: "flex", borderBottom: "1px solid #F5F0FB", background: isDropTarget ? "rgba(139,109,175,0.08)" : ri % 2 === 0 ? "#FDFBF9" : "#fff", minHeight: 40, transition: "background 0.15s", outline: isDropTarget ? "2px dashed #8B6DAF" : "none", outlineOffset: -2 }}>
                          <div style={{ width: 160, flexShrink: 0, padding: "4px 8px", display: "flex", flexDirection: "column", justifyContent: "center", borderRight: "1px solid #EDE8F4", cursor: "pointer" }}
                            onClick={() => setSelRoom(room.id)}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.compliant ? "#2E8B57" : c.count > 0 ? "#F5A623" : "#C06B73", flexShrink: 0 }} />
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#3D3248", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{room.name}</span>
                            </div>
                            <div style={{ fontSize: 8, color: "#8A7F96", marginTop: 1 }}>{re.length}/{c.required} educators · 1:{nqf.ratio} · {room.current_children || 0} kids</div>
                          </div>
                          <div style={{ flex: 1, position: "relative", minHeight: Math.max(40, re.length * 34 + 4) }}>
                            {(() => { const s = Math.max(5, Math.floor(tM(settings?.open_time||"07:00")/60)-1), e = Math.min(20, Math.ceil(tM(settings?.close_time||"18:30")/60)+1), hrs=[]; for(let h=s;h<=e;h++) hrs.push(h); return hrs; })().map(h => (
                              <div key={h} style={{ position: "absolute", left: pct(h * 60) + "%", top: 0, bottom: 0, borderLeft: "1px solid #F0EBF820", pointerEvents: "none" }} />
                            ))}
                            {re.map((entry, ei) => {
                              const qColor = Q[entry.qualification]?.c || "#8B6DAF";
                              const sM = tM(entry.start_time || "07:00"), eM = tM(entry.end_time || "15:00");
                              const left = pct(sM), width = pct(eM) - pct(sM);
                              const top = ei * 32 + 4;
                              const hrs = ((eM - sM - (entry.break_mins || 30)) / 60).toFixed(1);
                              return (
                                <div key={entry.id} onClick={() => setEditShift({ ...entry })}
                                  style={{ position: "absolute", left: left + "%", width: Math.max(width, 3) + "%", top, height: 28, borderRadius: 5, background: qColor + "25", border: "1px solid " + qColor + "50", cursor: "pointer", overflow: "hidden", display: "flex", alignItems: "center", padding: "0 6px", gap: 4 }}
                                  title={`${entry.educator_name} · ${entry.start_time}–${entry.end_time} (${hrs}h)`}>
                                  <span style={{ fontSize: 9, fontWeight: 700, color: qColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {entry.educator_name?.split(" ")[0]} {width > 12 ? `${entry.start_time}–${entry.end_time}` : ""}
                                  </span>
                                  {entry.is_lunch_cover ? <span style={{ fontSize: 8 }}>🍽</span> : null}
                                </div>
                              );
                            })}
                            {re.length === 0 && (
                              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#D6CEE0", fontSize: 10, fontWeight: 600 }}>
                                {isDropTarget ? "Drop educator here →" : "Drop educator to add shift"}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ marginTop: 10 }}>
                      <NQFComplianceTimeline dayEntries={dayEntries} rooms={rooms} />
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Educator panel */}
              <div style={{ ...card, padding: 12, maxHeight: "calc(100vh - 250px)", overflowY: "auto", position: "sticky", top: 16 }}>
                <h4 style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: "#3D3248" }}>👩‍🏫 Educators</h4>
                <p style={{ margin: "0 0 8px", fontSize: 9, color: "#8A7F96" }}>Drag onto a room row to assign</p>
                {selDay && (() => {
                  const dow = new Date(selDay + "T12:00:00").getDay();
                  const scored = educators.filter(e => e.status === "active" || !e.status).map(ed => {
                    let score = 50 + (ed.reliability_score || 0) / 2;
                    if (ed.preferred_rooms?.includes(selRoom)) score += 20;
                    const avail = ed?.availability?.find(a => a.day_of_week === dow);
                    if (avail?.available) score += 15;
                    const dayAssigned = dayEntries.filter(e => e.educator_id === ed.id);
                    // Rostered educators get negative score so they sort to bottom
                    if (dayAssigned.length > 0) score -= 200;
                    return { ...ed, score, available: avail?.available, avail_start: avail?.start_time, avail_end: avail?.end_time, dayShifts: dayAssigned.length, rostered: dayAssigned.length > 0 };
                  }).sort((a, b) => b.score - a.score);

                  const unrostered = scored.filter(e => !e.rostered);
                  const rostered = scored.filter(e => e.rostered);

                  const renderEd = (ed, greyed) => {
                    const qc = Q[ed.qualification]?.c || "#8B6DAF";
                    const weekHrs = entries.filter(e => e.educator_id === ed.id).reduce((s, e) => { const sM2 = tM(e.start_time || "07:00"), eM2 = tM(e.end_time || "15:00"); return s + (eM2 - sM2 - (e.break_mins || 30)) / 60; }, 0);
                    return (
                      <div key={ed.id}
                        draggable
                        onDragStart={e => { e.dataTransfer.setData("educatorId", ed.id); setDragEdId(ed.id); }}
                        onDragEnd={() => setDragEdId(null)}
                        style={{ padding: "6px 10px", marginBottom: 3, borderRadius: 8, border: "1px solid " + (greyed ? "#E8E0D8" : "#EDE8F4"), background: dragEdId === ed.id ? "rgba(139,109,175,0.08)" : greyed ? "#F8F5F1" : "#fff", cursor: "grab", userSelect: "none", opacity: greyed ? 0.5 : 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: greyed ? "#A89DB5" : "#3D3248" }}>
                            {ed.first_name} {ed.last_name}
                            {ed.dayShifts > 0 && <span style={{ fontSize: 9, color: "#A89DB5", fontWeight: 400 }}> ({ed.dayShifts} shift{ed.dayShifts !== 1 ? "s" : ""} today)</span>}
                          </span>
                          <Badge text={Q[ed.qualification]?.s || "?"} color={greyed ? "#A89DB5" : qc} />
                        </div>
                        <div style={{ display: "flex", gap: 8, fontSize: 9, color: "#A89DB5", marginTop: 2 }}>
                          <span>{ed.available ? "✓ Avail" : "✗ Off"}</span>
                          <span>{weekHrs.toFixed(1)}h/wk</span>
                          <span>{Math.round(ed.reliability_score || 0)}%</span>
                        </div>
                      </div>
                    );
                  };

                  return (
                    <>
                      {unrostered.map(ed => renderEd(ed, false))}
                      {rostered.length > 0 && (
                        <>
                          <div style={{ padding: "6px 0 4px", fontSize: 9, fontWeight: 700, color: "#A89DB5", borderTop: "1px solid #EDE8F4", marginTop: 4 }}>
                            ALREADY ROSTERED TODAY ({rostered.length})
                          </div>
                          {rostered.map(ed => renderEd(ed, true))}
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Shift edit/create modal */}
          {editShift && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 500, width: "92%", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{editShift._isNew ? "➕ New Shift" : "✏️ Edit Shift"}</h3>
                  <button onClick={() => setEditShift(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#8A7F96" }}>×</button>
                </div>
                <div style={{ background: "#F8F5FC", borderRadius: 10, padding: "8px 14px", marginBottom: 14, fontSize: 12, color: "#5C4E6A" }}>
                  <strong>{editShift.educator_name}</strong> · {fmtDate(editShift.date)} · {rooms.find(r => r.id === editShift.room_id)?.name || ""}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div><label style={lbl}>Start Time</label><input type="time" value={editShift.start_time || "07:00"} onChange={e => setEditShift({ ...editShift, start_time: e.target.value })} style={inp} /></div>
                  <div><label style={lbl}>End Time</label><input type="time" value={editShift.end_time || "15:00"} onChange={e => setEditShift({ ...editShift, end_time: e.target.value })} style={inp} /></div>
                  <div><label style={lbl}>Break (mins)</label><input type="number" value={editShift.break_mins ?? 30} onChange={e => setEditShift({ ...editShift, break_mins: parseInt(e.target.value) || 0 })} style={inp} /></div>
                  <div><label style={lbl}>Room</label>
                    <select value={editShift.room_id || ""} onChange={e => setEditShift({ ...editShift, room_id: e.target.value })} style={sel}>
                      {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Lunch Start (optional)</label><input type="time" value={editShift.lunch_start || ""} onChange={e => setEditShift({ ...editShift, lunch_start: e.target.value })} style={inp} placeholder="Auto" /></div>
                  <div style={{ display: "flex", alignItems: "end", paddingBottom: 4 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                      <input type="checkbox" checked={!!editShift.is_lunch_cover} onChange={e => setEditShift({ ...editShift, is_lunch_cover: e.target.checked ? 1 : 0 })} />
                      🍽 Lunch cover shift
                    </label>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
                  {/* BUG-ROST-02 fix: shift delete had no confirmation dialog at all
                      (the period-level delete correctly asks "Delete this roster period?",
                      but this shift-level delete just fired immediately). */}
                  {!editShift._isNew && <button onClick={async () => { if (!(await window.showConfirm("Delete this shift? This cannot be undone."))) return; delEntry(editShift.id); setEditShift(null); }} style={{ ...btnS, color: "#C06B73", borderColor: "#FFCDD2" }}>🗑 Delete</button>}
                  <div style={{ flex: 1 }} />
                  <button onClick={() => setEditShift(null)} style={btnS}>Cancel</button>
                  <button onClick={() => {
                    const body = { educator_id: editShift.educator_id, room_id: editShift.room_id, date: editShift.date, start_time: editShift.start_time, end_time: editShift.end_time, break_mins: editShift.break_mins, lunch_start: editShift.lunch_start || null, is_lunch_cover: editShift.is_lunch_cover || 0 };
                    if (editShift._isNew) saveEntry(body); else updateEntry(editShift.id, body);
                    setEditShift(null);
                  }} style={btnP}>💾 {editShift._isNew ? "Create Shift" : "Save Changes"}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ GENERATE AI ROSTER ═══ */}
      {subView === "generate" && (
        <div style={{ ...card, padding: 20, maxWidth: 600 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>🤖 Generate AI Roster</h3>
          <p style={{ margin: "0 0 16px", fontSize: 11, color: "#8A7F96" }}>The AI will create an optimised roster based on NQF ratios, educator availability, qualifications, and your budget.</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Period Type</label>
              <select value={gf.period_type} onChange={e => { const t = e.target.value; setGf({ ...gf, period_type: t, end_date: addDays(gf.start_date, t === "weekly" ? 4 : 13) }); }} style={sel}>
                <option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Weekly Budget ($)</label>
              <input type="number" value={gf.weekly_budget_cents ? gf.weekly_budget_cents / 100 : ""} onChange={e => setGf({ ...gf, weekly_budget_cents: Math.round(parseFloat(e.target.value || 0) * 100) })} style={inp} placeholder="0 = no limit" />
            </div>
            <div>
              <label style={lbl}>Start Date</label>
              <DatePicker value={gf.start_date} onChange={v => setGf({ ...gf, start_date: v, end_date: addDays(v, gf.period_type === "weekly" ? 4 : 13) })} />
            </div>
            <div>
              <label style={lbl}>End Date</label>
              <DatePicker value={gf.end_date} onChange={v => setGf({ ...gf, end_date: v })} />
            </div>
            <div>
              <label style={lbl}>Lunch Cover Educator</label>
              <select value={lunchCoverEdId || ""} onChange={e => setLunchCoverEdId(e.target.value || null)} style={sel}>
                <option value="">— None —</option>
                {educators.filter(e => e.is_lunch_cover).map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "end" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={gf.is_special || false} onChange={e => setGf({ ...gf, is_special: e.target.checked })} />
                🌟 Special roster (outside hours)
              </label>
            </div>
          </div>

          {gf.is_special && (
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Special Roster Notes</label>
              <input value={gf.special_notes || ""} onChange={e => setGf({ ...gf, special_notes: e.target.value })} style={inp} placeholder="e.g. School holiday program, training day" />
            </div>
          )}

          <button onClick={handleGenerate} disabled={generating}
            style={{ ...btnP, padding: "12px 32px", fontSize: 14, width: "100%", justifyContent: "center", opacity: generating ? 0.6 : 1 }}>
            {generating ? "⏳ Generating…" : "🤖 Generate Roster"}
          </button>

          {gErr && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA", color: "#C06B73", fontSize: 12 }}>❌ {gErr}</div>}

          {gRes && (
            <div style={{ marginTop: 12, padding: "14px 18px", borderRadius: 12, background: "rgba(46,139,87,0.06)", border: "1px solid rgba(46,139,87,0.2)" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#2E8B57", marginBottom: 8 }}>✅ Roster Generated!</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, fontSize: 12 }}>
                <div><div style={{ fontSize: 9, color: "#8A7F96" }}>Shifts</div><div style={{ fontWeight: 800 }}>{gRes.entries_created || gRes.shifts_created || 0}</div></div>
                <div><div style={{ fontSize: 9, color: "#8A7F96" }}>Hours</div><div style={{ fontWeight: 800 }}>{typeof gRes.total_hours === "number" ? gRes.total_hours.toFixed(1) : 0}</div></div>
                <div><div style={{ fontSize: 9, color: "#8A7F96" }}>Cost</div><div style={{ fontWeight: 800 }}>${typeof gRes.total_cost === "number" ? (gRes.total_cost / 100).toFixed(0) : 0}</div></div>
                <div><div style={{ fontSize: 9, color: "#8A7F96" }}>Compliance</div><div style={{ fontWeight: 800, color: (gRes.compliance_score || 0) >= 90 ? "#2E8B57" : "#E65100" }}>{gRes.compliance_score || 0}%</div></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => { if (gRes.period_id) { loadP(gRes.period_id); setSubView("week"); } }} style={btnP}>📊 View Roster</button>
                <button onClick={handleGenerate} style={btnS}>🔄 Regenerate</button>
              </div>
            </div>
          )}

          {/* AI Assistant */}
          {period && <div style={{ marginTop: 16 }}><AIRosterAssistant entries={entries} educators={educators} rooms={rooms} period={period} /></div>}
        </div>
      )}
    </div>
  );
}


/* ═══ SICK COVER ═══ */
// ─── Non-Contact Time Tab ─────────────────────────────────────────────────
// Weekly view of every educator's NC entitlement vs scheduled hours.
// Reads /api/roster/nc-requirements which is the canonical compliance source.
function NonContactTab() {
  const [data, setData] = useState(null);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    const dow = d.getDay();
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    return d.toISOString().split("T")[0];
  });

  const load = useCallback(async () => {
    try {
      const r = await API(`/api/roster/nc-requirements?week_start=${weekStart}`);
      if (r && !r.error) setData(r);
    } catch (e) { /* non-fatal */ }
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  const moveWeek = (delta) => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d.toISOString().split("T")[0]);
  };

  const statusBadge = (s) => {
    const map = {
      compliant: { c: "#2E7D32", bg: "#E8F5E9", t: "✅ Compliant" },
      partial: { c: "#E65100", bg: "#FFF3E0", t: "⚠ Partial" },
      missing: { c: "#B71C1C", bg: "#FFEBEE", t: "❌ Missing" },
      not_required: { c: "#8A7F96", bg: "#F5F5F5", t: "—" },
    };
    const m = map[s] || map.not_required;
    return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, color: m.c, background: m.bg }}>{m.t}</span>;
  };

  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "#8A7F96" }}>Loading non-contact time…</div>;

  const { educators = [], summary = {} } = data;

  return (
    <div>
      <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, color: "#3D3248" }}>Non-Contact Time Compliance</h3>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "#8A7F96" }}>Week of {weekStart}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => moveWeek(-1)} style={btnS}>← Prev</button>
          <button onClick={() => moveWeek(1)} style={btnS}>Next →</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 12 }}>
        {[
          ["Total Educators", summary.total || 0, "#3D3248"],
          ["Compliant", summary.compliant || 0, "#2E7D32"],
          ["Partial", summary.partial || 0, "#E65100"],
          ["Missing", summary.missing || 0, "#B71C1C"],
        ].map(([l, v, c]) => (
          <div key={l} style={{ ...card, marginBottom: 0, textAlign: "center", padding: "16px 12px" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: c, lineHeight: 1 }}>{v}</div>
            <div style={{ fontSize: 10, color: "#8A7F96", marginTop: 6, fontWeight: 600, textTransform: "uppercase" }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#EDE8F4" }}>
              {["Educator", "Role", "Entitled", "Scheduled", "Gap", "Status"].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#5C4E6A", fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {educators.map((e, i) => (
              <tr key={e.educator_id} style={{ background: i % 2 === 0 ? "#FDFBF9" : "#fff", borderBottom: "1px solid #F0EBF8" }}>
                <td style={{ padding: "10px 14px", fontWeight: 600, color: "#3D3248" }}>
                  {e.name}
                  {e.is_trainee && <span style={{ marginLeft: 6, fontSize: 9, color: "#7E5BA3", fontWeight: 700 }}>TRAINEE</span>}
                </td>
                <td style={{ padding: "10px 14px", color: "#5C4E6A" }}>{e.role || "—"}</td>
                <td style={{ padding: "10px 14px", color: "#3D3248" }}>{e.nc_hours_entitled} hrs</td>
                <td style={{ padding: "10px 14px", color: "#3D3248" }}>{e.nc_hours_scheduled} hrs</td>
                <td style={{ padding: "10px 14px", color: e.gap > 0 ? "#B71C1C" : "#2E7D32", fontWeight: e.gap > 0 ? 700 : 400 }}>
                  {e.gap > 0 ? `${e.gap} hrs short` : "—"}
                </td>
                <td style={{ padding: "10px 14px" }}>{statusBadge(e.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SickCoverTab({ educators = [], fills = [], reload }) {
  const [selectedFill, setSelectedFill] = React.useState(null);
  const [attempts, setAttempts] = React.useState([]);
  const [showOptimise, setShowOptimise] = React.useState(false);
  const [showReport, setShowReport] = React.useState(false);
  const [optForm, setOptForm] = React.useState({ date: "", absent_educator_id: "" });
  const [optResult, setOptResult] = React.useState(null);
  const [optLoading, setOptLoading] = React.useState(false);
  const [form, setForm] = React.useState({ educator_id:"", date:"", start_time:"07:00", end_time:"15:00", reason:"", strategy:"sequential" });
  const [submitting, setSubmitting] = React.useState(false);
  const [journey, setJourney] = React.useState([]);
  const [transcript, setTranscript] = React.useState([]);

  const loadAttempts = async (id) => {
    try { const r = await API("/api/rostering/fill-requests/"+id+"/attempts"); setAttempts(r.attempts||[]); } catch(e) {}
  };
  const viewAttempts = async (id) => {
    const fill = fills.find(f => f.id === id);
    setSelectedFill(fill || null);
    await loadAttempts(id);
    // Build journey from fill data
    if (fill) {
      setJourney([
        {icon:"📞",title:"Educator Calls In",detail:"Absence reported",st:"complete",t:fill.created_at?.slice(11,16)||"—"},
        {icon:"📋",title:"Absence Recorded",detail:`${fill.original_educator_name} · ${fill.reason||"Sick leave"}`,st:"complete",t:fill.created_at?.slice(11,16)||"—"},
        {icon:"📱",title:"Manager Notified",detail:"SMS sent to centre manager",st:"complete",t:fill.created_at?.slice(11,16)||"—"},
        {icon:"🔍",title:"Finding Replacement",detail:"AI searching by reliability, distance, qualification",st:fill.status==="filled"?"complete":"active",t:"—"},
        {icon:"✅",title:"Shift Filled",detail:fill.filled_by_name?"Covered by "+fill.filled_by_name:"Awaiting acceptance",st:fill.status==="filled"?"complete":"pending",t:"—"},
      ]);
      setTranscript(fill.transcript ? JSON.parse(fill.transcript) : []);
    }
  };
  const accept = async (reqId, edId) => {
    try { await API("/api/rostering/fill-requests/"+reqId+"/accept",{method:"POST",body:{educator_id:edId}}); reload(); toast("Shift filled ✓"); } catch(e) { toast("Failed","error"); }
  };
  const runOptimise = async () => {
    if (!optForm.absent_educator_id || !optForm.date) { toast("Select educator and date","error"); return; }
    setOptLoading(true); setOptResult(null);
    try { const r = await API("/api/rostering/sick-cover-optimise",{method:"POST",body:optForm}); setOptResult(r); } catch(e) { toast("Analyse failed","error"); }
    setOptLoading(false);
  };
  const submitAbsence = async () => {
    if (!form.educator_id || !form.date) { toast("Select educator and date","error"); return; }
    setSubmitting(true);
    try {
      const r = await API("/api/rostering/fill-requests",{method:"POST",body:{
        educator_id:form.educator_id, date:form.date, start_time:form.start_time,
        end_time:form.end_time, reason:form.reason, strategy:form.strategy
      }});
      if (r.error) { toast(r.error,"error"); } else { toast("Absence reported — finding cover…"); setShowReport(false); reload(); }
    } catch(e) { toast("Submit failed","error"); }
    setSubmitting(false);
  };
  const steps = [{icon:"📞",title:"Educator Calls In",detail:"Educator calls the absence hotline",st:"complete",t:"7:02 AM"},
    {icon:"🤖",title:"AI Takes Details",detail:"Records reason, sick cert reminders per AU law",st:"complete",t:"7:02 AM"},
    {icon:"📋",title:"Recorded & Transcribed",detail:"Full transcript + recording stored",st:"complete",t:"7:03 AM"},
    {icon:"📱",title:"Manager Notified",detail:"SMS + push sent to centre manager",st:"complete",t:"7:03 AM"},
    {icon:"🔍",title:"Finding Replacement",detail:"AI searches by reliability, distance, qualification",st:selectedFill?.status==="filled"?"complete":"active",t:"7:04 AM"},
    {icon:"💬",title:"SMS to Candidates",detail:((attempts||[]).length||0)+" educators contacted",st:selectedFill?.status==="filled"?"complete":"active",t:"7:04 AM"},
    {icon:"✅",title:"Shift Filled",detail:selectedFill?.filled_by_name?"Covered by "+selectedFill.filled_by_name:"Awaiting acceptance",st:selectedFill?.status==="filled"?"complete":"pending",t:"7:18 AM"},
  ];

  return (
    <div>
      <div style={{...card,background:"linear-gradient(135deg,#EDE4F0,#F0E8E8)",padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div><h3 style={{margin:0,fontSize:14,fontWeight:800,color:"#3D3248"}}>📞 AI Sick Cover Agent</h3><p style={{margin:"2px 0 0",fontSize:11,color:"#5C4E6A"}}>Educators call in → AI takes details → Notifies manager → Finds replacement</p></div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setShowOptimise(!showOptimise)} style={{...btnS,background:showOptimise?"rgba(139,109,175,0.1)":"#F8F5F1"}}>🤖 Cover Options</button>
            <button onClick={()=>setShowReport(!showReport)} style={btnP}>{showReport?"Cancel":"📋 Report Absence"}</button>
          </div>
        </div>
        <div style={{display:"flex",gap:6,fontSize:11,color:"#5C4E6A",flexWrap:"wrap"}}>
          <div style={{padding:"6px 10px",borderRadius:8,background:"rgba(139,109,175,0.08)",border:"1px solid rgba(139,109,175,0.15)"}}>📞 <strong>Absence Hotline:</strong> 1300 SICK COVER (configurable in Settings)</div>
          <div style={{padding:"6px 10px",borderRadius:8,background:"rgba(46,139,87,0.06)",border:"1px solid rgba(46,139,87,0.15)"}}>🤖 AI answers · records details · sick cert reminders per AU regulations</div>
        </div>
      </div>

      {/* Smart Cover Options Panel */}
      {showOptimise&&(
        <div style={{...card,background:"linear-gradient(135deg,#F8F5FF,#F0F8F0)",padding:14,marginBottom:8}}>
          <h4 style={{margin:"0 0 10px",fontSize:13,fontWeight:800}}>🤖 Smart Cover Options</h4>
          <p style={{margin:"0 0 12px",fontSize:11,color:"#5C4E6A"}}>Select the absent educator and date — the AI will analyse your current roster and suggest the optimal cover strategies ranked by cost.</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"end"}}>
            <div><label style={lbl}>Date</label><DatePicker value={optForm.date||""} onChange={v=>setOptForm({...optForm,date:v})} /></div>
            <div><label style={lbl}>Absent Educator</label>
              <select style={{...sel,width:200}} value={optForm.absent_educator_id} onChange={e=>setOptForm({...optForm,absent_educator_id:e.target.value})}>
                <option value="">Select educator…</option>
                {(educators||[]).filter(e=>e.status==="active").map(e=><option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
            <button onClick={runOptimise} disabled={optLoading} style={{...btnP,opacity:optLoading?0.6:1}}>{optLoading?"⏳ Analysing…":"🔍 Find Cover Options"}</button>
          </div>
          {optResult&&(
            <div style={{marginTop:14}}>
              {optResult.shift_window&&<div style={{fontSize:11,color:"#5C4E6A",marginBottom:10}}>Absent shift: <strong>{optResult.shift_window}</strong></div>}
              {(optResult.options||[]).length===0?<div style={{fontSize:11,color:"#C06B73",fontWeight:700}}>⚠ No cover options found. Consider calling in a casual or agency staff.</div>:
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {(optResult.options||[]).map((opt,i)=>(
                  <div key={i} style={{padding:"12px 16px",borderRadius:12,background:"#fff",border:"1px solid "+(i===0?"#D4E8D4":"#E8E0D8"),boxShadow:i===0?"0 2px 8px rgba(46,139,87,0.1)":undefined}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                      <div style={{flex:1}}>
                        {i===0&&<div style={{fontSize:9,fontWeight:800,color:"#2E8B57",textTransform:"uppercase",marginBottom:4}}>⭐ RECOMMENDED</div>}
                        <div style={{fontWeight:700,fontSize:12,color:"#3D3248"}}>{opt.type==="extend_single"?"🔄 Extend Single Educator":opt.type==="split_extension"?"👥 Split Coverage":opt.type==="casual_callout"?"📱 Call In Casual":"Option"}</div>
                        <div style={{fontSize:11,color:"#5C4E6A",marginTop:4}}>{opt.description}</div>
                        <div style={{display:"flex",gap:12,marginTop:6,fontSize:10,color:"#8A7F96"}}>
                          <span>💰 Extra cost: <strong style={{color:opt.extra_cost_cents===0?"#2E8B57":"#3D3248"}}>{opt.extra_cost_cents===0?"None":"$"+((opt.extra_cost_cents||0)/100).toFixed(2)}</strong></span>
                          <span>🛡️ Compliance: <strong style={{color:opt.compliance_ok?"#2E8B57":"#C06B73"}}>{opt.compliance_ok?"✓ Maintained":"⚠ Check"}</strong></span>
                          <span>📊 Confidence: <strong style={{color:opt.confidence==="high"?"#2E8B57":opt.confidence==="medium"?"#D4A26A":"#C06B73"}}>{opt.confidence||"medium"}</strong></span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>}
            </div>
          )}
        </div>
      )}

      {showReport&&<div style={card}>
        <h4 style={{margin:"0 0 10px",fontSize:13,fontWeight:700}}>Report Absence (Manual)</h4>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"end"}}>
          <div><label style={lbl}>Educator</label><select style={sel} value={form.educator_id} onChange={e=>setForm({...form,educator_id:e.target.value})}><option value="">Select…</option>{(educators||[]).filter(e=>e.status==="active").map(e=><option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}</select></div>
          <div><label style={lbl}>Date</label><DatePicker value={form.date||""} onChange={v=>setForm({...form,date:v})} /></div>
          <div><label style={lbl}>Start</label><input type="time" style={inp} value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})}/></div>
          <div><label style={lbl}>End</label><input type="time" style={inp} value={form.end_time} onChange={e=>setForm({...form,end_time:e.target.value})}/></div>
          <div><label style={lbl}>Reason</label><input style={inp} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} placeholder="Gastro, flu…"/></div>
          <div><label style={lbl}>Strategy</label><select style={sel} value={form.strategy} onChange={e=>setForm({...form,strategy:e.target.value})}><option value="sequential">Sequential</option><option value="simultaneous">Simultaneous</option></select></div>
          <button onClick={submitAbsence} disabled={submitting} style={{...btnP,opacity:submitting?0.6:1}}>{submitting?"⏳…":"📱 Report & Find Cover"}</button>
        </div>
      </div>}

      <div style={{display:"grid",gridTemplateColumns:selectedFill?"1fr 1fr":"1fr",gap:12}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:"#5C4E6A",marginBottom:6}}>FILL REQUESTS</div>
          {(!fills||fills.length===0)&&<div style={{...card,padding:24,textAlign:"center",color:"#A89DB5"}}><div style={{fontSize:24,marginBottom:8}}>📋</div><div style={{fontWeight:600,fontSize:13}}>No sick cover requests yet</div><div style={{fontSize:11,marginTop:4}}>Use "Report Absence" to create a fill request, or educators can call the absence hotline.</div></div>}
          {(fills||[]).map(f=>(
            <div key={f.id} onClick={()=>viewAttempts(f.id)} style={{...card,padding:10,marginBottom:4,cursor:"pointer",borderLeft:"3px solid "+(f.status==="filled"?"#2E8B57":f.status==="open"?"#D4A26A":"#C06B73"),...(selectedFill?.id===f.id?{boxShadow:"0 0 0 2px rgba(139,109,175,0.3)"}:{})}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><div><span style={{fontSize:12,fontWeight:700}}>{f.original_educator_name}</span> <span style={{fontSize:10,color:"#A89DB5"}}>{f.date} · {f.start_time}–{f.end_time}</span></div><Badge text={f.status} color={f.status==="filled"?"#2E8B57":f.status==="open"?"#D4A26A":"#C06B73"}/></div>
              <div style={{fontSize:10,color:"#5C4E6A",marginTop:2}}>{f.room_name} · {f.strategy} {f.filled_by_name&&<span style={{color:"#2E8B57"}}>→ {f.filled_by_name}</span>}</div>
            </div>
          ))}
        </div>
        {selectedFill&&<div>
          <div style={card}>
            <h4 style={{margin:"0 0 10px",fontSize:13,fontWeight:700}}>🗺️ Cover Journey</h4>
            <div style={{position:"relative",paddingLeft:24}}>
              {journey.map((step,i)=>(
                <div key={i} style={{position:"relative",paddingBottom:i<journey.length-1?12:0,paddingLeft:16}}>
                  {i<journey.length-1&&<div style={{position:"absolute",left:-14,top:18,width:2,height:"calc(100%)",background:step.st==="complete"?"#2E8B57":"#E8E0D8"}}/>}
                  <div style={{position:"absolute",left:-20,top:4,width:14,height:14,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,background:step.st==="complete"?"#2E8B57":step.st==="active"?"#D4A26A":"#E8E0D8",color:step.st!=="pending"?"#fff":"#A89DB5"}}>{step.st==="complete"?"✓":step.st==="active"?"●":"○"}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div><div style={{fontSize:11,fontWeight:700,color:step.st==="pending"?"#A89DB5":"#3D3248"}}>{step.icon} {step.title}</div><div style={{fontSize:9,color:"#8A7F96"}}>{step.detail}</div></div>
                    <span style={{fontSize:8,color:"#A89DB5",whiteSpace:"nowrap"}}>{step.t}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={card}>
            <h4 style={{margin:"0 0 8px",fontSize:13,fontWeight:700}}>📞 Call Transcript</h4>
            <div style={{maxHeight:180,overflowY:"auto",padding:"8px 10px",borderRadius:8,background:"#FDFBF9",border:"1px solid #E8E0D8"}}>
              {transcript.map((msg,i)=>(
                <div key={i} style={{marginBottom:8,display:"flex",gap:8,alignItems:"flex-start"}}>
                  <div style={{width:20,height:20,borderRadius:"50%",background:msg.who==="AI"?"#7E5BA3":"#2E8B57",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,flexShrink:0,fontWeight:700}}>{msg.who==="AI"?"AI":"Ed"}</div>
                  <div style={{flex:1}}><div style={{fontSize:8,color:"#A89DB5"}}>{msg.who} · {msg.t}</div><div style={{fontSize:11,color:"#3D3248",lineHeight:1.4}}>{msg.text}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div style={card}>
            <h4 style={{margin:"0 0 8px",fontSize:13,fontWeight:700}}>📱 Contact Attempts</h4>
            {attempts.length===0&&<div style={{fontSize:11,color:"#A89DB5"}}>No attempts logged.</div>}
            {attempts.map(a=>(
              <div key={a.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #F0EBE6",fontSize:11}}>
                <div><strong>{a.educator_name}</strong> <span style={{color:"#A89DB5"}}>{a.contact_method} · {a.phone}</span></div>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  <Badge text={a.status} color={a.status==="accepted"?"#2E8B57":a.status==="declined"?"#C06B73":"#D4A26A"}/>
                  {a.status==="queued"&&selectedFill.status==="open"&&<button onClick={()=>accept(selectedFill.id,a.educator_id)} style={{...btnP,padding:"3px 10px",fontSize:10}}>Accept</button>}
                </div>
              </div>
            ))}
          </div>
        </div>}
      </div>
    </div>
  );
}

/* ═══ PROPOSALS ═══ */
function ProposalsTab({ proposals, reload }) {
  const resolve=async(id,opt)=>{try{await API("/api/rostering/change-proposals/"+id+"/resolve",{method:"POST",body:{selected_option:opt}});reload();}catch(e){window.showToast("Resolve failed.", 'error');}};
  return (
    <div>
      {proposals.length===0&&<div style={{...card,padding:30,textAlign:"center",color:"#A89DB5"}}><div style={{fontSize:36,marginBottom:8}}>🔔</div><p>No change proposals.</p></div>}
      {proposals.map(p=>{
        const opts = Array.isArray(p.options) ? p.options : (() => { try { return JSON.parse(p.options||'[]'); } catch(e) { return []; } })();
        return (
          <div key={p.id} style={{...card,borderLeft:"3px solid "+(p.status==="pending"?"#D4A26A":"#2E8B57")}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <div><Badge text={p.trigger_type||"change"} color="#7E5BA3"/><span style={{fontSize:12,fontWeight:700,marginLeft:8}}>{p.description}</span></div>
              <Badge text={p.status} color={p.status==="pending"?"#D4A26A":"#2E8B57"}/>
            </div>
            {p.status==="pending"&&opts.length>0&&<div style={{display:"flex",gap:6,marginTop:6}}>{opts.map((o,i)=><button key={i} onClick={()=>resolve(p.id,i)} style={btnS}>{typeof o==="string"?o:o.label||"Option "+(i+1)}</button>)}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* ═══ PATTERNS TAB ═══ */
function PatternsTab() {
  const [data, setData] = useState(null);
  const [weeks, setWeeks] = useState(8);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
      const r = await fetch(`/api/rostering/attendance-patterns?weeks=${weeks}`, { headers: { Authorization: `Bearer ${t}`, "x-tenant-id": tid } });
      setData(await r.json());
    } catch(e) {}
    setLoading(false);
  };
  useEffect(() => { load(); }, [weeks]);
  const dayColor = (pct) => pct > 40 ? "#B71C1C" : pct > 20 ? "#E65100" : "#2E7D32";
  return (
    <div>
      <div style={{ ...card, background: "linear-gradient(135deg,#EDE4F0,#E8F0ED)", padding: "12px 20px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><h3 style={{ margin: 0, fontWeight: 800, color: "#3D3248" }}>📈 Attendance Pattern Analysis</h3><p style={{ margin: "2px 0 0", fontSize: 11, color: "#5C4E6A" }}>AI insights from attendance data · Identifies roster optimisation opportunities</p></div>
          <select value={weeks} onChange={e => setWeeks(parseInt(e.target.value))} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid #D9D0C7", fontSize: 12, background: "#fff" }}>
            {[4,8,12,24,52].map(w => <option key={w} value={w}>{w} weeks</option>)}
          </select>
        </div>
      </div>
      {loading && <div style={{ ...card, textAlign: "center", padding: 40, color: "#8A7F96" }}>Analysing {weeks} weeks of data…</div>}
      {!loading && data && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 14 }}>
            {[{l:"Sessions Analysed",v:data.total_sessions||0,i:"📊"},{l:"Weeks Analysed",v:data.weeks_analysed||weeks,i:"📅"},{l:"Recommendations",v:(data.recommendations||[]).length,i:"💡"}].map(s=>(
              <div key={s.l} style={{...card,textAlign:"center",padding:16,marginBottom:0}}><div style={{fontSize:24}}>{s.i}</div><div style={{fontSize:28,fontWeight:900,color:"#7E5BA3",marginTop:4}}>{s.v}</div><div style={{fontSize:11,color:"#8A7F96",marginTop:2}}>{s.l}</div></div>
            ))}
          </div>
          {(data.patterns||[]).length > 0 && (
            <div style={{...card,marginBottom:14}}>
              <h3 style={{margin:"0 0 14px",fontSize:13,fontWeight:700}}>Arrival & Departure Patterns by Day</h3>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead><tr style={{background:"rgba(139,109,175,0.06)"}}>
                    {["Day","Avg Arrival","Avg Departure","Sessions","Early <7:30","Late >4:30"].map(h=>(
                      <th key={h} style={{padding:"8px 12px",textAlign:"left",color:"#7E5BA3",fontWeight:700,fontSize:11}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{data.patterns.map(p=>(
                    <tr key={p.day} style={{borderBottom:"1px solid #F0EBF8"}}>
                      <td style={{padding:"10px 12px",fontWeight:700,color:"#3D3248"}}>{p.day}</td>
                      <td style={{padding:"10px 12px",fontFamily:"monospace"}}>{p.avg_arrival}</td>
                      <td style={{padding:"10px 12px",fontFamily:"monospace"}}>{p.avg_departure||"—"}</td>
                      <td style={{padding:"10px 12px",color:"#8A7F96"}}>{p.session_count}</td>
                      <td style={{padding:"10px 12px"}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:`${Math.min(p.early_arrivals_pct,100)}%`,maxWidth:80,height:6,borderRadius:3,background:dayColor(p.early_arrivals_pct),minWidth:2}}/><span style={{fontSize:12,color:dayColor(p.early_arrivals_pct),fontWeight:700}}>{p.early_arrivals_pct}%</span></div></td>
                      <td style={{padding:"10px 12px"}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:`${Math.min(p.late_departures_pct,100)}%`,maxWidth:80,height:6,borderRadius:3,background:dayColor(p.late_departures_pct),minWidth:2}}/><span style={{fontSize:12,color:dayColor(p.late_departures_pct),fontWeight:700}}>{p.late_departures_pct}%</span></div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
          {(data.recommendations||[]).length > 0 && (
            <div style={card}>
              <h3 style={{margin:"0 0 14px",fontSize:13,fontWeight:700}}>💡 Roster Recommendations</h3>
              {data.recommendations.map((rec,i)=>(
                <div key={i} style={{padding:"12px 16px",borderRadius:10,background:rec.priority==="medium"?"#FFF3E0":"#F8F5F1",border:`1px solid ${rec.priority==="medium"?"#FFCC80":"#EDE8F4"}`,marginBottom:8}}>
                  <div style={{fontWeight:700,color:"#3D3248",fontSize:13}}>{rec.priority==="medium"?"⚠️":"💡"} {rec.day} — {rec.type?.replace("_"," ")}</div>
                  <div style={{fontSize:12,color:"#555",marginTop:4}}>{rec.message}</div>
                </div>
              ))}
            </div>
          )}
          {(data.patterns||[]).length===0&&<div style={{...card,textAlign:"center",color:"#8A7F96",padding:48}}><div style={{fontSize:36,marginBottom:12}}>📊</div><div style={{fontWeight:700}}>Not enough data yet</div><div style={{fontSize:13,marginTop:6}}>Attendance data will appear once children are being checked in</div></div>}
        </div>
      )}
    </div>
  );
}

/* ═══ ROSTER REPORTS & EMAIL ═══ */
function RosterReportsTab({ educators, periods }) {
  const [selPeriod, setSelPeriod] = useState(periods[0]?.id || "");
  const [periodData, setPeriodData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [emailState, setEmailState] = useState({ mode: "none", sending: false, sent: false });
  const [emailTarget, setEmailTarget] = useState("all"); // "all" | "room" | "selected"
  const [selRoom, setSelRoom] = useState("");
  const [selEdIds, setSelEdIds] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [printMode, setPrintMode] = useState("week"); // "week" | "room" | "educator"
  const [selEdForPrint, setSelEdForPrint] = useState("");
  const [selRoomForPrint, setSelRoomForPrint] = useState("");

  useEffect(() => {
    API("/api/rooms").then(r => { if (Array.isArray(r)) setRooms(r); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selPeriod) return;
    setLoading(true);
    API("/api/rostering/periods/" + selPeriod)
      .then(d => setPeriodData(d || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selPeriod]);

  const entries = periodData?.entries || [];
  const period = periodData?.period;
  const allDates = [...new Set(entries.map(e => e.date))].sort();
  const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  // Build educator map for print
  const edMap = {};
  educators.forEach(e => { edMap[e.id] = e; });

  const fmtTime = t => t ? t.slice(0,5) : "";
  const fmtDateShort = d => { const dt = new Date(d + "T12:00"); return dt.toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"}); };

  const sendRosterEmail = async () => {
    setEmailState(p => ({ ...p, sending: true }));
    try {
      let recipientIds = [];
      if (emailTarget === "all") {
        recipientIds = [...new Set(entries.map(e => e.educator_id))];
      } else if (emailTarget === "room") {
        recipientIds = [...new Set(entries.filter(e => e.room_id === selRoom).map(e => e.educator_id))];
      } else if (emailTarget === "selected") {
        recipientIds = selEdIds;
      }
      if (!recipientIds.length) { toast("No recipients selected", "error"); setEmailState(p=>({...p,sending:false})); return; }
      
      await API("/api/rostering/email-roster", {
        method: "POST",
        body: { period_id: selPeriod, educator_ids: recipientIds }
      });
      setEmailState({ mode: "none", sending: false, sent: true });
      toast(`Roster emailed to ${recipientIds.length} educator${recipientIds.length>1?"s":""} ✓`);
      setTimeout(() => setEmailState(p => ({...p, sent: false})), 4000);
    } catch(e) {
      toast("Failed to send roster emails", "error");
      setEmailState(p => ({ ...p, sending: false }));
    }
  };

  // Print function
  const printRoster = () => {
    const printContent = document.getElementById("roster-print-content");
    if (!printContent) return;
    const w = window.open("", "_blank");
    w.document.write(`<!DOCTYPE html><html><head><title>Roster — ${period?.name||""}</title>
      <style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px}
      table{width:100%;border-collapse:collapse;margin-bottom:20px}
      th{background:#7C3AED;color:#fff;padding:6px 10px;text-align:left;font-size:11px}
      td{padding:6px 10px;border-bottom:1px solid #eee;font-size:11px}
      h2{color:#3D3248;margin:0 0 4px}h3{color:#5C4E6A;margin:10px 0 6px}
      .badge{display:inline-block;padding:1px 7px;border-radius:10px;font-size:9px;font-weight:700}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #7C3AED}
      @media print{button{display:none}}</style>
    </head><body>`);
    w.document.write(printContent.innerHTML);
    w.document.write("</body></html>");
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 500);
  };

  const entriesForPrint = () => {
    if (printMode === "educator" && selEdForPrint) return entries.filter(e => e.educator_id === selEdForPrint);
    if (printMode === "room" && selRoomForPrint) return entries.filter(e => e.room_id === selRoomForPrint);
    return entries;
  };

  const groupedByDate = {};
  entriesForPrint().forEach(e => {
    if (!groupedByDate[e.date]) groupedByDate[e.date] = [];
    groupedByDate[e.date].push(e);
  });

  return (
    <div>
      {/* Period selector + controls */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize:11, fontWeight:700, color:"#8A7F96", display:"block", marginBottom:4, textTransform:"uppercase" }}>Roster Period</label>
            <select style={{ ...sel, fontSize:13 }} value={selPeriod} onChange={e=>setSelPeriod(e.target.value)}>
              <option value="">Select period…</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.name} ({p.status})</option>)}
            </select>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-end" }}>
            <button onClick={printRoster} style={{ ...btnS, padding:"9px 18px" }}>🖨 Print Roster</button>
            <button onClick={() => setEmailState(p=>({...p,mode:p.mode==="none"?"email":"none"}))}
              style={{ ...btnP, padding:"9px 18px", background: emailState.sent ? "#2E7D32" : undefined }}>
              {emailState.sent ? "✓ Sent!" : "📧 Email Roster"}
            </button>
          </div>
        </div>

        {/* Email panel */}
        {emailState.mode === "email" && (
          <div style={{ marginTop:16, padding:"14px 18px", background:"#F0EBF8", borderRadius:10, border:"1px solid #DDD6EE" }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:12 }}>📧 Email Roster to Educators</div>
            <div style={{ display:"flex", gap:10, marginBottom:12, flexWrap:"wrap" }}>
              {[["all","👥 All Educators"],["room","🏠 By Room"],["selected","☑️ Select Educators"]].map(([v,l])=>(
                <button key={v} onClick={()=>setEmailTarget(v)}
                  style={{ padding:"7px 14px", border:"2px solid "+(emailTarget===v?"#7C3AED":"#DDD"), background:emailTarget===v?"#7C3AED":"#fff", color:emailTarget===v?"#fff":"#555", borderRadius:8, cursor:"pointer", fontWeight:600, fontSize:12 }}>{l}</button>
              ))}
            </div>
            {emailTarget === "room" && (
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:700, color:"#8A7F96", display:"block", marginBottom:4 }}>Select Room</label>
                <select style={sel} value={selRoom} onChange={e=>setSelRoom(e.target.value)}>
                  <option value="">All rooms</option>
                  {rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}
            {emailTarget === "selected" && (
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:700, color:"#8A7F96", display:"block", marginBottom:6 }}>Select Educators</label>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {[...new Set(entries.map(e=>e.educator_id))].map(eid => {
                    const ed = educators.find(e=>e.id===eid);
                    if (!ed) return null;
                    const sel2 = selEdIds.includes(eid);
                    return (
                      <label key={eid} onClick={()=>setSelEdIds(p=>sel2?p.filter(x=>x!==eid):[...p,eid])}
                        style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 12px", borderRadius:20, border:"1px solid "+(sel2?"#7C3AED":"#DDD"), background:sel2?"#7C3AED":"#fff", color:sel2?"#fff":"#555", cursor:"pointer", fontSize:12, fontWeight:sel2?700:400 }}>
                        {ed.first_name} {ed.last_name}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <button onClick={sendRosterEmail} disabled={emailState.sending}
                style={{ ...btnP, opacity: emailState.sending?0.6:1 }}>
                {emailState.sending ? "Sending…" : "Send Rosters"}
              </button>
              <span style={{ fontSize:11, color:"#8A7F96" }}>
                Each educator receives only their own shifts
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Print view options */}
      {period && !loading && (
        <div style={{ ...card, marginBottom:16 }}>
          <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
            <span style={{ fontSize:12, fontWeight:700, color:"#5C4E6A" }}>Print by:</span>
            {[["week","Full Week"],["room","By Room"],["educator","By Educator"]].map(([v,l])=>(
              <button key={v} onClick={()=>setPrintMode(v)}
                style={{ padding:"6px 14px", borderRadius:8, border:"none", cursor:"pointer", fontSize:12, fontWeight:printMode===v?700:500, background:printMode===v?"#7C3AED":"#E8E0D8", color:printMode===v?"#fff":"#555" }}>{l}</button>
            ))}
            {printMode==="educator" && (
              <select style={{ ...sel, width:200 }} value={selEdForPrint} onChange={e=>setSelEdForPrint(e.target.value)}>
                <option value="">All educators</option>
                {educators.map(e=><option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            )}
            {printMode==="room" && (
              <select style={{ ...sel, width:200 }} value={selRoomForPrint} onChange={e=>setSelRoomForPrint(e.target.value)}>
                <option value="">All rooms</option>
                {rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
          </div>
        </div>
      )}

      {/* Roster preview / printable */}
      {loading ? (
        <div style={{ textAlign:"center", padding:60, color:"#8A7F96" }}>Loading roster…</div>
      ) : !period ? (
        <div style={{ ...card, textAlign:"center", padding:48, color:"#8A7F96" }}>Select a roster period above</div>
      ) : (
        <div id="roster-print-content">
          <div className="header" style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, paddingBottom:10, borderBottom:"2px solid #7C3AED" }}>
            <div>
              <div style={{ fontWeight:800, fontSize:20, color:"#3D3248" }}>Childcare360 — Roster</div>
              <div style={{ fontSize:13, color:"#5C4E6A", marginTop:2 }}>{period.name} · {allDates[0] && fmtDateShort(allDates[0])} – {allDates[allDates.length-1] && fmtDateShort(allDates[allDates.length-1])}</div>
              {(printMode==="educator" && selEdForPrint) && <div style={{ fontSize:12, color:"#7C3AED", marginTop:2, fontWeight:700 }}>Educator: {educators.find(e=>e.id===selEdForPrint)?.first_name} {educators.find(e=>e.id===selEdForPrint)?.last_name}</div>}
              {(printMode==="room" && selRoomForPrint) && <div style={{ fontSize:12, color:"#7C3AED", marginTop:2, fontWeight:700 }}>Room: {rooms.find(r=>r.id===selRoomForPrint)?.name}</div>}
            </div>
            <div style={{ fontSize:11, color:"#8A7F96", textAlign:"right" }}>
              <div>Generated: {new Date().toLocaleDateString("en-AU")}</div>
              <div>Status: {period.status?.toUpperCase()}</div>
            </div>
          </div>

          {Object.entries(groupedByDate).sort(([a],[b])=>a.localeCompare(b)).map(([date, dayEntries]) => (
            <div key={date} style={{ marginBottom:20 }}>
              <div style={{ fontWeight:700, fontSize:13, color:"#3D3248", padding:"6px 12px", background:"#EDE8F4", borderRadius:8, marginBottom:8 }}>
                📅 {fmtDateShort(date)} — {dayEntries.length} shift{dayEntries.length!==1?"s":""}
              </div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr>
                    {["Educator","Qualification","Room","Start","End","Hours","Break","Note"].map(h=>(
                      <th key={h} style={{ background:"#7C3AED",color:"#fff",padding:"6px 10px",textAlign:"left",fontSize:11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dayEntries.sort((a,b)=>(a.start_time||"").localeCompare(b.start_time||"")).map(e => {
                    const sM = (h=>h[0]*60+h[1])(fmtTime(e.start_time).split(":").map(Number));
                    const eM = (h=>h[0]*60+h[1])(fmtTime(e.end_time).split(":").map(Number));
                    const hrs = ((eM-sM-(e.break_mins||30))/60).toFixed(1);
                    return (
                      <tr key={e.id} style={{ borderBottom:"1px solid #eee" }}>
                        <td style={{ padding:"6px 10px",fontWeight:600 }}>{e.educator_name}</td>
                        <td style={{ padding:"6px 10px" }}>{({ect:"ECT",diploma:"Diploma",cert3:"Cert III",working_towards:"Working Towards"})[e.qualification]||e.qualification}</td>
                        <td style={{ padding:"6px 10px" }}>{e.room_name||"—"}</td>
                        <td style={{ padding:"6px 10px",fontFamily:"monospace" }}>{fmtTime(e.start_time)}</td>
                        <td style={{ padding:"6px 10px",fontFamily:"monospace" }}>{fmtTime(e.end_time)}</td>
                        <td style={{ padding:"6px 10px",fontWeight:700 }}>{hrs}h</td>
                        <td style={{ padding:"6px 10px" }}>{e.break_mins||30}m</td>
                        <td style={{ padding:"6px 10px",fontSize:10,color:"#8A7F96" }}>{e.is_lunch_cover?"🍽 Lunch cover":""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

          {entriesForPrint().length === 0 && (
            <div style={{ textAlign:"center", padding:40, color:"#8A7F96" }}>No shifts for selected filters</div>
          )}
        </div>
      )}
    </div>
  );
}



/* ═══ LEAVE APPROVALS ═══════════════════════════════════════════════════════ */

function LeaveApprovalsTab({ reload }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [processing, setProcessing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await API("/api/educators/all-leave");
      if (Array.isArray(r)) setRequests(r);
    } catch(e) {}
    setLoading(false);
  };

  useEffect(()=>{ load(); },[]);

  const decide = async (id, status) => {
    setProcessing(id);
    try {
      await API(`/api/educators/leave/${id}/decide`, { method:"PUT", body:{ status } });
      if(window.showToast) window.showToast(`Leave ${status} ✓`);
      load(); reload();
    } catch(e) {
      if(window.showToast) window.showToast("Failed: "+e.message, "error");
    }
    setProcessing(null);
  };

  const filtered = requests.filter(r => filter==="all" || r.status===filter);

  const STATUS_COLORS = {
    pending:  { bg:"#FFF3E0", color:"#E65100", label:"Pending" },
    approved: { bg:"#E8F5E9", color:"#2E7D32", label:"Approved" },
    rejected: { bg:"#FFEBEE", color:"#C62828", label:"Rejected" },
  };

  const fmtDate = d => d ? new Date(d+"T12:00:00").toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}) : "—";

  return (
    <div style={{padding:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <div style={{fontSize:18,fontWeight:800,color:"#3D3248"}}>Leave Requests</div>
          <div style={{fontSize:12,color:"#8A7F96",marginTop:2}}>
            {requests.filter(r=>r.status==="pending").length} pending · {requests.length} total
          </div>
        </div>
        <div style={{display:"flex",gap:6}}>
          {["pending","approved","rejected","all"].map(f=>(
            <button key={f} onClick={()=>setFilter(f)}
              style={{padding:"6px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:filter===f?700:500,
                background:filter===f?"#8B6DAF":"#EDE8F4",color:filter===f?"#fff":"#6B5F7A"}}>
              {f[0].toUpperCase()+f.slice(1)}{f==="pending"&&requests.filter(r=>r.status==="pending").length>0?` (${requests.filter(r=>r.status==="pending").length})`:""}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={{padding:40,textAlign:"center",color:"#A89DB5"}}>Loading…</div>}

      {!loading && filtered.length===0 && (
        <div style={{padding:40,textAlign:"center",color:"#A89DB5"}}>
          {filter==="pending" ? "✅ No pending leave requests" : `No ${filter} requests`}
        </div>
      )}

      {!loading && filtered.map(req=>{
        const sc = STATUS_COLORS[req.status] || STATUS_COLORS.pending;
        const days = req.start_date && req.end_date
          ? Math.max(1, Math.round((new Date(req.end_date)-new Date(req.start_date))/(1000*60*60*24))+1)
          : req.days_requested || 1;
        return (
          <div key={req.id} style={{background:"#fff",borderRadius:12,border:"1px solid #EDE8F4",padding:"14px 18px",marginBottom:10,
            boxShadow:"0 2px 6px rgba(139,109,175,0.04)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <div style={{width:34,height:34,borderRadius:"50%",background:"#EDE8F4",display:"flex",alignItems:"center",
                    justifyContent:"center",fontWeight:800,fontSize:13,color:"#7C3AED",flexShrink:0}}>
                    {req.educator_name?.[0]||"?"}
                  </div>
                  <div>
                    <div style={{fontWeight:700,color:"#3D3248",fontSize:14}}>{req.educator_name||"Unknown Educator"}</div>
                    <div style={{fontSize:11,color:"#8A7F96"}}>{req.leave_type?.replace(/_/g," ").replace(/\w/g,c=>c.toUpperCase())||"Leave"}</div>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,background:sc.bg,color:sc.color,marginLeft:4}}>
                    {sc.label}
                  </span>
                </div>
                <div style={{display:"flex",gap:16,fontSize:12,color:"#5C4E6A",flexWrap:"wrap"}}>
                  <span>📅 {fmtDate(req.start_date)} → {fmtDate(req.end_date)}</span>
                  <span>⏱ {days} day{days!==1?"s":""}</span>
                  {req.reason&&<span>💬 {req.reason}</span>}
                </div>
                {req.notes&&<div style={{marginTop:6,fontSize:11,color:"#8A7F96",fontStyle:"italic"}}>Note: {req.notes}</div>}
              </div>
              {req.status==="pending"&&(
                <div style={{display:"flex",gap:8,flexShrink:0,marginLeft:12}}>
                  <button
                    onClick={()=>decide(req.id,"approved")}
                    disabled={processing===req.id}
                    style={{padding:"7px 16px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,
                      background:"#E8F5E9",color:"#1B5E20",opacity:processing===req.id?0.6:1}}>
                    ✓ Approve
                  </button>
                  <button
                    onClick={()=>decide(req.id,"rejected")}
                    disabled={processing===req.id}
                    style={{padding:"7px 16px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,
                      background:"#FFEBEE",color:"#B71C1C",opacity:processing===req.id?0.6:1}}>
                    ✗ Reject
                  </button>
                </div>
              )}
              {req.status!=="pending"&&(
                <div style={{fontSize:11,color:"#8A7F96",marginLeft:12,textAlign:"right"}}>
                  {req.status==="approved"?"✓ Approved":"✗ Rejected"}
                  {req.approved_by&&<div>by {req.approved_by}</div>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}



// ═══ LEAVE MANAGEMENT ═══════════════════════════════════════════════════════
function LeaveManagementTab({ educators, reload }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [processingId, setProcessingId] = useState(null);

  const API = (path, opts={}) => {
    const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
    return fetch(path,{method:opts.method||"GET",headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})},
      ...(opts.body?{body:JSON.stringify(opts.body)}:{})}).then(r=>r.json());
  };

  const load = useCallback(async()=>{
    setLoading(true);
    try {
      const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
      const d = await fetch("/api/educators/all-leave",{headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})}}).then(r=>r.json());
      if(Array.isArray(d)) setRequests(d);
    } catch(e){}
    setLoading(false);
  },[]);

  useEffect(()=>{ load(); },[load]);

  const decide = async (req, status, notes="") => {
    setProcessingId(req.id);
    try {
      await API(`/api/educators/${req.educator_id}/leave/${req.id}`, {method:"PUT", body:{status, notes}});
      if(window.showToast) window.showToast(`Leave ${status}`);
      await load();
    } catch(e) {
      if(window.showToast) window.showToast("Failed: "+e.message,"error");
    }
    setProcessingId(null);
  };

  const filtered = requests.filter(r => filter==="all" || r.status===filter);
  const counts = {pending:requests.filter(r=>r.status==="pending").length, approved:requests.filter(r=>r.status==="approved").length, denied:requests.filter(r=>r.status==="denied").length};

  const LeaveTypeBadge = ({type}) => {
    const colours = {annual:"#5B8DB5",sick:"#C06B73",personal:"#8B6DAF",maternity:"#6BA38B",unpaid:"#8A7F96"};
    const c = colours[type]||"#8A7F96";
    return <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,background:c+"20",color:c}}>{type?.replace("_"," ").toUpperCase()}</span>;
  };

  const StatusBadge = ({status}) => {
    const map = {pending:{c:"#E65100",bg:"#FFF3E0"},approved:{c:"#2E7D32",bg:"#E8F5E9"},denied:{c:"#C06B73",bg:"#FFEBEE"},cancelled:{c:"#8A7F96",bg:"#F5F5F5"}};
    const s = map[status]||map.pending;
    return <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,background:s.bg,color:s.c}}>{status?.toUpperCase()}</span>;
  };

  const card = {background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"16px 20px",marginBottom:10,boxShadow:"0 2px 8px rgba(139,109,175,0.04)"};

  return (
    <div style={{padding:"0 0 24px"}}>
      <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",gap:6}}>
          {[["pending","⏳ Pending"],["approved","✅ Approved"],["denied","❌ Denied"],["all","All"]].map(([id,label])=>(
            <button key={id} onClick={()=>setFilter(id)}
              style={{padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:filter===id?700:500,fontSize:12,
                background:filter===id?"#8B6DAF":"#EDE8F4",color:filter===id?"#fff":"#6B5F7A",position:"relative"}}>
              {label}
              {id!=="all"&&counts[id]>0&&<span style={{position:"absolute",top:-4,right:-4,background:"#C06B73",color:"#fff",borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800}}>{counts[id]}</span>}
            </button>
          ))}
        </div>
        <button onClick={load} style={{padding:"7px 14px",background:"#F0EBF8",color:"#8B6DAF",border:"1px solid #DDD6EE",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600}}>↻ Refresh</button>
      </div>

      {loading?<div style={{padding:40,textAlign:"center",color:"#A89DB5"}}>Loading leave requests…</div>
      :filtered.length===0?<div style={{padding:40,textAlign:"center",color:"#A89DB5"}}>{filter==="pending"?"No pending leave requests — all clear ✅":"No "+filter+" requests"}</div>
      :(
        <div>
          {filtered.map(req=>(
            <div key={req.id} style={{...card,borderLeft:`3px solid ${req.status==="pending"?"#E65100":req.status==="approved"?"#2E7D32":"#C06B73"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}>
                    <span style={{fontWeight:700,fontSize:14,color:"#3D3248"}}>{req.educator_name}</span>
                    <LeaveTypeBadge type={req.leave_type}/>
                    <StatusBadge status={req.status}/>
                  </div>
                  <div style={{fontSize:13,color:"#5C4E6A",marginBottom:4}}>
                    📅 {req.start_date} → {req.end_date}
                    <span style={{marginLeft:10,color:"#8A7F96"}}>{req.days_requested} day{req.days_requested!==1?"s":""}</span>
                  </div>
                  {req.reason&&<div style={{fontSize:12,color:"#8A7F96",marginTop:4}}>💬 {req.reason}</div>}
                  {req.notes&&<div style={{fontSize:12,color:"#5B8DB5",marginTop:4,fontStyle:"italic"}}>Admin note: {req.notes}</div>}
                  <div style={{fontSize:11,color:"#C0B8CC",marginTop:6}}>Submitted {new Date(req.created_at).toLocaleDateString("en-AU")}</div>
                </div>
                {req.status==="pending"&&(
                  <div style={{display:"flex",gap:8,flexShrink:0}}>
                    <button onClick={()=>decide(req,"approved")} disabled={processingId===req.id}
                      style={{padding:"8px 16px",background:"#E8F5E9",color:"#2E7D32",border:"1px solid #A5D6A7",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12}}>
                      ✅ Approve
                    </button>
                    <button onClick={async()=>{const n=await window.showPrompt("Reason for denial (optional):","");decide(req,"denied",n||"");}} disabled={processingId===req.id}
                      style={{padding:"8px 16px",background:"#FFEBEE",color:"#C06B73",border:"1px solid #EF9A9A",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12}}>
                      ❌ Deny
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function TimesheetTab({ educators, periods }) {
  const [selPeriodId, setSelPeriodId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (periods.length > 0 && !selPeriodId) setSelPeriodId(periods[0]?.id || "");
  }, [periods]);

  useEffect(() => {
    if (!selPeriodId) return;
    setLoading(true);
    API(`/api/rostering/timesheet?period_id=${selPeriodId}`).then(d => {
      setData(d); setLoading(false);
    }).catch(() => setLoading(false));
  }, [selPeriodId]);

  const exportCSV = () => {
    if (!data) return;
    const period = periods.find(p => p.id === selPeriodId);
    const dates = period ? [] : [];
    const rows = [["Educator","Qualification","Employment","Hours","Overtime","Cost","Status"]];
    (data.educators||[]).forEach(e => {
      rows.push([e.name, e.qualification, e.employment_type, e.total_hours.toFixed(2), e.overtime_hours.toFixed(2), (e.total_cost_cents/100).toFixed(2), e.status]);
    });
    rows.push(["TOTAL","","",data.totals?.total_hours?.toFixed(2)||"",data.totals?.overtime_hours?.toFixed(2)||"",(data.totals?.total_cost_cents/100||0).toFixed(2),""]);
    const csv = rows.map(r => r.join(",")).join('\n');
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "timesheet.csv"; a.click();
  };

  const statusColor = s => s==="capped"?"#C06B73":s==="near_cap"?"#E65100":"#2E8B57";
  const statusLabel = s => s==="capped"?"⚠ AT CAP":s==="near_cap"?"⏰ Near Cap":"✓ OK";

  return (
    <div>
      <div style={{...card,background:"linear-gradient(135deg,#EDE4F0,#F0E8E8)",padding:"12px 20px",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <h3 style={{margin:0,fontSize:14,fontWeight:800}}>🕐 Timesheet & Payroll Summary</h3>
            <p style={{margin:"2px 0 0",fontSize:11,color:"#5C4E6A"}}>Weekly hours · Overtime flags · Cost breakdown · CSV export for payroll</p>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <select style={{...sel,width:200}} value={selPeriodId} onChange={e=>setSelPeriodId(e.target.value)}>
              <option value="">Select period…</option>
              {periods.map(p=><option key={p.id} value={p.id}>{p.start_date} → {p.end_date} ({p.status})</option>)}
            </select>
            {data&&<button onClick={exportCSV} style={{...btnP,padding:"7px 14px",fontSize:11}}>⬇ Export CSV</button>}
          </div>
        </div>
      </div>

      {loading&&<div style={{...card,padding:40,textAlign:"center",color:"#8A7F96"}}>Loading timesheet…</div>}

      {!loading&&data&&!data.error&&(
        <div>
          {/* Totals */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
            {[
              {l:"Total Hours",v:(data.totals?.total_hours||0).toFixed(1),sfx:"h",i:"⏱",c:"#7E5BA3"},
              {l:"Total Cost",v:"$"+((data.totals?.total_cost_cents||0)/100).toLocaleString(),i:"💰",c:"#2E8B57"},
              {l:"Overtime Hours",v:(data.totals?.overtime_hours||0).toFixed(1),sfx:"h",i:"⚠️",c:(data.totals?.overtime_hours||0)>0?"#C06B73":"#2E8B57"},
              {l:"Staff on Roster",v:(data.educators||[]).length,i:"👩‍🏫",c:"#8B6DAF"},
            ].map(s=>(
              <div key={s.l} style={{...card,padding:"12px 16px",marginBottom:0,textAlign:"center"}}>
                <div style={{fontSize:20}}>{s.i}</div>
                <div style={{fontSize:22,fontWeight:900,color:s.c,marginTop:4}}>{s.v}{s.sfx||""}</div>
                <div style={{fontSize:10,color:"#8A7F96"}}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div style={{...card,padding:0,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"rgba(139,109,175,0.06)"}}>
                  {["Educator","Qualification","Type","Total Hours","Overtime","Cost","Status"].map(h=>(
                    <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,fontWeight:700,color:"#7E5BA3",textTransform:"uppercase",borderBottom:"1px solid #EDE8F4"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.educators||[]).map((e, i) => (
                  <tr key={e.id} style={{borderBottom:"1px solid #F5F0FB",background:i%2===0?"#FDFBF9":"#fff"}}>
                    <td style={{padding:"10px 14px",fontWeight:700,fontSize:12,color:"#3D3248"}}>{e.name}</td>
                    <td style={{padding:"10px 14px"}}><Badge text={Q[e.qualification]?.s||e.qualification||"?"} color={Q[e.qualification]?.c||"#999"}/></td>
                    <td style={{padding:"10px 14px",fontSize:11,color:"#5C4E6A"}}>{EMP[e.employment_type]||e.employment_type}</td>
                    <td style={{padding:"10px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:60,height:5,borderRadius:3,background:"#E8E0D8",overflow:"hidden"}}>
                          <div style={{height:"100%",width:Math.min(100,e.total_hours/38*100)+"%",background:e.status==="capped"?"#E53935":e.status==="near_cap"?"#FB8C00":"#6BA38B"}}/>
                        </div>
                        <strong style={{fontSize:12,color:statusColor(e.status)}}>{e.total_hours.toFixed(1)}h</strong>
                      </div>
                    </td>
                    <td style={{padding:"10px 14px",fontSize:12,fontWeight:700,color:e.overtime_hours>0?"#C06B73":"#2E8B57"}}>{e.overtime_hours>0?"+"+e.overtime_hours.toFixed(1)+"h":"—"}</td>
                    <td style={{padding:"10px 14px",fontSize:12,fontWeight:700,color:"#2E8B57"}}>${(e.total_cost_cents/100).toFixed(2)}</td>
                    <td style={{padding:"10px 14px"}}><Badge text={statusLabel(e.status)} color={statusColor(e.status)}/></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{background:"rgba(139,109,175,0.06)",fontWeight:700}}>
                  <td colSpan={3} style={{padding:"10px 14px",fontSize:12,fontWeight:700}}>TOTAL</td>
                  <td style={{padding:"10px 14px",fontSize:13,fontWeight:800,color:"#7E5BA3"}}>{(data.totals?.total_hours||0).toFixed(1)}h</td>
                  <td style={{padding:"10px 14px",fontSize:12,fontWeight:700,color:(data.totals?.overtime_hours||0)>0?"#C06B73":"#2E8B57"}}>{(data.totals?.overtime_hours||0)>0?"+"+data.totals.overtime_hours.toFixed(1)+"h":"—"}</td>
                  <td style={{padding:"10px 14px",fontSize:13,fontWeight:800,color:"#2E8B57"}}>${((data.totals?.total_cost_cents||0)/100).toFixed(2)}</td>
                  <td/>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Warnings */}
          {(data.educators||[]).filter(e=>e.status!=="ok").length>0&&(
            <div style={{...card,background:"#FFFDE7",border:"1px solid #FFE082",padding:"12px 16px"}}>
              <h4 style={{margin:"0 0 8px",fontSize:12,fontWeight:700,color:"#E65100"}}>⚠️ Hours Warnings</h4>
              {(data.educators||[]).filter(e=>e.status!=="ok").map(e=>(
                <div key={e.id} style={{fontSize:11,marginBottom:4,color:"#5D4037"}}>
                  <strong>{e.name}</strong> — {e.status==="capped"?"AT 38h cap":"approaching 38h cap"} ({e.total_hours.toFixed(1)}h / 38h)
                  {e.overtime_hours>0&&<span style={{color:"#C62828"}}> · {e.overtime_hours.toFixed(1)}h overtime</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {!loading&&(data?.error||(!data&&selPeriodId))&&<div style={{...card,padding:40,textAlign:"center",color:"#A89DB5"}}>No timesheet data for this period. Generate a roster first.</div>}
      {!loading&&!selPeriodId&&<div style={{...card,padding:60,textAlign:"center",color:"#A89DB5"}}><div style={{fontSize:40,marginBottom:12}}>🕐</div><p style={{margin:0,fontWeight:600}}>Select a roster period above to view the timesheet.</p><p style={{fontSize:12,marginTop:8}}>Generate a roster in the Roster tab first.</p></div>}
      {!selPeriodId&&<div style={{...card,padding:40,textAlign:"center",color:"#A89DB5"}}><div style={{fontSize:36,marginBottom:8}}>🕐</div><p>Generate a roster first, then select it here to see the timesheet.</p></div>}
    </div>
  );
}
