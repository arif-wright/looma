export function sliceByPage<T>(items: T[], page: number, perPage: number) {
  const safePerPage = Math.max(1, perPage);
  const pages = Math.max(1, Math.ceil(items.length / safePerPage));
  const clampedPage = Math.min(Math.max(1, page), pages);
  const start = (clampedPage - 1) * safePerPage;
  const end = start + safePerPage;
  return {
    page: clampedPage,
    pages,
    data: items.slice(start, end)
  };
}
