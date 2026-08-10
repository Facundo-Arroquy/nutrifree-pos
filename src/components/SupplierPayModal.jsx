/**
 * SupplierPayModal — pago de deuda a un proveedor imputado a sus gastos.
 *
 * Muestra los gastos pendientes del proveedor (del más viejo al más nuevo), deja
 * tildar cuáles se pagan y escribir un monto libre. El monto se reparte FIFO: si
 * hay dos gastos de $50.000 y se pagan $70.000, el primero queda saldado y el
 * segundo parcialmente pagado, mostrando el importe original tachado al lado del
 * saldo que queda.
 *
 * El saldo a favor disponible se aplica solo, siempre a los gastos más viejos.
 * Lo que sobre del monto ingresado queda como saldo a favor.
 *
 * Toda la aritmética vive en utils/supplierAccount.js; acá sólo hay UI.
 */
import { useMemo, useState } from "react";
import { Ico, Modal, $, fmtDate, todayStr, PAY_LABELS } from "../shared.jsx";
import { allocatePayment, buildPaymentMovements, availableCredit, supplierBalance } from "../utils/supplierAccount.js";
import { parseMoneyInput } from "../utils/money.js";

/** Métodos con los que se le puede pagar a un proveedor. */
export const SUPPLIER_PAY_OPTS = [["cash", "Efectivo"], ["transfer", "Transferencia"], ["card", "Tarjeta"], ["check", "Cheque"]];

/** Etiquetas de métodos, incluidos los internos que no mueven plata real. */
export const SUPPLIER_PAY_LABELS = { ...PAY_LABELS, check: "Cheque", balance: "Saldo a favor" };

