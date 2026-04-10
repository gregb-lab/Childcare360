/**
 * KioskModule.jsx — v2.13.0
 * Two modes:
 *   Admin view  — PIN management, today's attendance board
 *   Kiosk view  — Full-screen tablet sign-in/out via PIN pad
 */
import { useState, useEffect, useCallback, useRef } from "react";

const API = (p, o={}) => {
  const t=localStorage.getItem("c360_token"), tid=localStorage.getItem("c360_tenant");
  return fetch(p,{headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})},
    method:o.method||"GET",...(o.body?{body:JSON.stringify(o.body)}:{})}).then(r=>r.json());
};
// Public kiosk endpoint — no JWT, just tenant header
const KIOSK = (p, o={}) => {
  const tid=localStorage.getItem("c360_tenant");
  return fetch(`/api/kiosk${p}`,{headers:{"Content-Type":"application/json",...(tid?{"x-tenant-id":tid}:{})},
    method:o.method||"POST",...(o.body?{body:JSON.stringify(o.body)}:{})}).then(r=>r.json());
};

const P="#7C3AED",PL="#EDE4F0",DARK="#3D3248",MU="#8A7F96";
const OK="#16A34A",WA="#D97706",DA="#DC2626";
const card={background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"18px 22px"};
const bp={padding:"9px 18px",borderRadius:9,border:"none",background:P,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13};
const bs={padding:"9px 18px",borderRadius:9,border:`1px solid ${P}`,background:"#fff",color:P,fontWeight:600,cursor:"pointer",fontSize:13};
const inp={padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:13,width:"100%",boxSizing:"border-box",fontFamily:"inherit"};
const lbl={fontSize:11,color:MU,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"};

const fmtTime = t => {
  if (!t) return "—";
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return t;
  const d = new Date(t);
  return isNaN(d) ? t : d.toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit",hour12:true});
};

export default function KioskModule() {
  const [mode, setMode] = useState("admin"); // admin | kiosk

  if (mode === "kiosk") return <KioskScreen onExit={()=>setMode("admin")} />;

  return (
    <div style={{padding:"24px 28px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <span style={{fontSize:28}}>📲</span>
          <div>
            <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>Kiosk Sign-In</h1>
            <p style={{margin:"3px 0 0",fontSize:13,color:MU}}>Tablet sign-in/out · PIN management · Attendance board</p>
          </div>
        </div>
        <button onClick={()=>setMode("kiosk")}
          style={{...bp,fontSize:15,padding:"12px 28px",background:"linear-gradient(135deg,#7C3AED,#A78BFA)"}}>
          📲 Launch Kiosk Mode
        </button>
      </div>
      <AdminView />
    </div>
  );
}

// ─── ADMIN VIEW ───────────────────────────────────────────────────────────────
function AdminView() {
  const [tab, setTab] = useState("board");
  const [today, setToday] = useState(null);
  const [pins, setPins] = useState([]);
  const [children, setChildren] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [editPin, setEditPin] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [settings, setSettings] = useState({
    admin_pin: localStorage.getItem("kiosk_admin_pin") || "9999",
    auto_reset_seconds: parseInt(localStorage.getItem("kiosk_reset_secs") || "5"),
    show_allergies: localStorage.getItem("kiosk_show_allergies") !== "false",
    show_room: localStorage.getItem("kiosk_show_room") !== "false",
    require_photo: localStorage.getItem("kiosk_require_photo") === "true",
    greeting_text: localStorage.getItem("kiosk_greeting") || "Welcome to our centre!",
    centre_name: localStorage.getItem("kiosk_centre_name") || "",
  });

  const saveSettings = () => {
    localStorage.setItem("kiosk_admin_pin", settings.admin_pin);
    localStorage.setItem("kiosk_reset_secs", settings.auto_reset_seconds);
    localStorage.setItem("kiosk_show_allergies", settings.show_allergies);
    localStorage.setItem("kiosk_show_room", settings.show_room);
    localStorage.setItem("kiosk_require_photo", settings.require_photo);
    localStorage.setItem("kiosk_greeting", settings.greeting_text);
    localStorage.setItem("kiosk_centre_name", settings.centre_name);
    window.showToast && window.showToast("Kiosk settings saved ✓", "success");
  };

  const load = useCallback(() => {
    Promise.all([
      API("/api/kiosk/today"),
      API("/api/kiosk/pins"),
      API("/api/children/simple"),
    ]).then(([t, p, c]) => {
      setToday(t);
      setPins(p.pins || []);
      setChildren(Array.isArray(c) ? c : []);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const autoGenerate = async () => {
    setGenerating(true);
    const r = await API("/api/kiosk/pins/auto-generate", { method: "POST" });
    window.showToast && window.showToast(`Generated PINs for ${r.generated} children`, "success");
    load(); setGenerating(false);
  };

  const savePin = async () => {
    if (!editPin || !pinInput) return;
    const r = await API("/api/kiosk/pins", { method: "POST", body: { child_id: editPin, pin: pinInput } });
    if (r.error) { window.showToast && window.showToast(r.error === 'PIN already in use by another child' ? 'This PIN is already used by another child. Please choose a different PIN.' : r.error, "error"); return; }
    setEditPin(null); setPinInput(""); load();
  };

  const removePin = async (childId) => {
    await API(`/api/kiosk/pins/${childId}`, { method: "DELETE" });
    load();
  };

  const noPins = children.filter(c => !pins.find(p => p.child_id === c.id));

  return (
    <div>
      <div style={{display:"flex",gap:6,marginBottom:20,borderBottom:"1px solid #EDE8F4",paddingBottom:12}}>
        {[["board","📋 Today's Board"],["pins","🔑 PIN Management"],["settings","⚙️ Settings"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{padding:"8px 16px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,
              fontWeight:tab===id?700:500,background:tab===id?P:"transparent",color:tab===id?"#fff":MU}}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === "board" && today && (
        <div>
          {/* Summary cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
            {[
              ["✅ Signed In", today.summary?.signed_in, OK],
              ["🚪 Signed Out", today.summary?.signed_out, MU],
              ["📋 Total", today.summary?.total, P],
            ].map(([l,v,c])=>(
              <div key={l} style={{...card,textAlign:"center",borderTop:`3px solid ${c}`}}>
                <div style={{fontSize:28,fontWeight:900,color:c}}>{v||0}</div>
                <div style={{fontSize:12,color:MU,marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>

          {/* Signed in now */}
          <div style={{...card,marginBottom:14}}>
            <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:12}}>Currently In Centre</div>
            {today.sessions?.filter(s=>s.signed_in_at&&!s.signed_out_at).length === 0
              ? <div style={{color:MU,fontSize:13,textAlign:"center",padding:"20px 0"}}>No children currently signed in</div>
              : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
                  {today.sessions?.filter(s=>s.signed_in_at&&!s.signed_out_at).map(s=>(
                    <div key={s.id} style={{padding:"10px 14px",borderRadius:10,background:"#F0FDF4",border:"1px solid #A5D6A7"}}>
                      <div style={{fontWeight:700,fontSize:13,color:DARK}}>{s.first_name} {s.last_name}</div>
                      <div style={{fontSize:12,color:MU,marginTop:2}}>{s.room_name} · In: {fmtTime(s.signed_in_at)}</div>
                    </div>
                  ))}
                </div>
            }
          </div>

          {/* Not yet signed in */}
          {today.not_signed_in?.length > 0 && (
            <div style={card}>
              <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:12}}>
                Expected But Not Yet Signed In ({today.not_signed_in.length})
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8}}>
                {today.not_signed_in.map(c=>(
                  <div key={c.id} style={{padding:"8px 12px",borderRadius:10,background:"#FFFBEB",border:"1px solid #FDE68A"}}>
                    <div style={{fontWeight:600,fontSize:13,color:DARK}}>{c.first_name} {c.last_name}</div>
                    <div style={{fontSize:11,color:MU,marginTop:2}}>{c.room_name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "pins" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:13,color:MU}}>
              {pins.length} children have PINs · {noPins.length} without
            </div>
            <button style={bp} onClick={autoGenerate} disabled={generating}>
              {generating?"Generating…":"⚡ Auto-Generate All Missing PINs"}
            </button>
          </div>

          {editPin && (
            <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE",marginBottom:14}}>
              <div style={{fontWeight:700,fontSize:13,color:DARK,marginBottom:10}}>
                Set PIN for {children.find(c=>c.id===editPin)?.first_name} {children.find(c=>c.id===editPin)?.last_name}
              </div>
              <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
                <div style={{flex:1}}>
                  <label style={lbl}>4-6 Digit PIN</label>
                  <input value={pinInput} onChange={e=>setPinInput(e.target.value.replace(/\D/g,"").slice(0,6))}
                    style={inp} placeholder="e.g. 1234" maxLength={6}/>
                </div>
                <button style={bp} onClick={savePin}>Save</button>
                <button style={bs} onClick={()=>{setEditPin(null);setPinInput("");}}>Cancel</button>
              </div>
            </div>
          )}

          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{background:"#F8F5FC"}}>
              {["Child","Room","PIN",""].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",color:MU,fontWeight:700,fontSize:11}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {[...pins.map(p=>({...p,has_pin:true})),
                ...noPins.map(c=>({child_id:c.id,first_name:c.first_name,last_name:c.last_name,room_name:c.room_name,pin:null,has_pin:false}))
              ].map(row=>(
                <tr key={row.child_id} style={{borderBottom:"1px solid #F0EBF8"}}>
                  <td style={{padding:"8px 12px",fontWeight:600,color:DARK}}>{row.first_name} {row.last_name}</td>
                  <td style={{padding:"8px 12px",color:MU}}>{row.room_name||"—"}</td>
                  <td style={{padding:"8px 12px"}}>
                    {row.pin
                      ? <code style={{background:"#F0EBF8",padding:"2px 8px",borderRadius:6,fontWeight:700,color:P,letterSpacing:"0.15em"}}>{row.pin}</code>
                      : <span style={{color:MU,fontSize:12}}>No PIN</span>
                    }
                  </td>
                  <td style={{padding:"8px 12px"}}>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>{setEditPin(row.child_id);setPinInput(row.pin||"");}}
                        style={{padding:"4px 10px",borderRadius:7,border:`1px solid ${P}`,background:"transparent",color:P,cursor:"pointer",fontSize:11,fontWeight:600}}>
                        {row.pin?"Change":"Set PIN"}
                      </button>
                      {row.pin&&<button onClick={()=>removePin(row.child_id)}
                        style={{padding:"4px 10px",borderRadius:7,border:"1px solid #EDE8F4",background:"transparent",color:MU,cursor:"pointer",fontSize:11}}>
                        Remove
                      </button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "settings" && (
        <div style={{maxWidth:600}}>
          <div style={{...card,marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:16}}>🔒 Security</div>
            <div style={{marginBottom:14}}>
              <label style={lbl}>Admin PIN (to exit kiosk mode)</label>
              <div style={{display:"flex",gap:8}}>
                <input type="password" value={settings.admin_pin}
                  onChange={e=>setSettings(p=>({...p,admin_pin:e.target.value}))}
                  style={{...inp,width:160,fontFamily:"monospace",letterSpacing:"0.2em"}}
                  maxLength={8} placeholder="4-8 digits"/>
                <span style={{fontSize:12,color:MU,alignSelf:"center"}}>Currently: {settings.admin_pin.replace(/./g,"•")}</span>
              </div>
              <div style={{fontSize:11,color:MU,marginTop:4}}>Default is 9999. Change this for security.</div>
            </div>
          </div>

          <div style={{...card,marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:16}}>🎨 Display</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <label style={lbl}>Centre Name (on welcome screen)</label>
                <input value={settings.centre_name}
                  onChange={e=>setSettings(p=>({...p,centre_name:e.target.value}))}
                  style={inp} placeholder="e.g. Sunshine Learning Centre"/>
              </div>
              <div>
                <label style={lbl}>Greeting Text</label>
                <input value={settings.greeting_text}
                  onChange={e=>setSettings(p=>({...p,greeting_text:e.target.value}))}
                  style={inp} placeholder="Welcome message"/>
              </div>
              <div>
                <label style={lbl}>Auto-reset after sign-in (seconds)</label>
                <select value={settings.auto_reset_seconds}
                  onChange={e=>setSettings(p=>({...p,auto_reset_seconds:parseInt(e.target.value)}))}
                  style={inp}>
                  {[3,5,8,10,15].map(n=><option key={n} value={n}>{n} seconds</option>)}
                </select>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:14}}>
              {[
                ["show_allergies","⚠️ Show allergy alerts on sign-in"],
                ["show_room","🏠 Show room name on sign-in"],
                ["require_photo","📸 Require photo confirmation (if available)"],
              ].map(([key,label])=>(
                <label key={key} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",
                  padding:"10px 14px",borderRadius:10,border:`1px solid ${settings[key]?P+"60":"#EDE8F4"}`,
                  background:settings[key]?PL:"#fff",fontSize:13}}>
                  <input type="checkbox" checked={!!settings[key]}
                    onChange={e=>setSettings(p=>({...p,[key]:e.target.checked}))}/>
                  <span style={{color:settings[key]?P:DARK,fontWeight:settings[key]?600:400}}>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{...card,marginBottom:16,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
            <div style={{fontWeight:700,fontSize:13,color:DARK,marginBottom:8}}>📋 Quick Setup Guide</div>
            <ol style={{fontSize:12,color:MU,margin:0,paddingLeft:16,lineHeight:2}}>
              <li>Set your Admin PIN (remember it — you need it to exit kiosk mode)</li>
              <li>Go to <strong>🔑 PIN Management</strong> and generate PINs for all children</li>
              <li>Share each child's PIN with their family</li>
              <li>Click <strong>📲 Launch Kiosk Mode</strong> to start — place tablet near the entrance</li>
            </ol>
          </div>

          <button onClick={saveSettings} style={{...bp,width:"100%",fontSize:14,padding:"12px"}}>
            💾 Save Kiosk Settings
          </button>
        </div>
      )}
    </div>
  );
}

// ─── KIOSK SCREEN (full-screen tablet mode) ───────────────────────────────────
function KioskScreen({ onExit }) {
  const [pin, setPin] = useState("");
  const [state, setState] = useState("idle"); // idle | found | success | error
  const [child, setChild] = useState(null);
  const [childStatus, setChildStatus] = useState(null);
  const [message, setMessage] = useState(null);
  const [exitCode, setExitCode] = useState("");
  const [showExit, setShowExit] = useState(false);
  const [pinError, setPinError] = useState("");
  const resetTimer = useRef(null);

  const resetToIdle = useCallback(() => {
    setPin(""); setState("idle"); setChild(null); setChildStatus(null); setMessage(null);
  }, []);

  // Auto-reset after 6 seconds of success/error
  useEffect(() => {
    if (state === "success" || state === "error") {
      resetTimer.current = setTimeout(resetToIdle, 5000);
    }
    return () => clearTimeout(resetTimer.current);
  }, [state, resetToIdle]);

  const handleDigit = (d) => {
    if (pin.length >= 6) return;
    const newPin = pin + d;
    setPin(newPin);
    if (newPin.length >= 4) lookupPin(newPin);
  };

  const lookupPin = async (p) => {
    try {
      const r = await KIOSK("/lookup", { body: { pin: p } });
      if (r.found) {
        setPinError("");
        setChild(r.child);
        setChildStatus(r.status);
        setState("found");
      } else {
        setPinError(r.error === 'PIN not found' ? 'PIN not found. Please try again.' : (r.error || 'PIN not found. Please try again.'));
        setPin("");
        setTimeout(() => setPinError(""), 3000);
      }
    } catch(e) {
      setPinError("Something went wrong. Please try again.");
      setPin("");
      setTimeout(() => setPinError(""), 3000);
    }
  };

  const handleAction = async (action) => {
    try {
      setState("loading");
      const endpoint = action === "in" ? "/signin" : "/signout";
      const r = await KIOSK(endpoint, { body: { pin } });
      if (r.ok) {
        setMessage({ type: "success", text: action === "in"
          ? `✓ Welcome, ${r.child_name}!\nSigned in at ${fmtTime(r.signed_in_at)}`
          : `👋 Goodbye, ${r.child_name}!\nSigned out at ${fmtTime(r.signed_out_at)}`
        });
        setState("success");
      } else {
        setMessage({ type: "error", text: r.error || "Something went wrong" });
        setState("error");
      }
    } catch(e) { console.error('API error:', e); }
  };

  const handleBackspace = () => {
    setPin(p => p.slice(0,-1));
    if (pin.length <= 4) { setState("idle"); setChild(null); }
  };

  const BUTTONS = [["1","2","3"],["4","5","6"],["7","8","9"],["C","0","⌫"]];
  const BG = state==="success"?"#F0FDF4":state==="error"?"#FEF2F2":"#F5F1F9";

  return (
    <div style={{position:"fixed",inset:0,background:BG,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",zIndex:9000,fontFamily:"system-ui,sans-serif",
      transition:"background 0.3s"}}>

      {/* Header */}
      <div style={{position:"absolute",top:0,left:0,right:0,padding:"16px 24px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#7C3AED,#A78BFA)",
            display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:18}}>⚙️</div>
          <div style={{fontWeight:700,fontSize:16,color:DARK}}>
            {localStorage.getItem("kiosk_centre_name") || "Childcare360"} — Sign In/Out
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:13,color:MU}}>{new Date().toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"})}</div>
          <button onClick={()=>setShowExit(true)}
            style={{padding:"6px 14px",borderRadius:8,background:"rgba(0,0,0,0.12)",border:"1px solid rgba(0,0,0,0.15)",
              color:DARK,cursor:"pointer",fontSize:12,fontWeight:600}}>
            ⚙️ Admin
          </button>
        </div>
      </div>

      {/* Main content */}
      {state === "success" || state === "error" ? (
        <div style={{textAlign:"center",padding:"40px",maxWidth:400}}>
          <div style={{fontSize:72,marginBottom:24}}>{message?.type==="success"?"✅":"❌"}</div>
          <div style={{fontSize:22,fontWeight:700,color:message?.type==="success"?OK:DA,whiteSpace:"pre-line",lineHeight:1.5}}>
            {message?.text}
          </div>
          <div style={{fontSize:14,color:MU,marginTop:24}}>Returning in a moment…</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:24,width:"100%",maxWidth:360,padding:"0 24px"}}>

          {/* Child preview */}
          {child ? (
            <div style={{textAlign:"center",padding:"20px",borderRadius:20,background:"#fff",
              boxShadow:"0 8px 32px rgba(124,58,237,0.15)",width:"100%"}}>
              <div style={{width:72,height:72,borderRadius:"50%",background:"linear-gradient(135deg,#EDE4F0,#C4B5FD)",
                margin:"0 auto 12px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32}}>
                {child.photo_url
                  ? <img src={child.photo_url} style={{width:"100%",height:"100%",borderRadius:"50%",objectFit:"cover"}} alt=""/>
                  : "👶"}
              </div>
              <div style={{fontWeight:800,fontSize:20,color:DARK}}>{child.first_name} {child.last_name}</div>
              <div style={{fontSize:13,color:MU,marginTop:4}}>{child.room_name}</div>
              {child.allergies&&<div style={{marginTop:8,fontSize:11,color:DA,fontWeight:700,
                background:"#FEF2F2",padding:"4px 10px",borderRadius:20,display:"inline-block"}}>
                ⚠️ {child.allergies}
              </div>}
              <div style={{display:"flex",gap:10,marginTop:16}}>
                {childStatus !== "signed_in" && (
                  <button onClick={()=>handleAction("in")}
                    style={{flex:1,padding:"14px",borderRadius:12,border:"none",background:OK,
                      color:"#fff",fontWeight:800,fontSize:16,cursor:"pointer"}}>
                    ✅ Sign In
                  </button>
                )}
                {childStatus === "signed_in" && (
                  <button onClick={()=>handleAction("out")}
                    style={{flex:1,padding:"14px",borderRadius:12,border:"none",background:"#0284C7",
                      color:"#fff",fontWeight:800,fontSize:16,cursor:"pointer"}}>
                    👋 Sign Out
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:48,marginBottom:12}}>👋</div>
              <div style={{fontSize:22,fontWeight:700,color:DARK}}>Enter your child's PIN</div>
              <div style={{fontSize:14,color:MU,marginTop:6}}>4–6 digit PIN to sign in or out</div>
            </div>
          )}

          {/* PIN display */}
          <div style={{display:"flex",gap:10,justifyContent:"center"}}>
            {[0,1,2,3,4,5].map(i=>(
              <div key={i} style={{width:14,height:14,borderRadius:"50%",
                background:pin.length>i?"#7C3AED":"#DDD6EE",transition:"background 0.15s",
                animation:pinError?"shake 0.4s ease":"none"}}/>
            ))}
          </div>
          {pinError && <div style={{color:"#DC2626",fontSize:13,fontWeight:600,textAlign:"center",marginTop:8}}>{pinError}</div>}
          <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`}</style>

          {/* Number pad */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,width:"100%"}}>
            {BUTTONS.flat().map(btn=>(
              <button key={btn} onClick={()=>{
                if(btn==="C"){resetToIdle();}
                else if(btn==="⌫"){handleBackspace();}
                else{handleDigit(btn);}
              }} style={{
                padding:"18px 10px",borderRadius:14,border:"1px solid #DDD6EE",
                background:btn==="C"?"#FEF2F2":btn==="⌫"?"#F5F1F9":"#fff",
                color:btn==="C"?DA:btn==="⌫"?MU:DARK,
                fontWeight:700,fontSize:22,cursor:"pointer",
                boxShadow:"0 2px 8px rgba(0,0,0,0.06)",
                transition:"transform 0.1s",
              }}>
                {btn}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Exit kiosk mode (hidden — tap corner 3x) */}
      <div style={{position:"absolute",bottom:16,right:16}}>
        {showExit ? (
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input value={exitCode} onChange={e=>setExitCode(e.target.value)}
              placeholder="Admin PIN" style={{...inp,width:120,fontSize:12}}/>
            <button onClick={()=>{const adminPin = localStorage.getItem("kiosk_admin_pin") || "9999"; if(exitCode===adminPin){onExit();}else{window.showToast&&window.showToast("Incorrect PIN","error");setShowExit(false);setExitCode("");}}}
              style={{...bp,fontSize:12,padding:"6px 14px"}}>Exit</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
