import { useState, useEffect, useRef } from "react";

const purple = "#8B6DAF", lp = "#F0EBF8";
const inp = { padding: "8px 12px", borderRadius: 8, border: "1px solid #D9D0C7", fontSize: 13, width: "100%", boxSizing: "border-box", background: "#fff", fontFamily: "inherit" };

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
        <div style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, background: "#fff", border: "1px solid #DDD6EE", borderRadius: 12, boxShadow: "0 8px 32px rgba(80,60,90,0.18)", width: 260, overflow: "hidden" }}>

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

export { DatePicker };
export default DatePicker;
