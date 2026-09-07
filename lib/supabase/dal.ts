import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Data Access Layer entry point: verifies the caller has an active Supabase
 * session and returns it, redirecting to /login otherwise. Memoized per
 * request with React's cache() so calling this from multiple Server
 * Components/Server Actions in one render doesn't re-check the session
 * multiple times.
 *
 * Every trade query/mutation should go through this (directly, or via a
 * helper that calls it) rather than trusting a client-supplied user id -
 * Postgres RLS is the real backstop, but this is where "is anyone logged in
 * at all" gets checked close to the data.
 */
export const verifySession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { userId: user.id, email: user.email };
});

/** Same as verifySession, but returns null instead of redirecting. */
export const getOptionalSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? { userId: user.id, email: user.email } : null;
});
