-- Proyección de Viandas — planificación semanal de menús y su proyección de demanda.
--
-- vianda_plans      : una fila por semana planificada (lunes como week_start).
-- vianda_plan_items : un menú programado para un día concreto de esa semana, con
--                     la proyección congelada al momento de generarla y, más
--                     tarde, lo realmente vendido (para que el modelo aprenda).
--
-- La proyección se congela en la fila porque el modelo aprende comparando lo que
-- se proyectó *entonces* contra lo vendido. Recalcularla al vuelo borraría la
-- evidencia del error y el sesgo no podría estimarse.

create table if not exists public.vianda_plans (
  id                 text primary key,
  week_start         date not null unique,          -- lunes de la semana planificada
  safety_margin_pct  numeric not null default 18,   -- margen de seguridad aplicado
  notes              text,
  created_by         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.vianda_plan_items (
  id               text primary key,
  plan_id          text not null references public.vianda_plans(id) on delete cascade,
  date             date not null,                   -- día concreto del menú
  product_id       text not null,
  product_name     text not null,
  forecast_qty     numeric not null default 0,      -- proyección de ventas congelada
  recommended_qty  numeric not null default 0,      -- proyección + margen de seguridad
  produced_qty     numeric,                         -- lo que finalmente se produjo
  actual_qty       numeric,                         -- lo realmente vendido (feedback)
  confidence       text,                            -- alta | media | baja
  forecast_detail  jsonb,                           -- factores usados, para auditar
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Un mismo menú no puede programarse dos veces el mismo día.
create unique index if not exists vianda_plan_items_date_product_uidx
  on public.vianda_plan_items (date, product_id);

create index if not exists vianda_plan_items_plan_idx on public.vianda_plan_items (plan_id);
create index if not exists vianda_plan_items_date_idx on public.vianda_plan_items (date);

alter table public.vianda_plans      enable row level security;
alter table public.vianda_plan_items enable row level security;

-- Mismo criterio que el resto del sistema: acceso completo para usuarios autenticados.
drop policy if exists auth_full_access on public.vianda_plans;
create policy auth_full_access on public.vianda_plans
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists auth_full_access on public.vianda_plan_items;
create policy auth_full_access on public.vianda_plan_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
