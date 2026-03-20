/**
 * ProductsPage — Catálogo de productos.
 *
 * CRUD completo con soporte para productos simples y kits (compuesto por otros
 * productos). Los kits expanden sus componentes al procesar ventas.
 * Filtros por categoría y búsqueda por nombre.
 *
 * Props: products, setProducts, categories, showToast, logAction
 */
import { useState } from "react";
import { Ico, Modal, $, uid } from "../shared.jsx";
import { supabase, productToDb } from "../supabase.js";

export default function ProductsPage({ products, setProducts, categories, showToast, logAction }) {
  const [modal, setModal] = useState(null);
  const [filterCat, setFilterCat] = useState("Todos");
  const [search, setSearch] = useState("");
  const emptyForm = { name:"", category:"Viandas", priceRetail:0, priceWholesale:0, unit:"unit", stock:0, active:true, description:"", isKit:false, kitItems:[] };
  const [form, setForm] = useState(emptyForm);
  const [kitProductId, setKitProductId] = useState("");
  const [kitQty, setKitQty] = useState(1);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const cats = ["Todos", ...categories];
  const filtered = products.filter(p =>
    (filterCat==="Todos"||p.category===filterCat) &&
    (!search||p.name.toLowerCase().includes(search.toLowerCase()))
  );

  const openNew = () => { setForm(emptyForm); setKitProductId(""); setKitQty(1); setModal("new"); };
  const openEdit = p => { setForm({...p, isKit: p.kitItems?.length > 0, kitItems: p.kitItems || []}); setKitProductId(""); setKitQty(1); setModal(p); };

  const exportCsv = () => {
    const headers = ["nombre","categoria","precio_minorista","precio_mayorista","unidad","stock","activo","descripcion"];
    const rows = products.map(p => [p.name, p.category, p.priceRetail, p.priceWholesale, p.unit, p.stock, p.active?"si":"no", p.description||""]);
    const csv = "\uFEFF" + [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8;" }));
    a.download = "productos.csv"; a.click();
  };

  const save = async () => {
    if (!form.name) { showToast("El nombre es obligatorio", "error"); return; }
    if (modal==="new") {
      const newProduct = {...form, id:uid(), priceRetail:Number(form.priceRetail), priceWholesale:Number(form.priceWholesale), stock:Number(form.stock)};
      const { error } = await supabase.from("products").insert(productToDb(newProduct));
      if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
      setProducts(p => [...p, newProduct]);
      logAction?.("crear", "producto", `Creó "${newProduct.name}" — precio $${newProduct.priceRetail}/$${newProduct.priceWholesale}, stock ${newProduct.stock}`);
    } else {
      const updated = {...form, priceRetail:Number(form.priceRetail), priceWholesale:Number(form.priceWholesale), stock:Number(form.stock)};
      const { error } = await supabase.from("products").update(productToDb(updated)).eq("id", modal.id);
      if (error) { showToast("Error al actualizar: " + error.message, "error"); return; }
      setProducts(p => p.map(x => x.id===modal.id ? {...x,...updated} : x));
      const changes = [];
      if (modal.priceRetail !== updated.priceRetail) changes.push(`precio retail $${modal.priceRetail}→$${updated.priceRetail}`);
      if (modal.priceWholesale !== updated.priceWholesale) changes.push(`precio mayor $${modal.priceWholesale}→$${updated.priceWholesale}`);
      if (modal.stock !== updated.stock) changes.push(`stock ${modal.stock}→${updated.stock}`);
      logAction?.("editar", "producto", `"${updated.name}"${changes.length ? ` — ${changes.join(", ")}` : ""}`);
    }
    setModal(null);
    showToast("Producto guardado");
  };

  const del = async (id) => {
    const product = products.find(p => p.id === id);
    if (confirm("¿Eliminar producto?")) {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
      setProducts(p=>p.filter(x=>x.id!==id));
      logAction?.("eliminar", "producto", `Eliminó "${product?.name}"`);
      showToast("Eliminado");
    }
  };

  const toggleActive = async (id) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const active = !product.active;
    const { error } = await supabase.from("products").update({ active }).eq("id", id);
    if (error) { showToast("Error al actualizar: " + error.message, "error"); return; }
    setProducts(p => p.map(x => x.id===id ? {...x, active} : x));
    logAction?.("estado", "producto", `"${product.name}" → ${active ? "activo" : "inactivo"}`);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Productos</div><div className="page-sub">{products.length} registrados</div></div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-secondary" onClick={exportCsv}><Ico n="download" s={14}/>Exportar CSV</button>
          <button className="btn btn-primary" onClick={openNew}><Ico n="plus" s={14}/>Nuevo producto</button>
        </div>
      </div>

      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <div className="search-wrap" style={{ flex:1, minWidth:200 }}>
          <div className="search-ico"><Ico n="search" s={14}/></div>
          <input placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        {cats.map(c => <button key={c} className={`btn btn-sm ${filterCat===c?"btn-primary":"btn-secondary"}`} onClick={()=>setFilterCat(c)}>{c}</button>)}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Categoría</th><th>P. Minorista</th><th>P. Mayorista</th><th>Stock</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="tr-click" onClick={()=>openEdit(p)}>
                <td data-label="Nombre">
                  <div style={{ fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                    {p.name}
                    {p.kitItems?.length > 0 && <span className="badge badge-blue" style={{ fontSize:".7em" }}>Kit</span>}
                  </div>
                  {p.description&&<div style={{ fontSize:".74em", color:"var(--t3)" }}>{p.description}</div>}
                </td>
                <td data-label="Categoría"><span className="tag">{p.category}</span></td>
                <td data-label="P. Minorista" style={{ fontWeight:600, color:"var(--green)" }}>{$(p.priceRetail)}</td>
                <td data-label="P. Mayorista" style={{ color:"var(--t2)" }}>{$(p.priceWholesale)}</td>
                <td data-label="Stock">
                  <span style={{ fontWeight:600, color:p.stock<=2?"var(--red)":p.stock<=5?"var(--amber)":"var(--t1)" }}>{p.stock}</span>
                </td>
                <td data-label="Estado">
                  <button className={`badge ${p.active?"badge-green":"badge-gray"}`} onClick={e=>{e.stopPropagation();toggleActive(p.id);}}>
                    {p.active?"Activo":"Inactivo"}
                  </button>
                </td>
                <td data-label="">
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={e=>{e.stopPropagation();del(p.id);}}><Ico n="trash" s={13} c="var(--red)"/></button>
                </td>
              </tr>
            ))}
            {filtered.length===0&&<tr><td colSpan={7}><div className="empty"><div className="empty-icon">📦</div><h3>Sin productos</h3></div></td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal==="new"?"Nuevo producto":form.name} onClose={()=>setModal(null)}>
          <div className="form-grid">
            <div className="form-group full"><label className="lbl">Nombre *</label><input value={form.name} onChange={e=>set("name",e.target.value)} autoFocus/></div>
            <div className="form-group"><label className="lbl">Categoría</label>
              <select value={form.category} onChange={e=>set("category",e.target.value)}>
                {categories.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="lbl">Unidad</label>
              <select value={form.unit} onChange={e=>set("unit",e.target.value)}>
                <option value="unit">Unidad</option>
                <option value="kg">Peso (kg)</option>
              </select>
            </div>
            <div className="form-group"><label className="lbl">Precio minorista</label><input type="number" value={form.priceRetail} onChange={e=>set("priceRetail",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Precio mayorista</label><input type="number" value={form.priceWholesale} onChange={e=>set("priceWholesale",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Stock actual</label><input type="number" value={form.stock} onChange={e=>set("stock",e.target.value)}/></div>
            <div className="form-group"><label className="lbl">Activo</label>
              <select value={form.active?"true":"false"} onChange={e=>set("active",e.target.value==="true")}>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>
            <div className="form-group full"><label className="lbl">Descripción</label><textarea value={form.description} onChange={e=>set("description",e.target.value)}/></div>
            <div className="form-group full">
              <label className="lbl" style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="checkbox" checked={form.isKit} onChange={e=>set("isKit",e.target.checked)} style={{ width:16, height:16 }}/>
                ¿Es un kit? (compuesto por otros productos)
              </label>
            </div>
            {form.isKit && (
              <div className="form-group full">
                <label className="lbl">Componentes del kit</label>
                <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                  <select value={kitProductId} onChange={e=>setKitProductId(e.target.value)} style={{ flex:1 }}>
                    <option value="">— Seleccionar producto —</option>
                    {products.filter(p => !p.kitItems?.length && p.id !== (modal !== "new" ? modal.id : null)).sort((a,b)=>a.name.localeCompare(b.name)).map(p =>
                      <option key={p.id} value={p.id}>{p.name}</option>
                    )}
                  </select>
                  <input type="number" value={kitQty} onChange={e=>setKitQty(Number(e.target.value))} min={1} style={{ width:70 }} placeholder="Cant."/>
                  <button className="btn btn-secondary btn-sm" onClick={() => {
                    if (!kitProductId) return;
                    const already = form.kitItems.find(k => k.productId === kitProductId);
                    if (already) { set("kitItems", form.kitItems.map(k => k.productId===kitProductId ? {...k, qty: kitQty} : k)); }
                    else { set("kitItems", [...form.kitItems, { productId: kitProductId, qty: kitQty }]); }
                    setKitProductId(""); setKitQty(1);
                  }}>Agregar</button>
                </div>
                {form.kitItems.length > 0 && (
                  <div style={{ border:"1px solid var(--border)", borderRadius:6, overflow:"hidden" }}>
                    {form.kitItems.map((k,i) => {
                      const prod = products.find(p => p.id === k.productId);
                      return (
                        <div key={k.productId} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 10px", background: i%2===0?"var(--bg2)":"var(--bg1)", fontSize:".88em" }}>
                          <span>{prod?.name || k.productId}</span>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ color:"var(--t2)" }}>×{k.qty}</span>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>set("kitItems", form.kitItems.filter((_,j)=>j!==i))}><Ico n="trash" s={12} c="var(--red)"/></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {form.kitItems.length === 0 && <div style={{ color:"var(--t3)", fontSize:".84em" }}>Agregá al menos un producto componente.</div>}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save}><Ico n="check" s={13}/>Guardar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
