import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

const AGE_COOKIE = "budtube_age_ok";
const AGE_EXEMPT_PATHS = ["/age-gate"];
const AUTH_REQUIRED_PATHS = ["/upload", "/dashboard", "/settings", "/admin"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 21+ age gate: everything except the gate itself requires the cookie.
  const ageOk = request.cookies.get(AGE_COOKIE)?.value === "1";
  if (!ageOk && !AGE_EXEMPT_PATHS.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/age-gate";
    url.search = "";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Auth guard for creator pages. Server actions re-verify — this is just UX.
  if (AUTH_REQUIRED_PATHS.some((p) => pathname.startsWith(p))) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const session = token ? await verifySessionToken(token) : null;
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      url.search = "";
      url.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.svg|placeholder-thumb.svg).*)",
  ],
};
