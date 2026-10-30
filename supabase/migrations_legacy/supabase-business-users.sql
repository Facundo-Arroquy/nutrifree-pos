-- =============================================================
-- Nutrifree POS — Tabla business_users (Empleados por dominio)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =============================================================

-- ─── 1. Crear tabla ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        UNIQUE NOT NULL,
  name       TEXT        NOT NULL DEFAULT '',
  domain     TEXT        NOT NULL,
  role       TEXT        NOT NULL DEFAULT 'vendor' CHECK (role IN ('admin', 'vendor', 'cocina')),
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Habilitar RLS ─────────────────────────────────────────
ALTER TABLE business_users ENABLE ROW LEVEL SECURITY;

-- ─── 3. Políticas ─────────────────────────────────────────────

-- Cualquier usuario autenticado puede leer/insertar/actualizar su propio registro
CREATE POLICY "Propio registro: acceso total"
  ON business_users FOR ALL
  USING  (auth.jwt() ->> 'email' = email)
  WITH CHECK (auth.jwt() ->> 'email' = email);

-- Admin: puede leer todos los usuarios del mismo dominio
CREATE POLICY "Admin: leer dominio"
  ON business_users FOR SELECT
  USING (
    (auth.jwt() ->> 'email') ILIKE 'admin%'
    AND domain = SPLIT_PART(auth.jwt() ->> 'email', '@', 2)
  );

-- Admin: puede actualizar (rol, activo) usuarios del mismo dominio
CREATE POLICY "Admin: actualizar dominio"
  ON business_users FOR UPDATE
  USING (
    (auth.jwt() ->> 'email') ILIKE 'admin%'
    AND domain = SPLIT_PART(auth.jwt() ->> 'email', '@', 2)
  );

-- Admin: puede eliminar usuarios del mismo dominio (excepto a sí mismo, controlado en app)
CREATE POLICY "Admin: eliminar dominio"
  ON business_users FOR DELETE
  USING (
    (auth.jwt() ->> 'email') ILIKE 'admin%'
    AND domain = SPLIT_PART(auth.jwt() ->> 'email', '@', 2)
  );

-- ─── 4. Trigger: auto-insertar cuando se crea un usuario en Auth ──────────
-- Se ejecuta automáticamente en Supabase cada vez que se crea un nuevo usuario.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.business_users (email, name, domain, role)
  VALUES (
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
    SPLIT_PART(NEW.email, '@', 2),
    CASE WHEN NEW.email ILIKE 'admin%' THEN 'admin' ELSE 'vendor' END
  )
  ON CONFLICT (email) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_auth_user();

-- ─── 5. Migración única: poblar con los usuarios ya existentes ────────────
-- Ejecutar UNA SOLA VEZ para importar todos los usuarios actuales de Auth.
INSERT INTO public.business_users (email, name, domain, role)
SELECT
  email,
  COALESCE(raw_user_meta_data->>'name', SPLIT_PART(email, '@', 1)) AS name,
  SPLIT_PART(email, '@', 2)                                         AS domain,
  CASE WHEN email ILIKE 'admin%' THEN 'admin' ELSE 'vendor' END     AS role
FROM auth.users
ON CONFLICT (email) DO NOTHING;

-- ─── Migración: agregar rol "cocina" al check constraint existente ─────
-- (ejecutar si la tabla ya existía con el constraint viejo admin/vendor)
ALTER TABLE business_users DROP CONSTRAINT IF EXISTS business_users_role_check;
ALTER TABLE business_users ADD CONSTRAINT business_users_role_check
  CHECK (role IN ('admin', 'vendor', 'cocina'));
