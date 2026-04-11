// ─── Developer API Portal ─────────────────────────────────────────────────
// Self-service UI for tenants to:
//   1. Create/revoke API keys (and copy the raw key once)
//   2. View 30-day usage stats + recent request log
//   3. Create/delete webhooks
//
// All routes hit /api/developer/* (manager JWT auth). The keys created here
// are used against /v1/* (the public API).

import { useState, useEffect, useCallback } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(tid ? { "x-tenant-id": tid } : {}),
      ...opts.headers,
    },
    method: opts.method || "GET",
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};

const toast = (msg, type = "success") => { if (window.showToast) window.showToast(msg, type); };

const purple = "#8B6DAF", lp = "#F0EBF8", DARK = "#3D3248", MU = "#8A7F96";
const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: "20px 24px" };
const inp = { padding: "9px 12px", borderRadius: 8, border: "1px solid #D9D0C7", fontSize: 13, width: "100%", boxSizing: "border-box", background: "#fff", fontFamily: "inherit" };
const lbl = { fontSize: 11, color: MU, display: "block", marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" };
const btnP = { background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit" };
const btnS = { background: lp, color: purple, border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 600, fontSize: 12, fontFamily: "inherit" };

const TIER_LABELS = {
  read: { l: "Read only", limit: 50000, desc: "GET requests · 50,000/month" },
  read_write: { l: "Read + Write", limit: 100000, desc: "GET + POST/PUT · 100,000/month" },
  full: { l: "Full access", limit: 500000, desc: "All endpoints + webhooks · 500,000/month" },
};

const ALL_EVENTS = [
  { id: "child.checkin",      label: "Child Check-in",     desc: "When a child signs in" },
  { id: "child.checkout",     label: "Child Check-out",    desc: "When a child signs out" },
  { id: "incident.created",   label: "Incident Created",   desc: "When a new incident is logged" },
  { id: "waitlist.added",     label: "Waitlist Added",     desc: "When a family joins the waitlist" },
  { id: "enrolment.created",  label: "Enrolment Created",  desc: "When a new enrolment is created" },
  { id: "invoice.paid",       label: "Invoice Paid",       desc: "When an invoice is marked paid" },
];

export default function DeveloperAPIModule() {
  const [tab, setTab] = useState("keys");

  const tabs = [
    { id: "keys", label: "🔑 API Keys" },
    { id: "usage", label: "📊 Usage & Logs" },
    { id: "webhooks", label: "🪝 Webhooks" },
  ];

  return (
    <div style={{ padding: "0 24px 32px" }}>
      {/* Header */}
      <div style={{ ...card, background: "linear-gradient(135deg,#1a0f2e,#3d2460)", color: "#fff", border: "none", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 36 }}>🚀</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Developer API</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.85 }}>
              First Australian childcare platform with a true open developer API.
              Build PowerBI dashboards, sync data into your accounting system, or wire Childcare360 events into Slack.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #EDE8F4", paddingBottom: 12 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "8px 16px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13,
              fontWeight: tab === t.id ? 700 : 500,
              background: tab === t.id ? purple : "transparent",
              color: tab === t.id ? "#fff" : MU,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "keys"     && <KeysTab />}
      {tab === "usage"    && <UsageTab />}
      {tab === "webhooks" && <WebhooksTab />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// API KEYS TAB
// ════════════════════════════════════════════════════════════════════════════
function KeysTab() {
  const [keys, setKeys] = useState([]);
  const [form, setForm] = useState({ name: "", tier: "read" });
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState(null); // raw key shown once after creation

  const load = useCallback(async () => {
    try {
      const r = await API("/api/developer/keys");
      if (Array.isArray(r)) setKeys(r);
    } catch (e) { toast("Failed to load API keys", "error"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim()) { toast("Key name required", "error"); return; }
    setCreating(true);
    try {
      const scopesByTier = { read: ["read"], read_write: ["read", "write"], full: ["read", "write", "webhooks"] };
      const r = await API("/api/developer/keys", {
        method: "POST",
        body: { name: form.name, tier: form.tier, scopes: scopesByTier[form.tier] || ["read"] },
      });
      if (r.error) { toast(r.error, "error"); return; }
      setNewKey(r);
      setForm({ name: "", tier: "read" });
      load();
    } catch (e) { toast("Failed to create key: " + (e.message || ""), "error"); }
    setCreating(false);
  };

  const revoke = async (id, name) => {
    if (!(await window.showConfirm(`Revoke key "${name}"? Any integration using it will stop working immediately.`))) return;
    try {
      const r = await API(`/api/developer/keys/${id}`, { method: "DELETE" });
      if (r.error) { toast(r.error, "error"); return; }
      toast("Key revoked");
      load();
    } catch (e) { toast("Failed to revoke key", "error"); }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text).then(
      () => toast("Copied to clipboard"),
      () => toast("Copy failed", "error"),
    );
  };

  const formatLastUsed = (ts) => {
    if (!ts) return "Never";
    const diff = (Date.now() - new Date(ts + (ts.includes("Z") ? "" : "Z")).getTime()) / 1000;
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div>
      {/* Newly created key — shown ONCE in a highlighted box */}
      {newKey && (
        <div style={{ ...card, background: "#FFF8E1", border: "2px solid #FFCC80", marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#E65100", marginBottom: 8 }}>
            ⚠ Copy this key now — it won't be shown again
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#fff", borderRadius: 8, border: "1px solid #FFE082" }}>
            <code style={{ flex: 1, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13, color: DARK, wordBreak: "break-all" }}>
              {newKey.raw_key}
            </code>
            <button onClick={() => copyToClipboard(newKey.raw_key)} style={{ ...btnP, padding: "8px 14px", flexShrink: 0 }}>
              📋 Copy
            </button>
            <button onClick={() => setNewKey(null)} style={{ background: "none", border: "none", cursor: "pointer", color: MU, fontSize: 18 }}>✕</button>
          </div>
          <div style={{ fontSize: 11, color: "#7A5C00", marginTop: 8 }}>
            Tier: <strong>{newKey.tier}</strong> · Scopes: {newKey.scopes?.join(", ")}
          </div>
        </div>
      )}

      {/* Create new key — Pattern A: form left, info right */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 24, marginBottom: 24 }}>
        <div style={card}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, color: DARK }}>Create New API Key</h3>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Key Name</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. My PowerBI Integration" style={inp} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Access Level</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(TIER_LABELS).map(([id, t]) => (
                <label key={id} style={{
                  display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px",
                  borderRadius: 10, cursor: "pointer",
                  border: `2px solid ${form.tier === id ? purple : "#EDE8F4"}`,
                  background: form.tier === id ? "#F8F5FC" : "#fff",
                }}>
                  <input type="radio" name="tier" checked={form.tier === id} onChange={() => setForm(p => ({ ...p, tier: id }))} style={{ marginTop: 3 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: DARK }}>{t.l}</div>
                    <div style={{ fontSize: 11, color: MU, marginTop: 2 }}>{t.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <button onClick={create} disabled={creating || !form.name.trim()} style={{ ...btnP, width: "100%", opacity: !form.name.trim() ? 0.5 : 1 }}>
            {creating ? "Generating…" : "🔑 Generate API Key"}
          </button>
        </div>

        <div style={card}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, color: DARK }}>Quick Reference</h3>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: MU, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Plan inclusion</div>
            <div style={{ fontSize: 12, color: DARK }}>Included free on the <strong>Group</strong> tier · add-on from <strong>$99/mo</strong> on lower tiers</div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: MU, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Base URL</div>
            <code style={{ fontSize: 12, color: purple, background: "#F8F5FC", padding: "4px 8px", borderRadius: 6 }}>{window.location.origin}/v1</code>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: MU, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Authentication</div>
            <div style={{ fontSize: 12, color: DARK, lineHeight: 1.5 }}>
              <code style={{ background: "#F8F5FC", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>Authorization: Bearer c360_sk_…</code>
              <br />or<br />
              <code style={{ background: "#F8F5FC", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>X-API-Key: c360_sk_…</code>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: MU, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Endpoints</div>
            <div style={{ fontSize: 12, color: DARK, lineHeight: 1.7 }}>
              GET /v1/children · /v1/attendance · /v1/rooms<br />
              GET /v1/educators · /v1/incidents · /v1/waitlist · /v1/invoices
            </div>
          </div>
        </div>
      </div>

      {/* Existing keys table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #EDE8F4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 14, color: DARK }}>Your API Keys ({keys.length})</h3>
        </div>
        {keys.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: MU }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🔑</div>
            <div>No API keys yet. Create your first key above to start using the public API.</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#FDFBF9" }}>
                {["Name", "Prefix", "Tier", "Usage", "Last Used", "Status", ""].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: MU, fontWeight: 700, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id} style={{ borderTop: "1px solid #F0EBF8" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 700, color: DARK }}>{k.name}</td>
                  <td style={{ padding: "12px 14px" }}>
                    <code style={{ fontSize: 11, color: MU, background: "#F8F5FC", padding: "2px 6px", borderRadius: 4 }}>{k.key_prefix}…</code>
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 11, color: DARK }}>{TIER_LABELS[k.tier]?.l || k.tier}</td>
                  <td style={{ padding: "12px 14px", fontSize: 11, color: DARK }}>
                    {(k.requests_this_month || 0).toLocaleString()} / {(k.requests_per_month_limit || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 11, color: MU }}>{formatLastUsed(k.last_used_at)}</td>
                  <td style={{ padding: "12px 14px" }}>
                    {k.is_active
                      ? <span style={{ fontSize: 11, fontWeight: 700, color: "#2E7D32", background: "#E8F5E9", padding: "3px 10px", borderRadius: 12 }}>✅ Active</span>
                      : <span style={{ fontSize: 11, fontWeight: 700, color: "#B71C1C", background: "#FFEBEE", padding: "3px 10px", borderRadius: 12 }}>Revoked</span>}
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>
                    {k.is_active && (
                      <button onClick={() => revoke(k.id, k.name)} style={{ background: "none", border: "1px solid #FFCDD2", color: "#B71C1C", borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// USAGE TAB
// ════════════════════════════════════════════════════════════════════════════
function UsageTab() {
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await API("/api/developer/usage?days=30");
      if (r && !r.error) setData(r);
    } catch (e) { toast("Failed to load usage", "error"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!data) return <div style={{ padding: 40, textAlign: "center", color: MU }}>Loading usage…</div>;

  const { summary, daily, recent } = data;
  const maxRequests = Math.max(...(daily || []).map(d => d.requests || 0), 1);
  const daysToReset = (() => {
    const now = new Date();
    const eom = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return Math.ceil((eom - now) / 86400000);
  })();

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          ["Requests (30d)", (summary.total_requests || 0).toLocaleString(), purple],
          ["Avg Response", `${summary.avg_response_ms || 0}ms`, "#2E7D32"],
          ["Error Rate", `${summary.error_rate_pct || 0}%`, summary.error_rate_pct > 5 ? "#B71C1C" : "#2E7D32"],
          ["Days to Reset", daysToReset, "#5B8DB5"],
        ].map(([l, v, c]) => (
          <div key={l} style={{ ...card, textAlign: "center", borderTop: `3px solid ${c}` }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: c }}>{v}</div>
            <div style={{ fontSize: 11, color: MU, marginTop: 4, fontWeight: 600, textTransform: "uppercase" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Daily chart + recent log — Pattern C: chart left (2fr), log right (1fr) */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, alignItems: "start" }}>
        <div style={card}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, color: DARK }}>Daily Requests — Last 30 Days</h3>
          {daily.length === 0 ? (
            <div style={{ padding: "30px 0", textAlign: "center", color: MU, fontSize: 13 }}>No requests yet</div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 180 }}>
              {daily.map((d, i) => {
                const h = Math.round(((d.requests || 0) / maxRequests) * 160);
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                    title={`${d.date}: ${d.requests} requests · ${d.errors} errors`}>
                    <div style={{ width: "100%", height: h, background: purple, borderRadius: "3px 3px 0 0", minHeight: 2 }} />
                    <div style={{ fontSize: 9, color: MU, transform: "rotate(-45deg)", transformOrigin: "top left", whiteSpace: "nowrap", marginTop: 4 }}>
                      {d.date?.slice(5)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #EDE8F4" }}>
            <h3 style={{ margin: 0, fontSize: 14, color: DARK }}>Recent Requests</h3>
          </div>
          {recent.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: MU, fontSize: 12 }}>No requests yet</div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {recent.map(r => (
                <div key={r.id} style={{ padding: "10px 20px", borderBottom: "1px solid #F0EBF8", fontSize: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 700, color: r.method === "GET" ? "#2E7D32" : purple }}>{r.method}</span>
                    <span style={{ fontWeight: 700, color: (r.status_code || 0) >= 400 ? "#B71C1C" : "#2E7D32" }}>
                      {r.status_code || "—"}
                    </span>
                  </div>
                  <div style={{ color: DARK, fontFamily: "ui-monospace, Menlo, monospace", marginTop: 3, wordBreak: "break-all" }}>{r.path}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: MU, fontSize: 10, marginTop: 3 }}>
                    <span>{r.created_at}</span>
                    <span>{r.response_time_ms ? `${r.response_time_ms}ms` : "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// WEBHOOKS TAB
// ════════════════════════════════════════════════════════════════════════════
function WebhooksTab() {
  const [webhooks, setWebhooks] = useState([]);
  const [form, setForm] = useState({ url: "", events: [] });
  const [creating, setCreating] = useState(false);
  const [newWebhook, setNewWebhook] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await API("/api/developer/webhooks");
      if (Array.isArray(r)) setWebhooks(r);
    } catch (e) { toast("Failed to load webhooks", "error"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.url.trim()) { toast("Webhook URL required", "error"); return; }
    if (form.events.length === 0) { toast("Select at least one event", "error"); return; }
    setCreating(true);
    try {
      const r = await API("/api/developer/webhooks", { method: "POST", body: form });
      if (r.error) { toast(r.error, "error"); return; }
      setNewWebhook(r);
      setForm({ url: "", events: [] });
      load();
    } catch (e) { toast("Failed to create webhook", "error"); }
    setCreating(false);
  };

  const del = async (id, url) => {
    if (!(await window.showConfirm(`Delete webhook ${url}?`))) return;
    try {
      const r = await API(`/api/developer/webhooks/${id}`, { method: "DELETE" });
      if (r.error) { toast(r.error, "error"); return; }
      toast("Webhook deleted");
      load();
    } catch (e) { toast("Failed to delete webhook", "error"); }
  };

  const toggleEvent = (eventId) => {
    setForm(p => ({
      ...p,
      events: p.events.includes(eventId) ? p.events.filter(e => e !== eventId) : [...p.events, eventId],
    }));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text).then(() => toast("Copied"), () => toast("Copy failed", "error"));
  };

  return (
    <div>
      {/* New webhook secret — shown ONCE */}
      {newWebhook && (
        <div style={{ ...card, background: "#FFF8E1", border: "2px solid #FFCC80", marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#E65100", marginBottom: 8 }}>
            ⚠ Save this webhook secret — used to verify payload signatures (HMAC-SHA256)
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#fff", borderRadius: 8, border: "1px solid #FFE082" }}>
            <code style={{ flex: 1, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, color: DARK, wordBreak: "break-all" }}>
              {newWebhook.secret}
            </code>
            <button onClick={() => copyToClipboard(newWebhook.secret)} style={{ ...btnP, padding: "8px 14px", flexShrink: 0 }}>📋 Copy</button>
            <button onClick={() => setNewWebhook(null)} style={{ background: "none", border: "none", cursor: "pointer", color: MU, fontSize: 18 }}>✕</button>
          </div>
          <div style={{ fontSize: 11, color: "#7A5C00", marginTop: 8 }}>URL: {newWebhook.url}</div>
        </div>
      )}

      <div style={{ ...card, marginBottom: 20, background: "#F8F5FC", border: "1px solid #DDD6EE" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: purple, marginBottom: 4 }}>Real-time event delivery</div>
        <div style={{ fontSize: 12, color: MU }}>
          Childcare360 will POST event payloads to your URL within seconds of an event occurring.
          Payloads include an <code style={{ background: "#fff", padding: "1px 5px", borderRadius: 4 }}>X-Childcare360-Signature</code> header
          you can verify using your webhook secret.
        </div>
      </div>

      {/* Create webhook — Pattern A */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 24, marginBottom: 24 }}>
        <div style={card}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, color: DARK }}>Create Webhook</h3>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Endpoint URL</label>
            <input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))}
              placeholder="https://example.com/webhooks/childcare360" style={inp} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Events to Subscribe</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {ALL_EVENTS.map(e => (
                <label key={e.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px",
                  borderRadius: 8, cursor: "pointer",
                  border: `1px solid ${form.events.includes(e.id) ? purple : "#EDE8F4"}`,
                  background: form.events.includes(e.id) ? "#F8F5FC" : "#fff",
                }}>
                  <input type="checkbox" checked={form.events.includes(e.id)} onChange={() => toggleEvent(e.id)} style={{ marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: DARK }}>{e.label}</div>
                    <div style={{ fontSize: 10, color: MU }}>{e.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <button onClick={create} disabled={creating || !form.url.trim() || form.events.length === 0}
            style={{ ...btnP, width: "100%", opacity: !form.url.trim() || form.events.length === 0 ? 0.5 : 1 }}>
            {creating ? "Creating…" : "+ Add Webhook"}
          </button>
        </div>

        <div style={card}>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, color: DARK }}>Payload Format</h3>
          <pre style={{ background: "#1a0f2e", color: "#A8FFD3", padding: 14, borderRadius: 8, fontSize: 11, overflow: "auto", margin: 0, fontFamily: "ui-monospace, Menlo, monospace", lineHeight: 1.5 }}>
{`{
  "event": "child.checkin",
  "tenant_id": "...",
  "occurred_at": "2026-04-11T08:30:00Z",
  "data": {
    "child_id": "...",
    "first_name": "Mia",
    "room_id": "..."
  }
}`}
          </pre>
        </div>
      </div>

      {/* Existing webhooks */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #EDE8F4" }}>
          <h3 style={{ margin: 0, fontSize: 14, color: DARK }}>Active Webhooks ({webhooks.length})</h3>
        </div>
        {webhooks.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: MU }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🪝</div>
            <div>No webhooks configured yet.</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#FDFBF9" }}>
                {["URL", "Events", "Last Triggered", "Failures", "Status", ""].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: MU, fontWeight: 700, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {webhooks.map(w => (
                <tr key={w.id} style={{ borderTop: "1px solid #F0EBF8" }}>
                  <td style={{ padding: "12px 14px", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, color: DARK, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.url}</td>
                  <td style={{ padding: "12px 14px", fontSize: 11, color: MU }}>{w.events?.length || 0} event{w.events?.length !== 1 ? "s" : ""}</td>
                  <td style={{ padding: "12px 14px", fontSize: 11, color: MU }}>{w.last_triggered_at || "Never"}</td>
                  <td style={{ padding: "12px 14px", fontSize: 11, color: w.failure_count > 0 ? "#B71C1C" : MU }}>{w.failure_count || 0}</td>
                  <td style={{ padding: "12px 14px" }}>
                    {w.is_active
                      ? <span style={{ fontSize: 11, fontWeight: 700, color: "#2E7D32", background: "#E8F5E9", padding: "3px 10px", borderRadius: 12 }}>✅ Active</span>
                      : <span style={{ fontSize: 11, fontWeight: 700, color: MU, background: "#F5F5F5", padding: "3px 10px", borderRadius: 12 }}>Inactive</span>}
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>
                    <button onClick={() => del(w.id, w.url)} style={{ background: "none", border: "1px solid #FFCDD2", color: "#B71C1C", borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
