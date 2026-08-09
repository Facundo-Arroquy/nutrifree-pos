/**
 * Tests de la cuenta corriente de proveedores.
 *
 * Cubren los bugs que motivaron centralizar la lógica acá:
 *  1. Pagos manuales en Proveedores que bajaban el saldo pero dejaban los
 *     gastos en "Pendiente" (deuda contada dos veces).
 *  2. Falta de pagos parciales: un gasto sólo podía estar pendiente o pagado.
 *  3. Saldos "a favor" falsos por pagos sin cargo que los respalde.
 *  4. Imputación FIFO: el pago salda primero el gasto más viejo.
 */
import { describe, it, expect } from "vitest";
import {
  supplierBalance,
  supplierDebt,
  availableCredit,
  expensePaid,
  expensePaidAmount,
  expenseRemaining,
  hasLedger,
  expenseStatus,
  unpaidSupplierExpenses,
  allocatePayment,
  buildPaymentMovements,
  planExpenseLedger,
  expenseStatusUpdates,
  CREDIT_METHOD,
} from "./supplierAccount.js";

const SUP = "sup-1";

const gasto = (id, total, date, extra = {}) => ({
  id, total, date, supplierId: SUP, concept: `Gasto ${id}`, paymentStatus: "pending", ...extra,
});
// El cargo nace espejado del gasto: misma fecha y mismo concepto.
const cargo = (expenseId, amount, date = "2026-03-01") => ({
  id: `c-${expenseId}`, supplierId: SUP, expenseId, amount, type: "charge", paymentMethod: null, date, notes: `Gasto ${expenseId}`,
});
const pago = (expenseId, amount, extra = {}) => ({
  id: `p-${expenseId}-${amount}`, supplierId: SUP, expenseId, amount, type: "payment", paymentMethod: "cash", date: "2026-01-01", ...extra,
});

// Generador de ids determinista para poder afirmar sobre las filas generadas.
const seqId = () => { let n = 0; return () => `id-${++n}`; };

describe("saldos del proveedor", () => {
  it("resta cargos y suma pagos", () => {
    const movs = [cargo("g1", 50000), cargo("g2", 50000), pago("g1", 50000)];
    expect(supplierBalance(movs, SUP)).toBe(-50000);
    expect(supplierDebt(movs, SUP)).toBe(50000);
  });

  it("ignora movimientos de otros proveedores", () => {
    const movs = [cargo("g1", 50000), { ...cargo("g9", 99999), supplierId: "otro" }];
    expect(supplierDebt(movs, SUP)).toBe(50000);
  });

  it("devuelve saldo a favor cuando se pagó de más", () => {
    const movs = [cargo("g1", 50000), pago("g1", 50000), pago(null, 20000)];
    expect(supplierBalance(movs, SUP)).toBe(20000);
    expect(supplierDebt(movs, SUP)).toBe(0);
    expect(availableCredit(movs, SUP)).toBe(20000);
  });

  it("el saldo a favor sólo cuenta movimientos sin gasto imputado", () => {
    const movs = [cargo("g1", 50000), pago("g1", 50000)];
    expect(availableCredit(movs, SUP)).toBe(0);
  });
});

