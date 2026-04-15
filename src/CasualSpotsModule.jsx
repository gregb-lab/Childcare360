import { useState, useEffect, useCallback } from 'react';

const API = async (path, opts = {}) => {
  const token = localStorage.getItem('c360_token');
  const tenantId = localStorage.getItem('c360_tenant');
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(tenantId ? { 'x-tenant-id': tenantId } : {}), ...(opts.headers || {}) },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  return res.json();
};

const card = { background: '#fff', borderRadius: 14, border: '1px solid #E8E0D8', padding: 20, marginBottom: 16, boxShadow: '0 2px 12px rgba(80,60,90,0.04)' };
const purple = '#8B6DAF';
const btnP = { padding: '8px 16px', borderRadius: 8, border: 'none', background: purple, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' };
const btnS = { padding: '6px 14px', borderRadius: 8, border: '1px solid #DDD6EE', background: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600, color: '#5C4E6A' };
const lbl = { fontSize: 11, color: '#7A6E8A', fontWeight: 700, display: 'block', marginBottom: 4 };
const inp = { padding: '8px 12px', borderRadius: 8, border: '1px solid #DDD6EE', fontSize: 12, width: '100%', boxSizing: 'border-box' };

const statusColors = { open: '#2563EB', broadcasting: '#D97706', pending_confirm: '#7C3AED', filled: '#059669', expired: '#9CA3AF', cancelled: '#9CA3AF' };
const statusLabels = { open: 'Open', broadcasting: 'Broadcasting', pending_confirm: 'Awaiting Confirm', filled: 'Filled', expired: 'Expired', cancelled: 'Cancelled' };
const sourceLabels = { checkin_alert: 'Check-in alert', planned_leave: 'Planned leave', manual: 'Manual' };

export default function CasualSpotsModule() {
  const [tab, setTab] = useState('live');
  const [offers, setOffers] = useState([]);
  const [capacity, setCapacity] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [config, setConfig] = useState({});
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [responses, setResponses] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoom, setNewRoom] = useState('');
  const [newDate, setNewDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadOffers = useCallback(() => { API('/api/casual-spots/offers').then(d => setOffers(d.offers || [])).catch(() => {}); }, []);
  const loadCapacity = useCallback(() => { API('/api/casual-spots/capacity').then(d => setCapacity(d.rooms || [])).catch(() => {}); }, []);
  const loadAnalytics = useCallback(() => { API('/api/casual-spots/analytics?period=30').then(d => setAnalytics(d)).catch(() => {}); }, []);
  const loadConfig = useCallback(() => { API('/api/casual-spots/config').then(d => { if (d && !d.error) setConfig(d); }).catch(() => {}); }, []);

  useEffect(() => { loadOffers(); loadCapacity(); loadAnalytics(); loadConfig(); }, [loadOffers, loadCapacity, loadAnalytics, loadConfig]);

  const loadResponses = async (offerId) => {
    setSelectedOffer(offerId);
    const d = await API(`/api/casual-spots/offers/${offerId}/responses`);
    setResponses(d.responses || []);
  };

  const handleBroadcast = async (id) => {
    try {
      const d = await API(`/api/casual-spots/offers/${id}/broadcast`, { method: 'POST' });
      window.showToast && window.showToast(`Broadcast sent to ${d.broadcast_count || 0} families`, 'success');
      loadOffers();
    } catch (err) {
      console.error('handleBroadcast failed:', err);
      window.showToast && window.showToast(err.message || 'Broadcast failed', 'error');
    }
  };

  const handleSelectWinner = async (offerId, responseId) => {
    try {
      const d = await API(`/api/casual-spots/offers/${offerId}/select-winner`, { method: 'POST', body: { response_id: responseId } });
      if (d.ok) { window.showToast && window.showToast('Winner selected — SMS sent', 'success'); loadOffers(); loadResponses(offerId); }
      else { window.showToast && window.showToast(d.error || 'Failed', 'error'); }
    } catch (err) {
      console.error('handleSelectWinner failed:', err);
      window.showToast && window.showToast(err.message || 'Failed to select winner', 'error');
    }
  };

  const handleCreate = async () => {
    if (!newRoom || !newDate) return;
    try {
      const d = await API('/api/casual-spots/offers', { method: 'POST', body: { room_id: newRoom, date: newDate, source: 'manual' } });
      if (d.ok) { window.showToast && window.showToast('Spot offer created', 'success'); setShowCreate(false); loadOffers(); loadCapacity(); }
      else { window.showToast && window.showToast(d.error || 'Failed', 'error'); }
    } catch (err) {
      console.error('handleCreate failed:', err);
      window.showToast && window.showToast(err.message || 'Failed to create spot offer', 'error');
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    await API('/api/casual-spots/config', { method: 'PUT', body: config }).catch(e => { window.showToast?.(e.message||'Save failed','error'); setSaving(false); return; });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
    window.showToast && window.showToast('Settings saved', 'success');
    setSaving(false);
  };

  const tabs = [['live', 'Live Spots'], ['capacity', 'Room Capacity'], ['analytics', 'Analytics'], ['settings', 'Settings']];

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#3D3248' }}>Casual Spot Management</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#A89DB5' }}>Fill absent spots with waitlist families via SMS broadcast</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} style={btnP}>{showCreate ? 'Cancel' : '+ Create Spot Offer'}</button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ ...card, background: '#F9F7FF', border: '1px solid #DDD6EE' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>New Spot Offer</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
            <div><label style={lbl}>Room</label><select style={inp} value={newRoom} onChange={e => setNewRoom(e.target.value)}><option value="">Select room...</option>{capacity.map(r => <option key={r.room_id} value={r.room_id}>{r.room_name} ({r.available} available)</option>)}</select></div>
            <div><label style={lbl}>Date</label><input type="date" style={inp} value={newDate} onChange={e => setNewDate(e.target.value)} /></div>
            <button onClick={handleCreate} style={btnP}>Create</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#fff', borderRadius: 12, border: '1px solid #EDE8F4', padding: 6 }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: tab === id ? 700 : 500, background: tab === id ? purple : '#F0EBF8', color: tab === id ? '#fff' : '#6B5F7A' }}>{label}</button>
        ))}
      </div>

      {/* ── LIVE SPOTS ── */}
      {tab === 'live' && (
        <div>
          {offers.length === 0 && <div style={{ ...card, textAlign: 'center', padding: 40 }}><div style={{ fontSize: 32, marginBottom: 8 }}>📋</div><p style={{ color: '#A89DB5', fontSize: 14 }}>No spot offers yet. Create one above or they will auto-generate from check-in alerts.</p></div>}
          {offers.map(o => (
            <div key={o.id} style={{ ...card, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#3D3248' }}>{o.room_name}</span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#E8E0D8', color: '#6B5F7A', fontWeight: 600 }}>{o.age_group}</span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: (statusColors[o.status] || '#888') + '18', color: statusColors[o.status] || '#888', fontWeight: 700 }}>{statusLabels[o.status] || o.status}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6B5F7A' }}>
                    {new Date(o.offer_date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' · '}{sourceLabels[o.source] || o.source}
                    {o.vacated_child_name && <span style={{ color: '#A89DB5' }}> · {o.vacated_child_name} absent</span>}
                    {o.broadcast_count > 0 && <span> · {o.broadcast_count} notified</span>}
                    {o.accept_count > 0 && <span style={{ color: '#059669', fontWeight: 600 }}> · {o.accept_count} accepted</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(o.status === 'open') && <button onClick={() => handleBroadcast(o.id)} style={btnP}>Broadcast Now</button>}
                  {(o.status === 'broadcasting' || o.status === 'pending_confirm') && <button onClick={() => loadResponses(o.id)} style={btnS}>{selectedOffer === o.id ? 'Hide' : 'View Responses'}</button>}
                  {o.revenue_cents > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', alignSelf: 'center' }}>${(o.revenue_cents / 100).toFixed(2)}</span>}
                </div>
              </div>

              {/* Responses panel */}
              {selectedOffer === o.id && responses.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #EDE8F4' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#3D3248', marginBottom: 8 }}>Responses ({responses.length})</div>
                  {responses.map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, marginBottom: 4, background: r.response === 'accept' ? '#F0FFF4' : r.response === 'decline' ? '#FEF2F2' : '#F8F5F1' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{r.parent_name}</span>
                        <span style={{ fontSize: 11, color: '#A89DB5', marginLeft: 8 }}>{r.child_name}</span>
                        {r.priority && <span style={{ fontSize: 10, marginLeft: 8, padding: '1px 6px', borderRadius: 10, background: r.priority === 'urgent' ? '#FEE2E2' : r.priority === 'high' ? '#FEF3C7' : '#E8E0D8', color: r.priority === 'urgent' ? '#DC2626' : r.priority === 'high' ? '#D97706' : '#6B5F7A', fontWeight: 600 }}>{r.priority}</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {r.response === 'accept' && <span style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>ACCEPTED</span>}
                        {r.response === 'decline' && <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 600 }}>Declined</span>}
                        {!r.response && <span style={{ fontSize: 11, color: '#A89DB5' }}>Pending...</span>}
                        {r.response === 'accept' && o.status !== 'filled' && o.status !== 'pending_confirm' && (
                          <button onClick={() => handleSelectWinner(o.id, r.id)} style={{ ...btnP, padding: '4px 12px', fontSize: 11 }}>Select Winner</button>
                        )}
                        {r.status === 'winner' && <span style={{ fontSize: 11, color: '#7C3AED', fontWeight: 700 }}>WINNER</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── ROOM CAPACITY ── */}
      {tab === 'capacity' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {capacity.map(r => (
            <div key={r.room_id} style={{ ...card, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#3D3248', marginBottom: 4 }}>{r.room_name}</div>
              <div style={{ fontSize: 11, color: '#A89DB5', marginBottom: 12 }}>{r.age_group}</div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                <div><div style={{ fontSize: 22, fontWeight: 800, color: r.available > 0 ? '#059669' : '#DC2626' }}>{r.available}</div><div style={{ fontSize: 10, color: '#A89DB5' }}>Available</div></div>
                <div><div style={{ fontSize: 22, fontWeight: 800, color: '#3D3248' }}>{r.enrolled}</div><div style={{ fontSize: 10, color: '#A89DB5' }}>Enrolled</div></div>
                <div><div style={{ fontSize: 22, fontWeight: 800, color: '#D97706' }}>{r.absent_today}</div><div style={{ fontSize: 10, color: '#A89DB5' }}>Absent</div></div>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: '#E8E0D8', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, background: r.effective >= r.capacity ? '#DC2626' : r.effective >= r.capacity * 0.8 ? '#D97706' : '#059669', width: Math.min(100, Math.round((r.effective / r.capacity) * 100)) + '%', transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: 10, color: '#A89DB5', marginTop: 4 }}>{r.effective}/{r.capacity} effective occupancy</div>
            </div>
          ))}
        </div>
      )}

      {/* ── ANALYTICS ── */}
      {tab === 'analytics' && analytics && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
            {[
              ['Spots Offered', analytics.summary.spots_offered, '#3D3248'],
              ['Fill Rate', analytics.summary.fill_rate_pct + '%', analytics.summary.fill_rate_pct > 50 ? '#059669' : '#D97706'],
              ['Revenue', '$' + (analytics.summary.revenue_generated || 0).toFixed(2), '#059669'],
              ['Active', analytics.summary.spots_active, '#2563EB'],
            ].map(([label, value, color]) => (
              <div key={label} style={{ ...card, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
                <div style={{ fontSize: 11, color: '#A89DB5', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
          {analytics.summary.revenue_generated > 0 && (
            <div style={{ ...card, background: 'linear-gradient(135deg, #F0FFF4, #ECFDF5)', borderColor: '#A7F3D0' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#065F46' }}>Revenue from Casual Spots</div>
              <div style={{ fontSize: 13, color: '#047857', marginTop: 4 }}>In the last {analytics.period_days} days, Casual Spot Management generated <strong>${analytics.summary.revenue_generated.toFixed(2)}</strong> in additional revenue across <strong>{analytics.summary.bookings_created}</strong> booking{analytics.summary.bookings_created !== 1 ? 's' : ''}.</div>
            </div>
          )}
          {analytics.by_room.length > 0 && (
            <div style={card}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>By Room</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ borderBottom: '2px solid #EDE8F4' }}>{['Room', 'Offered', 'Filled', 'Fill Rate', 'Revenue'].map(h => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: '#8A7F96', fontWeight: 700, fontSize: 11 }}>{h}</th>)}</tr></thead>
                <tbody>{analytics.by_room.map((r, i) => (<tr key={i} style={{ borderBottom: '1px solid #F0EBF8' }}><td style={{ padding: '8px' }}>{r.room_name}</td><td style={{ padding: '8px' }}>{r.offers}</td><td style={{ padding: '8px' }}>{r.filled}</td><td style={{ padding: '8px' }}>{r.fill_rate}%</td><td style={{ padding: '8px', color: '#059669', fontWeight: 600 }}>${r.revenue.toFixed(2)}</td></tr>))}</tbody>
              </table>
            </div>
          )}
          {analytics.by_source.length > 0 && (
            <div style={card}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>By Source</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ borderBottom: '2px solid #EDE8F4' }}>{['Source', 'Offered', 'Filled', 'Fill Rate'].map(h => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: '#8A7F96', fontWeight: 700, fontSize: 11 }}>{h}</th>)}</tr></thead>
                <tbody>{analytics.by_source.map((s, i) => (<tr key={i} style={{ borderBottom: '1px solid #F0EBF8' }}><td style={{ padding: '8px' }}>{sourceLabels[s.source] || s.source}</td><td style={{ padding: '8px' }}>{s.offers}</td><td style={{ padding: '8px' }}>{s.filled}</td><td style={{ padding: '8px' }}>{s.fill_rate}%</td></tr>))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── SETTINGS ── */}
      {tab === 'settings' && (
        <div style={card}>
          <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>Casual Spot Settings</h3>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Fill Mode</label>
            {[['director_choice', 'Director Choice', 'Director reviews responses and picks the winner'], ['auto_first', 'Auto — First Reply Wins', 'First parent to reply ACCEPT gets the spot automatically']].map(([v, l, d]) => (
              <label key={v} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 6, border: config.fill_mode === v ? '1.5px solid ' + purple : '1px solid #EDE8F4', background: config.fill_mode === v ? '#F0EBF8' : 'transparent' }}>
                <input type="radio" name="fill_mode" value={v} checked={config.fill_mode === v} onChange={e => setConfig(c => ({ ...c, fill_mode: e.target.value }))} style={{ marginTop: 2 }} />
                <div><div style={{ fontSize: 13, fontWeight: 600, color: '#3D3248' }}>{l}</div><div style={{ fontSize: 11, color: '#A89DB5', marginTop: 2 }}>{d}</div></div>
              </label>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={!!config.auto_broadcast} onChange={e => setConfig(c => ({ ...c, auto_broadcast: e.target.checked }))} />
              <div><div style={{ fontSize: 12, fontWeight: 600 }}>Auto-broadcast</div><div style={{ fontSize: 10, color: '#A89DB5' }}>Send SMS when spot opens</div></div>
            </div>
            <div><label style={lbl}>Broadcast delay (mins)</label><input type="number" min="0" max="120" style={inp} value={config.broadcast_delay_minutes || 15} onChange={e => setConfig(c => ({ ...c, broadcast_delay_minutes: parseInt(e.target.value) || 15 }))} /></div>
            <div><label style={lbl}>Offer expiry (hours)</label><input type="number" min="1" max="48" style={inp} value={config.offer_expiry_hours || 4} onChange={e => setConfig(c => ({ ...c, offer_expiry_hours: parseInt(e.target.value) || 4 }))} /></div>
          </div>
          <div style={{ marginBottom: 16 }}><label style={lbl}>SMS Offer Template</label><textarea style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} rows={2} value={config.sms_offer_template || ''} onChange={e => setConfig(c => ({ ...c, sms_offer_template: e.target.value }))} /><div style={{ fontSize: 10, color: '#A89DB5', marginTop: 3 }}>Variables: {'{parent_name}'} {'{room_name}'} {'{date}'} {'{fee}'}</div></div>
          <div style={{ marginBottom: 16 }}><label style={lbl}>Winner SMS Template</label><textarea style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} rows={2} value={config.sms_winner_template || ''} onChange={e => setConfig(c => ({ ...c, sms_winner_template: e.target.value }))} /></div>
          <div style={{ marginBottom: 16 }}><label style={lbl}>Filled SMS Template (to losers)</label><textarea style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} rows={2} value={config.sms_loser_template || ''} onChange={e => setConfig(c => ({ ...c, sms_loser_template: e.target.value }))} /></div>
          <button onClick={saveConfig} disabled={saving} style={{ ...btnP, background: saved ? '#2E7D32' : purple }}>{saved ? 'Saved' : saving ? 'Saving...' : 'Save Settings'}</button>
        </div>
      )}
    </div>
  );
}
