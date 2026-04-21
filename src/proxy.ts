import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, ADMIN_COOKIE } from "@/lib/session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/dashboard") || pathname.startsWith("/factory")) {
    const verified = request.cookies.get(SESSION_COOKIE)?.value === "1";
    if (!verified) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.searchParams.set("gate", "required");
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const isAdmin = request.cookies.get(ADMIN_COOKIE)?.value === "1";
    if (!isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/factory/:path*", "/admin/:path*"],
};
