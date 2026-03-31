import DatePicker from "./DatePicker.jsx";
import { useState, useEffect, useCallback } from "react";
const API = (path, opts={}) => { const t=localStorage.getItem("c360_token"); return fetch(path, {method:opts.method||"GET",headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(opts.headers||{})},body:opts.body?JSON.stringify(opts.body):undefined}).then(r=>r.json()); };
const Inp = ({label, type, ...p}) => (<div style={{marginBottom:10}}><label style={{display:"block",fontSize:11,color:"#8A7F96",marginBottom:3,fontWeight:600}}>{label}</label>{type==="date"?<DatePicker value={p.value||""} onChange={p.onChange} min={p.min} max={p.max} />:<input type={type} {...p} style={{width:"100%",padding:"10px 12px",background:"#F8F5F1",border:"1px solid #D9D0C7",borderRadius:10,color:"#3D3248",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}} />}</div>);
const Sel = ({label,children,...p}) => (<div style={{marginBottom:10}}><label style={{display:"block",fontSize:11,color:"#8A7F96",marginBottom:3,fontWeight:600}}>{label}</label><select {...p} style={{width:"100%",padding:"10px 12px",background:"#F8F5F1",border:"1px solid #D9D0C7",borderRadius:10,color:"#3D3248",fontSize:13,boxSizing:"border-box",transition:"border-color 0.2s",...(p.style||{})}}>{children}</select></div>);
const Btn = ({primary,small,...p}) => (<button {...p} style={{padding:small?"6px 14px":"10px 18px",background:primary?"linear-gradient(135deg, #8B6DAF, #9B7DC0)":"#F8F5F1",color:primary?"#fff":"#5C4E6A",border:primary?"none":"1px solid #D9D0C7",borderRadius:10,cursor:"pointer",fontSize:small?12:13,fontWeight:700,boxShadow:primary?"0 3px 10px rgba(139,109,175,0.2)":"none",transition:"all 0.2s ease",...(p.style||{})}} />);
const Card = ({children,...p}) => <div style={{background:"#FFFFFF",border:"1px solid #E8E0D8",borderRadius:14,padding:14,marginBottom:8,boxShadow:"0 2px 12px rgba(80,60,90,0.04)",transition:"all 0.25s ease",...(p.style||{})}} {...p}>{children}</div>;
const $= n => `$${(+n||0).toFixed(2)}`;

const toast = (msg, type = "success") => { if (window.showToast) window.showToast(msg, type); };

export function InvoicingDashboard({ children: kids }) {
  const [tab, setTab] = useState("overview");
  const [summary, setSummary] = useState({});
  const [invoices, setInvoices] = useState([]);
  const [fees, setFees] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s,i,f] = await Promise.all([API("/api/invoicing/summary"), API("/api/invoicing/invoices"), API("/api/invoicing/fee-schedules")]);
      setSummary(s||{}); setInvoices(Array.isArray(i)?i:[]); setFees(Array.isArray(f)?f:[]);
    } catch(e) { console.error('Invoicing load error:', e); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{padding:24}}>
      <h2 style={{margin:"0 0 4px",color:"#3D3248",fontSize:22,fontWeight:700}}>💰 Invoicing & CCS</h2>
      <p style={{margin:"0 0 20px",color:"#8A7F96",fontSize:13}}>Fee management with Child Care Subsidy calculations</p>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        {[{l:"Monthly Fees",v:$(summary.monthlyFees),c:"#3D3248"},{l:"CCS Subsidies",v:$(summary.monthlyCCS),c:"#6BA38B"},{l:"Parent Gap",v:$(summary.monthlyGap),c:"#D4A26A"},{l:"Outstanding",v:$(summary.outstanding),c:summary.outstanding>0?"#C9828A":"#6BA38B"}].map((c,i) =>
          <Card key={i} style={{padding:"14px 18px"}}><div style={{fontSize:22,fontWeight:700,color:c.c}}>{c.v}</div><div style={{fontSize:12,color:"#8A7F96",marginTop:4}}>{c.l}</div></Card>)}
      </div>

      <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:"1px solid #E8E0D8",paddingBottom:8}}>
        {["overview","generate","ccs-calc","fees","payments"].map(t =>
          <button key={t} onClick={()=>setTab(t)} style={{padding:"8px 16px",border:"none",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600,background:tab===t?"#8B6DAF20":"transparent",color:tab===t?"#A88BC7":"#8A7F96"}}>{
            {overview:"Invoices",generate:"Generate Invoice","ccs-calc":"CCS Calculator",fees:"Fee Schedules",payments:"Payments"}[t]}</button>)}
      </div>

      {loading ? <div style={{textAlign:"center",padding:40,color:"#8A7F96"}}>Loading...</div> :
        tab==="overview" ? <InvoicesTab invoices={invoices} onRefresh={load} /> :
        tab==="generate" ? <GenerateTab kids={kids} onRefresh={load} /> :
        tab==="ccs-calc" ? <CCSCalcTab /> :
        tab==="fees" ? <FeesTab fees={fees} onRefresh={load} /> :
        tab==="payments" ? <PaymentsTab invoices={invoices} onRefresh={load} /> :
        null}
    </div>
  );
}

