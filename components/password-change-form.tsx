"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { PasswordInput } from "@/components/password-input";

export function PasswordChangeForm({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from the current one.");
      return;
    }

    if (!getSupabaseConfig()) {
      setError(
        "Auth is not configured: set the Supabase environment variables.",
      );
      return;
    }

    setIsSubmitting(true);

    const supabase = createClient();

    // Re-authenticate with the current password so the session is fresh and
    // the new password is validated against the existing credentials.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (signInError) {
      setIsSubmitting(false);
      setError("Current password is incorrect.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setIsSubmitting(false);

    if (updateError) {
      setError("Could not update the password. Try again.");
      return;
    }

    setPasswordStrings("");
    setSuccess(true);
  }

  function setPasswordStrings(clear: string) {
    setCurrentPassword(clear);
    setNewPassword(clear);
    setConfirmPassword(clear);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-4"
      aria-label="Change password"
    >
      <PasswordInput
        id="current-password"
        label="Current password"
        value={currentPassword}
        onChange={setCurrentPassword}
        autoComplete="current-password"
        required
        maxLength={72}
      />

      <PasswordInput
        id="new-password"
        label="New password"
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={72}
        hint={{
          text: "At least 8 characters.",
          state:
            newPassword.length === 0
              ? "idle"
              : newPassword.length >= 8
                ? "ok"
                : "error",
        }}
      />

      <PasswordInput
        id="confirm-new-password"
        label="Confirm new password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={72}
        hint={
          !confirmPassword
            ? { text: "Re-enter your password.", state: "idle" }
            : confirmPassword === newPassword
              ? { text: "Passwords match.", state: "ok" }
              : { text: "Passwords do not match.", state: "error" }
        }
      />

      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}

      {success ? (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
        >
          Password updated.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
      >
        {isSubmitting ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}