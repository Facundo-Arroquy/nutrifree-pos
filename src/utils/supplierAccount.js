/**
 * supplierAccount — lógica pura de la cuenta corriente de proveedores.
 *
 * Modelo de datos (tabla `supplier_payments`, un movimiento por fila):
 *
 *   type="charge"   → deuda que generamos con el proveedor.
 *                     Con `expenseId` = cargo de un gasto.
 *                     Sin `expenseId` = ajuste de apertura o consumo de saldo a favor.
 *   type="payment"  → plata que le pagamos al proveedor.
 *                     Con `expenseId` = imputado a ese gasto (puede ser parcial).
 *                     Sin `expenseId` = pago a cuenta → queda como saldo a favor.
 *
 * Invariante: TODO gasto con proveedor tiene su `charge`. El estado de pago del
 * gasto (pendiente/parcial/pagado) se DERIVA de los pagos imputados, nunca al
 * revés. `expenses.payment_status` es sólo un espejo desnormalizado para filtros
 * y reportes; `expenseStatus()` es la fuente de verdad.
 *
 * Signo del saldo: positivo = el proveedor nos debe (saldo a favor);
 * negativo = le debemos.
 */

/** Método interno de los movimientos que mueven saldo a favor, no plata real. */
export const CREDIT_METHOD = "balance";

/** Redondea a centavos para evitar arrastre de coma flotante. */
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Saldo total del proveedor: pagos − cargos. */
export function supplierBalance(movements, supplierId) {
  return round2(
    movements
      .filter((m) => m.supplierId === supplierId)
      .reduce((sum, m) => (m.type === "payment" ? sum + Number(m.amount || 0) : sum - Number(m.amount || 0)), 0)
  );
}

/** Deuda pendiente con el proveedor (0 si está al día o tiene saldo a favor). */
export function supplierDebt(movements, supplierId) {
  return Math.max(0, -supplierBalance(movements, supplierId));
}

/**
 * Saldo a favor no imputado: movimientos sin `expenseId`.
 * Es la plata que le adelantamos y todavía no se aplicó a ningún gasto.
 */
export function availableCredit(movements, supplierId) {
  const unlinked = movements
    .filter((m) => m.supplierId === supplierId && !m.expenseId)
    .reduce((sum, m) => (m.type === "payment" ? sum + Number(m.amount || 0) : sum - Number(m.amount || 0)), 0);
  return Math.max(0, round2(unlinked));
}

/** Cargo asociado a un gasto, o undefined si todavía no se generó. */
export function expenseCharge(movements, expenseId) {
  return movements.find((m) => m.expenseId === expenseId && m.type === "charge");
}

/** Total ya imputado a un gasto (suma de pagos parciales). */
export function expensePaid(movements, expenseId) {
  return round2(
    movements
      .filter((m) => m.expenseId === expenseId && m.type === "payment")
      .reduce((sum, m) => sum + Number(m.amount || 0), 0)
  );
}

/**
 * ¿Este gasto está representado en la cuenta corriente?
 *
 * Los gastos anteriores a este modelo (cargados directamente como "Pagado") no
 * tienen ningún movimiento. Para ellos la cuenta corriente no dice nada, así que
 * el estado guardado en el gasto sigue siendo la fuente de verdad: tratarlos como
 * "sin pagos" los mostraría a todos como pendientes.
 */
export function hasLedger(expense, movements) {
  return Boolean(expense.supplierId) && Boolean(expenseCharge(movements, expense.id));
}

/** Estado guardado en el gasto, normalizado, para los que no tienen cuenta. */
const storedStatus = (expense) => (expense.paymentStatus === "paid" ? "paid" : "pending");

/** Importe de referencia del gasto para la cuenta corriente: el del cargo. */
export function expenseChargeAmount(expense, movements) {
  const charge = expenseCharge(movements, expense.id);
  return round2(charge ? charge.amount : expense.total);
}

/** Total ya pagado del gasto, con o sin cuenta corriente. */
export function expensePaidAmount(expense, movements) {
  if (!hasLedger(expense, movements)) return storedStatus(expense) === "paid" ? round2(expense.total) : 0;
  return expensePaid(movements, expense.id);
}

/** Lo que falta pagar de un gasto. */
export function expenseRemaining(expense, movements) {
  if (!hasLedger(expense, movements)) return storedStatus(expense) === "paid" ? 0 : round2(expense.total);
  return Math.max(0, round2(expenseChargeAmount(expense, movements) - expensePaid(movements, expense.id)));
}

/**
 * Estado de pago derivado de los movimientos. Si el gasto no tiene cuenta
 * corriente (sin proveedor, o histórico sin cargo generado) vale su `paymentStatus`.
 */
export function expenseStatus(expense, movements) {
  if (!hasLedger(expense, movements)) return storedStatus(expense);
  const total = expenseChargeAmount(expense, movements);
  const paid = expensePaid(movements, expense.id);
  if (total <= 0) return "paid";
  if (paid <= 0) return "pending";
  if (paid >= total) return "paid";
  return "partial";
}

