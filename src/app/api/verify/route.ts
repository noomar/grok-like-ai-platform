import { NextRequest, NextResponse } from "next/server";
import { createId, getStore } from "@/lib/store";
import { SESSION_COOKIE } from "@/lib/session";

const WHATSAPP_URL = "https://wa.me/996500904998";
const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const nextParam = form?.get("next");
  const safeNext =
    typeof nextParam === "string" && nextParam.startsWith("/")
      ? nextParam
      : "/dashboard";

  const store = getStore();
  store.verifications += 1;
  store.userRequests.set(
    createId("req"),
    {
      id: createId("req"),
      userLabel: "guest · WhatsApp gate",
      kind: "verification",
      message: `Verification initiated → ${safeNext}`,
      createdAt: new Date().toISOString(),
      resolved: false,
    },
  );

  const response = NextResponse.redirect(WHATSAPP_URL, { status: 303 });
  response.cookies.set(SESSION_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_WEEK_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  response.cookies.set("aurora_next", safeNext, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return response;
}

export async function GET() {
  return NextResponse.redirect(new URL("/", "http://localhost"), { status: 307 });
}
