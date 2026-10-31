/**
 * Application State Machine — Single Source of Truth
 *
 * Implements deterministic transition policies and invariants across Smart CV Sender:
 *
 * Transition Policy:
 * | Current status | Allowed next status | Rule |
 * |---|---|---|
 * | draft          | approved            | Approval action only |
 * | failed         | approved            | Approval action only |
 * | approved       | sending             | Valid approved draft |
 * | failed         | sending             | Valid approval and same logical send key |
 * | sending        | sent                | Valid provider result and current fencing token |
 * | sending        | failed              | Current fencing token |
 * | draft          | postponed           | Authorized transition |
 * | approved       | postponed           | Authorized transition |
 * | failed         | postponed           | Authorized transition |
 * | postponed      | draft               | Save action / resume |
 * | sent           | none                | Terminal state |
 *
 * Strict Invariants:
 * - Reject all unspecified transitions.
 * - Never allow `sent` to return to another status.
 * - Never allow `sending` to become `postponed`.
 * - Never allow direct `postponed` to `approved`.
 * - Never allow direct `postponed` to `sending`.
 * - Do not bypass approval validation.
 */

export type ApplicationStatus =
  | "draft"
  | "approved"
  | "sending"
  | "sent"
  | "failed"
  | "postponed";

export const ALL_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "draft",
  "approved",
  "sending",
  "sent",
  "failed",
  "postponed",
] as const;

export interface TransitionContext {
  userId?: string;
  hasValidApproval?: boolean;
  hasCurrentFencingToken?: boolean;
  isSameLogicalSendKey?: boolean;
  actionName?: string;
}

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

export function isValidApplicationStatus(status: unknown): status is ApplicationStatus {
  return typeof status === "string" && ALL_APPLICATION_STATUSES.includes(status as ApplicationStatus);
}

/**
 * Evaluates whether a transition from currentStatus to nextStatus is permitted under the state machine.
 */
