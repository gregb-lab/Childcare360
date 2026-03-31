import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}), ...opts.headers },
    method: opts.method || "GET", ...(opts.body ? { body: opts.body } : {}),
  }).then(r => r.json());
};

const QUAL_LABELS = {
  ect: "Early Childhood Teacher",
  diploma: "Diploma",
  working_towards_diploma: "Working Towards Diploma",
  cert3: "Certificate III",
  working_towards: "Working Towards Cert III",
  unqualified: "Unqualified",
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LEAVE_TYPES = ["annual", "personal", "long_service", "study", "unpaid", "other"];
const DOC_CATEGORIES = ["qualification", "certification", "identity", "contract", "tax", "super", "performance", "other"];

const purple = "#8B6DAF";
const lightPurple = "#F0EBF8";
const card = { background: "#fff", borderRadius: 12, padding: "20px 24px", border: "1px solid #EDE8F4" };

function Badge({ text, color = purple, bg = lightPurple }) {
  return <span style={{ background: bg, color, borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{text}</span>;
}

function QualBadge({ qual }) {
  const colors = { ect: ["#2E7D32", "#E8F5E9"], diploma: ["#1565C0", "#E3F2FD"], working_towards_diploma: ["#6A1B9A", "#F3E5F5"], cert3: [purple, lightPurple], working_towards: ["#E65100", "#FFF3E0"], unqualified: ["#757575", "#F5F5F5"] };
  const [c, bg] = colors[qual] || [purple, lightPurple];
  return <Badge text={QUAL_LABELS[qual] || qual} color={c} bg={bg} />;
}

function RPBadge({ educator }) {
  const ok = educator.first_aid && educator.cpr_expiry && isDateValid(educator.cpr_expiry) && educator.anaphylaxis_expiry && isDateValid(educator.anaphylaxis_expiry);
  return ok
    ? <Badge text="✓ Responsible Person Eligible" color="#2E7D32" bg="#E8F5E9" />
    : <Badge text="Not RP Eligible" color="#B71C1C" bg="#FFEBEE" />;
}

function isDateValid(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) > new Date();
}

function isExpiringSoon(dateStr, days = 30) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const diff = (d - new Date()) / (1000 * 60 * 60 * 24);
  return diff > 0 && diff < days;
}

function isExpired(dateStr) {
  if (!dateStr) return true;
  return new Date(dateStr) < new Date();
}

function CertRow({ label, value, expiry }) {
  const valid = isDateValid(expiry);
  const soon = isExpiringSoon(expiry, 30);
  const color = !expiry ? "#9E9E9E" : isExpired(expiry) ? "#B71C1C" : soon ? "#E65100" : "#2E7D32";
  const icon = !expiry ? "—" : isExpired(expiry) ? "✗" : soon ? "⚠" : "✓";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F0EBF8" }}>
      <span style={{ fontSize: 13, color: "#555" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {value && <span style={{ fontSize: 12, color: "#777" }}>{value}</span>}
        <span style={{ color, fontWeight: 700, fontSize: 13 }}>{icon} {expiry || "Not entered"}</span>
      </div>
    </div>
  );
}

function TabBtn({ label, active, onClick, alert }) {
  return (
    <button onClick={onClick} style={{ padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
      background: active ? purple : "transparent", color: active ? "#fff" : "#8A7F96", position: "relative" }}>
      {label}
      {alert && <span style={{ position: "absolute", top: 2, right: 2, width: 7, height: 7, borderRadius: "50%", background: "#E53935" }} />}
    </button>
  );
}

export default function EducatorsModule() {
  const [educators, setEducators] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("profile");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("active");
  const [ytd, setYtd] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});

  const authHeaders = {};

  const loadEducators = useCallback(async () => {
    try {
      const data = await API("/api/educators", { headers: authHeaders });
      if (Array.isArray(data)) setEducators(data);
    } catch (e) {}
  }, []);

  const loadDetail = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, y] = await Promise.all([
        API(`/api/educators/${id}`, { headers: authHeaders }),
        API(`/api/educators/${id}/ytd-earnings`, { headers: authHeaders }),
      ]);
      setDetail(d);
      setYtd(y);
      setEditData(d);
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => { loadEducators(); }, [loadEducators]);
  useEffect(() => { if (selected) loadDetail(selected); }, [selected, loadDetail]);

  const filtered = educators.filter((e) => {
    const name = `${e.first_name} ${e.last_name}`.toLowerCase();
    if (search && !name.includes(search.toLowerCase())) return false;
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    return true;
  });

  const saveEdit = async () => {
    await API(`/api/educators/${selected}`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify(editData),
    });
    setEditMode(false);
    loadDetail(selected);
    loadEducators();
  };

  const reliabilityColor = (score) => score >= 90 ? "#2E7D32" : score >= 75 ? "#E65100" : "#B71C1C";

  if (!selected) {
    return (
      <div style={{ padding: "0 24px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, color: "#3D3248" }}>Educators</h2>
            <p style={{ margin: "4px 0 0", color: "#8A7F96", fontSize: 13 }}>{educators.filter(e => e.status === "active").length} active staff members</p>
          </div>
          <button onClick={() => setShowAddModal(true)} style={{ background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 700 }}>
            + Add Educator
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search educators..." style={{ flex: 1, padding: "8px 14px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 13 }} />
          {["active", "inactive", "all"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: filterStatus === s ? purple : "#EDE8F4", color: filterStatus === s ? "#fff" : purple }}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Educator Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {filtered.map(edu => {
            const hasCertAlert = !edu.first_aid || isExpiringSoon(edu.first_aid_expiry, 30) || isExpiringSoon(edu.cpr_expiry, 30) || isExpiringSoon(edu.wwcc_expiry, 60);
            return (
              <div key={edu.id} onClick={() => { setSelected(edu.id); setTab("profile"); }}
                style={{ ...card, cursor: "pointer", display: "flex", gap: 14, alignItems: "flex-start", transition: "box-shadow 0.15s",
                  borderLeft: `4px solid ${edu.status === "active" ? purple : "#CCC"}` }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"}
                onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                {/* Avatar */}
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: lightPurple, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                  {edu.photo_url ? <img src={edu.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
                    <span style={{ fontSize: 20, fontWeight: 700, color: purple }}>{edu.first_name[0]}{edu.last_name[0]}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#3D3248" }}>{edu.first_name} {edu.last_name}</div>
                      <div style={{ fontSize: 11, color: "#8A7F96", marginTop: 2 }}>{edu.employment_type} · {edu.email || "No email"}</div>
                    </div>
                    {hasCertAlert && <span style={{ fontSize: 16 }}>⚠️</span>}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <QualBadge qual={edu.qualification} />
                    <span style={{ background: "#F5F5F5", color: reliabilityColor(edu.reliability_score), borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
                      {edu.reliability_score}% reliable
                    </span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: "#8A7F96" }}>
                    {edu.shifts_last_30 || 0} shifts last 30 days · {edu.distance_km ? `${edu.distance_km}km away` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add educator modal */}
        {showAddModal && <AddEducatorModal onClose={() => setShowAddModal(false)} onSaved={() => { setShowAddModal(false); loadEducators(); }} />}
      </div>
    );
  }

  const edu = detail;
  if (!edu) return <div style={{ padding: 40, textAlign: "center" }}><div className="spinner" />Loading...</div>;

  const tabs = [
    { id: "profile", label: "Profile" },
    { id: "employment", label: "Employment" },
    { id: "availability", label: "Availability" },
    { id: "certifications", label: "Certifications", alert: !edu.first_aid || isExpired(edu.first_aid_expiry) || isExpired(edu.cpr_expiry) },
    { id: "documents", label: "Documents" },
    { id: "leave", label: "Leave" },
    { id: "pay", label: "Pay & Super" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #EDE8F4", display: "flex", alignItems: "center", gap: 16, background: "#fff", flexShrink: 0 }}>
        <button onClick={() => { setSelected(null); setDetail(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: purple, fontWeight: 700, fontSize: 14 }}>
          ← Back
        </button>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: lightPurple, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
          {edu.photo_url ? <img src={edu.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
            <span style={{ fontSize: 18, fontWeight: 700, color: purple }}>{edu.first_name?.[0]}{edu.last_name?.[0]}</span>}
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: "#3D3248" }}>{edu.first_name} {edu.last_name}</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
            <QualBadge qual={edu.qualification} />
            <RPBadge educator={edu} />
            <Badge text={edu.employment_type || "—"} />
          </div>
        </div>
        {!editMode ? (
          <button onClick={() => setEditMode(true)} style={{ background: lightPurple, color: purple, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700 }}>Edit</button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveEdit} style={{ background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700 }}>Save</button>
            <button onClick={() => { setEditMode(false); setEditData(edu); }} style={{ background: "#F5F5F5", color: "#555", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>Cancel</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ padding: "8px 24px", borderBottom: "1px solid #EDE8F4", display: "flex", gap: 4, background: "#FDFBF9", flexShrink: 0, overflowX: "auto" }}>
        {tabs.map(t => <TabBtn key={t.id} label={t.label} active={tab === t.id} onClick={() => setTab(t.id)} alert={t.alert} />)}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>

        {/* ── PROFILE TAB ── */}
        {tab === "profile" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={card}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>Personal Details</h3>
              <FieldRow label="First Name" field="first_name" data={editData} setData={setEditData} editMode={editMode} />
              <FieldRow label="Last Name" field="last_name" data={editData} setData={setEditData} editMode={editMode} />
              <FieldRow label="Email" field="email" data={editData} setData={setEditData} editMode={editMode} type="email" />
              <FieldRow label="Phone" field="phone" data={editData} setData={setEditData} editMode={editMode} />
              <FieldRow label="Address" field="address" data={editData} setData={setEditData} editMode={editMode} />
              <FieldRow label="Suburb" field="suburb" data={editData} setData={setEditData} editMode={editMode} />
              <FieldRow label="Postcode" field="postcode" data={editData} setData={setEditData} editMode={editMode} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={card}>
                <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>Employment Info</h3>
                <FieldRow label="Start Date" field="start_date" data={editData} setData={setEditData} editMode={editMode} type="date" />
                <FieldRow label="Employment Type" field="employment_type" data={editData} setData={setEditData} editMode={editMode} type="select" options={["permanent","casual","part_time"]} />
                <div style={{ padding: "8px 0", borderBottom: "1px solid #F0EBF8", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: "#555" }}>Distance to Centre</span>
                  <span style={{ fontWeight: 600, color: "#3D3248" }}>{edu.distance_km ? `${edu.distance_km} km` : "—"}</span>
                </div>
                <div style={{ padding: "8px 0", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: "#555" }}>Reliability Score</span>
                  <span style={{ fontWeight: 700, color: reliabilityColor(edu.reliability_score) }}>{edu.reliability_score}%</span>
                </div>
              </div>
              <div style={card}>
                <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>Performance Stats</h3>
                {[
                  ["Shifts Offered", edu.total_shifts_offered],
                  ["Shifts Accepted", edu.total_shifts_accepted],
                  ["Sick Days (YTD)", edu.total_sick_days],
                  ["Late Arrivals (YTD)", edu.total_late_arrivals],
                  ["No Shows", edu.total_no_shows],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F0EBF8", fontSize: 13 }}>
                    <span style={{ color: "#555" }}>{l}</span>
                    <span style={{ fontWeight: 700, color: l === "No Shows" && v > 0 ? "#B71C1C" : "#3D3248" }}>{v || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── EMPLOYMENT TAB ── */}
        {tab === "employment" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={card}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>Pay Details</h3>
              <FieldRow label="Qualification" field="qualification" data={editData} setData={setEditData} editMode={editMode} type="select" options={Object.keys(QUAL_LABELS)} optionLabels={QUAL_LABELS} />
              <FieldRow label="Employment Type" field="employment_type" data={editData} setData={setEditData} editMode={editMode} type="select" options={["permanent","casual","part_time"]} />
              <FieldRow label="Hourly Rate ($/hr)" field="hourly_rate_cents" data={editData} setData={setEditData} editMode={editMode} type="number" transform={v => v} display={v => `$${(v/100).toFixed(2)}`} />
              <FieldRow label="Contracted Hrs/Wk" field="contracted_hours" data={editData} setData={setEditData} editMode={editMode} type="number" />
              <FieldRow label="Super Rate (%)" field="super_rate" data={editData} setData={setEditData} editMode={editMode} type="number" />
              {edu.employment_type === "permanent" && (
                <>
                  <div style={{ padding: "8px 0", borderBottom: "1px solid #F0EBF8", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "#555" }}>Implied Annual Salary</span>
                    <span style={{ fontWeight: 700, color: "#3D3248" }}>${Math.round((edu.hourly_rate_cents || 0) * (edu.contracted_hours || 38) * 52 / 100).toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>
            <div style={card}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>Superannuation</h3>
              <FieldRow label="Super Fund" field="super_fund_name" data={editData} setData={setEditData} editMode={editMode} />
              <FieldRow label="Fund USI" field="super_fund_usi" data={editData} setData={setEditData} editMode={editMode} />
              <FieldRow label="Member Number" field="super_member_number" data={editData} setData={setEditData} editMode={editMode} />
              <FieldRow label="Super Rate (%)" field="super_rate" data={editData} setData={setEditData} editMode={editMode} type="number" />
            </div>
            <div style={card}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>Bank Details</h3>
              <FieldRow label="Account Name" field="bank_account_name" data={editData} setData={setEditData} editMode={editMode} />
              <FieldRow label="BSB" field="bank_bsb" data={editData} setData={setEditData} editMode={editMode} />
              <FieldRow label="Account Number" field="bank_account" data={editData} setData={setEditData} editMode={editMode} masked />
            </div>
            <div style={card}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>YTD Summary</h3>
              {ytd && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F0EBF8", fontSize: 13 }}>
                    <span style={{ color: "#555" }}>YTD Earnings (Jul onwards)</span>
                    <span style={{ fontWeight: 700, color: "#3D3248" }}>${((ytd.ytdTotal || 0) / 100).toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F0EBF8", fontSize: 13 }}>
                    <span style={{ color: "#555" }}>YTD Super ({ytd.superRate}%)</span>
                    <span style={{ fontWeight: 700, color: "#3D3248" }}>${((ytd.ytdSuper || 0) / 100).toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── AVAILABILITY TAB ── */}
        {tab === "availability" && <AvailabilityTab educator={edu} onSaved={() => loadDetail(selected)} />}

        {/* ── CERTIFICATIONS TAB ── */}
        {tab === "certifications" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={card}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>Certifications</h3>
              <CertRow label="First Aid" value={edu.first_aid ? "✓ Held" : "Not held"} expiry={edu.first_aid_expiry} />
              <CertRow label="CPR (12mo)" expiry={edu.cpr_expiry} />
              <CertRow label="Anaphylaxis" expiry={edu.anaphylaxis_expiry} />
              <CertRow label="Asthma" expiry={edu.asthma_expiry} />
              {editMode && (
                <div style={{ marginTop: 16 }}>
                  {[["first_aid_expiry","First Aid Expiry"],["cpr_expiry","CPR Expiry"],["anaphylaxis_expiry","Anaphylaxis Expiry"],["asthma_expiry","Asthma Expiry"]].map(([f, l]) => (
                    <div key={f} style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>{l}</label>
                      <input type="date" value={editData[f] || ""} onChange={e => setEditData({ ...editData, [f]: e.target.value })}
                        style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #DDD6EE", fontSize: 13, width: "100%" }} />
                    </div>
                  ))}
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!editData.first_aid} onChange={e => setEditData({ ...editData, first_aid: e.target.checked ? 1 : 0 })} />
                    First Aid certificate held
                  </label>
                </div>
              )}
            </div>
            <div style={card}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>WWCC & Qualification</h3>
              <CertRow label="WWCC" value={edu.wwcc_number} expiry={edu.wwcc_expiry} />
              <div style={{ padding: "8px 0", borderBottom: "1px solid #F0EBF8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#555" }}>Qualification</span>
                {editMode ? (
                  <select value={editData.qualification || ""} onChange={e => setEditData({ ...editData, qualification: e.target.value })}
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #DDD6EE", fontSize: 12 }}>
                    {Object.entries(QUAL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : <QualBadge qual={edu.qualification} />}
              </div>
              {editMode && (
                <div style={{ marginTop: 16 }}>
                  {[["wwcc_number","WWCC Number"],["wwcc_expiry","WWCC Expiry"]].map(([f, l]) => (
                    <div key={f} style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>{l}</label>
                      <input type={f.includes("expiry") ? "date" : "text"} value={editData[f] || ""} onChange={e => setEditData({ ...editData, [f]: e.target.value })}
                        style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #DDD6EE", fontSize: 13, width: "100%" }} />
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 20, padding: 14, background: lightPurple, borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: purple, marginBottom: 8 }}>Responsible Person Eligibility</div>
                <RPBadge educator={edu} />
                <div style={{ marginTop: 8, fontSize: 11, color: "#8A7F96" }}>Requires: First Aid ✓ + CPR (≤12mo) ✓ + Anaphylaxis ✓ — all current</div>
              </div>
            </div>
          </div>
        )}

        {/* ── DOCUMENTS TAB ── */}
        {tab === "documents" && <DocumentsTab educator={edu} onSaved={() => loadDetail(selected)} />}

        {/* ── LEAVE TAB ── */}
        {tab === "leave" && <LeaveTab educator={edu} onSaved={() => loadDetail(selected)} />}

        {/* ── PAY & SUPER TAB ── */}
        {tab === "pay" && ytd && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={card}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>Monthly Earnings (Current FY)</h3>
              {ytd.monthlyBreakdown?.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={ytd.monthlyBreakdown.map(m => ({ month: m.month, earnings: (m.total_cents || 0) / 100, shifts: m.shifts }))}>
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                    <Tooltip formatter={(v, n) => n === "earnings" ? `$${v.toFixed(2)}` : v} />
                    <Bar dataKey="earnings" fill={purple} radius={[4, 4, 0, 0]} name="Earnings ($)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div style={{ textAlign: "center", color: "#8A7F96", padding: 40 }}>No roster data for current financial year</div>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {[
                { label: "YTD Gross Earnings", value: `$${((ytd.ytdTotal || 0) / 100).toFixed(2)}` },
                { label: `Super (${ytd.superRate}%)`, value: `$${((ytd.ytdSuper || 0) / 100).toFixed(2)}` },
                { label: "Total Shifts", value: ytd.monthlyBreakdown?.reduce((s, r) => s + (r.shifts || 0), 0) || 0 },
              ].map(({ label, value }) => (
                <div key={label} style={{ ...card, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#8A7F96", marginBottom: 8 }}>{label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: purple }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldRow({ label, field, data, setData, editMode, type = "text", options, optionLabels, masked, display, transform }) {
  const raw = data?.[field];
  const displayVal = masked && raw ? `••••${String(raw).slice(-4)}` : display ? display(raw ?? 0) : (raw ?? "—");
  const editVal = raw ?? "";
  if (!editMode) return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F0EBF8", fontSize: 13 }}>
      <span style={{ color: "#555" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "#3D3248", maxWidth: "60%", textAlign: "right", wordBreak: "break-word" }}>{displayVal}</span>
    </div>
  );
  // For hourly rate shown as $/hr: user types dollars, we store cents
  const isRate = display && String(label).includes("$/hr");
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>{label}</label>
      {type === "select" ? (
        <select value={editVal || ""} onChange={e => setData({ ...data, [field]: e.target.value })}
          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #DDD6EE", fontSize: 13, width: "100%" }}>
          {options.map(o => <option key={o} value={o}>{optionLabels?.[o] || o}</option>)}
        </select>
      ) : isRate ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 13, color: "#555" }}>$</span>
          <input type="number" step="0.01" value={((raw||0)/100).toFixed(2)}
            onChange={e => setData({ ...data, [field]: Math.round(parseFloat(e.target.value||0)*100) })}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #DDD6EE", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
          <span style={{ fontSize: 11, color: "#A89DB5", whiteSpace: "nowrap" }}>/hr</span>
        </div>
      ) : (
        <input type={type} value={editVal || ""} onChange={e => setData({ ...data, [field]: e.target.value })}
          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #DDD6EE", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
      )}
    </div>
  );
}

function AvailabilityTab({ educator, onSaved }) {
  const authHeaders = {};
  const [avail, setAvail] = useState([]);

  useEffect(() => {
    if (!educator?.availability) return;
    const defaults = Array.from({ length: 7 }, (_, i) => ({ day_of_week: i, available: i > 0 && i < 6 ? 1 : 0, start_time: "07:00", end_time: "18:00", preferred: 0 }));
    const merged = defaults.map(d => educator.availability.find(a => a.day_of_week === d.day_of_week) || d);
    setAvail(merged);
  }, [educator]);

  const save = async () => {
    await API(`/api/educators/${educator.id}/availability`, { method: "PUT", headers: authHeaders, body: JSON.stringify({ availability: avail }) });
    onSaved();
  };

  return (
    <div style={card}>
      <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>Weekly Availability</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: lightPurple }}>
              <th style={{ padding: "10px 14px", textAlign: "left", color: purple, fontWeight: 700 }}>Day</th>
              <th style={{ padding: "10px 14px", textAlign: "center" }}>Available</th>
              <th style={{ padding: "10px 14px", textAlign: "center" }}>Start</th>
              <th style={{ padding: "10px 14px", textAlign: "center" }}>End</th>
            </tr>
          </thead>
          <tbody>
            {avail.map((a, i) => (
              <tr key={a.day_of_week} style={{ borderBottom: "1px solid #F0EBF8" }}>
                <td style={{ padding: "10px 14px", fontWeight: 600, color: "#3D3248" }}>{DAYS[a.day_of_week]}</td>
                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                  <input type="checkbox" checked={!!a.available} onChange={e => {
                    const newA = [...avail]; newA[i] = { ...a, available: e.target.checked ? 1 : 0 }; setAvail(newA);
                  }} />
                </td>
                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                  <input type="time" value={a.start_time || "07:00"} disabled={!a.available} onChange={e => {
                    const newA = [...avail]; newA[i] = { ...a, start_time: e.target.value }; setAvail(newA);
                  }} style={{ border: "1px solid #DDD6EE", borderRadius: 6, padding: "4px 8px", fontSize: 12 }} />
                </td>
                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                  <input type="time" value={a.end_time || "18:00"} disabled={!a.available} onChange={e => {
                    const newA = [...avail]; newA[i] = { ...a, end_time: e.target.value }; setAvail(newA);
                  }} style={{ border: "1px solid #DDD6EE", borderRadius: 6, padding: "4px 8px", fontSize: 12 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={save} style={{ marginTop: 16, background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 700 }}>
        Save Availability
      </button>
    </div>
  );
}

function DocumentsTab({ educator, onSaved }) {
  const authHeaders = {};
  const [showAdd, setShowAdd] = useState(false);
  const [newDoc, setNewDoc] = useState({ category: "qualification", label: "", file_name: "", expiry_date: "" });

  const docs = educator.documents || [];

  const addDoc = async () => {
    await API(`/api/educators/${educator.id}/documents`, { method: "POST", headers: authHeaders, body: JSON.stringify(newDoc) });
    setShowAdd(false);
    setNewDoc({ category: "qualification", label: "", file_name: "", expiry_date: "" });
    onSaved();
  };

  const delDoc = async (id) => {
    if (!confirm("Delete this document?")) return;
    await API(`/api/educators/${educator.id}/documents/${id}`, { method: "DELETE", headers: authHeaders });
    onSaved();
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: "#3D3248" }}>Documents ({docs.length})</h3>
        <button onClick={() => setShowAdd(!showAdd)} style={{ background: lightPurple, color: purple, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700 }}>
          + Add Document
        </button>
      </div>

      {showAdd && (
        <div style={{ background: "#F9F7FE", borderRadius: 10, padding: 16, marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Category</label>
            <select value={newDoc.category} onChange={e => setNewDoc({ ...newDoc, category: e.target.value })}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #DDD6EE", fontSize: 13, width: "100%" }}>
              {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Label</label>
            <input value={newDoc.label} onChange={e => setNewDoc({ ...newDoc, label: e.target.value })}
              placeholder="e.g. Diploma Certificate 2023" style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #DDD6EE", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>File Name</label>
            <input value={newDoc.file_name} onChange={e => setNewDoc({ ...newDoc, file_name: e.target.value })}
              placeholder="diploma_cert.pdf" style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #DDD6EE", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Expiry Date</label>
            <input type="date" value={newDoc.expiry_date} onChange={e => setNewDoc({ ...newDoc, expiry_date: e.target.value })}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #DDD6EE", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
            <button onClick={addDoc} style={{ background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontWeight: 700 }}>Save</button>
            <button onClick={() => setShowAdd(false)} style={{ background: "#EEE", color: "#555", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {docs.length === 0 ? (
        <div style={{ textAlign: "center", color: "#8A7F96", padding: 40 }}>No documents uploaded</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: lightPurple }}>
              <th style={{ padding: "8px 12px", textAlign: "left", color: purple, fontWeight: 700 }}>Label</th>
              <th style={{ padding: "8px 12px", textAlign: "left" }}>Category</th>
              <th style={{ padding: "8px 12px", textAlign: "left" }}>File</th>
              <th style={{ padding: "8px 12px", textAlign: "center" }}>Expiry</th>
              <th style={{ padding: "8px 12px" }} />
            </tr>
          </thead>
          <tbody>
            {docs.map(doc => (
              <tr key={doc.id} style={{ borderBottom: "1px solid #F0EBF8" }}>
                <td style={{ padding: "10px 12px", fontWeight: 600, color: "#3D3248" }}>{doc.label}</td>
                <td style={{ padding: "10px 12px", color: "#8A7F96" }}>{doc.category}</td>
                <td style={{ padding: "10px 12px", color: "#8A7F96" }}>{doc.file_name}</td>
                <td style={{ padding: "10px 12px", textAlign: "center" }}>
                  {doc.expiry_date ? (
                    <span style={{ color: isExpired(doc.expiry_date) ? "#B71C1C" : isExpiringSoon(doc.expiry_date, 30) ? "#E65100" : "#2E7D32", fontWeight: 700 }}>
                      {isExpired(doc.expiry_date) ? "⚠ " : ""}{doc.expiry_date}
                    </span>
                  ) : "—"}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "center" }}>
                  <button onClick={() => delDoc(doc.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#E53935", fontSize: 16 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LeaveTab({ educator, onSaved }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ leave_type: "annual", start_date: "", end_date: "", days_requested: 1, reason: "" });

  const leaves = educator.leaveRequests || [];

  const submit = async () => {
    await API(`/api/educators/${educator.id}/leave`, { method: "POST", headers: authHeaders, body: JSON.stringify(form) });
    setShowAdd(false);
    onSaved();
  };

  const statusColor = { pending: ["#E65100", "#FFF3E0"], approved: ["#2E7D32", "#E8F5E9"], denied: ["#B71C1C", "#FFEBEE"] };

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: "#3D3248" }}>Leave Requests</h3>
        <button onClick={() => setShowAdd(!showAdd)} style={{ background: lightPurple, color: purple, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700 }}>
          + New Request
        </button>
      </div>

      {showAdd && (
        <div style={{ background: "#F9F7FE", borderRadius: 10, padding: 16, marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Leave Type</label>
            <select value={form.leave_type} onChange={e => setForm({ ...form, leave_type: e.target.value })}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #DDD6EE", fontSize: 13, width: "100%" }}>
              {LEAVE_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Days</label>
            <input type="number" min="0.5" step="0.5" value={form.days_requested} onChange={e => setForm({ ...form, days_requested: e.target.value })}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #DDD6EE", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Start Date</label>
            <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #DDD6EE", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>End Date</label>
            <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #DDD6EE", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Reason</label>
            <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #DDD6EE", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
            <button onClick={submit} style={{ background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontWeight: 700 }}>Submit</button>
            <button onClick={() => setShowAdd(false)} style={{ background: "#EEE", color: "#555", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {leaves.length === 0 ? (
        <div style={{ textAlign: "center", color: "#8A7F96", padding: 40 }}>No leave requests</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: lightPurple }}>
              <th style={{ padding: "8px 12px", textAlign: "left", color: purple }}>Type</th>
              <th style={{ padding: "8px 12px", textAlign: "left" }}>Dates</th>
              <th style={{ padding: "8px 12px", textAlign: "center" }}>Days</th>
              <th style={{ padding: "8px 12px", textAlign: "left" }}>Reason</th>
              <th style={{ padding: "8px 12px", textAlign: "center" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {leaves.map(l => {
              const [col, bg] = statusColor[l.status] || ["#777", "#EEE"];
              return (
                <tr key={l.id} style={{ borderBottom: "1px solid #F0EBF8" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600, textTransform: "capitalize" }}>{l.leave_type?.replace("_", " ")}</td>
                  <td style={{ padding: "10px 12px", color: "#8A7F96" }}>{l.start_date} → {l.end_date}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700 }}>{l.days_requested}</td>
                  <td style={{ padding: "10px 12px", color: "#8A7F96" }}>{l.reason || "—"}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <Badge text={l.status} color={col} bg={bg} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AddEducatorModal({ onClose, onSaved }) {
  const authHeaders = {};
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", qualification: "cert3", employment_type: "casual", hourly_rate_cents: 3200 });

  const submit = async () => {
    if (!form.first_name || !form.last_name) return alert("Name required");
    await API("/api/educators", { method: "POST", headers: authHeaders, body: JSON.stringify(form) });
    onSaved();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: 480, maxWidth: "90vw" }}>
        <h3 style={{ margin: "0 0 20px", color: "#3D3248" }}>Add New Educator</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[["first_name","First Name"],["last_name","Last Name"],["email","Email","email"],["phone","Phone"]].map(([f, l, t]) => (
            <div key={f}>
              <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>{l}</label>
              <input type={t || "text"} value={form[f] || ""} onChange={e => setForm({ ...form, [f]: e.target.value })}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
            </div>
          ))}
          <div>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Qualification</label>
            <select value={form.qualification} onChange={e => setForm({ ...form, qualification: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 13, width: "100%" }}>
              {Object.entries(QUAL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Employment Type</label>
            <select value={form.employment_type} onChange={e => setForm({ ...form, employment_type: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 13, width: "100%" }}>
              {["permanent","casual","part_time"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Hourly Rate ($/hr)</label>
            <input type="number" step="0.01" min="0" value={(form.hourly_rate_cents / 100).toFixed(2)}
              onChange={e => setForm({ ...form, hourly_rate_cents: Math.round(parseFloat(e.target.value || 0) * 100) })}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "#EEE", color: "#555", border: "none", borderRadius: 8, padding: "10px 24px", cursor: "pointer" }}>Cancel</button>
          <button onClick={submit} style={{ background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", cursor: "pointer", fontWeight: 700 }}>Add Educator</button>
        </div>
      </div>
    </div>
  );
}
