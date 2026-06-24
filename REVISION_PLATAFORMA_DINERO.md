# Revisión global de la plataforma — Foco financiero (módulos no auditados)

> Tercer barrido sobre NUTRIFREE buscando bugs e inconsistencias que afecten dinero,
> cubriendo los módulos NO tratados en los documentos previos:
>
> - [BUGS_PASARELA_PAGO.md](BUGS_PASARELA_PAGO.md) — checkout / webhook MP
> - [BACKEND_PASARELA_PAGO.md](BACKEND_PASARELA_PAGO.md)
> - [BUGS_DINERO_PLATAFORMA.md](BUGS_DINERO_PLATAFORMA.md) — POS, Kanban, Caja, CC clientes/proveedores
> - [BACKEND_DINERO_PLATAFORMA.md](BACKEND_DINERO_PLATAFORMA.md)
>
> Si un bug ya aparece en cualquiera de esos documentos, **no se repite acá**.
> Sí se referencian con `→ ver BUGS_X §N` cuando hay un cruce relevante.

Módulos auditados en esta revisión:

| Módulo | Archivos clave |
|--------|----------------|
| Productos / Pricing | [src/pages/ProductsPage.jsx](src/pages/ProductsPage.jsx), [src/pages/IngredientsPage.jsx](src/pages/IngredientsPage.jsx) |
| Recetas / Costeo | [src/pages/RecipesPage.jsx](src/pages/RecipesPage.jsx) |
| Producción / Stock | [src/pages/ProductionPage.jsx](src/pages/ProductionPage.jsx), [src/pages/ProductionLogPage.jsx](src/pages/ProductionLogPage.jsx) |
| Banco de horas | [src/pages/HoursBankPage.jsx](src/pages/HoursBankPage.jsx) |
| Facturación | [src/pages/BillingPage.jsx](src/pages/BillingPage.jsx) |
| Settings (parámetros financieros) | [src/pages/SettingsPage.jsx](src/pages/SettingsPage.jsx) |
| Importación masiva | [src/pages/ImportPage.jsx](src/pages/ImportPage.jsx) |
| Menú mayorista | [src/pages/WholesaleMenuPage.jsx](src/pages/WholesaleMenuPage.jsx) |
| Email / Storage / RLS | [src/utils/emailAlerts.js](src/utils/emailAlerts.js), [src/App.jsx](src/App.jsx) |

Leyenda de severidad (igual que docs anteriores):
🔴 CRÍTICO · 🟠 ALTO · 🟡 MEDIO · 🔵 BAJO

---

## Resumen ejecutivo

