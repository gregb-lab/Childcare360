/**
 * InvoicingFullModule.jsx — v2.21.0
 * Complete invoicing & payments:
 *   📋 Invoices      — List, create, edit, issue, pay
 *   ⚡ Bulk Generate — Auto-generate from attendance
 *   💳 Payments      — Online requests, payment plans, credit notes
 *   💰 Fee Schedules — Room fees, child overrides
 *   📄 Statements    — Per-child account view
 *   ⚙️  Settings      — Invoice template, bank details
 */
import { useState, useEffect, useCallback, useRef } from "react";

const API = (p, o={}) => {
  const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
  return fetch(p,{headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})},
    method:o.method||"GET",...(o.body?{body:JSON.stringify(o.body)}:{})}).then(r=>r.json());
};

const P="#7C3AED",PL="#EDE4F0",DARK="#3D3248",MU="#8A7F96";
const OK="#16A34A",WA="#D97706",DA="#DC2626",IN="#0284C7";
const card={background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"18px 22px"};
const bp={padding:"9px 18px",borderRadius:9,border:"none",background:P,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13};
const bs={padding:"9px 18px",borderRadius:9,border:`1px solid ${P}`,background:"#fff",color:P,fontWeight:600,cursor:"pointer",fontSize:13};
const inp={padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:13,width:"100%",boxSizing:"border-box",fontFamily:"inherit"};
const lbl={fontSize:11,color:MU,fontWeight:700,display:"block",marginBottom:4,textTransform:"uppercase"};

const fmt$=n=>`$${(parseFloat(n)||0).toFixed(2)}`;
const fmtD=d=>d?new Date(d.length===10?d+"T12:00":d).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):"—";
const fmtShort=d=>d?new Date(d.length===10?d+"T12:00":d).toLocaleDateString("en-AU",{day:"numeric",month:"short"}):"—";

const STATUS_C={draft:MU,issued:IN,overdue:DA,paid:OK,cancelled:"#6B7280"};
const STATUS_BG={draft:"#F5F5F5",issued:"#EFF6FF",overdue:"#FEF2F2",paid:"#F0FDF4",cancelled:"#F5F5F5"};

const TABS=[
  {id:"invoices",  icon:"📋",label:"Invoices"},
  {id:"bulk",      icon:"⚡",label:"Bulk Generate"},
  {id:"payments",  icon:"💳",label:"Payments & Plans"},
  {id:"fees",      icon:"💰",label:"Fee Schedules"},
  {id:"statements",icon:"📄",label:"Statements"},
  {id:"settings",  icon:"⚙️", label:"Settings"},
];

