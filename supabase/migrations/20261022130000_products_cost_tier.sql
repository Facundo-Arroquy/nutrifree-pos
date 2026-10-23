-- Nivel de costo de cada producto (bajo / medio / alto).
-- Lo usa la regla de costos del menú semanal. NULL = sin clasificar.
alter table public.products
  add column if not exists cost_tier text;

alter table public.products
  drop constraint if exists products_cost_tier_check;

alter table public.products
  add constraint products_cost_tier_check
  check (cost_tier in ('bajo', 'medio', 'alto'));

comment on column public.products.cost_tier is
  'Nivel de costo de la vianda: bajo (<30% del precio), medio (30-40%), alto (>40%). NULL = sin clasificar.';
