export type EmailPayload = {
  to: string;
  subject: string;
  body: string;
  attachments?: { filename: string; path: string }[];
};

export type MockSendOptions = {
  forceFailure?: boolean;
  simulatedError?: string;
  delayMs?: number;
  trackingKey?: string;
  candidateEmail?: string;
};

/**
 * Masks recipient email addresses for privacy-compliant operational logging.
 */
export function maskRecipientEmail(email: string): string {
  if (!email || typeof email !== "string") return "unknown";
  const parts = email.trim().split("@");
  if (parts.length !== 2) return "***";
  const [local, domain] = parts;
  if (local.length <= 2) {
    return `${local.slice(0, 1)}***@${domain}`;
  }
  return `${local.slice(0, 1)}***${local.slice(-1)}@${domain}`;
}

/**
 * Predictable mock email sender for Smart CV Sender Demo Mode.
 *
 * Behavior:
 * - Default: Deterministically succeeds, generating a stable or unique mock message ID.
 * - Real email delivery is STRICTLY DISABLED by design.
 * - Idempotency: When options.trackingKey is provided, returns a stable deterministic messageId.
 * - Explicit Failure Simulation:
 *     1. Explicit option: options.forceFailure === true
 *     2. Environment variable: process.env.SIMULATE_EMAIL_FAILURE === "true"
 *     3. Designated test recipient: payload.to includes "simulate-failure" or ends with "@fail.mock"
 * - Network Delay:
 *     Configurable via options.delayMs (defaults to 0 in test, 800ms in dev/demo).
 */
export async function sendEmailMock(
  payload: EmailPayload,
  options?: MockSendOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const maskedTo = maskRecipientEmail(payload.to);
  const bodyByteLength = typeof payload.body === "string" ? Buffer.byteLength(payload.body, "utf8") : 0;
  const attachmentNames = payload.attachments?.map((a) => a.filename).join(", ") || "None";
  const trackingKey = options?.trackingKey ? options.trackingKey.trim() : null;

  // Redact complete email body and PII from stdout to protect candidate privacy
  console.info(
    `[email-sender] MOCK DISPATCH (SIMULATION ONLY - NO REAL EMAIL TRANSMITTED): recipient=${maskedTo}, subjectLength=${payload.subject?.length || 0}, bodyBytes=${bodyByteLength}, attachments=[${attachmentNames}], trackingKey=${trackingKey || "none"}`
  );

  // Determine network delay: skip in test environment for instant test execution
  const defaultDelay = process.env.NODE_ENV === "test" ? 0 : 800;
  const delay = typeof options?.delayMs === "number" ? options.delayMs : defaultDelay;
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // Explicit failure trigger evaluation:
  const isEnvFailure = process.env.SIMULATE_EMAIL_FAILURE === "true";
  const isRecipientFailure =
    typeof payload.to === "string" &&
    (payload.to.includes("simulate-failure") ||
      payload.to.endsWith("@fail.mock") ||
      payload.to === "fail@simulation.mock");
  const isExplicitFailure = options?.forceFailure === true || isEnvFailure || isRecipientFailure;

  if (isExplicitFailure) {
    const errorMsg =
      options?.simulatedError || "Simulated SMTP connection error (Mock)";
    return { success: false, error: errorMsg };
  }

  // If a stable tracking key is provided, generate a deterministic message ID
  const messageId = trackingKey
    ? `mock_msg_${trackingKey.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 36)}`
    : `mock-id-${Date.now()}`;

  return { success: true, messageId };
}
