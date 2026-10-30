# AGENTS.md — nutrifree-web

Instrucciones para agentes (Codex) que trabajan en este repo.

## Idioma y estilo

- Respondé y documentá **en español**, breve, claro y directo.
- Identificadores de código en inglés; textos de la interfaz en español (es-AR).

## Contexto

- Front de NutriFree POS: panel interno, POS, tablet de cocina y sitio público.
  El plan completo está en `../nutrifree-pos/docs/migracion/`: antes de cada
  tarea leé `README.md`, `01-arquitectura.md` y la fase que te toca de
  `03-frontend.md`.
- El sistema viejo está en `../nutrifree-pos` y es **solo lectura**. Nunca lo modifiques.
- La API corre en `../nutrifree-api` (`make up`, puerto 8000).
- Diseño: seguí `docs/frontend_design.md`, adaptado al contexto de uso descrito
  en la fase F1 (el POS prioriza velocidad y legibilidad).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Vite en `localhost:5173` con proxy `/api` → `localhost:8000` |
| `npm run gen:api` | Regenera los tipos desde `../nutrifree-api/openapi.json` |
| `npm run check` | Lint + tipos + tests. **Tiene que pasar antes de terminar** |
| `npm run build` | Build de producción |
| `npm run e2e` | Playwright contra el stack de Docker |

## Arquitectura

- Carpetas por feature en `src/features/<modulo>/` (`api.ts`, `components/`,
  `pages/`, `schemas.ts`, tests al lado del código).
- Componentes base en `src/components/ui/`; nada de estilos sueltos fuera de
  Tailwind y los tokens de `src/styles/tailwind.css`.
- Datos del servidor solo con TanStack Query; formularios con React Hook Form + Zod.
- El cliente HTTP usa los tipos generados de OpenAPI; nunca tipos escritos a mano
  para respuestas de la API.

## Reglas

- **Nunca** conectes el front a Supabase ni a producción.
- Precios, totales, stock y saldos se muestran como los devuelve la API; el
  front no los recalcula como fuente de verdad.
- Archivos de menos de ~300 líneas; si una página crece, partila en componentes.
- Accesible: foco visible, labels, contraste AA, navegación por teclado.
- Si el plan es ambiguo o contradice al legado, pará y preguntá.

## Tests

- Obligatorios: Vitest + Testing Library para componentes y hooks, MSW para la
  API, Playwright para flujos críticos. Cobertura de `features/` y `lib/` ≥ 80 %.

## Documentación

- Actualizá `docs/FUNCIONES.md` si cambia una utilidad o regla de presentación.
- Variable de entorno nueva ⇒ `.env.example`.

## Flujo de trabajo

- Una tarea = una rama (`feat/f5-pos`, `fix/…`, `chore/…`) desde `main`
  actualizado = un PR.
- Conventional Commits. Nunca push a `main` ni merge de PRs.
- La descripción del PR incluye el checklist de paridad contra la página del
  legado y capturas de pantalla (escritorio, tablet y celular).
