import { NextResponse } from "next/server";

import { reportError, sanitizeEntry } from "@/lib/observability/report";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const entry = sanitizeEntry(body);

  if (!entry) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await reportError(entry);
  return NextResponse.json({ ok: true });
}