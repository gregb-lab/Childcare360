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

const TABS=[{id:"messages",icon:"💬",label:"Messages"},{id:"sms",icon:"📱",label:"Send SMS"},{id:"health",icon:"🏥",label:"Health Events"},{id:"immunisation",icon:"💉",label:"Immunisation"}];

export default function CommsModule() {
  const [tab,setTab]=useState("messages");
  const [unread,setUnread]=useState(0);

  useEffect(()=>{
    API("/api/comms/threads").then(r=>setUnread(r.unread_total||0)).catch(()=>{});
  },[]);

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",padding:"24px 28px 0",boxSizing:"border-box"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16,flexShrink:0}}>
        <span style={{fontSize:28}}>💬</span>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>Communications & Health</h1>
          <p style={{margin:"3px 0 0",fontSize:13,color:MU}}>Parent messaging · Health events · Immunisation tracking</p>
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:16,borderBottom:"1px solid #EDE8F4",paddingBottom:12,flexShrink:0}}>
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
      <div style={{flex:1,minHeight:0,overflow:"hidden"}}>
        {tab==="messages"     && <MessagesTab onUnreadChange={setUnread}/>}
        {tab==="sms"          && <SmsTab />}
        {tab==="health"       && <HealthTab />}
        {tab==="immunisation" && <ImmunisationTab />}
      </div>
    </div>
  );
}

