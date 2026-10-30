# 🥗 Nutrifree POS — Sistema de Gestión

Sistema POS para gestión de ventas, pedidos, clientes, stock, recetas, producción y reportes. Incluye el sitio público (landing, menú minorista y mayorista) y el panel interno.

## Stack

- React 18 + Vite
- Supabase (PostgreSQL, Auth, Realtime, Edge Functions)
- MercadoPago (Checkout Pro) y EmailJS (alertas)
- Vitest para los tests

## Inicio rápido

```bash
npm install
cp .env.example .env.local   # completar las variables
npm run dev
```

Abrí **http://localhost:5173**. El acceso al panel es con email y contraseña (Supabase Auth).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción (`dist/`) |
| `npm run preview` | Sirve el build localmente |
| `npm test` | Corre los tests una vez |
| `npm run test:watch` | Tests en modo watch |

## Estructura

```
src/
├── pages/        Una vista por módulo (POS, pedidos, clientes, reportes…)
├── components/   Componentes reutilizables
├── routes/       Catálogo de rutas, permisos por rol y router
├── utils/        Lógica pura (precios, stock, fechas…) con sus tests
├── supabase.js   Cliente de Supabase y mappers DB ↔ App
└── shared.jsx    Utilidades, CSS global y componentes base
supabase/
├── migrations/         Migraciones vigentes (baseline + cambios)
├── migrations_legacy/  Scripts SQL históricos, solo de referencia
├── functions/          Edge Functions (pasarela de pago)
└── checks/             Consultas de verificación
docs/                   Guía de uso, auditoría y reportes
```

## Documentación

- [`TABLAS.md`](TABLAS.md) — tablas de la base de datos
- [`FUNCIONES.md`](FUNCIONES.md) — funciones SQL y utilidades
- [`docs/GUIDE.md`](docs/GUIDE.md) — guía de uso del panel
- [`docs/AUDITORIA.md`](docs/AUDITORIA.md) — controles periódicos de integridad
- [`docs/reportes/`](docs/reportes) — revisiones y reportes históricos
