/**
 * CRMModule.jsx — v2.7.0
 * Enquiry pipeline, tour booking calendar, follow-up dashboard
 */
import { useState, useEffect, useCallback } from "react";

const API = (path, opts={}) => {
  const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
  return fetch(path,{headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})},method:opts.method||"GET",...(opts.body?{body:JSON.stringify(opts.body)}:{})}).then(r=>r.json());
};

const P="#7C3AED",PL="#EDE4F0",DARK="#3D3248",MUTED="#8A7F96";
const OK="#16A34A",WARN="#D97706",DANGER="#DC2626";
const card={background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"18px 22px"};
const btnP={padding:"9px 18px",borderRadius:9,border:"none",background:P,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13};
const btnS={padding:"9px 18px",borderRadius:9,border:`1px solid ${P}`,background:"#fff",color:P,fontWeight:600,cursor:"pointer",fontSize:13};
const inp={padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:13,width:"100%",boxSizing:"border-box",fontFamily:"inherit"};
const lbl={fontSize:11,color:MUTED,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"};

const fmtDate=d=>d?new Date(d+"T12:00").toLocaleDateString("en-AU",{day:"numeric",month:"short"}):"-";
const today=()=>new Date().toISOString().split("T")[0];

const STATUS_FLOW = ["new","contacted","tour_booked","waitlisted","enrolled","lost"];
const STATUS_COLOR = {new:"#7C3AED",contacted:"#2563EB",tour_booked:"#D97706",waitlisted:"#EA580C",enrolled:"#16A34A",lost:"#6B7280"};
const STATUS_BG    = {new:"#F3E8FF",contacted:"#EFF6FF",tour_booked:"#FFFBEB",waitlisted:"#FFF7ED",enrolled:"#F0FDF4",lost:"#F9FAFB"};

const TABS = [{id:"pipeline",label:"📊 Pipeline"},{id:"enquiries",label:"📋 Enquiries"},{id:"tours",label:"🗓 Tours"},{id:"followups",label:"⏰ Follow-ups"}];

export default function CRMModule() {
  const [tab, setTab] = useState("pipeline");
  return (
    <div style={{padding:"24px 28px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
        <span style={{fontSize:28}}>🎯</span>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>Enquiries & CRM</h1>
          <p style={{margin:"3px 0 0",fontSize:13,color:MUTED}}>Manage enquiries, book tours, and nurture families from first contact to enrolment</p>
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:24,borderBottom:"1px solid #EDE8F4",paddingBottom:12}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"8px 16px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,fontWeight:tab===t.id?700:500,
              background:tab===t.id?P:"transparent",color:tab===t.id?"#fff":MUTED}}>
            {t.label}
          </button>
        ))}
      </div>
      {tab==="pipeline" && <PipelineView />}
      {tab==="enquiries" && <EnquiriesView />}
      {tab==="tours" && <ToursView />}
      {tab==="followups" && <FollowUpsView />}
    </div>
  );
}

