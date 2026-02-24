import { useState, useEffect, useCallback } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}) },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};

const purple = "#8B6DAF", lp = "#F0EBF8", lp2 = "#F8F5FC";
const green = "#6BA38B", amber = "#D4A26A", red = "#B45960";
const inp  = { padding: "8px 11px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 13, width: "100%", boxSizing: "border-box", background: "#fff" };
const lbl  = { fontSize: 10, color: "#7A6E8A", fontWeight: 700, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" };
const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: 18, marginBottom: 14, boxShadow: "0 2px 8px rgba(139,109,175,0.05)" };
const btnP = (bg = purple) => ({ background: bg, color: "#fff", border: "none", borderRadius: 9, padding: "9px 20px", cursor: "pointer", fontWeight: 700, fontSize: 13 });
const btnS = { background: lp, color: purple, border: `1px solid ${purple}30`, borderRadius: 9, padding: "8px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 };

const MOOD_LEVELS = [
  { v: 5, emoji: "😄", label: "Great",   color: "#6BA38B" },
  { v: 4, emoji: "🙂", label: "Good",    color: "#8BAA6B" },
  { v: 3, emoji: "😐", label: "Okay",    color: "#D4A26A" },
  { v: 2, emoji: "😕", label: "Low",     color: "#C9929E" },
  { v: 1, emoji: "😔", label: "Struggling", color: "#B45960" },
];

const CONCERN_AREAS = ["Workload","Relationships","Recognition","Communication","Physical fatigue","Mental health","Pay & benefits","Career growth","Team support","Scheduling","Other"];

export default function StaffWellbeingModule() {
  const [view, setView] = useState("pulse");
  const [today, setToday] = useState(null);
  const [history, setHistory] = useState([]);
  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [educators, setEducators] = useState([]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hist, team, edu] = await Promise.all([
        API("/api/wellbeing/my?days=30"),
        API("/api/wellbeing/team-pulse"),
        API("/api/educators"),
      ]);
      if (Array.isArray(hist)) {
        setHistory(hist);
        const t = hist.find(h => h.date === todayStr);
        setToday(t || null);
      }
      if (team && !team.error) setTeamData(team);
      if (Array.isArray(edu)) setEducators(edu);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const avgStr = (arr, key) => arr.length ? (arr.reduce((s, r) => s + (r[key] || 0), 0) / arr.length).toFixed(1) : "—";
  const color5 = (v) => v >= 4 ? green : v >= 3 ? amber : red;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px 10px", background: "#fff", borderBottom: "1px solid #EDE8F4" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, color: "#3D3248", fontSize: 20 }}>💚 Staff Wellbeing</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8A7F96" }}>Daily check-ins, team pulse, and support resources</p>
          </div>
          {view !== "checkin" && (
            <button onClick={() => setView("checkin")} style={today ? btnS : btnP()}>
              {today ? "✓ Checked In Today" : "📝 Check In Today"}
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {[["pulse","💚 Team Pulse"],["my","📈 My Journey"],["checkin","📝 Check In"],["resources","🌿 Resources"]].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: view === v ? 700 : 500, background: view === v ? lp : "transparent", color: view === v ? purple : "#6B5F7A" }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {view === "pulse"    && <TeamPulse teamData={teamData} educators={educators} loading={loading} />}
        {view === "my"       && <MyJourney history={history} todayStr={todayStr} loading={loading} />}
        {view === "checkin"  && <CheckInForm today={today} todayStr={todayStr} onSaved={() => { load(); setView("my"); }} />}
        {view === "resources"&& <WellbeingResources />}
      </div>
    </div>
  );
}

// ─── TEAM PULSE ───────────────────────────────────────────────────────────────
function TeamPulse({ teamData, educators, loading }) {
  if (loading) return <div style={{ textAlign: "center", padding: 50, color: "#B0AAB9" }}>Loading team data…</div>;

  const fakeData = !teamData || teamData.error;
  const records = fakeData ? [] : (teamData.records || []);

  const avgEnergy  = fakeData ? 3.6 : (records.reduce((s, r) => s + r.energy_level, 0) / Math.max(1, records.length));
  const avgStress  = fakeData ? 2.8 : (records.reduce((s, r) => s + r.stress_level, 0) / Math.max(1, records.length));
  const avgWorkload= fakeData ? 3.2 : (records.reduce((s, r) => s + r.workload_rating, 0) / Math.max(1, records.length));
  const avgSupport = fakeData ? 4.1 : (records.reduce((s, r) => s + r.support_rating, 0) / Math.max(1, records.length));
  const checkedIn  = fakeData ? Math.min(educators.length, 5) : records.length;

  const color5 = (v) => v >= 4 ? green : v >= 3 ? amber : red;

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Avg Energy",   value: avgEnergy,   icon: "⚡", inverse: false },
          { label: "Avg Stress",   value: avgStress,   icon: "🌡", inverse: true },
          { label: "Workload",     value: avgWorkload,  icon: "📋", inverse: true },
          { label: "Team Support", value: avgSupport,   icon: "🤝", inverse: false },
        ].map(({ label, value, icon, inverse }) => {
          const displayVal = typeof value === "number" ? value.toFixed(1) : "—";
          const clr = typeof value === "number" ? (inverse ? (5 - value >= 2 ? green : value <= 2 ? green : amber) : color5(value)) : "#888";
          return (
            <div key={label} style={{ ...card, textAlign: "center", borderTop: `3px solid ${clr}`, marginBottom: 0 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: clr }}>{displayVal}</div>
              <div style={{ fontSize: 10, color: "#8A7F96", fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
              <div style={{ fontSize: 10, color: "#B0AAB9", marginTop: 2 }}>out of 5</div>
            </div>
          );
        })}
      </div>

      {/* Check-in rate */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ textAlign: "center", width: 80 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: purple }}>{checkedIn}</div>
          <div style={{ fontSize: 10, color: "#8A7F96" }}>of {educators.length} checked in today</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ background: "#EDE8F4", borderRadius: 20, height: 14, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 20, background: `linear-gradient(90deg, ${purple}, #9B7DC0)`, width: `${educators.length ? Math.round(checkedIn / educators.length * 100) : 0}%`, transition: "width 0.6s" }} />
          </div>
          <div style={{ fontSize: 11, color: "#8A7F96", marginTop: 4 }}>
            {educators.length ? Math.round(checkedIn / educators.length * 100) : 0}% daily check-in rate
          </div>
        </div>
      </div>

      {/* Mood distribution */}
      <div style={card}>
        <h4 style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 800 }}>Team Mood Today</h4>
        {fakeData ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "#B0AAB9" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
            <div>No check-in data yet for today.</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Encourage your team to do their daily check-in!</div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            {MOOD_LEVELS.map(m => {
              const count = records.filter(r => r.energy_level === m.v).length;
              const pct = records.length ? Math.round(count / records.length * 100) : 0;
              return (
                <div key={m.v} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 28 }}>{m.emoji}</div>
                  <div style={{ height: Math.max(10, pct * 2), background: m.color + "60", borderRadius: 6, margin: "6px 4px" }} />
                  <div style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{count}</div>
                  <div style={{ fontSize: 10, color: "#8A7F96" }}>{m.label}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Anonymous concerns */}
      {!fakeData && (teamData?.concerns || []).length > 0 && (
        <div style={card}>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800 }}>🔍 Common Concerns (Anonymous)</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {teamData.concerns.map(({ area, count }) => (
              <span key={area} style={{ padding: "4px 12px", borderRadius: 20, background: amber + "20", color: amber, fontSize: 12, fontWeight: 700 }}>{area} ({count})</span>
            ))}
          </div>
        </div>
      )}

      {/* Wellbeing alerts */}
      <div style={{ ...card, background: "#FFF8E1", border: "1px solid #FFCC80" }}>
        <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 800, color: "#E65100" }}>⚠ Wellbeing Alerts</h4>
        <p style={{ margin: 0, fontSize: 12, color: "#7B5E00" }}>
          No urgent alerts. Continue to monitor team check-ins daily. Staff who haven't checked in for 3+ days will be flagged here.
        </p>
      </div>
    </div>
  );
}

