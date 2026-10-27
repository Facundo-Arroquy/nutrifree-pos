-- Cupones de descuento para pedidos web (/menu y /menu-mayorista).
--
-- La tabla solo la gestionan admins activos. El público NO puede listarla
-- (se podrían leer todos los códigos): valida un código puntual con la función
-- validate_coupon, que devuelve el descuento solo si el código existe.

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_pct numeric(5,2) not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint coupons_code_format check (code ~ '^[A-Z0-9_-]{3,20}$'),
  constraint coupons_discount_range check (discount_pct > 0 and discount_pct <= 100)
);

comment on table public.coupons is
  'Cupones de descuento porcentual para pedidos web. code siempre en mayusculas. Se quita un cupon borrando la fila.';

alter table public.coupons enable row level security;

grant select, insert, update, delete on table public.coupons to authenticated;
revoke all on table public.coupons from anon;

create policy "Admins activos gestionan cupones"
on public.coupons for all to authenticated
using (
  exists (
    select 1 from public.business_users bu
    where bu.email = (select auth.jwt() ->> 'email')
      and bu.active = true
      and bu.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.business_users bu
    where bu.email = (select auth.jwt() ->> 'email')
      and bu.active = true
      and bu.role = 'admin'
  )
);

-- Validación pública de un cupón: devuelve 0 filas si el código no existe.
create or replace function public.validate_coupon(p_code text)
returns table (code text, discount_pct numeric)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select c.code, c.discount_pct
  from public.coupons c
  where c.code = upper(btrim(p_code))
  limit 1;
$$;

revoke all on function public.validate_coupon(text) from public;
grant execute on function public.validate_coupon(text) to anon, authenticated;
