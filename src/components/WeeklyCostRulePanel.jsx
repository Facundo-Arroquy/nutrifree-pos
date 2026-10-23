/**
 * Panel con el estado de la regla de costos de la semana.
 * Recibe el resultado de `evaluateWeeklyCostRule` (ver utils/weeklyMenuRules.js).
 */
const STATUS_STYLE = {
  ok: { color: "var(--green2)", background: "var(--greenl)", borderColor: "var(--greenlb)" },
  pending: { color: "var(--t3)", background: "var(--s0)", borderColor: "var(--border)" },
  error: { color: "var(--red)", background: "var(--redl)", borderColor: "var(--redlb)" },
};
const ISSUE_COLOR = { error: "var(--red)", warning: "var(--amber)" };

const range = ({ min, max }) => min === max ? `${min}` : `${min}–${max}`;

export default function WeeklyCostRulePanel({ evaluation }) {
  const { tiers, issues, filled, slots, ok } = evaluation;
  return <div style={{ marginTop:18, paddingTop:16, borderTop:"1px solid var(--border)" }}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:8, flexWrap:"wrap", marginBottom:10 }}>
      <h4 style={{ margin:0 }}>Regla de costos</h4>
      <span role="status" style={{ fontSize:".78em", fontWeight:700, color:ok ? "var(--green2)" : "var(--t4)" }}>
        {ok ? "Cumple la regla ✓" : `${filled} de ${slots} menús cargados`}
      </span>
    </div>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(3, minmax(0, 1fr))", gap:10 }}>
      {tiers.map(t => <div key={t.tier} data-tier={t.tier} data-status={t.status} style={{ border:"1px solid", borderRadius:8, padding:"10px 12px", ...STATUS_STYLE[t.status] }}>
        <div style={{ fontSize:".72em", fontWeight:700, textTransform:"uppercase" }}>Costo {t.label.toLowerCase()}</div>
        <div style={{ fontSize:"1.25em", fontWeight:800 }}>{t.count} <span style={{ fontSize:".6em", fontWeight:600 }}>de {range(t)}</span></div>
      </div>)}
    </div>
    {issues.length > 0 && <ul style={{ margin:"12px 0 0", paddingLeft:18, fontSize:".82em", display:"grid", gap:4 }}>
      {issues.map(issue => <li key={issue.code + issue.message} style={{ color:ISSUE_COLOR[issue.level] }}>{issue.message}</li>)}
    </ul>}
  </div>;
}
