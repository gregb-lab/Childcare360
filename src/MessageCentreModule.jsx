/**
 * MessageCentreModule.jsx — v2.22.0
 * Unified Message Centre combining:
 *   💬 Inbox        — Two-way parent message threads
 *   📣 Broadcast    — Bulk messages to rooms/all families
 *   🏥 Health Log   — Health events + parent notification
 *   💉 Immunisation — Child immunisation status vs AU schedule
 *   👶 Timeline     — Full child history timeline
 *   📊 Activity     — Centre activity audit log
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
const fmtDT=d=>d?new Date(d).toLocaleString("en-AU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"—";
const fmtD=d=>d?new Date(d.length===10?d+"T12:00":d).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):"—";

const TABS=[
  {id:"inbox",       icon:"💬", label:"Inbox"},
  {id:"broadcast",   icon:"📣", label:"Broadcast"},
  {id:"health",      icon:"🏥", label:"Health Log"},
  {id:"immunisation",icon:"💉", label:"Immunisation"},
  {id:"timeline",    icon:"👶", label:"Child Timeline"},
  {id:"activity",    icon:"📊", label:"Activity Log"},
];

export default function MessageCentreModule() {
  const [tab,setTab]=useState("inbox");
  const [unread,setUnread]=useState(0);

  const refreshUnread=useCallback(()=>{
    API("/api/comms/threads").then(r=>setUnread(r.unread_total||0)).catch(()=>{});
  },[]);
  useEffect(()=>{ refreshUnread(); },[refreshUnread]);

  return (
    <div style={{padding:"24px 28px",maxWidth:1300,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
        <span style={{fontSize:28}}>💬</span>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>Message Centre</h1>
          <p style={{margin:"3px 0 0",fontSize:13,color:MU}}>Parent messaging · Broadcast · Health · Immunisation · Timelines</p>
        </div>
      </div>
      <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"1px solid #EDE8F4",paddingBottom:10,flexWrap:"wrap"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"8px 14px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,
              fontWeight:tab===t.id?700:500,background:tab===t.id?P:"transparent",
              color:tab===t.id?"#fff":MU,position:"relative",whiteSpace:"nowrap"}}>
            {t.icon} {t.label}
            {t.id==="inbox"&&unread>0&&(
              <span style={{marginLeft:5,background:DA,color:"#fff",borderRadius:20,
                padding:"1px 5px",fontSize:9,fontWeight:900}}>{unread}</span>
            )}
          </button>
        ))}
      </div>
      {tab==="inbox"        && <InboxTab onUnreadChange={setUnread}/>}
      {tab==="broadcast"    && <BroadcastTab />}
      {tab==="health"       && <HealthTab />}
      {tab==="immunisation" && <ImmunisationTab />}
      {tab==="timeline"     && <TimelineTab />}
      {tab==="activity"     && <ActivityTab />}
    </div>
  );
}

// ─── INBOX TAB ────────────────────────────────────────────────────────────────
function InboxTab({onUnreadChange}) {
  const [threads,setThreads]=useState([]);
  const [active,setActive]=useState(null);
  const [messages,setMessages]=useState([]);
  const [reply,setReply]=useState("");
  const [showNew,setShowNew]=useState(false);
  const [children,setChildren]=useState([]);
  const [newForm,setNewForm]=useState({child_id:"",subject:"",body:""});
  const bottomRef=useRef(null);

  const load=useCallback(()=>{
    Promise.all([API("/api/comms/threads"),API("/api/children/simple")])
      .then(([tr,cr])=>{
        setThreads(tr.threads||[]);
        onUnreadChange?.(tr.unread_total||0);
        setChildren(Array.isArray(cr)?cr:[]);
      });
  },[onUnreadChange]);

  useEffect(()=>{load();},[load]);

  const openThread=async(id)=>{
    const r=await API(`/api/comms/threads/${id}`.catch(e=>console.error('API error:',e)));
    setActive(r?.thread);setMessages(r?.messages||[]);
    load();
    setTimeout(()=>bottomRef.current?.scrollIntoView({behavior:"smooth"}),100);
  };

  const sendReply=async()=>{
    if(!reply.trim()||!active)return;
    await API(`/api/comms/threads/${active.id}/reply`,{method:"POST",body:{body:reply,sender_type:"admin",sender_name:"Centre"}}).catch(e=>console.error('API error:',e));
    setReply("");openThread(active.id);
  };

  const createThread=async()=>{
    if(!newForm.subject||!newForm.body)return;
    const r=await API("/api/comms/threads",{method:"POST",body:{...newForm,sender_name:"Centre"}}).catch(e=>console.error('API error:',e));
    setShowNew(false);setNewForm({child_id:"",subject:"",body:""});
    load();if(r?.id)openThread(r?.id);
  };

  return (
    <div style={{display:"flex",gap:0,flex:1,minHeight:0,minHeight:500,borderRadius:14,overflow:"hidden",border:"1px solid #EDE8F4"}}>
      {/* Thread list */}
      <div style={{width:300,flexShrink:0,borderRight:"1px solid #EDE8F4",overflowY:"auto",background:"#FDFBFF",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"12px 14px",borderBottom:"1px solid #EDE8F4",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontWeight:700,fontSize:13,color:DARK}}>Conversations</div>
          <button onClick={()=>setShowNew(v=>!v)} style={{...bp,padding:"5px 12px",fontSize:11}}>+ New</button>
        </div>
        {showNew&&(
          <div style={{padding:"12px 14px",borderBottom:"1px solid #EDE8F4",background:"#F8F5FC"}}>
            <div style={{marginBottom:8}}>
              <label style={lbl}>Child</label>
              <select value={newForm.child_id} onChange={e=>setNewForm(p=>({...p,child_id:e.target.value}))} style={inp}>
                <option value="">General</option>
                {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
            <div style={{marginBottom:8}}>
              <label style={lbl}>Subject</label>
              <input value={newForm.subject} onChange={e=>setNewForm(p=>({...p,subject:e.target.value}))} style={inp}/>
            </div>
            <textarea value={newForm.body} onChange={e=>setNewForm(p=>({...p,body:e.target.value}))} rows={3} style={{...inp,resize:"none",marginBottom:8}}/>
            <div style={{display:"flex",gap:6}}>
              <button onClick={createThread} style={{...bp,fontSize:11,padding:"5px 12px"}}>Send</button>
              <button onClick={()=>setShowNew(false)} style={{...bs,fontSize:11,padding:"5px 12px"}}>Cancel</button>
            </div>
          </div>
        )}
        <div style={{flex:1,overflowY:"auto"}}>
          {threads.length===0
            ? <div style={{padding:"30px 14px",color:MU,fontSize:12,textAlign:"center"}}>No conversations yet</div>
            : threads.map(t=>(
              <div key={t.id} onClick={()=>openThread(t.id)}
                style={{padding:"11px 14px",borderBottom:"1px solid #F0EBF8",cursor:"pointer",
                  background:active?.id===t.id?"#F3E8FF":t.unread_admin>0?"#FAFAFF":"#fff"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:2}}>
                  <div style={{fontWeight:t.unread_admin>0?700:500,fontSize:13,color:DARK,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>
                    {t.subject}
                  </div>
                  {t.unread_admin>0&&<span style={{background:P,color:"#fff",borderRadius:20,
                    padding:"1px 6px",fontSize:9,fontWeight:900,flexShrink:0,marginLeft:4}}>{t.unread_admin}</span>}
                </div>
                {t.first_name&&<div style={{fontSize:11,color:MU}}>{t.first_name} {t.last_name}</div>}
                <div style={{fontSize:11,color:MU,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {t.last_message_preview}
                </div>
              </div>
            ))}
        </div>
      </div>
      {/* Message view */}
      <div style={{flex:1,display:"flex",flexDirection:"column",background:"#fff"}}>
        {!active
          ? <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:MU}}>
              <div style={{textAlign:"center"}}><div style={{fontSize:40}}>💬</div><div style={{marginTop:8}}>Select a conversation</div></div>
            </div>
          : <>
              <div style={{padding:"12px 18px",borderBottom:"1px solid #EDE8F4",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:DARK}}>{active.subject}</div>
                  {active.first_name&&<div style={{fontSize:12,color:MU}}>{active.first_name} {active.last_name}</div>}
                </div>
                <button onClick={async()=>{await API(`/api/comms/threads/${active.id}/close`,{method:"PUT"});setActive(null);load();}} // error: caught by caller
                  style={{...bs,fontSize:11,padding:"4px 10px",color:MU,borderColor:"#EDE8F4"}}>Close</button>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"16px 18px",display:"flex",flexDirection:"column",gap:10}}>
                {messages.map(m=>(
                  <div key={m.id} style={{display:"flex",flexDirection:"column",alignItems:m.sender_type==="admin"?"flex-end":"flex-start"}}>
                    <div style={{maxWidth:"70%",padding:"9px 13px",borderRadius:12,
                      background:m.sender_type==="admin"?P:"#F0EBF8",color:m.sender_type==="admin"?"#fff":DARK}}>
                      <div style={{fontSize:13,lineHeight:1.5}}>{m.body}</div>
                    </div>
                    <div style={{fontSize:10,color:MU,marginTop:2}}>{m.sender_name} · {fmtDT(m.created_at)}</div>
                  </div>
                ))}
                <div ref={bottomRef}/>
              </div>
              <div style={{padding:"10px 16px",borderTop:"1px solid #EDE8F4",display:"flex",gap:8}}>
                <textarea value={reply} onChange={e=>setReply(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey))sendReply();}}
                  placeholder="Type a message… (Ctrl+Enter to send)" rows={2}
                  style={{...inp,resize:"none",flex:1}}/>
                <button onClick={sendReply} disabled={!reply.trim()} style={{...bp,alignSelf:"flex-end"}}>Send</button>
              </div>
            </>
        }
      </div>
    </div>
  );
}

