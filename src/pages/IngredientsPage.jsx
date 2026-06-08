/**
 * IngredientsPage — Inventario de materias primas.
 *
 * CRUD de ingredientes con stock, stock mínimo y costo unitario. Muestra alertas
 * visuales para ingredientes bajo su stock mínimo. Permite editar stock y precio
 * directamente en la tabla sin abrir el modal.
 *
 * Props: ingredients, setIngredients, showToast
 */
import { useState } from "react";
import { Ico, Modal, $, SortableTh, exportXlsx } from "../shared.jsx";
import { supabase, ingredientToDb, recipeToDb } from "../supabase.js";

const INGR_CATS = ["Harinas","Lácteos","Grasas/Aceites","Endulzantes","Frutas/Verduras","Especias","Proteínas","Otros"];
const INGR_UNITS = ["g","kg","ml","l","unidad","unidades","cdas","ctas"];

// Factor de conversión entre unidades. null = no convertible.
// Asume densidad 1 para conversiones volumen↔peso (1L = 1000g).
const UNIT_BASE = { g: 1, kg: 1000, ml: 1, l: 1000 }; // bases en g/ml
const VOLUME_UNITS = new Set(["ml", "l"]);
const WEIGHT_UNITS = new Set(["g", "kg"]);

function getConversion(from, to) {
  if (from === to) return { factor: 1, crossType: false };
  const fromBase = UNIT_BASE[from];
  const toBase = UNIT_BASE[to];
  if (!fromBase || !toBase) return null; // unidad/unidades/cdas/ctas → incompatible
  const factor = fromBase / toBase;
  const crossType = (VOLUME_UNITS.has(from) && WEIGHT_UNITS.has(to)) ||
                    (WEIGHT_UNITS.has(from) && VOLUME_UNITS.has(to));
  return { factor, crossType };
}

