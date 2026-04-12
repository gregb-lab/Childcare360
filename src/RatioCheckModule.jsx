import { useState, useEffect, useCallback } from "react";

const API = (p, o={}) => {
  const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
  return fetch(p,{headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})},
    method:o.method||"GET",...(o.body?{body:JSON.stringify(o.body)}:{})}).then(r=>r.json());
};

const P="#7C3AED",DARK="#3D3248",MU="#8A7F96";
const OK="#16A34A",WA="#D97706",DA="#DC2626";
const card={background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"18px 22px"};
const bp={padding:"9px 18px",borderRadius:9,border:"none",background:P,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13};

// Australian NQF educator-to-child ratios
const NQF_RATIOS = {
  babies:       4,   // 0-24 months: 1:4
  toddlers:     5,   // 24-36 months: 1:5
  preschool:   11,   // 36-60 months: 1:11
  kindergarten: 11,  // 48+ months: 1:11
  school_age:  15,   // OSHC: 1:15
};

function getRatioForRoom(ageGroup) {
  if (!ageGroup) return 11;
  const ag = ageGroup.toLowerCase().replace(/[^a-z_]/g, '');
  if (ag.includes('bab') || ag.includes('nursery') || ag.includes('0_2') || ag.includes('infant')) return 4;
  if (ag.includes('tod') || ag.includes('2_3')) return 5;
  if (ag.includes('pre') || ag.includes('3_5') || ag.includes('kinder') || ag.includes('4_5')) return 11;
  if (ag.includes('school') || ag.includes('oshc') || ag.includes('oosh')) return 15;
  return NQF_RATIOS[ag] || 11;
}

function assessCompliance(childrenCount, educatorCount, ageGroup) {
  const ratio = getRatioForRoom(ageGroup);
  const required = childrenCount > 0 ? Math.ceil(childrenCount / ratio) : 0;
  const gap = required - educatorCount;

  if (gap <= 0) return { status: "compliant", label: "Compliant", color: OK, icon: "✅", gap: 0, required, ratio };
  const isHighRisk = ageGroup && (ageGroup.toLowerCase().includes('bab') || ageGroup.toLowerCase().includes('tod') || ageGroup.toLowerCase().includes('nursery'));
  if (gap === 1 && !isHighRisk) return { status: "minor", label: "Minor Breach", color: WA, icon: "⚠️", gap, required, ratio };
  return { status: "major", label: "Major Breach", color: DA, icon: "🔴", gap, required, ratio };
}

