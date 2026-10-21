import { useEffect, useRef, useState } from "react";
import { Ico } from "../shared.jsx";
import { supabase } from "../supabase.js";
import { sendWeeklyMenuEmail } from "../utils/emailAlerts.js";
import { WEEK_DAYS, canvasToPng, drawWeeklyMenu, emptyWeekDays, mondayOf, normalizeWeekDays, shiftWeek, weekLabel } from "../utils/weeklyMenu.js";

export default function WeeklyMenuPage({ user, showToast }) {
  const [weekStart, setWeekStart] = useState(mondayOf());
  const [recordId, setRecordId] = useState("");
  const [days, setDays] = useState(emptyWeekDays);
  const [email, setEmail] = useState(user?.email || "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase.from("weekly_menus").select("*").eq("week_start", weekStart).then(({ data, error }) => {
      if (!active) return;
      if (error) showToast(`No se pudo cargar la semana: ${error.message}`, "error");
      const row = data?.[0];
      setRecordId(row?.id || "");
      setDays(normalizeWeekDays(row?.days));
      setLoading(false);
    });
    return () => { active = false; };
  }, [weekStart]);

  useEffect(() => {
    if (canvasRef.current) drawWeeklyMenu(canvasRef.current, weekStart, days);
  }, [weekStart, days, loading]);

  const setMeal = (day, meal, value) => setDays(prev => ({ ...prev, [day]: { ...prev[day], [meal]: value } }));

  const save = async () => {
    setSaving(true);
    const payload = { week_start: weekStart, days, updated_at: new Date().toISOString() };
    const newId = recordId || crypto.randomUUID();
    const result = recordId
      ? await supabase.from("weekly_menus").update(payload).eq("id", recordId)
      : await supabase.from("weekly_menus").insert({ ...payload, id: newId });
    setSaving(false);
    if (result.error) return showToast(`No se pudo guardar: ${result.error.message}`, "error");
    if (!recordId) setRecordId(newId);
    showToast("Menú semanal guardado en Supabase ✓");
  };

  const generateFile = async () => {
    drawWeeklyMenu(canvasRef.current, weekStart, days);
    const blob = await canvasToPng(canvasRef.current);
    return new File([blob], `menu-semanal-${weekStart}.png`, { type: "image/png" });
  };

  const download = async () => {
    const file = await generateFile();
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url; link.download = file.name; link.click();
    URL.revokeObjectURL(url);
  };

  const sendEmail = async () => {
    if (!email.trim()) return showToast("Ingresá un email", "error");
    setSending(true);
    try {
      const file = await generateFile();
      const path = `menus/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("invoices").upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from("invoices").getPublicUrl(path);
      await sendWeeklyMenuEmail(email.trim(), weekLabel(weekStart), data.publicUrl);
      showToast(`Menú enviado a ${email.trim()} ✓`);
    } catch (error) { showToast(error.message, "error"); }
    finally { setSending(false); }
  };

  return <main className="main">
    <style>{`@media(max-width:1000px){.weekly-menu-layout{grid-template-columns:1fr!important}}`}</style>
    <div className="page-header">
      <div><h2>Menú semanal</h2><p>Planificación de lunes a viernes guardada en Supabase.</p></div>
      <div style={{ display:"flex", gap:8 }}>
        <button className="btn btn-secondary" onClick={() => setWeekStart(shiftWeek(weekStart, -1))}>← Anterior</button>
        <button className="btn btn-secondary" onClick={() => setWeekStart(mondayOf())}>Esta semana</button>
        <button className="btn btn-secondary" onClick={() => setWeekStart(shiftWeek(weekStart, 1))}>Siguiente →</button>
      </div>
    </div>
    <div className="weekly-menu-layout" style={{ display:"grid", gridTemplateColumns:"minmax(520px,1fr) minmax(300px,.72fr)", gap:20, alignItems:"start" }}>
      <section className="card">
        <h3 style={{ marginBottom:4 }}>Semana del {weekLabel(weekStart)}</h3>
        <p style={{ color:"var(--t4)", fontSize:".82em", marginBottom:18 }}>Completá el almuerzo y la cena de cada día.</p>
        {loading ? <p>Cargando…</p> : <div className="table-wrap"><table>
          <thead><tr><th>Día</th><th>Almuerzo</th><th>Cena</th></tr></thead>
          <tbody>{WEEK_DAYS.map(day => <tr key={day.key}>
            <td style={{ fontWeight:700 }}>{day.label}</td>
            <td><input value={days[day.key].lunch} onChange={e => setMeal(day.key, "lunch", e.target.value)} placeholder="Plato del mediodía" /></td>
            <td><input value={days[day.key].dinner} onChange={e => setMeal(day.key, "dinner", e.target.value)} placeholder="Plato de la noche" /></td>
          </tr>)}</tbody>
        </table></div>}
        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16 }}>
          <button className="btn btn-primary" disabled={saving || loading} onClick={save}><Ico n="check" s={14}/> {saving ? "Guardando…" : "Guardar semana"}</button>
        </div>
      </section>
      <section className="card">
        <h3 style={{ marginBottom:12 }}>Imagen para Instagram</h3>
        <canvas ref={canvasRef} style={{ display:"block", width:"100%", height:"auto", borderRadius:12, border:"1px solid var(--border)" }} />
        <button className="btn btn-secondary" style={{ width:"100%", justifyContent:"center", marginTop:14 }} onClick={download}><Ico n="download" s={14}/> Descargar PNG</button>
        <div style={{ borderTop:"1px solid var(--border)", marginTop:16, paddingTop:16 }}>
          <label className="lbl">Enviar imagen por email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
          <button className="btn btn-primary" style={{ width:"100%", justifyContent:"center", marginTop:10 }} disabled={sending} onClick={sendEmail}><Ico n="mail" s={14}/> {sending ? "Enviando…" : "Enviar menú"}</button>
        </div>
      </section>
    </div>
  </main>;
}
