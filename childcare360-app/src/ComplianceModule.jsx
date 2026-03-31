import { useState, useEffect, useCallback } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token");
  const h = { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...opts.headers };
  return fetch(path, { method: opts.method||"GET", headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined }).then(r => r.json());
};
const uploadFile = (path, file, fields = {}) => {
  const t = localStorage.getItem("c360_token");
  const fd = new FormData(); fd.append("file", file);
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
  return fetch(path, { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd }).then(r => r.json());
};

const STS = { current:{c:"#6BA38B",bg:"#6BA38B15",i:"✓",l:"Current"}, expiring_soon:{c:"#D4A26A",bg:"#D4A26A15",i:"⏰",l:"Expiring"}, review_needed:{c:"#9B7DC0",bg:"#9B7DC015",i:"📋",l:"Review"}, non_compliant:{c:"#C9828A",bg:"#C9828A15",i:"✗",l:"Non-Compliant"} };
const CATS = { immunisation:"💉", medical_plan:"📋", medication:"💊", consent:"✍️", identity:"🪪", other:"📎" };
const DOC_CATS = [
  { v:"immunisation",l:"Immunisation",types:[{v:"immunisation_history",l:"AIR Statement"},{v:"catch_up_schedule",l:"Catch-up Schedule"},{v:"exemption_certificate",l:"Exemption"}]},
  { v:"medical_plan",l:"Medical Plan",types:[{v:"anaphylaxis_plan",l:"Anaphylaxis Plan"},{v:"asthma_plan",l:"Asthma Plan"},{v:"allergy_plan",l:"Allergy Plan"},{v:"epilepsy_plan",l:"Epilepsy Plan"},{v:"diabetes_plan",l:"Diabetes Plan"},{v:"medical_plan_other",l:"Other Medical Plan"}]},
  { v:"medication",l:"Medication",types:[{v:"medication_authority",l:"Medication Authority"},{v:"prescription",l:"Prescription"},{v:"pharmacy_label",l:"Pharmacy Label"}]},
  { v:"consent",l:"Consent",types:[{v:"enrolment_form",l:"Enrolment Form"},{v:"photo_consent",l:"Photo Consent"},{v:"medication_consent",l:"Medication Consent"}]},
  { v:"identity",l:"Identity",types:[{v:"birth_certificate",l:"Birth Certificate"},{v:"custody_order",l:"Custody Order"}]},
  { v:"other",l:"Other",types:[{v:"other",l:"Other"}]},
];

