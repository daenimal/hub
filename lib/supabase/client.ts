import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

export function createClient() {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error(
      "Supabase non configurato: imposta NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }

  return createBrowserClient<Database>(config.url, config.anonKey);
}