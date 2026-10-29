import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyWeekDays } from "../utils/weeklyMenu.js";
import { computeWeeklyProduction } from "../utils/weeklyProduction.js";
import WeeklyIngredientsPanel from "./WeeklyIngredientsPanel.jsx";

const ingredients = [
  { id: "pechuga", name: "Pechuga", unit: "kg", category: "Carnes" },
  { id: "calabaza", name: "Calabaza", unit: "kg", category: "Verduras" },
];
const products = [{ id: "p1", name: "Pechuga con puré" }, { id: "p2", name: "Tarta sin receta" }];
const recipes = [{ id: "r1", productId: "p1", yield: 1, ingredients: [{ ingredientId: "pechuga", qty: 0.18 }, { ingredientId: "calabaza", qty: 0.3 }] }];

const render = items => {
  const days = emptyWeekDays();
  items.forEach(([day, meal, name, qty]) => { days[day][meal] = name; days[day].qty[meal] = qty; });
  const production = computeWeeklyProduction({ days, products, recipes, ingredients });
  return renderToStaticMarkup(<WeeklyIngredientsPanel production={production} weekStart="2026-10-26" />);
};

describe("WeeklyIngredientsPanel", () => {
  it("sin unidades cargadas muestra el aviso vacío y no dibuja la tabla", () => {
    const html = render([]);
    expect(html).toContain("Sin unidades cargadas");
    expect(html).toContain("Todavía no hay ingredientes para mostrar");
    expect(html).not.toContain("<table");
  });

  it("muestra las unidades a producir y su desglose por comida", () => {
    const html = render([["monday", "lunch", "Pechuga con puré", 30], ["monday", "dinner", "Pechuga con puré", 20], ["friday", "keto", "Pechuga con puré", 10]]);
    expect(html).toContain("60 unidades a producir");
    expect(html).toContain("Almuerzo 30 · Cena 20 · Keto 10");
  });

  it("arma la tabla: días con fecha, categorías, cantidades por día y total semanal", () => {
    const html = render([["monday", "lunch", "Pechuga con puré", 30], ["wednesday", "dinner", "Pechuga con puré", 10]]);
    expect(html).toContain("Lun 26");
    expect(html).toContain("Vie 30");
    expect(html).toContain("Total semana");
    expect(html.indexOf("Carnes")).toBeLessThan(html.indexOf("Verduras"));
    expect(html).toContain(">5,4<");   // pechuga lunes: 0,18 × 30
    expect(html).toContain(">1,8<");   // pechuga miércoles
    expect(html).toContain(">7,2<");   // pechuga total
    expect(html).toContain(">12<");    // calabaza total: 0,3 × 40
    expect(html).toContain(">—<");     // días sin producción
  });

  it("lista los platos que no suman con el motivo", () => {
    const html = render([["monday", "lunch", "Pechuga con puré", 30], ["tuesday", "dinner", "Tarta sin receta", 12], ["thursday", "keto", "Pechuga con puré", ""]]);
    expect(html).toContain('role="alert"');
    expect(html).toContain("2 platos no suman completo");
    expect(html).toContain("Martes · Cena");
    expect(html).toContain("no tiene receta con cantidades cargadas");
    expect(html).toContain("falta cargar las unidades a producir");
  });

  it("un menú sin problemas no muestra el aviso", () => {
    expect(render([["monday", "lunch", "Pechuga con puré", 5]])).not.toContain('role="alert"');
  });
});
