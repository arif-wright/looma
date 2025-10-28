const PROFILE_PREFIX = '/app/u';
const LEGACY_THREAD_PATH = '/app/thread';
const LEGACY_SLUG_PATH = '/app/t';

const safe = (value: string) => encodeURIComponent(value);

export function legacyThreadById(id: string): string {
  return `${LEGACY_THREAD_PATH}/${id}`;
}

export function legacyThreadBySlug(slug: string): string {
  return `${LEGACY_SLUG_PATH}/${slug}`;
}

export function commentHash(commentId: string): string {
  return `#c-${commentId}`;
}

export function canonicalPostPath(
  handle: string | null | undefined,
  slug: string | null | undefined,
  id: string
): string {
  if (handle && handle.trim().length > 0) {
    const encodedHandle = safe(handle.trim());
    if (slug && slug.trim().length > 0) {
      return `${PROFILE_PREFIX}/${encodedHandle}/${slug}`;
    }
    return `${PROFILE_PREFIX}/${encodedHandle}/p/${id}`;
  }
  return legacyThreadById(id);
}

export function canonicalCommentPath(
  handle: string | null | undefined,
  slug: string | null | undefined,
  postId: string,
  commentId: string
): string {
  return `${canonicalPostPath(handle, slug, postId)}${commentHash(commentId)}`;
}
