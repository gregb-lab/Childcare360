import { useState, useEffect, useRef } from 'react';

const API = async (path, opts = {}) => {
  const token = localStorage.getItem('c360_token');
  const tenantId = localStorage.getItem('c360_tenant');
  const res = await fetch(`/api/voice${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
};

const RAPI = async (path, opts = {}) => {
  const token = localStorage.getItem('c360_token');
  const tenantId = localStorage.getItem('c360_tenant');
  const res = await fetch(`/api/voice/retell${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
      ...(opts.headers || {})
    }
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = JSON.parse(text); msg = j.error || j.message || msg; } catch(e) {
      // HTML or non-JSON — show status and first 120 chars
      msg = `HTTP ${res.status}: ${text.replace(/<[^>]+>/g,'').trim().slice(0,120)}`;
    }
    throw new Error(msg);
  }
  try { return JSON.parse(text); }
  catch(e) { throw new Error(`Server returned non-JSON (${res.status}): ${text.slice(0,120)}`); }
};

const TTS_VOICES = [
  { value: 'alice', label: 'Joanna (Neural) — US Female ⭐ Recommended' },
  { value: 'Polly.Matthew-Neural', label: 'Matthew (Neural) — US Male' },
  { value: 'Polly.Amy-Neural', label: 'Amy (Neural) — British Female' },
  { value: 'Polly.Brian-Neural', label: 'Brian (Neural) — British Male' },
  { value: 'Polly.Olivia-Neural', label: 'Olivia (Neural) — Australian Female' },
  { value: 'Polly.Aria-Neural', label: 'Aria (Neural) — New Zealand Female' },
  { value: 'alice', label: 'Alice — Standard (no Neural)' },
  { value: 'man', label: 'Man — Standard' },
  { value: 'woman', label: 'Woman — Standard' },
];

const STATUSES = {
  'initiated':    { color: '#6B7280', bg: '#F3F4F6', label: 'Initiated' },
  'ringing':      { color: '#f59e0b', bg: '#FFFBEB', label: 'Ringing' },
  'in-progress':  { color: '#3b82f6', bg: '#EFF6FF', label: 'In Progress' },
  'completed':    { color: '#22c55e', bg: '#F0FDF4', label: 'Completed' },
  'failed':       { color: '#ef4444', bg: '#FEF2F2', label: 'Failed' },
  'busy':         { color: '#f59e0b', bg: '#FFFBEB', label: 'Busy' },
  'no-answer':    { color: '#9CA3AF', bg: '#F9FAFB', label: 'No Answer' },
  'canceled':     { color: '#9CA3AF', bg: '#F9FAFB', label: 'Cancelled' },
};

