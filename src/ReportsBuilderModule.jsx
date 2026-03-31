/**
 * ReportsBuilderModule.jsx — v2.18.0
 *   📊 Reports       — Custom report builder with 6 report types, CSV export
 *   🚨 Emergency     — Emergency contacts fast-dial by room
 *   ⚠️  Risk          — Excursion risk assessments with hazard library
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

const fmtD=d=>d?new Date(d.length===10?d+"T12:00":d).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):"—";

const RISK_C={low:OK,medium:WA,high:DA,extreme:"#7F1D1D"};
const RISK_BG={low:"#F0FDF4",medium:"#FFFBEB",high:"#FEF2F2",extreme:"#FFF1F2"};

const TABS=[
  {id:"reports",   icon:"📊", label:"Report Builder"},
  {id:"emergency", icon:"🚨", label:"Emergency Contacts"},
  {id:"risk",      icon:"⚠️", label:"Risk Assessments"},
];

export default function ReportsBuilderModule() {
  const [tab,setTab]=useState("reports");
  return (
    <div style={{padding:"24px 28px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
        <span style={{fontSize:28}}>📊</span>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>Reports & Safety</h1>
          <p style={{margin:"3px 0 0",fontSize:13,color:MU}}>Custom reports · Emergency contacts · Risk assessments</p>
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
      {tab==="reports"   && <ReportsTab />}
      {tab==="emergency" && <EmergencyTab />}
      {tab==="risk"      && <RiskTab />}
      {tab==="schedules"  && <ScheduledReportsTab />}
    </div>
  );
}

// ─── REPORTS TAB ──────────────────────────────────────────────────────────────
function ReportsTab() {
  const [types,setTypes]=useState([]);
  const [selType,setSelType]=useState(null);
  const [config,setConfig]=useState({from:"",to:"",room_id:""});
  const [rooms,setRooms]=useState([]);
  const [result,setResult]=useState(null);
  const [running,setRunning]=useState(false);
  const [saved,setSaved]=useState([]);

  useEffect(()=>{
    Promise.all([
      API("/api/reports-builder/types"),
      API("/api/rooms/simple"),
      API("/api/reports-builder/saved"),
    ]).then(([t,r,s])=>{
      setTypes(t.types||[]);
      setRooms(Array.isArray(r)?r:[]);
      setSaved(s.reports||[]);
      if(t.types?.[0]) setSelType(t.types[0].id);
    });
  },[]);

  const run=async()=>{
    if(!selType)return;
    setRunning(true);
    const r=await API("/api/reports-builder/run",{method:"POST",body:{report_type:selType,config}}.catch(e=>console.error('API error:',e)));
    setResult(r);setRunning(false);
  };

  const exportCSV=()=>{
    if(!result?.rows)return;
    const cols=result.columns||[];
    const rows=result.rows;
    const header=cols.join(",")+"\n";
    const body=rows.map(row=>cols.map(col=>{
      const key=col.toLowerCase().replace(/ /g,"_");
      const val=row[key]??row[col]??"";
      return `"${String(val).replace(/"/g,'""')}"`;
    }).join(",")).join("\n");
    const blob=new Blob([header+body],{type:"text/csv"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=`${selType}-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const saveReport=async()=>{
    const name=prompt("Report name:");
    if(!name)return;
    await API("/api/reports-builder/saved",{method:"POST",body:{name,report_type:selType,config}}.catch(e=>console.error('API error:',e)));
    const s=await API("/api/reports-builder/saved".catch(e=>console.error('API error:',e)));
    setSaved(s.reports||[]);
  };

  const loadSaved=async(r)=>{
    setSelType(r.report_type);
    setConfig(r.config||{});
  };

  const deleteSaved=async(id)=>{
    await API(`/api/reports-builder/saved/${id}`,{method:"DELETE"}.catch(e=>console.error('API error:',e)));
    setSaved(s=>s.filter(r=>r.id!==id));
  };

  const TYPE_ICONS={attendance:"📋",educator_hours:"⏱️",enrolment:"👶",compliance:"🛡️",debt:"💳",occupancy:"📈"};

  return (
    <div style={{display:"flex",gap:20}}>
      {/* Left: config */}
      <div style={{width:280,flexShrink:0}}>
        <div style={{marginBottom:16}}>
          <label style={lbl}>Report Type</label>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:6}}>
            {types.map(t=>(
              <button key={t.id} onClick={()=>{setSelType(t.id);setResult(null);}}
                style={{padding:"10px 14px",borderRadius:10,border:`1px solid ${selType===t.id?P:"#EDE8F4"}`,
                  background:selType===t.id?PL:"#fff",textAlign:"left",cursor:"pointer"}}>
                <div style={{fontWeight:selType===t.id?700:500,fontSize:13,color:DARK}}>
                  {TYPE_ICONS[t.id]||"📊"} {t.label}
                </div>
                <div style={{fontSize:11,color:MU,marginTop:2}}>{t.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div style={{...card,padding:"14px",marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:12,color:DARK,marginBottom:10}}>Filters</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div>
              <label style={lbl}>From Date</label>
              <input type="date" value={config.from} onChange={e=>setConfig(p=>({...p,from:e.target.value}))} style={inp}/>
            </div>
            <div>
              <label style={lbl}>To Date</label>
              <input type="date" value={config.to} onChange={e=>setConfig(p=>({...p,to:e.target.value}))} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Room (optional)</label>
              <select value={config.room_id} onChange={e=>setConfig(p=>({...p,room_id:e.target.value}))} style={inp}>
                <option value="">All Rooms</option>
                {rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
          <button onClick={run} disabled={running} style={{...bp,width:"100%",marginTop:12}}>
            {running?"Running…":"▶ Run Report"}
          </button>
        </div>

        {/* Saved reports */}
        {saved.length>0&&(
          <div style={card}>
            <div style={{fontWeight:700,fontSize:12,color:DARK,marginBottom:10}}>Saved Reports</div>
            {saved.map(r=>(
              <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #F0EBF8"}}>
                <button onClick={()=>loadSaved(r)} style={{background:"none",border:"none",cursor:"pointer",color:P,fontSize:12,fontWeight:600,textAlign:"left"}}>
                  {r.name}
                </button>
                <button onClick={()=>deleteSaved(r.id)} style={{background:"none",border:"none",cursor:"pointer",color:MU,fontSize:16}}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: results */}
      <div style={{flex:1}}>
        {!result&&(
          <div style={{...card,textAlign:"center",padding:"60px 20px",color:MU}}>
            <div style={{fontSize:40}}>📊</div>
            <div style={{marginTop:12,fontWeight:600,color:DARK}}>Select a report type and click Run</div>
          </div>
        )}

        {result&&(
          <>
            {/* Summary */}
            {result.summary&&(
              <div style={{...card,marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontWeight:700,fontSize:14,color:DARK}}>Summary</div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={saveReport} style={{...bs,fontSize:12,padding:"5px 12px"}}>💾 Save</button>
                    <button onClick={exportCSV} style={{...bp,fontSize:12,padding:"5px 12px"}}>⬇ Export CSV</button>
                  </div>
                </div>
                <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                  {Object.entries(Array.isArray(result.summary)?{}:result.summary).map(([k,v])=>(
                    <div key={k} style={{padding:"8px 14px",borderRadius:10,background:"#F8F5FC",textAlign:"center",minWidth:100}}>
                      <div style={{fontSize:18,fontWeight:900,color:P}}>{typeof v==="number"?v.toLocaleString():v}</div>
                      <div style={{fontSize:10,color:MU,textTransform:"capitalize"}}>{k.replace(/_/g," ")}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Table */}
            <div style={{...card,overflowX:"auto"}}>
              <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:12}}>
                {result.rows?.length||0} records
              </div>
              {result.rows?.length===0
                ? <div style={{color:MU,textAlign:"center",padding:"20px 0"}}>No data for selected criteria</div>
                : <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr style={{background:"#F8F5FC"}}>
                      {(result.columns||[]).map(h=>(
                        <th key={h} style={{padding:"7px 10px",textAlign:"left",color:MU,fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {result.rows.slice(0,100).map((row,i)=>(
                        <tr key={i} style={{borderBottom:"1px solid #F0EBF8",background:i%2===0?"#fff":"#FDFBFF"}}>
                          {(result.columns||[]).map(col=>{
                            const key=col.toLowerCase().replace(/ /g,"_");
                            const val=row[key]??row[col]??"—";
                            return (
                              <td key={col} style={{padding:"7px 10px",color:val==="EXPIRED"?DA:val==="EXPIRING SOON"?WA:DARK}}>
                                {typeof val==="number"&&col.toLowerCase().includes("hour")?val.toFixed(1):String(val)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
              }
              {result.rows?.length>100&&(
                <div style={{fontSize:12,color:MU,textAlign:"center",padding:"10px 0"}}>
                  Showing first 100 of {result.rows.length} records. Export CSV for full data.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── EMERGENCY CONTACTS TAB ───────────────────────────────────────────────────
function EmergencyTab() {
  const [rooms,setRooms]=useState([]);
  const [children,setChildren]=useState([]);
  const [selRoom,setSelRoom]=useState("all");

  useEffect(()=>{
    API("/api/reports-builder/emergency").then(r=>{
      setChildren(r.children||[]);
      setRooms(r.rooms||[]);
    });
  },[]);

  const filtered=selRoom==="all"?children:children.filter(c=>c.room_id===selRoom);

  const printPage=()=>window.print();

  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:6,flex:1}}>
          <button onClick={()=>setSelRoom("all")}
            style={{padding:"6px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              background:selRoom==="all"?P:"#F0EBF8",color:selRoom==="all"?"#fff":P}}>
            All Rooms ({children.length})
          </button>
          {rooms.map(r=>(
            <button key={r.id} onClick={()=>setSelRoom(r.id)}
              style={{padding:"6px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
                background:selRoom===r.id?P:"#F0EBF8",color:selRoom===r.id?"#fff":P}}>
              {r.name} ({children.filter(c=>c.room_id===r.id).length})
            </button>
          ))}
        </div>
        <button onClick={printPage} style={{...bs,fontSize:12}}>🖨️ Print</button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:12}}>
        {filtered.map(child=>(
          <div key={child.id} style={{...card,padding:"14px 16px",borderLeft:`3px solid ${child.medical_conditions||child.allergies?DA:P}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:DARK}}>{child.first_name} {child.last_name}</div>
                <div style={{fontSize:11,color:MU}}>{child.room_name}</div>
              </div>
              {(child.medical_conditions||child.allergies)&&(
                <span style={{fontSize:10,fontWeight:700,background:"#FEF2F2",color:DA,padding:"2px 8px",borderRadius:20}}>
                  ⚠️ Medical
                </span>
              )}
            </div>

            {child.medical_conditions&&(
              <div style={{fontSize:11,color:DA,fontWeight:600,marginBottom:4}}>
                🏥 {child.medical_conditions}
              </div>
            )}
            {child.allergies&&(
              <div style={{fontSize:11,color:DA,fontWeight:600,marginBottom:8}}>
                ⚠️ Allergies: {child.allergies}
              </div>
            )}

            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {child.emergency_contact_name&&(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",borderRadius:8,background:"#F8F5FC"}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:DARK}}>{child.emergency_contact_name}</div>
                    <div style={{fontSize:10,color:MU}}>{child.emergency_contact_relationship||"Emergency Contact"}</div>
                  </div>
                  {child.emergency_contact_phone&&(
                    <a href={`tel:${child.emergency_contact_phone}`}
                      style={{padding:"5px 12px",borderRadius:8,background:P,color:"#fff",textDecoration:"none",fontSize:12,fontWeight:700}}>
                      📞 {child.emergency_contact_phone}
                    </a>
                  )}
                </div>
              )}
              {child.emergency_contact2_name&&(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",borderRadius:8,background:"#F0EBF8"}}>
                  <div style={{fontSize:12,color:DARK}}>{child.emergency_contact2_name}</div>
                  {child.emergency_contact2_phone&&(
                    <a href={`tel:${child.emergency_contact2_phone}`}
                      style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${P}`,color:P,textDecoration:"none",fontSize:12,fontWeight:600}}>
                      📞 {child.emergency_contact2_phone}
                    </a>
                  )}
                </div>
              )}
              {child.doctor_name&&(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",borderRadius:8,background:"#F0FDF4"}}>
                  <div>
                    <div style={{fontSize:11,color:OK,fontWeight:600}}>🏥 {child.doctor_name}</div>
                  </div>
                  {child.doctor_phone&&(
                    <a href={`tel:${child.doctor_phone}`}
                      style={{fontSize:11,color:OK,textDecoration:"none",fontWeight:600}}>
                      {child.doctor_phone}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── RISK ASSESSMENTS TAB ─────────────────────────────────────────────────────
function RiskTab() {
  const [assessments,setAssessments]=useState([]);
  const [library,setLibrary]=useState([]);
  const [active,setActive]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [newForm,setNewForm]=useState({title:"",location:"",assessor:"",hazards:[],emergency_plan:""});
  const [checklist,setChecklist]=useState({medical_kit_checked:false,ratios_confirmed:false,transport_checked:false,parent_permissions_complete:false});
  const [saving,setSaving]=useState(false);

  const load=useCallback(()=>{
    Promise.all([
      API("/api/risk-assessments"),
      API("/api/risk-assessments/library"),
    ]).then(([a,l])=>{
      setAssessments(a.assessments||[]);
      setLibrary(l.hazards||[]);
    });
  },[]);
  useEffect(()=>{load();},[load]);

  const addHazardFromLibrary=(h)=>{
    setNewForm(p=>({...p,hazards:[...p.hazards,{...h,controls_override:"",residual_risk:"low"}]}));
  };

  const addCustomHazard=()=>{
    setNewForm(p=>({...p,hazards:[...p.hazards,{category:"Custom",hazard:"",likelihood:"possible",consequence:"minor",controls:"",residual_risk:"low"}]}));
  };

  const updateHazard=(i,field,val)=>{
    setNewForm(p=>({...p,hazards:p.hazards.map((h,idx)=>idx===i?{...h,[field]:val}:h)}));
  };

  const removeHazard=(i)=>{
    setNewForm(p=>({...p,hazards:p.hazards.filter((_,idx)=>idx!==i)}));
  };

  const save=async()=>{
    setSaving(true);
    const r=await API("/api/risk-assessments",{method:"POST",body:{
      ...newForm,assessment_date:new Date().toISOString().split("T")[0],...checklist
    }});
    setSaving(false);
    if(r.ok){setShowNew(false);load();}
    else alert(r.error);
  };

  const approve=async(id)=>{
    await API(`/api/risk-assessments/${id}`,{method:"PUT",body:{status:"approved",reviewed_by:"Director"}});
    load();
  };

  const LIKELIHOOD=["unlikely","possible","likely"];
  const CONSEQUENCE=["minor","moderate","major"];
  const CATS=[...new Set(library.map(h=>h.category))];

  return (
    <div style={{display:"flex",gap:20}}>
      {/* List */}
      <div style={{width:300,flexShrink:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:13,color:DARK}}>Risk Assessments</div>
          <button onClick={()=>setShowNew(v=>!v)} style={{...bp,fontSize:11,padding:"6px 12px"}}>+ New</button>
        </div>
        {assessments.map(a=>(
          <div key={a.id} onClick={()=>setActive(a.id===active?null:a.id)}
            style={{...card,marginBottom:8,padding:"12px 14px",cursor:"pointer",
              border:`1px solid ${active===a.id?P+"60":"#EDE8F4"}`,
              borderLeft:`4px solid ${RISK_C[a.overall_risk_level]||OK}`}}>
            <div style={{fontWeight:600,fontSize:13,color:DARK}}>{a.title}</div>
            <div style={{fontSize:11,color:MU,marginTop:2}}>
              {a.excursion_title||a.location||"General"} · {fmtD(a.assessment_date)}
            </div>
            <div style={{display:"flex",gap:8,marginTop:6,alignItems:"center"}}>
              <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,
                background:RISK_BG[a.overall_risk_level],color:RISK_C[a.overall_risk_level],textTransform:"capitalize"}}>
                {a.overall_risk_level} risk
              </span>
              <span style={{fontSize:10,color:MU,textTransform:"capitalize"}}>{a.status}</span>
            </div>
          </div>
        ))}
        {assessments.length===0&&(
          <div style={{...card,textAlign:"center",padding:"30px",color:MU}}>
            <div style={{fontSize:32}}>⚠️</div>
            <div style={{marginTop:8,fontSize:12}}>No risk assessments yet</div>
          </div>
        )}
      </div>

      {/* New form or detail */}
      <div style={{flex:1}}>
        {showNew&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={card}>
              <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:14}}>New Risk Assessment</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                <div style={{gridColumn:"span 2"}}>
                  <label style={lbl}>Title *</label>
                  <input value={newForm.title} onChange={e=>setNewForm(p=>({...p,title:e.target.value}))} style={inp} placeholder="e.g. Trip to Bicentennial Park"/>
                </div>
                <div>
                  <label style={lbl}>Location</label>
                  <input value={newForm.location} onChange={e=>setNewForm(p=>({...p,location:e.target.value}))} style={inp}/>
                </div>
                <div>
                  <label style={lbl}>Assessed By</label>
                  <input value={newForm.assessor} onChange={e=>setNewForm(p=>({...p,assessor:e.target.value}))} style={inp}/>
                </div>
              </div>

              {/* Pre-excursion checklist */}
              <div style={{fontWeight:700,fontSize:12,color:DARK,marginBottom:10}}>Pre-Excursion Checklist</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                {[
                  ["medical_kit_checked","🏥 First aid kit checked and stocked"],
                  ["ratios_confirmed","👥 Educator-to-child ratios confirmed"],
                  ["transport_checked","🚌 Transport arranged and checked"],
                  ["parent_permissions_complete","✅ All parent permissions received"],
                ].map(([key,label])=>(
                  <label key={key} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,
                    padding:"8px 12px",borderRadius:8,border:`1px solid ${checklist[key]?OK+"60":"#EDE8F4"}`,
                    background:checklist[key]?"#F0FDF4":"#fff"}}>
                    <input type="checkbox" checked={checklist[key]} onChange={e=>setChecklist(p=>({...p,[key]:e.target.checked}))}/>
                    <span style={{color:checklist[key]?OK:DARK}}>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Hazards */}
            <div style={card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontWeight:700,fontSize:14,color:DARK}}>Hazards ({newForm.hazards.length})</div>
                <button onClick={addCustomHazard} style={{...bs,fontSize:11,padding:"5px 12px"}}>+ Custom Hazard</button>
              </div>

              {/* Library */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:12,color:MU,fontWeight:600,marginBottom:8}}>Add from Library:</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {CATS.map(cat=>(
                    <details key={cat} style={{fontSize:12}}>
                      <summary style={{cursor:"pointer",padding:"4px 10px",borderRadius:20,background:"#F0EBF8",color:P,fontWeight:600}}>{cat}</summary>
                      <div style={{padding:"8px 0",display:"flex",flexDirection:"column",gap:4}}>
                        {library.filter(h=>h.category===cat).map((h,i)=>(
                          <button key={i} onClick={()=>addHazardFromLibrary(h)}
                            style={{textAlign:"left",padding:"6px 10px",borderRadius:8,border:"1px solid #EDE8F4",
                              background:"#FAFAFA",cursor:"pointer",fontSize:11,color:DARK}}>
                            + {h.hazard}
                          </button>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </div>

              {newForm.hazards.map((h,i)=>(
                <div key={i} style={{padding:"12px 14px",borderRadius:10,background:"#F8F5FC",marginBottom:10,
                  borderLeft:`3px solid ${RISK_C[h.residual_risk]||OK}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <input value={h.hazard} onChange={e=>updateHazard(i,"hazard",e.target.value)}
                      style={{...inp,fontWeight:600,width:"auto",flex:1,marginRight:8}} placeholder="Hazard description"/>
                    <button onClick={()=>removeHazard(i)} style={{background:"none",border:"none",cursor:"pointer",color:MU,fontSize:16}}>×</button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                    {[["likelihood",LIKELIHOOD,"Likelihood"],["consequence",CONSEQUENCE,"Consequence"],["residual_risk",["low","medium","high","extreme"],"Residual Risk"]].map(([field,opts,label])=>(
                      <div key={field}>
                        <label style={lbl}>{label}</label>
                        <select value={h[field]} onChange={e=>updateHazard(i,field,e.target.value)} style={inp}>
                          {opts.map(o=><option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div>
                    <label style={lbl}>Controls</label>
                    <input value={h.controls_override||h.controls||""} onChange={e=>updateHazard(i,"controls_override",e.target.value)}
                      style={inp} placeholder="Control measures…"/>
                  </div>
                </div>
              ))}
            </div>

            <div style={card}>
              <label style={lbl}>Emergency Plan</label>
              <textarea value={newForm.emergency_plan} onChange={e=>setNewForm(p=>({...p,emergency_plan:e.target.value}))}
                rows={3} style={{...inp,resize:"vertical"}}
                placeholder="What to do in an emergency — first aider, hospital, parent contact…"/>
            </div>

            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button style={bs} onClick={()=>setShowNew(false)}>Cancel</button>
              <button style={bp} onClick={save} disabled={saving||!newForm.title}>
                {saving?"Saving…":"Save Risk Assessment"}
              </button>
            </div>
          </div>
        )}

        {!showNew&&active&&assessments.find(a=>a.id===active)&&(()=>{
          const a=assessments.find(x=>x.id===active);
          return (
            <div style={card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                <div>
                  <div style={{fontWeight:700,fontSize:16,color:DARK}}>{a.title}</div>
                  <div style={{fontSize:12,color:MU,marginTop:2}}>
                    {a.location||a.destination} · Assessed {fmtD(a.assessment_date)} · By {a.assessor||"Unknown"}
                  </div>
                </div>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <div style={{padding:"6px 14px",borderRadius:20,background:RISK_BG[a.overall_risk_level],
                    color:RISK_C[a.overall_risk_level],fontWeight:700,fontSize:12,textTransform:"capitalize"}}>
                    {a.overall_risk_level} overall risk
                  </div>
                  {a.status==="draft"&&(
                    <button onClick={()=>approve(a.id)} style={{...bp,fontSize:12,padding:"6px 14px",background:OK}}>✓ Approve</button>
                  )}
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
                {[["medical_kit_checked","🏥 First Aid Kit"],["ratios_confirmed","👥 Ratios"],["transport_checked","🚌 Transport"],["parent_permissions_complete","✅ Permissions"]].map(([k,l])=>(
                  <div key={k} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:8,
                    background:a[k]?"#F0FDF4":"#FEF2F2",border:`1px solid ${a[k]?OK:DA}30`}}>
                    <span style={{fontSize:16}}>{a[k]?"✅":"❌"}</span>
                    <span style={{fontSize:12,color:a[k]?OK:DA,fontWeight:600}}>{l}</span>
                  </div>
                ))}
              </div>
              {a.hazards?.length>0&&(
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:DARK,marginBottom:10}}>Hazard Register</div>
                  {a.hazards.map((h,i)=>(
                    <div key={i} style={{padding:"10px 14px",borderRadius:10,borderLeft:`3px solid ${RISK_C[h.residual_risk]||OK}`,background:RISK_BG[h.residual_risk]||"#F8F5FC",marginBottom:8}}>
                      <div style={{fontWeight:600,fontSize:13,color:DARK,marginBottom:4}}>{h.hazard}</div>
                      <div style={{fontSize:11,color:MU}}>
                        Likelihood: {h.likelihood} · Consequence: {h.consequence} ·
                        <span style={{color:RISK_C[h.residual_risk],fontWeight:700}}> Residual: {h.residual_risk}</span>
                      </div>
                      {(h.controls_override||h.controls)&&(
                        <div style={{fontSize:11,color:DARK,marginTop:4}}>Controls: {h.controls_override||h.controls}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {a.emergency_plan&&(
                <div style={{marginTop:14,padding:"12px 14px",borderRadius:10,background:"#FEF2F2",border:"1px solid #FCA5A5"}}>
                  <div style={{fontWeight:700,fontSize:12,color:DA,marginBottom:4}}>🚨 Emergency Plan</div>
                  <div style={{fontSize:12,color:DARK,lineHeight:1.6}}>{a.emergency_plan}</div>
                </div>
              )}
            </div>
          );
        })()}

        {!showNew&&!active&&(
          <div style={{...card,textAlign:"center",padding:"60px 20px",color:MU}}>
            <div style={{fontSize:40}}>⚠️</div>
            <div style={{marginTop:12,fontWeight:600,color:DARK}}>Select a risk assessment to view details</div>
            <p style={{fontSize:13}}>Or create a new one for an upcoming excursion.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SCHEDULED REPORTS TAB ───────────────────────────────────────────────────
function ScheduledReportsTab() {
  const [schedules,setSchedules]=useState([]);
  const [types,setTypes]=useState([]);
  const [showNew,setShowNew]=useState(false);
  const [form,setForm]=useState({name:"",report_type:"attendance",frequency:"weekly",day_of_week:1,time:"08:00"});

  const load=useCallback(()=>{
    Promise.all([
      API("/api/reports-builder/schedules"),
      API("/api/reports-builder/types"),
    ]).then(([s,t])=>{setSchedules(s.schedules||[]);setTypes(t.types||[]);});
  },[]);
  useEffect(()=>{load();},[load]);

  const save=async()=>{
    if(!form.name||!form.report_type)return;
    const r=await API("/api/reports-builder/schedules",{method:"POST",body:form}.catch(e=>console.error('API error:',e)));
    if(r.ok){setShowNew(false);setForm({name:"",report_type:"attendance",frequency:"weekly",day_of_week:1,time:"08:00"});load();}
  };

  const toggle=async(id,enabled)=>{
    await API(`/api/reports-builder/schedules/${id}`,{method:"PUT",body:{enabled}}.catch(e=>console.error('API error:',e)));
    load();
  };

  const del=async(id)=>{
    if(!confirm("Delete this scheduled report?"))return;
    await API(`/api/reports-builder/schedules/${id}`,{method:"DELETE"}.catch(e=>console.error('API error:',e)));
    load();
  };

  const DOW=["","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const FREQ_L={weekly:"Weekly",fortnightly:"Fortnightly",monthly:"Monthly"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14,maxWidth:800}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <p style={{fontSize:13,color:MU,margin:0}}>
          Automatically run and save reports on a schedule. View and manage all scheduled reports here.
        </p>
        <button style={bp} onClick={()=>setShowNew(v=>!v)}>{showNew?"Cancel":"+ New Schedule"}</button>
      </div>

      {showNew&&(
        <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
          <div style={{fontWeight:700,fontSize:13,color:DARK,marginBottom:12}}>New Scheduled Report</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label style={lbl}>Name *</label>
              <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} style={inp} placeholder="e.g. Weekly Attendance Summary"/>
            </div>
            <div>
              <label style={lbl}>Report Type *</label>
              <select value={form.report_type} onChange={e=>setForm(p=>({...p,report_type:e.target.value}))} style={inp}>
                {types.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Frequency</label>
              <select value={form.frequency} onChange={e=>setForm(p=>({...p,frequency:e.target.value}))} style={inp}>
                {["weekly","fortnightly","monthly"].map(f=><option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Run Time</label>
              <input type="time" value={form.time} onChange={e=>setForm(p=>({...p,time:e.target.value}))} style={inp}/>
            </div>
            {form.frequency==="weekly"&&(
              <div>
                <label style={lbl}>Day of Week</label>
                <select value={form.day_of_week} onChange={e=>setForm(p=>({...p,day_of_week:parseInt(e.target.value)}))} style={inp}>
                  {[1,2,3,4,5].map(d=><option key={d} value={d}>{DOW[d]}</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button style={bp} onClick={save}>Save Schedule</button>
            <button style={bs} onClick={()=>setShowNew(false)}>Cancel</button>
          </div>
        </div>
      )}

      {schedules.length===0
        ? <div style={{...card,textAlign:"center",padding:"40px 20px",color:MU}}>
            <div style={{fontSize:40}}>🗓️</div>
            <div style={{marginTop:12,fontWeight:600,color:DARK}}>No scheduled reports</div>
            <p style={{fontSize:13,marginTop:8}}>Create a schedule to automatically run reports at set intervals.</p>
          </div>
        : schedules.map(s=>(
          <div key={s.id} style={{...card,padding:"14px 18px",borderLeft:`4px solid ${s.enabled?P:MU}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:DARK}}>{s.name}</div>
                <div style={{fontSize:12,color:MU,marginTop:3}}>
                  {types.find(t=>t.id===s.report_type)?.label||s.report_type} ·
                  {" "}{FREQ_L[s.frequency]||s.frequency}
                  {s.frequency==="weekly"&&` (${DOW[s.day_of_week]})`}
                  {" "}at {s.time}
                </div>
                {s.next_run&&(
                  <div style={{fontSize:11,color:s.enabled?IN:MU,marginTop:3}}>
                    Next run: {new Date(s.next_run+"T12:00").toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"})}
                    {s.last_run&&` · Last run: ${new Date(s.last_run).toLocaleDateString("en-AU",{day:"numeric",month:"short"})}`}
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12}}>
                  <input type="checkbox" checked={!!s.enabled}
                    onChange={e=>toggle(s.id,e.target.checked)}/>
                  {s.enabled?"Active":"Paused"}
                </label>
                <button onClick={()=>del(s.id)}
                  style={{background:"none",border:"none",cursor:"pointer",color:DA,fontSize:13,fontWeight:600,padding:"4px 8px"}}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))
      }
    </div>
  );
}
