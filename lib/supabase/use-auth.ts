"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { getSupabaseConfig } from "@/lib/supabase/env";

export type AuthUser = {
  id: string;
  email: string | null;
} | null;

/**
 * Returns the currently signed-in user, admin flag, and premium flag
 * (subscription to auth changes). When Supabase is not configured, these stay
 * null / false.
 *
 * `isLoading` is true while the initial session is still being resolved, so
 * callers can avoid flashing a wrong logged-in/logged-out UI.
 */
export function useAuth(): {
  user: AuthUser;
  isAdmin: boolean;
  isPremium: boolean;
  isLoading: boolean;
} {
  const [user, setUser] = useState<AuthUser>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
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
      setIsPremium(false);
      if (!sessionUser) {
        setIsLoading(false);
        return;
      }
      void supabase
        .from("profiles")
        .select("role, premium")
        .eq("id", sessionUser.id)
        .maybeSingle()
        .then(
          ({ data }) => {
            if (!active) {
              return;
            }
            setIsAdmin(data?.role === "admin");
            setIsPremium(data?.premium === true);
            setIsLoading(false);
          },
          () => {
            if (!active) {
              return;
            }
            setIsAdmin(false);
            setIsPremium(false);
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

  return { user, isAdmin, isPremium, isLoading };
}