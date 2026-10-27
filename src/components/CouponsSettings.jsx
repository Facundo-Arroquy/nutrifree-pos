/**
 * CouponsSettings — ABM de cupones de descuento (Configuración → Cupones, solo admin).
 *
 * Alta: código + % de descuento. Baja: se borra la fila. El público los valida
 * con la función `validate_coupon` al hacer un pedido en /menu y /menu-mayorista.
 */
import { useState, useEffect } from "react";
import { Ico } from "../shared.jsx";
import { supabase, dbToCoupon, couponToDb } from "../supabase.js";
import { validateCouponInput } from "../utils/coupons.js";

const DUPLICATE_KEY = "23505";

export default function CouponsSettings({ showToast }) {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        setLoading(false);
        if (error) { showToast("Error al cargar cupones: " + error.message, "error"); return; }
        setCoupons((data ?? []).map(dbToCoupon));
      });
  }, []);

  const addCoupon = async () => {
    const parsed = validateCouponInput({ code, discountPct }, coupons.map(c => c.code));
    if (!parsed.ok) { showToast(parsed.error, "error"); return; }

    const coupon = { id: crypto.randomUUID(), code: parsed.code, discountPct: parsed.discountPct };
    setSaving(true);
    const { data, error } = await supabase.from("coupons").insert(couponToDb(coupon)).select().single();
    setSaving(false);
    if (error) {
      showToast(error.code === DUPLICATE_KEY ? "Ya existe un cupón con ese código." : "Error al agregar: " + error.message, "error");
      return;
    }
    setCoupons(prev => [dbToCoupon(data ?? { ...couponToDb(coupon), created_at: new Date().toISOString() }), ...prev]);
    setCode("");
    setDiscountPct("");
    showToast("Cupón agregado ✓");
  };

  const removeCoupon = async (coupon) => {
    if (!confirm(`¿Eliminar el cupón "${coupon.code}"? Los clientes ya no podrán usarlo.`)) return;
    const { error } = await supabase.from("coupons").delete().eq("id", coupon.id);
    if (error) { showToast("Error al eliminar: " + error.message, "error"); return; }
    setCoupons(prev => prev.filter(c => c.id !== coupon.id));
    showToast("Cupón eliminado");
  };

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <div className="section-title">Cupones de descuento</div>
      <p style={{ fontSize: ".84em", color: "var(--t3)", marginBottom: 14 }}>
        Los clientes ingresan el código al confirmar su pedido en el menú y se les descuenta ese porcentaje del total.
      </p>

      {loading ? (
        <p style={{ fontSize: ".85em", color: "var(--t4)" }}>Cargando…</p>
      ) : coupons.length === 0 ? (
        <p style={{ fontSize: ".85em", color: "var(--t4)", marginBottom: 4 }}>Todavía no hay cupones.</p>
      ) : (
        coupons.map(c => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: ".88em" }}>
              <strong style={{ letterSpacing: ".5px" }}>{c.code}</strong>
              <span style={{ color: "var(--t3)", marginLeft: 10 }}>{c.discountPct}% de descuento</span>
            </span>
            <button className="btn btn-ghost btn-icon btn-sm" title="Eliminar cupón" onClick={() => removeCoupon(c)}>
              <Ico n="x" s={12} c="var(--red)" />
            </button>
          </div>
        ))
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="Código (ej. BIENVENIDA10)"
          maxLength={20}
          style={{ flex: 2, minWidth: 160 }}
          onKeyDown={e => { if (e.key === "Enter") addCoupon(); }}
        />
        <input
          type="number"
          value={discountPct}
          onChange={e => setDiscountPct(e.target.value)}
          placeholder="% desc."
          min="0.01"
          max="100"
          step="any"
          style={{ flex: 1, minWidth: 90 }}
          onKeyDown={e => { if (e.key === "Enter") addCoupon(); }}
        />
        <button className="btn btn-primary btn-sm" disabled={saving || !code.trim() || !discountPct} onClick={addCoupon}>
          <Ico n="plus" s={13} /> Agregar
        </button>
      </div>
    </div>
  );
}
