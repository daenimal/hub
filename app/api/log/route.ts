import { NextResponse } from "next/server";

import { reportError, sanitizeEntry } from "@/lib/observability/report";

const MAX_JSON_BODY_BYTES = 32 * 1024;

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ ok: false }, { status: 415 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const entry = sanitizeEntry(body);

  if (!entry) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await reportError(entry);
  return NextResponse.json({ ok: true });
}