describe("estado derivado del gasto", () => {
  it("marca pendiente sin pagos", () => {
    const e = gasto("g1", 50000, "2026-03-01");
    expect(expenseStatus(e, [cargo("g1", 50000)])).toBe("pending");
    expect(expenseRemaining(e, [cargo("g1", 50000)])).toBe(50000);
  });

  it("marca parcial con un pago menor al total", () => {
    const e = gasto("g1", 50000, "2026-03-01");
    const movs = [cargo("g1", 50000), pago("g1", 20000)];
    expect(expenseStatus(e, movs)).toBe("partial");
    expect(expensePaid(movs, "g1")).toBe(20000);
    expect(expenseRemaining(e, movs)).toBe(30000);
  });

  it("suma varios pagos parciales hasta saldar", () => {
    const e = gasto("g1", 50000, "2026-03-01");
    const movs = [cargo("g1", 50000), pago("g1", 20000), { ...pago("g1", 30000), id: "p2" }];
    expect(expenseStatus(e, movs)).toBe("paid");
    expect(expenseRemaining(e, movs)).toBe(0);
  });

  it("usa el monto del cargo, no el total del gasto, cuando difieren", () => {
    // El gasto se editó después de generar el cargo: manda el cargo.
    const e = gasto("g1", 80000, "2026-03-01");
    const movs = [cargo("g1", 50000), pago("g1", 50000)];
    expect(expenseStatus(e, movs)).toBe("paid");
  });

  it("los gastos sin proveedor conservan su estado propio", () => {
    const e = { id: "g9", total: 1000, date: "2026-03-01", supplierId: null, paymentStatus: "paid" };
    expect(expenseStatus(e, [])).toBe("paid");
  });

  // Los 478 gastos históricos cargados como "Pagado" antes de este modelo no
  // tienen ningún movimiento. Leerlos como "sin pagos" los mostraría a todos
  // como pendientes e inflaría la deuda con millones que ya están saldados.
  it("un gasto con proveedor pero sin cargo conserva su estado guardado", () => {
    const e = gasto("viejo", 50000, "2026-03-01", { paymentStatus: "paid" });
    expect(expenseStatus(e, [])).toBe("paid");
    expect(expenseRemaining(e, [])).toBe(0);
    expect(expensePaidAmount(e, [])).toBe(50000);
    expect(hasLedger(e, [])).toBe(false);
  });

  it("un gasto sin cargo y sin pagar sigue pendiente por su total", () => {
    const e = gasto("viejo", 50000, "2026-03-01");
    expect(expenseStatus(e, [])).toBe("pending");
    expect(expenseRemaining(e, [])).toBe(50000);
    expect(expensePaidAmount(e, [])).toBe(0);
  });

  it("no ofrece para pagar gastos sin cargo que los respalde", () => {
    // Pagarlos generaría un `payment` sin `charge` → saldo a favor de la nada,
    // que es justo el bug que dejó saldos falsos en producción.
    const expenses = [gasto("sin-cargo", 50000, "2026-03-01"), gasto("con-cargo", 30000, "2026-04-01")];
    const movs = [cargo("con-cargo", 30000)];
    expect(unpaidSupplierExpenses(expenses, movs, SUP).map(e => e.id)).toEqual(["con-cargo"]);
  });
});

