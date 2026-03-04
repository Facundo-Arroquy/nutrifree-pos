import { useState, useMemo } from "react";
import { Ico, $, fmtDate, fmtTime, STATUS_LABELS, STATUS_COLORS, PAY_LABELS } from "../shared.jsx";


export default function ReportsPage({ sales, products, expenses, expenseCategories, accountPayments, stockMovements }) {
  const presets = useMemo(() => {
    const now = new Date();
    const t = now.toISOString().slice(0,10);
    const w = new Date(now - 6*86400000).toISOString().slice(0,10);
    const m = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
    return [
      { label:"Hoy",       from:t,            to:t },
      { label:"7 días",    from:w,            to:t },
      { label:"Este mes",  from:m,            to:t },
      { label:"Todo",      from:"2000-01-01", to:t },
    ];
  }, []);

  const [dateFrom, setDateFrom] = useState(presets[0].from);
  const [dateTo,   setDateTo]   = useState(presets[0].to);

  const from = dateFrom || "2000-01-01";
  const to   = dateTo   || "9999-12-31";

  // ── Sales in period ──────────────────────────────────────────────────────────
  const pSales = sales.filter(s => {
    const d = s.createdAt?.slice(0,10);
    return d >= from && d <= to && s.status !== "cancelled";
  });
  const closedSales = pSales.filter(s => s.status === "closed" || s.status === "delivered");

  // Cash actually received: closed sales paid directly (not account)
  const directIncome = closedSales
    .filter(s => s.paymentMethod !== "account")
    .reduce((a, b) => a + b.total, 0);

  // Account payments received in period (customer paying their debt)
  const pAccountPayments = (accountPayments || []).filter(p =>
    p.type === "payment" && p.paymentMethod && p.date >= from && p.date <= to
  );
  const accountIncome = pAccountPayments.reduce((a, b) => a + b.amount, 0);

  // Total income = cash received directly + account debt collected
  const totalIncome = directIncome + accountIncome;

  // Outstanding account debt (all time)
  const allCharges  = (accountPayments || []).filter(p => p.type === "charge").reduce((a, b) => a + b.amount, 0);
  const allPayments = (accountPayments || []).filter(p => p.type === "payment").reduce((a, b) => a + b.amount, 0);
  const outstandingDebt = Math.max(0, allCharges - allPayments);

  // Active open orders (all time — always relevant)
  const activeOrders = sales.filter(s => ["open", "pending", "ready"].includes(s.status));
  const activeOrdersValue = activeOrders.reduce((a, b) => a + b.total, 0);

  // Pay method totals: direct sales + account payments received
  const payMethodTotals = {};
  closedSales.filter(s => s.paymentMethod !== "account").forEach(s => {
    const k = s.paymentMethod || "other";
    payMethodTotals[k] = (payMethodTotals[k] || 0) + s.total;
  });
  pAccountPayments.forEach(p => {
    const k = p.paymentMethod;
    payMethodTotals[k] = (payMethodTotals[k] || 0) + p.amount;
  });

  // ── Products ─────────────────────────────────────────────────────────────────
  const productCount = {};
  pSales.forEach(s => s.items.forEach(i => {
    if (i.kitItems?.length) {
      i.kitItems.forEach(comp => {
        const compProd = products.find(p => p.id === comp.productId);
        const compName = compProd ? compProd.name : comp.productId;
        productCount[compName] = (productCount[compName]||0) + comp.qty * i.qty;
      });
    } else {
      productCount[i.name] = (productCount[i.name]||0)+i.qty;
    }
  }));
  const allProductsSold = Object.entries(productCount).sort((a,b)=>b[1]-a[1]);
  const topProducts = allProductsSold.slice(0,8);
  const maxQty = topProducts[0]?.[1]||1;

  const exportProductsCsv = () => {
    const rows = [["Fecha","Producto","Tipo","Unidades"]];
    // ventas
    pSales.forEach(s => {
      const date = new Date(s.createdAt).toLocaleString("es-AR");
      s.items.forEach(i => {
        if (i.kitItems?.length) {
          i.kitItems.forEach(comp => {
            const compName = products.find(p => p.id === comp.productId)?.name || comp.productId;
            rows.push([date, compName, "Venta (kit)", comp.qty * i.qty]);
          });
        } else {
          rows.push([date, i.name, "Venta", i.qty]);
        }
      });
    });
    // movimientos de stock
    const pMovements = (stockMovements||[]).filter(m => m.createdAt?.slice(0,10) >= from && m.createdAt?.slice(0,10) <= to);
    pMovements.forEach(m => {
      rows.push([new Date(m.createdAt).toLocaleString("es-AR"), m.productName, "Producción", m.qty]);
    });
    // ordenar por fecha
    rows.sort((a,b) => a[0] === "Fecha" ? -1 : new Date(b[0]) - new Date(a[0]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv" }));
    a.download = `movimientos-productos-${from}-${to}.csv`;
    a.click();
  };

  const stockAlert = products.filter(p=>p.active&&p.stock<=5).sort((a,b)=>a.stock-b.stock);

  // ── Expenses in period ───────────────────────────────────────────────────────
  const pExpenses = (expenses||[]).filter(e => e.date >= from && e.date <= to);
  const totalExpenses   = pExpenses.filter(e=>e.paymentStatus==="paid").reduce((a,b)=>a+b.total,0);
  const pendingExpenses = pExpenses.filter(e=>e.paymentStatus==="pending").reduce((a,b)=>a+b.total,0);
  const netResult       = totalIncome - totalExpenses;
  const expByCat = {};
  pExpenses.filter(e=>e.paymentStatus==="paid").forEach(e => {
    expByCat[e.category||"Otros"] = (expByCat[e.category||"Otros"]||0) + e.total;
  });
  const maxExpCat = Math.max(...Object.values(expByCat), 1);

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Reportes</div><div className="page-sub">Análisis del negocio</div></div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          {presets.map(p => (
            <button key={p.label} className={`btn btn-sm ${dateFrom===p.from && dateTo===p.to ? "btn-primary" : "btn-secondary"}`}
              onClick={() => { setDateFrom(p.from); setDateTo(p.to); }}>
              {p.label}
            </button>
          ))}
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width:140 }}/>
          <span style={{ fontSize:".85em", color:"var(--t3)" }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width:140 }}/>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat stat-green"><div className="stat-num">{$(totalIncome)}</div><div className="stat-label">Cobrado en período</div><div className="stat-icon">💰</div></div>
        <div className="stat stat-amber"><div className="stat-num">{$(outstandingDebt)}</div><div className="stat-label">Deuda en cuentas</div><div className="stat-icon">⏳</div></div>
        <div className="stat"><div className="stat-num">{pSales.length}</div><div className="stat-label">Ventas en período</div><div className="stat-icon">🧾</div></div>
        <div className="stat stat-blue"><div className="stat-num">{$(activeOrdersValue)}</div><div className="stat-label">Pedidos activos ({activeOrders.length})</div><div className="stat-icon">📋</div></div>
      </div>
      <div className="stats-row" style={{ marginBottom:16 }}>
        <div className="stat stat-red"><div className="stat-num">{$(totalExpenses)}</div><div className="stat-label">Gastos pagados</div><div className="stat-icon">💸</div></div>
        <div className="stat stat-amber"><div className="stat-num">{$(pendingExpenses)}</div><div className="stat-label">Gastos pendientes</div><div className="stat-icon">📤</div></div>
        <div className="stat"><div className="stat-num">{pExpenses.length}</div><div className="stat-label">Gastos en período</div><div className="stat-icon">🧾</div></div>
        <div className={`stat ${netResult>=0?"stat-green":"stat-red"}`}>
          <div className="stat-num">{netResult<0?"-":""}{$(Math.abs(netResult))}</div>
          <div className="stat-label">Resultado neto</div>
          <div className="stat-icon">{netResult>=0?"📈":"📉"}</div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        <div className="card">
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <div className="section-title" style={{ marginBottom:0 }}>Productos más vendidos</div>
            {allProductsSold.length>0 && <button className="btn btn-secondary btn-sm" onClick={exportProductsCsv}>↓ CSV</button>}
          </div>
          {topProducts.length===0 ? <div style={{ color:"var(--t3)", fontSize:".84em" }}>Sin datos</div> :
            topProducts.map(([name,qty])=>(
              <div key={name} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                <div style={{ fontSize:".82em", color:"var(--t2)", width:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</div>
                <div style={{ flex:1, height:7, background:"var(--s2)", borderRadius:4, overflow:"hidden" }}>
                  <div style={{ width:`${(qty/maxQty)*100}%`, height:"100%", background:"var(--green)", borderRadius:4 }}/>
                </div>
                <div style={{ fontSize:".82em", fontWeight:700, width:28, textAlign:"right" }}>{qty}</div>
              </div>
            ))
          }
        </div>

        <div className="card">
          <div className="section-title">Pedidos activos</div>
          {activeOrders.length===0 ? <div style={{ color:"var(--t3)", fontSize:".84em" }}>Sin pedidos activos</div> :
            activeOrders.slice(0,8).map(s=>(
              <div key={s.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize:".86em", fontWeight:600 }}>{s.customerName}</div>
                  <div style={{ fontSize:".74em", color:"var(--t3)" }}>{fmtDate(s.createdAt)}</div>
                </div>
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <span className={`badge ${STATUS_COLORS[s.status]}`}>{STATUS_LABELS[s.status]}</span>
                  <span style={{ fontWeight:700, color:"var(--green)" }}>{$(s.total)}</span>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      <div className="card" style={{ marginBottom:16 }}>
        <div className="section-title">Ingresos por método de pago</div>
        {totalIncome === 0 ? <div style={{ color:"var(--t3)", fontSize:".84em" }}>Sin cobros en el período</div> :
          Object.entries(PAY_LABELS).filter(([k]) => (payMethodTotals[k]||0) > 0 || k !== "account").map(([k,v]) => {
            const amt = payMethodTotals[k]||0;
            const pct = totalIncome>0 ? Math.round(amt/totalIncome*100) : 0;
            return (
              <div key={k} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom:"1px solid var(--border)" }}>
                <span style={{ fontSize:".86em", color:"var(--t2)", width:130 }}>{v}</span>
                <div style={{ flex:1, height:7, background:"var(--s2)", borderRadius:4, overflow:"hidden" }}>
                  <div style={{ width:`${pct}%`, height:"100%", background:"var(--green)", borderRadius:4 }}/>
                </div>
                <span style={{ fontSize:".82em", color:"var(--t3)", width:32, textAlign:"right" }}>{pct}%</span>
                <span style={{ fontWeight:700, color:amt>0?"var(--green)":"var(--t4)", width:80, textAlign:"right" }}>{$(amt)}</span>
              </div>
            );
          })
        }
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        <div className="card">
          <div className="section-title">Gastos por categoría</div>
          {Object.keys(expByCat).length===0
            ? <div style={{ color:"var(--t3)", fontSize:".84em" }}>Sin gastos pagados en el período</div>
            : (expenseCategories||[]).filter(c => expByCat[c]).map(c => {
                const amt = expByCat[c]||0;
                const pct = Math.round(amt/maxExpCat*100);
                return (
                  <div key={c} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <div style={{ fontSize:".82em", color:"var(--t2)", width:100, flexShrink:0 }}>{c}</div>
                    <div style={{ flex:1, height:7, background:"var(--s2)", borderRadius:4, overflow:"hidden" }}>
                      <div style={{ width:`${pct}%`, height:"100%", background:"var(--red)", borderRadius:4 }}/>
                    </div>
                    <div style={{ fontWeight:700, color:"var(--red)", width:72, textAlign:"right", fontSize:".82em" }}>{$(amt)}</div>
                  </div>
                );
              })
          }
        </div>

        <div className="card">
          <div className="section-title">Balance del período</div>
          <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
              <span style={{ fontSize:".84em", color:"var(--t3)" }}>Ventas cobradas directamente</span>
              <span style={{ fontWeight:600, color:"var(--green)" }}>{$(directIncome)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
              <span style={{ fontSize:".84em", color:"var(--t3)" }}>Cuentas corrientes cobradas</span>
              <span style={{ fontWeight:600, color:"var(--green)" }}>{$(accountIncome)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"2px solid var(--border)" }}>
              <span style={{ fontSize:".86em", color:"var(--t2)", fontWeight:700 }}>Total cobrado</span>
              <span style={{ fontWeight:800, color:"var(--green)" }}>{$(totalIncome)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
              <span style={{ fontSize:".84em", color:"var(--t3)" }}>Gastos pagados</span>
              <span style={{ fontWeight:600, color:"var(--red)" }}>-{$(totalExpenses)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
              <span style={{ fontSize:".84em", color:"var(--t3)" }}>Gastos pendientes</span>
              <span style={{ fontWeight:600, color:"var(--amber)" }}>-{$(pendingExpenses)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
              <span style={{ fontSize:".84em", color:"var(--t3)" }}>Deuda en cuentas corrientes</span>
              <span style={{ fontWeight:600, color:outstandingDebt>0?"var(--amber)":"var(--t3)" }}>{$(outstandingDebt)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", marginTop:8, background:netResult>=0?"var(--greenl)":"var(--redl)", borderRadius:8, border:`1px solid ${netResult>=0?"var(--greenlb)":"var(--redlb)"}` }}>
              <span style={{ fontWeight:700, fontSize:".9em" }}>Resultado neto</span>
              <span style={{ fontWeight:800, fontSize:"1.1em", color:netResult>=0?"var(--green)":"var(--red)" }}>
                {netResult<0?"-":""}{$(Math.abs(netResult))}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">⚠️ Stock bajo (≤ 5 unidades)</div>
        {stockAlert.length===0 ? <div style={{ color:"var(--t3)", fontSize:".84em" }}>✅ Todo el stock está bien</div> :
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
            {stockAlert.map(p=>(
              <div key={p.id} style={{ background:p.stock===0?"var(--redl)":"var(--amberl)", border:`1px solid ${p.stock===0?"var(--redlb)":"var(--amberlb)"}`, borderRadius:8, padding:"10px 12px" }}>
                <div style={{ fontWeight:600, fontSize:".88em" }}>{p.name}</div>
                <div style={{ fontSize:".8em", color:p.stock===0?"var(--red)":"var(--amber)", fontWeight:700, marginTop:4 }}>
                  {p.stock===0?"SIN STOCK":`${p.stock} unidades`}
                </div>
              </div>
            ))}
          </div>
        }
      </div>
    </div>
  );
}
