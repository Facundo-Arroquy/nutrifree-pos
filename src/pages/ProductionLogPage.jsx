/**
 * ProductionLogPage — Registro de producción con asignación de empleados.
 *
 * Flujo:
 *  1. Seleccioná una receta (searchable)
 *  2. Marcá empleados de cocina (si cook_time > 0) y empaque (si packaging_time > 0)
 *  3. Al registrar: inserta en `productions` + `production_employees` y acumula
 *     horas en `employee_hours` vía RPC.
 *
 * Nota: la sección de empaque solo aparece si la receta tiene `packaging_time > 0`.
 * Configurá ese campo en cada receta desde la sección de Recetas.
 *
 * Props: user, recipes, products, showToast
 */
import { useState, useEffect } from "react";
import { Ico } from "../shared.jsx";
import { supabase } from "../supabase.js";

const fmt = (mins) => {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
};

export default function ProductionLogPage({ user, recipes, products, showToast }) {
  const [employees, setEmployees] = useState([]);
  const [loadingEmps, setLoadingEmps] = useState(true);

  // Recipe selector
  const [recipeSearch, setRecipeSearch] = useState("");
  const [showDrop, setShowDrop] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState(null);

  // Employee assignment
  const [cookingEmps, setCookingEmps] = useState([]);
  const [packagingEmps, setPackagingEmps] = useState([]);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.isDemo) { setLoadingEmps(false); return; }
    supabase
      .from("business_users")
      .select("id, name, email, active")
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        setLoadingEmps(false);
        if (data) setEmployees(data);
      });
  }, [user]);

  const getProductName = (recipe) =>
    products.find(p => p.id === recipe.productId)?.name || `Receta (${recipe.id.slice(0, 6)})`;

  const filteredRecipes = recipes.filter(r => {
    if (!recipeSearch) return true;
    return getProductName(r).toLowerCase().includes(recipeSearch.toLowerCase());
  });

  const toggleEmp = (id, list, setList) =>
    setList(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const selectRecipe = (r) => {
    setSelectedRecipe(r);
    setRecipeSearch("");
    setShowDrop(false);
    setCookingEmps([]);
    setPackagingEmps([]);
  };

  const clearRecipe = () => {
    setSelectedRecipe(null);
    setRecipeSearch("");
    setCookingEmps([]);
    setPackagingEmps([]);
  };

  const handleRegister = async () => {
    if (!selectedRecipe) { showToast("Seleccioná una receta", "error"); return; }
    const cookTime = selectedRecipe.cookTime || 0;
    const packTime = selectedRecipe.packagingTime || 0;
    if (cookTime > 0 && cookingEmps.length === 0) {
      showToast("Asigná al menos 1 empleado de cocina", "error"); return;
    }
    if (packTime > 0 && packagingEmps.length === 0) {
      showToast("Asigná al menos 1 empleado de empaque", "error"); return;
    }
    if (cookingEmps.length === 0 && packagingEmps.length === 0) {
      showToast("Asigná al menos 1 empleado", "error"); return;
    }

    setSaving(true);
    try {
      // 1. Insert production
      const productionId = crypto.randomUUID();
      const { error: prodErr } = await supabase
        .from("productions")
        .insert({ id: productionId, recipe_id: selectedRecipe.id });
      if (prodErr) throw prodErr;

      const cookHoursEach = cookingEmps.length > 0 ? (cookTime / 60) / cookingEmps.length : 0;
      const packHoursEach = packagingEmps.length > 0 ? (packTime / 60) / packagingEmps.length : 0;

      // 2. Insert production_employees
      const peRows = [
        ...cookingEmps.map(eid => ({
          id: crypto.randomUUID(), production_id: productionId,
          employee_id: eid, role: "cooking", hours: cookHoursEach,
        })),
        ...packagingEmps.map(eid => ({
          id: crypto.randomUUID(), production_id: productionId,
          employee_id: eid, role: "packaging", hours: packHoursEach,
        })),
      ];

      const { error: peErr } = await supabase.from("production_employees").insert(peRows);
      if (peErr) throw peErr;

      // 3. Acumular horas via RPC
      const rpcCalls = [
        ...cookingEmps.map(eid =>
          supabase.rpc("accumulate_employee_hours", {
            p_employee_id: eid, p_cooking_delta: cookHoursEach, p_packaging_delta: 0,
          })
        ),
        ...packagingEmps.map(eid =>
          supabase.rpc("accumulate_employee_hours", {
            p_employee_id: eid, p_cooking_delta: 0, p_packaging_delta: packHoursEach,
          })
        ),
      ];
      const results = await Promise.all(rpcCalls);
      const rpcErr = results.find(r => r.error)?.error;
      if (rpcErr) throw rpcErr;

      showToast("Producción registrada ✓");
      clearRecipe();
    } catch (err) {
      showToast("Error: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const EmpList = ({ selected, onToggle, accentClass, accentBorder, hoursEach }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {loadingEmps ? (
        <p style={{ fontSize: ".85em", color: "var(--t3)" }}>Cargando empleados...</p>
      ) : employees.length === 0 ? (
        <p style={{ fontSize: ".85em", color: "var(--t4)" }}>No hay empleados activos registrados.</p>
      ) : (
        employees.map(emp => {
          const checked = selected.includes(emp.id);
          return (
            <label
              key={emp.id}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                minHeight: 48, padding: "10px 14px", borderRadius: 10,
                cursor: "pointer", userSelect: "none",
                background: checked ? `var(--${accentClass}l, var(--greenl))` : "var(--s1)",
                border: `1px solid ${checked ? `var(--${accentClass}lb, var(--greenlb))` : "var(--border)"}`,
                transition: "background .12s, border-color .12s",
              }}
            >
              <input
                type="checkbox" checked={checked}
                onChange={() => onToggle(emp.id)}
                style={{ width: 18, height: 18, cursor: "pointer", flexShrink: 0 }}
              />
              <span style={{ fontWeight: checked ? 600 : 400, fontSize: ".92em", flex: 1 }}>
                {emp.name || emp.email}
              </span>
              {checked && hoursEach > 0 && (
                <span style={{ fontSize: ".78em", fontWeight: 700, color: `var(--${accentClass}, var(--green))` }}>
                  {hoursEach.toFixed(2)}h
                </span>
              )}
            </label>
          );
        })
      )}
    </div>
  );

  const cookHoursEach = cookingEmps.length > 0 ? ((selectedRecipe?.cookTime || 0) / 60) / cookingEmps.length : 0;
  const packHoursEach = packagingEmps.length > 0 ? ((selectedRecipe?.packagingTime || 0) / 60) / packagingEmps.length : 0;

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Registro de Producción</div></div>
      </div>

      <div style={{ maxWidth: 700 }}>

        {/* ── Selector de receta ────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">Receta</div>

          {selectedRecipe ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--greenl)", border: "1px solid var(--greenlb)", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: ".98em" }}>{getProductName(selectedRecipe)}</div>
                <div style={{ fontSize: ".78em", color: "var(--t3)", marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {selectedRecipe.prepTime > 0 && <span>Prep: {fmt(selectedRecipe.prepTime)}</span>}
                  {selectedRecipe.cookTime > 0 && <span>🍳 Cocina: {fmt(selectedRecipe.cookTime)}</span>}
                  {selectedRecipe.packagingTime > 0 && <span>📦 Empaque: {fmt(selectedRecipe.packagingTime)}</span>}
                </div>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={clearRecipe}>
                <Ico n="x" s={14} c="var(--red)"/>
              </button>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <input
                value={recipeSearch}
                onChange={e => { setRecipeSearch(e.target.value); setShowDrop(true); }}
                onFocus={() => setShowDrop(true)}
                onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                placeholder="Buscar receta por nombre de producto..."
                style={{ fontSize: ".95em" }}
              />
              {showDrop && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--bg1)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 6px 24px rgba(0,0,0,.12)", zIndex: 50, maxHeight: 260, overflowY: "auto" }}>
                  {filteredRecipes.length === 0 ? (
                    <div style={{ padding: "12px 16px", fontSize: ".85em", color: "var(--t4)" }}>Sin resultados</div>
                  ) : (
                    filteredRecipes.map(r => (
                      <div
                        key={r.id}
                        style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                        onMouseDown={() => selectRecipe(r)}
                      >
                        <span style={{ fontWeight: 500, fontSize: ".9em" }}>{getProductName(r)}</span>
                        <span style={{ fontSize: ".75em", color: "var(--t3)", display: "flex", gap: 10 }}>
                          {r.cookTime > 0 && <span>🍳 {fmt(r.cookTime)}</span>}
                          {r.packagingTime > 0 && <span>📦 {fmt(r.packagingTime)}</span>}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Empleados (solo si hay receta seleccionada) ───────── */}
        {selectedRecipe && (
          <>
            {selectedRecipe.cookTime > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>🍳 Empleados de cocina</span>
                  <span style={{ fontWeight: 400, color: "var(--t3)", fontSize: ".8em" }}>
                    {cookingEmps.length > 0 ? `${cookingEmps.length} sel. · ${cookHoursEach.toFixed(2)}h c/u` : `Total: ${fmt(selectedRecipe.cookTime)}`}
                  </span>
                </div>
                <EmpList
                  selected={cookingEmps}
                  onToggle={id => toggleEmp(id, cookingEmps, setCookingEmps)}
                  accentClass="green"
                  hoursEach={cookHoursEach}
                />
              </div>
            )}

            {selectedRecipe.packagingTime > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>📦 Empleados de empaque</span>
                  <span style={{ fontWeight: 400, color: "var(--t3)", fontSize: ".8em" }}>
                    {packagingEmps.length > 0 ? `${packagingEmps.length} sel. · ${packHoursEach.toFixed(2)}h c/u` : `Total: ${fmt(selectedRecipe.packagingTime)}`}
                  </span>
                </div>
                <EmpList
                  selected={packagingEmps}
                  onToggle={id => toggleEmp(id, packagingEmps, setPackagingEmps)}
                  accentClass="blue"
                  hoursEach={packHoursEach}
                />
              </div>
            )}

            {selectedRecipe.packagingTime === 0 && selectedRecipe.cookTime === 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <p style={{ fontSize: ".85em", color: "var(--t3)" }}>
                  Esta receta no tiene tiempos configurados. Editá la receta para agregar <strong>tiempo de cocina</strong> o <strong>tiempo de empaque</strong>.
                </p>
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ width: "100%", padding: "14px 0", fontSize: "1em", fontWeight: 700, borderRadius: 12, marginBottom: 24 }}
              onClick={handleRegister}
              disabled={saving}
            >
              {saving ? "Registrando..." : "✓ Registrar producción"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
