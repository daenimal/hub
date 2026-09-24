"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { getSupabaseConfig } from "@/lib/supabase/env";

export type AuthUser = {
  id: string;
  email: string | null;
} | null;

/**
 * Returns the currently signed-in user (subscription to auth changes).
 * When Supabase is not configured, this stays null.
 */
export function useAuth(): { user: AuthUser; isLoading: boolean } {
  const [user, setUser] = useState<AuthUser>(null);
  const [isLoading, setIsLoading] = useState<boolean>(() => !getSupabaseConfig());

  useEffect(() => {
    let active = true;

    if (!getSupabaseConfig()) {
      return;
    }

    const supabase = createClient();

    void supabase.auth.getUser().then(({ data }) => {
      if (!active) {
        return;
      }
      setUser(
        data.user
          ? { id: data.user.id, email: data.user.email ?? null }
          : null,
      );
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) {
        return;
      }
      setUser(
        session?.user
          ? { id: session.user.id, email: session.user.email ?? null }
          : null,
      );
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, isLoading };
}