// ─── NQF LEARNING & DEVELOPMENT MODULE ──────────────────────────────────────────
// EYLF V2.0 / MTOP V2.0 Aligned — Child Profiles, AI-Guided Planning Wizard,
// Daily Observations & Progress Tracking
// ────────────────────────────────────────────────────────────────────────────────
import { useState, useMemo, useCallback, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { EYLF_OUTCOMES, MTOP_OUTCOMES, DEV_DOMAINS, SKILL_LEVELS, OBSERVATION_TYPES, REFLECTION_PROMPTS, ACTIVITY_BANK, NQS_AREAS } from "./nqf-data.js";
import DatePicker from "./DatePicker.jsx";

// ─── SHARED STYLES ──────────────────────────────────────────────────────────────
const card = { background: "#FFFFFF", borderRadius: 14, padding: 20, border: "1px solid #E8E0D8", boxShadow: "0 2px 12px rgba(80,60,90,0.04)", transition: "all 0.25s ease" };
const cardSm = { ...card, padding: 14 };
const btnPrimary = { background: "linear-gradient(135deg, #8B6DAF, #9B7DC0)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, boxShadow: "0 3px 10px rgba(139,109,175,0.2)", transition: "all 0.2s ease" };
const btnSecondary = { background: "#F8F5F1", color: "#5C4E6A", border: "1px solid #D9D0C7", borderRadius: 10, padding: "10px 18px", cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all 0.2s ease" };
const btnGhost = { background: "transparent", color: "#A88BC7", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, padding: "6px 10px" };
const inputStyle = { background: "#F8F5F1", border: "1px solid #D9D0C7", borderRadius: 8, padding: "10px 12px", color: "#3D3248", fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none" };
const selectStyle = { ...inputStyle, cursor: "pointer" };
const labelStyle = { display: "block", fontSize: 11, color: "#8A7F96", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" };
const tagStyle = (color) => ({ display: "inline-flex", alignItems: "center", gap: 4, background: color + "18", color: color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 });

// ─── UTILITIES ──────────────────────────────────────────────────────────────────
const ageFromDob = (dob) => {
  const d = new Date(dob), now = new Date();
  const months = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
  return months >= 24 ? `${Math.floor(months / 12)}y ${months % 12}m` : `${months}m`;
};
const ageMonths = (dob) => {
  const d = new Date(dob), now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
};
const ageGroupFromRoom = (roomId, rooms) => {
  const room = rooms.find(r => r.id === roomId);
  if (!room) return "toddlers";
  if (room.ageGroup === "babies") return "babies";
  if (room.ageGroup === "oshc") return "preschool";
  return room.ageGroup;
};
const getSkillLevel = (level) => SKILL_LEVELS.find(s => s.id === level) || SKILL_LEVELS[0];
const getDomain = (id) => DEV_DOMAINS.find(d => d.id === id);
const getOutcome = (subId) => {
  for (const o of EYLF_OUTCOMES) {
    const sub = o.subOutcomes.find(s => s.id === subId);
    if (sub) return { ...sub, parent: o };
  }
  return null;
};
const todayStr = () => new Date().toISOString().split("T")[0];

// ─── MINI RADAR CHART ───────────────────────────────────────────────────────────
const MiniRadar = ({ domains, size = 120 }) => {
  const data = DEV_DOMAINS.map(d => ({ domain: d.icon, value: domains[d.id] || 0, fullMark: 5 }));
  return (
    <ResponsiveContainer width={size} height={size}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke="#D9D0C7" />
        <PolarAngleAxis dataKey="domain" tick={{ fontSize: 12 }} />
        <Radar dataKey="value" stroke="#9B7DC0" fill="#9B7DC0" fillOpacity={0.25} />
      </RadarChart>
    </ResponsiveContainer>
  );
};

// ─── SKILL BADGE ────────────────────────────────────────────────────────────────
const SkillBadge = ({ level, small }) => {
  const sk = getSkillLevel(level);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: sk.color + "18", color: sk.color,
      borderRadius: 20, padding: small ? "2px 8px" : "3px 10px",
      fontSize: small ? 10 : 11, fontWeight: 600,
    }}>
      <span style={{ width: small ? 5 : 6, height: small ? 5 : 6, borderRadius: "50%", background: sk.color }} />
      {sk.label}
    </span>
  );
};

// ─── PROGRESS BAR ───────────────────────────────────────────────────────────────
const ProgressBar = ({ value, max = 5, color = "#9B7DC0", height = 6 }) => (
  <div style={{ background: "#F8F5F1", borderRadius: height, height, width: "100%", overflow: "hidden" }}>
    <div style={{ background: color, height: "100%", width: `${(value / max) * 100}%`, borderRadius: height, transition: "width 0.3s" }} />
  </div>
);


// ═══════════════════════════════════════════════════════════════════════════════
// ██  CHILDREN VIEW — Child Profiles & Developmental Tracking
// ═══════════════════════════════════════════════════════════════════════════════
export function ChildrenView({ children, setChildren, rooms, observations }) {
  const [selectedChild, setSelectedChild] = useState(null);
  const [filterRoom, setFilterRoom] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editDomains, setEditDomains] = useState({});
  const [editGoals, setEditGoals] = useState([]);
  const [editNotes, setEditNotes] = useState("");
  const [newGoal, setNewGoal] = useState("");

  const filtered = useMemo(() => {
    return children.filter(c => {
      if (filterRoom !== "all" && c.roomId !== parseInt(filterRoom)) return false;
      if (searchTerm && !`${c.firstName} ${c.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [children, filterRoom, searchTerm]);

  const childObs = useMemo(() => {
    if (!selectedChild) return [];
    return observations.filter(o => o.childId === selectedChild.id).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [selectedChild, observations]);

  const startEdit = (child) => {
    setEditMode(true);
    setEditDomains({ ...child.domains });
    setEditGoals([...child.learningGoals]);
    setEditNotes(child.notes);
  };

  const saveEdit = () => {
    setChildren(prev => prev.map(c => c.id === selectedChild.id ? { ...c, domains: editDomains, learningGoals: editGoals, notes: editNotes } : c));
    setSelectedChild(prev => ({ ...prev, domains: editDomains, learningGoals: editGoals, notes: editNotes }));
    setEditMode(false);
  };

  const addGoal = () => {
    if (newGoal.trim()) {
      setEditGoals(prev => [...prev, newGoal.trim()]);
      setNewGoal("");
    }
  };

  // ── Child Detail Panel ──
  if (selectedChild) {
    const child = children.find(c => c.id === selectedChild.id) || selectedChild;
    const room = rooms.find(r => r.id === child.roomId);
    const radarData = DEV_DOMAINS.map(d => ({ domain: d.label.split(" ")[0], value: child.domains[d.id] || 0, fullMark: 5 }));
    const domainAvg = Object.values(child.domains).reduce((a, b) => a + b, 0) / Object.keys(child.domains).length;
    const weakAreas = DEV_DOMAINS.filter(d => (child.domains[d.id] || 0) <= 2).sort((a, b) => (child.domains[a.id] || 0) - (child.domains[b.id] || 0));
    const strongAreas = DEV_DOMAINS.filter(d => (child.domains[d.id] || 0) >= 4).sort((a, b) => (child.domains[b.id] || 0) - (child.domains[a.id] || 0));

    return (
      <div>
        <button onClick={() => { setSelectedChild(null); setEditMode(false); }} style={{ ...btnGhost, marginBottom: 12, fontSize: 13 }}>← Back to Children</button>

        {/* Header */}
        <div style={{ ...card, marginBottom: 16, display: "flex", gap: 20, alignItems: "flex-start" }}>
          <div style={{ width: 80, height: 80, borderRadius: 16, background: "linear-gradient(135deg, #8B6DAF, #7E5BA3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, flexShrink: 0 }}>
            {child.firstName[0]}{child.lastName[0]}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 22, color: "#3D3248" }}>{child.firstName} {child.lastName}</h2>
              {child.allergies !== "None" && <span style={tagStyle("#C9828A")}>⚠️ {child.allergies}</span>}
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#8A7F96", marginBottom: 8 }}>
              <span>🎂 {ageFromDob(child.dob)} old</span>
              <span>🏠 {room?.name || "Unassigned"}</span>
              <span>📅 Enrolled {new Date(child.enrolledDate).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>
              <span>📞 {child.emergencyContact}</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={tagStyle("#9B7DC0")}>Avg: {domainAvg.toFixed(1)}/5</span>
              <span style={tagStyle("#6BA38B")}>{childObs.length} observations</span>
              <span style={tagStyle("#D4A26A")}>{child.learningGoals.length} goals</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!editMode ? (
              <button onClick={() => startEdit(child)} style={btnPrimary}>✏️ Edit Profile</button>
            ) : (
              <>
                <button onClick={saveEdit} style={btnPrimary}>💾 Save</button>
                <button onClick={() => setEditMode(false)} style={btnSecondary}>Cancel</button>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Domain Radar + Levels */}
          <div style={card}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#3D3248" }}>🎯 Developmental Domains</h3>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{ width: 200, height: 200 }}>
                <ResponsiveContainer>
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                    <PolarGrid stroke="#D9D0C7" />
                    <PolarAngleAxis dataKey="domain" tick={{ fontSize: 10, fill: "#8A7F96" }} />
                    <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fontSize: 9, fill: "#A89DB5" }} tickCount={6} />
                    <Radar dataKey="value" stroke="#9B7DC0" fill="#9B7DC0" fillOpacity={0.3} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1 }}>
                {DEV_DOMAINS.map(d => (
                  <div key={d.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: "#5C4E6A" }}>{d.icon} {d.label}</span>
                      {editMode ? (
                        <select value={editDomains[d.id] || 1} onChange={e => setEditDomains(prev => ({ ...prev, [d.id]: parseInt(e.target.value) }))}
                          style={{ ...selectStyle, width: 120, padding: "4px 8px", fontSize: 11 }}>
                          {SKILL_LEVELS.map(s => <option key={s.id} value={s.id}>{s.id}. {s.label}</option>)}
                        </select>
                      ) : (
                        <SkillBadge level={child.domains[d.id] || 1} small />
                      )}
                    </div>
                    <ProgressBar value={editMode ? editDomains[d.id] : child.domains[d.id] || 0} color={d.color} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* EYLF Progress */}
          <div style={card}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#3D3248" }}>📋 EYLF V2.0 Outcome Progress</h3>
            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              {EYLF_OUTCOMES.map(o => {
                const subs = o.subOutcomes.filter(s => child.eylfProgress[s.id] !== undefined);
                if (subs.length === 0) return null;
                return (
                  <div key={o.id} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 14 }}>{o.icon}</span>
                      <span style={{ fontSize: 11, color: o.color, fontWeight: 600 }}>{o.title}</span>
                    </div>
                    {subs.map(s => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, paddingLeft: 20 }}>
                        <span style={{ fontSize: 11, color: "#8A7F96", width: 28, flexShrink: 0 }}>{s.id}</span>
                        <div style={{ flex: 1 }}><ProgressBar value={child.eylfProgress[s.id]} color={o.color} height={5} /></div>
                        <SkillBadge level={child.eylfProgress[s.id]} small />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Focus Areas */}
          <div style={card}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#3D3248" }}>🔍 Focus Areas</h3>
            {weakAreas.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: "#C9828A", fontWeight: 600, textTransform: "uppercase" }}>Needs Support</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {weakAreas.map(d => (
                    <span key={d.id} style={tagStyle(d.color)}>{d.icon} {d.label} ({child.domains[d.id]}/5)</span>
                  ))}
                </div>
              </div>
            )}
            {strongAreas.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: "#6BA38B", fontWeight: 600, textTransform: "uppercase" }}>Strengths</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {strongAreas.map(d => (
                    <span key={d.id} style={tagStyle(d.color)}>{d.icon} {d.label} ({child.domains[d.id]}/5)</span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <span style={{ fontSize: 11, color: "#8A7F96", fontWeight: 600, textTransform: "uppercase" }}>Educator Notes</span>
              {editMode ? (
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                  style={{ ...inputStyle, marginTop: 6, minHeight: 80, resize: "vertical", fontFamily: "inherit" }} />
              ) : (
                <p style={{ fontSize: 13, color: "#5C4E6A", margin: "6px 0 0", lineHeight: 1.6 }}>{child.notes}</p>
              )}
            </div>
          </div>

          {/* Learning Goals */}
          <div style={card}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#3D3248" }}>🎯 Learning Goals</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(editMode ? editGoals : child.learningGoals).map((g, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "#F8F5F1", borderRadius: 8, padding: "10px 12px" }}>
                  <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#E8E0D8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#A88BC7", fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontSize: 13, color: "#5C4E6A", flex: 1 }}>{g}</span>
                  {editMode && <button onClick={() => setEditGoals(prev => prev.filter((_, j) => j !== i))} style={{ ...btnGhost, color: "#C9828A", fontSize: 16, padding: 2 }}>×</button>}
                </div>
              ))}
              {editMode && (
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={newGoal} onChange={e => setNewGoal(e.target.value)} placeholder="Add a learning goal..."
                    style={inputStyle} onKeyDown={e => e.key === "Enter" && addGoal()} />
                  <button onClick={addGoal} style={{ ...btnPrimary, whiteSpace: "nowrap" }}>+ Add</button>
                </div>
              )}
            </div>
            {/* Recent Observations */}
            {childObs.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#8A7F96" }}>Recent Observations ({childObs.length})</h4>
                {childObs.slice(0, 3).map(o => (
                  <div key={o.id} style={{ background: "#F8F5F1", borderRadius: 8, padding: 10, marginBottom: 6, borderLeft: `3px solid ${EYLF_OUTCOMES.find(e => e.subOutcomes.some(s => (o.eylfOutcomes || []).includes(s.id)))?.color || "#A89DB5"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "#A88BC7" }}>{OBSERVATION_TYPES.find(t => t.id === o.type)?.icon} {OBSERVATION_TYPES.find(t => t.id === o.type)?.label}</span>
                      <span style={{ fontSize: 10, color: "#A89DB5" }}>{new Date(o.timestamp).toLocaleDateString(undefined)}</span>
                    </div>
                    <p style={{ fontSize: 12, color: "#5C4E6A", margin: 0, lineHeight: 1.5 }}>{o.narrative?.substring(0, 120)}{o.narrative?.length > 120 ? "..." : ""}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Children Grid ──
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search children..."
            style={{ ...inputStyle, width: 240 }} />
          <select value={filterRoom} onChange={e => setFilterRoom(e.target.value)} style={{ ...selectStyle, width: 180 }}>
            <option value="all">All Rooms ({children.length})</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({children.filter(c => c.roomId === r.id).length})</option>)}
          </select>
        </div>
        <span style={{ fontSize: 13, color: "#8A7F96" }}>{filtered.length} children</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280, 1fr))", gap: 12 }}>
        {filtered.map(child => {
          const room = rooms.find(r => r.id === child.roomId);
          const avg = Object.values(child.domains).reduce((a, b) => a + b, 0) / Object.keys(child.domains).length;
          const weak = DEV_DOMAINS.filter(d => (child.domains[d.id] || 0) <= 2);
          const obsCount = observations.filter(o => o.childId === child.id).length;

          return (
            <div key={child.id} onClick={() => setSelectedChild(child)}
              style={{ ...cardSm, cursor: "pointer", transition: "all 0.2s", border: "1px solid #E8E0D8" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#8B6DAF"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#E8E0D8"; e.currentTarget.style.transform = "translateY(0)"; }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${room?.ageGroup === "babies" ? "#C9929E" : room?.ageGroup === "toddlers" ? "#9B7DC0" : "#6BA38B"}, ${room?.ageGroup === "babies" ? "#B87D8E" : room?.ageGroup === "toddlers" ? "#8B6DAF" : "#4A8A6E"})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                  {child.firstName[0]}{child.lastName[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#3D3248" }}>{child.firstName} {child.lastName}</span>
                    {child.allergies !== "None" && <span style={{ fontSize: 10, color: "#C9828A" }}>⚠️</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#8A7F96", marginTop: 2 }}>{ageFromDob(child.dob)} · {room?.name || "—"}</div>
                </div>
              </div>

              {/* Domain bars mini */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", marginTop: 10 }}>
                {DEV_DOMAINS.slice(0, 6).map(d => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 10, width: 14 }}>{d.icon}</span>
                    <div style={{ flex: 1 }}><ProgressBar value={child.domains[d.id] || 0} color={d.color} height={4} /></div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 11, color: "#A89DB5" }}>Avg: {avg.toFixed(1)}/5</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {weak.length > 0 && <span style={{ ...tagStyle("#C9828A"), fontSize: 10, padding: "2px 6px" }}>{weak.length} focus</span>}
                  {obsCount > 0 && <span style={{ ...tagStyle("#9B7DC0"), fontSize: 10, padding: "2px 6px" }}>{obsCount} obs</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ██  PLANNING WIZARD — AI-Guided Daily Learning Plan Builder
// ██  Guides educators through Socratic reflection to build EYLF-aligned plans
// ═══════════════════════════════════════════════════════════════════════════════
export function PlanningWizardView({ children, rooms, dailyPlans, setDailyPlans }) {
  const [wizardStep, setWizardStep] = useState(0); // 0=overview, 1=room, 2=insights, 3=focus, 4=activities, 5=differentiation, 6=review
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [selectedFocusDomains, setSelectedFocusDomains] = useState([]);
  const [reflectionAnswers, setReflectionAnswers] = useState({});
  const [plannedActivities, setPlannedActivities] = useState([]);
  const [customActivity, setCustomActivity] = useState({ name: "", description: "", domain: "" });
  const [viewPlan, setViewPlan] = useState(null);
  const [differentiation, setDifferentiation] = useState({});
  const [planNotes, setPlanNotes] = useState("");

  // ── Classroom analysis for selected room ──
  const roomAnalysis = useMemo(() => {
    if (!selectedRoom) return null;
    const roomChildren = children.filter(c => c.roomId === selectedRoom.id || c.room_id === selectedRoom.id);

    const domainAverages = {};
    const domainDistribution = {};
    DEV_DOMAINS.forEach(d => {
      const vals = roomChildren.map(c => (c.domains || {})[d.id] || 0);
      domainAverages[d.id] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      domainDistribution[d.id] = {
        emerging: vals.filter(v => v <= 1).length,
        developing: vals.filter(v => v === 2).length,
        consolidating: vals.filter(v => v === 3).length,
        proficient: vals.filter(v => v >= 4).length,
      };
    });

    // Sort domains by need (lowest average = most need)
    const priorityDomains = DEV_DOMAINS.map(d => ({
      ...d,
      avg: domainAverages[d.id],
      needCount: roomChildren.filter(c => (c.domains[d.id] || 0) <= 2).length,
      needPct: roomChildren.length > 0 ? Math.round((roomChildren.filter(c => ((c.domains || {})[d.id] || 0) <= 2).length / roomChildren.length) * 100) : 0,
    })).sort((a, b) => a.avg - b.avg);

    // EYLF outcome analysis
    const eylfNeeds = {};
    EYLF_OUTCOMES.forEach(o => {
      o.subOutcomes.forEach(s => {
        const vals = roomChildren.map(c => (c.eylfProgress || c.eylf_progress || {})[s.id]).filter(v => v !== undefined);
        if (vals.length > 0) {
          eylfNeeds[s.id] = {
            avg: vals.reduce((a, b) => a + b, 0) / vals.length,
            count: vals.length,
            needSupport: vals.filter(v => v <= 2).length,
          };
        }
      });
    });

    return {
      roomChildren,
      domainAverages,
      domainDistribution,
      priorityDomains,
      eylfNeeds,
      topNeeds: priorityDomains.slice(0, 3),
      childCount: roomChildren.length,
    };
  }, [selectedRoom, children]);

  // ── Start fresh wizard ──
  const startWizard = (room) => {
    setSelectedRoom(room);
    setWizardStep(1);
    setSelectedFocusDomains([]);
    setReflectionAnswers({});
    setPlannedActivities([]);
    setDifferentiation({});
    setPlanNotes("");
  };

  // ── Toggle focus domain ──
  const toggleFocus = (domainId) => {
    setSelectedFocusDomains(prev =>
      prev.includes(domainId) ? prev.filter(d => d !== domainId) : prev.length >= 3 ? prev : [...prev, domainId]
    );
  };

  // ── Add activity from bank ──
  const addActivity = (activity, domain) => {
    const id = `act_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const d = getDomain(domain);
    setPlannedActivities(prev => [...prev, {
      id, name: activity, domain, domainLabel: d?.label || domain,
      eylfLinks: d?.eylfLinks || [],
      custom: false,
      notes: "",
    }]);
  };

  // ── Add custom activity ──
  const addCustom = () => {
    if (!customActivity.name.trim() || !customActivity.domain) return;
    const d = getDomain(customActivity.domain);
    const id = `act_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    setPlannedActivities(prev => [...prev, {
      id, name: customActivity.name, domain: customActivity.domain,
      domainLabel: d?.label || customActivity.domain,
      eylfLinks: d?.eylfLinks || [],
      custom: true,
      notes: customActivity.description,
    }]);
    setCustomActivity({ name: "", description: "", domain: "" });
  };

  // ── Save plan ──
  const savePlan = () => {
    const plan = {
      id: `plan_${Date.now()}`,
      date: todayStr(),
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      focusDomains: selectedFocusDomains,
      activities: plannedActivities,
      differentiation,
      reflections: reflectionAnswers,
      notes: planNotes,
      childCount: roomAnalysis?.childCount || 0,
      createdAt: new Date().toISOString(),
      status: "active",
    };
    setDailyPlans(prev => [...prev, plan]);
    setWizardStep(0);
  };

  // ── Viewing an existing plan ──
  if (viewPlan) {
    const plan = viewPlan;
    return (
      <div>
        <button onClick={() => setViewPlan(null)} style={{ ...btnGhost, marginBottom: 12 }}>← Back to Plans</button>
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: 20, color: "#3D3248" }}>📋 {plan.roomName} — Daily Learning Plan</h2>
              <span style={{ fontSize: 13, color: "#8A7F96" }}>
                {new Date(plan.date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                {" · "}{plan.childCount} children · {plan.activities.length} activities
              </span>
            </div>
            <span style={tagStyle(plan.status === "active" ? "#6BA38B" : "#A89DB5")}>
              {plan.status === "active" ? "Active" : "Completed"}
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={card}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#3D3248" }}>🎯 Focus Domains</h3>
            {plan.focusDomains.map(dId => {
              const d = getDomain(dId);
              return d ? (
                <div key={dId} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>{d.icon}</span>
                  <span style={{ fontSize: 14, color: d.color, fontWeight: 600 }}>{d.label}</span>
                </div>
              ) : null;
            })}
          </div>
          <div style={card}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#3D3248" }}>📝 Educator Reflections</h3>
            {Object.entries(plan.reflections || {}).map(([key, val]) => val ? (
              <div key={key} style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 11, color: "#A88BC7", margin: "0 0 2px", fontStyle: "italic" }}>{key}</p>
                <p style={{ fontSize: 13, color: "#5C4E6A", margin: 0 }}>{val}</p>
              </div>
            ) : null)}
          </div>
        </div>

        <div style={{ ...card, marginTop: 16 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#3D3248" }}>🗓️ Planned Activities</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {plan.activities.map(act => {
              const d = getDomain(act.domain);
              return (
                <div key={act.id} style={{ background: "#F8F5F1", borderRadius: 10, padding: 14, borderLeft: `3px solid ${d?.color || "#A89DB5"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <span style={{ fontSize: 14, color: "#3D3248", fontWeight: 600 }}>{act.name}</span>
                    {act.custom && <span style={{ fontSize: 9, color: "#D4A26A", fontWeight: 600 }}>CUSTOM</span>}
                  </div>
                  <span style={tagStyle(d?.color || "#A89DB5")}>{d?.icon} {act.domainLabel}</span>
                  {act.eylfLinks?.length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {act.eylfLinks.map(l => <span key={l} style={{ fontSize: 10, color: "#A89DB5", background: "#FFFFFF", borderRadius: 4, padding: "2px 6px" }}>EYLF {l}</span>)}
                    </div>
                  )}
                  {act.notes && <p style={{ fontSize: 12, color: "#8A7F96", margin: "6px 0 0" }}>{act.notes}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ██  WIZARD STEPS
  // ═══════════════════════════════════════════════════════════════════════════════

  // ── STEP 0: Overview / Plan History ──
  if (wizardStep === 0) {
    const todayPlans = dailyPlans.filter(p => p.date === todayStr());
    const pastPlans = dailyPlans.filter(p => p.date !== todayStr()).sort((a, b) => b.date.localeCompare(a.date));

    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: 20, color: "#3D3248" }}>📝 Daily Learning Plans</h2>
            <p style={{ margin: 0, fontSize: 13, color: "#8A7F96" }}>AI-guided planning aligned with EYLF V2.0 / MTOP V2.0 outcomes</p>
          </div>
        </div>

        {/* Quick-start cards */}
        <div style={{ ...card, marginBottom: 20, background: "linear-gradient(135deg, #EDE4F0, #F0EBE6)", border: "1px solid #D9D0C7" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15, color: "#A88BC7" }}>🚀 Start Today's Learning Plan</h3>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "#8A7F96" }}>
            Select a room to begin. The system will analyse children's profiles and guide you through building a plan.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${rooms.length}, 1fr)`, gap: 12 }}>
            {rooms.map(room => {
              const roomKids = children.filter(c => c.roomId === room.id || c.room_id === room.id);
              const hasPlan = todayPlans.some(p => p.roomId === room.id);
              return (
                <button key={room.id} onClick={() => startWizard(room)}
                  style={{
                    background: hasPlan ? "#F8F5F1" : "#E8E0D8", border: hasPlan ? "1px solid #6BA38B" : "1px solid #D9D0C7",
                    borderRadius: 10, padding: 16, cursor: "pointer", textAlign: "left", transition: "all 0.2s",
                  }}
                  onMouseEnter={e => { if (!hasPlan) e.currentTarget.style.borderColor = "#8B6DAF"; }}
                  onMouseLeave={e => { if (!hasPlan) e.currentTarget.style.borderColor = "#D9D0C7"; }}>
                  <div style={{ fontSize: 18, marginBottom: 6 }}>🏠</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#3D3248", marginBottom: 2 }}>{room.name}</div>
                  <div style={{ fontSize: 12, color: "#8A7F96" }}>{roomKids.length} children</div>
                  {hasPlan && <span style={{ ...tagStyle("#6BA38B"), marginTop: 8, display: "inline-block" }}>✓ Plan created</span>}
                  {!hasPlan && <span style={{ fontSize: 11, color: "#A88BC7", marginTop: 8, display: "block" }}>Start planning →</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Today's Plans */}
        {todayPlans.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#3D3248" }}>📋 Today's Plans</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {todayPlans.map(p => (
                <div key={p.id} onClick={() => setViewPlan(p)} style={{ ...cardSm, cursor: "pointer", borderLeft: `3px solid #6BA38B` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "#3D3248" }}>{p.roomName}</span>
                    <span style={{ fontSize: 11, color: "#6BA38B" }}>{p.activities.length} activities</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {p.focusDomains.map(dId => { const d = getDomain(dId); return d ? <span key={dId} style={tagStyle(d.color)}>{d.icon} {d.label}</span> : null; })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Past Plans */}
        {pastPlans.length > 0 && (
          <div>
            <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#8A7F96" }}>📚 Previous Plans</h3>
            {pastPlans.slice(0, 6).map(p => (
              <div key={p.id} onClick={() => setViewPlan(p)} style={{ ...cardSm, cursor: "pointer", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#5C4E6A" }}>{p.roomName}</span>
                  <span style={{ fontSize: 12, color: "#A89DB5", marginLeft: 12 }}>{new Date(p.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {p.focusDomains.map(dId => { const d = getDomain(dId); return d ? <span key={dId} style={{ fontSize: 14 }}>{d.icon}</span> : null; })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── STEP 1: Classroom Insights (AI Analysis) ──
  if (wizardStep === 1 && roomAnalysis) {
    const an = roomAnalysis;
    const ageGroup = ageGroupFromRoom(selectedRoom.id, rooms);
    const chartData = an.priorityDomains.map(d => ({
      name: d.icon + " " + d.label.split(" ")[0], avg: parseFloat(d.avg.toFixed(1)), needPct: d.needPct, color: d.color,
    }));

    return (
      <div>
        <WizardHeader step={1} total={5} title="Classroom Insights" subtitle={`${selectedRoom.name} · ${an.childCount} children`}
          onBack={() => setWizardStep(0)} onNext={() => setWizardStep(2)} nextLabel="Choose Focus Areas →" />

        {/* AI Insight Banner */}
        <div style={{ ...card, marginBottom: 16, background: "linear-gradient(135deg, #EDE4F0, #F0EBE6)", border: "1px solid #D9D0C7" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>🤖</span>
            <div>
              <h3 style={{ margin: "0 0 6px", fontSize: 15, color: "#A88BC7" }}>Classroom Analysis</h3>
              <p style={{ margin: 0, fontSize: 13, color: "#5C4E6A", lineHeight: 1.7 }}>
                Looking at the {an.childCount} children in {selectedRoom.name}, the data suggests some clear patterns.
                {an.topNeeds[0] && <><br/><br/>
                  <strong style={{ color: an.topNeeds[0].color }}>{an.topNeeds[0].icon} {an.topNeeds[0].label}</strong> shows the most need across the room — <strong>{an.topNeeds[0].needPct}%</strong> of children ({an.topNeeds[0].needCount} of {an.childCount}) are at Emerging or Developing levels.
                </>}
                {an.topNeeds[1] && <>
                  {" "}<strong style={{ color: an.topNeeds[1].color }}>{an.topNeeds[1].icon} {an.topNeeds[1].label}</strong> is also a priority area with <strong>{an.topNeeds[1].needPct}%</strong> needing support.
                </>}
                {an.topNeeds[2] && <>
                  {" "}<strong style={{ color: an.topNeeds[2].color }}>{an.topNeeds[2].icon} {an.topNeeds[2].label}</strong> has <strong>{an.topNeeds[2].needPct}%</strong> requiring attention.
                </>}
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Domain Averages Chart */}
          <div style={card}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#3D3248" }}>📊 Domain Averages</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 10 }}>
                <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 10, fill: "#A89DB5" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#8A7F96" }} width={80} />
                <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid #D9D0C7", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => `${v.toFixed(1)} / 5`} />
                <Bar dataKey="avg" radius={[0, 6, 6, 0]} fill="#9B7DC0">
                  {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Children Needing Support */}
          <div style={card}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#3D3248" }}>🔍 Children to Watch</h3>
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {an.roomChildren
                .map(c => ({ ...c, avg: Object.values(c.domains).reduce((a, b) => a + b, 0) / Object.keys(c.domains).length }))
                .sort((a, b) => a.avg - b.avg)
                .slice(0, 6)
                .map(c => {
                  const weak = DEV_DOMAINS.filter(d => (c.domains[d.id] || 0) <= 2);
                  return (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #E8E0D8" }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: "#E8E0D8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#A88BC7", flexShrink: 0 }}>
                        {c.firstName[0]}{c.lastName[0]}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: "#3D3248", fontWeight: 500 }}>{c.firstName} {c.lastName}</div>
                        <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                          {weak.map(d => <span key={d.id} style={{ fontSize: 10, color: d.color }}>{d.icon}</span>)}
                          <span style={{ fontSize: 10, color: "#A89DB5" }}>avg {c.avg.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Reflection Prompts */}
          <div style={{ ...card, gridColumn: "1 / -1" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 14, color: "#3D3248" }}>💭 Reflect On What You See</h3>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "#8A7F96" }}>Take a moment to consider the patterns above. Your professional judgment is what brings this data to life.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {REFLECTION_PROMPTS.classroom_analysis.slice(0, 4).map((prompt, i) => (
                <div key={i}>
                  <label style={{ display: "block", fontSize: 12, color: "#A88BC7", marginBottom: 4, fontStyle: "italic" }}>"{prompt}"</label>
                  <textarea value={reflectionAnswers[`insight_${i}`] || ""} onChange={e => setReflectionAnswers(prev => ({ ...prev, [`insight_${i}`]: e.target.value }))}
                    placeholder="Share your thoughts..."
                    style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "inherit", fontSize: 12 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 2: Choose Focus Domains ──
  if (wizardStep === 2 && roomAnalysis) {
    const an = roomAnalysis;
    const ageGroup = ageGroupFromRoom(selectedRoom.id, rooms);

    // Pre-suggest top 2 needs
    if (selectedFocusDomains.length === 0 && an.topNeeds.length >= 2) {
      setSelectedFocusDomains(an.topNeeds.slice(0, 2).map(d => d.id));
    }

    return (
      <div>
        <WizardHeader step={2} total={5} title="Choose Focus Areas" subtitle="Select 2–3 developmental domains to focus on today"
          onBack={() => setWizardStep(1)} onNext={() => selectedFocusDomains.length >= 1 ? setWizardStep(3) : null}
          nextLabel="Plan Activities →" nextDisabled={selectedFocusDomains.length < 1} />

        <div style={{ ...card, marginBottom: 16, background: "linear-gradient(135deg, #EDE4F0, #F0EBE6)", border: "1px solid #D9D0C7" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20 }}>🤖</span>
            <div>
              <h3 style={{ margin: "0 0 6px", fontSize: 15, color: "#A88BC7" }}>Suggested Focus</h3>
              <p style={{ margin: 0, fontSize: 13, color: "#5C4E6A", lineHeight: 1.6 }}>
                Based on the classroom data, I've pre-selected <strong>{an.topNeeds[0]?.label}</strong> and <strong>{an.topNeeds[1]?.label}</strong> as today's focus areas. These have the highest proportion of children needing support.
                {" "}But you know your children best — feel free to adjust based on yesterday's experiences, current interests, or upcoming events.
                <br/><br/>
                <em style={{ color: "#8A7F96" }}>Think about: What emerging interests have you noticed? Are there children who need something different today? How does this connect to your weekly programming cycle?</em>
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          {an.priorityDomains.map(d => {
            const selected = selectedFocusDomains.includes(d.id);
            const suggested = an.topNeeds.slice(0, 2).some(t => t.id === d.id);
            return (
              <button key={d.id} onClick={() => toggleFocus(d.id)}
                style={{
                  background: selected ? d.color + "20" : "#FFFFFF",
                  border: `2px solid ${selected ? d.color : "#D9D0C7"}`,
                  borderRadius: 12, padding: 16, cursor: "pointer", textAlign: "left",
                  transition: "all 0.2s", position: "relative",
                }}>
                {suggested && !selected && (
                  <span style={{ position: "absolute", top: 8, right: 8, fontSize: 9, color: "#A88BC7", fontWeight: 600, background: "#E8E0D8", borderRadius: 4, padding: "2px 6px" }}>SUGGESTED</span>
                )}
                <div style={{ fontSize: 28, marginBottom: 8 }}>{d.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: selected ? d.color : "#5C4E6A", marginBottom: 4 }}>{d.label}</div>
                <div style={{ fontSize: 12, color: "#8A7F96", marginBottom: 8 }}>{d.description}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: d.needPct >= 50 ? "#C9828A" : d.needPct >= 30 ? "#D4A26A" : "#6BA38B" }}>
                    {d.needPct}% need support
                  </span>
                  <span style={{ fontSize: 11, color: "#A89DB5" }}>avg {d.avg.toFixed(1)}</span>
                </div>
                <ProgressBar value={d.avg} color={d.color} height={4} />
              </button>
            );
          })}
        </div>

        {/* Reflection for focus selection */}
        <div style={card}>
          <label style={{ display: "block", fontSize: 12, color: "#A88BC7", marginBottom: 6, fontStyle: "italic" }}>
            "{REFLECTION_PROMPTS.focus_selection[0]}"
          </label>
          <textarea value={reflectionAnswers.focus_reason || ""} onChange={e => setReflectionAnswers(prev => ({ ...prev, focus_reason: e.target.value }))}
            placeholder="Why did you choose these focus areas? What connects them to the children's current interests or needs?"
            style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit", fontSize: 12 }} />
        </div>
      </div>
    );
  }

  // ── STEP 3: Plan Activities ──
  if (wizardStep === 3 && roomAnalysis) {
    const ageGroup = ageGroupFromRoom(selectedRoom.id, rooms);

    return (
      <div>
        <WizardHeader step={3} total={5} title="Plan Activities" subtitle="Choose or create activities for each focus domain"
          onBack={() => setWizardStep(2)} onNext={() => plannedActivities.length >= 1 ? setWizardStep(4) : null}
          nextLabel="Differentiation →" nextDisabled={plannedActivities.length < 1} />

        <div style={{ ...card, marginBottom: 16, background: "linear-gradient(135deg, #EDE4F0, #F0EBE6)", border: "1px solid #D9D0C7" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20 }}>🤖</span>
            <p style={{ margin: 0, fontSize: 13, color: "#5C4E6A", lineHeight: 1.6 }}>
              Here are age-appropriate activity suggestions for your chosen focus areas. Select the ones that feel right for today, modify them, or add your own.
              <br/><em style={{ color: "#8A7F96" }}>Consider: What resources do you have available? What play spaces work best for these experiences? How might children's current interests connect to these activities?</em>
            </p>
          </div>
        </div>

        {selectedFocusDomains.map(domainId => {
          const d = getDomain(domainId);
          if (!d) return null;
          const suggestions = ACTIVITY_BANK[domainId]?.[ageGroup] || [];
          const alreadyAdded = plannedActivities.filter(a => a.domain === domainId).map(a => a.name);

          return (
            <div key={domainId} style={{ ...card, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 22 }}>{d.icon}</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, color: d.color }}>{d.label}</h3>
                  <span style={{ fontSize: 11, color: "#8A7F96" }}>EYLF Links: {d.eylfLinks.join(", ")}</span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                {suggestions.map((act, i) => {
                  const added = alreadyAdded.includes(act);
                  return (
                    <button key={i} onClick={() => !added && addActivity(act, domainId)}
                      style={{
                        background: added ? "#F8F5F1" : "#E8E0D8", border: `1px solid ${added ? d.color : "#D9D0C7"}`,
                        borderRadius: 8, padding: "10px 12px", cursor: added ? "default" : "pointer",
                        textAlign: "left", fontSize: 12, color: added ? d.color : "#5C4E6A",
                        transition: "all 0.15s", opacity: added ? 0.7 : 1,
                      }}>
                      {added ? "✓ " : "＋ "}{act}
                    </button>
                  );
                })}
              </div>

              {/* Reflection prompt per domain */}
              <div style={{ background: "#F8F5F1", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "#A88BC7", fontStyle: "italic" }}>
                  💭 "{REFLECTION_PROMPTS.activity_planning[selectedFocusDomains.indexOf(domainId) % REFLECTION_PROMPTS.activity_planning.length]}"
                </span>
              </div>
            </div>
          );
        })}

        {/* Custom activity */}
        <div style={card}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#3D3248" }}>➕ Add Custom Activity</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <label style={labelStyle}>Activity Name</label>
              <input value={customActivity.name} onChange={e => setCustomActivity(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Mud kitchen exploration" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Domain</label>
              <select value={customActivity.domain} onChange={e => setCustomActivity(prev => ({ ...prev, domain: e.target.value }))} style={selectStyle}>
                <option value="">Select domain...</option>
                {DEV_DOMAINS.map(d => <option key={d.id} value={d.id}>{d.icon} {d.label}</option>)}
              </select>
            </div>
            <button onClick={addCustom} style={btnPrimary}>Add</button>
          </div>
        </div>

        {/* Selected activities summary */}
        {plannedActivities.length > 0 && (
          <div style={{ ...card, marginTop: 16 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#3D3248" }}>Selected Activities ({plannedActivities.length})</h3>
            {plannedActivities.map(act => {
              const d = getDomain(act.domain);
              return (
                <div key={act.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #E8E0D8" }}>
                  <span style={{ fontSize: 14 }}>{d?.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, color: "#5C4E6A" }}>{act.name}</span>
                  <span style={tagStyle(d?.color || "#A89DB5")}>{act.domainLabel}</span>
                  <button onClick={() => setPlannedActivities(prev => prev.filter(a => a.id !== act.id))}
                    style={{ ...btnGhost, color: "#C9828A", fontSize: 14 }}>×</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── STEP 4: Differentiation & Individual Considerations ──
  if (wizardStep === 4 && roomAnalysis) {
    const an = roomAnalysis;
    // Group children by support level for each focus domain
    const supportGroups = {};
    selectedFocusDomains.forEach(dId => {
      supportGroups[dId] = {
        needsSupport: an.roomChildren.filter(c => (c.domains[dId] || 0) <= 2),
        onTrack: an.roomChildren.filter(c => (c.domains[dId] || 0) === 3),
        canExtend: an.roomChildren.filter(c => (c.domains[dId] || 0) >= 4),
      };
    });

    return (
      <div>
        <WizardHeader step={4} total={5} title="Differentiation" subtitle="Consider how to support children at different levels"
          onBack={() => setWizardStep(3)} onNext={() => setWizardStep(5)} nextLabel="Review Plan →" />

        <div style={{ ...card, marginBottom: 16, background: "linear-gradient(135deg, #EDE4F0, #F0EBE6)", border: "1px solid #D9D0C7" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20 }}>🤖</span>
            <p style={{ margin: 0, fontSize: 13, color: "#5C4E6A", lineHeight: 1.6 }}>
              Not every child is at the same place. Below you can see who might need extra scaffolding and who's ready for extension.
              <br/><em style={{ color: "#8A7F96" }}>How might you group children? Could stronger children model or support emerging learners? What adaptations make an activity accessible for everyone?</em>
            </p>
          </div>
        </div>

        {selectedFocusDomains.map(dId => {
          const d = getDomain(dId);
          const groups = supportGroups[dId];
          if (!d || !groups) return null;

          return (
            <div key={dId} style={{ ...card, marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 15, color: d.color }}>{d.icon} {d.label} — Grouping</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {/* Needs Support */}
                <div style={{ background: "#C9828A18", borderRadius: 10, padding: 12, border: "1px solid #C9828A30" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#C9828A", marginBottom: 8 }}>🔴 Needs Support ({groups.needsSupport.length})</div>
                  {groups.needsSupport.map(c => (
                    <div key={c.id} style={{ fontSize: 12, color: "#3D3248", padding: "3px 0" }}>
                      {c.firstName} {c.lastName} <span style={{ color: "#A89DB5" }}>({c.domains[dId]}/5)</span>
                    </div>
                  ))}
                  {groups.needsSupport.length === 0 && <span style={{ fontSize: 11, color: "#A89DB5" }}>None</span>}
                </div>
                {/* On Track */}
                <div style={{ background: "#9B7DC018", borderRadius: 10, padding: 12, border: "1px solid #9B7DC030" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#9B7DC0", marginBottom: 8 }}>🟡 Consolidating ({groups.onTrack.length})</div>
                  {groups.onTrack.map(c => (
                    <div key={c.id} style={{ fontSize: 12, color: "#3D3248", padding: "3px 0" }}>
                      {c.firstName} {c.lastName} <span style={{ color: "#A89DB5" }}>({c.domains[dId]}/5)</span>
                    </div>
                  ))}
                  {groups.onTrack.length === 0 && <span style={{ fontSize: 11, color: "#A89DB5" }}>None</span>}
                </div>
                {/* Can Extend */}
                <div style={{ background: "#6BA38B18", borderRadius: 10, padding: 12, border: "1px solid #6BA38B30" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#6BA38B", marginBottom: 8 }}>🟢 Ready to Extend ({groups.canExtend.length})</div>
                  {groups.canExtend.map(c => (
                    <div key={c.id} style={{ fontSize: 12, color: "#3D3248", padding: "3px 0" }}>
                      {c.firstName} {c.lastName} <span style={{ color: "#A89DB5" }}>({c.domains[dId]}/5)</span>
                    </div>
                  ))}
                  {groups.canExtend.length === 0 && <span style={{ fontSize: 11, color: "#A89DB5" }}>None</span>}
                </div>
              </div>

              {/* Differentiation notes */}
              <div style={{ marginTop: 10 }}>
                <label style={{ ...labelStyle, color: "#A88BC7", fontStyle: "italic" }}>
                  💭 How will you adapt activities for these different levels?
                </label>
                <textarea value={differentiation[dId] || ""} onChange={e => setDifferentiation(prev => ({ ...prev, [dId]: e.target.value }))}
                  placeholder={`e.g., For ${d.label}: Pair ${groups.needsSupport[0]?.firstName || "emerging learners"} with ${groups.canExtend[0]?.firstName || "stronger peers"}. Provide visual supports for...`}
                  style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "inherit", fontSize: 12 }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── STEP 5: Review & Save ──
  if (wizardStep === 5 && roomAnalysis) {
    const an = roomAnalysis;
    return (
      <div>
        <WizardHeader step={5} total={5} title="Review & Save" subtitle="Check your daily plan before saving"
          onBack={() => setWizardStep(4)} onNext={savePlan} nextLabel="✅ Save Plan" />

        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: 20, color: "#3D3248" }}>📋 {selectedRoom.name} — Daily Learning Plan</h2>
              <span style={{ fontSize: 13, color: "#8A7F96" }}>
                {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                {" · "}{an.childCount} children
              </span>
            </div>
          </div>

          {/* Focus Domains */}
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14, color: "#A88BC7" }}>Focus Domains</h3>
            <div style={{ display: "flex", gap: 8 }}>
              {selectedFocusDomains.map(dId => {
                const d = getDomain(dId);
                return d ? <span key={dId} style={tagStyle(d.color)}>{d.icon} {d.label}</span> : null;
              })}
            </div>
          </div>

          {/* Activities */}
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14, color: "#A88BC7" }}>Activities ({plannedActivities.length})</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {plannedActivities.map(act => {
                const d = getDomain(act.domain);
                return (
                  <div key={act.id} style={{ background: "#F8F5F1", borderRadius: 8, padding: 12, borderLeft: `3px solid ${d?.color || "#A89DB5"}` }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#3D3248", marginBottom: 4 }}>{act.name}</div>
                    <span style={tagStyle(d?.color || "#A89DB5")}>{d?.icon} {act.domainLabel}</span>
                    {act.eylfLinks?.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        {act.eylfLinks.map(l => <span key={l} style={{ fontSize: 10, color: "#A89DB5", marginRight: 6 }}>EYLF {l}</span>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* EYLF Outcomes Covered */}
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14, color: "#A88BC7" }}>EYLF Outcomes Addressed</h3>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[...new Set(plannedActivities.flatMap(a => a.eylfLinks || []))].sort().map(link => {
                const outcome = EYLF_OUTCOMES.find(o => o.subOutcomes.some(s => s.id === link));
                return (
                  <span key={link} style={tagStyle(outcome?.color || "#A89DB5")}>
                    {outcome?.icon} {link}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Educator Notes */}
          <div>
            <h3 style={{ margin: "0 0 8px", fontSize: 14, color: "#A88BC7" }}>Additional Notes</h3>
            <textarea value={planNotes} onChange={e => setPlanNotes(e.target.value)}
              placeholder="Any additional notes, reminders, or things to prepare..."
              style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit", fontSize: 12 }} />
          </div>
        </div>

        {/* NQS Alignment note */}
        <div style={{ ...cardSm, background: "#F8F5F1", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 16 }}>✅</span>
          <div style={{ fontSize: 12, color: "#8A7F96", lineHeight: 1.6 }}>
            <strong style={{ color: "#6BA38B" }}>NQS Quality Area 1 Alignment:</strong> This plan demonstrates intentional teaching (1.2.1), responsive teaching and scaffolding (1.2.2),
            child-directed learning (1.2.3), and the assessment and planning cycle (1.3.1) required under the National Quality Standard.
            Your reflections and differentiation notes support critical reflection (1.3.2).
          </div>
        </div>
      </div>
    );
  }

  return <div style={{ color: "#8A7F96", textAlign: "center", padding: 40 }}>Loading wizard...</div>;
}

// ── Wizard Header Component ──
function WizardHeader({ step, total, title, subtitle, onBack, onNext, nextLabel = "Next →", nextDisabled = false }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {/* Progress bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < step ? "#8B6DAF" : i === step ? "linear-gradient(90deg, #8B6DAF, #D9D0C7)" : "#E8E0D8", transition: "all 0.3s" }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#A89DB5", fontWeight: 700, letterSpacing: "0.05em" }}>STEP {step} OF {total}</span>
          </div>
          <h2 style={{ margin: "4px 0 0", fontSize: 20, color: "#3D3248" }}>{title}</h2>
          {subtitle && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#8A7F96" }}>{subtitle}</p>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {onBack && <button onClick={onBack} style={btnSecondary}>← Back</button>}
          {onNext && <button onClick={onNext} disabled={nextDisabled}
            style={{ ...btnPrimary, opacity: nextDisabled ? 0.4 : 1, cursor: nextDisabled ? "not-allowed" : "pointer" }}>
            {nextLabel}
          </button>}
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ██  OBSERVATIONS VIEW — Daily Progress Tracking & Documentation
// ═══════════════════════════════════════════════════════════════════════════════
export function ObservationsView({ children: propChildren, rooms: propRooms, observations, setObservations }) {
  const [showForm, setShowForm] = useState(false);
  const [filterRoom, setFilterRoom] = useState("all");
  const [filterChild, setFilterChild] = useState("all");
  const [filterDate, setFilterDate] = useState(todayStr());
  const [apiChildren, setApiChildren] = useState([]);
  const [apiRooms, setApiRooms] = useState([]);

  // Use API children/rooms if loaded, fall back to props
  const children = apiChildren.length > 0 ? apiChildren : propChildren;
  const rooms = apiRooms.length > 0 ? apiRooms : propRooms;

  // Form state
  const [formChild, setFormChild] = useState("");
  const [formType, setFormType] = useState("jotting");
  const [formNarrative, setFormNarrative] = useState("");
  const [formDomains, setFormDomains] = useState([]);
  const [formEylf, setFormEylf] = useState([]);
  const [formProgress, setFormProgress] = useState({});
  const [formMedia, setFormMedia] = useState([]);
  const [formFollowUp, setFormFollowUp] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const API = useCallback((path, opts = {}) => {
    const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
    return fetch(path, {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}), ...(tid ? { "x-tenant-id": tid } : {}) },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {})
    }).then(r => r.json());
  }, []);

  const loadObservations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterDate) params.set("date", filterDate);
      if (filterRoom !== "all") params.set("room_id", filterRoom);
      if (filterChild !== "all") params.set("child_id", filterChild);
      const data = await API(`/api/learning/observations?${params}`);
      if (data.observations) setObservations(data.observations.map(o => ({
        id: o.id,
        childId: o.child_id,
        childName: o.child_name || "Unknown",
        type: o.type || "jotting",
        narrative: o.narrative,
        domains: Array.isArray(o.domains) ? o.domains : [],
        eylfOutcomes: Array.isArray(o.eylf_outcomes) ? o.eylf_outcomes : [],
        progressUpdates: typeof o.progress_updates === "object" ? o.progress_updates : {},
        media: Array.isArray(o.media) ? o.media : [],
        followUp: o.follow_up || "",
        timestamp: o.timestamp || o.created_at || "",
        educatorName: o.educator_name || "Educator",
        roomName: o.room_name || "",
      })));
    } catch (e) {
      console.error("Failed to load observations", e);
    }
  }, [API, filterDate, filterRoom, filterChild, setObservations]);

  useEffect(() => {
    const t = localStorage.getItem("c360_token");
    if (!t) return;
    loadObservations();
    // Load real children and rooms so IDs match DB observations
    API("/api/children").then(data => {
      const list = Array.isArray(data) ? data : (data.children || []);
      setApiChildren(list.map(c => ({
        id: c.id, firstName: c.first_name, lastName: c.last_name,
        dob: c.dob, roomId: c.room_id, roomName: c.room_name,
        allergies: c.allergies, domains: {},
      })));
    }).catch(() => {});
    API("/api/live-status").then(data => {
      if (data.rooms) setApiRooms(data.rooms.map(r => ({ id: r.id, name: r.name })));
    }).catch(() => {});
  }, [loadObservations, API]);

  const filteredObs = useMemo(() => {
    return observations.filter(o => {
      if (filterDate && !o.timestamp.startsWith(filterDate)) return false;
      if (filterRoom !== "all") {
        const child = children.find(c => String(c.id) === String(o.childId));
        if (!child || String(child.roomId) !== String(filterRoom)) return false;
      }
      if (filterChild !== "all" && String(o.childId) !== String(filterChild)) return false;
      return true;
    }).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [observations, filterDate, filterRoom, filterChild, children]);

  const obsByChild = useMemo(() => {
    const map = {};
    filteredObs.forEach(o => {
      if (!map[o.childId]) map[o.childId] = [];
      map[o.childId].push(o);
    });
    return map;
  }, [filteredObs]);

  const todayCount = observations.filter(o => o.timestamp.startsWith(todayStr())).length;
  const childrenWithObs = new Set(observations.filter(o => o.timestamp.startsWith(todayStr())).map(o => o.childId)).size;

  const resetForm = () => {
    setFormChild(""); setFormType("jotting"); setFormNarrative(""); setFormDomains([]);
    setFormEylf([]); setFormProgress({}); setFormMedia([]); setFormFollowUp("");
  };

  const submitObservation = async () => {
    if (!formChild || !formNarrative.trim()) return;
    setSaving(true);
    try {
      const body = {
        child_id: formChild,
        type: formType,
        narrative: formNarrative.trim(),
        domains: formDomains,
        eylf_outcomes: formEylf,
        progress_updates: formProgress,
        media: formMedia.filter(m => !m.pending).map(m => ({ id: m.id, type: m.type, name: m.name })),
        follow_up: formFollowUp || null,
      };
      let result;
      if (editingId) {
        result = await API(`/api/learning/observations/${editingId}`, { method: "PUT", body });
      } else {
        result = await API("/api/learning/observations", { method: "POST", body });
      }
      if (result.error) throw new Error(result.error);
      if (window.showToast) window.showToast(editingId ? "Observation updated" : "Observation saved", "success");
      resetForm();
      setEditingId(null);
      setShowForm(false);
      await loadObservations();
    } catch (e) {
      if (window.showToast) window.showToast("Failed to save: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (obs) => {
    setFormChild(String(obs.childId));
    setFormType(obs.type || "jotting");
    setFormNarrative(obs.narrative || "");
    setFormDomains(obs.domains || []);
    setFormEylf(obs.eylfOutcomes || []);
    setFormProgress(obs.progressUpdates || {});
    setFormMedia(obs.media || []);
    setFormFollowUp(obs.followUp || "");
    setEditingId(obs.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this observation? This cannot be undone.")) return;
    try {
      const result = await API(`/api/learning/observations/${id}`, { method: "DELETE" });
      if (result.error) throw new Error(result.error);
      if (window.showToast) window.showToast("Observation deleted", "success");
      await loadObservations();
    } catch (e) {
      if (window.showToast) window.showToast("Delete failed: " + e.message, "error");
    }
  };

  const toggleDomain = (id) => setFormDomains(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  const toggleEylf = (id) => setFormEylf(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);

  const attachMedia = () => {
    document.getElementById("obs-photo-upload")?.click();
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const newMedia = files.map(f => ({
      id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: f.type.startsWith("video/") ? "Video" : "Photo",
      name: f.name,
      pending: true,
    }));
    setFormMedia(prev => [...prev, ...newMedia]);
    e.target.value = "";
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", gap: 12 }}>
            <span style={tagStyle("#6BA38B")}>{todayCount} today</span>
            <span style={tagStyle("#9B7DC0")}>{childrenWithObs} / {children.length} children documented</span>
          </div>
        </div>
        <button onClick={() => { resetForm(); setEditingId(null); setShowForm(!showForm); }} style={btnPrimary}>
          {showForm ? "✕ Close" : "📝 New Observation"}
        </button>
      </div>

      {/* New Observation Form */}
      {showForm && (
        <div style={{ ...card, marginBottom: 20, border: "1px solid #8B6DAF40" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, color: "#3D3248" }}>{editingId ? "✏️ Edit Observation" : "📝 Record Observation"}</h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            {/* Child */}
            <div>
              <label style={labelStyle}>Child</label>
              <select value={formChild} onChange={e => setFormChild(e.target.value)} style={selectStyle}>
                <option value="">Select child...</option>
                {children.map(c => {
                  const room = rooms.find(r => r.id === c.roomId);
                  return <option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({room?.name})</option>;
                })}
              </select>
            </div>
            {/* Type */}
            <div>
              <label style={labelStyle}>Observation Type</label>
              <select value={formType} onChange={e => setFormType(e.target.value)} style={selectStyle}>
                {OBSERVATION_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
              </select>
            </div>
            {/* Media */}
            <div>
              <label style={labelStyle}>Attachments</label>
              <input type="file" id="obs-photo-upload" accept="image/*,video/*" multiple style={{ display: "none" }} onChange={handleFileSelect} />
              <button onClick={attachMedia} style={{ ...btnSecondary, width: "100%" }}>📎 Attach Photo/Video</button>
              {formMedia.length > 0 && (
                <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {formMedia.map(m => (
                    <span key={m.id} style={{ ...tagStyle("#9B7DC0"), fontSize: 10 }}>
                      {m.name}
                      <button onClick={() => setFormMedia(prev => prev.filter(x => x.id !== m.id))} style={{ background: "none", border: "none", color: "#C9828A", cursor: "pointer", marginLeft: 4, fontSize: 10 }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Narrative */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>What did you observe?</label>
            <textarea value={formNarrative} onChange={e => setFormNarrative(e.target.value)}
              placeholder="Describe what the child was doing, saying, or creating. What learning was visible? How were they engaging with others, materials, or ideas?"
              style={{ ...inputStyle, minHeight: 100, resize: "vertical", fontFamily: "inherit", fontSize: 13, lineHeight: 1.6 }} />
          </div>

          {/* EYLF Outcomes */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Link to EYLF V2.0 Outcomes</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {EYLF_OUTCOMES.map(o => (
                <div key={o.id} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 11, color: o.color, fontWeight: 600, marginBottom: 3 }}>{o.icon} Outcome {o.code}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {o.subOutcomes.map(s => (
                      <button key={s.id} onClick={() => toggleEylf(s.id)}
                        style={{
                          background: formEylf.includes(s.id) ? o.color + "25" : "#F8F5F1",
                          border: `1px solid ${formEylf.includes(s.id) ? o.color : "#D9D0C7"}`,
                          borderRadius: 6, padding: "4px 8px", cursor: "pointer",
                          fontSize: 10, color: formEylf.includes(s.id) ? o.color : "#8A7F96",
                        }}>
                        {s.id}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Developmental Domains */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Developmental Domains Observed</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {DEV_DOMAINS.map(d => (
                <button key={d.id} onClick={() => toggleDomain(d.id)}
                  style={{
                    background: formDomains.includes(d.id) ? d.color + "20" : "#F8F5F1",
                    border: `1px solid ${formDomains.includes(d.id) ? d.color : "#D9D0C7"}`,
                    borderRadius: 8, padding: "6px 12px", cursor: "pointer",
                    fontSize: 12, color: formDomains.includes(d.id) ? d.color : "#8A7F96",
                  }}>
                  {d.icon} {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick skill progress update */}
          {formChild && formDomains.length > 0 && (
            <div style={{ marginBottom: 16, background: "#F8F5F1", borderRadius: 10, padding: 14 }}>
              <label style={{ ...labelStyle, color: "#A88BC7" }}>📈 Update Skill Level? (optional)</label>
              <p style={{ fontSize: 11, color: "#8A7F96", margin: "0 0 8px" }}>If this observation shows clear progress, you can update the child's domain level.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                {formDomains.map(dId => {
                  const d = getDomain(dId);
                  const child = children.find(c => String(c.id) === String(formChild));
                  const current = child?.domains[dId] || 1;
                  return (
                    <div key={dId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: d?.color, minWidth: 24 }}>{d?.icon}</span>
                      <span style={{ fontSize: 11, color: "#8A7F96" }}>Currently: {getSkillLevel(current).label} →</span>
                      <select value={formProgress[dId] || ""} onChange={e => setFormProgress(prev => ({ ...prev, [dId]: e.target.value ? parseInt(e.target.value) : undefined }))}
                        style={{ ...selectStyle, width: 110, padding: "4px 6px", fontSize: 11 }}>
                        <option value="">No change</option>
                        {SKILL_LEVELS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Follow-up */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Follow-up / Next Steps</label>
            <textarea value={formFollowUp} onChange={e => setFormFollowUp(e.target.value)}
              placeholder="What could you do next to extend this learning? What might you set up tomorrow?"
              style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "inherit", fontSize: 12 }} />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} style={btnSecondary}>Cancel</button>
            <button onClick={submitObservation} disabled={!formChild || !formNarrative.trim() || saving}
              style={{ ...btnPrimary, opacity: (!formChild || !formNarrative.trim() || saving) ? 0.4 : 1 }}>
              {saving ? "Saving..." : editingId ? "💾 Update Observation" : "💾 Save Observation"}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <DatePicker value={filterDate} onChange={v => setFilterDate(v)} style={{ width: 160 }} />
        <select value={filterRoom} onChange={e => { setFilterRoom(e.target.value); setFilterChild("all"); }} style={{ ...selectStyle, width: 160 }}>
          <option value="all">All Rooms</option>
          {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select value={filterChild} onChange={e => setFilterChild(e.target.value)} style={{ ...selectStyle, width: 200 }}>
          <option value="all">All Children</option>
          {children.filter(c => filterRoom === "all" || String(c.roomId) === String(filterRoom)).map(c => (
            <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
          ))}
        </select>
        <span style={{ fontSize: 13, color: "#8A7F96", alignSelf: "center" }}>{filteredObs.length} observations</span>
      </div>

      {/* Observations Timeline */}
      {filteredObs.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
          <p style={{ fontSize: 15, color: "#8A7F96", margin: "0 0 8px" }}>No observations recorded{filterDate === todayStr() ? " today" : " for this date"}</p>
          <button onClick={() => { resetForm(); setShowForm(true); }} style={btnPrimary}>Record First Observation</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredObs.map(obs => {
            const child = children.find(c => String(c.id) === String(obs.childId));
            const room = child ? rooms.find(r => r.id === child.roomId) : null;
            const obsType = OBSERVATION_TYPES.find(t => t.id === obs.type);
            const time = new Date(obs.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
            const linkedOutcomes = (obs.eylfOutcomes || []).map(eId => {
              const out = getOutcome(eId);
              return out ? { ...out, eId } : null;
            }).filter(Boolean);

            return (
              <div key={obs.id} style={{ ...card, padding: 16, display: "flex", gap: 14 }}>
                {/* Timeline marker */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 50, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: "#A89DB5", fontWeight: 700, letterSpacing: "0.05em" }}>{time}</span>
                  <div style={{ width: 2, flex: 1, background: "#D9D0C7", marginTop: 6 }} />
                </div>

                <div style={{ flex: 1 }}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: "#E8E0D8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#A88BC7" }}>
                        {child?.firstName?.[0]}{child?.lastName?.[0]}
                      </div>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#3D3248" }}>{obs.childName}</span>
                        {room && <span style={{ fontSize: 11, color: "#A89DB5", marginLeft: 8 }}>{room.name}</span>}
                      </div>
                    </div>
                    <span style={tagStyle("#9B7DC0")}>{obsType?.icon} {obsType?.label}</span>
                  </div>

                  {/* Narrative */}
                  <p style={{ fontSize: 13, color: "#5C4E6A", lineHeight: 1.7, margin: "0 0 10px" }}>{obs.narrative}</p>

                  {/* Media attachments */}
                  {obs.media?.length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                      {obs.media.map(m => (
                        <span key={m.id} style={{ background: "#E8E0D8", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#8A7F96" }}>{m.name}</span>
                      ))}
                    </div>
                  )}

                  {/* Tags */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(obs.domains || []).map(dId => {
                      const d = getDomain(dId);
                      return d ? <span key={dId} style={tagStyle(d.color)}>{d.icon} {d.label}</span> : null;
                    })}
                    {linkedOutcomes.map(lo => (
                      <span key={lo.eId} style={tagStyle(lo.parent.color)}>{lo.parent.icon} EYLF {lo.eId}</span>
                    ))}
                  </div>

                  {/* Follow-up */}
                  {obs.followUp && (
                    <div style={{ marginTop: 8, background: "#F8F5F1", borderRadius: 6, padding: "8px 10px", borderLeft: "2px solid #A88BC7" }}>
                      <span style={{ fontSize: 10, color: "#A88BC7", fontWeight: 600 }}>NEXT STEPS</span>
                      <p style={{ fontSize: 12, color: "#8A7F96", margin: "4px 0 0" }}>{obs.followUp}</p>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button onClick={() => handleEdit(obs)}
                      style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #DDD6EE", background: "#fff", cursor: "pointer", color: "#5C4E6A" }}>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(obs.id)}
                      style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", cursor: "pointer" }}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
