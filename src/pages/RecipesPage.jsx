/**
 * RecipesPage — Gestión de recetas de producción.
 *
 * Cada receta se vincula a un producto y contiene ingredientes (del catálogo),
 * pasos de preparación, tiempos y rendimiento. El costo de cada ingrediente
 * se calcula automáticamente como qty × ingredient.unitCost.
 * Permite exportar la receta como PDF imprimible.
 *
 * Props: recipes, setRecipes, products, ingredients, showToast
 */
import { useState } from "react";
import { Ico, Modal, $ } from "../shared.jsx";
import { supabase, recipeToDb, recipeIngredientToDb } from "../supabase.js";

export default function RecipesPage({ recipes, setRecipes, products, ingredients, showToast }) {
  const [modal, setModal] = useState(null);
  const [viewModal, setViewModal] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ productId:"", prepTime:0, cookTime:0, yield:1, notes:"", ingredients:[], steps:[] });
  const [newIngr, setNewIngr] = useState({ ingredientId:"", qty:"" });
  const [newStep, setNewStep] = useState("");
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));

  const NUTR_FIELDS = [
    { key:"calories", label:"Calorías", unit:"kcal" },
    { key:"protein",  label:"Proteínas", unit:"g" },
    { key:"carbs",    label:"Carbohidratos", unit:"g" },
    { key:"fat",      label:"Grasas", unit:"g" },
    { key:"fiber",    label:"Fibra", unit:"g" },
    { key:"sugar",    label:"Azúcares", unit:"g" },
    { key:"sodium",   label:"Sodio", unit:"mg" },
  ];

  const calcNutrition = (r) => {
    let totalWeight = 0;
    const totals = Object.fromEntries(NUTR_FIELDS.map(f => [f.key, 0]));
    let hasData = false;
    for (const ri of r.ingredients) {
      if (ri.unit !== "g") continue;
      const ing = ingredients.find(x => x.id === ri.ingredientId);
      if (!ing) continue;
      if (!NUTR_FIELDS.some(f => ing[f.key] != null)) continue;
      hasData = true;
      totalWeight += Number(ri.qty);
      for (const { key } of NUTR_FIELDS) {
        if (ing[key] != null) totals[key] += Number(ri.qty) * Number(ing[key]) / 100;
      }
    }
    if (!hasData || totalWeight === 0) return null;
    return Object.fromEntries(NUTR_FIELDS.map(f => [f.key, (totals[f.key] / totalWeight) * 100]));
  };

  const ingredientCost = (i) => {
    const ing = i.ingredientId
      ? ingredients.find(x => x.id === i.ingredientId)
      : ingredients.find(x => x.name?.toLowerCase() === i.name?.toLowerCase());
    return ing ? i.qty * ing.unitCost : Number(i.cost) || 0;
  };
  const totalCost = (ingrs) => ingrs.reduce((a, b) => a + ingredientCost(b), 0);
  const costPerUnit = (r) => r.yield>0 ? totalCost(r.ingredients)/r.yield : 0;

  const exportRecipePDF = (r) => {
    const prod = products.find(p=>p.id===r.productId);
    const cost = totalCost(r.ingredients);
    const cpu = costPerUnit(r);
    const margin = prod ? ((prod.priceRetail - cpu)/prod.priceRetail*100) : 0;
    const fmt = n => `$${Number(n||0).toLocaleString("es-AR",{minimumFractionDigits:0,maximumFractionDigits:0})}`;
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Receta - ${prod?.name||"Producto"}</title><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:36px;color:#1a1a1a;font-size:14px}
h1{font-size:24px;font-weight:800;margin-bottom:2px}.sub{color:#888;font-size:12px;margin-bottom:28px;border-bottom:1px solid #e5e7eb;padding-bottom:12px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}.stat{border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px}
.stat-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;font-weight:600}.stat-value{font-size:18px;font-weight:700;margin-top:4px}
h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#4b5563;border-bottom:2px solid #22c55e;padding-bottom:4px;margin:22px 0 10px}
table{width:100%;border-collapse:collapse}th{background:#f9fafb;text-align:left;padding:7px 10px;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb}
td{padding:7px 10px;border-bottom:1px solid #f3f4f6;font-size:13px}.total-row td{font-weight:700;background:#f0fdf4;color:#16a34a}
.costs{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:4px}.cost-box{border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px}
.cost-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;font-weight:600}.cost-value{font-size:18px;font-weight:700;margin-top:4px}
.step{display:flex;gap:10px;margin-bottom:10px;align-items:flex-start}.step-num{width:22px;height:22px;border-radius:50%;background:#22c55e;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
.notes{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;font-size:13px;margin-top:16px}
@media print{body{padding:20px}}
</style></head><body>
<h1>${prod?.name||"Producto eliminado"}</h1>
<div class="sub">Ficha técnica &nbsp;·&nbsp; NutriFree POS</div>
<div class="stats">
  <div class="stat"><div class="stat-label">Tiempo preparación</div><div class="stat-value">${r.prepTime} min</div></div>
  <div class="stat"><div class="stat-label">Tiempo cocción</div><div class="stat-value">${r.cookTime} min</div></div>
  <div class="stat"><div class="stat-label">Rendimiento</div><div class="stat-value">${r.yield} unidades</div></div>
</div>
<h2>Ingredientes</h2>
<table><thead><tr><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th><th>Costo</th></tr></thead><tbody>
${r.ingredients.map(i=>`<tr><td>${i.name}</td><td>${i.qty}</td><td>${i.unit}</td><td>${fmt(ingredientCost(i))}</td></tr>`).join("")}
<tr class="total-row"><td colspan="3">TOTAL</td><td>${fmt(cost)}</td></tr>
</tbody></table>
<h2>Costos</h2>
<div class="costs">
  <div class="cost-box"><div class="cost-label">Costo total</div><div class="cost-value">${fmt(cost)}</div></div>
  <div class="cost-box"><div class="cost-label">Costo por unidad</div><div class="cost-value">${fmt(cpu)}</div></div>
  ${prod?`<div class="cost-box"><div class="cost-label">Margen estimado</div><div class="cost-value" style="color:${margin>30?"#16a34a":margin>10?"#d97706":"#dc2626"}">${margin.toFixed(1)}%</div></div>`:""}
</div>
${r.steps.length>0?`<h2>Pasos</h2>${r.steps.map((s,i)=>`<div class="step"><div class="step-num">${i+1}</div><div>${s}</div></div>`).join("")}`:""}
${r.notes?`<div class="notes">📝 ${r.notes}</div>`:""}
</body></html>`;
    const win = window.open("","_blank");
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  };

  const exportCsv = () => {
    const headers = ["Producto","Tiempo Prep (min)","Tiempo Cocción (min)","Rendimiento","Costo Total","Costo/Unidad","Margen Minorista (%)","Margen Mayorista (%)","Notas","Ingredientes"];
    const rows = recipes.map(r => {
      const prod = products.find(p => p.id === r.productId);
      const cost = totalCost(r.ingredients);
      const cpu = costPerUnit(r);
      const marginR = prod?.priceRetail > 0 ? ((prod.priceRetail - cpu) / prod.priceRetail * 100).toFixed(1) : "";
      const marginW = prod?.priceWholesale > 0 ? ((prod.priceWholesale - cpu) / prod.priceWholesale * 100).toFixed(1) : "";
      const ingList = r.ingredients.map(i => `${i.name} ${i.qty}${i.unit}`).join(" | ");
      return [prod?.name||"Producto eliminado", r.prepTime, r.cookTime, r.yield, cost.toFixed(2), cpu.toFixed(2), marginR, marginW, r.notes||"", ingList];
    });
    const csv = "\uFEFF" + [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8;" }));
    a.download = "recetas.csv"; a.click();
  };

  const openNew = () => { setForm({ productId:products[0]?.id||"", prepTime:0, cookTime:0, yield:1, notes:"", minMargin:"", ingredients:[], steps:[] }); setModal("new"); };
  const openEdit = r => { setForm({...r, ingredients:[...r.ingredients], steps:[...r.steps]}); setModal(r); };

  const addIngr = () => {
    if (!newIngr.ingredientId || !newIngr.qty) return;
    const ing = ingredients.find(i => i.id === newIngr.ingredientId);
    if (!ing) return;
    const qty = Number(newIngr.qty);
    const cost = qty * ing.unitCost;
    setForm(p=>({...p, ingredients:[...p.ingredients, { ingredientId: ing.id, name: ing.name, qty, unit: ing.unit, cost }]}));
    setNewIngr({ ingredientId:"", qty:"" });
  };
  const removeIngr = i => setForm(p=>({...p,ingredients:p.ingredients.filter((_,idx)=>idx!==i)}));
  const addStep = () => { if (!newStep) return; setForm(p=>({...p,steps:[...p.steps,newStep]})); setNewStep(""); };
  const removeStep = i => setForm(p=>({...p,steps:p.steps.filter((_,idx)=>idx!==i)}));

  const save = async () => {
    if (!form.productId) { showToast("Seleccioná un producto", "error"); return; }
    const recipeId = modal === "new" ? crypto.randomUUID() : modal.id;
    const recipeData = {...form, id: recipeId};

    if (modal === "new") {
      const { error } = await supabase.from("recipes").insert(recipeToDb(recipeData));
      if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
    } else {
      const { error } = await supabase.from("recipes").update(recipeToDb(recipeData)).eq("id", recipeId);
      if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
      await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
    }

    if (form.ingredients.length > 0) {
      const rows = form.ingredients.map(i => recipeIngredientToDb({...i, id: crypto.randomUUID()}, recipeId));
      const { error: riErr } = await supabase.from("recipe_ingredients").insert(rows);
      if (riErr) { showToast("Error al guardar ingredientes: " + riErr.message, "error"); return; }
    }

    const savedRecipe = {...recipeData, ingredients: form.ingredients};
    if (modal === "new") {
      setRecipes(p => [...p, savedRecipe]);
    } else {
      setRecipes(p => p.map(r => r.id === recipeId ? savedRecipe : r));
    }
    setModal(null);
    showToast("Receta guardada");
  };

  const del = async (id) => {
    if(confirm("¿Eliminar receta?")) {
      const { error } = await supabase.from("recipes").delete().eq("id", id);
      if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
      setRecipes(p=>p.filter(r=>r.id!==id));
      showToast("Eliminada");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Recetas</div><div className="page-sub">Fichas técnicas de productos</div></div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <div className="search-wrap" style={{ minWidth:220 }}>
            <div className="search-ico"><Ico n="search" s={14}/></div>
            <input placeholder="Buscar receta..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <button className="btn btn-secondary" onClick={exportCsv}><Ico n="download" s={14}/>Exportar CSV</button>
          <button className="btn btn-primary" onClick={openNew}><Ico n="plus" s={14}/>Nueva receta</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:14 }}>
        {recipes.filter(r => !search || (products.find(p=>p.id===r.productId)?.name||"").toLowerCase().includes(search.toLowerCase())).map(r => {
          const prod = products.find(p=>p.id===r.productId);
          const cost = totalCost(r.ingredients);
          const cpu = costPerUnit(r);
          const margin = prod?.priceRetail > 0 ? ((prod.priceRetail - cpu)/prod.priceRetail*100) : 0;
          const marginW = prod?.priceWholesale > 0 ? ((prod.priceWholesale - cpu)/prod.priceWholesale*100) : null;
          return (
            <div key={r.id} className="card card-hover" onClick={()=>setViewModal(r)}>
              <div style={{ fontWeight:700, fontSize:".95em", marginBottom:4 }}>{prod?.name||"Producto eliminado"}</div>
              <div style={{ fontSize:".78em", color:"var(--t3)", marginBottom:10 }}>
                ⏱ {r.prepTime}min prep · {r.cookTime}min cocción · Rinde {r.yield} unid.
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:".82em" }}>
                <div><span style={{ color:"var(--t3)" }}>Costo total:</span><div style={{ fontWeight:700 }}>{$(cost)}</div></div>
                <div><span style={{ color:"var(--t3)" }}>Costo/unidad:</span><div style={{ fontWeight:700 }}>{$(cpu)}</div></div>
                {prod && <div style={{ gridColumn:"1/-1", display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                  <div>
                    <span style={{ color:"var(--t3)" }}>Margen minorista:</span>
                    <div style={{ display:"flex", alignItems:"center", gap:4, fontWeight:700, color:margin>30?"var(--green)":margin>10?"var(--amber)":"var(--red)" }}>
                      {margin.toFixed(1)}%
                      {r.minMargin != null && r.minMargin !== "" && margin < Number(r.minMargin) && (
                        <span style={{ fontSize:".72em", background:"var(--redl)", color:"var(--red)", border:"1px solid var(--redlb)", borderRadius:4, padding:"1px 5px", fontWeight:700 }}>⚠</span>
                      )}
                    </div>
                  </div>
                  {marginW !== null && <div>
                    <span style={{ color:"var(--t3)" }}>Margen mayorista:</span>
                    <div style={{ fontWeight:700, color:marginW>30?"var(--green)":marginW>10?"var(--amber)":"var(--red)" }}>
                      {marginW.toFixed(1)}%
                    </div>
                  </div>}
                </div>}
              </div>
              <div style={{ display:"flex", gap:6, marginTop:12 }}>
                <button className="btn btn-secondary btn-sm" onClick={e=>{e.stopPropagation();openEdit(r);}}><Ico n="edit" s={12}/>Editar</button>
                <button className="btn btn-secondary btn-sm" onClick={e=>{e.stopPropagation();exportRecipePDF(r);}} title="Exportar PDF"><Ico n="download" s={12}/>PDF</button>
                <button className="btn btn-danger btn-sm" onClick={e=>{e.stopPropagation();del(r.id);}}><Ico n="trash" s={12}/></button>
              </div>
            </div>
          );
        })}
        {recipes.length===0&&<div className="empty"><div className="empty-icon">📖</div><h3>Sin recetas</h3></div>}
      </div>

      {/* VIEW MODAL */}
      {viewModal && (
        <Modal title={products.find(p=>p.id===viewModal.productId)?.name||"Receta"} onClose={()=>setViewModal(null)} lg>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
            {[["Tiempo prep.",viewModal.prepTime+" min"],["Tiempo cocción",viewModal.cookTime+" min"],["Rendimiento",viewModal.yield+" unidades"]].map(([l,v])=>(
              <div key={l} style={{ background:"var(--s2)", borderRadius:8, padding:"10px 12px" }}>
                <div style={{ fontSize:".72em", color:"var(--t3)", fontWeight:600, textTransform:"uppercase", letterSpacing:".4px" }}>{l}</div>
                <div style={{ fontWeight:700, marginTop:4 }}>{v}</div>
              </div>
            ))}
          </div>
          {viewModal.minMargin != null && viewModal.minMargin !== "" && (
            <div style={{ marginBottom:16, display:"inline-flex", alignItems:"center", gap:6, background:"var(--amberl)", border:"1px solid var(--amberlb)", borderRadius:6, padding:"5px 10px", fontSize:".82em" }}>
              <span style={{ color:"var(--t3)" }}>Alerta si margen cae por debajo de</span>
              <strong>{viewModal.minMargin}%</strong>
            </div>
          )}
          <div className="section-title">Ingredientes</div>
          <div className="table-wrap" style={{ marginBottom:16 }}>
            <table>
              <thead><tr><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th><th>Costo</th></tr></thead>
              <tbody>
                {viewModal.ingredients.map((i,idx)=>(
                  <tr key={idx}><td>{i.name}</td><td>{i.qty}</td><td>{i.unit}</td><td>{$(ingredientCost(i))}</td></tr>
                ))}
                <tr style={{ background:"var(--greenl)" }}>
                  <td colSpan={3} style={{ fontWeight:700 }}>TOTAL</td>
                  <td style={{ fontWeight:700, color:"var(--green)" }}>{$(totalCost(viewModal.ingredients))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {(() => {
            const nutr = calcNutrition(viewModal);
            if (!nutr) return null;
            return (
              <>
                <div className="section-title" style={{ marginBottom:12 }}>Información Nutricional <span style={{ fontSize:".76em", fontWeight:400, color:"var(--t3)" }}>por 100g</span></div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:16 }}>
                  {NUTR_FIELDS.map(({ key, label, unit }) => (
                    <div key={key} style={{ background:"var(--s2)", borderRadius:8, padding:"8px 10px", textAlign:"center" }}>
                      <div style={{ fontSize:".68em", color:"var(--t3)", fontWeight:600, textTransform:"uppercase", letterSpacing:".4px", marginBottom:4 }}>{label}</div>
                      <div style={{ fontWeight:700, fontSize:".95em" }}>{nutr[key].toFixed(1)} <span style={{ fontSize:".75em", color:"var(--t3)", fontWeight:400 }}>{unit}</span></div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
          <div className="section-title">Pasos</div>
          {viewModal.steps.map((s,i)=>(
            <div key={i} style={{ display:"flex", gap:10, marginBottom:8, padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
              <div style={{ width:24, height:24, borderRadius:"50%", background:"var(--green)", color:"white", display:"flex", alignItems:"center", justifyContent:"center", fontSize:".76em", fontWeight:700, flexShrink:0 }}>{i+1}</div>
              <div style={{ fontSize:".88em", paddingTop:3 }}>{s}</div>
            </div>
          ))}
          {viewModal.notes&&<div style={{ marginTop:12, background:"var(--amberl)", border:"1px solid var(--amberlb)", borderRadius:8, padding:"8px 12px", fontSize:".84em" }}>📝 {viewModal.notes}</div>}
        </Modal>
      )}

      {/* EDIT MODAL */}
      {modal && (
        <Modal title={modal==="new"?"Nueva receta":"Editar receta"} onClose={()=>setModal(null)} lg>
          <div className="form-grid" style={{ marginBottom:16 }}>
            <div className="form-group full">
              <label className="lbl">Producto *</label>
              <select value={form.productId} onChange={e=>setF("productId",e.target.value)}>
                {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="lbl">Tiempo preparación (min)</label><input type="number" value={form.prepTime} onChange={e=>setF("prepTime",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Tiempo cocción (min)</label><input type="number" value={form.cookTime} onChange={e=>setF("cookTime",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Rendimiento (unidades)</label><input type="number" value={form.yield} onChange={e=>setF("yield",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Margen mínimo de alerta (%)</label><input type="number" min="0" max="100" step="1" placeholder="Sin alerta" value={form.minMargin ?? ""} onChange={e=>setF("minMargin",e.target.value)}/></div>
            <div className="form-group full"><label className="lbl">Notas</label><textarea value={form.notes} onChange={e=>setF("notes",e.target.value)}/></div>
          </div>

          <div className="section-title">Ingredientes</div>
          {form.ingredients.map((ing,i)=>(
            <div key={i} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
              <span style={{ flex:2, fontSize:".86em" }}>{ing.name}</span>
              <span style={{ fontSize:".84em", color:"var(--t3)" }}>{ing.qty} {ing.unit}</span>
              <span style={{ fontSize:".84em" }}>{$(ing.cost)}</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>removeIngr(i)}><Ico n="x" s={12} c="var(--red)"/></button>
            </div>
          ))}
          <div style={{ display:"grid", gridTemplateColumns:"3fr 1fr auto", gap:6, marginBottom:16 }}>
            <select value={newIngr.ingredientId} onChange={e=>setNewIngr(p=>({...p,ingredientId:e.target.value}))}>
              <option value="">-- Seleccionar ingrediente --</option>
              {ingredients.map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit}) — ${i.unitCost}/{i.unit}</option>)}
            </select>
            <input placeholder="Cant." type="number" value={newIngr.qty} onChange={e=>setNewIngr(p=>({...p,qty:e.target.value}))}/>
            <button className="btn btn-primary btn-sm" onClick={addIngr}><Ico n="plus" s={12}/></button>
          </div>

          <div className="section-title">Pasos</div>
          {form.steps.map((s,i)=>(
            <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:6 }}>
              <div style={{ width:22, height:22, borderRadius:"50%", background:"var(--green)", color:"white", display:"flex", alignItems:"center", justifyContent:"center", fontSize:".72em", fontWeight:700, flexShrink:0, marginTop:2 }}>{i+1}</div>
              <span style={{ flex:1, fontSize:".86em" }}>{s}</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>removeStep(i)}><Ico n="x" s={12} c="var(--red)"/></button>
            </div>
          ))}
          <div style={{ display:"flex", gap:6, marginBottom:16 }}>
            <input placeholder="Describí el paso..." value={newStep} onChange={e=>setNewStep(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addStep()}/>
            <button className="btn btn-primary btn-sm" onClick={addStep}><Ico n="plus" s={12}/></button>
          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save}><Ico n="check" s={13}/>Guardar receta</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
