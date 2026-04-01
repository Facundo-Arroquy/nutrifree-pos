/**
 * ReportsPage — Análisis y reportes (solo admin).
 *
 * Módulos disponibles (filtrados por rango de fechas):
 *  - Resumen: totales de ventas, gastos, ganancia neta y margen
 *  - Top productos más vendidos (por unidades, con barra de progreso)
 *  - Distribución de ventas por método de pago
 *  - Top 5 más rentables: margen calculado como (precioRetail − costoReceta) / precio
 *  - Tendencias: gráfico de barras diario/semanal/mensual (ventas vs gastos)
 *    con TrendBadge comparando la primera mitad del período contra la segunda
 *
 * Props: sales, expenses, recipes, products, stockMovements
 */
import { useState, useMemo, useCallback } from "react";
import { Ico, $, fmtDate, fmtTime, STATUS_LABELS, STATUS_COLORS, PAY_LABELS } from "../shared.jsx";

// ─── Bar chart (CSS-based, no library) ────────────────────────────────────────
function TrendChart({ points }) {
  if (!points.length) return <div style={{ color:"var(--t3)", fontSize:".84em", padding:"20px 0" }}>Sin datos para el período</div>;
  const maxV = Math.max(...points.map(p => Math.max(p.sales, p.expenses)), 1);
  return (
    <div>
      <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:110, padding:"0 2px" }}>
        {points.map((p, i) => (
          <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:1, height:"100%" }}>
            <div style={{ flex:1, width:"100%", display:"flex", alignItems:"flex-end", gap:1 }}>
              <div style={{ flex:1, background:"var(--green)", height:`${(p.sales/maxV)*100}%`, borderRadius:"2px 2px 0 0", minHeight:p.sales>0?2:0, opacity:.85, transition:"height .3s ease" }}/>
              <div style={{ flex:1, background:"var(--red)", height:`${(p.expenses/maxV)*100}%`, borderRadius:"2px 2px 0 0", minHeight:p.expenses>0?2:0, opacity:.7, transition:"height .3s ease" }}/>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:2, padding:"0 2px", marginTop:4 }}>
        {points.map((p, i) => (
          <div key={i} style={{ flex:1, textAlign:"center", fontSize:8, color:"var(--t4)", overflow:"hidden", lineHeight:1.2 }}>{p.label}</div>
        ))}
      </div>
    </div>
  );
}

// ─── Trend indicator ───────────────────────────────────────────────────────────
function TrendBadge({ pct, label }) {
  if (pct === null) return null;
  const up = pct >= 0;
  const abs = Math.abs(pct).toFixed(1);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:2, alignItems:"center" }}>
      <div style={{ fontSize:".74em", color:"var(--t4)" }}>{label}</div>
      <div style={{ fontWeight:700, fontSize:".88em", color:up?"var(--green)":"var(--red)", display:"flex", alignItems:"center", gap:3 }}>
        {up ? "▲" : "▼"} {abs}%
      </div>
    </div>
  );
}

// ─── Margin bar ────────────────────────────────────────────────────────────────
function MarginBar({ pct }) {
  const color = pct >= 50 ? "var(--green)" : pct >= 25 ? "var(--amber)" : "var(--red)";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <div style={{ flex:1, height:6, background:"var(--s2)", borderRadius:3, overflow:"hidden" }}>
        <div style={{ width:`${Math.max(0,Math.min(100,pct))}%`, height:"100%", background:color, borderRadius:3 }}/>
      </div>
      <span style={{ fontSize:".76em", fontWeight:700, color, minWidth:34, textAlign:"right" }}>{pct.toFixed(1)}%</span>
    </div>
  );
}

