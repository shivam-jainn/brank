import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // Check for the session token cookie from Better Auth
  const sessionToken = request.cookies.get("better-auth.session_token")?.value;
  const { pathname } = request.nextUrl;

  // Define paths
  const isAuthOrLandingPath = pathname.startsWith("/auth/sign-in") || pathname.startsWith("/auth/sign-up") || pathname === "/";
  const isProtectedPath = pathname.startsWith("/chat") || pathname.startsWith("/dashboard") || pathname.startsWith("/settings");

  // Redirect users who are logged in away from auth/landing paths
  if (isAuthOrLandingPath && sessionToken) {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  // Redirect users who are NOT logged in away from protected paths
  if (isProtectedPath && !sessionToken) {
    return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
