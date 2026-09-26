import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PasswordChangeForm } from "@/components/password-change-form";
import { SignOutButton } from "@/components/sign-out-button";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My Account",
  robots: { index: false },
};

export default async function AccountPage() {
  if (!getSupabaseConfig()) {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    notFound();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email, premium, created_at")
    .eq("id", user.id)
    .maybeSingle();

  const isPremium = profile?.premium === true;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-5 sm:px-6 lg:h-[calc(100dvh-4rem)] lg:min-h-0 lg:overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-4">
          <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-300">
            {isPremium ? "Premium account" : "Free account"}
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            My Account
          </h1>
        </div>
        <p className="max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Welcome, {user.email}.
        </p>
      </header>

      <div className="mt-5 flex min-h-0 flex-1 flex-col gap-5 lg:flex-row">
        <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Profile
          </h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-zinc-500 dark:text-zinc-500">
                Email
              </dt>
              <dd className="mt-1 truncate font-semibold">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500 dark:text-zinc-500">Role</dt>
              <dd className="mt-1 font-semibold">
                {profile?.role === "admin" ? "Admin" : "Member"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500 dark:text-zinc-500">
                Member since
              </dt>
              <dd className="mt-1 font-semibold">
                {profile
                  ? new Date(profile.created_at).toLocaleDateString("en-GB")
                  : "—"}
              </dd>
            </div>
          </dl>
          {profile?.role === "admin" ? (
            <Link
              href="/admin/dashboard"
              className="mt-4 inline-block text-sm font-medium text-orange-600 hover:underline dark:text-orange-400"
            >
              Open admin dashboard
            </Link>
          ) : null}
        </section>

        <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Plan
          </h2>
          {isPremium ? (
            <>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Your premium account includes advanced conversion settings,
                custom preset saving, and preferences that follow you across
                devices.
              </p>
              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
                Billing and subscription management are coming soon.
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                You&apos;re on the free plan. The PSX 8-bit preset is included —
                premium adds advanced conversion settings and custom preset
                saving.
              </p>
              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
                Billing and subscription management are coming soon.
              </p>
            </>
          )}
        </section>

        <section className="flex min-h-0 flex-[1.2] flex-col rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Security
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Update your password. You&apos;ll need your current password to
            confirm the change.
          </p>
          <PasswordChangeForm email={user.email} />
        </section>
      </div>

      <footer className="mt-5 flex shrink-0 flex-wrap items-center gap-4">
        <SignOutButton />
        <Link
          href="/"
          className="rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Back to the hub
        </Link>
      </footer>
    </div>
  );
}