import { config } from "../config";
import { supabase } from "../supabase";

/** Id de la usuaria con acceso (ALLOWED_EMAIL). Los scripts trabajan siempre con sus datos. */
export async function allowedUserId(): Promise<string> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find((u) => (u.email ?? "").toLowerCase() === config.ALLOWED_EMAIL);
    if (user) return user.id;
    if (data.users.length < 100) break;
  }
  throw new Error(`No he encontrado el usuario ${config.ALLOWED_EMAIL} en Supabase (Authentication → Users).`);
}
