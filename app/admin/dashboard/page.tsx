import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getSupabaseConfig } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  robots: { index: false },
};

export default async function AdminDashboardPage() {
  if (!getSupabaseConfig()) {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email, full_name, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-12 sm:px-6">
      <header className="pb-10">
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
          Restricted area
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Admin Dashboard
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Welcome{profile.full_name ? `, ${profile.full_name}` : ""}. From
          here you&apos;ll manage profiles, usage limits, and tool config.
        </p>
      </header>

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Profile
          </h2>
          <p className="mt-2 truncate text-sm font-semibold">{profile.email}</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
            Role: admin - registered on{" "}
            {new Date(profile.created_at).toLocaleDateString("en-GB")}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Security
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            This route is protected on three levels: Client Guard, Next.js
            Proxy, and RLS/`is_admin()` at the database.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            User management
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Advanced profile management will be added with the next vertical
            slice.
          </p>
        </div>
      </section>
    </div>
  );
}