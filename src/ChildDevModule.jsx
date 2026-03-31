/**
 * ChildDevModule.jsx — v2.11.0
 *   🍽️  Menus     — weekly menu builder, allergen alerts, copy last week
 *   🌱  Milestones — EYLF-aligned developmental tracker per child
 *   🎓  Transitions — school readiness reports with auto-draft from observations
 */
import { useState, useEffect, useCallback } from "react";

const API = (p, o={}) => {
  const t=localStorage.getItem("c360_token"), tid=localStorage.getItem("c360_tenant");
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

const DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday"];
const MEALS=["breakfast","morning_tea","lunch","afternoon_tea","late_snack"];
const MEAL_ICONS={breakfast:"🌅",morning_tea:"☕",lunch:"🍱",afternoon_tea:"🍎",late_snack:"🌙"};
const ALLERGENS=["milk","eggs","fish","shellfish","tree_nuts","peanuts","wheat","soy","sesame","gluten"];

function getMonday(date=new Date()) {
  const d=new Date(date);
  const day=d.getDay();
  const diff=d.getDate()-(day===0?6:day-1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

const TABS=[{id:"menus",icon:"🍽️",label:"Menu Planning"},{id:"milestones",icon:"🌱",label:"Milestones"},{id:"transitions",icon:"🎓",label:"Transition Reports"}];

export default function ChildDevModule() {
  const [tab,setTab]=useState("menus");
  return (
    <div style={{padding:"24px 28px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
        <span style={{fontSize:28}}>🌱</span>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>Child Development & Nutrition</h1>
          <p style={{margin:"3px 0 0",fontSize:13,color:MU}}>Weekly menus · Developmental milestones · School transition reports</p>
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
      {tab==="menus"       && <MenusTab />}
      {tab==="milestones"  && <MilestonesTab />}
      {tab==="transitions" && <TransitionsTab />}
    </div>
  );
}

// ─── MENU PLANNING ────────────────────────────────────────────────────────────
function MenusTab() {
  const [weekStart, setWeekStart]=useState(getMonday());
  const [menuData, setMenuData]=useState({plan:null,items:[]});
  const [dietary, setDietary]=useState([]);
  const [allergenAlerts, setAllergenAlerts]=useState([]);
  const [editing, setEditing]=useState(false);
  const [grid, setGrid]=useState({}); // {`${day}_${meal}`: {description,allergens,is_vegetarian,is_halal}}
  const [saving, setSaving]=useState(false);
  const [showDietary, setShowDietary]=useState(false);
  const [children, setChildren]=useState([]);
  const [dietForm, setDietForm]=useState({child_id:"",requirement_type:"",description:"",severity:"intolerance",allergens:[]});

  const load=useCallback(()=>{
    Promise.all([
      API(`/api/childdev/menus/${weekStart}`),
      API("/api/childdev/dietary"),
      API("/api/children/simple"),
    ]).then(([md,dr,cr])=>{
      setMenuData(md);
      setDietary(dr.requirements||[]);
      setChildren(Array.isArray(cr)?cr:(cr.children||cr.data||[]));
      // Build grid from items
      const g={};
      (md.items||[]).forEach(item=>{
        g[`${item.day_of_week}_${item.meal_type}`]={
          description:item.description,
          allergens:item.allergens||[],
          is_vegetarian:item.is_vegetarian===1,
          is_halal:item.is_halal===1,
        };
      });
      setGrid(g);
    });
  },[weekStart]);

  useEffect(()=>{load();},[load]);

  useEffect(()=>{
    if(Object.keys(grid).length>0){
      API(`/api/childdev/menus/${weekStart}/allergen-check`)
        .then(r=>setAllergenAlerts(r.alerts||[]))
        .catch(()=>{});
    }
  },[weekStart]);

  const prevWeek=()=>{const d=new Date(weekStart);d.setDate(d.getDate()-7);setWeekStart(d.toISOString().split("T")[0]);};
  const nextWeek=()=>{const d=new Date(weekStart);d.setDate(d.getDate()+7);setWeekStart(d.toISOString().split("T")[0]);};

  const saveMenu=async()=>{
    setSaving(true);
    const items=[];
    Object.entries(grid).forEach(([key,val])=>{
      if(!val.description)return;
      const [day,meal]=key.split("_",2);
      const mealType=key.substring(key.indexOf("_")+1);
      items.push({day_of_week:parseInt(day),meal_type:mealType,...val});
    });
    await API(`/api/childdev/menus/${weekStart}`,{method:"POST",body:{plan_name:"Weekly Menu",items}});
    setSaving(false);setEditing(false);
    API(`/api/childdev/menus/${weekStart}/allergen-check`).then(r=>setAllergenAlerts(r.alerts||[]));
    load();
  };

  const copyLastWeek=async()=>{
    const prev=new Date(weekStart);prev.setDate(prev.getDate()-7);
    const prevStr=prev.toISOString().split("T")[0];
    await API(`/api/childdev/menus/${weekStart}/copy-from/${prevStr}`,{method:"POST"});
    load();
  };

  const addDietary=async()=>{
    if(!dietForm.child_id||!dietForm.requirement_type)return;
    await API("/api/childdev/dietary",{method:"POST",body:dietForm});
    setDietForm({child_id:"",requirement_type:"",description:"",severity:"intolerance",allergens:[]});
    load();
  };

  const removeDietary=async(id)=>{
    await API(`/api/childdev/dietary/${id}`,{method:"DELETE"});
    load();
  };

  const fmtWeek=w=>{
    const d=new Date(w+"T12:00");
    const end=new Date(d);end.setDate(d.getDate()+4);
    return `${d.toLocaleDateString("en-AU",{day:"numeric",month:"short"})} – ${end.toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"})}`;
  };

  const SEV_C={allergy:DA,intolerance:WA,preference:"#6B7280"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Week nav */}
      <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <button onClick={prevWeek} style={bg}>← Prev</button>
        <div style={{fontWeight:700,fontSize:15,color:DARK,flex:1,textAlign:"center"}}>{fmtWeek(weekStart)}</div>
        <button onClick={nextWeek} style={bg}>Next →</button>
        <button onClick={()=>setWeekStart(getMonday())} style={{...bg,fontSize:12}}>This Week</button>
        {!editing&&<><button onClick={copyLastWeek} style={{...bs,fontSize:12}}>Copy Last Week</button>
          <button onClick={()=>setEditing(true)} style={bp}>✏️ Edit Menu</button></>}
        {editing&&<><button onClick={saveMenu} disabled={saving} style={bp}>{saving?"Saving…":"Save Menu"}</button>
          <button onClick={()=>{setEditing(false);load();}} style={bs}>Cancel</button></>}
        {menuData.plan?.status==="draft"&&!editing&&(
          <button onClick={async()=>{await API(`/api/childdev/menus/${weekStart}/approve`,{method:"PUT",body:{approved_by:"Director"}});load();}}
            style={{...bs,color:OK,borderColor:OK,fontSize:12}}>✓ Approve</button>
        )}
      </div>

      {/* Status banner */}
      {menuData.plan&&(
        <div style={{padding:"8px 14px",borderRadius:9,fontSize:12,
          background:menuData.plan.status==="approved"?"#F0FDF4":"#FFFBEB",
          border:`1px solid ${menuData.plan.status==="approved"?"#A5D6A7":"#FDE68A"}`,
          color:menuData.plan.status==="approved"?OK:WA}}>
          {menuData.plan.status==="approved"
            ? `✓ Approved${menuData.plan.approved_by?" by "+menuData.plan.approved_by:""}`
            : "Draft — not yet approved"}
        </div>
      )}

      {/* Allergen alerts */}
      {allergenAlerts.length>0&&(
        <div style={{...card,background:"#FEF2F2",border:"1px solid #FCA5A5"}}>
          <div style={{fontWeight:700,fontSize:13,color:DA,marginBottom:8}}>⚠️ Allergen Alerts ({allergenAlerts.length} children)</div>
          {allergenAlerts.map((a,i)=>(
            <div key={i} style={{fontSize:12,padding:"4px 0",borderBottom:"1px solid #FEE2E2"}}>
              <strong>{a.child_name}</strong> ({a.room}) — {a.requirement}: <span style={{color:DA,fontWeight:700}}>{a.conflicting_allergens.join(", ")}</span>
              {a.action_plan&&<span style={{color:MU}}> · {a.action_plan}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Menu grid */}
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
          <thead><tr style={{background:"#F8F5FC"}}>
            <th style={{padding:"10px",textAlign:"left",color:MU,fontWeight:700,fontSize:12,width:120}}>Meal</th>
            {DAYS.map(d=><th key={d} style={{padding:"10px",textAlign:"left",color:DARK,fontWeight:700,fontSize:13}}>{d}</th>)}
          </tr></thead>
          <tbody>
            {MEALS.map(meal=>(
              <tr key={meal} style={{borderBottom:"1px solid #F0EBF8"}}>
                <td style={{padding:"10px",fontWeight:600,fontSize:12,color:P,whiteSpace:"nowrap"}}>
                  {MEAL_ICONS[meal]} {meal.replace("_"," ")}
                </td>
                {[1,2,3,4,5].map(day=>{
                  const key=`${day}_${meal}`;
                  const cell=grid[key]||{};
                  return (
                    <td key={day} style={{padding:"6px 8px",verticalAlign:"top"}}>
                      {editing?(
                        <div>
                          <textarea value={cell.description||""} onChange={e=>setGrid(p=>({...p,[key]:{...(p[key]||{}),description:e.target.value}}))}
                            rows={2} placeholder="Enter menu item…"
                            style={{...inp,fontSize:12,resize:"none",padding:"6px 8px"}}/>
                          <div style={{display:"flex",gap:8,marginTop:4,fontSize:11}}>
                            <label style={{display:"flex",alignItems:"center",gap:3,cursor:"pointer",color:OK}}>
                              <input type="checkbox" checked={!!cell.is_vegetarian} onChange={e=>setGrid(p=>({...p,[key]:{...(p[key]||{}),is_vegetarian:e.target.checked}}))}/>🌿V
                            </label>
                            <label style={{display:"flex",alignItems:"center",gap:3,cursor:"pointer",color:WA}}>
                              <input type="checkbox" checked={!!cell.is_halal} onChange={e=>setGrid(p=>({...p,[key]:{...(p[key]||{}),is_halal:e.target.checked}}))}/>☪H
                            </label>
                          </div>
                        </div>
                      ):(
                        <div style={{fontSize:12,color:cell.description?DARK:MU,lineHeight:1.4,minHeight:36}}>
                          {cell.description||<span style={{opacity:0.4}}>—</span>}
                          {(cell.is_vegetarian||cell.is_halal)&&(
                            <div style={{marginTop:3,display:"flex",gap:4}}>
                              {cell.is_vegetarian&&<span style={{fontSize:10,background:"#F0FDF4",color:OK,padding:"1px 5px",borderRadius:20}}>🌿V</span>}
                              {cell.is_halal&&<span style={{fontSize:10,background:"#FFFBEB",color:WA,padding:"1px 5px",borderRadius:20}}>☪H</span>}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dietary requirements */}
      <div style={card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:14,color:DARK}}>Dietary Requirements ({dietary.length})</div>
          <button onClick={()=>setShowDietary(v=>!v)} style={{...bs,fontSize:12,padding:"6px 14px"}}>{showDietary?"Cancel":"+ Add"}</button>
        </div>

        {showDietary&&(
          <div style={{...card,background:"#FFF7ED",border:"1px solid #FDE68A",marginBottom:14}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <label style={lbl}>Child *</label>
                <select value={dietForm.child_id} onChange={e=>setDietForm(p=>({...p,child_id:e.target.value}))} style={inp}>
                  <option value="">Select child…</option>
                  {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Type *</label>
                <input value={dietForm.requirement_type} onChange={e=>setDietForm(p=>({...p,requirement_type:e.target.value}))} style={inp} placeholder="e.g. Peanut allergy, Dairy free, Vegetarian"/>
              </div>
              <div>
                <label style={lbl}>Severity</label>
                <select value={dietForm.severity} onChange={e=>setDietForm(p=>({...p,severity:e.target.value}))} style={inp}>
                  <option value="allergy">Allergy (anaphylaxis risk)</option>
                  <option value="intolerance">Intolerance</option>
                  <option value="preference">Preference/cultural</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Description</label>
                <input value={dietForm.description} onChange={e=>setDietForm(p=>({...p,description:e.target.value}))} style={inp} placeholder="Additional details"/>
              </div>
              <div style={{gridColumn:"span 2"}}>
                <label style={lbl}>Allergens (select all that apply)</label>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
                  {ALLERGENS.map(a=>(
                    <label key={a} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:12,
                      padding:"4px 10px",borderRadius:20,border:`1px solid ${dietForm.allergens.includes(a)?DA+"80":"#DDD6EE"}`,
                      background:dietForm.allergens.includes(a)?"#FEF2F2":"transparent"}}>
                      <input type="checkbox" checked={dietForm.allergens.includes(a)}
                        onChange={e=>setDietForm(p=>({...p,allergens:e.target.checked?[...p.allergens,a]:p.allergens.filter(x=>x!==a)}))}
                        style={{display:"none"}}/>
                      {a}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button style={bp} onClick={addDietary}>Save</button>
              <button style={bs} onClick={()=>setShowDietary(false)}>Cancel</button>
            </div>
          </div>
        )}

        {dietary.length===0
          ? <div style={{color:MU,fontSize:13,textAlign:"center",padding:"16px 0"}}>No dietary requirements on file</div>
          : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
              {dietary.map(d=>(
                <div key={d.id} style={{padding:"10px 14px",borderRadius:10,border:`2px solid ${SEV_C[d.severity]||MU}40`,
                  background:`${SEV_C[d.severity]||MU}08`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:13,color:DARK}}>{d.first_name} {d.last_name}</div>
                      <div style={{fontSize:12,color:SEV_C[d.severity]||MU,fontWeight:600,marginTop:2}}>{d.requirement_type}</div>
                      {d.description&&<div style={{fontSize:11,color:MU,marginTop:2}}>{d.description}</div>}
                      {d.allergens?.length>0&&(
                        <div style={{display:"flex",gap:4,marginTop:4,flexWrap:"wrap"}}>
                          {d.allergens.map(a=><span key={a} style={{fontSize:10,background:DA+"20",color:DA,padding:"1px 6px",borderRadius:20,fontWeight:700}}>{a}</span>)}
                        </div>
                      )}
                    </div>
                    <button onClick={()=>removeDietary(d.id)} style={{background:"none",border:"none",cursor:"pointer",color:MU,fontSize:16}}>×</button>
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  );
}

// ─── MILESTONES ───────────────────────────────────────────────────────────────
function MilestonesTab() {
  const [children,setChildren]=useState([]);
  const [selChild,setSelChild]=useState(null);
  const [data,setData]=useState(null);
  const [saving,setSaving]=useState(false);
  const [expanded,setExpanded]=useState({});

  useEffect(()=>{
    API("/api/children/simple").then(r=>setChildren(Array.isArray(r)?r:(r.children||r.data||[])));
  },[]);

  const loadMilestones=async(childId)=>{
    setSelChild(childId);
    const r=await API(`/api/childdev/milestones/${childId}`);
    setData(r);
  };

  const toggle=async(childId,domain,milestone)=>{
    const currently=data?.framework?.[domain]?.milestones?.find(m=>m.key===milestone.key);
    const nowAchieved=!currently?.achieved;
    setSaving(true);
    await API(`/api/childdev/milestones/${childId}`,{method:"POST",body:{
      milestone_key:milestone.key, domain, milestone_label:milestone.label,
      age_months_expected:milestone.age, achieved:nowAchieved
    }});
    const r=await API(`/api/childdev/milestones/${childId}`);
    setData(r);setSaving(false);
  };

  const DOMAIN_COLORS={
    communication:IN,social_emotional:"#E11D48",
    physical_gross:OK,physical_fine:"#7C3AED",
    cognitive:WA,self_care:"#0E7490"
  };

  return (
    <div style={{display:"flex",gap:20}}>
      {/* Child list */}
      <div style={{width:220,flexShrink:0}}>
        <div style={{fontWeight:700,fontSize:13,color:MU,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Select Child</div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {children.map(c=>(
            <button key={c.id} onClick={()=>loadMilestones(c.id)}
              style={{padding:"10px 12px",borderRadius:10,border:`1px solid ${selChild===c.id?P:"#EDE8F4"}`,
                background:selChild===c.id?PL:"#fff",color:DARK,textAlign:"left",cursor:"pointer",fontSize:13}}>
              <div style={{fontWeight:selChild===c.id?700:400}}>{c.first_name} {c.last_name}</div>
              {c.dob&&<div style={{fontSize:11,color:MU,marginTop:2}}>
                {Math.floor((Date.now()-new Date(c.dob))/(1000*60*60*24*30.44))}m old
              </div>}
            </button>
          ))}
        </div>
      </div>

      {/* Milestone content */}
      <div style={{flex:1}}>
        {!selChild&&(
          <div style={{...card,textAlign:"center",padding:"60px 20px",color:MU}}>
            <div style={{fontSize:40}}>🌱</div>
            <div style={{marginTop:12,fontWeight:600,color:DARK}}>Select a child to view milestones</div>
          </div>
        )}
        {selChild&&data&&(
          <>
            {/* Stats */}
            <div style={{display:"flex",gap:12,marginBottom:16}}>
              {[
                ["Age",`${data.stats?.age_months}m`,DARK],
                ["Achieved",data.stats?.achieved,OK],
                ["Total",data.stats?.total,P],
                ["Overdue",data.stats?.overdue,data.stats?.overdue>0?DA:MU],
              ].map(([l,v,c])=>(
                <div key={l} style={{...card,flex:1,textAlign:"center",padding:"12px"}}>
                  <div style={{fontSize:22,fontWeight:900,color:c}}>{v}</div>
                  <div style={{fontSize:11,color:MU,marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>

            {/* Domain sections */}
            {Object.entries(data.framework||{}).map(([domainKey,domain])=>{
              const achievedCount=domain.milestones.filter(m=>m.achieved).length;
              const totalCount=domain.milestones.length;
              const color=DOMAIN_COLORS[domainKey]||P;
              const isExpanded=expanded[domainKey]!==false; // default open

              return (
                <div key={domainKey} style={{...card,marginBottom:12,borderLeft:`4px solid ${color}`}}>
                  <div onClick={()=>setExpanded(p=>({...p,[domainKey]:!isExpanded}))}
                    style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:20}}>{domain.icon}</span>
                      <span style={{fontWeight:700,fontSize:14,color:DARK}}>{domain.label}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      {/* Progress bar */}
                      <div style={{width:100,background:"#F0EBF8",borderRadius:4,height:6}}>
                        <div style={{width:`${(achievedCount/totalCount)*100}%`,height:"100%",background:color,borderRadius:4}}/>
                      </div>
                      <span style={{fontSize:12,color:MU}}>{achievedCount}/{totalCount}</span>
                      <span style={{fontSize:12,color:MU}}>{isExpanded?"▲":"▼"}</span>
                    </div>
                  </div>

                  {isExpanded&&(
                    <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:6}}>
                      {domain.milestones.map(m=>{
                        const isAchieved=m.achieved;
                        const isOverdue=m.overdue;
                        const isUpcoming=m.upcoming;
                        return (
                          <div key={m.key} onClick={()=>!saving&&toggle(selChild,domainKey,m)}
                            style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:10,
                              cursor:saving?"wait":"pointer",
                              background:isAchieved?"#F0FDF4":isOverdue?"#FEF2F2":isUpcoming?"#FEFCE8":"#FAFAFA",
                              border:`1px solid ${isAchieved?OK+"40":isOverdue?DA+"40":isUpcoming?WA+"40":"#EDE8F4"}`}}>
                            {/* Checkbox */}
                            <div style={{width:22,height:22,borderRadius:6,flexShrink:0,
                              background:isAchieved?OK:"transparent",
                              border:`2px solid ${isAchieved?OK:isOverdue?DA:isUpcoming?WA:"#DDD6EE"}`,
                              display:"flex",alignItems:"center",justifyContent:"center"}}>
                              {isAchieved&&<span style={{color:"#fff",fontSize:13,lineHeight:1}}>✓</span>}
                            </div>
                            <div style={{flex:1}}>
                              <div style={{fontSize:13,color:isAchieved?OK:DARK,textDecoration:isAchieved?"line-through":"none",fontWeight:isUpcoming?600:400}}>
                                {m.label}
                              </div>
                              <div style={{fontSize:11,color:MU,marginTop:1}}>
                                Expected: {m.age}m
                                {isOverdue&&<span style={{color:DA,fontWeight:700}}> · Overdue</span>}
                                {isUpcoming&&!isAchieved&&<span style={{color:WA,fontWeight:700}}> · Due soon</span>}
                                {isAchieved&&m.achieved_date&&<span style={{color:OK}}> · ✓ {new Date(m.achieved_date+"T12:00").toLocaleDateString("en-AU",{day:"numeric",month:"short"})}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ─── TRANSITION REPORTS ───────────────────────────────────────────────────────
function TransitionsTab() {
  const [reports,setReports]=useState([]);
  const [upcoming,setUpcoming]=useState([]);
  const [active,setActive]=useState(null);
  const [milestones,setMilestones]=useState([]);
  const [drafting,setDrafting]=useState(false);
  const [saving,setSaving]=useState(false);

  const load=useCallback(()=>{
    Promise.all([
      API("/api/childdev/transitions"),
      API("/api/childdev/transitions/upcoming/school-age"),
    ]).then(([tr,ur])=>{
      setReports(tr.reports||[]);
      setUpcoming(ur.upcoming||[]);
    });
  },[]);
  useEffect(()=>{load();},[load]);

  const loadReport=async(id)=>{
    const r=await API(`/api/childdev/transitions/${id}`);
    setActive(r.report);
    setMilestones(r.milestones||[]);
  };

  const createReport=async(childId)=>{
    const r=await API("/api/childdev/transitions",{method:"POST",body:{child_id:childId,prepared_by:"Educator"}});
    load();
    loadReport(r.id);
  };

  const autoDraft=async()=>{
    if(!active)return;
    setDrafting(true);
    const r=await API(`/api/childdev/transitions/${active.id}/auto-draft`,{method:"POST"});
    await loadReport(active.id);
    setDrafting(false);
    alert(`✓ Auto-drafted ${r.drafted_sections} sections from ${r.milestone_count} milestone records`);
  };

  const save=async()=>{
    if(!active)return;
    setSaving(true);
    await API(`/api/childdev/transitions/${active.id}`,{method:"PUT",body:active});
    setSaving(false);load();
  };

  const FIELDS=[
    ["communication","Communication & Language"],
    ["literacy","Literacy & Numeracy"],
    ["social_emotional","Social & Emotional Development"],
    ["physical_development","Physical Development"],
    ["independence","Independence & Self-Care"],
    ["interests","Interests & Passions"],
    ["learning_style","Learning Style"],
    ["strengths","Key Strengths"],
    ["areas_for_support","Areas for Support"],
    ["recommendations","Recommendations for School"],
    ["family_input","Family Input"],
    ["educator_notes","Educator Notes"],
  ];

  const STATUS_C={draft:WA,completed:OK,shared_family:"#7C3AED",shared_school:IN};

  return (
    <div style={{display:"flex",gap:20}}>
      {/* Left panel */}
      <div style={{width:300,flexShrink:0,display:"flex",flexDirection:"column",gap:12}}>
        {/* Upcoming school age */}
        {upcoming.length>0&&(
          <div style={{...card,border:"1px solid #C4B5FD"}}>
            <div style={{fontWeight:700,fontSize:13,color:P,marginBottom:10}}>🎓 Approaching School Age</div>
            {upcoming.map(c=>(
              <div key={c.id} style={{padding:"8px 0",borderBottom:"1px solid #F0EBF8"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:DARK}}>{c.first_name} {c.last_name}</div>
                    <div style={{fontSize:11,color:MU}}>{c.months_to_school}m until school · {c.room_name}</div>
                  </div>
                  {!c.has_report
                    ? <button onClick={()=>createReport(c.id)} style={{...bp,padding:"4px 10px",fontSize:11}}>Start</button>
                    : <span style={{fontSize:11,color:OK}}>✓ Report</span>
                  }
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reports list */}
        <div style={card}>
          <div style={{fontWeight:700,fontSize:13,color:DARK,marginBottom:10}}>All Reports ({reports.length})</div>
          {reports.length===0
            ? <div style={{color:MU,fontSize:12,textAlign:"center",padding:"16px 0"}}>No reports yet</div>
            : reports.map(r=>(
              <div key={r.id} onClick={()=>loadReport(r.id)}
                style={{padding:"8px 10px",borderRadius:8,cursor:"pointer",marginBottom:6,
                  background:active?.id===r.id?"#F3E8FF":"#F8F5FC",border:`1px solid ${active?.id===r.id?P+"60":"#EDE8F4"}`}}>
                <div style={{fontWeight:600,fontSize:13,color:DARK}}>{r.first_name} {r.last_name}</div>
                <div style={{fontSize:11,color:MU}}>
                  {r.target_school||"No school specified"} ·
                  <span style={{color:STATUS_C[r.status]||MU,fontWeight:700,marginLeft:4}}>{r.status}</span>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* Report editor */}
      {active&&(
        <div style={{flex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div>
              <div style={{fontWeight:700,fontSize:16,color:DARK}}>{active.first_name} {active.last_name} — Transition Report</div>
              <div style={{fontSize:12,color:MU}}>
                {active.target_school&&`${active.target_school} · `}
                {active.transition_date&&`Starting ${new Date(active.transition_date+"T12:00").toLocaleDateString("en-AU",{month:"long",year:"numeric"})}`}
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={autoDraft} disabled={drafting} style={{...bs,fontSize:12,padding:"7px 14px"}}>
                {drafting?"Drafting…":"✨ Auto-Draft from Data"}
              </button>
              <button onClick={save} disabled={saving} style={{...bp,fontSize:12}}>
                {saving?"Saving…":"Save Report"}
              </button>
            </div>
          </div>

          {/* School & date */}
          <div style={{...card,marginBottom:14}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              <div>
                <label style={lbl}>Target School</label>
                <input value={active.target_school||""} onChange={e=>setActive(p=>({...p,target_school:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={lbl}>Transition Date</label>
                <input type="date" value={active.transition_date||""} onChange={e=>setActive(p=>({...p,transition_date:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select value={active.status} onChange={e=>setActive(p=>({...p,status:e.target.value}))} style={inp}>
                  <option value="draft">Draft</option>
                  <option value="completed">Completed</option>
                  <option value="shared_family">Shared with family</option>
                  <option value="shared_school">Shared with school</option>
                </select>
              </div>
            </div>
          </div>

          {/* Report fields */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            {FIELDS.map(([k,l])=>(
              <div key={k} style={{...card}}>
                <label style={{...lbl,marginBottom:8}}>{l}</label>
                <textarea value={active[k]||""} onChange={e=>setActive(p=>({...p,[k]:e.target.value}))}
                  rows={4} style={{...inp,resize:"vertical",lineHeight:1.6}}
                  placeholder={`Notes on ${l.toLowerCase()}…`}/>
              </div>
            ))}
          </div>

          {/* Milestone summary */}
          {milestones.length>0&&(
            <div style={{...card,marginTop:14}}>
              <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:12}}>Achieved Milestones ({milestones.filter(m=>m.achieved).length})</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {milestones.filter(m=>m.achieved).map(m=>(
                  <span key={m.milestone_key} style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"#F0FDF4",color:OK,border:"1px solid #A5D6A7"}}>
                    ✓ {m.milestone_label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!active&&reports.length===0&&upcoming.length===0&&(
        <div style={{...card,flex:1,textAlign:"center",padding:"60px 20px",color:MU}}>
          <div style={{fontSize:40}}>🎓</div>
          <div style={{marginTop:12,fontWeight:600,color:DARK}}>No transition reports yet</div>
          <p style={{fontSize:13}}>Children approaching school age will appear in the left panel.</p>
        </div>
      )}
    </div>
  );
}
