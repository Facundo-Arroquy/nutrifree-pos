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
import { useState, useEffect } from "react";
import { Ico } from "../shared.jsx";
import { supabase } from "../supabase.js";

export default function SettingsPage({ user, categories, setCategories, expenseCategories, setExpenseCategories, showToast, reminderStart, setReminderStart, reminderEnd, setReminderEnd, resetDemo, alertBalanceThreshold, setAlertBalanceThreshold, frozenDiscount, setFrozenDiscount, vatRate, setVatRate }) {
  const [newCat, setNewCat] = useState("");
  const [newExpCat, setNewExpCat] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPassConfirm, setNewPassConfirm] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [changingPass, setChangingPass] = useState(false);
  const [rStart, setRStart] = useState(reminderStart);
  const [rEnd,   setREnd]   = useState(reminderEnd);
  const [balThreshold, setBalThreshold] = useState(String(alertBalanceThreshold));
  const [frozenInput, setFrozenInput] = useState(String(frozenDiscount));
  const [vatInput, setVatInput] = useState(String(vatRate));

  // ─── Empleados ────────────────────────────────────────────────────────────
  const [employees, setEmployees] = useState([]);
  const [loadingEmps, setLoadingEmps] = useState(false);
  const domain = user?.email ? user.email.split("@")[1] : null;

  useEffect(() => {
    if (!user || user.role !== "admin" || user.isDemo || !domain) return;
    setLoadingEmps(true);
    supabase
      .from("business_users")
      .select("id, email, name, role, active, created_at")
      .eq("domain", domain)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        setLoadingEmps(false);
        if (!error && data) setEmployees(data);
      });
  }, [user, domain]);

  const updateEmployeeRole = async (id, role) => {
    const { error } = await supabase.from("business_users").update({ role }).eq("id", id);
    if (error) { showToast("Error: " + error.message, "error"); return; }
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, role } : e));
    showToast("Rol actualizado ✓");
  };

  const toggleEmployeeActive = async (id, active) => {
    const { error } = await supabase.from("business_users").update({ active: !active }).eq("id", id);
    if (error) { showToast("Error: " + error.message, "error"); return; }
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, active: !active } : e));
    showToast(!active ? "Usuario activado ✓" : "Usuario desactivado");
  };

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

      <div className="card" style={{ maxWidth:420, marginBottom:16 }}>
        <div className="section-title">Valores comerciales</div>
        <div style={{ fontSize:".84em", color:"var(--t3)", marginBottom:14 }}>
          Descuento para productos freezados y porcentaje de IVA aplicado en gastos de ingredientes.
        </div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:10, marginBottom:12, flexWrap:"wrap" }}>
          <div className="form-group" style={{ flex:1, minWidth:120, marginBottom:0 }}>
            <label className="lbl">Descuento freezadas (%)</label>
            <input
              type="text" inputMode="numeric"
              value={frozenInput}
              onChange={e => setFrozenInput(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Ej: 15"
            />
          </div>
          <div className="form-group" style={{ flex:1, minWidth:120, marginBottom:0 }}>
            <label className="lbl">IVA (%)</label>
            <input
              type="text" inputMode="numeric"
              value={vatInput}
              onChange={e => setVatInput(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Ej: 21"
            />
          </div>
          <button className="btn btn-primary btn-sm" style={{ marginBottom:1 }} onClick={async () => {
            const frozen = Math.max(0, Math.min(100, Number(frozenInput) || 0));
            const vat    = Math.max(0, Number(vatInput) || 0);
            const { error: e1 } = await supabase.from("app_settings")
              .upsert({ key: "frozen_discount", value: String(frozen) }, { onConflict: "key" });
            const { error: e2 } = await supabase.from("app_settings")
              .upsert({ key: "vat_rate", value: String(vat) }, { onConflict: "key" });
            if (e1 || e2) { showToast("Error al guardar: " + (e1||e2).message, "error"); return; }
            setFrozenDiscount(frozen);
            setVatRate(vat);
            showToast("Valores guardados ✓");
          }}>
            <Ico n="check" s={13}/> Guardar
          </button>
        </div>
        <p style={{ fontSize:".76em", color:"var(--t4)" }}>
          Freezadas: <strong>-{frozenDiscount}%</strong> · IVA: <strong>+{vatRate}%</strong>
        </p>
      </div>

      {user?.role === "admin" && !user?.isDemo && (
        <div className="card" style={{ marginBottom:16 }}>
          <div className="section-title" style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span>Empleados del negocio</span>
            <span style={{ fontSize:".78em", fontWeight:400, color:"var(--t3)" }}>
              {domain && <>Dominio: <strong>@{domain}</strong> · </>}
              {employees.length} {employees.length === 1 ? "usuario" : "usuarios"}
            </span>
          </div>

          {loadingEmps ? (
            <p style={{ fontSize:".85em", color:"var(--t3)", padding:"12px 0" }}>Cargando...</p>
          ) : employees.length === 0 ? (
            <p style={{ fontSize:".85em", color:"var(--t3)", padding:"12px 0" }}>
              No hay usuarios registrados con dominio @{domain}. Los empleados aparecen aquí automáticamente cuando inician sesión por primera vez.
            </p>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:".85em" }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid var(--border)", color:"var(--t3)" }}>
                    <th style={{ textAlign:"left", padding:"6px 8px", fontWeight:500 }}>Nombre</th>
                    <th style={{ textAlign:"left", padding:"6px 8px", fontWeight:500 }}>Email</th>
                    <th style={{ textAlign:"left", padding:"6px 8px", fontWeight:500 }}>Rol</th>
                    <th style={{ textAlign:"left", padding:"6px 8px", fontWeight:500 }}>Estado</th>
                    <th style={{ textAlign:"left", padding:"6px 8px", fontWeight:500 }}>Alta</th>
                    <th style={{ padding:"6px 8px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => {
                    const isSelf = emp.email === user.email;
                    return (
                      <tr key={emp.id} style={{ borderBottom:"1px solid var(--border)", opacity: emp.active ? 1 : 0.5 }}>
                        <td style={{ padding:"8px 8px" }}>{emp.name || "—"}</td>
                        <td style={{ padding:"8px 8px", color:"var(--t3)" }}>{emp.email}</td>
                        <td style={{ padding:"8px 8px" }}>
                          {isSelf ? (
                            <span style={{ fontSize:".8em", padding:"2px 8px", borderRadius:4, background:"var(--blue-bg,#1e3a5f)", color:"var(--blue,#60a5fa)" }}>
                              {emp.role}
                            </span>
                          ) : (
                            <select
                              value={emp.role}
                              onChange={e => updateEmployeeRole(emp.id, e.target.value)}
                              style={{ fontSize:".82em", padding:"2px 6px", borderRadius:4 }}
                            >
                              <option value="vendor">vendor</option>
                              <option value="admin">admin</option>
                            </select>
                          )}
                        </td>
                        <td style={{ padding:"8px 8px" }}>
                          <span style={{
                            fontSize:".78em", padding:"2px 8px", borderRadius:4,
                            background: emp.active ? "var(--green-bg,#14532d)" : "var(--red-bg,#450a0a)",
                            color: emp.active ? "var(--green)" : "var(--red)"
                          }}>
                            {emp.active ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td style={{ padding:"8px 8px", color:"var(--t4)", fontSize:".8em" }}>
                          {new Date(emp.created_at).toLocaleDateString("es-AR")}
                        </td>
                        <td style={{ padding:"8px 8px" }}>
                          {!isSelf && (
                            <button
                              className="btn btn-ghost btn-icon btn-sm"
                              title={emp.active ? "Desactivar usuario" : "Activar usuario"}
                              onClick={() => toggleEmployeeActive(emp.id, emp.active)}
                            >
                              <Ico n={emp.active ? "user-x" : "user-check"} s={14} c={emp.active ? "var(--red)" : "var(--green)"}/>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p style={{ fontSize:".75em", color:"var(--t4)", marginTop:12 }}>
            Los empleados se registran desde el Dashboard de Supabase. Al iniciar sesión por primera vez, aparecen aquí automáticamente.
          </p>
        </div>
      )}

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