/**
 * Gastos del proveedor con saldo pendiente, del más viejo al más nuevo (FIFO).
 * Sólo los que tienen cargo: pagar un gasto sin cargo que lo respalde dejaría al
 * proveedor con saldo a favor de la nada.
 */
export function unpaidSupplierExpenses(expenses, movements, supplierId) {
  return expenses
    .filter((e) => e.supplierId === supplierId && hasLedger(e, movements) && expenseRemaining(e, movements) > 0)
    .sort((a, b) => {
      const byDate = String(a.date || "").localeCompare(String(b.date || ""));
      if (byDate !== 0) return byDate;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
}

/**
 * Reparte un pago entre los gastos pendientes del proveedor.
 *
 *  1. El saldo a favor existente se aplica solo, siempre del gasto más viejo al
 *     más nuevo (igual que en cuenta corriente de clientes).
 *  2. El `amount` ingresado se reparte FIFO pero SOLO entre los gastos tildados.
 *  3. Lo que sobra del `amount` queda como saldo a favor.
 *
 * @param {object[]} expenses      todos los gastos
 * @param {object[]} movements     todos los supplier_payments
 * @param {string}   supplierId
 * @param {number}   amount        monto a pagar ahora (0 = solo aplicar saldo a favor)
 * @param {Set|null} selectedIds   ids de gastos tildados; null = todos
 * @returns {{allocations: object[], creditUsed: number, cashUsed: number, leftover: number}}
 */
export function allocatePayment({ expenses, movements, supplierId, amount = 0, selectedIds = null }) {
  const pending = unpaidSupplierExpenses(expenses, movements, supplierId);
  let creditLeft = availableCredit(movements, supplierId);
  let cashLeft = Math.max(0, round2(amount));

  const allocations = pending.map((expense) => {
    const total = expenseChargeAmount(expense, movements);
    const alreadyPaid = expensePaid(movements, expense.id);
    const remaining = round2(total - alreadyPaid);
    const creditApplied = round2(Math.min(creditLeft, remaining));
    creditLeft = round2(creditLeft - creditApplied);
    return { expense, total, alreadyPaid, remaining, creditApplied, cashApplied: 0, newRemaining: round2(remaining - creditApplied) };
  });

  for (const alloc of allocations) {
    if (cashLeft <= 0) break;
    if (selectedIds && !selectedIds.has(alloc.expense.id)) continue;
    if (alloc.newRemaining <= 0) continue;
    const cashApplied = round2(Math.min(cashLeft, alloc.newRemaining));
    cashLeft = round2(cashLeft - cashApplied);
    alloc.cashApplied = cashApplied;
    alloc.newRemaining = round2(alloc.newRemaining - cashApplied);
  }

  return {
    allocations,
    creditUsed: round2(allocations.reduce((sum, a) => sum + a.creditApplied, 0)),
    cashUsed: round2(allocations.reduce((sum, a) => sum + a.cashApplied, 0)),
    leftover: cashLeft,
  };
}

/**
 * Reconcilia los movimientos de un gasto con su estado actual y devuelve el plan
 * de escritura (sin tocar la DB). Es la función que evita los tres bugs de
 * sincronización que tenía ExpensesPage: cargo que no seguía al total editado,
 * pago que sobrevivía al volver el gasto a "pendiente", y gastos cargados como
 * pagados que nunca entraban a la cuenta corriente.
 *
 * Reglas:
 *  - Sin proveedor → se borran todos los movimientos del gasto.
 *  - Con proveedor → siempre existe un `charge` igual al total del gasto.
 *  - Si el gasto se marca pagado y falta plata imputada, se genera el pago por
 *    la diferencia.
 *  - Si quedó imputado de más (p. ej. bajaron el total después de pagar), el
 *    excedente NO se borra: se recorta el último pago y se pasa a saldo a favor.
 *  - Los pagos ya hechos nunca se eliminan solos: si hay pagos, el estado que
 *    manda es el derivado, no el que venga en el formulario.
 *
 * @returns {{insert: object[], update: object[], remove: string[], paymentStatus: string}}
 */
export function planExpenseLedger({ expense, movements, newId = () => crypto.randomUUID() }) {
  const own = movements.filter((m) => m.expenseId === expense.id);
  const plan = { insert: [], update: [], remove: [], paymentStatus: expense.paymentStatus };

  if (!expense.supplierId) {
    plan.remove = own.map((m) => m.id);
    plan.paymentStatus = expense.paymentStatus === "paid" ? "paid" : "pending";
    return plan;
  }

  const total = round2(expense.total);
  const supplierId = expense.supplierId;

  // 1. Cargo: uno solo, siempre alineado con el gasto.
  const charges = own.filter((m) => m.type === "charge");
  const [charge, ...duplicates] = charges;
  plan.remove.push(...duplicates.map((m) => m.id));
  if (!charge) {
    plan.insert.push({ id: newId(), supplierId, expenseId: expense.id, amount: total, type: "charge", paymentMethod: null, date: expense.date, notes: expense.concept });
  } else {
    const changes = {};
    if (charge.supplierId !== supplierId) changes.supplierId = supplierId;
    if (round2(charge.amount) !== total) changes.amount = total;
    if (charge.date !== expense.date) changes.date = expense.date;
    if (charge.notes !== expense.concept) changes.notes = expense.concept;
    if (Object.keys(changes).length > 0) plan.update.push({ id: charge.id, changes });
  }

  // 2. Pagos: el proveedor puede haber cambiado; la plata no se pierde.
  const payments = own
    .filter((m) => m.type === "payment")
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  for (const p of payments) {
    if (p.supplierId !== supplierId) plan.update.push({ id: p.id, changes: { supplierId } });
  }
  let paid = round2(payments.reduce((sum, p) => sum + Number(p.amount || 0), 0));

  // 3. Excedente imputado: recortar del pago más nuevo y pasarlo a cuenta.
  let excess = round2(paid - total);
  for (let i = payments.length - 1; i >= 0 && excess > 0; i--) {
    const p = payments[i];
    const cut = round2(Math.min(excess, Number(p.amount || 0)));
    excess = round2(excess - cut);
    const left = round2(Number(p.amount || 0) - cut);
    if (left > 0) plan.update.push({ id: p.id, changes: { amount: left } });
    else plan.remove.push(p.id);
    plan.insert.push({ id: newId(), supplierId, expenseId: null, amount: cut, type: "payment", paymentMethod: p.paymentMethod, date: p.date, notes: "Excedente pasado a cuenta" });
    paid = round2(paid - cut);
  }

  // 4. Marcado como pagado desde el formulario: completar la diferencia.
  if (expense.paymentStatus === "paid" && paid < total) {
    const falta = round2(total - paid);
    plan.insert.push({ id: newId(), supplierId, expenseId: expense.id, amount: falta, type: "payment", paymentMethod: expense.paymentMethod || "cash", date: expense.date, notes: "Pago del gasto" });
    paid = total;
  }

  plan.paymentStatus = total <= 0 || paid >= total ? "paid" : paid > 0 ? "partial" : "pending";
  return plan;
}

/**
 * Calcula qué gastos quedaron con un `paymentStatus` desactualizado respecto de
 * sus movimientos. `expenses.payment_status` es sólo un espejo para filtros y
 * reportes; esta función mantiene ese espejo sincronizado tras registrar pagos.
 *
 * @param {string[]|null} onlyIds  limitar a estos gastos (null = revisar todos)
 * @returns {{id: string, paymentStatus: string, paymentMethod?: string}[]} sólo los que cambian
 */
export function expenseStatusUpdates(expenses, movements, onlyIds = null, paymentMethod = null) {
  const scope = onlyIds ? expenses.filter((e) => onlyIds.includes(e.id)) : expenses;
  const updates = [];
  for (const expense of scope) {
    if (!expense.supplierId) continue;
    const status = expenseStatus(expense, movements);
    const needsMethod = status === "paid" && !expense.paymentMethod && paymentMethod;
    if (status === expense.paymentStatus && !needsMethod) continue;
    updates.push(needsMethod ? { id: expense.id, paymentStatus: status, paymentMethod } : { id: expense.id, paymentStatus: status });
  }
  return updates;
}

/**
 * Traduce una imputación en las filas a insertar en `supplier_payments`.
 * No toca la DB: devuelve los objetos ya listos para `supplierPaymentToDb`.
 *
 * El saldo a favor se aplica con DOS filas que se cancelan entre sí: un
 * `payment` imputado al gasto (lo salda) y un `charge` sin `expenseId` (consume
 * el crédito). Efecto neto en el saldo: 0. Mismo patrón que en clientes.
 *
 * @param {function} newId  generador de ids (inyectable para tests)
 */
export function buildPaymentMovements({ allocations, leftover = 0, supplierId, paymentMethod, date, notes, newId = () => crypto.randomUUID() }) {
  const rows = [];
  for (const { expense, creditApplied, cashApplied } of allocations) {
    if (creditApplied > 0) {
      rows.push({ id: newId(), supplierId, expenseId: expense.id, amount: creditApplied, type: "payment", paymentMethod: CREDIT_METHOD, date, notes: "Saldo a favor aplicado" });
      rows.push({ id: newId(), supplierId, expenseId: null, amount: creditApplied, type: "charge", paymentMethod: CREDIT_METHOD, date, notes: "Saldo a favor consumido" });
    }
    if (cashApplied > 0) {
      rows.push({ id: newId(), supplierId, expenseId: expense.id, amount: cashApplied, type: "payment", paymentMethod, date, notes: notes || "Pago a proveedor" });
    }
  }
  if (leftover > 0) {
    rows.push({ id: newId(), supplierId, expenseId: null, amount: leftover, type: "payment", paymentMethod, date, notes: notes || "Pago a cuenta" });
  }
  return rows;
}
