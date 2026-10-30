# AGENTS.md — nutrifree-api

Instrucciones para agentes (Codex) que trabajan en este repo.

## Idioma y estilo

- Respondé y documentá **en español**, breve, claro y directo.
- Identificadores de código en inglés; mensajes para el usuario final en español.

## Contexto

- API de NutriFree POS (FastAPI). El plan completo está en
  `../nutrifree-pos/docs/migracion/`: antes de cada tarea leé `README.md`,
  `01-arquitectura.md` y la fase que te toca de `02-backend.md`.
- El sistema viejo está en `../nutrifree-pos` y es **solo lectura**: de ahí salen
  las reglas de negocio. Nunca lo modifiques.

## Comandos

| Comando | Qué hace |
|---|---|
| `make up` / `make down` | Levanta / baja Docker (db, auth, api) |
| `make reset-db` | Base desde cero: migraciones + seed ficticio |
| `make dev` | API con recarga en caliente |
| `make check` | Lint + tipos + tests. **Tiene que pasar antes de terminar** |
| `make openapi` | Regenera `openapi.json` |

## Arquitectura

- `router` (HTTP, validación, permisos) → `service` (reglas y transacción) →
  `repository` (único lugar con SQL). Un módulo por dominio en `app/modules/`.
- Schemas Pydantic con alias camelCase; la base sigue en snake_case.
- Errores de dominio como excepciones propias → Problem Details con `code` estable.
- Todo endpoint no público usa `require_roles(...)`.

## Reglas

- **Nunca** te conectes a producción ni uses credenciales reales. Solo Docker local.
- Montos con `Decimal`, nunca `float`. Días de negocio en `America/Argentina/Buenos_Aires`.
- Stock y saldos con ajustes relativos (`x = x ± delta`) dentro de una
  transacción; reutilizá las funciones SQL existentes.
- Migraciones con Alembic, **solo expand** (agregar, nunca borrar ni renombrar).
  Tabla nueva en `public` ⇒ `ENABLE ROW LEVEL SECURITY` sin políticas. Siempre
  `upgrade` y `downgrade`.
- No loguees tokens, contraseñas ni datos personales.
- Si el legado tiene un comportamiento que parece bug, replicalo, marcalo con
  `# LEGACY:` y avisá en el PR. Si el plan es ambiguo o contradice al legado,
  pará y preguntá.

## Tests

- Obligatorios para todo lo que se pueda probar.
- En fases de negocio, **primero** los tests de caracterización (casos del
  `*.test.js` del legado traducidos a pytest), después la implementación.
- Unit en `tests/unit`, integración contra Postgres de Docker en
  `tests/integration`. Cobertura de `services/` ≥ 85 %.

## Documentación

- Actualizá `docs/TABLAS.md` si cambia una tabla y `docs/FUNCIONES.md` si cambia
  una función SQL o una regla de negocio.
- Variable de entorno nueva ⇒ `.env.example`.

## Flujo de trabajo

- Una tarea = una rama (`feat/b3-catalogo`, `fix/…`, `chore/…`) desde `main`
  actualizado = un PR.
- Conventional Commits. Nunca push a `main` ni merge de PRs.
- La descripción del PR dice: qué fase cubre, qué archivos del legado replica,
  cómo se verificó la paridad y qué quedó pendiente.
