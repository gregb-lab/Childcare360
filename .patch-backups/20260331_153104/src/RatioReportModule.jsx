/**
 * RatioReportModule.jsx — v2.6.0
 * NQF Educator:Child Ratio Check Sheet
 * - 30-minute slot grid for any date range
 * - Centre or room view
 * - Live dashboard widget
 * - Breach highlighting + compliance summary
 */
import { useState, useEffect, useCallback } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}) },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};

const P = "#7C3AED", PL = "#EDE4F0", DARK = "#3D3248", MUTED = "#8A7F96";
const BREACH = "#DC2626", BREACH_BG = "#FEF2F2", OK = "#16A34A", OK_BG = "#F0FDF4";
const WARN = "#D97706", WARN_BG = "#FFFBEB";
const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: "20px 24px" };
const btnP = { padding: "9px 18px", borderRadius: 9, border: "none", background: P, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 };
const btnS = { padding: "9px 18px", borderRadius: 9, border: `1px solid ${P}`, background: "#fff", color: P, fontWeight: 600, cursor: "pointer", fontSize: 13 };

function todayStr() { return new Date().toISOString().split("T")[0]; }
function lastWeekStr() { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split("T")[0]; }
function fmtDate(d) { return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }); }

// ── Live Ratio Widget (for dashboard) ─────────────────────────────────────────
export function RatioLiveWidget({ onNavigate }) {
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    API("/api/ratio-report/live")
      .then(r => setLive(r))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60000); // refresh every minute
    return () => clearInterval(t);
  }, [refresh]);

  if (loading) return (
    <div style={card}>
      <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700, color: DARK }}>👥 Live Ratios</h3>
      <div style={{ color: MUTED, fontSize: 13 }}>Loading…</div>
    </div>
  );

  const breachRooms = live?.rooms?.filter(r => r.breach) || [];

  return (
    <div style={{ ...card, border: `1.5px solid ${breachRooms.length > 0 ? BREACH : "#EDE8F4"}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: DARK, display: "flex", alignItems: "center", gap: 8 }}>
          👥 Live Ratios
          {breachRooms.length > 0 && (
            <span style={{ background: BREACH, color: "#fff", fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 10 }}>
              ⚠ {breachRooms.length} breach{breachRooms.length > 1 ? "es" : ""}
            </span>
          )}
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: MUTED }}>{live?.slot || "--:--"}</span>
          {onNavigate && <button onClick={() => onNavigate("ratio_report")} style={{ background: "none", border: "none", color: P, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Full Report →</button>}
        </div>
      </div>

      {/* Centre totals */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 8, background: "#F9F8FF" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: DARK }}>{live?.total_children ?? "—"}</div>
          <div style={{ fontSize: 11, color: MUTED }}>Children</div>
        </div>
        <div style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 8, background: "#F9F8FF" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: DARK }}>{live?.total_educators ?? "—"}</div>
          <div style={{ fontSize: 11, color: MUTED }}>Educators</div>
        </div>
        <div style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 8, background: live?.breach_count > 0 ? BREACH_BG : OK_BG }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: live?.breach_count > 0 ? BREACH : OK }}>{live?.breach_count ?? 0}</div>
          <div style={{ fontSize: 11, color: live?.breach_count > 0 ? BREACH : OK }}>Breaches</div>
        </div>
      </div>

      {/* Room breakdown */}
      {(live?.rooms || []).map(room => (
        <div key={room.room_id} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 8, marginBottom: 5,
          background: room.breach ? BREACH_BG : room.children === 0 ? "#F9F9F9" : OK_BG,
          border: `1px solid ${room.breach ? "#FCA5A5" : room.children === 0 ? "#EEE" : "#BBF7D0"}`,
        }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: DARK }}>{room.room_name}</span>
            <span style={{ fontSize: 11, color: MUTED, marginLeft: 6 }}>{room.age_group} · 1:{room.nqf_ratio}</span>
          </div>
          <div style={{ fontSize: 12, color: MUTED }}>{room.children} children</div>
          <div style={{ fontSize: 12, color: MUTED }}>{room.educators} educators</div>
          {room.breach && <span style={{ fontSize: 11, fontWeight: 700, color: BREACH }}>Need {room.required - room.educators} more</span>}
          {!room.breach && room.children > 0 && <span style={{ fontSize: 11, color: OK }}>✓</span>}
        </div>
      ))}
    </div>
      )}
    </div>
  );
}

// ── Main Report Module ─────────────────────────────────────────────────────────
export default function RatioReportModule() {
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo,   setDateTo]   = useState(todayStr());
  const [view, setView]         = useState("room"); // "centre" | "room"
  const [roomId, setRoomId]     = useState("");
  const [rooms, setRooms]       = useState([]);
  const [report, setReport]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [expandedDates, setExpandedDates] = useState({});

  const [riDate, setRiDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [riData, setRiData] = useState(null);
  const [riLoading, setRiLoading] = useState(false);
  const [mainTab, setMainTab] = useState("grid");

  const loadRI = async (d) => {
    setRiLoading(true);
    const tok = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
    const h = {"Content-Type":"application/json",...(tok?{Authorization:`Bearer ${tok}`}:{}),...(tid?{"x-tenant-id":tid}:{})};
    const r = await fetch(`/api/roster/ratio-interval?date=${d}`,{headers:h}).then(x=>x.json()).catch(()=>({}));
    setRiData(r); setRiLoading(false);
  };
  useEffect(()=>{if(mainTab==="interval")loadRI(riDate);},[mainTab,riDate]);

  useEffect(() => {
    API("/api/ratio-report/rooms").then(r => setRooms(r.rooms || [])).catch(() => {});
  }, []);

  const generate = async () => {
    setLoading(true);
    setReport(null);
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, view });
      if (view === "room" && roomId) params.set("room_id", roomId);
      const r = await API(`/api/ratio-report?${params}`);
      if (r.error) throw new Error(r.error);
      setReport(r);
      // Expand first date by default
      if (r.report?.length) {
        setExpandedDates({ [r.report[0].date]: true });
      }
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleDate = (date) => setExpandedDates(p => ({ ...p, [date]: !p[date] }));

  const quickRanges = [
    { label: "Today", from: todayStr(), to: todayStr() },
    { label: "Yesterday", from: (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().split("T")[0]; })(), to: (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().split("T")[0]; })() },
    { label: "This Week", from: (() => { const d = new Date(), day=d.getDay(); d.setDate(d.getDate()-(day||7)+1); return d.toISOString().split("T")[0]; })(), to: todayStr() },
    { label: "Last 7 Days", from: lastWeekStr(), to: todayStr() },
    { label: "This Month", from: todayStr().slice(0,7)+"-01", to: todayStr() },
  ];

  const complianceColor = (pct) => pct >= 95 ? OK : pct >= 80 ? WARN : BREACH;
  const complianceBg = (pct) => pct >= 95 ? OK_BG : pct >= 80 ? WARN_BG : BREACH_BG;

  const RI_COLORS = {compliant:"#16A34A",breach:"#DC2626",empty:"#E5E7EB"};
  return (
    <div>
      {/* Tab selector */}
      <div style={{display:"flex",gap:4,marginBottom:16,background:"#fff",borderRadius:12,border:"1px solid #EDE8F4",padding:4,width:"fit-content"}}>
        {[["grid","📊 Ratio Grid"],["interval","⏱️ 30-Min Interval"]].map(([id,label])=>(
          <button key={id} onClick={()=>setMainTab(id)}
            style={{padding:"7px 16px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,
              background:mainTab===id?"#7C3AED":"transparent",color:mainTab===id?"#fff":"#8A7F96"}}>
            {label}
          </button>
        ))}
      </div>

      {mainTab==="interval" && (
        <div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,background:"#fff",borderRadius:12,border:"1px solid #EDE8F4",padding:"12px 16px"}}>
            <label style={{fontSize:11,color:"#8A7F96",fontWeight:700}}>DATE</label>
            <input type="date" value={riDate} onChange={e=>{setRiDate(e.target.value);loadRI(e.target.value);}}
              style={{padding:"7px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:13}} />
            {riData && (
              <>
                <div style={{display:"flex",gap:8,marginLeft:"auto"}}>
                  <div style={{background:"#FEF2F2",borderRadius:8,padding:"6px 14px",textAlign:"center"}}>
                    <div style={{fontSize:20,fontWeight:800,color:"#DC2626"}}>{riData.improvements_needed||0}</div>
                    <div style={{fontSize:10,color:"#DC2626",fontWeight:700}}>NON-COMPLIANT SLOTS</div>
                  </div>
                  <div style={{background:"#F0FDF4",borderRadius:8,padding:"6px 14px",textAlign:"center"}}>
                    <div style={{fontSize:20,fontWeight:800,color:"#16A34A"}}>{(riData.total_slots||0)-(riData.improvements_needed||0)}</div>
                    <div style={{fontSize:10,color:"#16A34A",fontWeight:700}}>COMPLIANT SLOTS</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {riLoading && <div style={{padding:40,textAlign:"center",color:"#8A7F96"}}>Loading ratio intervals…</div>}

          {riData && !riLoading && (
            <div style={{background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:"#F8F5FC"}}>
                    <th style={{padding:"8px 12px",textAlign:"left",color:"#8A7F96",fontWeight:700,borderBottom:"2px solid #EDE8F4"}}>Time</th>
                    <th style={{padding:"8px 12px",textAlign:"center",color:"#8A7F96",fontWeight:700,borderBottom:"2px solid #EDE8F4"}}>Children</th>
                    <th style={{padding:"8px 12px",textAlign:"center",color:"#8A7F96",fontWeight:700,borderBottom:"2px solid #EDE8F4"}}>Staff</th>
                    <th style={{padding:"8px 12px",textAlign:"center",color:"#8A7F96",fontWeight:700,borderBottom:"2px solid #EDE8F4"}}>Required</th>
                    <th style={{padding:"8px 12px",textAlign:"center",color:"#8A7F96",fontWeight:700,borderBottom:"2px solid #EDE8F4"}}>Deficit</th>
                    <th style={{padding:"8px 12px",textAlign:"center",color:"#8A7F96",fontWeight:700,borderBottom:"2px solid #EDE8F4"}}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(riData.intervals||[]).map(iv=>{
                    const hasChildren = iv.children_count > 0;
                    const bg = !hasChildren ? "#FAFAFA" : iv.is_compliant ? "#F0FDF4" : "#FEF2F2";
                    return (
                      <tr key={iv.slot} style={{borderBottom:"1px solid #F5F0FF",background:bg}}>
                        <td style={{padding:"6px 12px",fontFamily:"monospace",fontWeight:600,color:"#3D3248"}}>{iv.slot}–{iv.slot_end}</td>
                        <td style={{padding:"6px 12px",textAlign:"center",fontWeight:700,color:"#3D3248"}}>{hasChildren?iv.children_count:"—"}</td>
                        <td style={{padding:"6px 12px",textAlign:"center",fontWeight:700,color:"#0284C7"}}>{hasChildren?iv.staff_count:"—"}</td>
                        <td style={{padding:"6px 12px",textAlign:"center",fontWeight:700,color:"#8A7F96"}}>{hasChildren?iv.required_staff:"—"}</td>
                        <td style={{padding:"6px 12px",textAlign:"center"}}>
                          {hasChildren && iv.deficit>0 && (
                            <span style={{background:"#DC2626",color:"#fff",borderRadius:12,padding:"2px 8px",fontWeight:800,fontSize:11}}>−{iv.deficit}</span>
                          )}
                          {hasChildren && iv.deficit===0 && <span style={{color:"#16A34A",fontWeight:700}}>—</span>}
                        </td>
                        <td style={{padding:"6px 12px",textAlign:"center"}}>
                          {!hasChildren ? <span style={{color:"#8A7F96",fontSize:11}}>No children</span>
                            : iv.is_compliant ? <span style={{color:"#16A34A",fontWeight:700}}>✓ Compliant</span>
                            : <span style={{color:"#DC2626",fontWeight:700}}>⚠️ Breach</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {mainTab==="grid" && (
    <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 28 }}>📊</span>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: DARK }}>Ratio Check Sheet</h1>
          </div>
          <p style={{ margin: "4px 0 0 40px", color: MUTED, fontSize: 13 }}>
            NQF educator:child ratios in 30-minute increments · Based on actual sign-ins and clock records
          </p>
        </div>
      </div>

      {/* NQF Reference */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {[["0–2 yrs","1:4","#C9929E"],["2–3 yrs","1:5","#9B7DC0"],["3–6 yrs","1:11","#6BA38B"],["OSHC","1:15","#D4A26A"]].map(([age,ratio,color]) => (
          <div key={age} style={{ padding: "6px 14px", borderRadius: 20, background: color + "22", border: `1px solid ${color}44`, fontSize: 12, fontWeight: 600, color: DARK }}>
            <span style={{ color }}>{age}</span> · NQF {ratio}
          </div>
        ))}
        <div style={{ padding: "6px 14px", borderRadius: 20, background: BREACH_BG, border: "1px solid #FCA5A5", fontSize: 12, fontWeight: 700, color: BREACH }}>⚠ Red = Breach</div>
        <div style={{ padding: "6px 14px", borderRadius: 20, background: OK_BG, border: "1px solid #BBF7D0", fontSize: 12, fontWeight: 700, color: OK }}>✓ Green = Compliant</div>
      </div>

      {/* Filter bar */}
      <div style={{ ...card, marginBottom: 20, padding: "16px 20px" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 12, color: MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #DDD", fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #DDD", fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>View</label>
            <select value={view} onChange={e => setView(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #DDD", fontSize: 13 }}>
              <option value="centre">Whole Centre</option>
              <option value="room">By Room</option>
            </select>
          </div>
          {view === "room" && (
            <div>
              <label style={{ fontSize: 12, color: MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>Room (optional)</label>
              <select value={roomId} onChange={e => setRoomId(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #DDD", fontSize: 13 }}>
                <option value="">All Rooms</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          <button style={{ ...btnP, opacity: loading ? 0.6 : 1 }} onClick={generate} disabled={loading}>
            {loading ? "Generating…" : "Generate Report"}
          </button>
        </div>
        {/* Quick ranges */}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: MUTED, alignSelf: "center" }}>Quick:</span>
          {quickRanges.map(r => (
            <button key={r.label} onClick={() => { setDateFrom(r.from); setDateTo(r.to); }}
              style={{ padding: "4px 12px", borderRadius: 14, border: "1px solid #DDD", background: "#F9F8FF", color: DARK, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {report && (
        <>
          {/* Summary bar */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Days Covered", value: report.summary.dates_covered, color: DARK },
              { label: "Total Slots", value: report.summary.total_slots, color: DARK },
              { label: "Breach Slots", value: report.summary.breach_slots, color: report.summary.breach_slots > 0 ? BREACH : OK },
              { label: "Compliance", value: `${report.summary.compliance_pct}%`, color: complianceColor(report.summary.compliance_pct), bg: complianceBg(report.summary.compliance_pct) },
            ].map(s => (
              <div key={s.label} style={{ ...card, padding: "14px 16px", background: s.bg || "#fff", textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Worst breach callout */}
          {report.summary.worst_breach && (
            <div style={{ ...card, background: BREACH_BG, border: "1.5px solid #FCA5A5", marginBottom: 20, padding: "14px 18px" }}>
              <div style={{ fontWeight: 700, color: BREACH, fontSize: 14, marginBottom: 4 }}>⚠ Worst Breach Detected</div>
              <div style={{ fontSize: 13, color: DARK }}>
                {fmtDate(report.summary.worst_breach.date)} at {report.summary.worst_breach.slot}
                {report.summary.worst_breach.rooms && ` — ${report.summary.worst_breach.rooms.map(r => `${r.room_name} (${r.educators} of ${r.required} required)`).join(", ")}`}
              </div>
            </div>
          )}

          {/* Day-by-day grids */}
          {report.report.map(day => (
            <div key={day.date} style={{ ...card, marginBottom: 14, padding: 0, overflow: "hidden" }}>
              {/* Day header */}
              <div onClick={() => toggleDate(day.date)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", cursor: "pointer",
                  background: day.summary.breaches > 0 ? BREACH_BG : "#F9F8FF",
                  borderBottom: expandedDates[day.date] ? "1px solid #EDE8F4" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: DARK }}>{fmtDate(day.date)}</span>
                  {day.summary.breaches > 0 && (
                    <span style={{ background: BREACH, color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 10 }}>
                      ⚠ {day.summary.breaches} breach slot{day.summary.breaches > 1 ? "s" : ""}
                    </span>
                  )}
                  {day.summary.breaches === 0 && <span style={{ background: OK_BG, color: OK, fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 10 }}>✓ Fully compliant</span>}
                </div>
                <span style={{ color: MUTED, fontSize: 14 }}>{expandedDates[day.date] ? "▲" : "▼"}</span>
              </div>

              {/* Grid */}
              {expandedDates[day.date] && (
                <div style={{ overflowX: "auto" }}>
                  {view === "room" ? (
                    // Per-room grid
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#F3F0FF" }}>
                          <th style={{ padding: "8px 12px", textAlign: "left", color: MUTED, fontWeight: 600, whiteSpace: "nowrap", position: "sticky", left: 0, background: "#F3F0FF", zIndex: 1 }}>Time</th>
                          {(report.rooms || []).filter(r => !roomId || r.id === roomId).map(room => (
                            <th key={room.id} colSpan={3} style={{ padding: "8px 12px", textAlign: "center", color: DARK, fontWeight: 700, borderLeft: "2px solid #EDE8F4" }}>
                              {room.name}<br />
                              <span style={{ fontWeight: 400, color: MUTED, fontSize: 10 }}>1:{room.nqf_ratio}</span>
                            </th>
                          ))}
                        </tr>
                        <tr style={{ background: "#FAF8FF" }}>
                          <th style={{ padding: "4px 12px", position: "sticky", left: 0, background: "#FAF8FF", zIndex: 1 }} />
                          {(report.rooms || []).filter(r => !roomId || r.id === roomId).flatMap(room => [
                            <th key={room.id+"c"} style={{ padding: "4px 6px", textAlign: "center", color: MUTED, fontSize: 10, borderLeft: "2px solid #EDE8F4" }}>Children</th>,
                            <th key={room.id+"e"} style={{ padding: "4px 6px", textAlign: "center", color: MUTED, fontSize: 10 }}>Educators</th>,
                            <th key={room.id+"s"} style={{ padding: "4px 6px", textAlign: "center", color: MUTED, fontSize: 10 }}>Status</th>,
                          ])}
                        </tr>
                      </thead>
                      <tbody>
                        {day.slots.filter(s => {
                          // Only show slots with any children
                          return s.rooms?.some(r => r.children > 0) || true;
                        }).map((slot, si) => {
                          const hasActivity = slot.rooms?.some(r => r.children > 0);
                          return (
                            <tr key={slot.slot} style={{ background: si % 2 === 0 ? "#fff" : "#FAFAFA", opacity: hasActivity ? 1 : 0.45 }}>
                              <td style={{ padding: "6px 12px", color: MUTED, fontWeight: 600, whiteSpace: "nowrap", position: "sticky", left: 0, background: si % 2 === 0 ? "#fff" : "#FAFAFA", zIndex: 1 }}>
                                {slot.slot}
                              </td>
                              {(slot.rooms || []).filter(r => !roomId || r.room_id === roomId).flatMap((r, ri) => [
                                <td key={ri+"c"} style={{ padding: "6px 8px", textAlign: "center", background: r.breach ? BREACH_BG : r.children > 0 ? OK_BG : "transparent", borderLeft: "2px solid #EDE8F4" }}>
                                  <strong style={{ color: r.breach ? BREACH : r.children > 0 ? OK : MUTED }}>{r.children}</strong>
                                </td>,
                                <td key={ri+"e"} style={{ padding: "6px 8px", textAlign: "center", background: r.breach ? BREACH_BG : r.children > 0 ? OK_BG : "transparent" }}>
                                  <strong style={{ color: r.breach ? BREACH : r.children > 0 ? OK : MUTED }}>{r.educators}</strong>
                                  {r.breach && <span style={{ color: BREACH, fontSize: 10, display: "block" }}>need {r.required}</span>}
                                </td>,
                                <td key={ri+"s"} style={{ padding: "6px 8px", textAlign: "center", background: r.breach ? BREACH_BG : r.children > 0 ? OK_BG : "transparent" }}>
                                  {r.breach ? <span style={{ color: BREACH, fontWeight: 700 }}>⚠</span> : r.children > 0 ? <span style={{ color: OK }}>✓</span> : <span style={{ color: MUTED }}>—</span>}
                                </td>,
                              ])}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    // Centre-wide grid
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#F3F0FF" }}>
                          {["Time", "Children", "Educators", "Required", "Ratio", "Status"].map(h => (
                            <th key={h} style={{ padding: "8px 14px", textAlign: h === "Time" ? "left" : "center", color: MUTED, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {day.slots.map((slot, si) => (
                          <tr key={slot.slot} style={{
                            background: slot.breach ? BREACH_BG : si % 2 === 0 ? "#fff" : "#FAFAFA",
                            opacity: slot.children > 0 ? 1 : 0.4,
                          }}>
                            <td style={{ padding: "7px 14px", fontWeight: 600, color: MUTED, whiteSpace: "nowrap" }}>{slot.slot}</td>
                            <td style={{ padding: "7px 14px", textAlign: "center" }}>
                              <strong style={{ color: slot.breach ? BREACH : slot.children > 0 ? DARK : MUTED }}>{slot.children}</strong>
                            </td>
                            <td style={{ padding: "7px 14px", textAlign: "center" }}>
                              <strong style={{ color: slot.breach ? BREACH : slot.children > 0 ? DARK : MUTED }}>{slot.educators}</strong>
                            </td>
                            <td style={{ padding: "7px 14px", textAlign: "center", color: slot.breach ? BREACH : MUTED }}>{slot.required || "—"}</td>
                            <td style={{ padding: "7px 14px", textAlign: "center", color: slot.breach ? BREACH : DARK }}>{slot.ratio_achieved}</td>
                            <td style={{ padding: "7px 14px", textAlign: "center" }}>
                              {slot.breach
                                ? <span style={{ background: BREACH, color: "#fff", padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>⚠ BREACH</span>
                                : slot.children > 0
                                ? <span style={{ background: OK_BG, color: OK, padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>✓ OK</span>
                                : <span style={{ color: MUTED, fontSize: 11 }}>—</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {!report && !loading && (
        <div style={{ ...card, textAlign: "center", padding: "48px 20px", color: MUTED }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: DARK, marginBottom: 8 }}>Select a date range and generate the report</div>
          <p style={{ fontSize: 13, maxWidth: 360, margin: "0 auto" }}>
            The report shows educator:child ratios in 30-minute slots based on actual attendance sign-ins and educator clock records.
          </p>
        </div>
      )}
    </div>
  );
}
