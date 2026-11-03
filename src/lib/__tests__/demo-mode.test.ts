import test from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_USER_EMAIL,
  isDemoUser,
  SHARED_DEMO_RESTRICTION_MESSAGE,
} from "../demo-mode.ts";
import {
  getDemoCredentials,
  checkDemoLoginRateLimit,
  _resetDemoRateLimiter,
} from "../demo-mode.server.ts";
import { isAuthorizedOpportunityManager } from "../auth/admin-auth.ts";
import { sendEmailMock, maskRecipientEmail } from "../email-sender.ts";

test("Demo Mode: isDemoUser correctly detects demo candidate email", () => {
  assert.equal(isDemoUser(DEMO_USER_EMAIL), true);
  assert.equal(isDemoUser("demo@smartcv.dev"), true);
  assert.equal(isDemoUser("DEMO@SMARTCV.DEV"), true);
  assert.equal(isDemoUser("  demo@smartcv.dev  "), true);
});

test("Demo Mode: isDemoUser rejects non-demo, admin, and empty emails", () => {
  assert.equal(isDemoUser("candidate@esprit.tn"), false);
  assert.equal(isDemoUser("admin@smartcv.dev"), false);
  assert.equal(isDemoUser("chaarimahdi100@gmail.com"), false);
  assert.equal(isDemoUser(""), false);
  assert.equal(isDemoUser(null), false);
  assert.equal(isDemoUser(undefined), false);
});

test("Demo Mode: getDemoCredentials fails safely when DEMO_USER_PASSWORD is not set", () => {
  const originalPassword = process.env.DEMO_USER_PASSWORD;
  delete process.env.DEMO_USER_PASSWORD;

  const creds = getDemoCredentials();
  assert.equal(creds, null, "Must return null when DEMO_USER_PASSWORD is not configured in environment");

  if (originalPassword) {
    process.env.DEMO_USER_PASSWORD = originalPassword;
  }
});

test("Demo Mode: getDemoCredentials returns valid credentials when environment variable is set", () => {
  const originalPassword = process.env.DEMO_USER_PASSWORD;
  process.env.DEMO_USER_PASSWORD = "test-ephemeral-secret-123";

  const creds = getDemoCredentials();
  assert.ok(creds !== null, "Must return credentials object when configured");
  assert.equal(creds?.email.toLowerCase(), DEMO_USER_EMAIL.toLowerCase());
  assert.equal(creds?.password, "test-ephemeral-secret-123");

  if (originalPassword) {
    process.env.DEMO_USER_PASSWORD = originalPassword;
  } else {
    delete process.env.DEMO_USER_PASSWORD;
  }
});

test("Demo Mode Rate Limiter: enforces per-IP limits and returns retryAfter", async () => {
  _resetDemoRateLimiter();
  const testIp = "192.0.2.42";

  // 5 allowed attempts
  for (let i = 1; i <= 5; i++) {
    const res = await checkDemoLoginRateLimit(testIp);
    assert.equal(res.allowed, true, `Attempt ${i} must be allowed`);
  }

  // 6th attempt must be rejected
  const blocked = await checkDemoLoginRateLimit(testIp);
  assert.equal(blocked.allowed, false, "6th attempt from same IP must be rejected");
  assert.ok(blocked.retryAfterSeconds && blocked.retryAfterSeconds > 0, "Must provide retryAfterSeconds");
  assert.ok(blocked.message?.includes("Trop de requêtes"), "Must include helpful user warning message");

  // Other IPs should still be allowed
  const otherIpRes = await checkDemoLoginRateLimit("198.51.100.99");
  assert.equal(otherIpRes.allowed, true, "Different IP must not be blocked by other IP's exhaustion");

  _resetDemoRateLimiter();
});

test("Demo Mode Rate Limiter: enforces global capacity limit to prevent DOS", async () => {
  _resetDemoRateLimiter();

  // Make 30 requests from distinct IPs
  for (let i = 1; i <= 30; i++) {
    const res = await checkDemoLoginRateLimit(`203.0.113.${i}`);
    assert.equal(res.allowed, true, `Global request ${i} should be permitted`);
  }

  // 31st request from a new IP should be throttled by global ceiling
  const globalThrottled = await checkDemoLoginRateLimit("203.0.113.250");
  assert.equal(globalThrottled.allowed, false, "31st request must trigger global rate limit");
  assert.ok(globalThrottled.message?.includes("demande globale"), "Must inform about global volume limit");

  _resetDemoRateLimiter();
});

test("Demo Mode Security Invariant: Demo account is STRICTLY NON-ADMIN", () => {
  const demoUser = { email: DEMO_USER_EMAIL };
  const authResult = isAuthorizedOpportunityManager(demoUser);
  assert.equal(
    authResult.authorized,
    false,
    "Demo user must NEVER be granted opportunity manager or catalog admin privileges"
  );
  assert.ok(
    authResult.reason?.toLowerCase().includes("accès refusé"),
    "Rejection reason must clearly state access denied"
  );
});

test("Demo Mode Security Invariant: Shared demo restrictions message is defined", () => {
  assert.ok(
    typeof SHARED_DEMO_RESTRICTION_MESSAGE === "string" && SHARED_DEMO_RESTRICTION_MESSAGE.length > 20,
    "Restriction message must guide the user on shared demo status"
  );
});

test("Demo Mode Simulation: sendEmailMock guarantees zero real email transmission", async () => {
  const payload = {
    to: "hr@company.tn",
    subject: "Candidature Stage PFE (Démo)",
    body: "Bonjour, ceci est une candidature de démonstration.",
  };

  const result = await sendEmailMock(payload, { delayMs: 0, trackingKey: "demo_test_key" });
  assert.equal(result.success, true);
  assert.ok(result.messageId?.startsWith("mock_msg_"), "Must return deterministic mock message ID");

  // Verify recipient masking (for 2-char local part, returns first char + ***)
  const masked2 = maskRecipientEmail("hr@company.tn");
  assert.equal(masked2, "h***@company.tn");

  const maskedLong = maskRecipientEmail("recruiter@company.tn");
  assert.equal(maskedLong, "r***r@company.tn");
});
