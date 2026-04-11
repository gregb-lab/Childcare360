import { useState, useEffect, useCallback } from "react";
import DatePicker from "./DatePicker.jsx";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}) },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};

const purple = "#8B6DAF", lp = "#F0EBF8";
const inp = { padding: "8px 12px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 13, width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 12, color: "#7A6E8A", fontWeight: 600, display: "block", marginBottom: 4 };
const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: 18, marginBottom: 14 };
const btnP = { background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 700, fontSize: 13 };
const btnS = { background: lp, color: purple, border: `1px solid ${purple}40`, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 };

function fmtDate(s) { if (!s) return "—"; return new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }

const TABS = [
  { id: "home",      icon: "🏠", label: "Home" },
  { id: "child",     icon: "👤", label: "My Child" },
  { id: "learning",  icon: "📚", label: "Learning" },
  { id: "daily",     icon: "📱", label: "Daily Updates" },
  { id: "daily_info", icon: "🥗", label: "Today's Info" },
  { id: "payments",  icon: "💳", label: "Payments" },
  { id: "ddr_cwa",   icon: "📝", label: "Forms & DDR" },
  { id: "documents", icon: "📄", label: "Documents" },
  { id: "messages",  icon: "💬", label: "Messages" },
  { id: "absence",   icon: "📅", label: "Absences" },
  { id: "enrol",     icon: "✏️", label: "Enrol Another Child" },
];


