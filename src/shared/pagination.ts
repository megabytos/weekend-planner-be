// Pagination utilities and types (placeholders)

export type PaginationQuery = {
  page?: number;
  pageSize?: number;
};

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total?: number;
};

export function normalizePagination(q: PaginationQuery): { page: number; pageSize: number } {
  const page = Math.max(1, Math.floor(q.page ?? 1));
  const pageSize = Math.max(1, Math.min(100, Math.floor(q.pageSize ?? 20)));
  return { page, pageSize };
}
