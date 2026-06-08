# Memoria del proyecto — NutriFree POS

## Stack
- Vite + React (NO Next.js — ignorar sugerencias de "use client")
- Supabase (PostgreSQL + Auth + Realtime)
- CSS custom (sin Tailwind)

## Archivos clave
- `src/App.jsx` — auth, routing, sidebar, SETTINGS_SECTIONS, props globales
- `src/supabase.js` — cliente Supabase + mappers camelCase↔snake_case
- `src/pages/CustomersPage.jsx` — C/C clientes, custBal(), computeAllocations(), registerPayment()
- `src/pages/POSPage.jsx` — punto de venta
- `src/shared.jsx` — Ico (SVG icons), Modal, componentes UI compartidos
- `TABLAS.md` — descripción de todas las tablas de la DB
- `AUDITORIA.md` — queries periódicas de control de integridad
- `CAMBIOS_2026-05-20.md` — registro de cambios del 2026-05-20 con instrucciones de reversión

## Roles de usuario
- `admin`: emails que empiezan con "admin@..."
- `vendor`: cualquier otro email
- El objeto `user` se pasa como prop (no hay Context API)

## Cuentas Corrientes — lógica
- `custBal(id)` = suma de account_payments filtrados por customerId. Positivo = crédito, negativo = deuda.
- `computeAllocations()` usa SOLO movimientos sin `saleId` para evitar double counting.
- Al aplicar crédito a un pedido se crean DOS registros: payment(saleId) + charge(sin saleId, "Crédito consumido").
- `customers.balance` en DB está desincronizado — NO se usa para display, solo `custBal()`.

## Auditoría semanal
- Archivo: `AUDITORIA.md`
- Query 1: créditos sin consumo (resultado esperado: 0 filas)
- Query 2: balance guardado vs real
- Query 3: ventas en cuenta sin cargo en account_payments
- Registrar resultados en la tabla "Historial de ejecuciones" de AUDITORIA.md

## Cambios 2026-05-20
1. Backup admin en Configuración → Settings → Backup
2. Fix double counting en computeAllocations (filtro !p.saleId)
3. Fix consumo de crédito en registerPayment (agrega charge "Crédito consumido")
4. Migración SQL pendiente: 3 INSERTs en account_payments (ver CAMBIOS_2026-05-20.md)
