/**
 * AnalyticsModule.jsx — v2.20.0
 *   📈 Attendance   — Trends, day-of-week, hourly peaks, absentee tracking
 *   🔮 Forecast     — 4-week attendance projection
 *   💵 Revenue      — Monthly billing, collection rates, trends
 *   📅 Schedule     — Publish roster to educators + medical alerts
 */
import { useState, useEffect, useCallback } from "react";

const API = (p, o={}) => {
  const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
  return fetch(p,{headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})},
    method:o.method||"GET",...(o.body?{body:JSON.stringify(o.body)}:{})}).then(r=>r.json());
};

const P="#7C3AED",PL="#EDE4F0",DARK="#3D3248",MU="#8A7F96";
const OK="#16A34A",WA="#D97706",DA="#DC2626",IN="#0284C7";
const card={background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"18px 22px"};
const bp={padding:"9px 18px",borderRadius:9,border:"none",background:P,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13};
const bs={padding:"9px 18px",borderRadius:9,border:`1px solid ${P}`,background:"#fff",color:P,fontWeight:600,cursor:"pointer",fontSize:13};
const inp={padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:13,width:"100%",boxSizing:"border-box",fontFamily:"inherit"};
const lbl={fontSize:11,color:MU,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"};
const fmtD=d=>d?new Date(d+"T12:00").toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"}):"—";
const fmt$=n=>`$${(n||0).toLocaleString("en-AU",{minimumFractionDigits:0})}`;

const TABS=[
  {id:"attendance",icon:"📈",label:"Attendance"},
  {id:"forecast",  icon:"🔮",label:"Forecast"},
  {id:"revenue",   icon:"💵",label:"Revenue"},
  {id:"schedule",  icon:"📅",label:"Schedule & Alerts"},
];

export default function AnalyticsModule() {
  const [tab,setTab]=useState("attendance");
  return (
    <div style={{padding:"24px 28px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
        <span style={{fontSize:28}}>📈</span>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>Analytics & Schedule</h1>
          <p style={{margin:"3px 0 0",fontSize:13,color:MU}}>Attendance · Forecast · Revenue · Schedule publishing</p>
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:24,borderBottom:"1px solid #EDE8F4",paddingBottom:12}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"8px 16px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,
              fontWeight:tab===t.id?700:500,background:tab===t.id?P:"transparent",color:tab===t.id?"#fff":MU}}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab==="attendance" && <AttendanceTab />}
      {tab==="forecast"   && <ForecastTab />}
      {tab==="revenue"    && <RevenueTab />}
      {tab==="schedule"   && <ScheduleTab />}
    </div>
  );
}