// ─── DAILY INFO TAB ─────────────────────────────────────────────────────────
function DailyInfoTab({ childId, children }) {
  const [selChild, setSelChild] = useState(childId || children?.[0]?.id || null);
  const [record, setRecord] = useState(null);
  const [selDate, setSelDate] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => {
    if (!selChild) return;
    const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
    const h={"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})};
    fetch(`/api/parent/daily-info/${selChild}?date=${selDate}`,{headers:h})
      .then(r=>r.json()).then(d=>setRecord(d.record||null)).catch(()=>setRecord(null));
  }, [selChild, selDate]);

  const MEALS = [
    {key:"breakfast",label:"Breakfast"},
    {key:"morning_tea",label:"Morning Tea"},
    {key:"lunch1",label:"Lunch 1"},
    {key:"lunch2",label:"Lunch 2"},
    {key:"afternoon_tea",label:"Afternoon Tea"},
    {key:"late_snack",label:"Late Snack"},
    {key:"dinner",label:"Dinner"},
    {key:"water",label:"Water"},
    {key:"milk",label:"Milk"},
  ];
  const meals = record ? JSON.parse(record.meals_data||"{}") : {};
  const child = children?.find(c=>c.id===selChild);
  const P2="#7C3AED",MU2="#8A7F96",OK2="#16A34A",WA2="#D97706";

  return (
    <div style={{padding:"0 4px"}}>
      {children?.length > 1 && (
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          {children.map(c=>(
            <button key={c.id} onClick={()=>setSelChild(c.id)}
              style={{padding:"6px 14px",borderRadius:20,border:`1px solid ${selChild===c.id?P2:"#DDD6EE"}`,
                background:selChild===c.id?P2:"#fff",color:selChild===c.id?"#fff":"#3D3248",cursor:"pointer",fontSize:13,fontWeight:600}}>
              {c.first_name}
            </button>
          ))}
        </div>
      )}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <input type="date" value={selDate} onChange={e=>setSelDate(e.target.value)}
          style={{padding:"7px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:13}} />
        <span style={{fontSize:13,color:MU2,fontWeight:600}}>{child?.first_name}{"'s"} Day</span>
      </div>

      {!record ? (
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:40,textAlign:"center"}}>
          <div style={{fontSize:36,marginBottom:8}}>📋</div>
          <div style={{color:MU2,fontSize:14}}>No daily information recorded for this date</div>
        </div>
      ) : (
        <>
          {/* UV Alert */}
          <div style={{background:"linear-gradient(135deg,#FFF9E6,#FFFBEB)",borderRadius:12,
            border:"1px solid #FDE68A",padding:"10px 14px",marginBottom:12,fontSize:13}}>
            <span style={{fontWeight:700,color:WA2}}>☀️ UV Alert </span>
            <span style={{color:"#92400E"}}>Sun protection applied AM{record.sunscreen_am?" ✓":""}  PM{record.sunscreen_pm?" ✓":""}</span>
          </div>

          {/* Meals */}
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"16px 20px",marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:14,color:"#3D3248",marginBottom:12}}>🍽️ Daily Information</div>
            {MEALS.map(m => (
              <div key={m.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:"7px 0",borderBottom:"1px solid #F5F0FF"}}>
                <span style={{fontSize:13,color:"#3D3248"}}>{m.label}</span>
                <span style={{fontSize:16}}>{meals[m.key]===true?"🍎":meals[m.key]==="half"?"🍎½":meals[m.key]==="no"?"—":"—"}</span>
              </div>
            ))}
          </div>

          {/* Menu */}
          {meals.menu && (
            <div style={{background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"16px 20px",marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:14,color:"#3D3248",marginBottom:8}}>📜 Today"s Menu</div>
              <div style={{fontSize:13,color:"#5C4E6A",whiteSpace:"pre-line"}}>{meals.menu}</div>
            </div>
          )}

          {/* Educator Notes */}
          {record.notes && (
            <div style={{background:"#F8F5FC",borderRadius:12,padding:"12px 16px",border:"1px solid #DDD6EE"}}>
              <div style={{fontWeight:600,fontSize:12,color:MU2,marginBottom:4}}>📝 Educator Notes</div>
              <div style={{fontSize:13,color:"#3D3248"}}>{record.notes}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── DDR / CWA TAB ──────────────────────────────────────────────────────────
function DDRCWATab({ children, selectedChildId }) {
  const [subtab, setSubtab] = useState("ddr");
  const [method, setMethod] = useState("bank");
  const [ddrForm, setDdrForm] = useState({account_name:"",bsb:"",account_number:"",card_last4:"",card_expiry:""});
  const [sig, setSig] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [ddrAccepted, setDdrAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cwaChildId, setCwaChildId] = useState(selectedChildId || children?.[0]?.id);
  const [cwaSig, setCwaSig] = useState("");
  const [cwaSaving, setCwaSaving] = useState(false);
  const [cwaSaved, setCwaSaved] = useState(false);
  const WA2="#D97706";
  const P2="#7C3AED",MU2="#8A7F96",OK2="#16A34A",DA2="#DC2626";
  const inp={padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:13,width:"100%",boxSizing:"border-box"};
  const lbl={fontSize:11,color:MU2,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"};

  const saveDDR = async () => {
    if (!termsAccepted||!privacyAccepted||!ddrAccepted) return;
    setSaving(true);
    const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
    const h={"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})};
    await fetch("/api/parent/ddr",{method:"POST",headers:h,body:JSON.stringify({
      payment_method:method, ...ddrForm, signature_data:sig,
      terms_accepted:true, signed_at:new Date().toISOString()
    })});
    setSaving(false); setSaved(true);
  };

  const saveCWA = async () => {
    if (!cwaSig||!cwaChildId) return;
    setCwaSaving(true);
    const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
    const h={"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})};
    await fetch("/api/parent/cwa",{method:"POST",headers:h,body:JSON.stringify({
      child_id:cwaChildId, signature_data:cwaSig, signed_at:new Date().toISOString()
    })});
    setCwaSaving(false); setCwaSaved(true);
  };

  return (
    <div>
      <div style={{display:"flex",gap:4,marginBottom:20,background:"#fff",borderRadius:12,
        border:"1px solid #EDE8F4",padding:4,width:"fit-content"}}>
        {[["ddr","💳 Direct Debit"],["cwa","📋 Sign CWA"],["oneoff","💰 One-Off Payment"]].map(([id,label])=>(
          <button key={id} onClick={()=>setSubtab(id)}
            style={{padding:"7px 16px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,
              background:subtab===id?P2:"transparent",color:subtab===id?"#fff":MU2}}>
            {label}
          </button>
        ))}
      </div>

      {/* DDR Form */}
      {subtab==="ddr" && (
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"24px"}}>
          <div style={{fontWeight:800,fontSize:16,color:"#3D3248",marginBottom:4}}>Direct Debit Request Authority</div>
          <div style={{fontSize:13,color:MU2,marginBottom:20}}>Authorise regular payments for childcare fees</div>

          <div style={{marginBottom:16}}>
            <label style={lbl}>Payment Method</label>
            <div style={{display:"flex",gap:10}}>
              {[["bank","Bank Account"],["card","Credit / Debit Card"]].map(([v,l])=>(
                <label key={v} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:13}}>
                  <input type="radio" checked={method===v} onChange={()=>setMethod(v)} />
                  {l}
                </label>
              ))}
            </div>
          </div>

          {method==="bank" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
              {[["account_name","Account Name"],["bsb","BSB"],["account_number","Account Number"]].map(([k,l])=>(
                <div key={k} style={k==="account_name"?{gridColumn:"span 2"}:{}}>
                  <label style={lbl}>{l}</label>
                  <input value={ddrForm[k]} onChange={e=>setDdrForm(f=>({...f,[k]:e.target.value}))} style={inp} />
                </div>
              ))}
              <div style={{gridColumn:"span 2",padding:"8px 12px",background:"#FEF9EC",borderRadius:8,fontSize:12,color:WA2}}>
                ⚠️ $2.50 failed payment fee applies
              </div>
            </div>
          )}

          {method==="card" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
              <div style={{gridColumn:"span 2"}}>
                <label style={lbl}>Name on Card</label>
                <input value={ddrForm.account_name} onChange={e=>setDdrForm(f=>({...f,account_name:e.target.value}))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Card Last 4 Digits</label>
                <input maxLength={4} value={ddrForm.card_last4} onChange={e=>setDdrForm(f=>({...f,card_last4:e.target.value}))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Expiry (MM/YY)</label>
                <input placeholder="MM/YY" value={ddrForm.card_expiry} onChange={e=>setDdrForm(f=>({...f,card_expiry:e.target.value}))} style={inp} />
              </div>
              <div style={{gridColumn:"span 2",padding:"8px 12px",background:"#FEF9EC",borderRadius:8,fontSize:12,color:"#D97706"}}>
                ⚠️ 1.75% surcharge applies to Visa & Mastercard · 2.65% for Amex
              </div>
            </div>
          )}

          <div style={{marginBottom:16}}>
            <label style={lbl}>Your Signature</label>
            <div style={{background:"#F8F5FC",borderRadius:8,border:"2px dashed #DDD6EE",padding:"16px",textAlign:"center",minHeight:80}}>
              <input value={sig} onChange={e=>setSig(e.target.value)} placeholder="Type your full name as signature"
                style={{...inp,textAlign:"center",fontStyle:"italic",fontSize:15,background:"transparent",border:"none"}} />
            </div>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
            {[
              [termsAccepted,setTermsAccepted,"I have read and accept the Terms and Conditions"],
              [privacyAccepted,setPrivacyAccepted,"I have read and accept the Privacy Policy"],
              [ddrAccepted,setDdrAccepted,"By signing this DDR, I agree to the direct debit arrangements and service agreement"],
            ].map(([val,setter,label],i)=>(
              <label key={i} style={{display:"flex",alignItems:"flex-start",gap:8,cursor:"pointer",fontSize:13}}>
                <input type="checkbox" checked={val} onChange={e=>setter(e.target.checked)} style={{marginTop:2}} />
                <span style={{color:"#3D3248"}}>{label}</span>
              </label>
            ))}
          </div>

          {saved ? (
            <div style={{padding:"12px 16px",background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:8,color:OK2,fontWeight:700}}>
              ✅ Direct debit authorisation saved successfully
            </div>
          ) : (
            <button onClick={saveDDR} disabled={saving||!termsAccepted||!privacyAccepted||!ddrAccepted||!sig}
              style={{padding:"10px 24px",borderRadius:9,border:"none",background:P2,color:"#fff",fontWeight:700,
                cursor:"pointer",fontSize:14,width:"100%",opacity:(!termsAccepted||!privacyAccepted||!ddrAccepted||!sig)?0.5:1}}>
              {saving?"Saving…":"Submit DDR Authority"}
            </button>
          )}
        </div>
      )}

      {/* CWA Signing */}
      {subtab==="cwa" && (
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"24px"}}>
          <div style={{fontWeight:800,fontSize:16,color:"#3D3248",marginBottom:4}}>Complying Written Arrangement (CWA)</div>
          <div style={{fontSize:13,color:MU2,marginBottom:20}}>
            A CWA is required by the Department of Education for your child to receive Child Care Subsidy (CCS).
            By signing, you confirm your child"s care arrangements and CCS entitlement.
          </div>

          {children?.length > 0 && (
            <div style={{marginBottom:16}}>
              <label style={lbl}>Child</label>
              <select value={cwaChildId} onChange={e=>setCwaChildId(e.target.value)} style={inp}>
                {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
          )}

          <div style={{background:"#F8F5FC",borderRadius:8,padding:"14px",marginBottom:16,fontSize:12,color:"#5C4E6A"}}>
            <div style={{fontWeight:700,marginBottom:6}}>This CWA confirms:</div>
            <div>• Your child"s enrolment and care sessions</div>
            <div>• Your CCS entitlement percentage and hours</div>
            <div>• Your obligation to notify us of changes to your CCS circumstances</div>
            <div>• Your agreement to the centre"s fee structure</div>
          </div>

          <div style={{marginBottom:16}}>
            <label style={lbl}>Digital Signature</label>
            <div style={{background:"#F8F5FC",borderRadius:8,border:"2px dashed #DDD6EE",padding:16,textAlign:"center",minHeight:80}}>
              <input value={cwaSig} onChange={e=>setCwaSig(e.target.value)} placeholder="Type your full name to sign"
                style={{...inp,textAlign:"center",fontStyle:"italic",fontSize:15,background:"transparent",border:"none"}} />
            </div>
            <div style={{fontSize:11,color:MU2,marginTop:4,textAlign:"center"}}>
              Signed: {new Date().toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"})}
            </div>
          </div>

          {cwaSaved ? (
            <div style={{padding:"12px 16px",background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:8,color:OK2,fontWeight:700}}>
              ✅ CWA signed successfully. Your centre will be notified.
            </div>
          ) : (
            <button onClick={saveCWA} disabled={cwaSaving||!cwaSig}
              style={{padding:"10px 24px",borderRadius:9,border:"none",background:P2,color:"#fff",fontWeight:700,
                cursor:"pointer",fontSize:14,width:"100%",opacity:!cwaSig?0.5:1}}>
              {cwaSaving?"Saving…":"Sign CWA"}
            </button>
          )}
        </div>
      )}

      {/* One-Off Payment */}
      {subtab==="oneoff" && (
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"24px"}}>
          <div style={{fontWeight:800,fontSize:16,color:"#3D3248",marginBottom:4}}>Make a One-Off Payment</div>
          <div style={{fontSize:13,color:MU2,marginBottom:20}}>Pay an outstanding balance or make an additional payment</div>
          <OneOffPayment />
        </div>
      )}
    </div>
  );
}

