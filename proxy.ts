import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Routes that don't require an active session.
const PUBLIC_ROUTES = ["/", "/login", "/signup"];

/**
 * Runs on every request (see matcher below). Two jobs:
 *  1. Refresh the Supabase session cookie so it doesn't expire mid-visit
 *     (required by @supabase/ssr - see their Next.js guide).
 *  2. Optimistic auth redirect: bounce logged-out users away from protected
 *     routes, and logged-in users away from /login /signup. This is a fast
 *     cookie-only check, not the security boundary - Postgres RLS plus
 *     verifySession() in the DAL (lib/supabase/dal.ts) are what actually
 *     protect data; this just avoids a round trip to a page that would
 *     immediately redirect anyway.
 */
export default async function proxy(request: NextRequest) {
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
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublicRoute = PUBLIC_ROUTES.includes(path);

  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && (path === "/login" || path === "/signup")) {
    return NextResponse.redirect(new URL("/journal", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
