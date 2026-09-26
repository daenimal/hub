"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    fetch("/api/log", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "client",
        severity: "error",
        message: error.message.slice(0, 2000),
        digest: error.digest,
        stack: error.stack?.slice(0, 8000),
        path: window.location.pathname,
      }),
    }).catch(() => {
      // reporting failure intentionally ignored
    });
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold tracking-tight">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          The error was reported automatically.
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-6 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500"
        >
          Try again
        </button>
      </div>
    </div>
  );
}