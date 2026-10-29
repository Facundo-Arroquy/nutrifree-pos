import { useEffect, useRef, useState } from "react";
import { Ico } from "../shared.jsx";
import { supabase } from "../supabase.js";
import { sendWeeklyMenuEmail } from "../utils/emailAlerts.js";
import { invalidEmailRecipients, normalizeEmailRecipients } from "../utils/emailRecipients.js";
import { MEAL_COLUMNS, MENU_TYPES, WEEK_DAYS, emptyWeekDays, mondayOf, normalizeQty, normalizeWeekDays, shiftWeek, weekLabel, weeklyMenuProducts } from "../utils/weeklyMenu.js";
import { canvasToPng, drawWeeklyMenu, loadWeeklyMenuAssets } from "../utils/weeklyMenuImage.js";
import { evaluateWeeklyCostRule } from "../utils/weeklyMenuRules.js";
import { computeWeeklyProduction } from "../utils/weeklyProduction.js";
import { withAutomaticCostTiers } from "../utils/costTier.js";
import CostTierBadge from "../components/CostTierBadge.jsx";
import WeeklyCostRulePanel from "../components/WeeklyCostRulePanel.jsx";
import WeeklyIngredientsPanel from "../components/WeeklyIngredientsPanel.jsx";

const normalizeSearch = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const IMAGE_TYPES = Object.keys(MENU_TYPES);

function MealPicker({ value, options, placeholder, onChange }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => setQuery(value), [value]);

  const matches = options.filter(product => normalizeSearch(product.name).includes(normalizeSearch(query)));
  const selected = options.find(product => product.name === value);
  const choose = product => {
    onChange(product.name);
    setQuery(product.name);
    setOpen(false);
  };

  return <div style={{ position:"relative", minWidth:150 }}>
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
    {selected?.costTier && <div style={{ marginTop:4 }}><CostTierBadge tier={selected.costTier} /></div>}
    {open && <div role="listbox" style={{ position:"absolute", zIndex:20, left:0, right:0, top:"calc(100% + 4px)", maxHeight:380, overflowY:"auto", border:"1px solid var(--border)", borderRadius:8, background:"var(--s1)", boxShadow:"0 10px 28px rgba(0,0,0,.16)" }}>
      {matches.length ? matches.map(product => <button
        type="button"
        role="option"
        aria-selected={product.name === value}
        key={product.id}
        onMouseDown={event => event.preventDefault()}
        onClick={() => choose(product)}
        style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, width:"100%", padding:"9px 11px", border:0, borderBottom:"1px solid var(--border)", background:product.name === value ? "var(--greenlb)" : "transparent", color:"var(--t1)", textAlign:"left", cursor:"pointer" }}
      ><span>{product.name}</span><CostTierBadge tier={product.costTier} style={{ flexShrink:0 }} /></button>) : <div style={{ padding:"10px 11px", color:"var(--t4)", fontSize:".82em" }}>No se encontraron viandas</div>}
    </div>}
  </div>;
}