function PipelineView() {
  const [data, setData] = useState(null);
  useEffect(()=>{API("/api/crm/dashboard").then(setData).catch(()=>{});},[]);
  if (!data) return <div style={{color:MUTED,padding:40,textAlign:"center"}}>Loading…</div>;

  const pipeline = STATUS_FLOW.filter(s=>s!=="lost").map(s=>({
    status:s, count:data.pipeline?.find(p=>p.status===s)?.n||0
  }));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      {/* Pipeline funnel */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
        {pipeline.map((s,i)=>(
          <div key={s.status} style={{...card,textAlign:"center",borderTop:`3px solid ${STATUS_COLOR[s.status]}`}}>
            <div style={{fontSize:28,fontWeight:900,color:STATUS_COLOR[s.status]}}>{s.count}</div>
            <div style={{fontSize:12,color:MUTED,marginTop:4,textTransform:"capitalize"}}>{s.status.replace("_"," ")}</div>
            {i>0&&<div style={{fontSize:10,color:MUTED,marginTop:2}}>
              {pipeline[0].count>0?Math.round(s.count/pipeline[0].count*100):0}% conversion
            </div>}
          </div>
        ))}
      </div>

      {/* 30-day trend */}
      {data.monthlyConversions?.length>0 && (
        <div style={card}>
          <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:14}}>6-Month Conversion Trend</div>
          <div style={{display:"flex",gap:12,alignItems:"flex-end",height:80}}>
            {data.monthlyConversions.map(m=>{
              const h=m.enquiries>0?Math.round(m.enquiries/Math.max(...data.monthlyConversions.map(x=>x.enquiries))*70):0;
              return (
                <div key={m.month} style={{flex:1,textAlign:"center"}}>
                  <div style={{position:"relative",height:70,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
                    <div style={{background:PL,borderRadius:"4px 4px 0 0",height:h+"px",position:"relative"}}>
                      {m.enrolled>0&&<div style={{position:"absolute",bottom:0,left:0,right:0,background:P,borderRadius:"4px 4px 0 0",height:Math.round(m.enrolled/m.enquiries*h)+"px"}}/>}
                    </div>
                  </div>
                  <div style={{fontSize:10,color:MUTED,marginTop:3}}>{m.month?.slice(5)}</div>
                  <div style={{fontSize:11,fontWeight:700,color:DARK}}>{m.enquiries}</div>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",gap:16,marginTop:8,fontSize:11}}>
            <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:2,background:PL,display:"inline-block"}}/> Enquiries</span>
            <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:2,background:P,display:"inline-block"}}/> Enrolled</span>
          </div>
        </div>
      )}

      {/* Upcoming tours */}
      {data.upcomingTours?.length>0&&(
        <div style={card}>
          <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:14}}>Upcoming Tours</div>
          {data.upcomingTours.map(t=>(
            <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #F0EBF8"}}>
              <div>
                <div style={{fontWeight:600,fontSize:13}}>{t.family_name}</div>
                <div style={{fontSize:11,color:MUTED}}>{t.child_name?`Child: ${t.child_name} · `:""}{t.family_email}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:13,fontWeight:700,color:P}}>{fmtDate(t.booked_date)}</div>
                <div style={{fontSize:11,color:MUTED}}>{t.booked_time?.slice(0,5)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EnquiriesView() {
  const [enquiries,setEnquiries]=useState([]);
  const [pipeline,setPipeline]=useState({});
  const [statusFilter,setStatusFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [showForm,setShowForm]=useState(false);
  const [selected,setSelected]=useState(null);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState({first_name:"",last_name:"",email:"",phone:"",child_first_name:"",child_dob:"",preferred_start_date:"",message:"",source:"website"});

  const load=useCallback(()=>{
    setLoading(true);
    const params=new URLSearchParams();
    if(statusFilter!=="all")params.set("status",statusFilter);
    if(search)params.set("search",search);
    API(`/api/crm/enquiries?${params}`).then(r=>{
      setEnquiries(r.enquiries||[]);
      setPipeline(r.pipeline||{});
    }).finally(()=>setLoading(false));
  },[statusFilter,search]);
  useEffect(()=>{load();},[load]);

  const createEnquiry=async()=>{
    if(!form.first_name)return;
    await API("/api/crm/enquiries",{method:"POST",body:form}.catch(e=>console.error('API error:',e)));
    setForm({first_name:"",last_name:"",email:"",phone:"",child_first_name:"",child_dob:"",preferred_start_date:"",message:"",source:"website"});
    setShowForm(false);load();
  };

  const updateStatus=async(id,status)=>{
    await API(`/api/crm/enquiries/${id}`,{method:"PUT",body:{status}}.catch(e=>console.error('API error:',e)));
    load();
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <input value={search} onChange={e=>{setSearch(e.target.value);}} placeholder="🔍 Search name, email, child…"
          style={{...inp,width:240,flex:"none"}} />
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {["all",...STATUS_FLOW].map(s=>(
            <button key={s} onClick={()=>setStatusFilter(s)}
              style={{padding:"6px 12px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
                background:statusFilter===s?(STATUS_COLOR[s]||P):"#F0EBF8",
                color:statusFilter===s?"#fff":(STATUS_COLOR[s]||P)}}>
              {s.replace("_"," ")} {s!=="all"&&pipeline[s]?`(${pipeline[s]})`:""}
            </button>
          ))}
        </div>
        <button style={{...btnP,marginLeft:"auto"}} onClick={()=>setShowForm(v=>!v)}>
          {showForm?"Cancel":"+ New Enquiry"}
        </button>
      </div>

      {showForm&&(
        <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
          <div style={{fontWeight:700,fontSize:14,color:P,marginBottom:14}}>New Enquiry</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["first_name","Parent First Name *"],["last_name","Last Name"],["email","Email"],["phone","Phone"],
              ["child_first_name","Child's Name"],["child_dob","Child DOB","date"],
              ["preferred_start_date","Preferred Start","date"]].map(([k,l,t])=>(
              <div key={k}>
                <label style={lbl}>{l}</label>
                <input type={t||"text"} value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} style={inp}/>
              </div>
            ))}
            <div>
              <label style={lbl}>Source</label>
              <select value={form.source} onChange={e=>setForm(p=>({...p,source:e.target.value}))} style={inp}>
                {["website","phone","walk_in","referral","social"].map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label style={lbl}>Message</label>
              <textarea value={form.message} onChange={e=>setForm(p=>({...p,message:e.target.value}))} rows={2} style={{...inp,resize:"vertical"}}/>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:14}}>
            <button style={btnP} onClick={createEnquiry}>Save Enquiry</button>
            <button style={btnS} onClick={()=>setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading?<div style={{color:MUTED,padding:30,textAlign:"center"}}>Loading…</div>
        :enquiries.length===0?(<div style={{...card,textAlign:"center",padding:"40px 20px",color:MUTED}}>
          <div style={{fontSize:36}}>🎯</div><div style={{marginTop:8}}>No enquiries found</div>
        </div>)
        :(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {enquiries.map(e=>(
              <div key={e.id} style={{...card,cursor:"pointer",border:`1px solid ${selected?.id===e.id?P+"60":"#EDE8F4"}`}}
                onClick={()=>setSelected(selected?.id===e.id?null:e)}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                      <span style={{fontWeight:700,fontSize:14,color:DARK}}>{e.first_name} {e.last_name}</span>
                      <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,
                        background:STATUS_BG[e.status]||"#F5F5F5",color:STATUS_COLOR[e.status]||MUTED}}>
                        {e.status.replace("_"," ")}
                      </span>
                      {e.tour_count>0&&<span style={{fontSize:11,color:WARN}}>🗓 {e.tour_count} tour{e.tour_count>1?"s":""}</span>}
                    </div>
                    <div style={{fontSize:12,color:MUTED}}>
                      {e.child_first_name&&`Child: ${e.child_first_name} · `}
                      {e.email&&`${e.email} · `}{e.phone&&e.phone}
                    </div>
                  </div>
                  <div style={{textAlign:"right",fontSize:11,color:MUTED}}>
                    <div>{fmtDate(e.created_at?.split(" ")[0])}</div>
                    {e.next_follow_up&&<div style={{color:e.next_follow_up<=today()?DANGER:WARN}}>
                      Follow-up: {fmtDate(e.next_follow_up)}
                    </div>}
                  </div>
                </div>
                {selected?.id===e.id&&(
                  <div style={{marginTop:14,borderTop:"1px solid #EDE8F4",paddingTop:14}}>
                    {e.message&&<div style={{fontSize:13,color:DARK,marginBottom:12,padding:"10px 12px",background:"#F8F5FC",borderRadius:8}}>{e.message}</div>}
                    <div style={{fontWeight:700,fontSize:12,color:MUTED,marginBottom:8}}>MOVE TO STAGE</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {STATUS_FLOW.filter(s=>s!==e.status).map(s=>(
                        <button key={s} onClick={ev=>{ev.stopPropagation();updateStatus(e.id,s);}}
                          style={{padding:"5px 12px",borderRadius:7,border:`1px solid ${STATUS_COLOR[s]||P}`,
                            background:STATUS_BG[s]||"#F5F5F5",color:STATUS_COLOR[s]||P,cursor:"pointer",fontSize:11,fontWeight:600}}>
                          {s.replace("_"," ")}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

function ToursView() {
  const [tours,setTours]=useState([]);
  const [bookedSlots,setBookedSlots]=useState([]);
  const [showForm,setShowForm]=useState(false);
  const [weekOffset,setWeekOffset]=useState(0);
  const [form,setForm]=useState({family_name:"",family_email:"",family_phone:"",child_name:"",booked_date:"",booked_time:"09:00"});

  const getWeekDates=(offset=0)=>{
    const d=new Date();d.setDate(d.getDate()-d.getDay()+1+offset*7);
    return Array.from({length:5},(_,i)=>{const dd=new Date(d);dd.setDate(d.getDate()+i);return dd.toISOString().split("T")[0];});
  };
  const weekDates=getWeekDates(weekOffset);

  const load=useCallback(()=>{
    const from=weekDates[0],to=weekDates[4];
    API(`/api/crm/tours?from=${from}&to=${to}`).then(r=>{
      setTours(r.tours||[]);
      setBookedSlots(r.booked_slots||[]);
    });
  },[weekOffset]);
  useEffect(()=>{load();},[load]);

  const bookTour=async()=>{
    if(!form.family_name||!form.booked_date||!form.booked_time)return;
    const r=await API("/api/crm/tours",{method:"POST",body:form});
    if(r.error){alert(r.error);return;}
    setShowForm(false);
    setForm({family_name:"",family_email:"",family_phone:"",child_name:"",booked_date:"",booked_time:"09:00"});
    load();
  };

  const TIME_SLOTS=["09:00","09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30"];
  const isBooked=(date,time)=>bookedSlots.includes(`${date} ${time}`);
  const toursOn=(date)=>tours.filter(t=>t.booked_date===date);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:10,alignItems:"center"}}>
        <button onClick={()=>setWeekOffset(p=>p-1)} style={btnS}>← Prev Week</button>
        <span style={{fontSize:13,color:DARK,fontWeight:600,flex:1,textAlign:"center"}}>
          {fmtDate(weekDates[0])} – {fmtDate(weekDates[4])}
        </span>
        <button onClick={()=>setWeekOffset(p=>p+1)} style={btnS}>Next Week →</button>
        <button style={btnP} onClick={()=>setShowForm(v=>!v)}>{showForm?"Cancel":"+ Book Tour"}</button>
      </div>

      {showForm&&(
        <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
          <div style={{fontWeight:700,fontSize:14,color:P,marginBottom:14}}>Book a Tour</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["family_name","Family Name *"],["family_email","Email"],["family_phone","Phone"],["child_name","Child's Name"],
              ["booked_date","Date *","date"],["booked_time","Time *","time"]].map(([k,l,t])=>(
              <div key={k}>
                <label style={lbl}>{l}</label>
                <input type={t||"text"} value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} style={inp}/>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,marginTop:14}}>
            <button style={btnP} onClick={bookTour}>Book Tour</button>
            <button style={btnS} onClick={()=>setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Weekly calendar grid */}
      <div style={{...card,overflowX:"auto"}}>
        <div style={{display:"grid",gridTemplateColumns:`100px repeat(5,1fr)`,gap:1,minWidth:640}}>
          <div style={{padding:"8px 6px",fontWeight:700,fontSize:11,color:MUTED}}/>
          {weekDates.map(d=>(
            <div key={d} style={{padding:"8px 6px",fontWeight:700,fontSize:12,color:DARK,textAlign:"center",background:"#F8F5FC",borderRadius:"8px 8px 0 0"}}>
              {new Date(d+"T12:00").toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"})}
            </div>
          ))}
          {TIME_SLOTS.map(time=>(
            <React.Fragment key={time}>
              <div style={{padding:"6px 8px",fontSize:12,color:MUTED,fontFamily:"monospace",borderTop:"1px solid #F0EBF8"}}>{time}</div>
              {weekDates.map(date=>{
                const booked=isBooked(date,time);
                const tour=toursOn(date).find(t=>t.booked_time===time);
                return (
                  <div key={date+time} onClick={()=>{if(!booked){setForm(p=>({...p,booked_date:date,booked_time:time}));setShowForm(true);}}}
                    style={{padding:"4px 6px",minHeight:32,borderTop:"1px solid #F0EBF8",borderRadius:4,
                      background:tour?"#EDE4F0":booked?"#FEF2F2":"#FAFAFA",
                      cursor:booked?"default":"pointer",transition:"background 0.1s"}}>
                    {tour&&<div style={{fontSize:11,fontWeight:600,color:P}}>{tour.family_name}</div>}
                    {!tour&&!booked&&<div style={{fontSize:10,color:MUTED,opacity:0.5}}>Available</div>}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function FollowUpsView() {
  const [followUps,setFollowUps]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    API("/api/crm/dashboard").then(r=>setFollowUps(r.followUps||[])).finally(()=>setLoading(false));
  },[]);

  const updateFollowUp=async(id,updates)=>{
    await API(`/api/crm/enquiries/${id}`,{method:"PUT",body:updates}.catch(e=>console.error('API error:',e)));
    const r=await API("/api/crm/dashboard".catch(e=>console.error('API error:',e)));
    setFollowUps(r.followUps||[]);
  };

  if(loading)return <div style={{color:MUTED,padding:40,textAlign:"center"}}>Loading…</div>;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:13,color:MUTED,marginBottom:4}}>
        Families that need a follow-up call or email today.
      </div>
      {followUps.length===0?(
        <div style={{...card,textAlign:"center",padding:"40px 20px",color:MUTED}}>
          <div style={{fontSize:36}}>✅</div>
          <div style={{marginTop:8,fontWeight:600,color:DARK}}>All follow-ups done</div>
          <p style={{fontSize:12}}>No families are overdue for contact.</p>
        </div>
      ):followUps.map(e=>(
        <div key={e.id} style={{...card,borderLeft:`4px solid ${e.next_follow_up<today()?DANGER:WARN}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:DARK}}>{e.first_name} {e.last_name}</div>
              <div style={{fontSize:12,color:MUTED,marginTop:2}}>
                {e.child_first_name&&`Child: ${e.child_first_name} · `}
                {e.email&&`${e.email} · `}{e.phone}
              </div>
              <div style={{fontSize:12,color:e.next_follow_up<today()?DANGER:WARN,marginTop:4,fontWeight:600}}>
                {e.next_follow_up<today()?`⚠ Overdue since ${fmtDate(e.next_follow_up)}`:`Due: ${fmtDate(e.next_follow_up)}`}
              </div>
              {e.last_contact&&<div style={{fontSize:11,color:MUTED}}>Last contact: {fmtDate(e.last_contact)}</div>}
            </div>
            <div style={{display:"flex",gap:8,flexDirection:"column"}}>
              <button onClick={()=>updateFollowUp(e.id,{status:"contacted",next_follow_up:new Date(Date.now()+3*86400000).toISOString().split("T")[0]})}
                style={{...btnP,fontSize:12,padding:"6px 14px"}}>✓ Contacted</button>
              <button onClick={()=>updateFollowUp(e.id,{status:"tour_booked"})}
                style={{...btnS,fontSize:12,padding:"6px 14px"}}>Tour Booked</button>
              <button onClick={()=>updateFollowUp(e.id,{status:"lost"})}
                style={{padding:"6px 14px",borderRadius:8,border:"1px solid #EDE8F4",background:"#F5F5F5",color:MUTED,cursor:"pointer",fontSize:12}}>
                Mark Lost
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
