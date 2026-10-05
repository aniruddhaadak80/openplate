import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-constants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Anonymous ownership, established here and nowhere else.
 *
 * There are no accounts. Ownership is an unguessable v4 UUID in an HTTP-only,
 * SameSite=Lax cookie, and every query is scoped by it, so one visitor can never
 * read or mutate another visitor's plates.
 *
 * This runs in the proxy (Next.js 16's successor to middleware) because Next.js
 * forbids writing a cookie during a Server Component render: a page that lazily
 * created its session would throw a 500 on the visitor's very first request. The
 * proxy sets the cookie on both the request and the response, so the page render
 * and the visitor's later API calls share one session from the first request
 * onwards, with no race and no session that appears to lose its data on the
 * second page view.
 */
export function proxy(request: NextRequest): NextResponse {
  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  if (existing && UUID_RE.test(existing)) {
    return NextResponse.next();
  }

  const id = crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set("cookie", `${SESSION_COOKIE}=${id}`);

  const response = NextResponse.next({ request: { headers } });
  response.cookies.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:woff2?|png|svg|jpg|jpeg|gif|ico|txt|xml|webmanifest)$).*)",
  ],
};
