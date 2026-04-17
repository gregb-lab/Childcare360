/**
 * NotificationsPanel.jsx — v2.14.0
 * Notification bell dropdown + full inbox page
 * Also exports HQDashboard — multi-site owner view
 */
import { useState, useEffect, useCallback, useRef } from "react";

const API = (p, o={}) => {
  const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
  return fetch(p,{headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})},
    method:o.method||"GET",...(o.body?{body:JSON.stringify(o.body)}:{})}).then(r=>r.json());
};

const P="#7C3AED",PL="#EDE4F0",DARK="#3D3248",MU="#8A7F96";
const OK="#16A34A",WA="#D97706",DA="#DC2626",IN="#0284C7";
const card={background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"18px 22px"};
const bp={padding:"9px 18px",borderRadius:9,border:"none",background:P,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13};
const bs={padding:"9px 18px",borderRadius:9,border:`1px solid ${P}`,background:"#fff",color:P,fontWeight:600,cursor:"pointer",fontSize:13};

const fmtAge = d => {
  const secs = (Date.now() - new Date(d)) / 1000;
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs/3600)}h ago`;
  return `${Math.floor(secs/86400)}d ago`;
};

const PRIO_C = { high: DA, normal: IN, low: MU };

// ─── NOTIFICATION BELL ────────────────────────────────────────────────────────
export function NotificationBell({ onOpenInbox }) {
  const [unread, setUnread] = useState(0);
  const [open,   setOpen]   = useState(false);
  const [notifs, setNotifs] = useState([]);
  const ref = useRef(null);

  const load = useCallback(() => {
    API("/api/notifications/inbox?limit=8").then(r => {
      setUnread(r.unread_count || 0);
      setNotifs(r.notifications || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000); // poll every minute
    return () => clearInterval(interval);
  }, [load]);

  // Close on outside click
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markAllRead = async () => {
    await API("/api/notifications/read-all", { method: "PUT" }).catch(e=>console.error('API error:',e));
    load();
  };

  const markRead = async (id) => {
    await API(`/api/notifications/${id}/read`, { method: "PUT" }).catch(e=>console.error('API error:',e));
    load();
  };

  const runScan = async () => {
    await API("/api/notifications/run", { method: "POST" }).catch(e=>console.error('API error:',e));
    load();
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ position:"relative", border:"none", cursor:"pointer",
          padding:8, borderRadius:10, color: open ? P : MU,
          background: open ? PL : "none" }}>
        <span style={{ fontSize: 20 }}>🔔</span>
        {unread > 0 && (
          <span style={{ position:"absolute", top:2, right:2, background:DA, color:"#fff",
            borderRadius:"50%", width:18, height:18, fontSize:10, fontWeight:900,
            display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position:"absolute", right:0, top:"calc(100% + 6px)", width:360,
          background:"#fff", borderRadius:14, boxShadow:"0 8px 32px rgba(61,50,72,0.18)",
          border:"1px solid #EDE8F4", zIndex:1000, overflow:"hidden" }}>

          {/* Header */}
          <div style={{ padding:"12px 16px", borderBottom:"1px solid #F0EBF8",
            display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontWeight:700, fontSize:14, color:DARK }}>
              Notifications {unread > 0 && <span style={{ color:DA, marginLeft:6, fontSize:12 }}>{unread} new</span>}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              {unread > 0 && (
                <button onClick={markAllRead}
                  style={{ background:"none", border:"none", color:P, fontSize:11, cursor:"pointer", fontWeight:600 }}>
                  Mark all read
                </button>
              )}
              <button onClick={runScan}
                style={{ background:"none", border:"none", color:MU, fontSize:11, cursor:"pointer" }}
                title="Scan for new alerts">
                🔍
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ maxHeight:380, overflowY:"auto" }}>
            {notifs.length === 0 ? (
              <div style={{ padding:"32px 16px", textAlign:"center", color:MU }}>
                <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
                <div style={{ fontSize:13 }}>All caught up!</div>
                <button onClick={runScan}
                  style={{ marginTop:12, ...bp, fontSize:12, padding:"6px 14px" }}>
                  Scan for alerts
                </button>
              </div>
            ) : notifs.map(n => (
              <div key={n.id} onClick={() => markRead(n.id)}
                style={{ padding:"12px 16px", borderBottom:"1px solid #F8F5FC", cursor:"pointer",
                  background: n.is_read ? "#fff" : "#FAFAFF",
                  borderLeft: n.is_read ? "none" : `3px solid ${PRIO_C[n.priority]||IN}` }}>
                <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                  <span style={{ fontSize:20, flexShrink:0 }}>{n.icon}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight: n.is_read ? 400 : 700, fontSize:13, color:DARK,
                      whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {n.subject}
                    </div>
                    <div style={{ fontSize:11, color:MU, marginTop:2, lineHeight:1.4,
                      overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
                      {n.body}
                    </div>
                  </div>
                  <div style={{ fontSize:10, color:MU, flexShrink:0, marginLeft:4 }}>
                    {fmtAge(n.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ padding:"10px 16px", borderTop:"1px solid #F0EBF8", textAlign:"center" }}>
            <button onClick={() => { setOpen(false); onOpenInbox?.(); }}
              style={{ background:"none", border:"none", color:P, fontSize:12, cursor:"pointer", fontWeight:600 }}>
              View all notifications →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FULL INBOX PAGE ──────────────────────────────────────────────────────────
export function NotificationsInbox() {
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState("all");
  const [scanning, setScanning] = useState(false);

  const load = useCallback(() => {
    const url = filter === "unread"
      ? "/api/notifications/inbox?unread_only=true&limit=100"
      : "/api/notifications/inbox?limit=100";
    API(url).then(r => {
      setNotifs(r.notifications || []);
      setUnread(r.unread_count || 0);
    });
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const scan = async () => {
    setScanning(true);
    const r = await API("/api/notifications/run", { method: "POST" }).catch(e=>console.error('API error:',e));
    await load();
    setScanning(false);
    if (r?.generated > 0) {
      window.showToast?.(`Generated ${r.generated} notification${r.generated > 1 ? "s" : ""}`, "success");
    } else {
      window.showToast?.("All clear — no new alerts", "success");
    }
  };

  const markAllRead = async () => {
    await API("/api/notifications/read-all", { method: "PUT" }).catch(e=>console.error('API error:',e));
    load();
  };

  const TYPE_GROUPS = {
    birthday:              { label: "Birthdays",       icon: "🎂", color: "#E879F9" },
    cert_expiry:           { label: "Certifications",  icon: "⚠️", color: DA },
    wwcc_expiry:           { label: "WWCC",            icon: "🪪", color: DA },
    wwcc_expiry_90:        { label: "WWCC",            icon: "🪪", color: WA },
    debt_reminder:         { label: "Debt",            icon: "💳", color: DA },
    low_occupancy:         { label: "Occupancy",       icon: "📉", color: WA },
    immunisation_missing:  { label: "Immunisation",    icon: "💉", color: IN },
    appraisal_due:         { label: "Appraisals",      icon: "⭐", color: P },
  };

  const filtered = filter === "unread" ? notifs.filter(n => !n.is_read) : notifs;

  // Group by date
  const grouped = {};
  filtered.forEach(n => {
    const date = n.created_at?.split("T")[0] || "unknown";
    (grouped[date] = grouped[date] || []).push(n);
  });

  return (
    <div style={{ padding:"24px 28px", maxWidth:800, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <span style={{ fontSize:28 }}>🔔</span>
          <div>
            <h1 style={{ margin:0, fontSize:22, fontWeight:900, color:DARK }}>Notifications</h1>
            <p style={{ margin:"3px 0 0", fontSize:13, color:MU }}>
              Birthdays · Cert expiry · Debt reminders · Compliance alerts
            </p>
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {unread > 0 && (
            <button onClick={markAllRead} style={bs}>Mark all read</button>
          )}
          <button onClick={scan} disabled={scanning} style={bp}>
            {scanning ? "Scanning…" : "🔍 Scan Now"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {["all","unread"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding:"6px 14px", borderRadius:8, border:"none", cursor:"pointer",
              fontSize:12, fontWeight:600, textTransform:"capitalize",
              background: filter===f ? P : "#F0EBF8",
              color: filter===f ? "#fff" : P }}>
            {f} {f==="unread" && unread > 0 && `(${unread})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...card, textAlign:"center", padding:"60px 20px" }}>
          <div style={{ fontSize:48 }}>✅</div>
          <div style={{ fontWeight:700, fontSize:16, color:DARK, marginTop:12 }}>All caught up</div>
          <p style={{ color:MU, fontSize:13, marginTop:8 }}>
            Click "Scan Now" to check for new alerts across your centre.
          </p>
        </div>
      ) : Object.entries(grouped).sort((a,b) => b[0].localeCompare(a[0])).map(([date, items]) => (
        <div key={date}>
          <div style={{ fontSize:11, color:MU, fontWeight:700, textTransform:"uppercase",
            letterSpacing:"0.06em", padding:"12px 0 6px" }}>
            {date === new Date().toISOString().split("T")[0] ? "Today"
              : date === new Date(Date.now()-86400000).toISOString().split("T")[0] ? "Yesterday"
              : date === "unknown" ? "Unknown date" : new Date(date+"T12:00").toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"})}
          </div>
          {items.map(n => {
            const meta = TYPE_GROUPS[n.type] || { icon:"🔔", color:IN };
            return (
              <div key={n.id}
                style={{ ...card, marginBottom:8, padding:"14px 18px",
                  borderLeft:`4px solid ${n.is_read ? "#EDE8F4" : (PRIO_C[n.priority]||IN)}`,
                  opacity: n.is_read ? 0.75 : 1 }}>
                <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                  <span style={{ fontSize:24, flexShrink:0 }}>{n.icon || meta.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                      <div style={{ fontWeight: n.is_read ? 500 : 700, fontSize:14, color:DARK }}>
                        {n.subject}
                      </div>
                      <div style={{ fontSize:11, color:MU, flexShrink:0, marginLeft:12 }}>
                        {fmtAge(n.created_at)}
                      </div>
                    </div>
                    <div style={{ fontSize:13, color:MU, lineHeight:1.5 }}>{n.body}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── HQ MULTI-SITE DASHBOARD ──────────────────────────────────────────────────
export function HQDashboard() {
  const [tenants, setTenants] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Platform admin: fetch all tenants + metrics
    API("/api/platform/tenants").then(r => {
      const list = r.tenants || r.data || [];
      setTenants(list);
      // Load metrics for each
      Promise.all(list.map(t =>
        fetch("/api/platform/metrics/" + t.id, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("c360_token")}`,
            "x-tenant-id": t.id,
          }
        }).then(r => r.json()).catch(() => ({}))
      )).then(results => {
        const map = {};
        list.forEach((t, i) => { map[t.id] = results[i]; });
        setMetrics(map);
        setLoading(false);
      });
    }).catch(() => setLoading(false));
  }, []);

  const PLAN_C = { starter:"#6B7280", professional:IN, enterprise:P, trial:WA };

  const allMetrics = Object.values(metrics);
  const totals = {
    centres: tenants.length,
    children: allMetrics.reduce((s,m) => s+(m.active_children||0), 0),
    educators: allMetrics.reduce((s,m) => s+(m.active_educators||0), 0),
    revenue: allMetrics.reduce((s,m) => s+(m.revenue_cents||0), 0)/100,
    avgOccupancy: allMetrics.length
      ? Math.round(allMetrics.reduce((s,m) => s+(m.occupancy_pct||0),0)/allMetrics.length)
      : 0,
  };

  return (
    <div style={{ padding:"24px 28px", maxWidth:1200, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:24 }}>
        <span style={{ fontSize:28 }}>🌐</span>
        <div>
          <h1 style={{ margin:0, fontSize:22, fontWeight:900, color:DARK }}>HQ Dashboard</h1>
          <p style={{ margin:"3px 0 0", fontSize:13, color:MU }}>
            Multi-site overview · {tenants.length} service{tenants.length!==1?"s":""}
          </p>
        </div>
      </div>

      {/* Platform totals */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:24 }}>
        {[
          ["Centres",     totals.centres,                 P],
          ["Children",    totals.children,                IN],
          ["Educators",   totals.educators,               OK],
          ["Avg Occupancy",`${totals.avgOccupancy}%`,     WA],
          ["Est. Monthly",`$${Math.round(totals.revenue).toLocaleString()}`, "#16A34A"],
        ].map(([l,v,c])=>(
          <div key={l} style={{ ...card, textAlign:"center", borderTop:`3px solid ${c}` }}>
            <div style={{ fontSize:24, fontWeight:900, color:c }}>{v}</div>
            <div style={{ fontSize:11, color:MU, marginTop:4 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Per-tenant grid */}
      {loading ? (
        <div style={{ textAlign:"center", padding:60, color:MU }}>Loading site data…</div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:14 }}>
          {tenants.map(t => {
            const m = metrics[t.id] || {};
            const occ = m.occupancy_pct || 0;
            const occColor = occ >= 80 ? OK : occ >= 60 ? WA : DA;

            return (
              <div key={t.id} style={{ ...card, padding:"16px 20px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color:DARK }}>{t.name}</div>
                    <div style={{ fontSize:11, color:MU, marginTop:2 }}>{t.region || "AU"} · {t.domain}</div>
                  </div>
                  <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20,
                    background:(PLAN_C[t.subscription_plan]||MU)+"20",
                    color:PLAN_C[t.subscription_plan]||MU, textTransform:"capitalize" }}>
                    {t.subscription_plan || "trial"}
                  </span>
                </div>

                {/* Metric pills */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}>
                  {[
                    [m.active_children||0, "Children", IN],
                    [m.active_educators||0,"Educators",P],
                    [`${Math.round(occ)}%`,"Occupancy",occColor],
                  ].map(([v,l,c])=>(
                    <div key={l} style={{ textAlign:"center", padding:"8px 4px",
                      borderRadius:10, background:`${c}10`, border:`1px solid ${c}30` }}>
                      <div style={{ fontWeight:800, fontSize:16, color:c }}>{v}</div>
                      <div style={{ fontSize:10, color:MU }}>{l}</div>
                    </div>
                  ))}
                </div>

                {/* Occupancy bar */}
                <div style={{ marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:MU, marginBottom:3 }}>
                    <span>Occupancy</span>
                    <span style={{ color:occColor, fontWeight:700 }}>{Math.round(occ)}%</span>
                  </div>
                  <div style={{ background:"#F0EBF8", borderRadius:4, height:6 }}>
                    <div style={{ width:`${Math.min(100,occ)}%`, height:"100%",
                      background:occColor, borderRadius:4, transition:"width 0.3s" }}/>
                  </div>
                </div>

                <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:MU }}>
                  <span>Compliance: <strong style={{ color:m.compliance_pct>=90?OK:m.compliance_pct>=70?WA:DA }}>
                    {Math.round(m.compliance_pct||0)}%
                  </strong></span>
                  {m.incidents > 0 && <span style={{ color:DA }}>⚠️ {m.incidents} incidents</span>}
                  <span>NQS: <strong style={{ color:P }}>{t.nqs_rating||"Not rated"}</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
