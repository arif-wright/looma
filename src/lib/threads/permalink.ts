const THREAD_ID_PATH = '/app/thread';
const THREAD_SLUG_PATH = '/app/t';

export function threadPermalinkById(id: string): string {
  return `${THREAD_ID_PATH}/${id}`;
}

export function threadPermalinkBySlug(slug: string): string {
  return `${THREAD_SLUG_PATH}/${slug}`;
}

export function commentHash(commentId: string): string {
  return `#c-${commentId}`;
}

export function commentPermalinkFromId(threadId: string, commentId: string): string {
  return `${threadPermalinkById(threadId)}${commentHash(commentId)}`;
}

export function commentPermalinkFromSlug(slug: string, commentId: string): string {
  return `${threadPermalinkBySlug(slug)}${commentHash(commentId)}`;
}
