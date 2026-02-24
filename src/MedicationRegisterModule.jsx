import { useState, useEffect, useCallback, useMemo } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch("/api/register" + path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}), ...opts.headers },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};

const purple = "#8B6DAF", lp = "#F0EBF8";
const inp = { width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #D9D0C7", fontSize: 12, background: "#FDFBF9", boxSizing: "border-box", fontFamily: "inherit" };
const sel = { ...inp };
const lbl = { display: "block", fontSize: 9, fontWeight: 700, color: "#8A7F96", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" };
const btnP = { background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const btnS = { background: "#F8F5F1", color: "#5C4E6A", border: "1px solid #D9D0C7", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

const CATEGORIES = [
  { id: "medication",    label: "Medication",       icon: "💊", color: "#C06B73" },
  { id: "epipen",        label: "EpiPen / ASCIA",   icon: "💉", color: "#B71C1C" },
  { id: "equipment",     label: "Medical Equipment", icon: "🩺", color: "#5B8DB5" },
  { id: "first_aid",     label: "First Aid",        icon: "🩹", color: "#2E8B57" },
  { id: "sunscreen",     label: "Sunscreen",        icon: "☀️", color: "#D4A26A" },
  { id: "other",         label: "Other",            icon: "📦", color: "#8A7F96" },
];

function daysUntilExpiry(expiry) {
  if (!expiry) return null;
  const diff = Math.ceil((new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24));
  return diff;
}

function ExpiryBadge({ expiry }) {
  if (!expiry) return null;
  const d = daysUntilExpiry(expiry);
  const color = d < 0 ? "#B71C1C" : d <= 7 ? "#E65100" : d <= 30 ? "#F57F17" : "#2E7D32";
  const bg = color + "14";
  const label = d < 0 ? `Expired ${Math.abs(d)}d ago` : d === 0 ? "Expires today" : d <= 7 ? `${d}d left` : new Date(expiry + "T12:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, color, background: bg, border: `1px solid ${color}30` }}>{label}</span>;
}

function ItemModal({ item, children, onClose, onSaved }) {
  const isEdit = !!item;
  const [f, setF] = useState(() => ({
    category: "medication", name: "", description: "", location: "",
    quantity: 1, expiry_date: "", batch_number: "", supplier: "",
    child_id: "", requires_prescription: false,
    storage_instructions: "", disposal_instructions: "", notes: "",
    ...(item || {}),
    requires_prescription: !!item?.requires_prescription,
  }));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!f.name) { alert("Name is required"); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await API(`/equipment/${item.id}`, { method: "PUT", body: f });
      } else {
        await API("/equipment", { method: "POST", body: f });
      }
      onSaved();
    } catch (e) {}
    setSaving(false);
  };

  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const F = ({ label, k, type, ph, opts }) => (
    <div>
      <label style={lbl}>{label}</label>
      {opts ? (
        <select style={sel} value={f[k] || ""} onChange={e => u(k, e.target.value)}>
          {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : type === "check" ? (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", marginTop: 4 }}>
          <input type="checkbox" checked={!!f[k]} onChange={e => u(k, e.target.checked)} />
          {ph || "Yes"}
        </label>
      ) : type === "area" ? (
        <textarea style={{ ...inp, height: 60, resize: "vertical" }} value={f[k] || ""} onChange={e => u(k, e.target.value)} placeholder={ph} />
      ) : (
        <input type={type || "text"} style={inp} value={f[k] || ""} onChange={e => u(k, e.target.value)} placeholder={ph} />
      )}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 600, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: "#3D3248" }}>{isEdit ? "Edit Item" : "Add Item to Register"}</h3>
          <button onClick={onClose} style={{ ...btnS, padding: "4px 10px" }}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div style={{ gridColumn: "span 2" }}>
            <label style={lbl}>Category</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => u("category", cat.id)}
                  style={{ padding: "5px 12px", borderRadius: 20, border: `2px solid ${f.category === cat.id ? cat.color : "#EDE8F4"}`, background: f.category === cat.id ? cat.color + "15" : "#fff", color: f.category === cat.id ? cat.color : "#555", cursor: "pointer", fontSize: 12, fontWeight: f.category === cat.id ? 700 : 500 }}>
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ gridColumn: "span 2" }}><F label="Item Name *" k="name" ph="e.g. EpiPen Jr 0.15mg, Panadol Children's Elixir" /></div>
          <F label="Location" k="location" ph="e.g. Admin First Aid Box, Room 2 shelf" />
          <F label="Quantity" k="quantity" type="number" />
          <F label="Expiry Date" k="expiry_date" type="date" />
          <F label="Batch / Lot Number" k="batch_number" ph="Optional" />

          <div>
            <label style={lbl}>Linked Child (if personal medication)</label>
            <select style={sel} value={f.child_id || ""} onChange={e => u("child_id", e.target.value)}>
              <option value="">— Centre stock (not child-specific) —</option>
              {(children || []).map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </div>
          <F label="Supplier / Pharmacy" k="supplier" ph="e.g. Chemist Warehouse" />

          <div style={{ gridColumn: "span 2" }}><F label="Description / Dose / Instructions" k="description" type="area" ph="e.g. 0.15mg adrenaline auto-injector. Use if anaphylaxis symptoms present." /></div>
          <div style={{ gridColumn: "span 2" }}><F label="Storage Instructions" k="storage_instructions" type="area" ph="e.g. Store below 25°C. Do not refrigerate." /></div>
          <div style={{ gridColumn: "span 2" }}><F label="Disposal Instructions" k="disposal_instructions" type="area" ph="e.g. Return to pharmacy for disposal." /></div>
          <F label="Requires Prescription?" k="requires_prescription" type="check" ph="Yes — prescription medication" />
          <div style={{ gridColumn: "span 2" }}><F label="Notes" k="notes" type="area" ph="Any additional notes..." /></div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnS}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : isEdit ? "Update Item" : "Add to Register"}</button>
        </div>
      </div>
    </div>
  );
}