| # | Sev | Bug | Por qué importa |
|---|-----|-----|-----------------|
| 1 | 🔴 | Pricing y `show_in_menu` se editan desde el cliente con anon key | Atacante cambia precios de productos en producción |
| 2 | 🔴 | Settings globales (frozenDiscount, vatRate) se aplican sin auditoría retroactiva | Cambio de IVA cambia costos históricos |
| 3 | 🔴 | `frozenDiscount` y `vatRate` no tienen techo: 1000% se acepta | Productos a costo $0 o gastos infinitos |
| 4 | 🔴 | `ImportPage` puede sobreescribir precios masivamente sin confirmación item-a-item | Excel pirateado borra precios de todo el catálogo |
| 5 | 🔴 | EmailJS expone destinatarios hardcodeados en frontend (factura/alerta) | Spear phishing trivial al rotar email del owner |
| 6 | 🔴 | `business_users.role` derivado del email en cliente (`email.startsWith("admin")`) | Cualquier user con email "admin@..." es admin si no hay RLS |
| 7 | 🟠 | Cambio de costo de ingrediente NO recosta `recipe_ingredients` históricos | Cambia hoy, pero ventas viejas siguen con costos viejos en Reports |
| 8 | 🟠 | `ProductionPage` registra horas/costo mano de obra solo en stock; no hay costo laboral | Margen real es menor al calculado en Reports |
| 9 | 🟠 | Eliminar producto con ventas históricas rompe Reports y reverso de cancelación | Reports pierde la trazabilidad de revenue por producto |
| 10 | 🟠 | `BillingPage` no guarda número de factura ni link al PDF en `sales` | Trazabilidad legal nula |
| 11 | 🟠 | Storage de facturas con `getPublicUrl` (URL pública sin signed URL) | Facturas filtradas si alguien adivina el nombre |
| 12 | 🟠 | `accumulate_employee_hours` con deltas negativos sin floor a 0 | Banco de horas negativo si se descuenta de más |
| 13 | 🟠 | `WholesaleMenuPage` (menú mayorista) muestra precios mayoristas con código compartido | Filtrar el código deja a cualquiera con acceso a precios mayoristas |
| 14 | 🟠 | `editingPrice` inline en `IngredientsPage` actualiza `unit_cost` sin recostar recetas | Costos desincronizados → márgenes engañosos |
| 15 | 🟡 | `kitItems` no valida que sumen al precio del kit | Kit a precio menor que la suma de componentes (subsidio oculto) |
| 16 | 🟡 | Productos con `priceRetail=0` se ocultan en el menú pero pueden venderse con override | "Producto gratis" cobrado a $1 |
| 17 | 🟡 | `app_settings` se persiste con `String(value)` y se parsea con `Number()` | "21.5" no funciona; valores con coma local rompen |
| 18 | 🟡 | `resetDemo` borra masivamente datos en producción si `user.isDemo` se manipula | Bomba destructiva si el flag de demo se filtra |
| 19 | 🟡 | `Number(...)` masivo en parseo de Excel sin localización (coma decimal AR) | "1.500,50" se parsea como NaN o 1500 |
| 20 | 🔵 | `audit_log` insertado desde frontend → falta firma de user real | Auditoría falsificable |

---

# 1. Pricing y catálogo (Products + Ingredients + Recipes)

## 1.1 🔴 Precios se editan desde el frontend con `anon` key

**Evidencia:** [src/pages/ProductsPage.jsx:80-86](src/pages/ProductsPage.jsx:80):

```js
const { error } = await supabase.from("products").insert(productToDb(newProduct));
// ...
const { error } = await supabase.from("products").update(productToDb(updated)).eq("id", modal.id);
```

Mismo patrón en `IngredientsPage`, `RecipesPage`. **No hay RLS** que distinga staff de anónimo. Cualquiera con el `VITE_SUPABASE_ANON_KEY` puede:

```js
await supabase.from("products").update({ price_retail: 1 }).eq("id", "<uuid>");
```

y poner los productos a $1. Combinado con el bug §13 (`WholesaleMenuPage`), un competidor que filtre el anon key del bundle puede sabotear precios remotamente.

**Por qué importa para el dinero:** los precios son la base de cada cálculo de ingreso. Si se manipulan, el POS cobra mal **sin saberlo** — el cajero ve $1 en pantalla y cobra $1.

**Solución:**
- RLS sobre `products` / `ingredients` / `recipes`: solo `authenticated` con `role IN ('admin','vendor')`.
- Una RPC `actualizar_precio_producto(p_id, p_new_retail, p_new_wholesale)` que registre el cambio en `audit_log` con el `auth.uid()` real y el valor anterior.
- Trigger `BEFORE UPDATE` en `products` que registre cambios de precio en una tabla `price_history`.

**Por qué esta solución:** RLS es la única defensa que **no depende del frontend**. Una RPC con auditoría hace que cada cambio de precio sea reconstruible — esencial cuando hay disputa con un cliente que cobró un precio anterior.

## 1.2 🟠 Cambiar `unit_cost` de un ingrediente NO recosta recetas históricas

**Evidencia:** [src/pages/IngredientsPage.jsx:206-208](src/pages/IngredientsPage.jsx:206):

