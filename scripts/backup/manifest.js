/**
 * Manifiesto de un backup: conteos y totales de control.
 *
 * Sirve para verificar, al volver de vacaciones, que el stock y los saldos
 * siguen cuadrando: se compara el manifiesto del backup contra el mismo
 * cálculo sobre la base viva. El manifiesto NO contiene datos personales,
 * sólo agregados, así que puede vivir en un repositorio público.
 */
import { TABLES } from './tables.js';

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const sum = (rows, field) => rows.reduce((acc, r) => acc + (Number(r?.[field]) || 0), 0);
const sumWhere = (rows, field, pred) => sum(rows.filter(pred), field);

/** Conteo de filas por tabla, en el orden de restauración. */
export function contarFilas(datos) {
  return Object.fromEntries(TABLES.map((t) => [t, (datos[t] ?? []).length]));
}

/**
 * Totales de control del dinero y el stock. Son los números que tienen que
 * seguir iguales si nadie tocó nada.
 */
export function totalesDeControl(datos) {
  const customers = datos.customers ?? [];
  const sales = datos.sales ?? [];
  const supplierPayments = datos.supplier_payments ?? [];
  const products = datos.products ?? [];
  const ingredients = datos.ingredients ?? [];

  return {
    clientes_con_saldo: customers.filter((c) => Number(c.balance) !== 0).length,
    saldo_clientes_total: round(sum(customers, 'balance')),
    saldo_clientes_deudor: round(sumWhere(customers, 'balance', (c) => Number(c.balance) > 0)),
    saldo_clientes_favor: round(sumWhere(customers, 'balance', (c) => Number(c.balance) < 0)),
    account_payments_suma: round(sum(datos.account_payments ?? [], 'amount')),
    supplier_payments_suma: round(sum(supplierPayments, 'amount')),
    supplier_payments_charges: round(sumWhere(supplierPayments, 'amount', (p) => p.type === 'charge')),
    supplier_payments_pagos: round(sumWhere(supplierPayments, 'amount', (p) => p.type === 'payment')),
    ventas_total: round(sum(sales, 'total')),
    ventas_no_canceladas: round(sumWhere(sales, 'total', (s) => s.status !== 'cancelled')),
    gastos_total: round(sum(datos.expenses ?? [], 'total')),
    stock_productos_suma: round(sum(products, 'stock'), 3),
    productos_activos: products.filter((p) => p.active ?? true).length,
    stock_ingredientes_suma: round(sum(ingredients, 'stock'), 3),
  };
}

/** Manifiesto completo, apto para commitear en un repo público. */
export function construirManifiesto(backup) {
  const datos = backup.datos ?? backup;
  const filas = contarFilas(datos);
  return {
    formato: 'nutrifree-manifiesto/1',
    generado_en: backup.generado_en ?? new Date().toISOString(),
    filas_totales: Object.values(filas).reduce((a, b) => a + b, 0),
    filas_por_tabla: filas,
    totales_de_control: totalesDeControl(datos),
  };
}

/** Compara dos manifiestos y devuelve sólo las diferencias. */
export function compararManifiestos(a, b) {
  const difs = [];
  for (const seccion of ['filas_por_tabla', 'totales_de_control']) {
    const claves = new Set([...Object.keys(a[seccion] ?? {}), ...Object.keys(b[seccion] ?? {})]);
    for (const clave of claves) {
      const antes = a[seccion]?.[clave];
      const ahora = b[seccion]?.[clave];
      if (antes !== ahora) difs.push({ seccion, clave, antes, ahora });
    }
  }
  return difs;
}
