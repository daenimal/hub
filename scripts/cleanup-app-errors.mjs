// app_errors retention.
// Deletes app_errors rows older than RETENTION_DAYS (default 30) using the
// service role key. Run daily/weekly via GitHub Actions.
//
// Usage: node scripts/cleanup-app-errors.mjs
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (fallback: .env.local).
//      RETENTION_DAYS (default 30).

import { readFileSync } from "node:fs";

const RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? 30);

function readEnvLocal(key) {
  try {
    const content = readFileSync(".env.local", "utf8");
    const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
    return match ? match[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

const API_URL =
  process.env.SUPABASE_URL || readEnvLocal("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY || readEnvLocal("SUPABASE_SERVICE_ROLE_KEY");

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function main() {
  if (!API_URL || !SERVICE_ROLE) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const before = isoDaysAgo(RETENTION_DAYS);
  const url = `${API_URL}/rest/v1/app_errors?created_at=lt.${before}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      Prefer: "return=representation",
    },
  });

  if (!res.ok) {
    throw new Error(`Supabase delete failed: ${res.status} ${await res.text()}`);
  }

  const deleted = (await res.json()).length;
  console.log(`Deleted ${deleted} app_errors older than ${RETENTION_DAYS} days.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});