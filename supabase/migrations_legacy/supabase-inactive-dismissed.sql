-- Tabla para registrar los clientes inactivos que ya fueron contactados.
-- Si un cliente hace una nueva compra (last_sale_at cambia), la alerta reaparece automáticamente.

create table if not exists customer_inactive_dismissed (
  customer_id   text        primary key,
  last_sale_at  text        not null,   -- ISO date de la última venta al momento de desestimar
  dismissed_at  timestamptz not null default now(),
  dismissed_by  text        not null default ''
);

-- Habilitar RLS (ajustar políticas según el proyecto)
alter table customer_inactive_dismissed enable row level security;

-- Política: todos los usuarios autenticados pueden leer y escribir
create policy "auth_full_access" on customer_inactive_dismissed
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
