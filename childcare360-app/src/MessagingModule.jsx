import { useState, useEffect, useCallback } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}), ...opts.headers },
    method: opts.method || "GET", ...(opts.body ? { body: opts.body } : {}),
  }).then(r => r.json());
};

const purple = "#8B6DAF";
const lightPurple = "#F0EBF8";
const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: "20px 24px" };

const TRIGGER_LABELS = {
  immunisation_due:      "Immunisation Due",
  medical_plan_expiry:   "Medical Plan Expiry",
  medication_expiry:     "Medication Expiry",
  invoice_overdue:       "Invoice Overdue",
  subsidy_alert:         "CCS Subsidy Alert",
  cert_expiry:           "Educator Cert Expiry",
  wwcc_expiry:           "WWCC Expiry",
  custom:                "Custom",
};

const CHANNEL_COLORS = {
  email:  ["#1565C0", "#E3F2FD"],
  sms:    ["#2E7D32", "#E8F5E9"],
  in_app: [purple,   lightPurple],
  portal: ["#E65100", "#FFF3E0"],
};

const DEFAULT_TEMPLATES = [
  { trigger_type: "immunisation_due", channel: "email", days_before: 30, subject: "Immunisation due in 30 days — {{child_name}}", body_html: "Dear {{parent_name}},\n\n{{child_name}}'s next immunisation is due in 30 days ({{due_date}}).\n\nPlease contact your GP to book an appointment and provide an updated AIR statement to {{centre_name}}.\n\nKind regards,\n{{centre_name}}" },
  { trigger_type: "immunisation_due", channel: "email", days_before: 7,  subject: "⚠ Immunisation overdue — {{child_name}}", body_html: "Dear {{parent_name}},\n\n{{child_name}}'s immunisation was due {{due_date}}. Please provide evidence of vaccination or a valid exemption within 7 days to maintain enrolment.\n\n{{centre_name}}" },
  { trigger_type: "medical_plan_expiry", channel: "email", days_before: 60, subject: "Action plan renewal due — {{child_name}}", body_html: "Dear {{parent_name}},\n\n{{child_name}}'s medical action plan expires {{due_date}}. Please arrange a review with your doctor and return the updated plan to us.\n\n{{centre_name}}" },
  { trigger_type: "medical_plan_expiry", channel: "in_app", days_before: 14, subject: "Medical plan expiring soon", body_html: "{{child_name}}'s action plan expires {{due_date}} — follow up with family required." },
  { trigger_type: "medication_expiry", channel: "email", days_before: 30, subject: "Medication expiring — {{child_name}}", body_html: "Dear {{parent_name}},\n\nThe medication we hold for {{child_name}} expires {{due_date}}. Please arrange a replacement or advise if no longer required.\n\n{{centre_name}}" },
  { trigger_type: "invoice_overdue",   channel: "email", days_before: -7, subject: "Invoice overdue — {{centre_name}}", body_html: "Dear {{parent_name}},\n\nYour account is overdue. Please arrange payment or contact us to discuss a payment plan.\n\n{{centre_name}}" },
];

const VARIABLES = ["{{child_name}}", "{{parent_name}}", "{{due_date}}", "{{centre_name}}", "{{amount}}", "{{invoice_number}}"];

