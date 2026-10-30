/**
 * Simple, accessible pagination utilities for the Smart CV Sender opportunities directory.
 */

export const OPPORTUNITIES_PAGE_SIZE = 12;

export interface PaginationResult<T> {
  paginatedItems: T[];
  currentPage: number;
  totalPages: number;
  totalResults: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Paginates an array of items with boundary protection and out-of-bounds page clamping.
 * Applied strictly after all search queries, status filters, role sub-filters, and feed modes.
 */
export function paginateOpportunities<T>(
  items: T[],
  page: number,
  pageSize: number = OPPORTUNITIES_PAGE_SIZE
): PaginationResult<T> {
  const totalResults = items.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = totalResults === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalResults);
  const paginatedItems = totalResults === 0 ? [] : items.slice(startIndex, endIndex);

  return {
    paginatedItems,
    currentPage: safePage,
    totalPages,
    totalResults,
    startIndex,
    endIndex,
  };
}

/**
 * Generates an accessible, human-friendly array of page numbers with ellipses for long lists.
 * E.g., for 10 pages when on page 1: [1, 2, 3, 4, 5, '...', 10]
 * E.g., for 10 pages when on page 6: [1, '...', 5, 6, 7, '...', 10]
 */
export function getPaginationPageNumbers(currentPage: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "...", totalPages];
  }
  if (currentPage >= totalPages - 3) {
    return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
}
