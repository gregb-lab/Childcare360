import { useState, useEffect, useCallback } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch("/api/register" + path, {
    headers: { "Content-Type": "application/json", ...(t?{Authorization:`Bearer ${t}`}:{}), ...(tid?{"x-tenant-id":tid}:{}) },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error||`HTTP ${r.status}`); return d; });
};

const API2 = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch("/api/children" + path, {
    headers: { "Content-Type": "application/json", ...(t?{Authorization:`Bearer ${t}`}:{}), ...(tid?{"x-tenant-id":tid}:{}) },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};

const toast = (msg, type="success") => { if(window.showToast) window.showToast(msg, type); };
const fmtDate = d => d ? new Date(d+"T12:00:00").toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}) : "—";
const fmtTime = t => t ? new Date(t).toLocaleString("en-AU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : "—";

const purple="#7C3AED", lp="#F0EBF8";
const card={background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:20,marginBottom:14};
const inp={padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:12,width:"100%",boxSizing:"border-box"};
const lbl={fontSize:11,color:"#7A6E8A",fontWeight:700,display:"block",marginBottom:4};

export default function MedicationRegisterModule() {
  const [tab, setTab] = useState("medications");
  const TABS = [
    {id:"medications", label:"💊 Medications"},
    {id:"log",         label:"📋 Admin Log"},
    {id:"equipment",   label:"🩺 Equipment"},
  ];

  return (
    <div style={{padding:24}}>
      <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"2px solid #EDE8F4",paddingBottom:0}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"9px 18px",border:"none",borderRadius:"8px 8px 0 0",cursor:"pointer",
              fontSize:13,fontWeight:tab===t.id?700:500,
              background:tab===t.id?"#fff":"transparent",
              color:tab===t.id?purple:"#8A7F96",
              borderBottom:tab===t.id?"2px solid "+purple:"2px solid transparent",
              marginBottom:-2}}>
            {t.label}
          </button>
        ))}
      </div>
      {tab==="medications" && <MedicationsTab />}
      {tab==="log"         && <MedLogTab />}
      {tab==="equipment"   && <EquipmentTab />}
    </div>
  );
}