export default function WeeklyMenuPage({ user, products = [], recipes = [], ingredients = [], showToast, weeklyMenuEmails }) {
  const [weekStart, setWeekStart] = useState(mondayOf());
  const [recordId, setRecordId] = useState("");
  const [days, setDays] = useState(emptyWeekDays);
  const [email, setEmail] = useState(user?.email || "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [assets, setAssets] = useState(null);
  const classicCanvas = useRef(null);
  const ketoCanvas = useRef(null);
  const canvasRefs = { classic: classicCanvas, keto: ketoCanvas };
  const productsWithCostTier = withAutomaticCostTiers(products, recipes, ingredients);
  const mealOptions = weeklyMenuProducts(productsWithCostTier);
  const costRule = evaluateWeeklyCostRule(days, productsWithCostTier);
  const production = computeWeeklyProduction({ days, products, recipes, ingredients });

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

  useEffect(() => { loadWeeklyMenuAssets().then(setAssets); }, []);

  useEffect(() => {
    IMAGE_TYPES.forEach(type => {
      if (canvasRefs[type].current) drawWeeklyMenu(canvasRefs[type].current, weekStart, days, assets, type);
    });
  }, [weekStart, days, loading, assets]);

  // Al quitar un plato se borran también sus unidades a producir.
  const setMeal = (day, meal, value) => setDays(prev => ({
    ...prev,
    [day]: { ...prev[day], [meal]: value, qty: { ...prev[day].qty, ...(value ? {} : { [meal]: "" }) } },
  }));
  const setQty = (day, meal, value) => setDays(prev => ({
    ...prev,
    [day]: { ...prev[day], qty: { ...prev[day].qty, [meal]: normalizeQty(value) } },
  }));

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

  const generateFile = async type => {
    const canvas = canvasRefs[type].current;
    drawWeeklyMenu(canvas, weekStart, days, await loadWeeklyMenuAssets(), type);
    const blob = await canvasToPng(canvas);
    return new File([blob], `${MENU_TYPES[type].filePrefix}-${weekStart}.png`, { type: "image/png" });
  };

  const download = async type => {
    const file = await generateFile(type);
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url; link.download = file.name; link.click();
    URL.revokeObjectURL(url);
  };

  // El correo incluye siempre las imágenes del menú semanal y del menú keto.
  const sendEmail = async () => {
    if (!email.trim()) return showToast("Ingresá un email", "error");
    const invalid = invalidEmailRecipients(email);
    if (invalid.length) return showToast(`Correo inválido: ${invalid.join(", ")}`, "error");
    const recipients = normalizeEmailRecipients(email);
    const types = IMAGE_TYPES;
    setSending(true);
    try {
      const images = [];
      for (const type of types) {
        const file = await generateFile(type);
        const path = `menus/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from("invoices").upload(path, file);
        if (error) throw error;
        const { data } = supabase.storage.from("invoices").getPublicUrl(path);
        images.push({ label: MENU_TYPES[type].title, url: data.publicUrl });
      }
      await sendWeeklyMenuEmail(recipients, weekLabel(weekStart), images);
      showToast(`${types.length > 1 ? "Menús enviados" : "Menú enviado"} a ${recipients} ✓`);
    } catch (error) { showToast(error.message, "error"); }
    finally { setSending(false); }
  };

  return <main className="main">
    <style>{`
      .weekly-menu-grid-row{display:grid;grid-template-columns:90px repeat(${MEAL_COLUMNS.length},minmax(150px,1fr));gap:12px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border)}
      .weekly-menu-grid-row:last-child{border-bottom:0}
      .weekly-menu-qty{width:110px;margin-top:6px;padding:6px 10px;font-size:.84em}
      @media(max-width:1100px){.weekly-menu-layout{grid-template-columns:1fr!important}}
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
    <div className="weekly-menu-layout" style={{ display:"grid", gridTemplateColumns:"minmax(640px,1fr) minmax(300px,.6fr)", gap:20, alignItems:"start" }}>
      <section className="card">
        <h3 style={{ marginBottom:4 }}>Semana del {weekLabel(weekStart)}</h3>
        <p style={{ color:"var(--t4)", fontSize:".82em", marginBottom:6 }}>Buscá y seleccioná una vianda para el almuerzo, la cena y el plato keto de cada día.</p>
        <p style={{ color:"var(--green)", fontSize:".78em", fontWeight:700, marginBottom:18 }}>{mealOptions.length} viandas disponibles</p>
        {!mealOptions.length && !loading && <p style={{ color:"var(--red)", fontSize:".82em", marginBottom:12 }}>No hay productos activos en la categoría Viandas.</p>}
        {loading ? <p>Cargando…</p> : <div style={{ border:"1px solid var(--border)", borderRadius:"var(--r)", background:"var(--s0)", overflow:"visible" }}>
          <div className="weekly-menu-grid-row weekly-menu-grid-head" style={{ color:"var(--t4)", fontSize:".74em", fontWeight:700, textTransform:"uppercase" }}>
            <span>Día</span>{MEAL_COLUMNS.map(col => <span key={col.key}>{col.label}</span>)}
          </div>
          {WEEK_DAYS.map(day => <div className="weekly-menu-grid-row" key={day.key}>
            <div style={{ fontWeight:700 }}>{day.label}</div>
            {MEAL_COLUMNS.map(col => <div key={col.key}>
              <span className="weekly-menu-mobile-label" style={{ display:"none" }}>{col.label}</span>
              <MealPicker value={days[day.key][col.key]} options={mealOptions} onChange={value => setMeal(day.key, col.key, value)} placeholder="Buscar vianda…" />
              <input
                className="weekly-menu-qty"
                type="number" min="0" step="1" inputMode="numeric"
                placeholder="Unidades"
                aria-label={`Unidades a producir: ${day.label}, ${col.label}`}
                value={days[day.key].qty[col.key]}
                disabled={!days[day.key][col.key]}
                onChange={event => setQty(day.key, col.key, event.target.value)}
              />
            </div>)}
          </div>)}
        </div>}
        {!loading && <WeeklyCostRulePanel evaluation={costRule} />}
        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16 }}>
          <button className="btn btn-primary" disabled={saving || loading} onClick={save}><Ico n="check" s={14}/> {saving ? "Guardando…" : "Guardar semana"}</button>
        </div>
      </section>
      <section className="card">
        <h3 style={{ marginBottom:12 }}>Imágenes para Instagram</h3>
        {IMAGE_TYPES.map((type, index) => <div key={type} style={index ? { marginTop:22 } : undefined}>
          <div className="lbl" style={{ marginBottom:6 }}>{MENU_TYPES[type].title}</div>
          <canvas ref={canvasRefs[type]} style={{ display:"block", width:"100%", height:"auto", borderRadius:12, border:"1px solid var(--border)" }} />
          <button className="btn btn-secondary" style={{ width:"100%", justifyContent:"center", marginTop:14 }} onClick={() => download(type)}><Ico n="download" s={14}/> {type === "keto" ? "Descargar PNG keto" : "Descargar PNG"}</button>
        </div>)}
        <div style={{ borderTop:"1px solid var(--border)", marginTop:16, paddingTop:16 }}>
          <label className="lbl">Enviar imágenes por email</label>
          <textarea rows={2} value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com, otro@ejemplo.com" style={{ resize:"vertical" }} />
          <p style={{ color:"var(--t4)", fontSize:".76em", margin:"6px 0 0" }}>Se envían el menú semanal y el menú keto.</p>
          <button className="btn btn-primary" style={{ width:"100%", justifyContent:"center", marginTop:10 }} disabled={sending} onClick={sendEmail}><Ico n="mail" s={14}/> {sending ? "Enviando…" : "Enviar menú"}</button>
        </div>
      </section>
    </div>
    {!loading && <WeeklyIngredientsPanel production={production} weekStart={weekStart} />}
  </main>;
}