```js
const { error } = await supabase.from("ingredients").update({ unit_cost: val }).eq("id", id);
setIngredients(p=>p.map(i=>i.id===id?{...i,unitCost:val}:i));
```

Las `recipe_ingredients.cost` viejas no se tocan (excepto en el flujo de cambio de unidad, que sí las propaga). En consecuencia:
- Una receta calculada hace tres meses con leche a $500/L sigue costando como si la leche fuera $500/L hoy que está a $1.200.
- Reports muestra "márgenes" basados en costos viejos. Las decisiones de pricing se hacen sobre datos falsos.

**Por qué importa:** Reports usa `recipe_ingredients.cost` para calcular ganancia. Si los costos no se actualizan, la "rentabilidad" reportada es ficticia.

**Solución:**
- Decisión arquitectónica: ¿costos históricos congelados o siempre vigentes?
  - **Opción A (recomendada):** congelar en `sales.items[].cost_snapshot` al momento de la venta. La receta presente es solo para nuevos productos.
  - **Opción B:** trigger que actualice `recipe_ingredients.cost` cuando cambia `ingredients.unit_cost`.
- En cualquier caso, registrar el cambio en `audit_log` con el costo anterior.

**Por qué esta solución:** la opción A es **contablemente correcta** (cada venta tiene su propio costo) y resiste cambios futuros de receta sin recalcular el pasado. Es el patrón Snapshot estándar en accounting systems.

## 1.3 🟠 Eliminar producto con ventas históricas rompe Reports

**Evidencia:** [src/pages/ProductsPage.jsx:109](src/pages/ProductsPage.jsx:109):

```js
const { error } = await supabase.from("products").delete().eq("id", id);
```

Sin FK explícita ni soft delete, las `sales.items[].productId` quedan apuntando a un UUID inexistente. ReportsPage usa `products.find(p => p.id === item.productId)`:

```js
const compName = products.find(p => p.id === comp.productId)?.name || comp.productId;
```

Resultado: en Reports aparece el UUID como nombre. El top de productos rentables pierde a los eliminados.

**Solución:** soft delete `deleted_at` (como en [BACKEND_DINERO_PLATAFORMA.md §8](BACKEND_DINERO_PLATAFORMA.md)). Filtrar en queries activas; mostrar como "Producto archivado" en reports.

## 1.4 🟡 `kitItems` no valida que la suma de componentes coincida con `priceRetail`

**Evidencia:** los kits arman su precio manualmente; si un componente sube de precio, el kit no. El POS calcula stock máximo del kit con `getKitMaxStock` ([POSPage.jsx:53-62](src/pages/POSPage.jsx:53)), pero **no** revalida que el precio del kit sea coherente con la suma de componentes.

**Por qué importa:** un kit configurado a $1.000 con ingredientes que ahora cuestan $1.500 se vende perdiendo plata, y nadie lo nota.

**Solución:** alerta visual en `ProductsPage` cuando `priceRetail < SUM(component.priceRetail)`. Reports lo lista en una sección "kits subsidiados".

## 1.5 🟡 Productos con `priceRetail=0` permiten override en POS

**Evidencia:** [POSPage.jsx:86](src/pages/POSPage.jsx:86): `const price = priceList==="retail" ? prod.priceRetail : prod.priceWholesale;` → 0. Luego el cajero puede `overridePrice` y cobrar lo que quiera. Combinado con bug §1.3 del [BUGS_DINERO_PLATAFORMA.md](BUGS_DINERO_PLATAFORMA.md), no hay auditoría.

**Solución:** marcar productos con precio 0 como "no vendibles" en POS. Forzar a cargar precio en `ProductsPage` antes de habilitarlos.

---

# 2. Producción y Banco de horas

## 2.1 🟠 Producción no contabiliza costo de mano de obra

