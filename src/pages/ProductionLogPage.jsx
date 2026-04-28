/**
 * ProductionLogPage — Registro de producción con asignación de empleados.
 *
 * Flujo:
 *  1. Seleccioná una receta (searchable)
 *  2. Ingresá cantidad de lotes (default 1)
 *  3. Marcá empleados de cocina (si cook_time > 0) y empaque (si packaging_time > 0)
 *  4. Al registrar:
 *     - Inserta en `productions` (con batches)
 *     - Inserta en `production_employees`
 *     - Acumula horas en `employee_hours` vía RPC (multiplicadas por lotes)
 *     - Incrementa stock del producto: batches × recipe.yield
 *     - Registra movimiento en `stock_movements`
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

export default function ProductionLogPage({ user, recipes, products, setProducts, showToast }) {
  const [employees, setEmployees] = useState([]);
  const [loadingEmps, setLoadingEmps] = useState(true);

  // Recipe selector
  const [recipeSearch, setRecipeSearch] = useState("");
  const [showDrop, setShowDrop] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState(null);

  // Batches
  const [batches, setBatches] = useState(1);

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

  const getProduct = (recipe) => products.find(p => p.id === recipe.productId);
  const getProductName = (recipe) =>
    getProduct(recipe)?.name || `Receta (${recipe.id.slice(0, 6)})`;

  const CATEGORY = "Pastelería";
  const norm = s => s?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
  const filteredRecipes = recipes.filter(r => {
    const prod = products.find(p => p.id === r.productId);
    if (!prod || norm(prod.category) !== norm(CATEGORY)) return false;
    if (!recipeSearch) return true;
    return prod.name.toLowerCase().includes(recipeSearch.toLowerCase());
  });

  const toggleEmp = (id, list, setList) =>
    setList(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const selectRecipe = (r) => {
    setSelectedRecipe(r);
    setRecipeSearch("");
    setShowDrop(false);
    setBatches(1);
    setCookingEmps([]);
    setPackagingEmps([]);
  };

  const clearRecipe = () => {
    setSelectedRecipe(null);
    setRecipeSearch("");
    setBatches(1);
    setCookingEmps([]);
    setPackagingEmps([]);
  };

  const handleRegister = async () => {
    if (!selectedRecipe) { showToast("Seleccioná una receta", "error"); return; }
    const b = Math.max(1, batches || 1);
    const cookTime = (selectedRecipe.cookTime || 0) * b;
    const packTime = (selectedRecipe.packagingTime || 0) * b;

    if (!(selectedRecipe.yield > 0)) {
      showToast("La receta no tiene rendimiento configurado. Editá la receta para agregar el campo 'Rendimiento'.", "error"); return;
    }
    if ((selectedRecipe.cookTime || 0) > 0 && cookingEmps.length === 0) {
      showToast("Asigná al menos 1 empleado de cocina", "error"); return;
    }
    if ((selectedRecipe.packagingTime || 0) > 0 && packagingEmps.length === 0) {
      showToast("Asigná al menos 1 empleado de empaque", "error"); return;
    }
    if (cookingEmps.length === 0 && packagingEmps.length === 0) {
      showToast("Asigná al menos 1 empleado", "error"); return;
    }

    const product = getProduct(selectedRecipe);
    const totalUnits = b * selectedRecipe.yield;

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

      // 4. Actualizar stock del producto (fetch fresco para evitar estado desactualizado)
      if (product) {
        const { data: freshProd, error: fetchErr } = await supabase
          .from("products").select("stock").eq("id", product.id).single();
        if (fetchErr) throw fetchErr;
        const newStock = (freshProd.stock || 0) + totalUnits;
        const { error: stockErr } = await supabase
          .from("products")
          .update({ stock: newStock })
          .eq("id", product.id);
        if (stockErr) throw stockErr;
        setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stock: newStock } : p));

        // 5. Registrar movimiento de stock
        const { error: mvErr } = await supabase
          .from("stock_movements")
          .insert({
            id: crypto.randomUUID(),
            product_id: product.id,
            product_name: product.name,
            qty: totalUnits,
            type: "production",
            notes: `${b} lote${b > 1 ? "s" : ""} de receta`,
          });
        if (mvErr) throw mvErr;
      }

      showToast(`Producción registrada ✓ (+${totalUnits} uds.)`);
      clearRecipe();
    } catch (err) {
      showToast("Error: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const b = Math.max(1, batches || 1);
  const cookHoursEach = cookingEmps.length > 0
    ? (((selectedRecipe?.cookTime || 0) * b) / 60) / cookingEmps.length
    : 0;
  const packHoursEach = packagingEmps.length > 0
    ? (((selectedRecipe?.packagingTime || 0) * b) / 60) / packagingEmps.length
    : 0;
  const totalUnitsPreview = b * (selectedRecipe?.yield || 0);

  const EmpList = ({ selected, onToggle, accentClass, hoursEach }) => (
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

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Registro de Producción</div></div>
      </div>

      <div style={{ maxWidth: 700 }}>

        {/* ── Selector de receta ────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title" style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span>Receta</span>
            <span style={{ fontWeight:400, color:"var(--t4)", fontSize:".78em", textTransform:"none", letterSpacing:0 }}>
              Solo productos de <strong>Pastelería</strong>
            </span>
          </div>

          {selectedRecipe ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--greenl)", border: "1px solid var(--greenlb)", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: ".98em" }}>{getProductName(selectedRecipe)}</div>
                <div style={{ fontSize: ".78em", color: "var(--t3)", marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {selectedRecipe.prepTime > 0 && <span>Prep: {fmt(selectedRecipe.prepTime)}</span>}
                  {selectedRecipe.cookTime > 0 && <span>🍳 Cocina: {fmt(selectedRecipe.cookTime)}</span>}
                  {selectedRecipe.packagingTime > 0 && <span>📦 Empaque: {fmt(selectedRecipe.packagingTime)}</span>}
                  {selectedRecipe.yield > 0 && <span>📦 Rinde: {selectedRecipe.yield} uds.</span>}
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
                          {r.yield > 0 && <span>×{r.yield} uds.</span>}
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

        {/* ── Lotes + empleados (solo si hay receta seleccionada) ── */}
        {selectedRecipe && (
          <>
            {/* Cantidad de lotes */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-title">Cantidad de lotes</div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => setBatches(v => Math.max(1, (v || 1) - 1))}
                    style={{ width: 36, height: 36, fontSize: "1.2em", fontWeight: 700 }}
                  >−</button>
                  <input
                    type="number" min={1}
                    value={batches}
                    onChange={e => setBatches(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{ width: 64, textAlign: "center", fontSize: "1.1em", fontWeight: 700, padding: "6px 8px" }}
                  />
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => setBatches(v => (v || 1) + 1)}
                    style={{ width: 36, height: 36, fontSize: "1.2em", fontWeight: 700 }}
                  >+</button>
                </div>

                {/* Resumen de unidades y tiempos */}
                <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 12, fontSize: ".83em", color: "var(--t3)" }}>
                  {selectedRecipe.yield > 0 && (
                    <span style={{ fontWeight: 700, color: "var(--green)", fontSize: ".95em" }}>
                      = {totalUnitsPreview} uds. de {getProductName(selectedRecipe)}
                    </span>
                  )}
                  {selectedRecipe.cookTime > 0 && b > 1 && (
                    <span>🍳 {fmt(selectedRecipe.cookTime * b)} total cocina</span>
                  )}
                  {selectedRecipe.packagingTime > 0 && b > 1 && (
                    <span>📦 {fmt(selectedRecipe.packagingTime * b)} total empaque</span>
                  )}
                </div>
              </div>
            </div>

            {selectedRecipe.cookTime > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>🍳 Empleados de cocina</span>
                  <span style={{ fontWeight: 400, color: "var(--t3)", fontSize: ".8em" }}>
                    {cookingEmps.length > 0
                      ? `${cookingEmps.length} sel. · ${cookHoursEach.toFixed(2)}h c/u`
                      : `Total: ${fmt(selectedRecipe.cookTime * b)}`}
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
                    {packagingEmps.length > 0
                      ? `${packagingEmps.length} sel. · ${packHoursEach.toFixed(2)}h c/u`
                      : `Total: ${fmt(selectedRecipe.packagingTime * b)}`}
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
              {saving ? "Registrando..." : `✓ Registrar producción${totalUnitsPreview > 0 ? ` (+${totalUnitsPreview} uds.)` : ""}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
