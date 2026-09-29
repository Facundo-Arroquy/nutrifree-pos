import { describe, expect, it } from "vitest";
import { normalizeProductName, productImage, productInitials } from "./productImages.js";

describe("product images", () => {
  it("normaliza acentos y signos", () => {
    expect(normalizeProductName("Chipá x 3")).toBe("chipa x 3");
  });

  it("usa primero la foto configurada en el producto", () => {
    expect(productImage({ name: "Cookies", photo: "https://example.com/cookie.jpg" }))
      .toBe("https://example.com/cookie.jpg");
  });

  it("asocia las fotos locales por nombre", () => {
    expect(productImage({ name: "Alfajor Maicena Grande" })).toContain("AlfMaicena.jpeg");
    expect(productImage({ name: "Chipá x 3" })).toContain("chipaNuevo.JPG");
    expect(productImage({ name: "Cuadrado de Pastafrola" })).toContain("Pastafrola.jpg");
  });

  it("no reutiliza fotos parecidas en productos que todavía no tienen imagen", () => {
    expect(productImage({ name: "Torta Brownie - Dulce de Leche - Merengue x Kg" })).toBeNull();
    expect(productImage({ name: "Brownie indivudual con ddl y merengue" })).toBeNull();
    expect(productImage({ name: "Pizza individual de brocoli" })).toBeNull();
    expect(productImage({ name: "Cuadrado de Brownie" })).toContain("Brownie.jpg");
    expect(productImage({ name: "Pizza Muzzarela Individual" })).toContain("Pizza%20Individual.JPG");
  });

  it("devuelve iniciales cuando no hay foto", () => {
    expect(productImage({ name: "Agua" })).toBeNull();
    expect(productInitials("Tarta de verduras")).toBe("TD");
    expect(productInitials("Agua")).toBe("AG");
  });
});