export function canTransition(
  currentStatus: ApplicationStatus,
  nextStatus: ApplicationStatus,
  context?: TransitionContext
): TransitionResult {
  if (!isValidApplicationStatus(currentStatus)) {
    return { allowed: false, reason: `Invalid current application status: '${String(currentStatus)}'` };
  }
  if (!isValidApplicationStatus(nextStatus)) {
    return { allowed: false, reason: `Invalid target application status: '${String(nextStatus)}'` };
  }

  // Terminal state protection: 'sent' is strictly permanent
  if (currentStatus === "sent") {
    if (nextStatus === "sent") {
      return { allowed: true, reason: "Idempotent no-op for already sent application" };
    }
    return {
      allowed: false,
      reason: "Application is in terminal 'sent' status. Re-opening or modifying sent applications is strictly forbidden.",
    };
  }

  // In-flight sending state protection: 'sending' can NEVER be postponed or reverted to draft
  if (currentStatus === "sending") {
    if (nextStatus === "postponed") {
      return {
        allowed: false,
        reason: "Illegal transition: an application actively in 'sending' state cannot be postponed. Active worker must complete or fail.",
      };
    }
    if (nextStatus === "draft" || nextStatus === "approved") {
      return {
        allowed: false,
        reason: `Illegal transition: cannot transition in-flight 'sending' application to '${nextStatus}'.`,
      };
    }
    if (nextStatus === "sent") {
      if (context?.hasCurrentFencingToken === false) {
        return {
          allowed: false,
          reason: "Transition from 'sending' to 'sent' requires a valid, unexpired fencing token.",
        };
      }
      return { allowed: true };
    }
    if (nextStatus === "failed") {
      if (context?.hasCurrentFencingToken === false) {
        return {
          allowed: false,
          reason: "Transition from 'sending' to 'failed' requires a valid fencing token.",
        };
      }
      return { allowed: true };
    }
  }

  // Postponed state protection: must transition to 'draft' first, never directly to 'approved' or 'sending'
  if (currentStatus === "postponed") {
    if (nextStatus === "draft") {
      return { allowed: true };
    }
    if (nextStatus === "postponed") {
      return { allowed: true, reason: "No-op" };
    }
    if (nextStatus === "approved") {
      return {
        allowed: false,
        reason: "Illegal transition: postponed applications cannot transition directly to 'approved'. Must return to draft and be re-evaluated first.",
      };
    }
    if (nextStatus === "sending" || nextStatus === "sent" || nextStatus === "failed") {
      return {
        allowed: false,
        reason: `Illegal transition: cannot transition directly from 'postponed' to '${nextStatus}'.`,
      };
    }
  }

  // Draft state transitions
  if (currentStatus === "draft") {
    if (nextStatus === "draft") return { allowed: true, reason: "Draft edit / save no-op" };
    if (nextStatus === "approved") {
      if (context?.hasValidApproval === false) {
        return { allowed: false, reason: "Cannot approve draft: draft content or signature verification failed." };
      }
      return { allowed: true };
    }
    if (nextStatus === "postponed") return { allowed: true };
    return {
      allowed: false,
      reason: `Illegal transition: cannot transition directly from 'draft' to '${nextStatus}'.`,
    };
  }

  // Approved state transitions
  if (currentStatus === "approved") {
    if (nextStatus === "approved") return { allowed: true, reason: "Re-approval no-op" };
    if (nextStatus === "sending") {
      if (context?.hasValidApproval === false) {
        return { allowed: false, reason: "Cannot send: draft approval signature is invalid or stale." };
      }
      return { allowed: true };
    }
    if (nextStatus === "draft") return { allowed: true, reason: "Draft modification revokes approval" };
    if (nextStatus === "postponed") return { allowed: true, reason: "Postponement revokes approval" };
    return {
      allowed: false,
      reason: `Illegal transition: cannot transition directly from 'approved' to '${nextStatus}'.`,
    };
  }

  // Failed state transitions
  if (currentStatus === "failed") {
    if (nextStatus === "failed") return { allowed: true, reason: "No-op" };
    if (nextStatus === "draft") return { allowed: true, reason: "Re-opening draft after failure" };
    if (nextStatus === "approved") {
      if (context?.hasValidApproval === false) {
        return { allowed: false, reason: "Cannot approve failed application without valid draft verification." };
      }
      return { allowed: true };
    }
    if (nextStatus === "sending") {
      if (context?.isSameLogicalSendKey === false) {
        return {
          allowed: false,
          reason: "Cannot retry send from 'failed' without valid approval and matching logical send key.",
        };
      }
      return { allowed: true };
    }
    if (nextStatus === "postponed") return { allowed: true };
    return {
      allowed: false,
      reason: `Illegal transition: cannot transition directly from 'failed' to '${nextStatus}'.`,
    };
  }

  return { allowed: false, reason: `Unspecified transition from '${currentStatus}' to '${nextStatus}'` };
}

/**
 * Asserts that a transition is allowed; throws an Error if rejected.
 */
export function assertValidTransition(
  currentStatus: ApplicationStatus,
  nextStatus: ApplicationStatus,
  context?: TransitionContext
): void {
  const result = canTransition(currentStatus, nextStatus, context);
  if (!result.allowed) {
    throw new Error(result.reason || `Invalid transition from ${currentStatus} to ${nextStatus}`);
  }
}

/**
 * Checks whether the application draft is eligible for user edits.
 * Editing is permitted in 'draft', 'approved' (which resets to draft), 'failed', and 'postponed'.
 * Editing is strictly FORBIDDEN in 'sending' (in-flight dispatch) and 'sent' (terminal).
 */
export function canEditDraft(status: ApplicationStatus): boolean {
  return status !== "sending" && status !== "sent";
}

/**
 * Evaluates whether an application can be deleted by its owner.
 * Applications in 'sending' (in transmission) or 'sent' (audit trail permanent) must NEVER be deleted.
 */
export function canDeleteApplication(status: ApplicationStatus): TransitionResult {
  if (status === "sending") {
    return {
      allowed: false,
      reason: "Impossible de supprimer une candidature en cours d'envoi ('sending'). Le traitement worker est actif.",
    };
  }
  if (status === "sent") {
    return {
      allowed: false,
      reason: "Impossible de supprimer une candidature transmise ('sent'). L'historique d'audit d'envoi est permanent et inaltérable.",
    };
  }
  return { allowed: true };
}
