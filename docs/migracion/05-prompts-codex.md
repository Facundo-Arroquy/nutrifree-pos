# 05 — Prompts para Codex

Cómo usarlos: abrir Codex dentro del repo de la fase (`nutrifree-api` para B,
`nutrifree-web` para F), pegar el **prompt base** reemplazando `<FASE>` y
`<RAMA>`, y sumar las **notas de la fase** si las tiene. Una fase grande (XL)
se puede partir en varias tareas: en ese caso se agrega "Solo esta parte: …".

## Prompt base

```text
Implementá la fase <FASE> del plan de migración de NutriFree POS en este repo.

1. Leé AGENTS.md y, en ../nutrifree-pos/docs/migracion/, README.md,
   01-arquitectura.md y la sección <FASE> (02-backend.md si empieza con B,
   03-frontend.md si empieza con F).
2. Leé los archivos de "Entradas"/"Legado" de esa sección en ../nutrifree-pos.
   Ese repo es solo lectura.
3. Creá la rama <RAMA> desde main actualizado.
4. Escribí primero los tests (de caracterización cuando la fase porte lógica
   del legado) y después la implementación.
5. Corré `make check` (API) o `npm run check` (web) hasta que pase.
6. Actualizá docs/TABLAS.md, docs/FUNCIONES.md, .env.example y el contrato
   (openapi.json o tipos generados) si corresponde.
7. Hacé commits chicos con Conventional Commits y abrí el PR con `gh pr create`
   usando la plantilla. No mergees.
8. Al final resumí: qué se hizo, cómo se verificó la paridad, qué quedó
   pendiente y cualquier comportamiento del legado marcado como LEGACY.

Si algo del plan es ambiguo, contradice al legado o requiere credenciales,
pará y preguntá antes de seguir. Nunca te conectes a producción.
```

## Notas por fase

| Fase | Rama sugerida | Notas para agregar al prompt |
|---|---|---|
| B0 | `chore/b0-tooling` | "Copiá `../nutrifree-pos/docs/migracion/plantillas/AGENTS.api.md` como `AGENTS.md`. Verificá que `make up` levante `db` y `auth` sanos antes de dar por terminada la tarea." |
| B1 | `feat/b1-baseline` | "El esquema de producción está en `<ruta a schema_prod.sql>` (solo esquema). Si no está disponible, usá las migraciones de `../nutrifree-pos/supabase/migrations/` y avisalo en el PR." |
| B2 | `feat/b2-auth` | "Generá la matriz de roles de los tests a partir de `ROUTES` y `SETTINGS_SECTIONS` de `../nutrifree-pos/src/routes/paths.js`." |
| B3 | `feat/b3-catalogo` | — |
| B4 | `feat/b4-clientes` | "Antes de implementar, documentá en el PR los casos de `computeAllocations` que encontraste en `CustomersPage.jsx`." |
| B5 | `feat/b5-ventas` | Partir en 3 tareas: (a) alta y listado de ventas, (b) cambios de estado y stock, (c) edición de ítems, duplicados y facturación. |
| B6 | `feat/b6-publico-pagos` | Partir en 2 tareas: (a) menú, cupones y pedido web, (b) MercadoPago. "Probá el webhook solo con payloads de ejemplo y MP simulado." |
| B7 | `feat/b7-compras-caja` | Partir en 2 tareas: (a) proveedores y gastos, (b) caja. |
| B8 | `feat/b8-produccion` | Partir en 2 tareas: (a) producción y kanban, (b) menú semanal. |
| B9 | `feat/b9-reportes-admin` | Partir en 2 tareas: (a) dashboard y reportes, (b) configuración, importación, FAQ, backup. |
| B10 | `chore/b10-hardening` | — |
| F0 | `chore/f0-tooling` | "Copiá `plantillas/AGENTS.web.md` como `AGENTS.md` y `anexos/frontend_design.md` como `docs/frontend_design.md`." |
| F1 | `feat/f1-design-system` | "Primero armá las **dos propuestas** visuales en `/_design` y pará: el dueño elige una antes de construir los componentes." |
| F2 | `feat/f2-shell-auth` | "Probá contra la API real con `make up` en `../nutrifree-api`, además de MSW." |
| F3–F9 | `feat/f<n>-<modulo>` | "Antes de abrir el PR completá el checklist de paridad contra cada página del legado de la sección y adjuntá capturas (escritorio, tablet y celular)." |
| F5 | `feat/f5-ventas` | Partir en 3 tareas: (a) POS, (b) calendario de pedidos, (c) pedidos y facturación. |
| F10 | `chore/f10-qa` | — |

## Prompt de revisión (opcional, en una sesión aparte)

```text
Revisá el PR #<n> de este repo contra la fase <FASE> de
../nutrifree-pos/docs/migracion/. Buscá: diferencias de comportamiento con el
legado, cálculos de plata o stock fuera del service, endpoints sin
require_roles, migraciones que borren o renombren, tests faltantes y secretos
en el código. Respondé con una lista priorizada; no cambies código.
```
