/**
 * BulkCommsModule.jsx — v2.17.0
 *   📣 Bulk Send   — Message all families, by room, or educators
 *   👶 Child Timeline — Full chronological history for any child
 *   📊 Activity Log — Centre-wide audit trail
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

const fmtDT=d=>d?new Date(d).toLocaleString("en-AU",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
const fmtD=d=>d?new Date(d.length===10?d+"T12:00":d).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):"—";

const TABS=[
  {id:"send",    icon:"📣", label:"Bulk Message"},
  {id:"timeline",icon:"👶", label:"Child Timeline"},
  {id:"activity",icon:"📊", label:"Activity Log"},
];

export default function BulkCommsModule() {
  const [tab,setTab]=useState("send");
  return (
    <div style={{padding:"24px 28px"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
        <span style={{fontSize:28}}>📣</span>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>Bulk Communications & Activity</h1>
          <p style={{margin:"3px 0 0",fontSize:13,color:MU}}>Send to all families · Child timeline · Centre activity log</p>
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
      {tab==="send"     && <BulkSendTab />}
      {tab==="timeline" && <ChildTimelineTab />}
      {tab==="activity" && <ActivityLogTab />}
    </div>
  );
}

// ─── BULK SEND TAB ────────────────────────────────────────────────────────────
function BulkSendTab() {
  const [rooms,setRooms]=useState([]);
  const [history,setHistory]=useState([]);
  const [preview,setPreview]=useState(null);
  const [sending,setSending]=useState(false);
  const [form,setForm]=useState({
    subject:"",body:"",message_type:"general",
    target_audience:"all_families",target_room_ids:[]
  });
  const TEMPLATES=[
    {label:"Centre closure",subject:"Centre Closure Notice",body:"Dear families,\n\nPlease be advised that our centre will be closed on [DATE] due to [REASON].\n\nWe apologise for any inconvenience. If you have any questions, please contact us.\n\nKind regards,\nThe Team"},
    {label:"Fee reminder",subject:"Fee Reminder",body:"Dear families,\n\nThis is a friendly reminder that fees for [PERIOD] are now due.\n\nPlease ensure payment is made by [DUE DATE]. You can pay online through our parent portal.\n\nThank you for your prompt attention.\n\nKind regards,\nThe Team"},
    {label:"Policy update",subject:"Important Policy Update",body:"Dear families,\n\nWe would like to inform you of an important update to our [POLICY NAME] policy.\n\n[DETAILS]\n\nPlease acknowledge receipt of this notice by [DATE].\n\nKind regards,\nThe Team"},
    {label:"Event invitation",subject:"You're Invited!",body:"Dear families,\n\nWe are delighted to invite you to [EVENT NAME] on [DATE] at [TIME].\n\n[DETAILS]\n\nPlease RSVP by [DATE] so we can ensure we have enough [FOOD/SEATS/ACTIVITIES].\n\nWe look forward to seeing you!\n\nKind regards,\nThe Team"},
    {label:"Weather/health alert",subject:"Health Alert — Please Read",body:"Dear families,\n\nWe wanted to make you aware that there has been a case of [ILLNESS] confirmed at our centre.\n\nPlease monitor your child for symptoms including [SYMPTOMS]. If your child is unwell, please keep them home.\n\nWe have increased our cleaning and hygiene protocols.\n\nKind regards,\nThe Team"},
  ];

  const load=useCallback(()=>{
    Promise.all([
      API("/api/rooms/simple"),
      API("/api/bulk-comms/history"),
    ]).then(([r,h])=>{
      setRooms(Array.isArray(r)?r:[]);
      setHistory(h.messages||[]);
    });
  },[]);

  useEffect(()=>{load();},[load]);

  useEffect(()=>{
    // Preview recipients when form changes
    const url = form.target_audience==="room" && form.target_room_ids.length>0
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
      window.showToast(`✓ ${r.message}`, 'success');
      setForm({subject:"",body:"",message_type:"general",target_audience:"all_families",target_room_ids:[]});
      load();
    } else window.showToast(r.error||"Failed to send", 'error');
  };

  const applyTemplate=t=>{
    setForm(p=>({...p,subject:t.subject,body:t.body}));
  };

  const TYPE_C={general:IN,emergency:DA,fee_reminder:WA,policy_update:P,event:"#9333EA"};

  return (
    <div style={{display:"flex",gap:20}}>
      {/* Compose */}
      <div style={{flex:1}}>
        <div style={card}>
          <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:16}}>Compose Message</div>

          {/* Templates */}
          <div style={{marginBottom:14}}>
            <label style={lbl}>Quick Templates</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
              {TEMPLATES.map(t=>(
                <button key={t.label} onClick={()=>applyTemplate(t)}
                  style={{padding:"4px 12px",borderRadius:20,border:"1px solid #DDD6EE",
                    background:"#F8F5FC",color:P,cursor:"pointer",fontSize:11,fontWeight:600}}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div>
              <label style={lbl}>Audience *</label>
              <select value={form.target_audience} onChange={e=>setForm(p=>({...p,target_audience:e.target.value,target_room_ids:[]}))} style={inp}>
                <option value="all_families">All Families</option>
                <option value="room">Specific Room(s)</option>
                <option value="educators">All Educators</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Message Type</label>
              <select value={form.message_type} onChange={e=>setForm(p=>({...p,message_type:e.target.value}))} style={inp}>
                {["general","emergency","fee_reminder","policy_update","event"].map(t=>(
                  <option key={t} value={t}>{t.replace("_"," ")}</option>
                ))}
              </select>
            </div>
          </div>

          {form.target_audience==="room"&&(
            <div style={{marginBottom:12}}>
              <label style={lbl}>Select Rooms</label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
                {rooms.map(r=>(
                  <label key={r.id} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",
                    padding:"6px 12px",borderRadius:20,fontSize:12,fontWeight:600,
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

          <div style={{marginBottom:12}}>
            <label style={lbl}>Subject</label>
            <input value={form.subject} onChange={e=>setForm(p=>({...p,subject:e.target.value}))} style={inp} placeholder="Message subject…"/>
          </div>

          <div style={{marginBottom:16}}>
            <label style={lbl}>Message Body *</label>
            <textarea value={form.body} onChange={e=>setForm(p=>({...p,body:e.target.value}))}
              rows={10} style={{...inp,resize:"vertical",lineHeight:1.6}}
              placeholder="Type your message here…"/>
          </div>

          {/* Preview count */}
          {preview&&(
            <div style={{padding:"10px 14px",borderRadius:8,background:"#F0FDF4",border:"1px solid #A5D6A7",
              fontSize:13,color:OK,fontWeight:600,marginBottom:14}}>
              📬 Will send to <strong>{preview.count}</strong> famil{preview.count!==1?"ies":"y"}
            </div>
          )}

          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button onClick={send} disabled={sending||!form.body}
              style={{...bp,opacity:!form.body?0.5:1}}>
              {sending?"Sending…":"📤 Send to All"}
            </button>
          </div>
        </div>
      </div>

      {/* History */}
      <div style={{width:320,flexShrink:0}}>
        <div style={{fontWeight:700,fontSize:11,color:MU,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>
          Sent History
        </div>
        {history.length===0
          ? <div style={{...card,textAlign:"center",padding:"30px 0",color:MU}}>No messages sent yet</div>
          : history.map(m=>(
            <div key={m.id} style={{...card,marginBottom:10,padding:"12px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                <div style={{fontWeight:600,fontSize:13,color:DARK,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {m.subject||"(no subject)"}
                </div>
                <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,flexShrink:0,marginLeft:8,
                  background:(TYPE_C[m.message_type]||IN)+"20",color:TYPE_C[m.message_type]||IN}}>
                  {m.message_type?.replace("_"," ")}
                </span>
              </div>
              <div style={{fontSize:11,color:MU}}>
                Sent to {m.recipient_count} famil{m.recipient_count!==1?"ies":"y"}
                {m.room_names&&` (${m.room_names})`}
              </div>
              <div style={{fontSize:10,color:MU,marginTop:3}}>{fmtDT(m.sent_at||m.created_at)}</div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ─── CHILD TIMELINE TAB ───────────────────────────────────────────────────────
function ChildTimelineTab() {
  const [children,setChildren]=useState([]);
  const [selChild,setSelChild]=useState(null);
  const [data,setData]=useState(null);
  const [filter,setFilter]=useState("all");

  useEffect(()=>{
    API("/api/children/simple").then(r=>setChildren(Array.isArray(r)?r:(r.children||r.data||[])));
  },[]);

  const loadTimeline=async(id)=>{
    setSelChild(id);
    try {
      const r=await API(`/api/bulk-comms/timeline/${id}`);
      setData(r);
    } catch(e) {
      console.error('API error:',e);
      window.showToast?.('Failed to load timeline','error');
    }
  };

  const TYPE_ICON={observation:"📝",story:"✨",health:"🤒",incident:"⚠️",milestone:"🌱",immunisation:"💉",excursion:"🚌",room_change:"🏠",enrolment:"🎉"};
  const TYPE_C={observation:IN,story:P,health:WA,incident:DA,milestone:OK,immunisation:"#0E7490",excursion:"#9333EA",room_change:"#6B7280",enrolment:P};

  const EVENT_TYPES=["all","observation","story","milestone","health","incident","immunisation","excursion"];
  const filtered=filter==="all"?data?.events:(data?.events||[]).filter(e=>e.type===filter);

  return (
    <div style={{display:"flex",gap:20}}>
      {/* Child list */}
      <div style={{width:220,flexShrink:0}}>
        <div style={{fontWeight:700,fontSize:11,color:MU,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Select Child</div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {children.map(c=>(
            <button key={c.id} onClick={()=>loadTimeline(c.id)}
              style={{padding:"10px 12px",borderRadius:10,border:`1px solid ${selChild===c.id?P:"#EDE8F4"}`,
                background:selChild===c.id?PL:"#fff",textAlign:"left",cursor:"pointer",fontSize:13}}>
              <div style={{fontWeight:selChild===c.id?700:400,color:DARK}}>{c.first_name} {c.last_name}</div>
              <div style={{fontSize:11,color:MU,marginTop:2}}>{c.room_name||c.age_group}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div style={{flex:1}}>
        {!selChild&&(
          <div style={{...card,textAlign:"center",padding:"60px 20px",color:MU}}>
            <div style={{fontSize:40}}>👶</div>
            <div style={{marginTop:12,fontWeight:600,color:DARK}}>Select a child to view their timeline</div>
            <p style={{fontSize:13,marginTop:8}}>A complete chronological history of observations, milestones, health events, and more.</p>
          </div>
        )}

        {selChild&&data&&(
          <>
            {/* Child header */}
            <div style={{...card,marginBottom:16,padding:"14px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:16,color:DARK}}>
                    {data.child?.first_name} {data.child?.last_name}
                  </div>
                  <div style={{fontSize:12,color:MU,marginTop:2}}>
                    {data.child?.room_name}
                    {data.child?.dob&&` · Born ${fmtD(data.child.dob)}`}
                    {data.stats?.days_enrolled>0&&` · ${data.stats.days_enrolled} days enrolled`}
                  </div>
                </div>
                <div style={{display:"flex",gap:10}}>
                  {[
                    ["Observations",data.stats?.total_observations,IN],
                    ["Milestones",data.stats?.milestones_achieved,OK],
                    ["Events",data.stats?.health_events,WA],
                  ].map(([l,v,c])=>(
                    <div key={l} style={{textAlign:"center",padding:"6px 12px",borderRadius:10,background:`${c}15`}}>
                      <div style={{fontSize:18,fontWeight:900,color:c}}>{v||0}</div>
                      <div style={{fontSize:10,color:MU}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Filter buttons */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
              {EVENT_TYPES.map(t=>(
                <button key={t} onClick={()=>setFilter(t)}
                  style={{padding:"5px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,
                    textTransform:"capitalize",
                    background:filter===t?(TYPE_C[t]||P):"#F0EBF8",
                    color:filter===t?"#fff":(TYPE_C[t]||P)}}>
                  {TYPE_ICON[t]||""} {t}
                </button>
              ))}
            </div>

            {/* Timeline events */}
            <div style={{position:"relative",paddingLeft:28}}>
              {/* Vertical line */}
              <div style={{position:"absolute",left:10,top:0,bottom:0,width:2,background:"#EDE8F4"}}/>

              {filtered?.length===0
                ? <div style={{...card,textAlign:"center",padding:"30px",color:MU}}>No {filter} events found</div>
                : filtered?.map((event,i)=>(
                  <div key={i} style={{position:"relative",marginBottom:16}}>
                    {/* Dot */}
                    <div style={{position:"absolute",left:-22,top:14,width:12,height:12,borderRadius:"50%",
                      background:event.color||P,border:"2px solid #fff",boxShadow:"0 0 0 2px "+event.color||P}}/>
                    <div style={{...card,padding:"12px 16px",borderLeft:`3px solid ${event.color||P}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <span style={{fontSize:18}}>{event.icon}</span>
                          <span style={{fontWeight:700,fontSize:13,color:DARK}}>{event.title}</span>
                        </div>
                        <div style={{fontSize:11,color:MU,flexShrink:0}}>{fmtD(event.date)}</div>
                      </div>
                      {event.detail&&<div style={{fontSize:12,color:MU,paddingLeft:26,lineHeight:1.5}}>{event.detail}</div>}
                    </div>
                  </div>
                ))
              }
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── ACTIVITY LOG TAB ─────────────────────────────────────────────────────────
function ActivityLogTab() {
  const [logs,setLogs]=useState([]);
  const [summary,setSummary]=useState([]);
  const [filter,setFilter]=useState("all");
  const [days,setDays]=useState(7);

  const load=useCallback(()=>{
    const from=new Date(Date.now()-days*86400000).toISOString().split("T")[0];
    const url=filter==="all"
      ? `/api/bulk-comms/activity?from=${from}&limit=200`
      : `/api/bulk-comms/activity?from=${from}&entity_type=${filter}&limit=200`;
    API(url).then(r=>{setLogs(r.logs||[]);setSummary(r.summary||[]);});
  },[filter,days]);
  useEffect(()=>{load();},[load]);

  const ACTION_COLORS={
    create:OK,update:IN,delete:DA,login:P,logout:MU,
    room_change:WA,approve:OK,reject:DA
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Summary chips */}
      {summary.length>0&&(
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {summary.map(s=>(
            <div key={s.entity_type} onClick={()=>setFilter(filter===s.entity_type?"all":s.entity_type)}
              style={{padding:"6px 14px",borderRadius:20,cursor:"pointer",fontSize:12,fontWeight:700,
                background:filter===s.entity_type?P:"#F0EBF8",color:filter===s.entity_type?"#fff":P}}>
              {s.entity_type}: {s.count}
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {[7,14,30].map(d=>(
          <button key={d} onClick={()=>setDays(d)}
            style={{padding:"5px 12px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              background:days===d?P:"#F0EBF8",color:days===d?"#fff":P}}>
            Last {d} days
          </button>
        ))}
        <div style={{fontSize:12,color:MU,marginLeft:"auto"}}>{logs.length} events</div>
      </div>

      {logs.length===0
        ? <div style={{...card,textAlign:"center",padding:"40px 20px",color:MU}}>
            <div style={{fontSize:36}}>📊</div>
            <div style={{marginTop:8}}>No activity recorded in this period</div>
          </div>
        : <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{background:"#F8F5FC"}}>
              {["Time","User","Action","Entity","Detail"].map(h=>(
                <th key={h} style={{padding:"8px 10px",textAlign:"left",color:MU,fontWeight:700,fontSize:11}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {logs.map(l=>(
                <tr key={l.id} style={{borderBottom:"1px solid #F0EBF8"}}>
                  <td style={{padding:"8px 10px",color:MU,fontSize:11,whiteSpace:"nowrap"}}>{fmtDT(l.performed_at)}</td>
                  <td style={{padding:"8px 10px",color:DARK,fontSize:12}}>{l.performed_by_name||"System"}</td>
                  <td style={{padding:"8px 10px"}}>
                    <span style={{fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:20,
                      background:(ACTION_COLORS[l.action]||MU)+"20",
                      color:ACTION_COLORS[l.action]||MU}}>
                      {l.action}
                    </span>
                  </td>
                  <td style={{padding:"8px 10px",color:MU,fontSize:12,textTransform:"capitalize"}}>{l.entity_type}</td>
                  <td style={{padding:"8px 10px",color:MU,fontSize:12,maxWidth:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={l.detail}>{l.detail||"—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
      }
    </div>
  );
}
