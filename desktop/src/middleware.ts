import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Routes that require authentication
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/emails",
  "/broadcast",
  "/templates",
  "/audience",
  "/metrics",
  "/settings",
];

// Routes only for unauthenticated users (redirect away if logged in)
const AUTH_ROUTES = ["/login", "/signup"];

// Routes that handle auth callbacks (skip auth check)
const AUTH_CALLBACK_ROUTES = ["/auth"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const isAuthRoute = AUTH_ROUTES.some((route) =>
    pathname.startsWith(route)
  );
  const isAuthCallback = AUTH_CALLBACK_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Only run auth check on relevant routes
  if (!isProtected && !isAuthRoute) {
    return NextResponse.next();
  }

  // Auth callback routes pass through (server handles them)
  if (isAuthCallback) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isAuthenticated = !!session;

  // Not logged in → trying to access a protected page → redirect to login
  if (isProtected && !isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    // Preserve OAuth code if present (PKCE flow)
    const code = request.nextUrl.searchParams.get("code");
    if (code) {
      url.searchParams.set("code", code);
    }
    return NextResponse.redirect(url);
  }

  // Already logged in → trying to access login/signup → redirect to dashboard
  if (isAuthRoute && isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
