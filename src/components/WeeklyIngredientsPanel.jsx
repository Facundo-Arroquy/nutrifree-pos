/**
 * Ingredientes necesarios para la producción de la semana, por día y en total.
 * Recibe el resultado de `computeWeeklyProduction` (ver utils/weeklyProduction.js).
 */
import { MEAL_COLUMNS, WEEK_DAYS, dayOfMonth } from "../utils/weeklyMenu.js";
import { formatQuantity } from "../utils/weeklyProduction.js";

const ISSUE_TEXT = {
  "no-recipe": "no tiene receta con cantidades cargadas",
  incomplete: "receta incompleta: suma solo los ingredientes que tienen cantidad",
  "no-product": "no se encontró el producto (¿se renombró o se borró?)",
  "no-qty": "falta cargar las unidades a producir",
};

const cell = value => value > 0 ? formatQuantity(value) : "—";

export default function WeeklyIngredientsPanel({ production, weekStart }) {
  const { groups, issues, units, rows } = production;
  const mealSummary = MEAL_COLUMNS.filter(col => units.perMeal[col.key] > 0).map(col => `${col.label} ${formatQuantity(units.perMeal[col.key])}`).join(" · ");

  return <section className="card" style={{ marginTop:20 }} aria-label="Ingredientes de la semana">
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:8, flexWrap:"wrap", marginBottom:4 }}>
      <h3 style={{ margin:0 }}>Ingredientes de la semana</h3>
      <span style={{ fontSize:".82em", fontWeight:700, color:"var(--green2)" }}>
        {units.total ? `${formatQuantity(units.total)} unidades a producir` : "Sin unidades cargadas"}
      </span>
    </div>
    <p style={{ color:"var(--t4)", fontSize:".82em", marginBottom:14 }}>
      {mealSummary || "Cargá las unidades a producir de cada comida para ver los ingredientes."} · Cantidad de la receta × unidades ÷ rendimiento.
    </p>

    {issues.length > 0 && <div role="alert" style={{ border:"1px solid var(--amberlb)", background:"var(--amberl)", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:".82em" }}>
      <strong style={{ color:"var(--amber)" }}>{issues.length === 1 ? "1 plato no suma completo" : `${issues.length} platos no suman completo`}</strong>
      <ul style={{ margin:"6px 0 0", paddingLeft:18, display:"grid", gap:2 }}>
        {issues.map(issue => <li key={`${issue.day}-${issue.meal}`}>
          {issue.dayLabel} · {issue.mealLabel} — <strong>{issue.name}</strong>: {ISSUE_TEXT[issue.status]}
        </li>)}
      </ul>
    </div>}

    {rows.length === 0 ? <p style={{ color:"var(--t4)", fontSize:".86em" }}>Todavía no hay ingredientes para mostrar.</p> : <div className="table-wrap">
      <table>
        <thead><tr>
          <th>Ingrediente</th><th>Unidad</th>
          {WEEK_DAYS.map((day, index) => <th key={day.key} style={{ textAlign:"right" }}>{day.label.slice(0, 3)} {dayOfMonth(weekStart, index)}</th>)}
          <th style={{ textAlign:"right" }}>Total semana</th>
        </tr></thead>
        <tbody>
          {groups.map(group => [
            <tr key={`g-${group.category}`}>
              <td colSpan={WEEK_DAYS.length + 3} data-label="" style={{ background:"var(--greenl)", fontWeight:700, fontSize:".78em", textTransform:"uppercase", letterSpacing:".6px", color:"var(--green2)", justifyContent:"flex-start" }}>{group.category}</td>
            </tr>,
            ...group.rows.map(row => <tr key={row.ingredientId}>
              <td data-label="Ingrediente" style={{ fontWeight:600 }}>{row.name}</td>
              <td data-label="Unidad" style={{ color:"var(--t3)" }}>{row.unit}</td>
              {WEEK_DAYS.map(day => <td key={day.key} data-label={day.label} style={{ textAlign:"right", color:row.perDay[day.key] > 0 ? "var(--t1)" : "var(--t4)" }}>{cell(row.perDay[day.key])}</td>)}
              <td data-label="Total semana" style={{ textAlign:"right", fontWeight:800 }}>{cell(row.total)}</td>
            </tr>),
          ])}
        </tbody>
      </table>
    </div>}
  </section>;
}