function InvoicesTab({ invoices, onRefresh }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const stC = {draft:"#A89DB5",issued:"#D4A26A",partial:"#9B7DC0",paid:"#6BA38B",overdue:"#C9828A"};
  const stBg = {draft:"#F5F5F5",issued:"#FFF6E8",partial:"#F3EEFF",paid:"#E8F5E9",overdue:"#FFEBEE"};

  const filtered = invoices
    .filter(i => filter==="all" || i.status===filter)
    .filter(i => !search || `${i.child_name||""} ${i.invoice_number||""}`.toLowerCase().includes(search.toLowerCase()));

  const totals = {
    total: filtered.reduce((s,i) => s+(i.total_fee||0), 0),
    paid:  filtered.reduce((s,i) => s+(i.amount_paid||0), 0),
    due:   filtered.reduce((s,i) => s+(i.parent_gap||0)-(i.amount_paid||0), 0),
  };

  const pay = async (id, amount) => {
    try {
      const r = await API("/api/invoicing/payments",{method:"POST",body:{invoiceId:id,amount,method:"card"}});
      if (r.error) { toast(r.error, "error"); return; }
      onRefresh();
    } catch(e) { alert("Payment failed: " + e.message); }
  };

  const exportCSV = () => {
    const rows=[["Invoice #","Child","Period","Total Fee","CCS","Gap Fee","Paid","Status"]];
    filtered.forEach(i=>rows.push([i.invoice_number||"",i.child_name||"",`${i.period_start||""}–${i.period_end||""}`,"$"+((i.total_fee||0)/100).toFixed(2),"$"+((i.ccs_amount||0)/100).toFixed(2),"$"+((i.parent_gap||0)/100).toFixed(2),"$"+((i.amount_paid||0)/100).toFixed(2),i.status||""]));
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);a.download="invoices.csv";a.click();
  };
  const $ = cents => cents != null ? `$${(cents/100).toFixed(2)}` : "—";
  return (<div>
    {/* Summary totals */}
    {filtered.length > 0 && (
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
        {[["Total Fees",totals.total,"#3D3248"],["Total Paid",totals.paid,"#2E7D32"],["Outstanding",Math.max(0,totals.due),"#E65100"]].map(([l,v,c])=>(
          <div key={l} style={{background:"#fff",borderRadius:10,border:"1px solid #EDE8F4",padding:"10px 14px",textAlign:"center"}}>
            <div style={{fontSize:16,fontWeight:800,color:c}}>${(v/100).toFixed(0)}</div>
            <div style={{fontSize:10,color:"#8A7F96",fontWeight:600}}>{l}</div>
          </div>
        ))}
      </div>
    )}
    {/* Toolbar */}
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search child / invoice #…"
        style={{padding:"6px 10px",borderRadius:7,border:"1px solid #DDD6EE",fontSize:12,flex:1,minWidth:120}}/>
      {["all","issued","partial","paid","overdue"].map(v => (
        <button key={v} onClick={()=>setFilter(v)} style={{padding:"5px 12px",border:`1px solid ${filter===v?"#8B6DAF":"#D9D0C7"}`,borderRadius:6,cursor:"pointer",fontSize:11,background:filter===v?"#8B6DAF20":"transparent",color:filter===v?"#A88BC7":"#8A7F96"}}>
          {v==="all"?"All":v.charAt(0).toUpperCase()+v.slice(1)}
        </button>
      ))}
      <button onClick={exportCSV} style={{padding:"5px 12px",borderRadius:6,border:"1px solid #A5D6A7",background:"#E8F5E9",color:"#2E7D32",cursor:"pointer",fontSize:11,fontWeight:700}}>⬇ CSV</button>
    </div>
    {filtered.length===0 ? <div style={{textAlign:"center",padding:40,color:"#A89DB5"}}>No invoices</div> :
      filtered.map(inv=><Card key={inv.id} style={{padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <div><span style={{fontWeight:700,color:"#3D3248",fontSize:14}}>{inv.invoice_number}</span> <span style={{fontSize:12,color:"#8A7F96"}}>· {inv.first_name} {inv.last_name}</span></div>
          <span style={{padding:"2px 10px",borderRadius:4,fontSize:10,fontWeight:700,background:(stC[inv.status]||"#A89DB5")+"20",color:stC[inv.status]||"#A89DB5"}}>{inv.status?.toUpperCase()}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,fontSize:12,color:"#5C4E6A"}}>
          <div><div style={{color:"#8A7F96",fontSize:10}}>Period</div>{inv.period_start} → {inv.period_end}</div>
          <div><div style={{color:"#8A7F96",fontSize:10}}>Total Fees</div>{$(inv.total_fee)}</div>
          <div><div style={{color:"#8A7F96",fontSize:10}}>CCS</div><span style={{color:"#6BA38B"}}>{$(inv.ccs_amount)}</span></div>
          <div><div style={{color:"#8A7F96",fontSize:10}}>Gap (Due)</div><span style={{fontWeight:600}}>{$(inv.amount_due)}</span></div>
          <div><div style={{color:"#8A7F96",fontSize:10}}>Paid</div><span style={{color:"#6BA38B"}}>{$(inv.amount_paid)}</span></div>
        </div>
        {inv.status!=="paid"&&inv.status!=="draft" && (
          <div style={{marginTop:8,display:"flex",gap:8,justifyContent:"flex-end",alignItems:"center"}}>
            <button onClick={async()=>{
              const r=await API(`/api/invoicing/invoices/${inv.id}/email`,{method:"POST"});
              if(r.ok){toast(`Invoice emailed to ${r.sent_to} ✓`);}
              else{toast(r.error||"Email failed","error");}
            }} style={{padding:"5px 12px",borderRadius:7,border:"1px solid #90CAF9",background:"#E3F2FD",color:"#1565C0",cursor:"pointer",fontWeight:600,fontSize:11}}>
              📧 Email
            </button>
            <Btn small primary onClick={()=>pay(inv.id,inv.amount_due-inv.amount_paid)}>Record Payment</Btn>
          </div>
        )}
      </Card>)}
  </div>);
}

