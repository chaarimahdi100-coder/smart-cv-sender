"use client";

import { useSyncExternalStore } from "react";
import { formatDisplayDate, formatClientDate } from "@/lib/date-utils";

export interface FormattedDateProps {
  date: string | number | Date | null | undefined;
  fallback?: string;
  className?: string;
}

const emptySubscribe = () => () => {};

/**
 * Client component that renders dates safely without triggering non-deterministic
 * prerendering or React hydration mismatches between server and client.
 */
export function FormattedDate({
  date,
  fallback = "—",
  className,
}: FormattedDateProps) {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!date) {
    return <span className={className}>{fallback}</span>;
  }

  // Before client mount (during SSR / prerendering), render deterministic ISO date (YYYY-MM-DD)
  // On the client, render user's localized date format
  const displayText = isClient
    ? formatClientDate(date, fallback)
    : formatDisplayDate(date, fallback);

  return <span className={className}>{displayText}</span>;
}
