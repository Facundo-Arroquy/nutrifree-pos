/**
 * HoursBankPage — Banco de horas por empleado. Solo admin.
 *
 * - Tabla resumen: empleado | horas cocina | horas empaque | total
 * - Click en fila → modal de detalle con lista de producciones asignadas
 * - Botón "×" en cada fila del detalle → descuenta las horas de esa producción
 *
 * Props: user, recipes, products, showToast
 */
import { useState, useEffect } from "react";
import { Ico } from "../shared.jsx";
import { supabase } from "../supabase.js";

export default function HoursBankPage({ user, recipes, products, showToast }) {
  const [hoursData, setHoursData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null); // { employee, rows: [], loading }
  const [subtracting, setSubtracting] = useState(null);

  useEffect(() => { loadHours(); }, []);

  const loadHours = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("employee_hours")
      .select("employee_id, cooking_hours, packaging_hours, business_users(id, name, email)");
    setLoading(false);
    if (error) { showToast("Error al cargar: " + error.message, "error"); return; }
    // Ordenar por total desc
    const sorted = (data || []).sort(
      (a, b) => (b.cooking_hours + b.packaging_hours) - (a.cooking_hours + a.packaging_hours)
    );
    setHoursData(sorted);
  };

  const getRecipeName = (recipeId) => {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return "Receta eliminada";
    return products.find(p => p.id === recipe.productId)?.name || "—";
  };

  const openDetail = async (row) => {
    setDetail({ employee: row.business_users, rows: [], loading: true });
    const { data, error } = await supabase
      .from("production_employees")
      .select("id, role, hours, employee_id, productions(id, created_at, recipe_id)")
      .eq("employee_id", row.employee_id);
    if (error) {
      showToast("Error: " + error.message, "error");
      setDetail(null);
      return;
    }
    const sorted = (data || []).sort(
      (a, b) => new Date(b.productions?.created_at) - new Date(a.productions?.created_at)
    );
    setDetail({ employee: row.business_users, rows: sorted, loading: false });
  };

  const subtractHours = async (pe) => {
    if (!confirm(`¿Descontar ${pe.hours.toFixed(2)}h de esta producción?`)) return;
    setSubtracting(pe.id);
    const { error } = await supabase.rpc("accumulate_employee_hours", {
      p_employee_id: pe.employee_id,
      p_cooking_delta:   pe.role === "cooking"   ? -pe.hours : 0,
      p_packaging_delta: pe.role === "packaging" ? -pe.hours : 0,
    });
    setSubtracting(null);
    if (error) { showToast("Error: " + error.message, "error"); return; }
    showToast("Horas descontadas ✓");
    setDetail(prev => ({ ...prev, rows: prev.rows.filter(r => r.id !== pe.id) }));
    loadHours();
  };

  const fmtDate = (iso) =>
    iso
      ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "—";

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Banco de Horas</div></div>
      </div>

      <div className="card">
        <div className="section-title">Horas acumuladas por empleado</div>

        {loading ? (
          <p style={{ fontSize: ".85em", color: "var(--t3)" }}>Cargando...</p>
        ) : hoursData.length === 0 ? (
          <p style={{ fontSize: ".85em", color: "var(--t4)", fontStyle: "italic" }}>
            Sin registros. Las horas se acumulan al registrar producciones.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".87em" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--t3)" }}>
                  <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 500 }}>Empleado</th>
                  <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 500 }}>🍳 Cocina</th>
                  <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 500 }}>📦 Empaque</th>
                  <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 500 }}>Total</th>
                  <th style={{ padding: "6px 10px" }}></th>
                </tr>
              </thead>
              <tbody>
                {hoursData.map(row => {
                  const total = row.cooking_hours + row.packaging_hours;
                  return (
                    <tr key={row.employee_id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 10px", fontWeight: 500 }}>
                        {row.business_users?.name || row.business_users?.email || "—"}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", color: "var(--t2)" }}>
                        {row.cooking_hours.toFixed(2)}h
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", color: "var(--t2)" }}>
                        {row.packaging_hours.toFixed(2)}h
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: 700 }}>
                        {total.toFixed(2)}h
                      </td>
                      <td style={{ padding: "10px 10px" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openDetail(row)}>
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal de detalle ──────────────────────────────────────── */}
      {detail && (
        <div className="modal-bg" onClick={e => { if (e.target.className === "modal-bg") setDetail(null); }}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">
                {detail.employee?.name || detail.employee?.email} — Producciones
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDetail(null)}>
                <Ico n="x" s={18}/>
              </button>
            </div>

            {detail.loading ? (
              <p style={{ fontSize: ".85em", color: "var(--t3)" }}>Cargando...</p>
            ) : detail.rows.length === 0 ? (
              <p style={{ fontSize: ".85em", color: "var(--t4)" }}>Sin producciones registradas.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85em" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--t3)" }}>
                      <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 500 }}>Fecha</th>
                      <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 500 }}>Receta</th>
                      <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 500 }}>Rol</th>
                      <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 500 }}>Horas</th>
                      <th style={{ padding: "6px 10px" }} title="Descontar horas (producción fallida)"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.rows.map(pe => (
                      <tr key={pe.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 10px", color: "var(--t3)", whiteSpace: "nowrap" }}>
                          {fmtDate(pe.productions?.created_at)}
                        </td>
                        <td style={{ padding: "8px 10px", fontWeight: 500 }}>
                          {getRecipeName(pe.productions?.recipe_id)}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <span className={`badge ${pe.role === "cooking" ? "badge-amber" : "badge-blue"}`}>
                            {pe.role === "cooking" ? "Cocina" : "Empaque"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>
                          {pe.hours.toFixed(2)}h
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            title="Descontar horas (producción fallida)"
                            disabled={subtracting === pe.id}
                            onClick={() => subtractHours(pe)}
                          >
                            <Ico n="x" s={13} c="var(--red)"/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDetail(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
