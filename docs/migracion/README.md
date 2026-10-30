# Plan de migración — NutriFree POS → FastAPI + React + Tailwind

> Plan para ejecutar con **Codex**, tarea por tarea. Fecha: 2026-10-30.
> Rama: `docs/plan-migracion-fastapi-react` (base: `main`).

## Objetivo

Pasar de la SPA actual (Vite + React que habla directo con Supabase desde el
navegador) a dos repos privados con responsabilidades separadas:

| Repo | Contenido | Stack |
|---|---|---|
| [`Facundo-Arroquy/nutrifree-api`](https://github.com/Facundo-Arroquy/nutrifree-api) | API REST, reglas de negocio, acceso a datos, pagos, archivos | Python · FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL 17 |
| [`Facundo-Arroquy/nutrifree-web`](https://github.com/Facundo-Arroquy/nutrifree-web) | Panel interno + sitio público (landing, menú, mayorista) | React · TypeScript · Vite · Tailwind CSS v4 · TanStack Query |

**Sin perder información:** en desarrollo todo corre en Docker con datos
ficticios. En producción la API se conecta a la **misma base de Supabase de hoy**
(proyecto `lasiauvrppslxumksggz`): mismo esquema, mismos usuarios y contraseñas,
mismos archivos. No hay migración de datos, solo de código.

Acceso a los repos: `Facundo-Arroquy` (dueño) y `FacundoArroquy` (colaborador).

## Documentos

| Documento | Para qué |
|---|---|
| [01-arquitectura.md](01-arquitectura.md) | Arquitectura objetivo, decisiones, convenciones y seguridad |
| [02-backend.md](02-backend.md) | Fases **B0–B10** del repo `nutrifree-api` |
| [03-frontend.md](03-frontend.md) | Fases **F0–F10** del repo `nutrifree-web` |
| [04-datos-y-produccion.md](04-datos-y-produccion.md) | Docker local, migraciones, conexión a Supabase y salida a producción (**P0–P6**) |
| [05-prompts-codex.md](05-prompts-codex.md) | Prompts listos para pegar en Codex |
| [anexos/inventario-legacy.md](anexos/inventario-legacy.md) | Qué existe hoy: tablas, funciones SQL, páginas y su destino |
| [anexos/frontend_design.md](anexos/frontend_design.md) | Guía de diseño de interfaces que debe seguir el front |
| [plantillas/AGENTS.api.md](plantillas/AGENTS.api.md) | `AGENTS.md` para la raíz de `nutrifree-api` |
| [plantillas/AGENTS.web.md](plantillas/AGENTS.web.md) | `AGENTS.md` para la raíz de `nutrifree-web` |

## Cómo se ejecuta con Codex

1. Clonar los tres repos como carpetas hermanas:

   ```
   ~/Devs/
   ├── nutrifree-pos/   ← legado: solo lectura, fuente de las reglas de negocio
   ├── nutrifree-api/
   └── nutrifree-web/
   ```

2. Abrir Codex (CLI o extensión del IDE) **dentro** de `nutrifree-api` o de
   `nutrifree-web`. Codex tiene que poder leer `../nutrifree-pos`: las fases de
   paridad copian reglas del código viejo. Por eso no conviene Codex Cloud (ve un
   solo repo).
3. **Una tarea = una rama = un PR chico**, con tests y `make check` en verde.
   Nombre de rama: `feat/b3-catalogo`, `feat/f5-pos`, `chore/b0-tooling`…
4. Cada PR lo revisa una persona antes de mergear. Codex nunca mergea ni hace
   push a `main`.
5. Nada se conecta a producción hasta la fase **P**. Hasta entonces el sistema
   actual sigue funcionando igual.

## Orden de ejecución

```
P0 (vos: backups, dump de esquema, datos de Supabase y MercadoPago)
 │
 ├─ API: B0 → B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8 → B9 → B10 ─┐
 │                     │    │    │    │    │    │    │    │      │
 └─ Web: F0 → F1 → F2 ─┴→ F3 → F4 → F5 → F6 → F7 → F8 → F9 → F10 ┴→ P1 → P2 → P3 → P4 → P5 → P6
```

`F(n)` consume los endpoints de `B(n)`: se arranca cuando `B(n)` está mergeado, o
antes usando mocks (MSW) generados desde el contrato OpenAPI.

| Bloque | API | Web | Tamaño |
|---|---|---|---|
| Base del repo y tooling | B0 | F0 | M |
| Base de datos / sistema de diseño | B1 | F1 | L |
| Auth, usuarios y roles / shell de la app | B2 | F2 | M |
| Catálogo, ingredientes y recetas | B3 | F3 | L |
| Clientes y cuenta corriente | B4 | F4 | L |
| Ventas, pedidos, POS y facturación | B5 | F5 | XL |
| Sitio público, cupones y MercadoPago | B6 | F6 | L |
| Proveedores, gastos y caja | B7 | F7 | L |
| Producción y menú semanal | B8 | F8 | L |
| Reportes, configuración, importación y ayuda | B9 | F9 | L |
| Endurecimiento y QA final | B10 | F10 | M |

## Decisiones

Tomadas (la justificación está en [01-arquitectura.md](01-arquitectura.md#decisiones)):

- La API es la **única** que toca la base. El front deja de usar `supabase-js`.
- **Supabase Auth sigue** siendo el proveedor de identidad: no se migran usuarios ni contraseñas.
- **Alembic** es dueño del esquema desde ahora; la primera revisión es el esquema actual de producción.
- Mientras convivan el sistema viejo y el nuevo, las migraciones solo **agregan** (nunca borran ni renombran).
- Las funciones SQL que ya existen (stock, producción, pedido web, reporte semanal) se reutilizan desde la API.
- Precios, descuentos, stock y saldos se calculan **en la API**; el front solo muestra.

Pendientes (no bloquean hasta la fase P):

| # | Decisión | Recomendación |
|---|---|---|
| DP-1 | Dónde corre la API en producción | Contenedor Docker en Render, Railway, Fly.io o Cloud Run, región **us-east-1** (la misma que Supabase) |
| DP-2 | Tipografía y dirección visual del panel | Se elige en F1 entre 2 propuestas |
| DP-3 | Staging | UAT con un dump de producción restaurado en Docker local (gratis); un proyecto Supabase aparte es opcional |
| DP-4 | Emails de alerta (hoy EmailJS desde el navegador) | Pasar a la API con un proveedor transaccional después del cutover |

## Definición de terminado (vale para cada PR)

- Tests nuevos o actualizados para todo lo que cambió; la suite completa pasa.
- Lint, formato y tipos en verde (`make check`).
- Sin secretos en el código; variables nuevas documentadas en `.env.example`.
- `docs/TABLAS.md` y `docs/FUNCIONES.md` del repo actualizados si cambió una tabla, función o regla de negocio.
- La descripción del PR dice qué archivo del legado replica y cómo se verificó la paridad.
