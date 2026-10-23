import { beforeAll, describe, expect, it, vi } from "vitest";

let dbToProduct;
let productToDb;

beforeAll(async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("VITE_SUPABASE", "clave-de-prueba");
  ({ dbToProduct, productToDb } = await import("./supabase.js"));
});

describe("mappers de producto: cost_tier", () => {
  it("lee el nivel de costo de la fila", () => {
    expect(dbToProduct({ id: "p1", cost_tier: "alto" }).costTier).toBe("alto");
    expect(dbToProduct({ id: "p1", cost_tier: null }).costTier).toBeNull();
  });

  it("si la columna no existe todavía, costTier queda undefined", () => {
    expect(dbToProduct({ id: "p1" }).costTier).toBeUndefined();
  });

  it("envía cost_tier cuando el producto lo trae (vacío = null)", () => {
    expect(productToDb({ id: "p1", costTier: "medio" }).cost_tier).toBe("medio");
    expect(productToDb({ id: "p1", costTier: "" }).cost_tier).toBeNull();
    expect(productToDb({ id: "p1", costTier: null }).cost_tier).toBeNull();
  });

  it("no envía cost_tier si el producto no lo trae (compatible con una BD sin la migración)", () => {
    expect("cost_tier" in productToDb({ id: "p1", name: "Tarta" })).toBe(false);
    expect("cost_tier" in productToDb(dbToProduct({ id: "p1", name: "Tarta" }))).toBe(false);
  });
});
