/**
 * CCSModule.jsx — v2.9.0
 * Child Care Subsidy management:
 *   💰 Calculator  — estimate CCS & gap fees for any family
 *   👨‍👩‍👧 Families    — manage CCS details per enrolled child
 *   📋 Session Reports — fortnightly report builder for CCSS
 *   🔌 Integrations   — PRODA, ACECQA, NER/WWCC, ABN validation
 */
import { useState, useEffect, useCallback } from "react";

const API = (path, opts={}) => {
  const t=localStorage.getItem("c360_token"), tid=localStorage.getItem("c360_tenant");
  return fetch(path,{headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})},
    method:opts.method||"GET",...(opts.body?{body:JSON.stringify(opts.body)}:{})}).then(r=>r.json());
};

const P="#7C3AED",PL="#EDE4F0",DARK="#3D3248",MUTED="#8A7F96";
const OK="#16A34A",WARN="#D97706",DANGER="#DC2626",INFO="#0284C7";
const card={background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"18px 22px"};
const btnP={padding:"9px 18px",borderRadius:9,border:"none",background:P,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13};
const btnS={padding:"9px 18px",borderRadius:9,border:`1px solid ${P}`,background:"#fff",color:P,fontWeight:600,cursor:"pointer",fontSize:13};
const btnG={padding:"9px 18px",borderRadius:9,border:"1px solid #DDD6EE",background:"#F8F5FC",color:MUTED,fontWeight:500,cursor:"pointer",fontSize:13};
const inp={padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:13,width:"100%",boxSizing:"border-box",fontFamily:"inherit"};
const lbl={fontSize:11,color:MUTED,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"};

const fmt$ = n => `$${(n||0).toFixed(2)}`;
const fmtK = n => n >= 1000 ? `$${(n/1000).toFixed(0)}k` : `$${n}`;
const today = () => new Date().toISOString().split("T")[0];

// Get the most recent CCS fortnight start (fortnights start every second Monday from 7 Jul 2025)
function getFortnightStart(date = new Date()) {
  const anchor = new Date("2025-07-07"); // First fortnight of FY26
  const diffDays = Math.floor((date - anchor) / 86400000);
  const fortnightNum = Math.floor(diffDays / 14);
  const start = new Date(anchor);
  start.setDate(anchor.getDate() + fortnightNum * 14);
  return start.toISOString().split("T")[0];
}

const TABS=[
  {id:"calculator",icon:"💰",label:"CCS Calculator"},
  {id:"families",icon:"👨‍👩‍👧",label:"Family CCS"},
  {id:"reports",icon:"📋",label:"Session Reports"},
  {id:"integrations",icon:"🔌",label:"Integrations"},
];

export default function CCSModule() {
  const [tab,setTab]=useState("calculator");
  const [dashboard,setDashboard]=useState(null);

  useEffect(()=>{
    API("/api/ccs/dashboard").then(setDashboard).catch(()=>{});
  },[]);

  return (
    <div style={{padding:"24px 28px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:16,marginBottom:24}}>
        <span style={{fontSize:28}}>💰</span>
        <div style={{flex:1}}>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>Child Care Subsidy (CCS)</h1>
          <p style={{margin:"3px 0 0",fontSize:13,color:MUTED}}>
            2025–26 rates · 3-Day Guarantee (72hr min) · CCSS session report builder · PRODA integration
          </p>
        </div>
        {dashboard&&(
          <div style={{display:"flex",gap:10,flexShrink:0}}>
            {[
              ["Families",dashboard.families?.n||0,P],
              ["Pending Reports",dashboard.queue_summary?.pending?.count||0,WARN],
              ["No CCS Setup",dashboard.children_without_ccs?.length||0,DANGER],
            ].map(([l,v,c])=>(
              <div key={l} style={{textAlign:"center",padding:"10px 16px",background:"#F8F5FC",borderRadius:10,minWidth:80}}>
                <div style={{fontSize:22,fontWeight:900,color:c}}>{v}</div>
                <div style={{fontSize:10,color:MUTED,marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{display:"flex",gap:6,marginBottom:24,borderBottom:"1px solid #EDE8F4",paddingBottom:12}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"8px 16px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,
              fontWeight:tab===t.id?700:500,background:tab===t.id?P:"transparent",color:tab===t.id?"#fff":MUTED}}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab==="calculator"   && <CalculatorTab />}
      {tab==="families"     && <FamiliesTab dashboard={dashboard} />}
      {tab==="reports"      && <ReportsTab />}
      {tab==="integrations" && <IntegrationsTab />}
    </div>
  );
}

// ─── CCS CALCULATOR ───────────────────────────────────────────────────────────
function CalculatorTab() {
  const [form,setForm]=useState({
    income:85000,service_type:"centre_based_day_care",hourly_fee:15,
    hours_per_week:50,is_higher_rate:false,is_first_nations:false,
    accs_eligible:false,activity_hours_lower:72,num_children:1
  });
  const [result,setResult]=useState(null);
  const [loading,setLoading]=useState(false);

  const calculate=async()=>{
    setLoading(true);
    const r=await API("/api/ccs/calculate",{method:"POST",body:form}).catch(e=>console.error('API error:',e));
    setResult(r);
    setLoading(false);
  };

  useEffect(()=>{calculate();},[]);

  const est=result?.estimates?.[0];
  const INCOME_STEPS=[0,40000,80000,100000,150000,200000,300000,400000,539900];

  return (
    <div style={{display:"grid",gridTemplateColumns:"380px 1fr",gap:20}}>
      {/* Inputs */}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={card}>
          <div style={{fontWeight:700,fontSize:14,color:P,marginBottom:16}}>Family Details</div>

          <div style={{marginBottom:12}}>
            <label style={lbl}>Combined Annual Family Income</label>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16,color:MUTED}}>$</span>
              <input type="number" value={form.income} onChange={e=>setForm(p=>({...p,income:parseInt(e.target.value)||0}))} style={{...inp,flex:1}}/>
            </div>
            <input type="range" min="0" max="539900" step="5000" value={form.income}
              onChange={e=>setForm(p=>({...p,income:parseInt(e.target.value)}))}
              style={{width:"100%",marginTop:6}}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:MUTED}}>
              <span>$0</span><span>$270k</span><span>$540k</span>
            </div>
          </div>

          <div style={{marginBottom:12}}>
            <label style={lbl}>Care Type</label>
            <select value={form.service_type} onChange={e=>setForm(p=>({...p,service_type:e.target.value}))} style={inp}>
              <option value="centre_based_day_care">Centre-Based Day Care (LDC)</option>
              <option value="family_day_care">Family Day Care</option>
              <option value="outside_school_hours">Outside School Hours Care (OSHC)</option>
              <option value="in_home_care">In-Home Care</option>
            </select>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div>
              <label style={lbl}>Your Hourly Fee</label>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{color:MUTED}}>$</span>
                <input type="number" step="0.50" value={form.hourly_fee} onChange={e=>setForm(p=>({...p,hourly_fee:parseFloat(e.target.value)||0}))} style={inp}/>
              </div>
            </div>
            <div>
              <label style={lbl}>Hours/Week in Care</label>
              <input type="number" value={form.hours_per_week} onChange={e=>setForm(p=>({...p,hours_per_week:parseInt(e.target.value)||0}))} style={inp}/>
            </div>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
            {[
              ["is_higher_rate","Second or younger child (higher rate eligible)"],
              ["is_first_nations","Aboriginal or Torres Strait Islander child"],
              ["accs_eligible","ACCS eligible (Additional Child Care Subsidy)"],
            ].map(([k,l])=>(
              <label key={k} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
                <input type="checkbox" checked={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.checked}))}/>
                {l}
              </label>
            ))}
          </div>

          <button style={{...btnP,width:"100%"}} onClick={calculate} disabled={loading}>
            {loading?"Calculating…":"Calculate CCS"}
          </button>
        </div>

        {/* Rate reference */}
        <div style={{...card,background:"#F8F5FC"}}>
          <div style={{fontWeight:700,fontSize:12,color:MUTED,marginBottom:8}}>2025–26 HOURLY RATE CAPS</div>
          {[["LDC (Centre-Based)","$15.04"],["Family Day Care","$13.73"],["OSHC","$13.11"],["In-Home Care","$36.24"]].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:"1px solid #EDE8F4"}}>
              <span style={{color:DARK}}>{l}</span><span style={{fontWeight:700,color:P}}>{v}</span>
            </div>
          ))}
          <div style={{fontSize:11,color:MUTED,marginTop:8}}>
            ⓘ 3-Day Guarantee: All eligible families get ≥72 hrs subsidised care/fortnight from 5 Jan 2026
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {est&&(
          <>
            {/* Big numbers */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
              {[
                ["CCS Percentage",`${est.ccs_percentage}%`,est.ccs_percentage>=80?OK:est.ccs_percentage>=50?WARN:DANGER,"Your subsidy rate"],
                ["Weekly Gap Fee",fmt$(est.weekly_gap),DARK,"Your out-of-pocket"],
                ["Annual Savings",fmt$(Math.round(est.annual_ccs)),P,"Government contribution"],
              ].map(([l,v,c,sub])=>(
                <div key={l} style={{...card,textAlign:"center",borderTop:`3px solid ${c}`}}>
                  <div style={{fontSize:28,fontWeight:900,color:c,marginBottom:2}}>{v}</div>
                  <div style={{fontSize:13,fontWeight:600,color:DARK}}>{l}</div>
                  <div style={{fontSize:11,color:MUTED,marginTop:2}}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Breakdown */}
            <div style={card}>
              <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:14}}>Cost Breakdown</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                <div>
                  <div style={{fontWeight:600,fontSize:12,color:MUTED,marginBottom:8}}>WEEKLY</div>
                  {[
                    ["Full weekly fee",fmt$(est.weekly_full),""],
                    ["CCS contribution",`−${fmt$(est.weekly_ccs)}`,OK],
                    ["Your gap fee",fmt$(est.weekly_gap),DARK],
                    ...(est.above_cap_surcharge > 0 ? [["Above-cap surcharge (weekly)",fmt$(est.above_cap_surcharge/52),DANGER]] : [])
                  ].map(([l,v,c])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #F0EBF8",fontSize:13}}>
                      <span style={{color:MUTED}}>{l}</span>
                      <span style={{fontWeight:600,color:c||DARK}}>{v}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{fontWeight:600,fontSize:12,color:MUTED,marginBottom:8}}>ANNUAL</div>
                  {[
                    ["Full annual fees",fmt$(est.weekly_full*52),""],
                    ["Total CCS received",fmt$(est.annual_ccs),OK],
                    ["Your annual gap fees",fmt$(est.annual_gap),DARK],
                  ].map(([l,v,c])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #F0EBF8",fontSize:13}}>
                      <span style={{color:MUTED}}>{l}</span>
                      <span style={{fontWeight:600,color:c||DARK}}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{marginTop:16,padding:"12px 16px",background:"#F0F9FF",borderRadius:10,fontSize:13}}>
                <div style={{fontWeight:700,color:INFO,marginBottom:4}}>Hourly breakdown</div>
                <div style={{display:"flex",gap:20}}>
                  <span>Your fee: <strong style={{color:DARK}}>{fmt$(form.hourly_fee)}/hr</strong></span>
                  <span>Cap: <strong style={{color:P}}>{fmt$(est.hourly_cap)}/hr</strong></span>
                  <span>CCS pays: <strong style={{color:OK}}>{fmt$(est.hourly_ccs_amount)}/hr</strong></span>
                  <span>You pay: <strong style={{color:DARK}}>{fmt$(est.hourly_gap)}/hr</strong></span>
                </div>
                {form.hourly_fee > est.hourly_cap && (
                  <div style={{marginTop:6,color:WARN,fontSize:12}}>
                    ⚠ Your fee ${form.hourly_fee}/hr exceeds the cap of ${est.hourly_cap}/hr — you pay the ${(form.hourly_fee-est.hourly_cap).toFixed(2)}/hr difference plus the gap
                  </div>
                )}
              </div>
            </div>

            {/* Income → CCS% table */}
            <div style={card}>
              <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:12}}>CCS % by Income (2025–26)</div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{background:"#F8F5FC"}}>
                    {["Family Income","Standard Rate","Higher Rate (2nd child)","Weekly Gap (your fee)"].map(h=>(
                      <th key={h} style={{padding:"8px 10px",textAlign:"left",color:MUTED,fontWeight:700,fontSize:11}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {[0,40000,83280,100000,150000,173163,262453,352453,400000,539900].map(inc=>{
                      const std=inc>=539900?0:inc>=352453?20:inc>=262453?50-Math.floor((inc-262453)/3000):inc>=173163?50:inc>=83280?90-Math.floor((inc-83280)/3000):90;
                      const high=Math.min(95,std+30);
                      const stdGap=(form.hourly_fee-(Math.min(form.hourly_fee,15.04)*(std/100)))*form.hours_per_week;
                      return (
                        <tr key={inc} style={{borderBottom:"1px solid #F0EBF8",background:Math.abs(inc-form.income)<5000?"#F3E8FF":"transparent"}}>
                          <td style={{padding:"7px 10px",fontWeight:Math.abs(inc-form.income)<5000?700:400}}>{fmtK(inc)}</td>
                          <td style={{padding:"7px 10px",color:std>=80?OK:std>=50?WARN:std===0?DANGER:DARK,fontWeight:600}}>{std}%</td>
                          <td style={{padding:"7px 10px",color:OK,fontWeight:600}}>{inc<367563?`${high}%`:"—"}</td>
                          <td style={{padding:"7px 10px",color:DARK}}>{fmt$(stdGap)}/wk</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── FAMILY CCS DETAILS ───────────────────────────────────────────────────────
function FamiliesTab({ dashboard }) {
  const [families,setFamilies]=useState([]);
  const [children,setChildren]=useState([]);
  const [selected,setSelected]=useState(null);
  const [form,setForm]=useState({});
  const [loading,setLoading]=useState(true);

  const load=useCallback(()=>{
    setLoading(true);
    Promise.all([
      API("/api/ccs/families"),
      API("/api/children/simple"),
    ]).then(([fr,cr])=>{
      setFamilies(fr.families||[]);
      setChildren(Array.isArray(cr)?cr:(cr.children||cr.data||[]));
    }).finally(()=>setLoading(false));
  },[]);
  useEffect(()=>{load();},[load]);

  const save=async()=>{
    try {
    await API("/api/ccs/families",{method:"POST",body:form}).catch(e=>console.error('API error:',e));
    setSelected(null);load();
    } catch(e) { console.error('API error:', e); }
  };

  const setupFor=(child)=>{
    const existing=families.find(f=>f.child_id===child.id);
    setForm(existing||{child_id:child.id,combined_income:0,activity_hours_p1:72,activity_hours_p2:72,immunisation_compliant:true});
    setSelected(child);
  };

  const noCSS=dashboard?.children_without_ccs||[];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {noCSS.length>0&&(
        <div style={{...card,background:"#FEF3C7",border:"1px solid #FDE68A"}}>
          <div style={{fontWeight:700,fontSize:13,color:WARN,marginBottom:8}}>⚠ {noCSS.length} children without CCS details set up</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {noCSS.map(c=>(
              <button key={c.id} onClick={()=>setupFor(c)}
                style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${WARN}`,background:"#FFFBEB",color:WARN,cursor:"pointer",fontSize:12,fontWeight:600}}>
                + Set up {c.first_name} {c.last_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected&&(
        <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
          <div style={{fontWeight:700,fontSize:14,color:P,marginBottom:16}}>
            CCS Details — {selected.first_name} {selected.last_name}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[
              ["parent1_name","Parent 1 Full Name"],["parent1_crn","Parent 1 CRN (Centrelink)"],
              ["parent2_name","Parent 2 Full Name (if applicable)"],["parent2_crn","Parent 2 CRN"],
            ].map(([k,l])=>(
              <div key={k}>
                <label style={lbl}>{l}</label>
                <input value={form[k]||""} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} style={inp}/>
              </div>
            ))}
            <div>
              <label style={lbl}>Combined Annual Income ($)</label>
              <input type="number" value={form.combined_income||0} onChange={e=>setForm(p=>({...p,combined_income:parseInt(e.target.value)||0}))} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Income Year</label>
              <select value={form.income_year||"2025"} onChange={e=>setForm(p=>({...p,income_year:e.target.value}))} style={inp}>
                {["2024","2025","2026"].map(y=><option key={y} value={y}>{y}–{parseInt(y)+1}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Activity Hours — Parent 1 (per fortnight)</label>
              <input type="number" value={form.activity_hours_p1||72} onChange={e=>setForm(p=>({...p,activity_hours_p1:parseInt(e.target.value)||72}))} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Activity Hours — Parent 2 (per fortnight)</label>
              <input type="number" value={form.activity_hours_p2||72} onChange={e=>setForm(p=>({...p,activity_hours_p2:parseInt(e.target.value)||72}))} style={inp}/>
            </div>
            <div>
              <label style={lbl}>CCSS Enrolment ID</label>
              <input value={form.enrolment_id||""} onChange={e=>setForm(p=>({...p,enrolment_id:e.target.value}))} style={inp} placeholder="From CCSS/PEP system"/>
            </div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:12,flexWrap:"wrap"}}>
            {[
              ["higher_rate_eligible","Second/younger child (higher rate)"],
              ["accs_eligible","ACCS eligible"],
              ["first_nations","First Nations"],
              ["preschool_program","Enrolled in preschool program"],
              ["immunisation_compliant","Immunisation compliant"],
            ].map(([k,l])=>(
              <label key={k} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12}}>
                <input type="checkbox" checked={!!form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.checked}))}/>
                {l}
              </label>
            ))}
          </div>
          <div style={{display:"flex",gap:8,marginTop:14}}>
            <button style={btnP} onClick={save}>Save CCS Details</button>
            <button style={btnS} onClick={()=>setSelected(null)}>Cancel</button>
          </div>
        </div>
      )}

      {loading?<div style={{color:MUTED,textAlign:"center",padding:40}}>Loading…</div>
        :<div style={{display:"flex",flexDirection:"column",gap:8}}>
          {families.length===0&&!loading&&(
            <div style={{...card,textAlign:"center",padding:"40px 20px",color:MUTED}}>
              <div style={{fontSize:36}}>👨‍👩‍👧</div>
              <div style={{marginTop:8}}>No CCS family details yet. Add children above.</div>
            </div>
          )}
          {families.map(f=>(
            <div key={f.child_id} style={{...card}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:DARK}}>{f.first_name} {f.last_name}</div>
                  <div style={{fontSize:12,color:MUTED,marginTop:2}}>
                    {f.parent1_name&&`${f.parent1_name} · `}
                    {f.parent1_crn&&`CRN: ${f.parent1_crn} · `}
                    Income: ${(f.combined_income||0).toLocaleString()} · 
                    CCS: <span style={{color:P,fontWeight:700}}>{f.ccs_percentage}%</span>
                    {f.higher_rate_eligible?" · Higher rate":""}
                    {f.accs_eligible?" · ACCS":""}
                    {f.first_nations?" · First Nations":""}
                  </div>
                  {!f.immunisation_compliant&&(
                    <div style={{fontSize:11,color:DANGER,marginTop:2}}>⚠ Immunisation not compliant — CCS withheld</div>
                  )}
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <div style={{textAlign:"right",fontSize:12}}>
                    <div style={{fontWeight:700,color:P}}>{f.subsidised_hours_fortnight}h/fortnight</div>
                    <div style={{color:MUTED}}>subsidised</div>
                  </div>
                  <button onClick={()=>setupFor({id:f.child_id,first_name:f.first_name,last_name:f.last_name})}
                    style={{...btnG,padding:"6px 12px",fontSize:12}}>Edit</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}

// ─── SESSION REPORTS ──────────────────────────────────────────────────────────
function ReportsTab() {
  const [reports,setReports]=useState([]);
  const [summary,setSummary]=useState(null);
  const [fortnight,setFortnight]=useState(getFortnightStart());
  const [loading,setLoading]=useState(false);
  const [generating,setGenerating]=useState(false);
  const [pradoStatus,setProdaStatus]=useState(null);

  const load=useCallback(()=>{
    setLoading(true);
    Promise.all([
      API(`/api/ccs/session-reports?status=pending&limit=100`),
      API(`/api/ccs/fortnightly-summary?fortnight_start=${fortnight}`),
      API("/api/integrations/proda/status"),
    ]).then(([rr,sr,pr])=>{
      setReports(rr.reports||[]);
      setSummary(sr);
      setPradoStatus(pr);
    }).finally(()=>setLoading(false));
  },[fortnight]);
  useEffect(()=>{load();},[load]);

  const generateAll=async()=>{
    setGenerating(true);
    await API("/api/ccs/session-reports/generate-all",{method:"POST",body:{fortnight_start:fortnight}}).catch(e=>console.error('API error:',e));
    load();
    setGenerating(false);
  };

  const markSubmitted=async(id)=>{
    const ref=prompt("Enter submission reference number (from PEP):");
    if(!ref)return;
    await API(`/api/ccs/session-reports/${id}/submit`,{method:"PUT",body:{submission_ref:ref}}).catch(e=>console.error('API error:',e));
    load();
  };

  // Build past 8 fortnights for picker
  const fortnights=[];
  let d=new Date();
  for(let i=0;i<8;i++){
    fortnights.push(getFortnightStart(d));
    d=new Date(d.getTime()-14*86400000);
  }
  const uniqueFN=[...new Set(fortnights)];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* PRODA status banner */}
      {pradoStatus&&(
        <div style={{...card,background:pradoStatus.setup_complete?"#F0FDF4":"#FFF7ED",
          border:`1px solid ${pradoStatus.setup_complete?"#A5D6A7":"#FDE68A"}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontWeight:700,fontSize:13,color:pradoStatus.setup_complete?OK:WARN}}>
                {pradoStatus.setup_complete?"✓ PRODA Connected — Auto-submission ready":"⚠ PRODA Not Fully Configured"}
              </div>
              {!pradoStatus.setup_complete&&(
                <div style={{fontSize:12,color:MUTED,marginTop:4}}>
                  {pradoStatus.next_steps?.[0]} · 
                  <a href={pradoStatus.pep_url} target="_blank" rel="noreferrer" style={{color:INFO}}>
                    Open Provider Entry Point (PEP) ↗
                  </a>
                </div>
              )}
            </div>
            {!pradoStatus.setup_complete&&(
              <button onClick={()=>window.dispatchEvent(new CustomEvent("c360-navigate",{detail:{tab:"ccs_integrations"}}))}
                style={{...btnS,fontSize:12,padding:"6px 14px"}}>Configure PRODA</button>
            )}
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <div>
          <label style={lbl}>Fortnight</label>
          <select value={fortnight} onChange={e=>setFortnight(e.target.value)} style={{...inp,width:"auto"}}>
            {uniqueFN.map(f=>{
              const end=new Date(new Date(f).getTime()+13*86400000).toISOString().split("T")[0];
              return <option key={f} value={f}>{f} → {end}</option>;
            })}
          </select>
        </div>
        <button style={{...btnP,marginTop:16}} onClick={generateAll} disabled={generating}>
          {generating?"Generating…":"⚡ Generate All Reports"}
        </button>
        <div style={{fontSize:12,color:MUTED,marginTop:16}}>
          Generates session reports from attendance data for all enrolled children
        </div>
      </div>

      {/* Fortnight summary */}
      {summary&&summary.totals&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {[
            ["Children",summary.totals.children,DARK],
            ["Total Fees",fmt$(summary.totals.total_fee),DARK],
            ["CCS Amount",fmt$(summary.totals.total_ccs),OK],
            ["Total Gap Fees",fmt$(summary.totals.total_gap),P],
          ].map(([l,v,c])=>(
            <div key={l} style={{...card,textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:900,color:c}}>{v}</div>
              <div style={{fontSize:11,color:MUTED,marginTop:4}}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Report rows */}
      <div style={card}>
        <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:14}}>
          Session Reports — {fortnight}
        </div>
        {loading?<div style={{color:MUTED}}>Loading…</div>
          :summary?.rows?.length===0?<div style={{color:MUTED,textAlign:"center",padding:"20px 0"}}>No session reports for this fortnight. Click "Generate All Reports" above.</div>
          :(
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead><tr style={{background:"#F8F5FC"}}>
                {["Child","Sessions","Hours","Full Fee","CCS","Gap Fee","Absences","Status",""].map(h=>(
                  <th key={h} style={{padding:"8px 10px",textAlign:"left",color:MUTED,fontWeight:700,fontSize:11}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {(summary?.rows||[]).map(r=>(
                  <tr key={r.id} style={{borderBottom:"1px solid #F0EBF8"}}>
                    <td style={{padding:"8px 10px",fontWeight:600}}>{r.first_name} {r.last_name}</td>
                    <td style={{padding:"8px 10px",color:MUTED}}>{r.sessions}</td>
                    <td style={{padding:"8px 10px"}}>{r.total_hours?.toFixed(1)}h</td>
                    <td style={{padding:"8px 10px"}}>{r.total_fee}</td>
                    <td style={{padding:"8px 10px",color:OK,fontWeight:600}}>{r.ccs_amount}</td>
                    <td style={{padding:"8px 10px",fontWeight:700,color:P}}>{r.gap_fee}</td>
                    <td style={{padding:"8px 10px",color:r.absences>0?WARN:MUTED}}>{r.absences}</td>
                    <td style={{padding:"8px 10px"}}>
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:700,
                        background:r.status==="submitted"?"#F0FDF4":r.status==="pending"?"#FFFBEB":"#F5F5F5",
                        color:r.status==="submitted"?OK:r.status==="pending"?WARN:MUTED}}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{padding:"8px 10px"}}>
                      {r.status==="pending"&&(
                        <button onClick={()=>markSubmitted(r.id)}
                          style={{padding:"4px 10px",borderRadius:7,border:`1px solid ${OK}`,background:"#F0FDF4",color:OK,cursor:"pointer",fontSize:11,fontWeight:600}}>
                          Mark Submitted
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>

      <div style={{...card,background:"#F0F9FF",border:"1px solid #BAE6FD"}}>
        <div style={{fontWeight:700,fontSize:13,color:INFO,marginBottom:6}}>📋 How to submit to CCSS</div>
        <ol style={{margin:0,paddingLeft:20,fontSize:13,color:DARK,lineHeight:2}}>
          <li>Generate reports above to build the fortnightly session data</li>
          <li>Log in to the <a href="https://online.humanservices.gov.au/childcareprovider/" target="_blank" rel="noreferrer" style={{color:INFO}}>Provider Entry Point (PEP) ↗</a></li>
          <li>Submit session reports for each child (or use your registered software activation code)</li>
          <li>Return here and click "Mark Submitted" with the PEP reference number</li>
          <li>To enable auto-submission: <strong>register Childcare360</strong> by emailing <a href="mailto:ccs.software.provider.support@servicesaustralia.gov.au" style={{color:INFO}}>ccs.software.provider.support@servicesaustralia.gov.au</a></li>
        </ol>
      </div>
    </div>
  );
}

// ─── INTEGRATIONS HUB ─────────────────────────────────────────────────────────
function IntegrationsTab() {
  const [integrations,setIntegrations]=useState([]);
  const [selected,setSelected]=useState(null);
  const [creds,setCreds]=useState({});
  const [saving,setSaving]=useState(false);
  const [abnInput,setAbnInput]=useState("");
  const [abnResult,setAbnResult]=useState(null);
  const [nerData,setNerData]=useState(null);

  useEffect(()=>{
    API("/api/integrations/registry").then(r=>setIntegrations(r.integrations||[]));
    API("/api/integrations/ner/educators").then(r=>setNerData(r));
  },[]);

  const loadCreds=async(key)=>{
    const r=await API(`/api/integrations/credentials/${key}`);
    setCreds(r);
    setSelected(key);
  };

  const saveCreds=async(key)=>{
    setSaving(true);
    await API(`/api/integrations/credentials/${key}`,{method:"POST",body:creds});
    await API("/api/integrations/registry").then(r=>setIntegrations(r.integrations||[]));
    setSaving(false);
    setSelected(null);
  };

  const validateABN=async()=>{
    const r=await API("/api/integrations/validate-abn",{method:"POST",body:{abn:abnInput}});
    setAbnResult(r);
  };

  const STATUS_COLORS={not_configured:MUTED,configured:WARN,connected:OK,error:DANGER};
  const STATUS_ICONS={not_configured:"○",configured:"◎",connected:"●",error:"✗"};
  const TYPE_COLORS={api_available:OK,registered_software:WARN,web_portal:INFO,manual_tracking:MUTED,manual_upload:MUTED};
  const TYPE_LABELS={api_available:"API Available",registered_software:"Requires Registration",web_portal:"Web Portal",manual_tracking:"Manual Tracking",manual_upload:"Manual Upload"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:13,color:MUTED}}>
        Connect Childcare360 to Australian government systems. Most require formal registration or manual processes.
      </div>

      {/* Integration cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:14}}>
        {integrations.map(integ=>(
          <div key={integ.key} style={{...card,border:`1px solid ${integ.enabled?"#C4B5FD":"#EDE8F4"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:DARK}}>{integ.name}</div>
                <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,marginTop:4,display:"inline-block",
                  background:(TYPE_COLORS[integ.status_type]||MUTED)+"22",color:TYPE_COLORS[integ.status_type]||MUTED}}>
                  {TYPE_LABELS[integ.status_type]||integ.status_type}
                </span>
              </div>
              <span style={{fontSize:20,color:STATUS_COLORS[integ.status]||MUTED}}>
                {STATUS_ICONS[integ.status]||"○"}
              </span>
            </div>
            <div style={{fontSize:12,color:MUTED,marginBottom:12,lineHeight:1.5}}>{integ.description}</div>
            {integ.note&&(
              <div style={{fontSize:11,color:INFO,padding:"6px 10px",background:"#F0F9FF",borderRadius:6,marginBottom:10}}>
                ⓘ {integ.note}
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              {integ.can_automate&&(
                <button onClick={()=>loadCreds(integ.key)} style={{...btnP,fontSize:12,padding:"6px 14px"}}>Configure</button>
              )}
              {!integ.can_automate&&integ.portal_url&&(
                <a href={integ.portal_url||integ.pep_url||integ.ner_url} target="_blank" rel="noreferrer"
                  style={{...btnS,fontSize:12,padding:"6px 14px",textDecoration:"none"}}>
                  Open Portal ↗
                </a>
              )}
              {integ.fields?.length>0&&(
                <button onClick={()=>loadCreds(integ.key)} style={{...btnS,fontSize:12,padding:"6px 14px"}}>
                  {integ.configured?"Update Credentials":"Add Credentials"}
                </button>
              )}
              {integ.contact&&(
                <a href={`mailto:${integ.contact}`} style={{...btnG,fontSize:12,padding:"6px 14px",textDecoration:"none"}}>
                  Contact ✉
                </a>
              )}
            </div>
            {/* Setup steps */}
            {selected===integ.key&&(
              <div style={{marginTop:14,borderTop:"1px solid #EDE8F4",paddingTop:14}}>
                <div style={{fontWeight:700,fontSize:12,color:MUTED,marginBottom:8}}>SETUP STEPS</div>
                <ol style={{margin:"0 0 14px",paddingLeft:18,fontSize:12,color:DARK,lineHeight:1.8}}>
                  {integ.setup_steps.map((s,i)=><li key={i}>{s}</li>)}
                </ol>
                {integ.fields?.map(f=>(
                  <div key={f} style={{marginBottom:8}}>
                    <label style={lbl}>{f.replace(/_/g," ")}</label>
                    <input value={creds[f]||""} onChange={e=>setCreds(p=>({...p,[f]:e.target.value}))}
                      type={f.includes("secret")||f.includes("key")||f.includes("password")?"password":"text"}
                      style={inp} placeholder={`Enter ${f.replace(/_/g," ")}`}/>
                  </div>
                ))}
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <button style={btnP} onClick={()=>saveCreds(integ.key)} disabled={saving}>{saving?"Saving…":"Save"}</button>
                  <button style={btnS} onClick={()=>setSelected(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ABN Validator */}
      <div style={card}>
        <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:12}}>🔍 ABN Validator</div>
        <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
          <div style={{flex:1}}>
            <label style={lbl}>ABN (Australian Business Number)</label>
            <input value={abnInput} onChange={e=>setAbnInput(e.target.value)} style={inp}
              placeholder="e.g. 51 824 753 556" onKeyDown={e=>e.key==="Enter"&&validateABN()}/>
          </div>
          <button style={btnP} onClick={validateABN}>Validate ABN</button>
        </div>
        {abnResult&&(
          <div style={{marginTop:12,padding:"12px 16px",borderRadius:10,
            background:abnResult.valid?"#F0FDF4":"#FEF2F2",
            border:`1px solid ${abnResult.valid?"#A5D6A7":"#FCA5A5"}`}}>
            <div style={{fontWeight:700,color:abnResult.valid?OK:DANGER}}>
              {abnResult.valid?"✓ Valid ABN":"✗ Invalid ABN"}: {abnResult.formatted||abnResult.abn}
            </div>
            {abnResult.abr_data?.EntityName&&(
              <div style={{fontSize:13,color:DARK,marginTop:4}}>
                <strong>{abnResult.abr_data.EntityName}</strong>
                {abnResult.abr_data.EntityTypeName&&` · ${abnResult.abr_data.EntityTypeName}`}
                {abnResult.abr_data.AbnStatus&&` · Status: ${abnResult.abr_data.AbnStatus}`}
                {abnResult.abr_data.AddressState&&` · ${abnResult.abr_data.AddressState}`}
              </div>
            )}
          </div>
        )}
      </div>

      {/* NER/WWCC educator status */}
      {nerData&&(
        <div style={card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontWeight:700,fontSize:14,color:DARK}}>🪪 WWCC / Working With Children Check Status</div>
            <div style={{display:"flex",gap:8}}>
              {[["Expired",nerData.summary?.expired,DANGER],["Expiring Soon",nerData.summary?.expiring_soon,WARN],
                ["Missing",nerData.summary?.missing,WARN],["Current",nerData.summary?.current,OK]].map(([l,v,c])=>
                v>0&&<span key={l} style={{fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:20,background:c+"22",color:c}}>{v} {l}</span>
              )}
            </div>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{background:"#F8F5FC"}}>
              {["Educator","Qualification","WWCC Number","State","Expiry","Status","Verify"].map(h=>(
                <th key={h} style={{padding:"8px 10px",textAlign:"left",color:MUTED,fontWeight:700,fontSize:11}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {nerData.educators?.map(e=>(
                <tr key={e.id} style={{borderBottom:"1px solid #F0EBF8",
                  background:e.wwcc_status==="expired"?"#FFF5F5":e.wwcc_status==="expiring_soon"?"#FFFBEB":"transparent"}}>
                  <td style={{padding:"8px 10px",fontWeight:600}}>{e.first_name} {e.last_name}</td>
                  <td style={{padding:"8px 10px",color:MUTED,fontSize:12}}>{e.qualification}</td>
                  <td style={{padding:"8px 10px",fontFamily:"monospace"}}>{e.wwcc_number||<span style={{color:DANGER}}>Missing</span>}</td>
                  <td style={{padding:"8px 10px"}}>{e.wwcc_state||"—"}</td>
                  <td style={{padding:"8px 10px",color:e.wwcc_status==="expired"?DANGER:e.wwcc_status==="expiring_soon"?WARN:MUTED}}>
                    {e.wwcc_expiry||"—"}
                  </td>
                  <td style={{padding:"8px 10px"}}>
                    <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,
                      background:e.wwcc_status==="current"?"#F0FDF4":e.wwcc_status==="expired"?"#FEF2F2":"#FFFBEB",
                      color:e.wwcc_status==="current"?OK:e.wwcc_status==="expired"?DANGER:WARN}}>
                      {e.wwcc_status?.replace("_"," ")}
                    </span>
                  </td>
                  <td style={{padding:"8px 10px"}}>
                    {nerData.state_portals?.[e.wwcc_state]&&(
                      <a href={nerData.state_portals[e.wwcc_state]} target="_blank" rel="noreferrer"
                        style={{fontSize:11,color:INFO,textDecoration:"none"}}>Verify ↗</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