describe("gastos pendientes ordenados FIFO", () => {
  it("ordena del más viejo al más nuevo", () => {
    const expenses = [gasto("nuevo", 1000, "2026-05-01"), gasto("viejo", 1000, "2026-01-01"), gasto("medio", 1000, "2026-03-01")];
    const movs = expenses.map((e) => cargo(e.id, 1000));
    expect(unpaidSupplierExpenses(expenses, movs, SUP).map((e) => e.id)).toEqual(["viejo", "medio", "nuevo"]);
  });

  it("excluye los gastos ya saldados", () => {
    const expenses = [gasto("g1", 1000, "2026-01-01"), gasto("g2", 1000, "2026-02-01")];
    const movs = [cargo("g1", 1000), pago("g1", 1000), cargo("g2", 1000)];
    expect(unpaidSupplierExpenses(expenses, movs, SUP).map((e) => e.id)).toEqual(["g2"]);
  });

  it("desempata por createdAt cuando la fecha es la misma", () => {
    const expenses = [
      gasto("b", 1000, "2026-01-01", { createdAt: "2026-01-01T18:00:00Z" }),
      gasto("a", 1000, "2026-01-01", { createdAt: "2026-01-01T09:00:00Z" }),
    ];
    const movs = expenses.map((e) => cargo(e.id, 1000));
    expect(unpaidSupplierExpenses(expenses, movs, SUP).map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("imputación de un pago", () => {
  // Caso del pedido: dos gastos de 50.000 y se pagan 70.000.
  const expenses = [gasto("viejo", 50000, "2026-03-01"), gasto("nuevo", 50000, "2026-04-01")];
  const movs = [cargo("viejo", 50000), cargo("nuevo", 50000)];

  it("salda el más viejo y deja el resto imputado al siguiente", () => {
    const { allocations, cashUsed, leftover } = allocatePayment({ expenses, movements: movs, supplierId: SUP, amount: 70000 });
    expect(cashUsed).toBe(70000);
    expect(leftover).toBe(0);
    expect(allocations.map((a) => [a.expense.id, a.cashApplied, a.newRemaining])).toEqual([
      ["viejo", 50000, 0],
      ["nuevo", 20000, 30000],
    ]);
  });

  it("respeta los gastos tildados y saltea los que no", () => {
    const { allocations, cashUsed } = allocatePayment({
      expenses, movements: movs, supplierId: SUP, amount: 70000, selectedIds: new Set(["nuevo"]),
    });
    expect(cashUsed).toBe(50000); // sólo alcanzaba a cubrir "nuevo"
    expect(allocations.find((a) => a.expense.id === "viejo").cashApplied).toBe(0);
    expect(allocations.find((a) => a.expense.id === "nuevo").newRemaining).toBe(0);
  });

  it("el excedente queda como saldo a favor", () => {
    const { cashUsed, leftover } = allocatePayment({ expenses, movements: movs, supplierId: SUP, amount: 120000 });
    expect(cashUsed).toBe(100000);
    expect(leftover).toBe(20000);
  });

  it("aplica primero el saldo a favor existente, aunque no se tilde el gasto", () => {
    const conCredito = [...movs, pago(null, 30000)];
    const { allocations, creditUsed, cashUsed } = allocatePayment({
      expenses, movements: conCredito, supplierId: SUP, amount: 0,
    });
    expect(creditUsed).toBe(30000);
    expect(cashUsed).toBe(0);
    expect(allocations[0].creditApplied).toBe(30000);
    expect(allocations[0].newRemaining).toBe(20000);
  });

  it("combina saldo a favor y efectivo sobre el mismo gasto", () => {
    const conCredito = [...movs, pago(null, 30000)];
    const { allocations, creditUsed, cashUsed } = allocatePayment({
      expenses, movements: conCredito, supplierId: SUP, amount: 20000,
    });
    expect(creditUsed).toBe(30000);
    expect(cashUsed).toBe(20000);
    expect(allocations[0].newRemaining).toBe(0);
  });

  it("parte del monto ya pagado al calcular lo que falta", () => {
    const parciales = [...movs, pago("viejo", 20000)];
    const { allocations } = allocatePayment({ expenses, movements: parciales, supplierId: SUP, amount: 30000 });
    expect(allocations[0].remaining).toBe(30000);
    expect(allocations[0].newRemaining).toBe(0);
  });

  it("no rompe con montos decimales", () => {
    const e = [gasto("g1", 121499.99, "2026-03-01")];
    const m = [cargo("g1", 121499.99)];
    const { allocations, leftover } = allocatePayment({ expenses: e, movements: m, supplierId: SUP, amount: 121499.99 });
    expect(allocations[0].newRemaining).toBe(0);
    expect(leftover).toBe(0);
  });
});

describe("filas generadas para la DB", () => {
  const expenses = [gasto("viejo", 50000, "2026-03-01"), gasto("nuevo", 50000, "2026-04-01")];
  const movs = [cargo("viejo", 50000), cargo("nuevo", 50000)];

  it("genera un pago por gasto imputado", () => {
    const { allocations, leftover } = allocatePayment({ expenses, movements: movs, supplierId: SUP, amount: 70000 });
    const rows = buildPaymentMovements({ allocations, leftover, supplierId: SUP, paymentMethod: "transfer", date: "2026-08-09", newId: seqId() });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.expenseId, r.type, r.amount, r.paymentMethod])).toEqual([
      ["viejo", "payment", 50000, "transfer"],
      ["nuevo", "payment", 20000, "transfer"],
    ]);
  });

  it("el saldo a favor genera pago imputado + cargo de consumo (neto 0)", () => {
    const conCredito = [...movs, pago(null, 30000)];
    const { allocations, leftover } = allocatePayment({ expenses, movements: conCredito, supplierId: SUP, amount: 0 });
    const rows = buildPaymentMovements({ allocations, leftover, supplierId: SUP, paymentMethod: "cash", date: "2026-08-09", newId: seqId() });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ expenseId: "viejo", type: "payment", amount: 30000, paymentMethod: CREDIT_METHOD });
    expect(rows[1]).toMatchObject({ expenseId: null, type: "charge", amount: 30000, paymentMethod: CREDIT_METHOD });
    const neto = rows.reduce((s, r) => (r.type === "payment" ? s + r.amount : s - r.amount), 0);
    expect(neto).toBe(0);
  });

  it("el excedente genera un pago a cuenta sin gasto", () => {
    const { allocations, leftover } = allocatePayment({ expenses, movements: movs, supplierId: SUP, amount: 120000 });
    const rows = buildPaymentMovements({ allocations, leftover, supplierId: SUP, paymentMethod: "cash", date: "2026-08-09", newId: seqId() });
    const aCuenta = rows.filter((r) => !r.expenseId);
    expect(aCuenta).toHaveLength(1);
    expect(aCuenta[0]).toMatchObject({ type: "payment", amount: 20000 });
  });

  it("deja el saldo del proveedor en cero al pagar toda la deuda", () => {
    const { allocations, leftover } = allocatePayment({ expenses, movements: movs, supplierId: SUP, amount: 100000 });
    const rows = buildPaymentMovements({ allocations, leftover, supplierId: SUP, paymentMethod: "cash", date: "2026-08-09", newId: seqId() });
    expect(supplierBalance([...movs, ...rows], SUP)).toBe(0);
    for (const e of expenses) expect(expenseStatus(e, [...movs, ...rows])).toBe("paid");
  });
});

