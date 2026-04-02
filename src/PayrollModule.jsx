/**
 * PayrollModule.jsx — v2.13.0
 * Payroll summary + export for MYOB / Xero / CSV
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
const fmt$=n=>`$${(n||0).toFixed(2)}`;
const fmtH=n=>`${(n||0).toFixed(1)}h`;

function getMondayFortnight() {
  const d=new Date();
  const day=d.getDay();
  const diff=d.getDate()-(day===0?6:day-1);
  const mon=new Date(d);mon.setDate(diff);
  const sun=new Date(mon);sun.setDate(mon.getDate()+13);
  return {
    from:mon.toISOString().split("T")[0],
    to:sun.toISOString().split("T")[0],
  };
}

export default function PayrollModule() {
  const period = getMondayFortnight();
  const [from, setFrom] = useState(period.from);
  const [to,   setTo]   = useState(period.to);
  const [data,     setData]     = useState(null);
  const [exports,  setExports]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [exporting,setExporting]= useState(false);
  const [expType,  setExpType]  = useState("csv");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      API(`/api/payroll/summary?from=${from}&to=${to}`),
      API("/api/payroll/exports"),
    ]).then(([s, e]) => {
      setData(s);
      setExports(e.exports || []);
      setLoading(false);
    });
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const doExport = async () => {
    setExporting(true);
    const r = await API("/api/payroll/export", { method:"POST", body: { from, to, export_type: expType, generated_by: "Director" } }).catch(e=>console.error('API error:',e));
    if (r?.csv) {
      const blob = new Blob([r.csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = r.filename || `payroll-${from}-${to}.csv`;
      a.click();
    }
    setExporting(false);
    load();
  };

  const QUAL_COLORS = { ect:"#7C3AED", diploma:"#0284C7", cert3:"#16A34A", working_towards:"#D97706" };

  return (
    <div style={{padding:"24px 28px",maxWidth:1100,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
        <span style={{fontSize:28}}>💵</span>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>Payroll Export</h1>
          <p style={{margin:"3px 0 0",fontSize:13,color:MU}}>SCHCADS Award · MYOB · Xero · CSV export</p>
        </div>
      </div>

      {/* Controls */}
      <div style={{...card,marginBottom:20,display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div>
          <label style={lbl}>Pay Period Start</label>
          <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{...inp,width:160}}/>
        </div>
        <div>
          <label style={lbl}>Pay Period End</label>
          <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={{...inp,width:160}}/>
        </div>
        <button style={{...bs,alignSelf:"flex-end"}} onClick={load} disabled={loading}>
          {loading?"Loading…":"Calculate"}
        </button>
        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"flex-end"}}>
          <div>
            <label style={lbl}>Export Format</label>
            <select value={expType} onChange={e=>setExpType(e.target.value)} style={{...inp,width:140}}>
              <option value="csv">Standard CSV</option>
              <option value="myob">MYOB AccountRight</option>
              <option value="xero">Xero Payroll</option>
            </select>
          </div>
          <button style={bp} onClick={doExport} disabled={exporting||!data?.educators?.length}>
            {exporting?"Exporting…":"⬇ Export"}
          </button>
        </div>
      </div>

      {/* Summary tiles */}
      {data && (
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
            {[
              ["Total Hours",    fmtH(data.totals?.total_hours),  P],
              ["Total Gross Pay",fmt$(data.totals?.total_gross),   OK],
              ["Super (11.5%)",  fmt$(data.totals?.total_gross*0.115), IN],
              ["Educators",      data.totals?.educator_count,      WA],
            ].map(([l,v,c])=>(
              <div key={l} style={{...card,textAlign:"center",borderTop:`3px solid ${c}`}}>
                <div style={{fontSize:22,fontWeight:900,color:c}}>{v}</div>
                <div style={{fontSize:11,color:MU,marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>

          {/* Per-educator breakdown */}
          <div style={card}>
            <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:14}}>
              Educator Breakdown — {data.period?.start} to {data.period?.end}
            </div>
            {data.educators?.length === 0
              ? <div style={{color:MU,textAlign:"center",padding:"30px 0",fontSize:13}}>
                  No clock records found for this period
                </div>
              : <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead><tr style={{background:"#F8F5FC"}}>
                    {["Educator","Qualification","Ordinary","Overtime","Total","Rate","Gross","Super"].map(h=>(
                      <th key={h} style={{padding:"8px 10px",textAlign:"left",color:MU,fontWeight:700,fontSize:11}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {data.educators?.map(e=>(
                      <tr key={e.educator_id} style={{borderBottom:"1px solid #F0EBF8"}}>
                        <td style={{padding:"8px 10px",fontWeight:600,color:DARK}}>{e.name}</td>
                        <td style={{padding:"8px 10px"}}>
                          <span style={{fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:20,
                            background:(QUAL_COLORS[e.qualification]||MU)+"20",
                            color:QUAL_COLORS[e.qualification]||MU}}>
                            {e.qualification}
                          </span>
                        </td>
                        <td style={{padding:"8px 10px",color:MU}}>{fmtH(e.ordinary_hours)}</td>
                        <td style={{padding:"8px 10px",color:e.overtime_hours>0?WA:MU}}>{fmtH(e.overtime_hours)}</td>
                        <td style={{padding:"8px 10px",fontWeight:600}}>{fmtH(e.total_hours)}</td>
                        <td style={{padding:"8px 10px",color:MU}}>{fmt$(e.base_hourly_rate)}/h</td>
                        <td style={{padding:"8px 10px",fontWeight:700,color:OK}}>{fmt$(e.gross_pay)}</td>
                        <td style={{padding:"8px 10px",color:IN}}>{fmt$(e.gross_pay*0.115)}</td>
                      </tr>
                    ))}
                    <tr style={{background:"#F8F5FC",fontWeight:700}}>
                      <td colSpan={4} style={{padding:"10px",color:DARK}}>TOTALS</td>
                      <td style={{padding:"10px",color:DARK}}>{fmtH(data.totals?.total_hours)}</td>
                      <td style={{padding:"10px"}}/>
                      <td style={{padding:"10px",color:OK}}>{fmt$(data.totals?.total_gross)}</td>
                      <td style={{padding:"10px",color:IN}}>{fmt$(data.totals?.total_gross*0.115)}</td>
                    </tr>
                  </tbody>
                </table>
            }
          </div>

          {/* Shift detail per educator */}
          {data.educators?.map(e=>(
            e.shifts?.length > 0 && (
              <details key={e.educator_id} style={{...card,marginTop:10}}>
                <summary style={{cursor:"pointer",fontWeight:600,fontSize:13,color:DARK,userSelect:"none"}}>
                  {e.name} — {e.shifts.length} shifts · {fmtH(e.total_hours)} · {fmt$(e.gross_pay)}
                </summary>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginTop:10}}>
                  <thead><tr style={{background:"#F8F5FC"}}>
                    {["Date","Clock In","Clock Out","Break","Net Hours"].map(h=>(
                      <th key={h} style={{padding:"6px 10px",textAlign:"left",color:MU,fontWeight:700,fontSize:11}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {e.shifts.map((s,i)=>(
                      <tr key={i} style={{borderBottom:"1px solid #F0EBF8"}}>
                        <td style={{padding:"6px 10px",color:DARK}}>{new Date(s.date+"T12:00").toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"})}</td>
                        <td style={{padding:"6px 10px",color:MU}}>{s.clock_in?.slice(0,5)||"—"}</td>
                        <td style={{padding:"6px 10px",color:MU}}>{s.clock_out?.slice(0,5)||"—"}</td>
                        <td style={{padding:"6px 10px",color:MU}}>{s.break_minutes?`${s.break_minutes}m`:"—"}</td>
                        <td style={{padding:"6px 10px",fontWeight:600}}>{fmtH(s.hours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )
          ))}
        </>
      )}

      {/* Export history */}
      {exports.length > 0 && (
        <div style={{...card,marginTop:20}}>
          <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:12}}>Export History</div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:"#F8F5FC"}}>
              {["Period","Format","Educators","Total Hours","Total Cost","Generated"].map(h=>(
                <th key={h} style={{padding:"7px 10px",textAlign:"left",color:MU,fontWeight:700,fontSize:11}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {exports.map(e=>(
                <tr key={e.id} style={{borderBottom:"1px solid #F0EBF8"}}>
                  <td style={{padding:"7px 10px",color:DARK}}>{e.period_start} → {e.period_end}</td>
                  <td style={{padding:"7px 10px"}}><span style={{fontWeight:700,color:P,textTransform:"uppercase",fontSize:10}}>{e.export_type}</span></td>
                  <td style={{padding:"7px 10px",color:MU}}>{e.educator_count}</td>
                  <td style={{padding:"7px 10px",color:MU}}>{fmtH(e.total_hours)}</td>
                  <td style={{padding:"7px 10px",fontWeight:600,color:OK}}>{fmt$(e.total_cost_cents/100)}</td>
                  <td style={{padding:"7px 10px",color:MU}}>{new Date(e.generated_at).toLocaleDateString("en-AU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
