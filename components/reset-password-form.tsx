"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { PasswordInput } from "@/components/password-input";

type Flow = "exchanging" | "ready" | "invalid" | "done" | "not-configured";

function ResetPasswordFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  const [flow, setFlow] = useState<Flow>(() => {
    if (!getSupabaseConfig()) {
      return "not-configured";
    }
    if (!code) {
      return "invalid";
    }
    return "exchanging";
  });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (flow !== "exchanging" || !code) {
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (cancelled) {
          return;
        }
        setFlow(error ? "invalid" : "ready");
      })
      .catch(() => {
        if (!cancelled) {
          setFlow("invalid");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [flow, code]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    const { error: updateError } = await createClient().auth.updateUser({
      password,
    });
    setIsSubmitting(false);

    if (updateError) {
      setError("Could not update the password. Try again.");
      return;
    }

    setFlow("done");
  }

  async function goToSignIn() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (flow === "not-configured") {
    return (
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold tracking-tight">
          Reset your password
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Auth is not configured: set the Supabase environment variables.
        </p>
        <Link
          href="/login"
          className="inline-block w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  if (flow === "invalid") {
    return (
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold tracking-tight">
          Invalid or expired link
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          This password reset link is invalid or has expired. Request a new one
          to continue.
        </p>
        <div className="space-y-2">
          <Link
            href="/forgot-password"
            className="inline-block w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500"
          >
            Request a new link
          </Link>
          <Link
            href="/login"
            className="inline-block w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (flow === "done") {
    return (
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold tracking-tight">
          Password updated
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Your password has been changed. Sign in with the new one to access
          your premium account.
        </p>
        <button
          type="button"
          onClick={goToSignIn}
          className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500"
        >
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Set a new password
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {flow === "exchanging"
            ? "Verifying your security link..."
            : "Choose a new password for your premium account."}
        </p>
      </div>

      {flow === "exchanging" ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
      ) : (
        <>
          <PasswordInput
            id="new-password"
            label="New password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            autoFocus
            hint={{
              text: "At least 8 characters.",
              state:
                password.length === 0
                  ? "idle"
                  : password.length >= 8
                    ? "ok"
                    : "error",
            }}
          />

          <PasswordInput
            id="new-password-confirm"
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            hint={
              !confirm
                ? { text: "Re-enter your password.", state: "idle" }
                : confirm === password
                  ? { text: "Passwords match.", state: "ok" }
                  : { text: "Passwords do not match.", state: "error" }
            }
          />

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
          >
            {isSubmitting ? "Updating..." : "Update password"}
          </button>
        </>
      )}

      <p className="text-center text-sm text-zinc-500 dark:text-zinc-500">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
          Loading...
        </div>
      }
    >
      <ResetPasswordFormInner />
    </Suspense>
  );
}