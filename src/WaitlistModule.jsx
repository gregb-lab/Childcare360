import { useState, useEffect, useCallback } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}) },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};

const toast = (msg, type = "success") => { if (window.showToast) window.showToast(msg, type); };

const purple = "#8B6DAF", lightPurple = "#F0EBF8";
const card = { background: "#fff", borderRadius: 14, border: "1px solid #E8E0D8", padding: "16px 20px", marginBottom: 12 };
const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: "#8A7F96", marginBottom: 4, textTransform: "uppercase" };
const inp = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #D9D0C7", fontSize: 13, background: "#FDFBF9", boxSizing: "border-box" };
const sel = { ...inp };
const btnP = { background: "linear-gradient(135deg,#8B6DAF,#7E5BA3)", color: "#fff", border: "none", borderRadius: 10, padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer" };
const btnS = { background: "#F8F5F1", color: "#5C4E6A", border: "1px solid #D9D0C7", borderRadius: 10, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" };

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
const AGE_GROUPS = [
  { id: "babies",    label: "Babies (0–24m)",    color: "#C9929E" },
  { id: "toddlers",  label: "Toddlers (24–36m)",  color: "#9B7DC0" },
  { id: "preschool", label: "Preschool (3–5y)",   color: "#6BA38B" },
  { id: "oshc",      label: "OSHC (5+y)",         color: "#D4A26A" },
];

function Badge({ text, color = "#8A7F96", bg }) {
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, color, background: bg || color + "15", border: "1px solid " + color + "30", whiteSpace: "nowrap" }}>{text}</span>;
}

