/**
 * ImportPage — Importación masiva de datos desde CSV.
 *
 * Permite descargar una plantilla CSV con la estructura correcta para cada
 * entidad (Ingredientes, Productos, Recetas), completar los datos y cargarlos
 * mediante drag & drop o selección de archivo. El sistema procesa el CSV y
 * realiza un upsert (crea o actualiza) en Supabase.
 *
 * Lógica de deduplicación:
 *  - Ingredientes y Productos: se busca por nombre (case-insensitive). Si existe → UPDATE, si no → INSERT.
 *  - Recetas: se agrupa por producto. Se busca el producto por nombre, se
 *    crea/actualiza la receta y se reemplazan sus ingredientes.
 *
 * Props: ingredients, setIngredients, products, setProducts, recipes, setRecipes,
 *        showToast
 */
import { useState, useRef, useCallback } from "react";
import { Ico } from "../shared.jsx";
import { supabase, ingredientToDb, productToDb, recipeToDb, recipeIngredientToDb } from "../supabase.js";

// ─── DEFINICIONES DE PLANTILLAS ──────────────────────────────────────────────

const TEMPLATES = {
  ingredients: {
    label: "Ingredientes",
    icon: "ingredients",
    filename: "plantilla_ingredientes.csv",
    headers: ["nombre", "categoria", "unidad", "stock", "stock_minimo", "costo_unitario", "proveedor", "notas"],
    example: [
      ["Harina de arroz", "Harinas", "g", "1000", "200", "150", "Distribuidora Norte", "Sin TACC"],
      ["Azúcar", "Endulzantes", "g", "500", "100", "80", "", ""],
    ],
    description: "Categorías válidas: Harinas, Lácteos, Grasas/Aceites, Endulzantes, Frutas/Verduras, Especias, Proteínas, Otros",
  },
  products: {
    label: "Productos",
    icon: "products",
    filename: "plantilla_productos.csv",
    headers: ["nombre", "categoria", "precio_minorista", "precio_mayorista", "unidad", "stock", "activo", "descripcion"],
    example: [
      ["Brownie de chocolate", "Panadería", "600", "500", "unidad", "20", "si", "Brownie sin TACC"],
      ["Pan de molde", "Panadería", "900", "750", "unidad", "15", "si", "Pan sin gluten 400g"],
    ],
    description: "El campo 'activo' acepta: si / no. El stock debe ser un número.",
  },
  recipes: {
    label: "Recetas",
    icon: "recipes",
    filename: "plantilla_recetas.csv",
    headers: ["producto", "tiempo_prep", "tiempo_coccion", "rendimiento", "notas", "ingrediente", "cantidad", "unidad_ingrediente"],
    example: [
      ["Brownie de chocolate", "15", "25", "12", "No batir de más", "Harina de arroz", "80", "g"],
      ["Brownie de chocolate", "", "", "", "", "Azúcar", "200", "g"],
      ["Brownie de chocolate", "", "", "", "", "Huevo", "3", "unidad"],
    ],
    description: "Una fila por ingrediente. Repetir el nombre del producto en cada fila. Solo la primera fila necesita los datos de la receta (tiempos, rendimiento, notas).",
  },
};

// ─── CSV UTILS ────────────────────────────────────────────────────────────────

function generateCsv(headers, rows) {
  const escape = v => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(","), ...rows.map(r => r.map(escape).join(","))];
  return lines.join("\n");
}

function downloadCsv(filename, content) {
  const bom = "\uFEFF"; // BOM para compatibilidad con Excel en español
  const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  // Auto-detect delimiter: Excel en locale español/argentino usa ";" en vez de ","
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const delim = semicolonCount > commaCount ? ";" : ",";

  const parseRow = line => {
    const cells = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === delim && !inQ) { cells.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    cells.push(cur.trim());
    return cells;
  };
  const normalizeHeader = h => h
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // quitar acentos
    .replace(/\s+/g, "_")                               // espacios → guiones bajos
    .trim();
  const headers = parseRow(lines[0]).map(normalizeHeader);
  const rows = lines.slice(1).filter(l => l.trim()).map(parseRow);
  return { headers, rows };
}

// ─── LÓGICA DE IMPORTACIÓN ────────────────────────────────────────────────────