**Evidencia:** [src/pages/ProductionPage.jsx:39-46](src/pages/ProductionPage.jsx:39) llama a `apply_production`. La RPC suma stock y descuenta ingredientes, pero las horas de mano de obra **solo se acumulan en `employee_hours`** ([HoursBankPage.jsx:24-32](src/pages/HoursBankPage.jsx:24)) — sin tarifa.

Resultado: `Reports.profit` se calcula como `precio - costo_ingredientes`. La mano de obra (sueldos, banco de horas pagado) **no entra en el costo unitario**. La "rentabilidad" reportada es bruta, no neta.

**Por qué importa:** decisiones de precio basadas en márgenes ficticios. Si el verdadero margen incluyera mano de obra, productos "rentables" podrían no serlo.

**Solución:**
1. `business_users` agrega columnas `hourly_cost_cooking` y `hourly_cost_packaging`.
2. La RPC `apply_production` suma `hours * hourly_cost` al snapshot del costo de la producción.
3. Reports descuenta este costo del margen.

**Por qué esta solución:** congelar el costo laboral al momento de la producción (Snapshot pattern), igual que el costo de ingredientes. Permite comparar márgenes a lo largo del tiempo sin que cambios futuros de salarios reescriban el pasado.

## 2.2 🟠 Descuento de horas en `HoursBankPage` puede dar negativo

**Evidencia:** [HoursBankPage.jsx:59-72](src/pages/HoursBankPage.jsx:59) llama `accumulate_employee_hours` con `-pe.hours`. Si el admin descuenta dos veces el mismo registro (modal recargado, click duplicado), el banco queda en negativo.

**Por qué importa:** el banco de horas suele alimentar liquidación de sueldos. Negativos rompen la lógica de "horas a pagar".

**Solución:**
- La RPC debe usar `GREATEST(0, current - delta)`.
- O mejor: descuento como **anulación referenciada** (insertar fila `production_employees` con `hours = -X, status='reversal', ref_id=<original>`). La suma se mantiene >= 0 por construcción y el historial queda completo.

**Por qué esta solución:** el segundo enfoque mantiene la regla contable "nada se borra". Anular es un asiento, no un delete.

## 2.3 🟡 Producción sin receta no registra costo nulo en `stock_movements`

**Evidencia:** [ProductionPage.jsx:35-37](src/pages/ProductionPage.jsx:35):

```js
const ingDeltas = (recipe?.ingredients?.length)
  ? recipe.ingredients.map(ri => ({ id: ri.ingredientId, delta: ri.qty * factor }))
  : [];
```

Productos sin receta producen stock con costo 0 implícito en Reports.

**Solución:** marcar producciones sin receta como `cost_unknown = true` y alertarlas en el dashboard.

---

# 3. Facturación

## 3.1 🟠 No se persiste el número de factura ni el link al PDF en `sales`

**Evidencia:** [BillingPage.jsx:97-104](src/pages/BillingPage.jsx:97) solo actualiza `billing_status`. La conexión entre la `sale` y la factura emitida vive en una carpeta de Drive externa.

**Por qué importa:** trazabilidad fiscal nula. Ante una auditoría, no se puede demostrar que una venta tiene factura asociada.

**Solución:** columnas `invoice_number`, `invoice_url`, `invoice_issued_at` en `sales`. Modal "Marcar como facturado" pide el número (y opcionalmente el PDF).

## 3.2 🟠 `getPublicUrl` para facturas → URLs públicas adivinables

**Evidencia:** [BillingPage.jsx:60-63](src/pages/BillingPage.jsx:60):

```js
const path = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
await supabase.storage.from("invoices").upload(path, file);
const { data } = supabase.storage.from("invoices").getPublicUrl(path);
```

El path es `timestamp + filename`. **Cualquiera con la URL ve la factura**. Un atacante que pruebe URLs sistemáticas puede ver facturas de otros clientes.

