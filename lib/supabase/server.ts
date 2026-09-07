import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/**
 * Supabase client for use in Server Components, Server Actions, and Route
 * Handlers. Reads/writes the session via cookies, so `await cookies()` must
 * be available (it is not, in a context like generateStaticParams).
 *
 * Server Components can't set cookies (session refresh happens in proxy.ts
 * instead), so the try/catch below is expected there - it's a no-op, not a
 * bug: proxy.ts already refreshed the session cookie before the request
 * reached this render.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component - proxy.ts handles refresh.
          }
        },
      },
    },
  );
}
