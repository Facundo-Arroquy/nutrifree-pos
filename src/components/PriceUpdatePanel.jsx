/**
 * PriceUpdatePanel — Actualización masiva de precios por planilla.
 *
 * A diferencia del resto de la importación (que trabaja con plantillas vacías),
 * acá la planilla se genera CON los productos ya cargados. El usuario edita solo
 * las columnas de precio y vuelve a subir el mismo archivo.
 *
 * Garantía: el importador únicamente escribe `price_retail` / `price_wholesale`.
 * Aunque alguien edite el nombre, la categoría o agregue columnas, esos datos se
 * ignoran — no se puede pisar stock ni crear productos duplicados desde acá.
 *
 * Props: products, setProducts, showToast
 */
import { useState, useRef, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { Ico } from "../shared.jsx";
import { supabase } from "../supabase.js";
import {
  buildPriceSheet,
  parsePriceSheet,
  diffPriceRows,
  changeToDbPatch,
  applyChangeToProduct,
} from "../utils/priceImport.js";

const FILENAME = "precios_nutrifree";

const fmtMoney = n =>
  "$" + Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const pctChange = (from, to) => {
  if (!from) return null;
  return ((to - from) / from) * 100;
};

// ─── ARCHIVO ──────────────────────────────────────────────────────────────────

/** Genera y descarga el .xlsx con los productos actuales. */
function downloadPriceSheet(products, { onlyActive }) {
  const matrix = buildPriceSheet(products, { onlyActive });
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  ws["!cols"] = [{ wch: 38 }, { wch: 34 }, { wch: 18 }, { wch: 16 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Precios");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${FILENAME}_${stamp}.xlsx`);
  return matrix.length - 1;
}

/** Lee un .xlsx/.xls/.csv y devuelve la matriz de celdas (fila 0 = encabezado). */
async function readSheetFile(file) {
  const isCsv = /\.csv$/i.test(file.name);
  let wb;

  if (isCsv) {
    const text = await file.text();
    // Excel en locale es-AR guarda CSV con ";" como separador.
    const firstLine = text.split(/\r?\n/)[0] || "";
    const FS = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
    wb = XLSX.read(text, { type: "string", FS, raw: true });
  } else {
    wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "", blankrows: false });
}

// ─── DROP ZONE ────────────────────────────────────────────────────────────────

function SheetDropZone({ onFile, file }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();
  const isValid = f => /\.(xlsx|xls|csv)$/i.test(f.name);

  const handleDrop = useCallback(e => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && isValid(f)) onFile(f);
  }, [onFile]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onClick={() => inputRef.current.click()}
      style={{
        border: `2px dashed ${dragging ? "var(--primary)" : "var(--b3)"}`,
        borderRadius: 12,
        padding: "28px 20px",
        textAlign: "center",
        cursor: "pointer",
        background: dragging ? "var(--primary-soft, #f0f4ff)" : "var(--s1)",
        transition: "all .15s",
        userSelect: "none",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: "none" }}
        onChange={e => { const f = e.target.files[0]; if (f) onFile(f); }}
      />
      <div style={{ fontSize: 26, marginBottom: 8 }}>📊</div>
      {file ? (
        <div>
          <div style={{ fontWeight: 600, color: "var(--t1)", marginBottom: 4 }}>{file.name}</div>
          <div style={{ fontSize: ".78em", color: "var(--t4)" }}>Clic para cambiar archivo</div>
        </div>
      ) : (
        <div>
          <div style={{ fontWeight: 600, color: "var(--t2)", marginBottom: 4 }}>Arrastrá la planilla editada</div>
          <div style={{ fontSize: ".78em", color: "var(--t4)" }}>.xlsx, .xls o .csv</div>
        </div>
      )}
    </div>
  );
}

// ─── TABLA DE CAMBIOS ─────────────────────────────────────────────────────────

function PriceCell({ delta }) {
  if (!delta) return <span style={{ color: "var(--t4)" }}>—</span>;
  const pct = pctChange(delta.from, delta.to);
  const up = delta.to > delta.from;
  const color = up ? "var(--green, #43a047)" : "var(--red, #e53935)";
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <span style={{ color: "var(--t4)", textDecoration: "line-through" }}>{fmtMoney(delta.from)}</span>
      <span style={{ color: "var(--t4)", margin: "0 5px" }}>→</span>
      <strong style={{ color }}>{fmtMoney(delta.to)}</strong>
      {pct !== null && (
        <span style={{ color, fontSize: ".85em", marginLeft: 5 }}>
          ({up ? "+" : ""}{pct.toFixed(1)}%)
        </span>
      )}
    </span>
  );
}

