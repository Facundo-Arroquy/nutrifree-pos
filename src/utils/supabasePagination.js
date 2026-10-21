export const POSTGREST_PAGE_SIZE = 1000;

/**
 * Ejecuta una consulta PostgREST por páginas hasta recuperar todas las filas.
 * `fetchPage` debe devolver la respuesta de Supabase para el rango inclusivo
 * recibido. Los errores se propagan para evitar usar datos parciales.
 */
export async function fetchAllPages(fetchPage, pageSize = POSTGREST_PAGE_SIZE) {
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;

    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
