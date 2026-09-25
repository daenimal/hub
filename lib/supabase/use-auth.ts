"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { getSupabaseConfig } from "@/lib/supabase/env";

export type AuthUser = {
  id: string;
  email: string | null;
} | null;

/**
 * Returns the currently signed-in user and admin flag (subscription to auth
 * changes). When Supabase is not configured, this stays null / false.
 *
 * `isLoading` is true while the initial session is still being resolved, so
 * callers can avoid flashing a wrong logged-in/logged-out UI.
 */
export function useAuth(): {
  user: AuthUser;
  isAdmin: boolean;
  isLoading: boolean;
} {
  const [user, setUser] = useState<AuthUser>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // With Supabase configured the session is unknown until resolved (loading);
  // without it the state is already settled, so never "loading".
  const [isLoading, setIsLoading] = useState<boolean>(() => !!getSupabaseConfig());

  useEffect(() => {
    let active = true;

    if (!getSupabaseConfig()) {
      return;
    }

    const supabase = createClient();

    function resolve(sessionUser: AuthUser) {
      setUser(sessionUser);
      setIsAdmin(false);
      if (!sessionUser) {
        setIsLoading(false);
        return;
      }
      void supabase
        .from("profiles")
        .select("role")
        .eq("id", sessionUser.id)
        .maybeSingle()
        .then(
          ({ data }) => {
            if (!active) {
              return;
            }
            setIsAdmin(data?.role === "admin");
            setIsLoading(false);
          },
          () => {
            if (!active) {
              return;
            }
            setIsAdmin(false);
            setIsLoading(false);
          },
        );
    }

    void supabase.auth.getUser().then(
      ({ data }) =>
        resolve(
          data.user
            ? { id: data.user.id, email: data.user.email ?? null }
            : null,
        ),
      () => resolve(null),
    );

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) {
        return;
      }
      resolve(
        session?.user
          ? { id: session.user.id, email: session.user.email ?? null }
          : null,
      );
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, isAdmin, isLoading };
}