import { useState, useEffect, useCallback } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}), ...opts.headers },
    method: opts.method || "GET", ...(opts.body ? { body: opts.body } : {}),
  }).then(r => r.json());
};

const purple = "#8B6DAF";
const lightPurple = "#F0EBF8";

function ageMonths(dob) {
  if (!dob) return null;
  const d = new Date(dob), now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
}
function ageLabel(dob) {
  const m = ageMonths(dob); if (m === null) return "";
  if (m < 24) return `${m}mo`; const y = Math.floor(m/12), mo = m%12;
  return mo ? `${y}y ${mo}mo` : `${y}y`;
}
function fmtTime(t) { return t ? t.substring(0,5) : "—"; }
function childFitsGroup(child, group) {
  if (!group) return true;
  const m = ageMonths(child.dob); if (m === null) return true;
  return m >= group.min_months && m < group.max_months;
}
function findGroup(ageGroups, id) {
  return ageGroups.find(g => g.group_id === id) || null;
}

// ─── AGE GROUP SETTINGS MODAL ────────────────────────────────────────────────
const PRESET_COLORS = ["#C9929E","#9B7DC0","#6BA38B","#5B8DB5","#D4A26A","#8B6DAF","#E07B54","#4CAF50","#FF9800","#607D8B"];

function AgeGroupSettingsModal({ onClose, onChanged }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | {group object}
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    const r = await API("/api/age-groups");
    if (Array.isArray(r)) setGroups(r);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const startNew = () => {
    setForm({ label:"", sub:"", min_months:0, max_months:999, ratio:10, color:"#8B6DAF" });
    setEditing("new");
    setError("");
  };
  const startEdit = (g) => {
    setForm({ ...g });
    setEditing(g);
    setError("");
  };
  const cancel = () => { setEditing(null); setError(""); };

  const save = async () => {
    if (!form.label?.trim()) { setError("Label is required"); return; }
    if (!form.ratio || form.ratio < 1) { setError("Ratio must be at least 1"); return; }
    setSaving(true); setError("");
    try {
      if (editing === "new") {
        await API("/api/age-groups", { method: "POST", body: JSON.stringify({
          label: form.label, sub: form.sub, min_months: parseInt(form.min_months)||0,
          max_months: parseInt(form.max_months)||999, ratio: parseInt(form.ratio)||10, color: form.color
        })});
      } else {
        await API(`/api/age-groups/${editing.id}`, { method: "PUT", body: JSON.stringify({
          label: form.label, sub: form.sub, min_months: parseInt(form.min_months)||0,
          max_months: parseInt(form.max_months)||999, ratio: parseInt(form.ratio)||10, color: form.color
        })});
      }
      await load();
      setEditing(null);
      onChanged();
    } catch(e) { setError(e.message); }
    setSaving(false);
  };

  const del = async (g) => {
    if (!confirm(`Delete "${g.label}" age group? This cannot be undone.`)) return;
    const r = await API(`/api/age-groups/${g.id}`, { method: "DELETE" });
    if (r.error) { alert(r.error); return; }
    await load(); onChanged();
  };

  const u = (k,v) => setForm(p => ({...p, [k]:v}));
  const inp = { width:"100%", padding:"8px 10px", borderRadius:7, border:"1px solid #DDD6EE", fontSize:13, boxSizing:"border-box" };
  const lbl = { fontSize:11, color:"#7A6E8A", fontWeight:700, display:"block", marginBottom:3 };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(60,45,70,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:3000}}>
      <div style={{background:"#fff",borderRadius:18,width:620,maxWidth:"95vw",maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 80px rgba(0,0,0,0.25)"}}>
        {/* Header */}
        <div style={{padding:"20px 24px 16px",borderBottom:"1px solid #EDE8F4",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div>
            <h2 style={{margin:0,fontSize:18,fontWeight:800,color:"#3D3248"}}>⚙️ Age Group Settings</h2>
            <p style={{margin:"3px 0 0",fontSize:12,color:"#8A7F96"}}>Configure age groups and NQF ratios for your centre</p>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:22,color:"#A89DB5",lineHeight:1}}>×</button>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:24}}>
          {loading ? (
            <div style={{textAlign:"center",padding:40,color:"#8A7F96"}}>Loading...</div>
          ) : editing ? (
            /* ── Edit / Add Form ── */
            <div>
              <h3 style={{margin:"0 0 18px",fontSize:15,fontWeight:700,color:"#3D3248"}}>
                {editing==="new" ? "Add New Age Group" : `Edit: ${editing.label}`}
              </h3>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div style={{gridColumn:"span 2"}}>
                  <label style={lbl}>Group Name *</label>
                  <input style={inp} value={form.label||""} onChange={e=>u("label",e.target.value)} placeholder="e.g. Babies, Toddlers, Preschool" />
                </div>
                <div style={{gridColumn:"span 2"}}>
                  <label style={lbl}>Description / Age Range Text</label>
                  <input style={inp} value={form.sub||""} onChange={e=>u("sub",e.target.value)} placeholder="e.g. 0–24 months" />
                </div>
                <div>
                  <label style={lbl}>Min Age (months)</label>
                  <input type="number" min="0" style={inp} value={form.min_months||0} onChange={e=>u("min_months",e.target.value)} />
                  <div style={{fontSize:10,color:"#8A7F96",marginTop:2}}>{Math.floor((parseInt(form.min_months)||0)/12)} years {(parseInt(form.min_months)||0)%12} months</div>
                </div>
                <div>
                  <label style={lbl}>Max Age (months, 999 = no limit)</label>
                  <input type="number" min="1" style={inp} value={form.max_months||999} onChange={e=>u("max_months",e.target.value)} />
                  <div style={{fontSize:10,color:"#8A7F96",marginTop:2}}>
                    {(parseInt(form.max_months)||999) >= 999 ? "No upper limit" : `${Math.floor((parseInt(form.max_months)||0)/12)} years ${(parseInt(form.max_months)||0)%12} months`}
                  </div>
                </div>
                <div>
                  <label style={lbl}>NQF Educator:Child Ratio (1:?)</label>
                  <input type="number" min="1" max="30" style={inp} value={form.ratio||10} onChange={e=>u("ratio",e.target.value)} />
                  <div style={{fontSize:10,color:"#8A7F96",marginTop:2}}>1 educator per {form.ratio||10} children</div>
                </div>
                <div>
                  <label style={lbl}>Colour</label>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <input type="color" value={form.color||"#8B6DAF"} onChange={e=>u("color",e.target.value)}
                      style={{width:40,height:36,borderRadius:6,border:"1px solid #DDD",cursor:"pointer",padding:2}} />
                    <div style={{flex:1}}>
                      <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                        {PRESET_COLORS.map(c=>(
                          <div key={c} onClick={()=>u("color",c)}
                            style={{width:22,height:22,borderRadius:"50%",background:c,cursor:"pointer",border:`2px solid ${form.color===c?"#333":"transparent"}`,flexShrink:0}}/>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div style={{marginTop:16,padding:"12px 16px",borderRadius:10,background:lightPurple,border:`1px solid ${purple}30`}}>
                <div style={{fontSize:12,fontWeight:700,color:"#5C4E6A",marginBottom:8}}>Preview</div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:12,height:12,borderRadius:"50%",background:form.color||purple,flexShrink:0}}/>
                  <span style={{background:(form.color||purple)+"25",color:form.color||purple,borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:700}}>
                    {form.label||"Group Name"}
                  </span>
                  <span style={{fontSize:12,color:"#8A7F96"}}>{form.sub||"Age range"} · 1:{form.ratio||10} ratio</span>
                </div>
              </div>

              {error && <div style={{marginTop:10,padding:"8px 12px",borderRadius:7,background:"#FFF5F5",border:"1px solid #FFCDD2",color:"#C06B73",fontSize:12}}>{error}</div>}

              <div style={{display:"flex",gap:10,marginTop:20}}>
                <button onClick={save} disabled={saving}
                  style={{flex:1,padding:"11px 0",borderRadius:9,background:purple,color:"#fff",border:"none",cursor:saving?"not-allowed":"pointer",fontWeight:700,fontSize:14}}>
                  {saving?"Saving…":editing==="new"?"Add Age Group":"Save Changes"}
                </button>
                <button onClick={cancel}
                  style={{padding:"11px 20px",borderRadius:9,background:"#F5F0FB",color:"#5C4E6A",border:"none",cursor:"pointer",fontWeight:600,fontSize:13}}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* ── Group List ── */
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <p style={{margin:0,fontSize:13,color:"#8A7F96"}}>{groups.length} age group{groups.length!==1?"s":""} configured</p>
                <button onClick={startNew}
                  style={{background:purple,color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:13}}>
                  + Add Age Group
                </button>
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {groups.map(g => (
                  <div key={g.id} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",borderRadius:12,border:"1px solid #EDE8F4",background:"#FDFBF9"}}>
                    <div style={{width:6,height:48,borderRadius:3,background:g.color,flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                        <span style={{background:g.color+"25",color:g.color,borderRadius:20,padding:"3px 10px",fontSize:13,fontWeight:800}}>{g.label}</span>
                        <span style={{fontSize:12,color:"#8A7F96"}}>{g.sub}</span>
                      </div>
                      <div style={{fontSize:11,color:"#8A7F96"}}>
                        Ages {g.min_months}–{g.max_months>=999?"∞":g.max_months} months · NQF ratio 1:{g.ratio} · 1 educator per {g.ratio} children
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      <button onClick={()=>startEdit(g)}
                        style={{padding:"6px 14px",borderRadius:7,border:"1px solid #EDE8F4",background:"#fff",color:"#555",cursor:"pointer",fontSize:12,fontWeight:600}}>
                        ✏️ Edit
                      </button>
                      <button onClick={()=>del(g)}
                        style={{padding:"6px 10px",borderRadius:7,border:"1px solid #FFCDD2",background:"#FFF5F5",color:"#C06B73",cursor:"pointer",fontSize:12}}>
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
                {groups.length === 0 && (
                  <div style={{textAlign:"center",padding:40,color:"#B0AAB9",fontSize:13}}>
                    No age groups configured. Add one above or they will be auto-populated with defaults.
                  </div>
                )}
              </div>

              <div style={{marginTop:20,padding:"14px 16px",borderRadius:10,background:"#F8F5FF",border:"1px solid #DDD6EE",fontSize:12,color:"#5C4E6A",lineHeight:1.7}}>
                <strong>💡 Tips:</strong><br/>
                Age groups control NQF educator:child ratios and which children are age-appropriate for each room.
                Children outside a room's age group will show a warning during assignment.
                Deleting an age group requires all rooms using it to be updated first.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ROOM EDIT MODAL ─────────────────────────────────────────────────────────
function RoomEditModal({ room, ageGroups, onSave, onClose }) {
  const [form, setForm] = useState(room ? {
    id: room.id, name: room.name||"",
    ageGroup: room.ageGroup||room.age_group||"preschool",
    capacity: room.capacity||20, description: room.description||""
  } : { name:"", ageGroup: ageGroups[0]?.group_id||"preschool", capacity:20, description:"" });
  const [saving, setSaving] = useState(false);

  const u = (k,v) => setForm(p=>({...p,[k]:v}));
  const g = ageGroups.find(x => x.group_id === form.ageGroup);

  const handleSave = async () => {
    if (!form.name?.trim()) { alert("Room name is required"); return; }
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  const inp = { width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid #DDD6EE", fontSize:13, boxSizing:"border-box" };
  const lbl = { fontSize:11, color:"#7A6E8A", fontWeight:700, display:"block", marginBottom:4 };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(60,45,70,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000}}>
      <div style={{background:"#fff",borderRadius:16,padding:28,width:460,maxWidth:"90vw",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{margin:0,fontSize:18,fontWeight:700,color:"#3D3248"}}>{room?"Edit Room":"Add Room"}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#A89DB5"}}>×</button>
        </div>
        <div style={{display:"grid",gap:14}}>
          <div>
            <label style={lbl}>Room Name *</label>
            <input value={form.name} onChange={e=>u("name",e.target.value)} style={inp} placeholder="e.g. Joeys Room" />
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label style={lbl}>Age Group</label>
              <select value={form.ageGroup} onChange={e=>u("ageGroup",e.target.value)} style={inp}>
                {ageGroups.map(g=><option key={g.group_id} value={g.group_id}>{g.label}{g.sub?` — ${g.sub}`:""}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Capacity</label>
              <input type="number" min="1" max="200" value={form.capacity} onChange={e=>u("capacity",parseInt(e.target.value)||20)} style={inp}/>
            </div>
          </div>
          <div>
            <label style={lbl}>Description (optional)</label>
            <input value={form.description} onChange={e=>u("description",e.target.value)} style={inp} placeholder="e.g. Main Babies Room — Building A"/>
          </div>
          {g && (
            <div style={{background:(g.color||purple)+"15",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#5C4E6A",border:`1px solid ${g.color||purple}30`}}>
              <strong style={{color:g.color||purple}}>{g.label}</strong> — NQF ratio 1:{g.ratio} · {form.capacity} children needs <strong>{Math.ceil(form.capacity/g.ratio)} educator{Math.ceil(form.capacity/g.ratio)!==1?"s":""}</strong>
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:10,marginTop:22}}>
          <button onClick={handleSave} disabled={saving}
            style={{flex:1,padding:"11px 0",borderRadius:9,background:purple,color:"#fff",border:"none",cursor:saving?"not-allowed":"pointer",fontWeight:700,fontSize:14}}>
            {saving?"Saving…":room?"Save Changes":"Add Room"}
          </button>
          <button onClick={onClose}
            style={{flex:0.5,padding:"11px 0",borderRadius:9,background:"#F0EBF8",color:purple,border:"none",cursor:"pointer",fontWeight:600,fontSize:13}}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AGE WARNING MODAL ───────────────────────────────────────────────────────
function AgeWarningModal({ child, toGroup, onConfirm, onCancel }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#fff",borderRadius:16,padding:28,maxWidth:440,width:"90%",boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}}>
        <div style={{fontSize:36,textAlign:"center",marginBottom:12}}>⚠️</div>
        <h3 style={{margin:"0 0 10px",color:"#B71C1C",textAlign:"center",fontSize:16}}>Age Group Mismatch</h3>
        <p style={{margin:"0 0 16px",fontSize:13,color:"#3D3248",lineHeight:1.6,textAlign:"center"}}>
          <strong>{child.first_name} {child.last_name}</strong> is <strong>{ageLabel(child.dob)}</strong> old, outside the <strong>{toGroup?.label}</strong> range ({toGroup?.sub}).
        </p>
        <div style={{background:"#FFF3E0",borderRadius:10,padding:"12px 16px",marginBottom:20,border:"1px solid #FFCC80"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#E65100",marginBottom:6}}>Proceeding will:</div>
          <div style={{fontSize:12,color:"#555",lineHeight:1.8}}>• Place {child.first_name} outside their designated age range<br/>• Create an audit log entry<br/>• Flag on NQF ratio compliance reports</div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel} style={{flex:1,padding:"10px 0",borderRadius:8,border:"1px solid #DDD",background:"#FDFBF9",color:"#555",cursor:"pointer",fontWeight:600,fontSize:13}}>Cancel</button>
          <button onClick={onConfirm} style={{flex:1,padding:"10px 0",borderRadius:8,border:"none",background:"#B71C1C",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>Override &amp; Place</button>
        </div>
      </div>
    </div>
  );
}

// ─── CHILD AVATAR ────────────────────────────────────────────────────────────
function ChildAvatar({ child, size=32, color }) {
  const colors=["#C9929E","#9B7DC0","#6BA38B","#D4A26A","#5B8DB5"];
  const c=color||colors[(child.first_name?.charCodeAt(0)||0)%colors.length];
  if(child.photo_url) return <img src={child.photo_url} alt="" style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0}}/>;
  return <div style={{width:size,height:size,borderRadius:"50%",background:c+"30",border:`2px solid ${c}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.33,fontWeight:700,color:c,flexShrink:0}}>{child.first_name?.[0]}{child.last_name?.[0]}</div>;
}

// ─── RATIO BAR ───────────────────────────────────────────────────────────────
function RatioBar({ count, capacity, group }) {
  const required = group ? Math.ceil(count/group.ratio) : 0;
  const pct = capacity>0 ? count/capacity : 0;
  const statusColor = pct>0.95?"#B71C1C":pct>0.8?"#E65100":"#2E7D32";
  return (
    <div>
      <div style={{background:"#EDE8F4",borderRadius:6,height:6,overflow:"hidden",marginBottom:6}}>
        <div style={{height:"100%",borderRadius:6,transition:"width 0.3s",background:pct>0.95?"#B71C1C":pct>0.8?"#E65100":group?.color||purple,width:`${Math.min(pct*100,100)}%`}}/>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <div style={{width:8,height:8,borderRadius:"50%",background:statusColor,flexShrink:0}}/>
        <span style={{fontSize:11,color:statusColor,fontWeight:700}}>{count}/{capacity} children · {required} educator{required!==1?"s":""} req.</span>
      </div>
    </div>
  );
}

// ─── ROOM DETAIL PANEL ───────────────────────────────────────────────────────
function RoomDetailPanel({ room, group, children, ageGroups, onBack, onEdit, onDelete, userRole }) {
  const [stats, setStats] = useState(null);
  const [educators, setEducators] = useState([]);
  const [allEducators, setAllEducators] = useState([]);
  const [showAssign, setShowAssign] = useState(false);
  const [view, setView] = useState("children");
  const canManage = ["admin","director","manager"].includes(userRole);

  useEffect(() => {
    API(`/api/rooms/${room.id}/stats`).then(r=>{if(r)setStats(r);}).catch(()=>{});
    API(`/api/rooms/${room.id}/educators`).then(r=>{if(Array.isArray(r))setEducators(r);}).catch(()=>{});
  }, [room.id]);

  const loadAllEducators = async () => {
    const r = await API("/api/educators").catch(()=>({}));
    if(Array.isArray(r)) setAllEducators(r);
    else if(Array.isArray(r?.educators)) setAllEducators(r.educators);
    setShowAssign(true);
  };
  const assignEducator = async (educatorId) => {
    await API(`/api/rooms/${room.id}/educators`,{method:"POST",body:JSON.stringify({educator_id:educatorId})});
    const r=await API(`/api/rooms/${room.id}/educators`);
    if(Array.isArray(r))setEducators(r);
    setShowAssign(false);
  };
  const removeEducator = async (educatorId) => {
    await API(`/api/rooms/${room.id}/educators/${educatorId}`,{method:"DELETE"});
    setEducators(prev=>prev.filter(e=>e.id!==educatorId));
  };

  const roomChildren = children.filter(c=>c.room_id===room.id);
  const present = stats?.todayAttendance||0;
  const requiredEducators = Math.ceil(roomChildren.length/(group?.ratio||10));

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"16px 24px 0",borderBottom:"1px solid #EDE8F4",background:"#fff",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <button onClick={onBack} style={{background:lightPurple,border:`1px solid ${purple}40`,color:purple,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontWeight:600,fontSize:12}}>← Back</button>
          <div style={{width:4,height:40,borderRadius:2,background:group?.color||purple}}/>
          <div>
            <h2 style={{margin:0,color:"#3D3248",fontSize:20}}>{room.name}</h2>
            <div style={{fontSize:12,color:"#8A7F96",marginTop:2}}>{group?.label} · {group?.sub} · 1:{group?.ratio} ratio · Capacity {room.capacity}</div>
          </div>
          <div style={{marginLeft:"auto",display:"flex",gap:8}}>
            {canManage&&<button onClick={()=>onEdit(room)} style={{padding:"7px 14px",borderRadius:8,border:"1px solid #EDE8F4",background:"#FDFBF9",color:"#555",cursor:"pointer",fontSize:12}}>✏️ Edit Room</button>}
            {canManage&&<button onClick={()=>onDelete(room)} style={{padding:"7px 10px",borderRadius:8,border:"1px solid #FFCDD2",background:"#FFF5F5",color:"#C06B73",cursor:"pointer",fontSize:12}}>🗑 Delete</button>}
          </div>
        </div>
        <div style={{display:"flex",gap:12,marginBottom:14}}>
          {[
            {label:"Enrolled",value:roomChildren.length,color:purple,icon:"👧"},
            {label:"Present Today",value:present,color:"#2E7D32",icon:"✅"},
            {label:"Absent",value:Math.max(0,roomChildren.length-present),color:"#E65100",icon:"❌"},
            {label:"Educators Assigned",value:educators.length,color:"#5B8DB5",icon:"👩‍🏫",warn:educators.length<requiredEducators},
            {label:"Required Educators",value:requiredEducators,color:"#8A7F96",icon:"📋"},
          ].map(s=>(
            <div key={s.label} style={{flex:1,textAlign:"center",padding:"10px 8px",borderRadius:10,border:`1px solid ${s.warn?"#FFCDD2":"#EDE8F4"}`,background:s.warn?"#FFF5F5":"#fff"}}>
              <div style={{fontSize:18}}>{s.icon}</div>
              <div style={{fontSize:20,fontWeight:800,color:s.warn?"#B71C1C":s.color}}>{s.value}</div>
              <div style={{fontSize:10,color:"#8A7F96",marginTop:1}}>{s.label}</div>
              {s.warn&&<div style={{fontSize:9,color:"#B71C1C",fontWeight:700}}>⚠ Understaffed</div>}
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:2}}>
          {[["children","👧 Children"],["educators","👩‍🏫 Educators"],["activity","📋 Today's Activity"]].map(([id,label])=>(
            <button key={id} onClick={()=>setView(id)}
              style={{padding:"7px 14px",borderRadius:"8px 8px 0 0",border:"none",cursor:"pointer",fontSize:12,fontWeight:view===id?700:500,
              background:view===id?lightPurple:"transparent",color:view===id?purple:"#6B5F7A",
              borderBottom:view===id?`2px solid ${purple}`:"2px solid transparent"}}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"16px 24px"}}>
        {view==="children"&&(
          <div>
            {roomChildren.length===0?(
              <div style={{textAlign:"center",padding:48,color:"#B0AAB9",fontSize:14}}>No children assigned to {room.name}</div>
            ):(
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr style={{borderBottom:"2px solid #EDE8F4"}}>
                    {["Child","Age","Arrival","Departure","Status","Allergy Alert"].map(h=>(
                      <th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:10,color:"#8A7F96",fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roomChildren.map(child=>{
                    const fits=childFitsGroup(child,group);
                    const att=(stats?.children||[]).find(c=>c.id===child.id);
                    const signedIn=att?.sign_in&&!att?.sign_out;
                    const signedOut=att?.sign_in&&att?.sign_out;
                    const status=signedOut?"signed-out":signedIn?"present":"absent";
                    return(
                      <tr key={child.id} style={{borderBottom:"1px solid #F5F0FB",background:!fits?"#FFF8F8":"transparent"}}>
                        <td style={{padding:"10px 12px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <ChildAvatar child={child} size={32} color={group?.color}/>
                            <div>
                              <div style={{fontWeight:700,color:"#3D3248"}}>{child.first_name} {child.last_name}</div>
                              {!fits&&<div style={{fontSize:9,color:"#E65100",fontWeight:700}}>⚠ Outside age range</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{padding:"10px 12px",color:"#8A7F96",fontSize:12}}>{ageLabel(child.dob)||"—"}</td>
                        <td style={{padding:"10px 12px",fontSize:12}}>{fmtTime(att?.sign_in)}</td>
                        <td style={{padding:"10px 12px",fontSize:12}}>{fmtTime(att?.sign_out)}</td>
                        <td style={{padding:"10px 12px"}}>
                          <span style={{padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700,
                            background:status==="present"?"#E8F5E9":status==="signed-out"?"#E3F2FD":"#FFF3E0",
                            color:status==="present"?"#2E7D32":status==="signed-out"?"#1565C0":"#E65100"}}>
                            {status==="present"?"✓ Present":status==="signed-out"?"Signed Out":"Not Arrived"}
                          </span>
                        </td>
                        <td style={{padding:"10px 12px"}}>
                          {child.allergies&&child.allergies!=="None"
                            ?<span style={{fontSize:11,color:"#B71C1C",fontWeight:700}}>⚠ {child.allergies}</span>
                            :<span style={{fontSize:11,color:"#B0AAB9"}}>None</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {view==="educators"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div>
                <h4 style={{margin:0,fontSize:14,fontWeight:700}}>Educators Assigned to {room.name}</h4>
                <p style={{margin:"2px 0 0",fontSize:11,color:"#8A7F96"}}>
                  {educators.length} assigned · {requiredEducators} required (1:{group?.ratio} ratio)
                  {educators.length<requiredEducators&&<span style={{color:"#B71C1C",fontWeight:700}}> · ⚠ Understaffed</span>}
                </p>
              </div>
              {canManage&&<button onClick={loadAllEducators} style={{background:purple,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Assign Educator</button>}
            </div>
            {showAssign&&(
              <div style={{background:lightPurple,borderRadius:12,padding:16,marginBottom:16,border:`1px solid ${purple}30`}}>
                <div style={{fontSize:12,fontWeight:700,color:"#3D3248",marginBottom:10}}>Select educator to assign:</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8}}>
                  {allEducators.filter(e=>!educators.find(a=>a.id===e.id)).map(e=>(
                    <button key={e.id} onClick={()=>assignEducator(e.id)}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:"1px solid #DDD6EE",background:"#fff",cursor:"pointer",textAlign:"left"}}>
                      <div style={{width:32,height:32,borderRadius:"50%",background:purple+"25",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:purple,flexShrink:0}}>{e.name?.[0]}</div>
                      <div><div style={{fontSize:12,fontWeight:700,color:"#3D3248"}}>{e.name}</div><div style={{fontSize:10,color:"#8A7F96"}}>{e.role}</div></div>
                    </button>
                  ))}
                  {allEducators.filter(e=>!educators.find(a=>a.id===e.id)).length===0&&<div style={{gridColumn:"span 3",textAlign:"center",padding:20,color:"#B0AAB9",fontSize:12}}>All educators already assigned</div>}
                </div>
                <button onClick={()=>setShowAssign(false)} style={{marginTop:10,fontSize:12,color:"#8A7F96",background:"none",border:"none",cursor:"pointer"}}>Cancel</button>
              </div>
            )}
            {educators.length===0?(
              <div style={{textAlign:"center",padding:48,color:"#B0AAB9",fontSize:13}}>No educators assigned yet</div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
                {educators.map(e=>(
                  <div key={e.id} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1px solid #EDE8F4",display:"flex",alignItems:"flex-start",gap:12}}>
                    <div style={{width:44,height:44,borderRadius:"50%",background:purple+"25",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:purple,flexShrink:0}}>{e.name?.[0]}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:13,color:"#3D3248"}}>{e.name}</div>
                      <div style={{fontSize:11,color:"#8A7F96",marginTop:1}}>{e.role}</div>
                      {e.qualifications&&<div style={{fontSize:10,color:"#5B8DB5",marginTop:2}}>🎓 {e.qualifications}</div>}
                    </div>
                    {canManage&&<button onClick={()=>removeEducator(e.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#C06B73",fontSize:14,padding:"0 2px"}}>✕</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view==="activity"&&(
          <div>
            <h4 style={{margin:"0 0 14px",fontSize:14,fontWeight:700}}>Today's Activity — {room.name}</h4>
            {!stats?.recentUpdates?.length?(
              <div style={{textAlign:"center",padding:48,color:"#B0AAB9",fontSize:13}}>No activity recorded today</div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {stats.recentUpdates.map((u,i)=>{
                  const icons={sleep:"😴",food:"🍽️",nappy:"👶",activity:"🎨",incident:"🩹",observation:"👁️",medication:"💊"};
                  return(
                    <div key={i} style={{display:"flex",gap:12,padding:"12px 16px",background:"#fff",borderRadius:10,border:"1px solid #EDE8F4"}}>
                      <div style={{width:36,height:36,borderRadius:"50%",background:"#F0EBF8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{icons[u.category]||"📝"}</div>
                      <div>
                        <div style={{fontWeight:700,fontSize:12,color:"#3D3248"}}>{u.first_name}</div>
                        <div style={{fontSize:12,color:"#5C4E6A",marginTop:2}}>{u.notes||u.summary||u.category}</div>
                        <div style={{fontSize:10,color:"#B0AAB9",marginTop:3}}>{u.category} · {u.created_at?.substring(11,16)||""}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CHILD CHIP ──────────────────────────────────────────────────────────────
function ChildChip({child,group,isDragging,isMoving,fitsGroup,onDragStart,onDragEnd}){
  return(
    <div draggable={!isMoving} onDragStart={e=>{e.stopPropagation();onDragStart();}} onDragEnd={onDragEnd}
      title={`${child.first_name} ${child.last_name} · ${ageLabel(child.dob)}${!fitsGroup?" ⚠ outside age range":""}`}
      style={{display:"flex",alignItems:"center",gap:5,padding:"4px 8px",borderRadius:20,background:isDragging?lightPurple:fitsGroup?"#fff":"#FFF3E0",border:`1px solid ${isDragging?purple:fitsGroup?(group?.color||purple)+"50":"#FFCC80"}`,cursor:isDragging?"grabbing":"grab",opacity:isDragging?0.5:isMoving?0.4:1,transition:"all 0.15s",userSelect:"none",boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
      <ChildAvatar child={child} size={22} color={group?.color}/>
      <span style={{fontSize:11,fontWeight:600,color:"#3D3248",maxWidth:68,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{child.first_name}</span>
      {!fitsGroup&&<span style={{fontSize:9}}>⚠</span>}
      {isMoving&&<span style={{fontSize:10,color:"#8A7F96"}}>…</span>}
    </div>
  );
}

// ─── PANEL CHILD ROW ─────────────────────────────────────────────────────────
function PanelChildRow({child,fits,selectedGroup,isDragging,isMoving,canOverride,onDragStart,onDragEnd,onAssign}){
  return(
    <div draggable={!isMoving&&(fits||canOverride)} onDragStart={e=>{e.stopPropagation();if(fits||canOverride)onDragStart();}} onDragEnd={onDragEnd}
      style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,background:isDragging?lightPurple:fits?"#FDFBF9":"#FFF8F8",border:`1px solid ${isDragging?purple:fits?"#EDE8F4":"#FFCDD2"}`,cursor:!fits&&!canOverride?"not-allowed":isDragging?"grabbing":"grab",opacity:isDragging?0.5:isMoving?0.4:!fits&&!canOverride?0.55:1,transition:"all 0.15s",userSelect:"none"}}>
      <ChildAvatar child={child} size={30} color={fits?purple:"#C06B73"}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:700,color:"#3D3248",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{child.first_name} {child.last_name}</div>
        <div style={{fontSize:10,color:fits?"#8A7F96":"#C06B73"}}>{ageLabel(child.dob)||"Age unknown"}{!fits&&selectedGroup&&<span style={{fontWeight:700}}> · not {selectedGroup.label}</span>}{child.room_id&&<span style={{color:"#B0AAB9"}}> · assigned</span>}</div>
      </div>
      {onAssign&&(fits||canOverride)&&!isMoving&&(
        <button onClick={e=>{e.stopPropagation();onAssign();}} title={fits?"Assign to room":"Override"} style={{width:24,height:24,borderRadius:"50%",border:"none",background:fits?purple:"#E65100",color:"#fff",cursor:"pointer",fontSize:14,lineHeight:"24px",flexShrink:0}}>+</button>
      )}
      {isMoving&&<span style={{fontSize:11,color:"#8A7F96"}}>…</span>}
    </div>
  );
}

// ─── MAIN MODULE ─────────────────────────────────────────────────────────────
export default function RoomsModule() {
  const [rooms, setRooms] = useState([]);
  const [children, setChildren] = useState([]);
  const [ageGroups, setAgeGroups] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [viewDetail, setViewDetail] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [moving, setMoving] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState(null);
  const [userRole, setUserRole] = useState("educator");
  const [editRoom, setEditRoom] = useState(null);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showAgeGroupSettings, setShowAgeGroupSettings] = useState(false);

  useEffect(()=>{
    try{const token=localStorage.getItem("c360_token");if(token){const p=JSON.parse(atob(token.split(".")[1]));setUserRole(p.role||"educator");}}catch(e){}
  },[]);

  const canOverride = ["admin","director","manager"].includes(userRole);
  const canManageSettings = true; // Age group settings visible to all roles

  const load = useCallback(async()=>{
    try{
      const [rm, ch, ag] = await Promise.all([API("/api/rooms"), API("/api/children"), API("/api/age-groups")]);
      if(Array.isArray(ag)) setAgeGroups(ag);
      if(Array.isArray(rm)) setRooms(rm.map(r=>({...r, ageGroup: r.age_group||r.ageGroup})));
      if(Array.isArray(ch)) setChildren(ch);
    }catch(e){}
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const saveRoom = async(data) => {
    try {
      if(data.id) {
        await API(`/api/rooms/${data.id}`, {method:"PUT", body:JSON.stringify({name:data.name, ageGroup:data.ageGroup, capacity:data.capacity, description:data.description})});
        setRooms(prev => prev.map(r => r.id===data.id ? {...r,...data,age_group:data.ageGroup,ageGroup:data.ageGroup} : r));
      } else {
        const res = await API("/api/rooms", {method:"POST", body:JSON.stringify({name:data.name, ageGroup:data.ageGroup, capacity:data.capacity||20, description:data.description})});
        if(res.id) setRooms(prev => [...prev, {...data, id:res.id, age_group:data.ageGroup, ageGroup:data.ageGroup}]);
      }
    } catch(e) { alert("Save failed: " + e.message); }
    setEditRoom(null);
    setShowAddRoom(false);
  };

  const deleteRoom = async(room)=>{
    try{const r=await API(`/api/rooms/${room.id}`,{method:"DELETE"});if(r.error){alert(r.error);}else{setRooms(prev=>prev.filter(rm=>rm.id!==room.id));if(selectedRoomId===room.id){setSelectedRoomId(null);setViewDetail(false);}}}catch(e){alert("Delete failed");}
    setDeleteConfirm(null);
  };

  const selectedRoom = rooms.find(r=>r.id===selectedRoomId)||null;
  const selectedGroup = selectedRoom ? findGroup(ageGroups, selectedRoom.ageGroup||selectedRoom.age_group) : null;
  const childrenByRoom = rooms.reduce((acc,r)=>{acc[r.id]=children.filter(c=>c.room_id===r.id);return acc;},{});
  const unassigned = children.filter(c=>!c.room_id||!rooms.find(r=>r.id===c.room_id));

  const rightPanelChildren=(()=>{
    const pool=selectedRoomId?children.filter(c=>c.room_id!==selectedRoomId):unassigned;
    const filtered=search?pool.filter(c=>`${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase())):pool;
    if(!selectedGroup)return filtered;
    const fits=filtered.filter(c=>childFitsGroup(c,selectedGroup)).sort((a,b)=>(ageMonths(a.dob)||0)-(ageMonths(b.dob)||0));
    const noFit=filtered.filter(c=>!childFitsGroup(c,selectedGroup)).sort((a,b)=>(ageMonths(a.dob)||0)-(ageMonths(b.dob)||0));
    return[...fits,...(noFit.length?[{_divider:true,_key:"div"}]:[]),...noFit];
  })();

  const doMove=async(childId,toRoomId,isOverride=false)=>{
    if(moving===childId)return; setMoving(childId);
    try{
      await API(`/api/children/${childId}`,{method:"PUT",body:JSON.stringify({room_id:toRoomId||null})});
      if(isOverride){const child=children.find(c=>c.id===childId);const room=rooms.find(r=>r.id===toRoomId);
        await API(`/api/children/${childId}/events`,{method:"POST",body:JSON.stringify({event_type:"room_override",description:`Room override: ${child?.first_name} (${ageLabel(child?.dob)}) placed in ${room?.name} — approved by ${userRole}`})}).catch(()=>{});}
      setChildren(prev=>prev.map(c=>c.id===childId?{...c,room_id:toRoomId||null}:c));
    }catch(e){}
    setMoving(null);
  };

  const attemptMove=(childId,toRoomId)=>{
    const child=children.find(c=>c.id===childId);
    const toRoom=rooms.find(r=>r.id===toRoomId);
    const toGroup=toRoom?findGroup(ageGroups,toRoom.ageGroup||toRoom.age_group):null;
    if(!toRoomId){doMove(childId,null);return;}
    const roomKids=(childrenByRoom[toRoomId]||[]).filter(c=>c.id!==childId);
    if(roomKids.length>=(toRoom?.capacity||99)){alert(`${toRoom?.name} is at capacity (${toRoom?.capacity})`);return;}
    if(toGroup&&child?.dob&&!childFitsGroup(child,toGroup)){
      if(!canOverride){alert(`${child.first_name} doesn't fit the ${toGroup.label} age range.\n\nDirector or admin permissions required.`);return;}
      setWarning({child,toRoomId,toGroup});return;
    }
    doMove(childId,toRoomId);
  };

  const onDragStart=(childId,fromRoomId)=>setDragging({childId,fromRoomId});
  const onDragOver=(e,roomId)=>{e.preventDefault();setDragOver(roomId);};
  const onDrop=(e,toRoomId)=>{e.preventDefault();if(!dragging)return;if(dragging.fromRoomId!==toRoomId)attemptMove(dragging.childId,toRoomId);setDragging(null);setDragOver(null);};
  const onDragEnd=()=>{setDragging(null);setDragOver(null);};

  if(loading) return <div style={{padding:60,textAlign:"center",color:"#8A7F96"}}>Loading rooms...</div>;

  const modals = <>
    {(editRoom!==null||showAddRoom) && (
      <RoomEditModal
        room={editRoom}
        ageGroups={ageGroups}
        onSave={saveRoom}
        onClose={()=>{setEditRoom(null);setShowAddRoom(false);}}
      />
    )}
    {showAgeGroupSettings && (
      <AgeGroupSettingsModal
        onClose={()=>setShowAgeGroupSettings(false)}
        onChanged={()=>{ API("/api/age-groups").then(r=>{ if(Array.isArray(r)) setAgeGroups(r); }); }}
      />
    )}
    {warning && (
      <AgeWarningModal child={warning.child} toGroup={warning.toGroup}
        onConfirm={()=>{doMove(warning.child.id,warning.toRoomId,true);setWarning(null);}}
        onCancel={()=>setWarning(null)}/>
    )}
    {deleteConfirm && (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{background:"#fff",borderRadius:16,padding:28,maxWidth:400,width:"90%",boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}}>
          <div style={{fontSize:36,textAlign:"center",marginBottom:12}}>🗑️</div>
          <h3 style={{margin:"0 0 10px",color:"#B71C1C",textAlign:"center",fontSize:16}}>Delete Room?</h3>
          <p style={{margin:"0 0 16px",fontSize:13,color:"#3D3248",textAlign:"center"}}>Delete <strong>{deleteConfirm.name}</strong>? This cannot be undone.</p>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setDeleteConfirm(null)} style={{flex:1,padding:"10px 0",borderRadius:8,border:"1px solid #DDD",background:"#FDFBF9",color:"#555",cursor:"pointer",fontWeight:600,fontSize:13}}>Cancel</button>
            <button onClick={()=>deleteRoom(deleteConfirm)} style={{flex:1,padding:"10px 0",borderRadius:8,border:"none",background:"#B71C1C",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>Delete Room</button>
          </div>
        </div>
      </div>
    )}
  </>;

  if(viewDetail&&selectedRoom){
    return(
      <div style={{display:"flex",height:"calc(100vh - 100px)",overflow:"hidden"}}>
        {modals}
        <div style={{width:200,flexShrink:0,background:"#FDFBF9",borderRight:"1px solid #EDE8F4",overflowY:"auto"}}>
          <div style={{padding:"10px 10px 6px",fontSize:10,fontWeight:700,color:"#8A7F96",textTransform:"uppercase"}}>Rooms</div>
          {rooms.map(room=>{
            const group=findGroup(ageGroups,room.ageGroup||room.age_group)||{color:purple,label:"",ratio:10};
            const count=(childrenByRoom[room.id]||[]).length;const sel=room.id===selectedRoomId;
            return(<div key={room.id} onClick={()=>setSelectedRoomId(room.id)}
              style={{padding:"10px 12px",cursor:"pointer",borderBottom:"1px solid #F5F0FB",background:sel?lightPurple:"transparent",borderLeft:`3px solid ${sel?group.color:"transparent"}`}}>
              <div style={{fontWeight:sel?800:600,fontSize:13,color:"#3D3248"}}>{room.name}</div>
              <div style={{fontSize:10,color:"#8A7F96",marginTop:1}}><span style={{color:group.color,fontWeight:700}}>{group.label}</span> · {count}/{room.capacity}</div>
            </div>);
          })}
        </div>
        <RoomDetailPanel room={selectedRoom} group={selectedGroup} children={children} ageGroups={ageGroups}
          onBack={()=>setViewDetail(false)} onEdit={setEditRoom} onDelete={r=>setDeleteConfirm(r)} userRole={userRole}/>
      </div>
    );
  }

  return(
    <div style={{padding:"0 0 24px"}}>
      {modals}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,padding:"0 24px"}}>
        <div>
          <h2 style={{margin:0,color:"#3D3248"}}>Rooms</h2>
          <p style={{margin:"4px 0 0",color:"#8A7F96",fontSize:13}}>{rooms.length} rooms · {children.length} children · {unassigned.length} unassigned</p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {canManageSettings && (
            <button onClick={()=>setShowAgeGroupSettings(true)}
              style={{padding:"8px 14px",borderRadius:8,border:"1px solid #DDD6EE",background:"#FDFBF9",color:"#5C4E6A",cursor:"pointer",fontWeight:600,fontSize:13}}>
              ⚙️ Age Groups
            </button>
          )}
          {selectedRoomId&&<button onClick={()=>{setSelectedRoomId(null);setSearch("");}} style={{padding:"8px 16px",borderRadius:8,border:`1px solid ${purple}`,background:lightPurple,color:purple,cursor:"pointer",fontWeight:600,fontSize:13}}>← All rooms</button>}
          {selectedRoomId&&<button onClick={()=>setViewDetail(true)} style={{padding:"8px 16px",borderRadius:8,border:"none",background:selectedGroup?.color||purple,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>📋 Room Detail</button>}
          <button onClick={()=>setShowAddRoom(true)} style={{background:purple,color:"#fff",border:"none",borderRadius:8,padding:"10px 20px",cursor:"pointer",fontWeight:700,fontSize:13}}>+ Add Room</button>
        </div>
      </div>

      <div style={{display:"flex",gap:0,alignItems:"flex-start"}}>
        <div style={{flex:1,padding:"0 16px 0 24px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))",gap:14}}>
            {rooms.map(room=>{
              const group=findGroup(ageGroups,room.ageGroup||room.age_group)||{color:purple,label:room.ageGroup||room.age_group,sub:"",ratio:10};
              const roomKids=childrenByRoom[room.id]||[];const isOver=dragOver===room.id;const isSelected=selectedRoomId===room.id;
              return(
                <div key={room.id} onDragOver={e=>onDragOver(e,room.id)} onDrop={e=>onDrop(e,room.id)}
                  onClick={e=>{if(e.target.closest("button"))return;setSelectedRoomId(isSelected?null:room.id);setSearch("");}}
                  style={{background:isSelected?"#FAF7FF":isOver?"#F8F5FF":"#fff",borderRadius:14,overflow:"hidden",transition:"all 0.15s",cursor:"pointer",border:`2px solid ${isSelected?purple:isOver?purple+"80":"#EDE8F4"}`,boxShadow:isSelected?`0 0 0 3px ${purple}20`:"none"}}>
                  <div style={{height:4,background:isSelected?purple:group.color}}/>
                  <div style={{padding:"14px 16px 10px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div>
                        <div style={{fontWeight:800,color:"#3D3248",fontSize:15}}>{room.name}</div>
                        <div style={{fontSize:11,color:"#8A7F96",marginTop:2,display:"flex",alignItems:"center",gap:6}}>
                          <span style={{background:group.color+"25",color:group.color,borderRadius:20,padding:"2px 8px",fontWeight:700}}>{group.label}</span>
                          <span>{group.sub} · 1:{group.ratio}</span>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:4,flexShrink:0}}>
                        <button onClick={e=>{e.stopPropagation();setSelectedRoomId(room.id);setViewDetail(true);}} title="Room detail" style={{padding:"4px 8px",borderRadius:6,border:"1px solid #EDE8F4",background:group.color+"15",color:group.color,cursor:"pointer",fontSize:11}}>📋</button>
                        <button onClick={e=>{e.stopPropagation();setEditRoom(room);}} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #EDE8F4",background:"#FDFBF9",color:"#555",cursor:"pointer",fontSize:11}}>Edit</button>
                        <button onClick={e=>{e.stopPropagation();setDeleteConfirm(room);}} style={{padding:"4px 8px",borderRadius:6,border:"1px solid #FFCDD2",background:"#FFF5F5",color:"#C06B73",cursor:"pointer",fontSize:11}}>🗑</button>
                      </div>
                    </div>
                    <RatioBar count={roomKids.length} capacity={room.capacity} group={group}/>
                  </div>
                  <div style={{padding:"0 12px 14px",minHeight:56}}>
                    {roomKids.length===0?(
                      <div style={{textAlign:"center",padding:"14px 0",color:"#B0AAB9",fontSize:12,borderRadius:8,border:"2px dashed #EDE8F4"}}>{isOver?"Drop here":"Empty — drop children here"}</div>
                    ):(
                      <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                        {roomKids.map(child=>(<ChildChip key={child.id} child={child} group={group} isDragging={dragging?.childId===child.id} isMoving={moving===child.id} fitsGroup={childFitsGroup(child,group)} onDragStart={()=>onDragStart(child.id,room.id)} onDragEnd={onDragEnd}/>))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{width:256,flexShrink:0,paddingRight:24}}>
          <div style={{background:"#fff",borderRadius:14,overflow:"hidden",border:`2px solid ${dragOver==="__unassign__"?purple:"#EDE8F4"}`,transition:"border-color 0.15s"}}>
            <div style={{padding:"14px 16px 10px",borderBottom:"1px solid #EDE8F4",background:selectedGroup?selectedGroup.color+"12":lightPurple}}>
              {selectedRoom?(<>
                <div style={{fontWeight:800,fontSize:14,color:selectedGroup?.color||purple}}>Assign to {selectedRoom.name}</div>
                <div style={{fontSize:11,color:"#8A7F96",marginTop:1}}>{selectedGroup?.label} · {selectedGroup?.sub}</div>
                <div style={{fontSize:11,color:"#8A7F96",marginTop:4}}>✓ Age-appropriate shown first</div>
              </>):(<>
                <div style={{fontWeight:800,fontSize:14,color:"#3D3248"}}>Unassigned ({unassigned.length})</div>
                <div style={{fontSize:11,color:"#8A7F96",marginTop:1}}>Click a room to sort by age group</div>
              </>)}
              <input value={search} onChange={e=>setSearch(e.target.value)} onClick={e=>e.stopPropagation()} placeholder="Search children..."
                style={{marginTop:8,width:"100%",padding:"6px 10px",borderRadius:7,border:"1px solid #DDD6EE",fontSize:12,boxSizing:"border-box"}}/>
            </div>
            {selectedRoom&&(
              <div onDragOver={e=>{e.preventDefault();setDragOver("__unassign__");}} onDrop={e=>{e.preventDefault();if(dragging)doMove(dragging.childId,null);setDragging(null);setDragOver(null);}}
                style={{padding:"8px 14px",borderBottom:"1px solid #EDE8F4",textAlign:"center",fontSize:11,color:dragOver==="__unassign__"?"#E65100":"#B0AAB9",background:dragOver==="__unassign__"?"#FFF3E0":"#FDFBF9",transition:"all 0.1s"}}>
                ↩ Drop here to unassign from {selectedRoom.name}
              </div>
            )}
            <div style={{padding:10,maxHeight:500,overflowY:"auto"}}>
              {rightPanelChildren.length===0?(
                <div style={{textAlign:"center",padding:"24px 0",color:"#B0AAB9",fontSize:12}}>{selectedRoom?`All available in ${selectedRoom.name}`:unassigned.length===0?"All children assigned 🎉":"No results"}</div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {rightPanelChildren.map(child=>{
                    if(child._divider)return(<div key="divider" style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}><div style={{flex:1,height:1,background:"#FFCDD2"}}/><span style={{fontSize:10,color:"#C06B73",fontWeight:700,whiteSpace:"nowrap"}}>⚠ Outside age range</span><div style={{flex:1,height:1,background:"#FFCDD2"}}/></div>);
                    const fits=selectedGroup?childFitsGroup(child,selectedGroup):true;
                    return(<PanelChildRow key={child.id} child={child} fits={fits} selectedGroup={selectedGroup} isDragging={dragging?.childId===child.id} isMoving={moving===child.id} canOverride={canOverride} onDragStart={()=>onDragStart(child.id,child.room_id||null)} onDragEnd={onDragEnd} onAssign={selectedRoom?()=>attemptMove(child.id,selectedRoom.id):null}/>);
                  })}
                </div>
              )}
            </div>
          </div>
          <div style={{marginTop:12,padding:"12px 14px",background:lightPurple,borderRadius:10,fontSize:11,color:"#5C4E6A",lineHeight:1.6}}>
            <strong style={{color:purple}}>Drag & drop</strong> or click <strong style={{color:purple}}>+</strong> to assign. Click <strong style={{color:purple}}>📋</strong> for room detail.
            {!canOverride&&<div style={{marginTop:4,color:"#C06B73"}}>⚠ Age overrides require director/admin.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
