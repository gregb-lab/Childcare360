import { useState, useEffect, useCallback } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}), ...opts.headers },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};

const toast = (msg, type = "success") => { if (window.showToast) window.showToast(msg, type); };

const purple = "#8B6DAF";
const lightPurple = "#F0EBF8";
const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: "20px 24px" };

const CAT_COLORS = {
  immunisation:  ["#2E7D32", "#E8F5E9"],
  medical_plan:  ["#E65100", "#FFF3E0"],
  medication:    ["#B71C1C", "#FFEBEE"],
  qualification: ["#1565C0", "#E3F2FD"],
  certification: [purple, lightPurple],
  identity:      ["#546E7A", "#ECEFF1"],
  contract:      ["#6A1B9A", "#F3E5F5"],
  tax:           ["#F9A825", "#FFF8E1"],
  super:         ["#2E7D32", "#E8F5E9"],
  other:         ["#757575", "#F5F5F5"],
};

function Badge({ text, color, bg }) {
  return <span style={{ background: bg, color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{text}</span>;
}

function CatBadge({ cat }) {
  const [col, bg] = CAT_COLORS[cat] || ["#777", "#EEE"];
  return <Badge text={cat?.replace("_", " ")} color={col} bg={bg} />;
}

export default function DocumentsModule() {
  const initTab = typeof window !== 'undefined' && localStorage.getItem('c360_docs_tab');
  const [tab, setTab] = useState(initTab || "pending");
  useEffect(() => {
    const stored = localStorage.getItem('c360_docs_tab');
    if (stored) { setTab(stored); localStorage.removeItem('c360_docs_tab'); }
  }, []);
  if (initTab) localStorage.removeItem('c360_docs_tab');
  const [pending, setPending] = useState([]);
  const [childDocs, setChildDocs] = useState([]);
  const [educatorDocs, setEducatorDocs] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pd, cd, ed] = await Promise.all([
        API("/api/documents?status=pending_review").catch(() => []),
        API("/api/documents?scope=children").catch(() => []),
        API("/api/documents?scope=educators").catch(() => []),
      ]);
      if (Array.isArray(pd)) setPending(pd);
      if (Array.isArray(cd)) setChildDocs(cd);
      if (Array.isArray(ed)) setEducatorDocs(ed);
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const approveDoc = async (id) => {
    try { await API(`/api/documents/${id}/approve`, { method: "PUT" }); } catch(e) { alert("Action failed."); return; }
    load();
  };

  const denyDoc = async (id) => {
    try { await API(`/api/documents/${id}/deny`, { method: "PUT", body: JSON.stringify({ reason: "Denied by centre manager" }) }); } catch(e) { alert("Action failed."); return; }
    load();
  };

  const filteredChild = childDocs.filter(d =>
    !search || d.label?.toLowerCase().includes(search.toLowerCase()) ||
    d.child_name?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredEd = educatorDocs.filter(d =>
    !search || d.label?.toLowerCase().includes(search.toLowerCase()) ||
    d.educator_name?.toLowerCase().includes(search.toLowerCase())
  );

  const [expiring, setExpiring] = useState({ educator_docs: [], medical_plans: [] });
  useEffect(() => { API("/api/documents/expiring?days=60").then(d => { if (d && !d.error) setExpiring(d); }).catch(() => {}); }, []);
  const expiringCount = (expiring.educator_docs?.length || 0) + (expiring.medical_plans?.length || 0);

  const tabs = [
    { id: "pending", label: `Pending Review${pending.length > 0 ? ` (${pending.length})` : ""}` },
    { id: "children", label: "Children's Docs" },
    { id: "educators", label: "Educator Docs" },
    { id: "expiring", label: `Expiring${expiringCount > 0 ? ` (${expiringCount})` : ""}` },
  ];

  return (
    <div style={{ padding: "0 24px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, color: "#3D3248" }}>Documents</h2>
          <p style={{ margin: "4px 0 0", color: "#8A7F96", fontSize: 13 }}>
            {pending.length > 0
              ? <span style={{ color: "#E65100", fontWeight: 700 }}>⚠ {pending.length} document{pending.length > 1 ? "s" : ""} awaiting review</span>
              : "All documents reviewed"}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#F8F5F1", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
              background: tab === t.id ? "#fff" : "transparent", color: tab === t.id ? purple : "#8A7F96",
              boxShadow: tab === t.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* PENDING REVIEW */}
      {tab === "pending" && (
        <div>
          {loading && <div style={{ textAlign: "center", color: "#8A7F96", padding: 32 }}>Loading...</div>}
          {!loading && pending.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#8A7F96" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: "#5C4E6A" }}>No Documents Yet</div>
              <div style={{ fontSize: 13 }}>Upload and manage important documents here</div>
            </div>
          )}
          {pending.map(doc => (
            <PendingDocCard key={doc.id} doc={doc} onApprove={() => approveDoc(doc.id)} onDeny={() => denyDoc(doc.id)} onPreview={() => setPreviewDoc(doc)} />
          ))}
        </div>
      )}

      {/* CHILDREN DOCS */}
      {tab === "children" && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by child name or document..."
              style={{ width: "100%", maxWidth: 400, padding: "9px 14px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 13 }} />
          </div>
          {filteredChild.length === 0 ? (
            <div style={{ ...card, textAlign: "center", color: "#8A7F96", padding: 48 }}>
              {search ? "No documents match your search" : "No child documents on file"}
            </div>
          ) : (
            <div style={{ ...card }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: lightPurple }}>
                    {["Document", "Child", "Category", "Uploaded", "Expiry", "Actions"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: purple, fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredChild.map(doc => (
                    <DocRow key={doc.id} doc={doc} nameField="child_name" onPreview={() => setPreviewDoc(doc)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* EDUCATOR DOCS */}
      {tab === "educators" && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by educator name or document..."
              style={{ width: "100%", maxWidth: 400, padding: "9px 14px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 13 }} />
          </div>
          {filteredEd.length === 0 ? (
            <div style={{ ...card, textAlign: "center", color: "#8A7F96", padding: 48 }}>
              {search ? "No documents match your search" : "No educator documents on file"}
            </div>
          ) : (
            <div style={{ ...card }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: lightPurple }}>
                    {["Document", "Educator", "Category", "Uploaded", "Expiry", "Actions"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: purple, fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEd.map(doc => (
                    <DocRow key={doc.id} doc={doc} nameField="educator_name" onPreview={() => setPreviewDoc(doc)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Expiring Documents Tab */}
      {tab === "expiring" && (
        <div style={card}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>⏰ Expiring & Expired Documents</h3>
          <p style={{ margin: "0 0 16px", fontSize: 12, color: "#8A7F96" }}>All documents expiring within 60 days or already expired</p>
          {expiringCount === 0 ? (
            <div style={{ textAlign: "center", padding: 30, color: "#6BA38B", fontWeight: 600 }}>✅ No expiring documents</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #EDE8F4" }}>
                  {["Document", "Person", "Expiry Date", "Days Left", "Status"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8A7F96", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...(expiring.educator_docs || []), ...(expiring.medical_plans || [])].sort((a,b) => (a.expiry_date||"").localeCompare(b.expiry_date||"")).map((doc, i) => {
                  const daysLeft = doc.expiry_date ? Math.ceil((new Date(doc.expiry_date) - new Date()) / 86400000) : null;
                  const statusColor = daysLeft === null ? "#8A7F96" : daysLeft < 0 ? "#DC2626" : daysLeft < 30 ? "#D97706" : "#E65100";
                  const statusLabel = daysLeft === null ? "Unknown" : daysLeft < 0 ? "EXPIRED" : daysLeft < 7 ? "URGENT" : "Expiring";
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #F0EBE6" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>{doc.document_type || doc.label || "Document"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span>{doc.person_name}</span>
                        <span style={{ fontSize: 10, color: "#8A7F96", marginLeft: 6 }}>({doc.person_type})</span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>{doc.expiry_date || "—"}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 700, color: statusColor }}>
                        {daysLeft !== null ? (daysLeft < 0 ? `${Math.abs(daysLeft)} days ago` : `${daysLeft} days`) : "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700, color: "#fff", background: statusColor }}>{statusLabel}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setPreviewDoc(null); }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "80vw", maxWidth: 900, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #EDE8F4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#3D3248" }}>{previewDoc.label || previewDoc.file_name}</div>
                <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 2 }}>{previewDoc.file_name}</div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {previewDoc.storage_path && (
                  <a href={`/api/documents/${previewDoc.id}/download`} target="_blank" rel="noreferrer"
                    style={{ padding: "7px 14px", borderRadius: 8, background: lightPurple, color: purple, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
                    ↓ Download
                  </a>
                )}
                <button onClick={() => setPreviewDoc(null)}
                  style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#EEE", color: "#555", cursor: "pointer", fontSize: 13 }}>
                  Close ✕
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
              {previewDoc.mime_type?.startsWith("image/") ? (
                <img src={`/api/documents/${previewDoc.id}/download`} alt="" style={{ maxWidth: "100%", borderRadius: 8 }} />
              ) : previewDoc.mime_type === "application/pdf" ? (
                <iframe src={`/api/documents/${previewDoc.id}/download`} title="Document" style={{ width: "100%", height: "60vh", border: "none", borderRadius: 8 }} />
              ) : (
                <div style={{ textAlign: "center", color: "#8A7F96", padding: 48 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{previewDoc.file_name}</div>
                  <div style={{ fontSize: 13, marginTop: 6 }}>Preview not available for this file type</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PendingDocCard({ doc, onApprove, onDeny, onPreview }) {
  return (
    <div style={{ ...card, marginBottom: 14, borderLeft: "4px solid #E65100" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 20 }}>📎</span>
            <div>
              <div style={{ fontWeight: 700, color: "#3D3248" }}>{doc.label || doc.file_name}</div>
              <div style={{ fontSize: 12, color: "#8A7F96" }}>{doc.file_name}</div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {doc.child_name && (
              <span style={{ fontSize: 12, color: "#555" }}>👶 {doc.child_name}</span>
            )}
            {doc.sender_email && (
              <span style={{ fontSize: 12, color: "#555" }}>✉ From: {doc.sender_email}</span>
            )}
            {doc.category && <CatBadge cat={doc.category} />}
            <Badge text="Pending Review" color="#E65100" bg="#FFF3E0" />
          </div>
          {doc.proposed_update && (
            <div style={{ background: "#E8F5E9", border: "1px solid #A5D6A7", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#2E7D32" }}>
              ⚡ <strong>AI suggestion:</strong> {doc.proposed_update}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: 16 }}>
          <button onClick={onPreview}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #EDE8F4", background: "#FDFBF9", color: "#555", cursor: "pointer", fontSize: 12 }}>
            👁 Preview
          </button>
          <button onClick={onApprove}
            style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#2E7D32", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
            ✅ Accept
          </button>
          <button onClick={onDeny}
            style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#B71C1C", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
            ✕ Deny
          </button>
        </div>
      </div>
    </div>
  );
}

function DocRow({ doc, nameField, onPreview }) {
  const isExpiring = doc.expiry_date && (() => {
    const diff = (new Date(doc.expiry_date) - new Date()) / (1000 * 60 * 60 * 24);
    return diff > 0 && diff < 60;
  })();
  const isExpired = doc.expiry_date && new Date(doc.expiry_date) < new Date();

  return (
    <tr style={{ borderBottom: "1px solid #F0EBF8" }}>
      <td style={{ padding: "10px 12px" }}>
        <div style={{ fontWeight: 600 }}>{doc.label || doc.file_name}</div>
        <div style={{ fontSize: 11, color: "#B0AAB9" }}>{doc.file_name}</div>
      </td>
      <td style={{ padding: "10px 12px", color: "#555" }}>{doc[nameField] || "—"}</td>
      <td style={{ padding: "10px 12px" }}><CatBadge cat={doc.category} /></td>
      <td style={{ padding: "10px 12px", color: "#8A7F96" }}>
        {doc.created_at ? new Date(doc.created_at).toLocaleDateString(undefined) : "—"}
      </td>
      <td style={{ padding: "10px 12px" }}>
        {doc.expiry_date ? (
          <span style={{ color: isExpired ? "#B71C1C" : isExpiring ? "#E65100" : "#2E7D32", fontWeight: isExpired || isExpiring ? 700 : 400 }}>
            {isExpired ? "⚠ " : isExpiring ? "⚡ " : ""}{doc.expiry_date}
          </span>
        ) : "—"}
      </td>
      <td style={{ padding: "10px 12px" }}>
        <button onClick={onPreview}
          style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #EDE8F4", background: "#FDFBF9", color: "#555", cursor: "pointer", fontSize: 12 }}>
          👁 View
        </button>
      </td>
    </tr>
  );
}
