/**
 * ChatWidget.jsx — Widget flotante de ayuda con matching por palabras clave
 */
import { useState, useRef, useEffect } from "react";
import { supabase } from "../supabase.js";

// ─── Algoritmo de matching ────────────────────────────────────────────────────
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function matchQuery(query, entries, threshold = 0.25) {
  const qTokens = normalizeText(query);
  if (!qTokens.length || !entries.length) return null;
  let best = null, bestScore = 0;
  for (const entry of entries) {
    const eTokens = normalizeText(entry.question);
    const matches = qTokens.filter(t => eTokens.some(et => et.includes(t) || t.includes(et)));
    const score = matches.length / Math.max(qTokens.length, eTokens.length);
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  return bestScore >= threshold ? best : null;
}

const FALLBACK = "No tengo en claro eso. Por favor consultá al soporte para más información.";

export default function ChatWidget({ faqEntries, setFaqMissed }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { from: "bot", text: "¡Hola! ¿En qué puedo ayudarte?" }
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);
  const threshold = Number(localStorage.getItem("faqThreshold") || 0.25);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const saveMissed = async (question) => {
    const { data, error } = await supabase
      .from("faq_missed")
      .insert({ question })
      .select()
      .single();
    if (!error && data && setFaqMissed) {
      setFaqMissed(prev => [{ id: data.id, question: data.question, date: data.created_at }, ...prev]);
    }
  };

  const send = () => {
    const q = input.trim();
    if (!q) return;
    const userMsg = { from: "user", text: q };
    const match = matchQuery(q, faqEntries, threshold);
    if (!match) saveMissed(q);
    const botMsg = { from: "bot", text: match ? match.answer : FALLBACK };
    setMessages(prev => [...prev, userMsg, botMsg]);
    setInput("");
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999 }}>
      {/* Panel flotante */}
      {open && (
        <div style={{
          position: "absolute", bottom: 70, right: 0,
          width: 320, height: 480,
          background: "#ffffff", border: "1px solid var(--border)",
          borderRadius: 16, boxShadow: "0 8px 40px rgba(0,0,0,.35)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            background: "var(--green)", color: "white",
            padding: "12px 16px", display: "flex", alignItems: "center", gap: 8,
            fontWeight: 600, fontSize: ".92em", flexShrink: 0,
          }}>
            <span style={{ fontSize: "1.1em" }}>💬</span>
            <span style={{ flex: 1 }}>Centro de ayuda</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: 2, lineHeight: 1, fontSize: "1.1em" }}
            >✕</button>
          </div>

          {/* Mensajes */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 6px" }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: m.from === "user" ? "flex-end" : "flex-start",
                marginBottom: 10,
              }}>
                <div style={{
                  maxWidth: "80%", padding: "8px 12px",
                  borderRadius: m.from === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  background: m.from === "user" ? "var(--green)" : "var(--s2)",
                  color: m.from === "user" ? "white" : "var(--t1)",
                  fontSize: ".85em", lineHeight: 1.45,
                }}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          <div style={{
            padding: "8px 12px", borderTop: "1px solid var(--border)",
            display: "flex", gap: 8, flexShrink: 0,
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Escribí tu pregunta..."
              style={{ flex: 1, fontSize: ".85em" }}
              autoFocus
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={send}
              disabled={!input.trim()}
              style={{ flexShrink: 0 }}
            >
              Enviar
            </button>
          </div>
        </div>
      )}

      {/* Botón flotante */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "var(--green)", color: "white",
          border: "none", cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,.25)",
          fontSize: "1.5em", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "transform .15s",
        }}
        title="Ayuda"
      >
        {open ? "✕" : "?"}
      </button>
    </div>
  );
}
