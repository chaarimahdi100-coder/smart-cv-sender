"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import {
  normalizeEmail,
  validateEmail,
  validatePassword,
  validateSignupPayload,
  sanitizeAuthError,
} from "@/lib/auth-utils";

export async function login(formData: FormData) {
  const email = normalizeEmail(formData.get("email"));
  const password = (formData.get("password") as string) || "";

  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) {
    redirect(`/login?error=${encodeURIComponent(emailCheck.error || "Please enter a valid email address.")}`);
  }

  const pwdCheck = validatePassword(password);
  if (!pwdCheck.valid) {
    redirect(`/login?error=${encodeURIComponent(pwdCheck.error || "Please enter your password.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(sanitizeAuthError(error))}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirm_password");

  const validation = validateSignupPayload({
    email,
    password,
    confirmPassword: confirmPassword !== null ? confirmPassword : password,
  });

  if (!validation.valid) {
    redirect(`/signup?error=${encodeURIComponent(validation.error || "Invalid registration information.")}`);
  }

  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.signUp({
    email: validation.normalizedEmail!,
    password: String(password),
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(sanitizeAuthError(error))}`);
  }

  revalidatePath("/", "layout");

  // If a session was issued automatically (autoconfirm enabled), proceed to dashboard.
  // Otherwise, guide user to login with success notice.
  if (authData?.session) {
    redirect("/dashboard");
  } else {
    redirect(
      `/login?success=${encodeURIComponent(
        "Account created successfully. You can now log in with your credentials."
      )}`
    );
  }
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    redirect(`/dashboard?error=${encodeURIComponent(sanitizeAuthError(error))}`);
  }
  revalidatePath("/", "layout");
  redirect("/login");
}