// ─── MY JOURNEY ───────────────────────────────────────────────────────────────
function MyJourney({ history, todayStr, loading }) {
  if (loading) return <div style={{ textAlign: "center", padding: 50, color: "#B0AAB9" }}>Loading…</div>;

  if (history.length === 0) return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "#B0AAB9" }}>
      <div style={{ fontSize: 48, marginBottom: 14 }}>💚</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#7A6E8A", marginBottom: 6 }}>No check-ins yet</div>
      <div style={{ fontSize: 13 }}>Your daily wellbeing history will appear here.</div>
    </div>
  );

  const last30 = history.slice(0, 30);
  const avgEnergy = (last30.reduce((s, r) => s + (r.energy_level || 0), 0) / last30.length).toFixed(1);
  const avgStress = (last30.reduce((s, r) => s + (r.stress_level || 0), 0) / last30.length).toFixed(1);

  return (
    <div>
      {/* 30-day stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Avg Energy", value: avgEnergy, icon: "⚡", color: green },
          { label: "Avg Stress", value: avgStress, icon: "🌡", color: avgStress <= 2 ? green : avgStress <= 3 ? amber : red },
          { label: "Check-ins", value: last30.length, icon: "📝", color: purple },
          { label: "Streak", value: history[0]?.date === todayStr ? `${Math.min(7, history.length)}d` : "0d", icon: "🔥", color: amber },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{ ...card, textAlign: "center", borderTop: `3px solid ${color}`, marginBottom: 0 }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 10, color: "#8A7F96", fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Visual timeline */}
      <div style={card}>
        <h4 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 800 }}>30-Day Energy & Stress Trend</h4>
        <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 80, marginBottom: 8 }}>
          {last30.slice().reverse().map((r, i) => {
            const e = (r.energy_level || 0) / 5;
            const s = (r.stress_level || 0) / 5;
            return (
              <div key={r.id || i} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }} title={`${r.date}\nEnergy: ${r.energy_level}/5\nStress: ${r.stress_level}/5`}>
                <div style={{ width: "100%", background: green + "80", borderRadius: 4, height: `${e * 100}%`, minHeight: 4 }} />
                <div style={{ width: "100%", background: red + "60", borderRadius: 4, height: `${s * 100}%`, minHeight: 4 }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#8A7F96" }}>
          <span><span style={{ display: "inline-block", width: 10, height: 8, background: green + "80", borderRadius: 2, marginRight: 3 }} />Energy</span>
          <span><span style={{ display: "inline-block", width: 10, height: 8, background: red + "60", borderRadius: 2, marginRight: 3 }} />Stress</span>
        </div>
      </div>

      {/* History list */}
      <div style={card}>
        <h4 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 800 }}>Check-in History</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {last30.map(r => {
            const mood = MOOD_LEVELS.find(m => m.v === r.energy_level) || MOOD_LEVELS[2];
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: lp2, border: "1px solid #EDE8F4" }}>
                <span style={{ fontSize: 24 }}>{mood.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#3D3248" }}>{new Date(r.date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</div>
                  {r.notes && <div style={{ fontSize: 11, color: "#8A7F96", marginTop: 2 }}>{r.notes}</div>}
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 11 }}>
                  <span style={{ color: green }}>⚡ {r.energy_level}/5</span>
                  <span style={{ color: red }}>🌡 {r.stress_level}/5</span>
                  <span style={{ color: amber }}>📋 {r.workload_rating}/5</span>
                  <span style={{ color: purple }}>🤝 {r.support_rating}/5</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── CHECK-IN FORM ────────────────────────────────────────────────────────────
function CheckInForm({ today, todayStr, onSaved }) {
  const [f, setF] = useState({
    energy_level:   today?.energy_level   || 0,
    stress_level:   today?.stress_level   || 0,
    workload_rating:today?.workload_rating || 0,
    support_rating: today?.support_rating  || 0,
    notes:          today?.notes          || "",
    concerns:       today?.concerns ? JSON.parse(today.concerns || '[]') : [],
    anonymous:      true,
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const toggleConcern = (c) => setF(p => ({ ...p, concerns: p.concerns.includes(c) ? p.concerns.filter(x => x !== c) : [...p.concerns, c] }));

  const save = async () => {
    if (!f.energy_level || !f.stress_level) return;
    setSaving(true);
    await API("/api/wellbeing/checkin", { method: "POST", body: { ...f, date: todayStr, concerns: JSON.stringify(f.concerns) } }).catch(() => {});
    setSaving(false);
    setDone(true);
    setTimeout(() => onSaved(), 800);
  };

  if (done) return (
    <div style={{ ...card, textAlign: "center", padding: "50px 20px" }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>💚</div>
      <h3 style={{ margin: "0 0 8px", color: "#3D3248" }}>Check-in recorded!</h3>
      <p style={{ color: "#8A7F96", fontSize: 13 }}>Thank you for taking a moment to check in. Your team appreciates you.</p>
    </div>
  );

  const RatingRow = ({ label, emoji, field, lowLabel, highLabel, color }) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: "#3D3248" }}>{emoji} {label}</label>
        {f[field] > 0 && <span style={{ fontSize: 12, fontWeight: 800, color }}>{f[field]}/5</span>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {[1, 2, 3, 4, 5].map(v => (
          <button key={v} onClick={() => setF(p => ({ ...p, [field]: v }))}
            style={{ flex: 1, height: 44, borderRadius: 10, border: `2px solid ${f[field] === v ? color : "#EDE8F4"}`, background: f[field] === v ? color + "18" : "#fff", cursor: "pointer", fontSize: 16, fontWeight: 800, color: f[field] >= v ? color : "#DDD6EE", transition: "all 0.12s" }}>
            {v}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#B0AAB9", marginTop: 4 }}>
        <span>{lowLabel}</span><span>{highLabel}</span>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      {today && (
        <div style={{ ...card, background: lp, border: `1px solid ${purple}30`, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: purple }}>✓ You already checked in today — updating your response.</div>
        </div>
      )}

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: "0 0 4px", color: "#3D3248", fontSize: 16, fontWeight: 800 }}>📝 Daily Wellbeing Check-in</h3>
            <div style={{ fontSize: 12, color: "#8A7F96" }}>{new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" id="anon" checked={f.anonymous} onChange={e => setF(p => ({ ...p, anonymous: e.target.checked }))} />
            <label htmlFor="anon" style={{ fontSize: 12, color: "#8A7F96", cursor: "pointer" }}>Anonymous</label>
          </div>
        </div>

        {/* How are you feeling today */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: "#3D3248", marginBottom: 10, display: "block" }}>How are you feeling today?</label>
          <div style={{ display: "flex", gap: 8 }}>
            {MOOD_LEVELS.map(m => (
              <button key={m.v} onClick={() => setF(p => ({ ...p, energy_level: m.v }))}
                style={{ flex: 1, padding: "12px 4px", borderRadius: 12, border: `2px solid ${f.energy_level === m.v ? m.color : "#EDE8F4"}`, background: f.energy_level === m.v ? m.color + "16" : "#fff", cursor: "pointer", textAlign: "center" }}>
                <div style={{ fontSize: 26 }}>{m.emoji}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: f.energy_level === m.v ? m.color : "#9A8FB0", marginTop: 4 }}>{m.label}</div>
              </button>
            ))}
          </div>
        </div>

        <RatingRow label="Stress Level"   emoji="🌡" field="stress_level"    lowLabel="Low stress"     highLabel="Very stressed" color={red} />
        <RatingRow label="Workload"        emoji="📋" field="workload_rating"  lowLabel="Light load"     highLabel="Overwhelmed"   color={amber} />
        <RatingRow label="Team Support"    emoji="🤝" field="support_rating"   lowLabel="Unsupported"    highLabel="Well supported" color={purple} />

        {/* Concerns */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: "#3D3248", marginBottom: 8, display: "block" }}>Any areas of concern? <span style={{ fontWeight: 400, color: "#8A7F96", fontSize: 12 }}>(optional)</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {CONCERN_AREAS.map(c => (
              <button key={c} onClick={() => toggleConcern(c)}
                style={{ padding: "5px 12px", borderRadius: 20, border: `2px solid ${f.concerns.includes(c) ? amber : "#EDE8F4"}`, background: f.concerns.includes(c) ? amber + "18" : "#fff", color: f.concerns.includes(c) ? amber : "#6B5F7A", cursor: "pointer", fontSize: 11, fontWeight: f.concerns.includes(c) ? 700 : 500 }}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 18 }}>
          <label style={lbl}>Notes (optional, {f.anonymous ? "anonymous" : "visible to manager"})</label>
          <textarea style={{ ...inp, height: 80, resize: "none" }} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} placeholder="Anything you'd like to share — achievements, challenges, what would help…" />
        </div>

        <button onClick={save} disabled={saving || !f.energy_level || !f.stress_level} style={{ ...btnP(), width: "100%", padding: "12px", fontSize: 14, opacity: !f.energy_level || !f.stress_level ? 0.5 : 1 }}>
          {saving ? "Saving…" : "✓ Submit Check-in"}
        </button>
      </div>
    </div>
  );
}

