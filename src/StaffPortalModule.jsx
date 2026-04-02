import React, { useState, useEffect, useCallback, useRef } from "react";
import DatePicker from "./DatePicker.jsx";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}), ...opts.headers },
    method: opts.method || "GET", ...(opts.body ? { body: opts.body } : {}),
  }).then(r => r.json());
};

const toast = (msg, type = "success") => { if (window.showToast) window.showToast(msg, type); };

const purple = "#8B6DAF", lp = "#F0EBF8";
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const LEAVE_TYPES = ["annual","personal","long_service","study","unpaid","other"];
const fmtDate = d => d ? new Date(d + "T00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateShort = d => d ? new Date(d + "T00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "—";
const timeToMins = t => { if (!t) return 0; const [h,m] = t.split(":").map(Number); return h*60+m; };
const isExpired = d => !d || new Date(d) < new Date();
const isExpiringSoon = (d, days=30) => { if (!d) return false; const diff = (new Date(d)-new Date())/86400000; return diff > 0 && diff < days; };

const card = { background: "#fff", borderRadius: 12, padding: "20px 24px", border: "1px solid #EDE8F4" };
const inp = { padding: "8px 12px", borderRadius: 8, border: "1px solid #D9D0C7", fontSize: 13, width: "100%", boxSizing: "border-box", background: "#fff", fontFamily: "inherit" };
const lbl = { fontSize: 11, color: "#8A7F96", display: "block", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" };
const btnP = { background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit" };
const btnS = { background: lp, color: purple, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit" };

function Badge({ text, color = purple, bg = lp }) {
  return <span style={{ background: bg, color, borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{text}</span>;
}
function NumInput({ value, onChange }) {
  const [raw, setRaw] = useState(value ?? "");
  useEffect(() => { setRaw(value ?? ""); }, [value]);
  return (
    <input type="text" inputMode="decimal" value={raw}
      onChange={e => setRaw(e.target.value)}
      onBlur={() => { const n = parseFloat(raw); onChange(isNaN(n) ? 0 : n); setRaw(isNaN(n) ? "" : String(n)); }}
      style={inp} />
  );
}

// ─── Tab button ────────────────────────────────────────────────────────────────
function Tab({ label, active, onClick, badge }) {
  return (
    <button onClick={onClick} style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", position: "relative",
      background: active ? purple : "transparent", color: active ? "#fff" : "#8A7F96" }}>
      {label}
      {badge > 0 && <span style={{ position: "absolute", top: 2, right: 2, minWidth: 14, height: 14, borderRadius: 7, background: "#C9828A", color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{badge}</span>}
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
function MyRosterTab() {
  const [periods, setPeriods] = React.useState([]);
  const [selPeriod, setSelPeriod] = React.useState("");
  const [entries, setEntries] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const inp = { padding:"8px 12px",borderRadius:8,border:"1px solid #D9D0C7",fontSize:12,width:"100%",boxSizing:"border-box" };

  // Resolve current user's educator identity from JWT
  const myEmail = React.useMemo(() => {
    try { const t = localStorage.getItem("c360_token"); return JSON.parse(atob(t.split(".")[1])).email || null; } catch(e) { return null; }
  }, []);

  React.useEffect(() => {
    API("/api/rostering/periods").then(d => {
      const pub = (d.periods||[]).filter(p => p.status === "published" || p.status === "approved");
      setPeriods(pub);
      if (pub.length) setSelPeriod(pub[0].id);
    }).catch(()=>{});
  }, []);

  React.useEffect(() => {
    if (!selPeriod) return;
    setLoading(true);
    API("/api/rostering/periods/" + selPeriod).then(d => {
      // Filter to this educator's shifts by email match
      const all = d.entries || [];
      const mine = myEmail ? all.filter(e => e.educator_email === myEmail || !myEmail) : all;
      setEntries(mine.length > 0 ? mine : all.slice(0,0)); // show empty if no match
    }).catch(()=>{}).finally(()=>setLoading(false));
  }, [selPeriod, myEmail]);

  const fmtTime = t => t ? t.slice(0,5) : "";
  const fmtDate = d => { const dt = new Date(d+"T12:00"); return dt.toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"}); };
  const allDates = [...new Set(entries.map(e=>e.date))].sort();

  return (
    <div style={{ padding:"0 4px" }}>
      <h3 style={{ margin:"0 0 16px",color:"#3D3248",fontSize:15 }}>📋 Published Roster</h3>
      {periods.length === 0 ? (
        <div style={{ padding:40,textAlign:"center",color:"#8A7F96",background:"#F8F5F1",borderRadius:12 }}>
          No published rosters available yet.<br/><span style={{fontSize:12,marginTop:8,display:"block"}}>Your manager will publish your roster here.</span>
        </div>
      ) : (
        <>
          <div style={{ marginBottom:16 }}>
            <select style={inp} value={selPeriod} onChange={e=>setSelPeriod(e.target.value)}>
              {periods.map(p=><option key={p.id} value={p.id}>{p.start_date} → {p.end_date} ({p.status})</option>)}
            </select>
          </div>
          {loading ? <div style={{textAlign:"center",padding:40,color:"#8A7F96"}}>Loading…</div> : (
            <div>
              {allDates.map(date => {
                const dayEntries = entries.filter(e=>e.date===date);
                return (
                  <div key={date} style={{ marginBottom:14,borderRadius:12,border:"1px solid #EDE8F4",overflow:"hidden" }}>
                    <div style={{ padding:"8px 14px",background:"#EDE8F4",fontWeight:700,fontSize:12,color:"#3D3248" }}>
                      📅 {fmtDate(date)}
                    </div>
                    {dayEntries.length === 0 ? (
                      <div style={{padding:"10px 14px",fontSize:12,color:"#8A7F96"}}>Day off / not rostered</div>
                    ) : dayEntries.map(e => {
                      const sM = fmtTime(e.start_time).split(":").map(Number);
                      const eM = fmtTime(e.end_time).split(":").map(Number);
                      const hrs = (((eM[0]*60+eM[1])-(sM[0]*60+sM[1])-(e.break_mins||30))/60).toFixed(1);
                      return (
                        <div key={e.id} style={{ padding:"10px 14px",borderTop:"1px solid #F5F0FB",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                          <div>
                            <div style={{fontWeight:700,fontSize:13,color:"#3D3248"}}>{e.room_name||"No room"}</div>
                            <div style={{fontSize:12,color:"#8A7F96",marginTop:2}}>{fmtTime(e.start_time)} – {fmtTime(e.end_time)} · {hrs}h · {e.break_mins||30}min break</div>
                          </div>
                          <div style={{textAlign:"right"}}>
                            {e.is_lunch_cover && <span style={{fontSize:10,fontWeight:700,color:"#D4A26A",background:"#FFF8E7",padding:"2px 8px",borderRadius:20}}>🍽 Lunch Cover</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function StaffPortalModule() {
  const [me, setMe] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [tab, setTab] = useState("home");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Admin preview: check localStorage for a preview educator ID set by PortalEmulator
    const previewId = localStorage.getItem("c360_preview_educator_id");
    const qs = previewId ? "?preview_educator_id=" + previewId : "";
    try {
      const [profile, myShifts] = await Promise.all([
        API("/api/staff/me" + qs),
        API("/api/staff/my-shifts" + qs),
      ]);
      if (profile.error) { setError(profile.error); }
      else { setMe(profile); }
      if (Array.isArray(myShifts)) setShifts(myShifts);
    } catch(e) { setError("Could not load your profile. Check your connection."); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, flexDirection: "column", gap: 12 }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${lp}`, borderTop: `3px solid ${purple}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ fontSize: 13, color: "#8A7F96" }}>Loading your profile…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
      <div style={{ fontWeight: 700, color: "#3D3248", marginBottom: 8 }}>{error}</div>
      <div style={{ fontSize: 12, color: "#8A7F96", marginBottom: 20 }}>Your centre manager may need to link your account to an educator record.</div>
      <button onClick={load} style={btnS}>Try again</button>
    </div>
  );

  const pendingLeave = (me?.leaveRequests || []).filter(l => l.status === "pending").length;
  const [msgUnread, setMsgUnread] = React.useState(0);
  React.useEffect(() => {
    const pid = localStorage.getItem("c360_preview_educator_id");
    const qs = pid ? `?preview_educator_id=${pid}` : "";
    API(`/api/staff-features/messages${qs}`).then(r => { if (!r.error) setMsgUnread(r.unread || 0); }).catch(()=>{});
  }, []);
  const certAlerts = [me?.first_aid_expiry, me?.cpr_expiry, me?.anaphylaxis_expiry, me?.wwcc_expiry]
    .filter(d => d && (isExpired(d) || isExpiringSoon(d, 60))).length;

  const tabs = [
    { id: "home", label: "My Dashboard" },
    { id: "shifts", label: "My Shifts" },
    { id: "roster", label: "📋 My Roster" },
    { id: "availability", label: "Availability" },
    { id: "leave", label: "Leave", badge: pendingLeave },
    { id: "profile", label: "My Profile" },
    { id: "certifications", label: "Certifications", badge: certAlerts },
    { id: "messages", label: "💬 Messages", badge: msgUnread },
    { id: "pd", label: "🎓 Development" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #EDE8F4", display: "flex", alignItems: "center", gap: 16, background: "#fff", flexShrink: 0 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: lp, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {me?.photo_url
            ? <img src={me.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span style={{ fontSize: 18, fontWeight: 700, color: purple }}>{me?.first_name?.[0]}{me?.last_name?.[0]}</span>}
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: "#3D3248", fontSize: 18 }}>Welcome back, {me?.first_name}!</h2>
          <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 2 }}>
            {me?.qualification && <span style={{ marginRight: 8 }}>📋 {({ ect:"Early Childhood Teacher", diploma:"Diploma", cert3:"Certificate III", working_towards_diploma:"Working Towards Diploma", working_towards:"Working Towards Cert III", unqualified:"Unqualified" })[me.qualification] || me.qualification}</span>}
            {me?.employment_type && <span>• {me.employment_type}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 12, color: "#8A7F96" }}>
          <div style={{ fontWeight: 700, color: "#3D3248" }}>{new Date().toLocaleDateString(undefined, { weekday: "long" })}</div>
          <div>{new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: "8px 24px", borderBottom: "1px solid #EDE8F4", display: "flex", gap: 4, background: "#FDFBF9", flexShrink: 0, overflowX: "auto" }}>
        {tabs.map(t => <Tab key={t.id} label={t.label} active={tab === t.id} onClick={() => setTab(t.id)} badge={t.badge} />)}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {tab === "home" && <HomeTab me={me} shifts={shifts} onNavigate={setTab} />}
        {tab === "shifts" && <ShiftsTab shifts={shifts} me={me} />}
        {tab === "roster" && <MyRosterTab />}
        {tab === "availability" && <AvailabilityTab me={me} onSaved={load} />}
        {tab === "leave" && <LeaveTab me={me} onSaved={load} />}
        {tab === "profile" && <ProfileTab me={me} onSaved={load} />}
        {tab === "certifications" && <CertificationsTabEnhanced me={me} />}
        {tab === "messages" && <MessagingTab me={me} />}
        {tab === "pd" && <PDTab me={me} />}
      </div>
    </div>
  );
}

// ─── Home Dashboard ────────────────────────────────────────────────────────────
function HomeTab({ me, shifts, onNavigate }) {
  const today = new Date().toISOString().slice(0,10);
  const todayShifts = shifts.filter(s => s.date === today);
  const upcoming = shifts.filter(s => s.date > today).slice(0, 5);
  const pendingLeave = (me?.leaveRequests || []).filter(l => l.status === "pending");
  const certAlerts = [
    { label: "First Aid", expiry: me?.first_aid_expiry },
    { label: "CPR", expiry: me?.cpr_expiry },
    { label: "Anaphylaxis", expiry: me?.anaphylaxis_expiry },
    { label: "WWCC", expiry: me?.wwcc_expiry },
  ].filter(c => c.expiry && (isExpired(c.expiry) || isExpiringSoon(c.expiry, 60)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Cert alerts banner */}
      {certAlerts.length > 0 && (
        <div onClick={() => onNavigate("certifications")} style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, color: "#C9828A", fontSize: 13 }}>Certification attention needed</div>
            <div style={{ fontSize: 12, color: "#B06070", marginTop: 2 }}>{certAlerts.map(c => c.label).join(", ")} {certAlerts.length === 1 ? "is" : "are"} expiring or expired</div>
          </div>
          <span style={{ marginLeft: "auto", color: "#C9828A", fontSize: 12, fontWeight: 600 }}>View →</span>
        </div>
      )}

      {/* Today */}
      <div style={card}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>📅 Today — {fmtDateShort(today)}</h3>
        {todayShifts.length === 0 ? (
          <div style={{ color: "#8A7F96", fontSize: 13, textAlign: "center", padding: "16px 0" }}>No shifts scheduled today</div>
        ) : todayShifts.map(s => (
          <div key={s.id} style={{ padding: "10px 14px", background: lp, borderRadius: 10, marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#3D3248" }}>{s.room_name || "Unassigned"}</div>
            <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 2 }}>{s.start_time} – {s.end_time} · {s.status || "scheduled"}</div>
          </div>
        ))}
      </div>

      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {[
          ["Shifts This Week", shifts.filter(s => { const d = new Date(s.date); const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return d >= mon && d <= sun; }).length, "🗓"],
          ["Pending Leave", pendingLeave.length, "📝"],
          ["Upcoming Shifts", upcoming.length, "⏭"],
        ].map(([label, val, icon]) => (
          <div key={label} style={{ ...card, textAlign: "center", padding: "16px 12px" }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: purple }}>{val}</div>
            <div style={{ fontSize: 11, color: "#8A7F96", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Upcoming shifts */}
      {upcoming.length > 0 && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14, color: "#3D3248" }}>Upcoming Shifts</h3>
            <button onClick={() => onNavigate("shifts")} style={{ background: "none", border: "none", cursor: "pointer", color: purple, fontSize: 12, fontWeight: 600 }}>View all →</button>
          </div>
          {upcoming.map(s => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F0EBF8" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#3D3248" }}>{fmtDateShort(s.date)}</div>
                <div style={{ fontSize: 12, color: "#8A7F96" }}>{s.room_name || "Room TBA"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: purple }}>{s.start_time} – {s.end_time}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { label: "Update Availability", icon: "🗓", tab: "availability" },
          { label: "Request Leave", icon: "📋", tab: "leave" },
          { label: "View My Shifts", icon: "📅", tab: "shifts" },
          { label: "Update Profile", icon: "👤", tab: "profile" },
        ].map(({ label, icon, tab: t }) => (
          <button key={t} onClick={() => onNavigate(t)}
            style={{ ...card, border: "1px solid #EDE8F4", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left", padding: "16px 18px", transition: "box-shadow 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"}
            onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
            <span style={{ fontSize: 24 }}>{icon}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#3D3248" }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Shifts Tab ────────────────────────────────────────────────────────────────
function ShiftsTab({ shifts, me }) {
  // Calculate YTD pay from shifts
  const now = new Date();
  const ytdStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0,10);
  const ytdShifts = shifts.filter(s => s.date >= ytdStart);
  const ytdHours = ytdShifts.reduce((sum, s) => {
    if (!s.start_time || !s.end_time) return sum;
    const [sh,sm] = s.start_time.split(':').map(Number);
    const [eh,em] = s.end_time.split(':').map(Number);
    const hrs = Math.max(0, ((eh*60+em)-(sh*60+sm)-(s.break_mins||30))/60);
    return sum + hrs;
  }, 0);
  const rate = me?.hourly_rate_cents ? me.hourly_rate_cents/100 : 0;
  const ytdPay = ytdHours * rate;
  const thisWeekShifts = shifts.filter(s => {
    const d = new Date(s.date+'T12:00:00');
    const mon = new Date(now); mon.setDate(now.getDate()-((now.getDay()+6)%7)); mon.setHours(0,0,0,0);
    const sun = new Date(mon); sun.setDate(mon.getDate()+6); sun.setHours(23,59,59,0);
    return d >= mon && d <= sun;
  });
  const weekHours = thisWeekShifts.reduce((sum, s) => {
    if (!s.start_time || !s.end_time) return sum;
    const [sh,sm] = s.start_time.split(':').map(Number);
    const [eh,em] = s.end_time.split(':').map(Number);
    return sum + Math.max(0, ((eh*60+em)-(sh*60+sm)-(s.break_mins||30))/60);
  }, 0);
  const today = new Date().toISOString().slice(0,10);
  const [publishedRosters, setPublishedRosters] = useState([]);
  const [selectedRoster, setSelectedRoster] = useState(null);
  const [myRosterShifts, setMyRosterShifts] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [view, setView] = useState("shifts"); // "shifts" | "roster"

  useEffect(() => {
    // Load published roster periods
    const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
    if (!t || !tid) return;
    fetch("/api/rostering/periods", { headers: { Authorization: `Bearer ${t}`, "x-tenant-id": tid } })
      .then(r => r.json())
      .then(d => {
        if (d.periods) {
          const published = d.periods.filter(p => p.status === "published").sort((a,b) => b.start_date.localeCompare(a.start_date));
          setPublishedRosters(published);
          if (published.length && !selectedRoster) setSelectedRoster(published[0]);
        }
      }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedRoster || !me?.educator?.id) return;
    setRosterLoading(true);
    const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
    fetch(`/api/rostering/periods/${selectedRoster.id}`, { headers: { Authorization: `Bearer ${t}`, "x-tenant-id": tid } })
      .then(r => r.json())
      .then(d => {
        if (d.entries) {
          setMyRosterShifts(d.entries.filter(e => e.educator_id === me.educator.id).sort((a,b) => a.date.localeCompare(b.date)));
        }
      }).catch(() => {})
      .finally(() => setRosterLoading(false));
  }, [selectedRoster, me]);
  const statusColor = { filled: ["#2E7D32","#E8F5E9"], unfilled: ["#E65100","#FFF3E0"], cancelled: ["#757575","#F5F5F5"], scheduled: ["#1565C0","#E3F2FD"] };

  const ShiftRow = ({ s }) => {
    const [col, bg] = statusColor[s.status] || ["#8B6DAF","#F0EBF8"];
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: s.date === today ? lp : "#FDFBF9", borderRadius: 10, marginBottom: 8, border: `1px solid ${s.date === today ? "#DDD6EE" : "#EDE8F4"}` }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#3D3248" }}>{fmtDateShort(s.date)}{s.date === today && <span style={{ marginLeft: 8, fontSize: 10, background: purple, color: "#fff", borderRadius: 10, padding: "2px 8px", fontWeight: 700 }}>TODAY</span>}</div>
          <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 2 }}>{s.room_name || "Room TBA"}{s.age_group ? ` · ${s.age_group}` : ""}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: purple }}>{s.start_time} – {s.end_time}</div>
          <Badge text={s.status || "scheduled"} color={col} bg={bg} />
        </div>
      </div>
    );
  };

  const upcoming = shifts.filter(s => s.date >= today);
  const past = shifts.filter(s => s.date < today);
  const [showPast, setShowPast] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Pay Summary */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
        {[
          ["This Week",`${weekHours.toFixed(1)} hrs`, rate>0?`$${(weekHours*rate).toFixed(0)}`:"","#8B6DAF","#F0EBF8"],
          ["YTD Hours",`${ytdHours.toFixed(1)} hrs`,"","#5B8DB5","#E3F2FD"],
          rate>0 ? ["YTD Earnings",`$${ytdPay.toLocaleString("en-AU",{minimumFractionDigits:0,maximumFractionDigits:0})}`,new Date().getFullYear().toString(),"#2E7D32","#E8F5E9"] : null,
          [`Shifts (${new Date().getFullYear()})`,ytdShifts.length,"","#D4A26A","#FFF6E8"],
        ].filter(Boolean).map(([l,v,sub,col,bg])=>(
          <div key={l} style={{background:bg,borderRadius:12,padding:"12px 14px",border:`1px solid ${col}30`}}>
            <div style={{fontSize:18,fontWeight:800,color:col,lineHeight:1}}>{v}</div>
            {sub&&<div style={{fontSize:10,color:col,opacity:0.7,marginTop:2}}>{sub}</div>}
            <div style={{fontSize:10,color:"#8A7F96",fontWeight:600,marginTop:4,textTransform:"uppercase"}}>{l}</div>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div style={{ display: "flex", gap: 6 }}>
        {[["shifts","📋 My Shifts"],["roster","📅 Published Roster"]].map(([id,l]) => (
          <button key={id} onClick={() => setView(id)}
            style={{ padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: view===id?700:500, fontSize: 13,
              background: view===id ? purple : "#EDE8F4", color: view===id ? "#fff" : "#6B5F7A" }}>
            {l}
          </button>
        ))}
      </div>

      {view === "roster" && (
        <div>
          {publishedRosters.length === 0 ? (
            <div style={{ ...card, textAlign: "center", color: "#8A7F96", padding: 40 }}>No published rosters yet. Your manager will publish rosters here once approved.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                {publishedRosters.map(r => (
                  <button key={r.id} onClick={() => setSelectedRoster(r)}
                    style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${selectedRoster?.id === r.id ? purple : "#DDD"}`,
                      background: selectedRoster?.id === r.id ? lp : "#fff", cursor: "pointer", fontSize: 12, fontWeight: selectedRoster?.id === r.id ? 700 : 400, color: selectedRoster?.id === r.id ? purple : "#555" }}>
                    {r.start_date} – {r.end_date}
                  </button>
                ))}
              </div>
              {selectedRoster && (
                <div style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>My Shifts: {selectedRoster.start_date} – {selectedRoster.end_date}</h3>
                      <div style={{ fontSize: 11, color: "#8A7F96", marginTop: 3 }}>{myRosterShifts.length} shifts · {myRosterShifts.reduce((s,e) => s + ((parseInt(e.end_time)-parseInt(e.start_time)) || 8), 0).toFixed(0)}h approx</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, background: "#E8F5E9", color: "#2E7D32", padding: "3px 10px", borderRadius: 20 }}>✅ Published</span>
                  </div>
                  {rosterLoading ? (
                    <div style={{ textAlign: "center", padding: 24, color: "#8A7F96" }}>Loading…</div>
                  ) : myRosterShifts.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#8A7F96", padding: 24 }}>You have no shifts in this roster period.</div>
                  ) : (
                    myRosterShifts.map(s => {
                      const isToday = s.date === today;
                      return (
                        <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: isToday ? "#EDE8F4" : "#FDFBF9", borderRadius: 10, marginBottom: 8, border: `1px solid ${isToday ? "#DDD6EE" : "#EDE8F4"}` }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>
                              {new Date(s.date+"T12:00:00").toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"})}
                              {isToday && <span style={{ marginLeft: 8, fontSize: 10, background: purple, color: "#fff", borderRadius: 10, padding: "2px 8px", fontWeight: 700 }}>TODAY</span>}
                            </div>
                            <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 2 }}>{s.room_name || "Room TBA"}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: purple }}>{s.start_time} – {s.end_time}</div>
                            <div style={{ fontSize: 11, color: "#8A7F96" }}>Break: {s.break_mins || 30}m</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {view === "shifts" && <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={card}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>Upcoming Shifts ({upcoming.length})</h3>
        {upcoming.length === 0
          ? <div style={{ textAlign: "center", color: "#8A7F96", padding: 24 }}>No upcoming shifts scheduled</div>
          : upcoming.map(s => <ShiftRow key={s.id} s={s} />)}
      </div>
      {past.length > 0 && (
        <div style={card}>
          <button onClick={() => setShowPast(!showPast)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#3D3248", padding: 0, display: "flex", alignItems: "center", gap: 8 }}>
            {showPast ? "▼" : "▶"} Recent Shifts ({past.length})
          </button>
          {showPast && <div style={{ marginTop: 12 }}>{past.map(s => <ShiftRow key={s.id} s={s} />)}</div>}
        </div>
      )}
    </div>}
    </div>
  );
}

// ─── Availability Tab ──────────────────────────────────────────────────────────
function AvailabilityTab({ me, onSaved }) {
  const [avail, setAvail] = useState([]);
  const [specials, setSpecials] = useState([]);
  const [showSp, setShowSp] = useState(false);
  const [sp, setSp] = useState({ start_date: "", end_date: "", can_start_early: false, early_start_time: "06:00", can_stay_late: false, late_end_time: "20:00", notes: "", available_days: [1,2,3,4,5] });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!me?.availability) return;
    const defaults = Array.from({ length: 7 }, (_, i) => ({ day_of_week: i, available: i > 0 && i < 6 ? 1 : 0, start_time: "07:00", end_time: "18:00", can_start_earlier_mins: 0, can_finish_later_mins: 0 }));
    setAvail(defaults.map(d => me.availability.find(a => a.day_of_week === d.day_of_week) || d));
    setSpecials(me.specialAvailability || []);
  }, [me]);

  const updateRow = (i, field, val) => {
    const newA = [...avail];
    newA[i] = { ...newA[i], [field]: val };
    if (field === "start_time" || field === "end_time") {
      const row = newA[i];
      const errs = { ...errors };
      if (timeToMins(row.end_time) <= timeToMins(row.start_time)) errs[`t${row.day_of_week}`] = "End must be after start";
      else delete errs[`t${row.day_of_week}`];
      setErrors(errs);
    }
    setAvail(newA);
  };

  const save = async () => {
    if (Object.keys(errors).length) { toast("Fix time errors first", "error"); return; }
    setSaving(true);
    try {
      await API("/api/staff/my-availability", { method: "PUT", body: JSON.stringify({ availability: avail }) });
      toast("Availability saved"); onSaved();
    } catch(e) { toast("Save failed", "error"); }
    setSaving(false);
  };

  const addSpecial = async () => {
    if (!sp.start_date || !sp.end_date) { toast("Dates required", "error"); return; }
    if (new Date(sp.end_date) < new Date(sp.start_date)) { toast("End must be after start", "error"); return; }
    try {
      await API("/api/staff/my-special-availability", { method: "POST", body: JSON.stringify(sp) });
      toast("Special period saved"); onSaved();
      setShowSp(false); setSp({ start_date: "", end_date: "", can_start_early: false, early_start_time: "06:00", can_stay_late: false, late_end_time: "20:00", notes: "", available_days: [1,2,3,4,5] });
    } catch(e) { toast("Failed", "error"); }
  };

  const delSpecial = async id => {
    try { await API(`/api/staff/my-special-availability/${id}`, { method: "DELETE" }); toast("Removed"); onSaved(); }
    catch(e) { toast("Failed", "error"); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, color: "#3D3248" }}>Weekly Availability</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#8A7F96" }}>Your regular working hours — used by the rostering system when building schedules</p>
          </div>
          <button onClick={save} disabled={saving} style={{ ...btnP, padding: "8px 18px", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save"}</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: lp }}>
                {["Day","Available","Start","End","Can Start Earlier","Can Stay Later"].map(h => (
                  <th key={h} style={{ padding: "10px 10px", textAlign: h === "Day" ? "left" : "center", color: purple, fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {avail.map((a, i) => {
                const err = errors[`t${a.day_of_week}`];
                return (
                  <tr key={a.day_of_week} style={{ borderBottom: "1px solid #F0EBF8", background: err ? "#FEF2F2" : "transparent" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 600, color: "#3D3248" }}>{DAYS[a.day_of_week]}</td>
                    <td style={{ padding: "6px 10px", textAlign: "center" }}><input type="checkbox" checked={!!a.available} onChange={e => updateRow(i,"available",e.target.checked?1:0)} /></td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      <input type="time" value={a.start_time||"07:00"} disabled={!a.available} onChange={e => updateRow(i,"start_time",e.target.value)}
                        style={{ border:`1px solid ${err?"#FECACA":"#DDD6EE"}`,borderRadius:6,padding:"4px 6px",fontSize:12,background:a.available?"#fff":"#F5F5F5" }} />
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      <input type="time" value={a.end_time||"18:00"} disabled={!a.available} min={a.start_time||undefined} onChange={e => updateRow(i,"end_time",e.target.value)}
                        style={{ border:`1px solid ${err?"#FECACA":"#DDD6EE"}`,borderRadius:6,padding:"4px 6px",fontSize:12,background:a.available?"#fff":"#F5F5F5" }} />
                      {err && <div style={{ color:"#C9828A",fontSize:10,marginTop:2 }}>{err}</div>}
                    </td>
                    <td style={{ padding:"6px 8px",textAlign:"center" }}>
                      <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:4 }}>
                        <input type="checkbox" disabled={!a.available} checked={a.can_start_earlier_mins>0} onChange={e => updateRow(i,"can_start_earlier_mins",e.target.checked?30:0)} />
                        {a.can_start_earlier_mins>0&&<><input type="text" inputMode="numeric" value={a.can_start_earlier_mins} onChange={e=>updateRow(i,"can_start_earlier_mins",parseInt(e.target.value)||0)} style={{width:38,border:"1px solid #DDD6EE",borderRadius:4,padding:"2px 4px",fontSize:11}} /><span style={{fontSize:10,color:"#8A7F96"}}>min</span></>}
                      </div>
                    </td>
                    <td style={{ padding:"6px 8px",textAlign:"center" }}>
                      <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:4 }}>
                        <input type="checkbox" disabled={!a.available} checked={a.can_finish_later_mins>0} onChange={e => updateRow(i,"can_finish_later_mins",e.target.checked?30:0)} />
                        {a.can_finish_later_mins>0&&<><input type="text" inputMode="numeric" value={a.can_finish_later_mins} onChange={e=>updateRow(i,"can_finish_later_mins",parseInt(e.target.value)||0)} style={{width:38,border:"1px solid #DDD6EE",borderRadius:4,padding:"2px 4px",fontSize:11}} /><span style={{fontSize:10,color:"#8A7F96"}}>min</span></>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={card}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
          <div>
            <h3 style={{ margin:0,fontSize:14,color:"#3D3248" }}>Special Availability Periods</h3>
            <p style={{ margin:"4px 0 0",fontSize:12,color:"#8A7F96" }}>Tell your centre about specific dates you're available for extra shifts, early starts or late finishes</p>
          </div>
          <button onClick={()=>setShowSp(!showSp)} style={btnS}>+ Add Period</button>
        </div>

        {showSp && (
          <div style={{ background:"#F9F7FE",borderRadius:10,padding:16,marginBottom:16,border:"1px solid #DDD6EE" }}>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
              <div><label style={lbl}>Start Date</label><DatePicker value={sp.start_date} onChange={v=>setSp({...sp,start_date:v})} /></div>
              <div><label style={lbl}>End Date</label><DatePicker value={sp.end_date} min={sp.start_date||undefined} onChange={v=>setSp({...sp,end_date:v})} /></div>
              <div style={{ gridColumn:"1/-1" }}>
                <label style={lbl}>Available Days</label>
                <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
                  {DAYS.map((d,i)=>(
                    <label key={i} style={{ display:"flex",alignItems:"center",gap:4,fontSize:12,cursor:"pointer",padding:"4px 10px",borderRadius:6,border:"1px solid #DDD6EE",background:sp.available_days.includes(i)?lp:"#fff",userSelect:"none" }}>
                      <input type="checkbox" style={{display:"none"}} checked={sp.available_days.includes(i)} onChange={e=>setSp({...sp,available_days:e.target.checked?[...sp.available_days,i]:sp.available_days.filter(x=>x!==i)})} />{d}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer",marginBottom:8}}><input type="checkbox" checked={sp.can_start_early} onChange={e=>setSp({...sp,can_start_early:e.target.checked})} />Can start early</label>
                {sp.can_start_early&&<div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:"#555"}}>From:</span><input type="time" value={sp.early_start_time} onChange={e=>setSp({...sp,early_start_time:e.target.value})} style={{border:"1px solid #DDD6EE",borderRadius:6,padding:"4px 8px",fontSize:12}} /></div>}
              </div>
              <div>
                <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer",marginBottom:8}}><input type="checkbox" checked={sp.can_stay_late} onChange={e=>setSp({...sp,can_stay_late:e.target.checked})} />Can stay late</label>
                {sp.can_stay_late&&<div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:"#555"}}>Until:</span><input type="time" value={sp.late_end_time} onChange={e=>setSp({...sp,late_end_time:e.target.value})} style={{border:"1px solid #DDD6EE",borderRadius:6,padding:"4px 8px",fontSize:12}} /></div>}
              </div>
              <div style={{ gridColumn:"1/-1" }}>
                <label style={lbl}>Notes (optional)</label>
                <input value={sp.notes} onChange={e=>setSp({...sp,notes:e.target.value})} placeholder="e.g. Partner away — available for overtime" style={inp} />
              </div>
            </div>
            <div style={{ display:"flex",gap:8,marginTop:12 }}>
              <button onClick={addSpecial} style={btnP}>Save Period</button>
              <button onClick={()=>setShowSp(false)} style={btnS}>Cancel</button>
            </div>
          </div>
        )}

        {specials.length===0
          ? <div style={{textAlign:"center",color:"#8A7F96",padding:24,fontSize:13}}>No special periods recorded</div>
          : specials.map(s=>(
            <div key={s.id} style={{padding:"12px 16px",background:"#F9F7FE",borderRadius:10,border:"1px solid #DDD6EE",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontWeight:600,fontSize:13}}>{fmtDate(s.start_date)} → {fmtDate(s.end_date)}</div>
                <div style={{fontSize:11,color:"#8A7F96",marginTop:4}}>
                  Days: {(Array.isArray(s.available_days)?s.available_days:JSON.parse(s.available_days||"[]")).map(d=>DAYS[d]).join(", ")}
                  {s.can_start_early?` · Early from ${s.early_start_time}`:""}
                  {s.can_stay_late?` · Late until ${s.late_end_time}`:""}
                </div>
                {s.notes&&<div style={{fontSize:12,color:"#5C4E6A",marginTop:4}}>{s.notes}</div>}
              </div>
              <button onClick={()=>delSpecial(s.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#E53935",fontSize:16}}>✕</button>
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── Leave Tab ─────────────────────────────────────────────────────────────────
function LeaveTab({ me, onSaved }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ leave_type:"annual", start_date:"", end_date:"", days_requested:1, reason:"" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const leaves = me?.leaveRequests || [];

  function countWorkdays(s, e) {
    if (!s||!e) return 0;
    const sd=new Date(s+"T00:00"), ed=new Date(e+"T00:00");
    let work=0, cur=new Date(sd);
    while(cur<=ed){if(cur.getDay()!==0&&cur.getDay()!==6)work++;cur.setDate(cur.getDate()+1);}
    return work;
  }

  const updateDates = (field, val) => {
    const u = {...form,[field]:val};
    if(u.start_date&&u.end_date){u.days_requested=countWorkdays(u.start_date,u.end_date)||1;}
    setForm(u);
  };

  const submit = async () => {
    if(!form.start_date||!form.end_date){setErr("Dates required.");return;}
    if(new Date(form.end_date)<new Date(form.start_date)){setErr("End must be after start.");return;}
    setSaving(true);setErr("");
    try {
      const r = await API("/api/staff/my-leave",{method:"POST",body:JSON.stringify(form)});
      if(r.error){setErr(r.error);}
      else{setShowAdd(false);setForm({leave_type:"annual",start_date:"",end_date:"",days_requested:1,reason:""});onSaved();toast("Leave request submitted");}
    }catch(e){setErr("Failed.");}
    setSaving(false);
  };

  const sc = {pending:["#E65100","#FFF3E0"],approved:["#2E7D32","#E8F5E9"],denied:["#B71C1C","#FFEBEE"]};

  return (
    <div style={card}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h3 style={{margin:0,fontSize:14,color:"#3D3248"}}>My Leave Requests</h3>
        <button onClick={()=>{setShowAdd(!showAdd);setErr("");}} style={btnS}>+ Request Leave</button>
      </div>

      {showAdd&&(
        <div style={{background:"#F9F7FE",borderRadius:12,padding:20,marginBottom:16,border:"1px solid #DDD6EE"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div>
              <label style={lbl}>Leave Type</label>
              <select value={form.leave_type} onChange={e=>setForm({...form,leave_type:e.target.value})} style={inp}>
                {LEAVE_TYPES.map(t=><option key={t} value={t}>{t.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Working Days</label>
              <NumInput value={form.days_requested} onChange={v=>setForm({...form,days_requested:v})} />
            </div>
            <div><label style={lbl}>Start Date</label><DatePicker value={form.start_date} onChange={v=>updateDates("start_date",v)} /></div>
            <div><label style={lbl}>End Date</label><DatePicker value={form.end_date} min={form.start_date||undefined} onChange={v=>updateDates("end_date",v)} /></div>
            <div style={{gridColumn:"1/-1"}}>
              <label style={lbl}>Reason (optional)</label>
              <input value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} placeholder="e.g. Annual holiday…" style={inp} />
            </div>
          </div>
          {err&&<div style={{marginTop:10,color:"#C9828A",fontSize:12,padding:"10px 14px",background:"#FEF2F2",borderRadius:8}}>⚠ {err}</div>}
          <div style={{display:"flex",gap:8,marginTop:14}}>
            <button onClick={submit} disabled={saving} style={{...btnP,opacity:saving?0.7:1}}>{saving?"Submitting…":"Submit Request"}</button>
            <button onClick={()=>{setShowAdd(false);setErr("");}} style={btnS}>Cancel</button>
          </div>
        </div>
      )}

      {leaves.length===0
        ?<div style={{textAlign:"center",color:"#8A7F96",padding:40}}>No leave requests yet</div>
        :<table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{background:lp}}>{["Type","Dates","Days","Status"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",color:purple,fontWeight:700}}>{h}</th>)}</tr></thead>
          <tbody>
            {leaves.map(l=>{
              const [col,bg]=sc[l.status]||["#777","#EEE"];
              return(
                <tr key={l.id} style={{borderBottom:"1px solid #F0EBF8"}}>
                  <td style={{padding:"10px 12px",fontWeight:600,textTransform:"capitalize"}}>{l.leave_type?.replace("_"," ")}</td>
                  <td style={{padding:"10px 12px",color:"#8A7F96"}}>{fmtDate(l.start_date)} → {fmtDate(l.end_date)}</td>
                  <td style={{padding:"10px 12px",textAlign:"center",fontWeight:700}}>{l.days_requested}</td>
                  <td style={{padding:"10px 12px"}}><Badge text={l.status} color={col} bg={bg} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>}
    </div>
  );
}

// ─── Profile Tab ───────────────────────────────────────────────────────────────
function ProfileTab({ me, onSaved }) {
  const [form, setForm] = useState({ phone:"", address:"", suburb:"", state:"NSW", postcode:"" });
  const [saving, setSaving] = useState(false);
  const AU_STATES = ["ACT","NSW","NT","QLD","SA","TAS","VIC","WA"];

  useEffect(() => {
    if (me) setForm({ phone: me.phone||"", address: me.address||"", suburb: me.suburb||"", state: me.state||"NSW", postcode: me.postcode||"" });
  }, [me]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await API("/api/staff/me", { method: "PUT", body: JSON.stringify(form) });
      if (r.error) toast(r.error, "error");
      else { toast("Profile updated"); onSaved(); }
    } catch(e) { toast("Save failed", "error"); }
    setSaving(false);
  };

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
      <div style={card}>
        <h3 style={{margin:"0 0 16px",fontSize:14,color:"#3D3248"}}>Personal Details</h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div><div style={{...lbl,marginBottom:2}}>Name</div><div style={{padding:"8px 0",fontSize:13,fontWeight:600,color:"#3D3248"}}>{me?.first_name} {me?.last_name}</div></div>
          <div><div style={{...lbl,marginBottom:2}}>Email</div><div style={{padding:"8px 0",fontSize:13,fontWeight:600,color:"#3D3248"}}>{me?.email||"—"}</div></div>
          <div>
            <label style={lbl}>Phone</label>
            <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} style={inp} placeholder="04xx xxx xxx" />
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={lbl}>Street Address</label>
            <input value={form.address} onChange={e=>setForm({...form,address:e.target.value})} style={inp} />
          </div>
          <div>
            <label style={lbl}>Suburb</label>
            <input value={form.suburb} onChange={e=>setForm({...form,suburb:e.target.value})} style={inp} />
          </div>
          <div>
            <label style={lbl}>State</label>
            <select value={form.state} onChange={e=>setForm({...form,state:e.target.value})} style={inp}>
              {AU_STATES.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Postcode</label>
            <input value={form.postcode} onChange={e=>setForm({...form,postcode:e.target.value})} style={inp} />
          </div>
        </div>
        <div style={{marginTop:16}}>
          <button onClick={save} disabled={saving} style={{...btnP,opacity:saving?0.7:1}}>{saving?"Saving…":"Save Changes"}</button>
        </div>
      </div>
      <div style={card}>
        <h3 style={{margin:"0 0 12px",fontSize:14,color:"#3D3248"}}>Employment Info</h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:13}}>
          {[
            ["Qualification",{ect:"Early Childhood Teacher",diploma:"Diploma",working_towards_diploma:"Working Towards Diploma",cert3:"Certificate III",working_towards:"Working Towards Cert III",unqualified:"Unqualified"}[me?.qualification]||me?.qualification||"—"],
            ["Employment Type",me?.employment_type||"—"],
            ["Start Date",fmtDate(me?.start_date)],
            ["Hourly Rate",me?.hourly_rate_cents?`$${(me.hourly_rate_cents/100).toFixed(2)}/hr`:"—"],
            ["Contracted Hrs",me?.contracted_hours?`${me.contracted_hours} hrs/wk`:"—"],
            ["Super Rate",me?.super_rate?`${me.super_rate}%`:"—"],
          ].map(([l,v])=>(
            <div key={l} style={{padding:"8px 12px",background:"#FDFBF9",borderRadius:8}}>
              <div style={{fontSize:10,color:"#8A7F96",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>{l}</div>
              <div style={{fontWeight:600,color:"#3D3248"}}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STAFF PORTAL ADDITIONS — v2.6.7
// Paste these functions into StaffPortalModule.jsx before the final export
// ─────────────────────────────────────────────────────────────────────────────

// ─── Messaging Tab ────────────────────────────────────────────────────────────
function MessagingTab({ me }) {
  const [view, setView]       = React.useState("inbox"); // inbox | sent | compose
  const [inbox, setInbox]     = React.useState([]);
  const [sent,  setSent]      = React.useState([]);
  const [unread, setUnread]   = React.useState(0);
  const [staffList, setStaff] = React.useState([]);
  const [managers, setMgrs]   = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  const [form, setForm] = React.useState({ to_user_id: "", to_role: "", subject: "", body: "", reply_to_id: "" });

  const previewQs = () => {
    const pid = localStorage.getItem("c360_preview_educator_id");
    return pid ? `?preview_educator_id=${pid}` : "";
  };

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [msgs, sl] = await Promise.all([
        API(`/api/staff-features/messages${previewQs()}`),
        API("/api/staff-features/staff-list"),
      ]);
      if (!msgs.error) { setInbox(msgs.inbox || []); setSent(msgs.sent || []); setUnread(msgs.unread || 0); }
      if (!sl.error) { setStaff(sl.staff || []); setMgrs(sl.managers || []); }
    } catch(e) {}
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const markRead = async (msg) => {
    if (!msg.read_at) {
      await API(`/api/staff-features/messages/${msg.id}/read`, { method: "PUT" });
      setInbox(p => p.map(m => m.id === msg.id ? { ...m, read_at: new Date().toISOString() } : m));
      setUnread(p => Math.max(0, p - 1));
    }
    setSelected(msg);
  };

  const send = async () => {
    if (!form.body.trim()) { toast("Message body required", "error"); return; }
    const r = await API(`/api/staff-features/messages${previewQs()}`, {
      method: "POST", body: JSON.stringify(form)
    });
    if (r.error) { toast(r.error, "error"); return; }
    toast("Message sent ✓");
    setForm({ to_user_id: "", to_role: "", subject: "", body: "", reply_to_id: "" });
    setView("inbox");
    load();
  };

  const reply = (msg) => {
    setForm({ to_user_id: msg.from_user_id, to_role: "", subject: `Re: ${msg.subject}`, body: "", reply_to_id: msg.id });
    setView("compose");
  };

  const recipients = [
    ...managers.map(m => ({ value: `user:${m.user_id}`, label: `${m.name} (${m.role})` })),
    ...staffList.filter(s => s.user_id && s.user_id !== me?.user_id)
                .map(s => ({ value: `user:${s.user_id}`, label: `${s.first_name} ${s.last_name} — ${s.qualification || ""}` })),
    { value: "role:all", label: "📢 All Staff (Broadcast)" },
  ];

  const fmtTs = ts => ts ? new Date(ts).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

  const msgs = view === "inbox" ? inbox : sent;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, padding: "12px 0 16px", alignItems: "center" }}>
        {[["inbox", `📥 Inbox${unread > 0 ? ` (${unread})` : ""}`], ["sent", "📤 Sent"], ["compose", "✏️ New Message"]].map(([v, l]) => (
          <button key={v} onClick={() => { setView(v); setSelected(null); }}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
              background: view === v ? purple : lp, color: view === v ? "#fff" : purple }}>
            {l}
          </button>
        ))}
      </div>

      {/* Compose */}
      {view === "compose" && (
        <div style={card}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>
            {form.reply_to_id ? "Reply" : "New Message"}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {!form.reply_to_id && (
              <div>
                <label style={lbl}>To</label>
                <select value={form.to_user_id ? `user:${form.to_user_id}` : form.to_role ? `role:${form.to_role}` : ""}
                  onChange={e => {
                    const v = e.target.value;
                    if (v.startsWith("user:")) setForm(p => ({ ...p, to_user_id: v.slice(5), to_role: "" }));
                    else if (v.startsWith("role:")) setForm(p => ({ ...p, to_role: v.slice(5), to_user_id: "" }));
                  }}
                  style={inp}>
                  <option value="">Select recipient…</option>
                  {recipients.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={lbl}>Subject</label>
              <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                placeholder="Message subject…" style={inp} />
            </div>
            <div>
              <label style={lbl}>Message</label>
              <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
                rows={6} placeholder="Type your message…"
                style={{ ...inp, resize: "vertical", minHeight: 120 }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={send} style={btnP}>Send Message</button>
              <button onClick={() => { setView("inbox"); setForm({ to_user_id: "", to_role: "", subject: "", body: "", reply_to_id: "" }); }}
                style={btnS}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Message list + detail */}
      {(view === "inbox" || view === "sent") && (
        <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1.6fr" : "1fr", gap: 16 }}>
          <div style={card}>
            {loading ? <div style={{ color: "#A89DB5", fontSize: 13, textAlign: "center", padding: 30 }}>Loading…</div>
              : msgs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: "#A89DB5" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                  <div>{view === "inbox" ? "No messages yet" : "No sent messages"}</div>
                </div>
              ) : msgs.map(msg => (
                <div key={msg.id} onClick={() => view === "inbox" ? markRead(msg) : setSelected(msg)}
                  style={{ padding: "12px 14px", borderRadius: 10, marginBottom: 6, cursor: "pointer",
                    background: selected?.id === msg.id ? lp : msg.read_at || view === "sent" ? "#FAFAFA" : "#FFF8FF",
                    border: `1px solid ${selected?.id === msg.id ? purple + "40" : "#EDE8F4"}`,
                    borderLeft: !msg.read_at && view === "inbox" ? `3px solid ${purple}` : undefined }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ fontWeight: !msg.read_at && view === "inbox" ? 700 : 600, fontSize: 13, color: "#3D3248" }}>
                      {view === "inbox" ? (msg.from_first ? `${msg.from_first} ${msg.from_last}` : msg.from_name || "Centre Manager") : (msg.to_name || "Staff")}
                    </div>
                    <div style={{ fontSize: 10, color: "#A89DB5" }}>{fmtTs(msg.created_at)}</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: !msg.read_at && view === "inbox" ? 600 : 500, color: "#5C4E6A", marginTop: 2 }}>{msg.subject}</div>
                  <div style={{ fontSize: 11, color: "#A89DB5", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{msg.body?.slice(0, 80)}</div>
                </div>
              ))
            }
          </div>

          {selected && (
            <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, color: "#3D3248" }}>{selected.subject}</h3>
                  <div style={{ fontSize: 11, color: "#A89DB5", marginTop: 4 }}>
                    {view === "inbox" ? `From: ${selected.from_first ? `${selected.from_first} ${selected.from_last}` : selected.from_name || "Centre Manager"}` : `To: ${selected.to_name || "Staff"}`}
                    {" · "}{fmtTs(selected.created_at)}
                  </div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#A89DB5" }}>×</button>
              </div>
              <div style={{ padding: "14px 16px", background: "#FAFAFA", borderRadius: 10, fontSize: 13, lineHeight: 1.7, color: "#3D3248", whiteSpace: "pre-wrap", minHeight: 80 }}>
                {selected.body}
              </div>
              {view === "inbox" && (
                <button onClick={() => reply(selected)} style={{ ...btnS, alignSelf: "flex-start" }}>↩ Reply</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Certifications Tab (enhanced with training links) ────────────────────────
function CertificationsTabEnhanced({ me }) {
  const [links, setLinks]   = React.useState({});
  const [adding, setAdding] = React.useState(null); // cert_type being added
  const [form, setForm]     = React.useState({ title: "", url: "", provider: "", notes: "", cost_est: "" });
  const [saving, setSaving] = React.useState(false);

  const CERT_TYPES = [
    { key: "first_aid",    label: "First Aid",                  held: me?.first_aid,       expiry: me?.first_aid_expiry },
    { key: "cpr",          label: "CPR (12 months)",            held: true,                expiry: me?.cpr_expiry },
    { key: "anaphylaxis",  label: "Anaphylaxis Management",     held: true,                expiry: me?.anaphylaxis_expiry },
    { key: "asthma",       label: "Asthma Management",          held: true,                expiry: me?.asthma_expiry },
    { key: "wwcc",         label: "Working With Children Check",held: !!me?.wwcc_number,   expiry: me?.wwcc_expiry, value: me?.wwcc_number },
    { key: "qualification",label: "Qualification",              held: !!me?.qualification, expiry: null },
  ];

  React.useEffect(() => {
    API("/api/staff-features/cert-links").then(rows => {
      if (Array.isArray(rows)) {
        const grouped = {};
        rows.forEach(r => { (grouped[r.cert_type] = grouped[r.cert_type] || []).push(r); });
        setLinks(grouped);
      }
    }).catch(() => {});
  }, []);

  const saveLink = async () => {
    if (!form.title || !form.url) { toast("Title and URL required", "error"); return; }
    setSaving(true);
    const r = await API("/api/staff-features/cert-links", {
      method: "POST", body: JSON.stringify({ ...form, cert_type: adding, cost_est: parseFloat(form.cost_est) || 0 })
    });
    if (r.ok) {
      const newLink = { id: r.id, cert_type: adding, ...form, cost_est: parseFloat(form.cost_est) || 0 };
      setLinks(p => ({ ...p, [adding]: [...(p[adding] || []), newLink] }));
      toast("Training link added ✓");
      setAdding(null);
      setForm({ title: "", url: "", provider: "", notes: "", cost_est: "" });
    } else toast(r.error, "error");
    setSaving(false);
  };

  const deleteLink = async (id, certType) => {
    await API(`/api/staff-features/cert-links/${id}`, { method: "DELETE" });
    setLinks(p => ({ ...p, [certType]: (p[certType] || []).filter(l => l.id !== id) }));
    toast("Link removed");
  };

  const rpEligible = me?.first_aid && !isExpired(me?.first_aid_expiry) && !isExpired(me?.cpr_expiry) && !isExpired(me?.anaphylaxis_expiry);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* RP status */}
      <div style={{ ...card, background: rpEligible ? "#E8F5E9" : "#FFEBEE", border: `1px solid ${rpEligible ? "#A5D6A7" : "#FFCDD2"}` }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: rpEligible ? "#2E7D32" : "#B71C1C", marginBottom: 2 }}>
          {rpEligible ? "✓ You are Responsible Person eligible" : "⚠ Not currently Responsible Person eligible"}
        </div>
        <div style={{ fontSize: 12, color: rpEligible ? "#2E7D32" : "#B71C1C" }}>
          {rpEligible ? "All required certifications are current." : "Requires current First Aid, CPR (≤12 months), and Anaphylaxis certificates."}
        </div>
      </div>

      {/* Cert cards */}
      {CERT_TYPES.map(c => {
        const expired = isExpired(c.expiry);
        const soon = c.expiry && !expired && isExpiringSoon(c.expiry, 60);
        const ok = c.expiry && !expired && !soon;
        const statusColor = !c.expiry ? "#9E9E9E" : expired ? "#B71C1C" : soon ? "#E65100" : "#2E7D32";
        const statusBg    = !c.expiry ? "#F5F5F5" : expired ? "#FFEBEE" : soon ? "#FFF3E0" : "#E8F5E9";
        const statusIcon  = !c.expiry ? "—" : expired ? "✗" : soon ? "⚠" : "✓";
        const certLinks   = links[c.key] || [];
        const showAddLink = (expired || soon) && adding !== c.key;

        return (
          <div key={c.key} style={{ ...card, border: `1px solid ${expired ? "#FFCDD2" : soon ? "#FFE082" : "#EDE8F4"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: certLinks.length ? 12 : 0 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#3D3248" }}>{c.label}</div>
                {c.value && <div style={{ fontSize: 11, color: "#8A7F96", marginTop: 2 }}>No. {c.value}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: statusColor, background: statusBg, padding: "4px 12px", borderRadius: 20 }}>
                  {statusIcon} {c.expiry ? fmtDate(c.expiry) : "Not entered"}
                </div>
                {expired && <div style={{ fontSize: 10, color: "#B71C1C", marginTop: 3 }}>Expired — renewal required</div>}
                {soon && <div style={{ fontSize: 10, color: "#E65100", marginTop: 3 }}>Expiring soon</div>}
              </div>
            </div>

            {/* Training links */}
            {certLinks.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#8A7F96", textTransform: "uppercase", marginBottom: 6 }}>
                  📚 Training Links
                </div>
                {certLinks.map(lk => (
                  <div key={lk.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "#F8F5FC", marginBottom: 4 }}>
                    <div style={{ flex: 1 }}>
                      <a href={lk.url} target="_blank" rel="noreferrer"
                        style={{ fontWeight: 600, fontSize: 13, color: purple, textDecoration: "none" }}>
                        🔗 {lk.title}
                      </a>
                      {lk.provider && <span style={{ fontSize: 11, color: "#A89DB5", marginLeft: 8 }}>{lk.provider}</span>}
                      {lk.cost_est > 0 && <span style={{ fontSize: 11, color: "#5B8DB5", marginLeft: 8 }}>~${lk.cost_est}</span>}
                      {lk.notes && <div style={{ fontSize: 11, color: "#8A7F96", marginTop: 2 }}>{lk.notes}</div>}
                    </div>
                    <button onClick={() => deleteLink(lk.id, c.key)}
                      style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #FFCDD2", background: "#FFF5F5", color: "#B71C1C", cursor: "pointer", fontSize: 10 }}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add link button / form */}
            {adding === c.key ? (
              <div style={{ marginTop: 12, padding: "14px", background: "#F8F5FC", borderRadius: 10, border: "1px solid #EDE8F4" }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: purple, marginBottom: 10 }}>Add Training Link for {c.label}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  {[["title","Title *","text"],["url","URL *","url"],["provider","Provider","text"],["cost_est","Est. Cost ($)","number"]].map(([k,l,t]) => (
                    <div key={k}>
                      <label style={{ ...lbl, fontSize: 10 }}>{l}</label>
                      <input type={t} value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                        placeholder={k === "url" ? "https://…" : ""} style={{ ...inp, fontSize: 12 }} />
                    </div>
                  ))}
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={{ ...lbl, fontSize: 10 }}>Notes</label>
                    <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Optional notes for the educator" style={{ ...inp, fontSize: 12 }} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={saveLink} disabled={saving} style={{ ...btnP, fontSize: 12, padding: "7px 16px" }}>Save Link</button>
                  <button onClick={() => setAdding(null)} style={{ ...btnS, fontSize: 12, padding: "7px 12px" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAdding(c.key)}
                style={{ marginTop: certLinks.length ? 8 : 12, padding: "5px 12px", borderRadius: 7, border: `1px solid ${purple}40`, background: lp, color: purple, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                + Add Training Link
              </button>
            )}
          </div>
        );
      })}

      {/* Uploaded documents */}
      {me?.documents?.filter(d => ["qualification","certification"].includes(d.category)).length > 0 && (
        <div style={card}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#3D3248" }}>My Documents</h3>
          {me.documents.filter(d => ["qualification","certification"].includes(d.category)).map(doc => {
            const expired = isExpired(doc.expiry_date);
            const soon = !expired && isExpiringSoon(doc.expiry_date, 60);
            return (
              <div key={doc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F0EBF8" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#3D3248" }}>{doc.label}</div>
                  <div style={{ fontSize: 11, color: "#8A7F96" }}>{doc.category} · {doc.file_name}</div>
                </div>
                {doc.expiry_date && <span style={{ fontSize: 12, fontWeight: 700, color: expired ? "#B71C1C" : soon ? "#E65100" : "#2E7D32" }}>{fmtDate(doc.expiry_date)}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Professional Development Tab ─────────────────────────────────────────────
function PDTab({ me }) {
  const [reqs, setReqs]       = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [selected, setSelected] = React.useState(null);
  const [feedback, setFeedback] = React.useState("");
  const [savingFb, setSavingFb] = React.useState(false);

  const [form, setForm] = React.useState({
    title: "", description: "", provider: "", url: "", start_date: "", end_date: "",
    location: "", delivery_mode: "in_person", cost_est: "", expected_outcomes: ""
  });
  const [saving, setSaving] = React.useState(false);

  const previewQs = () => {
    const pid = localStorage.getItem("c360_preview_educator_id");
    return pid ? `?preview_educator_id=${pid}` : "";
  };

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const rows = await API(`/api/staff-features/pd-requests${previewQs()}`);
      if (Array.isArray(rows)) setReqs(rows);
    } catch(e) {}
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.title) { toast("Title required", "error"); return; }
    try {
      setSaving(true);
      const r = await API(`/api/staff-features/pd-requests${previewQs()}`, {
        method: "POST", body: JSON.stringify({ ...form, cost_est: parseFloat(form.cost_est) || 0 })
      });
      if (r.ok) { toast("PD request submitted ✓"); setShowForm(false); load(); setForm({ title:"",description:"",provider:"",url:"",start_date:"",end_date:"",location:"",delivery_mode:"in_person",cost_est:"",expected_outcomes:"" }); }
      else toast(r.error, "error");
      setSaving(false);
    } catch(e) { console.error('API error:', e); }
  };

  const saveFeedback = async (id, updates) => {
    setSavingFb(true);
    const r = await API(`/api/staff-features/pd-requests/${id}`, { method: "PUT", body: JSON.stringify(updates) });
    if (r.ok) { toast("Updated ✓"); load(); setSelected(null); }
    else toast(r.error, "error");
    setSavingFb(false);
  };

  const STATUS_COLORS = { pending:"#E65100", approved:"#2E7D32", declined:"#B71C1C", completed:"#5B8DB5", in_progress:"#7C3AED" };
  const STATUS_BG     = { pending:"#FFF3E0", approved:"#E8F5E9", declined:"#FFEBEE", completed:"#E3F2FD", in_progress:"#F3E8FF" };
  const MODES = { in_person:"In Person", online:"Online", hybrid:"Hybrid", self_paced:"Self-Paced" };

  const fmtCost = v => v != null && v !== "" ? `$${Number(v).toFixed(2)}` : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#3D3248" }}>Professional Development</h3>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "#8A7F96" }}>Request training, courses, or conferences to grow your practice.</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} style={showForm ? btnS : btnP}>
          {showForm ? "Cancel" : "+ New Request"}
        </button>
      </div>

      {/* Request form */}
      {showForm && (
        <div style={{ ...card, background: "#F8F5FC", border: "1px solid #DDD6EE" }}>
          <h4 style={{ margin: "0 0 14px", color: purple }}>New PD Request</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["title","Training / Course Title *","text",2],["provider","Provider / Organisation","text",1],
              ["url","Website / URL","url",1],["location","Location","text",1],
              ["start_date","Start Date","date",1],["end_date","End Date","date",1],
              ["cost_est","Estimated Cost ($)","number",1]].map(([k,l,t,span]) => (
              <div key={k} style={{ gridColumn: span === 2 ? "span 2" : undefined }}>
                <label style={lbl}>{l}</label>
                <input type={t} value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                  placeholder={t === "url" ? "https://…" : ""} style={inp} />
              </div>
            ))}
            <div>
              <label style={lbl}>Delivery Mode</label>
              <select value={form.delivery_mode} onChange={e => setForm(p => ({ ...p, delivery_mode: e.target.value }))} style={inp}>
                {Object.entries(MODES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={lbl}>Description</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={3} placeholder="Briefly describe the training and why you're interested…"
                style={{ ...inp, resize: "vertical" }} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={lbl}>Expected Outcomes</label>
              <textarea value={form.expected_outcomes} onChange={e => setForm(p => ({ ...p, expected_outcomes: e.target.value }))}
                rows={2} placeholder="What skills or knowledge will you gain? How will it benefit your practice?"
                style={{ ...inp, resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={submit} disabled={saving} style={btnP}>{saving ? "Submitting…" : "Submit Request"}</button>
            <button onClick={() => setShowForm(false)} style={btnS}>Cancel</button>
          </div>
        </div>
      )}

      {/* Requests list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#A89DB5" }}>Loading…</div>
      ) : reqs.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "40px 20px", color: "#A89DB5" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🎓</div>
          <div style={{ fontWeight: 600, color: "#3D3248" }}>No PD requests yet</div>
          <p style={{ fontSize: 12, maxWidth: 320, margin: "8px auto 0" }}>
            Submit a request for any training, course, or conference that will help your professional development.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1.4fr" : "1fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {reqs.map(req => (
              <div key={req.id} onClick={() => setSelected(selected?.id === req.id ? null : req)}
                style={{ ...card, cursor: "pointer", border: `1px solid ${selected?.id === req.id ? purple + "60" : "#EDE8F4"}`,
                  background: selected?.id === req.id ? lp : "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#3D3248", flex: 1 }}>{req.title}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                    background: STATUS_BG[req.status] || "#F5F5F5", color: STATUS_COLORS[req.status] || "#666", whiteSpace: "nowrap", marginLeft: 8 }}>
                    {req.status}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#8A7F96", flexWrap: "wrap" }}>
                  {req.provider && <span>🏫 {req.provider}</span>}
                  {req.delivery_mode && <span>📍 {MODES[req.delivery_mode] || req.delivery_mode}</span>}
                  {req.cost_est > 0 && <span>💰 Est. {fmtCost(req.cost_est)}</span>}
                  {req.cost_approved != null && <span style={{ color: "#2E7D32" }}>✓ Approved {fmtCost(req.cost_approved)}</span>}
                  {req.start_date && <span>📅 {fmtDate(req.start_date)}</span>}
                </div>
                {req.manager_feedback && (
                  <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "#E8F5E9", border: "1px solid #A5D6A7", fontSize: 12, color: "#2E7D32" }}>
                    💬 Manager: {req.manager_feedback}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Detail / manager panel */}
          {selected && (
            <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14, alignSelf: "flex-start" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <h3 style={{ margin: 0, fontSize: 14, color: "#3D3248" }}>{selected.title}</h3>
                <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#A89DB5" }}>×</button>
              </div>

              {[["Provider", selected.provider],["Mode", MODES[selected.delivery_mode]],
                ["Location", selected.location],["Dates", selected.start_date ? `${fmtDate(selected.start_date)}${selected.end_date ? ` – ${fmtDate(selected.end_date)}` : ""}` : null],
                ["Estimated Cost", fmtCost(selected.cost_est)],
                ["Approved Cost", selected.cost_approved != null ? fmtCost(selected.cost_approved) : null],
              ].filter(([,v]) => v).map(([l,v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, borderBottom: "1px solid #F0EBF8", paddingBottom: 6 }}>
                  <span style={{ color: "#8A7F96", fontWeight: 600 }}>{l}</span>
                  <span style={{ color: "#3D3248", fontWeight: 600 }}>{v}</span>
                </div>
              ))}

              {selected.url && (
                <a href={selected.url} target="_blank" rel="noreferrer"
                  style={{ display: "inline-block", padding: "7px 14px", borderRadius: 8, background: lp, color: purple, textDecoration: "none", fontSize: 12, fontWeight: 600 }}>
                  🔗 View Course →
                </a>
              )}

              {selected.description && (
                <div>
                  <div style={{ ...lbl, marginBottom: 4 }}>Description</div>
                  <div style={{ fontSize: 12, color: "#5C4E6A", lineHeight: 1.6 }}>{selected.description}</div>
                </div>
              )}
              {selected.expected_outcomes && (
                <div>
                  <div style={{ ...lbl, marginBottom: 4 }}>Expected Outcomes</div>
                  <div style={{ fontSize: 12, color: "#5C4E6A", lineHeight: 1.6 }}>{selected.expected_outcomes}</div>
                </div>
              )}
              {selected.manager_notes && (
                <div style={{ padding: "10px 12px", background: "#FFF8E1", borderRadius: 8, border: "1px solid #FFE082" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#F57F17", marginBottom: 4 }}>Manager Notes</div>
                  <div style={{ fontSize: 12, color: "#5C4E6A" }}>{selected.manager_notes}</div>
                </div>
              )}

              {/* Manager approval panel */}
              <div style={{ background: "#F8F5FC", borderRadius: 10, padding: "14px", border: "1px solid #EDE8F4" }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: purple, marginBottom: 10 }}>Manager Actions</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={{ ...lbl, fontSize: 10 }}>Approved Cost ($)</label>
                    <input type="number" defaultValue={selected.cost_approved || ""}
                      id={`cost-${selected.id}`} style={{ ...inp, fontSize: 12 }} />
                  </div>
                  <div>
                    <label style={{ ...lbl, fontSize: 10 }}>Status</label>
                    <select defaultValue={selected.status} id={`status-${selected.id}`} style={{ ...inp, fontSize: 12 }}>
                      {["pending","approved","declined","in_progress","completed"].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={{ ...lbl, fontSize: 10 }}>Feedback / Notes to Educator</label>
                    <textarea defaultValue={selected.manager_feedback || ""}
                      id={`fb-${selected.id}`} rows={3}
                      style={{ ...inp, resize: "vertical", fontSize: 12 }} />
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={{ ...lbl, fontSize: 10 }}>Internal Manager Notes</label>
                    <textarea defaultValue={selected.manager_notes || ""}
                      id={`mn-${selected.id}`} rows={2}
                      style={{ ...inp, resize: "vertical", fontSize: 12 }} />
                  </div>
                </div>
                <button disabled={savingFb} onClick={() => saveFeedback(selected.id, {
                  status: document.getElementById(`status-${selected.id}`)?.value,
                  cost_approved: parseFloat(document.getElementById(`cost-${selected.id}`)?.value) || null,
                  manager_feedback: document.getElementById(`fb-${selected.id}`)?.value || null,
                  manager_notes: document.getElementById(`mn-${selected.id}`)?.value || null,
                })} style={{ ...btnP, fontSize: 12, padding: "7px 16px", opacity: savingFb ? 0.6 : 1 }}>
                  {savingFb ? "Saving…" : "Save & Update"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── Certifications Tab ────────────────────────────────────────────────────────
function CertificationsTab({ me }) {
  const certs = [
    { label: "First Aid", held: me?.first_aid, expiry: me?.first_aid_expiry },
    { label: "CPR (12 months)", held: true, expiry: me?.cpr_expiry },
    { label: "Anaphylaxis Management", held: true, expiry: me?.anaphylaxis_expiry },
    { label: "Asthma Management", held: true, expiry: me?.asthma_expiry },
    { label: "Working With Children Check", held: !!me?.wwcc_number, expiry: me?.wwcc_expiry, value: me?.wwcc_number },
  ];

  const rpEligible = me?.first_aid && !isExpired(me?.first_aid_expiry) && !isExpired(me?.cpr_expiry) && !isExpired(me?.anaphylaxis_expiry);

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
      <div style={card}>
        <h3 style={{margin:"0 0 6px",fontSize:14,color:"#3D3248"}}>My Certifications</h3>
        <p style={{margin:"0 0 16px",fontSize:12,color:"#8A7F96"}}>Contact your centre manager to update expiry dates or upload new certificates.</p>
        {certs.map(c=>{
          const expired = isExpired(c.expiry);
          const soon = !expired && isExpiringSoon(c.expiry, 60);
          const ok = c.expiry && !expired && !soon;
          const color = !c.expiry ? "#9E9E9E" : expired ? "#B71C1C" : soon ? "#E65100" : "#2E7D32";
          const icon = !c.expiry ? "—" : expired ? "✗" : soon ? "⚠" : "✓";
          const bg = !c.expiry ? "#F5F5F5" : expired ? "#FFEBEE" : soon ? "#FFF3E0" : "#E8F5E9";
          return (
            <div key={c.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderRadius:10,marginBottom:8,background:bg}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:"#3D3248"}}>{c.label}</div>
                {c.value&&<div style={{fontSize:11,color:"#8A7F96",marginTop:2}}>No. {c.value}</div>}
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:13,fontWeight:700,color}}>{icon} {c.expiry?fmtDate(c.expiry):"Not entered"}</div>
                {soon&&<div style={{fontSize:10,color:"#E65100",marginTop:2}}>Expiring soon</div>}
                {expired&&<div style={{fontSize:10,color:"#B71C1C",marginTop:2}}>Expired — please renew</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{...card,background:rpEligible?"#E8F5E9":"#FFEBEE",border:`1px solid ${rpEligible?"#A5D6A7":"#FFCDD2"}`}}>
        <div style={{fontWeight:700,fontSize:13,color:rpEligible?"#2E7D32":"#B71C1C",marginBottom:4}}>
          {rpEligible?"✓ You are Responsible Person eligible":"⚠ Not currently Responsible Person eligible"}
        </div>
        <div style={{fontSize:12,color:rpEligible?"#2E7D32":"#B71C1C"}}>
          {rpEligible?"All required certifications are current.":"Requires current First Aid, CPR (≤12 months), and Anaphylaxis certificates."}
        </div>
      </div>
      {me?.documents?.filter(d=>["qualification","certification"].includes(d.category)).length > 0 && (
        <div style={card}>
          <h3 style={{margin:"0 0 12px",fontSize:14,color:"#3D3248"}}>My Documents</h3>
          {me.documents.filter(d=>["qualification","certification"].includes(d.category)).map(doc=>{
            const expired = isExpired(doc.expiry_date);
            const soon = !expired && isExpiringSoon(doc.expiry_date, 60);
            return (
              <div key={doc.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #F0EBF8"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"#3D3248"}}>{doc.label}</div>
                  <div style={{fontSize:11,color:"#8A7F96"}}>{doc.category} · {doc.file_name}</div>
                </div>
                {doc.expiry_date&&<span style={{fontSize:12,fontWeight:700,color:expired?"#B71C1C":soon?"#E65100":"#2E7D32"}}>{fmtDate(doc.expiry_date)}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
