import test from "node:test";
import assert from "node:assert/strict";
import {
  isRouteProtected,
  PROTECTED_ROUTE_PREFIXES,
  OPPORTUNITY_APPLY_ROUTE_PATTERN,
} from "../route-protection.ts";

test("Middleware Route Protection: verifies protected prefixes and opportunity apply pattern", () => {
  // 1. Traditional protected prefix routes
  assert.equal(isRouteProtected("/dashboard"), true, "/dashboard must be protected");
  assert.equal(isRouteProtected("/dashboard/analytics"), true, "/dashboard subroutes must be protected");
  assert.equal(isRouteProtected("/profile"), true, "/profile must be protected");
  assert.equal(isRouteProtected("/cv"), true, "/cv must be protected");
  assert.equal(isRouteProtected("/cv/review"), true, "/cv/review must be protected");
  assert.equal(isRouteProtected("/applications"), true, "/applications must be protected");
  assert.equal(isRouteProtected("/applications/app-123/draft"), true, "/applications/[id]/draft must be protected");

  // 2. Public routes that must NOT be intercepted by auth guard
  assert.equal(isRouteProtected("/"), false, "Home route / must be public");
  assert.equal(isRouteProtected("/login"), false, "/login must be public");
  assert.equal(isRouteProtected("/signup"), false, "/signup must be public");
  assert.equal(isRouteProtected("/api/universities"), false, "/api/universities must be public");

  // 3. Authenticated candidate catalog and Apply flow
  assert.equal(isRouteProtected("/opportunities"), true, "Opportunities catalog /opportunities is protected for authenticated candidates");
  assert.equal(isRouteProtected("/opportunities/"), true, "/opportunities/ is protected");
  assert.equal(isRouteProtected("/opportunities/opp-456"), true, "Opportunity detail route is protected");
  assert.equal(isRouteProtected("/opportunities/opp-456/apply"), true, "/opportunities/[id]/apply is protected");
  assert.equal(isRouteProtected("/opportunities/12345/apply"), true, "Numeric ID apply route is protected");
  assert.equal(isRouteProtected("/opportunities/stage-pfe-devops-2026/apply"), true, "Slug ID apply route is protected");
  assert.equal(isRouteProtected("/opportunities/opp-456/apply/step-2"), true, "Sub-paths of apply are protected");
});

test("Middleware Route Protection: pattern regex tests", () => {
  assert.deepEqual(PROTECTED_ROUTE_PREFIXES, ['/dashboard', '/profile', '/cv', '/applications', '/opportunities']);
  assert.equal(OPPORTUNITY_APPLY_ROUTE_PATTERN.test("/opportunities/1/apply"), true);
  assert.equal(OPPORTUNITY_APPLY_ROUTE_PATTERN.test("/opportunities/foo-bar/apply"), true);
  assert.equal(OPPORTUNITY_APPLY_ROUTE_PATTERN.test("/opportunities/apply"), false);
  assert.equal(OPPORTUNITY_APPLY_ROUTE_PATTERN.test("/opportunities"), false);
  assert.equal(OPPORTUNITY_APPLY_ROUTE_PATTERN.test("/random/1/apply"), false);
});
