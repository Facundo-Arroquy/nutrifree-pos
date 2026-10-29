/**
 * CouponField — campo "¿Tenés un cupón?" del checkout público.
 *
 * Es controlado por el padre: `coupon` es el cupón aplicado ({code, discountPct})
 * o null, y `onChange` recibe el cupón validado (o null al quitarlo). La
 * validación contra la base vive en `lookupCoupon`.
 */
import { useState } from "react";
import { supabase } from "../supabase.js";
import { lookupCoupon } from "../utils/coupons.js";

export default function CouponField({ coupon, onChange }) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const apply = async () => {
    setError("");
    setChecking(true);
    const result = await lookupCoupon(supabase, code);
    setChecking(false);
    if (result.error) { setError(result.error); return; }
    setCode("");
    onChange(result.coupon);
  };

  if (coupon) {
    return (
      <div className="coupon-applied">
        <span>
          Cupón <strong>{coupon.code}</strong> · {coupon.discountPct}% de descuento
        </span>
        <button type="button" onClick={() => onChange(null)}>Quitar</button>
      </div>
    );
  }

  return (
    <div className="coupon-field">
      <label htmlFor="coupon-code">¿Tenés un cupón de descuento?</label>
      <div className="coupon-field-row">
        <input
          id="coupon-code"
          type="text"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
          placeholder="Código"
          autoCapitalize="characters"
          autoComplete="off"
        />
        <button type="button" onClick={apply} disabled={checking || !code.trim()}>
          {checking ? "Validando…" : "Aplicar"}
        </button>
      </div>
      {error && <p className="coupon-field-error">{error}</p>}
    </div>
  );
}
