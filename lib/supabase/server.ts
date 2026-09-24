import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseConfig } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

export async function createClient() {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error(
      "Supabase non configurato: imposta NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // setAll was called from a Server Component, where cookies
          // are read-only. Session refresh is handled by the proxy.
        }
      },
    },
  });
}