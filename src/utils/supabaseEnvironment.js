const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export const isLocalSupabaseUrl = value => {
  try { return LOCAL_HOSTS.has(new URL(value).hostname); }
  catch { return false; }
};

/**
 * Impide que `npm run dev` use por accidente la base productiva.
 * En producción (build de Vercel) no interviene.
 */
export const assertSafeSupabaseEnvironment = ({ url, isDevelopment, hasWindow }) => {
  if (isDevelopment && hasWindow && !isLocalSupabaseUrl(url)) {
    throw new Error(
      "Desarrollo bloqueado: VITE_SUPABASE_URL debe apuntar a Supabase local " +
      "(http://127.0.0.1:54321), no a producción."
    );
  }
};