const Inp = ({label,...p}) => (<div style={{marginBottom:10}}><label style={{display:"block",fontSize:11,color:"#8A7F96",marginBottom:3,fontWeight:600}}>{label}</label><input {...p} style={{width:"100%",padding:"10px 12px",background:"#F8F5F1",border:"1px solid #D9D0C7",borderRadius:10,color:"#3D3248",fontSize:13,boxSizing:"border-box",transition:"border-color 0.2s, box-shadow 0.2s",...(p.style||{})}} /></div>);
const Sel = ({label,children,...p}) => (<div style={{marginBottom:10}}><label style={{display:"block",fontSize:11,color:"#8A7F96",marginBottom:3,fontWeight:600}}>{label}</label><select {...p} style={{width:"100%",padding:"10px 12px",background:"#F8F5F1",border:"1px solid #D9D0C7",borderRadius:10,color:"#3D3248",fontSize:13,boxSizing:"border-box",transition:"border-color 0.2s",...(p.style||{})}}>{children}</select></div>);
const Btn = ({primary,small,...p}) => (<button {...p} style={{padding:small?"6px 14px":"10px 18px",background:primary?"linear-gradient(135deg, #8B6DAF, #9B7DC0)":"#F8F5F1",color:primary?"#fff":"#5C4E6A",border:primary?"none":"1px solid #D9D0C7",borderRadius:10,cursor:"pointer",fontSize:small?12:13,fontWeight:700,boxShadow:primary?"0 3px 10px rgba(139,109,175,0.2)":"none",transition:"all 0.2s ease",...(p.style||{})}} />);
const Badge = ({status}) => { const s=STS[status]||STS.current; return <span style={{padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700,color:s.c,background:s.bg}}>{s.i} {s.l}</span>; };
const Card = ({children,...p}) => <div style={{background:"#FFFFFF",border:"1px solid #E8E0D8",borderRadius:14,padding:14,marginBottom:8,boxShadow:"0 2px 12px rgba(80,60,90,0.04)",transition:"all 0.25s ease",...(p.style||{})}} {...p}>{children}</div>;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPLIANCE DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
export function ComplianceDashboard({ rooms }) {
  const [tab, setTab] = useState("overview");
  const [selectedChild, setSelectedChild] = useState(null);
  const [comp, setComp] = useState({ items: [], summary: {} });
  const [att, setAtt] = useState(null);
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, a, n] = await Promise.all([API("/api/compliance/overview"), API("/api/compliance/attendance-report"), API("/api/compliance/notifications?limit=50")]);
    setComp(c); setAtt(a); setNotifs(Array.isArray(n)?n:[]); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (selectedChild) return <ChildCompliance child={selectedChild} onBack={() => { setSelectedChild(null); load(); }} />;

  const S = comp.summary || {};
  return (
    <div style={{padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div><h2 style={{margin:0,color:"#3D3248",fontSize:22,fontWeight:700}}>📋 Compliance & Documents</h2>
          <p style={{margin:"4px 0 0",color:"#8A7F96",fontSize:13}}>Automated monitoring — replaces daily manual checks</p></div>
        <Btn primary onClick={() => API("/api/compliance/scan",{method:"POST"}).then(load)}>🔍 Run Scan</Btn>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        {[{l:"Non-Compliant",v:S.nonCompliant||0,c:"#C9828A",i:"🚫"},{l:"Expiring Soon",v:S.expiringSoon||0,c:"#D4A26A",i:"⏰"},{l:"Review Needed",v:S.reviewNeeded||0,c:"#9B7DC0",i:"📋"},{l:"Current",v:S.current||0,c:"#6BA38B",i:"✓"}].map((c,i) =>
          <Card key={i} style={{padding:"14px 18px"}}><div style={{fontSize:28,fontWeight:700,color:c.c}}>{c.i} {c.v}</div><div style={{fontSize:12,color:"#8A7F96",marginTop:4}}>{c.l}</div></Card>
        )}
      </div>

      <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:"1px solid #E8E0D8",paddingBottom:8}}>
        {[{id:"overview",l:"Overview"},{id:"attendance",l:"Attendance Gate"},{id:"notifications",l:"Notifications"}].map(t =>
          <button key={t.id} onClick={() => setTab(t.id)} style={{padding:"8px 16px",border:"none",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600,background:tab===t.id?"#8B6DAF20":"transparent",color:tab===t.id?"#A88BC7":"#8A7F96"}}>{t.l}</button>
        )}
      </div>

      {loading ? <div style={{textAlign:"center",padding:40,color:"#8A7F96"}}>Loading...</div> :
        tab === "overview" ? <OverviewTab items={comp.items} onSelect={c => setSelectedChild(c)} /> :
        tab === "attendance" ? <AttendanceTab report={att} onSelect={c => setSelectedChild(c)} rooms={rooms} /> :
        <NotificationsTab notifs={notifs} onRefresh={load} />}
    </div>
  );
}

