type PostAuthor = {
  handle: string | null;
};

type PostRecord = {
  id: string;
  slug: string | null;
  author: PostAuthor | null;
};

const safe = (value: string) => encodeURIComponent(value);

export function canonicalRedirectTarget(row: PostRecord, fallbackId?: string): string {
  const handle = row.author?.handle ?? null;
  if (!handle || handle.trim() === '') {
    throw new Error('Missing author handle for redirect');
  }
  const encodedHandle = safe(handle.trim());
  const slug = row.slug ?? null;
  if (slug && slug.trim() !== '') {
    return `/app/u/${encodedHandle}/${safe(slug.trim())}`;
  }
  const id = row.id ?? fallbackId;
  if (!id) {
    throw new Error('Missing post identifier for redirect');
  }
  return `/app/u/${encodedHandle}/p/${safe(id)}`;
}

export const appendSearch = (target: string, search: string) =>
  search && search.length > 0 ? `${target}${search}` : target;
