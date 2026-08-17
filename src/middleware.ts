import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose/jwt/verify";
import { SESSION_COOKIE } from "@/lib/auth/types";
import { extractTenantSubdomain } from "@/lib/tenants/host";

async function readEdgeSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
    );
    return {
      sub: String(payload.sub ?? ""),
      isPlatformAdmin: Boolean(payload.isPlatformAdmin),
    };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host");
  const tenantSub = extractTenantSubdomain(host);

  // Subdomínio do sebo → vitrine pública /v/{slug}/...
  if (tenantSub) {
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api") ||
      pathname.startsWith("/v/") ||
      /\.[a-zA-Z0-9]+$/.test(pathname)
    ) {
      const res = NextResponse.next();
      res.headers.set("x-tenant-subdomain", tenantSub);
      return res;
    }
    const url = request.nextUrl.clone();
    const rest = pathname === "/" ? "" : pathname;
    url.pathname = `/v/${tenantSub}${rest}`;
    const res = NextResponse.rewrite(url);
    res.headers.set("x-tenant-subdomain", tenantSub);
    return res;
  }

  const session = await readEdgeSession(request);

  if (pathname.startsWith("/m/scan")) {
    return NextResponse.next();
  }

  // Não redirecionar /login aqui: cookie velho + /admin+/painel gerava loop.
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/painel") || pathname.startsWith("/admin")) {
    if (!session) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    if (pathname.startsWith("/painel")) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-pathname", pathname);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