// ─── SMS COMPOSE TAB ──────────────────────────────────────────────────────
function SmsTab() {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [purpose, setPurpose] = useState("general");
  const [childId, setChildId] = useState("");
  const [educatorId, setEducatorId] = useState("");
  const [children, setChildren] = useState([]);
  const [educators, setEducators] = useState([]);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);
  const [lastResult, setLastResult] = useState(null);

  const loadHistory = useCallback(() => {
    API("/api/comms/sms/history?limit=20").then(d => { if (d?.messages) setHistory(d.messages); }).catch(() => {});
  }, []);

  useEffect(() => {
    loadHistory();
    API("/api/children").then(d => setChildren(Array.isArray(d) ? d : (d?.children || []))).catch(() => {});
    API("/api/educators").then(d => setEducators(Array.isArray(d) ? d : (d?.educators || []))).catch(() => {});
  }, [loadHistory]);

  const handleSend = async () => {
    if (!to.trim() || !message.trim()) return;
    setSending(true);
    setLastResult(null);
    try {
      const body = { to: to.trim(), message: message.trim(), purpose };
      if (childId) body.child_id = childId;
      if (educatorId) body.educator_id = educatorId;
      const res = await API("/api/comms/sms/send", { method: "POST", body });
      setLastResult(res);
      if (res.ok) {
        window.showToast && window.showToast("SMS sent ✓", "success");
        setMessage("");
        loadHistory();
      } else {
        window.showToast && window.showToast(res.error || "Send failed", "error");
      }
    } catch (e) { window.showToast && window.showToast("Send failed", "error"); }
    setSending(false);
  };

  const charCount = message.length;
  const smsSegments = Math.ceil(charCount / 160) || 1;
  const charColor = charCount > 160 ? WA : MU;

  return (
    <div style={{ overflowY: "auto", height: "100%", paddingBottom: 24 }}>
      <div style={{ ...card, marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: DARK }}>Send SMS</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
          <div>
            <label style={lbl}>Phone Number *</label>
            <input style={inp} value={to} onChange={e => setTo(e.target.value)} placeholder="0412 345 678 or +61412345678" />
            <div style={{ fontSize: 10, color: MU, marginTop: 3 }}>AU format — spaces OK, will be normalised to E.164</div>
          </div>
          <div>
            <label style={lbl}>Purpose</label>
            <select style={inp} value={purpose} onChange={e => setPurpose(e.target.value)}>
              <option value="general">General</option>
              <option value="reminder">Reminder</option>
              <option value="alert">Alert</option>
              <option value="shift_fill">Shift Fill</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Link to Child (optional)</label>
            <select style={inp} value={childId} onChange={e => { setChildId(e.target.value); if (e.target.value) setEducatorId(""); }}>
              <option value="">— none —</option>
              {children.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Link to Educator (optional)</label>
            <select style={inp} value={educatorId} onChange={e => { setEducatorId(e.target.value); if (e.target.value) setChildId(""); }}>
              <option value="">— none —</option>
              {educators.map(e2 => <option key={e2.id} value={e2.id}>{e2.first_name} {e2.last_name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Message *</label>
          <textarea style={{ ...inp, minHeight: 90, resize: "vertical" }} value={message} onChange={e => setMessage(e.target.value)} placeholder="Type your SMS here..." />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: charColor, marginTop: 4 }}>
            <span>{charCount} characters · {smsSegments} SMS segment{smsSegments !== 1 ? "s" : ""}</span>
            {charCount > 160 && <span>⚠️ Multi-segment SMS will cost more</span>}
          </div>
        </div>
        <button onClick={handleSend} disabled={sending || !to.trim() || !message.trim()} style={{ ...bp, opacity: (sending || !to.trim() || !message.trim()) ? 0.5 : 1 }}>
          {sending ? "Sending..." : "📱 Send SMS"}
        </button>
        {lastResult && lastResult.ok && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "#F0FFF4", border: "1px solid #A7F3D0", color: "#065F46", fontSize: 12 }}>
            ✓ Sent to {lastResult.to} · Twilio SID: <code style={{ fontSize: 11 }}>{lastResult.twilio_sid || "—"}</code> · Status: {lastResult.status}
          </div>
        )}
        {lastResult && lastResult.error && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B", fontSize: 12 }}>
            ✗ {lastResult.error}
          </div>
        )}
      </div>

      <div style={card}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: DARK }}>Recent SMS ({history.length})</h3>
        {history.length === 0 && <p style={{ color: MU, fontSize: 13 }}>No SMS sent yet.</p>}
        {history.map(m => (
          <div key={m.id} style={{ padding: "10px 12px", borderRadius: 10, marginBottom: 6, border: "1px solid #F0EBF8", background: m.status === "failed" ? "#FEF2F2" : "#FDFBFF" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: DARK }}>
                {m.to_number}
                {m.child_name && <span style={{ marginLeft: 8, fontSize: 11, color: P, fontWeight: 600 }}>→ {m.child_name}</span>}
                {m.educator_name && <span style={{ marginLeft: 8, fontSize: 11, color: P, fontWeight: 600 }}>→ {m.educator_name}</span>}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {m.purpose && <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 20, background: "#E8E0F0", color: "#6B5F7A" }}>{m.purpose}</span>}
                <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 20, background: m.status === "failed" ? "#FEE2E2" : "#D4EDDA", color: m.status === "failed" ? "#991B1B" : "#155724", fontWeight: 700 }}>{m.status}</span>
                <span style={{ fontSize: 10, color: MU }}>{fmtDT(m.created_at)}</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#5C4E6A", lineHeight: 1.4 }}>{m.message}</div>
            {m.sent_by_name && <div style={{ fontSize: 10, color: MU, marginTop: 3 }}>by {m.sent_by_name}</div>}
            {m.error_message && <div style={{ fontSize: 11, color: "#991B1B", marginTop: 4 }}>Error: {m.error_message}</div>}
          </div>
        ))}
      </div>
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
  const [newForm,setNewForm]=useState({child_id:"",subject:"",body:"",acknowledge_required:false});
  const [attachments,setAttachments]=useState([]);
  const [recipientOpts,setRecipientOpts]=useState({staff:[],parents:[],groups:[]});
  const [selectedRecipients,setSelectedRecipients]=useState([]);
  const [recipientMode,setRecipientMode]=useState('groups');
  const [recipientSearch,setRecipientSearch]=useState('');
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
  useEffect(()=>{if(showNew)API("/api/comms/recipients").then(d=>setRecipientOpts(d||{})).catch(()=>{});},[showNew]);

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

  const resetCompose=()=>{setShowNew(false);setNewForm({child_id:"",subject:"",body:"",acknowledge_required:false});setAttachments([]);setSelectedRecipients([]);setRecipientSearch("");};
  const addRecipient=(r2)=>{if(!selectedRecipients.find(x=>x.id===r2.id))setSelectedRecipients(p=>[...p,r2]);};
  const removeRecipient=(id)=>setSelectedRecipients(p=>p.filter(r2=>r2.id!==id));

  const createThread=async()=>{
    if(!newForm.subject||!newForm.body)return;
    const payload={...newForm,recipients:selectedRecipients.map(r2=>({id:r2.id,name:r2.name,type:r2.type}))};
    if(attachments.length>0){
      const fd=new FormData();fd.append('subject',payload.subject);fd.append('body',payload.body);
      if(payload.child_id)fd.append('child_id',payload.child_id);
      fd.append('acknowledge_required',payload.acknowledge_required?'1':'0');
      fd.append('recipients',JSON.stringify(payload.recipients));
      attachments.forEach(f=>fd.append('attachments',f));
      const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
      const res2=await fetch('/api/comms/threads',{method:'POST',headers:{...(t?{Authorization:'Bearer '+t}:{}),
        ...(tid?{'x-tenant-id':tid}:{})},body:fd}).then(r2=>r2.json()).catch(e=>console.error('API error:',e));
      resetCompose();load();if(res2?.id)openThread(res2.id);
    }else{
      const r=await API("/api/comms/threads",{method:"POST",body:payload}).catch(e=>console.error('API error:',e));
      resetCompose();load();if(r?.id)openThread(r?.id);
    }
  };

  return (
    <div style={{display:"flex",gap:0,height:"100%",borderRadius:14,overflow:"hidden",border:"1px solid #EDE8F4",minHeight:0}}>
      {/* Thread list */}
      <div style={{width:320,flexShrink:0,borderRight:"1px solid #EDE8F4",overflowY:"auto",background:"#FDFBFF",minHeight:0}}>
        <div style={{padding:"12px 14px",borderBottom:"1px solid #EDE8F4",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontWeight:700,fontSize:13,color:DARK}}>Conversations</div>
          <button onClick={()=>setShowNew(v=>!v)} style={{...bp,padding:"5px 12px",fontSize:11}}>+ New</button>
        </div>

        {showNew&&(
          <div style={{padding:"12px 14px",borderBottom:"1px solid #EDE8F4",background:"#F8F5FC",maxHeight:"calc(100vh - 300px)",overflowY:"auto"}}>
            {/* TO — recipient picker */}
            <div style={{marginBottom:10}}>
              <label style={lbl}>To</label>
              {/* Selected pills */}
              {selectedRecipients.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>
                {selectedRecipients.map(r2=>(
                  <span key={r2.id} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:20,background:"#EEEDFE",border:"1px solid #534AB7",fontSize:11,color:"#3C3489"}}>
                    {r2.type==="group"?"👥 ":""}{r2.name}
                    <button onClick={()=>removeRecipient(r2.id)} style={{border:"none",background:"none",cursor:"pointer",fontSize:13,lineHeight:1,color:"#534AB7",padding:0}}>×</button>
                  </span>
                ))}
              </div>}
              {/* Mode toggle */}
              <div style={{display:"flex",gap:0,marginBottom:8,border:"1px solid #DDD6EE",borderRadius:8,overflow:"hidden",width:"fit-content"}}>
                {["groups","individual"].map(m=>(
                  <button key={m} onClick={()=>setRecipientMode(m)} style={{padding:"5px 12px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",background:recipientMode===m?P:"transparent",color:recipientMode===m?"#fff":MU}}>{m==="groups"?"Groups":"Individual"}</button>
                ))}
              </div>
              {recipientMode==="groups"&&(()=>{
                const top4=(recipientOpts.groups||[]).filter(g=>["group_all_parents","group_all_educators","group_all_staff","group_admin"].includes(g.id));
                const roomP=(recipientOpts.groups||[]).filter(g=>g.id.startsWith("group_room_parents_"));
                const roomE=(recipientOpts.groups||[]).filter(g=>g.id.startsWith("group_room_educators_"));
                return(<div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                    {top4.map(g=><button key={g.id} onClick={()=>addRecipient({id:g.id,name:g.name,type:"group"})}
                      style={{padding:"7px 10px",borderRadius:8,border:selectedRecipients.find(r2=>r2.id===g.id)?"1.5px solid #534AB7":"1px solid #DDD6EE",background:selectedRecipients.find(r2=>r2.id===g.id)?"#EEEDFE":"#fff",color:selectedRecipients.find(r2=>r2.id===g.id)?"#3C3489":DARK,fontSize:11,fontWeight:600,cursor:"pointer",textAlign:"left"}}>
                      {g.name}{g.description&&<span style={{display:"block",fontSize:9,fontWeight:400,color:MU,marginTop:1}}>{g.description}</span>}
                    </button>)}
                  </div>
                  {roomP.length>0&&<div>
                    <div style={{fontSize:10,fontWeight:700,color:MU,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>By room</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                      {roomP.map(g=><button key={g.id} onClick={()=>addRecipient({id:g.id,name:g.name,type:"group"})}
                        style={{padding:"5px 8px",borderRadius:6,border:selectedRecipients.find(r2=>r2.id===g.id)?"1.5px solid #534AB7":"1px solid #EDE8F4",background:selectedRecipients.find(r2=>r2.id===g.id)?"#EEEDFE":"#fff",color:selectedRecipients.find(r2=>r2.id===g.id)?"#3C3489":"#6B5F7A",fontSize:10,fontWeight:500,cursor:"pointer",textAlign:"left"}}>{g.name}</button>)}
                      {roomE.map(g=><button key={g.id} onClick={()=>addRecipient({id:g.id,name:g.name,type:"group"})}
                        style={{padding:"5px 8px",borderRadius:6,border:selectedRecipients.find(r2=>r2.id===g.id)?"1.5px solid #534AB7":"1px solid #EDE8F4",background:selectedRecipients.find(r2=>r2.id===g.id)?"#EEEDFE":"#fff",color:selectedRecipients.find(r2=>r2.id===g.id)?"#3C3489":"#6B5F7A",fontSize:10,fontWeight:500,cursor:"pointer",textAlign:"left"}}>{g.name}</button>)}
                    </div>
                  </div>}
                </div>);
              })()}
              {recipientMode==="individual"&&<div>
                <input type="text" placeholder="Search staff or parents..." value={recipientSearch} onChange={e=>setRecipientSearch(e.target.value)} style={{...inp,marginBottom:6}} autoFocus/>
                <div style={{maxHeight:150,overflowY:"auto",border:"1px solid #EDE8F4",borderRadius:8}}>
                  {(recipientOpts.staff||[]).filter(s=>!recipientSearch||s.name.toLowerCase().includes(recipientSearch.toLowerCase())).slice(0,6).map(s=>(
                    <div key={s.id} onClick={()=>addRecipient({id:s.id,name:s.name,type:"staff"})}
                      style={{padding:"7px 10px",cursor:"pointer",display:"flex",justifyContent:"space-between",borderBottom:"1px solid #F0EBF8",background:selectedRecipients.find(r2=>r2.id===s.id)?"#EEEDFE":"transparent",fontSize:12}}>
                      <span>{s.name} <span style={{fontSize:10,color:MU}}>{s.role}{s.room_name?" · "+s.room_name:""}</span></span>
                      <span style={{fontSize:10,color:selectedRecipients.find(r2=>r2.id===s.id)?"#16A34A":"#534AB7"}}>{selectedRecipients.find(r2=>r2.id===s.id)?"Added":"Add"}</span>
                    </div>
                  ))}
                  {(recipientOpts.parents||[]).filter(p2=>!recipientSearch||p2.name.toLowerCase().includes(recipientSearch.toLowerCase())||(p2.child_name||"").toLowerCase().includes(recipientSearch.toLowerCase())).slice(0,6).map(p2=>(
                    <div key={p2.id} onClick={()=>addRecipient({id:p2.id,name:p2.name,type:"parent"})}
                      style={{padding:"7px 10px",cursor:"pointer",display:"flex",justifyContent:"space-between",borderBottom:"1px solid #F0EBF8",background:selectedRecipients.find(r2=>r2.id===p2.id)?"#EEEDFE":"transparent",fontSize:12}}>
                      <span>{p2.name} <span style={{fontSize:10,color:MU}}>parent of {p2.child_name}</span></span>
                      <span style={{fontSize:10,color:selectedRecipients.find(r2=>r2.id===p2.id)?"#16A34A":"#534AB7"}}>{selectedRecipients.find(r2=>r2.id===p2.id)?"Added":"Add"}</span>
                    </div>
                  ))}
                </div>
              </div>}
            </div>
            <div style={{marginBottom:8}}>
              <label style={lbl}>Subject</label>
              <input value={newForm.subject} onChange={e=>setNewForm(p=>({...p,subject:e.target.value}))} style={inp}/>
            </div>
            <div style={{marginBottom:8}}>
              <label style={lbl}>Message</label>
              <textarea value={newForm.body} onChange={e=>setNewForm(p=>({...p,body:e.target.value}))} rows={3} style={{...inp,resize:"vertical"}}/>
            </div>
            <div style={{marginBottom:8}}>
              <input type="file" id="compose-attach" accept="image/*,video/*,.pdf,.doc,.docx" multiple style={{display:"none"}}
                onChange={e=>setAttachments(p=>[...p,...Array.from(e.target.files)])}/>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <button type="button" onClick={()=>document.getElementById('compose-attach').click()} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid #DDD6EE",background:"transparent",cursor:"pointer",color:MU}}>Attach file</button>
                <label style={{fontSize:11,color:MU,display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
                  <input type="checkbox" checked={newForm.acknowledge_required} onChange={e=>setNewForm(p=>({...p,acknowledge_required:e.target.checked}))} /> Require acknowledgement
                </label>
              </div>
              {attachments.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>
                {attachments.map((f,i)=><div key={i} style={{fontSize:10,padding:"2px 8px",borderRadius:6,background:"#F0EBF8",display:"flex",alignItems:"center",gap:4}}>{f.name}<button onClick={()=>setAttachments(p=>p.filter((_,j)=>j!==i))} style={{border:"none",background:"none",cursor:"pointer",color:MU,fontSize:13,lineHeight:1}}>×</button></div>)}
              </div>}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={createThread} style={{...bp,fontSize:11,padding:"6px 12px"}}>Send</button>
              <button onClick={resetCompose} style={{...bs,fontSize:11,padding:"6px 12px"}}>Cancel</button>
            </div>
          </div>
        )}

        {threads.length===0
          ? <div style={{padding:"30px 14px",color:MU,fontSize:12,textAlign:"center"}}>No conversations yet</div>
          : threads.map(t=>(
            <div key={t.id} onClick={()=>openThread(t.id)}
              style={{padding:"12px 14px",borderBottom:"1px solid #F0EBF8",cursor:"pointer",
                background:active?.id===t.id?"#F3E8FF":t.unread_admin>0?"#FAFAFF":"#fff"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:3,gap:8}}>
                {t.unread_admin>0&&<div style={{width:8,height:8,borderRadius:"50%",background:"#534AB7",marginTop:5,flexShrink:0}}/>}
                <div style={{fontWeight:t.unread_admin>0?700:400,fontSize:13,color:DARK,
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>
                  {t.subject}
                </div>
                {t.unread_admin>0&&(
                  <span style={{background:P,color:"#fff",borderRadius:20,padding:"1px 6px",fontSize:10,fontWeight:900,flexShrink:0,marginLeft:6}}>{t.unread_admin}</span>
                )}
              </div>
              {(t.to_group_label||t.first_name||t.room_name)&&(
                <div style={{fontSize:11,color:MU}}>
                  {t.to_group_label?<span style={{fontWeight:600}}>👥 {t.to_group_label}</span>
                    :t.first_name?`${t.first_name} ${t.last_name}${t.room_name?" · "+t.room_name:""}`:t.room_name||""}
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
      <div style={{flex:1,display:"flex",flexDirection:"column",background:"#fff",minHeight:0,overflow:"hidden"}}>
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
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>{const last=messages[messages.length-1];setShowNew(true);setNewForm({child_id:active.child_id||"",subject:"Fwd: "+active.subject,body:"\n\n--- Forwarded ---\nFrom: "+(last?.sender_name||"")+" \n\n"+(last?.body||"")});}} style={{...bs,fontSize:11,padding:"5px 12px"}}>Forward</button>
                <button onClick={async()=>{await API(`/api/comms/threads/${active.id}/close`,{method:"PUT"});setActive(null);load();}}
                  style={{...bs,fontSize:11,padding:"5px 12px",color:MU,borderColor:"#EDE8F4"}}>Close</button>
              </div>
            </div>

            {/* Messages */}
            <div style={{flex:1,overflowY:"auto",padding:"16px 18px",display:"flex",flexDirection:"column",gap:12,minHeight:0}}>
              {messages.map(m=>{
                let attachments=[];try{attachments=JSON.parse(m.attachments||'[]');}catch{}
                return(
                <div key={m.id} style={{display:"flex",flexDirection:"column",
                  alignItems:m.sender_type==="admin"?"flex-end":"flex-start"}}>
                  <div style={{maxWidth:"70%",padding:"10px 14px",borderRadius:12,
                    background:m.sender_type==="admin"?P:"#F0EBF8",
                    color:m.sender_type==="admin"?"#fff":DARK}}>
                    <div style={{fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{m.body}</div>
                    {attachments.length>0&&<div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>
                      {attachments.map((a,i)=>a.type?.startsWith('image')?<img key={i} src={a.url} alt={a.name} style={{maxWidth:200,borderRadius:6}}/>:<a key={i} href={a.url} target="_blank" rel="noopener" style={{fontSize:11,color:m.sender_type==="admin"?"#fff":P,textDecoration:"underline"}}>{a.name}</a>)}
                    </div>}
                    {m.acknowledge_required&&!m.ack_at&&(
                      <button onClick={async()=>{await API('/api/comms/messages/'+m.id+'/acknowledge',{method:'POST'});openThread(active.id);}}
                        style={{marginTop:8,padding:"6px 14px",borderRadius:6,border:"none",background:"#534AB7",color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer"}}>Acknowledge</button>
                    )}
                    {m.ack_at&&<div style={{fontSize:10,marginTop:4,opacity:0.7}}>Acknowledged {fmtDT(m.ack_at)}</div>}
                  </div>
                  <div style={{fontSize:10,color:MU,marginTop:3,paddingLeft:4}}>
                    {m.sender_name||m.sender_type} · {fmtDT(m.created_at)}
                  </div>
                </div>
              );})}
              <div ref={bottomRef}/>
            </div>

            {/* Reply */}
            <div style={{padding:"12px 18px",borderTop:"1px solid #EDE8F4",display:"flex",gap:10,flexShrink:0}}>
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