function Badge({ text, color, bg }) {
  return <span style={{ background: bg, color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{text}</span>;
}

export default function MessagingModule() {
  const [tab, setTab] = useState("templates");
  const [templates, setTemplates] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [editing, setEditing] = useState(null); // template being edited
  const [saving, setSaving] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      const d = await API("/api/messaging/templates");
      if (Array.isArray(d) && d.length > 0) {
        setTemplates(d);
      } else {
        // Show defaults if none saved
        setTemplates(DEFAULT_TEMPLATES.map((t, i) => ({ ...t, id: `default_${i}`, active: true })));
      }
    } catch (e) {
      setTemplates(DEFAULT_TEMPLATES.map((t, i) => ({ ...t, id: `default_${i}`, active: true })));
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const d = await API("/api/messaging/notifications?limit=50");
      if (Array.isArray(d)) setNotifications(d);
    } catch (e) {}
  }, []);

  useEffect(() => {
    loadTemplates();
    loadNotifications();
  }, [loadTemplates, loadNotifications]);

  const saveTemplate = async (tmpl) => {
    setSaving(true);
    try {
      if (tmpl.id?.startsWith("default_") || !tmpl.id) {
        await API("/api/messaging/templates", { method: "POST", body: JSON.stringify(tmpl) });
      } else {
        await API(`/api/messaging/templates/${tmpl.id}`, { method: "PUT", body: JSON.stringify(tmpl) });
      }
      setEditing(null);
      loadTemplates();
    } catch (e) {}
    setSaving(false);
  };

  const toggleActive = async (tmpl) => {
    await saveTemplate({ ...tmpl, active: !tmpl.active });
  };

  const groupedTemplates = templates.reduce((acc, t) => {
    const key = t.trigger_type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const unreadCount = notifications.filter(n => !n.read_at).length;

  return (
    <div style={{ padding: "0 24px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, color: "#3D3248" }}>Messaging & Notifications</h2>
          <p style={{ margin: "4px 0 0", color: "#8A7F96", fontSize: 13 }}>
            Automated notification templates and message history
          </p>
        </div>
        {tab === "templates" && (
          <button onClick={() => setEditing({ trigger_type: "custom", channel: "email", days_before: 0, subject: "", body_html: "", active: true })}
            style={{ background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
            + New Template
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#F8F5F1", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {[
          { id: "templates", label: "Notification Templates" },
          { id: "history", label: `Message History${unreadCount > 0 ? ` (${unreadCount})` : ""}` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
              background: tab === t.id ? "#fff" : "transparent", color: tab === t.id ? purple : "#8A7F96",
              boxShadow: tab === t.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TEMPLATES */}
      {tab === "templates" && !editing && (
        <div>
          {/* Info banner */}
          <div style={{ background: lightPurple, borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: purple }}>
            <strong>Automated notifications</strong> are sent based on triggers (immunisation due, plan expiry, etc).
            Configure the timing and message for each trigger below. Available variables: {VARIABLES.map(v => <code key={v} style={{ fontSize: 11, background: "#fff", padding: "1px 5px", borderRadius: 4, marginLeft: 4 }}>{v}</code>)}
          </div>

          {Object.entries(groupedTemplates).length === 0 && (
            <div style={{ ...card, textAlign: "center", color: "#8A7F96", padding: 48 }}>No templates configured</div>
          )}

          {Object.entries(groupedTemplates).map(([trigger, tmpls]) => (
            <div key={trigger} style={{ ...card, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, color: "#3D3248", fontSize: 14, marginBottom: 14 }}>
                {TRIGGER_LABELS[trigger] || trigger}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {tmpls.map(tmpl => {
                  const [col, bg] = CHANNEL_COLORS[tmpl.channel] || [purple, lightPurple];
                  return (
                    <div key={tmpl.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 14px", borderRadius: 10, background: tmpl.active ? "#FDFBF9" : "#F5F5F5",
                      border: "1px solid #EDE8F4", opacity: tmpl.active ? 1 : 0.6 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <Badge text={tmpl.channel.toUpperCase()} color={col} bg={bg} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {tmpl.days_before > 0 ? `${tmpl.days_before} days before` : tmpl.days_before < 0 ? `${Math.abs(tmpl.days_before)} days after due` : "On the day"}
                          </div>
                          <div style={{ fontSize: 12, color: "#8A7F96" }}>{tmpl.subject || tmpl.body_html?.slice(0, 60)}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {/* Toggle active */}
                        <div onClick={() => toggleActive(tmpl)} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{
                            width: 36, height: 20, borderRadius: 10, transition: "background 0.2s",
                            background: tmpl.active ? "#2E7D32" : "#CCC", position: "relative",
                          }}>
                            <div style={{
                              position: "absolute", top: 2, left: tmpl.active ? 18 : 2, width: 16, height: 16,
                              borderRadius: "50%", background: "#fff", transition: "left 0.2s",
                            }} />
                          </div>
                        </div>
                        <button onClick={() => setEditing({ ...tmpl })}
                          style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #EDE8F4", background: "#FDFBF9", color: "#555", cursor: "pointer", fontSize: 12 }}>
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TEMPLATE EDITOR */}
      {tab === "templates" && editing && (
        <div style={{ ...card }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ margin: 0, color: "#3D3248" }}>
              {editing.id?.startsWith("default_") || !editing.id ? "New Template" : "Edit Template"}
            </h3>
            <button onClick={() => setEditing(null)}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #EDE8F4", background: "#FDFBF9", color: "#555", cursor: "pointer" }}>
              Cancel
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>Trigger</label>
              <select value={editing.trigger_type} onChange={e => setEditing({ ...editing, trigger_type: e.target.value })}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 13 }}>
                {Object.entries(TRIGGER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>Channel</label>
              <select value={editing.channel} onChange={e => setEditing({ ...editing, channel: e.target.value })}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 13 }}>
                {Object.keys(CHANNEL_COLORS).map(c => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>Days before (negative = after)</label>
              <input type="number" value={editing.days_before} onChange={e => setEditing({ ...editing, days_before: parseInt(e.target.value) })}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 13, boxSizing: "border-box" }} />
            </div>
          </div>

          {(editing.channel === "email") && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>Subject</label>
              <input value={editing.subject || ""} onChange={e => setEditing({ ...editing, subject: e.target.value })}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 13, boxSizing: "border-box" }} />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={{ fontSize: 12, color: "#555" }}>Message Body</label>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {VARIABLES.map(v => (
                  <button key={v} onClick={() => setEditing({ ...editing, body_html: (editing.body_html || "") + v })}
                    style={{ padding: "2px 8px", borderRadius: 5, border: "1px solid #EDE8F4", background: lightPurple, color: purple, cursor: "pointer", fontSize: 11, fontFamily: "monospace" }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <textarea value={editing.body_html || ""} onChange={e => setEditing({ ...editing, body_html: e.target.value })}
              rows={8}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 13, boxSizing: "border-box", resize: "vertical", fontFamily: "monospace" }} />
          </div>

          {/* Preview */}
          {editing.body_html && (
            <div style={{ marginBottom: 20, padding: "14px 16px", borderRadius: 10, background: "#F8F5F1", border: "1px solid #EDE8F4" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#8A7F96", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Preview (sample data)</div>
              <div style={{ fontSize: 13, color: "#3D3248", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                {editing.body_html
                  .replace(/{{child_name}}/g, "Oliver Thompson")
                  .replace(/{{parent_name}}/g, "Kate Thompson")
                  .replace(/{{due_date}}/g, "15 March 2026")
                  .replace(/{{centre_name}}/g, "Sunshine Learning Centre")
                  .replace(/{{amount}}/g, "$245.00")
                  .replace(/{{invoice_number}}/g, "INV-2026-0042")}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => saveTemplate(editing)} disabled={saving}
              style={{ background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "10px 28px", cursor: "pointer", fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving..." : "Save Template"}
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" id="tmpl_active" checked={editing.active !== false} onChange={e => setEditing({ ...editing, active: e.target.checked })} />
              <label htmlFor="tmpl_active" style={{ fontSize: 13, color: "#555" }}>Active</label>
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATION HISTORY */}
      {tab === "history" && (
        <div>
          {notifications.length === 0 ? (
            <div style={{ ...card, textAlign: "center", color: "#8A7F96", padding: 48 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>No notifications sent yet</div>
            </div>
          ) : (
            <div style={{ ...card }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: lightPurple }}>
                    {["Date", "Recipient", "Trigger", "Channel", "Status"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: purple, fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {notifications.map(n => {
                    const [col, bg] = CHANNEL_COLORS[n.channel] || [purple, lightPurple];
                    return (
                      <tr key={n.id} style={{ borderBottom: "1px solid #F0EBF8", background: n.read_at ? "#FDFBF9" : "#fff" }}>
                        <td style={{ padding: "10px 12px", color: "#8A7F96" }}>
                          {n.created_at ? new Date(n.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>{n.recipient_email || n.recipient_name || "—"}</td>
                        <td style={{ padding: "10px 12px" }}>{TRIGGER_LABELS[n.trigger_type] || n.trigger_type || n.type || "—"}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <Badge text={(n.channel || "in_app").replace("_", " ")} color={col} bg={bg} />
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <Badge
                            text={n.read_at ? "Read" : n.sent_at ? "Delivered" : "Pending"}
                            color={n.read_at ? "#2E7D32" : n.sent_at ? "#1565C0" : "#E65100"}
                            bg={n.read_at ? "#E8F5E9" : n.sent_at ? "#E3F2FD" : "#FFF3E0"}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