// ─── ATTENDANCE TAB ───────────────────────────────────────────────────────────
function AttendanceTab() {
  const [data,setData]=useState(null);
  const [rooms,setRooms]=useState([]);
  const [roomFilter,setRoomFilter]=useState("");
  const [weeks,setWeeks]=useState(8);

  const load=useCallback(()=>{
    Promise.all([
      API(`/api/analytics/attendance?weeks=${weeks}${roomFilter?`&room_id=${roomFilter}`:""}`)  ,
      API("/api/rooms/simple"),
    ]).then(([d,r])=>{
      setData(d);
      setRooms(Array.isArray(r)?r:[]);
    });
  },[weeks,roomFilter]);
  useEffect(()=>{load();},[load]);

  if(!data)return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"60px 20px",color:"#8A7F96"}}><div style={{width:36,height:36,border:"3px solid #EDE8F4",borderTopColor:"#7C3AED",borderRadius:"50%",animation:"spin 0.8s linear infinite",marginBottom:12}}/><div style={{fontSize:13,fontWeight:600}}>Loading analytics...</div></div>;

  const maxPresent=Math.max(...(data.daily||[]).map(d=>d.present),1);
  const avgRate=data.weekly?.length
    ? Math.round(data.weekly.reduce((s,w)=>s+(w.attendance_rate||0),0)/data.weekly.length)
    : 0;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Controls */}
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:6}}>
          {[4,8,12,24].map(w=>(
            <button key={w} onClick={()=>setWeeks(w)}
              style={{padding:"5px 12px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
                background:weeks===w?P:"#F0EBF8",color:weeks===w?"#fff":P}}>
              {w}w
            </button>
          ))}
        </div>
        <select value={roomFilter} onChange={e=>setRoomFilter(e.target.value)}
          style={{...inp,width:160}}>
          <option value="">All Rooms</option>
          {rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <div style={{fontSize:13,color:MU,marginLeft:"auto"}}>
          Avg attendance rate: <strong style={{color:avgRate>=80?OK:avgRate>=60?WA:DA}}>{avgRate}%</strong>
        </div>
      </div>

      {/* Daily chart */}
      <div style={card}>
        <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:16}}>Daily Attendance — Last {weeks} Weeks</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:1,height:100,overflowX:"auto"}}>
          {data.daily?.map((d,i)=>{
            const h=Math.round((d.present/maxPresent)*88);
            const isToday=d.date===new Date().toISOString().split("T")[0];
            return (
              <div key={i} style={{flex:"0 0 auto",width:8,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
                <div style={{width:"100%",height:h,
                  background:isToday?"#F59E0B":d.absent>0?`${P}90`:P,
                  borderRadius:"2px 2px 0 0",minHeight:2}}
                  title={`${d.date}: ${d.present} present, ${d.absent} absent`}/>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:12,fontSize:11,marginTop:8}}>
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:2,background:P,display:"inline-block"}}/> Present</span>
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:2,background:"#F59E0B",display:"inline-block"}}/> Today</span>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* Day-of-week breakdown */}
        <div style={card}>
          <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:14}}>By Day of Week</div>
          {data.by_dow?.map(d=>(
            <div key={d.dow} style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                <span style={{fontWeight:600,color:DARK}}>{d.day_name}</span>
                <span style={{color:MU}}>{Math.round(d.avg_present||0)} avg · {d.attendance_rate}%</span>
              </div>
              <div style={{background:"#F0EBF8",borderRadius:4,height:8}}>
                <div style={{width:`${d.attendance_rate||0}%`,height:"100%",
                  background:d.attendance_rate>=80?OK:d.attendance_rate>=60?WA:DA,borderRadius:4}}/>
              </div>
            </div>
          ))}
        </div>

        {/* Arrival peaks */}
        <div style={card}>
          <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:14}}>Arrival Times</div>
          {data.hourly?.length===0
            ? <div style={{color:MU,fontSize:12,textAlign:"center",padding:"20px 0"}}>No sign-in data yet</div>
            : (()=>{
              const maxArrivals=Math.max(...(data.hourly||[]).map(h=>h.arrivals),1);
              return data.hourly?.map(h=>(
                <div key={h.hour} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <div style={{width:40,fontSize:11,color:MU,textAlign:"right"}}>{h.hour}:00</div>
                  <div style={{flex:1,background:"#F0EBF8",borderRadius:4,height:12}}>
                    <div style={{width:`${(h.arrivals/maxArrivals)*100}%`,height:"100%",background:IN,borderRadius:4}}/>
                  </div>
                  <div style={{width:24,fontSize:11,color:MU}}>{h.arrivals}</div>
                </div>
              ));
            })()
          }
        </div>
      </div>

      {/* Absentee report */}
      {data.absentees?.length>0&&(
        <div style={card}>
          <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:12}}>Children with High Absence Rates</div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:"#F8F5FC"}}>
              {["Child","Room","Absences","Total Days","Absence Rate"].map(h=>(
                <th key={h} style={{padding:"7px 10px",textAlign:"left",color:MU,fontWeight:700,fontSize:11}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {data.absentees.map((a,i)=>(
                <tr key={i} style={{borderBottom:"1px solid #F0EBF8"}}>
                  <td style={{padding:"7px 10px",fontWeight:600,color:DARK}}>{a.first_name} {a.last_name}</td>
                  <td style={{padding:"7px 10px",color:MU}}>{a.room||"—"}</td>
                  <td style={{padding:"7px 10px",color:DA,fontWeight:700}}>{a.absences}</td>
                  <td style={{padding:"7px 10px",color:MU}}>{a.total_days}</td>
                  <td style={{padding:"7px 10px"}}>
                    <span style={{fontWeight:700,color:a.absence_rate>=30?DA:a.absence_rate>=15?WA:MU}}>
                      {a.absence_rate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── FORECAST TAB ─────────────────────────────────────────────────────────────
function ForecastTab() {
  const [data,setData]=useState(null);
  useEffect(()=>{API("/api/analytics/forecast").then(setData);},[]);
  if(!data)return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"60px 20px",color:"#8A7F96"}}><div style={{width:36,height:36,border:"3px solid #EDE8F4",borderTopColor:"#7C3AED",borderRadius:"50%",animation:"spin 0.8s linear infinite",marginBottom:12}}/><div style={{fontSize:13,fontWeight:600}}>Loading analytics...</div></div>;

  const DOW_C={"1":"#7C3AED","2":"#0284C7","3":"#16A34A","4":"#D97706","5":"#DC2626"};
  const maxForecast=Math.max(...(data.forecast||[]).map(d=>d.forecast_present),1);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{...card,background:"#F3E8FF",border:"1px solid #C4B5FD",padding:"14px 18px"}}>
        <div style={{fontWeight:700,fontSize:13,color:P}}>🔮 4-Week Attendance Forecast</div>
        <p style={{fontSize:12,color:MU,margin:"4px 0 0"}}>
          Based on your historical attendance patterns by day of week. Currently enrolled: <strong>{data.enrolled}</strong> children.
        </p>
      </div>

      <div style={card}>
        <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:16}}>Projected Daily Attendance</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:120}}>
          {(data.forecast||[]).map((d,i)=>{
            const h=Math.round((d.forecast_present/maxForecast)*100);
            const isThisWeek=i<5;
            return (
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <div style={{fontSize:9,color:DOW_C[d.dow]||P,fontWeight:700}}>{d.forecast_present}</div>
                <div style={{width:"100%",height:h,
                  background:isThisWeek?DOW_C[d.dow]||P:(DOW_C[d.dow]||P)+"60",
                  borderRadius:"3px 3px 0 0",minHeight:4,
                  border:isThisWeek?"none":`1px dashed ${DOW_C[d.dow]||P}`}}
                  title={`${d.date}: ~${d.forecast_present} children`}/>
                <div style={{fontSize:8,color:MU,transform:"rotate(-45deg)",transformOrigin:"top left",whiteSpace:"nowrap",marginTop:4}}>
                  {d.date?.slice(5)}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:12,fontSize:11,marginTop:20}}>
          <span style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{width:12,height:12,borderRadius:2,background:P,display:"inline-block"}}/>This week (solid)
          </span>
          <span style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{width:12,height:12,borderRadius:2,border:`1px dashed ${P}`,display:"inline-block"}}/>Future weeks (projected)
          </span>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
        {Object.entries(data.avg_by_dow||{}).map(([dow,avg])=>{
          const dayNames=["","Monday","Tuesday","Wednesday","Thursday","Friday"];
          return (
            <div key={dow} style={{...card,textAlign:"center",borderTop:`3px solid ${DOW_C[dow]||P}`}}>
              <div style={{fontSize:24,fontWeight:900,color:DOW_C[dow]||P}}>{avg}</div>
              <div style={{fontSize:11,color:MU,marginTop:4}}>{dayNames[parseInt(dow)]}</div>
              <div style={{fontSize:10,color:MU}}>avg present</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── REVENUE TAB ──────────────────────────────────────────────────────────────
function RevenueTab() {
  const [data,setData]=useState(null);
  useEffect(()=>{API("/api/analytics/revenue").then(setData);},[]);
  if(!data)return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"60px 20px",color:"#8A7F96"}}><div style={{width:36,height:36,border:"3px solid #EDE8F4",borderTopColor:"#7C3AED",borderRadius:"50%",animation:"spin 0.8s linear infinite",marginBottom:12}}/><div style={{fontSize:13,fontWeight:600}}>Loading analytics...</div></div>;

  const maxBilled=Math.max(...(data.monthly||[]).map(m=>m.billed),1);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        {[
          ["This Month Billed",fmt$(data.this_month?.billed||0),P],
          ["This Month Collected",fmt$(data.this_month?.collected||0),OK],
          ["Collection Rate",`${data.collection_rate||0}%`,data.collection_rate>=90?OK:data.collection_rate>=70?WA:DA],
          ["MoM Change",`${data.mom_change>0?"+":""}${data.mom_change||0}%`,data.mom_change>=0?OK:DA],
        ].map(([l,v,c])=>(
          <div key={l} style={{...card,textAlign:"center",borderTop:`3px solid ${c}`}}>
            <div style={{fontSize:20,fontWeight:900,color:c}}>{v}</div>
            <div style={{fontSize:11,color:MU,marginTop:4}}>{l}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:16}}>Monthly Revenue — Last 12 Months</div>
        {data.monthly?.length===0
          ? <div style={{color:MU,textAlign:"center",padding:"30px 0"}}>No invoice data yet</div>
          : <div style={{display:"flex",alignItems:"flex-end",gap:6,height:120}}>
              {[...(data.monthly||[])].reverse().map((m,i)=>{
                const billedH=Math.round((m.billed/maxBilled)*100);
                const collH=Math.round((m.collected/maxBilled)*100);
                return (
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                    <div style={{width:"100%",position:"relative",height:billedH}}>
                      <div style={{position:"absolute",bottom:0,width:"100%",height:billedH,background:`${P}30`,borderRadius:"3px 3px 0 0"}}/>
                      <div style={{position:"absolute",bottom:0,width:"100%",height:collH,background:OK,borderRadius:"3px 3px 0 0"}}/>
                    </div>
                    <div style={{fontSize:9,color:MU,transform:"rotate(-45deg)",transformOrigin:"top left",whiteSpace:"nowrap",marginTop:4}}>
                      {m.month?.slice(5)}
                    </div>
                  </div>
                );
              })}
            </div>
        }
        <div style={{display:"flex",gap:12,fontSize:11,marginTop:20}}>
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:12,height:12,borderRadius:2,background:`${P}30`,display:"inline-block"}}/> Billed</span>
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:12,height:12,borderRadius:2,background:OK,display:"inline-block"}}/> Collected</span>
        </div>
      </div>

      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,...card}}>
        <thead><tr style={{background:"#F8F5FC"}}>
          {["Month","Invoices","Billed","Collected","Overdue","Collection Rate"].map(h=>(
            <th key={h} style={{padding:"8px 12px",textAlign:"left",color:MU,fontWeight:700,fontSize:11}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {(data.monthly||[]).map((m,i)=>(
            <tr key={i} style={{borderBottom:"1px solid #F0EBF8"}}>
              <td style={{padding:"8px 12px",fontWeight:600,color:DARK}}>{m.month}</td>
              <td style={{padding:"8px 12px",color:MU}}>{m.invoice_count}</td>
              <td style={{padding:"8px 12px"}}>{fmt$(m.billed)}</td>
              <td style={{padding:"8px 12px",color:OK,fontWeight:600}}>{fmt$(m.collected)}</td>
              <td style={{padding:"8px 12px",color:m.overdue>0?DA:MU}}>{fmt$(m.overdue)}</td>
              <td style={{padding:"8px 12px"}}>
                <span style={{fontWeight:700,color:m.billed>0?(m.collected/m.billed>=0.9?OK:m.collected/m.billed>=0.7?WA:DA):MU}}>
                  {m.billed>0?Math.round(m.collected/m.billed*100):0}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── SCHEDULE TAB ─────────────────────────────────────────────────────────────
function ScheduleTab() {
  const [schedule,setSchedule]=useState(null);
  const [medAlerts,setMedAlerts]=useState(null);
  const [weekStart,setWeekStart]=useState(()=>{
    const d=new Date();
    const day=d.getDay();
    d.setDate(d.getDate()-(day===0?6:day-1));
    return d.toISOString().split("T")[0];
  });
  const [publishing,setPublishing]=useState(false);
  const [pubMsg,setPubMsg]=useState("");
  const [view,setView]=useState("schedule");

  const load=useCallback(()=>{
    Promise.all([
      API(`/api/schedule/current?week_start=${weekStart}`),
      API("/api/schedule/medical-alerts"),
    ]).then(([s,m])=>{
      setSchedule(s);
      setMedAlerts(m);
    });
  },[weekStart]);
  useEffect(()=>{load();},[load]);

  const [publishHistory,setPublishHistory]=useState([]);

  const loadHistory=useCallback(()=>{
    API("/api/schedule/history").then(r=>setPublishHistory(r.history||[])).catch(()=>{});
  },[]);
  useEffect(()=>{loadHistory();},[loadHistory]);

  const publish=async()=>{
    setPublishing(true);
    const r=await API("/api/schedule/publish",{method:"POST",body:{week_start:weekStart,message:pubMsg}});
    setPublishing(false);
    if(r.ok){alert(`✓ ${r.message}`);setPubMsg("");loadHistory();}
    else alert(r.error);
  };

  const prevWeek=()=>{const d=new Date(weekStart+"T12:00");d.setDate(d.getDate()-7);setWeekStart(d.toISOString().split("T")[0]);};
  const nextWeek=()=>{const d=new Date(weekStart+"T12:00");d.setDate(d.getDate()+7);setWeekStart(d.toISOString().split("T")[0]);};

  const DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday"];
  const SEVER_C={critical:DA,high:WA,moderate:IN,mild:OK};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:6}}>
        {["schedule","alerts"].map(v=>(
          <button key={v} onClick={()=>setView(v)}
            style={{padding:"7px 16px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              textTransform:"capitalize",background:view===v?P:"#F0EBF8",color:view===v?"#fff":P,position:"relative"}}>
            {v==="schedule"?"📅 Roster":"🏥 Medical Alerts"}
            {v==="alerts"&&medAlerts?.alerts?.length>0&&(
              <span style={{marginLeft:6,background:DA,color:"#fff",borderRadius:20,padding:"1px 6px",fontSize:10,fontWeight:900}}>
                {medAlerts.alerts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {view==="schedule"&&(
        <>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <button onClick={prevWeek} style={{...bs,padding:"6px 12px",fontSize:12}}>← Prev</button>
            <div style={{fontWeight:700,fontSize:15,color:DARK,flex:1,textAlign:"center"}}>
              Week of {new Date(weekStart+"T12:00").toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"})}
            </div>
            <button onClick={nextWeek} style={{...bs,padding:"6px 12px",fontSize:12}}>Next →</button>
            <button onClick={publish} disabled={publishing} style={bp}>
              {publishing?"Publishing…":"📤 Publish to Educators"}
            </button>
          </div>

          <div style={{display:"flex",gap:8,alignItems:"flex-end",marginBottom:4}}>
            <div style={{flex:1}}>
              <input value={pubMsg} onChange={e=>setPubMsg(e.target.value)}
                style={inp} placeholder="Optional message to include with schedule…"/>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
            {DAYS.map((day,di)=>{
              const dateStr=new Date(new Date(weekStart+"T12:00").getTime()+di*86400000).toISOString().split("T")[0];
              const dayShifts=schedule?.shifts?.[dateStr]||[];
              return (
                <div key={day} style={card}>
                  <div style={{fontWeight:700,fontSize:12,color:DARK,marginBottom:8}}>
                    {day}<div style={{fontSize:10,color:MU,fontWeight:400}}>{new Date(dateStr+"T12:00").toLocaleDateString("en-AU",{day:"numeric",month:"short"})}</div>
                  </div>
                  {dayShifts.length===0
                    ? <div style={{fontSize:11,color:MU,textAlign:"center",padding:"10px 0"}}>No shifts</div>
                    : dayShifts.map((s,i)=>(
                      <div key={i} style={{padding:"6px 8px",borderRadius:8,background:"#F8F5FC",marginBottom:6,
                        borderLeft:`3px solid ${s.status==="unfilled"?DA:P}`}}>
                        <div style={{fontWeight:600,fontSize:11,color:DARK}}>{s.first_name} {s.last_name}</div>
                        <div style={{fontSize:10,color:MU}}>{s.start_time||"—"}–{s.end_time||"—"}</div>
                        {s.room_name&&<div style={{fontSize:10,color:P}}>{s.room_name}</div>}
                        {s.status==="unfilled"&&<div style={{fontSize:9,color:DA,fontWeight:700}}>UNFILLED</div>}
                      </div>
                    ))
                  }
                </div>
              );
            })}
          </div>
        </>
      )}

      {view==="alerts"&&medAlerts&&(
        <div>
          <div style={{...card,background:"#FEF2F2",border:"1px solid #FCA5A5",marginBottom:16,padding:"12px 18px"}}>
            <div style={{fontWeight:700,fontSize:13,color:DA}}>
              🏥 {medAlerts.alerts?.length||0} children with medical conditions signed in today
            </div>
            <p style={{fontSize:12,color:MU,margin:"4px 0 0"}}>
              Ensure relevant educators are aware of each child's needs.
            </p>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:12,marginBottom:16}}>
            {medAlerts.alerts?.map((child,i)=>(
              <div key={i} style={{...card,borderLeft:`4px solid ${SEVER_C[child.severity]||DA}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:DARK}}>{child.first_name} {child.last_name}</div>
                    <div style={{fontSize:11,color:MU}}>{child.room_name}</div>
                  </div>
                  {child.severity&&<span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,
                    background:(SEVER_C[child.severity]||DA)+"20",color:SEVER_C[child.severity]||DA,textTransform:"capitalize"}}>
                    {child.severity}
                  </span>}
                </div>
                {child.medical_conditions&&(
                  <div style={{fontSize:12,color:DA,fontWeight:700,marginBottom:4}}>🏥 {child.medical_conditions}</div>
                )}
                {child.allergies&&(
                  <div style={{fontSize:12,color:WA,fontWeight:700,marginBottom:4}}>⚠️ {child.allergies}</div>
                )}
                {child.condition_name&&(
                  <div style={{fontSize:11,color:DARK,marginBottom:4}}>
                    <strong>{child.plan_type}:</strong> {child.condition_name}
                  </div>
                )}
                {child.action_plan&&(
                  <div style={{fontSize:11,color:MU,padding:"6px 10px",borderRadius:8,background:"#F8F5FC",marginTop:6}}>
                    📋 {child.action_plan}
                  </div>
                )}
                {child.emergency_contact_phone&&(
                  <a href={`tel:${child.emergency_contact_phone}`}
                    style={{display:"block",marginTop:8,padding:"5px 12px",borderRadius:8,background:DA,
                      color:"#fff",textDecoration:"none",fontSize:12,fontWeight:700,textAlign:"center"}}>
                    📞 {child.emergency_contact_name}: {child.emergency_contact_phone}
                  </a>
                )}
              </div>
            ))}
          </div>

          {medAlerts.meds_due?.length>0&&(
            <div style={card}>
              <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:12}}>💊 Medications to Administer Today</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:"#F8F5FC"}}>
                  {["Child","Room","Medication","Dose","Instructions"].map(h=>(
                    <th key={h} style={{padding:"7px 10px",textAlign:"left",color:MU,fontWeight:700,fontSize:11}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {medAlerts.meds_due.map((m,i)=>(
                    <tr key={i} style={{borderBottom:"1px solid #F0EBF8"}}>
                      <td style={{padding:"7px 10px",fontWeight:600,color:DARK}}>{m.first_name} {m.last_name}</td>
                      <td style={{padding:"7px 10px",color:MU}}>{m.room_name}</td>
                      <td style={{padding:"7px 10px",fontWeight:600,color:IN}}>{m.medication_name}</td>
                      <td style={{padding:"7px 10px",color:MU}}>{m.dose}</td>
                      <td style={{padding:"7px 10px",color:MU}}>{m.instructions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {medAlerts.alerts?.length===0&&medAlerts.meds_due?.length===0&&(
            <div style={{...card,textAlign:"center",padding:"40px 20px",color:MU}}>
              <div style={{fontSize:40}}>✅</div>
              <div style={{marginTop:8,fontWeight:600,color:DARK}}>No medical alerts for today</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