// ─── ONE OFF PAYMENT ─────────────────────────────────────────────────────────
function OneOffPayment() {
  const [form, setForm] = useState({name:"",number:"",expiry:"",cvv:"",amount:"",description:""});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const WA2="#D97706";
  const P2="#7C3AED",MU2="#8A7F96",OK2="#16A34A";
  const inp={padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:13,width:"100%",boxSizing:"border-box"};
  const lbl={fontSize:11,color:MU2,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"};
  const surcharge = form.amount ? (parseFloat(form.amount)||0)*0.0175 : 0;
  const total = (parseFloat(form.amount)||0) + surcharge;

  const submit = async () => {
    try {
      setSaving(true);
      const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
      const h={"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})};
      await fetch("/api/parent/one-off-payment",{method:"POST",headers:h,body:JSON.stringify({...form,total_cents:Math.round(total*100)})}).catch(()=>{});
      setSaving(false); setDone(true);
    } catch(e) { console.error('API error:', e); }
  };

  if (done) return (
    <div style={{padding:"20px",background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:8,color:OK2,fontWeight:700,textAlign:"center"}}>
      ✅ Payment of ${total.toFixed(2)} submitted successfully
    </div>
  );

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <div style={{gridColumn:"span 2"}}>
          <label style={lbl}>Name on Card</label>
          <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={inp} />
        </div>
        <div style={{gridColumn:"span 2"}}>
          <label style={lbl}>Card Number</label>
          <input maxLength={19} value={form.number} onChange={e=>setForm(f=>({...f,number:e.target.value}))} style={inp} />
        </div>
        <div>
          <label style={lbl}>Expiry (MM/YY)</label>
          <input placeholder="MM/YY" value={form.expiry} onChange={e=>setForm(f=>({...f,expiry:e.target.value}))} style={inp} />
        </div>
        <div>
          <label style={lbl}>Security Code (CVV)</label>
          <input maxLength={4} type="password" value={form.cvv} onChange={e=>setForm(f=>({...f,cvv:e.target.value}))} style={inp} />
        </div>
        <div>
          <label style={lbl}>Amount to Pay ($)</label>
          <input type="number" min="0" step="0.01" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} style={inp} />
        </div>
        <div>
          <label style={lbl}>Description</label>
          <input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} style={inp} />
        </div>
      </div>
      <div style={{background:"#F8F5FC",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13}}>
        <div style={{display:"flex",justifyContent:"space-between"}}>
          <span style={{color:"#8A7F96"}}>Surcharge (1.75% Visa/MC)</span>
          <span>${surcharge.toFixed(2)}</span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontWeight:800,color:"#3D3248",marginTop:4}}>
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>
      <div style={{fontSize:11,color:"#8A7F96",marginBottom:12,textAlign:"center"}}>🔒 PCI DSS compliant · Your data is secure</div>
      <button onClick={submit} disabled={saving||!form.amount||!form.number}
        style={{padding:"10px 24px",borderRadius:9,border:"none",background:P2,color:"#fff",fontWeight:700,
          cursor:"pointer",fontSize:14,width:"100%",opacity:(!form.amount||!form.number)?0.5:1}}>
        {saving?"Processing…":`Make Payment $${total.toFixed(2)}`}
      </button>
    </div>
  );
}
export default function ParentPortalModule() {
  const [tab, setTab] = useState("home");
  const [children, setChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [staffMode, setStaffMode]     = useState(false);
  const [staffChildren, setStaffChildren] = useState([]);
  const [staffChildId, setStaffChildId]   = useState(null);

  const load = useCallback(async () => {
    try {
      const [ch, msgs] = await Promise.all([
        API("/api/parent/children"),
        API("/api/parent/messages"),
      ]);
      if (Array.isArray(ch) && ch.length) {
        setChildren(ch);
        if (!selectedChildId) setSelectedChildId(ch[0].id);
      } else {
        // Staff/admin: load all children for preview mode
        const allCh = await API("/api/children").catch(()=>[]);
        if (Array.isArray(allCh) && allCh.length) {
          setStaffMode(true);
          setStaffChildren(allCh);
          setStaffChildId(allCh[0].id);
        }
      }
      if (Array.isArray(msgs)) { setMessages(msgs); setUnreadCount(msgs.filter(m => !m.read).length); }
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const child = staffMode
    ? staffChildren.find(c => c.id === staffChildId) || staffChildren[0] || null
    : children.find(c => c.id === selectedChildId) || children[0] || null;

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#8A7F96" }}>Loading parent portal...</div>;

  // Staff preview banner
  const StaffBanner = () => staffMode ? (
    <div style={{ background: "#FFF3CD", borderBottom: "2px solid #FFC107", padding: "8px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 16 }}>👁️</span>
      <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#856404" }}>
        Staff Preview Mode — viewing portal as parent of{" "}
        <strong>{child?.first_name} {child?.last_name}</strong>.
        Parents see their own children's data only.
      </div>
      <select value={staffChildId||""} onChange={e=>setStaffChildId(e.target.value)}
        style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #FFC107", fontSize: 11, background: "#fff" }}>
        {staffChildren.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.room_name||"No Room"}</option>)}
      </select>
    </div>
  ) : null;

  return (
    <div style={{ minHeight: "100%", background: "#F8F5F1" }}>
      <StaffBanner/>
      {/* Portal header bar */}
      <div style={{ background: `linear-gradient(135deg,${purple},#6B4FA0)`, color: "#fff", padding: "16px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>👨‍👩‍👧 Parent Portal</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, opacity: 0.8 }}>Welcome back · {new Date().toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long"})}</p>
          </div>
          {children.length > 1 && (
            <select value={selectedChildId} onChange={e => setSelectedChildId(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, background: "rgba(255,255,255,0.2)", color: "#fff" }}>
              {children.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          )}
        </div>
        {/* Tab nav */}
        <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
                background: tab === t.id ? "rgba(255,255,255,0.25)" : "transparent", color: "#fff", whiteSpace: "nowrap", position: "relative" }}>
              {t.icon} {t.label}
              {t.id === "messages" && unreadCount > 0 && (
                <span style={{ position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: "50%", background: "#EF5350", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{unreadCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 24px" }}>
        {tab === "home"      && <ParentHome child={child} />}
        {tab === "child"     && <ParentChild child={child} onSaved={load} />}
        {tab === "learning"  && <ParentLearning child={child} />}
        {tab === "daily"     && <ParentDailyUpdates child={child} />}
        {tab === "payments"  && <ParentPayments child={child} />}
        {tab === "documents" && <ParentDocuments child={child} />}
        {tab === "messages"  && <ParentMessages messages={messages} onRefresh={load} />}
        {tab === "absence"   && <ParentAbsence child={child} onSaved={load} />}
        {tab === "enrol"     && <ParentEnrolForm children={children} onSaved={load} />}
      </div>
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function ParentHome({ child }) {

  const [todayUpdates, setTodayUpdates] = useState([]);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    if (!child?.id) return;
    API(`/api/parent/daily-updates/${child.id}?date=${new Date().toISOString().slice(0, 10)}`).then(r => { if (Array.isArray(r)) setTodayUpdates(r); }).catch(() => {});
    API(`/api/parent/alerts`).then(r => { if (Array.isArray(r)) setAlerts(r); }).catch(() => {});
  }, [child?.id]);

  if (!child) return <div style={{ textAlign: "center", padding: 40, color: "#B0AAB9" }}>No child enrolled</div>;

  const lastSleep = todayUpdates.filter(u => u.type === "sleep").slice(-1)[0];
  const lastFood = todayUpdates.filter(u => u.type === "food").slice(-1)[0];
  const diapers = todayUpdates.filter(u => u.type === "diaper").length;

  return (
    <div>
      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{ padding: "10px 16px", borderRadius: 10, marginBottom: 6, background: a.severity === "urgent" ? "#FFEBEE" : "#FFF8E1", border: `1px solid ${a.severity === "urgent" ? "#FFCDD2" : "#FFCC80"}` }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{a.severity === "urgent" ? "🚨" : "⚠️"} {a.title}</span>
              <span style={{ fontSize: 12, color: "#5C4E6A", marginLeft: 8 }}>{a.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Child summary */}
      <div style={{ ...card, background: `linear-gradient(135deg,${purple}15,${purple}05)` }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <PortalAvatar child={child} size={56} />
          <div>
            <h3 style={{ margin: 0, color: "#3D3248" }}>{child.first_name} {child.last_name}</h3>
            <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 2 }}>{child.room_name || "Room"} · {child.age_label || ""}</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#8A7F96" }}>Today's updates</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: purple }}>{todayUpdates.length}</div>
          </div>
        </div>
      </div>

      {/* Today snapshot */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 14 }}>
        {[
          { icon: "😴", label: "Last Sleep", value: lastSleep ? lastSleep.summary || `${lastSleep.start_time}–${lastSleep.end_time || "still sleeping"}` : "No record", color: "#9B7DC0" },
          { icon: "🍽️", label: "Last Meal", value: lastFood ? lastFood.summary || lastFood.meal : "No record", color: "#6BA38B" },
          { icon: "👶", label: "Diaper Changes", value: `${diapers} today`, color: "#D4A26A" },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: "14px 16px", borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 11, color: "#8A7F96", marginTop: 4 }}>{s.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3D3248", marginTop: 2 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Recent timeline */}
      {todayUpdates.length > 0 && (
        <div style={card}>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700 }}>📱 Today's Activity</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[...todayUpdates].reverse().slice(0, 6).map(u => {
              const icons = { sleep: "😴", food: "🍽️", diaper: "👶", sunscreen: "☀️", incident: "🩹", toilet: "🚽", other: "📝" };
              const colors = { sleep: "#9B7DC0", food: "#6BA38B", diaper: "#D4A26A", sunscreen: "#E65100", incident: "#B71C1C", toilet: "#5B8DB5", other: "#8A7F96" };
              return (
                <div key={u.id} style={{ display: "flex", gap: 10, padding: "7px 10px", borderRadius: 8, background: "#FAFAFA" }}>
                  <span style={{ fontSize: 18 }}>{icons[u.type] || "📌"}</span>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#3D3248" }}>{u.summary || u.notes}</span>
                    {u.time && <span style={{ fontSize: 11, color: "#B0AAB9", marginLeft: 6 }}>{u.time}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PortalAvatar({ child, size = 40 }) {
  const colors = ["#C9929E","#9B7DC0","#6BA38B","#D4A26A","#5B8DB5"];
  const color = colors[(child?.first_name?.charCodeAt(0) || 0) % colors.length];
  if (child?.photo_url) return <img src={child.photo_url} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />;
  return <div style={{ width: size, height: size, borderRadius: "50%", background: color + "30", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, fontWeight: 700, color, flexShrink: 0 }}>{child?.first_name?.[0]}{child?.last_name?.[0]}</div>;
}

// ─── CHILD PROFILE ────────────────────────────────────────────────────────────
function ParentChild({ child, onSaved }) {
  const [f, setF] = useState({ ...(child || {}) });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await API(`/api/parent/children/${child.id}`, { method: "PUT", body: f });
    } catch(e) { window.showToast("Failed to update: " + e.message, 'error'); return; }
    setSaving(false); onSaved();
  };

  if (!child) return null;

  return (
    <div>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>👤 Child Information</h4>
          <div style={{ fontSize: 11, color: "#8A7F96" }}>Update contact details and emergency contacts</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[["Emergency Contact","emergency_contact"],["Emergency Phone","emergency_phone"],["Address","address"],["Suburb","suburb"],["State","state"],["Postcode","postcode"]].map(([l, k]) => (
            <div key={k}>
              <label style={lbl}>{l}</label>
              <input style={inp} value={f[k] || ""} onChange={e => setF(p => ({ ...p, [k]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={save} disabled={saving} style={btnP}>{saving ? "Saving…" : "Save Changes"}</button>
        </div>
      </div>

      {/* Medical summary */}
      <div style={card}>
        <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700 }}>💊 Medical Summary</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12 }}>
          <div><span style={{ color: "#8A7F96" }}>Allergies:</span> <strong>{child.allergies || "None"}</strong></div>
          <div><span style={{ color: "#8A7F96" }}>CRN:</span> <strong>{child.centrelink_crn || "Not provided"}</strong></div>
        </div>
        <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "#FFF3E0", border: "1px solid #FFCC80", fontSize: 11, color: "#E65100" }}>
          💡 To update medical information, dietary requirements, or medical plans, please contact the centre.
        </div>
      </div>
    </div>
  );
}

// ─── LEARNING ────────────────────────────────────────────────────────────────
function ParentLearning({ child }) {
  const [observations, setObservations] = useState([]);
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [period, setPeriod] = useState("month");

  useEffect(() => {
    if (!child?.id) return;
    API(`/api/parent/learning/${child.id}?period=${period}`).then(r => { if (Array.isArray(r)) setObservations(r); }).catch(() => {});
    API(`/api/parent/learning/${child.id}/weekly-report`).then(r => setWeeklyReport(r)).catch(() => {});
  }, [child?.id, period]);

  if (!child) return null;

  const EYLF_COLORS = { 1: "#C9929E", 2: "#9B7DC0", 3: "#6BA38B", 4: "#D4A26A", 5: "#5B8DB5" };

  return (
    <div>
      {/* Weekly report */}
      {weeklyReport && (
        <div style={{ ...card, background: "linear-gradient(135deg,#EDE4F0,#E8F0F5)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>📊 Weekly Progress Report</h4>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#5C4E6A" }}>Week of {fmtDate(weeklyReport.week_start)}</p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
            {Object.entries(EYLF_COLORS).map(([id, color]) => {
              const score = weeklyReport.outcomes?.[id] || 0;
              const prev = weeklyReport.prev_outcomes?.[id] || 0;
              const delta = score - prev;
              return (
                <div key={id} style={{ textAlign: "center", padding: "8px 4px", background: "#fff", borderRadius: 10 }}>
                  <div style={{ fontSize: 20 }}>{["🧑","🤝","💚","🌟","💬"][parseInt(id) - 1]}</div>
                  <div style={{ fontSize: 10, color: "#8A7F96", margin: "2px 0" }}>Outcome {id}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color }}>{score}%</div>
                  <div style={{ fontSize: 10, color: delta > 0 ? "#2E7D32" : delta < 0 ? "#B71C1C" : "#8A7F96", fontWeight: 700 }}>
                    {delta > 0 ? `↑ +${delta}%` : delta < 0 ? `↓ ${delta}%` : "→ stable"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Period selector */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["week","This Week"],["month","This Month"],["year","This Year"],["all","All Time"]].map(([v, l]) => (
          <button key={v} onClick={() => setPeriod(v)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: period === v ? 700 : 500,
              background: period === v ? lp : "#F8F5F1", color: period === v ? purple : "#6B5F7A" }}>
            {l}
          </button>
        ))}
      </div>

      {/* Observations feed */}
      {observations.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#B0AAB9" }}>No observations for this period</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {observations.map(obs => (
            <div key={obs.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: lp, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #EDE8F4" }}>
                    {obs.educator_photo_url
                      ? <img src={obs.educator_photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: 13, fontWeight: 700, color: purple }}>{(obs.educator_name || "E").charAt(0)}</span>}
                  </div>
                  <div>
                    {obs.event_name && <div style={{ fontSize: 10, color: purple, fontWeight: 700, marginBottom: 2 }}>🎯 {obs.event_name}</div>}
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#3D3248" }}>{obs.title || "Learning Moment"}</h4>
                    <div style={{ fontSize: 11, color: "#8A7F96" }}>{fmtDate(obs.date)} · {obs.educator_name || "Your educator"}</div>
                  </div>
                </div>
                {obs.ai_enhanced && <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: lp, color: purple, fontWeight: 700 }}>✨ AI</span>}
              </div>
              {obs.photo_url && <img src={obs.photo_url} alt="" style={{ width: "100%", borderRadius: 8, marginBottom: 10, maxHeight: 300, objectFit: "cover" }} />}
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "#5C4E6A", lineHeight: 1.7 }}>{obs.content}</p>
              {(obs.eylf_outcomes || []).length > 0 && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {obs.eylf_outcomes.map(id => (
                    <span key={id} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, fontWeight: 700,
                      background: (EYLF_COLORS[id] || purple) + "20", color: EYLF_COLORS[id] || purple }}>
                      {["🧑","🤝","💚","🌟","💬"][id - 1]} EYLF Outcome {id}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DAILY UPDATES ────────────────────────────────────────────────────────────
function ParentDailyUpdates({ child }) {
  const [updates, setUpdates] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!child?.id) return;
    API(`/api/parent/daily-updates/${child.id}?date=${date}`).then(r => { if (Array.isArray(r)) setUpdates(r); }).catch(() => {});
  }, [child?.id, date]);

  const ACTION_ICONS = { sleep: "😴", food: "🍽️", diaper: "👶", sunscreen: "☀️", incident: "🩹", toilet: "🚽", other: "📝" };
  const ACTION_LABELS = { sleep: "Sleep", food: "Meal", diaper: "Diaper", sunscreen: "Sunscreen", incident: "Incident", toilet: "Toilet", other: "Note" };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#3D3248" }}>📱 Daily Updates</h4>
        <DatePicker value={date} onChange={v=>setDate(v)} />
        <span style={{ fontSize: 11, color: purple, fontWeight: 700, marginLeft: "auto" }}>{updates.length} entries</span>
      </div>

      {updates.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#B0AAB9" }}>No updates logged for this date</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {updates.map(u => (
            <div key={u.id} style={{ ...card, padding: "12px 16px", borderLeft: `4px solid ${purple}` }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 24 }}>{ACTION_ICONS[u.type] || "📌"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#3D3248" }}>{ACTION_LABELS[u.type] || "Update"}</div>
                  <div style={{ fontSize: 12, color: "#5C4E6A", lineHeight: 1.6 }}>{u.summary || u.notes}</div>
                  {u.time && <div style={{ fontSize: 11, color: "#B0AAB9", marginTop: 2 }}>⏰ {u.time}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PAYMENTS ────────────────────────────────────────────────────────────────
function ParentPayments({ child }) {
  const [invoices, setInvoices] = useState([]);
  const [ccs, setCcs] = useState(null);

  useEffect(() => {
    if (!child?.id) return;
    API(`/api/parent/invoices`).then(r => { if (Array.isArray(r)) setInvoices(r); }).catch(() => {});
    API(`/api/children/${child.id}/ccs`).then(r => setCcs(r)).catch(() => {});
  }, [child?.id]);

  const outstanding = invoices.filter(i => i.status === "unpaid" || i.status === "overdue");
  const totalOwing = outstanding.reduce((a, i) => a + (i.gap_fee_cents || 0), 0);

  return (
    <div>
      {/* CCS status */}
      <div style={{ ...card, background: ccs?.active ? "#E8F5E9" : "#FFEBEE", border: `1px solid ${ccs?.active ? "#A5D6A7" : "#FFCDD2"}` }}>
        <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700 }}>🏛️ Childcare Subsidy (CCS)</h4>
        {ccs?.active ? (
          <div style={{ fontSize: 12, color: "#2E7D32" }}>
            ✅ CCS is active · {ccs.hours_approved}hrs/fortnight approved
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: "#B71C1C", fontWeight: 700 }}>⚠ CCS not active or not on file</div>
            <div style={{ fontSize: 11, color: "#E65100", marginTop: 4 }}>Without CCS, full session fees apply. Contact Centrelink to apply or update your approval.</div>
          </div>
        )}
      </div>

      {/* Owing */}
      {totalOwing > 0 && (
        <div style={{ ...card, background: "#FFEBEE", border: "1px solid #FFCDD2" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#B71C1C" }}>💳 Outstanding Balance</h4>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#B71C1C" }}>${(totalOwing / 100).toFixed(2)}</div>
          </div>
          <button style={{ ...btnP, marginTop: 10, background: "#B71C1C" }}>Pay Now</button>
        </div>
      )}

      {/* Invoice list */}
      <div style={card}>
        <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700 }}>Invoice History</h4>
        {invoices.length === 0 ? (
          <div style={{ textAlign: "center", padding: 20, color: "#B0AAB9", fontSize: 12 }}>No invoices yet</div>
        ) : invoices.map(inv => (
          <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F5F0FB" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#3D3248" }}>{inv.invoice_number}</div>
              <div style={{ fontSize: 11, color: "#8A7F96" }}>{fmtDate(inv.period_start)} · Due {fmtDate(inv.due_date)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#3D3248" }}>${((inv.gap_fee_cents || 0) / 100).toFixed(2)}</div>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700,
                background: inv.status === "paid" ? "#E8F5E9" : inv.status === "overdue" ? "#FFEBEE" : "#FFF3E0",
                color: inv.status === "paid" ? "#2E7D32" : inv.status === "overdue" ? "#B71C1C" : "#E65100" }}>
                {inv.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DOCUMENTS ────────────────────────────────────────────────────────────────
function ParentDocuments({ child }) {
  const [docs, setDocs] = useState([]);

  useEffect(() => {
    if (!child?.id) return;
    API(`/api/parent/documents/${child.id}`).then(r => { if (Array.isArray(r)) setDocs(r); }).catch(() => {});
  }, [child?.id]);

  const DOC_ICONS = { immunisation: "💉", medical_plan: "📋", anaphylaxis: "⚠️", identification: "🪪", enrolment: "📝", other: "📄" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>📄 Documents</h4>
        <div style={{ fontSize: 11, color: "#8A7F96" }}>Upload documents by emailing files@childcare360.net from your registered address</div>
      </div>
      {docs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#B0AAB9" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
          <div>No documents on file yet</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {docs.map(d => (
            <div key={d.id} style={{ ...card, cursor: "pointer", padding: 14 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{DOC_ICONS[d.type] || "📄"}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#3D3248" }}>{d.name}</div>
              <div style={{ fontSize: 10, color: "#8A7F96", marginTop: 2 }}>{fmtDate(d.created_at)}</div>
              {d.expiry_date && (
                <div style={{ fontSize: 10, color: new Date(d.expiry_date) < new Date() ? "#B71C1C" : "#2E7D32", marginTop: 2, fontWeight: 700 }}>
                  Expires {fmtDate(d.expiry_date)}
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <button style={{ ...btnS, padding: "4px 10px", fontSize: 10 }}>View</button>
                <button style={{ ...btnS, padding: "4px 10px", fontSize: 10 }}>⬇ Download</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MESSAGES ────────────────────────────────────────────────────────────────
function ParentMessages({ messages, onRefresh }) {
  const [newMsg, setNewMsg] = useState("");
  const [subject, setSubject] = useState("");
  const [showCompose, setShowCompose] = useState(false);

  const send = async () => {
    if (!newMsg.trim()) return;
    try {
      const r = await API("/api/parent/messages", { method: "POST", body: { subject, body: newMsg } });
      if (r.error) { window.showToast(r.error, 'error'); return; }
    } catch(e) { window.showToast("Failed to send message.", 'error'); return; }
    setNewMsg(""); setSubject(""); setShowCompose(false); onRefresh();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>💬 Messages</h4>
        <button onClick={() => setShowCompose(!showCompose)} style={btnS}>✉️ New Message</button>
      </div>

      {showCompose && (
        <div style={{ ...card, background: lp, marginBottom: 14 }}>
          <h4 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700 }}>New Message to Centre</h4>
          <div style={{ marginBottom: 8 }}><label style={lbl}>Subject</label><input style={inp} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Message subject" /></div>
          <div style={{ marginBottom: 8 }}><label style={lbl}>Message</label><textarea style={{ ...inp, height: 80, resize: "none" }} value={newMsg} onChange={e => setNewMsg(e.target.value)} placeholder="Type your message..." /></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={send} style={btnP}>Send</button>
            <button onClick={() => setShowCompose(false)} style={btnS}>Cancel</button>
          </div>
        </div>
      )}

      {messages.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#B0AAB9" }}>No messages</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.map(m => (
            <div key={m.id} style={{ ...card, padding: "12px 16px", background: m.read ? "#fff" : lp, border: `1px solid ${m.read ? "#EDE8F4" : purple + "40"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: m.read ? 500 : 800, color: "#3D3248" }}>{m.subject || "Message from Centre"}</div>
                <div style={{ fontSize: 11, color: "#B0AAB9" }}>{fmtDate(m.created_at)}</div>
              </div>
              <div style={{ fontSize: 12, color: "#5C4E6A", lineHeight: 1.6 }}>{m.body}</div>
              <div style={{ fontSize: 10, color: "#8A7F96", marginTop: 4 }}>From: {m.from_name || "Centre Manager"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ABSENCE ────────────────────────────────────────────────────────────────
function ParentAbsence({ child, onSaved }) {
  const [absences, setAbsences] = useState([]);
  const [f, setF] = useState({ start_date: "", end_date: "", reason: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!child?.id) return;
    API(`/api/parent/absences/${child.id}`).then(r => { if (Array.isArray(r)) setAbsences(r); }).catch(() => {});
  }, [child?.id]);

  const submit = async () => {
    if (!f.start_date || !f.reason) return;
    try {
      setSaving(true);
      await API(`/api/parent/absences/${child.id}`, { method: "POST", body: f });
      setSaving(false); setF({ start_date: "", end_date: "", reason: "", notes: "" }); onSaved();
      API(`/api/parent/absences/${child.id}`).then(r => { if (Array.isArray(r)) setAbsences(r); }).catch(() => {});
    } catch(e) { console.error('API error:', e); }
  };

  return (
    <div>
      <div style={card}>
        <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700 }}>📅 Notify Centre of Absence</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Start Date</label><DatePicker value={f.start_date||""} onChange={v=>setF(p=>({...p,start_date:v}))} /></div>
          <div><label style={lbl}>End Date (optional)</label><DatePicker value={f.end_date||""} onChange={v=>setF(p=>({...p,end_date:v}))} /></div>
          <div><label style={lbl}>Reason</label>
            <select style={inp} value={f.reason} onChange={e => setF(p => ({ ...p, reason: e.target.value }))}>
              <option value="">Select reason</option>
              {["sick","family holiday","medical appointment","public holiday","other"].map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Additional Notes (optional)</label><input style={inp} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} /></div>
        </div>
        <button onClick={submit} disabled={saving} style={btnP}>{saving ? "Submitting…" : "Submit Absence Notice"}</button>
      </div>

      <div style={card}>
        <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700 }}>Absence History</h4>
        {absences.length === 0 ? <div style={{ color: "#B0AAB9", fontSize: 12, textAlign: "center", padding: 16 }}>No absences recorded</div> : (
          absences.map(a => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F5F0FB" }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#3D3248" }}>{fmtDate(a.start_date)}</span>
                {a.end_date && <span style={{ fontSize: 12, color: "#8A7F96" }}> – {fmtDate(a.end_date)}</span>}
                <span style={{ fontSize: 11, color: "#8A7F96", marginLeft: 8 }}>{a.reason}</span>
              </div>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: a.acknowledged ? "#E8F5E9" : "#FFF3E0", color: a.acknowledged ? "#2E7D32" : "#E65100", fontWeight: 700 }}>
                {a.acknowledged ? "Acknowledged" : "Pending"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── PARENT ENROL FORM ────────────────────────────────────────────────────────
function ParentEnrolForm({ children, onSaved }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [rooms, setRooms] = useState([]);

  const blank = {
    childFirstName:"", childLastName:"", childDob:"", childGender:"", childLanguage:"English", childIndigenous:"no",
    childAllergies:"None", childMedicalConditions:"", childDietary:"None",
    preferredRoom:"", preferredDays:[], preferredStartDate:"",
    parent1Name:"", parent1Email:"", parent1Phone:"", parent1Address:"", parent1Employer:"", parent1Crn:"",
    parent2Name:"", parent2Email:"", parent2Phone:"",
    emergency1Name:"", emergency1Phone:"", emergency1Relationship:"",
    emergency2Name:"", emergency2Phone:"", emergency2Relationship:"",
    authorisedPickup:[], authorisedMedical:true, authorisedAmbulance:true,
    sunscreenConsent:true, photoConsent:true, excursionConsent:true,
    doctorName:"", doctorPhone:"", medicareNumber:"", medicareRef:"",
    familyCourtOrders:false, courtOrderDetails:"", additionalNotes:"",
  };
  const [f, setF] = useState(blank);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday"];

  useEffect(() => { API("/api/rooms").then(r => { if (Array.isArray(r)) setRooms(r); }).catch(() => {}); }, []);

  // Pre-fill parent info from existing children
  useEffect(() => {
    if (children.length) {
      const existing = children[0];
      if (existing.parent1_name) u("parent1Name", existing.parent1_name);
      if (existing.parent1_email) u("parent1Email", existing.parent1_email);
      if (existing.parent1_phone) u("parent1Phone", existing.parent1_phone);
    }
  }, [children]);

  const submit = async () => {
    if (!f.childFirstName || !f.parent1Name) return;
    try {
      setSaving(true);
      // Find tenant from existing child
      const child = children[0];
      const tenantId = child?.tenant_id || localStorage.getItem("c360_tenant");
      await API("/api/enrolment/apply", { method:"POST", body: { ...f, tenantId }}).catch(() => {});
      setSaving(false);
      setDone(true);
      onSaved();
    } catch(e) { console.error('API error:', e); }
  };

  const Field = ({ label, name, type = "text", placeholder = "", required = false }) => (
    <div>
      <label style={lbl}>{label}{required && <span style={{ color:"#B45960" }}> *</span>}</label>
      {type === "date"
        ? <DatePicker value={f[name]||""} onChange={v => u(name, v)} />
        : <input type={type} style={inp} value={f[name]||""} onChange={e => u(name, e.target.value)} placeholder={placeholder} />}
    </div>
  );
  const Check = ({ label, name }) => (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
      <input type="checkbox" id={`ck_${name}`} checked={!!f[name]} onChange={e => u(name, e.target.checked)} style={{ width:16, height:16 }} />
      <label htmlFor={`ck_${name}`} style={{ fontSize:12, color:"#3D3248", cursor:"pointer" }}>{label}</label>
    </div>
  );
  const G2 = ({ children: ch }) => <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>{ch}</div>;
  const G3 = ({ children: ch }) => <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>{ch}</div>;

  if (done) return (
    <div style={{ ...card, textAlign:"center", padding:"40px 20px", background:"linear-gradient(135deg,#EDF8F3,#F0EBF8)" }}>
      <div style={{ fontSize:52, marginBottom:16 }}>🎉</div>
      <h3 style={{ margin:"0 0 8px", color:"#3D3248" }}>Application Submitted!</h3>
      <p style={{ color:"#8A7F96", fontSize:13 }}>We've received your enrolment application and will be in touch shortly to confirm placement for {f.childFirstName}.</p>
      <button onClick={() => { setDone(false); setStep(1); setF(blank); }} style={{ ...btnP, marginTop:16 }}>Submit Another</button>
    </div>
  );

  const stepLabels = ["Child Details","Parent Info","Medical & Consents","Review & Submit"];
  const dots = (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:24, padding:"12px 16px", background:"#fff", borderRadius:12, border:"1px solid #EDE8F4" }}>
      {stepLabels.map((l, i) => {
        const n = i + 1;
        return (
          <div key={n} style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:26, height:26, borderRadius:"50%", background:step>=n?purple:"#EDE8F4", color:step>=n?"#fff":"#9A8FB0", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, flexShrink:0 }}>{step>n?"✓":n}</div>
            <span style={{ fontSize:11, fontWeight:step===n?700:500, color:step===n?purple:"#8A7F96", whiteSpace:"nowrap" }}>{l}</span>
            {i<3 && <div style={{ width:16, height:2, background:step>n?purple+"40":"#EDE8F4" }} />}
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ maxWidth:800, margin:"0 auto" }}>
      {children.length > 0 && (
        <div style={{ ...card, background:"#EDF8F3", border:"1px solid #A5D6A7", marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#2E7D32", marginBottom:4 }}>👨‍👩‍👧 Enrolling a sibling?</div>
          <div style={{ fontSize:12, color:"#4A7A5A" }}>We've pre-filled your contact details from {children.map(c=>c.first_name).join(", ")}'s enrolment. Just fill in the new child's details.</div>
        </div>
      )}

      {dots}

      {step === 1 && (
        <div style={card}>
          <h4 style={{ margin:"0 0 16px", fontSize:14, fontWeight:800 }}>🧒 Child Information</h4>
          <G2>
            <Field label="First Name" name="childFirstName" required placeholder="e.g. Sophie" />
            <Field label="Last Name" name="childLastName" placeholder="e.g. Thompson" />
            <Field label="Date of Birth" name="childDob" type="date" required />
            <div>
              <label style={lbl}>Gender</label>
              <select style={inp} value={f.childGender} onChange={e=>u("childGender",e.target.value)}>
                <option value="">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="non_binary">Non-binary</option>
              </select>
            </div>
            <Field label="Home Language" name="childLanguage" placeholder="e.g. English, Arabic" />
            <div>
              <label style={lbl}>Aboriginal or Torres Strait Islander?</label>
              <select style={inp} value={f.childIndigenous} onChange={e=>u("childIndigenous",e.target.value)}>
                <option value="no">No</option>
                <option value="aboriginal">Aboriginal</option>
                <option value="torres_strait">Torres Strait Islander</option>
                <option value="both">Both</option>
                <option value="prefer_not">Prefer not to say</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Preferred Room</label>
              <select style={inp} value={f.preferredRoom} onChange={e=>u("preferredRoom",e.target.value)}>
                <option value="">No preference</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <Field label="Preferred Start Date" name="preferredStartDate" type="date" />
          </G2>
          <div style={{ marginTop:14 }}>
            <label style={lbl}>Preferred Attendance Days</label>
            <div style={{ display:"flex", gap:8 }}>
              {DAYS.map(d => <button key={d} onClick={() => u("preferredDays", f.preferredDays.includes(d) ? f.preferredDays.filter(x=>x!==d) : [...f.preferredDays, d])} style={{ padding:"6px 14px", borderRadius:20, border:`2px solid ${f.preferredDays.includes(d)?purple:"#DDD6EE"}`, background:f.preferredDays.includes(d)?lp:"#fff", color:f.preferredDays.includes(d)?purple:"#6B5F7A", cursor:"pointer", fontSize:12, fontWeight:f.preferredDays.includes(d)?700:500 }}>{d.slice(0,3)}</button>)}
            </div>
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:18 }}>
            <button onClick={() => setStep(2)} disabled={!f.childFirstName||!f.childDob} style={{ ...btnP, opacity:!f.childFirstName||!f.childDob?0.5:1 }}>Next →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={card}>
            <h4 style={{ margin:"0 0 16px", fontSize:14, fontWeight:800 }}>👤 Parent / Guardian 1</h4>
            <G3>
              <Field label="Full Name" name="parent1Name" required placeholder="e.g. Sarah Thompson" />
              <Field label="Email" name="parent1Email" type="email" placeholder="sarah@example.com" />
              <Field label="Mobile Phone" name="parent1Phone" placeholder="04xx xxx xxx" />
              <div style={{ gridColumn:"span 3" }}><Field label="Home Address" name="parent1Address" placeholder="123 Beach Rd, Cronulla NSW 2230" /></div>
              <Field label="Employer" name="parent1Employer" placeholder="e.g. NSW Health" />
              <Field label="CRN (Centrelink)" name="parent1Crn" placeholder="xxx xxx xxxX" />
            </G3>
          </div>
          <div style={card}>
            <h4 style={{ margin:"0 0 8px", fontSize:14, fontWeight:800 }}>👤 Parent / Guardian 2 <span style={{ fontSize:11, fontWeight:400, color:"#9A8FB0" }}>(optional)</span></h4>
            <G3>
              <Field label="Full Name" name="parent2Name" placeholder="e.g. Mark Thompson" />
              <Field label="Email" name="parent2Email" type="email" />
              <Field label="Mobile Phone" name="parent2Phone" placeholder="04xx xxx xxx" />
            </G3>
          </div>
          <div style={card}>
            <h4 style={{ margin:"0 0 14px", fontSize:14, fontWeight:800 }}>🚨 Emergency Contacts</h4>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:"#3D3248", marginBottom:10 }}>Emergency Contact 1</div>
                <Field label="Name" name="emergency1Name" placeholder="e.g. Grandma Mary" />
                <Field label="Phone" name="emergency1Phone" placeholder="04xx xxx xxx" />
                <Field label="Relationship" name="emergency1Relationship" placeholder="e.g. Grandmother" />
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:"#3D3248", marginBottom:10 }}>Emergency Contact 2</div>
                <Field label="Name" name="emergency2Name" placeholder="e.g. Uncle John" />
                <Field label="Phone" name="emergency2Phone" placeholder="04xx xxx xxx" />
                <Field label="Relationship" name="emergency2Relationship" placeholder="e.g. Uncle" />
              </div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
            <button onClick={() => setStep(1)} style={btnS}>← Back</button>
            <button onClick={() => setStep(3)} disabled={!f.parent1Name} style={{ ...btnP, opacity:!f.parent1Name?0.5:1 }}>Next →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <div style={card}>
            <h4 style={{ margin:"0 0 16px", fontSize:14, fontWeight:800 }}>🏥 Medical Information</h4>
            <G3>
              <Field label="Known Allergies" name="childAllergies" placeholder="e.g. Peanuts, None" />
              <Field label="Dietary Requirements" name="childDietary" placeholder="e.g. Vegetarian, None" />
              <Field label="Medical Conditions" name="childMedicalConditions" placeholder="e.g. Asthma, None" />
              <Field label="Family Doctor" name="doctorName" placeholder="e.g. Dr Jane Smith" />
              <Field label="Doctor Phone" name="doctorPhone" placeholder="02 xxxx xxxx" />
              <Field label="Medicare Number" name="medicareNumber" placeholder="xxxx xxxxx x" />
            </G3>
          </div>
          <div style={card}>
            <h4 style={{ margin:"0 0 14px", fontSize:14, fontWeight:800 }}>✅ Permissions & Consents</h4>
            <Check label="I authorise centre staff to administer first aid and seek medical treatment in an emergency" name="authorisedMedical" />
            <Check label="I authorise centre staff to call an ambulance if required (fees apply)" name="authorisedAmbulance" />
            <Check label="Centre may apply SPF 50+ sunscreen to my child" name="sunscreenConsent" />
            <Check label="Photos/videos of my child may be used for educational documentation and centre communications" name="photoConsent" />
            <Check label="My child may participate in approved excursions (specific permission obtained for each excursion)" name="excursionConsent" />
          </div>
          <div style={card}>
            <Check label="There are current Family Court Orders or parenting plans relating to this child" name="familyCourtOrders" />
            {f.familyCourtOrders && (
              <div style={{ marginTop:10 }}>
                <label style={lbl}>Court Order Details</label>
                <textarea style={{ ...inp, height:80, resize:"vertical" }} value={f.courtOrderDetails} onChange={e=>u("courtOrderDetails",e.target.value)} placeholder="Please describe the relevant orders. You will be asked to provide a copy to the centre." />
              </div>
            )}
          </div>
          <div style={card}>
            <label style={lbl}>Additional Notes (optional)</label>
            <textarea style={{ ...inp, height:80, resize:"vertical" }} value={f.additionalNotes} onChange={e=>u("additionalNotes",e.target.value)} placeholder="Anything else we should know about your child…" />
          </div>
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
            <button onClick={() => setStep(2)} style={btnS}>← Back</button>
            <button onClick={() => setStep(4)} style={btnP()}>Review Application →</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <div style={{ ...card, background:"linear-gradient(135deg,#EDE4F5,#E4EEF5)", border:`1px solid ${purple}30` }}>
            <h4 style={{ margin:"0 0 4px", fontSize:16, fontWeight:800 }}>📋 Application Summary</h4>
            <p style={{ margin:"0 0 16px", fontSize:12, color:"#5C4E6A" }}>Please review before submitting. You can go back to make changes.</p>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, fontSize:12 }}>
              <div style={{ padding:"12px 14px", background:"#fff", borderRadius:10 }}>
                <div style={{ fontWeight:800, color:"#3D3248", marginBottom:8 }}>🧒 Child</div>
                <div><strong>{f.childFirstName} {f.childLastName}</strong></div>
                <div style={{ color:"#9A8FB0" }}>DOB: {f.childDob} · {f.childGender}</div>
                {f.preferredDays.length>0 && <div style={{ color:"#9A8FB0" }}>Days: {f.preferredDays.map(d=>d.slice(0,3)).join(", ")}</div>}
                {f.preferredStartDate && <div style={{ color:"#9A8FB0" }}>Start: {f.preferredStartDate}</div>}
              </div>
              <div style={{ padding:"12px 14px", background:"#fff", borderRadius:10 }}>
                <div style={{ fontWeight:800, color:"#3D3248", marginBottom:8 }}>👤 Parent</div>
                <div><strong>{f.parent1Name}</strong></div>
                <div style={{ color:"#9A8FB0" }}>{f.parent1Email}</div>
                <div style={{ color:"#9A8FB0" }}>{f.parent1Phone}</div>
                {f.parent2Name && <div style={{ color:"#9A8FB0", marginTop:4 }}>+{f.parent2Name}</div>}
              </div>
              <div style={{ padding:"12px 14px", background:"#fff", borderRadius:10 }}>
                <div style={{ fontWeight:800, color:"#3D3248", marginBottom:8 }}>🏥 Medical</div>
                <div style={{ color:"#9A8FB0" }}>Allergies: {f.childAllergies}</div>
                <div style={{ color:"#9A8FB0" }}>Diet: {f.childDietary}</div>
                {f.childMedicalConditions && <div style={{ color:"#9A8FB0" }}>Medical: {f.childMedicalConditions}</div>}
              </div>
              <div style={{ padding:"12px 14px", background:"#fff", borderRadius:10 }}>
                <div style={{ fontWeight:800, color:"#3D3248", marginBottom:8 }}>✅ Consents</div>
                {[["authorisedMedical","Medical treatment"],["authorisedAmbulance","Ambulance"],["sunscreenConsent","Sunscreen"],["photoConsent","Photos"],["excursionConsent","Excursions"]].map(([k,l]) => (
                  <div key={k} style={{ color:f[k]?"#4A7A5A":"#B45960", fontWeight:f[k]?500:700 }}>{f[k]?"✓":"✗"} {l}</div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:16 }}>
            <button onClick={() => setStep(3)} style={btnS}>← Back</button>
            <button onClick={submit} disabled={saving} style={btnP()}>{saving?"Submitting…":"✓ Submit Application"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