function OverviewTab({ items, onSelect }) {
  const [filter, setFilter] = useState("all");
  const f = filter === "all" ? items : items.filter(i => i.status === filter);
  return (<div>
    <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
      {["all","non_compliant","expiring_soon","review_needed","current"].map(v =>
        <button key={v} onClick={() => setFilter(v)} style={{padding:"5px 12px",border:`1px solid ${filter===v?"#8B6DAF":"#D9D0C7"}`,borderRadius:6,cursor:"pointer",fontSize:11,background:filter===v?"#8B6DAF20":"transparent",color:filter===v?"#A88BC7":"#8A7F96"}}>
          {v==="all"?"All":(STS[v]?.l||v)} ({v==="all"?items.length:items.filter(i=>i.status===v).length})</button>)}
    </div>
    {f.length===0 ? <div style={{textAlign:"center",padding:40,color:"#A89DB5"}}>No items</div> :
      f.map(item => <Card key={item.id} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer",padding:"10px 14px"}} onClick={() => onSelect({id:item.child_id,first_name:item.first_name,last_name:item.last_name})}>
        <span style={{fontSize:18}}>{CATS[item.category]||"📎"}</span>
        <div style={{flex:1}}><div style={{fontWeight:600,color:"#3D3248",fontSize:13}}>{item.first_name} {item.last_name}</div>
          <div style={{fontSize:11,color:"#8A7F96"}}>{item.item_label} {item.room_name&&`· ${item.room_name}`}</div></div>
        <Badge status={item.status} />
        {item.days_until_expiry!=null && <span style={{fontSize:11,color:item.days_until_expiry<0?"#C9828A":"#D4A26A"}}>{item.days_until_expiry<0?`${Math.abs(item.days_until_expiry)}d overdue`:`${item.days_until_expiry}d`}</span>}
      </Card>)}
  </div>);
}

function AttendanceTab({ report, onSelect, rooms }) {
  const [rf, setRf] = useState("all");
  if (!report) return null;
  const s = report.summary||{};
  const list = rf==="all" ? report.report : report.report.filter(r => r.room_id===rf);
  return (<div>
    <div style={{display:"flex",gap:12,marginBottom:16}}>
      {[{l:"Blocked",v:s.blocked,c:"#C9828A"},{l:"Warnings",v:s.withWarnings,c:"#D4A26A"},{l:"Clear",v:s.canAttend,c:"#6BA38B"}].map((x,i) =>
        <Card key={i} style={{padding:"10px 18px",textAlign:"center",background:x.c+"15",border:`1px solid ${x.c}30`}}><div style={{fontSize:22,fontWeight:700,color:x.c}}>{x.v||0}</div><div style={{fontSize:11,color:x.c}}>{x.l}</div></Card>)}
    </div>
    <Sel label="" value={rf} onChange={e=>setRf(e.target.value)} style={{width:200,marginBottom:12}}>
      <option value="all">All Rooms</option>
      {(rooms||[]).map(r => <option key={r.id||r.name} value={r.id||r.name}>{r.name}</option>)}
    </Sel>
    {list.map(c => <Card key={c.childId} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer",padding:"10px 14px",background:c.eligible?"#FFFFFF":"#C9828A10",borderColor:c.eligible?"#E8E0D8":"#C9828A30"}} onClick={() => onSelect({id:c.childId,first_name:c.name.split(" ")[0],last_name:c.name.split(" ").slice(1).join(" ")})}>
      <span style={{fontSize:18}}>{c.eligible?(c.warnings?.length>0?"⚠️":"✅"):"🚫"}</span>
      <div style={{flex:1}}><div style={{fontWeight:600,color:"#3D3248"}}>{c.name}</div>
        {c.blocks?.length>0 && <div style={{fontSize:11,color:"#C9828A"}}>{c.blocks.map(b=>b.reason).join(" · ")}</div>}
        {c.warnings?.length>0 && <div style={{fontSize:11,color:"#D4A26A"}}>{c.warnings.map(w=>w.reason).join(" · ")}</div>}</div>
      <span style={{fontSize:12,fontWeight:600,color:c.eligible?"#6BA38B":"#C9828A"}}>{c.eligible?"CAN ATTEND":"BLOCKED"}</span>
    </Card>)}
  </div>);
}

