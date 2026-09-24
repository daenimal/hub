export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

/**
 * Returns the Supabase config, or null when not configured.
 * Used to let the UI render (unauthenticated) during local development
 * before a Supabase project + .env.local exist.
 */
export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}