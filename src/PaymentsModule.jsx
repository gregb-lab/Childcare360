/**
 * PaymentsModule.jsx — v2.16.0
 *   💳 Payments   — Stripe online fee collection, payment links, history
 *   📋 Waitlist   — Automated waitlist-to-enrolment pipeline
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
const fmtD=d=>d?new Date(d+"T12:00").toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):"—";

const TABS=[{id:"payments",icon:"💳",label:"Online Payments"},{id:"waitlist",icon:"📋",label:"Waitlist Pipeline"}];

export default function PaymentsModule() {
  const [tab,setTab]=useState("payments");
  return (
    <div style={{padding:"24px 28px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
        <span style={{fontSize:28}}>💳</span>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>Payments & Enrolment Pipeline</h1>
          <p style={{margin:"3px 0 0",fontSize:13,color:MU}}>Stripe online payments · Waitlist-to-enrolment automation</p>
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
      {tab==="payments" && <PaymentsTab />}
      {tab==="waitlist" && <WaitlistPipelineTab />}
    </div>
  );
}

// ─── PAYMENTS TAB ─────────────────────────────────────────────────────────────
function PaymentsTab() {
  const [setup,setSetup]=useState(null);
  const [requests,setRequests]=useState([]);
  const [summary,setSummary]=useState(null);
  const [monthly,setMonthly]=useState([]);
  const [showSetup,setShowSetup]=useState(false);
  const [showNew,setShowNew]=useState(false);
  const [children,setChildren]=useState([]);
  const [keys,setKeys]=useState({publishable_key:"",secret_key:""});
  const [newForm,setNewForm]=useState({child_id:"",amount:"",description:"Childcare fees"});
  const [filter,setFilter]=useState("all");

  const load=useCallback(()=>{
    Promise.all([
      API("/api/payments/setup"),
      API("/api/payments/requests"),
      API("/api/payments/summary"),
      API("/api/children/simple"),
    ]).then(([s,r,sum,c])=>{
      setSetup(s);
      setRequests(r.requests||[]);
      setSummary(r.summary);
      setMonthly(sum.monthly||[]);
      setChildren(Array.isArray(c)?c:[]);
    });
  },[]);
  useEffect(()=>{load();},[load]);

  const saveKeys=async()=>{
    const r=await API("/api/payments/setup",{method:"POST",body:keys});
    if(r.ok){setShowSetup(false);load();}
    else alert(r.error||"Failed");
  };

  const createRequest=async()=>{
    if(!newForm.amount)return;
    const r=await API("/api/payments/requests",{method:"POST",body:{
      child_id:newForm.child_id||null,
      amount_cents:Math.round(parseFloat(newForm.amount)*100),
      description:newForm.description,
    }});
    if(r.ok){setShowNew(false);setNewForm({child_id:"",amount:"",description:"Childcare fees"});load();}
  };

  const sendLink=async(id)=>{
    const r=await API(`/api/payments/requests/${id}/send`,{method:"POST"}).catch(e=>console.error('API error:',e));
    if(r?.ok){alert(`✓ Payment link generated:\n${r?.payment_url}`);load();}
  };

  const markPaid=async(id)=>{
    await API(`/api/payments/requests/${id}/mark-paid`,{method:"POST",body:{payment_method:"manual"}}).catch(e=>console.error('API error:',e));
    load();
  };

  const bulkCreate=async()=>{
    const r=await API("/api/payments/requests/bulk-from-invoices",{method:"POST"}).catch(e=>console.error('API error:',e));
    alert(r?.message||"Done");load();
  };

  const STATUS_C={pending:WA,sent:IN,paid:OK,cancelled:MU};

  const filtered=requests.filter(r=>filter==="all"||r.status===filter);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Setup banner */}
      {!setup?.connected&&(
        <div style={{...card,background:"#F3E8FF",border:"1px solid #C4B5FD"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:P}}>🔌 Connect Stripe to enable online payments</div>
              <p style={{fontSize:12,color:MU,margin:"4px 0 0"}}>
                Accept credit cards, bank transfers and direct debit from Australian families.
                You'll need a Stripe account — <a href="https://stripe.com/au" target="_blank" rel="noreferrer" style={{color:P}}>sign up free at stripe.com/au</a>
              </p>
            </div>
            <button style={bp} onClick={()=>setShowSetup(v=>!v)}>Configure Stripe</button>
          </div>
          {showSetup&&(
            <div style={{marginTop:14,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <label style={lbl}>Publishable Key (pk_live_...)</label>
                <input value={keys.publishable_key} onChange={e=>setKeys(p=>({...p,publishable_key:e.target.value}))} style={inp} placeholder="pk_live_..."/>
              </div>
              <div>
                <label style={lbl}>Secret Key (sk_live_...)</label>
                <input type="password" value={keys.secret_key} onChange={e=>setKeys(p=>({...p,secret_key:e.target.value}))} style={inp} placeholder="sk_live_..."/>
              </div>
              <div style={{gridColumn:"span 2",display:"flex",gap:8}}>
                <button style={bp} onClick={saveKeys}>Save Keys</button>
                <button style={bs} onClick={()=>setShowSetup(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
      {setup?.connected&&(
        <div style={{...card,background:"#F0FDF4",border:"1px solid #A5D6A7",padding:"12px 18px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:13,color:OK,fontWeight:600}}>✓ Stripe connected — online payments enabled</div>
            <button onClick={()=>setShowSetup(v=>!v)} style={{...bs,fontSize:11,padding:"4px 12px",color:MU,borderColor:"#DDD"}}>Reconfigure</button>
          </div>
        </div>
      )}

      {/* Summary tiles */}
      {summary&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
          {[
            ["Total Requests",summary.total,MU],
            ["Pending",summary.pending,WA],
            ["Paid",summary.paid,OK],
            ["Outstanding",fmt$(summary.total_outstanding),DA],
          ].map(([l,v,c])=>(
            <div key={l} style={{...card,textAlign:"center",borderTop:`3px solid ${c}`}}>
              <div style={{fontSize:22,fontWeight:900,color:c}}>{v}</div>
              <div style={{fontSize:11,color:MU,marginTop:4}}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Monthly chart */}
      {monthly.length>0&&(
        <div style={{...card}}>
          <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:14}}>Monthly Collections</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:8,height:80}}>
            {monthly.slice(0,6).reverse().map((m,i)=>{
              const maxVal=Math.max(...monthly.map(x=>x.collected),1);
              const h=Math.round((m.collected/maxVal)*72);
              return (
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                  <div style={{fontSize:9,color:OK,fontWeight:700}}>{fmt$(m.collected)}</div>
                  <div style={{width:"100%",height:h,background:OK,borderRadius:"3px 3px 0 0",minHeight:4}}/>
                  <div style={{fontSize:9,color:MU}}>{m.month?.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:6}}>
          {["all","pending","sent","paid"].map(f=>(
            <button key={f} onClick={()=>setFilter(f)}
              style={{padding:"6px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
                textTransform:"capitalize",background:filter===f?P:"#F0EBF8",color:filter===f?"#fff":P}}>
              {f}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button style={{...bs,fontSize:12}} onClick={bulkCreate}>⚡ From Overdue Invoices</button>
          <button style={bp} onClick={()=>setShowNew(v=>!v)}>+ New Request</button>
        </div>
      </div>

      {showNew&&(
        <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <div>
              <label style={lbl}>Child (optional)</label>
              <select value={newForm.child_id} onChange={e=>setNewForm(p=>({...p,child_id:e.target.value}))} style={inp}>
                <option value="">General / No child</option>
                {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Amount ($) *</label>
              <input type="number" value={newForm.amount} onChange={e=>setNewForm(p=>({...p,amount:e.target.value}))} style={inp} placeholder="e.g. 135.00" step="0.01"/>
            </div>
            <div>
              <label style={lbl}>Description</label>
              <input value={newForm.description} onChange={e=>setNewForm(p=>({...p,description:e.target.value}))} style={inp}/>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button style={bp} onClick={createRequest}>Create</button>
            <button style={bs} onClick={()=>setShowNew(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Requests table */}
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr style={{background:"#F8F5FC"}}>
          {["Child","Description","Amount","Status","Created",""].map(h=>(
            <th key={h} style={{padding:"8px 10px",textAlign:"left",color:MU,fontWeight:700,fontSize:11}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {filtered.length===0
            ? <tr><td colSpan={6} style={{padding:"30px 10px",textAlign:"center",color:MU}}>No payment requests</td></tr>
            : filtered.map(r=>(
              <tr key={r.id} style={{borderBottom:"1px solid #F0EBF8"}}>
                <td style={{padding:"8px 10px",fontWeight:600,color:DARK}}>
                  {r.first_name?`${r.first_name} ${r.last_name}`:"—"}
                </td>
                <td style={{padding:"8px 10px",color:MU}}>{r.description}</td>
                <td style={{padding:"8px 10px",fontWeight:700,color:DARK}}>{fmt$(r.amount)}</td>
                <td style={{padding:"8px 10px"}}>
                  <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,
                    background:(STATUS_C[r.status]||MU)+"20",color:STATUS_C[r.status]||MU,textTransform:"capitalize"}}>
                    {r.status}
                    {r.status==="paid"&&r.payment_method&&` (${r.payment_method})`}
                  </span>
                </td>
                <td style={{padding:"8px 10px",color:MU,fontSize:12}}>{fmtD(r.created_at?.split("T")[0])}</td>
                <td style={{padding:"8px 10px"}}>
                  <div style={{display:"flex",gap:6}}>
                    {r.status==="pending"&&<button onClick={()=>sendLink(r.id)} style={{...bp,padding:"4px 10px",fontSize:11}}>📤 Send Link</button>}
                    {r.status!=="paid"&&<button onClick={()=>markPaid(r.id)} style={{padding:"4px 10px",borderRadius:7,border:`1px solid ${OK}`,background:"#F0FDF4",color:OK,cursor:"pointer",fontSize:11,fontWeight:700}}>✓ Paid</button>}
                    {r.stripe_checkout_url&&r.stripe_checkout_url.startsWith("http")&&(
                      <a href={r.stripe_checkout_url} target="_blank" rel="noreferrer"
                        style={{padding:"4px 10px",borderRadius:7,border:"1px solid #DDD6EE",background:"#F5F5F5",color:MU,fontSize:11,textDecoration:"none"}}>
                        View Link
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  );
}

// ─── WAITLIST PIPELINE TAB ────────────────────────────────────────────────────
function WaitlistPipelineTab() {
  const [queue,setQueue]=useState([]);
  const [stats,setStats]=useState(null);
  const [availability,setAvailability]=useState([]);
  const [view,setView]=useState("queue");
  const [offering,setOffering]=useState(null);
  const [offerForm,setOfferForm]=useState({start_date:"",message:""});

  const load=useCallback(()=>{
    Promise.all([
      API("/api/waitlist-auto/queue"),
      API("/api/waitlist-auto/availability"),
    ]).then(([q,a])=>{
      setQueue(q.queue||[]);
      setStats(q.stats);
      setAvailability(a.availability||[]);
    });
  },[]);
  useEffect(()=>{load();},[load]);

  const makeOffer=async()=>{
    if(!offering)return;
    const r=await API(`/api/waitlist-auto/offer/${offering.id}`,{method:"POST",body:offerForm});
    if(r.ok){alert(`✓ ${r.message}`);setOffering(null);load();}
    else alert(r.error);
  };

  const accept=async(id)=>{
    const r=await API(`/api/waitlist-auto/accept/${id}`,{method:"POST",body:{start_date:new Date(Date.now()+14*86400000).toISOString().split("T")[0]}});
    if(r.ok){alert(`✓ ${r.message}`);load();}
  };

  const decline=async(id)=>{
    await API(`/api/waitlist-auto/decline/${id}`,{method:"POST"}).catch(e=>console.error('API error:',e));
    load();
  };

  const bulkNotify=async()=>{
    const r=await API("/api/waitlist-auto/bulk-notify",{method:"POST",body:{message:"A place may be becoming available soon. Please contact us to discuss your child's enrolment."}}).catch(e=>console.error('API error:',e));
    alert(r?.message||"Done");
  };

  const PRIO_C={high:DA,normal:IN,low:MU};
  const STATUS_C={waiting:WA,offered:P,accepted:OK,declined:MU};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Stats */}
      {stats&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {[
            ["Families Waiting",stats.total_waiting,WA],
            ["Offers Pending",stats.offers_pending,P],
            ["Ready to Offer",stats.ready_to_offer,OK],
          ].map(([l,v,c])=>(
            <div key={l} style={{...card,textAlign:"center",borderTop:`3px solid ${c}`}}>
              <div style={{fontSize:24,fontWeight:900,color:c}}>{v||0}</div>
              <div style={{fontSize:12,color:MU,marginTop:4}}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Room availability */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
        {availability.map(room=>(
          <div key={room.id} style={{...card,padding:"14px",borderLeft:`4px solid ${room.available>0?OK:WA}`}}>
            <div style={{fontWeight:700,fontSize:13,color:DARK}}>{room.name}</div>
            <div style={{fontSize:11,color:MU,marginTop:2}}>{room.age_group}</div>
            <div style={{marginTop:8,display:"flex",justifyContent:"space-between",fontSize:12}}>
              <span style={{color:room.available>0?OK:DA,fontWeight:700}}>
                {room.available>0?`${room.available} place${room.available>1?"s":""} free`:"Full"}
              </span>
              <span style={{color:MU}}>{room.waiting_families} waiting</span>
            </div>
            {room.next_availability_date!=="Now"&&room.available===0&&(
              <div style={{fontSize:11,color:MU,marginTop:4}}>Next: {room.next_availability_date}</div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{display:"flex",gap:8,justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:6}}>
          {["queue","offered"].map(v=>(
            <button key={v} onClick={()=>setView(v)}
              style={{padding:"6px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
                textTransform:"capitalize",background:view===v?P:"#F0EBF8",color:view===v?"#fff":P}}>
              {v==="queue"?"Waiting Queue":"Pending Offers"}
            </button>
          ))}
        </div>
        <button onClick={bulkNotify} style={{...bs,fontSize:12}}>📣 Notify All Waiting Families</button>
      </div>

      {/* Offer modal */}
      {offering&&(
        <div style={{...card,background:"#F3E8FF",border:"1px solid #C4B5FD"}}>
          <div style={{fontWeight:700,fontSize:14,color:P,marginBottom:12}}>
            Offer Place to {offering.parent_name} for {offering.child_name}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div>
              <label style={lbl}>Proposed Start Date</label>
              <input type="date" value={offerForm.start_date} onChange={e=>setOfferForm(p=>({...p,start_date:e.target.value}))} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Message (optional)</label>
              <input value={offerForm.message} onChange={e=>setOfferForm(p=>({...p,message:e.target.value}))} style={inp} placeholder="Additional details…"/>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button style={bp} onClick={makeOffer}>Send Offer</button>
            <button style={bs} onClick={()=>setOffering(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Queue list */}
      {queue.filter(i=>view==="offered"?i.status==="offered":i.status==="waiting").length===0
        ? <div style={{...card,textAlign:"center",padding:"40px 20px",color:MU}}>
            <div style={{fontSize:36}}>📋</div>
            <div style={{marginTop:8}}>No families in {view==="offered"?"pending offers":"waiting queue"}</div>
          </div>
        : queue.filter(i=>view==="offered"?i.status==="offered":i.status==="waiting").map(item=>(
          <div key={item.id} style={{...card,borderLeft:`4px solid ${STATUS_C[item.status]||MU}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:4}}>
                  <div style={{fontWeight:700,fontSize:14,color:DARK}}>{item.child_name}</div>
                  <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,
                    background:(PRIO_C[item.priority]||MU)+"20",color:PRIO_C[item.priority]||MU}}>
                    {item.priority} priority
                  </span>
                  {item.queue_position&&<span style={{fontSize:11,color:MU}}>#{item.queue_position} in queue</span>}
                </div>
                <div style={{fontSize:12,color:MU}}>
                  {item.parent_name}
                  {item.parent_email&&` · ${item.parent_email}`}
                  {item.parent_phone&&` · ${item.parent_phone}`}
                </div>
                <div style={{fontSize:12,color:MU,marginTop:4}}>
                  {item.room_name&&`Room: ${item.room_name} · `}
                  {item.preferred_days?.length>0&&`Days: ${item.preferred_days.join(", ")} · `}
                  Waiting {item.days_waiting} days
                  {item.preferred_start&&` · Wants to start: ${fmtD(item.preferred_start)}`}
                </div>
                {item.status==="offered"&&item.offer_expiry&&(
                  <div style={{fontSize:12,color:DA,fontWeight:600,marginTop:4}}>
                    ⏰ Offer expires: {fmtD(item.offer_expiry)}
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:8,flexShrink:0}}>
                {item.status==="waiting"&&item.ready_for_offer&&(
                  <button onClick={()=>{setOffering(item);setOfferForm({start_date:"",message:""}); }}
                    style={{...bp,fontSize:12}}>🎉 Offer Place</button>
                )}
                {item.status==="offered"&&(
                  <>
                    <button onClick={()=>accept(item.id)}
                      style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${OK}`,background:"#F0FDF4",color:OK,cursor:"pointer",fontSize:12,fontWeight:700}}>
                      ✓ Accept → Enrol
                    </button>
                    <button onClick={()=>decline(item.id)}
                      style={{padding:"6px 14px",borderRadius:8,border:"1px solid #EDE8F4",background:"#F5F5F5",color:MU,cursor:"pointer",fontSize:12}}>
                      Decline
                    </button>
                  </>
                )}
                {item.status==="waiting"&&!item.ready_for_offer&&(
                  <span style={{fontSize:12,color:MU,padding:"6px 0"}}>
                    {item.room_available_places===0?"Room full — on queue":"Pending availability"}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))
      }
    </div>
  );
}
