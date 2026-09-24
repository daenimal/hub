import type { Instrumentation } from "next";

import { reportError, sanitizeEntry } from "@/lib/observability/report";

export async function register() {
  // Reserved for future startup hooks (e.g. tracing init).
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const message = error instanceof Error ? error.message : String(error);
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined;
  const stack = error instanceof Error ? error.stack : undefined;
  const userAgent =
    typeof request.headers["user-agent"] === "string"
      ? request.headers["user-agent"]
      : undefined;

  const entry = sanitizeEntry({
    source: context.routeType === "proxy" ? "proxy" : "server",
    severity: "error",
    message,
    digest,
    route: context.routePath,
    path: request.path,
    method: request.method,
    status_code: 500,
    stack,
    user_agent: userAgent,
  });

  if (entry) {
    await reportError(entry);
  }
};