export default function MedicationRegisterModule() {
  const [items, setItems] = useState([]);
  const [alerts, setAlerts] = useState({ expired: [], expiring7: [], expiring30: [] });
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | "add" | item object
  const [filter, setFilter] = useState({ category: "", search: "", status: "active" });
  const [view, setView] = useState("list"); // list | expiry | child

  const load = useCallback(async () => {
    try {
      const [items, alertData, ch] = await Promise.all([
        API("/equipment?status=" + (filter.status || "active")),
        API("/equipment-alerts"),
        fetch("/api/children", {
          headers: {
            "Content-Type": "application/json",
            ...(localStorage.getItem("c360_token") ? { Authorization: `Bearer ${localStorage.getItem("c360_token")}` } : {}),
            ...(localStorage.getItem("c360_tenant") ? { "x-tenant-id": localStorage.getItem("c360_tenant") } : {}),
          }
        }).then(r => r.json()),
      ]);
      if (Array.isArray(items)) setItems(items);
      if (alertData.expired) setAlerts(alertData);
      if (Array.isArray(ch)) setChildren(ch);
    } catch (e) {}
    setLoading(false);
  }, [filter.status]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filter.category && i.category !== filter.category) return false;
      if (filter.search) {
        const s = filter.search.toLowerCase();
        if (!`${i.name} ${i.description || ""} ${i.location || ""} ${i.child_name || ""}`.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [items, filter]);

  // Group by child for child view
  const byChild = useMemo(() => {
    const map = {};
    filtered.forEach(i => {
      const key = i.child_id ? `${i.child_id}||${i.child_name}` : "centre||Centre Stock";
      if (!map[key]) map[key] = { childId: i.child_id, childName: i.child_name || "Centre Stock", items: [] };
      map[key].items.push(i);
    });
    return Object.values(map).sort((a, b) => {
      if (!a.childId) return 1;
      if (!b.childId) return -1;
      return a.childName.localeCompare(b.childName);
    });
  }, [filtered]);

  const totalExpired = alerts.expired.length;
  const totalExpiring = alerts.expiring7.length;

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#8A7F96" }}>Loading register…</div>;

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Modal */}
      {modal && (
        <ItemModal
          item={modal === "add" ? null : modal}
          children={children}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, color: "#3D3248" }}>💊 Medication & Equipment Register</h2>
          <p style={{ margin: "4px 0 0", color: "#8A7F96", fontSize: 13 }}>
            {items.length} items · Medication, EpiPens, equipment and first aid
          </p>
        </div>
        <button onClick={() => setModal("add")} style={btnP}>+ Add Item</button>
      </div>

      {/* Alert banners */}
      {totalExpired > 0 && (
        <div style={{ padding: "12px 16px", borderRadius: 12, background: "#FFEBEE", border: "1px solid #FFCDD2", marginBottom: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 20 }}>🚨</span>
          <div>
            <div style={{ fontWeight: 700, color: "#B71C1C", fontSize: 13 }}>{totalExpired} EXPIRED item{totalExpired > 1 ? "s" : ""} — action required</div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
              {alerts.expired.slice(0, 3).map(i => i.name).join(", ")}{alerts.expired.length > 3 ? ` +${alerts.expired.length - 3} more` : ""}
            </div>
          </div>
        </div>
      )}
      {totalExpiring > 0 && (
        <div style={{ padding: "12px 16px", borderRadius: 12, background: "#FFF3E0", border: "1px solid #FFCC80", marginBottom: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, color: "#E65100", fontSize: 13 }}>{totalExpiring} item{totalExpiring > 1 ? "s" : ""} expiring within 7 days</div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
              {alerts.expiring7.slice(0, 3).map(i => `${i.name} (${new Date(i.expiry_date + "T12:00:00").toLocaleDateString("en-AU")})`).join(", ")}
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
        {CATEGORIES.map(cat => {
          const catItems = items.filter(i => i.category === cat.id);
          const expiredCount = catItems.filter(i => daysUntilExpiry(i.expiry_date) !== null && daysUntilExpiry(i.expiry_date) < 0).length;
          return (
            <div key={cat.id}
              onClick={() => setFilter(f => ({ ...f, category: f.category === cat.id ? "" : cat.id }))}
              style={{ background: filter.category === cat.id ? cat.color + "15" : "#fff", border: `2px solid ${filter.category === cat.id ? cat.color : "#EDE8F4"}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", transition: "all 0.15s" }}>
              <div style={{ fontSize: 22 }}>{cat.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 12, color: "#3D3248", marginTop: 4 }}>{cat.label}</div>
              <div style={{ fontSize: 11, color: "#8A7F96" }}>{catItems.length} item{catItems.length !== 1 ? "s" : ""}</div>
              {expiredCount > 0 && <div style={{ fontSize: 10, color: "#B71C1C", fontWeight: 700, marginTop: 2 }}>⚠ {expiredCount} expired</div>}
            </div>
          );
        })}
      </div>

      {/* Filters and view toggles */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
          placeholder="Search items, children, location…"
          style={{ ...inp, width: 220 }} />
        <select style={{ ...sel, width: 150 }} value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
          <option value="active">Active items</option>
          <option value="expired">Expired/archived</option>
          <option value="">All items</option>
        </select>
        <div style={{ marginLeft: "auto", display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #EDE8F4" }}>
          {[["list", "📋 List"], ["child", "👶 By Child"], ["expiry", "📅 Expiry"]].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: "6px 12px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: view === v ? purple : "#fff", color: view === v ? "#fff" : "#555" }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* List view */}
      {view === "list" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#B0AAB9" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>💊</div>
              No items found. Add medications, EpiPens and equipment to keep track of expiry dates.
            </div>
          )}
          {filtered.map(item => <ItemRow key={item.id} item={item} onEdit={() => setModal(item)} onRefresh={load} />)}
        </div>
      )}

      {/* By Child view */}
      {view === "child" && (
        <div>
          {byChild.map(group => (
            <div key={group.childId || "centre"} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "8px 12px", background: lp, borderRadius: 8 }}>
                <span style={{ fontSize: 18 }}>{group.childId ? "👶" : "🏥"}</span>
                <span style={{ fontWeight: 700, color: "#3D3248", fontSize: 14 }}>{group.childName}</span>
                <span style={{ fontSize: 11, color: "#8A7F96" }}>{group.items.length} item{group.items.length !== 1 ? "s" : ""}</span>
                {group.items.some(i => daysUntilExpiry(i.expiry_date) !== null && daysUntilExpiry(i.expiry_date) < 0) && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#B71C1C", background: "#FFEBEE", borderRadius: 20, padding: "2px 8px" }}>⚠ Expired item</span>
                )}
              </div>
              {group.items.map(item => <ItemRow key={item.id} item={item} onEdit={() => setModal(item)} onRefresh={load} compact />)}
            </div>
          ))}
        </div>
      )}

      {/* Expiry view — timeline */}
      {view === "expiry" && (
        <ExpiryTimeline items={filtered} onEdit={i => setModal(i)} />
      )}
    </div>
  );
}

function ItemRow({ item, onEdit, onRefresh, compact }) {
  const [deleting, setDeleting] = useState(false);
  const cat = CATEGORIES.find(c => c.id === item.category) || CATEGORIES[5];
  const days = daysUntilExpiry(item.expiry_date);
  const isExpired = days !== null && days < 0;
  const isUrgent = days !== null && days >= 0 && days <= 7;

  const archive = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/register/equipment/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json",
          ...(localStorage.getItem("c360_token") ? { Authorization: `Bearer ${localStorage.getItem("c360_token")}` } : {}),
          ...(localStorage.getItem("c360_tenant") ? { "x-tenant-id": localStorage.getItem("c360_tenant") } : {}),
        },
        body: JSON.stringify({ status: "archived" }),
      });
      onRefresh();
    } catch (e) {}
    setDeleting(false);
  };

  return (
    <div style={{
      background: isExpired ? "#FFF5F5" : "#fff",
      border: `1px solid ${isExpired ? "#FFCDD2" : isUrgent ? "#FFE0B2" : "#EDE8F4"}`,
      borderLeft: `4px solid ${isExpired ? "#B71C1C" : isUrgent ? "#E65100" : cat.color}`,
      borderRadius: 10, padding: compact ? "10px 14px" : "14px 18px",
      display: "flex", alignItems: "flex-start", gap: 14, transition: "all 0.15s",
    }}>
      <div style={{ fontSize: compact ? 20 : 26, flexShrink: 0 }}>{cat.icon}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, color: "#3D3248", fontSize: compact ? 13 : 14 }}>{item.name}</span>
          <ExpiryBadge expiry={item.expiry_date} />
          {item.requires_prescription ? <span style={{ fontSize: 9, fontWeight: 700, color: "#5B8DB5", background: "#EBF5FF", borderRadius: 20, padding: "2px 6px" }}>Rx</span> : null}
          {item.child_name && <span style={{ fontSize: 10, color: "#7E5BA3", background: lp, borderRadius: 20, padding: "2px 8px" }}>👶 {item.child_name}</span>}
        </div>

        {!compact && item.description && (
          <div style={{ fontSize: 11, color: "#555", marginTop: 4, lineHeight: 1.5 }}>{item.description}</div>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: compact ? 4 : 6, flexWrap: "wrap", fontSize: 11, color: "#8A7F96" }}>
          {item.location && <span>📍 {item.location}</span>}
          {item.quantity > 1 && <span>× {item.quantity}</span>}
          {item.batch_number && <span>Batch: {item.batch_number}</span>}
          {item.supplier && <span>📦 {item.supplier}</span>}
          {item.storage_instructions && !compact && <span>❄ {item.storage_instructions}</span>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={onEdit} style={btnS}>Edit</button>
        {isExpired && (
          <button onClick={archive} disabled={deleting} style={{ ...btnS, color: "#B71C1C", borderColor: "#FFCDD2", opacity: deleting ? 0.5 : 1 }}>
            {deleting ? "…" : "Archive"}
          </button>
        )}
      </div>
    </div>
  );
}

function ExpiryTimeline({ items, onEdit }) {
  // Group by month of expiry
  const withExpiry = items.filter(i => i.expiry_date).sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
  const noExpiry   = items.filter(i => !i.expiry_date);

  const byMonth = {};
  withExpiry.forEach(i => {
    const m = i.expiry_date.substring(0, 7);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(i);
  });

  return (
    <div>
      {Object.entries(byMonth).map(([month, monthItems]) => {
        const d = new Date(month + "-01T12:00:00");
        const label = d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
        const isPast = d < new Date();
        return (
          <div key={month} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: isPast ? "#B71C1C" : "#8B6DAF", flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: isPast ? "#B71C1C" : "#3D3248" }}>
                {isPast ? "⚠ " : ""}{label}
              </span>
              <span style={{ fontSize: 11, color: "#8A7F96" }}>{monthItems.length} item{monthItems.length !== 1 ? "s" : ""}</span>
              <div style={{ flex: 1, height: 1, background: "#EDE8F4" }} />
            </div>
            <div style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              {monthItems.map(item => <ItemRow key={item.id} item={item} onEdit={() => onEdit(item)} onRefresh={() => {}} compact />)}
            </div>
          </div>
        );
      })}
      {noExpiry.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#A89DB5", flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: "#8A7F96" }}>No Expiry Date Set</span>
            <div style={{ flex: 1, height: 1, background: "#EDE8F4" }} />
          </div>
          <div style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            {noExpiry.map(item => <ItemRow key={item.id} item={item} onEdit={() => onEdit(item)} onRefresh={() => {}} compact />)}
          </div>
        </div>
      )}
      {withExpiry.length === 0 && noExpiry.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#B0AAB9" }}>No items to display.</div>
      )}
    </div>
  );
}