async function importIngredients({ rows, headers, existingIngredients, setIngredients, showToast, onProgress }) {
  const idx = k => headers.indexOf(k);
  const get = (row, k) => row[idx(k)] ?? "";

  const required = ["nombre", "categoria", "unidad"];
  for (const k of required) {
    if (idx(k) === -1) throw new Error(`Falta la columna obligatoria: "${k}"`);
  }

  let created = 0, updated = 0, errors = [];
  const updatedIngredients = [...existingIngredients];

  for (let i = 0; i < rows.length; i++) {
    onProgress?.(i + 1, rows.length);
    const row = rows[i];
    const name = get(row, "nombre").trim();
    if (!name) continue;

    const data = {
      name,
      category: get(row, "categoria") || "Otros",
      unit: get(row, "unidad") || "g",
      stock: Number(get(row, "stock")) || 0,
      stockMin: Number(get(row, "stock_minimo")) || 0,
      unitCost: Number(get(row, "costo_unitario")) || 0,
      supplier: get(row, "proveedor") || "",
      notes: get(row, "notas") || "",
    };

    const existing = updatedIngredients.find(ing => ing.name.toLowerCase() === name.toLowerCase());

    if (existing) {
      const updated_data = { ...existing, ...data, id: existing.id };
      const { error } = await supabase.from("ingredients").update(ingredientToDb(updated_data)).eq("id", existing.id);
      if (error) { errors.push(`Fila ${i + 2}: ${error.message}`); continue; }
      const idx2 = updatedIngredients.findIndex(x => x.id === existing.id);
      updatedIngredients[idx2] = updated_data;
      updated++;
    } else {
      const newIngr = { ...data, id: crypto.randomUUID() };
      const { error } = await supabase.from("ingredients").insert(ingredientToDb(newIngr));
      if (error) { errors.push(`Fila ${i + 2}: ${error.message}`); continue; }
      updatedIngredients.push(newIngr);
      created++;
    }
  }

  setIngredients(updatedIngredients);
  return { created, updated, errors };
}

async function importProducts({ rows, headers, existingProducts, setProducts, showToast, onProgress }) {
  const idx = k => headers.indexOf(k);
  const get = (row, k) => row[idx(k)] ?? "";

  if (idx("nombre") === -1) throw new Error('Falta la columna obligatoria: "nombre"');

  let created = 0, updated = 0, errors = [];
  const updatedProducts = [...existingProducts];

  for (let i = 0; i < rows.length; i++) {
    onProgress?.(i + 1, rows.length);
    const row = rows[i];
    const name = get(row, "nombre").trim();
    if (!name) continue;

    const activoStr = get(row, "activo").toLowerCase();
    const active = activoStr === "" || activoStr === "si" || activoStr === "sí" || activoStr === "true" || activoStr === "1";

    const data = {
      name,
      category: get(row, "categoria") || "",
      priceRetail: Number(get(row, "precio_minorista")) || 0,
      priceWholesale: Number(get(row, "precio_mayorista")) || 0,
      unit: get(row, "unidad") || "unidad",
      stock: Number(get(row, "stock")) || 0,
      active,
      description: get(row, "descripcion") || "",
      photo: null,
      kitItems: [],
    };

    const existing = updatedProducts.find(p => p.name.toLowerCase() === name.toLowerCase());

    if (existing) {
      const updated_data = { ...existing, ...data, id: existing.id, kitItems: existing.kitItems, photo: existing.photo };
      const { error } = await supabase.from("products").update(productToDb(updated_data)).eq("id", existing.id);
      if (error) { errors.push(`Fila ${i + 2}: ${error.message}`); continue; }
      const idx2 = updatedProducts.findIndex(x => x.id === existing.id);
      updatedProducts[idx2] = updated_data;
      updated++;
    } else {
      const newProd = { ...data, id: crypto.randomUUID() };
      const { error } = await supabase.from("products").insert(productToDb(newProd));
      if (error) { errors.push(`Fila ${i + 2}: ${error.message}`); continue; }
      updatedProducts.push(newProd);
      created++;
    }
  }

  setProducts(updatedProducts);
  return { created, updated, errors };
}