export default function ReportsPage({ sales, products, recipes, expenses, expenseCategories, accountPayments, stockMovements, setPage, setHighlightRecipeId }) {
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

  const stockAlert = products.filter(p=>p.active&&!p.kitItems?.length&&p.stock>0&&p.stock<=5).sort((a,b)=>a.stock-b.stock);

  // ── Resumen del día ───────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);

  const daySummary = useMemo(() => {
    // Ventas: agrupar unidades por categoría
    const soldItems = closedSales.flatMap(s => s.items || []);
    const catTotals = {};
    for (const item of soldItems) {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) continue;
      const key = prod.category;
      catTotals[key] = (catTotals[key] || 0) + item.qty;
    }

    // Producción: agrupar por nombre de producto
    const prodMovs = (stockMovements || []).filter(m =>
      m.type === "production" &&
      m.createdAt?.slice(0,10) >= from &&
      m.createdAt?.slice(0,10) <= to
    );
    const prodTotals = {};
    for (const m of prodMovs) {
      prodTotals[m.productName] = (prodTotals[m.productName] || 0) + m.qty;
    }

    return { catTotals, prodTotals };
  }, [closedSales, stockMovements, products, from, to]);

  const buildSummaryText = useCallback(() => {
    const { catTotals, prodTotals } = daySummary;
    const ventasParts = Object.entries(catTotals)
      .filter(([, qty]) => qty > 0)
      .map(([cat, qty]) => `${Math.round(qty)} ${cat.toLowerCase()}`);
    const prodParts = Object.entries(prodTotals)
      .filter(([, qty]) => qty > 0)
      .map(([name, qty]) => `${Math.round(qty)} ${name.toLowerCase()}`);
    const label = from === to ? `el ${from}` : `del ${from} al ${to}`;
    const ventas = ventasParts.length ? `Se vendieron ${ventasParts.join(", ")}.` : "Sin ventas registradas.";
    const prod = prodParts.length ? ` Se elaboró ${prodParts.join(", ")}.` : "";
    return `Resumen ${label}\n${ventas}${prod}`;
  }, [daySummary, from, to]);

  const copySummary = () => {
    navigator.clipboard.writeText(buildSummaryText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Alerta de margen ─────────────────────────────────────────────────────────
  const marginAlert = useMemo(() => {
    return products
      .filter(p => p.active)
      .map(p => {
        const recipe = (recipes||[]).find(r => r.productId === p.id);
        if (!recipe || recipe.minMargin == null || recipe.minMargin === "") return null;
        const minMargin = Number(recipe.minMargin);
        const recipeCost = (recipe.ingredients||[]).reduce((s, i) => s + (i.cost || 0), 0);
        const costPerUnit = recipeCost / Math.max(recipe.yield || 1, 1);
        const price = p.priceRetail || 0;
        if (price <= 0) return null;
        const margin = ((price - costPerUnit) / price) * 100;
        if (margin >= minMargin) return null;
        return { id:p.id, name:p.name, margin, minMargin, costPerUnit, price };
      })
      .filter(Boolean)
      .sort((a, b) => a.margin - b.margin);
  }, [products, recipes]);

  // ── Expenses in period (must be before useMemos that reference it) ────────────
  const pExpenses = (expenses||[]).filter(e => e.date >= from && e.date <= to);

  // ── Top 5 rentabilidad ───────────────────────────────────────────────────────
  const top5Profitable = useMemo(() => {
    return products
      .filter(p => p.active)
      .map(p => {
        const recipe = (recipes||[]).find(r => r.productId === p.id);
        if (!recipe) return null;
        const recipeTotalCost = (recipe.ingredients||[]).reduce((s, i) => s + (i.cost || 0), 0);
        const costPerUnit = recipeTotalCost / Math.max(recipe.yield || 1, 1);

        let unitsSold = 0, totalRevenue = 0;
        closedSales.forEach(s => s.items.forEach(i => {
          if (i.productId === p.id) { unitsSold += i.qty; totalRevenue += i.subtotal; }
        }));
        if (unitsSold === 0) return null;

        const totalCost   = costPerUnit * unitsSold;
        const totalProfit = totalRevenue - totalCost;
        const margin      = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
        return { id:p.id, name:p.name, category:p.category, unitsSold, totalRevenue, totalCost, totalProfit, margin, costPerUnit };
      })
      .filter(Boolean)
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, 5);
  }, [products, recipes, closedSales]);

  // ── Tendencia ────────────────────────────────────────────────────────────────
  const [trendMode, setTrendMode] = useState("daily");

  const trendPoints = useMemo(() => {
    const dayMap = {};
    closedSales.forEach(s => {
      const d = s.createdAt?.slice(0, 10);
      if (!d) return;
      if (!dayMap[d]) dayMap[d] = { sales:0, expenses:0 };
      dayMap[d].sales += s.total;
    });
    pExpenses.filter(e => e.paymentStatus === "paid").forEach(e => {
      if (!e.date) return;
      if (!dayMap[e.date]) dayMap[e.date] = { sales:0, expenses:0 };
      dayMap[e.date].expenses += e.total;
    });
    const days = Object.entries(dayMap).sort(([a],[b]) => a.localeCompare(b));

    if (trendMode === "daily") {
      return days.map(([date, v]) => ({ label:date.slice(5), sales:v.sales, expenses:v.expenses, net:v.sales-v.expenses }));
    }
    if (trendMode === "weekly") {
      const wk = {};
      days.forEach(([date, v]) => {
        const d = new Date(date + "T12:00:00");
        const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
        const k = ws.toISOString().slice(0,10);
        if (!wk[k]) wk[k] = { sales:0, expenses:0 };
        wk[k].sales += v.sales; wk[k].expenses += v.expenses;
      });
      return Object.entries(wk).sort(([a],[b])=>a.localeCompare(b))
        .map(([d, v]) => ({ label:d.slice(5), sales:v.sales, expenses:v.expenses, net:v.sales-v.expenses }));
    }
    // monthly
    const mo = {};
    days.forEach(([date, v]) => {
      const k = date.slice(0,7);
      if (!mo[k]) mo[k] = { sales:0, expenses:0 };
      mo[k].sales += v.sales; mo[k].expenses += v.expenses;
    });
    const MON = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    return Object.entries(mo).sort(([a],[b])=>a.localeCompare(b))
      .map(([mon, v]) => ({ label:MON[Number(mon.slice(5))-1], sales:v.sales, expenses:v.expenses, net:v.sales-v.expenses }));
  }, [closedSales, pExpenses, trendMode]);

  const trendIndicator = useMemo(() => {
    if (trendPoints.length < 2) return null;
    const half = Math.floor(trendPoints.length / 2);
    const prev = trendPoints.slice(0, half), curr = trendPoints.slice(half);
    const ps = prev.reduce((s,p)=>s+p.sales,0), cs = curr.reduce((s,p)=>s+p.sales,0);
    const pe = prev.reduce((s,p)=>s+p.expenses,0), ce = curr.reduce((s,p)=>s+p.expenses,0);
    const pn = ps - pe, cn = cs - ce;
    return {
      salesChg: ps>0 ? (cs-ps)/ps*100 : null,
      expChg:   pe>0 ? (ce-pe)/pe*100 : null,
      netChg:   Math.abs(pn)>0 ? (cn-pn)/Math.abs(pn)*100 : null,
    };
  }, [trendPoints]);

  // ── Expenses derived values ───────────────────────────────────────────────────
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

      {/* ── Resumen del período ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <div className="section-title" style={{ margin:0 }}>📋 Resumen del período</div>
          <button className="btn btn-secondary btn-sm" onClick={copySummary}>
            {copied ? "✓ Copiado!" : "Copiar texto"}
          </button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          {/* Ventas por categoría */}
          <div>
            <div style={{ fontSize:".78em", fontWeight:700, textTransform:"uppercase", letterSpacing:".6px", color:"var(--t3)", marginBottom:10 }}>Vendido</div>
            {Object.entries(daySummary.catTotals).length === 0
              ? <div style={{ color:"var(--t4)", fontSize:".85em" }}>Sin ventas en el período</div>
              : Object.entries(daySummary.catTotals)
                  .sort((a,b) => b[1] - a[1])
                  .map(([cat, qty]) => (
                    <div key={cat} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid var(--border)" }}>
                      <span style={{ fontSize:".88em", color:"var(--t2)" }}>{cat}</span>
                      <span style={{ fontWeight:700, color:"var(--green)", fontSize:".95em" }}>{Math.round(qty)} u.</span>
                    </div>
                  ))
            }
          </div>

          {/* Producción */}
          <div>
            <div style={{ fontSize:".78em", fontWeight:700, textTransform:"uppercase", letterSpacing:".6px", color:"var(--t3)", marginBottom:10 }}>Elaborado</div>
            {Object.entries(daySummary.prodTotals).length === 0
              ? <div style={{ color:"var(--t4)", fontSize:".85em" }}>Sin producción registrada en el período</div>
              : Object.entries(daySummary.prodTotals)
                  .sort((a,b) => b[1] - a[1])
                  .map(([name, qty]) => (
                    <div key={name} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid var(--border)" }}>
                      <span style={{ fontSize:".88em", color:"var(--t2)" }}>{name}</span>
                      <span style={{ fontWeight:700, color:"var(--blue)", fontSize:".95em" }}>{Math.round(qty)} u.</span>
                    </div>
                  ))
            }
          </div>
        </div>

        {/* Preview del texto */}
        <div style={{ marginTop:14, background:"var(--s2)", borderRadius:8, padding:"10px 14px", fontSize:".84em", color:"var(--t3)", fontStyle:"italic", whiteSpace:"pre-line" }}>
          {buildSummaryText()}
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

      {/* ── TOP 5 RENTABILIDAD ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <div>
            <div className="section-title" style={{ marginBottom:2 }}>Top 5 — Productos más rentables</div>
            <div style={{ fontSize:".75em", color:"var(--t4)" }}>Rentabilidad = precio de venta − costo de receta · período seleccionado</div>
          </div>
        </div>
        {top5Profitable.length === 0 ? (
          <div style={{ color:"var(--t3)", fontSize:".84em", padding:"12px 0" }}>
            Sin datos — asegurate de que los productos tengan recetas con ingredientes y hayan sido vendidos en el período.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Producto</th>
                  <th style={{ textAlign:"right" }}>Uds. vendidas</th>
                  <th style={{ textAlign:"right" }}>Ingresos</th>
                  <th style={{ textAlign:"right" }}>Costo total</th>
                  <th style={{ textAlign:"right" }}>Ganancia</th>
                  <th style={{ minWidth:140 }}>Margen</th>
                </tr>
              </thead>
              <tbody>
                {top5Profitable.map((p, i) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ width:22, height:22, borderRadius:6, background:i===0?"var(--green)":i===1?"var(--amber)":i===2?"var(--blue)":"var(--s2)", color:i<3?"white":"var(--t3)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:".75em" }}>
                        {i+1}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight:600, fontSize:".88em" }}>{p.name}</div>
                      <div style={{ fontSize:".74em", color:"var(--t4)" }}>{p.category}</div>
                    </td>
                    <td style={{ textAlign:"right", fontWeight:600 }}>{p.unitsSold}</td>
                    <td style={{ textAlign:"right", color:"var(--green)", fontWeight:600 }}>{$(p.totalRevenue)}</td>
                    <td style={{ textAlign:"right", color:"var(--red)", fontWeight:600 }}>{$(p.totalCost)}</td>
                    <td style={{ textAlign:"right", fontWeight:700, fontSize:".95em", color:p.totalProfit>=0?"var(--green)":"var(--red)" }}>
                      {p.totalProfit<0?"-":""}{$(Math.abs(p.totalProfit))}
                    </td>
                    <td><MarginBar pct={p.margin}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── TENDENCIA DE RENDIMIENTO ───────────────────────────────────────── */}
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
          <div>
            <div className="section-title" style={{ marginBottom:2 }}>Tendencia de rendimiento</div>
            <div style={{ fontSize:".75em", color:"var(--t4)" }}>Ventas <span style={{ color:"var(--green)", fontWeight:700 }}>■</span> vs Gastos <span style={{ color:"var(--red)", fontWeight:700 }}>■</span> · comparativa primera/segunda mitad del período</div>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            {[["daily","Diario"],["weekly","Semanal"],["monthly","Mensual"]].map(([k,l]) => (
              <button key={k} className={`btn btn-sm ${trendMode===k?"btn-primary":"btn-secondary"}`} onClick={()=>setTrendMode(k)}>{l}</button>
            ))}
          </div>
        </div>

        {trendIndicator && (
          <div style={{ display:"flex", gap:16, marginBottom:14, padding:"10px 14px", background:"var(--s2)", borderRadius:10 }}>
            <div style={{ fontSize:".74em", color:"var(--t4)", alignSelf:"center" }}>Variación 1ª→2ª mitad:</div>
            <TrendBadge pct={trendIndicator.salesChg} label="Ventas"/>
            <TrendBadge pct={trendIndicator.expChg ? -trendIndicator.expChg : null} label="Gastos"/>
            <TrendBadge pct={trendIndicator.netChg} label="Ganancia neta"/>
            <div style={{ marginLeft:"auto", display:"flex", gap:16, alignItems:"center" }}>
              {trendPoints.length > 0 && (() => {
                const totS = trendPoints.reduce((s,p)=>s+p.sales,0);
                const totE = trendPoints.reduce((s,p)=>s+p.expenses,0);
                const totN = totS - totE;
                return (
                  <>
                    <div style={{ textAlign:"center" }}><div style={{ fontSize:".7em", color:"var(--t4)" }}>Total ventas</div><div style={{ fontWeight:700, color:"var(--green)", fontSize:".9em" }}>{$(totS)}</div></div>
                    <div style={{ textAlign:"center" }}><div style={{ fontSize:".7em", color:"var(--t4)" }}>Total gastos</div><div style={{ fontWeight:700, color:"var(--red)", fontSize:".9em" }}>{$(totE)}</div></div>
                    <div style={{ textAlign:"center" }}><div style={{ fontSize:".7em", color:"var(--t4)" }}>Ganancia neta</div><div style={{ fontWeight:700, color:totN>=0?"var(--green)":"var(--red)", fontSize:".9em" }}>{totN<0?"-":""}{$(Math.abs(totN))}</div></div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        <TrendChart points={trendPoints}/>

        {trendPoints.length > 0 && (
          <div style={{ marginTop:14 }}>
            <div className="section-title" style={{ marginBottom:8 }}>Desglose por período</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Período</th>
                    <th style={{ textAlign:"right" }}>Ventas</th>
                    <th style={{ textAlign:"right" }}>Gastos</th>
                    <th style={{ textAlign:"right" }}>Ganancia neta</th>
                    <th style={{ minWidth:100 }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {trendPoints.map((p, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight:500, fontSize:".86em" }}>{p.label}</td>
                      <td style={{ textAlign:"right", color:"var(--green)", fontWeight:600 }}>{$(p.sales)}</td>
                      <td style={{ textAlign:"right", color:"var(--red)", fontWeight:600 }}>{$(p.expenses)}</td>
                      <td style={{ textAlign:"right", fontWeight:700, color:p.net>=0?"var(--green)":"var(--red)" }}>
                        {p.net<0?"-":""}{$(Math.abs(p.net))}
                      </td>
                      <td>
                        <span className={`badge ${p.net>=0?"badge-green":"badge-red"}`}>
                          {p.net>=0?"Superávit":"Déficit"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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

      <div className="card">
        <div className="section-title">📉 Margen bajo (por receta)</div>
        {marginAlert.length===0
          ? <div style={{ color:"var(--t3)", fontSize:".84em" }}>✅ Todos los productos superan su margen mínimo configurado</div>
          : <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:10 }}>
              {marginAlert.map(p => {
                const recipe = recipes.find(r => r.productId === p.id);
                const canNav = !!(recipe && setPage && setHighlightRecipeId);
                return (
                  <div key={p.id}
                    onClick={canNav ? () => { setHighlightRecipeId(recipe.id); setPage("recipes"); } : undefined}
                    style={{ background:"var(--redl)", border:"1px solid var(--redlb)", borderRadius:8, padding:"10px 12px", cursor: canNav ? "pointer" : "default" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 }}>
                      <div style={{ fontWeight:600, fontSize:".88em" }}>{p.name}</div>
                      {canNav && <span style={{ fontSize:".72em", color:"var(--t3)" }}>Ver receta →</span>}
                    </div>
                    <div style={{ fontSize:".8em", color:"var(--red)", fontWeight:700, marginTop:4 }}>
                      Margen: {p.margin.toFixed(1)}% <span style={{ fontWeight:400, color:"var(--t3)" }}>(mín. {p.minMargin}%)</span>
                    </div>
                    <div style={{ fontSize:".76em", color:"var(--t3)", marginTop:2 }}>
                      Costo/u: {$(p.costPerUnit)} · Precio: {$(p.price)}
                    </div>
                  </div>
                );
              })}
            </div>
        }
      </div>
    </div>
  );
}
