import { useEffect, useRef, useState } from "react";
import { Ico } from "../shared.jsx";
import { supabase } from "../supabase.js";
import { sendWeeklyMenuEmail } from "../utils/emailAlerts.js";
import { invalidEmailRecipients, normalizeEmailRecipients } from "../utils/emailRecipients.js";
import { WEEK_DAYS, canvasToPng, drawWeeklyMenu, emptyWeekDays, mondayOf, normalizeWeekDays, shiftWeek, weekLabel, weeklyMenuProducts } from "../utils/weeklyMenu.js";

const normalizeSearch = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function MealPicker({ value, options, placeholder, onChange }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => setQuery(value), [value]);

  const matches = options.filter(product => normalizeSearch(product.name).includes(normalizeSearch(query)));
  const choose = product => {
    onChange(product.name);
    setQuery(product.name);
    setOpen(false);
  };

  return <div style={{ position:"relative", minWidth:190 }}>
    <div style={{ position:"relative" }}>
      <input
        value={query}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={event => { setQuery(event.target.value); setOpen(true); }}
        onBlur={() => window.setTimeout(() => { setOpen(false); setQuery(value); }, 120)}
        onKeyDown={event => {
          if (event.key === "Enter" && matches.length) { event.preventDefault(); choose(matches[0]); }
          if (event.key === "Escape") { setOpen(false); setQuery(value); }
        }}
        style={{ paddingRight:value ? 32 : 12 }}
      />
      {value && <button
        type="button"
        aria-label="Quitar plato"
        onMouseDown={event => event.preventDefault()}
        onClick={() => { onChange(""); setQuery(""); setOpen(true); }}
        style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", border:0, background:"transparent", color:"var(--t4)", cursor:"pointer", fontSize:18 }}
      >×</button>}
    </div>
    {open && <div role="listbox" style={{ position:"absolute", zIndex:20, left:0, right:0, top:"calc(100% + 4px)", maxHeight:380, overflowY:"auto", border:"1px solid var(--border)", borderRadius:8, background:"var(--s1)", boxShadow:"0 10px 28px rgba(0,0,0,.16)" }}>
      {matches.length ? matches.map(product => <button
        type="button"
        role="option"
        aria-selected={product.name === value}
        key={product.id}
        onMouseDown={event => event.preventDefault()}
        onClick={() => choose(product)}
        style={{ display:"block", width:"100%", padding:"9px 11px", border:0, borderBottom:"1px solid var(--border)", background:product.name === value ? "var(--greenlb)" : "transparent", color:"var(--t1)", textAlign:"left", cursor:"pointer" }}
      >{product.name}</button>) : <div style={{ padding:"10px 11px", color:"var(--t4)", fontSize:".82em" }}>No se encontraron viandas</div>}
    </div>}
  </div>;
}

export default function WeeklyMenuPage({ user, products = [], showToast, weeklyMenuEmails }) {
  const [weekStart, setWeekStart] = useState(mondayOf());
  const [recordId, setRecordId] = useState("");
  const [days, setDays] = useState(emptyWeekDays);
  const [email, setEmail] = useState(user?.email || "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const canvasRef = useRef(null);
  const mealOptions = weeklyMenuProducts(products);

  useEffect(() => {
    setEmail(weeklyMenuEmails || user?.email || "");
  }, [weeklyMenuEmails, user?.email]);

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
    const invalid = invalidEmailRecipients(email);
    if (invalid.length) return showToast(`Correo inválido: ${invalid.join(", ")}`, "error");
    const recipients = normalizeEmailRecipients(email);
    setSending(true);
    try {
      const file = await generateFile();
      const path = `menus/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("invoices").upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from("invoices").getPublicUrl(path);
      await sendWeeklyMenuEmail(recipients, weekLabel(weekStart), data.publicUrl);
      showToast(`Menú enviado a ${recipients} ✓`);
    } catch (error) { showToast(error.message, "error"); }
    finally { setSending(false); }
  };

  return <main className="main">
    <style>{`
      .weekly-menu-grid-row{display:grid;grid-template-columns:110px minmax(190px,1fr) minmax(190px,1fr);gap:12px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border)}
      .weekly-menu-grid-row:last-child{border-bottom:0}
      @media(max-width:1000px){.weekly-menu-layout{grid-template-columns:1fr!important}}
      @media(max-width:680px){.weekly-menu-grid-row{grid-template-columns:1fr;padding:14px}.weekly-menu-grid-head{display:none}.weekly-menu-mobile-label{display:block!important;font-size:.7em;font-weight:700;color:var(--t4);text-transform:uppercase;margin-bottom:4px}}
    `}</style>
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
        <p style={{ color:"var(--t4)", fontSize:".82em", marginBottom:6 }}>Buscá y seleccioná una vianda para el almuerzo y la cena de cada día.</p>
        <p style={{ color:"var(--green)", fontSize:".78em", fontWeight:700, marginBottom:18 }}>{mealOptions.length} viandas disponibles</p>
        {!mealOptions.length && !loading && <p style={{ color:"var(--red)", fontSize:".82em", marginBottom:12 }}>No hay productos activos en la categoría Viandas.</p>}
        {loading ? <p>Cargando…</p> : <div style={{ border:"1px solid var(--border)", borderRadius:"var(--r)", background:"var(--s0)", overflow:"visible" }}>
          <div className="weekly-menu-grid-row weekly-menu-grid-head" style={{ color:"var(--t4)", fontSize:".74em", fontWeight:700, textTransform:"uppercase" }}>
            <span>Día</span><span>Almuerzo</span><span>Cena</span>
          </div>
          {WEEK_DAYS.map(day => <div className="weekly-menu-grid-row" key={day.key}>
            <div style={{ fontWeight:700 }}>{day.label}</div>
            <div><span className="weekly-menu-mobile-label" style={{ display:"none" }}>Almuerzo</span><MealPicker value={days[day.key].lunch} options={mealOptions} onChange={value => setMeal(day.key, "lunch", value)} placeholder="Buscar vianda…" /></div>
            <div><span className="weekly-menu-mobile-label" style={{ display:"none" }}>Cena</span><MealPicker value={days[day.key].dinner} options={mealOptions} onChange={value => setMeal(day.key, "dinner", value)} placeholder="Buscar vianda…" /></div>
          </div>)}
        </div>}
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
          <textarea rows={2} value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com, otro@ejemplo.com" style={{ resize:"vertical" }} />
          <button className="btn btn-primary" style={{ width:"100%", justifyContent:"center", marginTop:10 }} disabled={sending} onClick={sendEmail}><Ico n="mail" s={14}/> {sending ? "Enviando…" : "Enviar menú"}</button>
        </div>
      </section>
    </div>
  </main>;
}
