import { useState, useEffect, useCallback } from "react";
const API = (path, opts={}) => { const t=localStorage.getItem("c360_token"); return fetch(path, {method:opts.method||"GET",headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(opts.headers||{})},body:opts.body?JSON.stringify(opts.body):undefined}).then(r=>r.json()); };
const Inp = ({label,...p}) => (<div style={{marginBottom:10}}><label style={{display:"block",fontSize:11,color:"#8A7F96",marginBottom:3,fontWeight:600}}>{label}</label><input {...p} style={{width:"100%",padding:"10px 12px",background:"#F8F5F1",border:"1px solid #D9D0C7",borderRadius:10,color:"#3D3248",fontSize:13,boxSizing:"border-box",transition:"border-color 0.2s, box-shadow 0.2s",...(p.style||{})}} /></div>);
const Sel = ({label,children,...p}) => (<div style={{marginBottom:10}}><label style={{display:"block",fontSize:11,color:"#8A7F96",marginBottom:3,fontWeight:600}}>{label}</label><select {...p} style={{width:"100%",padding:"10px 12px",background:"#F8F5F1",border:"1px solid #D9D0C7",borderRadius:10,color:"#3D3248",fontSize:13,boxSizing:"border-box",transition:"border-color 0.2s",...(p.style||{})}}>{children}</select></div>);
const Btn = ({primary,small,...p}) => (<button {...p} style={{padding:small?"6px 14px":"10px 18px",background:primary?"linear-gradient(135deg, #8B6DAF, #9B7DC0)":"#F8F5F1",color:primary?"#fff":"#5C4E6A",border:primary?"none":"1px solid #D9D0C7",borderRadius:10,cursor:"pointer",fontSize:small?12:13,fontWeight:700,boxShadow:primary?"0 3px 10px rgba(139,109,175,0.2)":"none",transition:"all 0.2s ease",...(p.style||{})}} />);
const Card = ({children,...p}) => <div style={{background:"#FFFFFF",border:"1px solid #E8E0D8",borderRadius:14,padding:14,marginBottom:8,boxShadow:"0 2px 12px rgba(80,60,90,0.04)",transition:"all 0.25s ease",...(p.style||{})}} {...p}>{children}</div>;
const $= n => `$${(+n||0).toFixed(2)}`;

export function InvoicingDashboard({ children: kids }) {
  const [tab, setTab] = useState("overview");
  const [summary, setSummary] = useState({});
  const [invoices, setInvoices] = useState([]);
  const [fees, setFees] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [s,i,f] = await Promise.all([API("/api/invoicing/summary"), API("/api/invoicing/invoices"), API("/api/invoicing/fee-schedules")]);
    setSummary(s||{}); setInvoices(Array.isArray(i)?i:[]); setFees(Array.isArray(f)?f:[]); setLoading(false);
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
        {["overview","generate","ccs-calc","fees"].map(t =>
          <button key={t} onClick={()=>setTab(t)} style={{padding:"8px 16px",border:"none",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600,background:tab===t?"#8B6DAF20":"transparent",color:tab===t?"#A88BC7":"#8A7F96"}}>{
            {overview:"Invoices",generate:"Generate Invoice","ccs-calc":"CCS Calculator",fees:"Fee Schedules"}[t]}</button>)}
      </div>

      {loading ? <div style={{textAlign:"center",padding:40,color:"#8A7F96"}}>Loading...</div> :
        tab==="overview" ? <InvoicesTab invoices={invoices} onRefresh={load} /> :
        tab==="generate" ? <GenerateTab kids={kids} onRefresh={load} /> :
        tab==="ccs-calc" ? <CCSCalcTab /> :
        <FeesTab fees={fees} onRefresh={load} />}
    </div>
  );
}

function InvoicesTab({ invoices, onRefresh }) {
  const [filter, setFilter] = useState("all");
  const f = filter==="all" ? invoices : invoices.filter(i=>i.status===filter);
  const stC = {draft:"#A89DB5",issued:"#D4A26A",partial:"#9B7DC0",paid:"#6BA38B",overdue:"#C9828A"};
  const pay = async (id, amount) => { await API("/api/invoicing/payments",{method:"POST",body:{invoiceId:id,amount,method:"card"}}); onRefresh(); };
  return (<div>
    <div style={{display:"flex",gap:6,marginBottom:12}}>
      {["all","issued","partial","paid","overdue"].map(v => <button key={v} onClick={()=>setFilter(v)} style={{padding:"5px 12px",border:`1px solid ${filter===v?"#8B6DAF":"#D9D0C7"}`,borderRadius:6,cursor:"pointer",fontSize:11,background:filter===v?"#8B6DAF20":"transparent",color:filter===v?"#A88BC7":"#8A7F96"}}>{v==="all"?"All":v.charAt(0).toUpperCase()+v.slice(1)}</button>)}
    </div>
    {f.length===0 ? <div style={{textAlign:"center",padding:40,color:"#A89DB5"}}>No invoices</div> :
      f.map(inv=><Card key={inv.id} style={{padding:14}}>
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
        {inv.status!=="paid"&&inv.status!=="draft" && <div style={{marginTop:8,textAlign:"right"}}><Btn small primary onClick={()=>pay(inv.id,inv.amount_due-inv.amount_paid)}>Record Payment</Btn></div>}
      </Card>)}
  </div>);
}

function GenerateTab({ kids, onRefresh }) {
  const [childId, setChildId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [result, setResult] = useState(null);
  const gen = async () => {
    if (!childId||!start||!end) return;
    const r = await API("/api/invoicing/generate-invoice",{method:"POST",body:{childId,periodStart:start,periodEnd:end}});
    setResult(r); onRefresh();
  };
  return (<div>
    <Card style={{padding:20}}>
      <h3 style={{margin:"0 0 12px",color:"#3D3248",fontSize:16}}>Generate Invoice</h3>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        <Sel label="Child" value={childId} onChange={e=>setChildId(e.target.value)}><option value="">Select child...</option>{(kids||[]).map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}</Sel>
        <Inp label="Period Start" type="date" value={start} onChange={e=>setStart(e.target.value)} />
        <Inp label="Period End" type="date" value={end} onChange={e=>setEnd(e.target.value)} />
      </div>
      <Btn primary onClick={gen} style={{marginTop:8}}>Generate Invoice</Btn>
    </Card>
    {result && <Card style={{marginTop:12,padding:16,background:"#6BA38B10",borderColor:"#6BA38B30"}}>
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
  const add = async () => { await API("/api/invoicing/fee-schedules",{method:"POST",body:f}); setShow(false); onRefresh(); };
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
    {fees.length===0 ? <div style={{textAlign:"center",padding:30,color:"#A89DB5"}}>No fee schedules — add one to start invoicing</div> :
      fees.map(f=><Card key={f.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px"}}>
        <span style={{fontSize:16}}>💰</span>
        <div style={{flex:1}}><div style={{fontWeight:600,color:"#3D3248",fontSize:13}}>{f.name}</div>
          <div style={{fontSize:11,color:"#8A7F96"}}>${f.daily_fee}/day · {f.session_hours}hr session · ${(f.daily_fee/f.session_hours).toFixed(2)}/hr {f.effective_from&&`· From ${f.effective_from}`}</div></div>
      </Card>)}
  </div>);
}
