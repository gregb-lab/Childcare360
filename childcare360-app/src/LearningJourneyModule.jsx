import { useState, useEffect, useCallback, useRef } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}) },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};

const purple = "#8B6DAF", lp = "#F0EBF8", lp2 = "#F8F5FC";
const inp = { padding: "8px 11px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 13, width: "100%", boxSizing: "border-box", background: "#fff" };
const lbl = { fontSize: 10, color: "#7A6E8A", fontWeight: 700, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" };
const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: 18, marginBottom: 14, boxShadow: "0 2px 8px rgba(139,109,175,0.05)" };
const btnP = (bg = purple) => ({ background: bg, color: "#fff", border: "none", borderRadius: 9, padding: "9px 20px", cursor: "pointer", fontWeight: 700, fontSize: 13 });
const btnS = { background: lp, color: purple, border: `1px solid ${purple}30`, borderRadius: 9, padding: "8px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const btnGhost = { background: "none", border: "none", cursor: "pointer", color: purple, fontSize: 12, fontWeight: 600, padding: "4px 0" };

const EYLF = [
  { id: 1, label: "Strong Sense of Identity",     short: "Identity",     icon: "🧑", color: "#C9929E" },
  { id: 2, label: "Connected with Community",     short: "Community",    icon: "🤝", color: "#9B7DC0" },
  { id: 3, label: "Strong Sense of Wellbeing",    short: "Wellbeing",    icon: "💚", color: "#6BA38B" },
  { id: 4, label: "Confident & Involved Learner", short: "Learning",     icon: "🌟", color: "#D4A26A" },
  { id: 5, label: "Effective Communicator",       short: "Communication",icon: "💬", color: "#5B8DB5" },
];
const EYLF_SUB = {
  1: ["Sense of Belonging","Self-confidence","Connected to Culture","Understanding of Rights"],
  2: ["Family & Community Connections","Responds to Diversity","Contributes to Fairness","Works Collaboratively"],
  3: ["Awareness of Own Capabilities","Takes Increasing Responsibility","Effective Communication","Self-regulation"],
  4: ["Dispositions for Learning","Curiosity & Creativity","Transfer of Learning","Range of Texts & Media"],
  5: ["Language & Communication","Literacy Practices","Numeracy","Digital Technologies"],
};
const STORY_TYPES = [["individual","👤 Individual"],["group","👥 Group"],["event","🎉 Event"],["excursion","🚌 Excursion"]];
const TAGS = ["Art","Music","Outdoor","Science","Drama","Maths","Literacy","Cooking","Cultural","Religious","Social","Physical","Creative","Sensory","Construction"];
const LEVEL_LABELS = ["","Emerging","Developing","Consolidating","Extending"];

const fmtDate = (s) => s ? new Date(s).toLocaleDateString("en-AU", { day:"numeric", month:"short", year:"numeric" }) : "—";
const childColor = (c) => ["#C9929E","#9B7DC0","#6BA38B","#D4A26A","#5B8DB5","#A08060","#7B9EC0","#B07080"][(c?.first_name?.charCodeAt(0) || 0) % 8];
const initials = (c) => (c?.first_name?.[0] || "") + (c?.last_name?.[0] || "");
const weekOf = (d = new Date()) => { const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1); return new Date(new Date(d).setDate(diff)).toISOString().slice(0,10); };

function Avatar({ child, size = 28, showName = false }) {
  const clr = childColor(child);
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
      <span style={{ width:size, height:size, borderRadius:"50%", background:clr+"22", border:`2px solid ${clr}44`, display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:size*0.36, fontWeight:800, color:clr, flexShrink:0 }}>
        {initials(child)}
      </span>
      {showName && <span style={{ fontSize:size*0.46, color:"#3D3248", fontWeight:600 }}>{child?.first_name}</span>}
    </span>
  );
}

function EylfBadge({ id, small = false }) {
  const o = EYLF.find(e => e.id === id);
  if (!o) return null;
  return <span style={{ display:"inline-flex", alignItems:"center", gap:3, padding:small?"2px 7px":"3px 10px", borderRadius:12, background:o.color+"1E", color:o.color, fontSize:small?9:11, fontWeight:700 }}>{o.icon} {small?id:`Outcome ${id}`}</span>;
}

