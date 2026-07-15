export interface PaginationProps {
  page: number;
  size: number;
  total: number;
  onPage: (page: number) => void;
}

export function Pagination({ page, size, total, onPage }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / size));
  if (totalPages <= 1) return null;
  return (
    <nav className="es-pagination" aria-label="Pagination">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  );
}
