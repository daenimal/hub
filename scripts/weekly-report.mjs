// Weekly monitoring report.
// Reads app_errors from Supabase (last 7 days), checks recent Vercel/GitHub
// deployment statuses, and creates a GitHub issue with the summary.
//
// Usage (local, no issue):      node scripts/weekly-report.mjs
// Usage (CI, with issue):       node scripts/weekly-report.mjs --create-issue
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (fallback: .env.local),
//      GITHUB_REPOSITORY (defaults to daenimal/hub).

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const DAYS = 7;
const REPO = process.env.GITHUB_REPOSITORY || "daenimal/hub";
const CREATE_ISSUE = process.argv.includes("--create-issue");

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

function fmtDate(iso) {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}

async function fetchErrors() {
  const since = isoDaysAgo(DAYS);
  const url = `${API_URL}/rest/v1/app_errors?created_at=gte.${since}&order=created_at.asc&limit=1000`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase query failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function gh(command) {
  return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function fetchDeploymentFailures() {
  try {
    const deployments = JSON.parse(
      gh(`gh api repos/${REPO}/deployments?per_page=100&environment=Production`),
    );
    const since = isoDaysAgo(DAYS);
    return deployments
      .filter((d) => d.created_at >= since)
      .map((d) => {
        let state = "unknown";
        try {
          const statuses = JSON.parse(
            gh(`gh api repos/${REPO}/deployments/${d.id}/statuses`),
          );
          state = statuses[0]?.state ?? "unknown";
        } catch {}
        return {
          sha: d.sha.slice(0, 7),
          created_at: d.created_at,
          state,
          ref: d.ref,
        };
      })
      .filter((d) => !["success", "inactive"].includes(d.state));
  } catch {
    return [];
  }
}

function groupErrors(errors) {
  const groups = new Map();
  for (const e of errors) {
    const key = `${e.source}::${e.message}`;
    const g = groups.get(key) ?? { ...e, first_seen: e.created_at, last_seen: e.created_at, occurrences: 0 };
    g.occurrences += 1;
    if (e.created_at < g.first_seen) g.first_seen = e.created_at;
    if (e.created_at > g.last_seen) g.last_seen = e.created_at;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.occurrences - a.occurrences);
}

async function main() {
  if (!API_URL || !SERVICE_ROLE) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const errors = await fetchErrors();
  const groups = groupErrors(errors);
  const failures = fetchDeploymentFailures();

  const date = new Date().toISOString().slice(0, 10);
  const title = `Weekly monitoring report - ${date}`;

  const lines = [];
  lines.push(`## Period: last ${DAYS} days`);
  lines.push("");
  lines.push(`- Errors logged: **${errors.length}**`);
  lines.push(`- Distinct groups (by message): **${groups.length}**`);
  lines.push(`- Failed deployments (Vercel/GitHub): **${failures.length}**`);
  lines.push("");

  if (errors.length === 0 && failures.length === 0) {
    lines.push("No errors detected in the period. :green_circle:");
  } else {
    if (groups.length > 0) {
      lines.push("### Grouped errors");
      lines.push("");
      lines.push("| # | Source | Message | Routes | First seen | Last seen |");
      lines.push("|---|--------|---------|--------|------------|-----------|");
      for (const g of groups.slice(0, 50)) {
        const routes = [...new Set([g.route, g.path].filter(Boolean))]
          .slice(0, 3)
          .join(", ");
        lines.push(
          `| ${g.occurrences} | ${g.source} | ` +
            `\`${g.message.slice(0, 120).replaceAll("|", "\\|")}\` | ` +
            `${routes} | ${fmtDate(g.first_seen)} | ${fmtDate(g.last_seen)} |`,
        );
      }
    }

    if (failures.length > 0) {
      lines.push("");
      lines.push("### Failed deployments");
      lines.push("| Sha | State | Date |");
      lines.push("|-----|-------|------|");
      for (const f of failures) {
        lines.push(`| ${f.sha} | ${f.state} | ${fmtDate(f.created_at)} |`);
      }
    }

    lines.push("");
    lines.push("### Diagnostics");
    lines.push(
      "- Repeated messages point to a stable bug to fix; sporadic errors should be correlated with the deployments in the period.",
    );
    lines.push(
      "- To fix: open the error log (`SELECT * FROM app_errors WHERE " +
        "message = '...';` in the Supabase SQL editor with an admin role), identify the route and apply the fix on a feature branch.",
    );
  }

  const body = lines.join("\n");

  if (CREATE_ISSUE) {
    const tmp = `.report-${date}.md`;
    const { writeFileSync } = await import("node:fs");
    writeFileSync(tmp, body);
    gh(`gh issue create --repo ${REPO} --title "${title}" --body-file "${tmp}"`);
    console.log(`Issue created: ${title}`);
  } else {
    console.log(body);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});