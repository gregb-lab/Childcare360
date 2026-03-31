/**
 * EngagementModule.jsx — v2.8.0
 * Four tabs:
 *   📅 Events        — centre events + RSVP management
 *   📢 Community     — family & staff community posts
 *   📄 Policies      — policy documents + acknowledgements
 *   ✅ Checklists    — custom checklist builder + daily completion
 */
import { useState, useEffect, useCallback } from "react";

const API = (path, opts={}) => {
  const t=localStorage.getItem("c360_token"), tid=localStorage.getItem("c360_tenant");
  return fetch(path,{headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})},
    method:opts.method||"GET",...(opts.body?{body:JSON.stringify(opts.body)}:{})}).then(r=>r.json());
};

const P="#7C3AED",PL="#EDE4F0",DARK="#3D3248",MUTED="#8A7F96";
const OK="#16A34A",WARN="#D97706",DANGER="#DC2626";
const card={background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"18px 22px"};
const btnP={padding:"9px 18px",borderRadius:9,border:"none",background:P,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13};
const btnS={padding:"9px 18px",borderRadius:9,border:`1px solid ${P}`,background:"#fff",color:P,fontWeight:600,cursor:"pointer",fontSize:13};
const btnG={padding:"9px 18px",borderRadius:9,border:"1px solid #DDD6EE",background:"#F8F5FC",color:MUTED,fontWeight:500,cursor:"pointer",fontSize:13};
const inp={padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:13,width:"100%",boxSizing:"border-box",fontFamily:"inherit"};
const lbl={fontSize:11,color:MUTED,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"};
const today=()=>new Date().toISOString().split("T")[0];
const fmtDate=d=>d?new Date(d+"T12:00").toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"}):"-";
const fmtTime=t=>t?t.slice(0,5):"-";

const EVENT_TYPES={general:"📢",excursion:"🚌",photo_day:"📸",incursion:"🎭",parent_meeting:"👨‍👩‍👧",fundraiser:"💰",celebration:"🎉",other:"📅"};
const EVENT_COLORS={general:P,excursion:"#0284C7",photo_day:"#7C3AED",incursion:"#D97706",parent_meeting:"#059669",fundraiser:"#DC2626",celebration:"#F59E0B",other:MUTED};

const TABS=[{id:"events",icon:"📅",label:"Events"},{id:"community",icon:"📢",label:"Community"},{id:"policies",icon:"📄",label:"Policies"},{id:"checklists",icon:"✅",label:"Checklists"}];

export default function EngagementModule() {
  const [tab,setTab]=useState("events");
  return (
    <div style={{padding:"24px 28px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
        <span style={{fontSize:28}}>🤝</span>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>Engagement & Communication</h1>
          <p style={{margin:"3px 0 0",fontSize:13,color:MUTED}}>Events, community posts, policy documents and daily checklists</p>
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:24,borderBottom:"1px solid #EDE8F4",paddingBottom:12}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"8px 16px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,
              fontWeight:tab===t.id?700:500,background:tab===t.id?P:"transparent",color:tab===t.id?"#fff":MUTED}}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab==="events"     && <EventsTab />}
      {tab==="community"  && <CommunityTab />}
      {tab==="policies"   && <PoliciesTab />}
      {tab==="checklists" && <ChecklistsTab />}
    </div>
  );
}