describe("sincronización del gasto con su cuenta corriente", () => {
  const plan = (expense, movements = []) => planExpenseLedger({ expense, movements, newId: seqId() });

  it("genera el cargo de un gasto nuevo pendiente", () => {
    const p = plan(gasto("g1", 50000, "2026-03-01"));
    expect(p.insert).toHaveLength(1);
    expect(p.insert[0]).toMatchObject({ type: "charge", amount: 50000, expenseId: "g1", notes: "Gasto g1" });
    expect(p.paymentStatus).toBe("pending");
  });

  it("genera cargo + pago cuando el gasto se carga ya pagado", () => {
    const p = plan(gasto("g1", 50000, "2026-03-01", { paymentStatus: "paid", paymentMethod: "transfer" }));
    expect(p.insert.map(r => [r.type, r.amount, r.paymentMethod])).toEqual([
      ["charge", 50000, null],
      ["payment", 50000, "transfer"],
    ]);
    expect(p.paymentStatus).toBe("paid");
    // Neto cero: el gasto pagado no deja deuda.
    expect(supplierBalance(p.insert, SUP)).toBe(0);
  });

  it("actualiza el cargo cuando cambia el total del gasto", () => {
    const e = gasto("g1", 70000, "2026-03-01");
    const p = plan(e, [cargo("g1", 50000)]);
    expect(p.update).toEqual([{ id: "c-g1", changes: { amount: 70000 } }]);
    expect(p.insert).toHaveLength(0);
  });

  it("borra los movimientos si se le saca el proveedor al gasto", () => {
    const e = { ...gasto("g1", 50000, "2026-03-01"), supplierId: null };
    const p = plan(e, [cargo("g1", 50000), pago("g1", 50000)]);
    expect(p.remove.sort()).toEqual(["c-g1", "p-g1-50000"]);
    expect(p.insert).toHaveLength(0);
  });

  it("mueve los movimientos si se cambia el proveedor del gasto", () => {
    const e = { ...gasto("g1", 50000, "2026-03-01"), supplierId: "sup-2" };
    const p = plan(e, [cargo("g1", 50000), pago("g1", 50000)]);
    expect(p.update).toEqual(expect.arrayContaining([
      { id: "c-g1", changes: { supplierId: "sup-2" } },
      { id: "p-g1-50000", changes: { supplierId: "sup-2" } },
    ]));
  });

  it("no duplica el pago si el gasto ya estaba saldado", () => {
    const e = gasto("g1", 50000, "2026-03-01", { paymentStatus: "paid" });
    const p = plan(e, [cargo("g1", 50000), pago("g1", 50000)]);
    expect(p.insert).toHaveLength(0);
    expect(p.paymentStatus).toBe("paid");
  });

  it("completa la diferencia si el gasto pagado tenía pagos parciales", () => {
    const e = gasto("g1", 50000, "2026-03-01", { paymentStatus: "paid", paymentMethod: "cash" });
    const p = plan(e, [cargo("g1", 50000), pago("g1", 20000)]);
    expect(p.insert).toHaveLength(1);
    expect(p.insert[0]).toMatchObject({ type: "payment", amount: 30000, expenseId: "g1" });
  });

  // Bug: se editaba el total de un gasto ya pagado y el saldo quedaba descuadrado.
  it("pasa a cuenta el excedente si se baja el total de un gasto ya pagado", () => {
    const e = gasto("g1", 30000, "2026-03-01", { paymentStatus: "paid" });
    const p = plan(e, [cargo("g1", 50000), pago("g1", 50000)]);
    expect(p.update).toEqual(expect.arrayContaining([
      { id: "c-g1", changes: { amount: 30000 } },
      { id: "p-g1-50000", changes: { amount: 30000 } },
    ]));
    const aCuenta = p.insert.filter(r => !r.expenseId);
    expect(aCuenta).toHaveLength(1);
    expect(aCuenta[0]).toMatchObject({ type: "payment", amount: 20000 });
    expect(p.paymentStatus).toBe("paid");
  });

  // Bug: volver un gasto a "pendiente" dejaba vivo el pago viejo y seguía figurando saldado.
  it("el estado derivado manda sobre el del formulario cuando hay pagos", () => {
    const e = gasto("g1", 50000, "2026-03-01", { paymentStatus: "pending" });
    const p = plan(e, [cargo("g1", 50000), pago("g1", 20000)]);
    expect(p.paymentStatus).toBe("partial");
    expect(p.remove).toHaveLength(0); // la plata pagada no se borra sola
  });

  it("elimina cargos duplicados del mismo gasto", () => {
    const e = gasto("g1", 50000, "2026-03-01");
    const dup = { ...cargo("g1", 50000), id: "c-dup" };
    const p = plan(e, [cargo("g1", 50000), dup]);
    expect(p.remove).toEqual(["c-dup"]);
  });
});

