/**
 * SettingsPage — Configuración del sistema dividida en subsecciones.
 *
 * Subsecciones:
 *  - general   → Categorías de productos y gastos
 *  - sistema   → Recordatorios, alertas, valores comerciales, objetivo semanal
 *  - empleados → Gestión de empleados (admin only)
 *  - notas     → Notas / Fichas internas (admin only)
 *  - cuenta    → Cambiar contraseña
 */
import { useState, useEffect, useMemo } from "react";
import { Ico } from "../shared.jsx";
import { supabase } from "../supabase.js";
import { getLastAuditResult, auditIsDue, runAudit, sendAuditEmail } from "../utils/auditCheck.js";

export default function SettingsPage({ user, products, categories, setCategories, expenseCategories, setExpenseCategories, showToast, reminderStart, setReminderStart, reminderEnd, setReminderEnd, resetDemo, alertBalanceThreshold, setAlertBalanceThreshold, inactiveDayThreshold, setInactiveDayThreshold, frozenDiscount, setFrozenDiscount, vatRate, setVatRate, settingsSection = "general", setPage, weeklyGoals = [], setWeeklyGoals, weeklyGoalStart, setWeeklyGoalStart, weeklyGoalEnd, setWeeklyGoalEnd }) {
  const [newCat, setNewCat] = useState("");
  const [newExpCat, setNewExpCat] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPassConfirm, setNewPassConfirm] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [changingPass, setChangingPass] = useState(false);
  const [rStart, setRStart] = useState(reminderStart);
  const [rEnd,   setREnd]   = useState(reminderEnd);
  const [balThreshold, setBalThreshold] = useState(String(alertBalanceThreshold));
  const [inactiveDaysInput, setInactiveDaysInput] = useState(String(inactiveDayThreshold ?? 0));
  const [frozenInput, setFrozenInput] = useState(String(frozenDiscount));
  const [vatInput, setVatInput] = useState(String(vatRate));

  // ─── Objetivo semanal ─────────────────────────────────────────────────────
  const [wgStart, setWgStart] = useState(weeklyGoalStart || "08:00");
  const [wgEnd,   setWgEnd]   = useState(weeklyGoalEnd   || "20:00");
  const [wgProduct, setWgProduct]   = useState("");
  const [wgProductId, setWgProductId] = useState("");
  const [wgTargetQty, setWgTargetQty] = useState("");
  const [wgUnitLabel, setWgUnitLabel] = useState("");
  const [wgSearch, setWgSearch] = useState("");
  const [wgSaving, setWgSaving] = useState(false);

  const getWeekStart = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday.toISOString().split("T")[0]; // YYYY-MM-DD
  };
  const weekStartStr = useMemo(getWeekStart, []);

  const currentGoals = weeklyGoals.filter(g => g.weekStart === weekStartStr);

  const saveWgSchedule = async () => {
    if (!wgStart || !wgEnd || wgStart >= wgEnd) {
      showToast("El horario de inicio debe ser anterior al de fin", "error");
      return;
    }
    const rows = [
      { key: "weekly_goal_start", value: wgStart },
      { key: "weekly_goal_end",   value: wgEnd   },
    ];
    const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
    if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
    setWeeklyGoalStart?.(wgStart);
    setWeeklyGoalEnd?.(wgEnd);
    showToast("Horario de objetivo semanal guardado ✓");
  };

  const addGoal = async () => {
    if (!wgProductId) { showToast("Seleccioná un producto", "error"); return; }
    if (!wgTargetQty || Number(wgTargetQty) <= 0) { showToast("Ingresá una cantidad válida", "error"); return; }
    setWgSaving(true);
    const row = {
      week_start:   weekStartStr,
      product_id:   wgProductId,
      product_name: wgProduct,
      target_qty:   Number(wgTargetQty),
      unit_label:   wgUnitLabel.trim(),
      sort_order:   currentGoals.length,
    };
    const { data, error } = await supabase.from("weekly_goals").insert(row).select().single();
    setWgSaving(false);
    if (error) { showToast("Error al agregar: " + error.message, "error"); return; }
    setWeeklyGoals?.(prev => [...prev, {
      id: data.id, weekStart: data.week_start, productId: data.product_id,
      productName: data.product_name, targetQty: data.target_qty,
      unitLabel: data.unit_label, sortOrder: data.sort_order,
    }]);
    setWgProduct(""); setWgProductId(""); setWgTargetQty(""); setWgUnitLabel(""); setWgSearch("");
    showToast("Objetivo agregado ✓");
  };

  const deleteGoal = async (id) => {
    if (!confirm("¿Eliminar este objetivo?")) return;
    const { error } = await supabase.from("weekly_goals").delete().eq("id", id);
    if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
    setWeeklyGoals?.(prev => prev.filter(g => g.id !== id));
    showToast("Objetivo eliminado");
  };

  // ─── Empleados ────────────────────────────────────────────────────────────
  const [employees, setEmployees] = useState([]);
  const [loadingEmps, setLoadingEmps] = useState(false);
  const domain = user?.email ? user.email.split("@")[1] : null;

  useEffect(() => {
    if (settingsSection !== "empleados") return;
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
  }, [user, domain, settingsSection]);

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
    const inUse = products?.some(p => p.category === c);
    const msg = inUse ? `Hay productos asignados a "${c}". ¿Eliminar categoría de todas formas?` : `¿Eliminar categoría "${c}"?`;
    if (!confirm(msg)) return;
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

  // ─── Notas internas ───────────────────────────────────────────────────────
  const [notes, setNotes] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteInvolved, setNoteInvolved] = useState("");
  const [noteDesc, setNoteDesc] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    if (settingsSection !== "notas") return;
    if (user?.role !== "admin" || user?.isDemo) return;
    setLoadingNotes(true);
    supabase
      .from("internal_notes")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        setLoadingNotes(false);
        if (!error && data) setNotes(data);
      });
  }, [user, settingsSection]);

  const saveNote = async () => {
    if (!noteDesc.trim()) { showToast("La descripción es obligatoria", "error"); return; }
    setSavingNote(true);
    const row = {
      id: crypto.randomUUID(),
      created_by: user.name || user.email,
      involved: noteInvolved.trim() || null,
      description: noteDesc.trim(),
      created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("internal_notes").insert(row);
    setSavingNote(false);
    if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
    setNotes(prev => [row, ...prev]);
    setNoteInvolved("");
    setNoteDesc("");
    showToast("Nota guardada ✓");
  };

  const SECTION_TITLES = {
    general:   "General",
    sistema:   "Sistema",
    empleados: "Empleados",
    notas:     "Notas internas",
    cuenta:    "Mi cuenta",
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">
            Configuración
            <span style={{ fontWeight:400, color:"var(--t3)", marginLeft:8, fontSize:".75em" }}>
              / {SECTION_TITLES[settingsSection] || "General"}
            </span>
          </div>
        </div>
      </div>

      {/* ── GENERAL ─────────────────────────────────────────────────── */}
      {settingsSection === "general" && (
        <div className="resp-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
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
      )}

      {/* ── SISTEMA ─────────────────────────────────────────────────── */}
      {settingsSection === "sistema" && (
        <>
          <div style={{ display:"flex", gap:16, flexWrap:"wrap", marginBottom:16, alignItems:"flex-start" }}>
          <div className="card" style={{ flex:"1 1 340px", marginBottom:0 }}>
            <div className="section-title">Recordatorios</div>
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

          {/* Objetivo semanal — al lado de Recordatorios */}
          {user?.role === "admin" && (
            <div className="card" style={{ flex:"1 1 340px", marginBottom:0, overflow:"visible" }}>
              <div className="section-title">Objetivo semanal de producción</div>
              <div style={{ fontSize:".84em", color:"var(--t3)", marginBottom:14 }}>
                Rango horario en que se muestra el objetivo al iniciar sesión.
              </div>

              {/* Horario */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, flexWrap:"wrap" }}>
                <div className="form-group" style={{ flex:1, minWidth:120, marginBottom:0 }}>
                  <label className="lbl">Desde</label>
                  <input type="time" value={wgStart} onChange={e => setWgStart(e.target.value)}/>
                </div>
                <div className="form-group" style={{ flex:1, minWidth:120, marginBottom:0 }}>
                  <label className="lbl">Hasta</label>
                  <input type="time" value={wgEnd} onChange={e => setWgEnd(e.target.value)}/>
                </div>
                <button className="btn btn-primary btn-sm" style={{ alignSelf:"flex-end", marginBottom:1 }} onClick={saveWgSchedule}>
                  <Ico n="check" s={13}/> Guardar
                </button>
              </div>

              <div style={{ borderTop:"1px solid var(--border)", marginTop:4, paddingTop:16 }}>
                <div style={{ fontWeight:600, fontSize:".84em", color:"var(--t2)", marginBottom:12 }}>
                  Semana actual ({weekStartStr}) — {currentGoals.length} productos
                </div>

                {currentGoals.length > 0 && (
                  <div className="table-wrap" style={{ marginBottom:16 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th style={{ textAlign:"center" }}>Objetivo</th>
                          <th style={{ textAlign:"center" }}>Unidad</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentGoals.map(g => (
                          <tr key={g.id}>
                            <td style={{ fontWeight:500 }}>{g.productName}</td>
                            <td style={{ textAlign:"center" }}>{g.targetQty}</td>
                            <td style={{ textAlign:"center", color:"var(--t3)" }}>{g.unitLabel || "–"}</td>
                            <td style={{ textAlign:"center" }}>
                              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => deleteGoal(g.id)} title="Eliminar">
                                <Ico n="x" s={13} c="var(--red)"/>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Formulario para agregar */}
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"flex-end" }}>
                  <div className="form-group" style={{ flex:"1 1 160px", marginBottom:0, position:"relative" }}>
                    <label className="lbl">Producto</label>
                    {wgProductId
                      ? (
                        <div style={{ display:"flex", alignItems:"center", gap:6, background:"var(--greenl)", border:"1px solid var(--greenlb)", borderRadius:7, padding:"6px 10px" }}>
                          <span style={{ flex:1, fontSize:".88em", fontWeight:600 }}>{wgProduct}</span>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setWgProductId(""); setWgProduct(""); setWgSearch(""); }}>
                            <Ico n="x" s={12} c="var(--red)"/>
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            value={wgSearch}
                            onChange={e => setWgSearch(e.target.value)}
                            placeholder="Buscar producto..."
                          />
                          {wgSearch && (
                            <div style={{ position:"absolute", top:"100%", left:0, right:0, background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:7, boxShadow:"0 4px 16px rgba(0,0,0,.12)", zIndex:100, maxHeight:220, overflowY:"auto" }}>
                              {(products || [])
                                .filter(p => p.active && p.name.toLowerCase().includes(wgSearch.toLowerCase()))
                                .map(p => (
                                  <div key={p.id}
                                    style={{ padding:"8px 12px", cursor:"pointer", fontSize:".84em", borderBottom:"1px solid var(--border)" }}
                                    onMouseDown={() => { setWgProductId(p.id); setWgProduct(p.name); setWgSearch(""); }}
                                  >
                                    {p.name}
                                  </div>
                                ))
                              }
                            </div>
                          )}
                        </>
                      )
                    }
                  </div>
                  <div className="form-group" style={{ flex:"0 0 80px", marginBottom:0 }}>
                    <label className="lbl">Cantidad</label>
                    <input
                      type="text" inputMode="numeric"
                      value={wgTargetQty}
                      onChange={e => setWgTargetQty(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="Ej: 3"
                    />
                  </div>
                  <div className="form-group" style={{ flex:"1 1 120px", marginBottom:0 }}>
                    <label className="lbl">Unidad</label>
                    <input
                      type="text"
                      value={wgUnitLabel}
                      onChange={e => setWgUnitLabel(e.target.value)}
                      placeholder="Ej: placa, hornada..."
                    />
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ alignSelf:"flex-end", marginBottom:1 }}
                    onClick={addGoal}
                    disabled={wgSaving}
                  >
                    {wgSaving ? "..." : <><Ico n="plus" s={13}/> Agregar</>}
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>{/* cierre flex wrapper */}

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
            <div className="section-title">Alerta de clientes inactivos</div>
            <div style={{ fontSize:".84em", color:"var(--t3)", marginBottom:14 }}>
              Se mostrará una alerta en el Dashboard cuando un cliente no haya comprado en más de los días indicados. Ingresá 0 para desactivar.
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div className="form-group" style={{ flex:1, marginBottom:0 }}>
                <label className="lbl">Días sin compra</label>
                <input
                  type="text" inputMode="numeric"
                  value={inactiveDaysInput}
                  onChange={e => setInactiveDaysInput(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="Ej: 30"
                />
              </div>
              <button className="btn btn-primary btn-sm" style={{ alignSelf:"flex-end", marginBottom:1 }} onClick={async () => {
                const v = Math.max(0, Number(inactiveDaysInput) || 0);
                const { error } = await supabase.from("app_settings")
                  .upsert({ key: "inactive_days_threshold", value: String(v) }, { onConflict: "key" });
                if (error) { showToast("Error al guardar: " + error.message, "error"); return; }
                setInactiveDayThreshold(v);
                showToast("Umbral de inactividad guardado ✓");
              }}>
                <Ico n="check" s={13}/> Guardar
              </button>
            </div>
            {inactiveDayThreshold > 0
              ? <p style={{ fontSize:".76em", color:"var(--t4)", marginTop:8 }}>Activa: alerta cuando el cliente no compre en más de <strong>{inactiveDayThreshold} días</strong></p>
              : <p style={{ fontSize:".76em", color:"var(--t4)", marginTop:8 }}>Desactivada (días en 0)</p>
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

          {user?.isDemo && (
            <div className="card" style={{ maxWidth:420, borderColor:"var(--amberlb)" }}>
              <div className="section-title">🧪 Entorno Demo</div>
              <p style={{ fontSize:".84em", color:"var(--t3)", marginBottom:14 }}>
                Restaura todos los datos de demostración a su estado inicial.
              </p>
              <button className="btn btn-amber btn-sm" onClick={resetDemo}>
                ↺ Restaurar datos de demo
              </button>
            </div>
          )}
        </>
      )}

      {/* ── EMPLEADOS ───────────────────────────────────────────────── */}
      {settingsSection === "empleados" && user?.role === "admin" && (
        <div className="card">
          <div className="section-title" style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span>Empleados del negocio</span>
            <span style={{ fontSize:".78em", fontWeight:400, color:"var(--t3)" }}>
              {domain && <>Dominio: <strong>@{domain}</strong> · </>}
              {employees.length} {employees.length === 1 ? "usuario" : "usuarios"}
            </span>
          </div>

          {user?.isDemo ? (
            <p style={{ fontSize:".85em", color:"var(--t3)", padding:"12px 0" }}>No disponible en modo demo.</p>
          ) : loadingEmps ? (
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
                          {new Date(emp.created_at).toLocaleDateString("es-AR",{timeZone:"America/Argentina/Buenos_Aires"})}
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

      {settingsSection === "empleados" && user?.role === "admin" && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title">Banco de Horas</div>
          <p style={{ fontSize:".85em", color:"var(--t3)", marginBottom:12 }}>
            Consultá las horas acumuladas por empleado en producción (cocina y empaque).
          </p>
          <button className="btn btn-secondary" onClick={() => setPage("hours-bank")}>
            Ver Banco de Horas →
          </button>
        </div>
      )}

      {/* ── NOTAS INTERNAS ──────────────────────────────────────────── */}
      {settingsSection === "notas" && user?.role === "admin" && (
        <div className="card">
          <div className="section-title" style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Ico n="settings" s={14} c="var(--t3)"/>
            Notas / Fichas internas
            <span style={{ marginLeft:"auto", fontSize:".75em", fontWeight:400, color:"var(--t4)" }}>
              Solo visible para administradores
            </span>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="lbl">Cargado por</label>
              <input value={user.name || user.email} disabled style={{ opacity:.6, cursor:"not-allowed" }}/>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="lbl">Involucrado/a</label>
              <input
                value={noteInvolved}
                onChange={e => setNoteInvolved(e.target.value)}
                placeholder="Nombre del empleado o cliente..."
              />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom:10 }}>
            <label className="lbl">Descripción del caso <span style={{ color:"var(--red)" }}>*</span></label>
            <textarea
              value={noteDesc}
              onChange={e => setNoteDesc(e.target.value)}
              placeholder="Describí el caso o situación..."
              rows={3}
              style={{ resize:"vertical", minHeight:72 }}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveNote(); }}
            />
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:20 }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={!noteDesc.trim() || savingNote}
              onClick={saveNote}
            >
              <Ico n="plus" s={13}/> {savingNote ? "Guardando..." : "Guardar nota"}
            </button>
          </div>

          {loadingNotes ? (
            <p style={{ fontSize:".85em", color:"var(--t3)" }}>Cargando notas...</p>
          ) : notes.length === 0 ? (
            <p style={{ fontSize:".85em", color:"var(--t4)", fontStyle:"italic" }}>No hay notas registradas aún.</p>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {notes.map(n => (
                <div key={n.id} style={{ border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px", background:"var(--s1)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, flexWrap:"wrap" }}>
                    <span style={{ fontSize:".78em", fontWeight:600, color:"var(--t2)" }}>{n.created_by}</span>
                    {n.involved && (
                      <>
                        <span style={{ fontSize:".75em", color:"var(--t4)" }}>·</span>
                        <span style={{ fontSize:".78em", color:"var(--t3)" }}>
                          Involucrado/a: <strong>{n.involved}</strong>
                        </span>
                      </>
                    )}
                    <span style={{ marginLeft:"auto", fontSize:".74em", color:"var(--t4)", whiteSpace:"nowrap" }}>
                      {new Date(n.created_at).toLocaleString("es-AR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"America/Argentina/Buenos_Aires" })}
                    </span>
                  </div>
                  <p style={{ fontSize:".84em", color:"var(--t2)", margin:0, whiteSpace:"pre-wrap", lineHeight:1.5 }}>{n.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MI CUENTA ───────────────────────────────────────────────── */}
      {/* ── BACKUP ──────────────────────────────────────────────────── */}
      {settingsSection === "backup" && user?.role === "admin" && (
        <BackupSection user={user} showToast={showToast} />
      )}

      {/* ── MI CUENTA ───────────────────────────────────────────────── */}
      {settingsSection === "cuenta" && !user?.isDemo && (
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

      {settingsSection === "cuenta" && user?.isDemo && (
        <div className="card" style={{ maxWidth:420 }}>
          <div className="section-title">Mi cuenta</div>
          <p style={{ fontSize:".84em", color:"var(--t3)" }}>No disponible en modo demo.</p>
        </div>
      )}
    </div>
  );
}

// ─── Backup Section ───────────────────────────────────────────────────────────
const BACKUP_TABLES = [
  "customers", "sales", "account_payments", "products", "expenses",
  "supplier_payments", "stock_movements", "cash_shifts", "suppliers",
  "ingredients", "recipes", "recipe_ingredients", "categories",
  "expense_categories", "app_settings",
];

function BackupSection({ user, showToast }) {
  const [loading, setLoading] = useState(false);
  const [lastBackup, setLastBackup] = useState(
    localStorage.getItem("last_backup_date") || null
  );
  const [auditResult, setAuditResult] = useState(getLastAuditResult);
  const [auditing, setAuditing] = useState(false);

  const handleRunAudit = async () => {
    if (user?.isDemo) return;
    setAuditing(true);
    try {
      const result = await runAudit();
      setAuditResult(result);
      if (result.ok) {
        showToast("Auditoría completada: todo OK ✓");
      } else {
        showToast(`Auditoría: ${result.orphanedCredits.length + result.uncoveredSales.length} problema(s) encontrado(s)`, "error");
        sendAuditEmail(result).catch(() => {});
      }
    } catch (err) {
      showToast("Error en auditoría: " + err.message, "error");
    } finally {
      setAuditing(false);
    }
  };

  const handleExport = async () => {
    if (user?.isDemo) { showToast("No disponible en modo demo", "error"); return; }
    setLoading(true);
    try {
      const backup = { exported_at: new Date().toISOString(), tables: {} };

      for (const table of BACKUP_TABLES) {
        const { data, error } = await supabase.from(table).select("*");
        if (error) throw new Error(`Error en tabla ${table}: ${error.message}`);
        backup.tables[table] = data ?? [];
      }

      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const ts   = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `nutrifree_backup_${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);

      const dateStr = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
      localStorage.setItem("last_backup_date", dateStr);
      setLastBackup(dateStr);
      showToast("Backup exportado correctamente ✓");
    } catch (err) {
      showToast("Error al exportar: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const totalRows = {
    customers: "clientes", sales: "ventas", account_payments: "movimientos C/C",
    products: "productos", expenses: "gastos", supplier_payments: "pagos proveedores",
    stock_movements: "movimientos stock", cash_shifts: "turnos caja",
  };

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Ico n="download" s={15} c="var(--t2)" />
        Backup de datos
        <span style={{ marginLeft: "auto", fontSize: ".75em", fontWeight: 400, color: "var(--t4)" }}>
          Solo administradores
        </span>
      </div>

      <p style={{ fontSize: ".84em", color: "var(--t3)", marginBottom: 16 }}>
        Descargá un archivo <strong>.json</strong> con todos los datos del sistema.
        Incluye clientes, ventas, cuentas corrientes, productos, gastos, stock y más.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
        {Object.entries(totalRows).map(([, label]) => (
          <span key={label} style={{
            fontSize: ".75em", padding: "2px 8px", borderRadius: 4,
            background: "var(--surface2)", color: "var(--t3)", border: "1px solid var(--border)"
          }}>
            {label}
          </span>
        ))}
        <span style={{
          fontSize: ".75em", padding: "2px 8px", borderRadius: 4,
          background: "var(--surface2)", color: "var(--t3)", border: "1px solid var(--border)"
        }}>
          + más tablas
        </span>
      </div>

      <button
        className="btn btn-primary"
        onClick={handleExport}
        disabled={loading || user?.isDemo}
        style={{ display: "flex", alignItems: "center", gap: 8 }}
      >
        <Ico n="download" s={14} />
        {loading ? "Exportando..." : "Exportar backup completo"}
      </button>

      {lastBackup && (
        <p style={{ fontSize: ".75em", color: "var(--t4)", marginTop: 12 }}>
          Último backup: <strong>{lastBackup}</strong>
        </p>
      )}

      {user?.isDemo && (
        <p style={{ fontSize: ".8em", color: "var(--t4)", marginTop: 10, fontStyle: "italic" }}>
          No disponible en modo demo.
        </p>
      )}

      {/* Panel de auditoría */}
      {!user?.isDemo && (
        <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 18 }}>
          <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Ico n="check" s={14} c="var(--t2)" />
            Auditoría de integridad
            {auditIsDue() && !auditResult && (
              <span style={{ marginLeft: 6, fontSize: ".72em", padding: "1px 6px", borderRadius: 4, background: "var(--amber-bg,#451a03)", color: "var(--amber)" }}>
                pendiente
              </span>
            )}
          </div>

          {auditResult && (
            <div style={{
              borderRadius: 6, padding: "10px 14px", marginBottom: 12, fontSize: ".84em",
              background: auditResult.ok ? "var(--greenl,#052e16)" : "var(--redl,#450a0a)",
              border: `1px solid ${auditResult.ok ? "var(--greenlb,#166534)" : "var(--redlb,#991b1b)"}`,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: auditResult.ok ? "var(--green)" : "var(--red)" }}>
                {auditResult.ok ? "✓ Sin problemas detectados" : `⚠️ ${auditResult.orphanedCredits.length + auditResult.uncoveredSales.length} problema(s) detectado(s)`}
              </div>
              {!auditResult.ok && (
                <ul style={{ margin: "4px 0 0 16px", color: "var(--t3)", lineHeight: 1.7 }}>
                  {auditResult.orphanedCredits.length > 0 && (
                    <li>{auditResult.orphanedCredits.length} crédito(s) sin cargo de consumo</li>
                  )}
                  {auditResult.uncoveredSales.length > 0 && (
                    <li>{auditResult.uncoveredSales.length} venta(s) en cuenta sin cargo registrado</li>
                  )}
                </ul>
              )}
              <div style={{ fontSize: ".8em", color: "var(--t4)", marginTop: 6 }}>
                Última ejecución: {auditResult.date}
              </div>
            </div>
          )}

          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRunAudit}
            disabled={auditing}
            style={{ display: "flex", alignItems: "center", gap: 7 }}
          >
            <Ico n="check" s={13} />
            {auditing ? "Verificando..." : "Ejecutar auditoría ahora"}
          </button>
          <p style={{ fontSize: ".75em", color: "var(--t4)", marginTop: 8 }}>
            Se ejecuta automáticamente cada 7 días al iniciar sesión.
          </p>
        </div>
      )}
    </div>
  );
}
