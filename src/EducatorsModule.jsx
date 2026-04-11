import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}), ...opts.headers },
    method: opts.method || "GET", ...(opts.body ? { body: opts.body } : {}),
  }).then(r => r.json());
};

const toast = (msg, type = "success") => { if (window.showToast) window.showToast(msg, type); };

const QUAL_LABELS = { ect: "Early Childhood Teacher", diploma: "Diploma", working_towards_diploma: "Working Towards Diploma", cert3: "Certificate III", working_towards: "Working Towards Cert III", unqualified: "Unqualified" };
const AU_STATES = ["ACT","NSW","NT","QLD","SA","TAS","VIC","WA"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const LEAVE_TYPES = ["annual","personal","long_service","study","unpaid","other"];
const DOC_CATEGORIES = ["qualification","certification","identity","contract","tax","super","performance","other"];
const CERT_FIELDS = [
  { field: "first_aid_expiry", label: "First Aid Expiry" },
  { field: "cpr_expiry", label: "CPR Expiry" },
  { field: "anaphylaxis_expiry", label: "Anaphylaxis Expiry" },
  { field: "asthma_expiry", label: "Asthma Expiry" },
  { field: "wwcc_expiry", label: "WWCC Expiry" },
];

const purple = "#8B6DAF", lp = "#F0EBF8";
const card = { background: "#fff", borderRadius: 12, padding: "20px 24px", border: "1px solid #EDE8F4" };
const inp = { padding: "8px 12px", borderRadius: 8, border: "1px solid #D9D0C7", fontSize: 13, width: "100%", boxSizing: "border-box", background: "#fff", fontFamily: "inherit" };
const lbl = { fontSize: 11, color: "#8A7F96", display: "block", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" };
const btnP = { background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit" };
const btnS = { background: lp, color: purple, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit" };

const isExpired = d => !d || new Date(d) < new Date();
const isDateValid = d => !!d && new Date(d) > new Date();
const isExpiringSoon = (d, days = 30) => { if (!d) return false; const diff = (new Date(d) - new Date()) / 86400000; return diff > 0 && diff < days; };
const fmtDate = d => d ? new Date(d + "T00:00").toLocaleDateString(undefined) : "—";
const timeToMins = t => { if (!t) return 0; const [h, m] = t.split(":").map(Number); return h * 60 + m; };

function Badge({ text, color = purple, bg = lp }) {
  return <span style={{ background: bg, color, borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{text}</span>;
}
function QualBadge({ qual }) {
  const colors = { ect: ["#2E7D32","#E8F5E9"], diploma: ["#1565C0","#E3F2FD"], working_towards_diploma: ["#6A1B9A","#F3E5F5"], cert3: [purple,lp], working_towards: ["#E65100","#FFF3E0"], unqualified: ["#757575","#F5F5F5"] };
  const [c, bg] = colors[qual] || [purple, lp];
  return <Badge text={QUAL_LABELS[qual] || qual} color={c} bg={bg} />;
}
function RPBadge({ educator }) {
  const ok = educator.first_aid && isDateValid(educator.first_aid_expiry) && isDateValid(educator.cpr_expiry) && isDateValid(educator.anaphylaxis_expiry);
  return ok ? <Badge text="✓ RP Eligible" color="#2E7D32" bg="#E8F5E9" /> : <Badge text="Not RP Eligible" color="#B71C1C" bg="#FFEBEE" />;
}
function TabBtn({ label, active, onClick, alert: al }) {
  return (
    <button onClick={onClick} style={{ padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", background: active ? purple : "transparent", color: active ? "#fff" : "#8A7F96", position: "relative" }}>
      {label}{al && <span style={{ position: "absolute", top: 2, right: 2, width: 7, height: 7, borderRadius: "50%", background: "#E53935" }} />}
    </button>
  );
}

// Money input: text-based, stores cents, avoids spinner bugs
function MoneyInput({ value, onChange, disabled }) {
  const [raw, setRaw] = useState(() => ((value || 0) / 100).toFixed(2));
  useEffect(() => { setRaw(((value || 0) / 100).toFixed(2)); }, [value]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 13, color: "#555" }}>$</span>
      <input type="text" inputMode="decimal" value={raw} disabled={disabled}
        onChange={e => setRaw(e.target.value)}
        onBlur={() => { const n = parseFloat(raw) || 0; setRaw(n.toFixed(2)); onChange(Math.round(n * 100)); }}
        style={{ ...inp, width: 90 }} />
      <span style={{ fontSize: 11, color: "#A89DB5", whiteSpace: "nowrap" }}>/hr</span>
    </div>
  );
}

// Generic numeric text input — no spinner, uses numeric keyboard
function NumInput({ value, onChange, style: st }) {
  const [raw, setRaw] = useState(value ?? "");
  useEffect(() => { setRaw(value ?? ""); }, [value]);
  return (
    <input type="text" inputMode="decimal" value={raw}
      onChange={e => setRaw(e.target.value)}
      onBlur={() => { const n = parseFloat(raw); onChange(isNaN(n) ? 0 : n); setRaw(isNaN(n) ? "" : String(n)); }}
      style={{ ...inp, ...st }} />
  );
}

// ─── Custom Date Picker ────────────────────────────────────────────────────────
// Fixes native picker positioning bug + adds month/year back-arrow navigation
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WDAYS  = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function DatePicker({ value, onChange, min, max, disabled, placeholder = "Select date", style: st }) {
  const [open, setOpen]     = useState(false);
  const [view, setView]     = useState("day");   // "day" | "month" | "year"
  const [cursor, setCursor] = useState(() => {
    if (value) return new Date(value + "T00:00");
    const d = new Date(); d.setDate(1); return d;
  });
  const containerRef = useRef();
  const btnRef       = useRef();
  const [pos, setPos]   = useState({ top: 0, left: 0 });

  // Sync cursor when value changes externally
  useEffect(() => {
    if (value) setCursor(new Date(value + "T00:00"));
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const openPicker = () => {
    if (disabled) return;
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const pickerH = 320, pickerW = 260;
      const viewH = window.innerHeight, viewW = window.innerWidth;
      let top = rect.bottom + window.scrollY + 4;
      let left = rect.left + window.scrollX;
      if (rect.bottom + pickerH > viewH) top = rect.top + window.scrollY - pickerH - 4;
      if (left + pickerW > viewW) left = viewW - pickerW - 8;
      setPos({ top, left });
    }
    setView("day");
    setOpen(o => !o);
  };

  const select = (d) => {
    if (min && d < min) return;
    if (max && d > max) return;
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    onChange(iso);
    setOpen(false);
  };

  const prevMonth = () => setCursor(c => { const n = new Date(c); n.setMonth(n.getMonth()-1); return n; });
  const nextMonth = () => setCursor(c => { const n = new Date(c); n.setMonth(n.getMonth()+1); return n; });
  const prevYear  = () => setCursor(c => { const n = new Date(c); n.setFullYear(n.getFullYear()-1); return n; });
  const nextYear  = () => setCursor(c => { const n = new Date(c); n.setFullYear(n.getFullYear()+1); return n; });

  const year = cursor.getFullYear(), month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);
  const selectedDate = value ? new Date(value + "T00:00") : null;
  const minDate = min ? new Date(min + "T00:00") : null;
  const maxDate = max ? new Date(max + "T00:00") : null;

  const displayVal = value ? new Date(value + "T00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "";

  // Year range for year picker
  const yearStart = Math.floor(year / 12) * 12;
  const years = Array.from({length: 12}, (_, i) => yearStart + i);

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block", width: "100%", ...st }}>
      <div ref={btnRef} onClick={openPicker}
        style={{ ...inp, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: disabled ? "not-allowed" : "pointer", background: disabled ? "#F5F5F5" : "#fff", color: displayVal ? "#3D3248" : "#A89DB5", opacity: disabled ? 0.6 : 1, userSelect: "none" }}>
        <span style={{ fontSize: 13 }}>{displayVal || placeholder}</span>
        <span style={{ fontSize: 12, color: "#A89DB5" }}>📅</span>
      </div>
      {value && !disabled && (
        <span onClick={e => { e.stopPropagation(); onChange(""); }} title="Clear"
          style={{ position: "absolute", right: 36, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "#A89DB5", fontSize: 14, lineHeight: 1 }}>✕</span>
      )}

      {open && (
        <div style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, background: "#fff", border: "1px solid #DDD6EE", borderRadius: 12, boxShadow: "0 8px 32px rgba(80,60,90,0.18)", width: 260 }}>

          {/* Day view */}
          {view === "day" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 8px", borderBottom: "1px solid #F0EBF8" }}>
                <button onClick={prevMonth} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: purple, padding: "0 4px" }}>‹</button>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <button onClick={() => setView("month")} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#3D3248", padding: "2px 6px", borderRadius: 6 }}
                    onMouseEnter={e => e.currentTarget.style.background = lp} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    {MONTHS[month]}
                  </button>
                  <button onClick={() => setView("year")} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#3D3248", padding: "2px 6px", borderRadius: 6 }}
                    onMouseEnter={e => e.currentTarget.style.background = lp} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    {year}
                  </button>
                </div>
                <button onClick={nextMonth} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: purple, padding: "0 4px" }}>›</button>
              </div>
              <div style={{ padding: "8px 10px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
                  {WDAYS.map(d => <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "#A89DB5", padding: "2px 0" }}>{d}</div>)}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
                  {Array.from({length: firstDay}).map((_,i) => <div key={`e${i}`} />)}
                  {Array.from({length: daysInMonth}).map((_,i) => {
                    const d = new Date(year, month, i+1);
                    const isSelected = selectedDate && d.getTime() === selectedDate.getTime();
                    const isToday = d.getTime() === today.getTime();
                    const isDisabled = (minDate && d < minDate) || (maxDate && d > maxDate);
                    return (
                      <div key={i} onClick={() => !isDisabled && select(d)}
                        style={{ textAlign: "center", padding: "6px 2px", borderRadius: 6, fontSize: 12, cursor: isDisabled ? "not-allowed" : "pointer", fontWeight: isSelected||isToday ? 700 : 400,
                          background: isSelected ? purple : isToday ? lp : "transparent",
                          color: isSelected ? "#fff" : isDisabled ? "#CCC" : isToday ? purple : "#3D3248" }}
                        onMouseEnter={e => !isDisabled && !isSelected && (e.currentTarget.style.background = lp)}
                        onMouseLeave={e => !isSelected && (e.currentTarget.style.background = isToday ? lp : "transparent")}>
                        {i+1}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ padding: "8px 14px", borderTop: "1px solid #F0EBF8", display: "flex", justifyContent: "center" }}>
                <button onClick={() => { select(today); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: purple, fontWeight: 600 }}>Today</button>
              </div>
            </div>
          )}

          {/* Month view */}
          {view === "month" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 8px", borderBottom: "1px solid #F0EBF8" }}>
                <button onClick={prevYear} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: purple, padding: "0 4px" }}>‹</button>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => setView("day")} title="Back to day view" style={{ background: lp, border: "none", cursor: "pointer", color: purple, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>← Days</button>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#3D3248" }}>{year}</span>
                </div>
                <button onClick={nextYear} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: purple, padding: "0 4px" }}>›</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, padding: 12 }}>
                {MONTHS.map((m, i) => (
                  <button key={m} onClick={() => { setCursor(c => { const n = new Date(c); n.setMonth(i); return n; }); setView("day"); }}
                    style={{ padding: "8px 4px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: i === month ? 700 : 400, background: i === month ? purple : "transparent", color: i === month ? "#fff" : "#3D3248" }}
                    onMouseEnter={e => i !== month && (e.currentTarget.style.background = lp)}
                    onMouseLeave={e => i !== month && (e.currentTarget.style.background = "transparent")}>
                    {m.slice(0,3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Year view */}
          {view === "year" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 8px", borderBottom: "1px solid #F0EBF8" }}>
                <button onClick={() => setCursor(c => { const n = new Date(c); n.setFullYear(n.getFullYear()-12); return n; })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: purple, padding: "0 4px" }}>‹</button>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => setView("day")} title="Back to day view" style={{ background: lp, border: "none", cursor: "pointer", color: purple, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>← Days</button>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#3D3248" }}>{yearStart}–{yearStart+11}</span>
                </div>
                <button onClick={() => setCursor(c => { const n = new Date(c); n.setFullYear(n.getFullYear()+12); return n; })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: purple, padding: "0 4px" }}>›</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: 12 }}>
                {years.map(y => (
                  <button key={y} onClick={() => { setCursor(c => { const n = new Date(c); n.setFullYear(y); return n; }); setView("month"); }}
                    style={{ padding: "8px 4px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: y === year ? 700 : 400, background: y === year ? purple : "transparent", color: y === year ? "#fff" : "#3D3248" }}
                    onMouseEnter={e => y !== year && (e.currentTarget.style.background = lp)}
                    onMouseLeave={e => y !== year && (e.currentTarget.style.background = "transparent")}>
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EducatorAvatar({ educator, size = 52 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: lp, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
      {educator.photo_url
        ? <img src={educator.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: size * 0.36, fontWeight: 700, color: purple }}>{educator.first_name?.[0]}{educator.last_name?.[0]}</span>}
    </div>
  );
}

function PhotoUpload({ educator, onUploaded }) {
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const handle = async file => {
    if (!file || !file.type.startsWith("image/")) { toast("Select an image file", "error"); return; }
    setBusy(true);
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const r = await API(`/api/educators/${educator.id}/photo`, { method: "POST", body: JSON.stringify({ photo_url: ev.target.result }) });
        if (r.ok) { onUploaded(); toast("Photo updated"); } else toast(r.error || "Upload failed", "error");
      } catch(e) { toast("Upload failed", "error"); }
      setBusy(false);
    };
    reader.readAsDataURL(file);
  };
  return (
    <div onClick={() => ref.current?.click()} title="Click to change photo" style={{ position: "relative", cursor: "pointer", width: 52, height: 52, flexShrink: 0 }}>
      <EducatorAvatar educator={educator} size={52} />
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.2s" }}
        onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>
        <span style={{ color: "#fff", fontSize: 18 }}>{busy ? "…" : "📷"}</span>
      </div>
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handle(e.target.files[0])} />
    </div>
  );
}

function SuperFundSelector({ editData, setEditData, editMode }) {
  const [funds, setFunds] = useState([]);
  const [query, setQuery] = useState(editData.super_fund_name || "");
  const [show, setShow] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [nf, setNf] = useState({ fund_name: "", abn: "", usi: "", esa: "", is_smsf: false, bank_bsb: "", bank_account: "", bank_account_name: "" });

  useEffect(() => { API("/api/educators/super-funds").then(d => Array.isArray(d) && setFunds(d)).catch(() => {}); }, []);
  useEffect(() => { setQuery(editData.super_fund_name || ""); }, [editData.super_fund_name]);

  const filtered = funds.filter(f => f.fund_name.toLowerCase().includes(query.toLowerCase()));
  const selectFund = f => { setEditData({ ...editData, super_fund_name: f.fund_name, super_fund_usi: f.usi || editData.super_fund_usi }); setQuery(f.fund_name); setShow(false); };

  const addFund = async () => {
    if (!nf.fund_name.trim()) { toast("Fund name required", "error"); return; }
    try {
      const r = await API("/api/educators/super-funds", { method: "POST", body: JSON.stringify(nf) });
      if (r.error) { toast(r.error, "error"); return; }
      const updated = await API("/api/educators/super-funds");
      if (Array.isArray(updated)) setFunds(updated);
      selectFund({ ...nf, id: r.id });
      setShowNew(false); setNf({ fund_name: "", abn: "", usi: "", esa: "", is_smsf: false, bank_bsb: "", bank_account: "", bank_account_name: "" });
      toast("Super fund saved");
    } catch(e) { toast("Failed", "error"); }
  };

  if (!editMode) return (
    <div>
      {[["Super Fund", editData.super_fund_name], ["USI", editData.super_fund_usi], ["Member No.", editData.super_member_number], ["Rate", editData.super_rate ? `${editData.super_rate}%` : null]].map(([l, v]) => (
        <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F0EBF8", fontSize: 13 }}>
          <span style={{ color: "#555" }}>{l}</span><span style={{ fontWeight: 600, color: "#3D3248" }}>{v || "—"}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 10, position: "relative" }}>
        <label style={lbl}>Super Fund Name</label>
        <input value={query} onChange={e => { setQuery(e.target.value); setEditData({ ...editData, super_fund_name: e.target.value }); setShow(true); }}
          onFocus={() => setShow(true)} onBlur={() => setTimeout(() => setShow(false), 200)}
          placeholder="Start typing fund name…" style={inp} />
        {show && (
          <div style={{ position: "absolute", zIndex: 200, background: "#fff", border: "1px solid #DDD6EE", borderRadius: 8, width: "100%", boxShadow: "0 4px 16px rgba(0,0,0,0.1)", maxHeight: 180, overflowY: "auto" }}>
            {filtered.map(f => (
              <div key={f.id} onMouseDown={() => selectFund(f)}
                style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #F0EBF8" }}
                onMouseEnter={e => e.currentTarget.style.background = lp} onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                <div style={{ fontWeight: 600 }}>{f.fund_name}</div>
                {f.abn && <div style={{ fontSize: 11, color: "#8A7F96" }}>ABN: {f.abn}{f.usi ? ` · USI: ${f.usi}` : ""}</div>}
              </div>
            ))}
            <div onMouseDown={() => { setShowNew(true); setNf(n => ({ ...n, fund_name: query })); setShow(false); }}
              style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, color: purple, fontWeight: 600 }}
              onMouseEnter={e => e.currentTarget.style.background = lp} onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
              + Add "{query}" as new fund
            </div>
          </div>
        )}
      </div>
      {showNew && (
        <div style={{ background: "#F9F7FE", borderRadius: 10, padding: 14, marginBottom: 12, border: "1px solid #DDD6EE" }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: purple, marginBottom: 10 }}>New Super Fund</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[["Fund Name *","fund_name"],["ABN","abn"],["USI","usi"],["ESA (SMSF)","esa"]].map(([l,f]) => (
              <div key={f}><label style={{ ...lbl, fontSize: 10 }}>{l}</label><input value={nf[f]} onChange={e => setNf({ ...nf, [f]: e.target.value })} style={{ ...inp, fontSize: 12, padding: "6px 10px" }} /></div>
            ))}
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={nf.is_smsf} onChange={e => setNf({ ...nf, is_smsf: e.target.checked })} /> Self-Managed Super Fund (SMSF)
              </label>
            </div>
            {nf.is_smsf && [["Account Name","bank_account_name"],["BSB","bank_bsb"],["Account No","bank_account"]].map(([l,f]) => (
              <div key={f}><label style={{ ...lbl, fontSize: 10 }}>{l}</label><input value={nf[f]} onChange={e => setNf({ ...nf, [f]: e.target.value })} style={{ ...inp, fontSize: 12, padding: "6px 10px" }} /></div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={addFund} style={{ ...btnP, padding: "6px 16px", fontSize: 12 }}>Save Fund</button>
            <button onClick={() => setShowNew(false)} style={{ ...btnS, padding: "6px 14px", fontSize: 12 }}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ marginBottom: 10 }}><label style={lbl}>USI</label><input value={editData.super_fund_usi || ""} onChange={e => setEditData({ ...editData, super_fund_usi: e.target.value })} placeholder="e.g. STA0100AU" style={inp} /></div>
      <div style={{ marginBottom: 10 }}><label style={lbl}>Member Number</label><input value={editData.super_member_number || ""} onChange={e => setEditData({ ...editData, super_member_number: e.target.value })} style={inp} /></div>
      <div style={{ marginBottom: 10 }}><label style={lbl}>Super Rate (%)</label><NumInput value={editData.super_rate} onChange={v => setEditData({ ...editData, super_rate: v })} style={{ width: 80 }} /></div>
    </div>
  );
}

function FR({ label, field, data, set, edit, type = "text", masked }) {
  const raw = data?.[field];
  const display = masked && raw ? `••••${String(raw).slice(-4)}` : type === "date" ? fmtDate(raw) : (raw ?? "—");
  if (!edit) return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F0EBF8", fontSize: 13 }}>
      <span style={{ color: "#555" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "#3D3248", maxWidth: "60%", textAlign: "right", wordBreak: "break-word" }}>{display}</span>
    </div>
  );
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={lbl}>{label}</label>
      {type === "num"
        ? <NumInput value={raw} onChange={v => set({ ...data, [field]: v })} />
        : type === "date"
          ? <DatePicker value={raw || ""} onChange={v => set({ ...data, [field]: v })} />
          : <input type={type} value={raw || ""} onChange={e => set({ ...data, [field]: e.target.value })} style={inp} />}
    </div>
  );
}

function CertRow({ label, value, expiry }) {
  const color = !expiry ? "#9E9E9E" : isExpired(expiry) ? "#B71C1C" : isExpiringSoon(expiry,30) ? "#E65100" : "#2E7D32";
  const icon = !expiry ? "—" : isExpired(expiry) ? "✗" : isExpiringSoon(expiry,30) ? "⚠" : "✓";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "4px 8px", padding: "6px 0", borderBottom: "1px solid #F5F0FB", alignItems: "start" }}>
      <div style={{ fontSize: 11, color: "#8A7F96", fontWeight: 600, paddingTop: 1 }}>{label}</div>
      <div style={{ fontSize: 12, color: "#3D3248", wordBreak: "break-word", overflowWrap: "anywhere", textAlign: "left" }}>
        {value && <span style={{ color: "#555", marginRight: 6 }}>{value}</span>}
        <span style={{ color, fontWeight: 700 }}>{icon} {expiry ? fmtDate(expiry) : "Not entered"}</span>
      </div>
    </div>
  );
}

function CertificationsTab({ edu, editData, setEditData, editMode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
      <div style={card}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>Certifications</h3>
        <CertRow label="First Aid" value={edu.first_aid ? "✓ Held" : "Not held"} expiry={edu.first_aid_expiry} />
        <CertRow label="CPR (12mo)" expiry={edu.cpr_expiry} />
        <CertRow label="Anaphylaxis" expiry={edu.anaphylaxis_expiry} />
        <CertRow label="Asthma" expiry={edu.asthma_expiry} />
        {editMode && (
          <div style={{ marginTop: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 12 }}>
              <input type="checkbox" checked={!!editData.first_aid} onChange={e => setEditData({ ...editData, first_aid: e.target.checked ? 1 : 0 })} />
              First Aid certificate held
            </label>
            {[["first_aid_expiry","First Aid Expiry"],["cpr_expiry","CPR Expiry"],["anaphylaxis_expiry","Anaphylaxis Expiry"],["asthma_expiry","Asthma Expiry"]].map(([f,l]) => (
              <div key={f} style={{ marginBottom: 10 }}>
                <label style={lbl}>{l}</label>
                <DatePicker value={editData[f] || ""} onChange={v => setEditData({ ...editData, [f]: v })} />
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={card}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>WWCC & Qualification</h3>
        <CertRow label="WWCC" value={edu.wwcc_number} expiry={edu.wwcc_expiry} />
        <div style={{ padding: "8px 0", borderBottom: "1px solid #F0EBF8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#555" }}>Qualification</span><QualBadge qual={edu.qualification} />
        </div>
        {editMode && (
          <div style={{ marginTop: 16 }}>
            {[["wwcc_number","WWCC Number","text"],["wwcc_expiry","WWCC Expiry","date"]].map(([f,l,t]) => (
              <div key={f} style={{ marginBottom: 10 }}>
                <label style={lbl}>{l}</label>
                {t === "date"
                  ? <DatePicker value={editData[f] || ""} onChange={v => setEditData({ ...editData, [f]: v })} />
                  : <input type={t} value={editData[f] || ""} onChange={e => setEditData({ ...editData, [f]: e.target.value })} style={inp} />}
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 16, padding: "12px 16px", background: "#F0FFF4", border: "1px solid #A7F3D0", borderRadius: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#065F46" }}>🏛️ National Educator Register</div>
              <div style={{ fontSize: 11, color: "#047857", marginTop: 2 }}>Verify qualifications against the Australian National Educator Register</div>
            </div>
            <button onClick={() => window.open("https://www.acecqa.gov.au/national-educator-register","_blank")}
              style={{ padding: "6px 14px", background: "#065F46", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
              Check Register ↗
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#047857", background: "#ECFDF5", borderRadius: 6, padding: "6px 10px" }}>
            ℹ️ Automated verification will be available once the National Educator Register API launches (expected 2025).
          </div>
        </div>
        <div style={{ marginTop: 16, padding: 14, background: lp, borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: purple, marginBottom: 8 }}>Responsible Person Eligibility</div>
          <RPBadge educator={edu} />
          <div style={{ marginTop: 8, fontSize: 11, color: "#8A7F96" }}>Requires First Aid + CPR (≤12mo) + Anaphylaxis — all current</div>
        </div>
      </div>
    </div>
  );
}

function AvailabilityTab({ educator, onSaved }) {
  const [avail, setAvail] = useState([]);
  const [specials, setSpecials] = useState([]);
  const [showSp, setShowSp] = useState(false);
  const [sp, setSp] = useState({ start_date: "", end_date: "", can_start_early: false, early_start_time: "06:00", can_stay_late: false, late_end_time: "20:00", notes: "", available_days: [1,2,3,4,5] });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!educator?.availability) return;
    const defaults = Array.from({ length: 7 }, (_, i) => ({ day_of_week: i, available: i > 0 && i < 6 ? 1 : 0, start_time: "07:00", end_time: "18:00", can_start_earlier_mins: 0, can_finish_later_mins: 0 }));
    setAvail(defaults.map(d => educator.availability.find(a => a.day_of_week === d.day_of_week) || d));
  }, [educator]);

  useEffect(() => {
    API(`/api/educators/${educator.id}/special-availability`).then(d => Array.isArray(d) && setSpecials(d)).catch(() => {});
  }, [educator.id]);

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
    try { await API(`/api/educators/${educator.id}/availability`, { method: "PUT", body: JSON.stringify({ availability: avail }) }); toast("Availability saved"); onSaved(); }
    catch(e) { toast("Save failed", "error"); }
    setSaving(false);
  };

  const addSpecial = async () => {
    if (!sp.start_date || !sp.end_date) { toast("Dates required", "error"); return; }
    if (new Date(sp.end_date) < new Date(sp.start_date)) { toast("End must be after start", "error"); return; }
    try {
      await API(`/api/educators/${educator.id}/special-availability`, { method: "POST", body: JSON.stringify(sp) });
      const updated = await API(`/api/educators/${educator.id}/special-availability`);
      if (Array.isArray(updated)) setSpecials(updated);
      setShowSp(false); setSp({ start_date: "", end_date: "", can_start_early: false, early_start_time: "06:00", can_stay_late: false, late_end_time: "20:00", notes: "", available_days: [1,2,3,4,5] });
      toast("Special availability saved");
    } catch(e) { toast("Failed", "error"); }
  };

  const delSpecial = async id => {
    try { await API(`/api/educators/${educator.id}/special-availability/${id}`, { method: "DELETE" }); setSpecials(s => s.filter(x => x.id !== id)); toast("Removed"); }
    catch(e) { toast("Failed", "error"); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14, color: "#3D3248" }}>Weekly Availability</h3>
          <button onClick={save} disabled={saving} style={{ ...btnP, padding: "8px 18px", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save Availability"}</button>
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
                    <td style={{ padding: "6px 10px", textAlign: "center" }}><input type="checkbox" checked={!!a.available} onChange={e => updateRow(i, "available", e.target.checked ? 1 : 0)} /></td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      <input type="time" value={a.start_time || "07:00"} disabled={!a.available} onChange={e => updateRow(i, "start_time", e.target.value)} style={{ border: `1px solid ${err ? "#FECACA" : "#DDD6EE"}`, borderRadius: 6, padding: "4px 6px", fontSize: 12, background: a.available ? "#fff" : "#F5F5F5" }} />
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      <input type="time" value={a.end_time || "18:00"} disabled={!a.available} min={a.start_time || undefined} onChange={e => updateRow(i, "end_time", e.target.value)} style={{ border: `1px solid ${err ? "#FECACA" : "#DDD6EE"}`, borderRadius: 6, padding: "4px 6px", fontSize: 12, background: a.available ? "#fff" : "#F5F5F5" }} />
                      {err && <div style={{ color: "#C9828A", fontSize: 10, marginTop: 2 }}>{err}</div>}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <input type="checkbox" disabled={!a.available} checked={a.can_start_earlier_mins > 0} onChange={e => updateRow(i, "can_start_earlier_mins", e.target.checked ? 30 : 0)} />
                        {a.can_start_earlier_mins > 0 && <><input type="text" inputMode="numeric" value={a.can_start_earlier_mins} onChange={e => updateRow(i, "can_start_earlier_mins", parseInt(e.target.value)||0)} style={{ width: 38, border: "1px solid #DDD6EE", borderRadius: 4, padding: "2px 4px", fontSize: 11 }} /><span style={{ fontSize: 10, color: "#8A7F96" }}>min</span></>}
                      </div>
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <input type="checkbox" disabled={!a.available} checked={a.can_finish_later_mins > 0} onChange={e => updateRow(i, "can_finish_later_mins", e.target.checked ? 30 : 0)} />
                        {a.can_finish_later_mins > 0 && <><input type="text" inputMode="numeric" value={a.can_finish_later_mins} onChange={e => updateRow(i, "can_finish_later_mins", parseInt(e.target.value)||0)} style={{ width: 38, border: "1px solid #DDD6EE", borderRadius: 4, padding: "2px 4px", fontSize: 11 }} /><span style={{ fontSize: 10, color: "#8A7F96" }}>min</span></>}
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, color: "#3D3248" }}>Special Availability Periods</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#8A7F96" }}>Date-specific availability used by AI rostering — partner away, school holidays, etc.</p>
          </div>
          <button onClick={() => setShowSp(!showSp)} style={btnS}>+ Add Period</button>
        </div>
        {showSp && (
          <div style={{ background: "#F9F7FE", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #DDD6EE" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={lbl}>Start Date</label><DatePicker value={sp.start_date} onChange={v => setSp({ ...sp, start_date: v })} /></div>
              <div><label style={lbl}>End Date</label><DatePicker value={sp.end_date} min={sp.start_date || undefined} onChange={v => setSp({ ...sp, end_date: v })} /></div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Available Days</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {DAYS.map((d, i) => (
                    <label key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", padding: "4px 10px", borderRadius: 6, border: "1px solid #DDD6EE", background: sp.available_days.includes(i) ? lp : "#fff", userSelect: "none" }}>
                      <input type="checkbox" style={{ display: "none" }} checked={sp.available_days.includes(i)} onChange={e => setSp({ ...sp, available_days: e.target.checked ? [...sp.available_days, i] : sp.available_days.filter(x => x !== i) })} />{d}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 8 }}><input type="checkbox" checked={sp.can_start_early} onChange={e => setSp({ ...sp, can_start_early: e.target.checked })} />Can start early</label>
                {sp.can_start_early && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 12, color: "#555" }}>From:</span><input type="time" value={sp.early_start_time} onChange={e => setSp({ ...sp, early_start_time: e.target.value })} style={{ border: "1px solid #DDD6EE", borderRadius: 6, padding: "4px 8px", fontSize: 12 }} /></div>}
              </div>
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 8 }}><input type="checkbox" checked={sp.can_stay_late} onChange={e => setSp({ ...sp, can_stay_late: e.target.checked })} />Can stay late</label>
                {sp.can_stay_late && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 12, color: "#555" }}>Until:</span><input type="time" value={sp.late_end_time} onChange={e => setSp({ ...sp, late_end_time: e.target.value })} style={{ border: "1px solid #DDD6EE", borderRadius: 6, padding: "4px 8px", fontSize: 12 }} /></div>}
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Notes</label>
                <input value={sp.notes} onChange={e => setSp({ ...sp, notes: e.target.value })} placeholder="e.g. Partner away for 2 weeks — available for extra shifts" style={inp} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={addSpecial} style={btnP}>Save Period</button>
              <button onClick={() => setShowSp(false)} style={btnS}>Cancel</button>
            </div>
          </div>
        )}
        {specials.length === 0 ? <div style={{ textAlign: "center", color: "#8A7F96", padding: 24, fontSize: 13 }}>No special periods recorded</div>
          : specials.map(s => (
            <div key={s.id} style={{ padding: "12px 16px", background: "#F9F7FE", borderRadius: 10, border: "1px solid #DDD6EE", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{fmtDate(s.start_date)} → {fmtDate(s.end_date)}</div>
                <div style={{ fontSize: 11, color: "#8A7F96", marginTop: 4 }}>
                  Days: {(Array.isArray(s.available_days) ? s.available_days : JSON.parse(s.available_days || "[]")).map(d => DAYS[d]).join(", ")}
                  {s.can_start_early ? ` · Early from ${s.early_start_time}` : ""}
                  {s.can_stay_late ? ` · Late until ${s.late_end_time}` : ""}
                </div>
                {s.notes && <div style={{ fontSize: 12, color: "#5C4E6A", marginTop: 4 }}>{s.notes}</div>}
              </div>
              <button onClick={() => delSpecial(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#E53935", fontSize: 16 }}>✕</button>
            </div>
          ))}
      </div>
    </div>
  );
}

function DocViewerModal({ doc, onClose }) {
  if (!doc) return null;
  const isImg = (doc.data_url && doc.data_url.startsWith('data:image/')) || (doc.file_name && /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.file_name));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9998 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: "90vw", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 400 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #EDE8F4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#3D3248" }}>{doc.label}</div>
            <div style={{ fontSize: 11, color: "#8A7F96", marginTop: 2 }}>{doc.category} · {doc.file_name}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#8A7F96" }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {doc.data_url ? (
            isImg
              ? <img src={doc.data_url} alt={doc.label} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 8 }} />
              : <iframe src={doc.data_url} style={{ width: "100%", height: "70vh", border: "none", borderRadius: 8 }} title={doc.label} />
          ) : (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A7F96" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#3D3248", marginBottom: 8 }}>{doc.label}</div>
              <div style={{ fontSize: 12 }}>{doc.file_name}</div>
              {doc.expiry_date && <div style={{ marginTop: 12, fontSize: 12, color: "#E65100" }}>Expires: {fmtDate(doc.expiry_date)}</div>}
              <div style={{ marginTop: 16, fontSize: 11, color: "#A89DB5" }}>Document preview not available — file stored by name only.<br/>Upload with drag-and-drop to enable inline viewing.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentsTab({ educator, onSaved }) {
  const [docs, setDocs] = useState(educator.documents || []);
  const [dragging, setDragging] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [pending, setPending] = useState([]);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const fileRef = useRef();

  useEffect(() => { setDocs(educator.documents || []); }, [educator.documents]);

  const analyseFile = async file => {
    const key = localStorage.getItem("c360_anthropic_key") || "";
    if (!key) return null;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["jpg","jpeg","png","webp","pdf"].includes(ext)) return null;
    try {
      const reader = new FileReader();
      return await new Promise(resolve => {
        reader.onload = async ev => {
          const data = ev.target.result.split(",")[1];
          const isImg = !file.type.includes("pdf");
          const mime = file.type || (isImg ? "image/jpeg" : "application/pdf");
          try {
            const res = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
              body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 250,
                messages: [{ role: "user", content: [
                  { type: isImg ? "image" : "document", source: { type: "base64", media_type: mime, data } },
                  { type: "text", text: `Analyse this educator document. Filename: ${file.name}. Return ONLY JSON: {"category":"qualification|certification|identity|contract|tax|super|performance|other","label":"short label","expiry_date":"YYYY-MM-DD or null","cert_field":"first_aid_expiry|cpr_expiry|anaphylaxis_expiry|asthma_expiry|wwcc_expiry or null","cert_value":"YYYY-MM-DD or null"}` }
                ]}] })
            });
            const d = await res.json();
            resolve(JSON.parse((d.content?.[0]?.text || "{}").replace(/```json|```/g,"").trim()));
          } catch { resolve(null); }
        };
        reader.readAsDataURL(file);
      });
    } catch { return null; }
  };

  const processFiles = async files => {
    setAnalysing(true);
    for (const file of files) {
      const ai = await analyseFile(file);
      const id = Date.now() + Math.random();
      setPending(p => [...p, { id, file, fileName: file.name, fileSize: file.size, category: ai?.category || "other", label: ai?.label || file.name.replace(/\.[^/.]+$/,"").replace(/[-_]/g," "), expiry_date: ai?.expiry_date || "", cert_field: ai?.cert_field || "", cert_value: ai?.cert_value || "", dataUrl: null }]);
      const r = new FileReader();
      r.onload = ev => setPending(p => p.map(x => x.id === id ? { ...x, dataUrl: ev.target.result } : x));
      r.readAsDataURL(file);
    }
    setAnalysing(false);
  };

  const savePending = async s => {
    try {
      // Store data_url in the doc record so inline preview works
      const r = await API(`/api/educators/${educator.id}/documents`, { method: "POST", body: JSON.stringify({ category: s.category, label: s.label, file_name: s.fileName, file_size: s.fileSize, expiry_date: s.expiry_date || null, mime_type: s.file.type, data_url: s.dataUrl }) });
      if (r.error) { toast(r.error, "error"); return; }
      if (s.cert_field && s.cert_value) { await API(`/api/educators/${educator.id}`, { method: "PUT", body: JSON.stringify({ [s.cert_field]: s.cert_value }) }); toast(`Saved — ${s.cert_field.replace(/_/g," ")} updated`); }
      else toast("Document saved");
      setPending(p => p.filter(x => x.id !== s.id)); onSaved();
    } catch(e) { toast("Save failed", "error"); }
  };

  const delDoc = async id => {
    if (!(await window.showConfirm("Delete this document?"))) return;
    try { await API(`/api/educators/${educator.id}/documents/${id}`, { method: "DELETE" }); onSaved(); toast("Deleted"); }
    catch(e) { toast("Delete failed", "error"); }
  };

  const saveEdit = async () => {
    try {
      const r = await API(`/api/educators/${educator.id}/documents/${editing.id}`, { method: "PUT", body: JSON.stringify({ label: editing.label, category: editing.category, expiry_date: editing.expiry_date }) });
      if (r.error) { toast(r.error, "error"); return; }
      onSaved(); setEditing(null); toast("Updated");
    } catch(e) { toast("Update failed", "error"); }
  };

  return (
    <>
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = Array.from(e.dataTransfer.files); if (f.length) processFiles(f); }}
        onClick={() => fileRef.current?.click()}
        style={{ border: `2px dashed ${dragging ? purple : "#DDD6EE"}`, borderRadius: 12, padding: "28px 20px", textAlign: "center", cursor: "pointer", background: dragging ? lp : "#FDFBF9", transition: "all 0.2s" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>📎</div>
        <div style={{ fontWeight: 700, color: "#3D3248", fontSize: 14, marginBottom: 4 }}>{analysing ? "Analysing with AI…" : "Drop files here or click to browse"}</div>
        <div style={{ fontSize: 12, color: "#8A7F96" }}>AI auto-classifies documents · PDF, JPG, PNG · Multiple files OK</div>
        <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: "none" }} onChange={e => { const f = Array.from(e.target.files); if (f.length) processFiles(f); e.target.value = ""; }} />
      </div>

      {pending.length > 0 && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14, color: "#3D3248" }}>Pending ({pending.length})</h3>
            {pending.length > 1 && <button onClick={() => pending.forEach(s => savePending(s))} style={btnP}>Save All</button>}
          </div>
          {pending.map(s => (
            <div key={s.id} style={{ padding: 14, background: "#F9F7FE", borderRadius: 10, border: "1px solid #DDD6EE", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                {s.dataUrl && s.file.type.startsWith("image/") && <img src={s.dataUrl} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid #EDE8F4", flexShrink: 0 }} />}
                <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div><label style={{ ...lbl, fontSize: 10 }}>Label</label><input value={s.label} onChange={e => setPending(p => p.map(x => x.id === s.id ? { ...x, label: e.target.value } : x))} style={{ ...inp, fontSize: 12, padding: "6px 10px" }} /></div>
                  <div><label style={{ ...lbl, fontSize: 10 }}>Category</label><select value={s.category} onChange={e => setPending(p => p.map(x => x.id === s.id ? { ...x, category: e.target.value } : x))} style={{ ...inp, fontSize: 12, padding: "6px 10px" }}>{DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                  <div><label style={{ ...lbl, fontSize: 10 }}>Expiry</label><DatePicker value={s.expiry_date} onChange={v => setPending(p => p.map(x => x.id === s.id ? { ...x, expiry_date: v } : x))} /></div>
                  {s.cert_field && <div style={{ background: "#E8F5E9", padding: "6px 10px", borderRadius: 8, fontSize: 11, color: "#2E7D32", fontWeight: 600, display: "flex", alignItems: "center" }}>✓ Updates {s.cert_field.replace(/_/g," ")}</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => savePending(s)} style={{ ...btnP, padding: "6px 14px", fontSize: 12 }}>Save</button>
                  <button onClick={() => setPending(p => p.filter(x => x.id !== s.id))} style={{ background: "none", border: "none", cursor: "pointer", color: "#E53935", fontSize: 12 }}>Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={card}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#3D3248" }}>Documents ({docs.length})</h3>
        {docs.length === 0 ? <div style={{ textAlign: "center", color: "#8A7F96", padding: 24 }}>No documents yet — drop files above to upload</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: lp }}>{["Label","Category","File","Expiry","Actions"].map(h => <th key={h} style={{ padding: "8px 12px", textAlign: h === "Actions" ? "center" : "left", color: purple, fontWeight: 700 }}>{h}</th>)}</tr></thead>
            <tbody>
              {docs.map(doc => (
                <tr key={doc.id} style={{ borderBottom: "1px solid #F0EBF8" }}>
                  <td style={{ padding: "10px 12px" }}>
                    {editing?.id === doc.id ? <input value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} style={{ ...inp, fontSize: 12, padding: "4px 8px" }} />
                      : <span onClick={() => setViewing(doc)} style={{ fontWeight: 600, color: "#3D3248", cursor: "pointer", textDecoration: "underline", textDecorationColor: "#DDD6EE" }} title="Click to view document">{doc.label} {doc.data_url ? "📄" : ""}</span>}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#8A7F96" }}>
                    {editing?.id === doc.id ? <select value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })} style={{ ...inp, fontSize: 12, padding: "4px 8px", width: "auto" }}>{DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select> : doc.category}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#8A7F96", fontSize: 12 }}>{doc.file_name}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    {editing?.id === doc.id ? <DatePicker value={editing.expiry_date || ""} onChange={v => setEditing({ ...editing, expiry_date: v })} />
                      : doc.expiry_date ? <span style={{ color: isExpired(doc.expiry_date) ? "#B71C1C" : isExpiringSoon(doc.expiry_date,30) ? "#E65100" : "#2E7D32", fontWeight: 700 }}>{isExpired(doc.expiry_date) ? "⚠ " : ""}{fmtDate(doc.expiry_date)}</span> : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    {editing?.id === doc.id
                      ? <div style={{ display: "flex", gap: 6, justifyContent: "center" }}><button onClick={saveEdit} style={{ ...btnP, padding: "4px 10px", fontSize: 11 }}>Save</button><button onClick={() => setEditing(null)} style={{ ...btnS, padding: "4px 8px", fontSize: 11 }}>Cancel</button></div>
                      : <div style={{ display: "flex", gap: 6, justifyContent: "center" }}><button onClick={() => setEditing({ ...doc })} style={{ ...btnS, padding: "4px 10px", fontSize: 11 }}>Edit</button><button onClick={() => delDoc(doc.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#E53935", fontSize: 14 }}>✕</button></div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
    {viewing && <DocViewerModal doc={viewing} onClose={() => setViewing(null)} />}
  </>
  );
}

function countWorkdays(s, e) {
  if (!s || !e) return { work: 0, weekend: 0, total: 0 };
  const sd = new Date(s+"T00:00:00"), ed = new Date(e+"T00:00:00");
  if (ed < sd) return { work: 0, weekend: 0, total: 0 };
  let work = 0, weekend = 0, cur = new Date(sd);
  while (cur <= ed) { cur.getDay()===0||cur.getDay()===6 ? weekend++ : work++; cur.setDate(cur.getDate()+1); }
  return { work, weekend, total: work+weekend };
}
function LeaveTab({ educator, onSaved }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ leave_type: "annual", start_date: "", end_date: "", days_requested: 1, reason: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const leaves = educator.leaveRequests || [];
  const updateDates = (field, val) => {
    const u = { ...form, [field]: val };
    if (u.start_date && u.end_date) { const { work } = countWorkdays(u.start_date, u.end_date); u.days_requested = work || 1; }
    setForm(u);
  };
  const ds = form.start_date && form.end_date ? countWorkdays(form.start_date, form.end_date) : null;
  const submit = async () => {
    if (!form.start_date || !form.end_date) { setErr("Dates required."); return; }
    if (new Date(form.end_date) < new Date(form.start_date)) { setErr("End must be after start."); return; }
    setSaving(true); setErr("");
    try {
      const r = await API(`/api/educators/${educator.id}/leave`, { method: "POST", body: JSON.stringify(form) });
      if (r.error) setErr(r.error);
      else { setShowAdd(false); setForm({ leave_type: "annual", start_date: "", end_date: "", days_requested: 1, reason: "" }); onSaved(); toast("Leave submitted"); }
    } catch(e) { setErr("Failed."); }
    setSaving(false);
  };
  const sc = { pending: ["#E65100","#FFF3E0"], approved: ["#2E7D32","#E8F5E9"], denied: ["#B71C1C","#FFEBEE"] };
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: "#3D3248" }}>Leave Requests</h3>
        <button onClick={() => { setShowAdd(!showAdd); setErr(""); }} style={btnS}>+ New Request</button>
      </div>
      {showAdd && (
        <div style={{ background: "#F9F7FE", borderRadius: 12, padding: 20, marginBottom: 16, border: "1px solid #DDD6EE" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div><label style={lbl}>Leave Type</label><select value={form.leave_type} onChange={e => setForm({ ...form, leave_type: e.target.value })} style={inp}>{LEAVE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</option>)}</select></div>
            <div>
              <label style={lbl}>Working Days</label>
              <NumInput value={form.days_requested} onChange={v => setForm({ ...form, days_requested: v })} />
              {ds && <div style={{ marginTop: 4, fontSize: 11, color: "#8A7F96" }}><span style={{ color: "#6BA38B", fontWeight: 600 }}>{ds.work} work day{ds.work!==1?"s":""}</span>{ds.weekend>0&&<span> · {ds.weekend} weekend</span>}</div>}
            </div>
            <div><label style={lbl}>Start Date</label><DatePicker value={form.start_date} onChange={v => updateDates("start_date", v)} /></div>
            <div><label style={lbl}>End Date</label><DatePicker value={form.end_date} min={form.start_date||undefined} onChange={v => updateDates("end_date", v)} /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Reason (optional)</label><input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Annual holiday…" style={inp} /></div>
          </div>
          {err && <div style={{ marginTop: 10, color: "#C9828A", fontSize: 12, padding: "10px 14px", background: "#FEF2F2", borderRadius: 8 }}>⚠ {err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={submit} disabled={saving} style={{ ...btnP, opacity: saving?0.7:1 }}>{saving?"Submitting…":"Submit Leave Request"}</button>
            <button onClick={() => { setShowAdd(false); setErr(""); }} style={btnS}>Cancel</button>
          </div>
        </div>
      )}
      {leaves.length === 0 ? <div style={{ textAlign: "center", color: "#8A7F96", padding: 40 }}>No leave requests</div> : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: lp }}>{["Type","Dates","Days","Reason","Status","Actions"].map(h=><th key={h} style={{ padding:"8px 12px",textAlign:"left",color:purple }}>{h}</th>)}</tr></thead>
          <tbody>
            {leaves.map(l => {
              const [col,bg] = sc[l.status]||["#777","#EEE"];
              return (
                <tr key={l.id} style={{ borderBottom:"1px solid #F0EBF8" }}>
                  <td style={{ padding:"10px 12px",fontWeight:600,textTransform:"capitalize" }}>{l.leave_type?.replace("_"," ")}</td>
                  <td style={{ padding:"10px 12px",color:"#8A7F96" }}>{fmtDate(l.start_date)} → {fmtDate(l.end_date)}</td>
                  <td style={{ padding:"10px 12px",textAlign:"center",fontWeight:700 }}>{l.days_requested}</td>
                  <td style={{ padding:"10px 12px",color:"#8A7F96" }}>{l.reason||"—"}</td>
                  <td style={{ padding:"10px 12px" }}><Badge text={l.status} color={col} bg={bg} /></td>
                  <td style={{ padding:"10px 12px" }}>
                    {l.status==="pending"&&(
                      <div style={{ display:"flex",gap:6 }}>
                        {["approved","denied"].map(s=>(
                          <button key={s} onClick={async()=>{ try{ await API(`/api/educators/${educator.id}/leave/${l.id}`,{method:"PUT",body:JSON.stringify({status:s})}); onSaved(); toast(s==="approved"?"Approved":"Denied"); }catch(e){toast("Failed","error");} }}
                            style={{ padding:"4px 10px",borderRadius:6,border:"none",background:s==="approved"?"#E8F5E9":"#FFEBEE",color:s==="approved"?"#2E7D32":"#B71C1C",fontSize:11,fontWeight:700,cursor:"pointer" }}>
                            {s[0].toUpperCase()+s.slice(1)}
                          </button>
                        ))}
                      </div>
                    )}
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

function AddEducatorWizard({ onClose, onSaved }) {
  const STEPS = ["Photo & Name","Contact & Address","Employment","Certifications","Availability","Bank & Super","Review"];
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileRef = useRef();
  const [form, setForm] = useState({ first_name:"",last_name:"",email:"",phone:"",dob:"",address:"",suburb:"",state:"NSW",postcode:"",qualification:"cert3",employment_type:"casual",start_date:"",hourly_rate_cents:3200,contracted_hours:38,super_rate:11.5,tax_file_number:"",first_aid:0,first_aid_expiry:"",cpr_expiry:"",anaphylaxis_expiry:"",asthma_expiry:"",wwcc_number:"",wwcc_expiry:"",bank_account_name:"",bank_bsb:"",bank_account:"",super_fund_name:"",super_fund_abn:"",super_fund_usi:"",super_member_number:"",photo_url:"" });
  const [avail, setAvail] = useState(Array.from({length:7},(_,i)=>({ day_of_week:i,available:i>0&&i<6?1:0,start_time:"07:00",end_time:"18:00",can_start_earlier_mins:0,can_finish_later_mins:0 })));
  const u = (k,v) => setForm(f=>({...f,[k]:v}));
  const handlePhoto = file => { if(!file||!file.type.startsWith("image/")) return; const r=new FileReader(); r.onload=ev=>{ setPhotoPreview(ev.target.result); u("photo_url",ev.target.result); }; r.readAsDataURL(file); };
  const submit = async () => {
    if (!form.first_name||!form.last_name) { toast("Name required","error"); setStep(0); return; }
    setSaving(true);
    try {
      const r = await API("/api/educators",{method:"POST",body:JSON.stringify(form)});
      if (r.error) { toast(r.error,"error"); setSaving(false); return; }
      if (avail.some(a=>a.available)) await API(`/api/educators/${r.id}/availability`,{method:"PUT",body:JSON.stringify({availability:avail})});
      toast(`${form.first_name} ${form.last_name} added`); onSaved();
    } catch(e) { toast("Failed: "+e.message,"error"); }
    setSaving(false);
  };
  const fld = (label,key,type="text",ph="") => (
    <div style={{ marginBottom:14 }}>
      <label style={lbl}>{label}</label>
      {type==="money"?<MoneyInput value={form[key]} onChange={v=>u(key,v)} />
        :type==="num"?<NumInput value={form[key]} onChange={v=>u(key,v)} />
        :type==="date"?<DatePicker value={form[key]||""} onChange={v=>u(key,v)} />
        :<input type={type} value={form[key]||""} onChange={e=>u(key,e.target.value)} placeholder={ph} style={inp} />}
    </div>
  );

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }}>
      <div style={{ background:"#fff",borderRadius:20,width:600,maxWidth:"95vw",maxHeight:"90vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding:"20px 28px",borderBottom:"1px solid #EDE8F4",display:"flex",alignItems:"center",gap:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:18,fontWeight:800,color:"#3D3248" }}>Add New Educator</div>
            <div style={{ fontSize:12,color:"#8A7F96",marginTop:2 }}>Step {step+1} of {STEPS.length}: {STEPS[step]}</div>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#8A7F96" }}>✕</button>
        </div>
        <div style={{ padding:"10px 28px 0",display:"flex",gap:3 }}>
          {STEPS.map((_,i)=><div key={i} onClick={()=>i<step&&setStep(i)} style={{ flex:1,height:4,borderRadius:2,background:i<=step?purple:"#EDE8F4",cursor:i<step?"pointer":"default",transition:"background 0.3s" }} />)}
        </div>
        <div style={{ flex:1,overflowY:"auto",padding:"24px 28px" }}>

          {step===0&&(
            <div>
              <div style={{ display:"flex",alignItems:"center",gap:20,marginBottom:24 }}>
                <div onClick={()=>fileRef.current?.click()} style={{ width:96,height:96,borderRadius:"50%",background:lp,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",overflow:"hidden",border:`2px dashed ${purple}`,flexShrink:0 }}>
                  {photoPreview?<img src={photoPreview} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} />:<div style={{ textAlign:"center" }}><div style={{ fontSize:28 }}>📷</div><div style={{ fontSize:10,color:purple,fontWeight:600,marginTop:4 }}>Add Photo</div></div>}
                </div>
                <div>
                  <div style={{ fontWeight:600,color:"#3D3248" }}>Profile Photo</div>
                  <div style={{ fontSize:12,color:"#8A7F96",marginTop:4 }}>Shown throughout the system, learning journeys, and parent portal.</div>
                  {photoPreview&&<button onClick={()=>{setPhotoPreview(null);u("photo_url","");}} style={{ marginTop:8,fontSize:11,color:"#E53935",background:"none",border:"none",cursor:"pointer" }}>Remove</button>}
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>handlePhoto(e.target.files[0])} />
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
                {fld("First Name *","first_name","text","First name")}
                {fld("Last Name *","last_name","text","Last name")}
                <div style={{ marginBottom:14 }}><label style={lbl}>Date of Birth</label><DatePicker value={form.dob||""} onChange={v=>u("dob",v)} max={new Date().toISOString().slice(0,10)} /></div>
              </div>
            </div>
          )}

          {step===1&&(
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
              {fld("Email","email","email")}{fld("Phone","phone")}
              <div style={{ gridColumn:"1/-1" }}>{fld("Street Address","address")}</div>
              {fld("Suburb","suburb")}
              <div style={{ marginBottom:14 }}><label style={lbl}>State</label><select value={form.state} onChange={e=>u("state",e.target.value)} style={inp}>{AU_STATES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
              {fld("Postcode","postcode")}
            </div>
          )}

          {step===2&&(
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
              <div style={{ marginBottom:14 }}><label style={lbl}>Qualification</label><select value={form.qualification} onChange={e=>u("qualification",e.target.value)} style={inp}>{Object.entries(QUAL_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
              <div style={{ marginBottom:14 }}><label style={lbl}>Employment Type</label><select value={form.employment_type} onChange={e=>u("employment_type",e.target.value)} style={inp}>{[["permanent","Permanent"],["casual","Casual"],["part_time","Part Time"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
              <div style={{ marginBottom:14 }}><label style={lbl}>Start Date</label><DatePicker value={form.start_date||""} onChange={v=>u("start_date",v)} /></div>
              <div style={{ marginBottom:14 }}><label style={lbl}>Hourly Rate</label><MoneyInput value={form.hourly_rate_cents} onChange={v=>u("hourly_rate_cents",v)} /></div>
              {fld("Contracted Hrs/Wk","contracted_hours","num")}
              {fld("Tax File Number","tax_file_number")}
            </div>
          )}

          {step===3&&(
            <div>
              <p style={{ fontSize:12,color:"#8A7F96",marginBottom:16,marginTop:0 }}>Enter certification details — affects Responsible Person eligibility.</p>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={{ display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:13,padding:"10px 14px",background:form.first_aid?"#E8F5E9":"#F9F7FE",borderRadius:8,border:"1px solid #DDD6EE" }}>
                    <input type="checkbox" checked={!!form.first_aid} onChange={e=>u("first_aid",e.target.checked?1:0)} />
                    <div><div style={{ fontWeight:600 }}>First Aid Certificate held</div><div style={{ fontSize:11,color:"#8A7F96" }}>Check if educator currently holds First Aid</div></div>
                  </label>
                </div>
                {CERT_FIELDS.map(({field:f,label:l})=>(
                  <div key={f}><label style={lbl}>{l}</label><DatePicker value={form[f]||""} min={new Date().toISOString().slice(0,10)} onChange={v=>u(f,v)} /></div>
                ))}
                {fld("WWCC Number","wwcc_number")}
              </div>
            </div>
          )}

          {step===4&&(
            <div>
              <p style={{ fontSize:12,color:"#8A7F96",marginBottom:16,marginTop:0 }}>Set regular weekly availability. Special periods can be added from the educator profile later.</p>
              <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                <thead><tr style={{ background:lp }}>{["Day","Available","Start","End"].map(h=><th key={h} style={{ padding:"8px 12px",textAlign:h==="Day"?"left":"center",color:purple }}>{h}</th>)}</tr></thead>
                <tbody>
                  {avail.map((a,i)=>(
                    <tr key={a.day_of_week} style={{ borderBottom:"1px solid #F0EBF8" }}>
                      <td style={{ padding:"8px 12px",fontWeight:600 }}>{DAYS[a.day_of_week]}</td>
                      <td style={{ padding:"6px 10px",textAlign:"center" }}><input type="checkbox" checked={!!a.available} onChange={e=>{ const n=[...avail];n[i]={...a,available:e.target.checked?1:0};setAvail(n); }} /></td>
                      <td style={{ padding:"6px 8px",textAlign:"center" }}><input type="time" value={a.start_time} disabled={!a.available} onChange={e=>{ const n=[...avail];n[i]={...a,start_time:e.target.value};setAvail(n); }} style={{ border:"1px solid #DDD6EE",borderRadius:6,padding:"4px 6px",fontSize:12 }} /></td>
                      <td style={{ padding:"6px 8px",textAlign:"center" }}><input type="time" value={a.end_time} disabled={!a.available} min={a.start_time||undefined} onChange={e=>{ const n=[...avail];n[i]={...a,end_time:e.target.value};setAvail(n); }} style={{ border:"1px solid #DDD6EE",borderRadius:6,padding:"4px 6px",fontSize:12 }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {step===5&&(
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
              <div style={{ gridColumn:"1/-1",paddingBottom:8,borderBottom:"1px solid #EDE8F4",fontSize:12,fontWeight:700,color:"#8A7F96" }}>SUPERANNUATION</div>
              <div style={{ gridColumn:"1/-1",marginBottom:14 }}><label style={lbl}>Fund Name</label><input value={form.super_fund_name} onChange={e=>u("super_fund_name",e.target.value)} placeholder="e.g. Australian Retirement Trust" style={inp} /></div>
              {fld("ABN","super_fund_abn","text","e.g. 60 905 115 063")}
              {fld("USI","super_fund_usi","text","e.g. STA0100AU")}
              {fld("Member Number","super_member_number")}
              <div style={{ marginBottom:14 }}><label style={lbl}>Super Rate (%)</label><NumInput value={form.super_rate} onChange={v=>u("super_rate",v)} style={{ width:80 }} /></div>
              <div style={{ gridColumn:"1/-1",paddingTop:8,paddingBottom:8,borderTop:"1px solid #EDE8F4",borderBottom:"1px solid #EDE8F4",fontSize:12,fontWeight:700,color:"#8A7F96" }}>BANK ACCOUNT</div>
              {fld("Account Name","bank_account_name")}
              {fld("BSB","bank_bsb")}
              {fld("Account Number","bank_account")}
            </div>
          )}

          {step===6&&(
            <div>
              <div style={{ display:"flex",gap:16,alignItems:"center",marginBottom:20 }}>
                <div style={{ width:72,height:72,borderRadius:"50%",background:lp,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                  {form.photo_url?<img src={form.photo_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} />:<span style={{ fontSize:26,fontWeight:700,color:purple }}>{form.first_name?.[0]}{form.last_name?.[0]}</span>}
                </div>
                <div>
                  <div style={{ fontSize:20,fontWeight:800,color:"#3D3248" }}>{form.first_name} {form.last_name}</div>
                  <div style={{ fontSize:13,color:"#8A7F96",marginTop:4 }}>{QUAL_LABELS[form.qualification]} · {form.employment_type}</div>
                </div>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:13 }}>
                {[["Email",form.email],["Phone",form.phone],["Start Date",fmtDate(form.start_date)],["Rate",`$${(form.hourly_rate_cents/100).toFixed(2)}/hr`],["Super Fund",form.super_fund_name],["Available",avail.filter(a=>a.available).map(a=>DAYS[a.day_of_week]).join(", ")]].filter(([,v])=>v).map(([l,v])=>(
                  <div key={l} style={{ padding:"8px 12px",background:"#FDFBF9",borderRadius:8 }}>
                    <div style={{ fontSize:10,color:"#8A7F96",fontWeight:700,textTransform:"uppercase",marginBottom:2 }}>{l}</div>
                    <div style={{ fontWeight:600,color:"#3D3248" }}>{v}</div>
                  </div>
                ))}
              </div>
              {(!form.first_name||!form.last_name)&&<div style={{ marginTop:16,padding:"10px 14px",background:"#FEF2F2",borderRadius:8,color:"#C9828A",fontSize:13 }}>⚠ Name is required.</div>}
            </div>
          )}
        </div>

        <div style={{ padding:"16px 28px",borderTop:"1px solid #EDE8F4",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div style={{ display:"flex",gap:8 }}>
            {step>0&&<button onClick={()=>setStep(s=>s-1)} style={btnS}>← Back</button>}
            {step>0&&step<STEPS.length-1&&<button onClick={()=>setStep(s=>s+1)} style={{ background:"none",border:"none",color:"#8A7F96",cursor:"pointer",fontSize:13 }}>Skip →</button>}
          </div>
          <div style={{ display:"flex",gap:8 }}>
            <button onClick={onClose} style={{ ...btnS,background:"#F5F5F5",color:"#555" }}>Cancel</button>
            {step<STEPS.length-1
              ?<button onClick={()=>setStep(s=>s+1)} style={btnP}>Next →</button>
              :<button onClick={submit} disabled={saving||!form.first_name||!form.last_name} style={{ ...btnP,opacity:(saving||!form.first_name||!form.last_name)?0.6:1 }}>{saving?"Adding…":"Add Educator"}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EducatorsModule() {
  const [educators, setEducators] = useState([]);
  const [selected, setSelected] = useState(() => {
    const stored = typeof window !== 'undefined' && localStorage.getItem('c360_educator_select');
    if (stored) { localStorage.removeItem('c360_educator_select'); return stored; }
    return null;
  });
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("profile");
  const [ytd, setYtd] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [mainTab, setMainTab] = useState(() => {
    const stored = typeof window !== 'undefined' && localStorage.getItem('c360_educator_tab');
    if (stored) { localStorage.removeItem('c360_educator_tab'); return stored; }
    return "list";
  });
  const [necwr, setNecwr] = useState([]);
  const [necwrLoading, setNecwrLoading] = useState(false);
  const [necwrFilter, setNecwrFilter] = useState("all");
  const [necwrSelected, setNecwrSelected] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [showTerminate, setShowTerminate] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("active");

  const loadEducators = useCallback(async () => {
    try { const d = await API("/api/educators"); if (Array.isArray(d)) setEducators(d); } catch(e) {}
  }, []);

  const loadDetail = useCallback(async id => {
    if (!id) return;
    try {
      const [d, y] = await Promise.all([API(`/api/educators/${id}`), API(`/api/educators/${id}/ytd-earnings`)]);
      setDetail(d); setYtd(y); setEditData(d);
    } catch(e) {}
  }, []);

  const loadNecwr = useCallback(async () => {
    setNecwrLoading(true);
    try { const d = await API("/api/educators/necwr-status"); if (Array.isArray(d)) setNecwr(d); } catch(e) {}
    setNecwrLoading(false);
  }, []);

  useEffect(() => { loadEducators(); }, [loadEducators]);
  useEffect(() => { if (selected) loadDetail(selected); }, [selected, loadDetail]);

  const filtered = educators.filter(e => {
    const name = `${e.first_name} ${e.last_name}`.toLowerCase();
    if (search && !name.includes(search.toLowerCase())) return false;
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    return true;
  });

  const saveEdit = async () => {
    try {
      const r = await API(`/api/educators/${selected}`, { method: "PUT", body: JSON.stringify(editData) });
      if (r.error) { toast(r.error, "error"); return; }
      setEditMode(false); loadDetail(selected); loadEducators(); toast("Changes saved");
    } catch(e) { toast("Save failed", "error"); }
  };

  const rc = s => s >= 90 ? "#2E7D32" : s >= 75 ? "#E65100" : "#B71C1C";

  const necwrStatusColor = s => ({ not_submitted:"#C06B73",in_progress:"#E65100",submitted:"#1565C0",verified:"#2E7D32",rejected:"#B71C1C" }[s] || "#8A7F96");
  const necwrStatusLabel = s => ({ not_submitted:"Not Submitted",in_progress:"In Progress",submitted:"Submitted ✓",verified:"Verified ✅",rejected:"Rejected ✗" }[s] || s);
  const necwrStatusBg = s => ({ not_submitted:"#FFEBEE",in_progress:"#FFF3E0",submitted:"#E3F2FD",verified:"#E8F5E9",rejected:"#FFEBEE" }[s] || "#F8F5F1");

  const updateNecwr = async (ids, status) => {
    try {
      await API("/api/educators/necwr-bulk", { method:"POST", body: JSON.stringify({ educator_ids: ids, necwr_status: status }) });
      toast(`Updated ${ids.length} educator${ids.length>1?"s":""} → ${necwrStatusLabel(status)}`);
      setNecwrSelected([]); loadNecwr();
    } catch(e) { toast("Update failed","error"); }
  };

  if (!selected) return (
    <div style={{ padding: "0 24px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, color: "#3D3248" }}>Educators</h2>
          <p style={{ margin: "4px 0 0", color: "#8A7F96", fontSize: 13 }}>{educators.filter(e=>e.status==="active").length} active staff members</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {mainTab==="list" && <button onClick={() => setShowWizard(true)} style={btnP}>+ Add Educator</button>}

      {/* ── CERT EXPIRY DASHBOARD ── */}
      {mainTab==="certexpiry" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:20}}>
            {[
              ["All Active", educators.filter(e=>e.status==="active").length, "#3D3248"],
              ["Certs OK", educators.filter(e=>e.status==="active"&&isDateValid(e.first_aid_expiry)&&isDateValid(e.cpr_expiry)&&isDateValid(e.wwcc_expiry)).length, "#2E7D32"],
              ["Expiring Soon", educators.filter(e=>e.status==="active"&&(isExpiringSoon(e.first_aid_expiry,30)||isExpiringSoon(e.cpr_expiry,30)||isExpiringSoon(e.wwcc_expiry,60))).length, "#E65100"],
              ["Expired", educators.filter(e=>e.status==="active"&&(isExpired(e.first_aid_expiry)||isExpired(e.cpr_expiry)||isExpired(e.wwcc_expiry))).length, "#C62828"],
            ].map(([l,v,c])=>(
              <div key={l} style={{background:"#fff",borderRadius:12,border:"1px solid #EDE8F4",padding:"14px 16px",textAlign:"center"}}>
                <div style={{fontSize:24,fontWeight:800,color:c,lineHeight:1}}>{v}</div>
                <div style={{fontSize:10,color:"#8A7F96",marginTop:4,fontWeight:600,textTransform:"uppercase"}}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{background:"#fff",borderRadius:14,border:"1px solid #EDE8F4"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{background:"#EDE8F4"}}>
                  {["Educator","First Aid","CPR","WWCC","Anaphylaxis","Status"].map(h=>(
                    <th key={h} style={{padding:"9px 14px",textAlign:"left",fontWeight:700,color:"#5C4E6A",fontSize:11}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {educators.filter(e=>e.status==="active").sort((a,b)=>{
                  const aAlert = isExpired(a.first_aid_expiry)||isExpired(a.cpr_expiry)||isExpired(a.wwcc_expiry);
                  const bAlert = isExpired(b.first_aid_expiry)||isExpired(b.cpr_expiry)||isExpired(b.wwcc_expiry);
                  return bAlert-aAlert;
                }).map((edu,i)=>{
                  const expired = isExpired(edu.first_aid_expiry)||isExpired(edu.cpr_expiry)||isExpired(edu.wwcc_expiry);
                  const expiring = !expired&&(isExpiringSoon(edu.first_aid_expiry,30)||isExpiringSoon(edu.cpr_expiry,30)||isExpiringSoon(edu.wwcc_expiry,60));
                  const CertCell = ({expiry})=>{
                    if(!expiry) return <td style={{padding:"8px 14px",color:"#C0B8CC",fontSize:11}}>—</td>;
                    const exp=isExpired(expiry); const soon=isExpiringSoon(expiry,60);
                    return <td style={{padding:"8px 14px",fontWeight:exp||soon?700:400,
                      color:exp?"#C62828":soon?"#E65100":"#2E7D32",fontSize:11}}>
                      {exp?"❌":soon?"⚠️":"✓"} {fmtDate(expiry)}
                    </td>;
                  };
                  return(
                    <tr key={edu.id} style={{background:expired?"#FFF5F5":expiring?"#FFFBF0":i%2===0?"#FDFBF9":"#fff",
                      borderBottom:"1px solid #F0EBF8",cursor:"pointer"}}
                      onClick={()=>{setSelected(edu.id);setMainTab("list");setTab("certifications");}}>
                      <td style={{padding:"8px 14px",fontWeight:600,color:"#3D3248"}}>
                        {edu.first_name} {edu.last_name}
                        <div style={{fontSize:10,color:"#8A7F96"}}>{edu.qualification?.replace(/_/g," ")}</div>
                      </td>
                      <CertCell expiry={edu.first_aid_expiry}/>
                      <CertCell expiry={edu.cpr_expiry}/>
                      <CertCell expiry={edu.wwcc_expiry}/>
                      <CertCell expiry={edu.anaphylaxis_expiry}/>
                      <td style={{padding:"8px 14px"}}>
                        <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,
                          background:expired?"#FFEBEE":expiring?"#FFF3E0":"#E8F5E9",
                          color:expired?"#C62828":expiring?"#E65100":"#2E7D32"}}>
                          {expired?"⚠ Expired":expiring?"Expiring Soon":"✓ OK"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}


          {mainTab==="necwr" && necwrSelected.length > 0 && (
            <div style={{ display:"flex", gap:6 }}>
              <span style={{ fontSize:12,color:"#8A7F96",display:"flex",alignItems:"center" }}>{necwrSelected.length} selected</span>
              {[["in_progress","Mark In Progress"],["submitted","Mark Submitted"],["verified","Mark Verified"]].map(([s,l])=>(
                <button key={s} onClick={()=>updateNecwr(necwrSelected,s)} style={{ ...btnS, fontSize:11, padding:"6px 12px", background:necwrStatusBg(s), color:necwrStatusColor(s), border:"1px solid "+necwrStatusColor(s)+"40" }}>{l}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Main tabs */}
      <div style={{ display:"flex", gap:4, marginBottom:16, borderBottom:"2px solid #EDE8F4", paddingBottom:0 }}>
        {[["list","👩‍🏫 Staff List"],["certexpiry","⚠️ Cert Expiry"],["necwr","🏛️ NECWR Register"]].map(([id,label])=>(
          <button key={id} onClick={()=>{ setMainTab(id); if(id==="necwr") loadNecwr(); }}
            style={{ padding:"8px 18px", border:"none", cursor:"pointer", fontSize:13, fontWeight:mainTab===id?700:500,
              background:"transparent", color:mainTab===id?purple:"#6B5F7A",
              borderBottom:`3px solid ${mainTab===id?purple:"transparent"}`, marginBottom:-2, transition:"all 0.15s" }}>
            {label}
          </button>
        ))}
        {mainTab==="necwr" && (
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6, paddingBottom:6 }}>
            <span style={{ fontSize:11,color:"#8A7F96" }}>Filter:</span>
            {[["all","All"],["not_submitted","Not Submitted"],["in_progress","In Progress"],["submitted","Submitted"],["verified","Verified"]].map(([v,l])=>(
              <button key={v} onClick={()=>setNecwrFilter(v)}
                style={{ padding:"4px 10px", borderRadius:20, border:"1px solid "+(necwrFilter===v?purple:"#DDD"), cursor:"pointer", fontSize:11, fontWeight:necwrFilter===v?700:400, background:necwrFilter===v?purple:"#fff", color:necwrFilter===v?"#fff":"#555" }}>{l}</button>
            ))}
          </div>
        )}
      </div>
      {mainTab==="list" && <>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search educators…" style={{ flex:1, ...inp }} />
        {["active","inactive","all"].map(s=>(
          <button key={s} onClick={()=>setFilterStatus(s)} style={{ padding:"8px 16px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:filterStatus===s?purple:"#EDE8F4",color:filterStatus===s?"#fff":purple }}>
            {s[0].toUpperCase()+s.slice(1)}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
        {filtered.map(edu => {
          const alert = !edu.first_aid||isExpiringSoon(edu.first_aid_expiry,30)||isExpiringSoon(edu.cpr_expiry,30)||isExpiringSoon(edu.wwcc_expiry,60);
          return (
            <div key={edu.id} onClick={()=>{ setSelected(edu.id); setTab("profile"); }}
              style={{ ...card,cursor:"pointer",display:"flex",gap:14,alignItems:"flex-start",transition:"box-shadow 0.15s",borderLeft:`4px solid ${edu.status==="active"?purple:"#CCC"}` }}
              onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.1)"}
              onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
              <EducatorAvatar educator={edu} size={52} />
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
                  <div>
                    <div style={{ fontWeight:700,color:"#3D3248" }}>{edu.first_name} {edu.last_name}</div>
                    <div style={{ fontSize:11,color:"#8A7F96",marginTop:2 }}>{edu.employment_type} · {edu.email||"No email"}</div>
                  </div>
                  {alert&&<span title="Cert expiring">⚠️</span>}
                </div>
                <div style={{ marginTop:8,display:"flex",flexWrap:"wrap",gap:6 }}>
                  <QualBadge qual={edu.qualification} />
                  <span style={{ background:"#F5F5F5",color:rc(edu.reliability_score),borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700 }}>{edu.reliability_score}% reliable</span>
                </div>
                <div style={{ marginTop:8,fontSize:11,color:"#8A7F96" }}>{edu.shifts_last_30||0} shifts (30d){edu.distance_km?` · ${edu.distance_km}km`:""}</div>
              </div>
            </div>
          );
        })}
      </div>
      </>}

      {mainTab==="necwr" && (
        <div>
          {necwrLoading ? (
            <div style={{ textAlign:"center",padding:60,color:"#8A7F96" }}>Loading NECWR data…</div>
          ) : (
            <>
              {/* Summary stats */}
              <div style={{ display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20 }}>
                {[
                  ["Total Staff", necwr.length, "#3D3248"],
                  ["Not Submitted", necwr.filter(e=>e.necwr_status==="not_submitted"||!e.necwr_status).length, "#C06B73"],
                  ["In Progress", necwr.filter(e=>e.necwr_status==="in_progress").length, "#E65100"],
                  ["Submitted", necwr.filter(e=>e.necwr_status==="submitted").length, "#1565C0"],
                  ["Verified", necwr.filter(e=>e.necwr_status==="verified").length, "#2E7D32"],
                ].map(([l,v,c])=>(
                  <div key={l} style={{ padding:"14px 18px",borderRadius:12,background:"#fff",border:"1px solid #EDE8F4",boxShadow:"0 1px 4px rgba(0,0,0,0.05)",textAlign:"center" }}>
                    <div style={{ fontSize:28,fontWeight:800,color:c,lineHeight:1 }}>{v}</div>
                    <div style={{ fontSize:11,color:"#8A7F96",marginTop:4,fontWeight:600 }}>{l}</div>
                  </div>
                ))}
              </div>

              {/* Deadline banner */}
              <div style={{ background:"#FFF3E0",border:"2px solid #FF9800",borderRadius:12,padding:"14px 20px",marginBottom:20,display:"flex",alignItems:"center",gap:14 }}>
                <span style={{ fontSize:28 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight:800,fontSize:14,color:"#E65100" }}>NECWR Submission Deadline — Late March 2026</div>
                  <div style={{ fontSize:12,color:"#BF360C",marginTop:3 }}>
                    Under the <strong>Early Childhood Legislation (Child Safety) Amendment Act 2025</strong>, all approved NQF providers must register their workforce in the National Early Childhood Worker Register. Mandatory from 27 February 2026.
                  </div>
                </div>
                <a href="https://www.acecqa.gov.au" target="_blank" rel="noreferrer" style={{ marginLeft:"auto",flexShrink:0,padding:"8px 16px",background:"#E65100",color:"#fff",borderRadius:8,textDecoration:"none",fontWeight:700,fontSize:12,whiteSpace:"nowrap" }}>ACECQA ↗</a>
              </div>

              {/* Bulk action bar */}
              {necwrSelected.length > 0 && (
                <div style={{ background:"#EDE8F4",borderRadius:10,padding:"10px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" }}>
                  <span style={{ fontSize:13,fontWeight:700,color:purple }}>{necwrSelected.length} selected</span>
                  <span style={{ flex:1 }}/>
                  {[["in_progress","🔄 Mark In Progress","#E65100"],["submitted","📤 Mark Submitted","#1565C0"],["verified","✅ Mark Verified","#2E7D32"]].map(([s,l,c])=>(
                    <button key={s} onClick={()=>updateNecwr(necwrSelected,s)}
                      style={{ padding:"7px 14px",background:c,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12 }}>{l}</button>
                  ))}
                  <button onClick={()=>setNecwrSelected([])} style={{ padding:"7px 12px",background:"#fff",color:"#555",border:"1px solid #DDD",borderRadius:8,cursor:"pointer",fontSize:12 }}>Deselect</button>
                </div>
              )}

              {/* Educator NECWR table */}
              <div style={{ background:"#fff",borderRadius:12,border:"1px solid #EDE8F4" }}>
                {/* Table header */}
                <div style={{ display:"grid",gridTemplateColumns:"40px 1fr 100px 120px 140px 160px 80px",gap:0,background:"#F8F5FC",borderBottom:"1px solid #EDE8F4",padding:"10px 16px" }}>
                  <div><input type="checkbox" onChange={e=>{
                    const filtered = necwr.filter(ed=>necwrFilter==="all"||ed.necwr_status===necwrFilter||(necwrFilter==="not_submitted"&&(!ed.necwr_status||ed.necwr_status==="not_submitted")));
                    setNecwrSelected(e.target.checked ? filtered.map(e=>e.id) : []);
                  }} checked={necwrSelected.length===necwr.filter(ed=>necwrFilter==="all"||ed.necwr_status===necwrFilter).length&&necwr.length>0}/></div>
                  {["Name","Qualification","WWCC","Status","Submitted","Action"].map(h=>(
                    <div key={h} style={{ fontSize:11,fontWeight:700,color:"#8A7F96",textTransform:"uppercase" }}>{h}</div>
                  ))}
                </div>
                {necwr
                  .filter(ed => necwrFilter==="all" || ed.necwr_status===necwrFilter || (necwrFilter==="not_submitted" && (!ed.necwr_status||ed.necwr_status==="not_submitted")))
                  .map(ed => {
                    const status = ed.necwr_status || "not_submitted";
                    const checked = necwrSelected.includes(ed.id);
                    const wwccOk = ed.wwcc_number && ed.wwcc_expiry && new Date(ed.wwcc_expiry) > new Date();
                    return (
                      <div key={ed.id} style={{ display:"grid",gridTemplateColumns:"40px 1fr 100px 120px 140px 160px 80px",gap:0,padding:"12px 16px",borderBottom:"1px solid #F5F0FB",background:checked?"rgba(139,109,175,0.04)":"#fff",alignItems:"center" }}>
                        <div><input type="checkbox" checked={checked} onChange={e=>setNecwrSelected(p=>e.target.checked?[...p,ed.id]:p.filter(x=>x!==ed.id))}/></div>
                        <div>
                          <div style={{ fontWeight:600,fontSize:13 }}>{ed.first_name} {ed.last_name}</div>
                          <div style={{ fontSize:11,color:"#8A7F96" }}>{ed.email}</div>
                        </div>
                        <div style={{ fontSize:11,color:"#5C4E6A" }}>{({ect:"ECT",diploma:"Diploma",cert3:"Cert III",working_towards:"Working Towards"})[ed.qualification]||ed.qualification}</div>
                        <div>
                          {wwccOk
                            ? <span style={{ fontSize:10,fontWeight:700,color:"#2E7D32",background:"#E8F5E9",padding:"2px 7px",borderRadius:20 }}>✓ {ed.wwcc_number}</span>
                            : <span style={{ fontSize:10,fontWeight:700,color:"#B71C1C",background:"#FFEBEE",padding:"2px 7px",borderRadius:20 }}>⚠ Missing/Expired</span>
                          }
                        </div>
                        <div>
                          <span style={{ fontSize:11,fontWeight:700,color:necwrStatusColor(status),background:necwrStatusBg(status),padding:"3px 10px",borderRadius:20 }}>
                            {necwrStatusLabel(status)}
                          </span>
                        </div>
                        <div style={{ fontSize:11,color:"#8A7F96" }}>
                          {ed.necwr_submitted_at ? new Date(ed.necwr_submitted_at).toLocaleDateString() : "—"}
                          {ed.necwr_confirmation && <div style={{ fontSize:10,color:"#1565C0",marginTop:1 }}>Ref: {ed.necwr_confirmation}</div>}
                        </div>
                        <div>
                          <select value={status}
                            onChange={async e=>{
                              const newStatus = e.target.value;
                              let conf = null;
                              if(newStatus==="submitted") conf = prompt("Enter NECWR confirmation/reference number (optional):");
                              try {
                                await API(`/api/educators/${ed.id}/necwr`,{method:"PUT",body:JSON.stringify({necwr_status:newStatus,necwr_confirmation:conf})});
                                toast(`${ed.first_name}: ${necwrStatusLabel(newStatus)}`);
                                loadNecwr();
                              } catch(e) { toast("Update failed","error"); }
                            }}
                            style={{ fontSize:11,padding:"4px 6px",borderRadius:6,border:"1px solid #DDD",cursor:"pointer",width:"100%" }}>
                            <option value="not_submitted">Not Submitted</option>
                            <option value="in_progress">In Progress</option>
                            <option value="submitted">Submitted</option>
                            <option value="verified">Verified</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </div>
                      </div>
                    );
                  })}
                {necwr.length === 0 && !necwrLoading && (
                  <div style={{ padding:40,textAlign:"center",color:"#8A7F96" }}>No educators found.</div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {showWizard && <AddEducatorWizard onClose={()=>setShowWizard(false)} onSaved={()=>{ setShowWizard(false); loadEducators(); }} />}
    </div>
  );

  const edu = detail;
  if (!edu) return <div style={{ padding:40,textAlign:"center",color:"#8A7F96" }}>Loading…</div>;

  const tabs = [
    { id:"profile",label:"Profile" },
    { id:"employment",label:"Employment" },
    { id:"availability",label:"Availability" },
    { id:"certifications",label:"Certifications",alert:!edu.first_aid||isExpired(edu.first_aid_expiry)||isExpired(edu.cpr_expiry) },
    { id:"documents",label:"Documents" },
    { id:"leave",label:"Leave" },
    { id:"pay",label:"Pay & Super" },
    ...(edu.status === "inactive" || edu.termination_date ? [{ id:"termination",label:"Termination",alert:true }] : []),
  ];

  return (
    <>
    <div style={{ display:"flex",flexDirection:"column",height:"100%" }}>
      <div style={{ padding:"16px 24px",borderBottom:"1px solid #EDE8F4",display:"flex",alignItems:"center",gap:16,background:"#fff",flexShrink:0 }}>
        <button onClick={()=>{ setSelected(null); setDetail(null); setEditMode(false); }} style={{ background:"none",border:"none",cursor:"pointer",color:purple,fontWeight:700,fontSize:14 }}>← Back</button>
        <PhotoUpload educator={edu} onUploaded={()=>loadDetail(selected)} />
        <div style={{ flex:1 }}>
          <h2 style={{ margin:0,color:"#3D3248" }}>{edu.first_name} {edu.last_name}</h2>
          <div style={{ display:"flex",gap:8,alignItems:"center",marginTop:4,flexWrap:"wrap" }}><QualBadge qual={edu.qualification} /><RPBadge educator={edu} /><Badge text={edu.employment_type||"—"} /></div>
        </div>
        <div style={{ display:"flex",gap:8,alignItems:"center" }}>
          {edu.status === "inactive" && edu.termination_date && (
            <span style={{ fontSize:11,fontWeight:700,color:"#B71C1C",background:"#FFEBEE",padding:"4px 10px",borderRadius:20 }}>⛔ Terminated {fmtDate(edu.termination_date)}</span>
          )}
          {!editMode
            ?<>
               <button onClick={()=>setEditMode(true)} style={btnS}>Edit</button>
               {edu.status !== "inactive"
                 ? <button onClick={()=>setShowTerminate(true)} style={{ background:"#FFEBEE",color:"#B71C1C",border:"1px solid #FFCDD2",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:13 }}>Terminate</button>
                 : <button onClick={async()=>{ if(!(await window.showConfirm("Reinstate this educator?"))) return; const r=await API(`/api/educators/${selected}/reinstate`,{method:"POST"}); if(r.ok){loadDetail(selected);loadEducators();toast("Educator reinstated");} else toast(r.error,"error"); }} style={{ background:"#E8F5E9",color:"#2E7D32",border:"1px solid #A5D6A7",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:13 }}>Reinstate</button>}
             </>
            :<div style={{ display:"flex",gap:8 }}>
              <button onClick={saveEdit} style={btnP}>Save</button>
              <button onClick={()=>{ setEditMode(false); setEditData(edu); }} style={{ ...btnS,background:"#F5F5F5",color:"#555" }}>Cancel</button>
            </div>}
        </div>
      </div>

      <div style={{ padding:"8px 24px",borderBottom:"1px solid #EDE8F4",display:"flex",gap:4,background:"#FDFBF9",flexShrink:0,overflowX:"auto" }}>
        {tabs.map(t=><TabBtn key={t.id} label={t.label} active={tab===t.id} onClick={()=>setTab(t.id)} alert={t.alert} />)}
      </div>

      <div style={{ flex:1,overflowY:"auto",padding:24 }}>
        {tab==="profile"&&(
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>
            <div style={card}>
              <h3 style={{ margin:"0 0 16px",fontSize:14,color:"#3D3248" }}>Personal Details</h3>
              <FR label="First Name" field="first_name" data={editData} set={setEditData} edit={editMode} />
              <FR label="Last Name" field="last_name" data={editData} set={setEditData} edit={editMode} />
              <FR label="Email" field="email" data={editData} set={setEditData} edit={editMode} type="email" />
              <FR label="Phone" field="phone" data={editData} set={setEditData} edit={editMode} />
              <FR label="Date of Birth" field="dob" data={editData} set={setEditData} edit={editMode} type="date" />
            </div>
            <div style={card}>
              <h3 style={{ margin:"0 0 16px",fontSize:14,color:"#3D3248" }}>Address</h3>
              <FR label="Street" field="address" data={editData} set={setEditData} edit={editMode} />
              <FR label="Suburb" field="suburb" data={editData} set={setEditData} edit={editMode} />
              <div style={{ marginBottom:10 }}>
                <label style={lbl}>State</label>
                {editMode?<select value={editData.state||"NSW"} onChange={e=>setEditData({...editData,state:e.target.value})} style={{ ...inp,width:"auto" }}>{AU_STATES.map(s=><option key={s} value={s}>{s}</option>)}</select>
                :<div style={{ padding:"8px 0",fontSize:13,fontWeight:600 }}>{edu.state||"—"}</div>}
              </div>
              <FR label="Postcode" field="postcode" data={editData} set={setEditData} edit={editMode} />
            </div>
            <div style={{ ...card,gridColumn:"1/-1" }}>
              <h3 style={{ margin:"0 0 16px",fontSize:14,color:"#3D3248" }}>Performance</h3>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12 }}>
                {[["Reliability",`${edu.reliability_score||0}%`],["Shifts (30d)",edu.shifts_last_30||0],["Sick Days YTD",edu.total_sick_days||0],["Late Arrivals",edu.total_late_arrivals||0],["No Shows",edu.total_no_shows||0]].map(([l,v])=>(
                  <div key={l} style={{ textAlign:"center",padding:12,background:"#FDFBF9",borderRadius:10 }}>
                    <div style={{ fontSize:22,fontWeight:800,color:purple }}>{v}</div>
                    <div style={{ fontSize:11,color:"#8A7F96",marginTop:4 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab==="employment"&&(
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>
            <div style={card}>
              <h3 style={{ margin:"0 0 16px",fontSize:14,color:"#3D3248" }}>Employment Details</h3>
              <div style={{ marginBottom:10 }}>
                <label style={lbl}>Qualification</label>
                {editMode?<select value={editData.qualification||"cert3"} onChange={e=>setEditData({...editData,qualification:e.target.value})} style={inp}>{Object.entries(QUAL_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
                :<div style={{ padding:"8px 0" }}><QualBadge qual={edu.qualification} /></div>}
              </div>
              <div style={{ marginBottom:10 }}>
                <label style={lbl}>Employment Type</label>
                {editMode?<select value={editData.employment_type||"casual"} onChange={e=>setEditData({...editData,employment_type:e.target.value})} style={inp}>{[["permanent","Permanent"],["casual","Casual"],["part_time","Part Time"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
                :<div style={{ padding:"8px 0",fontSize:13,fontWeight:600 }}>{edu.employment_type||"—"}</div>}
              </div>
              <FR label="Start Date" field="start_date" data={editData} set={setEditData} edit={editMode} type="date" />
              <FR label="Contracted Hrs/Wk" field="contracted_hours" data={editData} set={setEditData} edit={editMode} type="num" />
              <div style={{ marginBottom:10 }}>
                <label style={lbl}>Hourly Rate</label>
                {editMode?<MoneyInput value={editData.hourly_rate_cents} onChange={v=>setEditData({...editData,hourly_rate_cents:v})} />
                :<div style={{ padding:"8px 0",fontSize:13,fontWeight:600 }}>${((edu.hourly_rate_cents||0)/100).toFixed(2)}/hr</div>}
              </div>
              <FR label="Tax File Number" field="tax_file_number" data={editData} set={setEditData} edit={editMode} masked />
            </div>
            <div style={card}><h3 style={{ margin:"0 0 16px",fontSize:14,color:"#3D3248" }}>Superannuation</h3><SuperFundSelector editData={editData} setEditData={setEditData} editMode={editMode} /></div>
            <div style={card}>
              <h3 style={{ margin:"0 0 16px",fontSize:14,color:"#3D3248" }}>Bank Account</h3>
              <FR label="Account Name" field="bank_account_name" data={editData} set={setEditData} edit={editMode} />
              <FR label="BSB" field="bank_bsb" data={editData} set={setEditData} edit={editMode} />
              <FR label="Account Number" field="bank_account" data={editData} set={setEditData} edit={editMode} masked />
            </div>
            {ytd&&(
              <div style={card}>
                <h3 style={{ margin:"0 0 16px",fontSize:14,color:"#3D3248" }}>YTD Summary</h3>
                {[["YTD Gross",`$${((ytd.ytdTotal||0)/100).toFixed(2)}`],[`Super (${ytd.superRate}%)`,`$${((ytd.ytdSuper||0)/100).toFixed(2)}`],["Shifts",ytd.monthlyBreakdown?.reduce((s,r)=>s+r.shifts,0)||0]].map(([l,v])=>(
                  <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F0EBF8",fontSize:13 }}><span style={{ color:"#555" }}>{l}</span><span style={{ fontWeight:700,color:"#3D3248" }}>{v}</span></div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab==="availability"&&<AvailabilityTab educator={edu} onSaved={()=>loadDetail(selected)} />}
        {tab==="certifications"&&<CertificationsTab edu={edu} editData={editData} setEditData={setEditData} editMode={editMode} />}
        {tab==="documents"&&<DocumentsTab educator={edu} onSaved={()=>loadDetail(selected)} />}
        {tab==="leave"&&<LeaveTab educator={edu} onSaved={()=>loadDetail(selected)} />}

        {tab==="termination"&&<TerminationTab educator={edu} onSaved={()=>loadDetail(selected)} />}

        {tab==="pay"&&(
          <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
            <div style={card}>
              <h3 style={{ margin:"0 0 16px",fontSize:14,color:"#3D3248" }}>Monthly Earnings (Current FY)</h3>
              {ytd?.monthlyBreakdown?.length>0
                ?<ResponsiveContainer width="100%" height={220}><BarChart data={ytd.monthlyBreakdown.map(m=>({ month:m.month,earnings:(m.total_cents||0)/100,shifts:m.shifts }))}><XAxis dataKey="month" tick={{ fontSize:11 }} /><YAxis tick={{ fontSize:11 }} tickFormatter={v=>`$${v}`} /><Tooltip formatter={(v,n)=>n==="earnings"?`$${v.toFixed(2)}`:v} /><Bar dataKey="earnings" fill={purple} radius={[4,4,0,0]} name="Earnings ($)" /></BarChart></ResponsiveContainer>
                :<div style={{ textAlign:"center",color:"#8A7F96",padding:40 }}>No roster data for current FY</div>}
            </div>
            {ytd&&<div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16 }}>
              {[["YTD Gross",`$${((ytd.ytdTotal||0)/100).toFixed(2)}`],[`Super (${ytd.superRate}%)`,`$${((ytd.ytdSuper||0)/100).toFixed(2)}`],["Shifts",ytd.monthlyBreakdown?.reduce((s,r)=>s+r.shifts,0)||0]].map(([l,v])=>(
                <div key={l} style={{ ...card,textAlign:"center" }}><div style={{ fontSize:11,color:"#8A7F96",marginBottom:8 }}>{l}</div><div style={{ fontSize:24,fontWeight:800,color:purple }}>{v}</div></div>
              ))}
            </div>}
          </div>
        )}
      </div>
    </div>
    {showTerminate && <TerminationModal educator={edu} onClose={()=>setShowTerminate(false)} onSaved={()=>{ setShowTerminate(false); loadDetail(selected); loadEducators(); }} />}
  </>
  );
}

// ─── Termination Reasons ───────────────────────────────────────────────────────
const TERM_REASONS = [
  "Resigned",
  "Terminated — Performance",
  "Terminated — Misconduct",
  "Terminated — Redundancy",
  "Terminated — End of Contract",
  "Retired",
  "Mutual Agreement",
  "Abandonment of Employment",
  "Medical / Incapacity",
  "Personal Reasons",
  "Relocation",
  "Career Change",
  "Parental / Family Reasons",
  "Other",
];

// ─── Termination Modal ─────────────────────────────────────────────────────────
function TerminationModal({ educator, onClose, onSaved }) {
  const [form, setForm] = useState({
    termination_date: new Date().toISOString().slice(0, 10),
    termination_reason: "Resigned",
    termination_notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!form.termination_date) { setErr("Termination date is required."); return; }
    setSaving(true); setErr("");
    try {
      const r = await API(`/api/educators/${educator.id}/terminate`, { method: "POST", body: JSON.stringify(form) });
      if (r.error) { setErr(r.error); }
      else { toast(`${educator.first_name} ${educator.last_name} terminated. Future shifts cancelled.`, "warning"); onSaved(); }
    } catch(e) { setErr("Save failed. Please try again."); }
    setSaving(false);
  };

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000 }}>
      <div style={{ background:"#fff",borderRadius:16,width:520,maxWidth:"95vw",overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,0.25)" }}>
        {/* Header */}
        <div style={{ background:"#B71C1C",padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div>
            <div style={{ fontWeight:800,fontSize:16,color:"#fff" }}>Terminate Educator</div>
            <div style={{ fontSize:13,color:"rgba(255,255,255,0.8)",marginTop:2 }}>{educator.first_name} {educator.last_name}</div>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:"#fff",fontSize:22,cursor:"pointer",opacity:0.8 }}>✕</button>
        </div>

        {/* Warning banner */}
        <div style={{ background:"#FEF2F2",padding:"12px 24px",borderBottom:"1px solid #FECACA",display:"flex",gap:10,alignItems:"flex-start" }}>
          <span style={{ fontSize:20,flexShrink:0 }}>⚠️</span>
          <div style={{ fontSize:12,color:"#991B1B",lineHeight:1.5 }}>
            This will set the educator's status to <strong>Inactive</strong> and automatically <strong>cancel all roster entries</strong> from the termination date onwards. This action can be undone using the Reinstate button.
          </div>
        </div>

        {/* Form */}
        <div style={{ flex: 1, minHeight: 0, width: '100%', padding:24,display:"flex",flexDirection:"column",gap:16 }}>
          <div>
            <label style={lbl}>Termination Date *</label>
            <DatePicker value={form.termination_date} onChange={v=>setForm({...form,termination_date:v})} />
          </div>

          <div>
            <label style={lbl}>Reason for Termination *</label>
            <select value={form.termination_reason} onChange={e=>setForm({...form,termination_reason:e.target.value})} style={{ ...inp }}>
              {TERM_REASONS.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div>
            <label style={lbl}>Notes / Additional Details</label>
            <textarea
              value={form.termination_notes}
              onChange={e=>setForm({...form,termination_notes:e.target.value})}
              placeholder="Enter any additional notes about the termination — performance issues, incident details, final pay notes, etc. These are confidential and only visible to admin users."
              rows={4}
              style={{ ...inp, height:"auto", resize:"vertical", lineHeight:1.6 }}
            />
          </div>

          {err && <div style={{ color:"#B71C1C",fontSize:12,padding:"10px 14px",background:"#FEF2F2",borderRadius:8,border:"1px solid #FECACA" }}>⚠ {err}</div>}

          <div style={{ display:"flex",gap:10,marginTop:4 }}>
            <button onClick={submit} disabled={saving}
              style={{ flex:1,padding:"12px 0",background:"#B71C1C",color:"#fff",border:"none",borderRadius:8,cursor:saving?"not-allowed":"pointer",fontWeight:700,fontSize:14,opacity:saving?0.7:1 }}>
              {saving ? "Processing…" : "Confirm Termination"}
            </button>
            <button onClick={onClose} style={{ flex:0.5,padding:"12px 0",background:"#F5F5F5",color:"#555",border:"1px solid #DDD",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:14 }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Termination Tab ───────────────────────────────────────────────────────────
function TerminationTab({ educator, onSaved }) {
  const [docs, setDocs] = useState([]);
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(educator.termination_notes || "");
  const [reason, setReason] = useState(educator.termination_reason || "");
  const [termDate, setTermDate] = useState(educator.termination_date || "");
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    API(`/api/educators/${educator.id}/termination-documents`)
      .then(d => Array.isArray(d) && setDocs(d))
      .catch(() => {});
  }, [educator.id]);

  const saveDetails = async () => {
    setSaving(true);
    try {
      const r = await API(`/api/educators/${educator.id}`, {
        method: "PUT",
        body: JSON.stringify({ termination_date: termDate, termination_reason: reason, termination_notes: notes }),
      });
      if (r.error) { toast(r.error, "error"); } else { toast("Termination details updated"); setEditing(false); onSaved(); }
    } catch(e) { toast("Save failed", "error"); }
    setSaving(false);
  };

  const uploadDoc = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async ev => {
        const r = await API(`/api/educators/${educator.id}/termination-documents`, {
          method: "POST",
          body: JSON.stringify({ label: file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "), file_name: file.name, mime_type: file.type, data_url: ev.target.result }),
        });
        if (r.error) { toast(r.error, "error"); }
        else {
          const updated = await API(`/api/educators/${educator.id}/termination-documents`);
          if (Array.isArray(updated)) setDocs(updated);
          toast("Document uploaded");
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch(e) { toast("Upload failed", "error"); setUploading(false); }
  };

  const delDoc = async id => {
    if (!(await window.showConfirm("Delete this document?"))) return;
    try {
      await API(`/api/educators/${educator.id}/termination-documents/${id}`, { method: "DELETE" });
      setDocs(d => d.filter(x => x.id !== id)); toast("Deleted");
    } catch(e) { toast("Delete failed", "error"); }
  };

  const [viewingDoc, setViewingDoc] = useState(null);

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
      {/* Status banner */}
      <div style={{ background:"#FFEBEE",border:"2px solid #FFCDD2",borderRadius:12,padding:"16px 20px",display:"flex",gap:14,alignItems:"flex-start" }}>
        <span style={{ fontSize:28,flexShrink:0 }}>⛔</span>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:800,fontSize:15,color:"#B71C1C",marginBottom:4 }}>Employment Terminated</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginTop:8 }}>
            {[
              ["Termination Date", fmtDate(educator.termination_date)],
              ["Reason", educator.termination_reason || "—"],
              ["Status", "Inactive"],
            ].map(([l,v]) => (
              <div key={l} style={{ background:"rgba(255,255,255,0.6)",padding:"8px 12px",borderRadius:8 }}>
                <div style={{ fontSize:10,color:"#991B1B",fontWeight:700,textTransform:"uppercase",marginBottom:2 }}>{l}</div>
                <div style={{ fontSize:13,fontWeight:700,color:"#B71C1C" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Termination details */}
      <div style={card}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
          <h3 style={{ margin:0,fontSize:14,color:"#3D3248" }}>Termination Details</h3>
          {!editing
            ? <button onClick={()=>setEditing(true)} style={btnS}>Edit</button>
            : <div style={{ display:"flex",gap:8 }}>
                <button onClick={saveDetails} disabled={saving} style={{ ...btnP,padding:"6px 16px",opacity:saving?0.7:1 }}>{saving?"Saving…":"Save"}</button>
                <button onClick={()=>setEditing(false)} style={{ ...btnS,background:"#F5F5F5",color:"#555" }}>Cancel</button>
              </div>}
        </div>

        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
          <div>
            <label style={lbl}>Termination Date</label>
            {editing
              ? <DatePicker value={termDate} onChange={setTermDate} />
              : <div style={{ padding:"8px 0",fontSize:13,fontWeight:600 }}>{fmtDate(educator.termination_date)}</div>}
          </div>
          <div>
            <label style={lbl}>Reason</label>
            {editing
              ? <select value={reason} onChange={e=>setReason(e.target.value)} style={inp}>
                  {TERM_REASONS.map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              : <div style={{ padding:"8px 0",fontSize:13,fontWeight:600 }}>{educator.termination_reason || "—"}</div>}
          </div>
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>Notes & Details</label>
            {editing
              ? <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={5}
                  placeholder="Enter confidential termination notes — reasons, performance history, final pay details…"
                  style={{ ...inp,height:"auto",resize:"vertical",lineHeight:1.6 }} />
              : <div style={{ padding:"10px 14px",background:"#FDFBF9",borderRadius:8,fontSize:13,color:"#3D3248",lineHeight:1.7,minHeight:60,whiteSpace:"pre-wrap" }}>
                  {educator.termination_notes || <span style={{ color:"#A89DB5",fontStyle:"italic" }}>No notes recorded</span>}
                </div>}
          </div>
        </div>
      </div>

      {/* Documents */}
      <div style={card}>
        <h3 style={{ margin:"0 0 4px",fontSize:14,color:"#3D3248" }}>Termination Documents</h3>
        <p style={{ margin:"0 0 16px",fontSize:12,color:"#8A7F96" }}>Upload letters of termination, warnings, performance reviews, separation agreements, etc.</p>

        {/* Drop zone */}
        <div
          onDragOver={e=>{ e.preventDefault(); setDragging(true); }}
          onDragLeave={()=>setDragging(false)}
          onDrop={e=>{ e.preventDefault(); setDragging(false); const f=Array.from(e.dataTransfer.files); if(f.length) f.forEach(uploadDoc); }}
          onClick={()=>fileRef.current?.click()}
          style={{ border:`2px dashed ${dragging?"#B71C1C":"#FFCDD2"}`,borderRadius:10,padding:"20px",textAlign:"center",cursor:"pointer",background:dragging?"#FEF2F2":"#FFFAFA",marginBottom:16,transition:"all 0.2s" }}>
          <div style={{ fontSize:22,marginBottom:4 }}>{uploading?"⏳":"📎"}</div>
          <div style={{ fontSize:13,fontWeight:600,color:"#991B1B" }}>{uploading?"Uploading…":"Drop files here or click to browse"}</div>
          <div style={{ fontSize:11,color:"#B0AAB9",marginTop:4 }}>PDF, DOC, JPG, PNG — multiple files accepted</div>
          <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ display:"none" }} onChange={e=>{ Array.from(e.target.files).forEach(uploadDoc); e.target.value=""; }} />
        </div>

        {/* Document list */}
        {docs.length === 0
          ? <div style={{ textAlign:"center",color:"#B0AAB9",padding:"20px 0",fontSize:13 }}>No documents uploaded yet</div>
          : (
            <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
              <thead>
                <tr style={{ background:"#FEF2F2" }}>
                  {["Document","File","Uploaded","Actions"].map(h=>(
                    <th key={h} style={{ padding:"8px 12px",textAlign:h==="Actions"?"center":"left",color:"#B71C1C",fontWeight:700,fontSize:11,textTransform:"uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map(doc => {
                  const isImg = doc.data_url && doc.data_url.startsWith("data:image/");
                  return (
                    <tr key={doc.id} style={{ borderBottom:"1px solid #FEE2E2" }}>
                      <td style={{ padding:"10px 12px" }}>
                        <span onClick={()=>setViewingDoc(doc)} style={{ fontWeight:600,color:"#3D3248",cursor:"pointer",textDecoration:"underline",textDecorationColor:"#FFCDD2" }}>
                          {doc.label} {doc.data_url?"📄":""}
                        </span>
                      </td>
                      <td style={{ padding:"10px 12px",color:"#8A7F96",fontSize:12 }}>{doc.file_name||"—"}</td>
                      <td style={{ padding:"10px 12px",color:"#8A7F96",fontSize:12 }}>{doc.created_at?fmtDate(doc.created_at.slice(0,10)):"—"}</td>
                      <td style={{ padding:"10px 12px",textAlign:"center" }}>
                        <button onClick={()=>delDoc(doc.id)} style={{ background:"none",border:"none",cursor:"pointer",color:"#E53935",fontSize:16 }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </div>

      {/* Impact summary */}
      <div style={{ ...card,background:"#FFFAFA",border:"1px solid #FFCDD2" }}>
        <h3 style={{ margin:"0 0 12px",fontSize:14,color:"#3D3248" }}>System Impact</h3>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,fontSize:13 }}>
          {[
            ["🗓 Rostering","All future shifts from termination date cancelled. Educator removed from active pool."],
            ["💰 Payroll","Educator excluded from pay runs after termination date. Final pay calculated to termination date."],
            ["📋 Compliance","Educator removed from ratio calculations. Certifications still on record for audit."],
            ["👥 Staff Portal","Access suspended. Account remains for record-keeping purposes."],
          ].map(([title, desc]) => (
            <div key={title} style={{ padding:"10px 14px",background:"#FEF2F2",borderRadius:8 }}>
              <div style={{ fontWeight:700,color:"#991B1B",marginBottom:4 }}>{title}</div>
              <div style={{ fontSize:12,color:"#555",lineHeight:1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Document viewer */}
      {viewingDoc && (
        <div onClick={()=>setViewingDoc(null)} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9998 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:"#fff",borderRadius:16,maxWidth:"90vw",maxHeight:"90vh",overflow:"hidden",display:"flex",flexDirection:"column",minWidth:400 }}>
            <div style={{ padding:"14px 20px",borderBottom:"1px solid #EDE8F4",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <div><div style={{ fontWeight:700,fontSize:14,color:"#3D3248" }}>{viewingDoc.label}</div><div style={{ fontSize:11,color:"#8A7F96" }}>{viewingDoc.file_name}</div></div>
              <button onClick={()=>setViewingDoc(null)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:22,color:"#8A7F96" }}>✕</button>
            </div>
            <div style={{ flex:1,overflowY:"auto",padding:20 }}>
              {viewingDoc.data_url
                ? viewingDoc.data_url.startsWith("data:image/")
                  ? <img src={viewingDoc.data_url} alt="" style={{ maxWidth:"100%",maxHeight:"70vh",objectFit:"contain",borderRadius:8 }} />
                  : <iframe src={viewingDoc.data_url} style={{ width:"100%",height:"70vh",border:"none",borderRadius:8 }} title={viewingDoc.label} />
                : <div style={{ textAlign:"center",padding:"40px 20px",color:"#8A7F96" }}>
                    <div style={{ fontSize:48,marginBottom:12 }}>📄</div>
                    <div style={{ fontSize:14,fontWeight:600,color:"#3D3248" }}>{viewingDoc.label}</div>
                    <div style={{ fontSize:12,marginTop:8 }}>{viewingDoc.file_name}</div>
                  </div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