function NotificationsTab({ notifs, onRefresh }) {
  const mark = async id => { await API(`/api/compliance/notifications/${id}/send`,{method:"PUT"}); onRefresh(); };
  return (<div>
    {notifs.length===0 ? <div style={{textAlign:"center",padding:40,color:"#A89DB5"}}>No notifications</div> :
      notifs.map(n => <Card key={n.id} style={{padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700,background:n.priority==="urgent"?"#C9828A20":"#9B7DC020",color:n.priority==="urgent"?"#C9828A":"#9B7DC0"}}>{n.priority?.toUpperCase()}</span>
            <span style={{fontWeight:600,color:"#3D3248",fontSize:13}}>{n.subject}</span></div>
          <span style={{padding:"2px 8px",borderRadius:4,fontSize:10,background:n.status==="sent"?"#6BA38B20":"#D4A26A20",color:n.status==="sent"?"#6BA38B":"#D4A26A"}}>{n.status}</span>
        </div>
        <p style={{margin:"4px 0 8px",fontSize:13,color:"#5C4E6A",lineHeight:1.5}}>{n.body}</p>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:11,color:"#A89DB5"}}>To: {(n.recipients||[]).map(r=>r.name||r.email).join(", ")} {n.cc?.length>0&&` · CC: ${n.cc.map(c=>c.name||c.email).join(", ")}`}</div>
          {n.status==="pending" && <Btn small primary onClick={()=>mark(n.id)}>✓ Mark Sent</Btn>}
        </div>
      </Card>)}
  </div>);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PER-CHILD COMPLIANCE VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function ChildCompliance({ child, onBack }) {
  const [tab, setTab] = useState("documents");
  const [docs, setDocs] = useState([]);
  const [comp, setComp] = useState({items:[],canAttend:{}});
  const [imm, setImm] = useState({records:[],schedule:{}});
  const [plans, setPlans] = useState([]);
  const [meds, setMeds] = useState([]);
  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [d,c,i,p,m,pa] = await Promise.all([
      API(`/api/documents/child/${child.id}`), API(`/api/compliance/child/${child.id}`),
      API(`/api/documents/immunisations/${child.id}`), API(`/api/documents/medical-plans/${child.id}`),
      API(`/api/documents/medications/${child.id}`), API(`/api/documents/parents/${child.id}`)
    ]);
    setDocs(Array.isArray(d)?d:[]); setComp(c||{items:[],canAttend:{}}); setImm(i||{records:[],schedule:{}});
    setPlans(Array.isArray(p)?p:[]); setMeds(Array.isArray(m)?m:[]); setParents(Array.isArray(pa)?pa:[]); setLoading(false);
  }, [child.id]);
  useEffect(() => { load(); }, [load]);

  const ca = comp.canAttend || {};
  return (
    <div style={{padding:24}}>
      <button onClick={onBack} style={{background:"none",border:"none",color:"#A88BC7",cursor:"pointer",fontSize:13,marginBottom:12}}>← Back to Dashboard</button>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
        <h2 style={{margin:0,color:"#3D3248",fontSize:22}}>{child.first_name} {child.last_name}</h2>
        <div style={{padding:"8px 16px",borderRadius:8,fontWeight:600,fontSize:13,
          background:ca.eligible?(ca.warnings?.length?"#D4A26A15":"#6BA38B15"):"#C9828A15",
          color:ca.eligible?(ca.warnings?.length?"#D4A26A":"#6BA38B"):"#C9828A"}}>
          {ca.eligible?(ca.warnings?.length?"⚠️":"✅"):"🚫"} {ca.summary||"Checking..."}
        </div>
      </div>

      {ca.blocks?.length>0 && <Card style={{background:"#C9828A10",borderColor:"#C9828A30",marginBottom:12}}>
        <div style={{fontWeight:700,color:"#C9828A",fontSize:13,marginBottom:4}}>🚫 Blocking Issues:</div>
        {ca.blocks.map((b,i)=><div key={i} style={{fontSize:12,color:"#C9828A",marginLeft:16}}>• {b.reason}</div>)}
      </Card>}

      <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:"1px solid #E8E0D8",paddingBottom:8}}>
        {[{id:"documents",l:"📄 Documents",n:docs.length},{id:"immunisation",l:"💉 Immunisation",n:imm.schedule?.overdue?.length||0},{id:"medical",l:"📋 Medical Plans",n:plans.length},{id:"medications",l:"💊 Medications",n:meds.filter(m=>m.status==="active").length},{id:"contacts",l:"👥 Contacts",n:parents.length}].map(t =>
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 12px",border:"none",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:600,background:tab===t.id?"#8B6DAF20":"transparent",color:tab===t.id?"#A88BC7":"#8A7F96"}}>{t.l} ({t.n})</button>)}
      </div>

      {loading ? <div style={{textAlign:"center",padding:40,color:"#8A7F96"}}>Loading...</div> :
        tab==="documents" ? <DocsTab childId={child.id} docs={docs} onRefresh={load} /> :
        tab==="immunisation" ? <ImmTab childId={child.id} data={imm} onRefresh={load} /> :
        tab==="medical" ? <MedPlansTab childId={child.id} plans={plans} onRefresh={load} /> :
        tab==="medications" ? <MedsTab childId={child.id} meds={meds} onRefresh={load} /> :
        <ContactsTab childId={child.id} parents={parents} onRefresh={load} />}
    </div>
  );
}

