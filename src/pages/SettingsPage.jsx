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
import { useState, useRef } from "react";
import { Ico } from "../shared.jsx";
import { supabase } from "../supabase.js";

export default function SettingsPage({ user, categories, setCategories, expenseCategories, setExpenseCategories, showToast, reminderStart, setReminderStart, reminderEnd, setReminderEnd, resetDemo, alertBalanceThreshold, setAlertBalanceThreshold }) {
  const [newCat, setNewCat] = useState("");
  const [newExpCat, setNewExpCat] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPassConfirm, setNewPassConfirm] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [changingPass, setChangingPass] = useState(false);
  const [rStart, setRStart] = useState(reminderStart);
  const [rEnd,   setREnd]   = useState(reminderEnd);
  const [balThreshold, setBalThreshold] = useState(String(alertBalanceThreshold));

  const changePassword = async () => {
    if (newPass.length < 6) { showToast("La contraseña debe tener al menos 6 caracteres", "error"); return; }
    if (newPass !== newPassConfirm) { showToast("Las contraseñas no coinciden", "error"); return; }
    setChangingPass(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setChangingPass(false);
    if (error) { showToast("Error al cambiar contraseña: " + error.message, "error"); return; }
    setNewPass(""); setNewPassConfirm("");
    showToast("Contraseña actualizada ✓");
  };

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

      <div className="resp-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
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
        <div style={{ borderTop:"1px solid var(--border)", marginTop:14, paddingTop:14 }}>
          <div style={{ fontSize:".84em", color:"var(--t3)", marginBottom:10 }}>
            Reiniciar el recordatorio del menú del día para que vuelva a aparecer al iniciar sesión, sin borrar el menú ya cargado.
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => {
            localStorage.removeItem("menuSavedDate");
            showToast("Recordatorio de menú reiniciado ✓");
          }}>
            ↺ Reiniciar recordatorio de menú
          </button>
        </div>
      </div>

      <div className="card" style={{ maxWidth:420, marginBottom:16 }}>
        <div className="section-title">Alerta de cuenta corriente</div>
        <div style={{ fontSize:".84em", color:"var(--t3)", marginBottom:14 }}>
          Se mostrará una alerta en el Dashboard cuando un cliente tenga saldo negativo mayor a este monto. Ingresá 0 para desactivar la alerta.
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div className="form-group" style={{ flex:1, marginBottom:0 }}>
            <label className="lbl">Monto límite ($)</label>
            <input
              type="text" inputMode="numeric"
              value={balThreshold}
              onChange={e => setBalThreshold(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Ej: 100000"
            />
          </div>
          <button className="btn btn-primary btn-sm" style={{ alignSelf:"flex-end", marginBottom:1 }} onClick={async () => {
            const v = Math.max(0, Number(balThreshold) || 0);
            const { error } = await supabase.from("app_settings")
              .upsert({ key: "balance_alert_threshold", value: String(v) }, { onConflict: "key" });
            if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
            setAlertBalanceThreshold(v);
            showToast("Límite de alerta guardado ✓");
          }}>
            <Ico n="check" s={13}/> Guardar
          </button>
        </div>
        {alertBalanceThreshold > 0
          ? <p style={{ fontSize:".76em", color:"var(--t4)", marginTop:8 }}>Activa: alerta cuando deuda supere <strong>${alertBalanceThreshold.toLocaleString("es-AR")}</strong></p>
          : <p style={{ fontSize:".76em", color:"var(--t4)", marginTop:8 }}>Desactivada (monto en 0)</p>
        }
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

      {!user?.isDemo && (
        <div className="card" style={{ maxWidth:420 }}>
          <div className="section-title">Cambiar contraseña</div>
          <p style={{ fontSize:".82em", color:"var(--t3)", marginBottom:14 }}>
            Cuenta actual: <strong>{user?.email}</strong>
          </p>
          <div className="form-group" style={{ marginBottom:10 }}>
            <label className="lbl">Nueva contraseña</label>
            <div style={{ position:"relative" }}>
              <input type={showNewPass ? "text" : "password"} value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Mínimo 6 caracteres" style={{ paddingRight:38 }} />
              <button type="button" onClick={() => setShowNewPass(v => !v)} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", padding:0, display:"flex", alignItems:"center" }} tabIndex={-1}>
                <Ico n="eye" s={15} c={showNewPass ? "var(--green)" : "var(--t4)"}/>
              </button>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom:14 }}>
            <label className="lbl">Confirmar contraseña</label>
            <input type={showNewPass ? "text" : "password"} value={newPassConfirm} onChange={e => setNewPassConfirm(e.target.value)} placeholder="Repetí la nueva contraseña" onKeyDown={e => e.key === "Enter" && changePassword()} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={changePassword} disabled={changingPass || !newPass || !newPassConfirm}>
            {changingPass ? "Guardando..." : "Actualizar contraseña"}
          </button>
        </div>
      )}
    </div>
  );
}
