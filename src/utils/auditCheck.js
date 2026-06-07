/**
 * auditCheck.js — Auditoría semanal automática de integridad de datos.
 *
 * Se ejecuta una vez por semana cuando un admin inicia sesión.
 * Corre 3 queries de control y envía un email si encuentra problemas.
 *
 * Último resultado guardado en localStorage bajo "nutrifree_audit_last".
 */

import emailjs from "@emailjs/browser";
import { supabase } from "../supabase.js";

const SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
const AUDIT_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID; // reutiliza template genérico

const AUDIT_KEY        = "nutrifree_audit_last";
const AUDIT_RESULT_KEY = "nutrifree_audit_result";
const INTERVAL_MS      = 7 * 24 * 60 * 60 * 1000; // 7 días

/** Devuelve true si pasaron más de 7 días desde la última auditoría. */
export function auditIsDue() {
  const last = localStorage.getItem(AUDIT_KEY);
  if (!last) return true;
  return Date.now() - Number(last) >= INTERVAL_MS;
}

/** Guarda el timestamp de la última ejecución y el resultado. */
function saveResult(result) {
  localStorage.setItem(AUDIT_KEY, String(Date.now()));
  localStorage.setItem(AUDIT_RESULT_KEY, JSON.stringify(result));
}

/** Devuelve el último resultado guardado o null. */
export function getLastAuditResult() {
  const raw = localStorage.getItem(AUDIT_RESULT_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Ejecuta las 3 queries de auditoría.
 * Retorna { ok: bool, date: string, issues: { q1, q2, q3 } }
 */
export async function runAudit() {
  // Q1 — Créditos sin cargo de consumo
  const { data: q1 } = await supabase
    .from("account_payments")
    .select("customer_id, sale_id, amount, date")
    .eq("type", "payment")
    .eq("payment_method", "balance")
    .not("sale_id", "is", null);

  // Filtrar los que NO tienen consumo correspondiente (client-side join)
  const { data: allCharges } = await supabase
    .from("account_payments")
    .select("customer_id, amount, date, payment_method, type, sale_id")
    .eq("type", "charge")
    .eq("payment_method", "balance")
    .is("sale_id", null);

  const orphaned = (q1 || []).filter(p =>
    !(allCharges || []).some(
      c => c.customer_id === p.customer_id &&
           c.amount      === p.amount       &&
           c.date        === p.date
    )
  );

  // Q3 — Ventas en cuenta sin cargo en account_payments
  const { data: salesInAccount } = await supabase
    .from("sales")
    .select("id, customer_id, customer_name, total, created_at")
    .eq("payment_method", "account")
    .eq("status", "closed");

  const { data: allSaleCharges } = await supabase
    .from("account_payments")
    .select("sale_id")
    .eq("type", "charge")
    .not("sale_id", "is", null);

  const chargedSaleIds = new Set((allSaleCharges || []).map(c => c.sale_id));
  const uncoveredSales = (salesInAccount || []).filter(s => !chargedSaleIds.has(s.id));

  const date = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  const result = {
    date,
    orphanedCredits: orphaned,
    uncoveredSales,
    ok: orphaned.length === 0 && uncoveredSales.length === 0,
  };

  saveResult(result);
  return result;
}

/** Envía un email de alerta con el resumen de la auditoría (solo si hay problemas). */
export async function sendAuditEmail(result) {
  if (!SERVICE_ID || !AUDIT_TEMPLATE_ID || !PUBLIC_KEY) return;
  if (result.ok) return;

  const lines = [];
  if (result.orphanedCredits.length > 0) {
    lines.push(`⚠️  ${result.orphanedCredits.length} crédito(s) sin cargo de consumo:`);
    result.orphanedCredits.forEach(r =>
      lines.push(`   • cliente ${r.customer_id} — pedido ${r.sale_id} — $${r.amount} — ${r.date}`)
    );
  }
  if (result.uncoveredSales.length > 0) {
    lines.push(`⚠️  ${result.uncoveredSales.length} venta(s) en cuenta sin cargo registrado:`);
    result.uncoveredSales.forEach(s =>
      lines.push(`   • ${s.customer_name} — $${s.total} — ${s.created_at?.slice(0, 10)}`)
    );
  }

  await emailjs.send(SERVICE_ID, AUDIT_TEMPLATE_ID, {
    to_email:       "facundoarroquy.w@gmail.com,garroquy@hotmail.com",
    customer_name:  "Sistema NutriFree",
    payment_method: "Auditoría automática semanal",
    total:          `${result.orphanedCredits.length + result.uncoveredSales.length} problema(s)`,
    items:          lines.join("\n"),
    notes:          `Fecha: ${result.date}`,
    date:           result.date,
  }, PUBLIC_KEY);
}
