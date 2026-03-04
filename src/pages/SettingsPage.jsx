import { useState } from "react";
import { Ico } from "../shared.jsx";
import { supabase } from "../supabase.js";

export default function SettingsPage({ categories, setCategories, expenseCategories, setExpenseCategories, showToast }) {
  const [newCat, setNewCat] = useState("");
  const [newExpCat, setNewExpCat] = useState("");

  const addCat = async () => {
    if (!newCat || categories.includes(newCat)) return;
    const { error } = await supabase.from("categories").insert({ name: newCat });
    if (error) { showToast("Error al agregar: " + error.message, "error"); return; }
    setCategories(p => [...p, newCat]);
    setNewCat("");
    showToast("Categoría agregada");
  };

  const delCat = async (c) => {
    const { error } = await supabase.from("categories").delete().eq("name", c);
    if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
    setCategories(p => p.filter(x => x !== c));
    showToast("Categoría eliminada");
  };

  const addExpCat = async () => {
    if (!newExpCat || expenseCategories.includes(newExpCat)) return;
    const { error } = await supabase.from("expense_categories").insert({ name: newExpCat });
    if (error) { showToast("Error al agregar: " + error.message, "error"); return; }
    setExpenseCategories(p => [...p, newExpCat]);
    setNewExpCat("");
    showToast("Categoría de gasto agregada");
  };

  const delExpCat = async (c) => {
    if (expenseCategories.length <= 1) { showToast("Debe quedar al menos una categoría", "error"); return; }
    const { error } = await supabase.from("expense_categories").delete().eq("name", c);
    if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
    setExpenseCategories(p => p.filter(x => x !== c));
    showToast("Categoría eliminada");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Configuración</div></div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        <div className="card">
          <div className="section-title">Categorías de productos</div>
          {categories.map(c=>(
            <div key={c} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
              <span style={{ fontSize:".88em" }}>{c}</span>
              {categories.length>1 && (
                <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>delCat(c)}>
                  <Ico n="x" s={12} c="var(--red)"/>
                </button>
              )}
            </div>
          ))}
          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <input value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="Nueva categoría..."
              onKeyDown={e=>{ if(e.key==="Enter") addCat(); }}/>
            <button className="btn btn-primary btn-sm" disabled={!newCat||categories.includes(newCat)} onClick={addCat}>
              <Ico n="plus" s={13}/>
            </button>
          </div>
        </div>

        <div className="card">
          <div className="section-title">Categorías de gastos</div>
          {expenseCategories.map(c=>(
            <div key={c} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
              <span style={{ fontSize:".88em" }}>{c}</span>
              {expenseCategories.length>1 && (
                <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>delExpCat(c)}>
                  <Ico n="x" s={12} c="var(--red)"/>
                </button>
              )}
            </div>
          ))}
          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <input value={newExpCat} onChange={e=>setNewExpCat(e.target.value)} placeholder="Nueva categoría..."
              onKeyDown={e=>{ if(e.key==="Enter") addExpCat(); }}/>
            <button className="btn btn-primary btn-sm" disabled={!newExpCat||expenseCategories.includes(newExpCat)} onClick={addExpCat}>
              <Ico n="plus" s={13}/>
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ maxWidth:420 }}>
        <div className="section-title">Usuarios del sistema</div>
        {[{name:"Administrador",role:"admin",pass:"noImporta"},{name:"Vendedor",role:"vendor",pass:"000comida"}].map(u=>(
          <div key={u.role} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
            <div>
              <div style={{ fontWeight:600, fontSize:".88em" }}>{u.name}</div>
              <div style={{ fontSize:".74em", color:"var(--t3)" }}>Contraseña: {u.pass}</div>
            </div>
            <span className="tag" style={{ textTransform:"capitalize" }}>{u.role}</span>
          </div>
        ))}
        <p style={{ fontSize:".78em", color:"var(--t3)", marginTop:10 }}>Para cambiar contraseñas, editá el archivo src/shared.jsx</p>
      </div>
    </div>
  );
}
