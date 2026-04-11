import { useState, useEffect, useCallback } from "react";
const P="#7C3AED",PL="#EDE4F0",DARK="#3D3248",MU="#8A7F96",OK="#16A34A",WA="#D97706",DA="#DC2626";
const card={background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"18px 22px"};
const bp={padding:"9px 18px",borderRadius:9,border:"none",background:P,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13};
const bs={padding:"9px 18px",borderRadius:9,border:`1px solid ${P}`,background:"#fff",color:P,fontWeight:600,cursor:"pointer",fontSize:13};

const CATEGORY_ICONS = {daily:"📋",safety:"🛡️",health:"🏥",excursion:"🚌",weekly:"📅",as_needed:"⚡"};
const FREQ_LABELS = {daily:"Daily",weekly:"Weekly",monthly:"Monthly",as_needed:"As Needed"};

function api2(path, opts={}) {
  const t=localStorage.getItem("c360_token"), tid=localStorage.getItem("c360_tenant");
  return fetch(path,{method:opts.method||"GET",headers:{"Content-Type":"application/json",
    ...(t?{Authorization:`Bearer ${t}`}:{}),  ...(tid?{"x-tenant-id":tid}:{})},
    body:opts.body?JSON.stringify(opts.body):undefined}).then(r=>r.json());
}

