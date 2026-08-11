/**
 * ProductionKanbanSection — Módulo de Producción Kanban.
 *
 * Diseño: items "Pendientes" son VIRTUALES (computados de pedidos activos, sin DB).
 * Solo se persisten en DB las tarjetas in_progress y ready.
 *
 * Interacción:
 *  - Click en cualquier tarjeta → modal contextual con qty y acciones
 *  - Drag a columna diferente → mismo modal (qty obligatoria en movimientos hacia adelante)
 *  - Movimientos hacia atrás (← Pendientes, Listo → En elab): sin modal, directo
 *
 * Props: sales, products, setProducts, user, showToast, logAction
 */
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Ico, Modal } from "../shared.jsx";
import { supabase } from "../supabase.js";

const PROD_COLUMNS = [
  { id: "pending",     label: "Pendientes",     icon: "⏳" },
  { id: "in_progress", label: "En elaboración", icon: "🍳" },
  { id: "ready",       label: "Listos",         icon: "✅" },
];

// ── Lógica pura (exportada para tests) ───────────────────────────────────────

export function computePendingItems(sales, products) {
  const activeSales = sales.filter(s => ["open", "preparing"].includes(s.status));
  const consolidated = {};

  for (const sale of activeSales) {
    for (const item of sale.items || []) {
      if (item.isKit) continue;
      const product = products.find(p => p.id === item.productId);
      if (!product || product.kitItems?.length > 0) continue;

      if (!consolidated[item.productId]) {
        consolidated[item.productId] = {
          productId:    item.productId,
          productName:  item.name || product.name,
          qtyRequested: 0,
          stock:        product.stock || 0,
        };
      }
      consolidated[item.productId].qtyRequested += item.qty;
    }
  }

  return Object.values(consolidated)
    .map(p => ({ ...p, qtyToProduce: Math.max(0, p.qtyRequested - p.stock) }))
    .filter(p => p.qtyToProduce > 0);
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ProductionKanbanSection({
  sales, products, setProducts, user, showToast, logAction,
}) {
  const [dbCards, setDbCards]           = useState([]);
  const [loading, setLoading]           = useState(false);
  const [clearing, setClearing]         = useState(false);
  const [draggingId, setDraggingId]     = useState(null);
  const [dragOverCol, setDragOverCol]   = useState(null);

  // ── Modal de confirmación ─────────────────────────────────────────────────
  // modal: { title, subtitle, qtyLabel, suggestedQty, actions: [{label, primary, requiresQty, fn}] }
  const [modal, setModal]               = useState(null);
  const [modalQty, setModalQty]         = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);

  const isAdmin = user?.role === "admin";

  // Refs para closures estables en touch listeners
  const dbCardsRef       = useRef(dbCards);
  const pendingItemsRef  = useRef([]);
  const dispatchDropRef  = useRef(null);
  useEffect(() => { dbCardsRef.current = dbCards; });

  // ── Cargar tarjetas DB (solo in_progress y ready) ─────────────────────────
  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("production_kanban")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      setDbCards(data || []);
    } catch (err) {
      showToast("Error al cargar tablero: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Carga inicial con guard contra React Strict Mode double-mount
  useEffect(() => {
    let active = true;
    loadCards().then(() => { if (!active) return; });
    return () => { active = false; };
  }, [loadCards]);

  // ── Items pendientes (virtuales) ──────────────────────────────────────────
  const pendingItems = useMemo(() => {
    const activeIds = new Set(
      dbCards.filter(c => c.status === "in_progress").map(c => c.product_id)
    );
    return computePendingItems(sales, products).filter(
      item => !activeIds.has(item.productId)
    );
  }, [sales, products, dbCards]);

  // Products que ya tienen tarjeta "ready" → el virtual es un "faltante"
  const readyProductIds = useMemo(
    () => new Set(dbCards.filter(c => c.status === "ready").map(c => c.product_id)),
    [dbCards]
  );

  useEffect(() => { pendingItemsRef.current = pendingItems; }, [pendingItems]);

  // ── Promover item virtual → DB ────────────────────────────────────────────
  const promoteVirtualItem = useCallback(async (item, newStatus, qty) => {
    if (newStatus === "pending") return;
    const qtyToProduce = qty ?? item.qtyToProduce;

    const newCard = {
      id:             crypto.randomUUID(),
      product_id:     item.productId,
      product_name:   item.productName,
      qty_requested:  item.qtyRequested,
      qty_stock:      item.stock,
      qty_to_produce: qtyToProduce,
      status:         newStatus,
      stock_updated:  false,
      created_at:     new Date().toISOString(),
      updated_at:     new Date().toISOString(),
    };

    try {
      if (newStatus === "ready" && qtyToProduce > 0) {
        const { data, error } = await supabase.rpc("adjust_product_stock", {
          p_id:    item.productId,
          p_delta: qtyToProduce,
        });
        if (error) throw error;
        newCard.stock_updated = true;
        setProducts(prev => prev.map(p =>
          p.id === item.productId ? { ...p, stock: data } : p
        ));
        const faltante = item.qtyToProduce - qtyToProduce;
        logAction?.("producción", "kanban",
          `+${qtyToProduce} u. de "${item.productName}" — Kanban Listo` +
          (faltante > 0 ? ` (faltante: ${faltante} u.)` : ""));
        if (faltante > 0) {
          showToast(
            `✅ +${qtyToProduce} u. al stock — ⚠️ Faltante: ${faltante} u. de "${item.productName}" (nueva tarjeta en Pendientes)`,
            "warning"
          );
        } else {
          showToast(`✅ ${item.productName}: +${qtyToProduce} unidades al stock`);
        }
      }

      const { error } = await supabase.from("production_kanban").insert({
        id:             newCard.id,
        product_id:     newCard.product_id,
        product_name:   newCard.product_name,
        qty_requested:  newCard.qty_requested,
        qty_stock:      newCard.qty_stock,
        qty_to_produce: newCard.qty_to_produce,
        status:         newCard.status,
        stock_updated:  newCard.stock_updated,
      });
      if (error) throw error;
      setDbCards(prev => [...prev, newCard]);
    } catch (err) {
      showToast("Error: " + err.message, "error");
    }
  }, [logAction, setProducts, showToast]);

  // ── Mover tarjeta DB ──────────────────────────────────────────────────────
  const moveDbCard = useCallback(async (cardId, newStatus, customQty) => {
    const card = dbCardsRef.current.find(c => c.id === cardId);
    if (!card || card.status === newStatus) return;

    const wasReady    = card.status === "ready";
    const willBeReady = newStatus === "ready";
    const goToPending = newStatus === "pending";

    try {
      // ← Volver a Pendientes: eliminar de DB
      if (goToPending) {
        if (wasReady && card.stock_updated && card.qty_to_produce > 0) {
          const { data, error } = await supabase.rpc("adjust_product_stock", {
            p_id:    card.product_id,
            p_delta: -card.qty_to_produce,
          });
          if (error) throw error;
          setProducts(prev => prev.map(p =>
            p.id === card.product_id ? { ...p, stock: data } : p
          ));
          showToast("Stock revertido — la tarjeta volvió a Pendientes", "info");
        }
        const { error } = await supabase.from("production_kanban").delete().eq("id", cardId);
        if (error) throw error;
        setDbCards(prev => prev.filter(c => c.id !== cardId));
        return;
      }

      const patch = { status: newStatus, updated_at: new Date().toISOString() };

      // → Listo: suma stock con la qty real (puede diferir de la planificada)
      if (willBeReady && !card.stock_updated) {
        const qtyToUse = customQty ?? card.qty_to_produce;
        patch.qty_to_produce = qtyToUse;
        if (qtyToUse > 0) {
          const { data, error } = await supabase.rpc("adjust_product_stock", {
            p_id:    card.product_id,
            p_delta: qtyToUse,
          });
          if (error) throw error;
          patch.stock_updated = true;
          setProducts(prev => prev.map(p =>
            p.id === card.product_id ? { ...p, stock: data } : p
          ));
          const faltante = card.qty_to_produce - qtyToUse;
          logAction?.("producción", "kanban",
            `+${qtyToUse} u. de "${card.product_name}" — Kanban Listo` +
            (faltante > 0 ? ` (faltante: ${faltante} u.)` : ""));
          if (faltante > 0) {
            showToast(
              `✅ +${qtyToUse} u. al stock — ⚠️ Faltante: ${faltante} u. de "${card.product_name}" (nueva tarjeta en Pendientes)`,
              "warning"
            );
          } else {
            showToast(`✅ ${card.product_name}: +${qtyToUse} unidades al stock`);
          }
        }
      }

      // ← Listo → En elaboración: revierte stock
      if (wasReady && !willBeReady && card.stock_updated && card.qty_to_produce > 0) {
        const { data, error } = await supabase.rpc("adjust_product_stock", {
          p_id:    card.product_id,
          p_delta: -card.qty_to_produce,
        });
        if (error) throw error;
        patch.stock_updated = false;
        setProducts(prev => prev.map(p =>
          p.id === card.product_id ? { ...p, stock: data } : p
        ));
        showToast("Stock revertido — la tarjeta volvió atrás", "info");
      }

      const { error } = await supabase.from("production_kanban").update(patch).eq("id", cardId);
      if (error) throw error;
      setDbCards(prev => prev.map(c => c.id === cardId ? { ...c, ...patch } : c));
    } catch (err) {
      showToast("Error: " + err.message, "error");
    }
  }, [logAction, setProducts, showToast]);

  // ── Vaciar tablero (solo admin) ────────────────────────────────────────────
  const clearBoard = async () => {
    if (!confirm(
      "¿Vaciar el tablero de producción?\n\n" +
      "Se eliminan todas las tarjetas. El stock ya registrado NO se revierte."
    )) return;
    setClearing(true);
    try {
      const ids = dbCardsRef.current.map(c => c.id);
      if (ids.length === 0) { showToast("El tablero ya está vacío"); return; }
      const { error } = await supabase.from("production_kanban").delete().in("id", ids);
      if (error) throw error;
      setDbCards([]);
      logAction?.("limpiar", "kanban", "Tablero de producción vaciado");
      showToast("Tablero vaciado ✓");
    } catch (err) {
      showToast("Error: " + err.message, "error");
    } finally {
      setClearing(false);
    }
  };

  // ── Abrir modales ─────────────────────────────────────────────────────────

  const openVirtualModal = (item, forcedTarget = null) => {
    const actions = forcedTarget
      ? [{
          label:       forcedTarget === "in_progress" ? "🍳 Pasar a En elaboración" : "✅ Marcar como Listo",
          primary:     true,
          requiresQty: true,
          fn:          async (qty) => await promoteVirtualItem(item, forcedTarget, qty),
        }]
      : [
          {
            label:       "🍳 En elaboración",
            primary:     false,
            requiresQty: true,
            fn:          async (qty) => await promoteVirtualItem(item, "in_progress", qty),
          },
          {
            label:       "✅ Listo",
            primary:     true,
            requiresQty: true,
            fn:          async (qty) => await promoteVirtualItem(item, "ready", qty),
          },
        ];

    setModal({
      title:        item.productName,
      subtitle:     `Solicitados: ${item.qtyRequested} · Stock actual: ${item.stock}`,
      qtyLabel:     "¿Cuánto vas a producir?",
      suggestedQty: item.qtyToProduce,
      actions,
    });
    setModalQty(String(item.qtyToProduce));
  };

  const openInProgressModal = (card, forcedTarget = null) => {
    const actions = forcedTarget
      ? [{
          label:       "✅ Marcar como Listo",
          primary:     true,
          requiresQty: true,
          fn:          async (qty) => await moveDbCard(card.id, "ready", qty),
        }]
      : [
          {
            label:       "← Volver a Pendientes",
            primary:     false,
            requiresQty: false,
            fn:          async () => await moveDbCard(card.id, "pending"),
          },
          {
            label:       "✅ Marcar como Listo",
            primary:     true,
            requiresQty: true,
            fn:          async (qty) => await moveDbCard(card.id, "ready", qty),
          },
        ];

    setModal({
      title:        card.product_name,
      subtitle:     `Planificado: ${card.qty_to_produce} unidades`,
      qtyLabel:     "¿Cuánto produciste?",
      suggestedQty: card.qty_to_produce,
      actions,
    });
    setModalQty(String(card.qty_to_produce));
  };

  const openReadyModal = (card) => {
    setModal({
      title:        card.product_name,
      subtitle:     `✅ ${card.qty_to_produce} unidades producidas`,
      qtyLabel:     null,
      suggestedQty: null,
      actions: [{
        label:       "← Volver a En elaboración",
        primary:     false,
        requiresQty: false,
        fn:          async () => await moveDbCard(card.id, "in_progress"),
      }],
    });
    setModalQty("");
  };

  // ── Dispatch drop (drag y touch) ──────────────────────────────────────────
  const dispatchDrop = useCallback((draggedId, newStatus) => {
    const isVirtual = draggedId.startsWith("virtual-");

    if (isVirtual) {
      const productId = draggedId.replace("virtual-", "");
      const item = pendingItemsRef.current.find(p => p.productId === productId);
      if (!item || newStatus === "pending") return;
      openVirtualModal(item, newStatus);
    } else {
      const card = dbCardsRef.current.find(c => c.id === draggedId);
      if (!card || card.status === newStatus) return;

      if (newStatus === "pending") {
        // Movimiento hacia atrás: sin modal
        moveDbCard(draggedId, "pending");
      } else if (newStatus === "in_progress" && card.status === "ready") {
        // Listo → En elaboración (hacia atrás): sin modal
        moveDbCard(draggedId, "in_progress");
      } else if (newStatus === "ready" && card.status === "in_progress") {
        // En elaboración → Listo (hacia adelante): pide qty
        openInProgressModal(card, "ready");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveDbCard]);

  useEffect(() => { dispatchDropRef.current = dispatchDrop; }, [dispatchDrop]);

  // ── Ejecutar acción del modal ──────────────────────────────────────────────
  const runModalAction = async (action) => {
    if (modalSubmitting) return;
    const qty = parseInt(modalQty, 10);
    if (action.requiresQty && (!qty || qty <= 0)) {
      showToast("Ingresá una cantidad válida", "error");
      return;
    }
    setModalSubmitting(true);
    try {
      await action.fn(action.requiresQty ? qty : undefined);
      setModal(null);
    } finally {
      setModalSubmitting(false);
    }
  };

  // ── Drag & Drop (escritorio) ───────────────────────────────────────────────
  const handleDragStart = (e, id) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("cardId", id);
  };

  const handleDragOver = (e, colId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(colId);
  };

  const handleDrop = (e, newStatus) => {
    e.preventDefault();
    setDragOverCol(null);
    const draggedId = e.dataTransfer.getData("cardId");
    setDraggingId(null);
    dispatchDrop(draggedId, newStatus);
  };

  const handleDragEnd = () => { setDraggingId(null); setDragOverCol(null); };

  // ── Touch drag (tablets) ───────────────────────────────────────────────────
  const touchRef = useRef({ cardId: null, active: false, startX: 0, startY: 0, overCol: null });

  const handleTouchStart = (e, id) => {
    const t = e.touches[0];
    touchRef.current = { cardId: id, active: false, startX: t.clientX, startY: t.clientY, overCol: null };
  };

  useEffect(() => {
    const onMove = (e) => {
      const { cardId, startX, startY } = touchRef.current;
      if (!cardId) return;
      const t = e.touches[0];
      if (!touchRef.current.active) {
        const dist = Math.abs(t.clientX - startX) + Math.abs(t.clientY - startY);
        if (dist < 8) return;
        touchRef.current.active = true;
        setDraggingId(cardId);
      }
      e.preventDefault();
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const col = el?.closest("[data-prod-col]")?.dataset.prodCol ?? null;
      touchRef.current.overCol = col;
      setDragOverCol(col);
    };

    const onEnd = () => {
      const { active, cardId, overCol } = touchRef.current;
      touchRef.current = { cardId: null, active: false, startX: 0, startY: 0, overCol: null };
      setDraggingId(null);
      setDragOverCol(null);
      if (!active || !cardId || !overCol) return;
      dispatchDropRef.current?.(cardId, overCol);
    };

    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend",  onEnd);
    return () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend",  onEnd);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ─────────────────────────────────────────────────────────────────
  const readyCards  = dbCards.filter(c => c.status === "ready");
  const inProgCards = dbCards.filter(c => c.status === "in_progress");
  const totalCards  = pendingItems.length + inProgCards.length + readyCards.length;

  return (
    <div>
      {/* Controles */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16, flexWrap: "wrap", gap: 8,
      }}>
        <div style={{ fontSize: ".84em", color: "var(--t3)" }}>
          {loading
            ? "Cargando..."
            : `${totalCards} tarjeta${totalCards !== 1 ? "s" : ""} · ${readyCards.length} listo${readyCards.length !== 1 ? "s" : ""} hoy`}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={loadCards} disabled={loading}>
            <Ico n="refresh" s={13}/> Actualizar
          </button>
          {isAdmin && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={clearBoard}
              disabled={clearing || dbCards.length === 0}
              style={{ color: "var(--red)", borderColor: "var(--red)" }}
            >
              <Ico n="trash" s={13}/> Vaciar tablero
            </button>
          )}
        </div>
      </div>

      {/* Sin contenido */}
      {totalCards === 0 && !loading && (
        <div style={{
          background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 10,
          padding: "20px 24px", marginBottom: 16, fontSize: ".85em", color: "var(--t3)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <Ico n="alert" s={16} c="var(--amber)"/>
          Sin productos a elaborar. Aparecen automáticamente cuando hay pedidos
          activos con stock insuficiente.
        </div>
      )}

      {/* Kanban */}
      <div className="kanban-board-wrap">
        <div className="kanban-board">
          {PROD_COLUMNS.map(col => {
            const isOver     = dragOverCol === col.id;
            const colPending = col.id === "pending" ? pendingItems : [];
            const colDb      = col.id !== "pending" ? dbCards.filter(c => c.status === col.id) : [];
            const colCount   = colPending.length + colDb.length;

            return (
              <div
                key={col.id}
                data-prod-col={col.id}
                onDragOver={e  => handleDragOver(e, col.id)}
                onDrop={e      => handleDrop(e, col.id)}
                onDragLeave={() => { if (dragOverCol === col.id) setDragOverCol(null); }}
                style={{
                  background:   isOver ? "var(--s2)" : "var(--s1)",
                  border:       `2px ${isOver ? "dashed var(--accent)" : "solid var(--border)"}`,
                  borderRadius: 14,
                  minHeight:    220,
                  padding:      "12px 10px",
                  transition:   "background .12s, border-color .12s",
                }}
              >
                {/* Cabecera columna */}
                <div style={{
                  display: "flex", alignItems: "center",
                  justifyContent: "space-between", marginBottom: 10,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{col.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: ".87em" }}>{col.label}</span>
                  </div>
                  <span style={{
                    background: "var(--s2)", borderRadius: 20,
                    padding: "2px 9px", fontSize: ".77em", fontWeight: 700, color: "var(--t3)",
                  }}>{colCount}</span>
                </div>

                {/* Items virtuales (Pendientes) */}
                {colPending.map(item => {
                  const vid        = `virtual-${item.productId}`;
                  const isDragging = draggingId === vid;
                  const isFaltante = readyProductIds.has(item.productId);
                  return (
                    <div
                      key={vid}
                      draggable
                      onDragStart={e  => handleDragStart(e, vid)}
                      onDragEnd={handleDragEnd}
                      onTouchStart={e => handleTouchStart(e, vid)}
                      onClick={() => openVirtualModal(item)}
                      style={{
                        background:   isFaltante ? "var(--amberl, #fffbeb)" : "var(--bg1)",
                        border:       `1px solid ${isFaltante ? "var(--amber, #d97706)" : "var(--border)"}`,
                        borderRadius: 10,
                        padding:      "12px 14px",
                        marginBottom: 8,
                        cursor:       "pointer",
                        opacity:      isDragging ? 0.4 : 1,
                        boxShadow:    isDragging ? "none" : "0 1px 4px rgba(0,0,0,.07)",
                        transition:   "opacity .12s, box-shadow .12s",
                        userSelect:   "none",
                        touchAction:  "none",
                      }}
                    >
                      <div style={{
                        display: "flex", alignItems: "center",
                        justifyContent: "space-between", marginBottom: 7,
                      }}>
                        <span style={{ fontWeight: 700, fontSize: ".95em" }}>{item.productName}</span>
                        {isFaltante && (
                          <span style={{
                            background: "var(--amber, #d97706)", color: "#fff",
                            borderRadius: 6, padding: "1px 7px", fontSize: ".68em", fontWeight: 700,
                          }}>
                            FALTANTE
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: ".82em", color: "var(--t3)", lineHeight: 1.8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>Solicitados</span><strong>{item.qtyRequested}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>Stock actual</span><strong>{item.stock}</strong>
                        </div>
                        <div style={{
                          display: "flex", justifyContent: "space-between",
                          color: "var(--amber, #d97706)", fontWeight: 700,
                          borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4,
                        }}>
                          <span>A producir</span><span>{item.qtyToProduce}</span>
                        </div>
                      </div>
                      <div style={{ marginTop: 8, fontSize: ".72em", color: "var(--t4)", textAlign: "right" }}>
                        Tap para elaborar →
                      </div>
                    </div>
                  );
                })}

                {/* Tarjetas DB (in_progress y ready) */}
                {colDb.map(card => {
                  const isDragging = draggingId === card.id;
                  const isReady    = card.status === "ready";
                  return (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={e  => handleDragStart(e, card.id)}
                      onDragEnd={handleDragEnd}
                      onTouchStart={e => handleTouchStart(e, card.id)}
                      onClick={() => isReady ? openReadyModal(card) : openInProgressModal(card)}
                      style={{
                        background:   isReady ? "var(--greenl, #f0fdf4)" : "var(--s2)",
                        border:       `1px solid ${isReady ? "var(--greenlb, #bbf7d0)" : "var(--accent)"}`,
                        borderRadius: 10,
                        padding:      "12px 14px",
                        marginBottom: 8,
                        cursor:       "pointer",
                        opacity:      isDragging ? 0.4 : 1,
                        boxShadow:    isDragging ? "none" : "0 1px 4px rgba(0,0,0,.07)",
                        transition:   "opacity .12s",
                        userSelect:   "none",
                        touchAction:  "none",
                      }}
                    >
                      <div style={{
                        fontWeight: 700, fontSize: ".95em", marginBottom: 7,
                        color: isReady ? "var(--green)" : "var(--t1)",
                      }}>
                        {card.product_name}
                      </div>
                      {isReady ? (
                        <div style={{ fontSize: ".82em", color: "var(--green)", fontWeight: 600 }}>
                          ✓ {card.qty_to_produce} unidades producidas
                        </div>
                      ) : (
                        <div style={{ fontSize: ".82em", color: "var(--t3)", lineHeight: 1.8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>Solicitados</span><strong>{card.qty_requested}</strong>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>Stock al inicio</span><strong>{card.qty_stock}</strong>
                          </div>
                          <div style={{
                            display: "flex", justifyContent: "space-between",
                            color: "var(--amber, #d97706)", fontWeight: 700,
                            borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4,
                          }}>
                            <span>A producir</span><span>{card.qty_to_produce}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Columna vacía */}
                {colCount === 0 && (
                  <div style={{
                    textAlign: "center", color: "var(--t4)",
                    fontSize: ".8em", padding: "28px 0", fontStyle: "italic",
                  }}>
                    {col.id === "pending" ? "Sin productos pendientes" : "Arrastrá una tarjeta acá"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Modal de acción ───────────────────────────────────────────────── */}
      {modal && (
        <Modal title={modal.title} onClose={() => !modalSubmitting && setModal(null)}>
          {/* Subtítulo / contexto */}
          {modal.subtitle && (
            <div style={{
              background: "var(--s1)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "8px 12px", marginBottom: 16,
              fontSize: ".84em", color: "var(--t3)",
            }}>
              {modal.subtitle}
            </div>
          )}

          {/* Input de cantidad */}
          {modal.qtyLabel && (
            <div style={{ marginBottom: 20 }}>
              <label className="lbl">{modal.qtyLabel} *</label>
              <input
                type="number"
                min={1}
                value={modalQty}
                onChange={e => setModalQty(e.target.value)}
                autoFocus
                style={{ marginTop: 6, fontSize: "1.1em", fontWeight: 600 }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    const primary = modal.actions.find(a => a.primary);
                    if (primary) runModalAction(primary);
                  }
                }}
              />
              {modal.suggestedQty !== null && String(parseInt(modalQty)) !== String(modal.suggestedQty) && (
                <div style={{ fontSize: ".75em", color: "var(--t4)", marginTop: 4 }}>
                  Sugerido: {modal.suggestedQty} u. (basado en pedidos activos)
                </div>
              )}
            </div>
          )}

          {/* Acciones */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button
              className="btn btn-secondary"
              onClick={() => setModal(null)}
              disabled={modalSubmitting}
            >
              Cancelar
            </button>
            {modal.actions.map((action, i) => {
              const qty = parseInt(modalQty, 10);
              const disabled = modalSubmitting || (action.requiresQty && (!qty || qty <= 0));
              return (
                <button
                  key={i}
                  className={`btn ${action.primary ? "btn-primary" : "btn-blue"}`}
                  onClick={() => runModalAction(action)}
                  disabled={disabled}
                >
                  {modalSubmitting ? "Guardando..." : action.label}
                </button>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
