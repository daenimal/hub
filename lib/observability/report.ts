import { getSupabaseConfig } from "@/lib/supabase/env";

const SOURCES = ["client", "server", "proxy"] as const;
const SEVERITIES = ["info", "warning", "error", "fatal"] as const;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const LIMITS = {
  message: 2000,
  stack: 8000,
  digest: 64,
  route: 256,
  path: 500,
  userAgent: 300,
};

export type ErrorEntry = {
  source: (typeof SOURCES)[number];
  severity: (typeof SEVERITIES)[number];
  message: string;
  digest?: string | null;
  route?: string | null;
  path?: string | null;
  method?: string | null;
  status_code?: number | null;
  stack?: string | null;
  user_agent?: string | null;
};

function toString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

export function sanitizeEntry(raw: unknown): ErrorEntry | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const r = raw as Record<string, unknown>;
  const message = toString(r.message, LIMITS.message);
  if (!message) {
    return null;
  }

  const source = SOURCES.includes(r.source as never)
    ? (r.source as ErrorEntry["source"])
    : "server";
  const severity = SEVERITIES.includes(r.severity as never)
    ? (r.severity as ErrorEntry["severity"])
    : "error";
  const method = METHODS.includes(r.method as never)
    ? (r.method as string)
    : null;
  const statusCode =
    typeof r.status_code === "number" &&
    Number.isInteger(r.status_code) &&
    r.status_code >= 100 &&
    r.status_code <= 599
      ? r.status_code
      : null;

  return {
    source,
    severity,
    message,
    digest: toString(r.digest, LIMITS.digest),
    route: toString(r.route, LIMITS.route),
    path: toString(r.path, LIMITS.path),
    method,
    status_code: statusCode,
    stack: toString(r.stack, LIMITS.stack),
    user_agent: toString(r.user_agent, LIMITS.userAgent),
  };
}

// In-memory throttle to avoid flooding the table during bursts. Each
// serverless instance keeps its own map, which is enough for the window.
const lastSentAt = new Map<string, number>();
const THROTTLE_MS = 15_000;

export async function reportError(entry: ErrorEntry): Promise<void> {
  const config = getSupabaseConfig();
  if (!config) {
    return;
  }

  const key = `${entry.source}:${entry.message}`;
  const now = Date.now();
  if (now - (lastSentAt.get(key) ?? 0) < THROTTLE_MS) {
    return;
  }
  lastSentAt.set(key, now);

  try {
    await fetch(`${config.url}/rest/v1/app_errors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(entry),
    });
  } catch {
    // Reporting must never crash the app or the error path.
  }
}