**Por qué importa:** las facturas contienen CUIT, monto y datos personales. Filtración = problema legal (Ley 25.326).

**Solución:**
- Buckets privados + `createSignedUrl` con expiración (24h).
- Path con UUID en vez de timestamp (`${crypto.randomUUID()}_${filename}`).
- RLS sobre `storage.objects` que filtre por `customer_id` del usuario autenticado.

**Por qué esta solución:** los signed URLs delimitan el blast radius temporalmente (caducan). El UUID en el path elimina la enumerabilidad. RLS es la red final.

## 3.3 🔴 EmailJS con destinatarios hardcoded

**Evidencia:** [src/utils/emailAlerts.js:23](src/utils/emailAlerts.js:23):

```js
to_email: "facundoarroquy.w@gmail.com,garroquy@hotmail.com",
```

Destinatarios literales en el bundle de frontend. Cualquiera puede:
- Cambiarlos en runtime para redirigir las alertas.
- Spamear el endpoint de EmailJS desde la consola.

Además, **los SERVICE_ID, TEMPLATE_ID y PUBLIC_KEY de EmailJS también van en el bundle**: cualquiera puede mandar mails arbitrarios usando la cuenta de Nutrifree (spear phishing, suplantación).

**Por qué importa para dinero:** un atacante puede mandar "FACTURA PARA PAGAR — CBU XXX" a clientes reales desde la dirección oficial. Estafa total.

**Solución:**
- Mover el envío a una Edge Function: `send-email`. Los secrets quedan en `supabase secrets`.
- Lista de destinatarios en `app_settings`, no hardcoded.
- Rate limit por usuario auth.

---

# 4. Settings — parámetros financieros globales

## 4.1 🔴 Cambiar `vatRate` aplica retroactivamente a gastos viejos

**Evidencia:** [SettingsPage.jsx:432-438](src/pages/SettingsPage.jsx:432) actualiza `app_settings.vat_rate`. Pero el cálculo de IVA al cargar un gasto ([ExpensesPage.jsx:191-194](src/pages/ExpensesPage.jsx:191)):

```js
const effTotal = form.withVat ? (Number(l.totalPaid)||0) * (1 + vatRate / 100) : (Number(l.totalPaid)||0);
```

usa el `vatRate` actual al momento de cargar el gasto. Pero **no se guarda qué IVA se aplicó**. Si el IVA cambia de 21% a 27%, gastos viejos siguen con sus totales originales (bien), pero su `unitPrice` futuro recalculado sería distinto. Inconsistencia entre lo persistido y lo recomputable.

**Por qué importa:** el reporte de IVA mensual depende de saber qué tasa se aplicó a cada gasto. Sin la columna, se asume "siempre la actual", lo cual es falso.

**Solución:** columna `vat_rate_applied` en `expenses` con el valor al momento del save. La tasa global solo afecta gastos nuevos.

## 4.2 🔴 `frozenDiscount` y `vatRate` sin techo coherente

**Evidencia:** [SettingsPage.jsx:430-431](src/pages/SettingsPage.jsx:430):

```js
const frozen = Math.max(0, Math.min(100, Number(frozenInput) || 0));
const vat    = Math.max(0, Number(vatInput) || 0);
```

`frozenDiscount` está acotado a 0-100. **`vatRate` NO está acotado**. Un admin curioso pone `vatRate = 5000` y todos los gastos nuevos quedan con `total = base * 51`. Ningún CHECK constraint en SQL.

**Solución:**
- Validar `0 <= vatRate <= 100` en cliente y en DB con un CHECK.
- Considerar valores razonables (10.5%, 21%, 27% en AR) y usar dropdown.

## 4.3 🟡 `app_settings` guardado como string, parseado como number