function GenerateTab({ kids, onRefresh }) {
  const [mode, setMode] = useState("single");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkStart, setBulkStart] = useState("");
  const [bulkEnd, setBulkEnd] = useState("");
  const [selectedKids, setSelectedKids] = useState([]);
  // Original single state
  const [childId, setChildId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [result, setResult] = useState(null);
  const [genLoading, setGenLoading] = useState(false);
  const [genErr, setGenErr] = useState("");

  const gen = async () => {
    if (!childId) { setGenErr("Please select a child."); return; }
    if (!start||!end) { setGenErr("Please enter a period start and end date."); return; }
    setGenLoading(true); setGenErr("");
    try {
      const r = await API("/api/invoicing/generate-invoice",{method:"POST",body:{childId,periodStart:start,periodEnd:end}});
      if (r.error) { setGenErr(r.error); } else { setResult(r); onRefresh(); }
    } catch(e) { setGenErr("Failed to generate invoice: " + e.message); }
    setGenLoading(false);
  };

  const bulkGenerate = async () => {
    if (!bulkStart || !bulkEnd) { if(window.showToast) window.showToast("Please set a period","error"); return; }
    const targets = selectedKids.length > 0 ? selectedKids : kids.map(k=>k.id);
    setBulkLoading(true); setBulkResult(null);
    let created=0, errors=0;
    for (const cid of targets) {
      try {
        const r = await API("/api/invoicing/generate-invoice",{method:"POST",body:{childId:cid,periodStart:bulkStart,periodEnd:bulkEnd}});
        if(r.invoiceNumber) created++; else errors++;
      } catch(e){ errors++; }
    }
    setBulkResult({created,errors,total:targets.length});
    setBulkLoading(false); onRefresh();
    if(window.showToast) window.showToast(`${created} invoice${created!==1?"s":""} generated`);
  };

  const $ = n => `$${(+n||0).toFixed(2)}`;

  return (<div>
    <div style={{display:"flex",gap:8,marginBottom:16}}>
      {[["single","Single Invoice"],["bulk","Bulk Generate"]].map(([id,l])=>(
        <button key={id} onClick={()=>setMode(id)} style={{padding:"8px 18px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:mode===id?700:500,fontSize:12,background:mode===id?"#8B6DAF":"#EDE8F4",color:mode===id?"#fff":"#6B5F7A"}}>{l}</button>
      ))}
    </div>

    {mode==="bulk"&&(
      <Card style={{padding:20}}>
        <h3 style={{margin:"0 0 10px",color:"#3D3248",fontSize:15}}>Bulk Invoice Generation</h3>
        <p style={{margin:"0 0 14px",fontSize:12,color:"#8A7F96"}}>Generate invoices for all children or a selected group.</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <Inp label="Period Start" type="date" value={bulkStart} onChange={e=>setBulkStart(e.target.value)}/>
          <Inp label="Period End" type="date" value={bulkEnd} onChange={e=>setBulkEnd(e.target.value)}/>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:10,fontWeight:700,color:"#8A7F96",display:"block",marginBottom:6,textTransform:"uppercase"}}>Children (leave blank = all)</label>
          <div style={{maxHeight:160,overflowY:"auto",border:"1px solid #EDE8F4",borderRadius:8,padding:8}}>
            {(kids||[]).map(k=>(
              <label key={k.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",cursor:"pointer",borderRadius:6}}>
                <input type="checkbox" checked={selectedKids.includes(k.id)} onChange={e=>setSelectedKids(p=>e.target.checked?[...p,k.id]:p.filter(x=>x!==k.id))}/>
                <span style={{fontSize:13}}>{k.first_name} {k.last_name}</span>
              </label>
            ))}
          </div>
          <div style={{fontSize:11,color:"#8A7F96",marginTop:3}}>{selectedKids.length>0?`${selectedKids.length} selected`:`All ${(kids||[]).length} children`}</div>
        </div>
        {bulkResult&&(
          <div style={{padding:"10px 14px",borderRadius:8,background:bulkResult.errors>0?"#FFF3E0":"#E8F5E9",marginBottom:12,fontSize:12}}>
            ✅ {bulkResult.created} invoice{bulkResult.created!==1?"s":""} generated{bulkResult.errors>0&&<span style={{color:"#E65100"}}> · {bulkResult.errors} failed</span>}
          </div>
        )}
        <Btn primary onClick={bulkGenerate} disabled={bulkLoading}>
          {bulkLoading?"Generating…":`Generate for ${selectedKids.length>0?selectedKids.length:(kids||[]).length} Children`}
        </Btn>
      </Card>
    )}

    {mode==="single"&&(
      <Card style={{padding:20}}>
        <h3 style={{margin:"0 0 12px",color:"#3D3248",fontSize:16}}>Generate Invoice</h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          <Sel label="Child" value={childId} onChange={e=>setChildId(e.target.value)}><option value="">Select child...</option>{(kids||[]).map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}</Sel>
          <Inp label="Period Start" type="date" value={start} onChange={e=>setStart(e.target.value)}/>
          <Inp label="Period End" type="date" value={end} onChange={e=>setEnd(e.target.value)}/>
        </div>
        {genErr&&<div style={{color:"#C9828A",fontSize:12,padding:"6px 10px",background:"#FEF2F2",borderRadius:6,marginBottom:8}}>{genErr}</div>}
        <Btn primary onClick={gen} disabled={genLoading} style={{marginTop:8}}>{genLoading?"Generating...":"Generate Invoice"}</Btn>
      </Card>
    )}

    {result&&mode==="single"&&<Card style={{marginTop:12,padding:16,background:"#6BA38B10",borderColor:"#6BA38B30"}}>
      <div style={{fontWeight:700,color:"#6BA38B",fontSize:14,marginBottom:8}}>✓ Invoice Generated: {result.invoiceNumber}</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,fontSize:13,color:"#3D3248"}}>
        <div>Total Fees: <b>{$(result.totalFee)}</b></div>
        <div>CCS Subsidy: <b style={{color:"#6BA38B"}}>{$(result.ccsAmount)}</b></div>
        <div>Parent Gap: <b style={{color:"#D4A26A"}}>{$(result.gapFee)}</b></div>
      </div>
      <div style={{fontSize:12,color:"#8A7F96",marginTop:6}}>Due: {result.dueDate}</div>
    </Card>}
  </div>);
}