// ─── MEDICATIONS TAB ──────────────────────────────────────────────────────────
function MedicationsTab() {
  const [meds, setMeds] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterChild, setFilterChild] = useState("");
  const [form, setForm] = useState({
    child_id:"", name:"", dosage:"", frequency:"", route:"oral",
    prescriber:"", start_date:"", end_date:"", instructions:"", emergency_only:false
  });
  const [editingMed, setEditingMed] = useState(null);
  const [editForm, setEditForm] = useState({});

  const startEdit = (m) => {
    setEditingMed(m.id);
    setEditForm({
      name: m.name || "",
      dosage: m.dosage || "",
      frequency: m.frequency || "",
      route: m.route || "oral",
      prescriber: m.prescriber || "",
      start_date: m.start_date || "",
      end_date: m.end_date || "",
      instructions: m.instructions || m.notes || "",
    });
  };
  const cancelEdit = () => { setEditingMed(null); setEditForm({}); };
  const saveMedEdit = async () => {
    try {
      await API(`/medications/${editingMed}`, { method: "PUT", body: editForm });
      toast("Medication updated");
      setEditingMed(null);
      setEditForm({});
      load();
    } catch(e) { toast(e.message, "error"); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, c] = await Promise.all([API("/medications"), API2("/")]);
      if(Array.isArray(m)) setMeds(m);
      if(Array.isArray(c)) setChildren(c);
    } catch(e) {} finally { setLoading(false); }
  }, []);

  useEffect(()=>{ load(); },[load]);

  const save = async () => {
    if(!form.child_id || !form.name) { toast("Child and medication name required","error"); return; }
    try {
      await API("/medications", {method:"POST", body:form});
      toast("Medication added ✓"); setShowForm(false);
      setForm({child_id:"",name:"",dosage:"",frequency:"",route:"oral",prescriber:"",start_date:"",end_date:"",instructions:"",emergency_only:false});
      load();
    } catch(e) { toast(e.message,"error"); }
  };

  const deactivate = async (id) => {
    if(!(await window.showConfirm("Remove this medication?"))) return;
    try { await API(`/medications/${id}`,{method:"DELETE"}); toast("Removed"); load(); }
    catch(e) { toast(e.message,"error"); }
  };

  const filtered = filterChild ? meds.filter(m=>m.child_id===filterChild) : meds;
  const grouped = {};
  filtered.forEach(m => { const k=m.child_name||"Unknown"; (grouped[k]=grouped[k]||[]).push(m); });

  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center"}}>
        <select value={filterChild} onChange={e=>setFilterChild(e.target.value)}
          style={{...inp,flex:1,maxWidth:240}}>
          <option value="">All children</option>
          {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
        </select>
        <button onClick={()=>setShowForm(v=>!v)}
          style={{padding:"9px 18px",background:purple,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13}}>
          {showForm?"Cancel":"+ Add Medication"}
        </button>
      </div>

      {showForm && (
        <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
          <h4 style={{margin:"0 0 14px",color:purple}}>New Medication</h4>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{gridColumn:"1/-1"}}>
              <label style={lbl}>Child *</label>
              <select style={inp} value={form.child_id} onChange={e=>setForm(p=>({...p,child_id:e.target.value}))}>
                <option value="">Select child…</option>
                {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
            {[
              ["Medication Name *","name","text"],["Dosage","dosage","text"],
              ["Frequency","frequency","text"],["Route","route","text"],
              ["Prescriber","prescriber","text"],["Start Date","start_date","date"],
              ["End Date","end_date","date"],
            ].map(([l,k,t])=>(
              <div key={k}>
                <label style={lbl}>{l}</label>
                <input type={t} style={inp} value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} />
              </div>
            ))}
            <div style={{gridColumn:"1/-1"}}>
              <label style={lbl}>Instructions / Notes</label>
              <textarea style={{...inp,height:60,resize:"vertical"}} value={form.instructions}
                onChange={e=>setForm(p=>({...p,instructions:e.target.value}))} />
            </div>
            <div>
              <label style={{...lbl,display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
                <input type="checkbox" checked={form.emergency_only} onChange={e=>setForm(p=>({...p,emergency_only:e.target.checked}))} />
                Emergency use only (e.g. EpiPen)
              </label>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button onClick={save} style={{padding:"8px 20px",background:purple,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700}}>Save</button>
            <button onClick={()=>setShowForm(false)} style={{padding:"8px 16px",background:"#F5F0FA",color:"#5C4E6A",border:"none",borderRadius:8,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{textAlign:"center",padding:40,color:"#A89DB5"}}>Loading…</div>
      ) : filtered.length===0 ? (
        <div style={{...card,textAlign:"center",padding:40,color:"#A89DB5"}}>
          <div style={{fontSize:36,marginBottom:12}}>💊</div>
          <div style={{fontWeight:600}}>No medications on record</div>
          <div style={{fontSize:12,marginTop:4}}>Add medications for children who require regular or emergency medication</div>
        </div>
      ) : Object.entries(grouped).map(([childName, childMeds])=>(
        <div key={childName} style={card}>
          <div style={{fontWeight:700,fontSize:14,color:"#3D3248",marginBottom:10}}>👦 {childName}</div>
          {childMeds.map(m=> editingMed === m.id ? (
            <div key={m.id} style={{padding:"12px 0",borderBottom:"1px solid #F0EBF8",background:"#F8F5FC",borderRadius:8,paddingLeft:12,paddingRight:12,marginBottom:6}}>
              <div style={{fontSize:11,fontWeight:700,color:purple,marginBottom:8}}>Editing — {m.name}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <div><label style={lbl}>Name</label><input style={inp} value={editForm.name} onChange={e=>setEditForm(p=>({...p,name:e.target.value}))} /></div>
                <div><label style={lbl}>Dosage</label><input style={inp} value={editForm.dosage} onChange={e=>setEditForm(p=>({...p,dosage:e.target.value}))} /></div>
                <div><label style={lbl}>Frequency</label><input style={inp} value={editForm.frequency} onChange={e=>setEditForm(p=>({...p,frequency:e.target.value}))} /></div>
                <div><label style={lbl}>Route</label><input style={inp} value={editForm.route} onChange={e=>setEditForm(p=>({...p,route:e.target.value}))} /></div>
                <div><label style={lbl}>Prescriber</label><input style={inp} value={editForm.prescriber} onChange={e=>setEditForm(p=>({...p,prescriber:e.target.value}))} /></div>
                <div><label style={lbl}>End Date</label><input type="date" style={inp} value={editForm.end_date} onChange={e=>setEditForm(p=>({...p,end_date:e.target.value}))} /></div>
                <div style={{gridColumn:"1/-1"}}>
                  <label style={lbl}>Instructions</label>
                  <textarea style={{...inp,height:50,resize:"vertical"}} value={editForm.instructions} onChange={e=>setEditForm(p=>({...p,instructions:e.target.value}))} />
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={saveMedEdit} style={{padding:"6px 14px",background:purple,color:"#fff",border:"none",borderRadius:7,cursor:"pointer",fontWeight:700,fontSize:11}}>Save</button>
                <button onClick={cancelEdit} style={{padding:"6px 14px",background:"#fff",color:"#7A6E8A",border:"1px solid #DDD6EE",borderRadius:7,cursor:"pointer",fontSize:11}}>Cancel</button>
              </div>
            </div>
          ) : (
            <div key={m.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 0",borderBottom:"1px solid #F0EBF8"}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontWeight:700,fontSize:13,color:"#3D3248"}}>{m.name}</span>
                  {m.emergency_only ? <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:10,background:"#FFEBEE",color:"#B71C1C"}}>EMERGENCY</span>
                    : <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:10,background:"#E8F5E9",color:"#2E7D32"}}>Active</span>}
                </div>
                <div style={{fontSize:11,color:"#8A7F96",marginTop:3}}>
                  {m.dosage && `${m.dosage} · `}{m.route && `${m.route} · `}{m.frequency}
                  {m.prescriber && ` · Dr. ${m.prescriber}`}
                </div>
                {(m.instructions || m.notes) && <div style={{fontSize:11,color:"#5C4E6A",marginTop:4,fontStyle:"italic"}}>{m.instructions || m.notes}</div>}
                {(m.start_date||m.end_date) && (
                  <div style={{fontSize:10,color:"#A89DB5",marginTop:3}}>
                    {m.start_date && `From ${fmtDate(m.start_date)}`}{m.end_date && ` → ${fmtDate(m.end_date)}`}
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={()=>startEdit(m)}
                  style={{padding:"4px 10px",borderRadius:7,border:"1px solid #DDD6EE",background:"#F8F5FF",color:purple,cursor:"pointer",fontSize:11}}>
                  Edit
                </button>
                <button onClick={()=>deactivate(m.id)}
                  style={{padding:"4px 10px",borderRadius:7,border:"1px solid #FFCDD2",background:"#FFF5F5",color:"#C06B73",cursor:"pointer",fontSize:11}}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── MEDICATION LOG TAB ───────────────────────────────────────────────────────
function MedLogTab() {
  const [log, setLog] = useState([]);
  const [meds, setMeds] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0,10));
  const [filterChild, setFilterChild] = useState("");
  const [form, setForm] = useState({
    child_id:"", medication_id:"", dose_given:"", time_given:"",
    administered_by_name:"", witnessed_by_name:"", notes:"", parent_notified:false
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if(filterDate)  params.set("date", filterDate);
      if(filterChild) params.set("childId", filterChild);
      const [l, m, c] = await Promise.all([
        API("/medication-log?" + params),
        API("/medications"),
        API2("/"),
      ]);
      if(Array.isArray(l)) setLog(l);
      if(Array.isArray(m)) setMeds(m);
      if(Array.isArray(c)) setChildren(c);
    } catch(e) {} finally { setLoading(false); }
  }, [filterDate, filterChild]);

  useEffect(()=>{ load(); },[load]);

  const childMeds = meds.filter(m=>m.child_id===form.child_id);

  const save = async () => {
    if(!form.child_id||!form.medication_id||!form.time_given) {
      toast("Child, medication and time required","error"); return;
    }
    try {
      await API("/medication-log", {method:"POST", body:form});
      toast("Administration recorded ✓");
      setShowForm(false);
      setForm({child_id:"",medication_id:"",dose_given:"",time_given:"",administered_by_name:"",witnessed_by_name:"",notes:"",parent_notified:false});
      load();
    } catch(e) { toast(e.message,"error"); }
  };

  const deleteLog = async (id) => {
    if(!(await window.showConfirm("Delete this administration record?"))) return;
    try { await API(`/medication-log/${id}`,{method:"DELETE"}); toast("Deleted"); load(); }
    catch(e) { toast(e.message,"error"); }
  };

  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
        <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)}
          style={{...inp,width:"auto"}} />
        <select value={filterChild} onChange={e=>setFilterChild(e.target.value)}
          style={{...inp,flex:1,maxWidth:220}}>
          <option value="">All children</option>
          {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
        </select>
        <button onClick={()=>setShowForm(v=>!v)}
          style={{padding:"9px 18px",background:purple,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13}}>
          {showForm?"Cancel":"+ Record Administration"}
        </button>
      </div>

      {showForm && (
        <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
          <h4 style={{margin:"0 0 14px",color:purple}}>Record Medication Administration</h4>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label style={lbl}>Child *</label>
              <select style={inp} value={form.child_id}
                onChange={e=>setForm(p=>({...p,child_id:e.target.value,medication_id:""}))}>
                <option value="">Select child…</option>
                {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Medication *</label>
              <select style={inp} value={form.medication_id}
                onChange={e=>setForm(p=>({...p,medication_id:e.target.value}))}>
                <option value="">Select medication…</option>
                {childMeds.map(m=><option key={m.id} value={m.id}>{m.name} {m.dosage?`(${m.dosage})`:""}</option>)}
              </select>
              {form.child_id && childMeds.length===0 && (
                <div style={{fontSize:11,color:"#E65100",marginTop:4}}>No medications on file for this child — add one first</div>
              )}
            </div>
            <div>
              <label style={lbl}>Time Given *</label>
              <input type="datetime-local" style={inp} value={form.time_given}
                onChange={e=>setForm(p=>({...p,time_given:e.target.value}))} />
            </div>
            <div>
              <label style={lbl}>Dose Given</label>
              <input type="text" style={inp} value={form.dose_given} placeholder="e.g. 5ml, 1 tablet"
                onChange={e=>setForm(p=>({...p,dose_given:e.target.value}))} />
            </div>
            <div>
              <label style={lbl}>Administered By</label>
              <input type="text" style={inp} value={form.administered_by_name} placeholder="Your name"
                onChange={e=>setForm(p=>({...p,administered_by_name:e.target.value}))} />
            </div>
            <div>
              <label style={lbl}>Witnessed By</label>
              <input type="text" style={inp} value={form.witnessed_by_name} placeholder="Witness name"
                onChange={e=>setForm(p=>({...p,witnessed_by_name:e.target.value}))} />
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <label style={lbl}>Notes</label>
              <textarea style={{...inp,height:50,resize:"vertical"}} value={form.notes}
                onChange={e=>setForm(p=>({...p,notes:e.target.value}))} />
            </div>
            <div>
              <label style={{...lbl,display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
                <input type="checkbox" checked={form.parent_notified}
                  onChange={e=>setForm(p=>({...p,parent_notified:e.target.checked}))} />
                Parent/guardian notified
              </label>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button onClick={save} style={{padding:"8px 20px",background:purple,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700}}>Save Record</button>
            <button onClick={()=>setShowForm(false)} style={{padding:"8px 16px",background:"#F5F0FA",color:"#5C4E6A",border:"none",borderRadius:8,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{textAlign:"center",padding:40,color:"#A89DB5"}}>Loading…</div>
      ) : log.length===0 ? (
        <div style={{...card,textAlign:"center",padding:40,color:"#A89DB5"}}>
          <div style={{fontSize:36,marginBottom:12}}>📋</div>
          <div style={{fontWeight:600}}>No records for {filterDate||"this period"}</div>
          <div style={{fontSize:12,marginTop:4}}>Record each time medication is administered to a child</div>
        </div>
      ) : (
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{background:"#EDE8F4"}}>
                {["Time","Child","Medication","Dose","Given By","Witnessed By","Parent Notified",""].map(h=>(
                  <th key={h} style={{padding:"9px 12px",textAlign:"left",fontWeight:700,color:"#5C4E6A",fontSize:11}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.map((l,i)=>(
                <tr key={l.id} style={{background:i%2===0?"#FDFBF9":"#fff",borderBottom:"1px solid #F0EBF8"}}>
                  <td style={{padding:"8px 12px",color:"#5C4E6A",whiteSpace:"nowrap"}}>{fmtTime(l.time_given)}</td>
                  <td style={{padding:"8px 12px",fontWeight:600,color:"#3D3248"}}>{l.child_name}</td>
                  <td style={{padding:"8px 12px"}}>{l.med_name}</td>
                  <td style={{padding:"8px 12px",color:"#8A7F96"}}>{l.dose_given||l.dosage||"—"}</td>
                  <td style={{padding:"8px 12px"}}>{l.administered_by_display||l.given_by||l.administered_by||"—"}</td>
                  <td style={{padding:"8px 12px",color:"#8A7F96"}}>{l.witnessed_by||"—"}</td>
                  <td style={{padding:"8px 12px",textAlign:"center"}}>
                    {l.parent_notified
                      ? <span style={{color:"#2E7D32",fontWeight:700}}>✓</span>
                      : <span style={{color:"#A89DB5"}}>—</span>}
                  </td>
                  <td style={{padding:"8px 12px"}}>
                    <button onClick={()=>deleteLog(l.id)}
                      style={{padding:"3px 8px",borderRadius:6,border:"1px solid #FFCDD2",background:"#FFF5F5",color:"#C06B73",cursor:"pointer",fontSize:10}}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── EQUIPMENT TAB (existing) ─────────────────────────────────────────────────
function EquipmentTab() {
  const [items, setItems] = useState([]);
  // Alerts response is an object: { expired, expiring7, expiring30 }
  const [alerts, setAlerts] = useState({ expired: [], expiring7: [], expiring30: [] });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState({status:"active"});
  const [form, setForm] = useState({name:"",category:"first_aid",location:"",quantity:1,last_checked:"",next_check:"",expiry_date:"",notes:"",status:"active"});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eq, al] = await Promise.all([
        API("/equipment?status=" + (filter.status || "active")),
        API("/equipment-alerts"),
      ]);
      if(Array.isArray(eq)) setItems(eq);
      // Server returns { expired:[], expiring7:[], expiring30:[] } — not an array.
      if(al && typeof al === "object" && !Array.isArray(al)) setAlerts({
        expired: al.expired || [],
        expiring7: al.expiring7 || [],
        expiring30: al.expiring30 || [],
      });
    } catch(e) {} finally { setLoading(false); }
  }, [filter.status]);

  useEffect(()=>{ load(); },[load]);

  const save = async () => {
    if(!form.name) { toast("Equipment name required","error"); return; }
    try {
      await API("/equipment", {method:"POST", body:form});
      toast("Equipment added ✓"); setShowForm(false);
      setForm({name:"",category:"first_aid",location:"",quantity:1,last_checked:"",next_check:"",expiry_date:"",notes:"",status:"active"});
      load();
    } catch(e) { toast(e.message,"error"); }
  };

  const CATS = {first_aid:"🩺 First Aid",epipen:"💉 EpiPen",aed:"⚡ AED",fire:"🔥 Fire Safety",other:"📦 Other"};

  const alertCount = (alerts.expired?.length||0) + (alerts.expiring7?.length||0) + (alerts.expiring30?.length||0);
  return (
    <div>
      {alertCount>0 && (
        <div style={{...card,background:"#FFF5F5",border:"1px solid #FFCDD2",marginBottom:12}}>
          <div style={{fontWeight:700,color:"#B71C1C",marginBottom:8}}>⚠️ {alertCount} item{alertCount!==1?"s":""} need attention</div>
          {alerts.expired?.map(a=>(
            <div key={a.id} style={{fontSize:12,color:"#5C4E6A",padding:"3px 0"}}>
              {CATS[a.category]||"📦"} <strong>{a.name}</strong> — <span style={{color:"#B71C1C",fontWeight:700}}>EXPIRED</span> {a.expiry_date}
            </div>
          ))}
          {alerts.expiring7?.map(a=>(
            <div key={a.id} style={{fontSize:12,color:"#5C4E6A",padding:"3px 0"}}>
              {CATS[a.category]||"📦"} <strong>{a.name}</strong> — <span style={{color:"#E65100",fontWeight:700}}>expires in ≤7 days</span> ({a.expiry_date})
            </div>
          ))}
          {alerts.expiring30?.map(a=>(
            <div key={a.id} style={{fontSize:12,color:"#5C4E6A",padding:"3px 0"}}>
              {CATS[a.category]||"📦"} <strong>{a.name}</strong> — expires within 30 days ({a.expiry_date})
            </div>
          ))}
        </div>
      )}
      <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center"}}>
        <select value={filter.status} onChange={e=>setFilter(p=>({...p,status:e.target.value}))}
          style={{...inp,width:"auto"}}>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="all">All</option>
        </select>
        <button onClick={()=>setShowForm(v=>!v)}
          style={{padding:"9px 18px",background:purple,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13}}>
          {showForm?"Cancel":"+ Add Equipment"}
        </button>
      </div>
      {showForm && (
        <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
          <h4 style={{margin:"0 0 14px",color:purple}}>New Equipment Item</h4>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{gridColumn:"1/-1"}}>
              <label style={lbl}>Name *</label>
              <input style={inp} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. First Aid Kit — Room 1" />
            </div>
            {[["Category","category","sel"],["Location","location","text"],
              ["Quantity","quantity","number"],["Last Checked","last_checked","date"],
              ["Next Check Due","next_check","date"],["Expiry Date","expiry_date","date"]].map(([l,k,t])=>(
              <div key={k}>
                <label style={lbl}>{l}</label>
                {t==="sel"
                  ? <select style={inp} value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))}>
                      {Object.entries(CATS).map(([v,label])=><option key={v} value={v}>{label}</option>)}
                    </select>
                  : <input type={t} style={inp} value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} />
                }
              </div>
            ))}
            <div style={{gridColumn:"1/-1"}}>
              <label style={lbl}>Notes</label>
              <textarea style={{...inp,height:50,resize:"vertical"}} value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} />
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button onClick={save} style={{padding:"8px 20px",background:purple,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700}}>Save</button>
            <button onClick={()=>setShowForm(false)} style={{padding:"8px 16px",background:"#F5F0FA",color:"#5C4E6A",border:"none",borderRadius:8,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}
      {loading ? (
        <div style={{textAlign:"center",padding:40,color:"#A89DB5"}}>Loading…</div>
      ) : items.length===0 ? (
        <div style={{...card,textAlign:"center",padding:40,color:"#A89DB5"}}>
          <div style={{fontSize:36,marginBottom:12}}>🩺</div>
          <div style={{fontWeight:600}}>No equipment items</div>
          <div style={{fontSize:12,marginTop:4}}>Track first aid kits, EpiPens, AEDs and other safety equipment</div>
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
          {items.map(item=>{
            const needsAttention = (item.next_check && new Date(item.next_check) <= new Date()) ||
                                   (item.expiry_date && new Date(item.expiry_date) <= new Date(Date.now()+30*86400000));
            return (
              <div key={item.id} style={{...card,border:`1px solid ${needsAttention?"#FFCDD2":"#EDE8F4"}`,
                background:needsAttention?"#FFF5F5":"#fff",margin:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13,color:"#3D3248"}}>{CATS[item.category]||"📦"} {item.name}</div>
                    <div style={{fontSize:11,color:"#8A7F96"}}>{item.location} · Qty: {item.quantity}</div>
                  </div>
                  {needsAttention && <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:10,background:"#FFEBEE",color:"#B71C1C"}}>ATTENTION</span>}
                </div>
                {[["Last Checked",item.last_checked],["Next Check",item.next_check],["Expiry",item.expiry_date]].map(([l,v])=>v&&(
                  <div key={l} style={{fontSize:11,color:"#8A7F96"}}>{l}: {fmtDate(v)}</div>
                ))}
                {item.notes && <div style={{fontSize:11,color:"#5C4E6A",marginTop:6,fontStyle:"italic"}}>{item.notes}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
