import { useState } from "react";
import { $, fmtDT, fmtTime, todayStr, PAY_LABELS } from "../shared.jsx";

function StatCard({ label, value, sub, color = "green" }) {
  const bg = { green:"var(--greenl)", amber:"var(--amberl)", blue:"var(--bluel)", red:"var(--redl)" };
  const bd = { green:"var(--greenlb)", amber:"var(--amberlb)", blue:"var(--blueb)", red:"var(--redlb)" };
  const tx = { green:"var(--green)", amber:"var(--amber)", blue:"var(--blue)", red:"var(--red)" };
  return (
    <div style={{ background:bg[color], border:`1px solid ${bd[color]}`, borderRadius:"var(--rl)", padding:20 }}>
      <div style={{ fontSize:".72em", fontWeight:700, textTransform:"uppercase", letterSpacing:".7px", color:"var(--t3)", marginBottom:8 }}>{label}</div>
      <div style={{ fontSize:"1.8em", fontWeight:800, color:tx[color], lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:".75em", color:"var(--t4)", marginTop:6 }}>{sub}</div>}
    </div>
  );
}

export default function DashboardPage({ sales, products, cashShifts, setPage }) {
  const today = todayStr();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo,   setDateTo]   = useState(today);

  // Normalizar: fin del día para dateTo
  const from = dateFrom || "0000-01-01";
  const to   = dateTo   || "9999-12-31";

  const inRange = s => {
    const d = s.createdAt?.slice(0, 10);
    return d >= from && d <= to;
  };

  const rangeSales = sales.filter(s => inRange(s) && ["closed","delivered"].includes(s.status));
  const rangeTotal    = rangeSales.reduce((sum, s) => sum + s.total, 0);
  const rangeCash     = rangeSales.filter(s => s.paymentMethod === "cash").reduce((sum, s) => sum + s.total, 0);
  const rangeTransfer = rangeSales.filter(s => s.paymentMethod === "transfer").reduce((sum, s) => sum + s.total, 0);

  const pendingOrders = sales.filter(s => ["pending","confirmed","ready"].includes(s.status)).length;

  const lowStock = products
    .filter(p => p.active && p.stock < 3)
    .sort((a, b) => a.stock - b.stock);

  const openShift = cashShifts.find(s => s.status === "open") || null;

  const recentSales = rangeSales.slice(0, 5);

  const isToday = dateFrom === today && dateTo === today;
  const periodLabel = isToday
    ? "Hoy"
    : dateFrom === dateTo
      ? dateFrom
      : `${dateFrom} → ${dateTo}`;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">{new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
        </div>
        {/* Filtro de fechas */}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <label style={{ fontSize:".8em", color:"var(--t3)", whiteSpace:"nowrap" }}>Desde</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ width:140 }}/>
          <label style={{ fontSize:".8em", color:"var(--t3)", whiteSpace:"nowrap" }}>Hasta</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ width:140 }}/>
          {!isToday && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setDateFrom(today); setDateTo(today); }}>
              Hoy
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:22 }}>
        <StatCard label={`Ventas · ${periodLabel}`} value={$(rangeTotal)} sub={`${rangeSales.length} transacciones`} color="green"/>
        <StatCard label="Efectivo" value={$(rangeCash)} sub="Ventas en efectivo" color="amber"/>
        <StatCard label="Transferencias" value={$(rangeTransfer)} sub="Ventas digitales" color="blue"/>
        <StatCard label="Pedidos pendientes" value={pendingOrders} sub={pendingOrders === 0 ? "Todo al día" : "Sin completar"} color={pendingOrders > 0 ? "amber" : "green"}/>
      </div>

      {/* Turno abierto */}
      {openShift && (
        <div style={{ background:"var(--greenl)", border:"1px solid var(--greenlb)", borderRadius:"var(--rl)", padding:"14px 20px", marginBottom:22, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:"1.3em" }}>💵</span>
            <div>
              <div style={{ fontWeight:700, color:"var(--green)", fontSize:".9em" }}>Turno abierto desde {fmtDT(openShift.openedAt)}</div>
              <div style={{ fontSize:".8em", color:"var(--t3)" }}>Responsable: <b>{openShift.openedBy}</b> · Inicial: <b>{$(openShift.initialCash)}</b></div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage("cash")}>Ver caja</button>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        {/* Ventas del período */}
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div className="section-title" style={{ margin:0 }}>Últimas ventas</div>
            <button className="btn btn-ghost btn-sm" style={{ fontSize:".8em" }} onClick={() => setPage("orders")}>Ver todo</button>
          </div>
          {recentSales.length === 0
            ? <div style={{ color:"var(--t3)", fontSize:".85em", padding:"12px 0" }}>Sin ventas en el período</div>
            : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Fecha</th><th>Cliente</th><th>Método</th><th>Total</th></tr></thead>
                  <tbody>
                    {recentSales.map(s => (
                      <tr key={s.id}>
                        <td style={{ color:"var(--t3)", fontSize:".82em", whiteSpace:"nowrap" }}>{fmtTime(s.createdAt)}</td>
                        <td style={{ fontSize:".88em" }}>{s.customerName || "Anónimo"}</td>
                        <td><span className={`badge ${s.paymentMethod==="cash"?"badge-green":s.paymentMethod==="transfer"?"badge-blue":s.paymentMethod==="account"?"badge-amber":"badge-gray"}`}>{PAY_LABELS[s.paymentMethod]||s.paymentMethod}</span></td>
                        <td style={{ fontWeight:700 }}>{$(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>

        {/* Productos con bajo stock */}
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div className="section-title" style={{ margin:0 }}>
              Bajo stock
              {lowStock.length > 0 && <span className="badge badge-red" style={{ marginLeft:6 }}>{lowStock.length}</span>}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ fontSize:".8em" }} onClick={() => setPage("products")}>Ver todo</button>
          </div>
          {lowStock.length === 0
            ? <div style={{ color:"var(--t3)", fontSize:".85em", padding:"12px 0" }}>✓ Todos los productos tienen stock suficiente</div>
            : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Producto</th><th>Categoría</th><th>Stock</th></tr></thead>
                  <tbody>
                    {lowStock.slice(0, 8).map(p => (
                      <tr key={p.id}>
                        <td style={{ fontSize:".88em" }}>{p.name}</td>
                        <td style={{ color:"var(--t3)", fontSize:".82em" }}>{p.category}</td>
                        <td>
                          <span className={`badge ${p.stock <= 0 ? "badge-red" : "badge-amber"}`}>
                            {p.stock <= 0 ? "Sin stock" : `${p.stock} ${p.unit||""}`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}
