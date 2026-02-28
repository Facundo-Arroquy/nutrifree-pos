# 🥗 Nutrifree POS — Sistema de Gestión

Sistema POS completo para gestión de ventas, pedidos, clientes, stock, recetas y reportes.

## Inicio rápido

```bash
npm install
npm run dev
```

Abrí **http://localhost:5173**

## Credenciales

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| Administrador | admin123 | Admin completo |
| Vendedor | 1234 | POS + pedidos + clientes |

## Módulos

- 🛒 **Caja / POS** — Ventas rápidas con carrito, lista de precios y métodos de pago
- 📋 **Pedidos** — Gestión de pedidos abiertos con estados
- 👥 **Clientes** — Registro con saldo de cuenta corriente
- 📦 **Productos** — ABM con precios minorista/mayorista y stock
- 🍳 **Producción** — Ingreso diario de producción para actualizar stock
- 📖 **Recetas** — Fichas técnicas con costo automático y margen
- 📊 **Reportes** — Dashboard con ventas, stock bajo y más
- ⚙️ **Configuración** — Categorías y ajustes

## Datos

Los datos se guardan en `localStorage` del navegador automáticamente.