**Evidencia:** `upsert({ value: String(frozen) })` ([SettingsPage.jsx:434](src/pages/SettingsPage.jsx:434)) y luego `Number(setting.value)`. Funciona para enteros, pero:
- `"21.5"` parseado por `Number()` da `21.5`, pero `Number("21,5")` (coma local AR) da `NaN`.
- Sin `NULL` semántica.

**Solución:** columna `value_numeric numeric` separada de `value_text`. O un JSON tipado.

## 4.4 🟡 `resetDemo` peligroso si `user.isDemo` se manipula

**Evidencia:** [SettingsPage.jsx:723](src/pages/SettingsPage.jsx:723) lista las tablas a truncar. El botón solo se renderiza si `user.isDemo`, pero el flag vive en el state React. Manipular `window.user.isDemo = true` desde DevTools no es necesario porque la función `resetDemo` también vive en el cliente.

**Por qué importa:** si por error se invoca en producción, **truncar `sales`, `expenses`, `account_payments`, `cash_shifts` borra el negocio**.

**Solución:**
- `resetDemo` debe ser una RPC que valide el rol del usuario autenticado en SQL.
- Idealmente, un bucket de Supabase separado para el ambiente demo. Sin compartir DB.

---

# 5. Importación masiva

## 5.1 🔴 `ImportPage` sobreescribe precios sin confirmación granular

**Evidencia:** [ImportPage.jsx:204](src/pages/ImportPage.jsx:204):

```js
const { error } = await supabase.from("products").update(productToDb(updated_data)).eq("id", existing.id);
```

El Excel manda `priceRetail` y se actualiza directo. Si el Excel viene mal (un dev pega valores de una columna en otra), el catálogo se rompe en segundos.

**Por qué importa:** una importación errónea puede dejar todo el catálogo a precios incorrectos. Hasta que alguien lo nota, se cobra mal cada venta.

**Solución:**
- Modal de diff antes de aplicar: mostrar "vas a cambiar X productos, Y precios. Confirmar.".
- Guardar snapshot pre-import en `import_snapshots` para hacer rollback.
- RPC `import_products(p_rows jsonb)` con `dry_run` param.

**Por qué esta solución:** el patrón "preview + apply" es estándar para bulk operations en sistemas financieros (Quickbooks, Xero). Convierte una operación irreversible en una reversible.

## 5.2 🟡 Parseo de números sin localización

**Evidencia:** importación con `Number(cell)`. En Excel argentino los precios vienen como `"1.500,50"`. `Number("1.500,50")` = `NaN`. Resultado: precios en 0 silenciosos.

**Solución:** parser explícito que entienda separador de miles con punto y decimales con coma. Validar que ningún `Number()` resultante sea `NaN` antes de persistir.

---

# 6. Menú mayorista público

## 6.1 🟠 Código compartido para acceder a precios mayoristas

**Evidencia:** existe `/menu-mayorista` ([WholesaleMenuPage.jsx](src/pages/WholesaleMenuPage.jsx)) con un código de acceso (verificar implementación). Un código único compartido **no puede revocarse** por usuario.

**Por qué importa:** competidores con el código ven la lista de precios mayoristas — información estratégica de pricing.

**Solución:**
- Códigos por cliente (tabla `wholesale_access_codes` con `customer_id` opcional).
- Cada uno revocable.
- Audit log de accesos: qué código vio qué precios y cuándo.

---

# 7. Autenticación y autorización

## 7.1 🔴 Rol derivado del email en cliente

**Evidencia:** [App.jsx:65](src/App.jsx:65):

```js
const role = email.toLowerCase().startsWith("admin") ? "admin" : "vendor";
```

Es un default antes de leer `business_users.role`, pero si la lectura falla o la fila no existe, queda admin por email. La gating de páginas ([App.jsx:452-456](src/App.jsx:452)):

```js
const PAGE_ROLES = { reports: ["admin"], import: ["admin"], "help-admin": ["admin"], "hours-bank": ["admin"] };
const allowed = PAGE_ROLES[pageId] || ["admin", "vendor"];
return allowed.includes(user?.role);
```