async function importRecipes({ rows, headers, existingProducts, existingIngredients, existingRecipes, setRecipes, showToast, onProgress }) {
  const idx = k => headers.indexOf(k);
  const get = (row, k) => row[idx(k)] ?? "";

  if (idx("producto") === -1) throw new Error('Falta la columna obligatoria: "producto"');
  if (idx("ingrediente") === -1) throw new Error('Falta la columna obligatoria: "ingrediente"');

  // Agrupar filas por nombre de producto
  const groups = {};
  for (const row of rows) {
    const pName = get(row, "producto").trim();
    if (!pName) continue;
    if (!groups[pName]) groups[pName] = [];
    groups[pName].push(row);
  }

  let created = 0, updated = 0, errors = [];
  const updatedRecipes = [...existingRecipes];
  const groupEntries = Object.entries(groups);

  for (let gi = 0; gi < groupEntries.length; gi++) {
    onProgress?.(gi + 1, groupEntries.length);
    const [productName, productRows] = groupEntries[gi];
    const product = existingProducts.find(p => p.name.toLowerCase() === productName.toLowerCase());
    if (!product) {
      errors.push(`Producto no encontrado: "${productName}" — creá el producto primero.`);
      continue;
    }

    // Datos de la receta (de la primera fila del grupo)
    const firstRow = productRows[0];
    const recipeData = {
      productId: product.id,
      prepTime: Number(get(firstRow, "tiempo_prep")) || 0,
      cookTime: Number(get(firstRow, "tiempo_coccion")) || 0,
      yield: Number(get(firstRow, "rendimiento")) || 1,
      notes: get(firstRow, "notas") || "",
      steps: [],
      minMargin: null,
    };

    // Crear o actualizar la receta
    let recipeId;
    const existingRecipe = updatedRecipes.find(r => r.productId === product.id);

    if (existingRecipe) {
      recipeId = existingRecipe.id;
      const { error } = await supabase.from("recipes")
        .update({ prep_time: recipeData.prepTime, cook_time: recipeData.cookTime, yield: recipeData.yield, notes: recipeData.notes })
        .eq("id", recipeId);
      if (error) { errors.push(`Receta "${productName}": ${error.message}`); continue; }
      updated++;
    } else {
      recipeId = crypto.randomUUID();
      const { error } = await supabase.from("recipes").insert(recipeToDb({ ...recipeData, id: recipeId }));
      if (error) { errors.push(`Receta "${productName}": ${error.message}`); continue; }
      created++;
    }

    // Eliminar ingredientes existentes de la receta y reemplazarlos
    const { error: delErr } = await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
    if (delErr) { errors.push(`Ingredientes "${productName}": ${delErr.message}`); continue; }

    const newIngredients = [];
    for (const row of productRows) {
      const ingName = get(row, "ingrediente").trim();
      if (!ingName) continue;

      const ing = existingIngredients.find(i => i.name.toLowerCase() === ingName.toLowerCase());
      if (!ing) {
        errors.push(`Ingrediente no encontrado: "${ingName}" en receta "${productName}"`);
        continue;
      }

      const qty = Number(get(row, "cantidad")) || 0;
      const unit = get(row, "unidad_ingrediente") || ing.unit;
      const cost = qty * (ing.unitCost || 0);

      const ri = { id: crypto.randomUUID(), recipeId, ingredientId: ing.id, name: ing.name, qty, unit, cost };
      const { error: riErr } = await supabase.from("recipe_ingredients").insert(recipeIngredientToDb(ri, recipeId));
      if (riErr) { errors.push(`Ingrediente "${ingName}": ${riErr.message}`); continue; }
      newIngredients.push(ri);
    }

    // Actualizar estado React
    const fullRecipe = { ...recipeData, id: recipeId, ingredients: newIngredients };
    if (existingRecipe) {
      const idx2 = updatedRecipes.findIndex(r => r.id === recipeId);
      updatedRecipes[idx2] = fullRecipe;
    } else {
      updatedRecipes.push(fullRecipe);
    }
  }

  setRecipes(updatedRecipes);
  return { created, updated, errors };
}

// ─── COMPONENTE DROP ZONE ─────────────────────────────────────────────────────

function DropZone({ onFile, file }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleDrop = useCallback(e => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".csv")) onFile(f);
  }, [onFile]);

  const handleDragOver = e => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);
  const handleChange = e => { const f = e.target.files[0]; if (f) onFile(f); };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current.click()}
      style={{
        border: `2px dashed ${dragging ? "var(--primary)" : "var(--b3)"}`,
        borderRadius: 12,
        padding: "32px 20px",
        textAlign: "center",
        cursor: "pointer",
        background: dragging ? "var(--primary-soft, #f0f4ff)" : "var(--s1)",
        transition: "all .15s",
        userSelect: "none",
      }}
    >
      <input ref={inputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleChange} />
      <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
      {file ? (
        <div>
          <div style={{ fontWeight: 600, color: "var(--t1)", marginBottom: 4 }}>{file.name}</div>
          <div style={{ fontSize: ".78em", color: "var(--t4)" }}>Clic para cambiar archivo</div>
        </div>
      ) : (
        <div>
          <div style={{ fontWeight: 600, color: "var(--t2)", marginBottom: 4 }}>Arrastrá tu CSV aquí</div>
          <div style={{ fontSize: ".78em", color: "var(--t4)" }}>o hacé clic para seleccionar</div>
        </div>
      )}
    </div>
  );
}

