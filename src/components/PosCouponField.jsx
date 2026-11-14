/**
 * PosCouponField — campo de cupón del carrito del POS.
 *
 * Es controlado por el padre: `coupon` es el cupón aplicado ({code, discountPct})
 * o null, y `onChange` recibe el cupón validado (o null al quitarlo). Valida
 * contra la base con `lookupCoupon` (misma función que el checkout web).
 */
import { useState } from "react";
import { supabase } from "../supabase.js";
import { lookupCoupon } from "../utils/coupons.js";

const rowStyle = { display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-end" };
const inputStyle = {
  width: 96, padding: "2px 6px", fontSize: ".86em", borderRadius: 6,
  border: "1px solid var(--border)", background: "var(--s1)", textTransform: "uppercase",
};

export default function PosCouponField({ coupon, onChange }) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const apply = async () => {
    if (checking || !code.trim()) return;
    setError("");
    setChecking(true);
    const result = await lookupCoupon(supabase, code);
    setChecking(false);
    if (result.error) { setError(result.error); return; }
    setCode("");
    onChange(result.coupon);
  };

  return (
    <div className="tot-row" style={{ alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ color: "var(--t2)", flexShrink: 0 }}>Cupón</span>
      {coupon ? (
        <div style={rowStyle}>
          <span style={{ fontSize: ".86em" }}>
            <strong>{coupon.code}</strong> · -{coupon.discountPct}%
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>
            Quitar
          </button>
        </div>
      ) : (
        <div style={rowStyle}>
          <input
            aria-label="Código de cupón"
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setError(""); }}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
            placeholder="Código"
            autoComplete="off"
            style={inputStyle}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={apply} disabled={checking || !code.trim()}>
            {checking ? "…" : "Aplicar"}
          </button>
        </div>
      )}
      {error && (
        <div style={{ width: "100%", textAlign: "right", fontSize: ".78em", color: "var(--red)" }}>{error}</div>
      )}
    </div>
  );
}
