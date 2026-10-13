import { config } from "../config";
import { supabase } from "../supabase";

/** Id da utilizadora com acesso (ALLOWED_EMAIL). Os scripts trabalham sempre com os dados dela. */
export async function allowedUserId(): Promise<string> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find((u) => (u.email ?? "").toLowerCase() === config.ALLOWED_EMAIL);
    if (user) return user.id;
    if (data.users.length < 100) break;
  }
  throw new Error(`Não encontrei o utilizador ${config.ALLOWED_EMAIL} no Supabase (Authentication → Users).`);
}
