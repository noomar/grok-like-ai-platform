import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/session";

const ONE_WEEK = 60 * 60 * 24 * 7;

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const password = String(form?.get("password") ?? "");
  const nextParam = form?.get("next");
  const next =
    typeof nextParam === "string" && nextParam.startsWith("/admin")
      ? nextParam
      : "/admin";

  const expected = process.env.ADMIN_PASSWORD ?? "aurora-admin";
  if (password !== expected) {
    const url = new URL("/admin/login", request.url);
    url.searchParams.set("error", "1");
    return NextResponse.redirect(url, { status: 303 });
  }

  const response = NextResponse.redirect(new URL(next, request.url), { status: 303 });
  response.cookies.set(ADMIN_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_WEEK,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
