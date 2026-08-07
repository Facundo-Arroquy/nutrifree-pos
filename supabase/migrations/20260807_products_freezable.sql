-- Marca si un producto es APTO PARA FREEZER.
--
-- Es una propiedad del producto, no su estado de venta: no indica si hoy se
-- vende fresco o congelado, sino si aguanta el freezer. Sirve, entre otras
-- cosas, para decidir cuánto producir de más: lo que sobra de un producto apto
-- no se tira necesariamente.
alter table public.products
  add column if not exists freezable boolean not null default false;

comment on column public.products.freezable is
  'El producto es APTO PARA FREEZER. Es una propiedad del producto, no su estado de venta: no indica si hoy se vende fresco o congelado.';
