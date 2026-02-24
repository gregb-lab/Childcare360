import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}), ...opts.headers },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};
const nextMon = () => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().split("T")[0]; };
const addDays = (s, n) => { const d = new Date(s); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; };
const fmtDate = d => new Date(d + "T12:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const tM = t => { if (!t) return 0; const [h,m] = t.split(":").map(Number); return h*60+(m||0); };
const mT = m => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;

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
const NQF_RATIOS = { babies: { ratio: 4, ect_required: true }, toddlers: { ratio: 5, ect_required: false }, preschool: { ratio: 11, ect_required: true }, oshc: { ratio: 15, ect_required: false } };
const AGE_MAP = { "babies":"babies","0-2":"babies","toddlers":"toddlers","2-3":"toddlers","preschool":"preschool","3-4":"preschool","3-5":"preschool","4-5":"preschool","oshc":"oshc","school_age":"oshc" };
const ROOM_COLORS = ["#8B6DAF","#6BA38B","#C9929E","#D4A26A","#5B8DB5","#9B7DC0","#C06B73","#4A8A6E"];
const GANTT_START = 360, GANTT_END = 1140, GANTT_SPAN = GANTT_END - GANTT_START;
const pct = m => Math.max(0, Math.min(100, (m - GANTT_START) / GANTT_SPAN * 100));

export function RosteringModule() {
  const [tab, setTab] = useState("dashboard");
  const [data, setData] = useState({ stats: null, educators: [], periods: [], fills: [], config: null, proposals: [], templates: [] });
  const [selPeriod, setSelPeriod] = useState(null);
  const [selEd, setSelEd] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stats, eRes, pRes, frRes, acRes, cpRes, tRes] = await Promise.all([
        API("/api/rostering/stats"), API("/api/rostering/educators"), API("/api/rostering/periods"),
        API("/api/rostering/fill-requests"), API("/api/rostering/ai-config"), API("/api/rostering/change-proposals"),
        API("/api/rostering/templates"),
      ]);
      setData({ stats, educators: eRes.educators || [], periods: pRes.periods || [], fills: frRes.requests || [], config: acRes.configs?.[0] || null, proposals: cpRes.proposals || [], templates: tRes.templates || [] });
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadPeriod = async id => { const d = await API("/api/rostering/periods/" + id); setSelPeriod(d); };
  const loadEd = async id => { const d = await API("/api/rostering/educators/" + id); setSelEd(d); };

  const pendingCount = data.proposals.filter(p => p.status === "pending").length;
  const tabs = [
    { id: "dashboard", l: "Dashboard", i: "📊" }, { id: "educators", l: "Educators", i: "👩‍🏫" },
    { id: "roster", l: "Roster", i: "📅" }, { id: "timesheet", l: "Timesheet", i: "🕐" },
    { id: "sickcover", l: "Sick Cover", i: "📱" }, { id: "patterns", l: "Patterns", i: "📈" },
    { id: "proposals", l: "Changes", i: "🔔", b: pendingCount },
    { id: "settings", l: "Settings", i: "⚙️" },
  ];

  if (loading && !data.stats) return <div style={{ textAlign: "center", padding: 60 }}><div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div><p style={{ color: "#8A7F96", fontWeight: 600 }}>Loading AI Rostering…</p></div>;

  return (
    <div>
      <div style={{ ...card, background: "linear-gradient(135deg,#EDE4F0,#E8F0ED)", padding: "12px 20px" }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#3D3248" }}>🤖 AI Rostering & Workforce Intelligence</h2>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#5C4E6A" }}>AI roster generation · NQF compliance · Sick cover · Timesheet · Natural language assistant</p>
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ ...btnS, background: tab === t.id ? "rgba(139,109,175,0.10)" : "#F8F5F1", color: tab === t.id ? "#7E5BA3" : "#6B5F7A", fontWeight: tab === t.id ? 700 : 500, border: tab === t.id ? "1px solid rgba(139,109,175,0.25)" : "1px solid #D9D0C7", position: "relative" }}>
            {t.i} {t.l}{t.b > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "#C06B73", color: "#fff", fontSize: 8, fontWeight: 800, borderRadius: 8, padding: "1px 5px" }}>{t.b}</span>}
          </button>
        ))}
      </div>
      {tab === "dashboard" && <DashboardTab d={data} />}
      {tab === "educators" && <EducatorsTab educators={data.educators} loadEd={loadEd} selEd={selEd} setSelEd={setSelEd} reload={load} />}
      {tab === "roster" && <RosterTab educators={data.educators} periods={data.periods} templates={data.templates} sp={selPeriod} loadP={loadPeriod} reload={load} />}
      {tab === "timesheet" && <TimesheetTab educators={data.educators} periods={data.periods} />}
      {tab === "sickcover" && <SickCoverTab educators={data.educators} fills={data.fills} reload={load} />}
      {tab === "patterns" && <PatternsTab />}
      {tab === "proposals" && <ProposalsTab proposals={data.proposals} reload={load} />}
      {tab === "settings" && <SettingsTab config={data.config} reload={load} />}
    </div>
  );
}

