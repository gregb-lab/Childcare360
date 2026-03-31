import { useState, useEffect, useCallback, useRef } from "react";
import DatePicker from "./DatePicker.jsx";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}) },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};

const toast = (msg, type = "success") => { if (window.showToast) window.showToast(msg, type); };

const purple = "#8B6DAF", lp = "#F0EBF8";
const inp = { padding: "7px 10px", borderRadius: 7, border: "1px solid #DDD6EE", fontSize: 12, width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 11, color: "#7A6E8A", fontWeight: 600, display: "block", marginBottom: 3 };
const card = { background: "#fff", borderRadius: 12, border: "1px solid #EDE8F4", padding: 14 };
const btnP = { background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontWeight: 700, fontSize: 12 };
const btnS = { background: lp, color: purple, border: `1px solid ${purple}40`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontSize: 12 };

function ChildAvatar({ child, size = 34 }) {
  const colors = ["#C9929E","#9B7DC0","#6BA38B","#D4A26A","#5B8DB5"];
  const color = colors[(child.first_name?.charCodeAt(0) || 0) % colors.length];
  if (child.photo_url) return <img src={child.photo_url} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return <div style={{ width: size, height: size, borderRadius: "50%", background: color + "30", border: `2px solid ${color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.32, fontWeight: 700, color, flexShrink: 0 }}>{child.first_name?.[0]}{child.last_name?.[0]}</div>;
}

const now = () => new Date().toTimeString().slice(0, 5);
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function DailyUpdatesModule() {
  const [children, setChildren] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState("all");
  const [selectedChild, setSelectedChild] = useState(null);
  const [activeEntry, setActiveEntry] = useState(null); // what form is open
  const [updates, setUpdates] = useState({}); // childId -> [events]
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [ch, rm] = await Promise.all([API("/api/children"), API("/api/rooms")]);
      if (Array.isArray(ch)) setChildren(ch);
      if (Array.isArray(rm)) setRooms(rm);
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadUpdates = useCallback(async (childId) => {
    try {
      const r = await API(`/api/daily-updates?child_id=${childId}&date=${todayStr()}`);
      if (Array.isArray(r)) setUpdates(p => ({ ...p, [childId]: r }));
    } catch (e) {}
  }, []);

  const visibleChildren = selectedRoom === "all" ? children : children.filter(c => c.room_id === selectedRoom);

  const handleSaved = (childId) => {
    setActiveEntry(null);
    loadUpdates(childId);
  };

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#8A7F96" }}>Loading...</div>;

  return (
    <div style={{ padding: "0 0 24px" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px 12px", borderBottom: "1px solid #EDE8F4", background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <h2 style={{ margin: 0, color: "#3D3248" }}>📱 Live Updates</h2>
            <p style={{ margin: "2px 0 0", color: "#8A7F96", fontSize: 12 }}>
              {new Date().toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long"})} · Real-time child activity logging · Visible to parents in portal
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 11, color: "#8A7F96", fontWeight: 600 }}>Filter Room:</label>
            <select value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)}
              style={{ ...inp, width: "auto", padding: "6px 10px" }}>
              <option value="all">All Rooms</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, height: "calc(100vh - 180px)" }}>
        {/* Children list */}
        <div style={{ width: 230, borderRight: "1px solid #EDE8F4", overflowY: "auto", background: "#FDFBF9" }}>
          {visibleChildren.map(child => {
            const childUpdates = updates[child.id] || [];
            const icons = childUpdates.map(u => ({ sleep: "😴", food: "🍽️", diaper: "👶", sunscreen: "☀️", incident: "🩹", toilet: "🚽", other: "📝" }[u.type] || "📌")).slice(-4);
            const sel = selectedChild?.id === child.id;
            return (
              <div key={child.id} onClick={() => { setSelectedChild(child); loadUpdates(child.id); setActiveEntry(null); }}
                style={{ padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid #F5F0FB", background: sel ? lp : "transparent", borderLeft: `3px solid ${sel ? purple : "transparent"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ChildAvatar child={child} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: sel ? 800 : 600, color: "#3D3248", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {child.first_name} {child.last_name}
                    </div>
                    {icons.length > 0 && <div style={{ fontSize: 14, marginTop: 1 }}>{icons.join(" ")}</div>}
                    {icons.length === 0 && <div style={{ fontSize: 10, color: "#B0AAB9" }}>No updates today</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail / entry pane */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {selectedChild ? (
            <ChildUpdatePanel
              child={selectedChild}
              updates={updates[selectedChild.id] || []}
              activeEntry={activeEntry}
              setActiveEntry={setActiveEntry}
              onSaved={handleSaved}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 8, color: "#B0AAB9" }}>
              <div style={{ fontSize: 40 }}>👶</div>
              <div style={{ fontSize: 13 }}>Select a child to log or view updates</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ACTION_TYPES = [
  { id: "sleep",    icon: "😴", label: "Sleep",      color: "#9B7DC0", bg: "#F3EEFF" },
  { id: "food",     icon: "🍽️", label: "Food",       color: "#6BA38B", bg: "#EDFAF3" },
  { id: "diaper",   icon: "👶", label: "Diaper",     color: "#D4A26A", bg: "#FFF6E8" },
  { id: "toilet",   icon: "🚽", label: "Toilet",     color: "#5B8DB5", bg: "#E8F4FF" },
  { id: "sunscreen",icon: "☀️", label: "Sunscreen",  color: "#E65100", bg: "#FFF3E0" },
  { id: "incident", icon: "🩹", label: "Incident",   color: "#B71C1C", bg: "#FFEBEE" },
  { id: "other",    icon: "📝", label: "Other",      color: "#8A7F96", bg: "#F8F5F1" },
];

function ChildUpdatePanel({ child, updates, activeEntry, setActiveEntry, onSaved }) {
  const timeSince = (ts) => {
    const secs = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (secs < 60) return "just now";
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m ago`;
  };

  return (
    <div style={{ padding: "16px 20px" }}>
      {/* Child header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: "12px 16px", background: "#fff", borderRadius: 12, border: "1px solid #EDE8F4" }}>
        <ChildAvatar child={child} size={44} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#3D3248" }}>{child.first_name} {child.last_name}</div>
          {child.allergies && child.allergies !== "None" && (
            <div style={{ fontSize: 11, color: "#B71C1C", fontWeight: 700, background: "#FFEBEE", borderRadius: 20, padding: "2px 8px", display: "inline-block", marginTop: 2 }}>
              ⚠ {child.allergies}
            </div>
          )}
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#8A7F96" }}>Today's entries</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: purple }}>{updates.length}</div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 8, marginBottom: 16 }}>
        {ACTION_TYPES.map(a => (
          <button key={a.id} onClick={() => setActiveEntry(activeEntry === a.id ? null : a.id)}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 6px", borderRadius: 10, border: `2px solid ${activeEntry === a.id ? a.color : "#EDE8F4"}`,
              background: activeEntry === a.id ? a.bg : "#fff", cursor: "pointer", transition: "all 0.15s" }}>
            <span style={{ fontSize: 22 }}>{a.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: activeEntry === a.id ? a.color : "#8A7F96" }}>{a.label}</span>
          </button>
        ))}
      </div>

      {/* Entry forms */}
      {activeEntry === "sleep"     && <SleepForm     child={child} onSaved={onSaved} />}
      {activeEntry === "food"      && <FoodForm      child={child} onSaved={onSaved} />}
      {activeEntry === "diaper"    && <DiaperForm    child={child} onSaved={onSaved} />}
      {activeEntry === "toilet"    && <ToiletForm    child={child} onSaved={onSaved} />}
      {activeEntry === "sunscreen" && <SunscreenForm child={child} onSaved={onSaved} />}
      {activeEntry === "incident"  && <IncidentForm  child={child} onSaved={onSaved} />}
      {activeEntry === "other"     && <OtherForm     child={child} onSaved={onSaved} />}

      {/* Today's timeline */}
      <div style={card}>
        <h4 style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#3D3248" }}>Today's Timeline</h4>
        {updates.length === 0 ? (
          <div style={{ textAlign: "center", padding: 20, color: "#B0AAB9", fontSize: 12 }}>No updates logged yet today</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[...updates].reverse().map(u => {
              const atype = ACTION_TYPES.find(a => a.id === u.type) || ACTION_TYPES[6];
              return (
                <div key={u.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px", borderRadius: 8, background: atype.bg, border: `1px solid ${atype.color}20` }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{atype.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#3D3248" }}>{atype.label}</div>
                    <div style={{ fontSize: 11, color: "#5C4E6A" }}>{u.summary || u.notes}</div>
                    {u.time && <div style={{ fontSize: 10, color: "#8A7F96", marginTop: 1 }}>⏰ {u.time}</div>}
                  </div>
                  <div style={{ fontSize: 10, color: "#B0AAB9", flexShrink: 0 }}>
                    {u.created_at ? timeSince(u.created_at) : ""}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function saveUpdate(childId, data) {
  return API(`/api/daily-updates`, { method: "POST", body: {...data, child_id: childId} });
}

function SleepForm({ child, onSaved }) {
  const [f, setF] = useState({ type: "sleep", start_time: now(), end_time: "", check_interval: 10, notes: "" });
  const [sleeping, setSleeping] = useState(false);
  const [sleepEntry, setSleepEntry] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let interval;
    if (sleeping) {
      interval = setInterval(() => setElapsed(e => e + 1), 60000);
    }
    return () => clearInterval(interval);
  }, [sleeping]);

  const startSleep = async () => {
    const r = await saveUpdate(child.id, { type: "sleep", start_time: f.start_time, check_interval: f.check_interval, notes: f.notes, status: "sleeping" });
    if (r.id) { setSleepEntry(r); setSleeping(true); setElapsed(0); }
  };

  const endSleep = async () => {
    const endTime = now();
    if (sleepEntry) await API(`/api/daily-updates/${sleepEntry.id}/sleep`, { method: "PUT", body: { end_time: endTime, status: "awake" } }.catch(e=>console.error('API error:',e)));
    setSleeping(false);
    onSaved(child.id);
  };

  if (sleeping) {
    return (
      <div style={{ ...card, background: "#F3EEFF", border: "2px solid #9B7DC0", marginBottom: 12 }}>
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>😴</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#9B7DC0" }}>{child.first_name} is sleeping</div>
          <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 4 }}>Started: {f.start_time} · {elapsed}min elapsed · Check every {f.check_interval}min</div>
          <button onClick={endSleep} style={{ ...btnP, marginTop: 12, background: "#9B7DC0" }}>Wake Up — End Sleep</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...card, background: "#F3EEFF", marginBottom: 12 }}>
      <h4 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#9B7DC0" }}>😴 Sleep Entry</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div><label style={lbl}>Start Time</label><input type="time" style={inp} value={f.start_time} onChange={e => setF(p => ({ ...p, start_time: e.target.value }))} /></div>
        <div><label style={lbl}>End Time (optional)</label><input type="time" style={inp} value={f.end_time} onChange={e => setF(p => ({ ...p, end_time: e.target.value }))} /></div>
        <div><label style={lbl}>Check Interval (mins)</label>
          <select style={inp} value={f.check_interval} onChange={e => setF(p => ({ ...p, check_interval: parseInt(e.target.value) }))}>
            {[5,10,15,20,30].map(n => <option key={n} value={n}>Every {n} min</option>)}
          </select>
        </div>
        <div style={{ gridColumn: "span 3" }}><label style={lbl}>Notes</label><input style={inp} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} placeholder="e.g. settled quickly" /></div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={startSleep} style={{ ...btnP, background: "#9B7DC0", flex: 1 }}>😴 Start Sleep Timer</button>
        <button onClick={async () => { await saveUpdate(child.id, f); onSaved(child.id); }} style={btnS}>Log Without Timer</button>
      </div>
    </div>
  );
}

function FoodForm({ child, onSaved }) {
  const [f, setF] = useState({ type: "food", meal: "lunch", amount: "all", items: "", notes: "" });
  const save = async () => { await saveUpdate(child.id, { ...f, summary: `${f.meal} — ate ${f.amount}${f.items ? ` (${f.items})` : ""}` }); onSaved(child.id); };
  return (
    <div style={{ ...card, background: "#EDFAF3", marginBottom: 12 }}>
      <h4 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#6BA38B" }}>🍽️ Food Log</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div><label style={lbl}>Meal</label>
          <select style={inp} value={f.meal} onChange={e => setF(p => ({ ...p, meal: e.target.value }))}>
            {["breakfast","morning tea","lunch","afternoon tea","dinner","snack"].map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Amount Consumed</label>
          <select style={inp} value={f.amount} onChange={e => setF(p => ({ ...p, amount: e.target.value }))}>
            {[["all","All ✓"],["most","Most (3/4+)"],["some","Some (1/2)"],["little","A little"],["none","None ✗"],["extra","Extra — asked for more"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Items (optional)</label><input style={inp} value={f.items} onChange={e => setF(p => ({ ...p, items: e.target.value }))} placeholder="e.g. sandwich, fruit, milk" /></div>
        <div style={{ gridColumn: "span 3" }}><label style={lbl}>Notes</label><input style={inp} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} placeholder="e.g. refused vegetables, enjoyed pasta" /></div>
      </div>
      <button onClick={save} style={{ ...btnP, background: "#6BA38B" }}>Log Food</button>
    </div>
  );
}

function DiaperForm({ child, onSaved }) {
  const [f, setF] = useState({ type: "diaper", time: now(), content: "wet", rash: false, notes: "" });
  const save = async () => { await saveUpdate(child.id, { ...f, summary: `Diaper change — ${f.content}${f.rash ? " (nappy rash noted)" : ""}` }); onSaved(child.id); };
  return (
    <div style={{ ...card, background: "#FFF6E8", marginBottom: 12 }}>
      <h4 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#D4A26A" }}>👶 Diaper Change</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
        <div><label style={lbl}>Time</label><input type="time" style={inp} value={f.time} onChange={e => setF(p => ({ ...p, time: e.target.value }))} /></div>
        <div><label style={lbl}>Content</label>
          <select style={inp} value={f.content} onChange={e => setF(p => ({ ...p, content: e.target.value }))}>
            {[["wet","Wet 💧"],["soiled","Soiled 💩"],["both","Wet & Soiled"],["dry","Dry"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Notes</label><input style={inp} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: "#7A6E8A", display: "flex", gap: 5, cursor: "pointer" }}>
            <input type="checkbox" checked={f.rash} onChange={e => setF(p => ({ ...p, rash: e.target.checked }))} /> Nappy Rash
          </label>
          <button onClick={save} style={{ ...btnP, background: "#D4A26A" }}>Log</button>
        </div>
      </div>
    </div>
  );
}

function ToiletForm({ child, onSaved }) {
  const [f, setF] = useState({ type: "toilet", time: now(), result: "success", notes: "" });
  const save = async () => { await saveUpdate(child.id, { ...f, summary: `Toilet — ${f.result}` }); onSaved(child.id); };
  return (
    <div style={{ ...card, background: "#E8F4FF", marginBottom: 12 }}>
      <h4 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#5B8DB5" }}>🚽 Toilet</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
        <div><label style={lbl}>Time</label><input type="time" style={inp} value={f.time} onChange={e => setF(p => ({ ...p, time: e.target.value }))} /></div>
        <div><label style={lbl}>Result</label>
          <select style={inp} value={f.result} onChange={e => setF(p => ({ ...p, result: e.target.value }))}>
            {[["success","Success ✓"],["attempted","Attempted"],["accident","Accident"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Notes</label><input style={inp} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} /></div>
        <button onClick={save} style={{ ...btnP, background: "#5B8DB5", alignSelf: "flex-end" }}>Log</button>
      </div>
    </div>
  );
}

function SunscreenForm({ child, onSaved }) {
  const [f, setF] = useState({ type: "sunscreen", time: now(), spf: "SPF 50+", educator: "", notes: "" });
  const save = async () => { await saveUpdate(child.id, { ...f, summary: `Sunscreen applied — ${f.spf}` }); onSaved(child.id); };
  return (
    <div style={{ ...card, background: "#FFF3E0", marginBottom: 12 }}>
      <h4 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#E65100" }}>☀️ Sunscreen Applied</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
        <div><label style={lbl}>Time</label><input type="time" style={inp} value={f.time} onChange={e => setF(p => ({ ...p, time: e.target.value }))} /></div>
        <div><label style={lbl}>SPF</label>
          <select style={inp} value={f.spf} onChange={e => setF(p => ({ ...p, spf: e.target.value }))}>
            {["SPF 30","SPF 50","SPF 50+","SPF 50+ sport","Parent supplied"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Applied By</label><input style={inp} value={f.educator} onChange={e => setF(p => ({ ...p, educator: e.target.value }))} placeholder="Educator name" /></div>
        <button onClick={save} style={{ ...btnP, background: "#E65100", alignSelf: "flex-end" }}>Log</button>
      </div>
    </div>
  );
}

const BODY_PARTS = ["Head","Face","Neck","Shoulder L","Shoulder R","Chest","Back","Arm L","Arm R","Hand L","Hand R","Stomach","Hip L","Hip R","Leg L","Leg R","Knee L","Knee R","Foot L","Foot R"];

function IncidentForm({ child, onSaved }) {
  const [f, setF] = useState({
    type: "incident", time: now(), date: todayStr(), location: "", nature: "", injury_type: "bruise",
    action_taken: "", observed_by: "", doctor_involved: false, hospital_involved: false,
    affected_areas: [], notes: "", parent_notified: false, parent_notified_time: "",
  });

  const toggleArea = (area) => setF(p => ({ ...p, affected_areas: p.affected_areas.includes(area) ? p.affected_areas.filter(a => a !== area) : [...p.affected_areas, area] }));

  const save = async () => {
    await saveUpdate(child.id, { ...f, summary: `${f.injury_type} at ${f.location} — ${f.action_taken}` });
    // Also log to child event log
    await API(`/api/children/${child.id}/events`, { method: "POST", body: { event_type: "incident", description: `Incident: ${f.nature || f.injury_type} at ${f.location}`, details: f } }).catch(() => {});
    onSaved(child.id);
  };

  return (
    <div style={{ ...card, background: "#FFEBEE", border: "2px solid #FFCDD2", marginBottom: 12 }}>
      <h4 style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#B71C1C" }}>🩹 Incident / Injury Report</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div><label style={lbl}>Date</label><DatePicker value={f.date||""} onChange={v=>setF(p=>({...p,date:v}))} /></div>
        <div><label style={lbl}>Time</label><input type="time" style={inp} value={f.time} onChange={e => setF(p => ({ ...p, time: e.target.value }))} /></div>
        <div><label style={lbl}>Location at Centre</label><input style={inp} value={f.location} onChange={e => setF(p => ({ ...p, location: e.target.value }))} placeholder="e.g. playground, hallway" /></div>
        <div><label style={lbl}>Nature of Incident</label><input style={inp} value={f.nature} onChange={e => setF(p => ({ ...p, nature: e.target.value }))} placeholder="e.g. fell from climbing frame" /></div>
        <div><label style={lbl}>Injury Type</label>
          <select style={inp} value={f.injury_type} onChange={e => setF(p => ({ ...p, injury_type: e.target.value }))}>
            {["bruise","graze","cut","bump/lump","bite","sting","burn","sprain","fracture suspected","illness","none visible","other"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Action Taken</label><input style={inp} value={f.action_taken} onChange={e => setF(p => ({ ...p, action_taken: e.target.value }))} placeholder="e.g. ice pack, cleaned wound" /></div>
        <div><label style={lbl}>Observed By</label><input style={inp} value={f.observed_by} onChange={e => setF(p => ({ ...p, observed_by: e.target.value }))} /></div>
        <div style={{ gridColumn: "span 3" }}><label style={lbl}>Notes / Details</label><textarea style={{ ...inp, height: 50, resize: "none" }} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} /></div>
      </div>

      {/* Affected areas */}
      <div style={{ marginBottom: 10 }}>
        <label style={lbl}>Affected Body Areas</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {BODY_PARTS.map(bp => (
            <button key={bp} onClick={() => toggleArea(bp)}
              style={{ padding: "4px 10px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11, fontWeight: f.affected_areas.includes(bp) ? 700 : 400,
                background: f.affected_areas.includes(bp) ? "#B71C1C" : "#F5F5F5", color: f.affected_areas.includes(bp) ? "#fff" : "#555" }}>
              {bp}
            </button>
          ))}
        </div>
      </div>

      {/* Checkboxes */}
      <div style={{ display: "flex", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
        {[["doctor_involved","Doctor involved"],["hospital_involved","Hospital involved"],["parent_notified","Parent notified"]].map(([k, l]) => (
          <label key={k} style={{ fontSize: 11, display: "flex", gap: 6, cursor: "pointer", alignItems: "center" }}>
            <input type="checkbox" checked={!!f[k]} onChange={e => setF(p => ({ ...p, [k]: e.target.checked }))} />{l}
          </label>
        ))}
        {f.parent_notified && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <label style={lbl}>Notified at:</label>
            <input type="time" style={{ ...inp, width: 100 }} value={f.parent_notified_time} onChange={e => setF(p => ({ ...p, parent_notified_time: e.target.value }))} />
          </div>
        )}
      </div>

      <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(183,28,28,0.06)", border: "1px solid rgba(183,28,28,0.15)", fontSize: 11, color: "#B71C1C", marginBottom: 10 }}>
        ⚠ This incident report is added to the child's permanent audit log and visible to management.
      </div>

      <button onClick={save} style={{ ...btnP, background: "#B71C1C" }}>Submit Incident Report</button>
    </div>
  );
}

function OtherForm({ child, onSaved }) {
  const [f, setF] = useState({ type: "other", time: now(), category: "observation", notes: "" });
  const save = async () => { await saveUpdate(child.id, { ...f, summary: `${f.category}: ${f.notes}` }); onSaved(child.id); };
  return (
    <div style={{ ...card, background: "#F8F5F1", marginBottom: 12 }}>
      <h4 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#8A7F96" }}>📝 Other Entry</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
        <div><label style={lbl}>Time</label><input type="time" style={inp} value={f.time} onChange={e => setF(p => ({ ...p, time: e.target.value }))} /></div>
        <div><label style={lbl}>Category</label>
          <select style={inp} value={f.category} onChange={e => setF(p => ({ ...p, category: e.target.value }))}>
            {["observation","mood note","medication given","special note","parent communication","other"].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Details</label><input style={inp} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} placeholder="Enter details..." /></div>
        <button onClick={save} style={{ ...btnP, alignSelf: "flex-end" }}>Log</button>
      </div>
    </div>
  );
}
