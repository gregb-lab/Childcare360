/**
 * CommsModule.jsx — v2.14.0
 * Three tabs:
 *   💬 Messages     — two-way threaded parent messaging
 *   🏥 Health       — illness/injury events with parent notification
 *   💉 Immunisation — AU schedule compliance tracker per child
 */
import { useState, useEffect, useCallback, useRef } from "react";

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
const fmtDT = d => d ? new Date(d).toLocaleString("en-AU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : "—";
const fmtD  = d => d ? new Date(d+"T12:00").toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}) : "—";

const TABS=[{id:"messages",icon:"💬",label:"Messages"},{id:"health",icon:"🏥",label:"Health Events"},{id:"immunisation",icon:"💉",label:"Immunisation"}];

export default function CommsModule() {
  const [tab,setTab]=useState("messages");
  const [unread,setUnread]=useState(0);

  useEffect(()=>{
    API("/api/comms/threads").then(r=>setUnread(r.unread_total||0)).catch(()=>{});
  },[]);

  return (
    <div style={{padding:"24px 28px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
        <span style={{fontSize:28}}>💬</span>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>Communications & Health</h1>
          <p style={{margin:"3px 0 0",fontSize:13,color:MU}}>Parent messaging · Health events · Immunisation tracking</p>
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:24,borderBottom:"1px solid #EDE8F4",paddingBottom:12}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"8px 16px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,
              fontWeight:tab===t.id?700:500,background:tab===t.id?P:"transparent",
              color:tab===t.id?"#fff":MU,position:"relative"}}>
            {t.icon} {t.label}
            {t.id==="messages"&&unread>0&&(
              <span style={{marginLeft:6,background:DA,color:"#fff",borderRadius:20,
                padding:"1px 6px",fontSize:10,fontWeight:900}}>{unread}</span>
            )}
          </button>
        ))}
      </div>
      {tab==="messages"     && <MessagesTab onUnreadChange={setUnread}/>}
      {tab==="health"       && <HealthTab />}
      {tab==="immunisation" && <ImmunisationTab />}
    </div>
  );
}

