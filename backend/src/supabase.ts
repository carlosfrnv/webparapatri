import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

// Cliente com service_role: ignora RLS. Por isso TODAS as consultas
// filtram explicitamente pelo user_id do utilizador autenticado.
export const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
