import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

// Cliente con service_role: se salta RLS. Por eso TODAS las consultas
// filtran explícitamente por el user_id del usuario autenticado.
export const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
