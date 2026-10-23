import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyWeekDays } from "../utils/weeklyMenu.js";
import { evaluateWeeklyCostRule } from "../utils/weeklyMenuRules.js";
import CostTierBadge from "./CostTierBadge.jsx";
import WeeklyCostRulePanel from "./WeeklyCostRulePanel.jsx";

const products = [
  ...["B1", "B2", "B3", "B4"].map(name => ({ name, costTier: "bajo" })),
  ...["M1", "M2", "M3"].map(name => ({ name, costTier: "medio" })),
  ...["A1", "A2", "A3"].map(name => ({ name, costTier: "alto" })),
];

const week = names => {
  const days = emptyWeekDays();
  Object.keys(days).forEach((day, i) => { days[day] = { lunch: names[i * 2] || "", dinner: names[i * 2 + 1] || "" }; });
  return days;
};
const render = names => renderToStaticMarkup(<WeeklyCostRulePanel evaluation={evaluateWeeklyCostRule(week(names), products)} />);

describe("CostTierBadge", () => {
  it("muestra el nivel con su clase de color", () => {
    expect(renderToStaticMarkup(<CostTierBadge tier="alto" />)).toContain("badge-red");
    expect(renderToStaticMarkup(<CostTierBadge tier="medio" />)).toContain("Costo medio");
    expect(renderToStaticMarkup(<CostTierBadge tier="bajo" />)).toContain("badge-green");
  });
  it("no renderiza nada sin nivel", () => {
    expect(renderToStaticMarkup(<CostTierBadge tier="" />)).toBe("");
    expect(renderToStaticMarkup(<CostTierBadge tier={null} />)).toBe("");
  });
});

describe("WeeklyCostRulePanel", () => {
  it("semana válida: confirma que cumple y no lista problemas", () => {
    const html = render(["B1", "M1", "B2", "A1", "M2", "B3", "A2", "M3", "B4", "A3"]);
    expect(html).toContain("Cumple la regla");
    expect(html).not.toContain("<li");
    expect(html).toContain('data-tier="alto" data-status="ok"');
  });

  it("semana incompleta: muestra el avance y los niveles pendientes", () => {
    const html = render(["B1", "M1"]);
    expect(html).toContain("2 de 10 menús cargados");
    expect(html).toContain('data-tier="bajo" data-status="pending"');
  });

  it("semana con demasiados platos altos: marca el nivel en error y explica el motivo", () => {
    const html = render(["A1", "B1", "A2", "B2", "A3", "B3", "M1", "A1", "M2", "B4"]);
    expect(html).toContain('data-tier="alto" data-status="error"');
    expect(html).toContain("Costo alto: 4 platos, el máximo es 3.");
  });

  it("muestra los rangos de cada nivel (3–4 y 3)", () => {
    const html = render([]);
    expect(html).toContain("de 3–4");
    expect(html).toContain("de 3<");
  });
});
