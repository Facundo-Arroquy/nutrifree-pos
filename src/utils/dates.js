/**
 * Fechas de negocio en horario de Argentina.
 *
 * `created_at` llega de Supabase en UTC ("2026-09-17T00:30:00+00:00"), así que
 * cortarlo con `.slice(0,10)` o usar `toISOString()` corre el día después de
 * las 21 hs. Estas funciones devuelven siempre "YYYY-MM-DD" en hora local AR.
 */

const TZ = "America/Argentina/Buenos_Aires";
const DAY_MS = 86400000;

const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** "YYYY-MM-DD" del instante dado en hora de Argentina. "" si es inválido. */
export function dayKey(value) {
  if (value == null || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Día de hoy en Argentina. */
export const todayKey = (now = new Date()) => dayKey(now);

/** Día de hace `n` días en Argentina. */
export const daysAgoKey = (n, now = new Date()) => dayKey(now.getTime() - n * DAY_MS);

/** Primer día del mes actual en Argentina. */
export const monthStartKey = (now = new Date()) => `${dayKey(now).slice(0, 8)}01`;
