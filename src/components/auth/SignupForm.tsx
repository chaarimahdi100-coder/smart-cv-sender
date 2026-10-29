"use client";

import React, { useState } from "react";
import { signup } from "@/app/auth/actions";

export function SignupForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const passwordsMatch = !confirmPassword || password === confirmPassword;

  return (
    <form action={signup} className="space-y-4">
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
          <span className="text-2xs text-slate-400 dark:text-zinc-500">Min. 6 characters</span>
        </div>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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

      <div>
        <div className="flex justify-between items-center mb-1.5">
          <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300" htmlFor="confirm_password">
            Confirm Password
          </label>
        </div>
        <div className="relative">
          <input
            id="confirm_password"
            name="confirm_password"
            type={showConfirm ? "text" : "password"}
            required
            minLength={6}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={`w-full px-3.5 py-2.5 pr-10 text-sm bg-white dark:bg-zinc-950 border rounded-xl text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 shadow-xs transition-colors ${
              passwordsMatch
                ? "border-slate-300 dark:border-zinc-800 focus:ring-blue-500/20 focus:border-blue-600"
                : "border-rose-400 dark:border-rose-700 focus:ring-rose-500/20 focus:border-rose-600"
            }`}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowConfirm((prev) => !prev)}
            aria-label={showConfirm ? "Hide password confirmation" : "Show password confirmation"}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
          >
            {showConfirm ? (
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
        {!passwordsMatch && (
          <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
            Passwords do not match. Please verify your password.
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={!passwordsMatch}
        className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 flex justify-center cursor-pointer mt-2"
      >
        Create Free Account
      </button>
    </form>
  );
}