export default function RatioCheckModule() {
  const [attendance, setAttendance] = useState(null);
  const [onFloor, setOnFloor] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);

  const load = useCallback(async () => {
    try {
      const [att, floor, rm] = await Promise.all([
        API("/api/attendance/live"),
        API("/api/rostering/on-floor"),
        API("/api/rooms/simple"),
      ]);
      setAttendance(att);
      setOnFloor(floor);
      setRooms(Array.isArray(rm) ? rm : rm.rooms || []);
      setLastChecked(new Date());

      // Check for breaches and notify
      if (att?.rooms && floor?.rooms) {
        const attByRoom = {};
        (att.rooms || []).forEach(r => { attByRoom[r.room_id] = r; });
        const floorByRoom = {};
        (floor.rooms || []).forEach(r => { floorByRoom[r.room_id] = r; });

        const allRoomIds = new Set([...Object.keys(attByRoom), ...Object.keys(floorByRoom)]);
        allRoomIds.forEach(rid => {
          const childCount = attByRoom[rid]?.children?.length || 0;
          const eduCount = floorByRoom[rid]?.educators?.length || 0;
          const ageGroup = attByRoom[rid]?.age_group || floorByRoom[rid]?.age_group || '';
          const roomName = attByRoom[rid]?.room_name || floorByRoom[rid]?.room_name || 'Unknown';
          const c = assessCompliance(childCount, eduCount, ageGroup);
          if (c.status === "minor") {
            window.showToast?.(`⚠️ Ratio breach: ${roomName} is 1 educator under ratio`, 'warning');
          } else if (c.status === "major") {
            window.showToast?.(`🔴 CRITICAL: ${roomName} is ${c.gap} educators under ratio`, 'error');
          }
        });
      }
    } catch(e) { console.error('Ratio check load error:', e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, [load]);

  // Build merged room data
  const attByRoom = {};
  (attendance?.rooms || []).forEach(r => { attByRoom[r.room_id] = r; });
  const floorByRoom = {};
  (onFloor?.rooms || []).forEach(r => { floorByRoom[r.room_id] = r; });

  const allRoomIds = new Set([
    ...rooms.map(r => r.id),
    ...Object.keys(attByRoom),
    ...Object.keys(floorByRoom),
  ]);

  const roomCards = [...allRoomIds].map(rid => {
    const room = rooms.find(r => r.id === rid);
    const attRoom = attByRoom[rid];
    const floorRoom = floorByRoom[rid];
    const childCount = attRoom?.children?.length || 0;
    const eduCount = floorRoom?.educators?.length || 0;
    const ageGroup = room?.age_group || attRoom?.age_group || floorRoom?.age_group || '';
    const roomName = room?.name || attRoom?.room_name || floorRoom?.room_name || 'Unknown';
    const capacity = room?.capacity || attRoom?.capacity || 0;
    const compliance = assessCompliance(childCount, eduCount, ageGroup);
    return { rid, roomName, ageGroup, childCount, eduCount, capacity, compliance };
  }).filter(r => r.roomName !== 'Unassigned');

  const compliantCount = roomCards.filter(r => r.compliance.status === "compliant").length;
  const breachCount = roomCards.filter(r => r.compliance.status !== "compliant").length;
  const totalChildren = attendance?.total_present || 0;
  const totalEducators = onFloor?.total_on_floor || 0;

  const minutesAgo = lastChecked ? Math.floor((Date.now() - lastChecked.getTime()) / 60000) : null;

  if (loading) return (
    <div style={{padding:"24px 28px",textAlign:"center",color:MU,paddingTop:80}}>
      <div style={{fontSize:36,marginBottom:12}}>📊</div>
      <div>Loading ratio data...</div>
    </div>
  );

  return (
    <div style={{padding:"24px 28px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h2 style={{margin:0,fontSize:20,fontWeight:900,color:DARK}}>📊 Live Ratio Check</h2>
          <p style={{margin:"2px 0 0",fontSize:12,color:MU}}>
            NQF ratio compliance across all rooms
            {minutesAgo !== null && ` · Last checked: ${minutesAgo === 0 ? 'just now' : `${minutesAgo}m ago`}`}
          </p>
        </div>
        <button onClick={load} style={bp}>🔄 Refresh Now</button>
      </div>

      {/* Stat cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
        {[
          { label: "Rooms Compliant", value: compliantCount, color: OK, icon: "✅" },
          { label: "Rooms Under Ratio", value: breachCount, color: breachCount > 0 ? DA : OK, icon: breachCount > 0 ? "🔴" : "✅" },
          { label: "Children Present", value: totalChildren, color: P, icon: "👶" },
          { label: "Educators On Floor", value: totalEducators, color: P, icon: "👩‍🏫" },
        ].map(s => (
          <div key={s.label} style={{...card,textAlign:"center",borderTop:`3px solid ${s.color}`}}>
            <div style={{fontSize:24,marginBottom:6}}>{s.icon}</div>
            <div style={{fontSize:28,fontWeight:800,color:s.color}}>{s.value}</div>
            <div style={{fontSize:10,color:MU,fontWeight:700,textTransform:"uppercase"}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Major breach banner */}
      {roomCards.some(r => r.compliance.status === "major") && (
        <div style={{padding:"12px 18px",borderRadius:10,background:"#FEF2F2",border:"2px solid #FCA5A5",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:24}}>🔴</span>
          <div>
            <div style={{fontWeight:800,color:DA,fontSize:14}}>CRITICAL: Major ratio breach detected</div>
            <div style={{fontSize:12,color:"#991B1B"}}>
              {roomCards.filter(r=>r.compliance.status==="major").map(r=>r.roomName).join(", ")} — notify manager immediately
            </div>
          </div>
        </div>
      )}

      {/* Room grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
        {roomCards.map(r => (
          <div key={r.rid} style={{
            ...card,
            borderLeft:`4px solid ${r.compliance.color}`,
            background: r.compliance.status === "major" ? "#FEF2F2" : r.compliance.status === "minor" ? "#FFFBEB" : "#fff",
          }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:DARK}}>{r.roomName}</div>
                <div style={{fontSize:11,color:MU}}>{r.ageGroup || "Mixed"}</div>
              </div>
              <span style={{
                padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                background:r.compliance.color+"18",color:r.compliance.color,
              }}>
                {r.compliance.icon} {r.compliance.label}
              </span>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div style={{padding:"8px 12px",borderRadius:8,background:"#F8F5FC",textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:800,color:DARK}}>{r.childCount}</div>
                <div style={{fontSize:10,color:MU}}>Children{r.capacity ? ` / ${r.capacity}` : ''}</div>
              </div>
              <div style={{padding:"8px 12px",borderRadius:8,background:r.compliance.status!=="compliant"?r.compliance.color+"10":"#F0FDF4",textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:800,color:r.compliance.status!=="compliant"?r.compliance.color:OK}}>
                  {r.eduCount}
                </div>
                <div style={{fontSize:10,color:MU}}>Educators (need {r.compliance.required})</div>
              </div>
            </div>

            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:MU,paddingTop:4,borderTop:"1px solid #EDE8F4"}}>
              <span>Ratio: 1:{r.compliance.ratio}</span>
              <span>Actual: {r.childCount > 0 && r.eduCount > 0 ? `1:${Math.round(r.childCount/r.eduCount*10)/10}` : '—'}</span>
            </div>
          </div>
        ))}
      </div>

      {roomCards.length === 0 && (
        <div style={{...card,textAlign:"center",padding:60}}>
          <div style={{fontSize:48,marginBottom:12}}>📊</div>
          <div style={{fontWeight:700,fontSize:16,color:DARK,marginBottom:6}}>No rooms with attendance data</div>
          <div style={{fontSize:13,color:MU}}>Children need to be signed in and educators clocked in to show ratio data.</div>
        </div>
      )}
    </div>
  );
}
