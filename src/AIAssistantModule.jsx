/**
 * AIAssistantModule.jsx — v2.19.0
 *   ✨ AI Writer     — Claude-powered observation/story/update generator
 *   💰 Fee Overrides — Per-child fee adjustments and discounts
 *   ✅ Compliance Tasks — NQF compliance task nagger with auto-generation
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
const fmtD=d=>d?new Date(d.length===10?d+"T12:00":d).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):"—";

const TABS=[
  {id:"ai",      icon:"✨", label:"AI Writing Assistant"},
  {id:"fees",    icon:"💰", label:"Fee Overrides"},
  {id:"tasks",   icon:"✅", label:"Compliance Tasks"},
];

export default function AIAssistantModule() {
  const [tab,setTab]=useState("ai");
  const [taskCount,setTaskCount]=useState(0);

  useEffect(()=>{
    API("/api/compliance-tasks").then(r=>setTaskCount(r.summary?.overdue||0)).catch(()=>{});
  },[]);

  return (
    <div style={{padding:"24px 28px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
        <span style={{fontSize:28}}>✨</span>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>AI Assistant & Compliance</h1>
          <p style={{margin:"3px 0 0",fontSize:13,color:MU}}>AI writing · Per-child fees · Compliance task management</p>
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:24,borderBottom:"1px solid #EDE8F4",paddingBottom:12}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"8px 16px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,
              fontWeight:tab===t.id?700:500,background:tab===t.id?P:"transparent",
              color:tab===t.id?"#fff":MU,position:"relative"}}>
            {t.icon} {t.label}
            {t.id==="tasks"&&taskCount>0&&(
              <span style={{marginLeft:6,background:DA,color:"#fff",borderRadius:20,
                padding:"1px 6px",fontSize:10,fontWeight:900}}>{taskCount}</span>
            )}
          </button>
        ))}
      </div>
      {tab==="ai"    && <AIWriterTab />}
      {tab==="fees"  && <FeeOverridesTab />}
      {tab==="tasks" && <ComplianceTasksTab onCountChange={setTaskCount}/>}
    </div>
  );
}

// ─── AI WRITER TAB ────────────────────────────────────────────────────────────
function AIWriterTab() {
  const [children,setChildren]=useState([]);
  const [form,setForm]=useState({
    session_type:"observation", child_id:"",
    observation_notes:"", activity:"", eylf_focus:""
  });
  const [result,setResult]=useState(null);
  const [finalText,setFinalText]=useState("");
  const [generating,setGenerating]=useState(false);
  const [saving,setSaving]=useState(false);
  const [history,setHistory]=useState([]);
  const [hasApiKey,setHasApiKey]=useState(null);

  useEffect(()=>{
    Promise.all([
      API("/api/children/simple"),
      API("/api/ai-assistant/history"),
    ]).then(([c,h])=>{
      setChildren(Array.isArray(c)?c:[]);
      setHistory(h.sessions||[]);
    });
    // Check if API key configured
    const storedKey = localStorage.getItem("c360_anthropic_key");
    setHasApiKey(!!storedKey);
  },[]);

  const generate=async()=>{
    setGenerating(true);
    const child=children.find(c=>c.id===form.child_id);
    const anthropicKey = localStorage.getItem("c360_anthropic_key") || "";
    const r=await API("/api/ai-assistant/generate",{method:"POST",body:{
      ...form,
      child_name:child?`${child.first_name} ${child.last_name}`:null,
      age_months:child?.dob?Math.floor((Date.now()-new Date(child.dob))/(1000*60*60*24*30.44)):null,
      room_name:child?.room_name||null,
      anthropic_key: anthropicKey||undefined,
    }});
    setGenerating(false);
    if(r.ok){
      setResult(r);
      setFinalText(r.generated_text);
      API("/api/ai-assistant/history").then(h=>setHistory(h.sessions||[]));
    } else {
      alert(r.error||"Generation failed");
    }
  };

  const save=async()=>{
    setSaving(true);
    await API("/api/ai-assistant/save",{method:"POST",body:{ // catch: .catch(e=>console.error('API error:',e))
      session_id:result?.session_id,
      final_text:finalText,
      child_id:form.child_id||null,
      session_type:form.session_type,
      eylf_links:result?.eylf_suggested||[],
    }});
    setSaving(false);
    alert("✓ Saved"+(form.session_type==="observation"?" as observation":""));
  };

  const SESSION_TYPES=[
    {id:"observation",label:"📝 Observation",desc:"Formal learning observation"},
    {id:"learning_story",label:"✨ Learning Story",desc:"Narrative story for portfolio"},
    {id:"daily_update",label:"💬 Daily Update",desc:"Quick parent communication"},
    {id:"group_story",label:"👥 Group Story",desc:"Room/project documentation"},
    {id:"eylf_link",label:"🔗 EYLF Links",desc:"Link observations to outcomes"},
  ];

  const EYLF_OUTCOMES=["1.1","1.2","1.3","1.4","2.1","2.2","2.3","3.1","3.2","4.1","4.2","5.1","5.2","5.3"];

  return (
    <div style={{display:"flex",gap:20}}>
      {/* Left: input */}
      <div style={{flex:1}}>
        {hasApiKey===false&&(
          <div style={{...card,background:"#F3E8FF",border:"1px solid #C4B5FD",marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:13,color:P,marginBottom:4}}>🔑 Add Anthropic API Key for AI Generation</div>
            <p style={{fontSize:12,color:MU,margin:"0 0 8px"}}>
              Go to <strong>Settings → Integrations → Anthropic API Key</strong> to enable Claude AI writing.
              Without a key, template-based suggestions are provided instead.
            </p>
          </div>
        )}

        <div style={card}>
          <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:16}}>What would you like to write?</div>

          {/* Session type */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
            {SESSION_TYPES.map(t=>(
              <button key={t.id} onClick={()=>setForm(p=>({...p,session_type:t.id}))}
                style={{padding:"10px 14px",borderRadius:10,border:`1px solid ${form.session_type===t.id?P:"#EDE8F4"}`,
                  background:form.session_type===t.id?PL:"#fff",textAlign:"left",cursor:"pointer"}}>
                <div style={{fontWeight:700,fontSize:12,color:DARK}}>{t.label}</div>
                <div style={{fontSize:10,color:MU,marginTop:2}}>{t.desc}</div>
              </button>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div>
              <label style={lbl}>Child (optional)</label>
              <select value={form.child_id} onChange={e=>setForm(p=>({...p,child_id:e.target.value}))} style={inp}>
                <option value="">No specific child</option>
                {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Activity / Context</label>
              <input value={form.activity} onChange={e=>setForm(p=>({...p,activity:e.target.value}))}
                style={inp} placeholder="e.g. Block building in construction area"/>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label style={lbl}>Your Observation Notes</label>
              <textarea value={form.observation_notes} onChange={e=>setForm(p=>({...p,observation_notes:e.target.value}))}
                rows={4} style={{...inp,resize:"vertical"}}
                placeholder="What did you see? What did the child say or do? Bullet points are fine — Claude will turn these into professional text…"/>
            </div>
            <div>
              <label style={lbl}>EYLF Focus (optional)</label>
              <select value={form.eylf_focus} onChange={e=>setForm(p=>({...p,eylf_focus:e.target.value}))} style={inp}>
                <option value="">Auto-detect</option>
                {EYLF_OUTCOMES.map(o=><option key={o} value={o}>Outcome {o}</option>)}
              </select>
            </div>
          </div>

          <button onClick={generate} disabled={generating||!form.observation_notes}
            style={{...bp,width:"100%",background:generating?"#9CA3AF":P,fontSize:14,padding:"12px"}}>
            {generating?"✨ Generating…":"✨ Generate with AI"}
          </button>
        </div>

        {/* Result */}
        {result&&(
          <div style={{...card,marginTop:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:14,color:DARK}}>Generated Text</div>
              <div style={{display:"flex",gap:8}}>
                <span style={{fontSize:11,color:result.source==="claude"?P:MU,fontWeight:600}}>
                  {result.source==="claude"?"✨ Claude AI":"📋 Template"}
                </span>
                <button onClick={save} disabled={saving}
                  style={{...bp,fontSize:12,padding:"5px 14px",background:OK}}>
                  {saving?"Saving…":"💾 Save"}
                </button>
              </div>
            </div>

            <textarea value={finalText} onChange={e=>setFinalText(e.target.value)}
              rows={10} style={{...inp,resize:"vertical",lineHeight:1.7,fontSize:13}}/>

            {result.eylf_suggested?.length>0&&(
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
                <span style={{fontSize:11,color:MU,marginRight:4}}>EYLF links:</span>
                {result.eylf_suggested.map(o=>(
                  <span key={o} style={{fontSize:11,background:PL,color:P,padding:"2px 8px",borderRadius:20,fontWeight:700}}>
                    {o}
                  </span>
                ))}
              </div>
            )}

            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button onClick={generate} disabled={generating}
                style={{...bs,fontSize:12,padding:"5px 14px"}}>
                🔄 Regenerate
              </button>
              <button onClick={()=>navigator.clipboard?.writeText(finalText)}
                style={{...bs,fontSize:12,padding:"5px 14px",color:MU,borderColor:"#DDD"}}>
                📋 Copy
              </button>
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <div style={{width:280,flexShrink:0}}>
        <div style={{fontWeight:700,fontSize:11,color:MU,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>
          Recent Sessions
        </div>
        {history.slice(0,15).map(s=>(
          <div key={s.id} onClick={()=>{setFinalText(s.final_text||s.generated_text);setResult({session_id:s.id,eylf_suggested:s.eylf_suggested,source:"history"});}}
            style={{...card,marginBottom:8,padding:"10px 14px",cursor:"pointer"}}>
            <div style={{fontWeight:600,fontSize:12,color:DARK,marginBottom:2}}>
              {s.first_name?`${s.first_name} ${s.last_name}`:"General"} · {s.session_type?.replace("_"," ")}
            </div>
            <div style={{fontSize:11,color:MU,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {(s.final_text||s.generated_text)?.slice(0,60)}…
            </div>
            <div style={{fontSize:10,color:MU,marginTop:4}}>
              {new Date(s.created_at).toLocaleDateString("en-AU",{day:"numeric",month:"short"})}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── FEE OVERRIDES TAB ────────────────────────────────────────────────────────
function FeeOverridesTab() {
  const [data,setData]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [form,setForm]=useState({child_id:"",override_type:"fixed",daily_rate_cents:"",discount_pct:"",discount_reason:"",effective_from:new Date().toISOString().split("T")[0],effective_to:"",notes:""});

  const load=useCallback(()=>{
    API("/api/fee-overrides").then(setData);
  },[]);
  useEffect(()=>{load();},[load]);

  const save=async()=>{
    if(!form.child_id)return;
    const body={...form,
      daily_rate_cents:form.daily_rate_cents?Math.round(parseFloat(form.daily_rate_cents)*100):null,
      discount_pct:form.discount_pct?parseFloat(form.discount_pct):0,
    };
    await API("/api/fee-overrides",{method:"POST",body}).catch(e=>console.error('API error:',e));
    setShowNew(false);load();
  };

  const remove=async(id)=>{
    await API(`/api/fee-overrides/${id}`,{method:"DELETE"}).catch(e=>console.error('API error:',e));
    load();
  };

  if(!data)return <div style={{padding:40,textAlign:"center",color:MU}}>Loading…</div>;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <p style={{fontSize:13,color:MU,margin:0}}>
          Override the standard room rate for individual children — discounts, hardship rates, sibling discounts.
        </p>
        <button style={bp} onClick={()=>setShowNew(v=>!v)}>{showNew?"Cancel":"+ Add Override"}</button>
      </div>

      {showNew&&(
        <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{gridColumn:"span 2"}}>
              <label style={lbl}>Child *</label>
              <select value={form.child_id} onChange={e=>setForm(p=>({...p,child_id:e.target.value}))} style={inp}>
                <option value="">Select child…</option>
                {data.children?.map(c=><option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name} (Standard: {c.room_rate_cents?fmt$(c.room_rate_cents/100)+"/day":"no rate set"})
                </option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Override Type</label>
              <select value={form.override_type} onChange={e=>setForm(p=>({...p,override_type:e.target.value}))} style={inp}>
                <option value="fixed">Fixed Daily Rate</option>
                <option value="discount">Percentage Discount</option>
              </select>
            </div>
            {form.override_type==="fixed"?(
              <div>
                <label style={lbl}>Daily Rate ($)</label>
                <input type="number" value={form.daily_rate_cents} onChange={e=>setForm(p=>({...p,daily_rate_cents:e.target.value}))} style={inp} placeholder="e.g. 120.00" step="0.01"/>
              </div>
            ):(
              <div>
                <label style={lbl}>Discount (%)</label>
                <input type="number" value={form.discount_pct} onChange={e=>setForm(p=>({...p,discount_pct:e.target.value}))} style={inp} placeholder="e.g. 10" min="0" max="100"/>
              </div>
            )}
            <div>
              <label style={lbl}>Reason</label>
              <input value={form.discount_reason} onChange={e=>setForm(p=>({...p,discount_reason:e.target.value}))} style={inp} placeholder="e.g. Sibling discount, Hardship rate"/>
            </div>
            <div>
              <label style={lbl}>Effective From</label>
              <input type="date" value={form.effective_from} onChange={e=>setForm(p=>({...p,effective_from:e.target.value}))} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Effective To (blank = ongoing)</label>
              <input type="date" value={form.effective_to} onChange={e=>setForm(p=>({...p,effective_to:e.target.value}))} style={inp}/>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button style={bp} onClick={save}>Save Override</button>
            <button style={bs} onClick={()=>setShowNew(false)}>Cancel</button>
          </div>
        </div>
      )}

      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr style={{background:"#F8F5FC"}}>
          {["Child","Room","Standard Rate","Override","Reason","From","To",""].map(h=>(
            <th key={h} style={{padding:"8px 10px",textAlign:"left",color:MU,fontWeight:700,fontSize:11}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {data.children?.filter(c=>c.override_id).length===0
            ? <tr><td colSpan={8} style={{padding:"30px 10px",textAlign:"center",color:MU}}>No fee overrides set</td></tr>
            : data.overrides?.map(o=>(
              <tr key={o.id} style={{borderBottom:"1px solid #F0EBF8"}}>
                <td style={{padding:"8px 10px",fontWeight:600,color:DARK}}>{o.first_name} {o.last_name}</td>
                <td style={{padding:"8px 10px",color:MU}}>{o.room_name}</td>
                <td style={{padding:"8px 10px",color:MU}}>{o.standard_rate_cents?fmt$(o.standard_rate_cents/100)+"/day":"—"}</td>
                <td style={{padding:"8px 10px",fontWeight:700,color:P}}>
                  {o.override_type==="fixed"?fmt$(o.daily_rate_cents/100)+"/day":`${o.discount_pct}% off`}
                </td>
                <td style={{padding:"8px 10px",color:MU}}>{o.discount_reason||"—"}</td>
                <td style={{padding:"8px 10px",color:MU,fontSize:12}}>{fmtD(o.effective_from)}</td>
                <td style={{padding:"8px 10px",color:MU,fontSize:12}}>{o.effective_to?fmtD(o.effective_to):"Ongoing"}</td>
                <td style={{padding:"8px 10px"}}>
                  <button onClick={()=>remove(o.id)} style={{background:"none",border:"none",cursor:"pointer",color:DA,fontSize:12,fontWeight:600}}>Remove</button>
                </td>
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  );
}

// ─── COMPLIANCE TASKS TAB ─────────────────────────────────────────────────────
function ComplianceTasksTab({onCountChange}) {
  const [tasks,setTasks]=useState([]);
  const [summary,setSummary]=useState(null);
  const [generating,setGenerating]=useState(false);
  const [showNew,setShowNew]=useState(false);
  const [educators,setEducators]=useState([]);
  const [form,setForm]=useState({task_type:"general",title:"",description:"",due_date:"",assigned_to:"",priority:"normal"});

  const load=useCallback(()=>{
    Promise.all([
      API("/api/compliance-tasks"),
      API("/api/educators/simple"),
    ]).then(([t,e])=>{
      setTasks(t.tasks||[]);
      setSummary(t.summary);
      onCountChange?.(t.summary?.overdue||0);
      setEducators(Array.isArray(e)?e:[]);
    });
  },[onCountChange]);
  useEffect(()=>{load();},[load]);

  const autoGenerate=async()=>{
    setGenerating(true);
    const r=await API("/api/compliance-tasks/auto-generate",{method:"POST"}).catch(e=>console.error('API error:',e));
    load();setGenerating(false);
    if(r.generated>0)window.showToast?.(`Generated ${r.generated} compliance task${r.generated>1?"s":""}`, "success");
    else window.showToast?.("No new tasks to generate", "info");
  };

  const complete=async(id)=>{
    await API(`/api/compliance-tasks/${id}`,{method:"PUT",body:{status:"completed",completed_by:"Director"}}).catch(e=>console.error('API error:',e));
    load();
  };

  const createTask=async()=>{
    if(!form.title)return;
    await API("/api/compliance-tasks",{method:"POST",body:form}).catch(e=>console.error('API error:',e));
    setShowNew(false);setForm({task_type:"general",title:"",description:"",due_date:"",assigned_to:"",priority:"normal"});
    load();
  };

  const today=new Date().toISOString().split("T")[0];
  const PRIO_C={high:DA,normal:IN,low:MU};
  const TYPE_ICONS={cert_renewal:"🪪",appraisal:"⭐",immunisation:"💉",general:"📋",policy:"📄",training:"🎓"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Summary */}
      {summary&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {[
            ["Total Open",summary.total_open,MU],
            ["Overdue",summary.overdue,DA],
            ["Due Today",summary.due_today,WA],
            ["Due This Week",summary.due_this_week,IN],
          ].map(([l,v,c])=>(
            <div key={l} style={{...card,textAlign:"center",borderTop:`3px solid ${c}`,padding:"12px"}}>
              <div style={{fontSize:22,fontWeight:900,color:c}}>{v||0}</div>
              <div style={{fontSize:11,color:MU,marginTop:3}}>{l}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex",gap:8}}>
        <button onClick={autoGenerate} disabled={generating} style={bp}>
          {generating?"Scanning…":"🔍 Auto-Generate from Scan"}
        </button>
        <button onClick={()=>setShowNew(v=>!v)} style={bs}>{showNew?"Cancel":"+ Add Task"}</button>
      </div>

      {showNew&&(
        <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{gridColumn:"span 2"}}>
              <label style={lbl}>Title *</label>
              <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Type</label>
              <select value={form.task_type} onChange={e=>setForm(p=>({...p,task_type:e.target.value}))} style={inp}>
                {["general","cert_renewal","appraisal","immunisation","policy","training"].map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Priority</label>
              <select value={form.priority} onChange={e=>setForm(p=>({...p,priority:e.target.value}))} style={inp}>
                {["high","normal","low"].map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Due Date</label>
              <input type="date" value={form.due_date} onChange={e=>setForm(p=>({...p,due_date:e.target.value}))} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Assign To</label>
              <select value={form.assigned_to} onChange={e=>setForm(p=>({...p,assigned_to:e.target.value}))} style={inp}>
                <option value="">Unassigned</option>
                {educators.map(e=><option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label style={lbl}>Description</label>
              <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2} style={{...inp,resize:"vertical"}}/>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button style={bp} onClick={createTask}>Add Task</button>
            <button style={bs} onClick={()=>setShowNew(false)}>Cancel</button>
          </div>
        </div>
      )}

      {tasks.length===0
        ? <div style={{...card,textAlign:"center",padding:"40px 20px",color:MU}}>
            <div style={{fontSize:36}}>✅</div>
            <div style={{marginTop:8,fontWeight:600,color:DARK}}>No open compliance tasks</div>
            <p style={{fontSize:13}}>Click "Auto-Generate from Scan" to check for new tasks.</p>
          </div>
        : tasks.map(t=>{
          const isOverdue=t.due_date&&t.due_date<today;
          return (
            <div key={t.id} style={{...card,padding:"14px 18px",
              borderLeft:`4px solid ${isOverdue?DA:PRIO_C[t.priority]||IN}`,
              background:isOverdue?"#FEFAFA":"#fff"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:18}}>{TYPE_ICONS[t.task_type]||"📋"}</span>
                    <span style={{fontWeight:700,fontSize:14,color:isOverdue?DA:DARK}}>{t.title}</span>
                    <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,
                      background:(PRIO_C[t.priority]||IN)+"20",color:PRIO_C[t.priority]||IN}}>
                      {t.priority}
                    </span>
                    {t.auto_generated===1&&<span style={{fontSize:10,color:MU,fontWeight:600}}>auto</span>}
                  </div>
                  {t.description&&<div style={{fontSize:12,color:MU,paddingLeft:26}}>{t.description}</div>}
                  <div style={{fontSize:11,color:MU,marginTop:4,paddingLeft:26}}>
                    {t.due_date&&<span style={{color:isOverdue?DA:MU,fontWeight:isOverdue?700:400}}>
                      {isOverdue?`⚠️ Overdue ${Math.abs(t.days_overdue)} days`:`Due ${fmtD(t.due_date)}`}
                    </span>}
                    {t.assigned_to_name&&<span style={{marginLeft:12}}>👤 {t.assigned_to_name}</span>}
                  </div>
                </div>
                <button onClick={()=>complete(t.id)}
                  style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${OK}`,
                    background:"#F0FDF4",color:OK,cursor:"pointer",fontSize:12,fontWeight:700,flexShrink:0,marginLeft:12}}>
                  ✓ Complete
                </button>
              </div>
            </div>
          );
        })
      }
    </div>
  );
}
