// Applies the auth email templates (subject + HTML content) to the linked
// Supabase project via the Management API (PATCH /v1/projects/{ref}/config/auth).
// With --with-smtp it first configures a custom SMTP provider (required on the
// free tier before email templates can be customized).
//
// Templates live in supabase/templates/*.html; subjects + mapping live in
// supabase/email-templates.json (single source of truth, like migrations).
//
// Usage:  node scripts/apply-email-templates.mjs [--dry-run] [--with-smtp]
//
// Env:    SUPABASE_PROJECT_REF   (defaults to supabase/.temp/project-ref)
//         SUPABASE_ACCESS_TOKEN  (defaults to ~/.supabase/access-token)
//         SMTP_ENV_FILE          (defaults to ./smtp.env.local, git-ignored)

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY_RUN = process.argv.includes("--dry-run");
const WITH_SMTP = process.argv.includes("--with-smtp");

function resolveProjectRef() {
  if (process.env.SUPABASE_PROJECT_REF) {
    return process.env.SUPABASE_PROJECT_REF.trim();
  }
  const path = join(ROOT, "supabase", ".temp", "project-ref");
  return existsSync(path) ? readFileSync(path, "utf8").trim() : undefined;
}

function resolveAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const path = join(homedir(), ".supabase", "access-token");
  return existsSync(path) ? readFileSync(path, "utf8").trim() : undefined;
}

function readEnvFile(file) {
  const values = {};
  if (!existsSync(file)) {
    return values;
  }
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      values[match[1]] = match[2].trim();
    }
  }
  return values;
}

function loadSmtpConfig() {
  const file = process.env.SMTP_ENV_FILE || join(ROOT, "smtp.env.local");
  const env = readEnvFile(file);
  const required = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_SENDER_NAME",
    "SMTP_SENDER_EMAIL",
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    console.error(
      `Missing SMTP settings in ${file}: ${missing.join(", ")} (copy the block from .env.example)`,
    );
    process.exit(1);
  }

  return {
    smtp_host: env.SMTP_HOST,
    smtp_port: Number(env.SMTP_PORT),
    smtp_user: env.SMTP_USER,
    smtp_pass: env.SMTP_PASS,
    smtp_sender_name: env.SMTP_SENDER_NAME,
    smtp_sender_email: env.SMTP_SENDER_EMAIL,
    ...(env.SMTP_ADMIN_EMAIL ? { smtp_admin_email: env.SMTP_ADMIN_EMAIL } : {}),
  };
}

function loadTemplates() {
  const mapping = JSON.parse(
    readFileSync(join(ROOT, "supabase", "email-templates.json"), "utf8"),
  );
  const payload = {};
  for (const [key, value] of Object.entries(mapping)) {
    const content = readFileSync(join(ROOT, value.template), "utf8").trim();
    payload[`mailer_subjects_${key}`] = value.subject;
    payload[`mailer_templates_${key}_content`] = content;
    console.log(`Prepared ${key}: subject="${value.subject}" (${content.length} chars)`);
  }
  return payload;
}

async function patch(apiUrl, token, payload) {
  const res = await fetch(apiUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`PATCH failed: ${res.status} ${await res.text()}`);
  }
}

async function applyTemplatesWithRetry(apiUrl, token, payload, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await patch(apiUrl, token, payload);
      console.log(`Applied ${Object.keys(payload).length} template fields`);
      return;
    } catch (err) {
      // The free tier rejects template edits until the custom SMTP provider is
      // recognized; retry briefly in case the switch needs a moment to land.
      const blocked =
        err instanceof Error && err.message.includes("default email provider");
      if (!blocked || attempt === attempts) {
        throw err;
      }
      console.log(`Provider not ready yet, retrying (${attempt}/${attempts})...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function main() {
  const ref = resolveProjectRef();
  const token = resolveAccessToken();

  if (!ref) {
    console.error("Missing project ref: run 'supabase link' or set SUPABASE_PROJECT_REF");
    process.exit(1);
  }
  if (!token) {
    console.error("Missing access token: log in with the Supabase CLI or set SUPABASE_ACCESS_TOKEN");
    process.exit(1);
  }

  const apiUrl = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const templates = loadTemplates();

  if (WITH_SMTP) {
    const smtp = loadSmtpConfig();
    if (DRY_RUN) {
      console.log(`Dry run: would enable custom SMTP (${smtp.smtp_host}:${smtp.smtp_port}, sender ${smtp.smtp_sender_name} <${smtp.smtp_sender_email}>)`);
    } else {
      await patch(apiUrl, token, smtp);
      console.log(`Custom SMTP enabled (${smtp.smtp_host}:${smtp.smtp_port})`);
    }
  }

  if (DRY_RUN) {
    console.log(`Dry run: would PATCH ${apiUrl}`);
    for (const [key, value] of Object.entries(templates)) {
      const preview =
        typeof value === "string" && value.length > 120
          ? `${value.slice(0, 120)}...`
          : value;
      console.log(`  ${key} = ${preview}`);
    }
    return;
  }

  await applyTemplatesWithRetry(apiUrl, token, templates);
  console.log(`Email templates applied to project ${ref}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});