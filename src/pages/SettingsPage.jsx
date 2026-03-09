/**
 * SettingsPage — Configuración del sistema.
 *
 * Permite:
 *  - Agregar/eliminar categorías de productos (tabla "categories" en DB)
 *  - Agregar/eliminar categorías de gastos (tabla "expense_categories" en DB)
 *  - Configurar el rango horario del recordatorio de entregas (localStorage)
 *  - Ver los usuarios del sistema con sus roles
 *  - Restaurar datos demo (solo visible en modo demo)
 *
 * Props: user, categories, setCategories, expenseCategories, setExpenseCategories,
 *        showToast, reminderStart, setReminderStart, reminderEnd, setReminderEnd, resetDemo
 */
import { useState } from "react";
import { Ico } from "../shared.jsx";
import { supabase } from "../supabase.js";

export default function SettingsPage({ user, categories, setCategories, expenseCategories, setExpenseCategories, showToast, reminderStart, setReminderStart, reminderEnd, setReminderEnd, resetDemo }) {
  const [newCat, setNewCat] = useState("");
  const [newExpCat, setNewExpCat] = useState("");
  const [rStart, setRStart] = useState(reminderStart);
  const [rEnd,   setREnd]   = useState(reminderEnd);

  const saveReminderRange = () => {
    if (!rStart || !rEnd || rStart >= rEnd) {
      showToast("El horario de inicio debe ser anterior al de fin", "error");
      return;
    }
    localStorage.setItem("reminderStart", rStart);
    localStorage.setItem("reminderEnd",   rEnd);
    setReminderStart(rStart);
    setReminderEnd(rEnd);
    showToast("Horario de recordatorio guardado ✓");
  };

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

      <div className="card" style={{ maxWidth:420, marginBottom:16 }}>
        <div className="section-title">Sistema</div>
        <div style={{ fontSize:".84em", color:"var(--t3)", marginBottom:14 }}>
          Horario en que aparecen los recordatorios al iniciar sesión: entregas pendientes del día y menú del día.
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, flexWrap:"wrap" }}>
          <div className="form-group" style={{ flex:1, minWidth:120 }}>
            <label className="lbl">Desde</label>
            <input type="time" value={rStart} onChange={e => setRStart(e.target.value)}/>
          </div>
          <div className="form-group" style={{ flex:1, minWidth:120 }}>
            <label className="lbl">Hasta</label>
            <input type="time" value={rEnd} onChange={e => setREnd(e.target.value)}/>
          </div>
          <button className="btn btn-primary btn-sm" style={{ alignSelf:"flex-end", marginBottom:1 }} onClick={saveReminderRange}>
            <Ico n="check" s={13}/> Guardar
          </button>
        </div>
        <p style={{ fontSize:".76em", color:"var(--t4)" }}>
          Valor actual: <strong>{reminderStart}</strong> – <strong>{reminderEnd}</strong>
        </p>
      </div>

      {user?.isDemo && (
        <div className="card" style={{ maxWidth:420, marginBottom:16, borderColor:"var(--amberlb)" }}>
          <div className="section-title">🧪 Entorno Demo</div>
          <p style={{ fontSize:".84em", color:"var(--t3)", marginBottom:14 }}>
            Restaura todos los datos de demostración a su estado inicial. Las ventas, pedidos, gastos y
            movimientos registrados en demo se eliminarán y se reemplazarán por los datos de muestra originales.
          </p>
          <button className="btn btn-amber btn-sm" onClick={resetDemo}>
            ↺ Restaurar datos de demo
          </button>
        </div>
      )}

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
