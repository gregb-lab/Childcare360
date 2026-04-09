/**
 * QualityModule.jsx — v2.12.0
 *   🏆 QIP          — Quality Improvement Plan across all 7 NQS Quality Areas
 *   📚 Portfolio     — Educator professional evidence + reflections
 *   📊 Surveys       — Parent satisfaction surveys with NPS
 *   💡 Prompts       — Documentation story starter templates
 *   🔔 Alerts        — Smart centre-wide compliance alert scanner
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
const bg={padding:"9px 18px",borderRadius:9,border:"1px solid #DDD6EE",background:"#F8F5FC",color:MU,fontWeight:500,cursor:"pointer",fontSize:13};
const inp={padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:13,width:"100%",boxSizing:"border-box",fontFamily:"inherit"};
const lbl={fontSize:11,color:MU,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"};

const RATING_C={working_towards:WA,meeting:IN,exceeding:OK,not_assessed:MU};
const RATING_L={working_towards:"Working Towards",meeting:"Meeting",exceeding:"Exceeding NQS",not_assessed:"Not Assessed"};
const QA_ICONS={1:"📚",2:"🛡️",3:"🏗️",4:"👥",5:"❤️",6:"🤝",7:"🎯"};

const TABS=[
  {id:"qip",icon:"🏆",label:"QIP"},
  {id:"portfolio",icon:"📚",label:"Educator Portfolio"},
  {id:"surveys",icon:"📊",label:"Surveys"},
  {id:"prompts",icon:"💡",label:"Prompts"},
  {id:"alerts",icon:"🔔",label:"Smart Alerts"},
];

export default function QualityModule() {
  const [tab,setTab]=useState("qip");
  const [alertCount,setAlertCount]=useState(0);

  useEffect(()=>{
    API("/api/quality/alerts").then(r=>setAlertCount(r.count||0)).catch(()=>{});
  },[]);

  return (
    <div style={{padding:"24px 28px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
        <span style={{fontSize:28}}>🏆</span>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>Quality & Engagement</h1>
          <p style={{margin:"3px 0 0",fontSize:13,color:MU}}>QIP · Educator Portfolio · Parent Surveys · Documentation Prompts · Smart Alerts</p>
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:24,borderBottom:"1px solid #EDE8F4",paddingBottom:12}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"8px 16px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,position:"relative",
              fontWeight:tab===t.id?700:500,background:tab===t.id?P:"transparent",color:tab===t.id?"#fff":MU}}>
            {t.icon} {t.label}
            {t.id==="alerts"&&alertCount>0&&(
              <span style={{position:"absolute",top:4,right:4,background:DA,color:"#fff",borderRadius:"50%",
                width:16,height:16,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900}}>
                {alertCount>9?"9+":alertCount}
              </span>
            )}
          </button>
        ))}
      </div>
      {tab==="qip"       && <QIPTab />}
      {tab==="portfolio" && <PortfolioTab />}
      {tab==="surveys"   && <SurveysTab />}
      {tab==="prompts"   && <PromptsTab />}
      {tab==="alerts"    && <AlertsTab onCountChange={setAlertCount} />}
    </div>
  );
}

// ─── QIP ─────────────────────────────────────────────────────────────────────
function QIPTab() {
  const [data,setData]=useState(null);
  const [selQA,setSelQA]=useState(null);
  const [goalForm,setGoalForm]=useState({goal:"",actions:"",responsible:"",timeline:""});
  const [showGoalForm,setShowGoalForm]=useState(false);

  const load=useCallback(()=>{
    API("/api/quality/qip").then(setData);
  },[]);
  useEffect(()=>{load();},[load]);

  const updateRating=async(qa,standard,rating)=>{
    await API("/api/quality/qip/assessment",{method:"POST",body:{quality_area:qa,standard,current_rating:rating,assessed_by:"Director"}}).catch(e=>console.error('API error:',e));
    load();
  };

  const addGoal=async()=>{
    if(!goalForm.goal)return;
    await API("/api/quality/qip/goals",{method:"POST",body:{quality_area:selQA,...goalForm}}).catch(e=>console.error('API error:',e));
    setGoalForm({goal:"",actions:"",responsible:"",timeline:""});
    setShowGoalForm(false);load();
  };

  const updateGoal=async(id,status,progress)=>{
    await API(`/api/quality/qip/goals/${id}`,{method:"PUT",body:{status,progress}}).catch(e=>console.error('API error:',e));
    load();
  };

  const deleteGoal=async(id)=>{
    await API(`/api/quality/qip/goals/${id}`,{method:"DELETE"}).catch(e=>console.error('API error:',e));
    load();
  };

  if(!data)return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"60px 20px",color:"#8A7F96"}}><div style={{width:36,height:36,border:"3px solid #EDE8F4",borderTopColor:"#7C3AED",borderRadius:"50%",animation:"spin 0.8s linear infinite",marginBottom:12}}/><div style={{fontSize:13,fontWeight:600}}>Loading quality data...</div></div>;

  const QA_NAMES=data.nqs||{};

  return (
    <div style={{display:"flex",gap:20}}>
      {/* Left: QA overview */}
      <div style={{width:280,flexShrink:0}}>
        <div style={{fontWeight:700,fontSize:13,color:MU,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Quality Areas</div>
        {[1,2,3,4,5,6,7].map(qa=>{
          const s=data.summary?.[qa]||{};
          const c=RATING_C[s.rating]||MU;
          return (
            <button key={qa} onClick={()=>setSelQA(qa===selQA?null:qa)}
              style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1px solid ${selQA===qa?P+"60":"#EDE8F4"}`,
                background:selQA===qa?"#F3E8FF":"#fff",textAlign:"left",cursor:"pointer",marginBottom:6}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <span style={{fontSize:18}}>{QA_ICONS[qa]}</span>
                <span style={{fontWeight:700,fontSize:12,color:DARK,flex:1}}>QA {qa}</span>
                <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:c+"20",color:c}}>
                  {RATING_L[s.rating]||"Not assessed"}
                </span>
              </div>
              <div style={{fontSize:11,color:MU,paddingLeft:26}}>{QA_NAMES[qa]?.title}</div>
              {s.goals_count>0&&(
                <div style={{fontSize:10,color:MU,paddingLeft:26,marginTop:3}}>
                  {s.goals_in_progress} in progress · {s.goals_completed} completed
                </div>
              )}
            </button>
          );
        })}
        <button onClick={async()=>{
          const r=await API("/api/quality/qip/export".catch(e=>console.error('API error:',e)));
          const blob=new Blob([JSON.stringify(r,null,2)],{type:"application/json"});
          const a=document.createElement("a");a.href=URL.createObjectURL(blob);
          a.download="qip-export.json";a.click();
        }} style={{...bg,width:"100%",marginTop:8,fontSize:12}}>
          ↓ Export QIP
        </button>
      </div>

      {/* Right: selected QA detail */}
      {selQA&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:14}}>
          <div style={{fontWeight:700,fontSize:16,color:DARK}}>
            {QA_ICONS[selQA]} Quality Area {selQA} — {QA_NAMES[selQA]?.title}
          </div>

          {/* Standards ratings */}
          <div style={card}>
            <div style={{fontWeight:700,fontSize:13,color:P,marginBottom:12}}>Self-Assessment</div>
            {(QA_NAMES[selQA]?.standards||[]).map(std=>{
              const existing=data.assessments?.find(a=>a.quality_area===selQA&&a.standard===std);
              const rating=existing?.current_rating||"not_assessed";
              return (
                <div key={std} style={{marginBottom:14,paddingBottom:12,borderBottom:"1px solid #F0EBF8"}}>
                  <div style={{fontWeight:600,fontSize:13,color:DARK,marginBottom:8}}>Standard {std}</div>
                  <div style={{display:"flex",gap:6}}>
                    {["working_towards","meeting","exceeding"].map(r=>(
                      <button key={r} onClick={()=>updateRating(selQA,std,r)}
                        style={{flex:1,padding:"8px 4px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",
                          border:`2px solid ${rating===r?(RATING_C[r]||P):"#EDE8F4"}`,
                          background:rating===r?(RATING_C[r]||P)+"20":"transparent",
                          color:rating===r?(RATING_C[r]||P):MU}}>
                        {RATING_L[r]}
                      </button>
                    ))}
                  </div>
                  {existing?.evidence&&(
                    <div style={{fontSize:12,color:DARK,marginTop:6,padding:"6px 10px",background:"#F8F5FC",borderRadius:6}}>
                      📎 {existing.evidence}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Goals */}
          <div style={card}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:13,color:P}}>Improvement Goals</div>
              <button onClick={()=>setShowGoalForm(v=>!v)} style={{...bs,padding:"5px 12px",fontSize:11}}>
                {showGoalForm?"Cancel":"+ Add Goal"}
              </button>
            </div>

            {showGoalForm&&(
              <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE",marginBottom:12}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div style={{gridColumn:"span 2"}}>
                    <label style={lbl}>Goal *</label>
                    <input value={goalForm.goal} onChange={e=>setGoalForm(p=>({...p,goal:e.target.value}))} style={inp} placeholder="What do we want to achieve?"/>
                  </div>
                  <div style={{gridColumn:"span 2"}}>
                    <label style={lbl}>Actions</label>
                    <textarea value={goalForm.actions} onChange={e=>setGoalForm(p=>({...p,actions:e.target.value}))} rows={2} style={{...inp,resize:"vertical"}} placeholder="Steps to achieve this goal"/>
                  </div>
                  <div>
                    <label style={lbl}>Responsible</label>
                    <input value={goalForm.responsible} onChange={e=>setGoalForm(p=>({...p,responsible:e.target.value}))} style={inp} placeholder="e.g. Director"/>
                  </div>
                  <div>
                    <label style={lbl}>Target Date</label>
                    <input type="date" value={goalForm.timeline} onChange={e=>setGoalForm(p=>({...p,timeline:e.target.value}))} style={inp}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <button style={bp} onClick={addGoal}>Add Goal</button>
                  <button style={bs} onClick={()=>setShowGoalForm(false)}>Cancel</button>
                </div>
              </div>
            )}

            {data.goals?.filter(g=>g.quality_area===selQA).length===0
              ? <div style={{textAlign:"center",padding:"60px 20px",color:"#8A7F96"}}><div style={{fontSize:48,marginBottom:12}}>🎯</div><div style={{fontWeight:700,fontSize:15,marginBottom:6,color:"#5C4E6A"}}>No Goals Set</div><div style={{fontSize:13}}>Add improvement goals to your Quality Improvement Plan</div></div>
              : data.goals?.filter(g=>g.quality_area===selQA).map(goal=>{
                const sc={not_started:MU,in_progress:IN,completed:OK,on_hold:WA};
                return (
                  <div key={goal.id} style={{padding:"12px 14px",borderRadius:10,background:"#F8F5FC",marginBottom:8,border:`1px solid ${sc[goal.status]||MU}40`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                      <div style={{fontWeight:600,fontSize:13,color:DARK,flex:1}}>{goal.goal}</div>
                      <button onClick={()=>deleteGoal(goal.id)} style={{background:"none",border:"none",cursor:"pointer",color:MU,fontSize:16,marginLeft:8}}>×</button>
                    </div>
                    {goal.actions&&<div style={{fontSize:12,color:MU,marginBottom:6}}>{goal.actions}</div>}
                    <div style={{display:"flex",gap:12,fontSize:11,color:MU,marginBottom:8}}>
                      {goal.responsible&&<span>👤 {goal.responsible}</span>}
                      {goal.timeline&&<span>📅 {new Date(goal.timeline+"T12:00").toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"})}</span>}
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      {["not_started","in_progress","completed","on_hold"].map(s=>(
                        <button key={s} onClick={()=>updateGoal(goal.id,s,goal.progress)}
                          style={{padding:"3px 10px",borderRadius:20,border:`1px solid ${sc[s]||MU}50`,
                            background:goal.status===s?`${sc[s]}20`:"transparent",
                            color:sc[s]||MU,cursor:"pointer",fontSize:10,fontWeight:700,textTransform:"capitalize"}}>
                          {s.replace("_"," ")}
                        </button>
                      ))}
                      {goal.status==="in_progress"&&(
                        <div style={{flex:1,marginLeft:8}}>
                          <input type="range" min="0" max="100" value={goal.progress||0}
                            onChange={e=>updateGoal(goal.id,goal.status,parseInt(e.target.value))}
                            style={{width:"100%"}}/>
                          <span style={{fontSize:10,color:IN}}>{goal.progress||0}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            }
          </div>
        </div>
      )}

      {!selQA&&(
        <div style={{flex:1,...card,textAlign:"center",padding:"60px 20px",color:MU}}>
          <div style={{fontSize:40}}>🏆</div>
          <div style={{marginTop:12,fontWeight:600,color:DARK}}>Select a Quality Area to begin</div>
          <p style={{fontSize:13}}>Assess your service against each NQS standard and track improvement goals.</p>
        </div>
      )}
    </div>
  );
}

// ─── EDUCATOR PORTFOLIO ───────────────────────────────────────────────────────
function PortfolioTab() {
  const [educators,setEducators]=useState([]);
  const [selEdu,setSelEdu]=useState(null);
  const [portfolio,setPortfolio]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [form,setForm]=useState({entry_type:"reflection",title:"",body:"",nqs_links:[],visibility:"private"});

  useEffect(()=>{
    API("/api/educators/simple").then(r=>setEducators(Array.isArray(r)?r:(r.educators||r.data||[])));
  },[]);

  const loadPortfolio=async(eduId)=>{
    setSelEdu(eduId);
    const r=await API(`/api/quality/portfolio/${eduId}`.catch(e=>console.error('API error:',e)));
    setPortfolio(r);
  };

  const saveEntry=async()=>{
    if(!form.title||!selEdu)return;
    await API("/api/quality/portfolio",{method:"POST",body:{educator_id:selEdu,...form}}).catch(e=>console.error('API error:',e));
    setShowNew(false);
    setForm({entry_type:"reflection",title:"",body:"",nqs_links:[],visibility:"private"});
    loadPortfolio(selEdu);
  };

  const deleteEntry=async(id)=>{
    await API(`/api/quality/portfolio/${id}`,{method:"DELETE"}).catch(e=>console.error('API error:',e));
    loadPortfolio(selEdu);
  };

  const NQS_QAS=[...Array(7)].map((_,i)=>`QA${i+1}`);
  const TYPE_C={reflection:P,evidence:OK,goal:WA,pd:IN};

  return (
    <div style={{display:"flex",gap:20}}>
      <div style={{width:220,flexShrink:0}}>
        <div style={{fontWeight:700,fontSize:13,color:MU,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Educator</div>
        {educators.map(e=>(
          <button key={e.id} onClick={()=>loadPortfolio(e.id)}
            style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${selEdu===e.id?P:"#EDE8F4"}`,
              background:selEdu===e.id?PL:"#fff",textAlign:"left",cursor:"pointer",marginBottom:6,fontSize:13}}>
            <div style={{fontWeight:selEdu===e.id?700:400,color:DARK}}>{e.first_name} {e.last_name}</div>
            <div style={{fontSize:11,color:MU,marginTop:2}}>{e.qualification}</div>
          </button>
        ))}
      </div>

      <div style={{flex:1}}>
        {!selEdu&&(
          <div style={{...card,textAlign:"center",padding:"60px 20px",color:MU}}>
            <div style={{fontSize:40}}>📚</div>
            <div style={{marginTop:12,fontWeight:600,color:DARK}}>Select an educator to view their portfolio</div>
          </div>
        )}

        {selEdu&&portfolio&&(
          <>
            {/* Stats */}
            <div style={{display:"flex",gap:10,marginBottom:16}}>
              {[["Entries",portfolio.stats?.total,P],["Reflections",portfolio.stats?.reflections,IN],
                ["Evidence",portfolio.stats?.evidence,OK],["Reviewed",portfolio.stats?.reviewed,WA]].map(([l,v,c])=>(
                <div key={l} style={{...card,flex:1,textAlign:"center",padding:"10px"}}>
                  <div style={{fontSize:20,fontWeight:900,color:c}}>{v||0}</div>
                  <div style={{fontSize:11,color:MU,marginTop:2}}>{l}</div>
                </div>
              ))}
              <button onClick={()=>setShowNew(v=>!v)} style={{...bp,alignSelf:"center"}}>
                {showNew?"Cancel":"+ New Entry"}
              </button>
            </div>

            {showNew&&(
              <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>
                    <label style={lbl}>Entry Type</label>
                    <select value={form.entry_type} onChange={e=>setForm(p=>({...p,entry_type:e.target.value}))} style={inp}>
                      {["reflection","evidence","goal","pd"].map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Visibility</label>
                    <select value={form.visibility} onChange={e=>setForm(p=>({...p,visibility:e.target.value}))} style={inp}>
                      <option value="private">Private (me only)</option>
                      <option value="manager">Manager can view</option>
                      <option value="team">Whole team</option>
                    </select>
                  </div>
                  <div style={{gridColumn:"span 2"}}>
                    <label style={lbl}>Title *</label>
                    <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} style={inp}/>
                  </div>
                  <div style={{gridColumn:"span 2"}}>
                    <label style={lbl}>Reflection / Evidence</label>
                    <textarea value={form.body} onChange={e=>setForm(p=>({...p,body:e.target.value}))} rows={4} style={{...inp,resize:"vertical"}}/>
                  </div>
                  <div style={{gridColumn:"span 2"}}>
                    <label style={lbl}>NQS Quality Areas (link to)</label>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
                      {NQS_QAS.map(qa=>(
                        <label key={qa} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:12,
                          padding:"4px 10px",borderRadius:20,border:`1px solid ${form.nqs_links.includes(qa)?P+"80":"#DDD6EE"}`,
                          background:form.nqs_links.includes(qa)?PL:"transparent"}}>
                          <input type="checkbox" checked={form.nqs_links.includes(qa)}
                            onChange={e=>setForm(p=>({...p,nqs_links:e.target.checked?[...p.nqs_links,qa]:p.nqs_links.filter(x=>x!==qa)}))}
                            style={{display:"none"}}/>
                          {qa}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <button style={bp} onClick={saveEntry}>Save Entry</button>
                  <button style={bs} onClick={()=>setShowNew(false)}>Cancel</button>
                </div>
              </div>
            )}

            {portfolio.entries?.length===0
              ? <div style={{...card,textAlign:"center",padding:"40px 20px",color:MU}}><div style={{fontSize:36}}>📚</div><div style={{marginTop:8}}>No portfolio entries yet</div></div>
              : portfolio.entries?.map(e=>(
                <div key={e.id} style={{...card,marginBottom:10,borderLeft:`4px solid ${TYPE_C[e.entry_type]||P}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <div>
                      <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,marginRight:8,
                        background:(TYPE_C[e.entry_type]||P)+"20",color:TYPE_C[e.entry_type]||P,textTransform:"capitalize"}}>
                        {e.entry_type}
                      </span>
                      <span style={{fontWeight:700,fontSize:14,color:DARK}}>{e.title}</span>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      {e.nqs_links?.map(l=><span key={l} style={{fontSize:10,color:P,background:PL,padding:"1px 6px",borderRadius:20}}>{l}</span>)}
                      <button onClick={()=>deleteEntry(e.id)} style={{background:"none",border:"none",cursor:"pointer",color:MU,fontSize:16}}>×</button>
                    </div>
                  </div>
                  {e.body&&<div style={{fontSize:13,color:DARK,lineHeight:1.6,marginTop:6}}>{e.body}</div>}
                  <div style={{fontSize:11,color:MU,marginTop:8}}>
                    {new Date(e.created_at).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"})}
                    {e.reviewer_feedback&&<span style={{color:OK,marginLeft:8}}>✓ Reviewed</span>}
                  </div>
                </div>
              ))
            }
          </>
        )}
      </div>
    </div>
  );
}

// ─── SURVEYS ─────────────────────────────────────────────────────────────────
function SurveysTab() {
  const [surveys,setSurveys]=useState([]);
  const [results,setResults]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [form,setForm]=useState({title:"Family Satisfaction Survey",description:"",survey_type:"satisfaction"});

  const load=useCallback(()=>{
    API("/api/quality/surveys").then(r=>setSurveys(r.surveys||[]));
  },[]);
  useEffect(()=>{load();},[load]);

  const createSurvey=async()=>{
    if(!form.title)return;
    await API("/api/quality/surveys",{method:"POST",body:{...form,open_date:new Date().toISOString().split("T")[0]}}).catch(e=>console.error('API error:',e));
    setShowNew(false);load();
  };

  const loadResults=async(id)=>{
    const r=await API(`/api/quality/surveys/${id}/results`.catch(e=>console.error('API error:',e)));
    setResults(r);
  };

  const NPSColor=n=>n>=50?OK:n>=0?WA:DA;

  return (
    <div style={{display:"flex",gap:20}}>
      <div style={{flex:1}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:13,color:MU}}>Collect structured feedback from families with NPS tracking</div>
          <button style={bp} onClick={()=>setShowNew(v=>!v)}>{showNew?"Cancel":"+ New Survey"}</button>
        </div>

        {showNew&&(
          <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE",marginBottom:14}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{gridColumn:"span 2"}}>
                <label style={lbl}>Survey Title *</label>
                <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={lbl}>Type</label>
                <select value={form.survey_type} onChange={e=>setForm(p=>({...p,survey_type:e.target.value}))} style={inp}>
                  <option value="satisfaction">Family Satisfaction</option>
                  <option value="enrolment">Enrolment Experience</option>
                  <option value="program">Educational Program</option>
                  <option value="general">General Feedback</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Description</label>
                <input value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} style={inp}/>
              </div>
            </div>
            <p style={{fontSize:12,color:MU,marginTop:10,marginBottom:12}}>
              A default 8-question NPS survey will be created. Includes overall recommendation score, satisfaction ratings, and open text feedback.
            </p>
            <div style={{display:"flex",gap:8}}>
              <button style={bp} onClick={createSurvey}>Create Survey</button>
              <button style={bs} onClick={()=>setShowNew(false)}>Cancel</button>
            </div>
          </div>
        )}

        {surveys.map(s=>(
          <div key={s.id} style={{...card,marginBottom:10,cursor:"pointer",border:`1px solid ${results?.survey?.id===s.id?P+"60":"#EDE8F4"}`}}
            onClick={()=>loadResults(s.id)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:DARK}}>{s.title}</div>
                <div style={{fontSize:12,color:MU,marginTop:2}}>
                  {s.survey_type} · {s.response_count||0} responses
                  {s.avg_nps!=null&&<span style={{marginLeft:10,fontWeight:700,color:NPSColor(s.avg_nps)}}>NPS: {Math.round(s.avg_nps||0)}</span>}
                </div>
              </div>
              <span style={{fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:20,
                background:s.status==="active"?"#F0FDF4":"#F5F5F5",
                color:s.status==="active"?OK:MU}}>
                {s.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Results panel */}
      {results&&(
        <div style={{width:380,flexShrink:0}}>
          <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:14}}>{results.survey?.title} — Results</div>
          <div style={{display:"flex",gap:10,marginBottom:14}}>
            <div style={{...card,flex:1,textAlign:"center",padding:"12px"}}>
              <div style={{fontSize:24,fontWeight:900,color:P}}>{results.total_responses||0}</div>
              <div style={{fontSize:11,color:MU}}>Responses</div>
            </div>
            {results.overall_nps!=null&&(
              <div style={{...card,flex:1,textAlign:"center",padding:"12px"}}>
                <div style={{fontSize:24,fontWeight:900,color:NPSColor(results.overall_nps)}}>{results.overall_nps}</div>
                <div style={{fontSize:11,color:MU}}>NPS Score</div>
              </div>
            )}
            {results.avg_satisfaction!=null&&(
              <div style={{...card,flex:1,textAlign:"center",padding:"12px"}}>
                <div style={{fontSize:24,fontWeight:900,color:OK}}>{results.avg_satisfaction}/5</div>
                <div style={{fontSize:11,color:MU}}>Avg Rating</div>
              </div>
            )}
          </div>
          {(results.aggregated||[]).map(q=>(
            <div key={q.id} style={{...card,marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:700,color:DARK,marginBottom:8}}>{q.text}</div>
              {q.type==="nps"&&q.nps!=null&&(
                <div style={{fontSize:22,fontWeight:900,color:NPSColor(q.nps)}}>NPS: {q.nps}</div>
              )}
              {q.type==="rating"&&(
                <div>
                  <div style={{fontSize:18,fontWeight:900,color:OK}}>{(q.avg||0).toFixed(1)}/5</div>
                  <div style={{marginTop:6,background:"#F0EBF8",borderRadius:4,height:8}}>
                    <div style={{width:`${((q.avg||0)/5)*100}%`,height:"100%",background:P,borderRadius:4}}/>
                  </div>
                </div>
              )}
              {q.type==="text"&&q.text_responses?.length>0&&(
                <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:150,overflowY:"auto"}}>
                  {q.text_responses.map((t,i)=>(
                    <div key={i} style={{fontSize:12,color:DARK,padding:"5px 8px",background:"#F8F5FC",borderRadius:6}}>"{t}"</div>
                  ))}
                </div>
              )}
              <div style={{fontSize:10,color:MU,marginTop:4}}>{q.responses} responses</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DOCUMENTATION PROMPTS ────────────────────────────────────────────────────
function PromptsTab() {
  const [prompts,setPrompts]=useState([]);
  const [category,setCategory]=useState("all");
  const [copied,setCopied]=useState(null);

  const load=useCallback(()=>{
    const url=category==="all"?"/api/quality/prompts":`/api/quality/prompts?category=${category}`;
    API(url).then(r=>setPrompts(r.prompts||[]));
  },[category]);
  useEffect(()=>{load();},[load]);

  const copy=async(text,id)=>{
    try{await navigator.clipboard.writeText(text);}catch(e){/* fallback */}
    setCopied(id);
    setTimeout(()=>setCopied(null),2000);
  };

  const CAT_C={learning_story:P,daily_update:OK,observation:IN,group_story:WA,general:MU};
  const CATS=["all","learning_story","daily_update","observation","group_story"];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {CATS.map(c=>(
          <button key={c} onClick={()=>setCategory(c)}
            style={{padding:"6px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              background:category===c?P:"#F0EBF8",color:category===c?"#fff":P,textTransform:"capitalize"}}>
            {c.replace("_"," ")}
          </button>
        ))}
      </div>
      <p style={{fontSize:13,color:MU,margin:0}}>
        Click any prompt to copy it. Use as a starting point for learning stories and observations.
      </p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
        {prompts.map(p=>(
          <div key={p.id} style={{...card,border:`1px solid ${CAT_C[p.category]||MU}40`,cursor:"pointer",
            background:copied===p.id?"#F0FDF4":"#fff",transition:"background 0.2s"}}
            onClick={()=>copy(p.prompt_text,p.id)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,marginRight:6,
                  background:(CAT_C[p.category]||MU)+"20",color:CAT_C[p.category]||MU}}>
                  {(p.category||"general").replace("_"," ")}
                </span>
                {p.is_system?<span style={{fontSize:10,color:MU}}>System</span>:""}
              </div>
              <span style={{fontSize:11,color:copied===p.id?OK:MU,fontWeight:copied===p.id?700:400}}>
                {copied===p.id?"✓ Copied!":"Click to copy"}
              </span>
            </div>
            <div style={{fontWeight:600,fontSize:13,color:DARK,marginBottom:6}}>{p.title}</div>
            <div style={{fontSize:12,color:MU,lineHeight:1.6}}>{p.prompt_text}</div>
            {p.eylf_suggested?.length>0&&(
              <div style={{display:"flex",gap:4,marginTop:8,flexWrap:"wrap"}}>
                {p.eylf_suggested.map(l=><span key={l} style={{fontSize:10,color:P,background:PL,padding:"1px 6px",borderRadius:20}}>EYLF {l}</span>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SMART ALERTS ─────────────────────────────────────────────────────────────
function AlertsTab({onCountChange}) {
  const [alerts,setAlerts]=useState([]);
  const [scanning,setScanning]=useState(false);

  const load=useCallback(()=>{
    API("/api/quality/alerts").then(r=>{
      setAlerts(r.alerts||[]);
      onCountChange?.(r.count||0);
    });
  },[onCountChange]);
  useEffect(()=>{load();},[load]);

  const scan=async()=>{
    setScanning(true);
    await API("/api/quality/alerts/scan",{method:"POST"}).catch(e=>console.error('API error:',e));
    load();setScanning(false);
  };

  const dismiss=async(id)=>{
    await API(`/api/quality/alerts/${id}/dismiss`,{method:"PUT"}).catch(e=>console.error('API error:',e));
    load();
  };

  const PRIO_C={high:DA,medium:WA,normal:IN,low:MU};
  const TYPE_ICONS={cert_expiry:"🪪",ccs_missing:"💰",overdue_debt:"💳",casual_pending:"📅",
                    transition_missing:"🎓",qip_overdue:"🏆",appraisal_overdue:"⭐"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:13,color:MU}}>Automated scan of your centre for compliance and operational issues</div>
        <button style={bp} onClick={scan} disabled={scanning}>
          {scanning?"Scanning…":"🔍 Scan Centre Now"}
        </button>
      </div>

      {alerts.length===0?(
        <div style={{...card,textAlign:"center",padding:"50px 20px",color:MU}}>
          <div style={{fontSize:40}}>✅</div>
          <div style={{marginTop:12,fontWeight:600,color:DARK}}>No active alerts</div>
          <p style={{fontSize:13}}>Click "Scan Centre Now" to check for issues across your entire service.</p>
        </div>
      ):alerts.map(a=>(
        <div key={a.id} style={{...card,borderLeft:`4px solid ${PRIO_C[a.priority]||MU}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <span style={{fontSize:18}}>{TYPE_ICONS[a.alert_type]||"⚠️"}</span>
                <span style={{fontWeight:700,fontSize:14,color:DARK}}>{a.title}</span>
                <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,
                  background:(PRIO_C[a.priority]||MU)+"20",color:PRIO_C[a.priority]||MU,textTransform:"capitalize"}}>
                  {a.priority}
                </span>
              </div>
              {a.message&&<div style={{fontSize:13,color:MU,paddingLeft:26}}>{a.message}</div>}
            </div>
            <button onClick={()=>dismiss(a.id)}
              style={{padding:"5px 12px",borderRadius:7,border:"1px solid #EDE8F4",background:"#F5F5F5",
                color:MU,cursor:"pointer",fontSize:11,flexShrink:0,marginLeft:12}}>
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
