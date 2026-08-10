/**
 * Tests del parseo de montos de formulario.
 *
 * Regresión principal: pagar la deuda exacta de un proveedor con decimales
 * ("117705.39") se leía como 11.770.539 y dejaba $11.652.834 "a favor del
 * proveedor" en vez de saldar la cuenta.
 */
import { describe, it, expect } from "vitest";
import { parseMoneyInput } from "./money.js";
import { allocatePayment } from "./supplierAccount.js";

describe("parseMoneyInput", () => {
  it("lee el punto como separador decimal (formato de input type=number)", () => {
    expect(parseMoneyInput("117705.39")).toBe(117705.39);
    expect(parseMoneyInput("0.5")).toBe(0.5);
  });

  it("no interpreta el punto como separador de miles", () => {
    expect(parseMoneyInput("1234.5")).toBe(1234.5);
    expect(parseMoneyInput("1000.00")).toBe(1000);
  });

  it("acepta enteros y números ya parseados", () => {
    expect(parseMoneyInput("117705")).toBe(117705);
    expect(parseMoneyInput(117705.39)).toBe(117705.39);
  });

  it("tolera la coma decimal", () => {
    expect(parseMoneyInput("117705,39")).toBe(117705.39);
  });

  it("devuelve 0 con vacío o basura", () => {
    expect(parseMoneyInput("")).toBe(0);
    expect(parseMoneyInput("   ")).toBe(0);
    expect(parseMoneyInput(null)).toBe(0);
    expect(parseMoneyInput(undefined)).toBe(0);
    expect(parseMoneyInput("abc")).toBe(0);
    expect(parseMoneyInput("1.2.3")).toBe(0);
    expect(parseMoneyInput(NaN)).toBe(0);
  });
});

describe("pagar la deuda exacta con decimales", () => {
  const supplierId = "prov-1";
  const expense = { id: "g1", supplierId, date: "2026-07-30", total: 117705.39, paymentStatus: "pending" };
  const movements = [
    { id: "m1", supplierId, expenseId: "g1", amount: 117705.39, type: "charge", date: "2026-07-30" },
  ];

  it("salda el gasto y no deja saldo a favor", () => {
    const monto = parseMoneyInput("117705.39");
    const res = allocatePayment({ expenses: [expense], movements, supplierId, amount: monto });

    expect(res.cashUsed).toBe(117705.39);
    expect(res.leftover).toBe(0);
    expect(res.allocations[0].newRemaining).toBe(0);
  });
});
