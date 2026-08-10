/**
 * Tests de la detección de ventas duplicadas.
 *
 * Caso que motivó el módulo (Magdalena, agosto 2026):
 *  - 04/08 se cargó un pedido de $42.900 desde el Calendario de Pedidos.
 *  - 07/08 la misma entrega se cargó otra vez desde el POS, a cuenta corriente.
 *  - 10/08 se cobró el pedido en efectivo: la caja cerró bien, pero la deuda de
 *    la cuenta corriente quedó viva porque colgaba de la OTRA venta.
 */
import { describe, it, expect } from "vitest";
import {
  findDuplicateSales,
  duplicateWarning,
  saleStatusLabel,
  shortDate,
  formatAmount,
  DUPLICATE_WINDOW_DAYS,
} from "./duplicateSale.js";

const CLI = "q5e96to";

const venta = (id, extra = {}) => ({
  id,
  customerId: CLI,
  customerName: "Magdalena",
  total: 42900,
  status: "open",
  createdAt: "2026-08-04T14:25:36.000Z",
  ...extra,
});

describe("findDuplicateSales", () => {
  it("encuentra el pedido del Calendario cuando se recarga la misma venta en el POS", () => {
    const pedido = venta("a22j7uw");
    const dups = findDuplicateSales([pedido], {
      customerId: CLI, total: 42900, createdAt: "2026-08-07T16:10:38.000Z",
    });
    expect(dups).toHaveLength(1);
    expect(dups[0].id).toBe("a22j7uw");
  });

  it("ignora la venta que se está editando (mismo id)", () => {
    const pedido = venta("a22j7uw");
    const dups = findDuplicateSales([pedido], { id: "a22j7uw", customerId: CLI, total: 42900 });
    expect(dups).toEqual([]);
  });

  it("no marca ventas de otro cliente", () => {
    const otro = venta("x1", { customerId: "otro" });
    expect(findDuplicateSales([otro], { customerId: CLI, total: 42900 })).toEqual([]);
  });

  it("no marca ventas por otro monto", () => {
    const dups = findDuplicateSales([venta("x1", { total: 42800 })], { customerId: CLI, total: 42900 });
    expect(dups).toEqual([]);
  });

  it("no marca pedidos cancelados", () => {
    const dups = findDuplicateSales([venta("x1", { status: "cancelled" })], { customerId: CLI, total: 42900 });
    expect(dups).toEqual([]);
  });

  it("no compara ventas anónimas: sin cliente no hay forma de distinguirlas", () => {
    const anon = venta("x1", { customerId: null, customerName: "Anónimo" });
    expect(findDuplicateSales([anon], { customerId: null, total: 42900 })).toEqual([]);
  });

  it("no alerta si el total es cero", () => {
    expect(findDuplicateSales([venta("x1", { total: 0 })], { customerId: CLI, total: 0 })).toEqual([]);
  });

  it("respeta la ventana de días", () => {
    const vieja = venta("x1", { createdAt: "2026-07-01T14:00:00.000Z" });
    const cand = { customerId: CLI, total: 42900, createdAt: "2026-08-07T16:10:00.000Z" };
    expect(findDuplicateSales([vieja], cand)).toEqual([]);
    expect(findDuplicateSales([vieja], cand, { windowDays: 60 })).toHaveLength(1);
  });

  it("compara hacia atrás y hacia adelante dentro de la ventana", () => {
    const posterior = venta("x1", { createdAt: "2026-08-09T14:00:00.000Z" });
    const dups = findDuplicateSales([posterior], {
      customerId: CLI, total: 42900, createdAt: "2026-08-07T16:10:00.000Z",
    });
    expect(dups).toHaveLength(1);
  });

  it("devuelve las coincidencias de la más reciente a la más vieja", () => {
    const sales = [
      venta("vieja", { createdAt: "2026-08-04T14:00:00.000Z" }),
      venta("nueva", { createdAt: "2026-08-06T14:00:00.000Z" }),
    ];
    const dups = findDuplicateSales(sales, {
      customerId: CLI, total: 42900, createdAt: "2026-08-07T16:10:00.000Z",
    });
    expect(dups.map(d => d.id)).toEqual(["nueva", "vieja"]);
  });

  it("tolera entradas rotas: lista vacía, nulls y fechas inválidas", () => {
    expect(findDuplicateSales(null, { customerId: CLI, total: 1 })).toEqual([]);
    expect(findDuplicateSales([null, venta("x1", { createdAt: "no-es-fecha" })], { customerId: CLI, total: 42900 })).toEqual([]);
    expect(findDuplicateSales([venta("x1")], null)).toEqual([]);
  });

  it("la ventana por defecto cubre los 3 días del caso Magdalena", () => {
    expect(DUPLICATE_WINDOW_DAYS).toBeGreaterThanOrEqual(3);
  });
});

describe("duplicateWarning", () => {
  it("devuelve null cuando no hay duplicados", () => {
    expect(duplicateWarning([], "Magdalena")).toBeNull();
    expect(duplicateWarning(null)).toBeNull();
  });

  it("nombra al cliente, el monto, la fecha y el estado del pedido anterior", () => {
    const msg = duplicateWarning([venta("a22j7uw")], "Magdalena");
    expect(msg).toContain("Magdalena");
    expect(msg).toContain("42.900");
    expect(msg).toContain("04/08");
    expect(msg).toContain("pedido pendiente");
  });

  it("avisa cuántas coincidencias más hay", () => {
    const msg = duplicateWarning([venta("a"), venta("b"), venta("c")], "Magdalena");
    expect(msg).toContain("y 2 más");
  });
});

describe("helpers de formato", () => {
  it("saleStatusLabel traduce los estados conocidos y deja pasar los raros", () => {
    expect(saleStatusLabel("ready")).toBe("pedido listo para retirar");
    expect(saleStatusLabel("closed")).toBe("venta cerrada");
    expect(saleStatusLabel("marciano")).toBe("marciano");
    expect(saleStatusLabel(undefined)).toBe("venta");
  });

  it("shortDate devuelve DD/MM y string vacío si la fecha no sirve", () => {
    expect(shortDate("2026-08-04T14:25:36.000Z")).toMatch(/^\d{2}\/\d{2}$/);
    expect(shortDate("cualquier cosa")).toBe("");
    expect(shortDate(null)).toBe("");
  });

  it("formatAmount redondea a centavos", () => {
    expect(formatAmount(42900)).toContain("42.900");
    expect(formatAmount(10.005)).toBe("$10,01");
  });
});