/* ═══ DASHBOARD ═══ */
function DashboardTab({ d }) {
  const s = d.stats || {}, ed = s.educators || {};
  const costs = { calls: 12, callCost: 4.80, sms: 28, smsCost: 2.24, ai: 1.50, total: 8.54 };
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
      <div style={{ ...card, background: "linear-gradient(135deg,#F0EBE6,#EDE4F0)" }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700 }}>💰 AI Agent Costs — This Month</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {[{ t:"PHONE CALLS",n:costs.calls,$:costs.callCost,r:"$0.40/call" },{ t:"SMS MESSAGES",n:costs.sms,$:costs.smsCost,r:"$0.08/SMS" },{ t:"AI PROCESSING",n:"—",$:costs.ai,r:"$0.02/min" }].map(c => (
            <div key={c.t} style={{ padding: "8px 10px", borderRadius: 10, background: "#fff", border: "1px solid #E8E0D8", textAlign: "center" }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: "#8A7F96" }}>{c.t}</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{c.n}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#2E8B57" }}>${c.$.toFixed(2)}</div>
              <div style={{ fontSize: 8, color: "#A89DB5" }}>{c.r}</div>
            </div>
          ))}
          <div style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(139,109,175,0.08)", border: "1px solid rgba(139,109,175,0.2)", textAlign: "center" }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: "#7E5BA3" }}>TOTAL</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#7E5BA3" }}>${costs.total.toFixed(2)}</div>
            <div style={{ fontSize: 8, color: "#A89DB5" }}>this month</div>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={card}><h4 style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700 }}>Reliability Distribution</h4><ResponsiveContainer width="100%" height={140}><PieChart><Pie data={relData} dataKey="v" cx="50%" cy="50%" outerRadius={50} label={x=>x.name+": "+x.v} labelLine={false} style={{fontSize:9}}>{relData.map((x,i)=><Cell key={i} fill={x.fill}/>)}</Pie></PieChart></ResponsiveContainer></div>
        <div style={card}><h4 style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700 }}>Qualification Mix</h4><ResponsiveContainer width="100%" height={140}><BarChart data={qualData}><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar dataKey="v" radius={[4,4,0,0]}>{qualData.map((x,i)=><Cell key={i} fill={x.fill}/>)}</Bar></BarChart></ResponsiveContainer></div>
      </div>
      {d.fills.length > 0 && <div style={card}><h4 style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700 }}>Recent Sick Cover</h4>{d.fills.slice(0,5).map(f=>(<div key={f.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid #F0EBE6",fontSize:11}}><div><strong>{f.original_educator_name}</strong> <span style={{color:"#A89DB5"}}>{f.date} · {f.room_name}</span></div><div style={{display:"flex",gap:4}}><Badge text={f.status} color={f.status==="filled"?"#2E8B57":"#D4A26A"}/>{f.filled_by_name&&<span style={{color:"#2E8B57",fontSize:10}}>→ {f.filled_by_name}</span>}</div></div>))}</div>}
    </div>
  );
}

/* ═══ EDUCATORS ═══ */
function EducatorsTab({ educators, loadEd, selEd, setSelEd, reload }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("reliability");
  const [editing, setEditing] = useState(null);

  const list = educators.filter(e => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (e.first_name+" "+e.last_name).toLowerCase().includes(s)||(e.suburb||"").toLowerCase().includes(s)||(e.qualification||"").includes(s);
  }).sort((a,b) => {
    if (sort==="reliability") return (b.reliability_score||0)-(a.reliability_score||0);
    if (sort==="name") return (a.last_name||"").localeCompare(b.last_name||"");
    if (sort==="distance") return (a.distance_km||99)-(b.distance_km||99);
    if (sort==="cost") return (a.hourly_rate_cents||0)-(b.hourly_rate_cents||0);
    return 0;
  });

  if (editing!==null) return <EditorForm ed={editing==="new"?null:editing} onDone={()=>{setEditing(null);reload();}} />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: selEd?"1fr 380px":"1fr", gap: 14 }}>
      <div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <input placeholder="Search name, suburb, qualification…" value={q} onChange={e=>setQ(e.target.value)} style={{...inp,flex:1}} />
          <select value={sort} onChange={e=>setSort(e.target.value)} style={{...sel,width:130}}><option value="reliability">Reliability</option><option value="name">Name</option><option value="distance">Distance</option><option value="cost">Cost</option></select>
          <button onClick={()=>setEditing("new")} style={btnP}>+ Add</button>
        </div>
        {list.map(e => {
          const rc=(e.reliability_score||0)>=90?"#2E8B57":(e.reliability_score||0)>=75?"#D4A26A":"#C06B73";
          const qx=Q[e.qualification]||{l:"?",c:"#999",s:"?"};
          return (
            <div key={e.id} onClick={()=>loadEd(e.id)} style={{...card,padding:10,marginBottom:4,cursor:"pointer",borderLeft:"3px solid "+qx.c,...(selEd?.educator?.id===e.id?{boxShadow:"0 0 0 2px rgba(139,109,175,0.3)"}:{})}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"#3D3248"}}>{e.first_name} {e.last_name}</div>
                  <div style={{display:"flex",gap:3,marginTop:2,flexWrap:"wrap"}}><Badge text={qx.l} color={qx.c}/><Badge text={EMP[e.employment_type]||""} color="#8A7F96"/>{e.first_aid?<Badge text="FA ✓" color="#2E8B57"/>:null}{e.is_under_18?<Badge text="U18" color="#D4A26A"/>:null}</div>
                </div>
                <div style={{textAlign:"right"}}><div style={{fontSize:16,fontWeight:800,color:rc}}>{Math.round(e.reliability_score||0)}%</div><div style={{fontSize:8,color:"#A89DB5"}}>reliability</div></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:4,fontSize:9,color:"#5C4E6A",marginTop:4}}>
                <div>📍 {e.distance_km?e.distance_km+"km":"—"}</div><div>💰 ${((e.hourly_rate_cents||0)/100).toFixed(0)}/hr</div><div>📅 {e.max_hours_per_week||38}h max</div><div>🤒 {e.total_sick_days||0} sick</div>
              </div>
            </div>
          );
        })}
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
    if(!f.first_name||!f.last_name) return alert("Name is required");
    setSaving(true);
    const body={...f,first_aid:f.first_aid?1:0,is_under_18:f.is_under_18?1:0,is_lunch_cover:f.is_lunch_cover?1:0,availability:avail};
    if(isNew) await API("/api/rostering/educators",{method:"POST",body});
    else await API("/api/rostering/educators/"+ed.id,{method:"PUT",body});
    setSaving(false); onDone();
  };

  const F=({label,k,type,ph,opts,span})=>(
    <div style={{gridColumn:span?"span "+span:undefined}}>
      <label style={lbl}>{label}</label>
      {opts?<select style={sel} value={f[k]||""} onChange={e=>u(k,e.target.value)}>{opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        :type==="check"?<label style={{display:"flex",alignItems:"center",gap:5,fontSize:12,cursor:"pointer"}}><input type="checkbox" checked={!!f[k]} onChange={e=>u(k,e.target.checked)}/> {ph||"Yes"}</label>
        :type==="area"?<textarea style={{...inp,height:70,resize:"vertical"}} value={f[k]||""} onChange={e=>u(k,e.target.value)} placeholder={ph}/>
        :<input type={type||"text"} style={inp} value={f[k]||""} onChange={e=>u(k,type==="number"?parseFloat(e.target.value)||0:e.target.value)} placeholder={ph}/>}
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
        {section==="personal"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}><F label="First Name *" k="first_name" ph="Sarah"/><F label="Last Name *" k="last_name" ph="Mitchell"/><F label="Email" k="email" type="email" ph="sarah@centre.com.au"/><F label="Phone" k="phone" ph="0412 345 678"/><F label="Address" k="address" span={2} ph="12 Beach Rd"/><F label="Suburb" k="suburb" ph="Cronulla"/><F label="Postcode" k="postcode" ph="2230"/><F label="Distance (km)" k="distance_km" type="number"/><F label="Under 18?" k="is_under_18" type="check" ph="Under 18"/><F label="Start Date" k="start_date" type="date"/></div>}
        {section==="employment"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <F label="Qualification" k="qualification" opts={Object.entries(Q).map(([k,v])=>[k,v.l])}/>
          <F label="Employment Type" k="employment_type" opts={Object.entries(EMP).map(([k,v])=>[k,v])}/>
          <div><label style={lbl}>Hourly Rate ($)</label><input type="number" step="0.01" style={inp} value={((f.hourly_rate_cents||0)/100).toFixed(2)} onChange={e=>u("hourly_rate_cents",Math.round(parseFloat(e.target.value||0)*100))} placeholder="35.00"/></div>
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
                {a.available&&<><div style={{marginBottom:3}}><label style={{fontSize:8,color:"#8A7F96"}}>Start</label><input type="time" value={a.start_time} onChange={e=>setAvail(avail.map(x=>x.day===i?{...x,start_time:e.target.value}:x))} style={{...inp,padding:"3px 4px",fontSize:10,textAlign:"center"}}/></div><div><label style={{fontSize:8,color:"#8A7F96"}}>End</label><input type="time" value={a.end_time} onChange={e=>setAvail(avail.map(x=>x.day===i?{...x,end_time:e.target.value}:x))} style={{...inp,padding:"3px 4px",fontSize:10,textAlign:"center"}}/></div></>}
              </div>
            );})}
          </div>
        </div>}
        {section==="flexibility"&&<div>
          <p style={{margin:"0 0 14px",fontSize:11,color:"#5C4E6A"}}>Flexibility settings are used by the <strong>AI optimiser</strong> to adjust shifts when coverage gaps appear — e.g. can this person come in earlier or stay later?</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            <div><label style={lbl}>Can Start Earlier (mins)</label><input type="number" style={inp} value={f.can_start_earlier_mins||0} onChange={e=>u("can_start_earlier_mins",parseInt(e.target.value)||0)} placeholder="0"/><div style={{fontSize:9,color:"#A89DB5",marginTop:2}}>Max minutes before rostered start</div></div>
            <div><label style={lbl}>Can Finish Later (mins)</label><input type="number" style={inp} value={f.can_finish_later_mins||0} onChange={e=>u("can_finish_later_mins",parseInt(e.target.value)||0)} placeholder="0"/><div style={{fontSize:9,color:"#A89DB5",marginTop:2}}>Max minutes after rostered end</div></div>
            <div><label style={lbl}>Lunch Cover Role?</label><label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",marginTop:4}}><input type="checkbox" checked={!!f.is_lunch_cover} onChange={e=>u("is_lunch_cover",e.target.checked)}/> Available for lunch cover shifts</label><div style={{fontSize:9,color:"#A89DB5",marginTop:4}}>Shown in the Lunch Cover dropdown when generating rosters</div></div>
          </div>
        </div>}
        {section==="compliance"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}><F label="First Aid Cert" k="first_aid" type="check" ph="Current first aid"/><F label="First Aid Expiry" k="first_aid_expiry" type="date"/><F label="CPR Expiry" k="cpr_expiry" type="date"/><F label="Anaphylaxis Expiry" k="anaphylaxis_expiry" type="date"/><F label="Asthma Expiry" k="asthma_expiry" type="date"/><div/><F label="WWCC Number" k="wwcc_number" ph="WWC0012345"/><F label="WWCC Expiry" k="wwcc_expiry" type="date"/></div>}
        {section==="notes"&&<F label="Notes" k="notes" type="area" ph="Additional notes…" span={3}/>}
      </div>
    </div>
  );
}

/* ═══ GANTT COMPONENTS ═══ */
function GanttBar({ entry, qColor, onDelete }) {
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
      {onDelete && <button onClick={e=>{e.stopPropagation();onDelete(entry.id)}} style={{ position:"absolute", right:2, top:"50%", transform:"translateY(-50%)", background:"rgba(255,255,255,0.8)", border:"none", borderRadius:"50%", width:14, height:14, cursor:"pointer", fontSize:10, color:"#C06B73", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1, padding:0 }}>×</button>}
    </div>
  );
}

