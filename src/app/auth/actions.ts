"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getDemoCredentials, checkDemoLoginRateLimit } from "@/lib/demo-mode.server";
import { getServerSafeAppOrigin } from "@/lib/auth-origin.server";
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

  // Resolve safe origin and dynamic callback redirect URL
  const origin = await getServerSafeAppOrigin();
  const emailRedirectTo = `${origin}/auth/callback`;

  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.signUp({
    email: validation.normalizedEmail!,
    password: String(password),
    options: {
      emailRedirectTo,
    },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(sanitizeAuthError(error))}`);
  }

  revalidatePath("/", "layout");

  // If a session was issued automatically (autoconfirm enabled), proceed to dashboard.
  // Otherwise, guide user to verify their email before logging in.
  if (authData?.session) {
    redirect("/dashboard");
  } else {
    redirect(
      `/login?success=${encodeURIComponent(
        "Compte créé avec succès ! Veuillez vérifier votre boîte de réception pour confirmer votre adresse email avant de vous connecter."
      )}`
    );
  }
}

export async function resendConfirmationEmail(formData: FormData) {
  const rawEmail = formData.get("email");
  const email = normalizeEmail(rawEmail);
  const emailCheck = validateEmail(email);

  if (!emailCheck.valid) {
    redirect(`/login?error=${encodeURIComponent(emailCheck.error || "Veuillez saisir une adresse email valide.")}`);
  }

  const origin = await getServerSafeAppOrigin();
  const emailRedirectTo = `${origin}/auth/callback`;

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo,
    },
  });

  // Security Defense: Prevent user enumeration.
  // We do not leak whether an email exists or not.
  // Only surface explicit rate-limit errors.
  if (error) {
    const lower = error.message.toLowerCase();
    if (lower.includes("rate limit") || lower.includes("too many requests")) {
      redirect(
        `/login?error=${encodeURIComponent(
          "Trop de demandes récentes. Veuillez patienter quelques minutes avant de demander un nouvel email."
        )}`
      );
    }
  }

  redirect(
    `/login?success=${encodeURIComponent(
      "Si un compte non confirmé correspond à cette adresse, un nouvel email de confirmation vient d'être envoyé. Veuillez vérifier votre boîte de réception."
    )}`
  );
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

export async function loginAsDemo() {
  const rateLimit = await checkDemoLoginRateLimit();
  if (!rateLimit.allowed) {
    redirect(
      `/login?error=${encodeURIComponent(
        rateLimit.message ||
          "Trop de requêtes d'accès au mode démo. Veuillez patienter quelques secondes avant de réessayer."
      )}`
    );
  }

  const credentials = getDemoCredentials();
  if (!credentials) {
    redirect(
      `/login?error=${encodeURIComponent(
        "L'accès démo n'est pas configuré sur cette instance (identifiants serveur non définis)."
      )}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(
        "Accès démo temporairement indisponible. Veuillez réessayer ou utiliser vos identifiants."
      )}`
    );
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
