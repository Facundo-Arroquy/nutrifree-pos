/**
 * HelpAdminPage.jsx — CRUD de preguntas frecuentes (FAQ)
 * Solo accesible por admin. Permite crear, editar y eliminar Q&A.
 */
import { useState } from "react";
import { Ico } from "../shared.jsx";
import { supabase } from "../supabase.js";
import { dbToFaqEntry, faqEntryToDb } from "../supabase.js";

const EMPTY = { id: "", question: "", answer: "" };

function loadMissed() {
  try { return JSON.parse(localStorage.getItem("faq_missed") || "[]"); } catch { return []; }
}

export default function HelpAdminPage({ faqEntries, setFaqEntries, showToast }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [missed, setMissed] = useState(loadMissed);
  const [prefillFrom, setPrefillFrom] = useState(null);
  const [threshold, setThreshold] = useState(
    () => Number(localStorage.getItem("faqThreshold") || 0.25)
  );

  const openNew = () => { setForm(EMPTY); setPrefillFrom(null); setModal(true); };
  const openEdit = (e) => { setForm({ ...e }); setPrefillFrom(null); setModal(true); };
  const close = () => { setModal(false); setForm(EMPTY); setPrefillFrom(null); };

  const openFromMissed = (m) => {
    setForm({ ...EMPTY, question: m.question });
    setPrefillFrom(m.id);
    setModal(true);
  };

  const deleteMissed = (id) => {
    const next = missed.filter(m => m.id !== id);
    localStorage.setItem("faq_missed", JSON.stringify(next));
    setMissed(next);
  };

  const clearAllMissed = () => {
    if (!confirm("¿Eliminar todas las preguntas sin respuesta?")) return;
    localStorage.setItem("faq_missed", "[]");
    setMissed([]);
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.question.trim() || !form.answer.trim()) {
      showToast("Completá la pregunta y la respuesta", "error");
      return;
    }
    setSaving(true);
    const isNew = !form.id;
    const entry = { ...form, id: form.id || crypto.randomUUID() };

    const { error } = isNew
      ? await supabase.from("faq_entries").insert(faqEntryToDb(entry))
      : await supabase.from("faq_entries").update(faqEntryToDb(entry)).eq("id", entry.id);

    if (error) { showToast("Error al guardar: " + error.message, "error"); setSaving(false); return; }

    setFaqEntries(prev =>
      isNew
        ? [{ ...entry, createdAt: new Date().toISOString() }, ...prev]
        : prev.map(e => e.id === entry.id ? entry : e)
    );
    if (prefillFrom) deleteMissed(prefillFrom);
    showToast(isNew ? "Entrada creada" : "Entrada actualizada");
    close();
    setSaving(false);
  };

  const del = async (id) => {
    if (!confirm("¿Eliminar esta entrada?")) return;
    const { error } = await supabase.from("faq_entries").delete().eq("id", id);
    if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
    setFaqEntries(prev => prev.filter(e => e.id !== id));
    showToast("Entrada eliminada");
  };

  const saveThreshold = () => {
    const v = Math.max(0.05, Math.min(1, threshold));
    localStorage.setItem("faqThreshold", String(v));
    setThreshold(v);
    showToast("Umbral guardado");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>FAQ / Ayuda</h2>
          <p className="page-subtitle">Preguntas y respuestas del chat de ayuda</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Ico n="plus" s={14}/> Nueva entrada
        </button>
      </div>

      {/* Configuración de umbral */}
      <div className="card" style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <label className="lbl" style={{ margin: 0 }}>Umbral de coincidencia:</label>
        <input
          type="number" min="0.05" max="1" step="0.05"
          value={threshold}
          onChange={e => setThreshold(Number(e.target.value))}
          style={{ width: 80 }}
        />
        <span style={{ fontSize: ".8em", color: "var(--t3)" }}>
          (0.05–1.0 · actual: {Math.round(threshold * 100)}% de palabras coincidentes)
        </span>
        <button className="btn btn-secondary btn-sm" onClick={saveThreshold}>
          <Ico n="check" s={13}/> Guardar umbral
        </button>
      </div>

      {faqEntries.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">💬</div>
          <h3>Sin entradas</h3>
          <p>Creá preguntas y respuestas para el chat de ayuda.</p>
          <button className="btn btn-primary" onClick={openNew}><Ico n="plus" s={14}/> Nueva entrada</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Pregunta</th>
                <th>Respuesta</th>
                <th style={{ width: 90 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {faqEntries.map(e => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 500 }}>{e.question}</td>
                  <td style={{ color: "var(--t3)", fontSize: ".88em" }}>{e.answer}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(e)} title="Editar">
                        <Ico n="edit" s={14}/>
                      </button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => del(e.id)} title="Eliminar">
                        <Ico n="trash" s={14} c="var(--red)"/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Preguntas sin respuesta */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div className="section-title" style={{ margin: 0 }}>
            Preguntas sin respuesta
            {missed.length > 0 && <span className="badge badge-red" style={{ marginLeft: 8 }}>{missed.length}</span>}
          </div>
          {missed.length > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto", color: "var(--red)", fontSize: ".8em" }} onClick={clearAllMissed}>
              Eliminar todas
            </button>
          )}
        </div>

        {missed.length === 0 ? (
          <div style={{ color: "var(--t3)", fontSize: ".85em", padding: "12px 0" }}>
            ✓ No hay preguntas sin respuesta por el momento.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pregunta del usuario</th>
                  <th style={{ width: 120 }}>Fecha</th>
                  <th style={{ width: 130 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {missed.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 500 }}>{m.question}</td>
                    <td style={{ color: "var(--t3)", fontSize: ".82em", whiteSpace: "nowrap" }}>
                      {new Date(m.date).toLocaleDateString("es-AR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openFromMissed(m)}
                          title="Crear respuesta para esta pregunta"
                        >
                          <Ico n="plus" s={12}/> Responder
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => deleteMissed(m.id)}
                          title="Eliminar"
                        >
                          <Ico n="trash" s={13} c="var(--red)"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-bg">
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div className="modal-title">{form.id ? "Editar entrada" : "Nueva entrada"}</div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={close}><Ico n="x" s={18}/></button>
            </div>
            <div className="form-group">
              <label className="lbl">Pregunta *</label>
              <textarea
                rows={3}
                value={form.question}
                onChange={e => set("question", e.target.value)}
                placeholder="¿Cuál es el horario de atención?"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="lbl">Respuesta *</label>
              <textarea
                rows={5}
                value={form.answer}
                onChange={e => set("answer", e.target.value)}
                placeholder="El horario de atención es de lunes a viernes de 9 a 18hs."
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={close}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                <Ico n="check" s={13}/> {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
