/**
 * Tests del modelo de descuento de stock.
 *
 * Cubren los bugs que motivaron unificar la lógica en stock.js:
 *  1. Pedido cerrado (típicamente en cuenta corriente) sin descontar stock.
 *  2. Doble descuento al crear el pedido y volver a descontar en "ready".
 *  3. Restauración de stock al cancelar un pedido que nunca lo descontó.
 *  4. Kits no resueltos a sus componentes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// El módulo importa el cliente de Supabase; lo mockeamos para no tocar la red
// ni depender de variables de entorno.
const rpc = vi.fn();
vi.mock("../supabase.js", () => ({ supabase: { rpc } }));

const {
  buildStockDeltas,
  stockAlreadyDeducted,
  applyStockResults,
  stockWarning,
  deductSaleStock,
  restoreSaleStock,
  syncStockForStatusChange,
  DEDUCTED_STATUSES,
} = await import("./stock.js");

beforeEach(() => {
  rpc.mockReset();
});

describe("buildStockDeltas", () => {
  it("descuenta la cantidad de un producto simple", () => {
    expect(buildStockDeltas([{ productId: "p1", qty: 3, name: "Pan" }]))
      .toEqual([{ id: "p1", delta: 3, name: "Pan" }]);
  });

  it("acumula el mismo producto repetido en varias líneas", () => {
    const deltas = buildStockDeltas([
      { productId: "p1", qty: 2, name: "Pan" },
      { productId: "p1", qty: 5, name: "Pan" },
    ]);
    expect(deltas).toEqual([{ id: "p1", delta: 7, name: "Pan" }]);
  });

  it("resuelve un kit a sus componentes multiplicando por la cantidad del kit", () => {
    const deltas = buildStockDeltas([{
      productId: "kit1", qty: 2, name: "Combo", isKit: true,
      kitItems: [
        { productId: "p1", qty: 3, name: "Pan" },
        { productId: "p2", qty: 1, name: "Torta" },
      ],
    }]);
    expect(deltas).toEqual([
      { id: "p1", delta: 6, name: "Pan" },
      { id: "p2", delta: 2, name: "Torta" },
    ]);
  });

  it("suma componentes de kit con productos sueltos del mismo id", () => {
    const deltas = buildStockDeltas([
      { productId: "p1", qty: 1, name: "Pan" },
      { productId: "kit1", qty: 2, name: "Combo", isKit: true,
        kitItems: [{ productId: "p1", qty: 3, name: "Pan" }] },
    ]);
    expect(deltas).toEqual([{ id: "p1", delta: 7, name: "Pan" }]);
  });

  it("trata como producto normal un item marcado isKit pero sin componentes", () => {
    // No perder el descuento en silencio, que es lo que hacía la versión previa.
    const deltas = buildStockDeltas([
      { productId: "p1", qty: 2, name: "Pan", isKit: true, kitItems: [] },
    ]);
    expect(deltas).toEqual([{ id: "p1", delta: 2, name: "Pan" }]);
  });

  it("soporta cantidades fraccionarias (productos por kg)", () => {
    expect(buildStockDeltas([{ productId: "p1", qty: 0.5, name: "Harina" }]))
      .toEqual([{ id: "p1", delta: 0.5, name: "Harina" }]);
  });

  it("ignora items sin id o sin cantidad", () => {
    const deltas = buildStockDeltas([
      { productId: null, qty: 3, name: "Fantasma" },
      { productId: "p1", qty: 0, name: "Pan" },
    ]);
    expect(deltas).toEqual([]);
  });

  it("devuelve lista vacía sin items", () => {
    expect(buildStockDeltas()).toEqual([]);
    expect(buildStockDeltas([])).toEqual([]);
  });
});

describe("stockAlreadyDeducted", () => {
  it.each(DEDUCTED_STATUSES)("considera descontado el estado %s", (status) => {
    expect(stockAlreadyDeducted({ status })).toBe(true);
  });

  it.each(["open", "preparing", "pending", "cancelled"])(
    "considera NO descontado el estado %s", (status) => {
      expect(stockAlreadyDeducted({ status })).toBe(false);
    }
  );

  it("no explota con una venta indefinida", () => {
    expect(stockAlreadyDeducted(undefined)).toBe(false);
  });
});

describe("applyStockResults", () => {
  it("aplica los stocks nuevos sin tocar los productos no incluidos", () => {
    const products = [
      { id: "p1", name: "Pan", stock: 10 },
      { id: "p2", name: "Torta", stock: 4 },
    ];
    const result = applyStockResults(products, [{ id: "p1", stock: 7 }]);
    expect(result).toEqual([
      { id: "p1", name: "Pan", stock: 7 },
      { id: "p2", name: "Torta", stock: 4 },
    ]);
  });

  it("devuelve la lista original si no hay resultados", () => {
    const products = [{ id: "p1", stock: 10 }];
    expect(applyStockResults(products, [])).toBe(products);
    expect(applyStockResults(products, undefined)).toBe(products);
  });
});

describe("stockWarning", () => {
  it("no avisa nada cuando el descuento salió limpio", () => {
    expect(stockWarning([{ id: "p1", stock: 5, shortfall: 0, missing: false }]))
      .toBeNull();
    expect(stockWarning([])).toBeNull();
  });

  it("avisa el faltante en lugar de dejarlo clampado en silencio", () => {
    const msg = stockWarning([
      { id: "p1", name: "Pan", stock: 0, shortfall: 3, missing: false },
    ]);
    expect(msg).toContain("Pan");
    expect(msg).toContain("3");
  });

  it("avisa los productos inexistentes", () => {
    const msg = stockWarning([{ id: "p9", name: "Borrado", missing: true }]);
    expect(msg).toContain("Borrado");
    expect(msg).toContain("inexistentes");
  });
});

describe("deductSaleStock", () => {
  it("llama a la RPC con los deltas resueltos y repone los nombres", async () => {
    rpc.mockResolvedValue({ data: [{ id: "p1", stock: 4, shortfall: 0 }], error: null });
    const results = await deductSaleStock([{ productId: "p1", qty: 2, name: "Pan" }]);

    expect(rpc).toHaveBeenCalledWith("complete_sale_stocks", {
      p_stock_deltas: [{ id: "p1", delta: 2, name: "Pan" }],
    });
    expect(results).toEqual([{ id: "p1", stock: 4, shortfall: 0, name: "Pan" }]);
  });

  it("no llama a la RPC si no hay nada que descontar", async () => {
    const results = await deductSaleStock([]);
    expect(rpc).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it("propaga el error de la RPC para que el llamador no cierre la venta", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("sin conexión") });
    await expect(deductSaleStock([{ productId: "p1", qty: 1, name: "Pan" }]))
      .rejects.toThrow("sin conexión");
  });
});

describe("restoreSaleStock", () => {
  it("restaura el stock de un pedido que lo había descontado", async () => {
    rpc.mockResolvedValue({ data: [{ id: "p1", stock: 12 }], error: null });
    const sale = { id: "s1", status: "ready", items: [{ productId: "p1", qty: 2, name: "Pan" }] };

    const { results, deltas } = await restoreSaleStock(sale);

    expect(rpc).toHaveBeenCalledWith("cancel_order_stocks", {
      p_restore_deltas: [{ id: "p1", delta: 2, name: "Pan" }],
      p_sale_id: "s1",
    });
    expect(results).toEqual([{ id: "p1", stock: 12 }]);
    expect(deltas).toEqual([{ id: "p1", delta: 2, name: "Pan" }]);
  });

  it("NO restaura stock de un pedido abierto que nunca lo descontó", async () => {
    // Bug 3: restaurar acá inflaba el stock.
    const sale = { id: "s1", status: "open", items: [{ productId: "p1", qty: 2, name: "Pan" }] };
    const { results, deltas } = await restoreSaleStock(sale);

    expect(rpc).not.toHaveBeenCalled();
    expect(results).toEqual([]);
    expect(deltas).toEqual([]);
  });

  it("NO restaura stock de un pedido en preparación", async () => {
    const sale = { id: "s1", status: "preparing", items: [{ productId: "p1", qty: 1, name: "Pan" }] };
    await restoreSaleStock(sale);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sí restaura un pedido cerrado (el stock se descontó al cerrarlo)", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const sale = { id: "s1", status: "closed", items: [{ productId: "p1", qty: 1, name: "Pan" }] };
    await restoreSaleStock(sale);
    expect(rpc).toHaveBeenCalled();
  });
});

describe("syncStockForStatusChange", () => {
  const sale = { id: "s1", status: "open", items: [{ productId: "p1", qty: 2, name: "Pan" }] };

  it("descuenta al avanzar de 'preparing' a 'ready'", async () => {
    rpc.mockResolvedValue({ data: [{ id: "p1", stock: 8, shortfall: 0 }], error: null });
    const { action } = await syncStockForStatusChange({ ...sale, status: "preparing" }, "ready");
    expect(action).toBe("deduct");
    expect(rpc).toHaveBeenCalledWith("complete_sale_stocks", expect.anything());
  });

  it("devuelve el stock al retroceder de 'ready' a 'preparing'", async () => {
    // Sin esto, retroceder dejaba el stock descontado y volver a avanzar
    // lo descontaba por segunda vez.
    rpc.mockResolvedValue({ data: [{ id: "p1", stock: 10 }], error: null });
    const { action } = await syncStockForStatusChange({ ...sale, status: "ready" }, "preparing");
    expect(action).toBe("restore");
    expect(rpc).toHaveBeenCalledWith("cancel_order_stocks", expect.anything());
  });

  it("no toca el stock entre dos estados no descontados", async () => {
    const { action } = await syncStockForStatusChange({ ...sale, status: "open" }, "preparing");
    expect(action).toBe("none");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("no toca el stock entre dos estados ya descontados", async () => {
    const { action } = await syncStockForStatusChange({ ...sale, status: "ready" }, "delivered");
    expect(action).toBe("none");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("modelo de descuento — recorridos completos", () => {
  // Simula el estado de stock a través de las RPC, para verificar que cada
  // recorrido descuente exactamente una vez.
  const runFlow = async (steps, startStock = 10) => {
    let stock = startStock;
    rpc.mockImplementation((fn, args) => {
      if (fn === "complete_sale_stocks") {
        stock -= args.p_stock_deltas[0].delta;
        return Promise.resolve({ data: [{ id: "p1", stock, shortfall: 0, missing: false }], error: null });
      }
      stock += args.p_restore_deltas[0].delta;
      return Promise.resolve({ data: [{ id: "p1", stock }], error: null });
    });
    for (const step of steps) await step();
    return stock;
  };

  const items = [{ productId: "p1", qty: 3, name: "Pan" }];

  it("pedido del Kanban cobrado sin pasar por 'ready' descuenta una sola vez", async () => {
    // Bug 1: este era el camino que dejaba el stock sin descontar.
    const sale = { id: "s1", status: "open", items };
    const stock = await runFlow([
      async () => { if (!stockAlreadyDeducted(sale)) await deductSaleStock(sale.items); },
    ]);
    expect(stock).toBe(7);
  });

  it("pedido que pasa por 'ready' y después se cobra descuenta una sola vez", async () => {
    // Bug 2: el segundo descuento no debe ocurrir.
    const sale = { id: "s1", status: "open", items };
    const stock = await runFlow([
      async () => {
        if (!stockAlreadyDeducted(sale)) await deductSaleStock(sale.items);
        sale.status = "ready";
      },
      async () => {
        if (!stockAlreadyDeducted(sale)) await deductSaleStock(sale.items);
        sale.status = "closed";
      },
    ]);
    expect(stock).toBe(7);
  });

  it("pedido descontado y luego cancelado deja el stock como estaba", async () => {
    const sale = { id: "s1", status: "open", items };
    const stock = await runFlow([
      async () => {
        if (!stockAlreadyDeducted(sale)) await deductSaleStock(sale.items);
        sale.status = "ready";
      },
      async () => { await restoreSaleStock(sale); sale.status = "cancelled"; },
    ]);
    expect(stock).toBe(10);
  });

  it("avanzar a 'ready', retroceder y volver a avanzar descuenta una sola vez", async () => {
    const sale = { id: "s1", status: "open", items };
    const move = async (to) => {
      await syncStockForStatusChange(sale, to);
      sale.status = to;
    };
    const stock = await runFlow([
      () => move("ready"),
      () => move("preparing"),
      () => move("ready"),
    ]);
    expect(stock).toBe(7);
  });

  it("pedido abierto cancelado sin haber pasado por 'ready' no altera el stock", async () => {
    const sale = { id: "s1", status: "open", items };
    const stock = await runFlow([
      async () => { await restoreSaleStock(sale); sale.status = "cancelled"; },
    ]);
    expect(stock).toBe(10);
  });
});