// ─── COMPONENTE PREVIEW ───────────────────────────────────────────────────────

function PreviewTable({ headers, rows }) {
  const preview = rows.slice(0, 5);
  return (
    <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid var(--b2)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".78em" }}>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} style={{ padding: "6px 10px", background: "var(--s2)", borderBottom: "1px solid var(--b2)", textAlign: "left", whiteSpace: "nowrap", fontWeight: 600, color: "var(--t3)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--b1)" }}>
              {headers.map((_, j) => (
                <td key={j} style={{ padding: "5px 10px", color: "var(--t2)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row[j] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 5 && (
        <div style={{ padding: "6px 12px", fontSize: ".75em", color: "var(--t4)", background: "var(--s1)" }}>
          ... y {rows.length - 5} fila{rows.length - 5 !== 1 ? "s" : ""} más
        </div>
      )}
    </div>
  );
}

// ─── COMPONENTE RESULTADO ─────────────────────────────────────────────────────

function ResultBanner({ result, onClose }) {
  const hasErrors = result.errors.length > 0;
  return (
    <div style={{ borderRadius: 10, padding: "14px 16px", background: hasErrors && result.created + result.updated === 0 ? "var(--red-soft, #fff1f1)" : "var(--green-soft, #f0faf0)", border: `1px solid ${hasErrors ? "var(--red, #e53935)" : "var(--green, #43a047)"}`, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4, color: hasErrors && result.created + result.updated === 0 ? "var(--red)" : "var(--green)" }}>
            {result.created + result.updated === 0 && hasErrors ? "Error al importar" : "Importación completada"}
          </div>
          <div style={{ fontSize: ".83em", color: "var(--t2)", display: "flex", gap: 16, flexWrap: "wrap" }}>
            {result.created > 0 && <span>✅ {result.created} creado{result.created !== 1 ? "s" : ""}</span>}
            {result.updated > 0 && <span>🔄 {result.updated} actualizado{result.updated !== 1 ? "s" : ""}</span>}
            {result.errors.length > 0 && <span style={{ color: "var(--red)" }}>⚠️ {result.errors.length} error{result.errors.length !== 1 ? "es" : ""}</span>}
          </div>
          {result.errors.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: ".78em", color: "var(--red)" }}>
              {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              {result.errors.length > 5 && <li>... y {result.errors.length - 5} más</li>}
            </ul>
          )}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: "2px 4px", fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>
    </div>
  );
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function ImportPage({ ingredients, setIngredients, products, setProducts, recipes, setRecipes, showToast }) {
  const [activeTab, setActiveTab] = useState("ingredients");
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null); // { headers, rows }
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null); // { current, total }

  const tpl = TEMPLATES[activeTab];

  const switchTab = tab => {
    setActiveTab(tab);
    setFile(null);
    setParsed(null);
    setResult(null);
  };

  const handleDownloadTemplate = () => {
    const csv = generateCsv(tpl.headers, tpl.example);
    downloadCsv(tpl.filename, csv);
  };

  const handleFile = async f => {
    setFile(f);
    setResult(null);
    const text = await f.text();
    const { headers, rows } = parseCsv(text);
    setParsed({ headers, rows });
  };

  const onProgress = (current, total) => setProgress({ current, total });

  const handleImport = async () => {
    if (!parsed || parsed.rows.length === 0) { showToast("No hay datos para importar", "error"); return; }
    setLoading(true);
    setResult(null);
    setProgress({ current: 0, total: parsed.rows.length });
    try {
      let res;
      if (activeTab === "ingredients") {
        res = await importIngredients({ rows: parsed.rows, headers: parsed.headers, existingIngredients: ingredients, setIngredients, showToast, onProgress });
      } else if (activeTab === "products") {
        res = await importProducts({ rows: parsed.rows, headers: parsed.headers, existingProducts: products, setProducts, showToast, onProgress });
      } else {
        res = await importRecipes({ rows: parsed.rows, headers: parsed.headers, existingProducts: products, existingIngredients: ingredients, existingRecipes: recipes, setRecipes, showToast, onProgress });
      }
      setResult(res);
      if (res.created + res.updated > 0) showToast(`Importación exitosa: ${res.created} creados, ${res.updated} actualizados`);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const tabs = [
    { key: "ingredients", label: "Ingredientes", icon: "ingredients" },
    { key: "products",    label: "Productos",    icon: "products" },
    { key: "recipes",     label: "Recetas",      icon: "recipes" },
  ];

  return (
    <div className="page">
      {/* HEADER */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Importar datos</h2>
          <p className="page-sub">Cargá ingredientes, productos o recetas masivamente desde un archivo CSV.</p>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "2px solid var(--b2)", paddingBottom: 0 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            style={{
              padding: "8px 20px",
              border: "none",
              borderBottom: activeTab === t.key ? "2px solid var(--primary)" : "2px solid transparent",
              background: "none",
              cursor: "pointer",
              fontWeight: activeTab === t.key ? 700 : 400,
              color: activeTab === t.key ? "var(--primary)" : "var(--t3)",
              fontSize: ".88em",
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: -2,
              borderRadius: "8px 8px 0 0",
              transition: "color .12s",
            }}
          >
            <Ico n={t.icon} s={14} />
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>

        {/* COLUMNA IZQUIERDA: instrucciones + plantilla */}
        <div className="card" style={{ padding: "20px 22px" }}>
          <div style={{ fontWeight: 700, fontSize: ".95em", marginBottom: 10, color: "var(--t1)" }}>
            1. Descargá la plantilla
          </div>
          <p style={{ fontSize: ".83em", color: "var(--t3)", marginBottom: 12, lineHeight: 1.5 }}>
            Completá los datos en el archivo CSV y respetá el formato de las columnas.
          </p>
          <div style={{ fontSize: ".78em", color: "var(--t4)", background: "var(--s2)", borderRadius: 8, padding: "10px 12px", marginBottom: 16, lineHeight: 1.5 }}>
            {tpl.description}
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: ".75em", fontWeight: 600, color: "var(--t4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".04em" }}>Columnas</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {tpl.headers.map(h => (
                <span key={h} style={{ background: "var(--s3, #eef0f4)", borderRadius: 6, padding: "2px 8px", fontSize: ".75em", fontWeight: 600, color: "var(--t2)", fontFamily: "monospace" }}>
                  {h}
                </span>
              ))}
            </div>
          </div>
          <button className="btn btn-secondary" style={{ width: "100%" }} onClick={handleDownloadTemplate}>
            <Ico n="download" s={14} /> Descargar plantilla CSV
          </button>
        </div>

        {/* COLUMNA DERECHA: upload + preview + import */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: "20px 22px" }}>
            <div style={{ fontWeight: 700, fontSize: ".95em", marginBottom: 10, color: "var(--t1)" }}>
              2. Cargá el archivo
            </div>
            <DropZone onFile={handleFile} file={file} />
          </div>

          {parsed && parsed.rows.length > 0 && (
            <div className="card" style={{ padding: "20px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: ".95em", color: "var(--t1)" }}>
                  3. Revisá y confirmá
                </div>
                <span style={{ fontSize: ".78em", color: "var(--t4)" }}>
                  {parsed.rows.length} fila{parsed.rows.length !== 1 ? "s" : ""} detectada{parsed.rows.length !== 1 ? "s" : ""}
                </span>
              </div>
              <PreviewTable headers={parsed.headers} rows={parsed.rows} />
              <button
                className="btn btn-primary"
                style={{ width: "100%", marginTop: 14 }}
                onClick={handleImport}
                disabled={loading}
              >
                {loading ? "Importando..." : `Importar ${tpl.label}`}
              </button>
              {loading && progress && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75em", color: "var(--t3)", marginBottom: 4 }}>
                    <span>Procesando fila {progress.current} de {progress.total}...</span>
                    <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 4, background: "var(--b2)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      borderRadius: 4,
                      background: "var(--primary)",
                      width: `${(progress.current / progress.total) * 100}%`,
                      transition: "width .15s ease",
                    }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {parsed && parsed.rows.length === 0 && (
            <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--s2)", fontSize: ".83em", color: "var(--t3)" }}>
              El archivo no tiene filas de datos. Verificá que el CSV tenga contenido debajo del encabezado.
            </div>
          )}

          {result && <ResultBanner result={result} onClose={() => setResult(null)} />}
        </div>
      </div>
    </div>
  );
}
