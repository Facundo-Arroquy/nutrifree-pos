import { describe, expect, it, vi } from "vitest";
import { fetchAllPages } from "./supabasePagination.js";

describe("fetchAllPages", () => {
  it("recupera todas las páginas usando rangos inclusivos", async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 3 }], error: null });

    await expect(fetchAllPages(fetchPage, 2)).resolves.toEqual([
      { id: 1 }, { id: 2 }, { id: 3 },
    ]);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 1);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 3);
  });

  it("consulta una página vacía adicional cuando la última está completa", async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    await expect(fetchAllPages(fetchPage, 2)).resolves.toHaveLength(2);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("propaga el error y no devuelve un conjunto parcial", async () => {
    const error = new Error("falló la segunda página");
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }], error: null })
      .mockResolvedValueOnce({ data: null, error });

    await expect(fetchAllPages(fetchPage, 2)).rejects.toBe(error);
  });
});
