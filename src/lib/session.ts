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
