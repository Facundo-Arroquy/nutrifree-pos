# Funciones y helpers clave — NutriFree POS

## WeeklyGoal

| Función / Helper | Archivo | Descripción |
|---|---|---|
| `getWeekStart()` | `WeeklyGoalModal.jsx`, `SettingsPage.jsx` | Devuelve el lunes de la semana actual como `Date` (modal) o `YYYY-MM-DD` (settings). |
| `GoalTable` | `WeeklyGoalModal.jsx` | Componente interno que renderiza la tabla Producto / Objetivo / Producido / %. Calcula "producido esta semana" sumando `stock_movements` con `type=production` desde el lunes. |
| `WeeklyGoalModal` | `WeeklyGoalModal.jsx` | Modal popup que aparece al iniciar la app dentro del rango horario configurado (una vez por día, persiste en `localStorage` clave `weeklyGoalDismissed`). |
| `WeeklyGoalBanner` | `WeeklyGoalModal.jsx` | Banner colapsable debajo del topbar. Siempre visible mientras haya objetivos cargados para la semana. |

## App.jsx

| Variable de estado | Tipo | Descripción |
|---|---|---|
| `weeklyGoals` | `Array` | Lista de objetivos de la semana actual cargados desde Supabase. Mapeados desde `weekly_goals`. |
| `weeklyGoalStart` / `weeklyGoalEnd` | `string` HH:MM | Rango horario en que se dispara el modal. Guardado en `app_settings`. |
| `showWeeklyGoal` | `boolean` | Controla visibilidad del modal popup. |
| `weeklyGoalBannerOpen` | `boolean` | Controla si el banner está expandido. |
| `weeklyGoalChecked` | `ref` | Evita disparar el check más de una vez por sesión. |

## SettingsPage.jsx

| Función | Descripción |
|---|---|
| `saveWgSchedule()` | Guarda `weekly_goal_start` y `weekly_goal_end` en `app_settings` vía upsert. |
| `addGoal()` | Inserta una fila en `weekly_goals` para la semana actual y actualiza el estado local. |
| `deleteGoal(id)` | Elimina una fila de `weekly_goals` y actualiza el estado local. |
