import test from "node:test";
import assert from "node:assert/strict";
import {
  OPPORTUNITIES_PAGE_SIZE,
  paginateOpportunities,
  getPaginationPageNumbers,
} from "../opportunity-pagination.ts";

export interface MockOpportunityItem {
  id: string;
  title: string;
  description: string;
  location: string;
  type: string;
  source_platform?: string | null;
  source_url?: string | null;
  date_posted?: string | null;
  valid_through?: string | null;
  verification_status?: string | null;
  is_active?: boolean;
  isDemo?: boolean;
  isStale?: boolean;
  companies?: { name: string } | null;
}

// Helper fixture generator
function createMockOpportunity(index: number, overrides: Partial<MockOpportunityItem> = {}): MockOpportunityItem {
  return {
    id: `mock-opp-${index}`,
    title: `Opportunity #${index}`,
    description: `Description for opportunity #${index}`,
    location: "Tunis, Tunisie",
    type: index % 2 === 0 ? "PFE" : "STAGE",
    source_platform: "LinkedIn",
    source_url: `https://example.com/jobs/${index}`,
    date_posted: "2026-01-01T00:00:00.000Z",
    verification_status: "likely_open",
    is_active: true,
    isDemo: false,
    companies: { name: `Company ${index}` },
    ...overrides,
  };
}

test("Pagination: slices 25 items accurately into pages of 12", () => {
  assert.equal(OPPORTUNITIES_PAGE_SIZE, 12, "Default page size constant must be 12");
  const items = Array.from({ length: 25 }, (_, i) => createMockOpportunity(i + 1));

  // Page 1
  const page1 = paginateOpportunities(items, 1, 12);
  assert.equal(page1.currentPage, 1);
  assert.equal(page1.totalPages, 3);
  assert.equal(page1.totalResults, 25);
  assert.equal(page1.startIndex, 0);
  assert.equal(page1.endIndex, 12);
  assert.equal(page1.paginatedItems.length, 12);
  assert.equal(page1.paginatedItems[0].id, "mock-opp-1");
  assert.equal(page1.paginatedItems[11].id, "mock-opp-12");

  // Page 2
  const page2 = paginateOpportunities(items, 2, 12);
  assert.equal(page2.currentPage, 2);
  assert.equal(page2.startIndex, 12);
  assert.equal(page2.endIndex, 24);
  assert.equal(page2.paginatedItems.length, 12);
  assert.equal(page2.paginatedItems[0].id, "mock-opp-13");
  assert.equal(page2.paginatedItems[11].id, "mock-opp-24");

  // Page 3 (final page with remaining item)
  const page3 = paginateOpportunities(items, 3, 12);
  assert.equal(page3.currentPage, 3);
  assert.equal(page3.startIndex, 24);
  assert.equal(page3.endIndex, 25);
  assert.equal(page3.paginatedItems.length, 1);
  assert.equal(page3.paginatedItems[0].id, "mock-opp-25");
});

test("Pagination: clamps page boundaries gracefully (negative, zero, out-of-bounds)", () => {
  const items = Array.from({ length: 25 }, (_, i) => createMockOpportunity(i + 1));

  // Page 0 clamps to page 1
  const pageZero = paginateOpportunities(items, 0, 12);
  assert.equal(pageZero.currentPage, 1);
  assert.equal(pageZero.paginatedItems[0].id, "mock-opp-1");

  // Negative page clamps to page 1
  const pageNeg = paginateOpportunities(items, -3, 12);
  assert.equal(pageNeg.currentPage, 1);
  assert.equal(pageNeg.paginatedItems[0].id, "mock-opp-1");

  // Page 99 clamps to last page (page 3)
  const pageOver = paginateOpportunities(items, 99, 12);
  assert.equal(pageOver.currentPage, 3);
  assert.equal(pageOver.paginatedItems.length, 1);
  assert.equal(pageOver.paginatedItems[0].id, "mock-opp-25");
});

test("Pagination: handles empty results cleanly without division by zero or errors", () => {
  const empty: MockOpportunityItem[] = [];
  const result = paginateOpportunities(empty, 1, 12);

  assert.equal(result.currentPage, 1);
  assert.equal(result.totalPages, 1);
  assert.equal(result.totalResults, 0);
  assert.equal(result.startIndex, 0);
  assert.equal(result.endIndex, 0);
  assert.deepEqual(result.paginatedItems, []);
});