function GanttTimeline() {
  const hours = []; for (let h = 6; h <= 19; h++) hours.push(h);
  return (
    <div style={{ position:"relative", height:20, borderBottom:"1px solid #EDE8F4", marginLeft:160 }}>
      {hours.map(h => (
        <div key={h} style={{ position:"absolute", left:pct(h*60)+"%", top:0, height:"100%", borderLeft:"1px solid #F0EBF8", display:"flex", alignItems:"center" }}>
          <span style={{ fontSize:9, color:"#A89DB5", paddingLeft:2, fontWeight:600 }}>{h}:00</span>
        </div>
      ))}
    </div>
  );
}

function GanttRow({ label, sublabel, entries, qColors, onDelete, highlight }) {
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
        {entries.map(e => <GanttBar key={e.id} entry={e} qColor={qColors[e.qualification] || "#8B6DAF"} onDelete={onDelete} />)}
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
        const nqf = NQF_RATIOS[ageKey] || { ratio: 11, ect_required: false };
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
                const hasECT = !nqf.ect_required || present.some(e => e.qualification==="ect"||e.qualification==="diploma");
                const compliant = present.length >= reqEds && hasECT;
                const partial = present.length > 0 && (present.length < reqEds || !hasECT);
                const bg = compliant ? "#2E8B57" : partial ? "#F5A623" : (hStart >= 6*60 && hStart < 19*60 && children > 0) ? "#C06B73" : "#E8E0D8";
                return (
                  <div key={h} style={{ flex: 1, background: bg, borderRight: "1px solid rgba(255,255,255,0.3)" }}
                    title={`${h}:00 — ${present.length} educator${present.length!==1?"s":""} (need ${reqEds})${!hasECT?" ⚠ no ECT/Diploma":""}`}/>
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
        {[["#2E8B57","Compliant"],["#F5A623","Partial / No ECT"],["#C06B73","Under ratio"],["#E8E0D8","No children"]].map(([c,l])=>(
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 3 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: c }}/>{l}</div>
        ))}
      </div>
    </div>
  );
}

/* ═══ WEEK VIEW ═══ */
function WeekView({ entries, allDates, educators, rooms, onDelete }) {
  const qColors = {ect:"#2E8B57",diploma:"#7E5BA3",cert3:"#D4A26A",working_towards_diploma:"#5B8DB5",working_towards:"#B87D47"};
  const edIds = [...new Set(entries.map(e => e.educator_id))];
  const weekDates = allDates.slice(0, 5); // Mon-Fri

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
      <div style={{ display: "grid", gridTemplateColumns: "160px repeat(5,1fr)", background: "linear-gradient(135deg,#EDE4F0,#E8F0ED)" }}>
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
          <div key={edId} style={{ display: "grid", gridTemplateColumns: "160px repeat(5,1fr)", borderTop: "1px solid #F5F0FB", background: i%2===0?"#FDFBF9":"#fff" }}>
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
                  {dayShifts.length === 0 ?
                    <div style={{ fontSize: 9, color: "#D9D0C7", textAlign: "center" }}>—</div> :
                    dayShifts.map(s => {
                      const sM=tM(s.start_time||"07:00"),eM=tM(s.end_time||"15:00");
                      const hrs=((eM-sM-(s.break_mins||30))/60).toFixed(1);
                      const qColor = qColors[s.qualification] || "#8B6DAF";
                      return (
                        <div key={s.id} style={{ padding: "2px 5px", borderRadius: 5, background: qColor+"20", border: "1px solid "+qColor+"40", fontSize: 9, color: "#3D3248", position: "relative" }}>
                          <div style={{ fontWeight: 700 }}>{s.start_time}–{s.end_time}</div>
                          <div style={{ color: "#8A7F96", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.room_name||"No room"} · {hrs}h</div>
                          <button onClick={() => onDelete(s.id)} style={{ position:"absolute",top:1,right:2,background:"none",border:"none",cursor:"pointer",color:"#C06B73",fontSize:9,lineHeight:1,padding:0 }}>×</button>
                        </div>
                      );
                    })
                  }
                </div>
              );
            })}
          </div>
        );
      })}
      {edIds.length === 0 && <div style={{ padding: 32, textAlign: "center", color: "#A89DB5" }}>No shifts for this period</div>}
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
Educators: ${educators.map(e=>`${e.first_name} ${e.last_name} (${e.qualification||"cert3"}, ${e.employment_type||"?"}, ${e.max_hours_per_week||38}h max, reliability ${Math.round(e.reliability_score||80)}%)`).join("; ")}.
Rooms: ${rooms.map(r=>`${r.name} (${r.age_group||"?"}, ${r.current_children||0} children)`).join("; ")}.
Roster by day:\n${Object.entries(rosterSummary).map(([d,shifts])=>`${d}: ${shifts.join(", ")}`).join("\n")}
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

