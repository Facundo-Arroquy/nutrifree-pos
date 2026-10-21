import { describe, expect, it } from "vitest";
import { assertSafeSupabaseEnvironment, isLocalSupabaseUrl } from "./supabaseEnvironment.js";

describe("protección del entorno Supabase", () => {
  it("reconoce las URLs locales", () => {
    expect(isLocalSupabaseUrl("http://127.0.0.1:54321")).toBe(true);
    expect(isLocalSupabaseUrl("http://localhost:54321")).toBe(true);
  });

  it("bloquea una URL remota en el navegador de desarrollo", () => {
    expect(() => assertSafeSupabaseEnvironment({
      url: "https://proyecto.supabase.co",
      isDevelopment: true,
      hasWindow: true,
    })).toThrow(/Desarrollo bloqueado/);
  });

  it("no altera el build productivo", () => {
    expect(() => assertSafeSupabaseEnvironment({
      url: "https://proyecto.supabase.co",
      isDevelopment: false,
      hasWindow: true,
    })).not.toThrow();
  });
});