function CCSCalcTab() {
  const [f, setF] = useState({familyIncome:85000,dailyFee:150,sessionHours:11,daysPerWeek:3,secondChild:false});
  const [r, setR] = useState(null);
  const calc = async () => { setR(await API("/api/invoicing/ccs-calculate",{method:"POST",body:f})); };
  return (<div>
    <Card style={{padding:20}}>
      <h3 style={{margin:"0 0 12px",color:"#3D3248",fontSize:16}}>🇦🇺 CCS Calculator (FY2025-26)</h3>
      <p style={{fontSize:12,color:"#8A7F96",margin:"0 0 14px"}}>Estimate Child Care Subsidy based on family income. Hourly cap: $14.63. Rate: 90% ≤$85,279 reducing 1% per $5,000.</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        <Inp label="Family Income ($)" type="number" value={f.familyIncome} onChange={e=>setF({...f,familyIncome:+e.target.value})} />
        <Inp label="Daily Fee ($)" type="number" value={f.dailyFee} onChange={e=>setF({...f,dailyFee:+e.target.value})} />
        <Inp label="Session Hours" type="number" value={f.sessionHours} onChange={e=>setF({...f,sessionHours:+e.target.value})} />
        <Inp label="Days per Week" type="number" value={f.daysPerWeek} onChange={e=>setF({...f,daysPerWeek:+e.target.value})} />
        <div style={{marginBottom:10,display:"flex",alignItems:"end"}}><label style={{fontSize:12,color:"#8A7F96",display:"flex",alignItems:"center",gap:6}}><input type="checkbox" checked={f.secondChild} onChange={e=>setF({...f,secondChild:e.target.checked})} /> 2nd/younger child (higher rate)</label></div>
      </div>
      <Btn primary onClick={calc} style={{marginTop:8}}>Calculate CCS</Btn>
    </Card>
    {r && <Card style={{marginTop:12,padding:20}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:32,fontWeight:700,color:"#8B6DAF"}}>{r.ccsPercentage}%</div><div style={{fontSize:12,color:"#8A7F96"}}>CCS Rate</div></div>
        <div style={{textAlign:"center"}}><div style={{fontSize:32,fontWeight:700,color:"#6BA38B"}}>{$(r.dailyCCS)}</div><div style={{fontSize:12,color:"#8A7F96"}}>Daily CCS</div></div>
        <div style={{textAlign:"center"}}><div style={{fontSize:32,fontWeight:700,color:"#D4A26A"}}>{$(r.dailyGap)}</div><div style={{fontSize:12,color:"#8A7F96"}}>Daily Gap (you pay)</div></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginTop:16,fontSize:13,color:"#5C4E6A"}}>
        <div><div style={{color:"#8A7F96",fontSize:10}}>Hourly Rate</div>{$(r.hourlyRate)}</div>
        <div><div style={{color:"#8A7F96",fontSize:10}}>Capped Rate</div>{$(r.cappedRate)}</div>
        <div><div style={{color:"#8A7F96",fontSize:10}}>Weekly Gap</div><b style={{color:"#D4A26A"}}>{$(r.weeklyGap)}</b></div>
        <div><div style={{color:"#8A7F96",fontSize:10}}>Annual Gap (est)</div><b style={{color:"#D4A26A"}}>{$(r.annualGap)}</b></div>
      </div>
      <p style={{fontSize:11,color:"#A89DB5",marginTop:12,margin:"12px 0 0"}}>* Estimate only. Actual CCS determined by Services Australia. From Jan 2026: 3-Day Guarantee = min 72hrs subsidised care/fortnight for all eligible families.</p>
    </Card>}
  </div>);
}