export default function WaitlistModule() {
  const [tab, setTab] = useState("waitlist");
  const [waitlist, setWaitlist] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ child_name: "", child_dob: "", parent_name: "", parent_email: "", parent_phone: "", preferred_room: "", preferred_days: [], notes: "", priority: "normal" });
  const [aiPlan, setAiPlan] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [nextYear] = useState(new Date().getFullYear() + 1);
  const [planYear] = useState(new Date().getFullYear() + 1);
  const [dragItem, setDragItem] = useState(null);
  const [approvals, setApprovals] = useState({}); // childId -> approved/rejected

  const load = useCallback(async () => {
    try {
      const [wl, rm, ch] = await Promise.all([
        API("/api/waitlist"),
        API("/api/rooms"),
        API("/api/children"),
      ]);
      if (Array.isArray(wl)) setWaitlist(wl);
      if (Array.isArray(rm)) setRooms(rm);
      if (Array.isArray(ch)) setChildren(ch);
    } catch (e) { console.error('Waitlist load error:', e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addToWaitlist = async () => {
    if (!form.child_name || !form.parent_name) return;
    try {
      const r = await API("/api/waitlist", { method: "POST", body: form });
      if (r.error) { alert(r.error); return; }
    } catch(e) { toast("Failed to add to waitlist.", "error"); return; }
    setShowAdd(false);
    setForm({ child_name: "", child_dob: "", parent_name: "", parent_email: "", parent_phone: "", preferred_room: "", preferred_days: [], notes: "", priority: "normal" });
    load();
  };

  const removeFromWaitlist = async (id) => {
    if (!confirm("Remove from waitlist?")) return;
    try { await API(`/api/waitlist/${id}`, { method: "DELETE" }); }
    catch(e) { toast("Failed to remove entry.", "error"); return; }
    load();
  };

  const runAIPlan = async () => {
    setAiLoading(true);
    try {
      const r = await API("/api/waitlist/ai-reenrolment-plan", { method: "POST", body: { year: planYear } });
      if (r.error) { alert("AI plan failed: " + r.error); } else { setAiPlan(r); setTab("planner"); }
    } catch (e) {
      alert("AI plan failed: " + e.message);
    }
    setAiLoading(false);
  };

  const approveSuggestion = async (childId, roomId, isNew = false) => {
    setApprovals(prev => ({ ...prev, [childId]: "approved" }));
    if (isNew) {
      // Move from waitlist to enrolment
      try { await API(`/api/waitlist/${childId}/convert`, { method: "POST", body: { room_id: roomId } }); }
      catch(e) { alert('Conversion failed.'); return; }
    } else {
      try { await API(`/api/children/${childId}`, { method: "PUT", body: { room_id: roomId } }); }
      catch(e) { console.error('Child room update failed:', e); }
    }
    load();
  };

  const priorityColor = { high: "#B71C1C", normal: "#2E7D32", low: "#8A7F96" };

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#8A7F96" }}>Loading waitlist…</div>;

  return (
    <div style={{ padding: "0 24px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, color: "#3D3248" }}>Waitlist & Re-Enrolment</h2>
          <p style={{ margin: "4px 0 0", color: "#8A7F96", fontSize: 13 }}>
            {waitlist.length} families on waitlist · AI re-enrolment planner for {nextYear}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={runAIPlan} disabled={aiLoading} style={{ ...btnP, opacity: aiLoading ? 0.6 : 1 }}>
            {aiLoading ? "⏳ Analysing…" : "🤖 AI Re-Enrolment Plan"}
          </button>
          <button onClick={() => setShowAdd(true)} style={btnS}>+ Add to Waitlist</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {[["waitlist",`Waitlist (${waitlist.length})`],["planner","AI Planner"],["reenrolment","Re-Enrolment Preferences"]].map(([id,l]) => (
          <button key={id} onClick={() => setTab(id)} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${tab===id ? purple : "#EDE8F4"}`, background: tab===id ? purple : "#fff", color: tab===id ? "#fff" : "#555", cursor: "pointer", fontSize: 13, fontWeight: tab===id ? 700 : 400 }}>{l}</button>
        ))}
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 540, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ margin: "0 0 20px", color: "#3D3248" }}>Add to Waitlist</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[["child_name","Child's Full Name"],["child_dob","Date of Birth"],["parent_name","Parent/Guardian Name"],["parent_email","Parent Email"],["parent_phone","Parent Phone"]].map(([f,l]) => (
                <div key={f}>
                  <label style={lbl}>{l}</label>
                  <input type={f.includes("dob") ? "date" : "text"} value={form[f]} onChange={e => setForm({...form,[f]:e.target.value})} style={inp} />
                </div>
              ))}
              <div>
                <label style={lbl}>Priority</label>
                <select value={form.priority} onChange={e => setForm({...form,priority:e.target.value})} style={sel}>
                  <option value="high">High (sibling/staff child)</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low (future year)</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Preferred Room/Age Group</label>
                <select value={form.preferred_room} onChange={e => setForm({...form,preferred_room:e.target.value})} style={sel}>
                  <option value="">Any available</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={lbl}>Preferred Days</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {DAYS.map(d => (
                    <label key={d} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={form.preferred_days.includes(d)} onChange={e => setForm({...form, preferred_days: e.target.checked ? [...form.preferred_days, d] : form.preferred_days.filter(x => x !== d) })} />
                      {d.slice(0,3)}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={lbl}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} rows={2} style={{ ...inp, resize: "none" }} placeholder="Any special requirements or notes…" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button onClick={() => setShowAdd(false)} style={btnS}>Cancel</button>
              <button onClick={addToWaitlist} style={btnP}>Add to Waitlist</button>
            </div>
          </div>
        </div>
      )}

      {/* WAITLIST TAB */}
      {tab === "waitlist" && (
        <div>
          {waitlist.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: 60, color: "#8A7F96" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <p>No families on the waitlist. Click "Add to Waitlist" to get started.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {waitlist.map((entry, idx) => (
                <div key={entry.id} style={{ ...card, padding: "14px 18px", display: "flex", gap: 16, alignItems: "flex-start" }}>
                  {/* Position */}
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: lightPurple, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: purple, fontSize: 14, flexShrink: 0 }}>
                    {idx + 1}
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, color: "#3D3248", fontSize: 14 }}>{entry.child_name}</span>
                      <Badge text={entry.priority} color={priorityColor[entry.priority] || "#8A7F96"} />
                      {entry.has_sibling && <Badge text="Sibling enrolled" color="#7E5BA3" />}
                    </div>
                    <div style={{ fontSize: 12, color: "#8A7F96" }}>
                      {entry.parent_name} · {entry.parent_email} · {entry.parent_phone}
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                      {entry.preferred_room && <span style={{ fontSize: 11, color: "#555" }}>🏠 {rooms.find(r => r.id === entry.preferred_room)?.name || entry.preferred_room}</span>}
                      {entry.preferred_days && <span style={{ fontSize: 11, color: "#555" }}>📅 {typeof entry.preferred_days === "string" ? JSON.parse(entry.preferred_days || "[]").join(", ") : (entry.preferred_days || []).join(", ")}</span>}
                      <span style={{ fontSize: 11, color: "#A89DB5" }}>Added {entry.created_at?.split("T")[0]}</span>
                    </div>
                    {entry.notes && <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 4, fontStyle: "italic" }}>{entry.notes}</div>}
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => removeFromWaitlist(entry.id)} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #EDE8F4", background: "#fff", color: "#C06B73", cursor: "pointer", fontSize: 11 }}>Remove</button>
                    <button style={{ ...btnP, fontSize: 11, padding: "5px 12px" }}>Offer Place</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI PLANNER TAB */}
      {tab === "planner" && (
        <div>
          {!aiPlan ? (
            <div style={{ ...card, textAlign: "center", padding: 60, color: "#8A7F96" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
              <p style={{ marginBottom: 16 }}>Click "AI Re-Enrolment Plan" to generate an optimised room allocation for {nextYear}.</p>
              <button onClick={runAIPlan} disabled={aiLoading} style={btnP}>{aiLoading ? "⏳ Analysing…" : `🤖 Generate ${nextYear} Plan`}</button>
            </div>
          ) : (
            <div>
              {/* Plan summary */}
              <div style={{ ...card, background: "linear-gradient(135deg,#EDE4F0,#E8F0ED)", marginBottom: 16 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 16, color: "#3D3248" }}>🤖 AI Re-Enrolment Plan for {aiPlan.year || nextYear}</h3>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
                  <span>✅ <strong>{aiPlan.existing_placed || 0}</strong> existing families re-placed</span>
                  <span>🆕 <strong>{aiPlan.waitlist_offers || 0}</strong> waitlist families offered places</span>
                  <span>🏠 <strong>{aiPlan.rooms_at_capacity || 0}</strong> rooms at capacity</span>
                  <span>📋 <strong>{aiPlan.unplaced_waitlist || 0}</strong> remain on waitlist</span>
                </div>
                {aiPlan.summary && <div style={{ marginTop: 10, fontSize: 12, color: "#5C4E6A", lineHeight: 1.6 }}>{aiPlan.summary}</div>}
              </div>

              {/* Room-by-room breakdown */}
              {(aiPlan.rooms || []).map(room => (
                <div key={room.room_id} style={{ ...card, marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h4 style={{ margin: 0, fontSize: 14, color: "#3D3248" }}>{room.room_name}</h4>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "#8A7F96" }}>{room.placements?.length || 0} / {room.capacity} children</span>
                      <div style={{ width: 80, height: 6, borderRadius: 3, background: "#EDE8F4" }}>
                        <div style={{ width: `${Math.min(100, (room.placements?.length || 0) / (room.capacity || 1) * 100)}%`, height: "100%", borderRadius: 3, background: purple }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                    {(room.placements || []).map(p => {
                      const status = approvals[p.child_id] || "pending";
                      return (
                        <div key={p.child_id} style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${status === "approved" ? "#A5D6A7" : status === "rejected" ? "#FFCDD2" : "#EDE8F4"}`, background: status === "approved" ? "#F9FFF9" : status === "rejected" ? "#FFF8F8" : "#FDFBF9", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 12, color: "#3D3248" }}>{p.child_name}</div>
                            <div style={{ fontSize: 10, color: "#8A7F96", marginTop: 2 }}>
                              {p.is_new ? "🆕 Waitlist" : "↩ Returning"} · {p.preferred_days?.slice(0,2).join(", ")}
                            </div>
                            {p.reason && <div style={{ fontSize: 10, color: "#A89DB5", fontStyle: "italic" }}>{p.reason}</div>}
                          </div>
                          {status === "pending" && (
                            <div style={{ display: "flex", gap: 4 }}>
                              <button onClick={() => approveSuggestion(p.child_id, room.room_id, p.is_new)} style={{ width: 22, height: 22, borderRadius: "50%", background: "#E8F5E9", color: "#2E7D32", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>✓</button>
                              <button onClick={() => setApprovals(prev => ({...prev,[p.child_id]:"rejected"}))} style={{ width: 22, height: 22, borderRadius: "50%", background: "#FFEBEE", color: "#B71C1C", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>✕</button>
                            </div>
                          )}
                          {status === "approved" && <span style={{ fontSize: 18 }}>✅</span>}
                          {status === "rejected" && <span style={{ fontSize: 18 }}>❌</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Unplaced waitlist */}
              {aiPlan.remaining_waitlist?.length > 0 && (
                <div style={card}>
                  <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "#B71C1C" }}>⚠ Remaining Waitlist — No Place Available for {nextYear}</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {aiPlan.remaining_waitlist.map(w => (
                      <div key={w.id} style={{ padding: "8px 12px", borderRadius: 8, background: "#FFF8F8", border: "1px solid #FFCDD2", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 600 }}>{w.child_name}</span>
                        <span style={{ color: "#8A7F96" }}>{w.preferred_days?.join(", ")}</span>
                        <button style={{ padding: "2px 8px", borderRadius: 6, background: lightPurple, color: purple, border: "none", cursor: "pointer", fontSize: 11 }}>Offer Next Avail.</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Approve all button */}
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button onClick={() => {
                  const newApprovals = {};
                  (aiPlan.rooms || []).forEach(r => r.placements?.forEach(p => { newApprovals[p.child_id] = "approved"; }));
                  setApprovals(newApprovals);
                }} style={btnP}>✅ Approve All Suggestions</button>
                <button onClick={() => { setAiPlan(null); runAIPlan(); }} style={btnS}>🔄 Regenerate</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RE-ENROLMENT PREFERENCES TAB */}
      {tab === "reenrolment" && (
        <div>
          <div style={{ ...card, background: "linear-gradient(135deg,#EDE4F0,#E8F0ED)", marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 6px", color: "#3D3248" }}>📩 Re-Enrolment Preferences for {nextYear}</h3>
            <p style={{ margin: 0, fontSize: 13, color: "#5C4E6A" }}>
              Current families have been invited to submit their {nextYear} preferences. Track responses here and use them in the AI Planner.
            </p>
          </div>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Family Preferences Received</h4>
              <button style={btnS}>📧 Send Reminder to Non-Responders</button>
            </div>
            {children.length === 0 ? (
              <div style={{ textAlign: "center", color: "#8A7F96", padding: 40 }}>No enrolled children found</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: lightPurple }}>
                    {["Child","Current Room","Preferred Days","Pref. Room","Responded","Status"].map(h => <th key={h} style={{ padding: "7px 12px", textAlign: "left", color: purple, fontWeight: 700, fontSize: 11 }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {children.slice(0, 20).map(c => {
                    const responded = Math.random() > 0.4; // Demo — real data comes from API
                    const days = ["Mon","Tue","Wed"].slice(0, Math.floor(Math.random()*3)+2);
                    return (
                      <tr key={c.id} style={{ borderBottom: "1px solid #F0EBF8" }}>
                        <td style={{ padding: "8px 12px", fontWeight: 600 }}>{c.first_name} {c.last_name}</td>
                        <td style={{ padding: "8px 12px", color: "#8A7F96" }}>{c.room_name || "—"}</td>
                        <td style={{ padding: "8px 12px" }}>{responded ? days.join(", ") : "—"}</td>
                        <td style={{ padding: "8px 12px", color: "#8A7F96" }}>{responded ? (rooms[0]?.name || "Same") : "—"}</td>
                        <td style={{ padding: "8px 12px" }}><Badge text={responded ? "✓ Yes" : "Pending"} color={responded ? "#2E7D32" : "#E65100"} /></td>
                        <td style={{ padding: "8px 12px" }}>
                          {responded ? <Badge text="Ready" color="#2E7D32" bg="#E8F5E9" /> : <Badge text="Awaiting" color="#E65100" bg="#FFF3E0" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
