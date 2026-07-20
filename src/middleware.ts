import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * Require an authenticated operator for the whole app except the sign-in page,
 * the NextAuth routes, and the cron endpoints (which use their own secret).
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname.startsWith("/signin") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron");

  if (isPublic) return NextResponse.next();

  if (!req.auth) {
    const url = new URL("/signin", req.nextUrl.origin);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
