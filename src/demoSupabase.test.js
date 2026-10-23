import { beforeEach, describe, expect, it } from "vitest";

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
  clear: () => values.clear(),
};

const { demoClient } = await import("./demoSupabase.js");

describe("demoSupabase pagination", () => {
  beforeEach(() => values.clear());

  it("soporta rangos inclusivos luego de ordenar", async () => {
    localStorage.setItem("nutrifree_demo_products", JSON.stringify([
      { id: "3", name: "C" },
      { id: "1", name: "A" },
      { id: "2", name: "B" },
    ]));

    const { data, error } = await demoClient.from("products")
      .select("*")
      .order("name")
      .range(1, 2);

    expect(error).toBeNull();
    expect(data.map(row => row.name)).toEqual(["B", "C"]);
  });
});
