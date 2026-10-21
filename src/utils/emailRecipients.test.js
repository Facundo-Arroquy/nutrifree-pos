import { describe, expect, it } from "vitest";
import { invalidEmailRecipients, normalizeEmailRecipients, splitEmailRecipients } from "./emailRecipients.js";

describe("emailRecipients", () => {
  it("acepta comas, punto y coma y saltos de línea", () => {
    expect(splitEmailRecipients("Uno@Ejemplo.com; dos@ejemplo.com\ntres@ejemplo.com")).toEqual([
      "uno@ejemplo.com",
      "dos@ejemplo.com",
      "tres@ejemplo.com",
    ]);
  });

  it("normaliza y elimina destinatarios repetidos", () => {
    expect(normalizeEmailRecipients("uno@ejemplo.com, UNO@ejemplo.com; dos@ejemplo.com"))
      .toBe("uno@ejemplo.com, dos@ejemplo.com");
  });

  it("identifica direcciones inválidas", () => {
    expect(invalidEmailRecipients("bien@ejemplo.com, incorrecto, otro@ejemplo.com"))
      .toEqual(["incorrecto"]);
  });
});
