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
import { supabase } from "../supabase.js";

export default function ProductionPage({ products, setProducts, recipes, setIngredients, setStockMovements, showToast, logAction }) {
  const [qty, setQty] = useState({});
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState({});

  const setQ = (id,v) => setQty(p=>({...p,[id]:v}));

  const applyProduction = async (id) => {
    if (submitting[id]) return;
    const q = Number(qty[id]);
    if (!q || q<=0) { showToast("Ingresá una cantidad válida", "error"); return; }

    const product = products.find(x => x.id === id);
    if (!product) return;
    setSubmitting(p => ({...p, [id]: true}));
    try {
    const recipe = recipes.find(r => r.productId === id);
    const factor = recipe && recipe.yield > 0 ? q / recipe.yield : q;
    const ingDeltas = (recipe?.ingredients?.length)
      ? recipe.ingredients.map(ri => ({ id: ri.ingredientId, delta: ri.qty * factor }))
      : [];

    const { data, error: rpcErr } = await supabase.rpc("apply_production", {
      p_product_id:    id,
      p_qty:           q,
      p_movement_id:   crypto.randomUUID(),
      p_movement_name: product.name,
      p_ing_deltas:    ingDeltas,
    });
    if (rpcErr) { showToast("Error al registrar producción: " + rpcErr.message, "error"); return; }

    setProducts(prev => prev.map(x => x.id === id ? { ...x, stock: data.product_stock } : x));
    setStockMovements(prev => [{
      id: crypto.randomUUID(), productId: id, productName: product.name,
      qty: q, type: "production", notes: "", createdAt: new Date().toISOString(),
    }, ...prev]);

    if (ingDeltas.length > 0) {
      setIngredients(prev => prev.map(ing => {
        const updated = (data.ingredient_stocks || []).find(s => s.id === ing.id);
        return updated ? { ...ing, stock: updated.stock } : ing;
      }));
    }

    const hasRecipe = recipe && ingDeltas.length > 0;
    logAction?.("producción", "stock", `+${q} u. de "${product.name}"${hasRecipe ? " — ingredientes descontados" : " — sin receta"}`);
    setQty(p => ({ ...p, [id]: "" }));
    showToast(`+${q} unidades registradas${hasRecipe ? " · ingredientes descontados" : " · sin receta asociada"}`);
    } finally {
      setSubmitting(p => ({...p, [id]: false}));
    }
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
                  <button className="btn btn-primary btn-sm" onClick={()=>applyProduction(p.id)} disabled={!!submitting[p.id]}>
                    <Ico n="plus" s={12}/>{submitting[p.id] ? "..." : "Agregar"}
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
