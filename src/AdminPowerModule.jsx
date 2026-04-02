/**
 * AdminPowerModule.jsx — v2.10.0
 * Five power tabs for centre directors:
 *   👥 Recruitment   — job postings, applications pipeline
 *   ⭐ Appraisals    — NQS-aligned staff performance reviews
 *   📈 Occupancy     — historical + 90-day forecast
 *   💳 Debt          — overdue accounts, reminders, payment plans
 *   📅 Casual        — booking requests + room availability calendar
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
const bg={padding:"8px 16px",borderRadius:9,border:"1px solid #DDD6EE",background:"#F8F5FC",color:MU,fontWeight:500,cursor:"pointer",fontSize:13};
const inp={padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:13,width:"100%",boxSizing:"border-box",fontFamily:"inherit"};
const lbl={fontSize:11,color:MU,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"};
const fmt$=n=>`$${(n||0).toFixed(2)}`;
const fmtD=d=>d?new Date(d+"T12:00").toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):"—";
const today=()=>new Date().toISOString().split("T")[0];

const TABS=[
  {id:"recruitment",icon:"👥",label:"Recruitment"},
  {id:"appraisals",icon:"⭐",label:"Appraisals"},
  {id:"occupancy",icon:"📈",label:"Occupancy"},
  {id:"debt",icon:"💳",label:"Debt"},
  {id:"casual",icon:"📅",label:"Casual Bookings"},
];

export default function AdminPowerModule() {
  const [tab,setTab]=useState("recruitment");
  return (
    <div style={{padding:"24px 28px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
        <span style={{fontSize:28}}>🏢</span>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>Admin Power Pack</h1>
          <p style={{margin:"3px 0 0",fontSize:13,color:MU}}>Recruitment · Appraisals · Occupancy Forecasting · Debt Management · Casual Bookings</p>
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
      {tab==="recruitment" && <RecruitmentTab />}
      {tab==="appraisals"  && <AppraisalsTab />}
      {tab==="occupancy"   && <OccupancyTab />}
      {tab==="debt"        && <DebtTab />}
      {tab==="casual"      && <CasualTab />}
    </div>
  );
}

// ─── RECRUITMENT ──────────────────────────────────────────────────────────────
function RecruitmentTab() {
  const [jobs,setJobs]=useState([]);
  const [apps,setApps]=useState([]);
  const [pipeline,setPipeline]=useState({});
  const [selJob,setSelJob]=useState(null);
  const [showNewJob,setShowNewJob]=useState(false);
  const [form,setForm]=useState({title:"",employment_type:"permanent",description:"",requirements:"",salary_min:"",salary_max:"",closing_date:""});

  const load=useCallback(()=>{
    API("/api/admin/recruitment/jobs").then(r=>{setJobs(r.jobs||[]);setPipeline(r.pipeline||{});});
  },[]);
  useEffect(()=>{load();},[load]);

  const loadApps=async(jobId)=>{
    const r=await API(`/api/admin/recruitment/applications?job_id=${jobId}`.catch(e=>console.error('API error:',e)));
    setApps(r?.applications||[]);setSelJob(jobId);
  };

  const saveJob=async()=>{
    if(!form.title)return;
    await API("/api/admin/recruitment/jobs",{method:"POST",body:{...form,salary_min:form.salary_min?parseFloat(form.salary_min):null,salary_max:form.salary_max?parseFloat(form.salary_max):null}}).catch(e=>console.error('API error:',e));
    setShowNewJob(false);setForm({title:"",employment_type:"permanent",description:"",requirements:"",salary_min:"",salary_max:"",closing_date:""});
    load();
  };

  const moveApp=async(id,status)=>{
    await API(`/api/admin/recruitment/applications/${id}`,{method:"PUT",body:{status}}).catch(e=>console.error('API error:',e));
    if(selJob)loadApps(selJob);
  };

  const STATUS_COLOR={new:IN,screening:WA,shortlisted:P,interview:"#D946EF",offer:"#F59E0B",hired:OK,rejected:MU,withdrawn:MU};
  const APP_STAGES=["new","screening","shortlisted","interview","offer","hired","rejected"];

  return (
    <div style={{display:"flex",gap:20}}>
      <div style={{flex:1}}>
        {/* Pipeline summary */}
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          {APP_STAGES.map(s=>(
            <div key={s} style={{padding:"8px 14px",borderRadius:10,background:(STATUS_COLOR[s]||MU)+"18",border:`1px solid ${(STATUS_COLOR[s]||MU)}40`,textAlign:"center",minWidth:70}}>
              <div style={{fontSize:18,fontWeight:900,color:STATUS_COLOR[s]||MU}}>{pipeline[s]||0}</div>
              <div style={{fontSize:10,color:MU,textTransform:"capitalize"}}>{s}</div>
            </div>
          ))}
        </div>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:14,color:DARK}}>Active Positions ({jobs.filter(j=>j.status==="active").length})</div>
          <button style={bp} onClick={()=>setShowNewJob(v=>!v)}>{showNewJob?"Cancel":"+ New Position"}</button>
        </div>

        {showNewJob&&(
          <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE",marginBottom:14}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{gridColumn:"span 2"}}>
                <label style={lbl}>Job Title *</label>
                <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} style={inp} placeholder="e.g. Lead Educator — Nursery"/>
              </div>
              <div>
                <label style={lbl}>Employment Type</label>
                <select value={form.employment_type} onChange={e=>setForm(p=>({...p,employment_type:e.target.value}))} style={inp}>
                  {["permanent","part_time","casual","contract"].map(t=><option key={t} value={t}>{t.replace("_"," ")}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Closing Date</label>
                <input type="date" value={form.closing_date} onChange={e=>setForm(p=>({...p,closing_date:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={lbl}>Salary Min ($)</label>
                <input type="number" value={form.salary_min} onChange={e=>setForm(p=>({...p,salary_min:e.target.value}))} style={inp} placeholder="60000"/>
              </div>
              <div>
                <label style={lbl}>Salary Max ($)</label>
                <input type="number" value={form.salary_max} onChange={e=>setForm(p=>({...p,salary_max:e.target.value}))} style={inp} placeholder="80000"/>
              </div>
              <div style={{gridColumn:"span 2"}}>
                <label style={lbl}>Description</label>
                <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={3} style={{...inp,resize:"vertical"}}/>
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button style={bp} onClick={saveJob}>Post Job</button>
              <button style={bs} onClick={()=>setShowNewJob(false)}>Cancel</button>
            </div>
          </div>
        )}

        {jobs.map(job=>(
          <div key={job.id} style={{...card,marginBottom:10,cursor:"pointer",border:`1px solid ${selJob===job.id?P+"60":"#EDE8F4"}`}} onClick={()=>selJob===job.id?setSelJob(null):loadApps(job.id)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:DARK}}>{job.title}</div>
                <div style={{fontSize:12,color:MU,marginTop:2}}>
                  {job.employment_type?.replace("_"," ")}
                  {job.salary_min&&` · $${(job.salary_min/1000).toFixed(0)}k`}
                  {job.salary_max&&`–$${(job.salary_max/1000).toFixed(0)}k`}
                  {job.closing_date&&` · Closes ${fmtD(job.closing_date)}`}
                </div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:12,fontWeight:700,color:P}}>{job.total_apps||0} applicants</span>
                {job.new_apps>0&&<span style={{background:IN+"22",color:IN,fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20}}>{job.new_apps} new</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Applications panel */}
      {selJob&&(
        <div style={{width:420,flexShrink:0}}>
          <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:12}}>
            Applications — {jobs.find(j=>j.id===selJob)?.title}
          </div>
          {apps.length===0
            ? <div style={{...card,textAlign:"center",padding:"30px 0",color:MU}}>No applications yet</div>
            : apps.map(app=>(
              <div key={app.id} style={{...card,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13,color:DARK}}>{app.applicant_name}</div>
                    <div style={{fontSize:11,color:MU}}>{app.qualification} · {app.years_experience}y exp</div>
                    {app.applicant_email&&<div style={{fontSize:11,color:IN}}>{app.applicant_email}</div>}
                  </div>
                  <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,
                    background:(STATUS_COLOR[app.status]||MU)+"20",color:STATUS_COLOR[app.status]||MU,textTransform:"capitalize"}}>
                    {app.status}
                  </span>
                </div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {APP_STAGES.filter(s=>s!==app.status&&s!=="withdrawn").slice(0,4).map(s=>(
                    <button key={s} onClick={()=>moveApp(app.id,s)}
                      style={{padding:"3px 10px",borderRadius:7,border:`1px solid ${(STATUS_COLOR[s]||MU)}50`,
                        background:(STATUS_COLOR[s]||MU)+"10",color:STATUS_COLOR[s]||MU,cursor:"pointer",fontSize:10,fontWeight:600,textTransform:"capitalize"}}>
                      → {s}
                    </button>
                  ))}
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ─── APPRAISALS ───────────────────────────────────────────────────────────────
function AppraisalsTab() {
  const [appraisals,setAppraisals]=useState([]);
  const [educators,setEducators]=useState([]);
  const [template,setTemplate]=useState(null);
  const [active,setActive]=useState(null);
  const [ratings,setRatings]=useState({});
  const [form,setForm]=useState({educator_id:"",due_date:"",review_period_start:"",review_period_end:""});
  const [showNew,setShowNew]=useState(false);

  const load=useCallback(()=>{
    Promise.all([
      API("/api/admin/appraisals"),
      API("/api/educators/simple"),
      API("/api/admin/appraisals/templates"),
    ]).then(([ar,er,tr])=>{
      setAppraisals(ar.appraisals||[]);
      setEducators(Array.isArray(er)?er:(er.educators||er.data||[]));
      setTemplate(tr.templates?.[0]);
    });
  },[]);
  useEffect(()=>{load();},[load]);

  const createAppraisal=async()=>{
    if(!form.educator_id)return;
    await API("/api/admin/appraisals",{method:"POST",body:{...form,template_id:template?.id}}).catch(e=>console.error('API error:',e));
    setShowNew(false);load();
  };

  const saveRatings=async()=>{
    if(!active)return;
    const assessment={};
    Object.entries(ratings).forEach(([k,v])=>{assessment[k]=v;});
    const overallRating=Object.values(ratings).filter(v=>typeof v==="number").reduce((s,v,_,a)=>s+v/a.length,0);
    await API(`/api/admin/appraisals/${active.id}`,{method:"PUT",body:{ // catch: .catch(e=>console.error('API error:',e))
      reviewer_assessment:assessment, overall_rating:parseFloat(overallRating.toFixed(1)),
      status:"completed", signed_by_reviewer:1
    }});
    setActive(null);setRatings({});load();
  };

  const RATING_LABELS={1:"Needs Improvement",2:"Developing",3:"Meeting Expectations",4:"Exceeding",5:"Outstanding"};
  const RATING_COLORS={1:DA,2:WA,3:IN,4:OK,5:"#7C3AED"};
  const STATUS_C={pending:MU,in_progress:WA,completed:OK,overdue:DA};

  if(active&&template){
    return (
      <div style={{maxWidth:800}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <button onClick={()=>setActive(null)} style={{...bg,padding:"6px 12px",fontSize:12}}>← Back</button>
          <div>
            <div style={{fontWeight:700,fontSize:16,color:DARK}}>Performance Review — {active.first_name} {active.last_name}</div>
            <div style={{fontSize:12,color:MU}}>{active.qualification} · {template.name}</div>
          </div>
        </div>
        {(template.sections||[]).map(section=>(
          <div key={section.id} style={{...card,marginBottom:14}}>
            <div style={{fontWeight:700,fontSize:14,color:P,marginBottom:12}}>{section.title}</div>
            {section.criteria.map(c=>(
              <div key={c.id} style={{marginBottom:16,paddingBottom:12,borderBottom:"1px solid #F0EBF8"}}>
                <div style={{fontSize:13,color:DARK,marginBottom:8}}>{c.label}</div>
                <div style={{display:"flex",gap:8}}>
                  {[1,2,3,4,5].map(n=>(
                    <button key={n} onClick={()=>setRatings(p=>({...p,[c.id]:n}))}
                      style={{flex:1,padding:"8px 4px",borderRadius:8,border:`2px solid ${ratings[c.id]===n?(RATING_COLORS[n]||P):"#EDE8F4"}`,
                        background:ratings[c.id]===n?(RATING_COLORS[n]||P)+"20":"transparent",
                        cursor:"pointer",fontSize:12,fontWeight:ratings[c.id]===n?700:400,
                        color:ratings[c.id]===n?(RATING_COLORS[n]||P):MU,transition:"all 0.1s"}}>
                      {n}
                    </button>
                  ))}
                </div>
                {ratings[c.id]&&<div style={{fontSize:11,color:RATING_COLORS[ratings[c.id]]||P,marginTop:4,fontWeight:600}}>{RATING_LABELS[ratings[c.id]]}</div>}
              </div>
            ))}
          </div>
        ))}
        <div style={{...card,marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:12}}>Summary Notes</div>
          {[["strengths","Key Strengths"],["development_areas","Areas for Development"],["agreed_goals_text","Agreed Goals for Next Period"],["reviewer_comments","Additional Comments"]].map(([k,l])=>(
            <div key={k} style={{marginBottom:10}}>
              <label style={lbl}>{l}</label>
              <textarea value={ratings[k]||""} onChange={e=>setRatings(p=>({...p,[k]:e.target.value}))} rows={2} style={{...inp,resize:"vertical"}}/>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button style={bs} onClick={()=>setActive(null)}>Cancel</button>
          <button style={bp} onClick={saveRatings}>✓ Complete & Sign Review</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:13,color:MU}}>NQS Quality Area 4 aligned · Annual reviews with dual sign-off</div>
        <button style={bp} onClick={()=>setShowNew(v=>!v)}>{showNew?"Cancel":"+ New Appraisal"}</button>
      </div>

      {showNew&&(
        <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{gridColumn:"span 2"}}>
              <label style={lbl}>Educator *</label>
              <select value={form.educator_id} onChange={e=>setForm(p=>({...p,educator_id:e.target.value}))} style={inp}>
                <option value="">Select educator…</option>
                {educators.map(e=><option key={e.id} value={e.id}>{e.first_name} {e.last_name} — {e.qualification}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Review Period Start</label>
              <input type="date" value={form.review_period_start} onChange={e=>setForm(p=>({...p,review_period_start:e.target.value}))} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Review Period End</label>
              <input type="date" value={form.review_period_end} onChange={e=>setForm(p=>({...p,review_period_end:e.target.value}))} style={inp}/>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label style={lbl}>Due Date</label>
              <input type="date" value={form.due_date} onChange={e=>setForm(p=>({...p,due_date:e.target.value}))} style={inp}/>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button style={bp} onClick={createAppraisal}>Create Appraisal</button>
            <button style={bs} onClick={()=>setShowNew(false)}>Cancel</button>
          </div>
        </div>
      )}

      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr style={{background:"#F8F5FC"}}>
          {["Educator","Qualification","Period","Due","Rating","Status",""].map(h=>(
            <th key={h} style={{padding:"8px 10px",textAlign:"left",color:MU,fontWeight:700,fontSize:11}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {appraisals.length===0
            ? <tr><td colSpan={7} style={{padding:"30px 10px",textAlign:"center",color:MU}}>No appraisals yet</td></tr>
            : appraisals.map(a=>(
              <tr key={a.id} style={{borderBottom:"1px solid #F0EBF8"}}>
                <td style={{padding:"8px 10px",fontWeight:600}}>{a.first_name} {a.last_name}</td>
                <td style={{padding:"8px 10px",color:MU,fontSize:12}}>{a.qualification}</td>
                <td style={{padding:"8px 10px",color:MU}}>{a.review_period_start?`${fmtD(a.review_period_start)}–${fmtD(a.review_period_end)}`:"—"}</td>
                <td style={{padding:"8px 10px",color:a.due_date&&a.due_date<today()?DA:MU}}>{fmtD(a.due_date)}</td>
                <td style={{padding:"8px 10px"}}>
                  {a.overall_rating
                    ? <span style={{fontWeight:700,color:a.overall_rating>=4?OK:a.overall_rating>=3?IN:WA}}>{a.overall_rating}/5</span>
                    : <span style={{color:MU}}>—</span>
                  }
                </td>
                <td style={{padding:"8px 10px"}}>
                  <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,
                    background:(STATUS_C[a.status]||MU)+"20",color:STATUS_C[a.status]||MU,textTransform:"capitalize"}}>
                    {a.status}
                  </span>
                </td>
                <td style={{padding:"8px 10px"}}>
                  {a.status!=="completed"&&(
                    <button onClick={()=>setActive(a)} style={{...bp,padding:"5px 12px",fontSize:11}}>Start Review</button>
                  )}
                </td>
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  );
}

// ─── OCCUPANCY ────────────────────────────────────────────────────────────────
function OccupancyTab() {
  const [data,setData]=useState(null);
  const [snapshotting,setSnapshotting]=useState(false);

  const load=useCallback(()=>{
    API("/api/admin/occupancy?weeks=12").then(setData);
  },[]);
  useEffect(()=>{load();},[load]);

  const takeSnapshot=async()=>{
    setSnapshotting(true);
    await API("/api/admin/occupancy/snapshot",{method:"POST"}).catch(e=>console.error('API error:',e));
    load();setSnapshotting(false);
  };

  if(!data)return <div style={{padding:40,textAlign:"center",color:MU}}>Loading…</div>;

  const maxOcc=Math.max(...(data.weekly||[]).map(w=>w.avg_occupancy),80);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:13,color:MU}}>Live occupancy + 12-week forecast</div>
        <button style={bp} onClick={takeSnapshot} disabled={snapshotting}>
          {snapshotting?"Snapshotting…":"📸 Take Today's Snapshot"}
        </button>
      </div>

      {/* Current per-room */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
        {data.current?.map(room=>{
          const pct=room.occupancy_pct||0;
          const color=pct>=95?DA:pct>=80?WA:pct>=60?OK:IN;
          return (
            <div key={room.id} style={{...card,borderTop:`3px solid ${color}`}}>
              <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:2}}>{room.name}</div>
              <div style={{fontSize:11,color:MU,marginBottom:10}}>{room.age_group}</div>
              <div style={{fontSize:28,fontWeight:900,color:color,marginBottom:4}}>{Math.round(pct)}%</div>
              <div style={{fontSize:12,color:MU}}>
                {room.enrolled}/{room.capacity} enrolled
                {room.available_places>0&&<span style={{color:OK,marginLeft:6}}>· {room.available_places} places available</span>}
              </div>
              {/* Mini bar */}
              <div style={{marginTop:10,background:"#F0EBF8",borderRadius:4,height:6}}>
                <div style={{width:`${Math.min(100,pct)}%`,height:"100%",background:color,borderRadius:4,transition:"width 0.3s"}}/>
              </div>
            </div>
          );
        })}
      </div>

      {/* Trend chart */}
      <div style={card}>
        <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:16}}>12-Week History + 12-Week Forecast</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:3,height:120,paddingBottom:20,position:"relative"}}>
          {[...(data.weekly||[]).slice(0,12).reverse(), ...(data.forecast||[])].map((w,i)=>{
            const occ=w.avg_occupancy||w.forecast_occupancy||0;
            const h=Math.round((occ/100)*100);
            const isForecast=!!w.type;
            return (
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div title={`${w.week_start}: ${occ.toFixed(1)}%`}
                  style={{width:"100%",height:h,borderRadius:"3px 3px 0 0",
                    background:isForecast?`${P}50`:(occ>=80?WA:OK),
                    border:isForecast?`1px dashed ${P}`:"none",transition:"height 0.2s"}}>
                </div>
                {i%4===0&&<div style={{fontSize:9,color:MU,position:"absolute",bottom:0,transform:"translateX(-50%)",whiteSpace:"nowrap"}}>
                  {(w.week_start||"").slice(5)}
                </div>}
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:16,fontSize:11,marginTop:8}}>
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:12,height:12,borderRadius:2,background:OK,display:"inline-block"}}/> Historical</span>
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:12,height:12,borderRadius:2,background:`${P}50`,border:`1px dashed ${P}`,display:"inline-block"}}/> Forecast</span>
        </div>
      </div>

      {/* CRM opportunity — children on waitlist that could fill gaps */}
      {data.current?.some(r=>r.available_places>0)&&(
        <div style={{...card,background:"#F0FDF4",border:"1px solid #A5D6A7"}}>
          <div style={{fontWeight:700,fontSize:13,color:OK,marginBottom:4}}>💡 Revenue Opportunity</div>
          <div style={{fontSize:13,color:DARK}}>
            {data.current.filter(r=>r.available_places>0).map(r=>`${r.name}: ${r.available_places} place${r.available_places>1?"s":""}`).join(" · ")}
            {" "} — check your <button onClick={()=>window.dispatchEvent(new CustomEvent("c360-navigate",{detail:{tab:"crm"}}))} 
              style={{background:"none",border:"none",color:IN,cursor:"pointer",fontWeight:700,fontSize:13,textDecoration:"underline"}}>
              waitlist
            </button> for families ready to enrol.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DEBT MANAGEMENT ─────────────────────────────────────────────────────────
function DebtTab() {
  const [debts,setDebts]=useState([]);
  const [summary,setSummary]=useState(null);
  const [filter,setFilter]=useState("outstanding");

  const load=useCallback(()=>{
    API(`/api/admin/debt?status=${filter}&limit=100`).then(r=>{
      setDebts(r.debts||[]);setSummary(r.summary);
    });
  },[filter]);
  useEffect(()=>{load();},[load]);

  const remind=async(id,n)=>{
    await API(`/api/admin/debt/${id}/reminder`,{method:"POST",body:{reminder_number:n}}).catch(e=>console.error('API error:',e));
    load();
  };

  const markPaid=async(id,amountCents)=>{
    await API(`/api/admin/debt/${id}`,{method:"PUT",body:{amount_paid_cents:amountCents,status:"paid"}}).catch(e=>console.error('API error:',e));
    load();
  };

  const ageBadge=(days)=>({
    color:days>90?DA:days>60?"#EA580C":days>30?WA:MU,
    bg:days>90?"#FEF2F2":days>60?"#FFF7ED":days>30?"#FFFBEB":"#F5F5F5",
    label:`${days}d overdue`
  });

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {summary&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {[
            ["Total Outstanding",`$${summary.outstanding.toFixed(0)}`,DA],
            ["30+ Days",`$${summary.overdue_30.toFixed(0)}`,WA],
            ["60+ Days",`$${summary.overdue_60.toFixed(0)}`,DA],
            ["90+ Days",`$${summary.overdue_90.toFixed(0)}`,"#7F1D1D"],
          ].map(([l,v,c])=>(
            <div key={l} style={{...card,textAlign:"center",borderTop:`3px solid ${c}`}}>
              <div style={{fontSize:20,fontWeight:900,color:c}}>{v}</div>
              <div style={{fontSize:11,color:MU,marginTop:4}}>{l}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex",gap:6}}>
        {["outstanding","payment_plan","paid","all"].map(s=>(
          <button key={s} onClick={()=>setFilter(s)}
            style={{padding:"6px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              background:filter===s?P:"#F0EBF8",color:filter===s?"#fff":P,textTransform:"capitalize"}}>
            {s.replace("_"," ")}
          </button>
        ))}
      </div>

      {debts.length===0
        ? <div style={{...card,textAlign:"center",padding:"40px 20px",color:MU}}><div style={{fontSize:36}}>✅</div><div style={{marginTop:8}}>No {filter} debt records</div></div>
        : debts.map(d=>{
          const days=d.actual_days_overdue||0;
          const badge=ageBadge(days);
          const outstanding=d.outstanding;
          return (
            <div key={d.id} style={{...card,borderLeft:`4px solid ${badge.color}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:DARK}}>{d.first_name} {d.last_name}</div>
                  <div style={{fontSize:12,color:MU,marginTop:2}}>{d.room_name&&`${d.room_name} · `}Due: {fmtD(d.due_date)}</div>
                  <div style={{display:"flex",gap:10,marginTop:6,fontSize:12}}>
                    <span>Total: <strong>{fmt$(d.total)}</strong></span>
                    <span>Paid: <strong style={{color:OK}}>{fmt$(d.paid)}</strong></span>
                    <span>Outstanding: <strong style={{color:DA}}>{fmt$(outstanding)}</strong></span>
                  </div>
                  {d.payment_plan&&<div style={{fontSize:11,color:IN,marginTop:4}}>
                    📋 Payment plan: {fmt$(d.payment_plan_amount_cents/100)}/{d.payment_plan_frequency}
                  </div>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
                  <span style={{fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:20,background:badge.bg,color:badge.color}}>
                    {badge.label}
                  </span>
                  <div style={{display:"flex",gap:6,marginTop:4}}>
                    {!d.reminder_1_sent&&<button onClick={()=>remind(d.id,1)} style={{padding:"4px 10px",borderRadius:7,border:`1px solid ${WA}`,background:"#FFFBEB",color:WA,cursor:"pointer",fontSize:11,fontWeight:600}}>Send Reminder 1</button>}
                    {d.reminder_1_sent&&!d.reminder_2_sent&&<button onClick={()=>remind(d.id,2)} style={{padding:"4px 10px",borderRadius:7,border:`1px solid ${WA}`,background:"#FFFBEB",color:WA,cursor:"pointer",fontSize:11,fontWeight:600}}>Reminder 2</button>}
                    {d.reminder_2_sent&&!d.reminder_3_sent&&<button onClick={()=>remind(d.id,3)} style={{padding:"4px 10px",borderRadius:7,border:`1px solid ${DA}`,background:"#FEF2F2",color:DA,cursor:"pointer",fontSize:11,fontWeight:600}}>Final Notice</button>}
                    <button onClick={()=>markPaid(d.id,d.amount_cents)} style={{padding:"4px 10px",borderRadius:7,border:`1px solid ${OK}`,background:"#F0FDF4",color:OK,cursor:"pointer",fontSize:11,fontWeight:700}}>✓ Mark Paid</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      }
    </div>
  );
}

// ─── CASUAL BOOKINGS ──────────────────────────────────────────────────────────
function CasualTab() {
  const [bookings,setBookings]=useState([]);
  const [availability,setAvailability]=useState([]);
  const [pendingCount,setPendingCount]=useState(0);
  const [children,setChildren]=useState([]);
  const [rooms,setRooms]=useState([]);
  const [view,setView]=useState("requests"); // requests | calendar
  const [form,setForm]=useState({child_id:"",room_id:"",requested_date:"",session_type:"full_day",notes:""});
  const [showNew,setShowNew]=useState(false);

  const load=useCallback(()=>{
    Promise.all([
      API("/api/admin/casual?limit=100"),
      API("/api/children/simple"),
      API("/api/rooms/simple"),
    ]).then(([br,cr,rr])=>{
      setBookings(br.bookings||[]);
      setPendingCount(br.pending_count||0);
      setChildren(Array.isArray(cr)?cr:(cr.children||cr.data||[]));
      setRooms(rr.rooms||rr||[]);
    });
  },[]);

  const loadCalendar=useCallback(()=>{
    const from=today();
    const to=new Date(Date.now()+14*86400000).toISOString().split("T")[0];
    API(`/api/admin/casual/availability?from=${from}&to=${to}`).then(r=>setAvailability(r.availability||[]));
  },[]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{ if(view==="calendar")loadCalendar(); },[view,loadCalendar]);

  const decide=async(id,status)=>{
    await API(`/api/admin/casual/${id}`,{method:"PUT",body:{status,confirmed_by:"Admin"}});
    load();
  };

  const submitNew=async()=>{
    if(!form.child_id||!form.requested_date)return;
    const r=await API("/api/admin/casual",{method:"POST",body:form});
    if(r.error){alert(r.error);return;}
    setShowNew(false);load();
  };

  const STATUS_C={pending:WA,confirmed:OK,declined:DA,cancelled:MU};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:6}}>
          {["requests","calendar"].map(v=>(
            <button key={v} onClick={()=>setView(v)}
              style={{padding:"7px 16px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
                background:view===v?P:"#F0EBF8",color:view===v?"#fff":P,textTransform:"capitalize"}}>
              {v==="requests"&&pendingCount>0&&<span style={{marginRight:6,background:"#fff",color:P,borderRadius:20,padding:"1px 6px",fontSize:10,fontWeight:900}}>{pendingCount}</span>}
              {v}
            </button>
          ))}
        </div>
        <button style={bp} onClick={()=>setShowNew(v=>!v)}>{showNew?"Cancel":"+ New Booking"}</button>
      </div>

      {showNew&&(
        <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label style={lbl}>Child *</label>
              <select value={form.child_id} onChange={e=>setForm(p=>({...p,child_id:e.target.value}))} style={inp}>
                <option value="">Select child…</option>
                {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Room</label>
              <select value={form.room_id} onChange={e=>setForm(p=>({...p,room_id:e.target.value}))} style={inp}>
                <option value="">Auto-assign</option>
                {rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Date *</label>
              <input type="date" value={form.requested_date} onChange={e=>setForm(p=>({...p,requested_date:e.target.value}))} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Session</label>
              <select value={form.session_type} onChange={e=>setForm(p=>({...p,session_type:e.target.value}))} style={inp}>
                {["full_day","morning","afternoon"].map(s=><option key={s} value={s}>{s.replace("_"," ")}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button style={bp} onClick={submitNew}>Book</button>
            <button style={bs} onClick={()=>setShowNew(false)}>Cancel</button>
          </div>
        </div>
      )}

      {view==="requests"&&(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {bookings.length===0
            ? <div style={{...card,textAlign:"center",padding:"40px 20px",color:MU}}><div style={{fontSize:36}}>📅</div><div style={{marginTop:8}}>No casual bookings</div></div>
            : bookings.map(b=>(
              <div key={b.id} style={{...card,borderLeft:`4px solid ${STATUS_C[b.status]||MU}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:DARK}}>{b.first_name} {b.last_name}</div>
                    <div style={{fontSize:12,color:MU}}>
                      {fmtD(b.requested_date)} · {b.session_type?.replace("_"," ")} · {b.room_name||"Room TBC"}
                    </div>
                    {b.notes&&<div style={{fontSize:11,color:MU,marginTop:2}}>{b.notes}</div>}
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,
                      background:(STATUS_C[b.status]||MU)+"20",color:STATUS_C[b.status]||MU,textTransform:"capitalize"}}>
                      {b.status}
                    </span>
                    {b.status==="pending"&&<>
                      <button onClick={()=>decide(b.id,"confirmed")} style={{padding:"5px 12px",borderRadius:7,border:`1px solid ${OK}`,background:"#F0FDF4",color:OK,cursor:"pointer",fontSize:11,fontWeight:700}}>✓ Confirm</button>
                      <button onClick={()=>decide(b.id,"declined")} style={{padding:"5px 12px",borderRadius:7,border:"1px solid #EDE8F4",background:"#F5F5F5",color:MU,cursor:"pointer",fontSize:11}}>Decline</button>
                    </>}
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {view==="calendar"&&(
        <div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",fontSize:12,minWidth:600}}>
            <thead><tr>
              <th style={{padding:"8px 10px",textAlign:"left",color:MU,fontWeight:700,whiteSpace:"nowrap",minWidth:120}}>Date</th>
              {rooms.slice(0,5).map(r=>(
                <th key={r.id} style={{padding:"8px 10px",textAlign:"center",color:MU,fontWeight:700}}>{r.name}</th>
              ))}
            </tr></thead>
            <tbody>
              {availability.map(day=>(
                <tr key={day.date} style={{borderBottom:"1px solid #F0EBF8",background:day.date===today()?"#F8F5FC":"transparent"}}>
                  <td style={{padding:"8px 10px",fontWeight:day.date===today()?700:400,color:DARK,whiteSpace:"nowrap"}}>
                    {new Date(day.date+"T12:00").toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"})}
                    {day.date===today()&&<span style={{fontSize:10,color:P,marginLeft:6}}>Today</span>}
                  </td>
                  {rooms.slice(0,5).map(room=>{
                    const rd=day.rooms?.find(r=>r.room_id===room.id);
                    if(!rd)return <td key={room.id} style={{padding:"8px 10px",textAlign:"center",color:MU}}>—</td>;
                    const avail=rd.available_casual;
                    return (
                      <td key={room.id} style={{padding:"8px 10px",textAlign:"center"}}>
                        <span style={{fontSize:12,fontWeight:700,color:avail>0?OK:DA}}>
                          {avail>0?`${avail} free`:"Full"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
