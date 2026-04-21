import { cookies } from "next/headers";

export const SESSION_COOKIE = "aurora_gate";
export const ADMIN_COOKIE = "aurora_admin";

const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

export async function isGateVerified(): Promise<boolean> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value === "1";
}

export async function setGateVerified() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_WEEK_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearGate() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get(ADMIN_COOKIE)?.value === "1";
}

/**
 * Header-based admin check used by automation (migration CLI, heartbeat
 * workflow). Compares `x-admin-password` against `ADMIN_PASSWORD`.
 * Intentionally lax on the dev default so the "aurora-admin" password works
 * locally, but in production you MUST set ADMIN_PASSWORD to something strong.
 */
export function isAdminHeader(headerValue: string | undefined): boolean {
  if (!headerValue) return false;
  const expected = process.env.ADMIN_PASSWORD ?? "aurora-admin";
  // Constant-time-ish compare.
  if (headerValue.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < headerValue.length; i += 1) {
    diff |= headerValue.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function setAdmin() {
  const store = await cookies();
  store.set(ADMIN_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_WEEK_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearAdmin() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}
