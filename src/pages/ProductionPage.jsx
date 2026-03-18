/**
 * ProductionPage — Registro de producción de productos.
 *
 * Al aplicar producción de N unidades de un producto:
 *  1. Incrementa products.stock en N
 *  2. Registra un movimiento en stock_movements (type: "production")
 *  3. Si el producto tiene receta, descuenta stock de cada ingrediente
 *     proporcionalmente (qty_ingrediente × N / recipe.yield)
 *
 * Props: products, setProducts, recipes, setIngredients, setStockMovements, showToast, logAction
 */
import { useState } from "react";
import { Ico } from "../shared.jsx";
import { supabase, stockMovementToDb } from "../supabase.js";

export default function ProductionPage({ products, setProducts, recipes, setIngredients, setStockMovements, showToast, logAction }) {
  const [qty, setQty] = useState({});
  const [search, setSearch] = useState("");

  const setQ = (id,v) => setQty(p=>({...p,[id]:v}));

  const applyProduction = async (id) => {
    const q = Number(qty[id]);
    if (!q || q<=0) { showToast("Ingresá una cantidad válida", "error"); return; }

    const product = products.find(x => x.id === id);
    if (!product) return;
    const newProductStock = product.stock + q;
    const { error: prodErr } = await supabase.from("products").update({ stock: newProductStock }).eq("id", id);
    if (prodErr) { showToast("Error al actualizar stock: " + prodErr.message, "error"); return; }
    setProducts(p => p.map(x => x.id===id ? {...x, stock: newProductStock} : x));

    const movement = { id: crypto.randomUUID(), productId: id, productName: product.name, qty: q, type: "production", notes: "" };
    const { error: movErr } = await supabase.from("stock_movements").insert(stockMovementToDb(movement));
    if (!movErr) setStockMovements(prev => [movement, ...prev]);

    const recipe = recipes.find(r => r.productId === id);
    if (!recipe) {
      logAction?.("producción", "stock", `+${q} u. de "${product.name}" — sin receta`);
      setQty(p=>({...p,[id]:""}));
      showToast(`+${q} unidades · sin receta asociada`, "error");
      return;
    }
    if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
      setQty(p=>({...p,[id]:""}));
      showToast(`+${q} unidades · la receta no tiene ingredientes`, "error");
      return;
    }

    const factor = q / (recipe.yield > 0 ? recipe.yield : 1);
    const ingUpdates = [];
    setIngredients(prev => {
      let matched = 0;
      const next = prev.map(ing => {
        const ri = recipe.ingredients.find(r =>
          (r.ingredientId && r.ingredientId === ing.id) ||
          (!r.ingredientId && r.name?.toLowerCase() === ing.name?.toLowerCase())
        );
        if (!ri) return ing;
        matched++;
        const newStock = ing.stock - ri.qty * factor;
        ingUpdates.push({ id: ing.id, newStock });
        return {...ing, stock: newStock};
      });
      console.log("[Producción] ingredientes descontados:", matched);
      return next;
    });
    for (const { id: ingId, newStock } of ingUpdates) {
      const { error } = await supabase.from("ingredients").update({ stock: newStock }).eq("id", ingId);
      if (error) showToast("Error al descontar ingrediente: " + error.message, "error");
    }

    logAction?.("producción", "stock", `+${q} u. de "${product.name}" — ingredientes descontados`);
    setQty(p=>({...p,[id]:""}));
    showToast(`+${q} unidades registradas · ingredientes descontados`);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Producción diaria</div><div className="page-sub">Ingresá las unidades producidas hoy para actualizar el stock</div></div>
      </div>

      <div className="card" style={{ marginBottom:16, display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
        <div style={{ fontSize:".84em", color:"var(--t2)", display:"flex", gap:8, alignItems:"center", flex:1 }}>
          <Ico n="alert" s={15} c="var(--amber)"/>
          Ingresá la cantidad producida de cada producto. El stock se incrementará automáticamente.
        </div>
        <div className="search-wrap" style={{ minWidth:220 }}>
          <div className="search-ico"><Ico n="search" s={14}/></div>
          <input
            placeholder="Buscar producto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Producto</th><th>Categoría</th><th>Stock actual</th><th>Producción hoy</th><th></th></tr></thead>
          <tbody>
            {products.filter(p => p.active && (!search || p.name.toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>a.name.localeCompare(b.name)).map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight:600 }}>{p.name}</td>
                <td><span className="tag">{p.category}</span></td>
                <td>
                  <span style={{ fontWeight:700, color:p.stock<=2?"var(--red)":p.stock<=5?"var(--amber)":"var(--green)" }}>
                    {p.stock} unidades
                  </span>
                </td>
                <td style={{ width:180 }}>
                  <input type="number" min="0" placeholder="Cant. producida" value={qty[p.id]||""}
                    onChange={e=>setQ(p.id,e.target.value)} style={{ width:"100%" }}/>
                </td>
                <td>
                  <button className="btn btn-primary btn-sm" onClick={()=>applyProduction(p.id)}>
                    <Ico n="plus" s={12}/>Agregar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
