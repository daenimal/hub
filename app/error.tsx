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
      // errore di segnalazione ignorato
    });
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold tracking-tight">
          Qualcosa è andato storto
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          L&apos;errore è stato segnalato automaticamente.
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-6 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Riprova
        </button>
      </div>
    </div>
  );
}