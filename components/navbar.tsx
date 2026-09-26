"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-provider";
import { useAuth } from "@/lib/supabase/use-auth";

const linkBase =
  "rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const linkIdle =
  "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50";
const linkActive =
  "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300";

function isPathActive(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function Navbar() {
  const { user, isAdmin, isLoading } = useAuth();
  const pathname = usePathname();

  const textureActive = isPathActive(pathname, "/tools/texture-optimizer");
  const accountActive = isPathActive(pathname, "/account");

  function navClass(active: boolean) {
    return active ? `${linkBase} ${linkActive}` : `${linkBase} ${linkIdle}`;
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200/70 bg-[var(--background)]/80 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/70 dark:border-zinc-800">
      <nav className="mx-auto flex h-16 w-full max-w-screen-2xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-base font-semibold tracking-tight"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 font-black text-white shadow-sm">
            H
          </span>
          Hub
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/tools/texture-optimizer"
            aria-current={textureActive ? "page" : undefined}
            className={`hidden sm:inline-flex ${navClass(textureActive)}`}
          >
            Texture
          </Link>
          {user ? (
            <Link
              href="/account"
              prefetch={false}
              aria-current={accountActive ? "page" : undefined}
              className={navClass(accountActive)}
            >
              Account
            </Link>
          ) : null}
          {isAdmin ? (
            <Link
              href="/admin/dashboard"
              prefetch={false}
              aria-current={isPathActive(pathname, "/admin") ? "page" : undefined}
              className={navClass(isPathActive(pathname, "/admin"))}
            >
              Admin
            </Link>
          ) : null}
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <ThemeToggle />
          {isLoading ? null : user ? (
            <>
              {user.email ? (
                <span className="hidden min-w-0 truncate text-sm text-zinc-600 dark:text-zinc-400 sm:inline">
                  {user.email}
                </span>
              ) : null}
              <SignOutButton />
            </>
          ) : (
            <>
              <Link
                href="/register"
                className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
              >
                Sign up
              </Link>
              <Link
                href="/login"
                className="rounded-lg bg-orange-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}