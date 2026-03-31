/**
 * ParentLearningInputWidget.jsx
 * Embed in ParentPortalModule.jsx — weekly learning goals from parents.
 *
 * Usage:
 *   import ParentLearningInputWidget from './ParentLearningInputWidget.jsx';
 *   <ParentLearningInputWidget childId={selectedChild.id} childName={selectedChild.first_name} />
 */
import { useState, useEffect } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}) },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};
const toast = (msg, type = "success") => { if (window.showToast) window.showToast(msg, type); };

const P = "#7C3AED", PL = "#EDE4F0", DARK = "#3D3248", MUTED = "#8A7F96";
const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: "20px 24px" };
const btnP = { padding: "10px 20px", borderRadius: 10, border: "none", background: P, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 };

function getWeekStart(offset = 0) {
  const d = new Date();
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  return mon.toISOString().split("T")[0];
}

const GOAL_SUGGESTIONS = [
  "Improve counting and number recognition",
  "Practice sharing and taking turns",
  "Develop fine motor skills through drawing",
  "Build confidence in social situations",
  "Explore creative storytelling",
  "Practise self-care routines independently",
  "Develop curiosity about nature and the outdoors",
  "Strengthen large motor skills through active play",
];

export default function ParentLearningInputWidget({ childId, childName }) {
  const [weekStart, setWeekStart] = useState(getWeekStart(1)); // next week by default
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ goals: ["", "", ""], interests: "", concerns: "", home_activities: "" });
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!childId || !weekStart) return;
    setLoading(true);
    setSubmitted(false);
    API(`/api/v2/parent-learning-input?child_id=${childId}&week=${weekStart}`)
      .then(r => {
        const entry = r.entry || r.data || null;
        if (entry) {
          setExisting(entry);
          const goals = Array.isArray(entry.goals) ? entry.goals : JSON.parse(entry.goals || "[]");
          setForm({
            goals: [...goals, "", "", ""].slice(0, 3),
            interests: entry.interests || "",
            concerns: entry.concerns || "",
            home_activities: entry.home_activities || "",
          });
        } else {
          setExisting(null);
          setForm({ goals: ["", "", ""], interests: "", concerns: "", home_activities: "" });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [childId, weekStart]);

  const updateGoal = (idx, val) => setForm(f => { const g = [...f.goals]; g[idx] = val; return { ...f, goals: g }; });

  const save = async () => {
    const goalsToSave = form.goals.map(g => g.trim()).filter(Boolean);
    if (!goalsToSave.length && !form.interests && !form.concerns && !form.home_activities) {
      toast("Please fill in at least one field", "error"); return;
    }
    setSaving(true);
    try {
      await API("/api/v2/parent-learning-input", { method: "POST", body: { child_id: childId, week_starting: weekStart, goals: goalsToSave, interests: form.interests, concerns: form.concerns, home_activities: form.home_activities } });
      toast(`Learning input shared for week of ${weekStart} ✓`);
      setSubmitted(true);
    } catch (e) { toast("Failed to save", "error"); }
    finally { setSaving(false); }
  };

  if (!childId) return null;

  return (
    <div style={{ ...card, marginTop: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800, color: DARK }}>📚 Share Learning Goals</h3>
        <p style={{ margin: 0, fontSize: 13, color: MUTED }}>
          Tell {childName ? `${childName}'s` : "your child's"} educators what you'd like to focus on — they'll weave it into the week's program.
        </p>
      </div>

      {/* Week selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {[0, 1, 2].map(offset => {
          const ws = getWeekStart(offset);
          const label = offset === 0 ? "This week" : offset === 1 ? "Next week" : `Week of ${ws}`;
          return (
            <button key={ws} onClick={() => setWeekStart(ws)}
              style={{ padding: "7px 14px", borderRadius: 9, border: `1px solid ${weekStart === ws ? P : "#DDD"}`, background: weekStart === ws ? PL : "#fff", color: weekStart === ws ? P : DARK, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              {label}
            </button>
          );
        })}
      </div>

      {loading && <div style={{ color: MUTED, fontSize: 13, marginBottom: 16 }}>Loading…</div>}

      {submitted ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: "#16A34A" }}>
          <div style={{ fontSize: 32 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginTop: 8 }}>Thank you! Your input has been shared.</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>The educators will incorporate your goals for the week of {weekStart}.</div>
          <button style={{ ...btnP, marginTop: 16, background: "#F3F4F6", color: DARK }} onClick={() => setSubmitted(false)}>Edit</button>
        </div>
      ) : (
        <>
          {/* Goals */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: DARK, display: "block", marginBottom: 8 }}>Learning Goals (up to 3)</label>
            {form.goals.map((g, i) => (
              <div key={i} style={{ marginBottom: 8, position: "relative" }}>
                <input value={g} onChange={e => updateGoal(i, e.target.value)}
                  placeholder={`Goal ${i + 1} — e.g. "${GOAL_SUGGESTIONS[i * 2]}"`}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #DDD", fontSize: 13, boxSizing: "border-box" }} />
              </div>
            ))}
            {/* Suggestions */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {GOAL_SUGGESTIONS.filter(s => !form.goals.includes(s)).slice(0, 4).map(s => (
                <button key={s} onClick={() => { const emptyIdx = form.goals.findIndex(g => !g.trim()); if (emptyIdx >= 0) updateGoal(emptyIdx, s); }}
                  style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${P}`, background: PL, color: P, fontSize: 11, cursor: "pointer" }}>
                  + {s}
                </button>
              ))}
            </div>
          </div>

          {/* Interests */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: DARK, display: "block", marginBottom: 6 }}>Current Interests at Home</label>
            <textarea value={form.interests} onChange={e => setForm(f => ({ ...f, interests: e.target.value }))}
              rows={2} placeholder="e.g. Obsessed with dinosaurs, loves helping in the kitchen, into Lego…"
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #DDD", fontSize: 13, boxSizing: "border-box", resize: "vertical" }} />
          </div>

          {/* Home activities */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: DARK, display: "block", marginBottom: 6 }}>Activities at Home This Week</label>
            <textarea value={form.home_activities} onChange={e => setForm(f => ({ ...f, home_activities: e.target.value }))}
              rows={2} placeholder="e.g. Visited the beach, helped plant vegetables, started swimming lessons…"
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #DDD", fontSize: 13, boxSizing: "border-box", resize: "vertical" }} />
          </div>

          {/* Concerns */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: DARK, display: "block", marginBottom: 6 }}>
              Concerns or Things to Watch <span style={{ fontWeight: 400, color: MUTED }}>(optional)</span>
            </label>
            <textarea value={form.concerns} onChange={e => setForm(f => ({ ...f, concerns: e.target.value }))}
              rows={2} placeholder="e.g. Has been a bit clingy this week, adjusting to new baby sibling…"
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #DDD", fontSize: 13, boxSizing: "border-box", resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button style={{ ...btnP, opacity: saving ? 0.6 : 1 }} onClick={save} disabled={saving}>
              {saving ? "Sharing…" : existing ? "Update Input" : "Share with Educators"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
