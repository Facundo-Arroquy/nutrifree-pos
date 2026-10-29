-- Objetos fuera de public que no incluye `supabase db dump --schema public`.

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', true)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

drop policy if exists "allow_invoices_authenticated" on storage.objects;
create policy "allow_invoices_authenticated"
on storage.objects for all
to authenticated
using (bucket_id = 'invoices')
with check (bucket_id = 'invoices');

-- No se replica la política productiva histórica que permite a `anon`
-- insertar en cualquier bucket. El entorno local queda restringido al bucket
-- invoices y a usuarios autenticados.
