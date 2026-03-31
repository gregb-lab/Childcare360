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
    setSaving(true);
    const r = await API(`/api/staff-features/pd-requests${previewQs()}`, {
      method: "POST", body: JSON.stringify({ ...form, cost_est: parseFloat(form.cost_est) || 0 })
    });
    if (r.ok) { toast("PD request submitted ✓"); setShowForm(false); load(); setForm({ title:"",description:"",provider:"",url:"",start_date:"",end_date:"",location:"",delivery_mode:"in_person",cost_est:"",expected_outcomes:"" }); }
    else toast(r.error, "error");
    setSaving(false);
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