es **solo en cliente**. Sin RLS, un usuario "vendor" puede llamar `supabase.from("expenses").select("*")` directamente desde DevTools. No hay gate server-side.

**Por qué importa para dinero:** el rol "vendor" puede ver reportes financieros sensibles, importar productos, ver gastos. Y peor: puede modificarlos.

**Solución:**
- Trigger en `business_users` que solo el `service_role` o un admin puede setear `role='admin'`.
- RLS sobre cada tabla financiera referenciando `business_users.role`.
- Sacar la lógica `email.startsWith("admin")` — es un anti-patrón clásico.

**Por qué esta solución:** la autorización en cliente es decorativa. La autorización real vive en la DB. Sin RLS, todo el sistema asume confianza en el frontend, lo cual no escala más allá de un negocio con dueño-staff-único.

## 7.2 🔵 `audit_log` insertado desde cliente

**Evidencia:** `logAction?.(action, scope, detail)` se llama desde POS, CustomersPage, etc. La inserción se hace con el anon key. Sin firma del user real, la auditoría es falsificable.

**Solución:** mover `logAction` a un trigger SQL que use `auth.uid()`. O a una RPC.

---

# 8. Queries SQL de diagnóstico complementarias

Estas queries complementan las Q1-Q13 del [BUGS_DINERO_PLATAFORMA.md §7](BUGS_DINERO_PLATAFORMA.md). No re-ejecutar las mismas.

### Q14 — Productos sin precio que se vendieron con override

```sql
SELECT s.id AS sale_id, s.created_at, s.total,
       (i->>'name') AS item_name,
       (i->>'price')::numeric AS price_cobrado,
       p.price_retail AS price_actual
FROM sales s, jsonb_array_elements(s.items) i
JOIN products p ON p.id = (i->>'productId')::uuid
WHERE (i->>'price')::numeric > 0
  AND p.price_retail = 0
  AND s.status IN ('closed','delivered','paid','ready');
```

### Q15 — Cambios de precio sin auditoría (heurística: variación > 30% en un mes)

```sql
-- Si no existe price_history, esto detecta sobre datos congelados en sales.items.
WITH px AS (
  SELECT (i->>'productId')::uuid AS product_id,
         date_trunc('month', s.created_at) AS month,
         avg((i->>'price')::numeric) AS avg_price
  FROM sales s, jsonb_array_elements(s.items) i
  WHERE s.status IN ('closed','delivered','paid','ready')
  GROUP BY 1, 2
)
SELECT product_id,
       array_agg((month, avg_price) ORDER BY month) AS history
FROM px
GROUP BY product_id
HAVING max(avg_price) > 1.3 * min(avg_price);
```

### Q16 — Banco de horas con saldo negativo

```sql
SELECT eh.employee_id, bu.name,
       eh.cooking_hours, eh.packaging_hours
FROM employee_hours eh
JOIN business_users bu ON bu.id = eh.employee_id
WHERE eh.cooking_hours < 0 OR eh.packaging_hours < 0;
```

### Q17 — Facturas pendientes hace más de 30 días

```sql
SELECT id, customer_name, total, created_at, billing_status
FROM sales
WHERE needs_billing = true
  AND billing_status = 'pending'
  AND created_at < now() - interval '30 days'
ORDER BY created_at;
```

### Q18 — Productos eliminados con ventas históricas (ID huérfano)

```sql
SELECT DISTINCT (i->>'productId')::uuid AS missing_id,
       (i->>'name') AS frozen_name,
       count(*) AS veces_vendido
FROM sales s, jsonb_array_elements(s.items) i
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = (i->>'productId')::uuid)
GROUP BY 1, 2;
```

### Q19 — Ingredientes con `unit_cost` cambiado vs costo guardado en `recipe_ingredients`

