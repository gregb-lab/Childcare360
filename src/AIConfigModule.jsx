import { useState, useEffect } from "react";

const API = (p, o={}) => {
  const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
  return fetch(p,{headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})},
    method:o.method||"GET",...(o.body?{body:JSON.stringify(o.body)}:{})}).then(r=>r.json());
};

const P="#7C3AED",DARK="#3D3248",MU="#8A7F96",OK="#16A34A",WA="#D97706";
const card={background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"18px 22px"};
const bp={padding:"9px 18px",borderRadius:9,border:"none",background:P,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13};
const inp={padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:13,width:"100%",boxSizing:"border-box",fontFamily:"inherit"};
const lbl={fontSize:11,color:MU,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"};

const PROVIDERS = [
  { key: "anthropic", name: "Anthropic (Claude)", icon: "🤖", desc: "AI Writing, observations, learning stories", localStorageKey: "c360_anthropic_key" },
  { key: "elevenlabs", name: "ElevenLabs", icon: "🔊", desc: "Voice synthesis for AI Voice Agent", localStorageKey: "c360_elevenlabs_key" },
];

export default function AIConfigModule() {
  const [keys, setKeys] = useState({});
  const [saved, setSaved] = useState({});
  const [testing, setTesting] = useState(null);

  useEffect(() => {
    const initial = {};
    PROVIDERS.forEach(p => {
      initial[p.key] = localStorage.getItem(p.localStorageKey) || "";
    });
    setKeys(initial);
  }, []);

  const saveKey = (providerKey, localStorageKey) => {
    localStorage.setItem(localStorageKey, keys[providerKey] || "");
    setSaved(s => ({ ...s, [providerKey]: true }));
    window.showToast?.("API key saved", "success");
    setTimeout(() => setSaved(s => ({ ...s, [providerKey]: false })), 2000);
  };

  const testKey = async (providerKey) => {
    setTesting(providerKey);
    if (providerKey === "anthropic") {
      const r = await API("/api/ai-assistant/generate", {
        method: "POST",
        body: { session_type: "observation", observation_notes: "test", anthropic_key: keys[providerKey] }
      });
      if (r.source === "claude") window.showToast?.("Anthropic key works!", "success");
      else if (r.source === "template") window.showToast?.("Key not active — template response returned", "warning");
      else window.showToast?.("Test failed: " + (r.error || "unknown"), "error");
    } else {
      window.showToast?.("Key saved — test via Voice Agent module", "success");
    }
    setTesting(null);
  };

  return (
    <div style={{padding:"24px 28px",maxWidth:800}}>
      <div style={{marginBottom:24}}>
        <h2 style={{margin:0,fontSize:20,fontWeight:900,color:DARK}}>🔑 AI Providers</h2>
        <p style={{margin:"4px 0 0",fontSize:13,color:MU}}>Configure API keys for AI features across Childcare360</p>
      </div>

      {PROVIDERS.map(prov => (
        <div key={prov.key} style={{...card,marginBottom:16,borderLeft:`3px solid ${P}`}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
            <span style={{fontSize:28}}>{prov.icon}</span>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:DARK}}>{prov.name}</div>
              <div style={{fontSize:12,color:MU}}>{prov.desc}</div>
            </div>
            {keys[prov.key] && (
              <span style={{marginLeft:"auto",fontSize:11,fontWeight:700,color:OK,background:OK+"18",padding:"3px 10px",borderRadius:20}}>
                ✓ Key Set
              </span>
            )}
          </div>
          <div style={{marginBottom:10}}>
            <label style={lbl}>API Key</label>
            <input
              type="password"
              value={keys[prov.key] || ""}
              onChange={e => setKeys(k => ({ ...k, [prov.key]: e.target.value }))}
              placeholder={`Enter ${prov.name} API key...`}
              style={inp}
            />
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={() => saveKey(prov.key, prov.localStorageKey)}
              style={{...bp,fontSize:12,padding:"7px 16px",background:saved[prov.key]?OK:P}}>
              {saved[prov.key] ? "✓ Saved" : "Save"}
            </button>
            <button onClick={() => testKey(prov.key)} disabled={!keys[prov.key] || testing === prov.key}
              style={{...bp,fontSize:12,padding:"7px 16px",background:"#fff",color:P,border:`1px solid ${P}`}}>
              {testing === prov.key ? "Testing..." : "Test Connection"}
            </button>
          </div>
        </div>
      ))}

      <div style={{...card,background:"#F8F5FC",border:"none"}}>
        <div style={{fontWeight:700,fontSize:13,color:DARK,marginBottom:6}}>💡 About API Keys</div>
        <p style={{margin:0,fontSize:12,color:"#5C4E6A",lineHeight:1.7}}>
          API keys are stored in your browser's local storage and sent with each request.
          They are never stored on the server. Each educator can set their own keys.
          For centre-wide configuration, ask your administrator to set keys via the server environment variables.
        </p>
      </div>
    </div>
  );
}