// ─── MESSAGES TAB ─────────────────────────────────────────────────────────────
function MessagesTab({onUnreadChange}) {
  const [threads,setThreads]=useState([]);
  const [active,setActive]=useState(null);
  const [messages,setMessages]=useState([]);
  const [reply,setReply]=useState("");
  const [showNew,setShowNew]=useState(false);
  const [children,setChildren]=useState([]);
  const [newForm,setNewForm]=useState({child_id:"",subject:"",body:""});
  const bottomRef=useRef(null);

  const load=useCallback(()=>{
    Promise.all([
      API("/api/comms/threads"),
      API("/api/children/simple"),
    ]).then(([tr,cr])=>{
      setThreads(tr.threads||[]);
      onUnreadChange?.(tr.unread_total||0);
      setChildren(Array.isArray(cr)?cr:[]);
    });
  },[onUnreadChange]);

  useEffect(()=>{load();},[load]);

  const openThread=async(id)=>{
    const r=await API(`/api/comms/threads/${id}`.catch(e=>console.error('API error:',e)));
    setActive(r?.thread);
    setMessages(r?.messages||[]);
    load();
    setTimeout(()=>bottomRef.current?.scrollIntoView({behavior:"smooth"}),100);
  };

  const sendReply=async()=>{
    if(!reply.trim()||!active)return;
    await API(`/api/comms/threads/${active.id}/reply`,{method:"POST",body:{body:reply,sender_type:"admin",sender_name:"Centre"}}).catch(e=>console.error('API error:',e));
    setReply("");
    openThread(active.id);
  };

  const createThread=async()=>{
    if(!newForm.subject||!newForm.body)return;
    const r=await API("/api/comms/threads",{method:"POST",body:{...newForm,sender_name:"Centre"}}).catch(e=>console.error('API error:',e));
    setShowNew(false);setNewForm({child_id:"",subject:"",body:""});
    load();
    if(r?.id)openThread(r?.id);
  };

  return (
    <div style={{display:"flex",gap:0,height:"calc(100vh - 220px)",borderRadius:14,overflow:"hidden",border:"1px solid #EDE8F4"}}>
      {/* Thread list */}
      <div style={{width:300,flexShrink:0,borderRight:"1px solid #EDE8F4",overflowY:"auto",background:"#FDFBFF"}}>
        <div style={{padding:"12px 14px",borderBottom:"1px solid #EDE8F4",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontWeight:700,fontSize:13,color:DARK}}>Conversations</div>
          <button onClick={()=>setShowNew(v=>!v)} style={{...bp,padding:"5px 12px",fontSize:11}}>+ New</button>
        </div>

        {showNew&&(
          <div style={{padding:"12px 14px",borderBottom:"1px solid #EDE8F4",background:"#F8F5FC"}}>
            <div style={{marginBottom:8}}>
              <label style={lbl}>Child (optional)</label>
              <select value={newForm.child_id} onChange={e=>setNewForm(p=>({...p,child_id:e.target.value}))} style={inp}>
                <option value="">All families / General</option>
                {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
            <div style={{marginBottom:8}}>
              <label style={lbl}>Subject</label>
              <input value={newForm.subject} onChange={e=>setNewForm(p=>({...p,subject:e.target.value}))} style={inp}/>
            </div>
            <div style={{marginBottom:8}}>
              <label style={lbl}>Message</label>
              <textarea value={newForm.body} onChange={e=>setNewForm(p=>({...p,body:e.target.value}))} rows={3} style={{...inp,resize:"vertical"}}/>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={createThread} style={{...bp,fontSize:11,padding:"6px 12px"}}>Send</button>
              <button onClick={()=>setShowNew(false)} style={{...bs,fontSize:11,padding:"6px 12px"}}>Cancel</button>
            </div>
          </div>
        )}

        {threads.length===0
          ? <div style={{padding:"30px 14px",color:MU,fontSize:12,textAlign:"center"}}>No conversations yet</div>
          : threads.map(t=>(
            <div key={t.id} onClick={()=>openThread(t.id)}
              style={{padding:"12px 14px",borderBottom:"1px solid #F0EBF8",cursor:"pointer",
                background:active?.id===t.id?"#F3E8FF":t.unread_admin>0?"#FAFAFF":"#fff"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:3}}>
                <div style={{fontWeight:t.unread_admin>0?700:500,fontSize:13,color:DARK,
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>
                  {t.subject}
                </div>
                {t.unread_admin>0&&(
                  <span style={{background:P,color:"#fff",borderRadius:20,padding:"1px 6px",fontSize:10,fontWeight:900,flexShrink:0,marginLeft:6}}>{t.unread_admin}</span>
                )}
              </div>
              {(t.first_name||t.room_name)&&(
                <div style={{fontSize:11,color:MU}}>
                  {t.first_name?`${t.first_name} ${t.last_name} · `:""}
                  {t.room_name||""}
                </div>
              )}
              <div style={{fontSize:11,color:MU,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {t.last_message_preview}
              </div>
            </div>
          ))
        }
      </div>

      {/* Message view */}
      <div style={{flex:1,display:"flex",flexDirection:"column",background:"#fff"}}>
        {!active?(
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:MU}}>
            <div style={{textAlign:"center"}}><div style={{fontSize:40}}>💬</div><div style={{marginTop:8}}>Select a conversation</div></div>
          </div>
        ):(
          <>
            {/* Header */}
            <div style={{padding:"14px 18px",borderBottom:"1px solid #EDE8F4",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:DARK}}>{active.subject}</div>
                {active.first_name&&<div style={{fontSize:12,color:MU}}>{active.first_name} {active.last_name}</div>}
              </div>
              <button onClick={async()=>{await API(`/api/comms/threads/${active.id}/close`,{method:"PUT"});setActive(null);load();}} // error: caught by caller
                style={{...bs,fontSize:11,padding:"5px 12px",color:MU,borderColor:"#EDE8F4"}}>
                Close
              </button>
            </div>

            {/* Messages */}
            <div style={{flex:1,overflowY:"auto",padding:"16px 18px",display:"flex",flexDirection:"column",gap:12}}>
              {messages.map(m=>(
                <div key={m.id} style={{display:"flex",flexDirection:"column",
                  alignItems:m.sender_type==="admin"?"flex-end":"flex-start"}}>
                  <div style={{maxWidth:"70%",padding:"10px 14px",borderRadius:12,
                    background:m.sender_type==="admin"?P:"#F0EBF8",
                    color:m.sender_type==="admin"?"#fff":DARK}}>
                    <div style={{fontSize:13,lineHeight:1.5}}>{m.body}</div>
                  </div>
                  <div style={{fontSize:10,color:MU,marginTop:3,paddingLeft:4}}>
                    {m.sender_name||m.sender_type} · {fmtDT(m.created_at)}
                  </div>
                </div>
              ))}
              <div ref={bottomRef}/>
            </div>

            {/* Reply */}
            <div style={{padding:"12px 18px",borderTop:"1px solid #EDE8F4",display:"flex",gap:10}}>
              <textarea value={reply} onChange={e=>setReply(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&e.metaKey)sendReply();}}
                placeholder="Type a message… (Cmd+Enter to send)"
                rows={2} style={{...inp,resize:"none",flex:1}}/>
              <button onClick={sendReply} disabled={!reply.trim()} style={{...bp,alignSelf:"flex-end",padding:"10px 16px"}}>Send</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── HEALTH EVENTS TAB ────────────────────────────────────────────────────────
function HealthTab() {
  const [events,setEvents]=useState([]);
  const [todayCount,setTodayCount]=useState(0);
  const [showNew,setShowNew]=useState(false);
  const [children,setChildren]=useState([]);
  const [form,setForm]=useState({child_id:"",event_type:"illness",event_date:new Date().toISOString().split("T")[0],description:"",temperature:"",action_taken:"",parent_notified:false,follow_up_required:false});
  const SYMPTOMS=["Fever","Runny nose","Cough","Vomiting","Diarrhoea","Rash","Lethargy","Headache","Stomach ache"];
  const [selSymptoms,setSelSymptoms]=useState([]);

  const load=useCallback(()=>{
    Promise.all([
      API("/api/comms/health"),
      API("/api/children/simple"),
    ]).then(([h,c])=>{
      setEvents(h.events||[]);
      setTodayCount(h.today_count||0);
      setChildren(Array.isArray(c)?c:[]);
    });
  },[]);
  useEffect(()=>{load();},[load]);

  const save=async()=>{
    try {
    if(!form.child_id||!form.event_type)return;
    await API("/api/comms/health",{method:"POST",body:{...form,symptoms:selSymptoms,temperature:form.temperature?parseFloat(form.temperature):null}}).catch(e=>console.error('API error:',e));
    setShowNew(false);
    setForm({child_id:"",event_type:"illness",event_date:new Date().toISOString().split("T")[0],description:"",temperature:"",action_taken:"",parent_notified:false,follow_up_required:false});
    setSelSymptoms([]);load();
    } catch(e) { console.error('API error:', e); }
  };

  const TYPE_C={illness:WA,injury:DA,allergy:"#D946EF",medication:IN,other:MU};
  const TYPE_ICONS={illness:"🤒",injury:"🩹",allergy:"⚠️",medication:"💊",other:"📝"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:12}}>
          <div style={{...card,padding:"10px 16px",textAlign:"center",minWidth:80}}>
            <div style={{fontSize:20,fontWeight:900,color:WA}}>{todayCount}</div>
            <div style={{fontSize:11,color:MU}}>Today</div>
          </div>
        </div>
        <button style={bp} onClick={()=>setShowNew(v=>!v)}>{showNew?"Cancel":"+ Record Health Event"}</button>
      </div>

      {showNew&&(
        <div style={{...card,background:"#FFF7ED",border:"1px solid #FDE68A"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div>
              <label style={lbl}>Child *</label>
              <select value={form.child_id} onChange={e=>setForm(p=>({...p,child_id:e.target.value}))} style={inp}>
                <option value="">Select…</option>
                {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Event Type *</label>
              <select value={form.event_type} onChange={e=>setForm(p=>({...p,event_type:e.target.value}))} style={inp}>
                {["illness","injury","allergy","medication","other"].map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Date</label>
              <input type="date" value={form.event_date} onChange={e=>setForm(p=>({...p,event_date:e.target.value}))} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Temperature (°C)</label>
              <input type="number" value={form.temperature} onChange={e=>setForm(p=>({...p,temperature:e.target.value}))} style={inp} placeholder="e.g. 38.2" step="0.1"/>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label style={lbl}>Symptoms</label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
                {SYMPTOMS.map(s=>(
                  <label key={s} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:12,
                    padding:"4px 10px",borderRadius:20,border:`1px solid ${selSymptoms.includes(s)?WA+"80":"#DDD6EE"}`,
                    background:selSymptoms.includes(s)?"#FFFBEB":"transparent"}}>
                    <input type="checkbox" checked={selSymptoms.includes(s)}
                      onChange={e=>setSelSymptoms(p=>e.target.checked?[...p,s]:p.filter(x=>x!==s))}
                      style={{display:"none"}}/>
                    {s}
                  </label>
                ))}
              </div>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label style={lbl}>Description</label>
              <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2} style={{...inp,resize:"vertical"}}/>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label style={lbl}>Action Taken</label>
              <input value={form.action_taken} onChange={e=>setForm(p=>({...p,action_taken:e.target.value}))} style={inp} placeholder="e.g. Parent called, rest area provided"/>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
              <input type="checkbox" checked={form.parent_notified} onChange={e=>setForm(p=>({...p,parent_notified:e.target.checked}))}/>
              Notify parent (creates message thread)
            </label>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
              <input type="checkbox" checked={form.follow_up_required} onChange={e=>setForm(p=>({...p,follow_up_required:e.target.checked}))}/>
              Follow-up required
            </label>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button style={bp} onClick={save}>Save Event</button>
            <button style={bs} onClick={()=>setShowNew(false)}>Cancel</button>
          </div>
        </div>
      )}

      {events.length===0
        ? <div style={{...card,textAlign:"center",padding:"40px 20px",color:MU}}><div style={{fontSize:36}}>🏥</div><div style={{marginTop:8}}>No health events recorded</div></div>
        : events.map(e=>(
          <div key={e.id} style={{...card,borderLeft:`4px solid ${TYPE_C[e.event_type]||MU}`,padding:"14px 18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <span style={{fontSize:22}}>{TYPE_ICONS[e.event_type]||"📝"}</span>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:DARK}}>{e.first_name} {e.last_name}</div>
                  <div style={{fontSize:12,color:MU}}>{e.room_name} · {fmtD(e.event_date)}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {e.temperature&&<span style={{fontSize:12,fontWeight:700,color:e.temperature>=38?DA:WA}}>🌡️ {e.temperature}°C</span>}
                {e.parent_notified&&<span style={{fontSize:11,color:OK,fontWeight:700}}>✓ Parent notified</span>}
                {e.follow_up_required&&!e.follow_up_notes&&<span style={{fontSize:11,color:DA,fontWeight:700}}>⚡ Follow-up needed</span>}
              </div>
            </div>
            {e.symptoms?.length>0&&<div style={{display:"flex",gap:4,marginBottom:6,flexWrap:"wrap"}}>
              {e.symptoms.map(s=><span key={s} style={{fontSize:10,background:`${WA}20`,color:WA,padding:"2px 8px",borderRadius:20}}>{s}</span>)}
            </div>}
            {e.description&&<div style={{fontSize:13,color:DARK,marginBottom:4}}>{e.description}</div>}
            {e.action_taken&&<div style={{fontSize:12,color:MU}}>Action: {e.action_taken}</div>}
          </div>
        ))
      }
    </div>
  );
}

// ─── IMMUNISATION TAB ─────────────────────────────────────────────────────────
function ImmunisationTab() {
  const [children,setChildren]=useState([]);
  const [selChild,setSelChild]=useState(null);
  const [data,setData]=useState(null);
  const [compliance,setCompliance]=useState(null);
  const [showRecord,setShowRecord]=useState(null);
  const [recForm,setRecForm]=useState({vaccine_name:"",date_given:"",provider:"",batch_number:""});

  useEffect(()=>{
    Promise.all([
      API("/api/children/simple"),
      API("/api/comms/immunisation-compliance"),
    ]).then(([c,comp])=>{
      setChildren(Array.isArray(c)?c:[]);
      setCompliance(comp);
    });
  },[]);

  const loadChild=async(id)=>{
    setSelChild(id);
    const r=await API(`/api/comms/immunisation/${id}`.catch(e=>console.error('API error:',e)));
    setData(r);
  };

  const saveRecord=async()=>{
    if(!recForm.vaccine_name||!selChild)return;
    await API(`/api/comms/immunisation/${selChild}`,{method:"POST",body:recForm}).catch(e=>console.error('API error:',e));
    setShowRecord(null);setRecForm({vaccine_name:"",date_given:"",provider:"",batch_number:""});
    loadChild(selChild);
  };

  return (
    <div style={{display:"flex",gap:20}}>
      {/* Left: compliance summary + child list */}
      <div style={{width:260,flexShrink:0}}>
        {compliance&&(
          <div style={{...card,marginBottom:14,padding:"14px"}}>
            <div style={{fontWeight:700,fontSize:13,color:DARK,marginBottom:10}}>Centre Compliance</div>
            {[
              ["Fully up to date",compliance.summary?.compliant,OK],
              ["Has overdue vaccines",compliance.summary?.with_overdue,DA],
              ["Total enrolled",compliance.summary?.total,P],
            ].map(([l,v,c])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:12}}>
                <span style={{color:MU}}>{l}</span>
                <span style={{fontWeight:700,color:c}}>{v||0}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{fontWeight:700,fontSize:11,color:MU,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.05em"}}>Children</div>
        {(compliance?.compliance||[]).map(c=>(
          <button key={c.id} onClick={()=>loadChild(c.id)}
            style={{width:"100%",padding:"8px 12px",borderRadius:10,border:`1px solid ${selChild===c.id?P:"#EDE8F4"}`,
              background:selChild===c.id?PL:"#fff",textAlign:"left",cursor:"pointer",marginBottom:5}}>
            <div style={{fontWeight:600,fontSize:13,color:DARK}}>{c.first_name} {c.last_name}</div>
            <div style={{fontSize:11,marginTop:2,color:c.overdue>0?DA:OK,fontWeight:600}}>
              {c.overdue>0?`${c.overdue} overdue`:`✓ Up to date`} · {c.vaccines_done}/{c.vaccines_due} done
            </div>
          </button>
        ))}
      </div>

      {/* Right: child detail */}
      <div style={{flex:1}}>
        {!selChild&&(
          <div style={{...card,textAlign:"center",padding:"60px 20px",color:MU}}>
            <div style={{fontSize:40}}>💉</div>
            <div style={{marginTop:12,fontWeight:600,color:DARK}}>Select a child to view immunisation status</div>
          </div>
        )}
        {selChild&&data&&(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div>
                <div style={{fontWeight:700,fontSize:16,color:DARK}}>{data.child?.first_name} {data.child?.last_name}</div>
                <div style={{fontSize:12,color:MU}}>{data.stats?.age_months}m old · {data.stats?.completed}/{data.stats?.total_due} vaccines done</div>
              </div>
              <div style={{display:"flex",gap:10}}>
                {[["Overdue",data.stats?.overdue,DA],["Upcoming",data.stats?.upcoming,WA],["Done",data.stats?.completed,OK]].map(([l,v,c])=>(
                  <div key={l} style={{...card,padding:"8px 14px",textAlign:"center",minWidth:70}}>
                    <div style={{fontSize:18,fontWeight:900,color:c}}>{v||0}</div>
                    <div style={{fontSize:10,color:MU}}>{l}</div>
                  </div>
                ))}
                <button onClick={()=>setShowRecord(true)} style={bp}>+ Record Vaccine</button>
              </div>
            </div>

            {showRecord&&(
              <div style={{...card,background:"#F0FDF4",border:"1px solid #A5D6A7",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div style={{gridColumn:"span 2"}}>
                    <label style={lbl}>Vaccine *</label>
                    <input value={recForm.vaccine_name} onChange={e=>setRecForm(p=>({...p,vaccine_name:e.target.value}))} style={inp} list="vaccines-list"/>
                    <datalist id="vaccines-list">
                      {data.schedule?.map(s=><option key={s.id} value={s.vaccine}/>)}
                    </datalist>
                  </div>
                  <div>
                    <label style={lbl}>Date Given</label>
                    <input type="date" value={recForm.date_given} onChange={e=>setRecForm(p=>({...p,date_given:e.target.value}))} style={inp}/>
                  </div>
                  <div>
                    <label style={lbl}>Provider</label>
                    <input value={recForm.provider} onChange={e=>setRecForm(p=>({...p,provider:e.target.value}))} style={inp} placeholder="e.g. GP, Council immunisation"/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <button style={bp} onClick={saveRecord}>Save</button>
                  <button style={bs} onClick={()=>setShowRecord(false)}>Cancel</button>
                </div>
              </div>
            )}

            {/* Schedule table */}
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:"#F8F5FC"}}>
                {["Vaccine","Due At","Status","Date Given","Provider"].map(h=>(
                  <th key={h} style={{padding:"8px 10px",textAlign:"left",color:MU,fontWeight:700,fontSize:11}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.schedule?.map((s,i)=>(
                  <tr key={i} style={{borderBottom:"1px solid #F0EBF8",
                    background:s.overdue?"#FEF2F2":s.upcoming?"#FFFBEB":s.completed?"#F0FDF4":"#fff"}}>
                    <td style={{padding:"8px 10px",fontWeight:600,color:DARK}}>{s.vaccine}</td>
                    <td style={{padding:"8px 10px",color:MU}}>{s.age_label}</td>
                    <td style={{padding:"8px 10px"}}>
                      <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,
                        background:s.completed?"#F0FDF4":s.overdue?"#FEF2F2":s.upcoming?"#FFFBEB":"transparent",
                        color:s.completed?OK:s.overdue?DA:s.upcoming?WA:MU}}>
                        {s.completed?"✓ Done":s.overdue?"⚠️ Overdue":s.upcoming?"Due soon":"Not yet due"}
                      </span>
                    </td>
                    <td style={{padding:"8px 10px",color:MU}}>{s.record?.date_given?fmtD(s.record.date_given):"—"}</td>
                    <td style={{padding:"8px 10px",color:MU}}>{s.record?.provider||"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
