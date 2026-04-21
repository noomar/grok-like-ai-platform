import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  const url = new URL("/", request.url);
  const response = NextResponse.redirect(url, { status: 303 });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