export default function SupplierPayModal({ supplier, expenses, movements, onClose, onConfirm, submitting }) {
  const credit = availableCredit(movements, supplier.id);
  const balance = supplierBalance(movements, supplier.id);

  // Al abrir: todos los gastos tildados y el monto sugerido = lo que falta
  // después de aplicar el saldo a favor.
  const initial = useMemo(
    () => allocatePayment({ expenses, movements, supplierId: supplier.id, amount: 0 }),
    [expenses, movements, supplier.id]
  );
  const [selectedIds, setSelectedIds] = useState(() => new Set(initial.allocations.filter(a => a.newRemaining > 0).map(a => a.expense.id)));
  const [amount, setAmount] = useState(() => {
    const sugerido = initial.allocations.reduce((sum, a) => sum + a.newRemaining, 0);
    return sugerido > 0 ? String(sugerido) : "";
  });
  const [paymentMethod, setPaymentMethod] = useState("transfer");
  const [notes, setNotes] = useState("");

  const parsed = parseMoneyInput(amount);
  const preview = useMemo(
    () => allocatePayment({ expenses, movements, supplierId: supplier.id, amount: parsed, selectedIds }),
    [expenses, movements, supplier.id, parsed, selectedIds]
  );

  const toggle = (expenseId) => {
    const next = new Set(selectedIds);
    if (next.has(expenseId)) next.delete(expenseId); else next.add(expenseId);
    setSelectedIds(next);
    // Re-sugerir el monto con los gastos que quedaron tildados.
    const sugerido = initial.allocations
      .filter(a => a.newRemaining > 0 && next.has(a.expense.id))
      .reduce((sum, a) => sum + a.newRemaining, 0);
    setAmount(sugerido > 0 ? String(sugerido) : "");
  };

  const confirm = () => {
    const rows = buildPaymentMovements({
      allocations: preview.allocations,
      leftover: preview.leftover,
      supplierId: supplier.id,
      paymentMethod,
      date: todayStr(),
      notes,
    });
    onConfirm(rows, { creditUsed: preview.creditUsed, cashUsed: preview.cashUsed, leftover: preview.leftover, paymentMethod });
  };

  const nothingToDo = preview.creditUsed === 0 && preview.cashUsed === 0 && preview.leftover === 0;

  return (
    <Modal title={`Pagar a ${supplier.name}`} onClose={onClose} lg>
      <div style={{ display:"flex", gap:16, flexWrap:"wrap", alignItems:"center", background:"var(--s2)", borderRadius:8, padding:"12px 14px", marginBottom:16 }}>
        <div>
          <div style={{ fontSize:".8em", color:"var(--t3)" }}>Saldo actual</div>
          <div style={{ fontWeight:800, fontSize:"1.25em", color: balance < 0 ? "var(--amber)" : balance > 0 ? "var(--green)" : "var(--t2)" }}>
            {balance < 0 ? `Debemos ${$(Math.abs(balance))}` : balance > 0 ? `A favor ${$(balance)}` : "Al día"}
          </div>
        </div>
        {credit > 0 && (
          <div>
            <div style={{ fontSize:".8em", color:"var(--t3)" }}>Saldo a favor disponible</div>
            <div style={{ fontWeight:700, color:"var(--green)" }}>{$(credit)} <span style={{ fontSize:".75em", fontWeight:500, color:"var(--t3)" }}>se aplica automáticamente</span></div>
          </div>
        )}
      </div>

      {preview.allocations.length === 0 ? (
        <div style={{ background:"var(--bluel)", border:"1px solid var(--blueb)", borderRadius:8, padding:"10px 12px", marginBottom:16, fontSize:".85em", color:"var(--blue)" }}>
          <Ico n="check" s={13}/> No hay gastos pendientes. Lo que cargues queda como saldo a favor del proveedor.
        </div>
      ) : (
        <>
          <div className="section-title">Gastos a pagar (del más viejo al más nuevo)</div>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th style={{ width:34 }}></th><th>Fecha</th><th>Concepto</th><th>Importe</th><th>Falta pagar</th><th>Después de este pago</th>
              </tr></thead>
              <tbody>
                {preview.allocations.map(a => {
                  const aplicado = a.creditApplied + a.cashApplied;
                  const saldado = aplicado > 0 && a.newRemaining === 0;
                  return (
                    <tr key={a.expense.id}>
                      <td>
                        <input type="checkbox" checked={selectedIds.has(a.expense.id)} onChange={()=>toggle(a.expense.id)}
                               aria-label={`Pagar ${a.expense.concept}`} style={{ width:16, height:16, cursor:"pointer" }}/>
                      </td>
                      <td data-label="Fecha" style={{ fontSize:".82em", color:"var(--t3)", whiteSpace:"nowrap" }}>{fmtDate(a.expense.date)}</td>
                      <td data-label="Concepto">{a.expense.concept}</td>
                      <td data-label="Importe" style={{ whiteSpace:"nowrap" }}>
                        {a.alreadyPaid > 0
                          ? <><span style={{ textDecoration:"line-through", color:"var(--t4)" }}>{$(a.total)}</span>{" "}
                              <span style={{ fontSize:".8em", color:"var(--t3)" }}>pagado {$(a.alreadyPaid)}</span></>
                          : $(a.total)}
                      </td>
                      <td data-label="Falta pagar" style={{ fontWeight:700, color:"var(--red)" }}>{$(a.remaining)}</td>
                      <td data-label="Después de este pago" style={{ whiteSpace:"nowrap" }}>
                        {aplicado === 0
                          ? <span style={{ color:"var(--t4)" }}>—</span>
                          : saldado
                            ? <span className="badge badge-green">Saldado</span>
                            : <><span style={{ textDecoration:"line-through", color:"var(--t4)" }}>{$(a.remaining)}</span>{" "}
                                <span className="badge badge-amber" style={{ fontWeight:700 }}>Debemos {$(a.newRemaining)}</span></>}
                        {a.creditApplied > 0 && (
                          <div style={{ fontSize:".74em", color:"var(--green)", marginTop:2 }}>{$(a.creditApplied)} con saldo a favor</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="form-grid" style={{ marginTop:16 }}>
        <div className="form-group"><label className="lbl">Monto a pagar</label>
          <input type="number" min="0" step="0.01" autoFocus value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" style={{ fontWeight:700 }}/>
        </div>
        <div className="form-group"><label className="lbl">Notas</label>
          <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Observaciones..."/>
        </div>
        <div className="form-group full"><label className="lbl">Método de pago</label>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:8 }}>
            {SUPPLIER_PAY_OPTS.map(([k,v]) => (
              <button key={k} className={`btn ${paymentMethod===k?"btn-primary":"btn-secondary"}`} onClick={()=>setPaymentMethod(k)}>
                {paymentMethod===k && <Ico n="check" s={13}/>}{v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background:"var(--s2)", borderRadius:8, padding:"10px 14px", marginTop:12, fontSize:".85em", display:"flex", gap:18, flexWrap:"wrap" }}>
        {preview.creditUsed > 0 && <span>Saldo a favor aplicado: <strong style={{ color:"var(--green)" }}>{$(preview.creditUsed)}</strong></span>}
        <span>Se imputa a gastos: <strong>{$(preview.cashUsed)}</strong></span>
        {preview.leftover > 0 && <span>Queda a favor del proveedor: <strong style={{ color:"var(--green)" }}>{$(preview.leftover)}</strong></span>}
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={confirm} disabled={submitting || nothingToDo}>
          <Ico n="check" s={13}/>{submitting ? "Registrando..." : "Confirmar pago"}
        </button>
      </div>
    </Modal>
  );
}