export default function InvoicingFullModule() {
  const [tab,setTab]=useState("invoices");
  const [summary,setSummary]=useState(null);

  const loadSummary=useCallback(()=>{
    API("/api/invoicing-full/summary").then(setSummary).catch(()=>{});
  },[]);
  useEffect(()=>{loadSummary();},[loadSummary]);

  return (
    <div style={{padding:"24px 28px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <span style={{fontSize:28}}>📋</span>
          <div>
            <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>Invoicing & Payments</h1>
            <p style={{margin:"3px 0 0",fontSize:13,color:MU}}>Invoices · Payments · Fee schedules · Statements</p>
          </div>
        </div>
        {summary&&(
          <div style={{display:"flex",gap:12}}>
            {[
              [fmt$(summary.outstanding),"Outstanding",DA],
              [fmt$(summary.collected_this_month),"Collected MTD",OK],
              [`${summary.overdue||0} overdue`,"Invoices",WA],
            ].map(([v,l,c])=>(
              <div key={l} style={{textAlign:"right"}}>
                <div style={{fontSize:18,fontWeight:900,color:c}}>{v}</div>
                <div style={{fontSize:10,color:MU}}>{l}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{display:"flex",gap:6,marginBottom:20,borderBottom:"1px solid #EDE8F4",paddingBottom:12,overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"8px 14px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,
              fontWeight:tab===t.id?700:500,background:tab===t.id?P:"transparent",
              color:tab===t.id?"#fff":MU,whiteSpace:"nowrap"}}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab==="invoices"   && <InvoicesTab onRefresh={loadSummary}/>}
      {tab==="bulk"       && <BulkTab onRefresh={loadSummary}/>}
      {tab==="payments"   && <PaymentsTab onRefresh={loadSummary}/>}
      {tab==="fees"       && <FeesTab />}
      {tab==="statements" && <StatementsTab />}
      {tab==="settings"   && <SettingsTab />}
    </div>
  );
}

// ─── INVOICES TAB ─────────────────────────────────────────────────────────────
function InvoicesTab({onRefresh}) {
  const [invoices,setInvoices]=useState([]);
  const [total,setTotal]=useState(0);
  const [filter,setFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);
  const [active,setActive]=useState(null);
  const [detail,setDetail]=useState(null);
  const [showCreate,setShowCreate]=useState(false);
  const [children,setChildren]=useState([]);
  const [rooms,setRooms]=useState([]);
  const [payAmt,setPayAmt]=useState("");
  const [payMethod,setPayMethod]=useState("bank_transfer");
  const [submitting,setSubmitting]=useState(false);
  const PER_PAGE=20;

  const [newForm,setNewForm]=useState({
    child_id:"",period_start:"",period_end:"",due_date:"",notes:"",
    line_items:[{description:"Childcare fees",quantity:1,unit_price:"",item_type:"fee",date:""}]
  });

  const load=useCallback(()=>{
    const status=filter==="all"?"":filter;
    API(`/api/invoicing-full/invoices?status=${status}&search=${search}&limit=${PER_PAGE}&offset=${(page-1)*PER_PAGE}`)
      .then(r=>{setInvoices(r.invoices||[]);setTotal(r.total||0);});
  },[filter,search,page]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{
    Promise.all([API("/api/children/simple"),API("/api/rooms/simple")]).then(([c,r])=>{
      setChildren(Array.isArray(c)?c:[]);
      setRooms(Array.isArray(r)?r:[]);
    });
  },[]);

  const openDetail=async(id)=>{
    setActive(id);
    const r=await API(`/api/invoicing-full/invoices/${id}`);
    setDetail(r);
  };

  const issue=async(id)=>{
    await API(`/api/invoicing-full/invoices/${id}/issue`,{method:"POST"});
    load();openDetail(id);onRefresh?.();
  };

  const recordPayment=async(id,amount,method)=>{
    const r=await API(`/api/invoicing-full/invoices/${id}/pay`,{method:"POST",body:{amount,method}});
    if(r.ok){load();openDetail(id);onRefresh?.();}
    else window.showToast(r.error, 'error');
  };

  const createInvoice=async(e)=>{
    e?.preventDefault();
    e?.stopPropagation();
    if(submitting)return;
    setSubmitting(true);
    try{
      const r=await API("/api/invoicing-full/invoices",{method:"POST",body:newForm});
      if(r.ok){setShowCreate(false);load();onRefresh?.();openDetail(r.id);}
      else window.showToast(r.error, 'error');
    }finally{setSubmitting(false);}
  };

  const addLineItem=()=>setNewForm(p=>({...p,line_items:[...p.line_items,{description:"",quantity:1,unit_price:"",item_type:"fee",date:""}]}));
  const removeLineItem=i=>setNewForm(p=>({...p,line_items:p.line_items.filter((_,idx)=>idx!==i)}));
  const updateLineItem=(i,k,v)=>setNewForm(p=>({...p,line_items:p.line_items.map((l,idx)=>idx===i?{...l,[k]:v}:l)}));

  const printInvoice=()=>{
    if(!detail)return;
    const {invoice:inv,line_items,template}=detail;
    const colour=template?.colour||"#7C3AED";
    const html=`<!DOCTYPE html><html><head><title>Invoice ${inv.invoice_number}</title>
    <style>body{font-family:system-ui,sans-serif;max-width:700px;margin:40px auto;color:#333}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px}
    .logo{font-size:24px;font-weight:900;color:${colour}}
    .inv-title{text-align:right}.inv-title h2{margin:0;color:${colour};font-size:28px}
    table{width:100%;border-collapse:collapse;margin:24px 0}
    th{background:${colour};color:#fff;padding:8px 12px;text-align:left}
    td{padding:8px 12px;border-bottom:1px solid #eee}
    .totals{margin-left:auto;width:300px}.totals td{border:none;padding:4px 12px}
    .total-row td{font-weight:700;font-size:16px;border-top:2px solid ${colour}}
    .ccs-box{background:#f0f8ff;padding:12px;border-radius:8px;margin:16px 0;font-size:13px}
    .footer{margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#666}
    @media print{body{margin:0}}</style></head><body>
    <div class="header">
      <div class="logo">Childcare360</div>
      <div class="inv-title"><h2>INVOICE</h2><p>${inv.invoice_number}<br>Issued: ${fmtD(inv.issued_at||inv.created_at)}<br>Due: ${fmtD(inv.due_date)}</p></div>
    </div>
    <h3>${inv.first_name} ${inv.last_name}</h3>
    <p>${inv.room_name||""} · Period: ${fmtD(inv.period_start)} – ${fmtD(inv.period_end)}</p>
    <table><thead><tr><th>Description</th><th>Date</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
    <tbody>${line_items.map(li=>`<tr><td>${li.description}</td><td>${li.date?fmtShort(li.date):""}</td><td>${li.quantity}</td><td>${fmt$(li.unit_price_cents/100)}</td><td>${fmt$(li.total_cents/100)}</td></tr>`).join("")}</tbody></table>
    <table class="totals"><tbody>
    <tr><td>Gross Fees</td><td>${fmt$(inv.total_fee)}</td></tr>
    ${inv.ccs_amount>0?`<tr><td>Less CCS Subsidy</td><td style="color:green">–${fmt$(inv.ccs_amount)}</td></tr>`:""}
    <tr class="total-row"><td>Amount Due (Gap Fee)</td><td>${fmt$(inv.amount_due)}</td></tr>
    ${inv.amount_paid>0?`<tr><td>Paid</td><td style="color:green">–${fmt$(inv.amount_paid)}</td></tr>`:""}
    </tbody></table>
    ${template?.bank_bsb?`<div class="footer"><strong>Payment details:</strong> ${template.bank_name||""} BSB: ${template.bank_bsb} Account: ${template.bank_account||""}<br>${template.payment_terms||""}</div>`:""}
    <script>window.print()</script></body></html>`;
    const w=window.open("","_blank");w.document.write(html);w.document.close();
  };

  return (
    <div style={{display:"flex",gap:20}}>
      {/* Invoice list */}
      <div style={{flex:1}}>
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
          <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
            placeholder="Search child or invoice number…" style={{...inp,flex:1,minWidth:180}}/>
          <div style={{display:"flex",gap:5}}>
            {["all","draft","issued","overdue","paid"].map(s=>(
              <button key={s} onClick={()=>{setFilter(s);setPage(1);}}
                style={{padding:"6px 12px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,
                  textTransform:"capitalize",background:filter===s?P:"#F0EBF8",color:filter===s?"#fff":P}}>
                {s}
              </button>
            ))}
          </div>
          <button style={bp} onClick={()=>setShowCreate(v=>!v)}>+ New Invoice</button>
          <button style={bs} onClick={()=>{
            if(!invoices.length)return;
            const hdr=["Invoice #","Child Name","Period Start","Period End","Due Date","Status","Total ($)","CCS ($)","Gap Fee ($)","Created Date"];
            const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
            const rows=invoices.map(inv=>[inv.invoice_number,(inv.first_name||"")+" "+(inv.last_name||""),inv.period_start,inv.period_end,inv.due_date,inv.status,(parseFloat(inv.total_fee)||0).toFixed(2),(parseFloat(inv.ccs_amount)||0).toFixed(2),(parseFloat(inv.gap_fee)||0).toFixed(2),inv.created_at?.split("T")[0]||""].map(esc));
            const csv=[hdr.join(","),...rows.map(r=>r.join(","))].join("\n");
            const blob=new Blob([csv],{type:"text/csv"});
            const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="invoices.csv";a.click();
          }}>⬇ Export CSV</button>
        </div>

        {showCreate&&(
          <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE",marginBottom:14}}>
            <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:14}}>New Invoice</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <div style={{gridColumn:"span 2"}}>
                <label style={lbl}>Child *</label>
                <select value={newForm.child_id} onChange={e=>setNewForm(p=>({...p,child_id:e.target.value}))} style={inp}>
                  <option value="">Select child…</option>
                  {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.room_name||"no room"}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Period Start</label>
                <input type="date" value={newForm.period_start} onChange={e=>setNewForm(p=>({...p,period_start:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={lbl}>Period End</label>
                <input type="date" value={newForm.period_end} onChange={e=>setNewForm(p=>({...p,period_end:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={lbl}>Due Date</label>
                <input type="date" value={newForm.due_date} onChange={e=>setNewForm(p=>({...p,due_date:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={lbl}>Notes</label>
                <input value={newForm.notes} onChange={e=>setNewForm(p=>({...p,notes:e.target.value}))} style={inp}/>
              </div>
            </div>

            {/* Line items */}
            <div style={{fontWeight:700,fontSize:12,color:DARK,marginBottom:8}}>Line Items</div>
            {newForm.line_items.map((item,i)=>(
              <div key={i} style={{display:"grid",gridTemplateColumns:"3fr 1fr 1fr 1fr auto",gap:6,marginBottom:6,alignItems:"center"}}>
                <input value={item.description} onChange={e=>updateLineItem(i,"description",e.target.value)} style={inp} placeholder="Description"/>
                <input type="date" value={item.date} onChange={e=>updateLineItem(i,"date",e.target.value)} style={inp}/>
                <input type="number" value={item.quantity} onChange={e=>updateLineItem(i,"quantity",e.target.value)} style={inp} placeholder="Qty"/>
                <input type="number" value={item.unit_price} onChange={e=>updateLineItem(i,"unit_price",e.target.value)} style={inp} placeholder="Rate $"/>
                <button onClick={()=>removeLineItem(i)} style={{background:"none",border:"none",cursor:"pointer",color:DA,fontSize:18}}>×</button>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <button onClick={addLineItem} style={{...bs,fontSize:11,padding:"5px 12px"}}>+ Add Line</button>
              <div style={{flex:1}}/>
              <div style={{fontSize:14,fontWeight:700,color:DARK}}>
                Total: {fmt$(newForm.line_items.reduce((s,l)=>s+(parseFloat(l.unit_price)||0)*(parseFloat(l.quantity)||1),0))}
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:14}}>
              <button style={bp} onClick={createInvoice} disabled={submitting}>{submitting?"Creating…":"Create Invoice"}</button>
              <button style={bs} onClick={()=>setShowCreate(false)}>Cancel</button>
            </div>
          </div>
        )}

        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{background:"#F8F5FC"}}>
            {["Invoice #","Child","Period","Total","CCS","Gap Fee","Due","Status",""].map(h=>(
              <th key={h} style={{padding:"8px 10px",textAlign:"left",color:MU,fontWeight:700,fontSize:11}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {invoices.length===0
              ? <tr><td colSpan={9} style={{padding:"30px",textAlign:"center",color:MU}}>No invoices found</td></tr>
              : invoices.map(inv=>(
                <tr key={inv.id} onClick={()=>openDetail(inv.id)}
                  style={{borderBottom:"1px solid #F0EBF8",cursor:"pointer",background:active===inv.id?"#F3E8FF":"transparent"}}>
                  <td style={{padding:"8px 10px",fontWeight:700,color:P}}>{inv.invoice_number}</td>
                  <td style={{padding:"8px 10px",fontWeight:600,color:DARK}}>{inv.first_name} {inv.last_name}</td>
                  <td style={{padding:"8px 10px",color:MU,fontSize:11}}>{fmtShort(inv.period_start)}–{fmtShort(inv.period_end)}</td>
                  <td style={{padding:"8px 10px"}}>{fmt$(inv.total_fee)}</td>
                  <td style={{padding:"8px 10px",color:OK}}>{inv.ccs_amount>0?`–${fmt$(inv.ccs_amount)}`:"—"}</td>
                  <td style={{padding:"8px 10px",fontWeight:700}}>{fmt$(inv.gap_fee)}</td>
                  <td style={{padding:"8px 10px",color:inv.status==="overdue"?DA:MU,fontSize:12}}>{fmtShort(inv.due_date)}</td>
                  <td style={{padding:"8px 10px"}}>
                    <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,
                      background:STATUS_BG[inv.status]||"#F5F5F5",color:STATUS_C[inv.status]||MU,textTransform:"capitalize"}}>
                      {inv.status}{inv.status==="overdue"&&inv.days_overdue>0?` (${inv.days_overdue}d)`:""}
                    </span>
                  </td>
                  <td style={{padding:"8px 6px"}}>
                    {inv.status==="draft"&&<button onClick={e=>{e.stopPropagation();issue(inv.id);}}
                      style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${IN}`,background:"#EFF6FF",color:IN,cursor:"pointer",fontSize:11,fontWeight:600}}>Issue</button>}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>

        {/* Pagination */}
        {total>PER_PAGE&&(
          <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:14}}>
            <button disabled={page===1} onClick={()=>setPage(p=>p-1)} style={{...bs,padding:"5px 12px",fontSize:12}}>← Prev</button>
            <span style={{padding:"5px 12px",color:MU,fontSize:12}}>Page {page} of {Math.ceil(total/PER_PAGE)}</span>
            <button disabled={page>=Math.ceil(total/PER_PAGE)} onClick={()=>setPage(p=>p+1)} style={{...bs,padding:"5px 12px",fontSize:12}}>Next →</button>
          </div>
        )}
      </div>

      {/* Invoice detail panel */}
      {detail&&(
        <div style={{width:380,flexShrink:0}}>
          <div style={{...card,padding:"16px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:P}}>{detail.invoice?.invoice_number}</div>
                <div style={{fontSize:13,color:DARK,marginTop:2}}>{detail.invoice?.first_name} {detail.invoice?.last_name}</div>
                <div style={{fontSize:11,color:MU}}>{detail.invoice?.room_name}</div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={printInvoice} style={{padding:"5px 10px",borderRadius:7,border:"1px solid #DDD6EE",background:"#F5F5F5",color:MU,cursor:"pointer",fontSize:11}}>🖨️</button>
                <span style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:20,
                  background:STATUS_BG[detail.invoice?.status]||"#F5F5F5",
                  color:STATUS_C[detail.invoice?.status]||MU,textTransform:"capitalize"}}>
                  {detail.invoice?.status}
                </span>
              </div>
            </div>

            <div style={{fontSize:12,color:MU,marginBottom:12}}>
              Period: {fmtD(detail.invoice?.period_start)} – {fmtD(detail.invoice?.period_end)}<br/>
              Due: {fmtD(detail.invoice?.due_date)}
            </div>

            {/* Line items */}
            <div style={{borderTop:"1px solid #F0EBF8",paddingTop:10,marginBottom:10}}>
              {detail.line_items?.map((li,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                  <span style={{color:MU,flex:1}}>{li.description}{li.date?` (${fmtShort(li.date)})`:""}</span>
                  <span style={{fontWeight:li.item_type==="discount"?400:500,color:li.item_type==="discount"?OK:DARK}}>{fmt$(li.total_cents/100)}</span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div style={{borderTop:"2px solid #EDE8F4",paddingTop:10,marginBottom:12}}>
              {[
                ["Gross Fees",detail.invoice?.total_fee,DARK],
                detail.invoice?.ccs_amount>0&&["Less CCS",detail.invoice?.ccs_amount,OK,true],
                ["Gap Fee (Amount Due)",detail.invoice?.amount_due,P],
                detail.invoice?.amount_paid>0&&["Paid",detail.invoice?.amount_paid,OK,true],
                detail.invoice?.amount_paid>0&&["Balance",detail.invoice?.amount_due-detail.invoice?.amount_paid,detail.invoice?.amount_due-detail.invoice?.amount_paid<=0?OK:DA],
              ].filter(Boolean).map(([l,v,c,credit])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",
                  borderTop:l==="Gap Fee (Amount Due)"?"1px solid #EDE8F4":"none",
                  fontWeight:l.includes("Due")||l==="Balance"?700:400}}>
                  <span style={{fontSize:12,color:MU}}>{l}</span>
                  <span style={{fontSize:13,color:c}}>{credit?"–":""}{fmt$(v)}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {detail.invoice?.status==="draft"&&(
                <button onClick={()=>issue(detail.invoice?.id)} style={{...bp,width:"100%"}}>📤 Issue Invoice</button>
              )}
              {["issued","overdue"].includes(detail.invoice?.status)&&(
                  <div style={{background:"#F0FDF4",borderRadius:10,padding:"12px"}}>
                    <div style={{fontWeight:600,fontSize:12,color:OK,marginBottom:8}}>Record Payment</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                      <div>
                        <label style={lbl}>Amount</label>
                        <input type="number" value={payAmt} onChange={e=>setPayAmt(e.target.value)}
                          placeholder={fmt$(detail.invoice?.amount_due-(detail.invoice?.amount_paid||0))}
                          style={inp} step="0.01"/>
                      </div>
                      <div>
                        <label style={lbl}>Method</label>
                        <select value={payMethod} onChange={e=>setPayMethod(e.target.value)} style={inp}>
                          {["bank_transfer","cash","card","direct_debit","bpay"].map(m=>(
                            <option key={m} value={m}>{m.replace("_"," ")}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button onClick={()=>recordPayment(detail.invoice?.id,payAmt||detail.invoice?.amount_due-(detail.invoice?.amount_paid||0),payMethod)}
                      style={{...bp,width:"100%",marginTop:8,background:OK,fontSize:12}}>
                      ✓ Record Payment
                    </button>
                  </div>
              )}
            </div>

            {/* Payment history */}
            {detail.payments?.length>0&&(
              <div style={{marginTop:14,borderTop:"1px solid #F0EBF8",paddingTop:10}}>
                <div style={{fontWeight:700,fontSize:11,color:MU,marginBottom:6}}>PAYMENT HISTORY</div>
                {detail.payments.map((p,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                    <span style={{color:MU}}>{fmtShort(p.payment_date)} · {p.method?.replace("_"," ")}</span>
                    <span style={{color:OK,fontWeight:600}}>{fmt$(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BULK GENERATE TAB ────────────────────────────────────────────────────────
function BulkTab({onRefresh}) {
  const [rooms,setRooms]=useState([]);
  const [form,setForm]=useState({period_start:"",period_end:"",room_ids:[],include_ccs:true});
  const [result,setResult]=useState(null);
  const [running,setRunning]=useState(false);

  useEffect(()=>{
    API("/api/rooms/simple").then(r=>setRooms(Array.isArray(r)?r:[]));
    // Default to last fortnight
    const end=new Date();end.setDate(end.getDate()-(end.getDay()===0?0:end.getDay()));
    const start=new Date(end);start.setDate(end.getDate()-13);
    setForm(p=>({...p,period_start:start.toISOString().split("T")[0],period_end:end.toISOString().split("T")[0]}));
  },[]);

  const run=async()=>{
    setRunning(true);
    const r=await API("/api/invoicing-full/bulk-generate",{method:"POST",body:form}).catch(e=>console.error('API error:',e));
    setResult(r);setRunning(false);onRefresh?.();
  };

  return (
    <div style={{maxWidth:700}}>
      <div style={{...card,marginBottom:16,background:"#F3E8FF",border:"1px solid #C4B5FD",padding:"14px 18px"}}>
        <div style={{fontWeight:700,fontSize:14,color:P,marginBottom:4}}>⚡ Auto-Generate Invoices from Attendance</div>
        <p style={{fontSize:13,color:MU,margin:0}}>
          Generates one invoice per child based on attendance sessions in the period.
          Applies CCS automatically for families with CCS details on file. Skips children with existing invoices for the period.
        </p>
      </div>

      <div style={{...card,marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          <div>
            <label style={lbl}>Period Start *</label>
            <input type="date" value={form.period_start} onChange={e=>setForm(p=>({...p,period_start:e.target.value}))} style={inp}/>
          </div>
          <div>
            <label style={lbl}>Period End *</label>
            <input type="date" value={form.period_end} onChange={e=>setForm(p=>({...p,period_end:e.target.value}))} style={inp}/>
          </div>
          <div style={{gridColumn:"span 2"}}>
            <label style={lbl}>Rooms (blank = all rooms)</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
              {rooms.map(r=>(
                <label key={r.id} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",
                  padding:"6px 12px",borderRadius:20,fontSize:12,fontWeight:600,
                  border:`1px solid ${form.room_ids.includes(r.id)?P+"80":"#DDD6EE"}`,
                  background:form.room_ids.includes(r.id)?PL:"transparent",color:DARK}}>
                  <input type="checkbox" checked={form.room_ids.includes(r.id)}
                    onChange={e=>setForm(p=>({...p,room_ids:e.target.checked?[...p.room_ids,r.id]:p.room_ids.filter(x=>x!==r.id)}))}
                    style={{display:"none"}}/>
                  {r.name}
                </label>
              ))}
            </div>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
            <input type="checkbox" checked={form.include_ccs} onChange={e=>setForm(p=>({...p,include_ccs:e.target.checked}))}/>
            Apply CCS subsidy automatically
          </label>
        </div>
        <button onClick={run} disabled={running||!form.period_start||!form.period_end}
          style={{...bp,fontSize:14,padding:"12px 24px"}}>
          {running?"Generating…":"⚡ Generate Invoices"}
        </button>
      </div>

      {result&&(
        <div style={{...card,background:result.error?"#FEF2F2":"#F0FDF4",
          border:`1px solid ${result.error?DA+"40":OK+"40"}`}}>
          {result.error
            ? <div style={{color:DA,fontWeight:700}}>Error: {result.error}</div>
            : <>
              <div style={{fontWeight:700,fontSize:16,color:OK,marginBottom:8}}>✓ Done!</div>
              <div style={{fontSize:14,color:DARK}}>
                <strong style={{color:OK}}>{result.created}</strong> invoices created
                {result.skipped>0&&<span style={{color:MU}}>, {result.skipped} skipped (already exists)</span>}
              </div>
              <p style={{fontSize:12,color:MU,marginTop:8}}>
                Period: {fmtD(result.period_start)} – {fmtD(result.period_end)}.
                Go to Invoices tab to review and issue them.
              </p>
            </>
          }
        </div>
      )}
    </div>
  );
}

// ─── PAYMENTS & PLANS TAB ─────────────────────────────────────────────────────
function PaymentsTab({onRefresh}) {
  const [plans,setPlans]=useState([]);
  const [credits,setCredits]=useState([]);
  const [children,setChildren]=useState([]);
  const [view,setView]=useState("plans");
  const [showNewPlan,setShowNewPlan]=useState(false);
  const [showNewCredit,setShowNewCredit]=useState(false);
  const [planForm,setPlanForm]=useState({child_id:"",total_amount:"",instalment_amount:"",frequency:"fortnightly",start_date:""});
  const [creditForm,setCreditForm]=useState({child_id:"",amount:"",reason:""});

  const load=useCallback(()=>{
    Promise.all([
      API("/api/invoicing-full/payment-plans"),
      API("/api/invoicing-full/credit-notes"),
      API("/api/children/simple"),
    ]).then(([p,c,ch])=>{
      setPlans(p.plans||[]);setCredits(c.credits||[]);
      setChildren(Array.isArray(ch)?ch:[]);
    });
  },[]);
  useEffect(()=>{load();},[load]);

  const createPlan=async()=>{
    const r=await API("/api/invoicing-full/payment-plans",{method:"POST",body:planForm}).catch(e=>console.error('API error:',e));
    if(r?.ok){setShowNewPlan(false);load();onRefresh?.();}
  };

  const payInstalment=async(id)=>{
    const r=await API(`/api/invoicing-full/payment-plans/${id}/pay`,{method:"PUT"}).catch(e=>console.error('API error:',e));
    if(r?.ok){load();onRefresh?.();}
  };

  const createCredit=async()=>{
    const r=await API("/api/invoicing-full/credit-notes",{method:"POST",body:creditForm}).catch(e=>console.error('API error:',e));
    if(r?.ok){setShowNewCredit(false);load();}
  };

  const FREQ_L={weekly:"Weekly",fortnightly:"Fortnightly",monthly:"Monthly"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {["plans","credits"].map(v=>(
          <button key={v} onClick={()=>setView(v)}
            style={{padding:"7px 16px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              textTransform:"capitalize",background:view===v?P:"#F0EBF8",color:view===v?"#fff":P}}>
            {v==="plans"?"📅 Payment Plans":`💳 Credit Notes (${credits.filter(c=>c.status==="available").length})`}
          </button>
        ))}
        <button style={{...bs,marginLeft:"auto",fontSize:12}} onClick={()=>view==="plans"?setShowNewPlan(v=>!v):setShowNewCredit(v=>!v)}>
          + {view==="plans"?"New Plan":"New Credit Note"}
        </button>
      </div>

      {view==="plans"&&(
        <>
          {showNewPlan&&(
            <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div style={{gridColumn:"span 2"}}>
                  <label style={lbl}>Child *</label>
                  <select value={planForm.child_id} onChange={e=>setPlanForm(p=>({...p,child_id:e.target.value}))} style={inp}>
                    <option value="">Select child…</option>
                    {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Total Amount ($) *</label>
                  <input type="number" value={planForm.total_amount} onChange={e=>setPlanForm(p=>({...p,total_amount:e.target.value}))} style={inp} placeholder="e.g. 540.00" step="0.01"/>
                </div>
                <div>
                  <label style={lbl}>Instalment Amount ($) *</label>
                  <input type="number" value={planForm.instalment_amount} onChange={e=>setPlanForm(p=>({...p,instalment_amount:e.target.value}))} style={inp} placeholder="e.g. 135.00" step="0.01"/>
                </div>
                <div>
                  <label style={lbl}>Frequency</label>
                  <select value={planForm.frequency} onChange={e=>setPlanForm(p=>({...p,frequency:e.target.value}))} style={inp}>
                    {["weekly","fortnightly","monthly"].map(f=><option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Start Date</label>
                  <input type="date" value={planForm.start_date} onChange={e=>setPlanForm(p=>({...p,start_date:e.target.value}))} style={inp}/>
                </div>
              </div>
              {planForm.total_amount&&planForm.instalment_amount&&(
                <p style={{fontSize:12,color:MU,margin:"10px 0"}}>
                  {Math.ceil(parseFloat(planForm.total_amount)/parseFloat(planForm.instalment_amount))} {planForm.frequency} instalments of {fmt$(planForm.instalment_amount)}
                </p>
              )}
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <button style={bp} onClick={createPlan}>Create Plan</button>
                <button style={bs} onClick={()=>setShowNewPlan(false)}>Cancel</button>
              </div>
            </div>
          )}

          {plans.length===0
            ? <div style={{...card,textAlign:"center",padding:"40px",color:MU}}>No payment plans set up</div>
            : plans.map(plan=>{
              const progress=plan.total_amount_cents>0?plan.amount_paid_cents/plan.total_amount_cents:0;
              return (
                <div key={plan.id} style={{...card,padding:"16px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:14,color:DARK}}>{plan.first_name} {plan.last_name}</div>
                      <div style={{fontSize:12,color:MU}}>
                        {FREQ_L[plan.frequency]} · {fmt$(plan.instalment)} per instalment ·
                        {plan.invoice_number&&` Invoice ${plan.invoice_number}`}
                      </div>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,
                      background:plan.status==="completed"?"#F0FDF4":"#EFF6FF",
                      color:plan.status==="completed"?OK:IN,textTransform:"capitalize"}}>
                      {plan.status}
                    </span>
                  </div>
                  <div style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                      <span style={{color:MU}}>{plan.instalments_paid}/{plan.instalments_total} instalments</span>
                      <span style={{fontWeight:700,color:P}}>{fmt$(plan.paid)} / {fmt$(plan.total)}</span>
                    </div>
                    <div style={{background:"#F0EBF8",borderRadius:6,height:8}}>
                      <div style={{width:`${Math.min(100,progress*100)}%`,height:"100%",background:P,borderRadius:6}}/>
                    </div>
                  </div>
                  {plan.status==="active"&&(
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:11,color:MU}}>Next due: {fmtD(plan.next_due_date)}</span>
                      <button onClick={()=>payInstalment(plan.id)}
                        style={{...bp,fontSize:12,padding:"5px 14px",background:OK}}>
                        ✓ Record Instalment ({fmt$(plan.instalment)})
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          }
        </>
      )}

      {view==="credits"&&(
        <>
          {showNewCredit&&(
            <div style={{...card,background:"#F8F5FC",border:"1px solid #DDD6EE"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div style={{gridColumn:"span 2"}}>
                  <label style={lbl}>Child *</label>
                  <select value={creditForm.child_id} onChange={e=>setCreditForm(p=>({...p,child_id:e.target.value}))} style={inp}>
                    <option value="">Select child…</option>
                    {children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Amount ($) *</label>
                  <input type="number" value={creditForm.amount} onChange={e=>setCreditForm(p=>({...p,amount:e.target.value}))} style={inp} step="0.01"/>
                </div>
                <div>
                  <label style={lbl}>Reason</label>
                  <input value={creditForm.reason} onChange={e=>setCreditForm(p=>({...p,reason:e.target.value}))} style={inp} placeholder="e.g. Public holiday credit, overpayment"/>
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <button style={bp} onClick={createCredit}>Issue Credit Note</button>
                <button style={bs} onClick={()=>setShowNewCredit(false)}>Cancel</button>
              </div>
            </div>
          )}
          {credits.map(c=>(
            <div key={c.id} style={{...card,padding:"14px",borderLeft:`4px solid ${c.status==="available"?OK:MU}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:DARK}}>{c.credit_number} — {c.first_name} {c.last_name}</div>
                  <div style={{fontSize:12,color:MU,marginTop:2}}>{c.reason||"No reason specified"}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:18,fontWeight:900,color:c.status==="available"?OK:MU}}>{fmt$(c.amount)}</div>
                  <div style={{fontSize:10,textTransform:"capitalize",color:MU}}>{c.status}</div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── FEE SCHEDULES TAB ───────────────────────────────────────────────────────
function FeesTab() {
  const [schedules,setSchedules]=useState([]);
  const [rooms,setRooms]=useState([]);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({room_id:"",name:"",daily_fee:"",hourly_rate:"",session_hours:"11"});

  const load=useCallback(()=>{
    Promise.all([
      API("/api/invoicing-full/fee-schedules"),
      API("/api/rooms/simple"),
    ]).then(([f,r])=>{
      setSchedules(f.schedules||[]);
      setRooms(Array.isArray(r)?r:[]);
    });
  },[]);
  useEffect(()=>{load();},[load]);

  const save=async()=>{
    try {
      await API("/api/invoicing-full/fee-schedules",{method:"POST",body:form});
      setEditing(null);load();
    } catch(e) { console.error('API error:', e); }
  };

  const deleteFee=async(feeId,roomName)=>{
    if(!window.showConfirm){if(!confirm(`Remove fee for ${roomName}?`))return;}
    else{const ok=await window.showConfirm(`Remove fee for ${roomName}?`);if(!ok)return;}
    await API(`/api/invoicing-full/fee-schedules/${feeId}`,{method:"DELETE"});
    load();
  };

  const editRoom=r=>{
    const existing=schedules.find(s=>s.room_id===r.id);
    setEditing(r.id);
    setForm({room_id:r.id,name:existing?.name||`${r.name} Standard`,daily_fee:existing?.daily_fee?.toFixed(2)||"",hourly_rate:existing?.hourly_rate?.toFixed(2)||"",session_hours:existing?.session_hours?.toString()||"11"});
  };

  const roomsWithFees=rooms.map(r=>({...r,fee:schedules.find(s=>s.room_id===r.id)}));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <p style={{fontSize:13,color:MU,margin:0}}>
        Set daily fee rates per room. These are used for bulk invoice generation. Child-level overrides can be set in AI Assistant → Fee Overrides.
      </p>

      {roomsWithFees.map(room=>(
        <div key={room.id} style={{...card,padding:"16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:editing===room.id?14:0}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:DARK}}>{room.name}</div>
              <div style={{fontSize:12,color:MU}}>{room.age_group} · Capacity: {room.capacity}</div>
            </div>
            <div style={{display:"flex",gap:14,alignItems:"center"}}>
              {room.fee&&(
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:20,fontWeight:900,color:P}}>{fmt$(room.fee.daily_fee)}<span style={{fontSize:11,color:MU,fontWeight:400}}>/day</span></div>
                  {room.fee.hourly_rate&&<div style={{fontSize:11,color:MU}}>{fmt$(room.fee.hourly_rate)}/hr cap</div>}
                </div>
              )}
              {!room.fee&&<div style={{fontSize:12,color:WA,fontWeight:600}}>⚠️ No fee set</div>}
              <button onClick={()=>editing===room.id?setEditing(null):editRoom(room)}
                style={{...bs,fontSize:12,padding:"5px 12px"}}>{editing===room.id?"Cancel":"Edit"}</button>
              {room.fee&&<button onClick={()=>deleteFee(room.fee.id,room.name)}
                style={{background:"none",border:"none",cursor:"pointer",color:DA,fontSize:12,fontWeight:600,padding:"5px 8px"}}>Remove</button>}
            </div>
          </div>

          {editing===room.id&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              <div>
                <label style={lbl}>Daily Fee ($) *</label>
                <input type="number" value={form.daily_fee} onChange={e=>setForm(p=>({...p,daily_fee:e.target.value}))} style={inp} placeholder="e.g. 135.00" step="0.01"/>
              </div>
              <div>
                <label style={lbl}>Hourly Rate Cap ($)</label>
                <input type="number" value={form.hourly_rate} onChange={e=>setForm(p=>({...p,hourly_rate:e.target.value}))} style={inp} placeholder="15.04" step="0.01"/>
                <div style={{fontSize:10,color:MU,marginTop:2}}>LDC CCS cap 2025-26: $15.04/hr</div>
              </div>
              <div>
                <label style={lbl}>Session Hours</label>
                <input type="number" value={form.session_hours} onChange={e=>setForm(p=>({...p,session_hours:e.target.value}))} style={inp} placeholder="11"/>
              </div>
              <div style={{gridColumn:"span 3",display:"flex",gap:8}}>
                <button style={bp} onClick={save}>Save Fee</button>
                <button style={bs} onClick={()=>setEditing(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── STATEMENTS TAB ───────────────────────────────────────────────────────────
function StatementsTab() {
  const [children,setChildren]=useState([]);
  const [selChild,setSelChild]=useState(null);
  const [stmt,setStmt]=useState(null);

  useEffect(()=>{
    API("/api/children/simple").then(r=>setChildren(Array.isArray(r)?r:(r.children||r.data||[])));
  },[]);

  const load=async(id)=>{
    setSelChild(id);
    try {
      const r=await API(`/api/invoicing-full/statements/${id}`);
      setStmt(r);
    } catch(e) {
      console.error('API error:',e);
      window.showToast?.('Failed to load statement','error');
    }
  };

  return (
    <div style={{display:"flex",gap:20}}>
      <div style={{width:220,flexShrink:0}}>
        <div style={{fontWeight:700,fontSize:11,color:MU,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Select Child</div>
        {children.map(c=>(
          <button key={c.id} onClick={()=>load(c.id)}
            style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${selChild===c.id?P:"#EDE8F4"}`,
              background:selChild===c.id?PL:"#fff",textAlign:"left",cursor:"pointer",marginBottom:5,fontSize:13}}>
            <div style={{fontWeight:selChild===c.id?700:400,color:DARK}}>{c.first_name} {c.last_name}</div>
            <div style={{fontSize:11,color:MU,marginTop:2}}>{c.room_name||c.age_group}</div>
          </button>
        ))}
      </div>

      <div style={{flex:1}}>
        {!selChild&&<div style={{...card,textAlign:"center",padding:"60px",color:MU}}><div style={{fontSize:40}}>📄</div><div style={{marginTop:12,fontWeight:600,color:DARK}}>Select a child to view their statement</div></div>}
        {stmt&&(
          <>
            <div style={{...card,marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div>
                  <div style={{fontWeight:700,fontSize:16,color:DARK}}>{stmt.child?.first_name} {stmt.child?.last_name}</div>
                  <div style={{fontSize:12,color:MU}}>{stmt.child?.room_name}</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,textAlign:"right"}}>
                  {[
                    [fmt$(stmt.totals?.total_billed),"Total Billed",P],
                    [fmt$(stmt.totals?.total_paid),"Total Paid",OK],
                    [fmt$(stmt.totals?.balance_due),"Balance Due",stmt.totals?.balance_due>0?DA:OK],
                  ].map(([v,l,c])=>(
                    <div key={l}>
                      <div style={{fontSize:18,fontWeight:900,color:c}}>{v}</div>
                      <div style={{fontSize:10,color:MU}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
              {stmt.payment_plan&&(
                <div style={{padding:"8px 14px",borderRadius:8,background:"#EFF6FF",fontSize:12,color:IN}}>
                  📅 Active payment plan: {fmt$(stmt.payment_plan.instalment_amount_cents/100)}/{stmt.payment_plan.frequency} — next due {fmtD(stmt.payment_plan.next_due_date)}
                </div>
              )}
            </div>

            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead><tr style={{background:"#F8F5FC"}}>
                {["Invoice","Period","Gap Fee","Paid","Balance","Status"].map(h=>(
                  <th key={h} style={{padding:"8px 10px",textAlign:"left",color:MU,fontWeight:700,fontSize:11}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {stmt.invoices?.map(inv=>(
                  <tr key={inv.id} style={{borderBottom:"1px solid #F0EBF8"}}>
                    <td style={{padding:"8px 10px",fontWeight:700,color:P}}>{inv.invoice_number}</td>
                    <td style={{padding:"8px 10px",color:MU,fontSize:11}}>{fmtShort(inv.period_start)}–{fmtShort(inv.period_end)}</td>
                    <td style={{padding:"8px 10px",fontWeight:600}}>{fmt$(inv.gap_fee)}</td>
                    <td style={{padding:"8px 10px",color:OK}}>{fmt$(inv.amount_paid)}</td>
                    <td style={{padding:"8px 10px",color:inv.amount_due-inv.amount_paid>0?DA:OK,fontWeight:600}}>
                      {fmt$(inv.amount_due-inv.amount_paid)}
                    </td>
                    <td style={{padding:"8px 10px"}}>
                      <span style={{fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:20,
                        background:STATUS_BG[inv.status]||"#F5F5F5",color:STATUS_C[inv.status]||MU,textTransform:"capitalize"}}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

// ─── SETTINGS TAB ─────────────────────────────────────────────────────────────
function SettingsTab() {
  const [template,setTemplate]=useState({name:"Default",payment_terms:"Due within 14 days",bank_name:"",bank_bsb:"",bank_account:"",include_ccs_breakdown:true,colour:"#7C3AED"});
  const [saved,setSaved]=useState(false);

  useEffect(()=>{
    API("/api/invoicing-full/templates").then(r=>{
      if(r.templates?.[0]){
        const t=r.templates[0];
        setTemplate({...t,include_ccs_breakdown:t.include_ccs_breakdown===1});
      }
    });
  },[]);

  const save=async()=>{
    try {
      await API("/api/invoicing-full/templates",{method:"POST",body:{...template,is_default:1}});
      setSaved(true);setTimeout(()=>setSaved(false),2000);
    } catch(e) { console.error('API error:', e); }
  };

  return (
    <div style={{maxWidth:600}}>
      <div style={card}>
        <div style={{fontWeight:700,fontSize:14,color:DARK,marginBottom:16}}>Invoice Template Settings</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div>
            <label style={lbl}>Payment Terms</label>
            <input value={template.payment_terms} onChange={e=>setTemplate(p=>({...p,payment_terms:e.target.value}))} style={inp} placeholder="Due within 14 days"/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <div>
              <label style={lbl}>Bank Name</label>
              <input value={template.bank_name} onChange={e=>setTemplate(p=>({...p,bank_name:e.target.value}))} style={inp} placeholder="e.g. ANZ"/>
            </div>
            <div>
              <label style={lbl}>BSB</label>
              <input value={template.bank_bsb} onChange={e=>setTemplate(p=>({...p,bank_bsb:e.target.value}))} style={inp} placeholder="000-000"/>
            </div>
            <div>
              <label style={lbl}>Account Number</label>
              <input value={template.bank_account} onChange={e=>setTemplate(p=>({...p,bank_account:e.target.value}))} style={inp}/>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label style={lbl}>Brand Colour</label>
              <input type="color" value={template.colour} onChange={e=>setTemplate(p=>({...p,colour:e.target.value}))} style={{...inp,height:40,cursor:"pointer"}}/>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,marginTop:20}}>
              <input type="checkbox" checked={template.include_ccs_breakdown} onChange={e=>setTemplate(p=>({...p,include_ccs_breakdown:e.target.checked}))}/>
              Show CCS breakdown on invoice
            </label>
          </div>
          <button onClick={save} style={{...bp,alignSelf:"flex-start"}}>
            {saved?"✓ Saved!":"Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
