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
import { Ico, Modal, $ } from "../shared.jsx";
import { supabase, ingredientToDb, recipeToDb } from "../supabase.js";

const INGR_CATS = ["Harinas","Lácteos","Grasas/Aceites","Endulzantes","Frutas/Verduras","Especias","Proteínas","Otros"];
const INGR_UNITS = ["g","kg","ml","l","unidad","unidades","cdas","ctas"];

export default function IngredientsPage({ ingredients, setIngredients, recipes, setRecipes, products, setPage, setOpenRecipeId, showToast }) {
  const emptyForm = { name:"", category:"Harinas", unit:"g", stock:0, stockMin:0, unitCost:0, supplier:"", notes:"", calories:"", protein:"", carbs:"", fat:"", fiber:"", sugar:"", sodium:"" };
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filterCat, setFilterCat] = useState("Todos");
  const [search, setSearch] = useState("");
  const [stockEdit, setStockEdit] = useState({});
  const [priceEdit, setPriceEdit] = useState({});
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));

  const recipesForIngredient = (ingredientId) =>
    (recipes || []).filter(r => r.ingredients?.some(ri => ri.ingredientId === ingredientId));

  const goToRecipe = (recipeId) => {
    setOpenRecipeId(recipeId);
    setPage("recipes");
  };

  const filtered = ingredients
    .filter(i => (filterCat==="Todos" || i.category===filterCat) && (!search || i.name.toLowerCase().includes(search.toLowerCase())))
    .sort((a,b) => a.name.localeCompare(b.name));

  const lowStock = ingredients.filter(i => i.stockMin > 0 && i.stock <= i.stockMin);
  const totalValue = ingredients.reduce((a,i) => a + i.stock * i.unitCost, 0);

  const openNew  = () => { setForm(emptyForm); setModal("new"); };
  const openEdit = i  => { setForm({...i}); setModal(i); };

  const exportCsv = () => {
    const headers = ["Nombre","Categoría","Unidad","Stock","Stock Mínimo","Costo/Unidad","Proveedor","Notas","Calorías (kcal)","Proteínas (g)","Carbohidratos (g)","Grasas (g)","Fibra (g)","Azúcares (g)","Sodio (mg)"];
    const rows = ingredients.map(i => [i.name, i.category, i.unit, i.stock, i.stockMin, i.unitCost, i.supplier||"", i.notes||"", i.calories??"", i.protein??"", i.carbs??"", i.fat??"", i.fiber??"", i.sugar??"", i.sodium??""]);
    const csv = "\uFEFF" + [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8;" }));
    a.download = "ingredientes.csv"; a.click();
  };

  const save = async () => {
    if (!form.name) { showToast("El nombre es obligatorio", "error"); return; }
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

      // Si cambió la unidad, marcar recetas afectadas y actualizar recipe_ingredients
      if (unitChanged && recipes?.length) {
        const affectedRecipes = recipes.filter(r =>
          r.ingredients.some(ri => ri.ingredientId === modal.id)
        );
        for (const recipe of affectedRecipes) {
          // Actualizar unit y cost en cada recipe_ingredient afectado
          for (const ri of recipe.ingredients.filter(ri => ri.ingredientId === modal.id)) {
            const newCost = ri.qty * data.unitCost;
            await supabase.from("recipe_ingredients")
              .update({ unit: data.unit, cost: newCost })
              .eq("id", ri.id);
          }
          // Marcar la receta como "necesita revisión"
          const reason = `Unidad de "${data.name}" cambió de ${oldIngr.unit} → ${data.unit}`;
          await supabase.from("recipes")
            .update({ needs_review: true, review_reason: reason })
            .eq("id", recipe.id);
        }
        if (affectedRecipes.length > 0) {
          // Actualizar estado local de recetas
          setRecipes(prev => prev.map(r => {
            if (!affectedRecipes.find(ar => ar.id === r.id)) return r;
            const reason = `Unidad de "${data.name}" cambió de ${oldIngr.unit} → ${data.unit}`;
            return {
              ...r,
              needsReview: true,
              reviewReason: reason,
              ingredients: r.ingredients.map(ri =>
                ri.ingredientId === modal.id
                  ? { ...ri, unit: data.unit, cost: ri.qty * data.unitCost }
                  : ri
              ),
            };
          }));
          showToast(`${affectedRecipes.length} receta${affectedRecipes.length !== 1 ? "s" : ""} marcada${affectedRecipes.length !== 1 ? "s" : ""} para revisión`);
        }
      }
    }
    setModal(null);
    showToast("Ingrediente guardado");
  };

  const del = async (id) => {
    if (confirm("¿Eliminar ingrediente?")) {
      const { error } = await supabase.from("ingredients").delete().eq("id", id);
      if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
      setIngredients(p=>p.filter(i=>i.id!==id));
      showToast("Eliminado");
    }
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
    const newStock = (ingr?.stock||0) + qty;
    const { error } = await supabase.from("ingredients").update({ stock: newStock }).eq("id", id);
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
          <button className="btn btn-secondary" onClick={exportCsv}><Ico n="download" s={14}/>Exportar CSV</button>
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
          <thead><tr><th>Nombre</th><th>Categoría</th><th>Unidad</th><th>Stock</th><th>Mín.</th><th>Costo/unid.</th><th>Proveedor</th><th>Recetas</th><th>Agregar stock</th><th></th></tr></thead>
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
            <button className="btn btn-primary" onClick={save}><Ico n="check" s={13}/>Guardar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
