"use client";

import { useEffect } from "react";

type ClientError = {
  message: string;
  stack?: string;
  path: string;
};

export function ClientErrorMonitor() {
  useEffect(() => {
    let lastSentAt = 0;
    const THROTTLE_MS = 2_000;

    function sendError(error: ClientError) {
      const now = Date.now();
      if (now - lastSentAt < THROTTLE_MS) {
        return;
      }
      lastSentAt = now;

      fetch("/api/log", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "client",
          severity: "error",
          message: error.message.slice(0, 2000),
          stack: error.stack?.slice(0, 8000),
          path: error.path,
        }),
      }).catch(() => {
        // handling of the failure is intentionally ignored
      });
    }

    function onError(event: ErrorEvent) {
      sendError({
        message: event.message || "Unknown error",
        stack: event.error instanceof Error ? event.error.stack : undefined,
        path: window.location.pathname,
      });
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message =
        reason instanceof Error ? reason.message : String(reason);
      sendError({
        message,
        stack: reason instanceof Error ? reason.stack : undefined,
        path: window.location.pathname,
      });
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}