// ─── ROOT MODULE ──────────────────────────────────────────────────────────────
export default function LearningJourneyModule() {
  const [view, setView]               = useState("feed");
  const [children, setChildren]       = useState([]);
  const [families, setFamilies]       = useState([]);
  const [rooms, setRooms]             = useState([]);
  const [stories, setStories]         = useState([]);
  const [albums, setAlbums]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [period, setPeriod]           = useState("month");
  const [filterChild, setFilterChild] = useState("");
  const [filterFamily, setFilterFamily] = useState("");
  const [filterEYLF, setFilterEYLF]   = useState("");
  const [filterRoom, setFilterRoom]   = useState("");
  const [openStory, setOpenStory]     = useState(null);
  const [openAlbum, setOpenAlbum]     = useState(null);
  const [editStory, setEditStory]     = useState(null);
  const [searchQ, setSearchQ]         = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ period });
      if (filterChild)  p.set("child_id", filterChild);
      if (filterFamily) p.set("family_id", filterFamily);
      if (filterEYLF)   p.set("eylf", filterEYLF);
      if (filterRoom)   p.set("room_id", filterRoom);
      if (searchQ)      p.set("q", searchQ);
      const [ch, rm, st, al, fam] = await Promise.all([
        API("/api/children"), API("/api/rooms"),
        API(`/api/learning/stories?${p}`),
        API("/api/learning/albums"),
        API("/api/learning/families"),
      ]);
      if (Array.isArray(ch))  setChildren(ch);
      if (Array.isArray(rm))  setRooms(rm);
      if (Array.isArray(st))  setStories(st);
      if (Array.isArray(al))  setAlbums(al);
      if (Array.isArray(fam)) setFamilies(fam);
    } catch {}
    setLoading(false);
  }, [period, filterChild, filterFamily, filterEYLF, filterRoom, searchQ]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { API("/api/learning/families/sync", { method:"POST" }).catch(() => {}); }, []);

  const multiFamilies = families.filter(f => f.child_count > 1);

  const filterBar = (
    <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", padding:"10px 24px", background:lp2, borderBottom:"1px solid #EDE8F4" }}>
      <select value={period} onChange={e => setPeriod(e.target.value)} style={{ ...inp, width:"auto", fontSize:12, padding:"5px 10px" }}>
        {[["today","Today"],["yesterday","Yesterday"],["week","This Week"],["month","This Month"],["year","This Year"],["all","All Time"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {multiFamilies.length > 0 && (
        <select value={filterFamily} onChange={e => { setFilterFamily(e.target.value); if (e.target.value) setFilterChild(""); }} style={{ ...inp, width:"auto", fontSize:12, padding:"5px 10px" }}>
          <option value="">All Families</option>
          {multiFamilies.map(f => <option key={f.id} value={f.id}>{f.family_name} ({f.child_count} siblings)</option>)}
        </select>
      )}
      <select value={filterChild} onChange={e => { setFilterChild(e.target.value); if (e.target.value) setFilterFamily(""); }} style={{ ...inp, width:"auto", fontSize:12, padding:"5px 10px" }}>
        <option value="">All Children</option>
        {children.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
      </select>
      <select value={filterEYLF} onChange={e => setFilterEYLF(e.target.value)} style={{ ...inp, width:"auto", fontSize:12, padding:"5px 10px" }}>
        <option value="">All EYLF Outcomes</option>
        {EYLF.map(o => <option key={o.id} value={o.id}>{o.icon} Outcome {o.id}: {o.short}</option>)}
      </select>
      <select value={filterRoom} onChange={e => setFilterRoom(e.target.value)} style={{ ...inp, width:"auto", fontSize:12, padding:"5px 10px" }}>
        <option value="">All Rooms</option>
        {rooms.map(rm => <option key={rm.id} value={rm.id}>{rm.name}</option>)}
      </select>
      <div style={{ position:"relative", flex:"1 1 180px", minWidth:140 }}>
        <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", fontSize:13, color:"#B0A8BF", pointerEvents:"none" }}>🔍</span>
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search stories…" style={{ ...inp, paddingLeft:30, fontSize:12 }} />
      </div>
      <div style={{ fontSize:12, color:"#9A8FB0", whiteSpace:"nowrap" }}>{loading ? "Loading…" : `${stories.length} stories`}</div>
    </div>
  );

  const backBtn = (label, to) => (
    <button onClick={() => setView(to)} style={{ ...btnGhost, display:"flex", alignItems:"center", gap:5, marginBottom:14, fontSize:13 }}>← {label}</button>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      {/* Header */}
      <div style={{ padding:"16px 24px 10px", background:"#fff", borderBottom:"1px solid #EDE8F4" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div>
            <h2 style={{ margin:0, color:"#3D3248", fontSize:20 }}>📚 Learning Journey</h2>
            <p style={{ margin:"2px 0 0", fontSize:12, color:"#8A7F96" }}>EYLF-aligned stories, photos, and development tracking</p>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {view !== "new" && <button onClick={() => setView("new")} style={btnP()}>+ New Story</button>}
            {(view === "story" || view === "album") && <button onClick={() => setView(view === "story" ? "feed" : "albums")} style={btnS}>← Back</button>}
          </div>
        </div>
        <div style={{ display:"flex", gap:5 }}>
          {[["feed","📰 Feed"],["albums","🖼 Albums"],["outcomes","📊 EYLF Progress"],["weekly","📋 Weekly Reports"],["families","👨‍👩‍👧 Families"]].map(([v,l]) => (
            <button key={v} onClick={() => setView(v)} style={{ padding:"6px 14px", borderRadius:8, border:"none", cursor:"pointer", fontSize:12, fontWeight:view===v?700:500, background:view===v?lp:"transparent", color:view===v?purple:"#6B5F7A" }}>{l}</button>
          ))}
        </div>
      </div>

      {(view === "feed" || view === "outcomes") && filterBar}

      <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>
        {view === "new"     && <NewStoryWizard children={children} rooms={rooms} families={families} multiFamilies={multiFamilies} onSaved={() => { load(); setView("feed"); }} onCancel={() => setView("feed")} />}
        {view === "edit"    && editStory && <NewStoryWizard key={editStory.id} editMode story={editStory} children={children} rooms={rooms} families={families} multiFamilies={multiFamilies} onSaved={() => { load(); setView("feed"); }} onCancel={() => setView("feed")} />}
        {view === "feed"    && <FeedView stories={stories} children={children} loading={loading} onOpen={s => { setOpenStory(s); setView("story"); }} onEdit={s => { setEditStory(s); setView("edit"); }} />}
        {view === "story"   && openStory && <StoryDetailView story={openStory} children={children} onClose={() => setView("feed")} onEdit={() => { setEditStory(openStory); setView("edit"); }} onRefresh={async () => { load(); try { const s = await API(`/api/learning/stories/${openStory.id}`); setOpenStory(s); } catch {} }} />}
        {view === "albums"  && <AlbumsView albums={albums} children={children} stories={stories} onOpen={a => { setOpenAlbum(a); setView("album"); }} onRefresh={load} />}
        {view === "album"   && openAlbum && <AlbumDetailView album={openAlbum} stories={stories} children={children} />}
        {view === "outcomes"&& <OutcomesView children={children} filterChild={filterChild} filterFamily={filterFamily} families={families} multiFamilies={multiFamilies} />}
        {view === "weekly"  && <WeeklyReportsView children={children} families={families} multiFamilies={multiFamilies} />}
        {view === "families"&& <FamiliesView families={families} children={children} stories={stories} onFamilyFilter={fid => { setFilterFamily(fid); setFilterChild(""); setView("feed"); }} onRefresh={load} />}
      </div>
    </div>
  );
}

// ─── NEW STORY WIZARD ─────────────────────────────────────────────────────────
// Multi-activity with live preview pane + photo/video upload
function NewStoryWizard({ children, rooms, families, multiFamilies, onSaved, onCancel, editMode = false, story: editStoryData = null }) {
  const [saving, setSaving]   = useState(false);
  const [quickFamily, setQuickFamily] = useState("");
  const fileRef = useRef(null);

  const mkActivity = () => ({
    id: Date.now() + Math.random(),
    title: "", notes: "", aiDraft: "", aiResult: "", aiExpl: "", aiLoading: false,
    eylf_outcomes: [], eylf_sub_outcomes: {}, tags: [],
  });

  const initState = () => {
    if (editMode && editStoryData) return {
      title: editStoryData.title||"", date: editStoryData.date||new Date().toISOString().slice(0,10),
      type: editStoryData.type||"group", event_name: editStoryData.event_name||"",
      group_name: editStoryData.group_name||"", room_id: editStoryData.room_id||"",
      child_ids: editStoryData.child_ids||[], visible_to_parents: editStoryData.visible_to_parents??true,
      photos: editStoryData.photo_rows||[],
      activities: [{
        ...mkActivity(), id:1, notes: editStoryData.content||"",
        eylf_outcomes: editStoryData.eylf_outcomes||[],
        eylf_sub_outcomes: editStoryData.eylf_sub_outcomes||{},
        tags: editStoryData.tags||[],
      }],
    };
    return {
      title:"", date:new Date().toISOString().slice(0,10), type:"group",
      event_name:"", group_name:"", room_id:"", child_ids:[],
      visible_to_parents:true, photos:[], activities:[mkActivity()],
    };
  };

  const [f, setF] = useState(initState);

  const u = (k, v) => setF(p => ({...p, [k]:v}));
  const uAct = (idx, patch) => setF(p => {
    const acts = [...p.activities];
    acts[idx] = {...acts[idx], ...patch};
    return {...p, activities: acts};
  });
  const addActivity  = () => setF(p => ({...p, activities:[...p.activities, mkActivity()]}));
  const removeActivity = idx => setF(p => ({...p, activities:p.activities.filter((_,i)=>i!==idx)}));
  const moveActivity = (idx, dir) => setF(p => {
    const acts = [...p.activities];
    const ni = idx + dir;
    if (ni<0||ni>=acts.length) return p;
    [acts[idx],acts[ni]] = [acts[ni],acts[idx]];
    return {...p, activities:acts};
  });

  const roomChildren = f.room_id ? children.filter(c=>c.room_id===f.room_id) : children;
  const toggleChild = id => u('child_ids', f.child_ids.includes(id) ? f.child_ids.filter(x=>x!==id) : [...f.child_ids,id]);
  const handleFamilySelect = famId => {
    setQuickFamily(famId);
    if (!famId) return;
    const fam = families.find(ff=>ff.id===famId);
    u('child_ids', (fam?.children||[]).map(c=>c.id));
  };

  const enhanceAI = async (idx) => {
    const act = f.activities[idx];
    uAct(idx, {aiLoading:true});
    try {
      const r = await API("/api/learning/ai/enhance", {method:"POST", body:{
        draft: act.aiDraft||act.notes,
        context:{
          child_names: f.child_ids.map(id=>children.find(c=>c.id===id)?.first_name).filter(Boolean).join(", "),
          event: act.title||f.event_name,
          eylf_outcomes: act.eylf_outcomes,
          room_name: rooms.find(rm=>rm.id===f.room_id)?.name,
        },
      }});
      if (r.enhanced) uAct(idx, {aiResult:r.enhanced, aiExpl:r.explanation||""});
    } catch{}
    uAct(idx, {aiLoading:false});
  };

  const handleFiles = files => {
    if (!files?.length) return;
    const previews = Array.from(files).map(file => ({
      id: "prev-"+Date.now()+Math.random(),
      url: URL.createObjectURL(file),
      file, name: file.name,
      isVideo: file.type.startsWith("video/"),
    }));
    setF(p => ({...p, photos:[...p.photos, ...previews]}));
  };

  const removePhoto = id => setF(p => ({...p, photos:p.photos.filter(ph=>ph.id!==id)}));

  // Build merged payload for saving
  const buildPayload = () => {
    const allContent = f.activities.map(a => {
      let block = "";
      if (a.title) block += `**${a.title}**\n`;
      if (a.notes) block += a.notes;
      return block.trim();
    }).filter(Boolean).join("\n\n---\n\n");
    const allEylf = [...new Set(f.activities.flatMap(a=>a.eylf_outcomes))];
    const allSubs = {};
    f.activities.forEach(a => Object.entries(a.eylf_sub_outcomes||{}).forEach(([k,vs]) => {
      allSubs[k] = [...new Set([...(allSubs[k]||[]), ...vs])];
    }));
    const allTags = [...new Set(f.activities.flatMap(a=>a.tags))];
    return {...f, content:allContent, eylf_outcomes:allEylf, eylf_sub_outcomes:allSubs, tags:allTags};
  };

  const save = async (publish=false) => {
    if (!f.title||!f.date) return;
    setSaving(true);
    try {
      const payload = buildPayload();
      let id;
      if (editMode && editStoryData) {
        await API(`/api/learning/stories/${editStoryData.id}`, {method:"PUT", body:payload});
        id = editStoryData.id;
      } else {
        const r = await API("/api/learning/stories", {method:"POST", body:payload});
        id = r.id;
      }
      if (id) {
        // Upload pending files
        const pending = f.photos.filter(ph=>ph.file);
        if (pending.length) {
          const fd = new FormData();
          pending.forEach(ph=>fd.append("photos",ph.file));
          const t=localStorage.getItem("c360_token"), tid=localStorage.getItem("c360_tenant");
          await fetch(`/api/learning/stories/${id}/upload`, {
            method:"POST", body:fd,
            headers:{...(t?{Authorization:`Bearer ${t}`}:{}), ...(tid?{"x-tenant-id":tid}:{})},
          }).catch(()=>{});
        }
        if (publish) await API(`/api/learning/stories/${id}/publish`, {method:"POST"});
        onSaved();
      }
    } catch{}
    setSaving(false);
  };

  // ── Preview pane (live, right side) ────────────────────────────────────────
  const previewChildren = f.child_ids.map(id=>children.find(c=>c.id===id)).filter(Boolean);
  const allPreviewEylf  = [...new Set(f.activities.flatMap(a=>a.eylf_outcomes))];
  const allPreviewTags  = [...new Set(f.activities.flatMap(a=>a.tags))];
  const roomName = rooms.find(r=>r.id===f.room_id)?.name;

  const PreviewPane = () => (
    <div style={{position:"sticky",top:0,maxHeight:"92vh",overflowY:"auto",paddingBottom:20}}>
      <div style={{fontSize:10,fontWeight:800,color:"#8A7F96",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>📖 Live Preview</div>
      <div style={{background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",overflow:"hidden",boxShadow:"0 4px 20px rgba(139,109,175,0.1)"}}>
        {/* Cover media */}
        {f.photos.length>0 ? (
          <div>
            {f.photos[0].isVideo
              ? <div style={{height:140,background:"#111",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <video src={f.photos[0].url} style={{maxHeight:140,maxWidth:"100%"}} muted/>
                </div>
              : <div style={{height:140,background:`url(${f.photos[0].url}) center/cover`}}/>
            }
            {f.photos.length>1&&(
              <div style={{display:"flex",gap:2,padding:"3px 4px",background:"#F8F5FC"}}>
                {f.photos.slice(1,5).map((ph,i)=>(
                  <div key={ph.id} style={{flex:1,height:36,background:ph.isVideo?"#111":`url(${ph.url}) center/cover`,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>
                    {ph.isVideo?"🎬":""}
                  </div>
                ))}
                {f.photos.length>5&&<div style={{flex:1,height:36,background:"#EDE8F4",borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#8A7F96",fontWeight:700}}>+{f.photos.length-5}</div>}
              </div>
            )}
          </div>
        ) : (
          <div style={{height:70,background:`linear-gradient(135deg,${purple}18,${purple}06)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>
            {f.type==="excursion"?"🚌":f.type==="event"?"🎉":f.type==="individual"?"👤":"👥"}
          </div>
        )}

        <div style={{padding:"12px 14px"}}>
          {f.event_name&&<div style={{fontSize:9,color:purple,fontWeight:800,marginBottom:3,textTransform:"uppercase"}}>📍 {f.event_name}</div>}
          <div style={{fontSize:13,fontWeight:800,color:"#3D3248",marginBottom:2,lineHeight:1.3}}>
            {f.title||<span style={{color:"#C0B8D4",fontStyle:"italic",fontWeight:400}}>Story title appears here…</span>}
          </div>
          <div style={{fontSize:10,color:"#9A8FB0",marginBottom:8}}>
            {fmtDate(f.date)}{roomName?" · "+roomName:""}{f.group_name?" · "+f.group_name:""}
          </div>

          {previewChildren.length>0&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
              {previewChildren.map(c=><Avatar key={c.id} child={c} size={20} showName/>)}
            </div>
          )}

          {/* Activity blocks in preview */}
          {f.activities.filter(a=>a.title||a.notes).map((act,i)=>{
            const aEylf = act.eylf_outcomes.map(id=>EYLF.find(e=>e.id===id)).filter(Boolean);
            const aTags = act.tags;
            return (
              <div key={act.id} style={{marginBottom:10,paddingBottom:10,borderBottom:"1px dashed #F0EBF8"}}>
                {act.title&&(
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}>
                    <div style={{width:16,height:16,borderRadius:"50%",background:purple,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,flexShrink:0}}>{i+1}</div>
                    <div style={{fontSize:11,fontWeight:800,color:"#3D3248"}}>{act.title}</div>
                  </div>
                )}
                {act.notes&&<div style={{fontSize:10,color:"#5A4E6A",lineHeight:1.7,marginBottom:5,whiteSpace:"pre-wrap"}}>{act.notes.length>160?act.notes.slice(0,160)+"…":act.notes}</div>}
                {aEylf.length>0&&<div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:3}}>{aEylf.map(o=><span key={o.id} style={{fontSize:8,padding:"1px 6px",borderRadius:8,background:o.color+"18",color:o.color,fontWeight:700}}>{o.icon} {o.short}</span>)}</div>}
                {aTags.length>0&&<div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{aTags.map(t=><span key={t} style={{fontSize:8,padding:"1px 6px",borderRadius:8,background:"#F0F0F0",color:"#888"}}>{t}</span>)}</div>}
              </div>
            );
          })}
          {!f.activities.some(a=>a.title||a.notes)&&(
            <div style={{fontSize:10,color:"#C0B8D4",fontStyle:"italic",textAlign:"center",padding:"10px 0"}}>Write activities to see your story…</div>
          )}

          {allPreviewEylf.length>0&&(
            <div style={{marginTop:6}}>
              <div style={{fontSize:8,color:"#9A8FB0",fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>All EYLF Outcomes</div>
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{allPreviewEylf.map(id=><EylfBadge key={id} id={id} small/>)}</div>
            </div>
          )}
          {allPreviewTags.length>0&&(
            <div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:6}}>
              {allPreviewTags.map(t=><span key={t} style={{fontSize:8,padding:"2px 7px",borderRadius:10,background:"#F5F5F5",color:"#888"}}>{t}</span>)}
            </div>
          )}

          {/* Draft badge */}
          <div style={{marginTop:10,display:"flex",justifyContent:"flex-end"}}>
            <span style={{fontSize:9,background:"#FFF3E0",color:"#E65100",padding:"2px 8px",borderRadius:8,fontWeight:700}}>DRAFT</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{maxWidth:1140,margin:"0 auto"}}>
      {/* Header bar */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,padding:"12px 18px",background:"#fff",borderRadius:12,border:"1px solid #EDE8F4"}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          {editMode&&<span style={{fontSize:12,fontWeight:800,color:purple}}>✏️ Edit Story</span>}
          <div style={{fontSize:13,fontWeight:800,color:"#3D3248"}}>{editMode?"Edit Learning Story":"New Learning Story"}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onCancel} style={btnS}>✕ Cancel</button>
          <button onClick={()=>save(false)} disabled={saving||!f.title} style={{...btnS,opacity:!f.title?0.5:1}}>{saving?"Saving…":editMode?"Save Changes":"Save Draft"}</button>
          <button onClick={()=>save(true)} disabled={saving||!f.title} style={{...btnP(),opacity:!f.title?0.5:1}}>✓ {editMode?"Save & Publish":"Publish Story"}</button>
        </div>
      </div>

      {/* Two-column layout: form left, preview right */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:16,alignItems:"start"}}>
        {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
        <div>
          {/* ── Section 1: Story Details ── */}
          <div style={card}>
            <h4 style={{margin:"0 0 14px",fontSize:13,fontWeight:800,color:"#3D3248"}}>📌 Story Details</h4>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14}}>
              <div><label style={lbl}>Date</label><input type="date" style={inp} value={f.date} onChange={e=>u("date",e.target.value)}/></div>
              <div>
                <label style={lbl}>Story Type</label>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {STORY_TYPES.map(([v,l])=>(
                    <button key={v} onClick={()=>u("type",v)} style={{padding:"4px 9px",borderRadius:6,border:`2px solid ${f.type===v?purple:"#DDD6EE"}`,background:f.type===v?lp:"#fff",color:f.type===v?purple:"#6B5F7A",cursor:"pointer",fontSize:10,fontWeight:f.type===v?700:500}}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>Room</label>
                <select style={inp} value={f.room_id} onChange={e=>u("room_id",e.target.value)}>
                  <option value="">All Rooms</option>
                  {rooms.map(rm=><option key={rm.id} value={rm.id}>{rm.name}</option>)}
                </select>
              </div>
              <div style={{gridColumn:"span 2"}}><label style={lbl}>Story Title</label><input style={{...inp,fontWeight:700,fontSize:14}} value={f.title} onChange={e=>u("title",e.target.value)} placeholder="Give this story a meaningful title…"/></div>
              <div><label style={lbl}>Overall Theme / Event</label><input style={inp} value={f.event_name} onChange={e=>u("event_name",e.target.value)} placeholder="e.g. A Day of Discovery"/></div>
              {(f.type==="group"||f.type==="event")&&<div><label style={lbl}>Group Name</label><input style={inp} value={f.group_name||""} onChange={e=>u("group_name",e.target.value)} placeholder="e.g. Morning Group"/></div>}
              <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:20}}>
                <input type="checkbox" id="vtp" checked={f.visible_to_parents} onChange={e=>u("visible_to_parents",e.target.checked)}/>
                <label htmlFor="vtp" style={{fontSize:12,color:"#5C4E6A",fontWeight:600,cursor:"pointer"}}>Visible to parents</label>
              </div>
            </div>

            {/* Children */}
            <div style={{borderTop:"1px solid #F0EBF8",paddingTop:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <label style={lbl}>Children in This Story</label>
                <div style={{display:"flex",gap:6}}>
                  {multiFamilies.length>0&&(
                    <select value={quickFamily} onChange={e=>handleFamilySelect(e.target.value)} style={{...inp,width:"auto",fontSize:10,padding:"3px 8px"}}>
                      <option value="">Quick-select family…</option>
                      {multiFamilies.map(fam=><option key={fam.id} value={fam.id}>{fam.family_name}</option>)}
                    </select>
                  )}
                  <button onClick={()=>u("child_ids",roomChildren.map(c=>c.id))} style={{...btnS,padding:"3px 10px",fontSize:10}}>All</button>
                  <button onClick={()=>u("child_ids",[])} style={{background:"none",border:"none",cursor:"pointer",color:"#9A8FB0",fontSize:10}}>Clear</button>
                </div>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {roomChildren.map(c=>{
                  const sel=f.child_ids.includes(c.id), clr=childColor(c);
                  return <button key={c.id} onClick={()=>toggleChild(c.id)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 11px",borderRadius:20,border:`2px solid ${sel?clr:"#EDE8F4"}`,background:sel?clr+"14":"#fff",cursor:"pointer"}}>
                    <Avatar child={c} size={20}/>
                    <span style={{fontSize:11,fontWeight:sel?700:500,color:sel?"#3D3248":"#6B5F7A"}}>{c.first_name} {c.last_name}</span>
                    {sel&&<span style={{color:clr,fontSize:10,fontWeight:700}}>✓</span>}
                  </button>;
                })}
              </div>
              {f.child_ids.length>0&&<div style={{marginTop:6,fontSize:11,color:purple,fontWeight:700}}>{f.child_ids.length} child{f.child_ids.length>1?"ren":""} selected</div>}
            </div>
          </div>

          {/* ── Section 2: Photos & Videos ── */}
          <div style={{...card,background:lp2,border:`1px solid ${purple}18`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <h4 style={{margin:0,fontSize:13,fontWeight:800,color:"#3D3248"}}>📷 Photos & Videos</h4>
              <span style={{fontSize:10,color:"#9A8FB0"}}>First photo becomes the cover</span>
            </div>
            <div
              onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor=purple;e.currentTarget.style.background="#EDE8F8";}}
              onDragLeave={e=>{e.currentTarget.style.borderColor="#D8D0E6";e.currentTarget.style.background="#fff";}}
              onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor="#D8D0E6";e.currentTarget.style.background="#fff";handleFiles(e.dataTransfer.files);}}
              onClick={()=>fileRef.current?.click()}
              style={{border:"2px dashed #D8D0E6",borderRadius:10,padding:"14px",textAlign:"center",cursor:"pointer",background:"#fff",transition:"all 0.2s"}}>
              <input ref={fileRef} type="file" accept="image/*,video/*" multiple style={{display:"none"}} onChange={e=>handleFiles(e.target.files)}/>
              <div style={{fontSize:24,marginBottom:4}}>📎</div>
              <div style={{fontSize:12,color:"#9A8FB0"}}>Drag & drop photos or videos, or <span style={{color:purple,fontWeight:700}}>click to browse</span></div>
              <div style={{fontSize:10,color:"#B0A8BF",marginTop:2}}>JPEG · PNG · GIF · WebP · MP4 · MOV · up to 10MB each</div>
            </div>
            {f.photos.length>0&&(
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10}}>
                {f.photos.map((ph,pi)=>(
                  <div key={ph.id} style={{position:"relative",width:64,height:64}}>
                    {ph.isVideo||ph.url?.includes(".mp4")||ph.url?.includes(".mov")
                      ? <div style={{width:64,height:64,borderRadius:8,background:"#1a1a2e",border:`2px solid ${pi===0?purple:"#EDE8F4"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🎬</div>
                      : <div style={{width:64,height:64,borderRadius:8,background:`url(${ph.url}) center/cover`,border:`2px solid ${pi===0?purple:"#EDE8F4"}`}}/>
                    }
                    <button onClick={()=>removePhoto(ph.id)} style={{position:"absolute",top:-5,right:-5,width:17,height:17,borderRadius:"50%",background:"#E53935",border:"2px solid #fff",color:"#fff",fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,fontWeight:800,lineHeight:1}}>×</button>
                    {pi===0&&<div style={{position:"absolute",bottom:2,left:2,fontSize:7,background:"rgba(139,109,175,0.9)",color:"#fff",borderRadius:3,padding:"1px 3px",fontWeight:700}}>COVER</div>}
                  </div>
                ))}
                <div onClick={()=>fileRef.current?.click()} style={{width:64,height:64,borderRadius:8,border:"2px dashed #D8D0E6",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:22,color:"#C0B8D4"}}>+</div>
              </div>
            )}
          </div>

          {/* ── Section 3: Learning Activities ── */}
          <div style={{marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:14,fontWeight:800,color:"#3D3248"}}>🎯 Learning Activities</div>
              <div style={{fontSize:11,color:"#8A7F96",marginTop:2}}>Each activity can have its own focus, narrative, EYLF outcomes and learning tags — all published together as one story</div>
            </div>
            <button onClick={addActivity} style={{...btnP(),fontSize:12,padding:"7px 16px",whiteSpace:"nowrap"}}>+ Add Activity</button>
          </div>

          {f.activities.map((act,idx)=>(
            <div key={act.id} style={{...card,border:`2px solid ${purple}20`,position:"relative",marginBottom:12}}>
              {/* Activity header */}
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:purple,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,flexShrink:0}}>{idx+1}</div>
                <input
                  style={{...inp,fontSize:13,fontWeight:700,flex:1,borderColor:"transparent",background:"#F8F5FC",borderRadius:8}}
                  value={act.title}
                  onChange={e=>uAct(idx,{title:e.target.value})}
                  placeholder={`Activity ${idx+1} — e.g. Ramadan Celebration, Literacy Experience, Maths Exploration…`}
                />
                <div style={{display:"flex",gap:3,flexShrink:0}}>
                  {idx>0&&<button onClick={()=>moveActivity(idx,-1)} title="Move up" style={{background:"none",border:"none",cursor:"pointer",color:"#B0A8BF",fontSize:14,padding:"2px 4px"}}>↑</button>}
                  {idx<f.activities.length-1&&<button onClick={()=>moveActivity(idx,1)} title="Move down" style={{background:"none",border:"none",cursor:"pointer",color:"#B0A8BF",fontSize:14,padding:"2px 4px"}}>↓</button>}
                  {f.activities.length>1&&<button onClick={()=>removeActivity(idx)} title="Remove activity" style={{background:"none",border:"none",cursor:"pointer",color:"#D0A0A8",fontSize:18,fontWeight:700,padding:"2px 6px"}}>×</button>}
                </div>
              </div>

              {/* Narrative textarea */}
              <div style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <label style={lbl}>Observation Narrative</label>
                  {act.aiResult&&<span style={{fontSize:9,color:purple,fontWeight:700}}>✨ AI Enhanced</span>}
                </div>
                <textarea
                  style={{...inp,height:110,resize:"vertical",lineHeight:1.75,fontSize:12}}
                  value={act.notes}
                  onChange={e=>uAct(idx,{notes:e.target.value})}
                  placeholder="Describe what you observed — what children were doing, saying, exploring. What does this show about their learning and development?"
                />
              </div>

              {/* AI Assistant per activity */}
              <div style={{background:"linear-gradient(135deg,#EDE4F5,#E4EEF5)",borderRadius:10,padding:"10px 14px",marginBottom:10,border:"1px solid rgba(139,109,175,0.14)"}}>
                <div style={{display:"flex",gap:6,alignItems:"flex-end"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#3D3248",marginBottom:4}}>✨ AI Writing Assistant</div>
                    <textarea
                      value={act.aiDraft}
                      onChange={e=>uAct(idx,{aiDraft:e.target.value})}
                      style={{...inp,height:50,resize:"none",fontSize:11,background:"rgba(255,255,255,0.8)"}}
                      placeholder={`Quick note for Activity ${idx+1} — AI will expand into full educational narrative…`}
                    />
                  </div>
                  <button onClick={()=>enhanceAI(idx)} disabled={!!act.aiLoading} style={{...btnP("#7E5BA3"),whiteSpace:"nowrap",fontSize:11,padding:"8px 12px",flexShrink:0}}>
                    {act.aiLoading?"✨ Writing…":"✨ Enhance"}
                  </button>
                </div>
                {act.aiResult&&(
                  <div style={{marginTop:8,background:"#fff",borderRadius:8,padding:10,border:"1px solid rgba(139,109,175,0.2)"}}>
                    <div style={{fontSize:10,color:purple,fontWeight:700,marginBottom:5}}>AI Draft — review then use:</div>
                    <div style={{fontSize:11,color:"#3D3248",lineHeight:1.8,whiteSpace:"pre-line"}}>{act.aiResult}</div>
                    {act.aiExpl&&<div style={{fontSize:10,color:"#7A6E8A",marginTop:6,padding:"6px 8px",background:lp2,borderRadius:6}}>{act.aiExpl}</div>}
                    <div style={{display:"flex",gap:6,marginTop:8}}>
                      <button onClick={()=>uAct(idx,{notes:act.aiResult,aiResult:"",aiDraft:""})} style={{...btnP(),fontSize:11,padding:"5px 12px"}}>Use This</button>
                      <button onClick={()=>uAct(idx,{aiResult:""})} style={{...btnS,fontSize:11,padding:"5px 12px"}}>Discard</button>
                    </div>
                  </div>
                )}
              </div>

              {/* EYLF Outcomes for this activity */}
              <div style={{marginBottom:8}}>
                <label style={lbl}>EYLF Outcomes for this activity</label>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                  {EYLF.map(o=>{
                    const sel=act.eylf_outcomes.includes(o.id);
                    return <button key={o.id} onClick={()=>uAct(idx,{eylf_outcomes:sel?act.eylf_outcomes.filter(x=>x!==o.id):[...act.eylf_outcomes,o.id]})}
                      style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:16,border:`2px solid ${sel?o.color:"#EDE8F4"}`,background:sel?o.color+"14":"#fff",cursor:"pointer",fontSize:10,fontWeight:sel?700:400}}>
                      <span>{o.icon}</span><span style={{color:sel?o.color:"#666"}}>{o.short}</span>{sel&&<span style={{color:o.color,fontSize:9}}>✓</span>}
                    </button>;
                  })}
                </div>
                {/* Sub-outcomes */}
                {act.eylf_outcomes.length>0&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {act.eylf_outcomes.map(oid=>{
                      const o=EYLF.find(e=>e.id===oid);
                      return (EYLF_SUB[oid]||[]).map(s=>{
                        const subSel=(act.eylf_sub_outcomes[oid]||[]).includes(s);
                        return <button key={oid+s} onClick={()=>{
                          const cur=act.eylf_sub_outcomes[oid]||[];
                          uAct(idx,{eylf_sub_outcomes:{...act.eylf_sub_outcomes,[oid]:subSel?cur.filter(x=>x!==s):[...cur,s]}});
                        }} style={{padding:"2px 9px",borderRadius:12,border:"none",cursor:"pointer",fontSize:9,background:subSel?o.color:"#F0F0F0",color:subSel?"#fff":"#555",fontWeight:subSel?700:400}}>{s}</button>;
                      });
                    })}
                  </div>
                )}
              </div>

              {/* Learning area tags for this activity */}
              <div>
                <label style={lbl}>Learning Area Tags</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {TAGS.map(tag=>(
                    <button key={tag} onClick={()=>uAct(idx,{tags:act.tags.includes(tag)?act.tags.filter(t=>t!==tag):[...act.tags,tag]})}
                      style={{padding:"3px 9px",borderRadius:16,border:"none",cursor:"pointer",fontSize:10,fontWeight:act.tags.includes(tag)?700:400,background:act.tags.includes(tag)?purple:"#F0EBF8",color:act.tags.includes(tag)?"#fff":"#7A6E8A"}}>
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {/* Add another activity prompt */}
          <button onClick={addActivity} style={{width:"100%",padding:"12px",borderRadius:12,border:"2px dashed #D8D0E6",background:"transparent",cursor:"pointer",color:"#9A8FB0",fontSize:12,fontWeight:600,marginBottom:14,transition:"all 0.2s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=purple;e.currentTarget.style.color=purple;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="#D8D0E6";e.currentTarget.style.color="#9A8FB0";}}>
            + Add Another Activity or Event
          </button>

          {/* Bottom action bar */}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",padding:"12px 0",borderTop:"1px solid #F0EBF8"}}>
            <button onClick={onCancel} style={btnS}>✕ Cancel</button>
            <button onClick={()=>save(false)} disabled={saving||!f.title} style={{...btnS,opacity:!f.title?0.5:1}}>{saving?"Saving…":editMode?"Save Changes":"Save as Draft"}</button>
            <button onClick={()=>save(true)} disabled={saving||!f.title} style={{...btnP(),opacity:!f.title?0.5:1}}>✓ {editMode?"Save & Publish":"Publish Story"}</button>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Live Preview ── */}
        <PreviewPane/>
      </div>
    </div>
  );
}

// ─── FEED ─────────────────────────────────────────────────────────────────────
function FeedView({ stories, children, loading, onOpen, onEdit }) {
  if (loading) return <div style={{ textAlign:"center", padding:60, color:"#B0AAB9" }}><div style={{ fontSize:32, marginBottom:12 }}>📖</div>Loading stories…</div>;
  if (!stories.length) return (
    <div style={{ textAlign:"center", padding:"60px 20px", color:"#B0AAB9" }}>
      <div style={{ fontSize:52, marginBottom:14 }}>📚</div>
      <div style={{ fontSize:15, fontWeight:700, marginBottom:6, color:"#7A6E8A" }}>No stories for this period</div>
      <div style={{ fontSize:13 }}>Try a wider date range or create a new story.</div>
    </div>
  );
  return <div style={{ columns:"2 400px", columnGap:18 }}>{stories.map(s => <StoryCard key={s.id} story={s} children={children} onClick={() => onOpen(s)} onEdit={onEdit ? () => onEdit(s) : null} />)}</div>;
}

function StoryCard({ story: s, children, onClick, onEdit }) {
  const tagged = (s.child_ids||[]).map(id => children.find(c => c.id===id)).filter(Boolean);
  const cover = s.photo_rows?.[0];
  return (
    <div onClick={onClick} style={{ background:"#fff", borderRadius:16, border:"1px solid #EDE8F4", overflow:"hidden", boxShadow:"0 2px 12px rgba(139,109,175,0.06)", cursor:"pointer", marginBottom:18, breakInside:"avoid" }}
      onMouseEnter={e=>e.currentTarget.style.boxShadow="0 6px 24px rgba(139,109,175,0.13)"}
      onMouseLeave={e=>e.currentTarget.style.boxShadow="0 2px 12px rgba(139,109,175,0.06)"}>
      {cover?.url
        ? <div style={{ height:200, background:`url(${cover.url}) center/cover`, position:"relative" }}>
            {!s.published && <div style={{ position:"absolute", top:10, left:10, background:"rgba(0,0,0,0.6)", color:"#fff", fontSize:10, padding:"2px 9px", borderRadius:8, fontWeight:700 }}>DRAFT</div>}
            {s.photo_rows?.length > 1 && <div style={{ position:"absolute", bottom:8, right:10, background:"rgba(0,0,0,0.55)", color:"#fff", fontSize:10, padding:"2px 8px", borderRadius:8 }}>+{s.photo_rows.length-1} photos</div>}
          </div>
        : <div style={{ height:80, background:`linear-gradient(135deg,${purple}18,${purple}06)`, display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
            <span style={{ fontSize:36 }}>{s.type==="excursion"?"🚌":s.type==="event"?"🎉":s.type==="individual"?"👤":"👥"}</span>
            {!s.published && <span style={{ fontSize:10, background:purple+"22", color:purple, padding:"2px 8px", borderRadius:8, fontWeight:700 }}>DRAFT</span>}
          </div>
      }
      <div style={{ padding:"14px 16px 16px" }}>
        {s.event_name && <div style={{ fontSize:10, color:purple, fontWeight:700, marginBottom:4 }}>📍 {s.event_name}</div>}
        <div style={{ fontSize:15, fontWeight:800, color:"#3D3248", marginBottom:3, lineHeight:1.3 }}>{s.title||"Untitled Story"}</div>
        <div style={{ fontSize:11, color:"#9A8FB0", marginBottom:10 }}>{fmtDate(s.date)} · {s.educator_name||"Educator"}</div>
        {s.content && <div style={{ fontSize:12, color:"#5C4E6A", lineHeight:1.7, marginBottom:12 }}>{s.content.length>160?s.content.slice(0,160)+"…":s.content}</div>}
        {tagged.length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:10 }}>
            {tagged.slice(0,6).map(c => <Avatar key={c.id} child={c} size={26} showName />)}
            {tagged.length > 6 && <span style={{ fontSize:11, color:"#B0AAB9", alignSelf:"center" }}>+{tagged.length-6} more</span>}
          </div>
        )}
        {(s.eylf_outcomes||[]).length > 0 && <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:8 }}>{s.eylf_outcomes.map(id => <EylfBadge key={id} id={id} small />)}</div>}
        {(s.tags||[]).length > 0 && <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>{s.tags.map(tag => <span key={tag} style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"#F5F5F5", color:"#8A7F96" }}>{tag}</span>)}</div>}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10 }}>
          {s.ai_enhanced ? <div style={{ fontSize:10, color:purple, fontWeight:700 }}>✨ AI Enhanced</div> : <div />}
          {onEdit && <button onClick={e => { e.stopPropagation(); onEdit(); }} style={{ fontSize:11, padding:"4px 10px", borderRadius:8, border:`1px solid ${purple}30`, background:"transparent", color:purple, cursor:"pointer", fontWeight:600 }}>✏️ Edit</button>}
        </div>
      </div>
    </div>
  );
}

// ─── STORY DETAIL ─────────────────────────────────────────────────────────────
function StoryDetailView({ story: s, children, onClose, onEdit, onRefresh }) {
  const tagged = (s.child_ids||[]).map(id => children.find(c => c.id===id)).filter(Boolean);
  const [publishing, setPublishing] = useState(false);
  const [progOpen, setProgOpen] = useState(false);
  const [pChild, setPChild] = useState(s.child_ids?.[0]||"");
  const [pOutcome, setPOutcome] = useState(s.eylf_outcomes?.[0]||"");
  const [pLevel, setPLevel] = useState(1);
  const [pNotes, setPNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState(s.photo_rows || []);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const uploadFiles = async (files) => {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach(f => fd.append("photos", f));
      const r = await fetch(`/api/learning/stories/${s.id}/upload`, { method:"POST", body:fd });
      const data = await r.json();
      if (data.ok) {
        const updated = await API(`/api/learning/stories/${s.id}`);
        if (updated.photo_rows) setPhotos(updated.photo_rows);
        onRefresh();
      }
    } catch {}
    setUploading(false);
  };

  const deletePhoto = async (photoId) => {
    if (!confirm("Delete this photo?")) return;
    await API(`/api/learning/photos/${photoId}`, { method:"DELETE" });
    setPhotos(prev => prev.filter(p => p.id !== photoId));
    onRefresh();
  };

  const publish = async () => { setPublishing(true); await API(`/api/learning/stories/${s.id}/publish`,{method:"POST"}); onRefresh(); setPublishing(false); };

  const recordProg = async () => {
    if (!pChild||!pOutcome) return;
    setSaving(true);
    await API(`/api/learning/progress/${pChild}`, { method:"POST", body:{ eylf_outcome:parseInt(pOutcome), level:pLevel, notes:pNotes, story_id:s.id } });
    setProgOpen(false); onRefresh(); setSaving(false);
  };

  return (
    <div style={{ maxWidth:800, margin:"0 auto" }}>
      <button onClick={onClose} style={{ ...btnGhost, marginBottom:16, display:"flex", alignItems:"center", gap:5, fontSize:13 }}>← Back to Feed</button>

      {/* Photo strip + upload zone */}
      <div style={{ marginBottom:20 }}>
        {photos.length > 0 && (
          <>
            <div style={{ position:"relative" }}>
              <div style={{ height:320, background:`url(${photos[0].url}) center/cover`, borderRadius:16 }} />
              <button onClick={() => deletePhoto(photos[0].id)} title="Remove photo" style={{ position:"absolute", top:10, right:10, background:"rgba(0,0,0,0.55)", border:"none", color:"#fff", borderRadius:"50%", width:28, height:28, cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
            {photos.length > 1 && (
              <div style={{ display:"flex", gap:6, marginTop:6 }}>
                {photos.slice(1).map(p => (
                  <div key={p.id} style={{ position:"relative", flex:1, height:80, background:`url(${p.url}) center/cover`, borderRadius:10 }}>
                    <button onClick={() => deletePhoto(p.id)} title="Remove" style={{ position:"absolute", top:4, right:4, background:"rgba(0,0,0,0.55)", border:"none", color:"#fff", borderRadius:"50%", width:22, height:22, cursor:"pointer", fontSize:12, lineHeight:1, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Upload zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          style={{ marginTop:photos.length?10:0, border:`2px dashed ${dragOver?purple:"#D8D0E6"}`, borderRadius:12, padding:"18px 20px", textAlign:"center", cursor:"pointer", background:dragOver?lp2:"#FDFCFF", transition:"all 0.2s" }}
        >
          <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display:"none" }} onChange={e => uploadFiles(e.target.files)} />
          {uploading
            ? <div style={{ fontSize:13, color:purple }}>⏳ Uploading photos…</div>
            : <div style={{ fontSize:12, color:"#9A8FB0" }}>{photos.length ? "📷 Add more photos" : "📷 Upload photos"} <span style={{ color:"#C0B8D4" }}>— drag & drop or click</span></div>
          }
        </div>
      </div>

      {/* Header card */}
      <div style={{ ...card, borderLeft:`4px solid ${purple}` }}>
        {s.event_name && <div style={{ fontSize:11, color:purple, fontWeight:700, marginBottom:6 }}>📍 {s.event_name}</div>}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
          <h2 style={{ margin:0, color:"#3D3248", fontSize:22, lineHeight:1.2 }}>{s.title}</h2>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {onEdit && <button onClick={onEdit} style={{ ...btnS, fontSize:12, padding:"6px 12px" }}>✏️ Edit Story</button>}
            {!s.published
              ? <button onClick={publish} disabled={publishing} style={btnP("#6BA38B")}>✓ Publish</button>
              : <span style={{ fontSize:11, background:"#6BA38B20", color:"#4A7A6B", padding:"4px 10px", borderRadius:10, fontWeight:700 }}>✓ Published</span>}
          </div>
        </div>
        <div style={{ fontSize:12, color:"#9A8FB0", marginBottom:14 }}>{fmtDate(s.date)} · {s.educator_name||"Educator"}{s.group_name?` · ${s.group_name}`:""}{s.ai_enhanced?" · ✨ AI Enhanced":""}</div>

        {tagged.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#8A7F96", marginBottom:8 }}>CHILDREN IN THIS STORY</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {tagged.map(c => (
                <div key={c.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 12px", borderRadius:24, background:childColor(c)+"14", border:`1px solid ${childColor(c)}28` }}>
                  <Avatar child={c} size={30} />
                  <div><div style={{ fontSize:12, fontWeight:700, color:"#3D3248" }}>{c.first_name} {c.last_name}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(s.eylf_outcomes||[]).length > 0 && (
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"#8A7F96", marginBottom:8 }}>EYLF OUTCOMES</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>{s.eylf_outcomes.map(id => <EylfBadge key={id} id={id} />)}</div>
          </div>
        )}
      </div>

      {/* Story text */}
      <div style={card}><div style={{ fontSize:13, lineHeight:1.9, color:"#4A3F5C", whiteSpace:"pre-line" }}>{s.content}</div></div>

      {/* Sub-outcomes */}
      {Object.entries(s.eylf_sub_outcomes||{}).some(([,v])=>v?.length>0) && (
        <div style={card}>
          <h4 style={{ margin:"0 0 12px", fontSize:13, fontWeight:700 }}>Sub-outcome Connections</h4>
          {Object.entries(s.eylf_sub_outcomes||{}).map(([oid,subs]) => {
            if (!subs?.length) return null;
            const o = EYLF.find(e => e.id===parseInt(oid));
            return <div key={oid} style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, fontWeight:700, color:o?.color, marginBottom:5 }}>{o?.icon} Outcome {oid}: {o?.label}</div>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>{subs.map(s => <span key={s} style={{ fontSize:11, padding:"3px 10px", borderRadius:12, background:(o?.color||"#999")+"18", color:o?.color||"#555" }}>{s}</span>)}</div>
            </div>;
          })}
        </div>
      )}

      {/* Tags */}
      {(s.tags||[]).length > 0 && (
        <div style={{ ...card, padding:"12px 16px" }}>
          <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>{s.tags.map(tag => <span key={tag} style={{ fontSize:11, padding:"3px 10px", borderRadius:12, background:lp, color:purple }}>{tag}</span>)}</div>
        </div>
      )}

      {/* Record Progression */}
      {(s.eylf_outcomes||[]).length > 0 && tagged.length > 0 && (
        <div style={{ ...card, border:`1px solid ${purple}30`, background:lp2 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:"#3D3248", marginBottom:3 }}>📈 Record EYLF Progression</div>
              <div style={{ fontSize:12, color:"#8A7F96" }}>Capture learning progress linked to this story</div>
            </div>
            <button onClick={() => setProgOpen(!progOpen)} style={progOpen?btnS:btnP()}>{progOpen?"Cancel":"Record Progression"}</button>
          </div>
          {progOpen && (
            <div style={{ marginTop:14, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
              <div>
                <label style={lbl}>Child</label>
                <select style={inp} value={pChild} onChange={e => setPChild(e.target.value)}>
                  {tagged.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>EYLF Outcome</label>
                <select style={inp} value={pOutcome} onChange={e => setPOutcome(e.target.value)}>
                  {s.eylf_outcomes.map(id => { const o=EYLF.find(e=>e.id===id); return <option key={id} value={id}>{o?.icon} Outcome {id}: {o?.short}</option>; })}
                </select>
              </div>
              <div>
                <label style={lbl}>Level</label>
                <select style={inp} value={pLevel} onChange={e => setPLevel(parseInt(e.target.value))}>
                  {[1,2,3,4].map(l => <option key={l} value={l}>{l} — {LEVEL_LABELS[l]}</option>)}
                </select>
              </div>
              <div style={{ gridColumn:"span 3" }}>
                <label style={lbl}>Notes</label>
                <input style={inp} value={pNotes} onChange={e => setPNotes(e.target.value)} placeholder="What did you observe that shows this progression?" />
              </div>
              <div style={{ gridColumn:"span 3", display:"flex", justifyContent:"flex-end" }}>
                <button onClick={recordProg} disabled={saving} style={btnP()}>✓ Record Progression</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ALBUMS ───────────────────────────────────────────────────────────────────
function AlbumsView({ albums, children, stories, onOpen, onRefresh }) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const create = async () => { if(!name) return; await API("/api/learning/albums",{method:"POST",body:{name}}); setName(""); setCreating(false); onRefresh(); };
  const getCover = (al) => stories.filter(s=>s.album_id===al.id).find(s=>s.photo_rows?.[0])?.photo_rows?.[0]?.url||null;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <div style={{ fontSize:13, color:"#8A7F96" }}>{albums.length} album{albums.length!==1?"s":""}</div>
        <button onClick={() => setCreating(!creating)} style={creating?btnS:btnP()}>{creating?"Cancel":"+ New Album"}</button>
      </div>
      {creating && (
        <div style={{ ...card, display:"flex", gap:8, alignItems:"flex-end", marginBottom:18 }}>
          <div style={{ flex:1 }}><label style={lbl}>Album Name</label><input style={inp} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Harmony Day Celebration" autoFocus onKeyDown={e=>e.key==="Enter"&&create()} /></div>
          <button onClick={create} style={btnP()}>Create</button>
        </div>
      )}
      {albums.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 20px", color:"#B0AAB9" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🖼</div>
          <div style={{ fontSize:14 }}>Albums auto-create when you add an event name or tags to stories.</div>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:16 }}>
          {albums.map(al => {
            const cover = getCover(al);
            const alChildren = (al.child_ids||[]).map(id => children.find(c=>c.id===id)).filter(Boolean);
            return (
              <div key={al.id} onClick={() => onOpen(al)} style={{ background:"#fff", borderRadius:16, border:"1px solid #EDE8F4", overflow:"hidden", cursor:"pointer", boxShadow:"0 2px 10px rgba(0,0,0,0.04)" }}
                onMouseEnter={e=>e.currentTarget.style.boxShadow="0 6px 20px rgba(139,109,175,0.12)"}
                onMouseLeave={e=>e.currentTarget.style.boxShadow="0 2px 10px rgba(0,0,0,0.04)"}>
                <div style={{ height:160, background:cover?`url(${cover}) center/cover`:`linear-gradient(135deg,${purple}25,${purple}10)`, display:"flex", alignItems:"flex-end", padding:12 }}>
                  <div style={{ background:"rgba(0,0,0,0.52)", borderRadius:10, padding:"8px 12px", backdropFilter:"blur(3px)" }}>
                    <div style={{ fontSize:13, fontWeight:800, color:"#fff" }}>{al.name}</div>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.8)", marginTop:2 }}>{al.story_count||0} stories · {al.photo_count||0} photos</div>
                  </div>
                </div>
                <div style={{ padding:"10px 14px" }}>
                  {alChildren.length > 0 && <div style={{ display:"flex", gap:4 }}>{alChildren.slice(0,6).map(c=><Avatar key={c.id} child={c} size={22}/>)}{alChildren.length>6&&<span style={{ fontSize:10,color:"#9A8FB0",alignSelf:"center" }}>+{alChildren.length-6}</span>}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AlbumDetailView({ album, stories, children }) {
  const al = stories.filter(s => s.album_id === album.id);
  return (
    <div>
      <div style={{ ...card, borderLeft:`4px solid ${purple}`, marginBottom:18 }}>
        <h2 style={{ margin:"0 0 4px", color:"#3D3248" }}>{album.name}</h2>
        <div style={{ fontSize:12, color:"#9A8FB0" }}>{al.length} stories</div>
      </div>
      {al.length === 0 ? <div style={{ textAlign:"center", padding:40, color:"#B0AAB9" }}>No stories in this album yet.</div>
        : <div style={{ columns:"2 360px", columnGap:16 }}>{al.map(s=><StoryCard key={s.id} story={s} children={children} onClick={()=>{}}/>)}</div>}
    </div>
  );
}

// ─── EYLF OUTCOMES ────────────────────────────────────────────────────────────
function OutcomesView({ children, filterChild, filterFamily, families, multiFamilies }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeChild, setActiveChild] = useState(filterChild||"");

  const famChildren = filterFamily
    ? (families.find(f=>f.id===filterFamily)?.children||[]).map(fc=>children.find(c=>c.id===fc.id)).filter(Boolean)
    : [];
  const displayPool = filterFamily ? famChildren : (filterChild ? children.filter(c=>c.id===filterChild) : children.slice(0,12));

  useEffect(() => {
    if (!activeChild) return;
    setLoading(true);
    API(`/api/learning/child/${activeChild}/eylf-summary`).then(r => { setData(r); setLoading(false); }).catch(()=>setLoading(false));
  }, [activeChild]);

  if (!activeChild) return (
    <div>
      <div style={{ marginBottom:14, fontSize:13, color:"#8A7F96" }}>Select a child to view their EYLF progress:</div>
      {/* Group by sibling families */}
      {multiFamilies.length > 0 && (
        multiFamilies.map(fam => {
          const fc = (fam.children||[]).map(fc2=>children.find(c=>c.id===fc2.id)).filter(Boolean);
          return fc.length > 0 ? (
            <div key={fam.id} style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#8A7F96", marginBottom:8 }}>👨‍👩‍👧‍👦 {fam.family_name}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                {fc.map(c => <button key={c.id} onClick={() => setActiveChild(c.id)} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 16px", borderRadius:12, border:`2px solid ${childColor(c)}30`, background:"#fff", cursor:"pointer" }}><Avatar child={c} size={36}/><div style={{ textAlign:"left" }}><div style={{ fontSize:13, fontWeight:700, color:"#3D3248" }}>{c.first_name} {c.last_name}</div><div style={{ fontSize:10, color:"#9A8FB0" }}>View EYLF Progress</div></div></button>)}
              </div>
            </div>
          ) : null;
        })
      )}
      <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
        {displayPool.filter(c => !multiFamilies.some(fam=>(fam.children||[]).some(fc=>fc.id===c.id))).map(c => (
          <button key={c.id} onClick={() => setActiveChild(c.id)} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 16px", borderRadius:12, border:`2px solid ${childColor(c)}30`, background:"#fff", cursor:"pointer" }}>
            <Avatar child={c} size={36}/><div style={{ textAlign:"left" }}><div style={{ fontSize:13, fontWeight:700, color:"#3D3248" }}>{c.first_name} {c.last_name}</div><div style={{ fontSize:10, color:"#9A8FB0" }}>View EYLF Progress</div></div>
          </button>
        ))}
      </div>
    </div>
  );

  const child = children.find(c=>c.id===activeChild);

  return (
    <div>
      {/* Sibling switcher */}
      {displayPool.length > 1 && (
        <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
          {displayPool.map(c => (
            <button key={c.id} onClick={() => setActiveChild(c.id)} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:20, border:`2px solid ${activeChild===c.id?childColor(c):"#EDE8F4"}`, background:activeChild===c.id?childColor(c)+"15":"#fff", cursor:"pointer" }}>
              <Avatar child={c} size={22}/><span style={{ fontSize:12, fontWeight:activeChild===c.id?700:500 }}>{c.first_name}</span>
            </button>
          ))}
        </div>
      )}

      {child && <h3 style={{ margin:"0 0 18px", color:"#3D3248" }}>{child.first_name} {child.last_name} — EYLF Progress</h3>}

      {loading ? <div style={{ textAlign:"center", padding:40, color:"#B0AAB9" }}>Loading…</div> : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:16 }}>
          {EYLF.map(outcome => {
            const progresses = (data?.progress||[]).filter(p=>p.eylf_outcome===outcome.id);
            const storyCount = data?.story_counts?.[outcome.id]||0;
            const maxLevel = progresses.reduce((m,p)=>Math.max(m,p.level||0),0);
            const pct = Math.min(100, storyCount*12 + maxLevel*18);
            return (
              <div key={outcome.id} style={{ ...card, borderTop:`4px solid ${outcome.color}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                  <div style={{ width:44, height:44, borderRadius:"50%", background:outcome.color+"20", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>{outcome.icon}</div>
                  <div><div style={{ fontSize:12, fontWeight:800, color:"#3D3248" }}>Outcome {outcome.id}</div><div style={{ fontSize:11, color:"#8A7F96" }}>{outcome.label}</div></div>
                </div>
                <div style={{ background:"#EDE8F4", borderRadius:20, height:10, overflow:"hidden", marginBottom:6 }}>
                  <div style={{ height:"100%", borderRadius:20, background:outcome.color, width:`${pct}%`, transition:"width 0.5s" }} />
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:10 }}>
                  <span style={{ color:"#8A7F96" }}>{storyCount} stories · {maxLevel?`Level ${maxLevel} — ${LEVEL_LABELS[maxLevel]}`:"No progressions yet"}</span>
                  <span style={{ fontWeight:700, color:outcome.color }}>{pct}%</span>
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                  {EYLF_SUB[outcome.id].map(s => {
                    const prog = progresses.find(p=>p.sub_outcome===s);
                    return <span key={s} style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:prog?outcome.color+"22":"#F5F5F5", color:prog?outcome.color:"#9E9E9E", fontWeight:prog?700:400 }}>{prog?"✓ ":""}{s}</span>;
                  })}
                </div>
                {progresses.length>0 && <div style={{ marginTop:10, padding:"8px 10px", background:outcome.color+"08", borderRadius:8, fontSize:11, color:"#5C4E6A" }}><strong>Latest:</strong> {progresses[progresses.length-1]?.notes||`Level ${progresses[progresses.length-1]?.level} recorded`}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── WEEKLY REPORTS ───────────────────────────────────────────────────────────
function WeeklyReportsView({ children, families, multiFamilies }) {
  const [selectedChild, setSelectedChild] = useState("");
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = async (cid) => { setLoading(true); const r = await API(`/api/learning/weekly/${cid}`).catch(()=>[]); setReports(Array.isArray(r)?r:[]); setLoading(false); };
  useEffect(() => { if (selectedChild) load(selectedChild); }, [selectedChild]);

  const generate = async () => {
    if (!selectedChild) return;
    setGenerating(true);
    const today = new Date(), ws = weekOf(today);
    const we = new Date(new Date(ws)); we.setDate(we.getDate()+6);
    await API(`/api/learning/weekly/${selectedChild}/generate`,{method:"POST",body:{week_start:ws, week_end:we.toISOString().slice(0,10)}});
    await load(selectedChild);
    setGenerating(false);
  };

  const child = children.find(c=>c.id===selectedChild);

  return (
    <div>
      <div style={{ ...card, marginBottom:18 }}>
        <h4 style={{ margin:"0 0 12px", fontSize:14, fontWeight:800 }}>📋 Weekly Learning Reports</h4>
        <div style={{ display:"flex", gap:10, alignItems:"flex-end", flexWrap:"wrap" }}>
          <div style={{ flex:1, minWidth:200 }}>
            <label style={lbl}>Select Child</label>
            <select style={inp} value={selectedChild} onChange={e=>setSelectedChild(e.target.value)}>
              <option value="">Choose a child…</option>
              {multiFamilies.map(fam => (
                <optgroup key={fam.id} label={`${fam.family_name} (siblings)`}>
                  {(fam.children||[]).map(fc=>{const c=children.find(ch=>ch.id===fc.id);return c?<option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>:null;})}
                </optgroup>
              ))}
              <optgroup label="Other Children">
                {children.filter(c=>!multiFamilies.some(fam=>(fam.children||[]).some(fc=>fc.id===c.id))).map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </optgroup>
            </select>
          </div>
          {selectedChild && <button onClick={generate} disabled={generating} style={btnP()}>{generating?"Generating…":"Generate This Week's Report"}</button>}
        </div>
      </div>

      {loading && <div style={{ textAlign:"center", padding:40, color:"#B0AAB9" }}>Loading…</div>}
      {!loading && selectedChild && reports.length===0 && (
        <div style={{ textAlign:"center", padding:"40px 20px", color:"#B0AAB9" }}>
          <div style={{ fontSize:36, marginBottom:10 }}>📋</div>
          <div>No reports yet for {child?.first_name}. Generate one above!</div>
        </div>
      )}

      {reports.map(rep => {
        const eylf = rep.eylf_summary||{};
        const progs = rep.progressions||[];
        return (
          <div key={rep.id} style={card}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:"#3D3248" }}>Week of {fmtDate(rep.week_start)}</div>
                <div style={{ fontSize:12, color:"#9A8FB0" }}>{rep.week_start} → {rep.week_end} · {rep.observations_count} stories</div>
              </div>
              {rep.ai_generated && <span style={{ fontSize:10, background:lp, color:purple, padding:"2px 8px", borderRadius:8, fontWeight:700 }}>✨ Auto-generated</span>}
            </div>
            <div style={{ fontSize:13, lineHeight:1.8, color:"#4A3F5C", marginBottom:14, padding:"12px 14px", background:lp2, borderRadius:10 }}>{rep.summary}</div>
            {Object.keys(eylf).length > 0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#8A7F96", marginBottom:8 }}>EYLF ENGAGEMENT THIS WEEK</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {Object.entries(eylf).map(([id,count]) => { const o=EYLF.find(e=>e.id===parseInt(id)); return o?<div key={id} style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:20, background:o.color+"18", border:`1px solid ${o.color}30` }}><span>{o.icon}</span><span style={{ fontSize:11,fontWeight:700,color:o.color }}>Outcome {id}</span><span style={{ fontSize:11,background:o.color,color:"#fff",borderRadius:10,padding:"0px 6px",fontWeight:700 }}>{count}</span></div>:null; })}
                </div>
              </div>
            )}
            {progs.length > 0 && (
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:"#8A7F96", marginBottom:8 }}>PROGRESSIONS RECORDED</div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {progs.map((p,i) => { const o=EYLF.find(e=>e.id===p.outcome); return <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:8, background:(o?.color||"#888")+"12" }}><span>{o?.icon||"📈"}</span><span style={{ fontSize:12,color:"#3D3248" }}>Outcome {p.outcome}{p.sub?` — ${p.sub}`:""}</span><span style={{ fontSize:11,background:o?.color||"#888",color:"#fff",borderRadius:8,padding:"1px 7px",fontWeight:700 }}>Level {p.level} — {LEVEL_LABELS[p.level]}</span>{p.notes&&<span style={{ fontSize:11,color:"#8A7F96" }}>· {p.notes}</span>}</div>; })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── FAMILIES VIEW ────────────────────────────────────────────────────────────
function FamiliesView({ families, children, stories, onFamilyFilter, onRefresh }) {
  const [syncing, setSyncing] = useState(false);
  const sync = async () => { setSyncing(true); await API("/api/learning/families/sync",{method:"POST"}); onRefresh(); setSyncing(false); };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:"#3D3248", marginBottom:3 }}>Family Groups</div>
          <div style={{ fontSize:12, color:"#9A8FB0" }}>Siblings share learning journeys — stories tagged with any child are visible across the family</div>
        </div>
        <button onClick={sync} disabled={syncing} style={btnS}>{syncing?"Syncing…":"🔄 Sync Families"}</button>
      </div>

      {families.length === 0 ? (
        <div style={{ textAlign:"center", padding:"40px 20px", color:"#B0AAB9" }}>
          <div style={{ fontSize:36, marginBottom:10 }}>👨‍👩‍👧‍👦</div>
          <div>Click "Sync Families" to auto-group children by shared parent email.</div>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))", gap:16 }}>
          {families.map(fam => {
            const fc = (fam.children||[]).map(fc2=>children.find(c=>c.id===fc2.id)).filter(Boolean);
            const famStories = stories.filter(s=>(s.child_ids||[]).some(cid=>fc.some(c=>c.id===cid)));
            const isMulti = fc.length > 1;
            return (
              <div key={fam.id} style={{ ...card, border:`1px solid ${isMulti?purple+"44":"#EDE8F4"}`, position:"relative" }}>
                {isMulti && <div style={{ position:"absolute", top:12, right:12, fontSize:10, background:purple, color:"#fff", padding:"2px 8px", borderRadius:8, fontWeight:700 }}>SIBLINGS</div>}
                <div style={{ fontSize:15, fontWeight:800, color:"#3D3248", marginBottom:3 }}>{fam.family_name}</div>
                <div style={{ fontSize:11, color:"#9A8FB0", marginBottom:12 }}>{fam.email}{fam.email2?` · ${fam.email2}`:""}</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
                  {fc.map(c => (
                    <div key={c.id} style={{ display:"flex", alignItems:"center", gap:7, padding:"7px 12px", borderRadius:20, background:childColor(c)+"14", border:`1px solid ${childColor(c)}25` }}>
                      <Avatar child={c} size={28}/>
                      <div><div style={{ fontSize:12, fontWeight:700, color:"#3D3248" }}>{c.first_name} {c.last_name}</div></div>
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ fontSize:12, color:"#9A8FB0" }}>{famStories.length} stories</div>
                  {fc.length > 0 && <button onClick={() => onFamilyFilter(fam.id)} style={{ ...btnS, padding:"5px 12px", fontSize:11 }}>View Family Feed →</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