function FeesTab({ fees, onRefresh }) {
  const [show, setShow] = useState(false);
  const [f, setF] = useState({name:"",dailyFee:150,sessionHours:11,effectiveFrom:""});
  const add = async () => {
    if (!f.name) { toast("Fee schedule name is required.", "error"); return; }
    try {
      const r = await API("/api/invoicing/fee-schedules",{method:"POST",body:f});
      if (r.error) { toast(r.error, 'error'); return; }
      setShow(false); onRefresh();
    } catch(e) { toast("Failed to save fee schedule.", "error"); }
  };
  return (<div>
    <Btn small primary onClick={()=>setShow(!show)} style={{marginBottom:12}}>+ Add Fee Schedule</Btn>
    {show && <Card style={{background:"#F8F5F1",borderColor:"#D9D0C7",padding:14,marginBottom:12}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
        <Inp label="Name" value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="e.g. Standard Day" />
        <Inp label="Daily Fee ($)" type="number" value={f.dailyFee} onChange={e=>setF({...f,dailyFee:+e.target.value})} />
        <Inp label="Session Hours" type="number" value={f.sessionHours} onChange={e=>setF({...f,sessionHours:+e.target.value})} />
        <Inp label="Effective From" type="date" value={f.effectiveFrom} onChange={e=>setF({...f,effectiveFrom:e.target.value})} />
      </div>
      <div style={{display:"flex",gap:8,marginTop:6}}><Btn small primary onClick={add}>Save</Btn><Btn small onClick={()=>setShow(false)}>Cancel</Btn></div>
    </Card>}
    {fees.length===0 ? (
      <div style={{textAlign:"center",padding:"32px 24px",background:"#FFF9F0",borderRadius:14,border:"1px dashed #F0C070",marginBottom:16}}>
        <div style={{fontSize:28,marginBottom:8}}>💰</div>
        <div style={{fontWeight:700,color:"#3D3248",marginBottom:6}}>No fee schedules yet</div>
        <div style={{fontSize:12,color:"#8A7F96",marginBottom:16,maxWidth:360,margin:"0 auto 16px"}}>
          Add a fee schedule to enable invoicing and CCS subsidy calculations. You can create different schedules for different rooms or session types.
        </div>
        <div style={{background:"#fff",borderRadius:10,padding:"12px 16px",textAlign:"left",maxWidth:360,margin:"0 auto",fontSize:12,color:"#5C4E6A"}}>
          <div style={{fontWeight:700,marginBottom:8}}>💡 Quick setup</div>
          <div>1. Enter a name (e.g. "Full Day — Standard")</div>
          <div>2. Set your daily fee (e.g. $150)</div>
          <div>3. Set session hours (typically 10–11 hrs)</div>
          <div>4. Click Save — then generate invoices</div>
        </div>
      </div>
    ) :
      fees.map(f=>(
        <Card key={f.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px"}}>
          <span style={{fontSize:16}}>💰</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:600,color:"#3D3248",fontSize:13}}>{f.name}</div>
            <div style={{fontSize:11,color:"#8A7F96"}}>
              ${f.daily_fee}/day · {f.session_hours}hr session · ${(f.daily_fee/f.session_hours).toFixed(2)}/hr
              {f.effective_from&&` · From ${f.effective_from}`}
              {f.room_id&&` · Room-specific`}
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexShrink:0}}>
            <span style={{fontSize:11,padding:"3px 8px",borderRadius:20,background:"#E8F5E9",color:"#2E7D32",fontWeight:600}}>Active</span>
            <button onClick={async()=>{
              if(!window.confirm("Remove this fee schedule?")) return;
              try{ await API(`/api/invoicing/fee-schedules/${f.id}`,{method:"DELETE"}); toast("Fee schedule removed"); onRefresh(); }
              catch(e){ toast("Failed to remove","error"); }
            }} style={{padding:"3px 8px",borderRadius:6,border:"1px solid #FFCDD2",background:"#FFF5F5",color:"#C06B73",cursor:"pointer",fontSize:11,fontWeight:600}}>
              Remove
            </button>
          </div>
        </Card>
      ))}
  </div>);
}

