import { NextResponse } from "next/server";
import { PathError } from "@/lib/fs/safe-path";
import { READ_ONLY } from "@/lib/config";

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof PathError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  console.error("[gallery] request failed", error);
  const message = error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export function assertWritable(): void {
  if (READ_ONLY) {
    throw new PathError("The gallery is running in read-only mode", 403);
  }
}

export async function readJsonBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    const raw = await request.text();
    return (raw ? JSON.parse(raw) : {}) as T;
  } catch {
    throw new SyntaxError("Invalid JSON body");
  }
}

export function noStoreHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    "Cache-Control": "no-store, max-age=0",
    ...extra,
  };
}