function ChangesTable({ changes }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? changes : changes.slice(0, 15);

  return (
    <div>
      <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid var(--b2)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8em" }}>
          <thead>
            <tr>
              {["Producto", "Minorista", "Mayorista"].map(h => (
                <th key={h} style={{ padding: "7px 10px", background: "var(--s2)", borderBottom: "1px solid var(--b2)", textAlign: "left", fontWeight: 600, color: "var(--t3)", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(c => (
              <tr key={c.id} style={{ borderBottom: "1px solid var(--b1)" }}>
                <td style={{ padding: "6px 10px", color: "var(--t1)", fontWeight: 500 }}>{c.name}</td>
                <td style={{ padding: "6px 10px" }}><PriceCell delta={c.retail} /></td>
                <td style={{ padding: "6px 10px" }}><PriceCell delta={c.wholesale} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {changes.length > 15 && (
        <button
          onClick={() => setShowAll(v => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: ".78em", padding: "6px 2px", fontWeight: 600 }}
        >
          {showAll ? "Ver menos" : `Ver los ${changes.length - 15} cambios restantes`}
        </button>
      )}
    </div>
  );
}

// ─── PANEL ────────────────────────────────────────────────────────────────────

export default function PriceUpdatePanel({ products, setProducts, showToast }) {
  const [onlyActive, setOnlyActive] = useState(true);
  const [file, setFile] = useState(null);
  const [diff, setDiff] = useState(null);       // { changes, unchanged, errors }
  const [sheetError, setSheetError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  const exportCount = useMemo(
    () => (products || []).filter(p => (onlyActive ? p.active !== false : true)).length,
    [products, onlyActive]
  );

  const reset = () => { setFile(null); setDiff(null); setSheetError(null); setResult(null); };

  const handleDownload = () => {
    if (!products?.length) { showToast("No hay productos para exportar", "error"); return; }
    const n = downloadPriceSheet(products, { onlyActive });
    showToast(`Planilla descargada con ${n} producto${n !== 1 ? "s" : ""}`);
  };

  const handleFile = async f => {
    setFile(f);
    setResult(null);
    setSheetError(null);
    setDiff(null);
    try {
      const matrix = await readSheetFile(f);
      const { rows, missing } = parsePriceSheet(matrix);
      if (missing.length) {
        setSheetError(
          `A la planilla le faltan columnas: ${missing.join(", ")}. ` +
          `Usá el archivo descargado desde acá, sin borrar ni renombrar columnas.`
        );
        return;
      }
      if (!rows.length) {
        setSheetError("La planilla no tiene filas de datos debajo del encabezado.");
        return;
      }
      setDiff(diffPriceRows(rows, products));
    } catch (err) {
      setSheetError(`No se pudo leer el archivo: ${err.message}`);
    }
  };

  const handleApply = async () => {
    if (!diff?.changes.length) return;
    setLoading(true);
    setResult(null);

    // Agrupamos por patch idéntico (ej. "todos a $1.200") para hacer un update
    // por grupo en vez de uno por producto.
    const groups = new Map();
    for (const c of diff.changes) {
      const patch = changeToDbPatch(c);
      const key = JSON.stringify(patch);
      if (!groups.has(key)) groups.set(key, { patch, ids: [] });
      groups.get(key).ids.push(c.id);
    }

    const entries = [...groups.values()];
    const errors = [];
    const okIds = new Set();
    let done = 0;
    setProgress({ current: 0, total: entries.length });

    for (const { patch, ids } of entries) {
      const { error } = await supabase.from("products").update(patch).in("id", ids);
      if (error) errors.push(`${ids.length} producto(s): ${error.message}`);
      else ids.forEach(id => okIds.add(id));
      setProgress({ current: ++done, total: entries.length });
    }

    if (okIds.size) {
      const byId = new Map(diff.changes.map(c => [c.id, c]));
      setProducts(products.map(p => (okIds.has(p.id) ? applyChangeToProduct(p, byId.get(p.id)) : p)));
    }

    setResult({ updated: okIds.size, errors });
    setLoading(false);
    setProgress(null);
    if (okIds.size) showToast(`${okIds.size} precio${okIds.size !== 1 ? "s" : ""} actualizado${okIds.size !== 1 ? "s" : ""}`);
    if (errors.length && !okIds.size) showToast("No se pudo actualizar ningún precio", "error");
  };

  return (
    <div className="import-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>

      {/* IZQUIERDA: descarga */}
      <div className="card" style={{ padding: "20px 22px" }}>
        <div style={{ fontWeight: 700, fontSize: ".95em", marginBottom: 10, color: "var(--t1)" }}>
          1. Descargá tus precios actuales
        </div>
        <p style={{ fontSize: ".83em", color: "var(--t3)", marginBottom: 12, lineHeight: 1.5 }}>
          La planilla baja con todos los productos ya cargados y sus precios de hoy.
          Editá <strong>solo</strong> las columnas <code>precio_minorista</code> y <code>precio_mayorista</code>, guardá y volvé a subirla.
        </p>

        <div style={{ fontSize: ".78em", color: "var(--t4)", background: "var(--s2)", borderRadius: 8, padding: "10px 12px", marginBottom: 14, lineHeight: 1.6 }}>
          <div style={{ marginBottom: 6 }}>⚠️ <strong>No borres ni cambies la columna <code>id</code></strong>: es la que vincula cada fila con su producto.</div>
          <div>Los cambios en <code>producto</code> y <code>categoria</code> se ignoran. Esta pantalla nunca modifica stock, descripción ni el estado activo/inactivo.</div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".83em", color: "var(--t2)", marginBottom: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={onlyActive} onChange={e => { setOnlyActive(e.target.checked); }} />
          Solo productos activos
          <span style={{ color: "var(--t4)" }}>({exportCount})</span>
        </label>

        <button className="btn btn-secondary" style={{ width: "100%" }} onClick={handleDownload}>
          <Ico n="download" s={14} /> Descargar planilla de precios
        </button>
      </div>

      {/* DERECHA: carga + revisión */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="card" style={{ padding: "20px 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: ".95em", color: "var(--t1)" }}>2. Subí la planilla editada</div>
            {file && (
              <button onClick={reset} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: ".78em" }}>
                Limpiar
              </button>
            )}
          </div>
          <SheetDropZone onFile={handleFile} file={file} />
        </div>

        {sheetError && (
          <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--red-soft, #fff1f1)", border: "1px solid var(--red, #e53935)", fontSize: ".82em", color: "var(--red, #e53935)", lineHeight: 1.5 }}>
            {sheetError}
          </div>
        )}

        {diff && (
          <div className="card" style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, fontSize: ".95em", color: "var(--t1)" }}>3. Revisá los cambios</div>
              <div style={{ fontSize: ".78em", color: "var(--t4)", display: "flex", gap: 12 }}>
                <span><strong style={{ color: "var(--t2)" }}>{diff.changes.length}</strong> con cambios</span>
                <span>{diff.unchanged} sin cambios</span>
              </div>
            </div>

            {diff.errors.length > 0 && (
              <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: ".78em", color: "var(--red, #e53935)", lineHeight: 1.5 }}>
                {diff.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                {diff.errors.length > 5 && <li>... y {diff.errors.length - 5} más</li>}
              </ul>
            )}

            {diff.changes.length > 0 ? (
              <>
                <ChangesTable changes={diff.changes} />
                <button className="btn btn-primary" style={{ width: "100%", marginTop: 14 }} onClick={handleApply} disabled={loading}>
                  {loading
                    ? "Actualizando..."
                    : `Actualizar ${diff.changes.length} precio${diff.changes.length !== 1 ? "s" : ""}`}
                </button>
                {loading && progress && (
                  <div style={{ marginTop: 10, height: 6, borderRadius: 4, background: "var(--b2)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 4, background: "var(--primary)", width: `${(progress.current / progress.total) * 100}%`, transition: "width .15s ease" }} />
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: ".83em", color: "var(--t3)" }}>
                No hay diferencias de precio entre la planilla y lo que está cargado.
              </div>
            )}
          </div>
        )}

        {result && (
          <div style={{ borderRadius: 10, padding: "14px 16px", background: result.updated ? "var(--green-soft, #f0faf0)" : "var(--red-soft, #fff1f1)", border: `1px solid ${result.updated ? "var(--green, #43a047)" : "var(--red, #e53935)"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4, color: result.updated ? "var(--green, #43a047)" : "var(--red, #e53935)" }}>
                  {result.updated ? "Precios actualizados" : "No se aplicaron cambios"}
                </div>
                <div style={{ fontSize: ".83em", color: "var(--t2)" }}>
                  ✅ {result.updated} producto{result.updated !== 1 ? "s" : ""} actualizado{result.updated !== 1 ? "s" : ""}
                </div>
                {result.errors.length > 0 && (
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: ".78em", color: "var(--red, #e53935)" }}>
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
              <button onClick={() => setResult(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: "2px 4px", fontSize: 16, lineHeight: 1 }}>✕</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