function Badge({ status }) {
  const s = STATUSES[status] || STATUSES['initiated'];
  return (
    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function durStr(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function timeStr(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── Settings Tab ──────────────────────────────────────────────────────────────
const EL_MODELS = [
  { id: 'eleven_flash_v2_5',      name: 'Flash v2.5 — fastest, lowest latency (recommended)' },
  { id: 'eleven_turbo_v2_5',      name: 'Turbo v2.5 — fast, high quality' },
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2 — best quality, slower' },
  { id: 'eleven_turbo_v2',        name: 'Turbo v2 — English only' },
  { id: 'eleven_monolingual_v1',  name: 'Monolingual v1 — legacy' },
];

const LANGUAGES = [
  { code: 'en-AU', label: '🇦🇺 English (Australian)' },
  { code: 'en-US', label: '🇺🇸 English (US)' },
  { code: 'en-GB', label: '🇬🇧 English (UK)' },
  { code: 'zh-CN', label: '🇨🇳 Chinese (Mandarin)' },
  { code: 'zh-TW', label: '🇹🇼 Chinese (Traditional)' },
  { code: 'ar-SA', label: '🇸🇦 Arabic' },
  { code: 'vi-VN', label: '🇻🇳 Vietnamese' },
  { code: 'ko-KR', label: '🇰🇷 Korean' },
  { code: 'hi-IN', label: '🇮🇳 Hindi' },
  { code: 'es-ES', label: '🇪🇸 Spanish' },
  { code: 'fr-FR', label: '🇫🇷 French' },
  { code: 'de-DE', label: '🇩🇪 German' },
  { code: 'it-IT', label: '🇮🇹 Italian' },
  { code: 'ja-JP', label: '🇯🇵 Japanese' },
  { code: 'pt-BR', label: '🇧🇷 Portuguese (Brazil)' },
  { code: 'id-ID', label: '🇮🇩 Indonesian' },
  { code: 'tl-PH', label: '🇵🇭 Filipino' },
];

function SettingsTab() {
  const purple = '#8B6DAF';

  const [form, setForm] = useState({
    twilio_account_sid: '', twilio_auth_token: '', twilio_phone_number: '',
    tts_voice: 'Polly.Olivia-Neural', voice_provider: 'twilio',
    ai_persona: 'You are a friendly, professional assistant for a childcare centre. You help parents and educators with enquiries. Always be warm, concise and reassuring.',
    inbound_greeting: 'Hello, thank you for calling. This is the AI assistant. How can I help you today?',
    outbound_greeting: "Hello, this is an automated call from your childcare centre.",
    active: true,
    elevenlabs_api_key: '', elevenlabs_voice_id: '21m00Tcm4TlvDq8ikWAM',
    elevenlabs_model: 'eleven_flash_v2_5', call_language: 'en-AU',
    retell_api_key: '', retell_agent_id: '', retell_phone_number_id: '',
  });
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [msg, setMsg]                   = useState(null);
  const [inboundUrl, setInboundUrl]     = useState('');
  const [retellLlmUrl, setRetellLlmUrl] = useState('');
  // ElevenLabs voices
  const [elVoices, setElVoices]               = useState([]);
  const [elVoicesLoading, setElVoicesLoading] = useState(false);
  const [elVoicesErr, setElVoicesErr]         = useState('');
  const [voiceFilter, setVoiceFilter]         = useState('');
  const [voiceCategoryFilter, setVoiceCategoryFilter] = useState('all');
  const [testingVoice, setTestingVoice]       = useState(false);
  const [testAudioUrl, setTestAudioUrl]       = useState(null);
  // Retell
  const [retellStatus, setRetellStatus]           = useState(null);
  const [retellLoading, setRetellLoading]         = useState(false);
  const [retellMsg, setRetellMsg]                 = useState(null);
  const [creatingAgent, setCreatingAgent]         = useState(false);
  const [retellPhoneNumbers, setRetellPhoneNumbers] = useState([]);
  const [linkingNumber, setLinkingNumber]         = useState(false);
  const [testingRetell, setTestingRetell]         = useState(false);
  const audioRef = useRef(null);

  const F = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    Promise.all([
      API('/settings').catch(() => ({})),
      API('/inbound-url').catch(() => ({})),
      RAPI('/llm-url').catch(() => ({})),
    ]).then(([s, u, r]) => {
      if (s) setForm(f => ({ ...f, ...s, active: !!s.active, voice_provider: s.voice_provider || 'twilio' }));
      if (u?.url) setInboundUrl(u.url);
      if (r?.url) setRetellLlmUrl(r.url);
      setLoading(false);
      if (s?.elevenlabs_configured) loadElVoices();
      if (s?.retell_configured) loadRetellStatus();
    });
  }, []);

  const loadElVoices = async () => {
    setElVoicesLoading(true); setElVoicesErr('');
    try { const r = await API('/elevenlabs/voices'); setElVoices(r.voices || []); }
    catch(e) { setElVoicesErr(e.message); }
    setElVoicesLoading(false);
  };

  const loadRetellStatus = async () => {
    setRetellLoading(true);
    try {
      const r = await RAPI('/status');
      setRetellStatus(r);
      if (r.phone_numbers?.length) setRetellPhoneNumbers(r.phone_numbers);
    } catch(e) { console.error('Retell status:', e); }
    setRetellLoading(false);
  };

  const testVoice = async () => {
    setTestingVoice(true); setTestAudioUrl(null);
    try {
      const r = await API('/elevenlabs/test', { method: 'POST', body: JSON.stringify({ voice_id: form.elevenlabs_voice_id }) });
      if (r.url) { setTestAudioUrl(r.url); setTimeout(() => audioRef.current?.play(), 200); }
    } catch(e) { setElVoicesErr('Test failed: ' + e.message); }
    setTestingVoice(false);
  };

  const createRetellAgent = async () => {
    setCreatingAgent(true); setRetellMsg(null);
    try {
      const r = await RAPI('/agent', { method: 'POST', body: JSON.stringify({
        voice_id: form.retell_voice_id,
        voice_model: form.elevenlabs_model,
        responsiveness: 1,
        interruption_sensitivity: 1,
      })});
      if (r.ok) {
        setRetellMsg({ type: 'success', text: `Agent ${r.agent?.agent_id ? 'updated' : 'created'} successfully!` });
        F('retell_agent_id', r.agent?.agent_id || form.retell_agent_id);
        loadRetellStatus();
      } else { setRetellMsg({ type: 'error', text: r.error }); }
    } catch(e) { setRetellMsg({ type: 'error', text: e.message }); }
    setCreatingAgent(false);
  };

  const linkRetellNumber = async (phoneNumberId) => {
    setLinkingNumber(true); setRetellMsg(null);
    try {
      const r = await RAPI('/link-number', { method: 'POST', body: JSON.stringify({ phone_number_id: phoneNumberId }) });
      if (r.ok) { setRetellMsg({ type: 'success', text: 'Phone number linked to agent!' }); F('retell_phone_number_id', phoneNumberId); loadRetellStatus(); }
      else setRetellMsg({ type: 'error', text: r.error });
    } catch(e) { setRetellMsg({ type: 'error', text: e.message }); }
    setLinkingNumber(false);
  };

  const testRetellCall = async () => {
    setTestingRetell(true); setRetellMsg(null);
    try {
      const r = await RAPI('/test-call', { method: 'POST', body: JSON.stringify({}) });
      if (r.ok) setRetellMsg({ type: 'success', text: `Test call initiated! Call ID: ${r.call_id}` });
      else setRetellMsg({ type: 'error', text: r.error });
    } catch(e) { setRetellMsg({ type: 'error', text: e.message }); }
    setTestingRetell(false);
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await API('/settings', { method: 'PUT', body: JSON.stringify(form) });
      if (r.error) setMsg({ type: 'error', text: 'Save failed: ' + r.error });
      else setMsg({ type: 'success', text: 'Settings saved!' });
    } catch(e) { setMsg({ type: 'error', text: e.message }); }
    setSaving(false);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: purple }}>Loading…</div>;

  const iStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', outline: 'none', background: '#fff' };
  const hasElKey = !!(form.elevenlabs_api_key && !form.elevenlabs_api_key.startsWith('••••'));
  const elConfigured = form.elevenlabs_configured || hasElKey;
  const hasRetellKey = !!(form.retell_api_key && !form.retell_api_key.startsWith('••••'));
  const retellConfigured = form.retell_configured || hasRetellKey;
  const provider = form.voice_provider || 'twilio';

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>

      {/* Active toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 12, marginBottom: 24,
        background: form.active ? '#F0FDF4' : '#FFF8F0', border: `1px solid ${form.active ? '#86EFAC' : '#FED7AA'}` }}>
        <span style={{ fontSize: 22 }}>{form.active ? '🟢' : '🔴'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: form.active ? '#15803d' : '#92400e', fontSize: 14 }}>
            Voice Agent is {form.active ? 'Active' : 'Inactive'}
          </div>
          <div style={{ fontSize: 12, color: form.active ? '#166534' : '#a16207' }}>
            {form.active ? `Using ${provider === 'retell' ? 'Retell AI' : 'Twilio + ElevenLabs'} · AI answers inbound calls and makes outbound calls.` : 'Enable below to activate.'}
          </div>
        </div>
        <div style={{ width: 44, height: 24, borderRadius: 12, background: form.active ? purple : '#D1D5DB',
          position: 'relative', cursor: 'pointer' }} onClick={() => F('active', !form.active)}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff',
            position: 'absolute', top: 2, left: form.active ? 22 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </div>
      </div>

      {/* ── PROVIDER SELECTOR ── */}
      <Section title="🔀 Voice Provider" hint="Choose your voice engine. Both can be configured — switch anytime to compare.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { id: 'twilio', icon: '📞', name: 'Twilio + ElevenLabs', desc: 'Our custom stack. Full control, ElevenLabs voices, streaming TTS. ~600ms latency.' },
            { id: 'retell', icon: '🚀', name: 'Retell AI', desc: 'Purpose-built voice AI platform. WebSocket audio, natural interruptions, ~300ms latency.' },
          ].map(p => (
            <div key={p.id} onClick={() => F('voice_provider', p.id)} style={{
              padding: '14px 16px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
              border: `2px solid ${provider === p.id ? purple : '#E5E7EB'}`,
              background: provider === p.id ? '#F3EFF8' : '#FAFAFA',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 20 }}>{p.icon}</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: provider === p.id ? purple : '#374151' }}>{p.name}</span>
                {provider === p.id && <span style={{ marginLeft: 'auto', fontSize: 11, background: purple, color: '#fff', borderRadius: 20, padding: '2px 8px', fontWeight: 700 }}>ACTIVE</span>}
              </div>
              <p style={{ fontSize: 12, color: '#6B7280', margin: 0, lineHeight: 1.4 }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── TWILIO + ELEVENLABS CONFIG ── */}
      {provider === 'twilio' && (<>

        <Section title="🎙️ ElevenLabs Voice" hint="Ultra-realistic streaming voices. Recommended for best quality.">
          <Field label="ElevenLabs API Key" hint="From elevenlabs.io → Profile → API Keys">
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="password" value={form.elevenlabs_api_key || ''} style={{ ...iStyle, flex: 1 }}
                onChange={e => { F('elevenlabs_api_key', e.target.value); setElVoices([]); }}
                placeholder="sk_xxxxxxxxxxxxxxxxxxxxxxxx" />
              <button onClick={loadElVoices} disabled={elVoicesLoading} style={{
                padding: '10px 16px', borderRadius: 8, background: purple, color: '#fff', border: 'none',
                cursor: elVoicesLoading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
                {elVoicesLoading ? 'Loading…' : '🔄 Load Voices'}
              </button>
            </div>
            {elVoicesErr && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>⚠ {elVoicesErr}</div>}
          </Field>

          {elVoices.length > 0 && (() => {
            const filtered = elVoices.filter(v => {
              const t = voiceFilter.toLowerCase();
              const matchText = !t || v.name.toLowerCase().includes(t) || (v.accent||'').toLowerCase().includes(t) || (v.language||'').toLowerCase().includes(t);
              const matchCat = voiceCategoryFilter === 'all' || v.category === voiceCategoryFilter;
              return matchText && matchCat;
            });
            const categories = ['all', ...new Set(elVoices.map(v => v.category).filter(Boolean))];
            return (
              <Field label="Voice Selection" hint={`${filtered.length} of ${elVoices.length} voices shown`}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input value={voiceFilter} onChange={e => setVoiceFilter(e.target.value)}
                    placeholder="🔍 Search by name, accent, language…" style={{ ...iStyle, flex: 1, fontSize: 12 }} />
                  <select value={voiceCategoryFilter} onChange={e => setVoiceCategoryFilter(e.target.value)}
                    style={{ ...iStyle, width: 130, fontSize: 12 }}>
                    {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All' : c === 'my_library' ? '⭐ My Library' : c === 'shared' ? '🌐 Shared' : c}</option>)}
                  </select>
                </div>
                <select value={form.elevenlabs_voice_id || ''} onChange={e => { F('elevenlabs_voice_id', e.target.value); setTestAudioUrl(null); }}
                  size={7} style={{ ...iStyle, height: 'auto', fontFamily: 'monospace', fontSize: 12, cursor: 'pointer' }}>
                  {filtered.map(v => (
                    <option key={v.voice_id} value={v.voice_id}>
                      {v.category === 'my_library' ? '⭐ ' : ''}{v.name}{v.gender ? ` · ${v.gender}` : ''}{v.accent ? ` · ${v.accent}` : ''}{v.language ? ` · ${v.language}` : ''}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <button onClick={testVoice} disabled={testingVoice} style={{
                    padding: '8px 16px', borderRadius: 8, background: '#F3EFF8', color: purple,
                    border: `1px solid ${purple}`, cursor: testingVoice ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12 }}>
                    {testingVoice ? '⏳ Generating…' : '▶ Preview Voice'}
                  </button>
                  {testAudioUrl && <span style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>✅ Playing…</span>}
                </div>
                {testAudioUrl && <audio ref={audioRef} src={testAudioUrl} style={{ display: 'none' }} />}
              </Field>
            );
          })()}

          <Field label="ElevenLabs Model" hint="Flash is fastest for phone calls. Use Multilingual v2 for non-English.">
            <select value={form.elevenlabs_model || 'eleven_flash_v2_5'} onChange={e => F('elevenlabs_model', e.target.value)} style={{ ...iStyle, cursor: 'pointer' }}>
              {EL_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>

          <Field label="Call Language" hint="Language for speech recognition. Use Multilingual v2 for non-English.">
            <select value={form.call_language || 'en-AU'} onChange={e => F('call_language', e.target.value)} style={{ ...iStyle, cursor: 'pointer' }}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </Field>
        </Section>

        <Section title="📞 Twilio Credentials" hint="Required for making and receiving calls — from console.twilio.com">
          <Field label="Account SID" hint="Starts with AC...">
            <input value={form.twilio_account_sid || ''} onChange={e => F('twilio_account_sid', e.target.value)} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style={iStyle} />
          </Field>
          <Field label="Auth Token" hint="Keep this secret">
            <input type="password" value={form.twilio_auth_token || ''} onChange={e => F('twilio_auth_token', e.target.value)} placeholder="Your Twilio Auth Token" style={iStyle} />
          </Field>
          <Field label="Twilio Phone Number" hint="In E.164 format e.g. +61291234567">
            <input value={form.twilio_phone_number || ''} onChange={e => F('twilio_phone_number', e.target.value)} placeholder="+61291234567" style={iStyle} />
          </Field>
        </Section>

        <Section title="🔈 Fallback Voice (Twilio)" hint="Used if ElevenLabs is unavailable">
          <Field label="Twilio Built-in Voice">
            <select value={form.tts_voice || 'Polly.Olivia-Neural'} onChange={e => F('tts_voice', e.target.value)} style={{ ...iStyle, cursor: 'pointer' }}>
              {TTS_VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </Field>
        </Section>

        {inboundUrl && (
          <Section title="🔗 Twilio Inbound Webhook URL" hint="Paste this into your Twilio phone number settings → A Call Comes In">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{ flex: 1, background: '#F3EFF8', padding: '10px 14px', borderRadius: 8, fontSize: 12, color: '#4B3B6B', wordBreak: 'break-all' }}>{inboundUrl}</code>
              <button onClick={() => navigator.clipboard.writeText(inboundUrl)} style={{ padding: '10px 14px', borderRadius: 8, background: purple, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>Copy</button>
            </div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>Twilio → Phone Numbers → Manage → Active Numbers → your number → "A Call Comes In" → Webhook → paste above → HTTP POST</div>
          </Section>
        )}
      </>)}

      {/* ── RETELL AI CONFIG ── */}
      {provider === 'retell' && (<>

        <Section title="🚀 Retell AI Setup" hint="Sign up at retell.ai — free tier available for testing">
          <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#0C4A6E' }}>
            <strong>How Retell works with Childcare360:</strong> Retell handles all audio (STT + TTS + turn-taking). Your conversation logic (sick calls, shift checks) runs on our server. Retell calls our Custom LLM endpoint each turn to get the next response.
          </div>

          <Field label="Retell API Key" hint="From dashboard.retellai.com → API Keys">
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="password" value={form.retell_api_key || ''} style={{ ...iStyle, flex: 1 }}
                onChange={e => { F('retell_api_key', e.target.value); setRetellStatus(null); }}
                placeholder="key_xxxxxxxxxxxxxxxxxxxxxxxx" />
              <button onClick={loadRetellStatus} disabled={retellLoading} style={{
                padding: '10px 16px', borderRadius: 8, background: '#0EA5E9', color: '#fff', border: 'none',
                cursor: retellLoading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
                {retellLoading ? 'Checking…' : '🔍 Check'}
              </button>
            </div>
          </Field>

          {retellStatus?.configured && (
            <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#15803d', marginBottom: 8 }}>
              ✅ Connected to Retell AI {retellStatus.agent ? `· Agent: ${retellStatus.agent.agent_name || retellStatus.agent.agent_id}` : '· No agent created yet'}
            </div>
          )}

          <Field label="Agent Name" hint="What shows in your Retell dashboard">
            <input value={form.retell_agent_name || ''} onChange={e => F('retell_agent_name', e.target.value)} placeholder="Childcare Centre AI Assistant" style={iStyle} />
          </Field>

          <Field label="Voice (Retell)" hint="Retell voice ID — find these in the Retell dashboard under Voices">
            <input value={form.retell_voice_id || ''} onChange={e => F('retell_voice_id', e.target.value)}
              placeholder="e.g. openai-Alloy or a custom ElevenLabs voice ID" style={iStyle} />
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
              Retell supports: OpenAI voices (openai-Alloy, openai-Nova, openai-Shimmer), ElevenLabs voices (paste your ElevenLabs voice ID), Deepgram, Cartesia. Find IDs at <a href="https://dashboard.retellai.com" target="_blank" rel="noreferrer" style={{ color: '#0EA5E9' }}>dashboard.retellai.com</a> → Voices.
            </div>
          </Field>

          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <button onClick={createRetellAgent} disabled={creatingAgent || !retellConfigured} style={{
              padding: '10px 20px', borderRadius: 8, background: creatingAgent ? '#93C5FD' : '#0EA5E9',
              color: '#fff', border: 'none', cursor: (creatingAgent || !retellConfigured) ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13 }}>
              {creatingAgent ? '⏳ Saving…' : form.retell_agent_id ? '🔄 Update Agent' : '✨ Create Agent'}
            </button>
            {form.retell_agent_id && (
              <button onClick={testRetellCall} disabled={testingRetell} style={{
                padding: '10px 20px', borderRadius: 8, background: testingRetell ? '#A7F3D0' : '#10B981',
                color: '#fff', border: 'none', cursor: testingRetell ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13 }}>
                {testingRetell ? '⏳ Calling…' : '📞 Test Call'}
              </button>
            )}
          </div>
          {retellMsg && (
            <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: retellMsg.type === 'success' ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${retellMsg.type === 'success' ? '#86EFAC' : '#FECACA'}`,
              color: retellMsg.type === 'success' ? '#15803d' : '#991b1b' }}>
              {retellMsg.type === 'success' ? '✅ ' : '❌ '}{retellMsg.text}
            </div>
          )}
        </Section>

        {/* Phone number linking */}
        {retellStatus?.phone_numbers?.length > 0 && (
          <Section title="📱 Link Phone Number" hint="Assign a Retell phone number to your agent for inbound calls">
            <Field label="Retell Phone Number">
              <select style={{ ...iStyle, cursor: 'pointer' }}
                value={form.retell_phone_number_id || ''}
                onChange={e => F('retell_phone_number_id', e.target.value)}>
                <option value="">Select a phone number…</option>
                {retellStatus.phone_numbers.map(n => (
                  <option key={n.phone_number_id || n.phone_number} value={n.phone_number_id || n.phone_number}>
                    {n.phone_number} {n.inbound_agent_id ? `(linked to ${n.inbound_agent_id === form.retell_agent_id ? 'this agent ✅' : 'another agent'})` : '(unlinked)'}
                  </option>
                ))}
              </select>
            </Field>
            <button onClick={() => linkRetellNumber(form.retell_phone_number_id)} disabled={!form.retell_phone_number_id || linkingNumber}
              style={{ padding: '10px 20px', borderRadius: 8, background: '#0EA5E9', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, marginTop: 8 }}>
              {linkingNumber ? '⏳ Linking…' : '🔗 Link to Agent'}
            </button>
          </Section>
        )}

        {/* Custom LLM URL */}
        {retellLlmUrl && (
          <Section title="🔗 Custom LLM Endpoint" hint="Already configured automatically when you create/update the agent — shown here for reference">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{ flex: 1, background: '#F0F9FF', padding: '10px 14px', borderRadius: 8, fontSize: 11, color: '#0C4A6E', wordBreak: 'break-all' }}>{retellLlmUrl}</code>
              <button onClick={() => navigator.clipboard.writeText(retellLlmUrl)} style={{ padding: '10px 14px', borderRadius: 8, background: '#0EA5E9', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>Copy</button>
            </div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>This is the URL Retell calls each turn to get the AI response. It is set automatically on your agent.</div>
          </Section>
        )}
      </>)}

      {/* ── SHARED: AGENT PERSONALITY ── */}
      <Section title="🤖 Agent Personality" hint="How the AI sounds and what it knows — applies to both providers">
        <Field label="AI Persona" hint="Instructions for personality and knowledge">
          <textarea value={form.ai_persona || ''} onChange={e => F('ai_persona', e.target.value)}
            rows={4} style={{ ...iStyle, resize: 'vertical', lineHeight: 1.6 }} />
        </Field>
        <Field label="Inbound Greeting" hint="What callers hear when they ring in">
          <textarea value={form.inbound_greeting || ''} onChange={e => F('inbound_greeting', e.target.value)}
            rows={2} style={{ ...iStyle, resize: 'vertical' }} />
        </Field>
        <Field label="Outbound Opening" hint="How the agent introduces itself on outbound calls">
          <textarea value={form.outbound_greeting || ''} onChange={e => F('outbound_greeting', e.target.value)}
            rows={2} style={{ ...iStyle, resize: 'vertical' }} />
        </Field>
      </Section>

      {msg && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 8,
          background: msg.type === 'success' ? '#F0FDF4' : '#FEF2F2',
          border: `1px solid ${msg.type === 'success' ? '#86EFAC' : '#FECACA'}`,
          fontSize: 13, fontWeight: 600 }}>
          {msg.type === 'success' ? '✅ ' : '❌ '}{msg.text}
        </div>
      )}

      <button onClick={save} disabled={saving} style={{
        padding: '12px 28px', borderRadius: 10, background: saving ? '#C4B5D9' : purple,
        color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700
      }}>{saving ? 'Saving…' : 'Save Settings'}</button>

      <DebugPanel />
    </div>
  );
}
// ── Debug Panel ───────────────────────────────────────────────────────────────
function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try { const d = await API('/debug'); setInfo(d); }
    catch(e) { setInfo({ error: e.message }); }
    setLoading(false);
  };

  const forceActive = async () => {
    try {
      const d = await API('/force-active', { method: 'POST', body: JSON.stringify({}) });
      alert(d.ok ? 'Active set to ON in database. Refresh debug to confirm.' : 'Error: ' + d.error);
      run();
    } catch(e) { alert('Error: ' + e.message); }
  };

  return (
    <div style={{marginTop:16,borderTop:'1px solid #EDE8F4',paddingTop:14}}>
      <button onClick={()=>{setOpen(o=>!o); if(!open) run();}} style={{background:'none',border:'1px solid #DDD6EE',borderRadius:8,padding:'6px 14px',cursor:'pointer',fontSize:12,color:'#8A7F96'}}>
        🔧 {open ? 'Hide' : 'Show'} Debug Info
      </button>
      {open && (
        <div style={{marginTop:10,background:'#1E1E2E',borderRadius:10,padding:16,fontFamily:'monospace',fontSize:11,color:'#CDD6F4',overflowX:'auto'}}>
          {loading && <div style={{color:'#89B4FA'}}>Loading...</div>}
          {info && Object.entries(info).map(([k,v]) => (
            <div key={k} style={{marginBottom:4}}>
              <span style={{color:'#89DCEB'}}>{k}:</span>{' '}
              <span style={{color: v===null||v===false||v===''||v==='BASE_EMPTY — this is the problem!' ? '#F38BA8' : '#A6E3A1'}}>
                {v===null ? 'null' : v===false ? 'false' : v===true ? 'true' : String(v)}
              </span>
            </div>
          ))}
          <button onClick={run} style={{marginTop:8,background:'#313244',border:'none',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:11,color:'#CDD6F4'}}>↻ Refresh</button>
          <button onClick={forceActive} style={{marginTop:8,marginLeft:8,background:'#2E7D32',border:'none',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:11,color:'#fff'}}>⚡ Force Active ON</button>
        </div>
      )}
    </div>
  );
}

// ── Test Call Tab ─────────────────────────────────────────────────────────────
function TestCallTab() {
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState(null);
  const [callId, setCallId] = useState(null);
  const [polling, setPolling] = useState(false);
  const [callData, setCallData] = useState(null);
  const pollRef = useRef(null);

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } setPolling(false); };

  const startPolling = (id) => {
    pollRef.current = setInterval(async () => {
      try {
        const d = await API(`/calls/${id}`);
        setCallData(d);
        if (['completed','failed','busy','no-answer','canceled'].includes(d.status)) stopPolling();
      } catch(e) { stopPolling(); }
    }, 2000);
    setPolling(true);
  };

  const makeCall = async () => {
    if (!phone.trim()) return;
    setStatus({ type: 'loading', text: 'Initiating call…' });
    setCallData(null);
    try {
      const d = await API('/test', { method: 'POST', body: JSON.stringify({ to_number: phone.trim() }) });
      setCallId(d.callId);
      setStatus({ type: 'success', text: d.message || 'Call initiated!' });
      startPolling(d.callId);
    } catch(e) {
      setStatus({ type: 'error', text: e.message });
    }
  };

  useEffect(() => () => stopPolling(), []);

  return (
    <div style={{ padding: 24, maxWidth: 600 }}>
      <div style={{ background: '#F8F5FC', borderRadius: 16, padding: 24, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, color: '#2d1f3d' }}>📞 Make a Test Call</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6B5E7A' }}>
          Calls your phone to verify Twilio is connected and the AI agent is working.
          The agent will introduce itself and you can have a short conversation.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={phone} onChange={e => setPhone(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && makeCall()}
            placeholder="+61412345678" style={{ ...iStyle, flex: 1 }} />
          <button onClick={makeCall} disabled={!phone.trim() || polling} style={{
            padding: '10px 22px', borderRadius: 10, background: polling ? '#C4B5D9' : '#8B6DAF',
            color: '#fff', border: 'none', cursor: polling ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap'
          }}>
            {polling ? '📞 Calling…' : '📞 Call Me'}
          </button>
        </div>

        {status && (
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: status.type === 'error' ? '#FEF2F2' : status.type === 'loading' ? '#EFF6FF' : '#F0FDF4',
            color: status.type === 'error' ? '#dc2626' : status.type === 'loading' ? '#1d4ed8' : '#15803d',
            fontWeight: 600 }}>
            {status.type === 'loading' ? '⏳ ' : status.type === 'error' ? '❌ ' : '✅ '}{status.text}
          </div>
        )}
      </div>

      {/* Live call status */}
      {callData && (
        <div style={{ border: '1px solid #E8E0F0', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', background: '#F8F5FC', borderBottom: '1px solid #E8E0F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#2d1f3d' }}>Live Call Status</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge status={callData.status} />
              {polling && <span style={{ fontSize: 11, color: '#8B6DAF', animation: 'pulse 1s infinite' }}>● Live</span>}
            </div>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                ['Direction', callData.direction],
                ['To', callData.to_number],
                ['Duration', durStr(callData.duration_seconds)],
                ['Started', timeStr(callData.started_at)]
              ].map(([k,v]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 2 }}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#2d1f3d' }}>{v || '—'}</div>
                </div>
              ))}
            </div>
            {callData.turns?.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#8B6DAF', marginBottom: 10 }}>CONVERSATION</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {callData.turns.map((t, i) => (
                    <div key={i} style={{
                      padding: '8px 12px', borderRadius: 10, fontSize: 13,
                      background: t.role === 'assistant' ? '#F0EBF8' : '#F3F4F6',
                      alignSelf: t.role === 'assistant' ? 'flex-start' : 'flex-end',
                      maxWidth: '85%', color: '#2d1f3d'
                    }}>
                      <span style={{ fontSize: 10, color: '#9CA3AF', display: 'block', marginBottom: 3 }}>
                        {t.role === 'assistant' ? '🤖 Agent' : '👤 Caller'}
                      </span>
                      {t.content}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, background: '#F8F5FC', borderRadius: 12, padding: 18, fontSize: 13 }}>
        <div style={{ fontWeight: 700, color: '#5C4E6A', marginBottom: 8 }}>💡 Troubleshooting</div>
        {[
          ['Call not ringing?', 'Check your Twilio phone number has credit and is in the correct format (+61xxxxxxxxx)'],
          ['Auth error?', 'Verify your Account SID and Auth Token in Settings tab'],
          ['Webhook error?', 'Make sure PUBLIC_URL env var is set to your Railway domain in Railway Variables'],
          ['No speech recognition?', 'Twilio Speech Recognition works best in quiet environments'],
        ].map(([q,a]) => (
          <div key={q} style={{ marginBottom: 8 }}>
            <span style={{ fontWeight: 600, color: '#4B3B6B' }}>{q} </span>
            <span style={{ color: '#6B5E7A' }}>{a}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Call History Tab ──────────────────────────────────────────────────────────
function HistoryTab() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    API('/calls').then(setCalls).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const viewDetail = async (call) => {
    setSelected(call.id);
    try { setDetail(await API(`/calls/${call.id}`)); } catch(e) {}
  };

  return (
    <div style={{ padding: 24 }}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#8B6DAF' }}>Loading…</div>
      ) : calls.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📞</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>No calls yet</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Use the Test Call tab to make your first call</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: 20 }}>
          <div>
            {calls.map(c => (
              <div key={c.id} onClick={() => viewDetail(c)} style={{
                display: 'flex', gap: 12, padding: '14px 16px', marginBottom: 8,
                border: `1px solid ${selected === c.id ? '#8B6DAF' : '#E8E0F0'}`,
                borderRadius: 12, cursor: 'pointer', background: selected === c.id ? '#FAF7FF' : '#fff',
                transition: 'all 0.15s'
              }}>
                <div style={{ fontSize: 24, flexShrink: 0 }}>
                  {c.direction === 'inbound' ? '📲' : '📞'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#2d1f3d' }}>
                      {c.direction === 'inbound' ? 'Inbound' : 'Outbound'} — {c.to_number || c.from_number}
                    </span>
                    <Badge status={c.status} />
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#9CA3AF' }}>
                    <span>{c.purpose}</span>
                    <span>{durStr(c.duration_seconds)}</span>
                    <span>{timeStr(c.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {detail && (
            <div style={{ border: '1px solid #E8E0F0', borderRadius: 16, overflow: 'hidden', position: 'sticky', top: 20, maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ padding: '14px 16px', background: '#F8F5FC', borderBottom: '1px solid #E8E0F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Call Detail</span>
                <button onClick={() => { setSelected(null); setDetail(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9CA3AF' }}>×</button>
              </div>
              <div style={{ padding: 16 }}>
                {detail.error_message && <div style={{padding:'10px 14px',borderRadius:8,background:'#FFEBEE',border:'1px solid #FFCDD2',color:'#B71C1C',fontSize:12,fontWeight:600,marginBottom:12}}>⚠️ Error: {detail.error_message}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {[
                    ['Status', <Badge status={detail.status} />],
                    ['Direction', detail.direction],
                    ['From', detail.from_number],
                    ['To', detail.to_number],
                    ['Duration', durStr(detail.duration_seconds)],
                    ['Purpose', detail.purpose],
                    ['Started', timeStr(detail.started_at)],
                    ['Ended', timeStr(detail.ended_at)],
                  ].map(([k,v]) => (
                    <div key={k}>
                      <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 2, textTransform: 'uppercase' }}>{k}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#2d1f3d' }}>{v || '—'}</div>
                    </div>
                  ))}
                </div>

                {detail.recording_url && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: '#8B6DAF', fontWeight: 700, marginBottom: 6 }}>RECORDING</div>
                    <audio controls style={{ width: '100%' }} src={detail.recording_url} />
                  </div>
                )}

                {detail.turns?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: '#8B6DAF', fontWeight: 700, marginBottom: 10 }}>TRANSCRIPT</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {detail.turns.map((t, i) => (
                        <div key={i} style={{
                          padding: '8px 12px', borderRadius: 10, fontSize: 12,
                          background: t.role === 'assistant' ? '#F0EBF8' : '#F3F4F6',
                          alignSelf: t.role === 'assistant' ? 'flex-start' : 'flex-end',
                          maxWidth: '90%', color: '#2d1f3d'
                        }}>
                          <span style={{ fontSize: 10, color: '#9CA3AF', display: 'block', marginBottom: 2 }}>
                            {t.role === 'assistant' ? '🤖 AI Agent' : '👤 Caller'}
                          </span>
                          {t.content}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────
function Section({ title, hint, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#2d1f3d' }}>{title}</div>
        {hint && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ background: '#FDFCFF', border: '1px solid #E8E0F0', borderRadius: 12, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5C4E6A', marginBottom: 6 }}>
        {label} {hint && <span style={{ fontWeight: 400, color: '#9CA3AF' }}>— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

const iStyle = {
  width: '100%', padding: '9px 13px', borderRadius: 8, border: '1px solid #E8E0F0',
  fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#2d1f3d',
  background: '#fff', fontFamily: 'inherit'
};

// ── Main Module ───────────────────────────────────────────────────────────────
export default function VoiceAgentModule() {
  const [tab, setTab] = useState('setup');

  const tabs = [
    { id: 'setup',   label: '⚙️ Settings' },
    { id: 'test',    label: '📞 Test Call' },
    { id: 'history', label: '📋 Call History' },
    { id: 'guide',   label: '📖 Setup Guide' },
  ];

  return (
    <div style={{ background: '#F8F5FC', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ background: 'linear-gradient(135deg, #1a0f2e 0%, #3d2460 100%)', padding: '24px 32px 0', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 36 }}>🤖</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>AI Voice Agent</h1>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.7, marginTop: 2 }}>Twilio + Claude AI — Inbound &amp; outbound calls</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '10px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              borderRadius: '10px 10px 0 0',
              background: tab === t.id ? '#F8F5FC' : 'transparent',
              color: tab === t.id ? '#8B6DAF' : 'rgba(255,255,255,0.7)'
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ background: '#fff', minHeight: 'calc(100vh - 116px)' }}>
        {tab === 'setup'   && <SettingsTab />}
        {tab === 'test'    && <TestCallTab />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'guide'   && <SetupGuide />}
      </div>
    </div>
  );
}

// ── Setup Guide ───────────────────────────────────────────────────────────────
function SetupGuide() {
  const [open, setOpen] = useState(1);
  const steps = [
    {
      n: 1, title: 'Create a Twilio Account',
      content: (
        <div>
          <p>Go to <strong>twilio.com</strong> and sign up for a free account. The free trial gives you $15 credit — enough for ~100 test calls.</p>
          <ol style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>Go to <strong>twilio.com/try-twilio</strong></li>
            <li>Sign up with your email</li>
            <li>Verify your phone number (they'll call you with a code)</li>
            <li>Choose <strong>"Use Twilio in a project"</strong> → <strong>"Voice calls"</strong></li>
          </ol>
          <Tip>Your free trial number is fine for testing. For production you'll need a paid account (~$1/month per number).</Tip>
        </div>
      )
    },
    {
      n: 2, title: 'Get an Australian Phone Number',
      content: (
        <div>
          <p>You need a real phone number for calls to come from and go to.</p>
          <ol style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>In Twilio Console → <strong>Phone Numbers → Manage → Buy a Number</strong></li>
            <li>Set Country to <strong>Australia</strong></li>
            <li>Filter by <strong>Voice</strong> capability</li>
            <li>Choose a number (e.g. +61 2 xxxx xxxx) → <strong>Buy</strong></li>
            <li>Cost is approx <strong>$1.25 AUD/month</strong></li>
          </ol>
          <Tip>During free trial, you can only call verified numbers. To call any number, upgrade to a paid account (add credit card).</Tip>
        </div>
      )
    },
    {
      n: 3, title: 'Set Up the Inbound Webhook',
      content: (
        <div>
          <p>This tells Twilio to send inbound calls to your Childcare360 AI agent.</p>
          <ol style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>In Twilio → <strong>Phone Numbers → Manage → Active Numbers</strong></li>
            <li>Click your number</li>
            <li>Scroll to <strong>"Voice &amp; Fax"</strong> section</li>
            <li>Set <strong>"A Call Comes In"</strong> to <strong>Webhook</strong></li>
            <li>Paste the URL from the <strong>Settings tab</strong> (the Inbound Call Webhook URL)</li>
            <li>Set method to <strong>HTTP POST</strong></li>
            <li>Click <strong>Save</strong></li>
          </ol>
          <Warn>Make sure your Railway app is deployed and PUBLIC_URL is set before doing this step.</Warn>
        </div>
      )
    },
    {
      n: 4, title: 'Add Credentials to Childcare360',
      content: (
        <div>
          <p>Copy your Twilio credentials into the Settings tab.</p>
          <ol style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>In Twilio Console → <strong>Account Info</strong> (bottom left of dashboard)</li>
            <li>Copy <strong>Account SID</strong> (starts with AC...)</li>
            <li>Copy <strong>Auth Token</strong> (click the eye icon to reveal)</li>
            <li>Copy your <strong>phone number</strong> in +61 format</li>
            <li>Paste all three into the <strong>Settings tab</strong> above</li>
            <li>Click <strong>Save Settings</strong></li>
          </ol>
        </div>
      )
    },
    {
      n: 5, title: 'Set PUBLIC_URL in Railway',
      content: (
        <div>
          <p>The voice agent needs to know its own URL so Twilio webhooks work correctly.</p>
          <ol style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>In Railway → your service → <strong>Variables</strong> tab</li>
            <li>Add variable: <code style={{ background: '#F3EFF8', padding: '2px 6px', borderRadius: 4 }}>PUBLIC_URL</code></li>
            <li>Value: your Railway URL e.g. <code style={{ background: '#F3EFF8', padding: '2px 6px', borderRadius: 4 }}>https://brave-playfulness.up.railway.app</code></li>
            <li>Click <strong>Add</strong> — Railway will redeploy</li>
          </ol>
          <Tip>Find your URL in Railway → your service → Settings → Domains. It looks like brave-playfulness.up.railway.app</Tip>
        </div>
      )
    },
    {
      n: 6, title: 'Make a Test Call',
      content: (
        <div>
          <p>Verify everything works end-to-end.</p>
          <ol style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>Go to the <strong>Test Call</strong> tab above</li>
            <li>Enter your own mobile number in <strong>+61xxxxxxxxx</strong> format</li>
            <li>Click <strong>Call Me</strong></li>
            <li>Your phone will ring — answer it</li>
            <li>You'll hear the AI agent greet you and you can speak to it</li>
            <li>Watch the live transcript appear in the app</li>
          </ol>
          <Tip>If the call fails, check the error message and troubleshooting tips on the Test Call tab.</Tip>
        </div>
      )
    },
    {
      n: 7, title: 'Enable &amp; Configure the Agent',
      content: (
        <div>
          <p>Once testing works, customise and activate the agent.</p>
          <ol style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>Go to <strong>Settings</strong> → customise the AI Persona to match your centre</li>
            <li>Update the <strong>inbound greeting</strong> with your centre's name</li>
            <li>Toggle <strong>Voice Agent Active</strong> to on</li>
            <li>Click <strong>Save</strong></li>
            <li>Call your Twilio number from any phone — the AI will answer!</li>
          </ol>
          <Tip>The agent automatically handles sick cover calls from the Rostering module — it calls relief educators and records their responses.</Tip>
        </div>
      )
    }
  ];

  return (
    <div style={{ padding: 24, maxWidth: 740 }}>
      <div style={{ background: '#F0EBF8', borderRadius: 12, padding: '14px 18px', marginBottom: 24, fontSize: 13, color: '#5C4E6A' }}>
        <strong>⏱️ Setup time: ~20 minutes.</strong> You need a Twilio account (free trial works) and your app deployed on Railway.
      </div>
      {steps.map(s => (
        <div key={s.n} style={{ marginBottom: 12, border: `1px solid ${open === s.n ? '#8B6DAF' : '#E8E0F0'}`, borderRadius: 14, overflow: 'hidden' }}>
          <button onClick={() => setOpen(open === s.n ? null : s.n)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 18px', background: open === s.n ? '#F8F5FC' : '#fff',
            border: 'none', cursor: 'pointer', textAlign: 'left'
          }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: open === s.n ? '#8B6DAF' : '#E8E0F0', color: open === s.n ? '#fff' : '#6B5E7A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
              {s.n}
            </div>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#2d1f3d', flex: 1 }}>{s.n}. {s.title}</span>
            <span style={{ fontSize: 16, color: '#9CA3AF' }}>{open === s.n ? '▲' : '▼'}</span>
          </button>
          {open === s.n && (
            <div style={{ padding: '4px 20px 20px 60px', fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
              {s.content}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Tip({ children }) {
  return <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#15803d', marginTop: 10 }}>💡 <strong>Tip:</strong> {children}</div>;
}
function Warn({ children }) {
  return <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e', marginTop: 10 }}>⚠️ <strong>Note:</strong> {children}</div>;
}