test("Pagination: changing filters while on a later page clamps gracefully and resets", () => {
  // Scenario: Candidate was on page 3 of 30 opportunities (indices 24-29).
  // User changes filter to search "Python", narrowing results to only 4 items.
  const allOpps = Array.from({ length: 30 }, (_, i) => createMockOpportunity(i + 1));
  const filteredPythonOpps = allOpps.slice(0, 4);

  // When reset handler is triggered, page is set to 1:
  const resetResult = paginateOpportunities(filteredPythonOpps, 1, 12);
  assert.equal(resetResult.currentPage, 1);
  assert.equal(resetResult.totalPages, 1);
  assert.equal(resetResult.totalResults, 4);
  assert.equal(resetResult.paginatedItems.length, 4);

  // Even if stale state passed page 3 before render cycle completes:
  const clampedResult = paginateOpportunities(filteredPythonOpps, 3, 12);
  assert.equal(clampedResult.currentPage, 1, "Must clamp from page 3 to page 1 when totalPages is 1");
  assert.equal(clampedResult.paginatedItems.length, 4);
});

test("Pagination: preserves all reliability statuses, badges, dates, and closed safeguards", () => {
  // Create 20 opportunities with diverse verification statuses
  const mixedOpps: MockOpportunityItem[] = [
    createMockOpportunity(1, { verification_status: "closed", is_active: false }),
    createMockOpportunity(2, { verification_status: "verified_open" }),
    createMockOpportunity(3, { verification_status: "unverified", type: "SPONTANEOUS" }),
    ...Array.from({ length: 15 }, (_, i) => createMockOpportunity(i + 4)),
    createMockOpportunity(19, {
      verification_status: "likely_open",
      isStale: true,
      source_platform: "LinkedIn",
      source_url: "https://linkedin.com/posts/medianet-2026",
    }),
    createMockOpportunity(20, {
      verification_status: "expired",
      valid_through: "2025-12-31T23:59:59.000Z",
    }),
  ];

  // Page 1
  const page1 = paginateOpportunities(mixedOpps, 1, 12);
  assert.equal(page1.paginatedItems[0].verification_status, "closed");
  assert.equal(page1.paginatedItems[0].is_active, false);
  assert.equal(page1.paginatedItems[1].verification_status, "verified_open");
  assert.equal(page1.paginatedItems[2].verification_status, "unverified");
  assert.equal(page1.paginatedItems[2].type, "SPONTANEOUS");

  // Page 2
  const page2 = paginateOpportunities(mixedOpps, 2, 12);
  const staleOpp = page2.paginatedItems.find((o) => o.id === "mock-opp-19");
  assert.ok(staleOpp, "Must locate stale opp on page 2");
  assert.equal(staleOpp.verification_status, "likely_open");
  assert.equal(staleOpp.isStale, true);
  assert.equal(staleOpp.source_platform, "LinkedIn");

  const expiredOpp = page2.paginatedItems.find((o) => o.id === "mock-opp-20");
  assert.ok(expiredOpp, "Must locate expired opp on page 2");
  assert.equal(expiredOpp.verification_status, "expired");
  assert.equal(expiredOpp.valid_through, "2025-12-31T23:59:59.000Z");

  // Crucial invariant: Pagination NEVER transforms closed, expired, or unverified offers into verified
  for (const item of page1.paginatedItems.concat(page2.paginatedItems)) {
    if (item.id === "mock-opp-1") {
      assert.notEqual(item.verification_status, "verified_open");
    }
    if (item.id === "mock-opp-3") {
      assert.notEqual(item.verification_status, "verified_open");
    }
  }
});

test("Pagination: getPaginationPageNumbers produces correct sequence with ellipses", () => {
  // <= 7 pages: full range
  assert.deepEqual(getPaginationPageNumbers(1, 1), [1]);
  assert.deepEqual(getPaginationPageNumbers(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(getPaginationPageNumbers(3, 7), [1, 2, 3, 4, 5, 6, 7]);

  // > 7 pages: near beginning (page <= 4)
  assert.deepEqual(getPaginationPageNumbers(1, 10), [1, 2, 3, 4, 5, "...", 10]);
  assert.deepEqual(getPaginationPageNumbers(3, 10), [1, 2, 3, 4, 5, "...", 10]);
  assert.deepEqual(getPaginationPageNumbers(4, 10), [1, 2, 3, 4, 5, "...", 10]);

  // > 7 pages: near end (page >= totalPages - 3)
  assert.deepEqual(getPaginationPageNumbers(7, 10), [1, "...", 6, 7, 8, 9, 10]);
  assert.deepEqual(getPaginationPageNumbers(10, 10), [1, "...", 6, 7, 8, 9, 10]);

  // > 7 pages: middle window
  assert.deepEqual(getPaginationPageNumbers(5, 10), [1, "...", 4, 5, 6, "...", 10]);
  assert.deepEqual(getPaginationPageNumbers(6, 12), [1, "...", 5, 6, 7, "...", 12]);
});
