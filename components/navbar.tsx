import type { User } from "@supabase/supabase-js";
import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export async function Navbar() {
  const config = getSupabaseConfig();

  let user: User | null = null;
  let isAdmin = false;

  if (config) {
    const supabase = await createClient();
    const {
      data: { user: supabaseUser },
    } = await supabase.auth.getUser();
    user = supabaseUser;

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      isAdmin = profile?.role === "admin";
    }
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200/70 bg-[var(--background)]/80 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/70 dark:border-zinc-800">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-base font-semibold tracking-tight"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 font-black text-white shadow-sm">
            H
          </span>
          MicroHub
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/tools/texture-optimizer"
            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
          >
            Texture Optimizer
          </Link>
          {isAdmin ? (
            <Link
              href="/admin/dashboard"
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
            >
              Admin
            </Link>
          ) : null}
        </div>

        <div className="flex min-w-0 items-center gap-2">
          {user ? (
            <>
              {user?.email ? (
              <span className="hidden min-w-0 truncate text-sm text-zinc-600 dark:text-zinc-400 sm:inline">
                {user.email}
              </span>
            ) : null}
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}