function PaymentsTab({ invoices, onRefresh }) {
  const [processing, setProcessing] = useState(null);
  const [method, setMethod] = useState("bank_transfer");
  const [amount, setAmount] = useState("");
  const [payingId, setPayingId] = useState(null);
  const $ = n => `$${(+n||0).toFixed(2)}`;

  const outstanding = invoices.filter(i => i.status !== "paid" && i.status !== "cancelled");
  const paid = invoices.filter(i => i.status === "paid");
  const totalOutstanding = outstanding.reduce((s, i) => s + (i.parent_gap || i.total_fee || 0), 0);
  const totalCollected = paid.reduce((s, i) => s + (i.amount_paid || i.parent_gap || 0), 0);

  const recordPayment = async (inv) => {
    const payAmt = parseFloat(amount) || (inv.parent_gap || inv.total_fee || 0);
    setProcessing(inv.id);
    try {
      const r = await API("/api/invoicing/payments", { method: "POST", body: { invoiceId: inv.id, amount: payAmt, method } });
      if (r.error) { toast(r.error, "error"); }
      else { toast(`Payment of $${payAmt.toFixed(2)} recorded`); setPayingId(null); setAmount(""); onRefresh(); }
    } catch(e) { toast("Failed to record payment", "error"); }
    setProcessing(null);
  };

  const purple = "#8B6DAF", lp = "#F0EBF8";
  const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: "20px 24px", marginBottom: 16 };
  const inp = { padding: "8px 12px", borderRadius: 8, border: "1px solid #D9D0C7", fontSize: 13, boxSizing: "border-box", background: "#fff" };

  return (
    <div>
      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        {[
          ["Outstanding", `$${totalOutstanding.toFixed(2)}`, "#E65100", outstanding.length + " invoices"],
          ["Collected (this period)", `$${totalCollected.toFixed(2)}`, "#6BA38B", paid.length + " invoices"],
          ["Collection Rate", outstanding.length + paid.length > 0 ? `${Math.round(paid.length / (outstanding.length + paid.length) * 100)}%` : "—", "#8B6DAF", "by invoice count"],
        ].map(([l, v, c, sub]) => (
          <div key={l} style={{ ...card, padding: "14px 18px", marginBottom: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: c }}>{v}</div>
            <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 2 }}>{l}</div>
            <div style={{ fontSize: 11, color: "#A89DB5", marginTop: 1 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Outstanding invoices */}
      <div style={card}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>Outstanding Invoices</h3>
        {outstanding.length === 0
          ? <div style={{ textAlign: "center", color: "#6BA38B", padding: "24px 0", fontWeight: 600 }}>✓ No outstanding invoices</div>
          : outstanding.map(inv => (
            <div key={inv.id} style={{ padding: "14px", borderRadius: 10, border: "1px solid #EDE8F4", background: "#FDFBF9", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#3D3248" }}>{inv.invoice_number} · {inv.first_name} {inv.last_name}</div>
                  <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 2 }}>Period: {inv.period_start} → {inv.period_end}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Total: <strong>${(inv.total_fee || 0).toFixed(2)}</strong> &nbsp;·&nbsp;
                    CCS: <span style={{ color: "#6BA38B" }}>${(inv.ccs_amount || 0).toFixed(2)}</span> &nbsp;·&nbsp;
                    Gap: <strong style={{ color: "#E65100" }}>${(inv.parent_gap || 0).toFixed(2)}</strong>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {payingId === inv.id ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <select value={method} onChange={e => setMethod(e.target.value)} style={{ ...inp, fontSize: 12, padding: "6px 10px" }}>
                        {["bank_transfer","card","cash","direct_debit","bpay"].map(m => (
                          <option key={m} value={m}>{m.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</option>
                        ))}
                      </select>
                      <input type="text" inputMode="decimal" value={amount || (inv.parent_gap || inv.total_fee || "").toFixed(2)}
                        onChange={e => setAmount(e.target.value)} placeholder={`$${(inv.parent_gap || inv.total_fee || 0).toFixed(2)}`}
                        style={{ ...inp, width: 80, fontSize: 12, padding: "6px 8px" }} />
                      <button onClick={() => recordPayment(inv)} disabled={processing === inv.id}
                        style={{ padding: "6px 14px", background: "#6BA38B", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
                        {processing === inv.id ? "…" : "Record"}
                      </button>
                      <button onClick={() => { setPayingId(null); setAmount(""); }}
                        style={{ padding: "6px 10px", background: lp, color: purple, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setPayingId(inv.id)}
                      style={{ padding: "8px 16px", background: "#6BA38B", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
                      Record Payment
                    </button>
                  )}
                </div>
              </div>
              {inv.due_date && new Date(inv.due_date) < new Date() && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#B71C1C", fontWeight: 600 }}>⚠ Overdue since {inv.due_date}</div>
              )}
            </div>
          ))}
      </div>

      {/* Recent payments */}
      {paid.length > 0 && (
        <div style={card}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>Recent Payments</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #E8E0D8" }}>
                {["Invoice", "Family", "Amount Paid", "Date Paid"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8A7F96", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paid.map(inv => (
                <tr key={inv.id} style={{ borderBottom: "1px solid #F0EBE6" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>{inv.invoice_number}</td>
                  <td style={{ padding: "10px 12px" }}>{inv.first_name} {inv.last_name}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 700, color: "#6BA38B" }}>{$(inv.amount_paid || inv.parent_gap || 0)}</td>
                  <td style={{ padding: "10px 12px", color: "#8A7F96" }}>{inv.paid_at ? new Date(inv.paid_at).toLocaleDateString(undefined) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
