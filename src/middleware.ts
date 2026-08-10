import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose/jwt/verify";
import { SESSION_COOKIE } from "@/lib/auth/types";

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
  const session = await readEdgeSession(request);

  // Scanner mobile via QR — público (auth = token na URL)
  if (pathname.startsWith("/m/scan")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/login")) {
    if (session) {
      const dest = session.isPlatformAdmin ? "/admin" : "/painel";
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/painel")) {
    if (!session) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    if (!session) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    if (!session.isPlatformAdmin) {
      return NextResponse.redirect(new URL("/painel", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/painel/:path*", "/admin/:path*", "/login", "/m/:path*"],
};
