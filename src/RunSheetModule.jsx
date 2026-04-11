import { useState, useEffect, useCallback, useRef } from "react";
import DatePicker from "./DatePicker.jsx";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}) },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};

const ANTHROPIC_API = async (prompt) => {
  const key = localStorage.getItem("c360_anthropic_key");
  if (!key) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const d = await r.json();
    return d.content?.[0]?.text || null;
  } catch(e) { return null; }
};

const toast = (msg, type = "success") => { if (window.showToast) window.showToast(msg, type); };
const purple = "#8B6DAF", lp = "#F0EBF8";
const fmtDate = d => d ? new Date(d + "T00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
const ageLabel = dob => { if (!dob) return ""; const m = Math.floor((new Date() - new Date(dob)) / (1000 * 60 * 60 * 24 * 30.44)); return m < 24 ? `${m}mo` : `${Math.floor(m/12)}y ${m%12}mo`; };

const MOODS = [
  { v: "great",   emoji: "😄", label: "Great",   color: "#2E7D32" },
  { v: "happy",   emoji: "🙂", label: "Happy",   color: "#558B2F" },
  { v: "okay",    emoji: "😐", label: "Okay",    color: "#F9A825" },
  { v: "unsettled", emoji: "😕", label: "Unsettled", color: "#E65100" },
  { v: "upset",   emoji: "😢", label: "Upset",   color: "#B71C1C" },
];

const ACTIVITY_TEMPLATES = [
  "Circle time / morning meeting",
  "Outdoor play / nature exploration",
  "Sensory play",
  "Arts & crafts",
  "Music & movement",
  "Story time / reading",
  "Dramatic play / home corner",
  "Construction / building blocks",
  "Fine motor activities",
  "Science / discovery table",
  "Gross motor / physical play",
  "Rest / sleep time",
  "Meal time observation",
  "Toileting / nappy change",
  "Transition activities",
  "Small group learning",
  "Individual focus time",
  "Community / incursion",
];

const SUGGESTED_OBSERVATIONS = [
  "Demonstrated persistence when faced with a challenge",
  "Initiated play with peers independently",
  "Used language to express needs and feelings",
  "Showed curiosity and asked questions",
  "Demonstrated fine motor development",
  "Engaged in cooperative play",
  "Showed understanding of routines",
  "Demonstrated emerging literacy skills",
  "Showed creativity and imagination",
  "Displayed leadership within the group",
  "Required additional support today",
  "Reached a developmental milestone",
];

const card = { background: "#fff", borderRadius: 12, border: "1px solid #EDE8F4", padding: "16px 20px", marginBottom: 16 };
const inp = { padding: "8px 12px", borderRadius: 8, border: "1px solid #D9D0C7", fontSize: 12, width: "100%", boxSizing: "border-box", fontFamily: "inherit" };
const lbl = { fontSize: 10, color: "#8A7F96", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 };
const btnP = { background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "inherit" };
const btnS = { background: lp, color: purple, border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontWeight: 600, fontSize: 12, fontFamily: "inherit" };

export default function RunSheetModule() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [view, setView] = useState("rooms"); // "rooms" = legacy activity sheets, "live" = intelligent live view
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [expandedChild, setExpandedChild] = useState(null);
  const [saving, setSaving] = useState({});
  const [sheetIds, setSheetIds] = useState({});
  const [childData, setChildData] = useState({});
  const [printMode, setPrintMode] = useState(false);
  const [aiLoading, setAiLoading] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await API(`/api/runsheet?date=${date}`);
      if (Array.isArray(d)) {
        setData(d);
        if (d.length && !selectedRoom) setSelectedRoom(d[0].room.id);
        // Cache sheet ids
        const ids = {};
        d.forEach(r => { if (r.sheet) ids[r.room.id] = r.sheet.id; });
        setSheetIds(ids);
        // Build child data cache from API response
        const cd = {};
        d.forEach(r => r.children.forEach(c => {
          cd[c.id] = {
            attended: c.attended, mood: c.mood || "", observations: c.observations || "",
            learning_highlights: c.learning_highlights || "", educator_notes: c.educator_notes || "",
            activities_completed: c.activities_completed || [],
          };
        }));
        setChildData(cd);
      }
    } catch(e) { toast("Failed to load run sheets", "error"); }
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const ensureSheet = async (roomId) => {
    if (sheetIds[roomId]) return sheetIds[roomId];
    const r = await API("/api/runsheet", { method: "POST", body: { room_id: roomId, date } });
    if (r.id) { setSheetIds(prev => ({ ...prev, [roomId]: r.id })); return r.id; }
    return null;
  };

  const aiSuggest = async (child, cd) => {
    const key = localStorage.getItem("c360_anthropic_key");
    if (!key) { toast("Add your Anthropic API key in Settings → Integrations to use AI suggestions", "error"); return; }
    setAiLoading(p => ({ ...p, [child.id]: true }));
    const ageStr = ageLabel(child.dob);
    const lastObs = child.last_observation ? `Last observation: "${child.last_observation.slice(0,200)}"` : "No previous observations.";
    const activities = (cd.activities_completed || []).join(", ") || "none recorded yet";
    const prompt = `You are an early childhood educator assistant for an Australian childcare centre.

Child: ${child.first_name}, aged ${ageStr}
Today's activities completed: ${activities}
${lastObs}
${child.recent_outcomes ? `Recent EYLF outcomes: ${child.recent_outcomes}` : ""}
${child.allergies && child.allergies !== "None" ? `Allergies: ${child.allergies}` : ""}
${child.medical_notes ? `Medical notes: ${child.medical_notes}` : ""}

Write a brief, professional observation note (2-3 sentences) suitable for a daily run sheet. Then suggest one specific next-step activity for tomorrow based on their interests and age. Format as:
OBSERVATION: [2-3 sentence observation]
NEXT STEP: [one specific activity suggestion]

Use Australian early childhood education language aligned with EYLF principles.`;
    try {
      const result = await ANTHROPIC_API(prompt);
      if (result) {
        const obsMatch = result.match(/OBSERVATION:\s*(.+?)(?=NEXT STEP:|$)/s);
        const nextMatch = result.match(/NEXT STEP:\s*(.+)/s);
        const obs = obsMatch?.[1]?.trim();
        const next = nextMatch?.[1]?.trim();
        if (obs) updateChild(child.id, "observations", obs);
        if (next) updateChild(child.id, "learning_highlights", next);
        toast("AI suggestions generated ✨");
      } else {
        toast("Could not generate suggestions", "error");
      }
    } catch(e) { toast("AI request failed", "error"); }
    setAiLoading(p => ({ ...p, [child.id]: false }));
  };

  const saveChild = async (roomId, childId) => {
    setSaving(p => ({ ...p, [childId]: true }));
    try {
      const sid = await ensureSheet(roomId);
      if (!sid) { toast("Could not create run sheet", "error"); return; }
      const cd = childData[childId] || {};
      await API(`/api/runsheet/child/${childId}`, {
        method: "PUT",
        body: { run_sheet_id: sid, ...cd },
      });
      toast("Saved");
    } catch(e) { toast("Save failed", "error"); }
    setSaving(p => ({ ...p, [childId]: false }));
  };

  const updateChild = (childId, field, val) => {
    setChildData(p => ({ ...p, [childId]: { ...(p[childId] || {}), [field]: val } }));
  };

  const toggleActivity = (childId, act) => {
    const cur = childData[childId]?.activities_completed || [];
    const next = cur.includes(act) ? cur.filter(a => a !== act) : [...cur, act];
    updateChild(childId, "activities_completed", next);
  };

  const roomData = data.find(r => r.room.id === selectedRoom);
  const totalPresent = roomData?.children.filter(c => childData[c.id]?.attended).length || 0;

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, flexDirection: "column", gap: 12 }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${lp}`, borderTop: `3px solid ${purple}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ color: "#8A7F96", fontSize: 13 }}>Loading run sheets…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #EDE8F4", background: "#fff", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, color: "#3D3248", fontSize: 18 }}>📋 Daily Run Sheets</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8A7F96" }}>Learning records, activity tracking &amp; educator notes</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
            <div style={{ display: "flex", border: "1px solid #D9D0C7", borderRadius: 8, overflow: "hidden" }}>
              <button onClick={() => setView("rooms")}
                style={{ padding: "7px 14px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                  background: view === "rooms" ? purple : "#fff", color: view === "rooms" ? "#fff" : "#5C4E6A" }}>
                📋 Activity Sheets
              </button>
              <button onClick={() => setView("live")}
                style={{ padding: "7px 14px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                  background: view === "live" ? purple : "#fff", color: view === "live" ? "#fff" : "#5C4E6A" }}>
                ⚡ Live Intelligence
              </button>
            </div>
            <DatePicker value={date} onChange={v => setDate(v)} max={new Date().toISOString().slice(0,10)} />
            {view === "rooms" && <button onClick={() => setPrintMode(!printMode)} style={btnS}>
              {printMode ? "📋 Normal View" : "🖨 Print View"}
            </button>}
            <button onClick={load} style={btnS}>↻ Refresh</button>
          </div>
        </div>
      </div>

      {view === "live" && <LiveRunSheet date={date} />}

      {/* Room tabs */}
      {view === "rooms" && <div style={{ padding: "8px 24px", borderBottom: "1px solid #EDE8F4", display: "flex", gap: 4, flexShrink: 0, overflowX: "auto", background: "#FDFBF9" }}>
        {data.map(r => {
          const present = r.children.filter(c => childData[c.id]?.attended).length;
          return (
            <button key={r.room.id} onClick={() => setSelectedRoom(r.room.id)}
              style={{ padding: "7px 16px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontSize: 12, fontWeight: selectedRoom === r.room.id ? 700 : 500, whiteSpace: "nowrap",
                background: selectedRoom === r.room.id ? lp : "transparent", color: selectedRoom === r.room.id ? purple : "#6B5F7A",
                borderBottom: selectedRoom === r.room.id ? `2px solid ${purple}` : "2px solid transparent" }}>
              {r.room.name} {r.children.length > 0 && <span style={{ fontSize: 10, color: "#8A7F96" }}>({present}/{r.children.length})</span>}
            </button>
          );
        })}
      </div>}

      {/* Main content */}
      {view === "rooms" && <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {!roomData ? (
          <div style={{ textAlign: "center", padding: 60, color: "#8A7F96" }}>Select a room to view its run sheet</div>
        ) : (
          <>
            {/* Room summary */}
            <div style={{ ...card, background: `${purple}08`, border: `1px solid ${purple}25`, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, color: "#3D3248", fontSize: 16 }}>{roomData.room.name} — {fmtDate(date)}</h3>
                  <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 4 }}>{roomData.room.group_label} · 1:{roomData.room.ratio} ratio · {roomData.children.length} enrolled</div>
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  {[
                    ["Present", totalPresent, "#2E7D32"],
                    ["Enrolled", roomData.children.length, purple],
                    ["Absent", roomData.children.filter(c => !childData[c.id]?.attended).length, "#E65100"],
                  ].map(([l, v, c]) => (
                    <div key={l} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: c }}>{v}</div>
                      <div style={{ fontSize: 10, color: "#8A7F96" }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Children */}
            {roomData.children.length === 0 ? (
              <div style={{ ...card, textAlign: "center", padding: 48, color: "#8A7F96" }}>No children enrolled in {roomData.room.name}</div>
            ) : roomData.children.map(child => {
              const cd = childData[child.id] || {};
              const isExpanded = expandedChild === child.id;
              const hasAllergy = child.allergies && child.allergies !== "None";
              const hasMedical = child.medical_notes || child.condition_type;
              const isPresent = !!cd.attended;

              return (
                <div key={child.id} style={{ ...card, border: `1px solid ${isPresent ? "#A5D6A7" : "#EDE8F4"}`, marginBottom: 12 }}>
                  {/* Child row header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {/* Avatar */}
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: lp, overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {child.photo_url
                        ? <img src={child.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <span style={{ fontWeight: 800, color: purple, fontSize: 16 }}>{child.first_name[0]}</span>}
                    </div>

                    {/* Name + age + flags */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "#3D3248" }}>{child.first_name} {child.last_name}</span>
                        <span style={{ fontSize: 11, color: "#8A7F96" }}>{ageLabel(child.dob)}</span>
                        {hasAllergy && <span style={{ fontSize: 10, fontWeight: 700, color: "#B71C1C", background: "#FFEBEE", padding: "2px 8px", borderRadius: 20 }}>⚠ {child.allergies}</span>}
                        {hasMedical && <span style={{ fontSize: 10, fontWeight: 700, color: "#E65100", background: "#FFF3E0", padding: "2px 8px", borderRadius: 20 }}>🏥 Medical</span>}
                        {cd.mood && <span style={{ fontSize: 13 }}>{MOODS.find(m => m.v === cd.mood)?.emoji}</span>}
                      </div>
                      {/* Alert banners */}
                      {hasAllergy && (
                        <div style={{ fontSize: 11, color: "#B71C1C", marginTop: 3 }}>Allergy: {child.allergies}</div>
                      )}
                      {child.medical_plan_notes && (
                        <div style={{ fontSize: 11, color: "#E65100", marginTop: 2 }}>Medical: {child.medical_plan_notes}</div>
                      )}
                    </div>

                    {/* Attendance toggle */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, color: isPresent ? "#2E7D32" : "#8A7F96" }}>
                        <div onClick={() => updateChild(child.id, "attended", !cd.attended)}
                          style={{ width: 40, height: 22, borderRadius: 11, background: isPresent ? "#6BA38B" : "#DDD", position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
                          <div style={{ position: "absolute", top: 3, left: isPresent ? 20 : 3, width: 16, height: 16, borderRadius: 8, background: "#fff", transition: "left 0.2s" }} />
                        </div>
                        {isPresent ? "Present" : "Absent"}
                      </label>
                      <button onClick={() => setExpandedChild(isExpanded ? null : child.id)}
                        style={{ padding: "5px 12px", background: isExpanded ? lp : "#F8F5F1", border: "1px solid #EDE8F4", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: isExpanded ? purple : "#555" }}>
                        {isExpanded ? "▲ Less" : "▼ Details"}
                      </button>
                      {isExpanded && (
                        <>
                        <button onClick={() => aiSuggest(child, cd)} disabled={aiLoading[child.id]}
                          style={{ padding: "5px 12px", background: aiLoading[child.id] ? "#EDE8F4" : "linear-gradient(135deg,#7C3AED,#8B6DAF)", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", opacity: aiLoading[child.id] ? 0.7 : 1 }}>
                          {aiLoading[child.id] ? "Thinking…" : "✨ AI Suggest"}
                        </button>
                        <button onClick={() => saveChild(roomData.room.id, child.id)} disabled={saving[child.id]}
                          style={{ ...btnP, padding: "5px 14px", opacity: saving[child.id] ? 0.6 : 1 }}>
                          {saving[child.id] ? "Saving…" : "Save"}
                        </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #EDE8F4" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        {/* Left column */}
                        <div>
                          {/* Mood */}
                          <div style={{ marginBottom: 14 }}>
                            <label style={lbl}>Mood today</label>
                            <div style={{ display: "flex", gap: 6 }}>
                              {MOODS.map(m => (
                                <button key={m.v} onClick={() => updateChild(child.id, "mood", m.v)}
                                  style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: `2px solid ${cd.mood === m.v ? m.color : "#EDE8F4"}`, background: cd.mood === m.v ? m.color + "20" : "#FDFBF9", cursor: "pointer", fontSize: 18, transition: "all 0.15s" }}
                                  title={m.label}>
                                  {m.emoji}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Observations */}
                          <div style={{ marginBottom: 14 }}>
                            <label style={lbl}>Observations</label>
                            <textarea value={cd.observations || ""} onChange={e => updateChild(child.id, "observations", e.target.value)}
                              rows={3} placeholder="What did you observe this child doing today?"
                              style={{ ...inp, height: "auto", resize: "vertical", lineHeight: 1.6 }} />
                            {/* Quick inserts */}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                              {SUGGESTED_OBSERVATIONS.slice(0, 6).map(s => (
                                <button key={s} onClick={() => updateChild(child.id, "observations", (cd.observations ? cd.observations + "\n• " : "• ") + s)}
                                  style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, border: "1px solid #DDD6EE", background: "#F8F5FC", cursor: "pointer", color: "#5C4E6A" }}>
                                  + {s.slice(0, 28)}…
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Learning highlights */}
                          <div style={{ marginBottom: 14 }}>
                            <label style={lbl}>Learning Highlights</label>
                            <textarea value={cd.learning_highlights || ""} onChange={e => updateChild(child.id, "learning_highlights", e.target.value)}
                              rows={2} placeholder="Key learning moments, EYLF connections, next steps…"
                              style={{ ...inp, height: "auto", resize: "vertical", lineHeight: 1.6 }} />
                          </div>

                          {/* Educator notes */}
                          <div>
                            <label style={lbl}>Educator Notes <span style={{ color: "#A89DB5", fontWeight: 400 }}>(internal)</span></label>
                            <textarea value={cd.educator_notes || ""} onChange={e => updateChild(child.id, "educator_notes", e.target.value)}
                              rows={2} placeholder="Any behaviour, aggression, welfare concerns, or notes for handover…"
                              style={{ ...inp, height: "auto", resize: "vertical", lineHeight: 1.6 }} />
                          </div>
                        </div>

                        {/* Right column — Activities */}
                        <div>
                          {/* Previous learning context */}
                          {child.last_observation && (
                            <div style={{ background: "#F8F5FC", borderRadius: 10, padding: "10px 14px", marginBottom: 14, border: "1px solid #DDD6EE" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: purple, textTransform: "uppercase", marginBottom: 4 }}>📚 Last Observation ({child.last_obs_date?.slice(0,10)})</div>
                              <div style={{ fontSize: 12, color: "#3D3248", lineHeight: 1.6 }}>{child.last_observation.slice(0, 200)}{child.last_observation.length > 200 ? "…" : ""}</div>
                              {child.recent_outcomes && <div style={{ fontSize: 10, color: "#8A7F96", marginTop: 4 }}>EYLF: {child.recent_outcomes}</div>}
                            </div>
                          )}

                          {/* Activities checklist */}
                          <div>
                            <label style={lbl}>Activities Completed</label>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                              {ACTIVITY_TEMPLATES.map(act => {
                                const checked = (cd.activities_completed || []).includes(act);
                                return (
                                  <label key={act} onClick={() => toggleActivity(child.id, act)}
                                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 7, border: `1px solid ${checked ? purple : "#EDE8F4"}`, background: checked ? lp : "#FDFBF9", cursor: "pointer", fontSize: 11, userSelect: "none", transition: "all 0.15s" }}>
                                    <div style={{ width: 14, height: 14, borderRadius: 4, border: `2px solid ${checked ? purple : "#C5B8E0"}`, background: checked ? purple : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      {checked && <span style={{ color: "#fff", fontSize: 9, lineHeight: 1 }}>✓</span>}
                                    </div>
                                    <span style={{ color: checked ? "#3D3248" : "#6B5F7A" }}>{act}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>

                          {/* Suggested next steps based on last learning */}
                          {child.last_observation && (
                            <div style={{ marginTop: 12, background: "#FFF8E1", borderRadius: 10, padding: "10px 14px", border: "1px solid #FFE082" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#E65100", textTransform: "uppercase", marginBottom: 4 }}>💡 Suggested Focus</div>
                              <div style={{ fontSize: 11, color: "#555", lineHeight: 1.6 }}>
                                Based on previous observations, consider: extending their current interests, documenting any new skills, or planning an activity that builds on their last learning highlight.
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Save all button */}
            {roomData.children.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button onClick={async () => {
                  const sid = await ensureSheet(roomData.room.id);
                  if (!sid) return;
                  for (const child of roomData.children) {
                    await API(`/api/runsheet/child/${child.id}`, { // catch: .catch(e=>console.error('API error:',e))
                      method: "PUT",
                      body: { run_sheet_id: sid, ...(childData[child.id] || {}) },
                    });
                  }
                  toast(`Run sheet saved for ${roomData.room.name}`);
                }} style={btnP}>
                  💾 Save All — {roomData.room.name}
                </button>
              </div>
            )}
          </>
        )}
      </div>}
    </div>
  );
}

// ─── Live Intelligent Run Sheet ────────────────────────────────────────────
// Real-time view: who is on duty, who's signed in, ratio status,
// AI optimisation suggestions. Polls /api/runsheet-live/live every 30s.
function LiveRunSheet({ date }) {
  const [state, setState] = useState(null);
  const [savings, setSavings] = useState(null);
  const [acting, setActing] = useState({});

  const load = useCallback(async () => {
    try {
      const [s, sv] = await Promise.all([
        API(`/api/runsheet-live/live?date=${date}`),
        API(`/api/runsheet-live/cost-savings?days=30`),
      ]);
      if (s && !s.error) setState(s);
      if (sv && !sv.error) setSavings(sv);
    } catch (e) { /* non-fatal */ }
  }, [date]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const accept = async (suggestionId) => {
    setActing(p => ({ ...p, [suggestionId]: true }));
    try {
      const r = await API(`/api/runsheet-live/suggestions/${suggestionId}/accept`, { method: "POST" });
      if (r.error) toast(r.error, "error");
      else { toast("Suggestion applied"); load(); }
    } catch (e) { toast("Action failed", "error"); }
    setActing(p => ({ ...p, [suggestionId]: false }));
  };

  const dismiss = async (suggestionId) => {
    setActing(p => ({ ...p, [suggestionId]: true }));
    try {
      await API(`/api/runsheet-live/suggestions/${suggestionId}/dismiss`, { method: "POST" });
      load();
    } catch (e) { /* non-fatal */ }
    setActing(p => ({ ...p, [suggestionId]: false }));
  };

  if (!state) return <div style={{ flex: 1, textAlign: "center", padding: 60, color: "#8A7F96" }}>Loading live state…</div>;

  const statusColor = state.compliance_status === "breach" ? "#B71C1C"
    : state.compliance_status === "overstaffed" ? "#E65100" : "#2E7D32";
  const statusBg = state.compliance_status === "breach" ? "#FFEBEE"
    : state.compliance_status === "overstaffed" ? "#FFF3E0" : "#E8F5E9";
  const statusLabel = state.compliance_status === "breach" ? "⚠ Ratio Breach"
    : state.compliance_status === "overstaffed" ? "⚡ Overstaffed" : "✅ Optimal";

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
      {/* ── Top KPI strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12, marginBottom: 16 }}>
        {[
          ["Children Present", state.children_present, "#3D3248"],
          ["Educators On Duty", state.educators_on_duty, "#3D3248"],
          ["Required", state.required_educators, "#5C4E6A"],
          ["Spare", state.spare_educators, state.spare_educators > 0 ? "#E65100" : "#2E7D32"],
          ["ECT", `${state.ect_on_duty}/${state.ect_required}`, state.ect_compliant ? "#2E7D32" : "#B71C1C"],
          ["Status", statusLabel, statusColor],
        ].map(([l, v, c]) => (
          <div key={l} style={{ ...card, marginBottom: 0, textAlign: "center", padding: "16px 12px",
            background: l === "Status" ? statusBg : "#fff" }}>
            <div style={{ fontSize: l === "Status" ? 13 : 26, fontWeight: 800, color: c, lineHeight: 1.2 }}>{v}</div>
            <div style={{ fontSize: 10, color: "#8A7F96", marginTop: 6, fontWeight: 600, textTransform: "uppercase" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* ── 30-day savings banner ── */}
      {savings && savings.total_savings_dollars > 0 && (
        <div style={{ ...card, background: "linear-gradient(135deg,#E8F5E9,#F1F8E9)", border: "1px solid #C8E6C9", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, color: "#558B2F", fontWeight: 700, textTransform: "uppercase" }}>30-Day Optimisation Savings</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#2E7D32", marginTop: 4 }}>${savings.total_savings_dollars.toLocaleString()}</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 11, color: "#558B2F" }}>
              {savings.total_suggestions_accepted} suggestion{savings.total_suggestions_accepted !== 1 ? "s" : ""} accepted
            </div>
          </div>
        </div>
      )}

      {/* ── Suggestions ── */}
      <div style={{ ...card }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#3D3248" }}>
          🧠 Intelligent Suggestions {state.suggestions.length > 0 && <span style={{ background: lp, color: purple, fontSize: 11, padding: "2px 8px", borderRadius: 10, marginLeft: 6 }}>{state.suggestions.length}</span>}
        </h3>
        {state.suggestions.length === 0 && <div style={{ color: "#8A7F96", fontSize: 12, padding: 12 }}>No suggestions right now — service is running optimally.</div>}
        {state.suggestions.map(s => {
          const isWarning = s.suggestion_type === "ratio_breach_warning";
          return (
            <div key={s.id} style={{
              padding: 14, marginBottom: 8, borderRadius: 10,
              background: isWarning ? "#FFEBEE" : "#FDFBF9",
              border: isWarning ? "1px solid #FFCDD2" : "1px solid #EDE8F4",
              display: "flex", gap: 12, alignItems: "flex-start",
            }}>
              <div style={{ fontSize: 22 }}>{
                isWarning ? "⚠" : s.suggestion_type === "move_to_nc" ? "📚"
                  : s.suggestion_type === "move_to_room" ? "🔄"
                  : s.suggestion_type === "lunch_cover" ? "🥪" : "💡"
              }</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#3D3248", lineHeight: 1.5 }}>{s.reason}</div>
                {s.estimated_saving_cents > 0 && (
                  <div style={{ fontSize: 11, color: "#2E7D32", marginTop: 4, fontWeight: 700 }}>
                    Est. value: ${(s.estimated_saving_cents / 100).toFixed(2)}
                  </div>
                )}
              </div>
              {!isWarning && (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => accept(s.id)} disabled={acting[s.id]}
                    style={{ ...btnP, padding: "6px 12px", fontSize: 11, opacity: acting[s.id] ? 0.5 : 1 }}>
                    {s.action_label || "Accept"}
                  </button>
                  <button onClick={() => dismiss(s.id)} disabled={acting[s.id]}
                    style={{ ...btnS, padding: "6px 12px", fontSize: 11, opacity: acting[s.id] ? 0.5 : 1 }}>
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Room breakdown ── */}
      <div style={{ ...card }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#3D3248" }}>Rooms — Current Status</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
          {state.by_room.map(r => (
            <div key={r.id} style={{
              padding: 14, borderRadius: 10,
              background: r.compliant ? "#F1F8E9" : "#FFEBEE",
              border: `1px solid ${r.compliant ? "#C8E6C9" : "#FFCDD2"}`,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#3D3248", marginBottom: 4 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: "#5C4E6A" }}>
                {r.children_present} children · {r.educators_on_duty}/{r.min_required} educators
              </div>
              <div style={{ fontSize: 11, color: r.compliant ? "#2E7D32" : "#B71C1C", marginTop: 4, fontWeight: 700 }}>
                {r.compliant ? "✅ Compliant" : "⚠ Below ratio"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── NC pending ── */}
      {state.nc_pending_educators.length > 0 && (
        <div style={{ ...card }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#3D3248" }}>📚 Non-Contact Time Owed This Week</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8 }}>
            {state.nc_pending_educators.map(e => (
              <div key={e.id} style={{ padding: "10px 14px", background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 8, fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: "#3D3248" }}>{e.name}</div>
                <div style={{ color: "#E65100", fontSize: 11, marginTop: 2 }}>Owed {e.hours_owed}hrs</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