function DocsTab({ childId, docs, onRefresh }) {
  const [show, setShow] = useState(false);
  const [cat, setCat] = useState("immunisation");
  const [dt, setDt] = useState("");
  const [file, setFile] = useState(null);
  const [up, setUp] = useState(false);
  const types = DOC_CATS.find(c=>c.v===cat)?.types||[];
  const go = async () => { if(!file)return; setUp(true); await uploadFile(`/api/documents/upload/${childId}`,file,{category:cat,docType:dt||types[0]?.v}); setShow(false); setFile(null); setUp(false); onRefresh(); };
  return (<div>
    <Btn primary onClick={()=>setShow(!show)} style={{marginBottom:14}}>+ Upload Document</Btn>
    {show && <Card style={{padding:16,marginBottom:14,background:"#F8F5F1",borderColor:"#D9D0C7"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <Sel label="Category" value={cat} onChange={e=>{setCat(e.target.value);setDt("")}}>{DOC_CATS.map(c=><option key={c.v} value={c.v}>{CATS[c.v]} {c.l}</option>)}</Sel>
        <Sel label="Type" value={dt} onChange={e=>setDt(e.target.value)}>{types.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}</Sel>
      </div>
      <div style={{marginBottom:10}}><label style={{fontSize:11,color:"#8A7F96"}}>File</label><input type="file" onChange={e=>setFile(e.target.files[0])} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style={{width:"100%",padding:8,background:"#FFFFFF",border:"1px solid #D9D0C7",borderRadius:6,color:"#3D3248",fontSize:12,marginTop:3}} /></div>
      <div style={{display:"flex",gap:8}}><Btn primary onClick={go} style={{opacity:(!file||up)?0.5:1}}>{up?"Uploading...":"Upload & Analyse"}</Btn><Btn onClick={()=>setShow(false)}>Cancel</Btn></div>
    </Card>}
    {docs.length===0 ? <div style={{textAlign:"center",padding:40,color:"#A89DB5"}}>No documents yet</div> :
      docs.map(d=><Card key={d.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px"}}>
        <span style={{fontSize:18}}>{CATS[d.category]||"📎"}</span>
        <div style={{flex:1}}><div style={{fontWeight:600,color:"#3D3248",fontSize:13}}>{d.file_name}</div>
          <div style={{fontSize:11,color:"#8A7F96"}}>{DOC_CATS.find(c=>c.v===d.category)?.l} · {(d.file_size/1024).toFixed(0)}KB · {new Date(d.created_at).toLocaleDateString()}</div></div>
        <span style={{padding:"3px 10px",borderRadius:6,fontSize:10,fontWeight:600,
          background:d.ai_status==="complete"?"#6BA38B20":d.ai_status==="error"?"#C9828A20":"#D4A26A20",
          color:d.ai_status==="complete"?"#6BA38B":d.ai_status==="error"?"#C9828A":"#D4A26A"}}>
          {d.ai_status==="complete"?"🤖 Analysed":d.ai_status==="error"?"✗ Error":"⏳ Processing"}</span>
      </Card>)}
  </div>);
}

function ImmTab({ childId, data, onRefresh }) {
  const [show, setShow] = useState(false);
  const [f, setF] = useState({vaccineName:"",doseNumber:1,dateGiven:"",batchNumber:"",provider:"",nextDueDate:""});
  const sched = data.schedule||{};
  const add = async () => { if(!f.vaccineName||!f.dateGiven)return; await API(`/api/documents/immunisations/${childId}`,{method:"POST",body:f}); setShow(false); setF({vaccineName:"",doseNumber:1,dateGiven:"",batchNumber:"",provider:"",nextDueDate:""}); onRefresh(); };
  return (<div>
    <div style={{display:"flex",gap:12,marginBottom:16}}>
      <Card style={{padding:"10px 16px"}}><div style={{fontSize:20,fontWeight:700,color:"#3D3248"}}>{sched.recorded||0}</div><div style={{fontSize:11,color:"#8A7F96"}}>Recorded</div></Card>
      <Card style={{padding:"10px 16px"}}><div style={{fontSize:20,fontWeight:700,color:"#3D3248"}}>{sched.expected||0}</div><div style={{fontSize:11,color:"#8A7F96"}}>Expected (age {sched.ageMonths}mo)</div></Card>
      {sched.overdue?.length>0 && <Card style={{padding:"10px 16px",background:"#C9828A15",borderColor:"#C9828A30"}}><div style={{fontSize:20,fontWeight:700,color:"#C9828A"}}>{sched.overdue.length}</div><div style={{fontSize:11,color:"#C9828A"}}>Potentially Overdue</div></Card>}
    </div>
    {sched.overdue?.length>0 && <Card style={{background:"#C9828A10",borderColor:"#C9828A30",marginBottom:12}}>
      <div style={{fontWeight:700,color:"#C9828A",fontSize:12,marginBottom:4}}>⚠️ Potentially overdue (NIP schedule):</div>
      {sched.overdue.map((v,i)=><div key={i} style={{fontSize:11,color:"#C9828A",marginLeft:16}}>• {v.vaccine} dose {v.dose} (due at {v.months}mo)</div>)}
    </Card>}
    <Btn small primary onClick={()=>setShow(!show)} style={{marginBottom:12}}>+ Add Record</Btn>
    {show && <Card style={{background:"#F8F5F1",borderColor:"#D9D0C7",padding:14,marginBottom:12}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        <Inp label="Vaccine" value={f.vaccineName} onChange={e=>setF({...f,vaccineName:e.target.value})} placeholder="e.g. DTPa-hepB-IPV-Hib" />
        <Inp label="Date Given" type="date" value={f.dateGiven} onChange={e=>setF({...f,dateGiven:e.target.value})} />
        <Inp label="Dose #" type="number" value={f.doseNumber} onChange={e=>setF({...f,doseNumber:+e.target.value})} />
        <Inp label="Batch Number" value={f.batchNumber} onChange={e=>setF({...f,batchNumber:e.target.value})} />
        <Inp label="Provider" value={f.provider} onChange={e=>setF({...f,provider:e.target.value})} />
        <Inp label="Next Due" type="date" value={f.nextDueDate} onChange={e=>setF({...f,nextDueDate:e.target.value})} />
      </div>
      <div style={{display:"flex",gap:8,marginTop:6}}><Btn small primary onClick={add}>Save</Btn><Btn small onClick={()=>setShow(false)}>Cancel</Btn></div>
    </Card>}
    {(data.records||[]).map(r=><Card key={r.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px"}}>
      <span style={{fontSize:16}}>💉</span>
      <div style={{flex:1}}><div style={{fontWeight:600,color:"#3D3248",fontSize:13}}>{r.vaccine_name} (Dose {r.dose_number})</div>
        <div style={{fontSize:11,color:"#8A7F96"}}>Given: {r.date_given} {r.provider&&`· ${r.provider}`} {r.batch_number&&`· Batch: ${r.batch_number}`}</div></div>
      {r.next_due_date && <span style={{fontSize:11,color:r.next_due_date<new Date().toISOString().split('T')[0]?"#C9828A":"#8A7F96"}}>Next: {r.next_due_date}</span>}
    </Card>)}
  </div>);
}

function MedPlansTab({ childId, plans, onRefresh }) {
  const [show, setShow] = useState(false);
  const [f, setF] = useState({planType:"anaphylaxis",conditionName:"",severity:"moderate",reviewDate:"",doctorName:"",doctorPhone:"",notes:""});
  const add = async () => { await API(`/api/documents/medical-plans/${childId}`,{method:"POST",body:f}); setShow(false); onRefresh(); };
  const types = {anaphylaxis:{l:"Anaphylaxis",c:"#C9828A"},asthma:{l:"Asthma",c:"#D4A26A"},allergy:{l:"Allergy",c:"#9B7DC0"},epilepsy:{l:"Epilepsy",c:"#9B7DC0"},diabetes:{l:"Diabetes",c:"#6BA38B"},other:{l:"Other",c:"#8A7F96"}};
  return (<div>
    <Btn small primary onClick={()=>setShow(!show)} style={{marginBottom:12}}>+ Add Medical Plan</Btn>
    {show && <Card style={{background:"#F8F5F1",borderColor:"#D9D0C7",padding:14,marginBottom:12}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        <Sel label="Type" value={f.planType} onChange={e=>setF({...f,planType:e.target.value})}>{Object.entries(types).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</Sel>
        <Inp label="Condition" value={f.conditionName} onChange={e=>setF({...f,conditionName:e.target.value})} placeholder="e.g. Peanut Allergy" />
        <Sel label="Severity" value={f.severity} onChange={e=>setF({...f,severity:e.target.value})}><option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option></Sel>
        <Inp label="Review Date" type="date" value={f.reviewDate} onChange={e=>setF({...f,reviewDate:e.target.value})} />
        <Inp label="Doctor Name" value={f.doctorName} onChange={e=>setF({...f,doctorName:e.target.value})} />
        <Inp label="Doctor Phone" value={f.doctorPhone} onChange={e=>setF({...f,doctorPhone:e.target.value})} />
      </div>
      <div style={{display:"flex",gap:8,marginTop:6}}><Btn small primary onClick={add}>Save</Btn><Btn small onClick={()=>setShow(false)}>Cancel</Btn></div>
    </Card>}
    {plans.length===0 ? <div style={{textAlign:"center",padding:30,color:"#A89DB5"}}>No medical plans</div> :
      plans.map(p=>{const t=types[p.plan_type]||types.other; return <Card key={p.id} style={{padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{padding:"2px 10px",borderRadius:4,fontSize:10,fontWeight:700,background:t.c+"20",color:t.c}}>{t.l.toUpperCase()}</span>
            <span style={{fontWeight:600,color:"#3D3248",fontSize:14}}>{p.condition_name}</span></div>
          <Badge status={p.status==="current"?"current":"non_compliant"} />
        </div>
        <div style={{fontSize:12,color:"#8A7F96"}}>Severity: {p.severity} · Review: {p.review_date||"Not set"} {p.doctor_name&&`· Dr: ${p.doctor_name} ${p.doctor_phone}`}</div>
      </Card>;})}
  </div>);
}

function MedsTab({ childId, meds, onRefresh }) {
  const [show, setShow] = useState(false);
  const [f, setF] = useState({name:"",dosage:"",frequency:"",route:"oral",reason:"",prescriber:"",expiryDate:"",quantityHeld:0,requiresRefrigeration:false,parentConsent:false});
  const add = async () => { await API(`/api/documents/medications/${childId}`,{method:"POST",body:f}); setShow(false); onRefresh(); };
  return (<div>
    <Btn small primary onClick={()=>setShow(!show)} style={{marginBottom:12}}>+ Add Medication</Btn>
    {show && <Card style={{background:"#F8F5F1",borderColor:"#D9D0C7",padding:14,marginBottom:12}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        <Inp label="Medication Name" value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="e.g. EpiPen Jr" />
        <Inp label="Dosage" value={f.dosage} onChange={e=>setF({...f,dosage:e.target.value})} placeholder="e.g. 150mcg" />
        <Inp label="Frequency" value={f.frequency} onChange={e=>setF({...f,frequency:e.target.value})} placeholder="e.g. As needed" />
        <Inp label="Prescriber" value={f.prescriber} onChange={e=>setF({...f,prescriber:e.target.value})} />
        <Inp label="Expiry Date" type="date" value={f.expiryDate} onChange={e=>setF({...f,expiryDate:e.target.value})} />
        <Inp label="Qty Held" type="number" value={f.quantityHeld} onChange={e=>setF({...f,quantityHeld:+e.target.value})} />
      </div>
      <div style={{display:"flex",gap:16,marginTop:6,marginBottom:8}}>
        <label style={{fontSize:12,color:"#8A7F96",display:"flex",alignItems:"center",gap:4}}><input type="checkbox" checked={f.requiresRefrigeration} onChange={e=>setF({...f,requiresRefrigeration:e.target.checked})} /> Requires refrigeration</label>
        <label style={{fontSize:12,color:"#8A7F96",display:"flex",alignItems:"center",gap:4}}><input type="checkbox" checked={f.parentConsent} onChange={e=>setF({...f,parentConsent:e.target.checked})} /> Parent consent received</label>
      </div>
      <div style={{display:"flex",gap:8}}><Btn small primary onClick={add}>Save</Btn><Btn small onClick={()=>setShow(false)}>Cancel</Btn></div>
    </Card>}
    {meds.length===0 ? <div style={{textAlign:"center",padding:30,color:"#A89DB5"}}>No medications</div> :
      meds.map(m=>{const exp=m.expiry_date&&m.expiry_date<new Date().toISOString().split('T')[0]; return <Card key={m.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:exp?"#C9828A10":"#FFFFFF",borderColor:exp?"#C9828A30":"#E8E0D8"}}>
        <span style={{fontSize:16}}>💊</span>
        <div style={{flex:1}}><div style={{fontWeight:600,color:"#3D3248",fontSize:13}}>{m.name}</div>
          <div style={{fontSize:11,color:"#8A7F96"}}>{m.dosage&&`${m.dosage} · `}{m.frequency} {m.prescriber&&`· ${m.prescriber}`} {m.requires_refrigeration?"· 🧊 Fridge":""}</div></div>
        {m.expiry_date && <span style={{fontSize:11,color:exp?"#C9828A":"#8A7F96"}}>{exp?"⚠️ EXPIRED":"Exp:"} {m.expiry_date}</span>}
        <span style={{fontSize:11,color:m.parent_consent?"#6BA38B":"#C9828A"}}>{m.parent_consent?"✓ Consent":"✗ No consent"}</span>
      </Card>;})}
  </div>);
}

function ContactsTab({ childId, parents, onRefresh }) {
  const [show, setShow] = useState(false);
  const [f, setF] = useState({name:"",relationship:"parent",email:"",phone:"",isPrimary:false,receivesNotifications:true});
  const add = async () => { await API(`/api/documents/parents/${childId}`,{method:"POST",body:f}); setShow(false); onRefresh(); };
  return (<div>
    <Btn small primary onClick={()=>setShow(!show)} style={{marginBottom:12}}>+ Add Contact</Btn>
    {show && <Card style={{background:"#F8F5F1",borderColor:"#D9D0C7",padding:14,marginBottom:12}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        <Inp label="Name" value={f.name} onChange={e=>setF({...f,name:e.target.value})} />
        <Sel label="Relationship" value={f.relationship} onChange={e=>setF({...f,relationship:e.target.value})}><option value="parent">Parent</option><option value="guardian">Guardian</option><option value="grandparent">Grandparent</option><option value="emergency">Emergency Contact</option></Sel>
        <Inp label="Email" type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})} />
        <Inp label="Phone" value={f.phone} onChange={e=>setF({...f,phone:e.target.value})} />
      </div>
      <div style={{display:"flex",gap:8,marginTop:6}}><Btn small primary onClick={add}>Save</Btn><Btn small onClick={()=>setShow(false)}>Cancel</Btn></div>
    </Card>}
    {parents.map(p=><Card key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px"}}>
      <span style={{fontSize:16}}>👤</span>
      <div style={{flex:1}}><div style={{fontWeight:600,color:"#3D3248",fontSize:13}}>{p.name} {p.is_primary?"⭐":""}</div>
        <div style={{fontSize:11,color:"#8A7F96"}}>{p.relationship} · {p.email} · {p.phone}</div></div>
      <span style={{fontSize:11,color:p.receives_notifications?"#6BA38B":"#8A7F96"}}>{p.receives_notifications?"📧 Notified":"Silent"}</span>
    </Card>)}
  </div>);
}