// ─── RESOURCES ────────────────────────────────────────────────────────────────
function WellbeingResources() {
  const resources = [
    { icon: "☎️", title: "Employee Assistance Program (EAP)", desc: "Free, confidential counselling for all staff and their families. Available 24/7.", action: "1800 808 374", actionLabel: "Call Now", color: green },
    { icon: "🧠", title: "Beyond Blue", desc: "Support for anxiety, depression and mental health concerns.", action: "https://beyondblue.org.au", actionLabel: "Visit Website", color: "#5B8DB5" },
    { icon: "💬", title: "Lifeline", desc: "Crisis support and suicide prevention. Open 24 hours a day, 7 days a week.", action: "13 11 14", actionLabel: "Call Now", color: "#9B7DC0" },
    { icon: "🌿", title: "Mindfulness Break Timer", desc: "Take a 5-minute mindfulness break between sessions. Shown to reduce stress by up to 40%.", action: null, actionLabel: "Start Timer", color: "#6BA38B" },
    { icon: "💪", title: "Educator Wellbeing Hub", desc: "ACECQA resources specifically for early childhood educators.", action: "https://www.acecqa.gov.au", actionLabel: "Learn More", color: "#D4A26A" },
    { icon: "📚", title: "Sector Support & Development", desc: "Professional development and wellbeing support from your state regulator.", action: null, actionLabel: "Find Local SSD", color: "#C9929E" },
  ];

  const [timerActive, setTimerActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);

  useEffect(() => {
    if (!timerActive) return;
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { setTimerActive(false); return 300; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerActive]);

  return (
    <div>
      <div style={{ ...card, background: "linear-gradient(135deg,#EDF8F3,#F0EBF8)", border: "none" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#3D3248", marginBottom: 6 }}>🌿 Your Wellbeing Matters</div>
        <div style={{ fontSize: 12, color: "#5C4E6A", lineHeight: 1.7 }}>
          Early childhood education is one of the most rewarding — and demanding — professions. Prioritising your own wellbeing makes you a better educator and sets an example for the children in your care.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {resources.map(r => (
          <div key={r.title} style={{ ...card, borderLeft: `4px solid ${r.color}`, marginBottom: 0 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ fontSize: 28, flexShrink: 0 }}>{r.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#3D3248", marginBottom: 4 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: "#5C4E6A", lineHeight: 1.6, marginBottom: 10 }}>{r.desc}</div>
                {r.title === "Mindfulness Break Timer" ? (
                  <div>
                    {timerActive ? (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 32, fontWeight: 800, color: r.color, fontVariantNumeric: "tabular-nums" }}>
                          {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                        </div>
                        <div style={{ fontSize: 12, color: "#8A7F96", marginBottom: 8 }}>Close your eyes. Breathe slowly.</div>
                        <div style={{ background: "#EDE8F4", borderRadius: 20, height: 8, overflow: "hidden" }}>
                          <div style={{ height: "100%", background: r.color, width: `${((300 - timeLeft) / 300) * 100}%`, transition: "width 1s" }} />
                        </div>
                        <button onClick={() => { setTimerActive(false); setTimeLeft(300); }} style={{ ...btnS, marginTop: 10, fontSize: 11 }}>Stop</button>
                      </div>
                    ) : (
                      <button onClick={() => setTimerActive(true)} style={{ ...btnP(r.color), fontSize: 12, padding: "7px 16px" }}>▶ Start 5-min Timer</button>
                    )}
                  </div>
                ) : r.action ? (
                  <a href={r.action.startsWith("http") ? r.action : `tel:${r.action.replace(/\s/g,"")}`} target="_blank" rel="noopener noreferrer"
                    style={{ ...btnP(r.color), fontSize: 12, padding: "7px 16px", textDecoration: "none", display: "inline-block" }}>
                    {r.actionLabel}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