/* ═══ ROSTER TAB ═══ */
function RosterTab({ educators, periods, templates, sp, loadP, reload }) {
  const [gen,setGen]=useState(false);
  const [gf,setGf]=useState({period_type:"weekly",start_date:nextMon(),end_date:addDays(nextMon(),4),weekly_budget_cents:0});
  const [gRes,setGRes]=useState(null);
  const [gErr,setGErr]=useState(null);
  const [viewMode,setViewMode]=useState("gantt");
  const [groupBy,setGroupBy]=useState("educator");
  const [selDay,setSelDay]=useState(null);
  const [addForm,setAddForm]=useState(null);
  const [rooms,setRooms]=useState([]);
  const [showOptimise,setShowOptimise]=useState(false);
  const [optResult,setOptResult]=useState(null);
  const [optLoading,setOptLoading]=useState(false);
  const [lunchCoverEdId,setLunchCoverEdId]=useState("");
  const [showTemplates,setShowTemplates]=useState(false);
  const [saveTplName,setSaveTplName]=useState("");

  useEffect(()=>{
    API("/api/rooms").then(r=>{ if(Array.isArray(r)) setRooms(r.map(rm=>({...rm, ageGroup: rm.age_group||rm.ageGroup}))); }).catch(()=>{});
  },[]);

  const generate=async()=>{
    setGen(true);setGErr(null);setGRes(null);
    try{const r=await API("/api/rostering/generate",{method:"POST",body:{...gf,lunch_cover_educator_id:lunchCoverEdId||null}});if(r.error)setGErr(r.error);else{setGRes(r);reload();if(r.period_id)loadP(r.period_id);}}catch(e){setGErr(e.message);}
    setGen(false);
  };
  const approve=async id=>{await API("/api/rostering/periods/"+id+"/approve",{method:"PUT"});reload();loadP(id);};
  const publish=async id=>{await API("/api/rostering/periods/"+id+"/publish",{method:"PUT"});reload();loadP(id);};
  const delEntry=async id=>{await API("/api/rostering/entries/"+id,{method:"DELETE"});if(sp?.period?.id)loadP(sp.period.id);};

  const runOptimise=async()=>{
    setOptLoading(true);
    try{const r=await API("/api/rostering/availability-optimise",{method:"POST",body:{period_id:sp?.period?.id,date:selDay}});setOptResult(r);}catch(e){}
    setOptLoading(false);
  };
  const applyOptimise=async(suggestion)=>{
    await API("/api/rostering/entries/"+suggestion.entry_id,{method:"PUT",body:{start_time:suggestion.new_start,end_time:suggestion.new_end}});
    setOptResult(null);
    if(sp?.period?.id) loadP(sp.period.id);
  };
  const saveTemplate=async()=>{
    if(!saveTplName.trim()||!sp?.period?.id) return;
    await API("/api/rostering/templates",{method:"POST",body:{name:saveTplName,period_id:sp.period.id}});
    setSaveTplName("");reload();
  };
  const applyTemplate=async(tplId)=>{
    const start=window.prompt("Apply template — enter start date (YYYY-MM-DD):",nextMon());
    if(!start) return;
    const r=await API(`/api/rostering/templates/${tplId}/apply`,{method:"POST",body:{start_date:start}});
    if(r.period_id){reload();loadP(r.period_id);}
  };
  const deleteTemplate=async(id)=>{
    if(!confirm("Delete this template?")) return;
    await API(`/api/rostering/templates/${id}`,{method:"DELETE"});
    reload();
  };

  const entries=sp?.entries||[];
  const period=sp?.period;
  const allDates=[...new Set(entries.map(e=>e.date))].sort();
  const activeDay=selDay||allDates[0]||null;
  const dayEntries=activeDay?entries.filter(e=>e.date===activeDay):[];
  const qColors={ect:"#2E8B57",diploma:"#7E5BA3",cert3:"#D4A26A",working_towards_diploma:"#5B8DB5",working_towards:"#B87D47"};

  const ganttRows=useMemo(()=>{
    if(!dayEntries.length) return [];
    if(groupBy==="educator"){
      const byEd={};
      dayEntries.forEach(e=>{
        if(!byEd[e.educator_id])byEd[e.educator_id]={name:e.educator_name,qual:e.qualification,entries:[]};
        byEd[e.educator_id].entries.push(e);
      });
      return Object.values(byEd).sort((a,b)=>a.name.localeCompare(b.name));
    } else {
      const byRoom={};
      dayEntries.forEach(e=>{
        const rn=e.room_name||"Unassigned";
        if(!byRoom[rn])byRoom[rn]={name:rn,room_id:e.room_id,entries:[]};
        byRoom[rn].entries.push(e);
      });
      return Object.values(byRoom).sort((a,b)=>a.name.localeCompare(b.name));
    }
  },[dayEntries,groupBy]);

  const hoursSummary=useMemo(()=>{
    const eh={};
    dayEntries.forEach(e=>{
      const sM=tM(e.start_time||"07:00"),eM=tM(e.end_time||"15:00"),bM=e.break_mins||30;
      const h=(eM-sM-bM)/60;
      if(!eh[e.educator_name])eh[e.educator_name]={h:0,q:e.qualification,r:e.hourly_rate_cents||3500};
      eh[e.educator_name].h+=h;
    });
    return eh;
  },[dayEntries]);

  const totalDayCost=Object.values(hoursSummary).reduce((a,v)=>a+v.h*(v.r/100),0);
  const totalPeriodCost=(period?.total_cost_cents||0)/100;
  const budget=(period?.weekly_budget_cents||0)/100;
  const overBudget=budget>0&&totalPeriodCost>budget;

  return (
    <div>
      {/* Generation panel */}
      <div style={{...card,background:"linear-gradient(135deg,#EDE4F0,#E8F0ED)",padding:14,marginBottom:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span style={{fontSize:22}}>🤖</span><div><h3 style={{margin:0,fontSize:14,fontWeight:800}}>AI Roster Generator</h3><p style={{margin:0,fontSize:10,color:"#5C4E6A"}}>NQF ratios · Availability · Reliability · Distance · Cost · 38h cap</p></div></div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"end"}}>
          <div><label style={lbl}>Period</label><select style={sel} value={gf.period_type} onChange={e=>setGf({...gf,period_type:e.target.value})}><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option></select></div>
          <div><label style={lbl}>Start</label><input type="date" style={inp} value={gf.start_date} onChange={e=>setGf({...gf,start_date:e.target.value})}/></div>
          <div><label style={lbl}>End</label><input type="date" style={inp} value={gf.end_date} onChange={e=>setGf({...gf,end_date:e.target.value})}/></div>
          <div><label style={lbl}>Weekly Budget ($)</label><input type="number" style={{...inp,width:100}} value={gf.weekly_budget_cents?(gf.weekly_budget_cents/100):""} onChange={e=>setGf({...gf,weekly_budget_cents:Math.round(parseFloat(e.target.value||0)*100)})} placeholder="Optional"/></div>
          <div><label style={lbl}>Lunch Cover</label>
            <select style={{...sel,width:180}} value={lunchCoverEdId} onChange={e=>setLunchCoverEdId(e.target.value)}>
              <option value="">None (standard breaks)</option>
              {educators.filter(e=>e.is_lunch_cover||e.employment_type==="casual").map(e=>(
                <option key={e.id} value={e.id}>🍽 {e.first_name} {e.last_name}</option>
              ))}
            </select>
          </div>
          <button onClick={generate} disabled={gen} style={{...btnP,padding:"8px 20px",opacity:gen?0.6:1}}>{gen?"⏳ Generating…":"🤖 Generate"}</button>
        </div>
        {gErr&&<div style={{marginTop:8,padding:"6px 10px",borderRadius:8,background:"rgba(192,107,115,0.08)",border:"1px solid rgba(192,107,115,0.2)",fontSize:11,color:"#C06B73"}}>⚠ {gErr}</div>}
        {gRes&&<div style={{marginTop:8,padding:"6px 10px",borderRadius:8,background:"rgba(46,139,87,0.06)",border:"1px solid rgba(46,139,87,0.15)",fontSize:11}}>✅ <strong>{gRes.entries_created}</strong> shifts · <strong>{gRes.total_hours}h</strong> · <strong>${((gRes.total_cost||0)/100).toLocaleString()}</strong> · <strong>{gRes.compliance_score}%</strong> compliance</div>}
      </div>

      {/* Templates panel */}
      <div style={{...card,padding:"10px 14px",marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h4 style={{margin:0,fontSize:12,fontWeight:700}}>📋 Roster Templates</h4>
          <button onClick={()=>setShowTemplates(!showTemplates)} style={{...btnS,fontSize:10}}>{showTemplates?"Hide":"Show"} Templates ({templates.length})</button>
        </div>
        {showTemplates&&(
          <div style={{marginTop:10}}>
            {templates.length===0&&<div style={{fontSize:11,color:"#A89DB5",marginBottom:8}}>No templates saved yet. Generate a roster and save it as a template.</div>}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {templates.map(t=>(
                <div key={t.id} style={{padding:"6px 10px",borderRadius:8,background:"#F8F5F1",border:"1px solid #E8E0D8",fontSize:11,display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontWeight:600}}>{t.name}</span>
                  <span style={{color:"#A89DB5",fontSize:9}}>{(t.entries||[]).length} shifts</span>
                  <button onClick={()=>applyTemplate(t.id)} style={{...btnP,padding:"2px 8px",fontSize:9}}>Apply</button>
                  <button onClick={()=>deleteTemplate(t.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#C06B73",fontSize:11}}>×</button>
                </div>
              ))}
            </div>
            {period&&<div style={{display:"flex",gap:8,alignItems:"center"}}>
              <input value={saveTplName} onChange={e=>setSaveTplName(e.target.value)} placeholder="Template name…" style={{...inp,width:200,fontSize:11}}/>
              <button onClick={saveTemplate} disabled={!saveTplName.trim()} style={{...btnP,padding:"6px 14px",fontSize:11,opacity:!saveTplName.trim()?0.5:1}}>💾 Save Current as Template</button>
            </div>}
          </div>
        )}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"190px 1fr",gap:12}}>
        {/* Period sidebar */}
        <div>
          <div style={{fontSize:10,fontWeight:700,color:"#5C4E6A",marginBottom:6}}>PERIODS</div>
          {periods.length===0&&<div style={{fontSize:11,color:"#A89DB5",padding:12}}>No rosters yet</div>}
          {periods.map(p=>(
            <div key={p.id} onClick={()=>{loadP(p.id);setSelDay(null);}} style={{...card,padding:8,marginBottom:3,cursor:"pointer",borderLeft:"3px solid "+(p.status==="published"?"#2E8B57":p.status==="approved"?"#7E5BA3":"#D4A26A"),...(period?.id===p.id?{boxShadow:"0 0 0 2px rgba(139,109,175,0.3)"}:{})}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:10,fontWeight:600}}>{p.start_date}</span><Badge text={p.status} color={p.status==="published"?"#2E8B57":p.status==="approved"?"#7E5BA3":"#D4A26A"}/></div>
              <div style={{fontSize:8,color:"#A89DB5",marginTop:1}}>{p.entry_count||0} shifts · {p.generated_by==="ai"?"🤖":"✋"}</div>
            </div>
          ))}
        </div>

        {/* Main roster area */}
        <div>
          {!period ? (
            <div style={{...card,padding:40,textAlign:"center",color:"#A89DB5"}}><div style={{fontSize:40,marginBottom:8}}>📅</div><p>Generate a roster above, or select a period from the left.</p></div>
          ) : (
            <div>
              {/* Period header */}
              <div style={{...card,padding:"10px 16px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                  <div>
                    <span style={{fontWeight:800,fontSize:14}}>{period.start_date} → {period.end_date}</span>
                    <span style={{marginLeft:10,fontSize:11,color:"#A89DB5"}}>{Math.round(period.total_hours||0)}h · ${totalPeriodCost.toLocaleString()} · {period.compliance_score||"—"}% · {period.generated_by==="ai"?"🤖 AI":"✋ Manual"}</span>
                    {budget>0&&<span style={{marginLeft:8,fontSize:11,fontWeight:700,color:overBudget?"#C06B73":"#2E8B57"}}>Budget: ${budget.toLocaleString()} {overBudget?"⚠ OVER by $"+(totalPeriodCost-budget).toFixed(0):"✓ under"}</span>}
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                    <div style={{display:"flex",borderRadius:8,overflow:"hidden",border:"1px solid #EDE8F4"}}>
                      {[["gantt","📊 Gantt"],["week","📆 Week"],["grid","📋 Grid"],["educator","👤 My Roster"]].map(([m,l])=>(
                        <button key={m} onClick={()=>setViewMode(m)} style={{padding:"5px 10px",border:"none",cursor:"pointer",fontSize:10,fontWeight:700,background:viewMode===m?"#8B6DAF":"#fff",color:viewMode===m?"#fff":"#555"}}>{l}</button>
                      ))}
                    </div>
                    <button onClick={()=>setShowOptimise(!showOptimise)} style={{...btnS,fontSize:11,padding:"5px 10px",background:showOptimise?"#EDE8F4":undefined}}>🔧 Optimise</button>
                    {period.status==="draft"&&<button onClick={()=>approve(period.id)} style={btnP}>✓ Approve</button>}
                    {period.status==="approved"&&<button onClick={()=>publish(period.id)} style={btnP}>📤 Publish</button>}
                  </div>
                </div>
              </div>

              {/* AI Assistant */}
              <div style={{marginBottom:8}}>
                <AIRosterAssistant entries={entries} educators={educators} rooms={rooms} period={period}/>
              </div>

              {/* Optimise panel */}
              {showOptimise&&(
                <div style={{...card,background:"linear-gradient(135deg,#EDE4F0,#F0F8F0)",padding:14,marginBottom:8}}>
                  <h4 style={{margin:"0 0 8px",fontSize:13,fontWeight:800}}>🔧 AI Availability Optimiser</h4>
                  <p style={{margin:"0 0 10px",fontSize:11,color:"#5C4E6A"}}>Shifts educator hours earlier/later to reduce costs or close coverage gaps — maintaining NQF compliance.</p>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <div><label style={lbl}>Day to Optimise</label>
                      <select style={{...sel,width:160}} value={selDay||""} onChange={e=>setSelDay(e.target.value)}>
                        <option value="">Select day…</option>
                        {allDates.map(d=><option key={d} value={d}>{fmtDate(d)}</option>)}
                      </select>
                    </div>
                    <button onClick={runOptimise} disabled={optLoading||!selDay} style={{...btnP,marginTop:16,opacity:optLoading?0.6:1}}>{optLoading?"⏳ Analysing…":"🤖 Run Optimiser"}</button>
                  </div>
                  {optResult&&(
                    <div style={{marginTop:12}}>
                      <div style={{fontSize:11,fontWeight:700,color:"#3D3248",marginBottom:8}}>
                        {optResult.suggestions?.length>0 ? `${optResult.suggestions.length} suggestion${optResult.suggestions.length>1?"s":""} found:` : "✅ Already optimised for this day"}
                      </div>
                      {(optResult.suggestions||[]).map((s,i)=>(
                        <div key={i} style={{padding:"10px 14px",borderRadius:10,background:"#fff",border:"1px solid #D4E8D4",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                          <div>
                            <div style={{fontWeight:700,fontSize:12,color:"#3D3248"}}>{s.educator_name}</div>
                            <div style={{fontSize:11,color:"#5C4E6A",marginTop:2}}>{s.current_start}–{s.current_end} → <strong>{s.new_start}–{s.new_end}</strong></div>
                            <div style={{fontSize:11,color:"#2E7D32",marginTop:2}}>{s.reason}</div>
                            <div style={{fontSize:10,color:"#A89DB5",marginTop:2}}>Saves {s.saving_mins} min · ${(s.cost_saving/100).toFixed(2)} · Compliance: {s.compliance_ok?"✅":"⚠"}</div>
                          </div>
                          <button onClick={()=>applyOptimise(s)} style={{...btnP,background:"#2E7D32",fontSize:11,padding:"6px 14px",whiteSpace:"nowrap"}}>Apply</button>
                        </div>
                      ))}
                      {optResult.attendance_insights&&(
                        <div style={{padding:"10px 14px",borderRadius:10,background:"#F8F5FF",border:"1px solid #DDD6F4",fontSize:11,color:"#5C4E6A"}}>
                          <strong>📊 Insight:</strong> {optResult.attendance_insights}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* WEEK VIEW */}
              {viewMode==="week"&&(
                <div>
                  <NQFComplianceTimeline dayEntries={entries} rooms={rooms}/>
                  <WeekView entries={entries} allDates={allDates} educators={educators} rooms={rooms} onDelete={delEntry}/>
                </div>
              )}

              {/* GANTT VIEW */}
              {viewMode==="gantt"&&(
                <div>
                  {/* Day tabs */}
                  <div style={{display:"flex",gap:3,marginBottom:8,overflowX:"auto",flexWrap:"nowrap",paddingBottom:2}}>
                    {allDates.map(date=>{
                      const d=new Date(date+"T12:00:00");
                      const dc=entries.filter(e=>e.date===date);
                      const isActive=activeDay===date;
                      return (
                        <button key={date} onClick={()=>setSelDay(date)} style={{flexShrink:0,padding:"6px 12px",borderRadius:8,border:isActive?"2px solid #8B6DAF":"1px solid #EDE8F4",background:isActive?"#8B6DAF":"#fff",color:isActive?"#fff":"#555",cursor:"pointer",fontSize:11,fontWeight:isActive?700:500,textAlign:"center",minWidth:60}}>
                          <div style={{fontSize:9,opacity:0.8}}>{DAYS[d.getDay()]}</div>
                          <div style={{fontSize:13,fontWeight:700}}>{d.getDate()}</div>
                          <div style={{fontSize:8,marginTop:1,opacity:0.7}}>{dc.length} shift{dc.length!==1?"s":""}</div>
                        </button>
                      );
                    })}
                    <button onClick={()=>{setAddForm({date:activeDay||allDates[0],educator_id:"",room_id:"",start_time:"07:00",end_time:"15:00",break_mins:30,lunch_start:"",is_lunch_cover:false});}} style={{...btnS,flexShrink:0,fontSize:11,padding:"6px 12px"}}>+ Add Shift</button>
                  </div>

                  {activeDay&&<NQFComplianceTimeline dayEntries={dayEntries} rooms={rooms}/>}

                  {/* Add shift form */}
                  {addForm&&(
                    <div style={{...card,padding:14,marginBottom:8,background:"#FAF7FF"}}>
                      <h4 style={{margin:"0 0 10px",fontSize:12,fontWeight:700}}>Add Shift — {addForm.date&&fmtDate(addForm.date)}</h4>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
                        <div><label style={lbl}>Educator</label>
                          <select style={sel} value={addForm.educator_id} onChange={e=>setAddForm({...addForm,educator_id:e.target.value})}>
                            <option value="">Select…</option>
                            {educators.map(e=><option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                          </select>
                        </div>
                        <div><label style={lbl}>Room</label>
                          <select style={sel} value={addForm.room_id} onChange={e=>setAddForm({...addForm,room_id:e.target.value})}>
                            <option value="">Select…</option>
                            {rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        </div>
                        <div><label style={lbl}>Start</label><input type="time" style={inp} value={addForm.start_time} onChange={e=>setAddForm({...addForm,start_time:e.target.value})}/></div>
                        <div><label style={lbl}>End</label><input type="time" style={inp} value={addForm.end_time} onChange={e=>setAddForm({...addForm,end_time:e.target.value})}/></div>
                        <div><label style={lbl}>Break (mins)</label><input type="number" style={inp} value={addForm.break_mins} onChange={e=>setAddForm({...addForm,break_mins:parseInt(e.target.value)||30})}/></div>
                        <div><label style={lbl}>Lunch Break Start</label><input type="time" style={inp} value={addForm.lunch_start} onChange={e=>setAddForm({...addForm,lunch_start:e.target.value})}/></div>
                        <div style={{display:"flex",alignItems:"flex-end",paddingBottom:4}}>
                          <label style={{display:"flex",gap:6,alignItems:"center",fontSize:11,cursor:"pointer"}}>
                            <input type="checkbox" checked={addForm.is_lunch_cover} onChange={e=>setAddForm({...addForm,is_lunch_cover:e.target.checked})}/> 🍽 Lunch cover
                          </label>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:8,marginTop:10}}>
                        <button onClick={async()=>{await API("/api/rostering/entries",{method:"POST",body:{...addForm,period_id:period.id,date:addForm.date||activeDay,cost_cents:Math.round(((tM(addForm.end_time)-tM(addForm.start_time)-addForm.break_mins)/60)*(educators.find(e=>e.id===addForm.educator_id)?.hourly_rate_cents||3500))}});setAddForm(null);loadP(period.id);}} style={btnP}>Save Shift</button>
                        <button onClick={()=>setAddForm(null)} style={btnS}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Gantt */}
                  {activeDay&&(
                    <div style={{...card,padding:0,overflow:"hidden"}}>
                      <div style={{padding:"10px 16px",borderBottom:"1px solid #EDE8F4",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{fontWeight:700,fontSize:13,color:"#3D3248"}}>📊 {fmtDate(activeDay)}</div>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <span style={{fontSize:11,color:"#8A7F96"}}>{dayEntries.length} shifts · ${totalDayCost.toFixed(0)} est.</span>
                          <div style={{display:"flex",borderRadius:7,overflow:"hidden",border:"1px solid #EDE8F4"}}>
                            {[["educator","By Educator"],["room","By Room"]].map(([m,l])=>(
                              <button key={m} onClick={()=>setGroupBy(m)} style={{padding:"4px 10px",border:"none",cursor:"pointer",fontSize:10,fontWeight:700,background:groupBy===m?"#8B6DAF":"#fff",color:groupBy===m?"#fff":"#555"}}>{l}</button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div style={{overflowX:"auto"}}>
                        <div style={{minWidth:700}}>
                          <GanttTimeline/>
                          {ganttRows.length===0 ? (
                            <div style={{padding:40,textAlign:"center",color:"#A89DB5"}}>No shifts on this day</div>
                          ) : ganttRows.map((row,i)=>(
                            <GanttRow key={row.name+i} label={row.name} sublabel={row.qual?Q[row.qual]?.s:undefined} entries={row.entries} qColors={qColors} onDelete={delEntry} highlight={i%2===0}/>
                          ))}
                        </div>
                      </div>
                      {/* Legend */}
                      <div style={{padding:"8px 16px",borderTop:"1px solid #EDE8F4",display:"flex",gap:10,flexWrap:"wrap"}}>
                        {Object.entries(qColors).map(([q,c])=>(
                          <div key={q} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,borderRadius:2,background:c}}/><span style={{fontSize:9,color:"#8A7F96"}}>{Q[q]?.s||q}</span></div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* GRID VIEW */}
              {viewMode==="grid"&&activeDay&&(
                <div>
                  <div style={{display:"flex",gap:3,marginBottom:8,overflowX:"auto",flexWrap:"nowrap"}}>
                    {allDates.map(date=>{const d=new Date(date+"T12:00:00");const isActive=activeDay===date;return(<button key={date} onClick={()=>setSelDay(date)} style={{flexShrink:0,padding:"4px 10px",borderRadius:8,border:isActive?"2px solid #8B6DAF":"1px solid #EDE8F4",background:isActive?"#8B6DAF":"#fff",color:isActive?"#fff":"#555",cursor:"pointer",fontSize:10,fontWeight:isActive?700:500}}>{DAYS[d.getDay()]} {d.getDate()}</button>);})}
                  </div>
                  <div style={card}>
                    <div style={{fontWeight:700,fontSize:13,color:"#3D3248",marginBottom:12}}>📋 {fmtDate(activeDay)}</div>
                    {(()=>{
                      const byRoom={};
                      dayEntries.forEach(e=>{const rn=e.room_name||"Unassigned";if(!byRoom[rn])byRoom[rn]=[];byRoom[rn].push(e);});
                      return Object.entries(byRoom).map(([room,re])=>{
                        const hasECT=re.some(e=>e.qualification==="ect"||e.qualification==="diploma");
                        return (
                          <div key={room} style={{marginBottom:12,borderRadius:10,border:"1px solid "+(hasECT?"#D4E8D4":"#E8C0C4"),overflow:"hidden"}}>
                            <div style={{padding:"6px 12px",background:hasECT?"rgba(46,139,87,0.04)":"rgba(192,107,115,0.06)",display:"flex",justifyContent:"space-between"}}>
                              <span style={{fontWeight:700,fontSize:12}}>{room}</span>
                              {hasECT?<Badge text="✓ ECT" color="#2E8B57"/>:<Badge text="⚠ No ECT/Diploma" color="#C06B73"/>}
                            </div>
                            {re.sort((a,b)=>(a.start_time||"").localeCompare(b.start_time||"")).map(e=>{
                              const qx=Q[e.qualification]||{c:"#999",s:"?"};
                              const sM=tM(e.start_time||"07:00"),eM=tM(e.end_time||"15:00");
                              const hrs=((eM-sM-(e.break_mins||30))/60).toFixed(1);
                              return (
                                <div key={e.id} style={{padding:"6px 12px",borderBottom:"1px solid #F5F0FB",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                                    <div style={{width:7,height:7,borderRadius:"50%",background:qx.c}}/>
                                    <span style={{fontSize:12,fontWeight:700}}>{e.educator_name}</span>
                                    <Badge text={qx.s} color={qx.c}/>
                                    {e.is_lunch_cover&&<Badge text="🍽 Lunch Cover" color="#D4A26A"/>}
                                    {e.role==="lead_educator"&&<Badge text="Lead" color="#7E5BA3"/>}
                                  </div>
                                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                                    <span style={{fontSize:11,color:"#8A7F96"}}>{e.start_time}–{e.end_time} ({hrs}h)</span>
                                    <button onClick={()=>delEntry(e.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#C06B73",fontSize:13}}>✕</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* EDUCATOR VIEW */}
              {viewMode==="educator"&&<EducatorRosterView entries={entries} dates={allDates} educators={educators}/>}

              {/* Hours summary */}
              {activeDay&&viewMode==="gantt"&&Object.keys(hoursSummary).length>0&&(
                <div style={{...card,padding:"10px 14px"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#5C4E6A",marginBottom:6}}>HOURS — {fmtDate(activeDay)}</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:4}}>
                    {Object.entries(hoursSummary).sort((a,b)=>b[1].h-a[1].h).map(([n,d])=>{
                      const qx=Q[d.q]||{c:"#999",s:"?"};
                      const p=Math.min(100,Math.round((d.h/38)*100));
                      const over=d.h>=38,warn=d.h>=34&&d.h<38;
                      return <div key={n} style={{padding:"5px 8px",borderRadius:6,background:over?"#FFF5F5":warn?"#FFFDE7":"#F8F5F1",border:`1px solid ${over?"#FFCDD2":warn?"#FFE082":"#E8E0D8"}`,fontSize:10}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                          <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:6,height:6,borderRadius:"50%",background:qx.c}}/><span style={{fontWeight:600}}>{n}</span></div>
                          <div><strong style={{color:over?"#C62828":warn?"#E65100":"inherit"}}>{d.h.toFixed(1)}h</strong><span style={{color:"#A89DB5"}}>/38h</span></div>
                        </div>
                        <div style={{height:3,borderRadius:2,background:"#E8E0D8",overflow:"hidden"}}><div style={{height:"100%",width:p+"%",background:over?"#E53935":warn?"#FB8C00":"#6BA38B",transition:"width 0.3s"}}/></div>
                        {over&&<div style={{fontSize:9,color:"#C62828",fontWeight:700,marginTop:2}}>⚠️ AT 38H CAP</div>}
                        {warn&&<div style={{fontSize:9,color:"#E65100",marginTop:2}}>Near cap</div>}
                      </div>;
                    })}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 8px",borderRadius:6,background:"rgba(139,109,175,0.08)",border:"1px solid rgba(139,109,175,0.2)",fontSize:10,gridColumn:"span 2"}}>
                      <strong>Daily Total</strong><strong style={{color:"#7E5BA3"}}>${totalDayCost.toFixed(0)}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══ EDUCATOR PORTAL VIEW ═══ */
function EducatorRosterView({ entries, dates, educators }) {
  const [selEd,setSelEd]=useState("");
  const myEntries=selEd?entries.filter(e=>String(e.educator_id)===String(selEd)):[];
  const byDate=dates.reduce((a,d)=>{a[d]=myEntries.filter(e=>e.date===d);return a},{});
  const totalHours=myEntries.reduce((a,e)=>{const sM=tM(e.start_time||"07:00"),eM=tM(e.end_time||"15:00");return a+(eM-sM-(e.break_mins||30))/60;},0);
  return (
    <div style={card}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h3 style={{margin:0,fontSize:14,fontWeight:800}}>👤 My Roster</h3>
        <select style={{...sel,width:220}} value={selEd} onChange={e=>setSelEd(e.target.value)}>
          <option value="">Select educator…</option>
          {educators.map(e=><option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
        </select>
      </div>
      {!selEd&&<div style={{textAlign:"center",padding:40,color:"#A89DB5"}}>Select an educator to see their roster</div>}
      {selEd&&(
        <>
          {totalHours>=38&&<div style={{padding:"8px 12px",borderRadius:8,background:"#FFEBEE",border:"1px solid #FFCDD2",fontSize:12,fontWeight:700,color:"#C62828",marginBottom:10}}>⚠️ AT 38-hour weekly cap.</div>}
          <div style={{display:"flex",gap:8,marginBottom:16,padding:"10px 14px",borderRadius:10,background:totalHours>=38?"linear-gradient(135deg,#FFEBEE,#FDE8E8)":totalHours>=34?"linear-gradient(135deg,#FFF8E1,#FFF3CD)":"linear-gradient(135deg,#EDE4F0,#E8F0ED)"}}>
            <div style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:totalHours>=38?"#C62828":totalHours>=34?"#E65100":"#7E5BA3"}}>{totalHours.toFixed(1)}</div><div style={{fontSize:10,color:"#8A7F96"}}>/ 38h</div></div>
            <div style={{width:1,background:"#DDD6F4"}}/>
            <div style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:"#7E5BA3"}}>{myEntries.length}</div><div style={{fontSize:10,color:"#8A7F96"}}>shifts</div></div>
            <div style={{width:1,background:"#DDD6F4"}}/>
            <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}>
              <div style={{height:6,borderRadius:3,background:"#DDD6F4",overflow:"hidden"}}><div style={{height:"100%",width:Math.min(100,totalHours/38*100)+"%",background:totalHours>=38?"#E53935":totalHours>=34?"#FB8C00":"#6BA38B",transition:"width 0.4s"}}/></div>
            </div>
          </div>
          {dates.map(date=>{
            const dayShifts=byDate[date]||[];
            const d=new Date(date+"T12:00:00");
            const dayHours=dayShifts.reduce((a,e)=>{const sM=tM(e.start_time||"07:00"),eM=tM(e.end_time||"15:00");return a+(eM-sM-(e.break_mins||30))/60;},0);
            return (
              <div key={date} style={{borderRadius:12,border:"1px solid "+(dayShifts.length?"#DDD6F4":"#F0EBF8"),marginBottom:8,overflow:"hidden",opacity:dayShifts.length?1:0.5}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px",background:dayShifts.length?"#FAF7FF":"#FDFBF9"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{textAlign:"center",width:44,padding:"4px 0",borderRadius:8,background:dayShifts.length?"#8B6DAF":"#EEE",color:dayShifts.length?"#fff":"#999"}}>
                      <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase"}}>{DAYS[d.getDay()]}</div>
                      <div style={{fontSize:17,fontWeight:900}}>{d.getDate()}</div>
                    </div>
                    <div>
                      {dayShifts.length===0?<span style={{fontSize:12,color:"#B0AAB9"}}>Day off</span>:
                        dayShifts.map(s=>(<div key={s.id} style={{marginBottom:2}}><span style={{fontSize:13,fontWeight:700,color:"#3D3248"}}>{s.start_time} – {s.end_time}</span><span style={{marginLeft:8,fontSize:11,color:"#8A7F96"}}>{s.room_name||"No room"}</span></div>))}
                    </div>
                  </div>
                  {dayShifts.length>0&&<div style={{fontSize:13,fontWeight:700,color:"#7E5BA3"}}>{dayHours.toFixed(1)}h</div>}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/* ═══ TIMESHEET TAB ═══ */
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
    const csv = rows.map(r => r.join(",")).join("\n");
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

      {!loading&&data&&(
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
      {!loading&&!data&&selPeriodId&&<div style={{...card,padding:40,textAlign:"center",color:"#A89DB5"}}>No timesheet data for this period.</div>}
      {!selPeriodId&&<div style={{...card,padding:40,textAlign:"center",color:"#A89DB5"}}><div style={{fontSize:36,marginBottom:8}}>🕐</div><p>Generate a roster first, then select it here to see the timesheet.</p></div>}
    </div>
  );
}

/* ═══ SICK COVER TAB ═══ */
function SickCoverTab({ educators, fills, reload }) {
  const [showReport,setShowReport]=useState(false);
  const [form,setForm]=useState({educator_id:"",date:new Date().toISOString().split("T")[0],start_time:"07:00",end_time:"15:00",reason:"",strategy:"sequential"});
  const [selectedFill,setSelectedFill]=useState(null);
  const [attempts,setAttempts]=useState([]);
  const [submitting,setSubmitting]=useState(false);
  const [showOptimise,setShowOptimise]=useState(false);
  const [optForm,setOptForm]=useState({date:new Date().toISOString().split("T")[0],absent_educator_id:""});
  const [optResult,setOptResult]=useState(null);
  const [optLoading,setOptLoading]=useState(false);

  const viewAttempts=async id=>{const r=await API("/api/rostering/fill-requests/"+id+"/attempts");setAttempts(r.attempts||[]);setSelectedFill(fills.find(f=>f.id===id));};
  const accept=async(reqId,edId)=>{await API("/api/rostering/fill-requests/"+reqId+"/accept",{method:"POST",body:{educator_id:edId}});reload();viewAttempts(reqId);};

  const submitAbsence=async()=>{
    if(!form.educator_id)return;
    setSubmitting(true);
    await API("/api/rostering/absences",{method:"POST",body:{educator_id:form.educator_id,date:form.date,type:"sick",reason:form.reason}});
    const r=await API("/api/rostering/fill-requests",{method:"POST",body:{absence_id:null,original_educator_id:form.educator_id,date:form.date,start_time:form.start_time,end_time:form.end_time,strategy:form.strategy}});
    setSubmitting(false);setShowReport(false);reload();
    if(r.id)viewAttempts(r.id);
  };

  const runOptimise=async()=>{
    setOptLoading(true);
    try{const r=await API("/api/rostering/sick-cover-optimise",{method:"POST",body:optForm});setOptResult(r);}catch(e){}
    setOptLoading(false);
  };

  const transcript=[
    {who:"AI",text:"Good morning, this is Sunshine Learning Centre's automated absence line. Could you please tell me your name?",t:"0:02"},
    {who:"Ed",text:"Hi, it's Sarah Mitchell. I'm not feeling well today and won't be able to come in for my shift.",t:"0:08"},
    {who:"AI",text:"I'm sorry to hear that, Sarah. I have your shift today from 7:00 AM to 3:00 PM in the Joeys room. Can you tell me what's wrong?",t:"0:14"},
    {who:"Ed",text:"I've got a stomach bug. Been up all night.",t:"0:19"},
    {who:"AI",text:"I hope you feel better soon. Under Australian workplace regulations, if your absence extends beyond two consecutive days, you'll need a medical certificate. I'll notify your manager and start finding a replacement now.",t:"0:25"},
    {who:"Ed",text:"No, that's all. Thanks.",t:"0:34"},
    {who:"AI",text:"Take care, Sarah. Your manager will be notified shortly. Goodbye.",t:"0:38"},
  ];

  const journey=[
    {icon:"📞",title:"Inbound Call Received",detail:"Educator calls the absence hotline",st:"complete",t:"7:02 AM"},
    {icon:"🤖",title:"AI Takes Details",detail:"Records reason, sick cert reminders per AU law",st:"complete",t:"7:02 AM"},
    {icon:"📋",title:"Recorded & Transcribed",detail:"Full transcript + recording stored",st:"complete",t:"7:03 AM"},
    {icon:"📱",title:"Manager Notified",detail:"SMS + push sent to centre manager",st:"complete",t:"7:03 AM"},
    {icon:"🔍",title:"Finding Replacement",detail:"AI searches by reliability, distance, qualification",st:selectedFill?.status==="filled"?"complete":"active",t:"7:04 AM"},
    {icon:"💬",title:"SMS to Candidates",detail:(attempts.length||0)+" educators contacted",st:selectedFill?.status==="filled"?"complete":"active",t:"7:04 AM"},
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
            <div><label style={lbl}>Date</label><input type="date" style={{...inp,width:150}} value={optForm.date} onChange={e=>setOptForm({...optForm,date:e.target.value})}/></div>
            <div><label style={lbl}>Absent Educator</label>
              <select style={{...sel,width:200}} value={optForm.absent_educator_id} onChange={e=>setOptForm({...optForm,absent_educator_id:e.target.value})}>
                <option value="">Select educator…</option>
                {educators.filter(e=>e.status==="active").map(e=><option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
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
          <div><label style={lbl}>Educator</label><select style={sel} value={form.educator_id} onChange={e=>setForm({...form,educator_id:e.target.value})}><option value="">Select…</option>{educators.filter(e=>e.status==="active").map(e=><option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}</select></div>
          <div><label style={lbl}>Date</label><input type="date" style={inp} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div>
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
          {fills.length===0&&<div style={{...card,padding:24,textAlign:"center",color:"#A89DB5"}}>No sick cover requests yet.</div>}
          {fills.map(f=>(
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
  const resolve=async(id,opt)=>{await API("/api/rostering/change-proposals/"+id+"/resolve",{method:"POST",body:{selected_option:opt}});reload();};
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

/* ═══ SETTINGS ═══ */
function SettingsTab({ config, reload }) {
  const [section,setSection]=useState("agent");
  const [f,setF]=useState({
    enabled:true,contact_strategy:"sequential",send_sms_first:true,sms_wait_mins:10,call_wait_mins:15,
    max_attempts_per_educator:2,simultaneous_contacts:3,priority_order:"reliability_desc",
    sms_template:"Hi {name}, we have an urgent shift at {centre} on {date} from {start} to {end} in {room}. Can you cover? Reply YES or NO.",
    call_script_guidance:"Greet by name. Explain a shift needs covering. Provide date, time, room. Ask availability. Confirm if yes. Friendly and professional.",
    voice_engine:"none",voice_engine_api_key:"",voice_engine_endpoint:"",voice_id:"",
    sms_provider:"none",sms_api_key:"",sms_from_number:"",webhook_url:"",middleware_endpoint:"",
    working_hours_start:"05:00",working_hours_end:"21:00",
    auto_approve_fill:false,notify_manager_on_fill:true,notify_manager_on_fail:true,
    manager_user_id:"",manager_phone:"",manager_email:"",...(config||{}),
  });
  const [saving,setSaving]=useState(false);
  const u=(k,v)=>setF(p=>({...p,[k]:v}));
  const save=async()=>{setSaving(true);await API("/api/rostering/ai-config",{method:"PUT",body:{...f,agent_type:"sick_cover"}});setSaving(false);reload();};
  const F=({label,k,type,ph,opts,span,info})=>(
    <div style={{gridColumn:span?"span "+span:undefined}}>
      <label style={lbl}>{label}</label>
      {opts?<select style={sel} value={f[k]||""} onChange={e=>u(k,e.target.value)}>{opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        :type==="check"?<label style={{display:"flex",alignItems:"center",gap:5,fontSize:12,cursor:"pointer"}}><input type="checkbox" checked={!!f[k]} onChange={e=>u(k,e.target.checked)}/> {ph||"Enabled"}</label>
        :type==="area"?<textarea style={{...inp,height:70,resize:"vertical",fontSize:11}} value={f[k]||""} onChange={e=>u(k,e.target.value)} placeholder={ph}/>
        :<input type={type||"text"} style={inp} value={f[k]||""} onChange={e=>u(k,type==="number"?parseInt(e.target.value)||0:e.target.value)} placeholder={ph}/>}
      {info&&<div style={{fontSize:9,color:"#A89DB5",marginTop:1}}>{info}</div>}
    </div>
  );
  const secs=[["agent","🤖 AI Agent"],["messaging","💬 Messaging"],["integrations","🔌 Integrations"],["costs","💰 Costs"]];
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
        <div style={{display:"flex",gap:4}}>{secs.map(([id,l])=><button key={id} onClick={()=>setSection(id)} style={{...btnS,background:section===id?"rgba(139,109,175,0.1)":"#F8F5F1",color:section===id?"#7E5BA3":"#6B5F7A",fontWeight:section===id?700:500}}>{l}</button>)}</div>
        <button onClick={save} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?"Saving…":"💾 Save"}</button>
      </div>
      {section==="agent"&&<div style={card}><h4 style={{margin:"0 0 10px",fontSize:13,fontWeight:700}}>🤖 AI Agent</h4><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        <F label="Agent Enabled" k="enabled" type="check"/>
        <F label="Contact Strategy" k="contact_strategy" opts={[["sequential","Sequential"],["simultaneous","Simultaneous"]]}/>
        <F label="Priority" k="priority_order" opts={[["reliability_desc","Highest Reliability"],["distance_asc","Nearest First"],["cost_asc","Lowest Cost"]]}/>
        <F label="Send SMS First?" k="send_sms_first" type="check"/>
        <F label="SMS Wait (mins)" k="sms_wait_mins" type="number"/>
        <F label="Call Wait (mins)" k="call_wait_mins" type="number"/>
        <F label="Max Attempts/Ed" k="max_attempts_per_educator" type="number"/>
        <F label="Simultaneous Contacts" k="simultaneous_contacts" type="number"/>
        <div/>
        <F label="Working Hours Start" k="working_hours_start" type="time"/>
        <F label="Working Hours End" k="working_hours_end" type="time"/>
        <div/>
        <F label="Auto-Approve Fill" k="auto_approve_fill" type="check"/>
        <F label="Notify on Fill" k="notify_manager_on_fill" type="check"/>
        <F label="Notify on Fail" k="notify_manager_on_fail" type="check"/>
        <F label="Manager Phone" k="manager_phone" ph="0400 000 000"/>
        <F label="Manager Email" k="manager_email" ph="manager@centre.com.au"/>
        <div/>
      </div></div>}
      {section==="messaging"&&<div style={card}><h4 style={{margin:"0 0 10px",fontSize:13,fontWeight:700}}>💬 Templates</h4>
        <F label="SMS Template" k="sms_template" type="area" info="Variables: {name}, {centre}, {date}, {start}, {end}, {room}"/>
        <div style={{marginTop:10}}><F label="Call Script Guidance" k="call_script_guidance" type="area" info="General direction for AI voice agent"/></div>
      </div>}
      {section==="integrations"&&<div>
        <div style={card}><h4 style={{margin:"0 0 10px",fontSize:13,fontWeight:700}}>📱 SMS</h4><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}><F label="Provider" k="sms_provider" opts={[["none","None"],["twilio","Twilio"],["messagebird","MessageBird"],["vonage","Vonage"]]}/><F label="API Key" k="sms_api_key" type="password" ph="sk_live_…"/><F label="From Number" k="sms_from_number" ph="+614xxxxxxxx"/></div></div>
        <div style={card}><h4 style={{margin:"0 0 10px",fontSize:13,fontWeight:700}}>🎙️ Voice Engine</h4><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><F label="Engine" k="voice_engine" opts={[["none","None"],["elevenlabs","ElevenLabs"],["playht","Play.ht"],["openai_realtime","OpenAI Realtime"],["vapi","Vapi"],["bland","Bland.ai"],["retell","Retell"]]}/><F label="Voice ID" k="voice_id" ph="voice_abc123"/><F label="API Key" k="voice_engine_api_key" type="password" ph="sk_…"/><F label="Endpoint" k="voice_engine_endpoint" ph="https://api.provider.com/v1"/></div></div>
        <div style={card}><h4 style={{margin:"0 0 10px",fontSize:13,fontWeight:700}}>🔗 Webhooks</h4><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><F label="Webhook URL" k="webhook_url" ph="https://n8n.example.com/webhook/…"/><F label="Middleware Endpoint" k="middleware_endpoint" ph="https://api.example.com/childcare360"/></div></div>
      </div>}
      {section==="costs"&&<div style={card}>
        <h4 style={{margin:"0 0 10px",fontSize:13,fontWeight:700}}>💰 Usage & Costs</h4>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
          {[{t:"Phone Calls",n:12,cost:4.80,rate:"$0.40/call",icon:"📞"},{t:"SMS",n:28,cost:2.24,rate:"$0.08/SMS",icon:"💬"},{t:"AI Processing",n:"75 min",cost:1.50,rate:"$0.02/min",icon:"🤖"}].map(c=>(
            <div key={c.t} style={{padding:"10px 14px",borderRadius:10,background:"#F8F5F1",border:"1px solid #E8E0D8",textAlign:"center"}}><div style={{fontSize:16}}>{c.icon}</div><div style={{fontSize:9,fontWeight:700,color:"#8A7F96"}}>{c.t}</div><div style={{fontSize:18,fontWeight:800}}>{c.n}</div><div style={{fontSize:12,fontWeight:700,color:"#2E8B57"}}>${c.cost.toFixed(2)}</div><div style={{fontSize:9,color:"#A89DB5"}}>{c.rate}</div></div>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",borderRadius:10,background:"rgba(139,109,175,0.06)",border:"1px solid rgba(139,109,175,0.15)"}}><span style={{fontSize:13,fontWeight:700}}>Total Monthly AI Spend</span><span style={{fontSize:18,fontWeight:800,color:"#7E5BA3"}}>$8.54</span></div>
      </div>}
    </div>
  );
}