export default function ChecklistsModule() {
  const [tab, setTab] = useState("today");
  const [checklists, setChecklists] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [active, setActive] = useState(null); // checklist being completed
  const [itemStates, setItemStates] = useState({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [history, setHistory] = useState([]);
  const [newForm, setNewForm] = useState({title:"",category:"daily",frequency:"daily",items:[]});
  const [editItem, setEditItem] = useState("");

  const load = useCallback(() => {
    api2("/api/checklists").then(d => setChecklists(d.checklists || []));
    api2("/api/checklists/templates").then(d => setTemplates(d.templates || []));
  }, []);
  useEffect(() => { load(); }, [load]);

  const openChecklist = (cl) => {
    setActive(cl);
    const init = {};
    (cl.items||[]).forEach(i => { init[i.id] = false; });
    setItemStates(init);
    setNotes("");
  };

  const completeChecklist = async () => {
    if (!active) return;
    setSaving(true);
    const itemsData = (active.items||[]).map(i => ({ ...i, checked: !!itemStates[i.id] }));
    await api2(`/api/checklists/${active.id}/complete`, {
      method: "POST",
      body: { completed_by: "Staff", notes, items_data: itemsData }
    });
    setSaving(false);
    setActive(null);
    load();
  };

  const addFromTemplate = async (tpl) => {
    await api2("/api/checklists", { method: "POST", body: {
      title: tpl.title, category: tpl.category, frequency: tpl.frequency, items: tpl.items
    }});
    load();
  };

  const deleteChecklist = async (id) => {
    if (!(await window.showConfirm("Archive this checklist?"))) return;
    await api2(`/api/checklists/${id}`, { method: "DELETE" });
    load();
  };

  const viewHistory = async (cl) => {
    setActive({ ...cl, viewingHistory: true });
    const d = await api2(`/api/checklists/${cl.id}/history`);
    setHistory(d.history || []);
  };

  const today = new Date().toLocaleDateString("en-AU", { weekday:"long", day:"numeric", month:"long" });
  const pendingToday = checklists.filter(c => !c.completed_today && c.frequency !== "as_needed");
  const doneToday = checklists.filter(c => c.completed_today);
  const allChecked = active && Object.values(itemStates).every(v => v);
  const requiredUnchecked = active && (active.items||[]).filter(i => i.required && !itemStates[i.id]);

  // Active checklist completion view
  if (active && !active.viewingHistory) return (
    <div style={{padding:"24px 28px",maxWidth:720,margin:"0 auto"}}>
      <button onClick={()=>setActive(null)} style={{...bs,marginBottom:16,fontSize:12}}>← Back</button>
      <div style={{...card,marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
          <span style={{fontSize:28}}>{CATEGORY_ICONS[active.category]||"📋"}</span>
          <div>
            <div style={{fontWeight:800,fontSize:18,color:DARK}}>{active.title}</div>
            <div style={{fontSize:12,color:MU}}>{today}</div>
          </div>
        </div>
      </div>

      <div style={{...card,marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:13,color:DARK,marginBottom:12}}>Checklist Items</div>
        {(active.items||[]).map((item,i) => (
          <div key={item.id} onClick={()=>setItemStates(s=>({...s,[item.id]:!s[item.id]}))}
            style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 12px",
              borderRadius:8,marginBottom:4,cursor:"pointer",
              background:itemStates[item.id]?"#F0FDF4":"#FAFAFA",
              border:`1px solid ${itemStates[item.id]?"#BBF7D0":"#EDE8F4"}`}}>
            <div style={{width:22,height:22,borderRadius:6,border:`2px solid ${itemStates[item.id]?OK:"#DDD6EE"}`,
              background:itemStates[item.id]?OK:"#fff",display:"flex",alignItems:"center",
              justifyContent:"center",flexShrink:0,marginTop:1}}>
              {itemStates[item.id] && <span style={{color:"#fff",fontSize:13,fontWeight:900}}>✓</span>}
            </div>
            <div style={{flex:1}}>
              <span style={{fontSize:13,color:DARK,fontWeight:itemStates[item.id]?400:500,
                textDecoration:itemStates[item.id]?"line-through":undefined}}>{item.text}</span>
              {item.required && <span style={{marginLeft:6,fontSize:10,color:DA,fontWeight:700}}>REQUIRED</span>}
            </div>
          </div>
        ))}
      </div>

      <div style={{...card,marginBottom:16}}>
        <label style={{fontSize:11,color:MU,fontWeight:700,display:"block",marginBottom:6}}>NOTES (OPTIONAL)</label>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)}
          placeholder="Any observations, issues, or follow-up actions..."
          style={{width:"100%",minHeight:80,padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",
            fontSize:13,boxSizing:"border-box",fontFamily:"inherit",resize:"vertical"}} />
      </div>

      {requiredUnchecked.length > 0 && (
        <div style={{padding:"10px 14px",borderRadius:8,background:"#FEF2F2",border:"1px solid #FCA5A5",
          marginBottom:12,fontSize:12,color:DA,fontWeight:600}}>
          ⚠️ {requiredUnchecked.length} required item{requiredUnchecked.length!==1?"s":""} not yet ticked
        </div>
      )}

      <div style={{display:"flex",gap:10}}>
        <button onClick={completeChecklist} disabled={saving||requiredUnchecked.length>0}
          style={{...bp,flex:1,justifyContent:"center",
            opacity:requiredUnchecked.length>0?0.5:1}}>
          {saving?"Saving…":"✓ Mark Complete"}
        </button>
        <button onClick={()=>setActive(null)} style={bs}>Cancel</button>
      </div>
    </div>
  );

  // History view
  if (active?.viewingHistory) return (
    <div style={{padding:"24px 28px",maxWidth:720,margin:"0 auto"}}>
      <button onClick={()=>{setActive(null);setHistory([])}} style={{...bs,marginBottom:16,fontSize:12}}>← Back</button>
      <div style={{fontWeight:800,fontSize:18,color:DARK,marginBottom:16}}>{active.title} — History</div>
      {history.length === 0 ? (
        <div style={{...card,color:MU,textAlign:"center",padding:40}}>No completions recorded yet</div>
      ) : history.map(h => (
        <div key={h.id} style={{...card,marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <div style={{fontWeight:700,color:DARK}}>{h.completed_date}</div>
            <div style={{fontSize:12,color:MU}}>by {h.completed_by}</div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:h.notes?8:0}}>
            {(JSON.parse(h.items_data||"[]")).map(i=>(
              <span key={i.id} style={{fontSize:11,padding:"2px 8px",borderRadius:20,
                background:i.checked?"#F0FDF4":"#FEF2F2",
                color:i.checked?OK:DA,fontWeight:600}}>
                {i.checked?"✓":"✗"} {i.text.slice(0,30)}{i.text.length>30?"…":""}
              </span>
            ))}
          </div>
          {h.notes && <div style={{fontSize:12,color:MU,fontStyle:"italic"}}>"{h.notes}"</div>}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{padding:"24px 28px",maxWidth:1100,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{fontWeight:800,fontSize:20,color:DARK}}>✅ Checklists</div>
          <div style={{fontSize:13,color:MU,marginTop:2}}>{today}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setShowNew(!showNew)} style={bs}>+ New Checklist</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:20,background:"#fff",borderRadius:12,
        border:"1px solid #EDE8F4",padding:4,width:"fit-content"}}>
        {[["today","Today"],["manage","Manage"],["templates","NQF Templates"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{padding:"7px 16px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,
              background:tab===id?P:"transparent",color:tab===id?"#fff":MU}}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TODAY TAB ── */}
      {tab==="today" && (
        <div>
          {/* Stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
            {[
              {label:"Pending Today",val:pendingToday.length,color:pendingToday.length>0?WA:OK,icon:"⏳"},
              {label:"Completed Today",val:doneToday.length,color:OK,icon:"✅"},
              {label:"Total Active",val:checklists.length,color:P,icon:"📋"},
            ].map(s=>(
              <div key={s.label} style={{...card,textAlign:"center"}}>
                <div style={{fontSize:24,marginBottom:4}}>{s.icon}</div>
                <div style={{fontSize:28,fontWeight:800,color:s.color}}>{s.val}</div>
                <div style={{fontSize:11,color:MU,fontWeight:600}}>{s.label}</div>
              </div>
            ))}
          </div>

          {pendingToday.length > 0 && (
            <div style={{marginBottom:20}}>
              <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:12}}>⏳ Pending</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
                {pendingToday.map(cl=>(
                  <div key={cl.id} style={{...card,borderLeft:`3px solid ${WA}`,cursor:"pointer"}}
                    onClick={()=>openChecklist(cl)}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                      <span style={{fontSize:24}}>{CATEGORY_ICONS[cl.category]||"📋"}</span>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,color:DARK}}>{cl.title}</div>
                        <div style={{fontSize:11,color:MU}}>{cl.items?.length||0} items · {FREQ_LABELS[cl.frequency]||cl.frequency}</div>
                      </div>
                    </div>
                    <button onClick={e=>{e.stopPropagation();openChecklist(cl)}}
                      style={{...bp,width:"100%",fontSize:12}}>Start Checklist →</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {doneToday.length > 0 && (
            <div>
              <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:12}}>✅ Completed Today</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
                {doneToday.map(cl=>(
                  <div key={cl.id} style={{...card,borderLeft:`3px solid ${OK}`,opacity:0.85}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                      <span style={{fontSize:24}}>{CATEGORY_ICONS[cl.category]||"📋"}</span>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,color:DARK}}>{cl.title}</div>
                        <div style={{fontSize:11,color:OK,fontWeight:600}}>✓ Completed · by {cl.completed_by||"Staff"}</div>
                      </div>
                    </div>
                    <button onClick={()=>viewHistory(cl)} style={{...bs,width:"100%",fontSize:11}}>View History</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {checklists.length === 0 && (
            <div style={{...card,textAlign:"center",padding:60}}>
              <div style={{fontSize:48,marginBottom:12}}>📋</div>
              <div style={{fontWeight:700,fontSize:16,color:DARK,marginBottom:6}}>No checklists yet</div>
              <div style={{fontSize:13,color:MU,marginBottom:20}}>Add NQF templates or create your own</div>
              <button onClick={()=>setTab("templates")} style={bp}>Browse NQF Templates</button>
            </div>
          )}
        </div>
      )}

      {/* ── MANAGE TAB ── */}
      {tab==="manage" && (
        <div>
          {showNew && (
            <div style={{...card,marginBottom:20,borderLeft:`3px solid ${P}`}}>
              <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:12}}>New Checklist</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
                {[["Title","title","text"],["Category","category","select"],["Frequency","frequency","select"]].map(([lbl,key,type])=>(
                  <div key={key}>
                    <label style={{fontSize:11,color:MU,fontWeight:700,display:"block",marginBottom:4}}>{lbl.toUpperCase()}</label>
                    {type==="text" ? (
                      <input value={newForm[key]} onChange={e=>setNewForm(f=>({...f,[key]:e.target.value}))}
                        style={{padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:13,width:"100%",boxSizing:"border-box"}} />
                    ) : key==="category" ? (
                      <select value={newForm[key]} onChange={e=>setNewForm(f=>({...f,[key]:e.target.value}))}
                        style={{padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:13,width:"100%"}}>
                        {Object.entries(CATEGORY_ICONS).map(([v,i])=><option key={v} value={v}>{i} {v}</option>)}
                      </select>
                    ) : (
                      <select value={newForm[key]} onChange={e=>setNewForm(f=>({...f,[key]:e.target.value}))}
                        style={{padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:13,width:"100%"}}>
                        {Object.entries(FREQ_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:11,color:MU,fontWeight:700,display:"block",marginBottom:6}}>ITEMS</label>
                {newForm.items.map((item,i)=>(
                  <div key={i} style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
                    <span style={{fontSize:12,color:MU,minWidth:20}}>{i+1}.</span>
                    <span style={{flex:1,fontSize:13}}>{item.text}</span>
                    <label style={{fontSize:11,color:DA}}>
                      <input type="checkbox" checked={item.required} onChange={e=>{
                        const items=[...newForm.items]; items[i]={...items[i],required:e.target.checked};
                        setNewForm(f=>({...f,items}));
                      }} /> Req
                    </label>
                    <button onClick={()=>setNewForm(f=>({...f,items:f.items.filter((_,j)=>j!==i)}))}
                      style={{padding:"2px 8px",borderRadius:6,border:"1px solid #FCA5A5",background:"#FEF2F2",color:DA,cursor:"pointer",fontSize:11}}>✕</button>
                  </div>
                ))}
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  <input value={editItem} onChange={e=>setEditItem(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&editItem.trim()){
                      setNewForm(f=>({...f,items:[...f.items,{id:String(Date.now()),text:editItem.trim(),required:false}]}));
                      setEditItem("");
                    }}}
                    placeholder="Add item and press Enter..."
                    style={{flex:1,padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:13}} />
                  <button onClick={()=>{if(editItem.trim()){
                    setNewForm(f=>({...f,items:[...f.items,{id:String(Date.now()),text:editItem.trim(),required:false}]}));
                    setEditItem("");
                  }}} style={bs}>Add</button>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={async()=>{
                  if(!newForm.title)return;
                  await api2("/api/checklists",{method:"POST",body:newForm});
                  setNewForm({title:"",category:"daily",frequency:"daily",items:[]});
                  setShowNew(false); load();
                }} style={bp}>Save Checklist</button>
                <button onClick={()=>setShowNew(false)} style={bs}>Cancel</button>
              </div>
            </div>
          )}

          {checklists.map(cl=>(
            <div key={cl.id} style={{...card,marginBottom:10,display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:24}}>{CATEGORY_ICONS[cl.category]||"📋"}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:DARK}}>{cl.title}</div>
                <div style={{fontSize:11,color:MU}}>{cl.items?.length||0} items · {FREQ_LABELS[cl.frequency]} · {cl.completed_today?"✅ Done today":"⏳ Pending"}</div>
              </div>
              <button onClick={()=>viewHistory(cl)} style={{...bs,fontSize:11,padding:"5px 12px"}}>History</button>
              <button onClick={()=>deleteChecklist(cl.id)} style={{padding:"5px 10px",borderRadius:7,border:"1px solid #FCA5A5",background:"#FEF2F2",color:DA,cursor:"pointer",fontSize:11}}>Archive</button>
            </div>
          ))}
        </div>
      )}

      {/* ── NQF TEMPLATES TAB ── */}
      {tab==="templates" && (
        <div>
          <div style={{fontSize:13,color:MU,marginBottom:16}}>
            Pre-built checklists aligned to the National Quality Framework. Click "Add to My Checklists" to start using.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:14}}>
            {templates.map(tpl=>{
              const alreadyAdded = checklists.some(c=>c.title===tpl.title);
              return (
                <div key={tpl.id} style={{...card,borderLeft:`3px solid ${alreadyAdded?OK:P}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <span style={{fontSize:28}}>{tpl.icon||"📋"}</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,color:DARK}}>{tpl.title}</div>
                      <div style={{fontSize:11,color:MU}}>{tpl.items.length} items · {FREQ_LABELS[tpl.frequency]}</div>
                    </div>
                    {alreadyAdded && <span style={{fontSize:11,color:OK,fontWeight:700}}>✓ Added</span>}
                  </div>
                  <div style={{marginBottom:10}}>
                    {tpl.items.slice(0,3).map(i=>(
                      <div key={i.id} style={{fontSize:12,color:MU,padding:"2px 0",borderBottom:"1px solid #F5F0FF"}}>
                        • {i.text}
                        {i.required&&<span style={{color:DA,fontSize:10,marginLeft:4}}>*</span>}
                      </div>
                    ))}
                    {tpl.items.length>3&&<div style={{fontSize:11,color:MU,marginTop:4}}>+{tpl.items.length-3} more items...</div>}
                  </div>
                  {!alreadyAdded && (
                    <button onClick={()=>addFromTemplate(tpl)} style={{...bp,width:"100%",fontSize:12}}>
                      + Add to My Checklists
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
