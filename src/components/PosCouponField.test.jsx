import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../supabase.js", () => ({ supabase: {} }));

const { default: PosCouponField } = await import("./PosCouponField.jsx");

const render = coupon => renderToStaticMarkup(<PosCouponField coupon={coupon} onChange={() => {}} />);

describe("PosCouponField", () => {
  it("sin cupón muestra el campo para cargar el código", () => {
    const html = render(null);
    expect(html).toContain("Código de cupón");
    expect(html).toContain("Aplicar");
  });

  it("con cupón muestra el código, el % y el botón para quitarlo", () => {
    const html = render({ code: "EFECTIVO", discountPct: 8.33 });
    expect(html).toContain("EFECTIVO");
    expect(html).toContain("-8.33%");
    expect(html).toContain("Quitar");
    expect(html).not.toContain("Aplicar");
  });
});