```sql
SELECT i.name, i.unit_cost AS actual,
       ri.recipe_id, ri.cost / nullif(ri.qty, 0) AS frozen_unit_cost,
       round(((i.unit_cost - ri.cost / nullif(ri.qty, 0)) / nullif(i.unit_cost, 0)) * 100, 1) AS diff_pct
FROM ingredients i
JOIN recipe_ingredients ri ON ri.ingredient_id = i.id
WHERE i.unit_cost > 0
  AND ri.qty > 0
  AND abs(i.unit_cost - ri.cost / ri.qty) > 0.01;
```

### Q20 — Roles incoherentes: admin por email pero sin row en `business_users`

```sql
SELECT au.email, au.id
FROM auth.users au
LEFT JOIN business_users bu ON bu.id = au.id
WHERE bu.id IS NULL;
-- Esos usuarios reciben role='vendor' por default pero pueden llamarse "admin@..."
```

---

# 9. Plan de mitigación priorizado

| # | Bug | Bloqueante para prod | Recomendado primera iteración |
|---|-----|:--:|:--:|
| 1 | RLS sobre productos / ingredientes / recetas | ✅ | |
| 2 | Snapshot de costos en `sales.items[].cost_snapshot` | | ✅ |
| 3 | Cap a `vatRate` (0-100) y CHECK SQL | ✅ | |
| 4 | Modal preview + rollback en ImportPage | ✅ | |
| 5 | Email a través de Edge Function | ✅ | |
| 6 | RLS + sacar `email.startsWith("admin")` | ✅ | |
| 7 | Recosteo histórico vs snapshot (decisión) | | ✅ |
| 8 | Costo laboral en producción | | ✅ |
| 9 | Soft delete productos | | ✅ |
| 10 | `invoice_number` y `invoice_url` en `sales` | ✅ | |
| 11 | Storage privado + signed URLs | ✅ | |
| 12 | `accumulate_employee_hours` con anulación referenciada | | ✅ |
| 13 | Códigos mayoristas por cliente | | ✅ |
| 14 | Refactor `editingPrice` → recosteo | | ✅ |
| 15 | Alerta de kit subsidiado | | ✅ |
| 16 | Bloquear venta con `priceRetail=0` | | ✅ |
| 17 | `app_settings` tipado | | ✅ |
| 18 | `resetDemo` como RPC con validación de rol | ✅ | |
| 19 | Parser de números con localización AR | | ✅ |
| 20 | `audit_log` server-side con `auth.uid()` | | ✅ |

**Bloqueantes (🔴 directos): 1, 3, 4, 5, 6, 10, 11, 18.**

---

# 10. Por qué este orden — cierre

La revisión global confirma que el problema raíz del sistema es siempre el mismo: **el frontend tiene autoridad sobre datos financieros** (precios, descuentos, IDs, totales, destinos de email). Cada bug específico es una manifestación distinta de esa decisión arquitectónica original.

Los tres documentos previos resuelven el problema en sus tres frentes principales (pasarela, POS+caja+CC, plataforma). Este documento atiende los flancos menos obvios pero igual de relevantes:

- **Pricing y costos** son la base de todo cálculo de margen → si se manipulan, todo lo demás miente sin saberlo.
- **Producción y banco de horas** son egresos invisibles si no se modelan; la rentabilidad reportada hoy ignora la mitad de los costos.
- **Settings globales** son palancas con multiplicador: un valor mal seteado afecta miles de operaciones.
- **Importación** y **storage de facturas** son superficies de ataque grandes para flujos que afectan compliance fiscal.
- **Auth client-side** es la última pieza que mantiene a todo el sistema vulnerable a manipulación trivial desde DevTools.

La intervención ordenada (bloqueantes primero, refinamientos después) cierra el ecosistema financiero como un sistema cerrado, observable y auditable. Hasta llegar a ese estado, **cualquier optimización en otros frentes está construida sobre arena**.