// ─── EVENTS + RSVP ───────────────────────────────────────────────────────────
function EventsTab() {
  const [events,setEvents]=useState([]);
  const [selected,setSelected]=useState(null);
  const [rsvps,setRsvps]=useState([]);
  const [showForm,setShowForm]=useState(false);
  const [view,setView]=useState("upcoming"); // upcoming | calendar | past
  const [form,setForm]=useState({title:"",description:"",event_type:"general",event_date:"",start_time:"",end_time:"",location:"",rsvp_required:false,rsvp_deadline:"",max_attendees:""});

  const load=useCallback(()=>{
    const params=view==="past"
      ? `to=${today()}`
      : `upcoming=1`;
    API(`/api/engagement/events?${params}`).then(r=>setEvents(r.events||[]));
  },[view]);
  useEffect(()=>{load();},[load]);

  const loadDetail=async(id)=>{
    const r=await API(`/api/engagement/events/${id}`.catch(e=>console.error('API error:',e)));
    setSelected(r.event);
    setRsvps(r.rsvps||[]);
  };

  const save=async()=>{
    if(!form.title||!form.event_date)return;
    await API("/api/engagement/events",{method:"POST",body:{...form,rsvp_required:form.rsvp_required?1:0,max_attendees:form.max_attendees?parseInt(form.max_attendees):null}}.catch(e=>console.error('API error:',e)));
    setShowForm(false);
    setForm({title:"",description:"",event_type:"general",event_date:"",start_time:"",end_time:"",location:"",rsvp_required:false,rsvp_deadline:"",max_attendees:""});
    load();
  };

  const del=async(id)=>{
    if(!confirm("Delete this event?"))return;
    await API(`/api/engagement/events/${id}`,{method:"DELETE"}.catch(e=>console.error('API error:',e)));
    setSelected(null);load();
  };

  // Group events by month
  const byMonth={};
  events.forEach(e=>{
    const m=e.event_date?.slice(0,7)||"";
    (byMonth[m]=byMonth[m]||[]).push(e);
  });

  return (
    <div style={{display:"flex",gap:20}}>
      {/* Left: event list */}
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{display:"flex",gap:4}}>
            {["upcoming","past"].map(v=>(
              <button key={v} onClick={()=>setView(v)}
                style={{padding:"6px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
                  background:view===v?P:"#F0EBF8",color:view===v?"#fff":P,textTransform:"capitalize"}}>
                {v}
              </button>
            ))}
          </div>
          <button style={{...btnP,marginLeft:"auto",fontSize:12,padding:"7px 14px"}} onClick={()=>setShowForm(v=>!v)}>
            {showForm?"Cancel":"+ New Event"}
          </button>
        </div>

        {showForm&&(
          <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
            <div style={{fontWeight:700,fontSize:14,color:P,marginBottom:14}}>New Event</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{gridColumn:"span 2"}}>
                <label style={lbl}>Title *</label>
                <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} style={inp} placeholder="e.g. Parent Information Night"/>
              </div>
              <div>
                <label style={lbl}>Event Type</label>
                <select value={form.event_type} onChange={e=>setForm(p=>({...p,event_type:e.target.value}))} style={inp}>
                  {Object.keys(EVENT_TYPES).map(t=><option key={t} value={t}>{EVENT_TYPES[t]} {t.replace("_"," ")}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Date *</label>
                <input type="date" value={form.event_date} onChange={e=>setForm(p=>({...p,event_date:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={lbl}>Start Time</label>
                <input type="time" value={form.start_time} onChange={e=>setForm(p=>({...p,start_time:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={lbl}>End Time</label>
                <input type="time" value={form.end_time} onChange={e=>setForm(p=>({...p,end_time:e.target.value}))} style={inp}/>
              </div>
              <div style={{gridColumn:"span 2"}}>
                <label style={lbl}>Location</label>
                <input value={form.location} onChange={e=>setForm(p=>({...p,location:e.target.value}))} style={inp} placeholder="e.g. Centre Hall, Zoom"/>
              </div>
              <div style={{gridColumn:"span 2"}}>
                <label style={lbl}>Description</label>
                <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2} style={{...inp,resize:"vertical"}}/>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <input type="checkbox" checked={form.rsvp_required} onChange={e=>setForm(p=>({...p,rsvp_required:e.target.checked}))} id="rsvp"/>
                <label htmlFor="rsvp" style={{fontSize:13,cursor:"pointer"}}>RSVP required</label>
              </div>
              {form.rsvp_required&&<>
                <div>
                  <label style={lbl}>RSVP Deadline</label>
                  <input type="date" value={form.rsvp_deadline} onChange={e=>setForm(p=>({...p,rsvp_deadline:e.target.value}))} style={inp}/>
                </div>
                <div>
                  <label style={lbl}>Max Attendees</label>
                  <input type="number" value={form.max_attendees} onChange={e=>setForm(p=>({...p,max_attendees:e.target.value}))} style={inp}/>
                </div>
              </>}
            </div>
            <div style={{display:"flex",gap:8,marginTop:14}}>
              <button style={btnP} onClick={save}>Save Event</button>
              <button style={btnS} onClick={()=>setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        {events.length===0
          ? <div style={{...card,textAlign:"center",padding:"40px 20px",color:MUTED}}><div style={{fontSize:36}}>📅</div><div style={{marginTop:8}}>No {view} events</div></div>
          : Object.entries(byMonth).map(([month,evts])=>(
            <div key={month}>
              <div style={{fontSize:11,fontWeight:700,color:MUTED,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em"}}>
                {month?new Date(month+"-01T12:00").toLocaleDateString("en-AU",{month:"long",year:"numeric"}):""}
              </div>
              {evts.map(e=>(
                <div key={e.id} onClick={()=>loadDetail(e.id)} style={{...card,cursor:"pointer",marginBottom:8,
                  borderLeft:`4px solid ${EVENT_COLORS[e.event_type]||P}`,
                  background:selected?.id===e.id?"#F8F5FC":"#fff"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <span style={{fontSize:18}}>{EVENT_TYPES[e.event_type]||"📅"}</span>
                        <span style={{fontWeight:700,fontSize:14,color:DARK}}>{e.title}</span>
                        {e.rsvp_required&&<span style={{fontSize:11,padding:"2px 7px",borderRadius:20,background:PL,color:P,fontWeight:700}}>RSVP</span>}
                      </div>
                      <div style={{fontSize:12,color:MUTED}}>
                        {fmtDate(e.event_date)}{e.start_time&&` · ${fmtTime(e.start_time)}`}{e.end_time&&`–${fmtTime(e.end_time)}`}
                        {e.location&&` · 📍${e.location}`}
                      </div>
                    </div>
                    {e.rsvp_count>0&&(
                      <div style={{textAlign:"right",fontSize:12}}>
                        <div style={{fontWeight:700,color:P}}>{e.attending_count}</div>
                        <div style={{color:MUTED}}>attending</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        }
      </div>

      {/* Right: event detail */}
      {selected&&(
        <div style={{width:340,flexShrink:0,display:"flex",flexDirection:"column",gap:12}}>
          <div style={{...card}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div style={{fontSize:28}}>{EVENT_TYPES[selected.event_type]||"📅"}</div>
              <button onClick={()=>del(selected.id)} style={{...btnG,padding:"5px 10px",fontSize:11}}>Delete</button>
            </div>
            <div style={{fontWeight:700,fontSize:16,color:DARK,marginBottom:6}}>{selected.title}</div>
            <div style={{fontSize:13,color:MUTED,marginBottom:10}}>
              <div>{fmtDate(selected.event_date)}{selected.start_time&&` · ${fmtTime(selected.start_time)}`}{selected.end_time&&`–${fmtTime(selected.end_time)}`}</div>
              {selected.location&&<div>📍 {selected.location}</div>}
            </div>
            {selected.description&&<div style={{fontSize:13,color:DARK,marginBottom:12,padding:"10px",background:"#F8F5FC",borderRadius:8}}>{selected.description}</div>}
            {selected.rsvp_required&&(
              <div style={{padding:"10px 12px",background:"#F0F9FF",borderRadius:8,fontSize:12}}>
                <div style={{fontWeight:700,color:"#0284C7",marginBottom:2}}>RSVP Required</div>
                {selected.rsvp_deadline&&<div style={{color:MUTED}}>Deadline: {fmtDate(selected.rsvp_deadline)}</div>}
                {selected.max_attendees&&<div style={{color:MUTED}}>Max: {selected.max_attendees} attendees</div>}
              </div>
            )}
          </div>

          {rsvps.length>0&&(
            <div style={{...card}}>
              <div style={{fontWeight:700,fontSize:13,color:DARK,marginBottom:12}}>RSVPs ({rsvps.length})</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {rsvps.map(r=>(
                  <div key={r.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 0",borderBottom:"1px solid #F0EBF8"}}>
                    <span style={{color:DARK}}>{r.child_first} {r.child_last}</span>
                    <span style={{color:r.status==="attending"?OK:MUTED,fontWeight:600}}>{r.status} ({r.guest_count})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── COMMUNITY POSTS ─────────────────────────────────────────────────────────
function CommunityTab() {
  const [posts,setPosts]=useState([]);
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({title:"",body:"",author_name:"",author_type:"educator",visibility:"centre"});
  const [comments,setComments]=useState({});
  const [commentInput,setCommentInput]=useState({});
  const [reactions,setReactions]=useState({});

  const load=useCallback(()=>{
    API("/api/engagement/posts").then(r=>setPosts(r.posts||[]));
  },[]);
  useEffect(()=>{load();},[load]);

  const submit=async()=>{
    if(!form.body)return;
    await API("/api/engagement/posts",{method:"POST",body:{...form,author_user_id:"admin"}}.catch(e=>console.error('API error:',e)));
    setForm({title:"",body:"",author_name:"",author_type:"educator",visibility:"centre"});
    setShowForm(false);load();
  };

  const del=async(id)=>{
    await API(`/api/engagement/posts/${id}`,{method:"DELETE"}).catch(e=>console.error('API error:',e));load();
  };

  const pin=async(id,pinned)=>{
    await API(`/api/engagement/posts/${id}/pin`,{method:"PUT",body:{pinned:!pinned}}).catch(e=>console.error('API error:',e));load();
  };

  const loadComments=async(id)=>{
    const r=await API(`/api/engagement/comments/${id}`.catch(e=>console.error('API error:',e)));
    setComments(p=>({...p,[id]:r.comments||[]}));
  };

  const addComment=async(postId)=>{
    const body=commentInput[postId];
    if(!body)return;
    await API("/api/engagement/comments",{method:"POST",body:{story_id:postId,story_type:"community",body,author_name:"Admin",author_type:"educator",author_user_id:"admin"}}.catch(e=>console.error('API error:',e)));
    setCommentInput(p=>({...p,[postId]:""}));
    loadComments(postId);
    load();
  };

  const react=async(postId)=>{
    const r=await API("/api/engagement/reactions",{method:"POST",body:{story_id:postId,story_type:"community",user_id:"admin",reaction:"heart"}}.catch(e=>console.error('API error:',e)));
    setReactions(p=>({...p,[postId]:r.counts||[]}));
    load();
  };

  const REACTION_ICONS={"heart":"❤️","star":"⭐","clap":"👏","wow":"😮"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:13,color:MUTED}}>Share updates from home or centre news with families</div>
        <button style={btnP} onClick={()=>setShowForm(v=>!v)}>{showForm?"Cancel":"+ New Post"}</button>
      </div>

      {showForm&&(
        <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
          <div style={{fontWeight:700,fontSize:14,color:P,marginBottom:14}}>New Community Post</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div>
              <label style={lbl}>Your Name</label>
              <input value={form.author_name} onChange={e=>setForm(p=>({...p,author_name:e.target.value}))} style={inp} placeholder="e.g. Sarah (Room 2 educator)"/>
            </div>
            <div>
              <label style={lbl}>Visibility</label>
              <select value={form.visibility} onChange={e=>setForm(p=>({...p,visibility:e.target.value}))} style={inp}>
                <option value="centre">Whole centre</option>
                <option value="staff">Staff only</option>
              </select>
            </div>
          </div>
          <div style={{marginBottom:10}}>
            <label style={lbl}>Title (optional)</label>
            <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} style={inp} placeholder="Add a headline…"/>
          </div>
          <div style={{marginBottom:14}}>
            <label style={lbl}>Post *</label>
            <textarea value={form.body} onChange={e=>setForm(p=>({...p,body:e.target.value}))} rows={4} style={{...inp,resize:"vertical"}} placeholder="Share an update, milestone, or news…"/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button style={btnP} onClick={submit}>Post</button>
            <button style={btnS} onClick={()=>setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {posts.length===0
        ? <div style={{...card,textAlign:"center",padding:"40px 20px",color:MUTED}}><div style={{fontSize:36}}>📢</div><div style={{marginTop:8}}>No posts yet</div></div>
        : posts.map(post=>{
          const postComments=comments[post.id];
          return (
            <div key={post.id} style={{...card,border:`1px solid ${post.pinned?"#C4B5FD":"#EDE8F4"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:post.author_type==="parent"?"#EFF6FF":"#F3E8FF",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>
                    {post.author_type==="parent"?"👨‍👩‍👧":"👩‍🏫"}
                  </div>
                  <div>
                    <div style={{fontWeight:700,fontSize:13,color:DARK}}>{post.author_name||"Centre"}</div>
                    <div style={{fontSize:11,color:MUTED}}>{post.author_type} · {new Date(post.created_at).toLocaleDateString("en-AU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                  </div>
                  {post.pinned&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:20,background:"#F3E8FF",color:P,fontWeight:700}}>📌 PINNED</span>}
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>pin(post.id,post.pinned)} style={{...btnG,padding:"4px 10px",fontSize:11}}>{post.pinned?"Unpin":"Pin"}</button>
                  <button onClick={()=>del(post.id)} style={{...btnG,padding:"4px 10px",fontSize:11,color:DANGER}}>Delete</button>
                </div>
              </div>

              {post.title&&<div style={{fontWeight:700,fontSize:15,color:DARK,marginBottom:6}}>{post.title}</div>}
              <div style={{fontSize:14,color:DARK,lineHeight:1.6,marginBottom:14}}>{post.body}</div>

              {/* Reactions */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <button onClick={()=>react(post.id)}
                  style={{padding:"5px 12px",borderRadius:20,border:"1px solid #EDE8F4",background:"#F8F5FC",cursor:"pointer",fontSize:13}}>
                  ❤️ {post.reaction_count||0}
                </button>
                <button onClick={()=>postComments!==undefined?setComments(p=>({...p,[post.id]:undefined})):loadComments(post.id)}
                  style={{padding:"5px 12px",borderRadius:20,border:"1px solid #EDE8F4",background:"#F8F5FC",cursor:"pointer",fontSize:12,color:MUTED}}>
                  💬 {post.comment_count||0} comments
                </button>
              </div>

              {/* Comments */}
              {postComments!==undefined&&(
                <div style={{borderTop:"1px solid #F0EBF8",paddingTop:12}}>
                  {postComments.map(c=>(
                    <div key={c.id} style={{display:"flex",gap:8,marginBottom:10}}>
                      <div style={{width:28,height:28,borderRadius:"50%",background:"#F0EBF8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>
                        {c.author_type==="parent"?"👨":"👩"}
                      </div>
                      <div style={{flex:1,background:"#F8F5FC",borderRadius:8,padding:"8px 12px"}}>
                        <div style={{fontSize:11,fontWeight:700,color:P,marginBottom:2}}>{c.author_name||"Educator"}</div>
                        <div style={{fontSize:13,color:DARK}}>{c.body}</div>
                      </div>
                    </div>
                  ))}
                  <div style={{display:"flex",gap:8,marginTop:8}}>
                    <input value={commentInput[post.id]||""} onChange={e=>setCommentInput(p=>({...p,[post.id]:e.target.value}))}
                      placeholder="Add a comment…" style={{...inp,flex:1}}
                      onKeyDown={e=>e.key==="Enter"&&addComment(post.id)}/>
                    <button onClick={()=>addComment(post.id)} style={{...btnP,padding:"8px 16px",fontSize:12}}>Post</button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      }
    </div>
  );
}

// ─── POLICY DOCUMENTS ────────────────────────────────────────────────────────
function PoliciesTab() {
  const [docs,setDocs]=useState([]);
  const [selected,setSelected]=useState(null);
  const [ackData,setAckData]=useState(null);
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({title:"",category:"policy",description:"",file_url:"",version:"1.0",requires_acknowledgement:true,visible_to_parents:false});

  const CATEGORIES=["policy","procedure","guideline","form","emergency","staff_handbook","other"];

  const load=useCallback(()=>{
    API("/api/engagement/policies").then(r=>setDocs(r.documents||[]));
  },[]);
  useEffect(()=>{load();},[load]);

  const loadAcks=async(id)=>{
    const r=await API(`/api/engagement/policies/${id}/acknowledgements`.catch(e=>console.error('API error:',e)));
    setAckData(r);
  };

  const save=async()=>{
    if(!form.title)return;
    await API("/api/engagement/policies",{method:"POST",body:{...form,requires_acknowledgement:form.requires_acknowledgement?1:0,visible_to_parents:form.visible_to_parents?1:0}}.catch(e=>console.error('API error:',e)));
    setShowForm(false);
    setForm({title:"",category:"policy",description:"",file_url:"",version:"1.0",requires_acknowledgement:true,visible_to_parents:false});
    load();
  };

  const archive=async(id)=>{
    await API(`/api/engagement/policies/${id}`,{method:"PUT",body:{status:"archived"}}).catch(e=>console.error('API error:',e));load();
  };

  const byCategory={};
  docs.forEach(d=>{(byCategory[d.category]=byCategory[d.category]||[]).push(d);});

  return (
    <div style={{display:"flex",gap:20}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:13,color:MUTED}}>Upload and manage centre policy documents. Track staff acknowledgements.</div>
          <button style={btnP} onClick={()=>setShowForm(v=>!v)}>{showForm?"Cancel":"+ Add Document"}</button>
        </div>

        {showForm&&(
          <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
            <div style={{fontWeight:700,fontSize:14,color:P,marginBottom:14}}>Add Policy Document</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{gridColumn:"span 2"}}>
                <label style={lbl}>Document Title *</label>
                <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} style={inp} placeholder="e.g. Child Safe Policy 2025"/>
              </div>
              <div>
                <label style={lbl}>Category</label>
                <select value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))} style={inp}>
                  {CATEGORIES.map(c=><option key={c} value={c}>{c.replace("_"," ")}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Version</label>
                <input value={form.version} onChange={e=>setForm(p=>({...p,version:e.target.value}))} style={inp} placeholder="1.0"/>
              </div>
              <div style={{gridColumn:"span 2"}}>
                <label style={lbl}>Document URL / Link</label>
                <input value={form.file_url} onChange={e=>setForm(p=>({...p,file_url:e.target.value}))} style={inp} placeholder="https://… or drive link"/>
              </div>
              <div style={{gridColumn:"span 2"}}>
                <label style={lbl}>Description</label>
                <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2} style={{...inp,resize:"vertical"}}/>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <input type="checkbox" id="req_ack" checked={form.requires_acknowledgement} onChange={e=>setForm(p=>({...p,requires_acknowledgement:e.target.checked}))}/>
                <label htmlFor="req_ack" style={{fontSize:13,cursor:"pointer"}}>Require staff acknowledgement</label>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <input type="checkbox" id="vis_par" checked={form.visible_to_parents} onChange={e=>setForm(p=>({...p,visible_to_parents:e.target.checked}))}/>
                <label htmlFor="vis_par" style={{fontSize:13,cursor:"pointer"}}>Visible to parents</label>
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:14}}>
              <button style={btnP} onClick={save}>Save</button>
              <button style={btnS} onClick={()=>setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        {docs.length===0
          ? <div style={{...card,textAlign:"center",padding:"40px 20px",color:MUTED}}><div style={{fontSize:36}}>📄</div><div style={{marginTop:8}}>No documents yet</div></div>
          : Object.entries(byCategory).map(([cat,catDocs])=>(
            <div key={cat}>
              <div style={{fontSize:11,fontWeight:700,color:MUTED,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em"}}>{cat.replace("_"," ")}</div>
              {catDocs.map(d=>(
                <div key={d.id} style={{...card,marginBottom:8,cursor:"pointer",border:`1px solid ${selected?.id===d.id?P+"60":"#EDE8F4"}`}}
                  onClick={()=>{setSelected(d);loadAcks(d.id);}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:4}}>📄 {d.title}</div>
                      <div style={{fontSize:11,color:MUTED}}>
                        v{d.version}
                        {d.requires_acknowledgement&&<span style={{marginLeft:8,color:P}}>· Requires sign-off</span>}
                        {d.visible_to_parents&&<span style={{marginLeft:8,color:OK}}>· Visible to parents</span>}
                        <span style={{marginLeft:8}}>· {d.ack_count} acknowledged</span>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      {d.file_url&&<a href={d.file_url} target="_blank" rel="noreferrer"
                        style={{...btnS,fontSize:11,padding:"4px 10px",textDecoration:"none"}} onClick={e=>e.stopPropagation()}>
                        Open ↗
                      </a>}
                      <button onClick={e=>{e.stopPropagation();archive(d.id);}}
                        style={{...btnG,padding:"4px 10px",fontSize:11}}>Archive</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        }
      </div>

      {selected&&ackData&&(
        <div style={{width:320,flexShrink:0,display:"flex",flexDirection:"column",gap:12}}>
          <div style={{...card}}>
            <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:12}}>{selected.title}</div>
            <div style={{display:"flex",gap:10,marginBottom:12}}>
              <div style={{flex:1,textAlign:"center",background:"#F0FDF4",borderRadius:8,padding:"10px 0"}}>
                <div style={{fontSize:22,fontWeight:900,color:OK}}>{ackData.acknowledged?.length||0}</div>
                <div style={{fontSize:11,color:MUTED}}>Acknowledged</div>
              </div>
              <div style={{flex:1,textAlign:"center",background:"#FEF2F2",borderRadius:8,padding:"10px 0"}}>
                <div style={{fontSize:22,fontWeight:900,color:DANGER}}>{ackData.pending?.length||0}</div>
                <div style={{fontSize:11,color:MUTED}}>Pending</div>
              </div>
            </div>

            {ackData.pending?.length>0&&(
              <>
                <div style={{fontSize:11,fontWeight:700,color:DANGER,marginBottom:6}}>STILL TO SIGN</div>
                {ackData.pending.map(e=>(
                  <div key={e.id} style={{fontSize:13,padding:"5px 0",borderBottom:"1px solid #F0EBF8",color:DARK}}>
                    {e.first_name} {e.last_name}
                  </div>
                ))}
              </>
            )}

            {ackData.acknowledged?.length>0&&(
              <>
                <div style={{fontSize:11,fontWeight:700,color:OK,marginBottom:6,marginTop:10}}>ACKNOWLEDGED</div>
                {ackData.acknowledged.slice(0,5).map(a=>(
                  <div key={a.id} style={{fontSize:12,padding:"4px 0",color:MUTED}}>
                    ✓ {a.first_name} {a.last_name} — {new Date(a.acknowledged_at).toLocaleDateString("en-AU")}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CHECKLISTS ───────────────────────────────────────────────────────────────
function ChecklistsTab() {
  const [templates,setTemplates]=useState([]);
  const [status,setStatus]=useState(null);
  const [active,setActive]=useState(null); // template being completed
  const [responses,setResponses]=useState({});
  const [showBuilder,setShowBuilder]=useState(false);
  const [form,setForm]=useState({title:"",category:"daily",frequency:"daily",description:"",assign_to_role:"educator",items:[]});
  const [newItem,setNewItem]=useState("");

  const load=useCallback(()=>{
    Promise.all([
      API("/api/engagement/checklists"),
      API("/api/engagement/checklists/status/today"),
    ]).then(([tr,sr])=>{
      setTemplates(tr.templates||[]);
      setStatus(sr);
    });
  },[]);
  useEffect(()=>{load();},[load]);

  const addItem=()=>{
    if(!newItem.trim())return;
    setForm(p=>({...p,items:[...p.items,{id:Date.now().toString(),label:newItem.trim(),type:"checkbox"}]}));
    setNewItem("");
  };

  const removeItem=(id)=>setForm(p=>({...p,items:p.items.filter(i=>i.id!==id)}));

  const saveTemplate=async()=>{
    if(!form.title||!form.items.length)return;
    await API("/api/engagement/checklists",{method:"POST",body:{...form,created_by:"Admin"}}.catch(e=>console.error('API error:',e)));
    setShowBuilder(false);
    setForm({title:"",category:"daily",frequency:"daily",description:"",assign_to_role:"educator",items:[]});
    load();
  };

  const startComplete=(template)=>{
    setActive(template);
    const init={};
    template.items.forEach(i=>{init[i.id]=false;});
    setResponses(init);
  };

  const submitComplete=async()=>{
    const r=active.items.map(i=>({item_id:i.id,label:i.label,checked:!!responses[i.id]}));
    await API(`/api/engagement/checklists/${active.id}/complete`,{method:"POST",body:{responses:r,completed_by:"Admin",date:today()}}.catch(e=>console.error('API error:',e)));
    setActive(null);setResponses({});load();
  };

  const del=async(id)=>{
    await API(`/api/engagement/checklists/${id}`,{method:"DELETE"}).catch(e=>console.error('API error:',e));load();
  };

  const CATEGORIES=["daily","opening","closing","safety","cleaning","admin","other"];
  const catIcon={daily:"☀️",opening:"🔓",closing:"🔒",safety:"🛡️",cleaning:"🧹",admin:"📋",other:"✅"};

  if(active){
    return (
      <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:600}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>setActive(null)} style={{...btnG,padding:"6px 12px",fontSize:12}}>← Back</button>
          <div style={{fontWeight:700,fontSize:16,color:DARK}}>{active.title}</div>
        </div>
        <div style={{...card}}>
          {active.items.map((item,i)=>(
            <div key={item.id} onClick={()=>setResponses(p=>({...p,[item.id]:!p[item.id]}))}
              style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:"1px solid #F0EBF8",cursor:"pointer",
                opacity:responses[item.id]?0.6:1}}>
              <div style={{width:24,height:24,borderRadius:6,border:`2px solid ${responses[item.id]?OK:"#DDD6EE"}`,
                background:responses[item.id]?OK:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {responses[item.id]&&<span style={{color:"#fff",fontSize:14}}>✓</span>}
              </div>
              <span style={{fontSize:14,color:DARK,textDecoration:responses[item.id]?"line-through":"none"}}>{item.label}</span>
            </div>
          ))}
          <div style={{marginTop:14,display:"flex",gap:8}}>
            <button style={btnP} onClick={submitComplete}>
              ✓ Complete ({Object.values(responses).filter(Boolean).length}/{active.items.length} done)
            </button>
            <button style={btnS} onClick={()=>setActive(null)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Today's summary */}
      {status&&(
        <div style={{display:"flex",gap:12}}>
          <div style={{...card,flex:1,textAlign:"center",borderTop:`3px solid ${OK}`}}>
            <div style={{fontSize:28,fontWeight:900,color:OK}}>{status.done_count}</div>
            <div style={{fontSize:12,color:MUTED}}>Completed today</div>
          </div>
          <div style={{...card,flex:1,textAlign:"center",borderTop:`3px solid ${status.pending_count>0?WARN:OK}`}}>
            <div style={{fontSize:28,fontWeight:900,color:status.pending_count>0?WARN:OK}}>{status.pending_count}</div>
            <div style={{fontSize:12,color:MUTED}}>Still to do</div>
          </div>
        </div>
      )}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:13,color:MUTED}}>Build custom checklists and assign to staff</div>
        <button style={btnP} onClick={()=>setShowBuilder(v=>!v)}>{showBuilder?"Cancel":"+ Build Checklist"}</button>
      </div>

      {showBuilder&&(
        <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
          <div style={{fontWeight:700,fontSize:14,color:P,marginBottom:14}}>New Checklist</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div style={{gridColumn:"span 2"}}>
              <label style={lbl}>Title *</label>
              <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} style={inp} placeholder="e.g. Morning Opening Checklist"/>
            </div>
            <div>
              <label style={lbl}>Category</label>
              <select value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))} style={inp}>
                {CATEGORIES.map(c=><option key={c} value={c}>{catIcon[c]} {c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Frequency</label>
              <select value={form.frequency} onChange={e=>setForm(p=>({...p,frequency:e.target.value}))} style={inp}>
                {["daily","weekly","monthly","as_needed"].map(f=><option key={f} value={f}>{f.replace("_"," ")}</option>)}
              </select>
            </div>
          </div>

          <div style={{fontWeight:600,fontSize:13,color:DARK,marginBottom:8}}>Checklist Items</div>
          {form.items.map((item,i)=>(
            <div key={item.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,padding:"8px 12px",background:"#fff",borderRadius:8,border:"1px solid #EDE8F4"}}>
              <span style={{fontSize:11,color:MUTED,minWidth:20}}>{i+1}.</span>
              <span style={{flex:1,fontSize:13}}>{item.label}</span>
              <button onClick={()=>removeItem(item.id)} style={{background:"none",border:"none",cursor:"pointer",color:DANGER,fontSize:16}}>×</button>
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <input value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="Add checklist item…"
              style={{...inp,flex:1}} onKeyDown={e=>e.key==="Enter"&&addItem()}/>
            <button onClick={addItem} style={{...btnS,padding:"8px 14px",fontSize:12}}>Add Item</button>
          </div>
          <div style={{display:"flex",gap:8,marginTop:14}}>
            <button style={btnP} onClick={saveTemplate} disabled={!form.title||!form.items.length}>Save Checklist</button>
            <button style={btnS} onClick={()=>setShowBuilder(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
        {templates.length===0
          ? <div style={{...card,textAlign:"center",padding:"40px 20px",color:MUTED,gridColumn:"span 2"}}><div style={{fontSize:36}}>✅</div><div style={{marginTop:8}}>No checklists yet</div></div>
          : templates.map(t=>{
            const todayDone=status?.status?.find(s=>s.id===t.id)?.completed;
            return (
              <div key={t.id} style={{...card,borderTop:`3px solid ${todayDone?OK:t.frequency==="daily"?WARN:P}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:DARK}}>{catIcon[t.category]||"✅"} {t.title}</div>
                    <div style={{fontSize:11,color:MUTED,marginTop:2}}>{t.frequency} · {t.items.length} items · {t.assign_to_role}</div>
                  </div>
                  {todayDone
                    ? <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:20,background:"#F0FDF4",color:OK}}>✓ Done</span>
                    : <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:20,background:"#FFFBEB",color:WARN}}>Pending</span>
                  }
                </div>
                <div style={{fontSize:12,color:MUTED,marginBottom:12}}>
                  {t.items.slice(0,3).map(i=>i.label).join(" · ")}{t.items.length>3&&` +${t.items.length-3} more`}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>startComplete(t)} style={{...btnP,flex:1,fontSize:12,padding:"7px 0"}}>
                    {todayDone?"Complete Again":"Complete Now"}
                  </button>
                  <button onClick={()=>del(t.id)} style={{...btnG,padding:"7px 12px",fontSize:12}}>Archive</button>
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}