// ─── BROADCAST TAB ────────────────────────────────────────────────────────────
function BroadcastTab() {
  const [rooms,setRooms]=useState([]);
  const [history,setHistory]=useState([]);
  const [form,setForm]=useState({subject:"",body:"",message_type:"general",target_audience:"all_families",target_room_ids:[]});
  const [preview,setPreview]=useState(null);
  const [sending,setSending]=useState(false);

  const TEMPLATES=[
    {label:"Centre closure",subject:"Centre Closure Notice",body:"Dear families,\n\nPlease be advised that our centre will be closed on [DATE] due to [REASON].\n\nWe apologise for any inconvenience.\n\nKind regards,\nThe Team"},
    {label:"Fee reminder",subject:"Fee Reminder",body:"Dear families,\n\nThis is a friendly reminder that fees for [PERIOD] are now due by [DUE DATE].\n\nKind regards,\nThe Team"},
    {label:"Health alert",subject:"Health Alert — Please Read",body:"Dear families,\n\nWe wanted to advise that there has been a case of [ILLNESS] confirmed at our centre.\n\nPlease monitor your child for [SYMPTOMS]. If unwell, please keep them home.\n\nKind regards,\nThe Team"},
    {label:"Event invitation",subject:"You're Invited!",body:"Dear families,\n\nWe are delighted to invite you to [EVENT] on [DATE] at [TIME].\n\nPlease RSVP by [DATE].\n\nKind regards,\nThe Team"},
    {label:"Policy update",subject:"Important Policy Update",body:"Dear families,\n\nWe would like to inform you of an update to our [POLICY] policy.\n\n[DETAILS]\n\nKind regards,\nThe Team"},
  ];

  useEffect(()=>{
    Promise.all([API("/api/rooms/simple"),API("/api/bulk-comms/history")])
      .then(([r,h])=>{setRooms(Array.isArray(r)?r:[]);setHistory(h.messages||[]);});
  },[]);

  useEffect(()=>{
    const url=form.target_audience==="room"&&form.target_room_ids.length>0
      ? `/api/bulk-comms/recipients?target_audience=room&room_ids=${form.target_room_ids.join(",")}`
      : `/api/bulk-comms/recipients?target_audience=${form.target_audience}`;
    API(url).then(r=>setPreview(r)).catch(()=>{});
  },[form.target_audience,form.target_room_ids]);

  const send=async()=>{
    if(!form.body)return;
    setSending(true);
    const r=await API("/api/bulk-comms/send",{method:"POST",body:{...form,channels:["in_app"]}});
    setSending(false);
    if(r.ok){
      window.showToast(`✓ ${r.message}`, 'error');
      setForm({subject:"",body:"",message_type:"general",target_audience:"all_families",target_room_ids:[]});
      API("/api/bulk-comms/history").then(h=>setHistory(h.messages||[]));
    } else window.showToast(r.error||"Failed", 'error');
  };

  const TYPE_C={general:IN,emergency:DA,fee_reminder:WA,policy_update:P,event:"#9333EA"};

  return (
    <div style={{display:"flex",gap:20}}>
      <div style={{flex:1}}>
        <div style={card}>
          <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:14}}>Send to Families</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
            {TEMPLATES.map(t=>(
              <button key={t.label} onClick={()=>setForm(p=>({...p,subject:t.subject,body:t.body}))}
                style={{padding:"4px 10px",borderRadius:20,border:"1px solid #DDD6EE",
                  background:"#F8F5FC",color:P,cursor:"pointer",fontSize:11,fontWeight:600}}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div>
              <label style={lbl}>Audience</label>
              <select value={form.target_audience} onChange={e=>setForm(p=>({...p,target_audience:e.target.value,target_room_ids:[]}))} style={inp}>
                <option value="all_families">All Families</option>
                <option value="room">Specific Room(s)</option>
                <option value="educators">All Educators</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Type</label>
              <select value={form.message_type} onChange={e=>setForm(p=>({...p,message_type:e.target.value}))} style={inp}>
                {["general","emergency","fee_reminder","policy_update","event"].map(t=>(
                  <option key={t} value={t}>{t.replace("_"," ")}</option>
                ))}
              </select>
            </div>
          </div>
          {form.target_audience==="room"&&(
            <div style={{marginBottom:10}}>
              <label style={lbl}>Select Rooms</label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
                {rooms.map(r=>(
                  <label key={r.id} style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",
                    padding:"5px 10px",borderRadius:20,fontSize:12,fontWeight:600,
                    border:`1px solid ${form.target_room_ids.includes(r.id)?P+"80":"#DDD6EE"}`,
                    background:form.target_room_ids.includes(r.id)?PL:"transparent",color:DARK}}>
                    <input type="checkbox" checked={form.target_room_ids.includes(r.id)}
                      onChange={e=>setForm(p=>({...p,target_room_ids:e.target.checked?[...p.target_room_ids,r.id]:p.target_room_ids.filter(x=>x!==r.id)}))}
                      style={{display:"none"}}/>
                    {r.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div style={{marginBottom:10}}>
            <label style={lbl}>Subject</label>
            <input value={form.subject} onChange={e=>setForm(p=>({...p,subject:e.target.value}))} style={inp}/>
          </div>
          <div style={{marginBottom:12}}>
            <label style={lbl}>Message</label>
            <textarea value={form.body} onChange={e=>setForm(p=>({...p,body:e.target.value}))} rows={8} style={{...inp,resize:"vertical"}}/>
          </div>
          {preview&&(
            <div style={{padding:"8px 12px",borderRadius:8,background:"#F0FDF4",border:"1px solid #A5D6A7",
              fontSize:12,color:OK,fontWeight:600,marginBottom:12}}>
              📬 Will send to <strong>{preview.count}</strong> famil{preview.count!==1?"ies":"y"}
            </div>
          )}
          <button onClick={send} disabled={sending||!form.body} style={{...bp,width:"100%"}}>
            {sending?"Sending…":"📤 Send Message"}
          </button>
        </div>
      </div>
      <div style={{width:300,flexShrink:0}}>
        <div style={{fontWeight:700,fontSize:11,color:MU,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Sent History</div>
        {history.length===0
          ? <div style={{...card,textAlign:"center",padding:"20px",color:MU,fontSize:12}}>No messages sent yet</div>
          : history.map(m=>(
            <div key={m.id} style={{...card,marginBottom:8,padding:"10px 14px"}}>
              <div style={{fontWeight:600,fontSize:12,color:DARK,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {m.subject||"(no subject)"}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
                <span style={{fontSize:10,fontWeight:700,color:TYPE_C[m.message_type]||IN}}>
                  {m.message_type?.replace("_"," ")}
                </span>
                <span style={{fontSize:10,color:MU}}>{m.recipient_count} families</span>
              </div>
              <div style={{fontSize:10,color:MU,marginTop:2}}>
                {fmtDT(m.sent_at||m.created_at)}
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ─── HEALTH TAB ───────────────────────────────────────────────────────────────
function HealthTab() {
  const [events,setEvents]=useState([]);
  const [todayCount,setTodayCount]=useState(0);
  const [children,setChildren]=useState([]);
  const [showNew,setShowNew]=useState(false);
  const [form,setForm]=useState({child_id:"",event_type:"illness",event_date:new Date().toISOString().split("T")[0],description:"",temperature:"",action_taken:"",parent_notified:false,follow_up_required:false});
  const [selSymptoms,setSelSymptoms]=useState([]);
  const SYMPTOMS=["Fever","Runny nose","Cough","Vomiting","Diarrhoea","Rash","Lethargy","Headache","Stomach ache"];

  const load=useCallback(()=>{
    Promise.all([API("/api/comms/health"),API("/api/children/simple")])
      .then(([h,c])=>{setEvents(h.events||[]);setTodayCount(h.today_count||0);setChildren(Array.isArray(c)?c:[]);});
  },[]);
  useEffect(()=>{load();},[load]);

  const save=async()=>{
    if(!form.child_id)return;
    try {
      await API("/api/comms/health",{method:"POST",body:{...form,symptoms:selSymptoms,temperature:form.temperature?parseFloat(form.temperature):null}});
      setShowNew(false);
      setForm({child_id:"",event_type:"illness",event_date:new Date().toISOString().split("T")[0],description:"",temperature:"",action_taken:"",parent_notified:false,follow_up_required:false});
      setSelSymptoms([]);load();
    } catch(e) { console.error('API error:', e); }
  };

  const TYPE_C={illness:WA,injury:DA,allergy:"#D946EF",medication:IN,other:MU};
  const TYPE_I={illness:"🤒",injury:"🩹",allergy:"⚠️",medication:"💊",other:"📝"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{...card,padding:"10px 16px",textAlign:"center",minWidth:80}}>
          <div style={{fontSize:20,fontWeight:900,color:WA}}>{todayCount}</div>
          <div style={{fontSize:11,color:MU}}>Today</div>
        </div>
        <button style={bp} onClick={()=>setShowNew(v=>!v)}>{showNew?"Cancel":"+ Record Health Event"}</button>
      </div>
      {showNew&&(
        <div style={{...card,background:"#FFF7ED",border:"1px solid #FDE68A"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div><label style={lbl}>Child *</label>
              <select value={form.child_id} onChange={e=>setForm(p=>({...p,child_id:e.target.value}))} style={inp}>
                <option value="">Select…</option>
                {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Event Type</label>
              <select value={form.event_type} onChange={e=>setForm(p=>({...p,event_type:e.target.value}))} style={inp}>
                {["illness","injury","allergy","medication","other"].map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Date</label>
              <input type="date" value={form.event_date} onChange={e=>setForm(p=>({...p,event_date:e.target.value}))} style={inp}/>
            </div>
            <div><label style={lbl}>Temperature (°C)</label>
              <input type="number" value={form.temperature} onChange={e=>setForm(p=>({...p,temperature:e.target.value}))} style={inp} placeholder="38.2" step="0.1"/>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label style={lbl}>Symptoms</label>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:4}}>
                {SYMPTOMS.map(s=>(
                  <label key={s} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:12,
                    padding:"3px 9px",borderRadius:20,border:`1px solid ${selSymptoms.includes(s)?WA+"80":"#DDD6EE"}`,
                    background:selSymptoms.includes(s)?"#FFFBEB":"transparent"}}>
                    <input type="checkbox" checked={selSymptoms.includes(s)}
                      onChange={e=>setSelSymptoms(p=>e.target.checked?[...p,s]:p.filter(x=>x!==s))}
                      style={{display:"none"}}/>{s}
                  </label>
                ))}
              </div>
            </div>
            <div style={{gridColumn:"span 2"}}><label style={lbl}>Description</label>
              <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2} style={{...inp,resize:"vertical"}}/>
            </div>
            <div style={{gridColumn:"span 2"}}><label style={lbl}>Action Taken</label>
              <input value={form.action_taken} onChange={e=>setForm(p=>({...p,action_taken:e.target.value}))} style={inp}/>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",fontSize:13}}>
              <input type="checkbox" checked={form.parent_notified} onChange={e=>setForm(p=>({...p,parent_notified:e.target.checked}))}/>
              Notify parent (creates message thread)
            </label>
            <label style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",fontSize:13}}>
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
        ? <div style={{...card,textAlign:"center",padding:"30px",color:MU}}><div style={{fontSize:36}}>🏥</div><div style={{marginTop:8}}>No health events recorded</div></div>
        : events.map(e=>(
          <div key={e.id} style={{...card,borderLeft:`4px solid ${TYPE_C[e.event_type]||MU}`,padding:"12px 18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <span style={{fontSize:20}}>{TYPE_I[e.event_type]||"📝"}</span>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:DARK}}>{e.first_name} {e.last_name}</div>
                  <div style={{fontSize:11,color:MU}}>{e.room_name} · {fmtD(e.event_date)}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {e.temperature&&<span style={{fontSize:12,fontWeight:700,color:e.temperature>=38?DA:WA}}>🌡️ {e.temperature}°C</span>}
                {e.parent_notified&&<span style={{fontSize:11,color:OK,fontWeight:700}}>✓ Notified</span>}
              </div>
            </div>
            {e.symptoms?.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>
              {e.symptoms.map(s=><span key={s} style={{fontSize:10,background:`${WA}20`,color:WA,padding:"2px 7px",borderRadius:20}}>{s}</span>)}
            </div>}
            {e.description&&<div style={{fontSize:12,color:MU,marginTop:4}}>{e.description}</div>}
          </div>
        ))
      }
    </div>
  );
}

// ─── IMMUNISATION TAB ─────────────────────────────────────────────────────────
function ImmunisationTab() {
  const [children,setChildren]=useState([]);
  const [compliance,setCompliance]=useState(null);
  const [selChild,setSelChild]=useState(null);
  const [data,setData]=useState(null);
  const [showRecord,setShowRecord]=useState(false);
  const [recForm,setRecForm]=useState({vaccine_name:"",date_given:"",provider:""});

  useEffect(()=>{
    Promise.all([API("/api/children/simple"),API("/api/comms/immunisation-compliance")])
      .then(([c,comp])=>{setChildren(Array.isArray(c)?c:[]);setCompliance(comp);});
  },[]);

  const loadChild=async(id)=>{
    setSelChild(id);
    const r=await API(`/api/comms/immunisation/${id}`.catch(e=>console.error('API error:',e)));
    setData(r);
  };

  const saveRecord=async()=>{
    if(!recForm.vaccine_name||!selChild)return;
    await API(`/api/comms/immunisation/${selChild}`,{method:"POST",body:recForm}).catch(e=>console.error('API error:',e));
    setShowRecord(false);setRecForm({vaccine_name:"",date_given:"",provider:""});
    loadChild(selChild);
  };

  return (
    <div style={{display:"flex",gap:20}}>
      <div style={{width:250,flexShrink:0}}>
        {compliance&&(
          <div style={{...card,marginBottom:12,padding:"12px"}}>
            <div style={{fontWeight:700,fontSize:12,color:DARK,marginBottom:8}}>Centre Compliance</div>
            {[["Up to date",compliance.summary?.compliant,OK],["Overdue",compliance.summary?.with_overdue,DA],["Total",compliance.summary?.total,P]].map(([l,v,c])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0"}}>
                <span style={{color:MU}}>{l}</span><span style={{fontWeight:700,color:c}}>{v||0}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{fontWeight:700,fontSize:11,color:MU,marginBottom:8,textTransform:"uppercase"}}>Children</div>
        {(compliance?.compliance||children).map(c=>(
          <button key={c.id} onClick={()=>loadChild(c.id)}
            style={{width:"100%",padding:"8px 10px",borderRadius:9,border:`1px solid ${selChild===c.id?P:"#EDE8F4"}`,
              background:selChild===c.id?PL:"#fff",textAlign:"left",cursor:"pointer",marginBottom:4}}>
            <div style={{fontWeight:600,fontSize:12,color:DARK}}>{c.first_name} {c.last_name}</div>
            {c.overdue>0
              ? <div style={{fontSize:10,color:DA,fontWeight:600}}>{c.overdue} overdue</div>
              : <div style={{fontSize:10,color:OK}}>✓ Up to date</div>
            }
          </button>
        ))}
      </div>
      <div style={{flex:1}}>
        {!selChild
          ? <div style={{...card,textAlign:"center",padding:"40px",color:MU}}><div style={{fontSize:40}}>💉</div><div style={{marginTop:8,fontWeight:600,color:DARK}}>Select a child</div></div>
          : data&&(
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15,color:DARK}}>{data.child?.first_name} {data.child?.last_name}</div>
                  <div style={{fontSize:12,color:MU}}>{data.stats?.age_months}m old · {data.stats?.completed}/{data.stats?.total_due} vaccines done</div>
                </div>
                <div style={{display:"flex",gap:10}}>
                  {[["Overdue",data.stats?.overdue,DA],["Upcoming",data.stats?.upcoming,WA],["Done",data.stats?.completed,OK]].map(([l,v,c])=>(
                    <div key={l} style={{...card,padding:"6px 12px",textAlign:"center",minWidth:60}}>
                      <div style={{fontSize:16,fontWeight:900,color:c}}>{v||0}</div>
                      <div style={{fontSize:9,color:MU}}>{l}</div>
                    </div>
                  ))}
                  <button onClick={()=>setShowRecord(true)} style={bp}>+ Record</button>
                </div>
              </div>
              {showRecord&&(
                <div style={{...card,background:"#F0FDF4",border:"1px solid #A5D6A7",marginBottom:12}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                    <div style={{gridColumn:"span 3"}}><label style={lbl}>Vaccine *</label>
                      <input value={recForm.vaccine_name} onChange={e=>setRecForm(p=>({...p,vaccine_name:e.target.value}))} style={inp} list="vax-list"/>
                      <datalist id="vax-list">{data.schedule?.map(s=><option key={s.id} value={s.vaccine}/>)}</datalist>
                    </div>
                    <div><label style={lbl}>Date Given</label>
                      <input type="date" value={recForm.date_given} onChange={e=>setRecForm(p=>({...p,date_given:e.target.value}))} style={inp}/>
                    </div>
                    <div><label style={lbl}>Provider</label>
                      <input value={recForm.provider} onChange={e=>setRecForm(p=>({...p,provider:e.target.value}))} style={inp}/>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:10}}>
                    <button style={bp} onClick={saveRecord}>Save</button>
                    <button style={bs} onClick={()=>setShowRecord(false)}>Cancel</button>
                  </div>
                </div>
              )}
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:"#F8F5FC"}}>
                  {["Vaccine","Due At","Status","Date Given"].map(h=>(
                    <th key={h} style={{padding:"7px 10px",textAlign:"left",color:MU,fontWeight:700,fontSize:11}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {data.schedule?.map((s,i)=>(
                    <tr key={i} style={{borderBottom:"1px solid #F0EBF8",
                      background:s.overdue?"#FEF2F2":s.upcoming?"#FFFBEB":s.completed?"#F0FDF4":"#fff"}}>
                      <td style={{padding:"7px 10px",fontWeight:600,color:DARK}}>{s.vaccine}</td>
                      <td style={{padding:"7px 10px",color:MU}}>{s.age_label}</td>
                      <td style={{padding:"7px 10px"}}>
                        <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,
                          background:s.completed?"#F0FDF4":s.overdue?"#FEF2F2":s.upcoming?"#FFFBEB":"transparent",
                          color:s.completed?OK:s.overdue?DA:s.upcoming?WA:MU}}>
                          {s.completed?"✓ Done":s.overdue?"⚠️ Overdue":s.upcoming?"Due soon":"Not yet due"}
                        </span>
                      </td>
                      <td style={{padding:"7px 10px",color:MU}}>{s.record?.date_given?fmtD(s.record.date_given):"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )
        }
      </div>
    </div>
  );
}

// ─── TIMELINE TAB ─────────────────────────────────────────────────────────────
function TimelineTab() {
  const [children,setChildren]=useState([]);
  const [selChild,setSelChild]=useState(null);
  const [data,setData]=useState(null);
  const [filter,setFilter]=useState("all");

  useEffect(()=>{API("/api/children/simple").then(c=>setChildren(Array.isArray(c)?c:[]));},[]);

  const loadTimeline=async(id)=>{
    setSelChild(id);
    const r=await API(`/api/bulk-comms/timeline/${id}`.catch(e=>console.error('API error:',e)));
    setData(r);
  };

  const TYPE_C={observation:IN,story:P,health:WA,incident:DA,milestone:OK,immunisation:"#0E7490",excursion:"#9333EA",room_change:"#6B7280",enrolment:P};
  const TYPE_ICON={observation:"📝",story:"✨",health:"🤒",incident:"⚠️",milestone:"🌱",immunisation:"💉",excursion:"🚌",room_change:"🏠",enrolment:"🎉"};
  const EVENT_TYPES=["all","observation","story","milestone","health","incident","immunisation","excursion"];
  const filtered=filter==="all"?data?.events:(data?.events||[]).filter(e=>e.type===filter);

  return (
    <div style={{display:"flex",gap:20}}>
      <div style={{width:220,flexShrink:0}}>
        <div style={{fontWeight:700,fontSize:11,color:MU,marginBottom:8,textTransform:"uppercase"}}>Select Child</div>
        {children.map(c=>(
          <button key={c.id} onClick={()=>loadTimeline(c.id)}
            style={{width:"100%",padding:"9px 10px",borderRadius:9,border:`1px solid ${selChild===c.id?P:"#EDE8F4"}`,
              background:selChild===c.id?PL:"#fff",textAlign:"left",cursor:"pointer",marginBottom:4,fontSize:12}}>
            <div style={{fontWeight:selChild===c.id?700:400,color:DARK}}>{c.first_name} {c.last_name}</div>
            <div style={{fontSize:10,color:MU}}>{c.room_name}</div>
          </button>
        ))}
      </div>
      <div style={{flex:1}}>
        {!selChild
          ? <div style={{...card,textAlign:"center",padding:"40px",color:MU}}><div style={{fontSize:40}}>👶</div><div style={{marginTop:8,fontWeight:600,color:DARK}}>Select a child to view timeline</div></div>
          : data&&(
            <>
              <div style={{...card,marginBottom:14,padding:"12px 18px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:15,color:DARK}}>{data.child?.first_name} {data.child?.last_name}</div>
                    <div style={{fontSize:12,color:MU}}>{data.child?.room_name}</div>
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    {[["Obs",data.stats?.total_observations,IN],["Milestones",data.stats?.milestones_achieved,OK],["Health",data.stats?.health_events,WA]].map(([l,v,c])=>(
                      <div key={l} style={{textAlign:"center",padding:"5px 10px",borderRadius:8,background:`${c}15`}}>
                        <div style={{fontSize:16,fontWeight:900,color:c}}>{v||0}</div>
                        <div style={{fontSize:9,color:MU}}>{l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>
                {EVENT_TYPES.map(t=>(
                  <button key={t} onClick={()=>setFilter(t)}
                    style={{padding:"4px 10px",borderRadius:20,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,
                      textTransform:"capitalize",background:filter===t?(TYPE_C[t]||P):"#F0EBF8",
                      color:filter===t?"#fff":(TYPE_C[t]||P)}}>
                    {TYPE_ICON[t]||""} {t}
                  </button>
                ))}
              </div>
              <div style={{position:"relative",paddingLeft:24}}>
                <div style={{position:"absolute",left:8,top:0,bottom:0,width:2,background:"#EDE8F4"}}/>
                {filtered?.length===0
                  ? <div style={{...card,textAlign:"center",padding:"20px",color:MU}}>No {filter} events</div>
                  : filtered?.map((event,i)=>(
                    <div key={i} style={{position:"relative",marginBottom:12}}>
                      <div style={{position:"absolute",left:-20,top:12,width:10,height:10,borderRadius:"50%",
                        background:event.color||P,border:"2px solid #fff",boxShadow:`0 0 0 2px ${event.color||P}`}}/>
                      <div style={{...card,padding:"10px 14px",borderLeft:`3px solid ${event.color||P}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                          <div style={{display:"flex",gap:7,alignItems:"center"}}>
                            <span style={{fontSize:16}}>{event.icon}</span>
                            <span style={{fontWeight:700,fontSize:12,color:DARK}}>{event.title}</span>
                          </div>
                          <div style={{fontSize:10,color:MU}}>{fmtD(event.date)}</div>
                        </div>
                        {event.detail&&<div style={{fontSize:11,color:MU,marginTop:3,paddingLeft:23}}>{event.detail}</div>}
                      </div>
                    </div>
                  ))
                }
              </div>
            </>
          )
        }
      </div>
    </div>
  );
}

// ─── ACTIVITY TAB ─────────────────────────────────────────────────────────────
function ActivityTab() {
  const [logs,setLogs]=useState([]);
  const [summary,setSummary]=useState([]);
  const [filter,setFilter]=useState("all");
  const [days,setDays]=useState(7);

  const load=useCallback(()=>{
    const from=new Date(Date.now()-days*86400000).toISOString().split("T")[0];
    const url=filter==="all"?`/api/bulk-comms/activity?from=${from}&limit=200`
      :`/api/bulk-comms/activity?from=${from}&entity_type=${filter}&limit=200`;
    API(url).then(r=>{setLogs(r.logs||[]);setSummary(r.summary||[]);});
  },[filter,days]);
  useEffect(()=>{load();},[load]);

  const ACTION_C={create:OK,update:IN,delete:DA,login:P,logout:MU,room_change:WA,approve:OK,reject:DA};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        {summary.map(s=>(
          <button key={s.entity_type} onClick={()=>setFilter(filter===s.entity_type?"all":s.entity_type)}
            style={{padding:"5px 12px",borderRadius:20,cursor:"pointer",fontSize:11,fontWeight:700,border:"none",
              background:filter===s.entity_type?P:"#F0EBF8",color:filter===s.entity_type?"#fff":P}}>
            {s.entity_type}: {s.count}
          </button>
        ))}
        <div style={{marginLeft:"auto",display:"flex",gap:5}}>
          {[7,14,30].map(d=>(
            <button key={d} onClick={()=>setDays(d)}
              style={{padding:"4px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,
                background:days===d?P:"#F0EBF8",color:days===d?"#fff":P}}>
              {d}d
            </button>
          ))}
        </div>
        <div style={{fontSize:12,color:MU}}>{logs.length} events</div>
      </div>
      {logs.length===0
        ? <div style={{...card,textAlign:"center",padding:"30px",color:MU}}><div style={{fontSize:36}}>📊</div><div style={{marginTop:8}}>No activity in this period</div></div>
        : <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:"#F8F5FC"}}>
              {["Time","User","Action","Entity","Detail"].map(h=>(
                <th key={h} style={{padding:"7px 10px",textAlign:"left",color:MU,fontWeight:700,fontSize:11}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {logs.map(l=>(
                <tr key={l.id} style={{borderBottom:"1px solid #F0EBF8"}}>
                  <td style={{padding:"7px 10px",color:MU,fontSize:11,whiteSpace:"nowrap"}}>{fmtDT(l.performed_at)}</td>
                  <td style={{padding:"7px 10px",color:DARK,fontSize:12}}>{l.performed_by_name||"System"}</td>
                  <td style={{padding:"7px 10px"}}>
                    <span style={{fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:20,
                      background:(ACTION_C[l.action]||MU)+"20",color:ACTION_C[l.action]||MU}}>
                      {l.action}
                    </span>
                  </td>
                  <td style={{padding:"7px 10px",color:MU,fontSize:11,textTransform:"capitalize"}}>{l.entity_type}</td>
                  <td style={{padding:"7px 10px",color:MU,fontSize:11,maxWidth:250,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.detail||"—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
      }
    </div>
  );
}