describe("espejo de payment_status", () => {
  it("devuelve sólo los gastos cuyo estado quedó desactualizado", () => {
    const expenses = [
      gasto("g1", 50000, "2026-03-01", { paymentStatus: "pending" }), // ya está pago
      gasto("g2", 50000, "2026-03-01", { paymentStatus: "pending" }), // sigue pendiente
    ];
    const movs = [cargo("g1", 50000), pago("g1", 50000), cargo("g2", 50000)];
    expect(expenseStatusUpdates(expenses, movs)).toEqual([{ id: "g1", paymentStatus: "paid" }]);
  });

  it("completa el método de pago si el gasto quedó pagado y no tenía", () => {
    const expenses = [gasto("g1", 50000, "2026-03-01")];
    const movs = [cargo("g1", 50000), pago("g1", 50000)];
    expect(expenseStatusUpdates(expenses, movs, ["g1"], "transfer")).toEqual([
      { id: "g1", paymentStatus: "paid", paymentMethod: "transfer" },
    ]);
  });

  it("ignora los gastos sin proveedor", () => {
    const expenses = [{ id: "g9", total: 1000, date: "2026-03-01", supplierId: null, paymentStatus: "pending" }];
    expect(expenseStatusUpdates(expenses, [])).toEqual([]);
  });
});
