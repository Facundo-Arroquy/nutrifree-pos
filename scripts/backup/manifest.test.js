/**
 * Tests del manifiesto de backup.
 *
 * Lo que importa: los totales de control tienen que detectar cualquier cambio
 * de stock o de saldo, porque son la única forma de verificar —al volver de
 * vacaciones— que la base sigue cuadrando.
 */
import { describe, it, expect } from 'vitest';
import {
  contarFilas,
  totalesDeControl,
  construirManifiesto,
  compararManifiestos,
} from './manifest.js';
import { TABLES, SENSITIVE_TABLES } from './tables.js';

const datosDemo = {
  customers: [
    { id: 1, balance: 1000 },
    { id: 2, balance: -250.5 },
    { id: 3, balance: 0 },
  ],
  sales: [
    { id: 1, total: 500, status: 'closed' },
    { id: 2, total: 300, status: 'cancelled' },
  ],
  supplier_payments: [
    { id: 1, amount: 800, type: 'charge' },
    { id: 2, amount: 200, type: 'payment' },
  ],
  account_payments: [{ id: 1, amount: 100 }],
  expenses: [{ id: 1, total: 42.25 }],
  products: [
    { id: 1, stock: 10.5, active: true },
    { id: 2, stock: 4, active: false },
  ],
  ingredients: [{ id: 1, stock: 2.125 }],
};

describe('contarFilas', () => {
  it('devuelve una entrada por cada tabla del inventario', () => {
    const filas = contarFilas(datosDemo);
    expect(Object.keys(filas)).toEqual(TABLES);
  });

  it('cuenta 0 para las tablas ausentes en lugar de romper', () => {
    expect(contarFilas({}).audit_log).toBe(0);
  });

  it('cuenta las filas presentes', () => {
    expect(contarFilas(datosDemo).customers).toBe(3);
  });
});

describe('totalesDeControl', () => {
  const t = totalesDeControl(datosDemo);

  it('separa saldo deudor de saldo a favor', () => {
    expect(t.saldo_clientes_deudor).toBe(1000);
    expect(t.saldo_clientes_favor).toBe(-250.5);
    expect(t.saldo_clientes_total).toBe(749.5);
  });

  it('no cuenta como saldo a los clientes en cero', () => {
    expect(t.clientes_con_saldo).toBe(2);
  });

  it('excluye las ventas canceladas del total operativo', () => {
    expect(t.ventas_total).toBe(800);
    expect(t.ventas_no_canceladas).toBe(500);
  });

  it('separa cargos de pagos en la cuenta de proveedores', () => {
    expect(t.supplier_payments_charges).toBe(800);
    expect(t.supplier_payments_pagos).toBe(200);
    expect(t.supplier_payments_suma).toBe(1000);
  });

  it('suma el stock con tres decimales', () => {
    expect(t.stock_productos_suma).toBe(14.5);
    expect(t.stock_ingredientes_suma).toBe(2.125);
  });

  it('trata el producto sin campo active como activo', () => {
    const { productos_activos } = totalesDeControl({ products: [{ id: 1, stock: 1 }] });
    expect(productos_activos).toBe(1);
  });

  it('devuelve ceros con una base vacía', () => {
    const vacio = totalesDeControl({});
    expect(vacio.saldo_clientes_total).toBe(0);
    expect(vacio.ventas_total).toBe(0);
  });
});

describe('construirManifiesto', () => {
  it('no filtra ninguna fila de las tablas sensibles', () => {
    const m = construirManifiesto({ generado_en: '2026-09-18T00:00:00Z', datos: datosDemo });
    const serializado = JSON.stringify(m);
    for (const tabla of SENSITIVE_TABLES) {
      expect(m.filas_por_tabla).toHaveProperty(tabla);
    }
    // Sólo agregados: ningún id ni valor de fila individual.
    expect(serializado).not.toContain('"id"');
  });

  it('suma el total de filas', () => {
    const m = construirManifiesto({ datos: datosDemo });
    expect(m.filas_totales).toBe(12);
  });

  it('acepta tanto el backup completo como los datos pelados', () => {
    const a = construirManifiesto({ datos: datosDemo });
    const b = construirManifiesto(datosDemo);
    expect(a.totales_de_control).toEqual(b.totales_de_control);
  });
});

describe('compararManifiestos', () => {
  const base = construirManifiesto({ datos: datosDemo });

  it('no reporta diferencias contra sí mismo', () => {
    expect(compararManifiestos(base, base)).toEqual([]);
  });

  it('detecta un saldo de cliente modificado', () => {
    const tocado = construirManifiesto({
      datos: { ...datosDemo, customers: [{ id: 1, balance: 999 }, { id: 2, balance: -250.5 }, { id: 3, balance: 0 }] },
    });
    const difs = compararManifiestos(base, tocado);
    expect(difs).toContainEqual({
      seccion: 'totales_de_control',
      clave: 'saldo_clientes_deudor',
      antes: 1000,
      ahora: 999,
    });
  });

  it('detecta filas borradas', () => {
    const tocado = construirManifiesto({ datos: { ...datosDemo, sales: [] } });
    const difs = compararManifiestos(base, tocado);
    expect(difs.some((d) => d.seccion === 'filas_por_tabla' && d.clave === 'sales')).toBe(true);
  });

  it('detecta stock modificado', () => {
    const tocado = construirManifiesto({
      datos: { ...datosDemo, ingredients: [{ id: 1, stock: 0 }] },
    });
    expect(compararManifiestos(base, tocado)).toContainEqual({
      seccion: 'totales_de_control',
      clave: 'stock_ingredientes_suma',
      antes: 2.125,
      ahora: 0,
    });
  });
});

describe('inventario de tablas', () => {
  it('no tiene duplicados', () => {
    expect(new Set(TABLES).size).toBe(TABLES.length);
  });

  it('marca como sensibles sólo tablas que existen en el inventario', () => {
    for (const t of SENSITIVE_TABLES) expect(TABLES).toContain(t);
  });

  it('ordena los maestros antes que sus movimientos', () => {
    expect(TABLES.indexOf('customers')).toBeLessThan(TABLES.indexOf('sales'));
    expect(TABLES.indexOf('suppliers')).toBeLessThan(TABLES.indexOf('supplier_payments'));
    expect(TABLES.indexOf('recipes')).toBeLessThan(TABLES.indexOf('recipe_ingredients'));
    expect(TABLES.indexOf('products')).toBeLessThan(TABLES.indexOf('stock_movements'));
  });
});
