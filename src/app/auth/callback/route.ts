import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getServerSafeAppOrigin } from "@/lib/auth-origin.server";
import { sanitizeNextRedirect, sanitizeAuthError } from "@/lib/auth-utils";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = sanitizeNextRedirect(requestUrl.searchParams.get("next"), "/dashboard");
  const error = requestUrl.searchParams.get("error");
  const errorCode = requestUrl.searchParams.get("error_code");
  const errorDescription = requestUrl.searchParams.get("error_description");

  const origin = await getServerSafeAppOrigin();

  // If Supabase returned an explicit error in query parameters
  if (error || errorCode) {
    const isExpired =
      errorCode === "otp_expired" ||
      (errorDescription && errorDescription.toLowerCase().includes("expired"));

    const userMessage = isExpired
      ? "Le lien de confirmation est invalide ou a expiré. Si votre compte a déjà été activé, connectez-vous avec votre mot de passe ci-dessous, ou demandez un nouvel email."
      : (errorDescription || "Échec de validation du lien d'authentification.");

    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(userMessage)}${isExpired ? "&expired=1" : ""}`
    );
  }

  // Handle PKCE code exchange
  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      // Successful confirmation and session exchange
      return NextResponse.redirect(`${origin}${next}`);
    }

    // Code exchange failed (e.g. code already used or expired)
    const isExpired =
      exchangeError.message.toLowerCase().includes("expired") ||
      exchangeError.message.toLowerCase().includes("invalid");

    const message = isExpired
      ? "Ce lien d'accès a déjà été utilisé ou a expiré. Si votre compte a déjà été validé, connectez-vous avec vos identifiants ci-dessous."
      : sanitizeAuthError(exchangeError);

    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(message)}${isExpired ? "&expired=1" : ""}`
    );
  }

  // Fallback for direct or missing parameters
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Lien d'authentification incomplet ou invalide.")}`
  );
}
