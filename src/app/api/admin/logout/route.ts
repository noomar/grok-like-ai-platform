import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/admin/login", request.url), { status: 303 });
  response.cookies.delete(ADMIN_COOKIE);
  return response;
}
