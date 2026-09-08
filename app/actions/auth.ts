"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { createClient } from "@/lib/supabase/server";

const CredentialsSchema = z.object({
  email: z.email({ error: "Enter a valid email." }),
  password: z.string().min(8, { error: "Password must be at least 8 characters." }),
});

export type AuthFormState = { error?: string; message?: string } | undefined;

export async function signUp(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = CredentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) return { error: error.message };

  // If the Supabase project requires email confirmation, signUp() creates
  // the user but does NOT start a session - data.session is null until the
  // confirmation link is clicked. Redirecting to /journal in that case just
  // bounces the user straight back to /login (no session), with no
  // explanation. Tell them what's actually happening instead.
  if (!data.session) {
    return { message: "Check your email to confirm your account, then log in." };
  }

  redirect("/journal");
}

export async function signIn(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = CredentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Distinguish "you haven't confirmed your email yet" from a wrong
    // password - same underlying signInWithPassword() error, but a
    // different, actionable next step for the user.
    if (error.code === "email_not_confirmed") {
      return { error: "Please confirm your email first - check your inbox for the confirmation link." };
    }
    return { error: "Invalid email or password." };
  }

  redirect("/journal");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