export default function IngredientsPage({ ingredients, setIngredients, recipes, setRecipes, products, setPage, setOpenRecipeId, showToast }) {
  const emptyForm = { name:"", category:"Harinas", unit:"g", stock:0, stockMin:0, unitCost:0, supplier:"", notes:"", calories:"", protein:"", carbs:"", fat:"", fiber:"", sugar:"", sodium:"" };
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filterCat, setFilterCat] = useState("Todos");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(key); setSortDir("asc"); }
  };
  const [stockEdit, setStockEdit] = useState({});
  const [priceEdit, setPriceEdit] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, count, replacement }
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));

  const recipesForIngredient = (ingredientId) =>
    (recipes || []).filter(r => r.ingredients?.some(ri => ri.ingredientId === ingredientId));

  const goToRecipe = (recipeId) => {
    setOpenRecipeId(recipeId);
    setPage("recipes");
  };

  const SORT_ACCESSORS = {
    name:     i => i.name,
    category: i => i.category,
    unit:     i => i.unit,
    stock:    i => i.stock ?? 0,
    stockMin: i => i.stockMin ?? 0,
    unitCost: i => i.unitCost ?? 0,
    supplier: i => i.supplier ?? "",
  };

  const filtered = ingredients
    .filter(i => (filterCat==="Todos" || i.category===filterCat) && (!search || i.name.toLowerCase().includes(search.toLowerCase())))
    .sort((a,b) => {
      const acc = SORT_ACCESSORS[sortBy] || SORT_ACCESSORS.name;
      const av = acc(a), bv = acc(b);
      let v = typeof av === "string" ? av.localeCompare(bv, undefined, { sensitivity:"base" }) : (av - bv);
      return sortDir === "asc" ? v : -v;
    });

  const lowStock = ingredients.filter(i => i.stockMin > 0 && i.stock <= i.stockMin);
  const totalValue = ingredients.reduce((a,i) => a + i.stock * i.unitCost, 0);

  const openNew  = () => { setForm(emptyForm); setModal("new"); };
  const openEdit = i  => { setForm({...i}); setModal(i); };

  const exportExcel = () => {
    const headers = ["Nombre","Categoría","Unidad","Stock","Stock Mínimo","Costo/Unidad","Proveedor","Notas","Calorías (kcal)","Proteínas (g)","Carbohidratos (g)","Grasas (g)","Fibra (g)","Azúcares (g)","Sodio (mg)"];
    const rows = ingredients.map(i => [i.name, i.category, i.unit, i.stock, i.stockMin, i.unitCost, i.supplier||"", i.notes||"", i.calories??"", i.protein??"", i.carbs??"", i.fat??"", i.fiber??"", i.sugar??"", i.sodium??""]);
    exportXlsx(headers, rows, "ingredientes");
  };

  const save = async () => {
    if (submitting) return;
    if (!form.name) { showToast("El nombre es obligatorio", "error"); return; }
    setSubmitting(true);
    try {
      const data = { ...form, stock:Number(form.stock)||0, stockMin:Number(form.stockMin)||0, unitCost:Number(form.unitCost)||0 };
      if (modal==="new") {
        const newIngr = { ...data, id: crypto.randomUUID() };
        const { error } = await supabase.from("ingredients").insert(ingredientToDb(newIngr));
        if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
        setIngredients(p=>[...p, newIngr]);
      } else {
        const oldIngr = ingredients.find(i => i.id === modal.id);
        const unitChanged = oldIngr && oldIngr.unit !== data.unit;

        const { error } = await supabase.from("ingredients").update(ingredientToDb(data)).eq("id", modal.id);
        if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
        setIngredients(p=>p.map(i=>i.id===modal.id?{...i,...data}:i));

        // Si cambió la unidad, convertir cantidades en recetas y actualizar recipe_ingredients
        if (unitChanged && recipes?.length) {
          const conversion = getConversion(oldIngr.unit, data.unit);
          const affectedRecipes = recipes.filter(r =>
            r.ingredients.some(ri => ri.ingredientId === modal.id)
          );
          for (const recipe of affectedRecipes) {
            for (const ri of recipe.ingredients.filter(ri => ri.ingredientId === modal.id)) {
              const newQty = conversion ? +(ri.qty * conversion.factor).toFixed(6) : ri.qty;
              const newCost = newQty * data.unitCost;
              const { error: riErr } = await supabase.from("recipe_ingredients")
                .update({ unit: data.unit, qty: newQty, cost: newCost })
                .eq("id", ri.id);
              if (riErr) { showToast("Error al actualizar ingrediente de receta: " + riErr.message, "error"); return; }
            }
            // Solo marcar para revisión si la conversión es entre tipos distintos o imposible
            const needsReview = !conversion || conversion.crossType;
            if (needsReview) {
              const reason = conversion
                ? `Unidad de "${data.name}" cambió de ${oldIngr.unit} → ${data.unit} (conversión aproximada, verificar cantidades)`
                : `Unidad de "${data.name}" cambió de ${oldIngr.unit} → ${data.unit} (conversión no automática, revisar cantidades)`;
              const { error: recErr } = await supabase.from("recipes")
                .update({ needs_review: true, review_reason: reason })
                .eq("id", recipe.id);
              if (recErr) { showToast("Error al marcar receta para revisión: " + recErr.message, "error"); return; }
            }
          }
          if (affectedRecipes.length > 0) {
            setRecipes(prev => prev.map(r => {
              if (!affectedRecipes.find(ar => ar.id === r.id)) return r;
              const needsReview = !conversion || conversion.crossType;
              const reason = conversion
                ? `Unidad de "${data.name}" cambió de ${oldIngr.unit} → ${data.unit} (conversión aproximada, verificar cantidades)`
                : `Unidad de "${data.name}" cambió de ${oldIngr.unit} → ${data.unit} (conversión no automática, revisar cantidades)`;
              return {
                ...r,
                ...(needsReview ? { needsReview: true, reviewReason: reason } : {}),
                ingredients: r.ingredients.map(ri => {
                  if (ri.ingredientId !== modal.id) return ri;
                  const newQty = conversion ? +(ri.qty * conversion.factor).toFixed(6) : ri.qty;
                  return { ...ri, unit: data.unit, qty: newQty, cost: newQty * data.unitCost };
                }),
              };
            }));
            if (!conversion) {
              showToast(`Unidades incompatibles — revisá las cantidades en ${affectedRecipes.length} receta${affectedRecipes.length !== 1 ? "s" : ""}`, "error");
            } else if (conversion.crossType) {
              showToast(`Conversión aproximada aplicada (1 ${oldIngr.unit} ≈ ${conversion.factor} ${data.unit}) — verificar recetas`);
            } else {
              showToast(`Cantidades convertidas en ${affectedRecipes.length} receta${affectedRecipes.length !== 1 ? "s" : ""}`);
            }
          }
        }
      }
      setModal(null);
      showToast("Ingrediente guardado");
    } finally {
      setSubmitting(false);
    }
  };

  const del = async (id) => {
    const { data: usages } = await supabase
      .from("recipe_ingredients")
      .select("id")
      .eq("ingredient_id", id);
    const inUse = usages && usages.length > 0;
    if (inUse) {
      setDeleteConfirm({ id, count: usages.length, replacement: "" });
    } else {
      if (!confirm("¿Eliminar ingrediente?")) return;
      await execDelete(id, null);
    }
  };

  const execDelete = async (id, replacementId) => {
    if (replacementId) {
      const { error: repErr } = await supabase
        .from("recipe_ingredients")
        .update({ ingredient_id: replacementId })
        .eq("ingredient_id", id);
      if (repErr) { showToast("Error al reemplazar: " + repErr.message, "error"); return; }
    } else {
      const { error: delRiErr } = await supabase.from("recipe_ingredients").delete().eq("ingredient_id", id);
      if (delRiErr) { showToast("Error al eliminar de recetas: " + delRiErr.message, "error"); return; }
    }
    const { error } = await supabase.from("ingredients").delete().eq("id", id);
    if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
    setIngredients(p => p.filter(i => i.id !== id));
    setDeleteConfirm(null);
    showToast("Eliminado");
  };

  const applyPrice = async (id) => {
    const val = Number(priceEdit[id]);
    if (isNaN(val) || val < 0) return;
    const { error } = await supabase.from("ingredients").update({ unit_cost: val }).eq("id", id);
    if (error) { showToast("Error al actualizar precio: " + error.message, "error"); return; }
    setIngredients(p=>p.map(i=>i.id===id?{...i,unitCost:val}:i));
    setPriceEdit(p=>({...p,[id]:undefined}));
    showToast("Precio actualizado");
  };

  const applyStock = async (id) => {
    const qty = Number(stockEdit[id]);
    if (!qty) return;
    const ingr = ingredients.find(i=>i.id===id);
    // Ajuste atómico y relativo en el servidor (evita race conditions entre usuarios)
    const { data: newStock, error } = await supabase.rpc("adjust_ingredient_stock", { p_id: id, p_delta: qty });
    if (error) { showToast("Error al actualizar stock: " + error.message, "error"); return; }
    setIngredients(p=>p.map(i=>i.id===id?{...i,stock:newStock}:i));
    setStockEdit(p=>({...p,[id]:""}));
    showToast(`Stock: ${newStock} ${ingr?.unit}`);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Ingredientes</div><div className="page-sub">{ingredients.length} registrados</div></div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-secondary" onClick={exportExcel}><Ico n="download" s={14}/>Exportar Excel</button>
          <button className="btn btn-primary" onClick={openNew}><Ico n="plus" s={14}/>Nuevo ingrediente</button>
        </div>
      </div>

      <div className="stats-row" style={{ gridTemplateColumns:"repeat(3,1fr)" }}>
        <div className="stat"><div className="stat-num">{ingredients.length}</div><div className="stat-label">Total ingredientes</div><div className="stat-icon">🧂</div></div>
        <div className={`stat${lowStock.length>0?" stat-red":""}`}><div className="stat-num">{lowStock.length}</div><div className="stat-label">Stock bajo</div><div className="stat-icon">⚠️</div></div>
        <div className="stat"><div className="stat-num">{$(totalValue)}</div><div className="stat-label">Valor en stock</div><div className="stat-icon">💰</div></div>
      </div>

      <div className="search-wrap" style={{ marginBottom:12, maxWidth:320 }}>
        <div className="search-ico"><Ico n="search" s={14}/></div>
        <input placeholder="Buscar ingrediente..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>

      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
        {["Todos",...INGR_CATS].map(c=>(
          <button key={c} className={`btn btn-sm ${filterCat===c?"btn-primary":"btn-secondary"}`} onClick={()=>setFilterCat(c)}>{c}</button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <SortableTh col="name" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Nombre</SortableTh>
            <SortableTh col="category" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Categoría</SortableTh>
            <SortableTh col="unit" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Unidad</SortableTh>
            <SortableTh col="stock" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Stock</SortableTh>
            <SortableTh col="stockMin" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Mín.</SortableTh>
            <SortableTh col="unitCost" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Costo/unid.</SortableTh>
            <SortableTh col="supplier" sortBy={sortBy} sortDir={sortDir} toggleSort={toggleSort}>Proveedor</SortableTh>
            <th>Recetas</th><th>Agregar stock</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map(i => {
              const low = i.stockMin > 0 && i.stock <= i.stockMin;
              return (
                <tr key={i.id} className="tr-click" onClick={()=>openEdit(i)}>
                  <td data-label="Nombre" style={{ fontWeight:600 }}>{i.name}</td>
                  <td data-label="Categoría"><span className="tag">{i.category}</span></td>
                  <td data-label="Unidad" style={{ color:"var(--t3)" }}>{i.unit}</td>
                  <td data-label="Stock">
                    <span style={{ fontWeight:700, color:low?"var(--red)":i.stockMin>0&&i.stock<=i.stockMin*1.5?"var(--amber)":"var(--green)" }}>
                      {i.stock} {i.unit}
                    </span>
                    {low && <span style={{ fontSize:".72em", color:"var(--red)", marginLeft:6 }}>⚠ bajo</span>}
                  </td>
                  <td data-label="Mín." style={{ color:"var(--t3)" }}>{i.stockMin} {i.unit}</td>
                  <td data-label="Costo" onClick={e=>e.stopPropagation()}>
                    {priceEdit[i.id] !== undefined ? (
                      <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                        <input type="number" min="0" step="0.01" style={{ width:80 }} autoFocus
                          value={priceEdit[i.id]}
                          onChange={e=>setPriceEdit(p=>({...p,[i.id]:e.target.value}))}
                          onKeyDown={e=>{ if(e.key==="Enter") applyPrice(i.id); if(e.key==="Escape") setPriceEdit(p=>({...p,[i.id]:undefined})); }}/>
                        <button className="btn btn-primary btn-sm" onClick={()=>applyPrice(i.id)}><Ico n="check" s={12}/></button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>setPriceEdit(p=>({...p,[i.id]:undefined}))}><Ico n="x" s={12}/></button>
                      </div>
                    ) : (
                      <span style={{ fontWeight:600, cursor:"pointer", borderBottom:"1px dashed var(--t4)" }}
                        onClick={()=>setPriceEdit(p=>({...p,[i.id]:i.unitCost}))}>
                        {$(i.unitCost)}
                      </span>
                    )}
                  </td>
                  <td data-label="Proveedor" style={{ color:"var(--t3)", fontSize:".86em" }}>{i.supplier||"—"}</td>
                  <td data-label="Recetas" onClick={e=>e.stopPropagation()}>
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                      {recipesForIngredient(i.id).map(r => {
                        const prod = (products||[]).find(p => p.id === r.productId);
                        return (
                          <button key={r.id}
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize:".74em", padding:"2px 8px", borderRadius:99, border:"1px solid var(--greenlb)", color:"var(--green)", background:"var(--greenl)" }}
                            onClick={() => goToRecipe(r.id)}
                          >
                            {prod?.name || "Receta"}
                          </button>
                        );
                      })}
                      {recipesForIngredient(i.id).length === 0 && <span style={{ color:"var(--t4)", fontSize:".8em" }}>—</span>}
                    </div>
                  </td>
                  <td data-label="Agregar stock" onClick={e=>e.stopPropagation()}>
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <input type="number" style={{ width:80 }} placeholder="Cant." value={stockEdit[i.id]||""}
                        onChange={e=>setStockEdit(p=>({...p,[i.id]:e.target.value}))}
                        onKeyDown={e=>e.key==="Enter"&&applyStock(i.id)}/>
                      <button className="btn btn-primary btn-sm" onClick={()=>applyStock(i.id)}><Ico n="plus" s={12}/></button>
                    </div>
                  </td>
                  <td data-label="" onClick={e=>e.stopPropagation()}>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>del(i.id)}><Ico n="trash" s={13} c="var(--red)"/></button>
                  </td>
                </tr>
              );
            })}
            {filtered.length===0 && <tr><td colSpan={9}><div className="empty"><div className="empty-icon">🧂</div><h3>Sin ingredientes</h3></div></td></tr>}
          </tbody>
        </table>
      </div>

      {deleteConfirm && (
        <Modal title="Eliminar ingrediente" onClose={() => setDeleteConfirm(null)}>
          <p style={{ marginBottom: 12 }}>
            Este ingrediente está en <strong>{deleteConfirm.count}</strong> receta(s).
            Podés elegir un reemplazo opcional antes de eliminarlo.
          </p>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="lbl">Reemplazar por (opcional)</label>
            <select
              value={deleteConfirm.replacement}
              onChange={e => setDeleteConfirm(p => ({ ...p, replacement: e.target.value }))}
            >
              <option value="">— Sin reemplazo (eliminar de las recetas) —</option>
              {ingredients
                .filter(i => i.id !== deleteConfirm.id)
                .map(i => <option key={i.id} value={i.id}>{i.name}</option>)
              }
            </select>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
            <button
              className="btn btn-danger"
              onClick={() => execDelete(deleteConfirm.id, deleteConfirm.replacement || null)}
            >
              {deleteConfirm.replacement ? "Reemplazar y eliminar" : "Eliminar de todas las recetas"}
            </button>
          </div>
        </Modal>
      )}

      {modal && (
        <Modal title={modal==="new"?"Nuevo ingrediente":form.name} onClose={()=>setModal(null)} lg>
          <div className="form-grid">
            <div className="form-group full"><label className="lbl">Nombre *</label><input value={form.name} onChange={e=>setF("name",e.target.value)} autoFocus placeholder="Ej: Harina de arroz"/></div>
            <div className="form-group"><label className="lbl">Categoría</label>
              <select value={form.category} onChange={e=>setF("category",e.target.value)}>
                {INGR_CATS.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="lbl">Unidad de medida</label>
              <select value={form.unit} onChange={e=>setF("unit",e.target.value)}>
                {INGR_UNITS.map(u=><option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="lbl">Stock actual</label><input type="number" min="0" value={form.stock} onChange={e=>setF("stock",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Stock mínimo (alerta)</label><input type="number" min="0" value={form.stockMin} onChange={e=>setF("stockMin",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Costo por unidad</label><input type="number" min="0" step="0.01" value={form.unitCost} onChange={e=>setF("unitCost",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Proveedor</label><input value={form.supplier} onChange={e=>setF("supplier",e.target.value)} placeholder="Nombre del proveedor"/></div>
            <div className="form-group full"><label className="lbl">Notas</label><textarea value={form.notes} onChange={e=>setF("notes",e.target.value)} placeholder="Información adicional"/></div>
          </div>

          <div className="section-title" style={{ marginBottom:12 }}>Información Nutricional <span style={{ fontSize:".76em", fontWeight:400, color:"var(--t3)" }}>(por 100g — solo aplica a ingredientes en gramos)</span></div>
          <div className="form-grid">
            <div className="form-group"><label className="lbl">Calorías (kcal)</label><input type="number" min="0" step="0.1" placeholder="—" value={form.calories ?? ""} onChange={e=>setF("calories",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Proteínas (g)</label><input type="number" min="0" step="0.1" placeholder="—" value={form.protein ?? ""} onChange={e=>setF("protein",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Carbohidratos (g)</label><input type="number" min="0" step="0.1" placeholder="—" value={form.carbs ?? ""} onChange={e=>setF("carbs",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Grasas (g)</label><input type="number" min="0" step="0.1" placeholder="—" value={form.fat ?? ""} onChange={e=>setF("fat",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Fibra (g)</label><input type="number" min="0" step="0.1" placeholder="—" value={form.fiber ?? ""} onChange={e=>setF("fiber",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Azúcares (g)</label><input type="number" min="0" step="0.1" placeholder="—" value={form.sugar ?? ""} onChange={e=>setF("sugar",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Sodio (mg)</label><input type="number" min="0" step="0.1" placeholder="—" value={form.sodium ?? ""} onChange={e=>setF("sodium",e.target.value)}/></div>
          </div>

          {modal !== "new" && (() => {
            const recs = recipesForIngredient(modal?.id);
            return recs.length > 0 ? (
              <div style={{ marginBottom: 16 }}>
                <div className="section-title" style={{ marginBottom: 10 }}>Usado en recetas</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {recs.map(r => {
                    const prod = (products||[]).find(p => p.id === r.productId);
                    return (
                      <button key={r.id}
                        className="btn btn-secondary btn-sm"
                        style={{ borderRadius: 99 }}
                        onClick={() => { setModal(null); goToRecipe(r.id); }}
                      >
                        <Ico n="recipes" s={12}/> {prod?.name || "Receta"}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null;
          })()}

          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={submitting}>
              <Ico n="check" s={13}/>{submitting ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
