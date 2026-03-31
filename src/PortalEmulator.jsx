/**
 * PortalEmulator.jsx — v2.6.5
 * Admin preview wrapper for Parent/Staff portals.
 */
import { useState, useEffect } from "react";

const API = (path) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(tid ? { "x-tenant-id": tid } : {}) }
  }).then(r => r.json());
};

const P = "#7C3AED", DARK = "#3D3248", MUTED = "#8A7F96";

export default function PortalEmulator({ mode = "parent", onClose, ParentModule, StaffModule }) {
  // ── All state declared first ─────────────────────────────────────────────
  const [children,    setChildren]   = useState([]);
  const [educators,   setEducators]  = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const isParent = mode === "parent";
  const list     = isParent ? children : educators;
  const label    = isParent ? "Parent Portal" : "Staff Portal";
  const icon     = isParent ? "👨‍👩‍👧" : "👩‍🏫";

  // ── Set localStorage key for selected entity ─────────────────────────────
  function setPreviewKey(idx, chList, edList) {
    const src = isParent ? chList : edList;
    const item = src[idx] || src[0];
    if (!item) return;
    if (!isParent) {
      localStorage.setItem("c360_preview_educator_id", item.id);
      localStorage.removeItem("c360_preview_child_id");
    } else {
      localStorage.setItem("c360_preview_child_id", item.id);
      localStorage.removeItem("c360_preview_educator_id");
    }
  }

  // ── Load lists then set localStorage BEFORE setLoading(false) ────────────
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      API("/api/children").catch(() => []),
      API("/api/educators").catch(() => []),
    ]).then(([cr, er]) => {
      if (cancelled) return;
      const chList = Array.isArray(cr) ? cr : (cr.children || cr.data || []);
      const edList = Array.isArray(er) ? er : (er.educators || er.data || []);
      setChildren(chList);
      setEducators(edList);
      // Set localStorage BEFORE loading gate opens so portal mounts with it already set
      setPreviewKey(0, chList, edList);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      localStorage.removeItem("c360_preview_educator_id");
      localStorage.removeItem("c360_preview_child_id");
    };
  }, [mode]); // eslint-disable-line

  // ── Sync localStorage when user picks a different person ─────────────────
  function handleSelect(idx) {
    setPreviewKey(idx, children, educators);
    setSelectedIdx(idx);
  }

  const selected      = list[selectedIdx] || list[0];
  const nameOf = item => item ? `${item.first_name} ${item.last_name}` : "";
  const PortalContent = isParent ? ParentModule : StaffModule;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", flexDirection: "column", background: "#F8F7FF" }}>

      {/* ── Admin banner ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 20px", background: DARK, color: "#fff", flexShrink: 0, boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(124,58,237,0.8)", padding: "5px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
          {icon} Previewing: {label}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            {isParent ? "As parent of:" : "As educator:"}
          </span>
          {loading ? (
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Loading…</span>
          ) : (
            <select
              value={selectedIdx}
              onChange={e => handleSelect(Number(e.target.value))}
              style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", minWidth: 180 }}
            >
              {list.map((item, i) => (
                <option key={item.id} value={i} style={{ color: DARK, background: "#fff" }}>
                  {nameOf(item)}
                  {isParent && item.room_id ? ` (${item.room_id.replace("room-","")})` : ""}
                  {!isParent && item.qualification ? ` — ${item.qualification}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Admin preview — changes are real</span>
        <button onClick={onClose} style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          ✕ Exit Preview
        </button>
      </div>

      {/* ── Info strip ── */}
      <div style={{ padding: "5px 20px", background: "#EDE4F0", fontSize: 12, color: P, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
        <span>🔍</span>
        <span>You are viewing the {label} as it appears to <strong>{isParent ? `${nameOf(selected)}'s family` : nameOf(selected)}</strong></span>
        <span style={{ marginLeft: "auto", color: MUTED }}>Selector is for reference only — portal loads its own data</span>
      </div>

      {/* ── Portal content — only rendered after localStorage is set ── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12, color: MUTED }}>
            <div style={{ width: 32, height: 32, border: "3px solid #EDE4F0", borderTop: "3px solid #7C3AED", borderRadius: "50%", animation: "pe-spin 0.8s linear infinite" }} />
            <div style={{ fontSize: 13 }}>Loading portal…</div>
            <style>{`@keyframes pe-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : !PortalContent ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12, color: MUTED }}>
            <div style={{ fontSize: 40 }}>🔧</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: DARK }}>Module not passed as prop</div>
          </div>
        ) : (
          <PortalContent key={`${mode}-${selectedIdx}`} />
        )}
      </div>
    </div>
  );
}
