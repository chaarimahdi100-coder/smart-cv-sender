"use client";

import React, { useState, useEffect, useSyncExternalStore } from "react";
import { login, loginAsDemo, resendConfirmationEmail } from "@/app/auth/actions";

interface LoginFormProps {
  initialExpired?: boolean;
}

interface HashInfo {
  type: "error" | "info";
  text: string;
  isExpired: boolean;
}

function subscribeToHash(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function getHashSnapshot(): HashInfo | null {
  if (typeof window === "undefined" || !window.location.hash) return null;
  try {
    const rawHash = window.location.hash.startsWith("#")
      ? window.location.hash.substring(1)
      : window.location.hash;
    const params = new URLSearchParams(rawHash);
    const errorCode = params.get("error_code");
    const errorDesc = params.get("error_description");
    const errorParam = params.get("error");

    if (errorCode === "otp_expired" || errorParam === "access_denied") {
      return {
        type: "error",
        text: "Ce lien de confirmation a expiré ou a déjà été utilisé. Certains filtres de messagerie vérifient automatiquement les liens à la réception. Si votre compte a déjà été validé, connectez-vous avec vos identifiants ci-dessous. Sinon, demandez un nouvel email de confirmation ci-dessous.",
        isExpired: true,
      };
    } else if (errorDesc) {
      return {
        type: "error",
        text: decodeURIComponent(errorDesc).replace(/\+/g, " "),
        isExpired: false,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function getServerSnapshot(): HashInfo | null {
  return null;
}

export function LoginForm({ initialExpired = false }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showResend, setShowResend] = useState(initialExpired);

  const hashInfo = useSyncExternalStore(subscribeToHash, getHashSnapshot, getServerSnapshot);

  // Clean up URL hash in browser address bar without updating state in effect
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const shouldShowResend = showResend || initialExpired || Boolean(hashInfo?.isExpired);

  return (
    <div className="space-y-5">
      {/* Hash Fragment Error Alert */}
      {hashInfo && (
        <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-medium text-amber-800 dark:text-amber-200 leading-relaxed shadow-xs">
          <div className="flex items-start space-x-2">
            <svg className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{hashInfo.text}</span>
          </div>
        </div>
      )}

      {/* 1-Click Instant Demo Entry */}
      <form action={loginAsDemo}>
        <button
          type="submit"
          className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-600 hover:to-amber-800 text-white font-semibold text-sm rounded-xl transition-all shadow-md shadow-amber-500/25 flex items-center justify-center space-x-2 cursor-pointer group"
        >
          <svg
            className="h-4 w-4 text-amber-100 group-hover:scale-110 transition-transform shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <span>Accéder au Mode Démo (1-clic)</span>
        </button>
      </form>

      {/* Visual Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200 dark:border-zinc-800" />
        </div>
        <div className="relative flex justify-center text-2xs uppercase">
          <span className="bg-white dark:bg-zinc-900 px-3 text-slate-400 dark:text-zinc-500 font-semibold tracking-wider">
            ou connexion avec identifiants
          </span>
        </div>
      </div>

      {/* Standard Credentials Form */}
      <form action={login} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5" htmlFor="email">
            Email Address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-xs"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300" htmlFor="password">
              Password
            </label>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              className="w-full px-3.5 py-2.5 pr-10 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-xs"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
            >
              {showPassword ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 flex justify-center cursor-pointer mt-2"
        >
          Sign In
        </button>
      </form>

      {/* Resend Confirmation Section */}
      <div className="pt-2">
        {!shouldShowResend ? (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowResend(true)}
              className="text-xs text-slate-500 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400 transition-colors underline cursor-pointer"
            >
              Email non reçu ou lien expiré ? Renvoyer l&apos;email de confirmation
            </button>
          </div>
        ) : (
          <div className="p-4 bg-slate-50 dark:bg-zinc-950/70 border border-slate-200 dark:border-zinc-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                Renvoyer l&apos;email de confirmation
              </span>
              <button
                type="button"
                onClick={() => setShowResend(false)}
                className="text-2xs text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 cursor-pointer"
              >
                Fermer
              </button>
            </div>
            <p className="text-2xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              Saisissez l&apos;adresse email utilisée lors de votre inscription pour recevoir un nouveau lien de validation.
            </p>
            <form action={resendConfirmationEmail} className="space-y-2">
              <input
                name="email"
                type="email"
                required
                placeholder="votre-email@exemple.com"
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-xs"
              />
              <button
                type="submit"
                className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white font-medium text-xs rounded-xl transition-all shadow-xs flex justify-center cursor-pointer"
              >
                Envoyer le lien de confirmation
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Helpful Hint */}
      <div className="p-3 bg-slate-50 dark:bg-zinc-950/60 rounded-xl border border-slate-200/80 dark:border-zinc-800/80 text-2xs text-slate-500 dark:text-zinc-400 text-center">
        Identifiants de démonstration :{" "}
        <span className="font-mono text-slate-700 dark:text-zinc-300 font-semibold">demo@smartcv.dev</span>
      </div>
    </div>
  );
}
