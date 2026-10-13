"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { LoginScreen } from "./LoginScreen";
import { Spinner } from "./ui";

const SessionContext = createContext<Session | null>(null);
export const useSession = () => useContext(SessionContext);

/** Mostra o ecrã de entrada se não houver sessão; caso contrário, a aplicação. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const t = useT();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="card p-6">
          <h1 className="text-xl font-semibold">{t.auth.missingConfigTitle}</h1>
          <p className="text-muted mt-2">{t.auth.missingConfigText}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner label={t.common.loading} />
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
