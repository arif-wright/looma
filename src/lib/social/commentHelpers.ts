import type { CommentNode, PostComment } from './types';

export const COMMENT_ORDER = {
  ASC: 'asc',
  DESC: 'desc'
} as const;

export const MAX_INLINE_DEPTH = 1;
export const INLINE_REPLY_BATCH_SIZE = 3;
export const THREAD_DRAWER_PAGE_SIZE = 20;

const MERGEABLE_FIELDS: Array<keyof CommentNode> = [
  'replies',
  'repliesCursor',
  'repliesVisible',
  'repliesLoading',
  'repliesError',
  'repliesTotal',
  'replying',
  'pending'
];

const mentionPattern = /(^|[\s.,!?;:()[\]{}"'`-])@([A-Za-z0-9_]{2,})/g;
const API_BASE = '/api/comments';

type CommentsFetchResult = {
  items: PostComment[];
  error: string | null;
};

function normaliseLimit(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  const parsed = Math.floor(value ?? fallback);
  return Math.max(1, Math.min(50, parsed));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatCommentBody(text: string): string {
  if (!text) return '';
  const escaped = escapeHtml(text);
  const withMentions = escaped.replace(mentionPattern, (match, prefix, handle) => {
    const safeHandle = handle.toLowerCase();
    return `${prefix ?? ''}<a class="mention" href="/u/${safeHandle}">@${safeHandle}</a>`;
  });
  return withMentions.replace(/\n/g, '<br />');
}

export function relativeTime(value: string): string {
  const timestamp = Number(new Date(value));
  if (!Number.isFinite(timestamp)) return value;
  const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

export function normalizeComment(row: PostComment): CommentNode {
  const replyCount = typeof row.reply_count === 'number' ? row.reply_count : 0;
  return {
    ...row,
    reply_count: replyCount,
    depth: typeof row.depth === 'number' ? row.depth : row.parent_id ? 1 : 0,
    replies: [],
    repliesCursor: null,
    repliesVisible: false,
    repliesLoading: false,
    repliesError: null,
    repliesTotal: replyCount,
    replying: false,
    pending: false
  };
}

function mergeNode(existing: CommentNode | undefined, incoming: CommentNode): CommentNode {
  if (!existing) {
    return {
      ...normalizeComment(incoming),
      ...incoming
    };
  }

  const merged: CommentNode = {
    ...existing,
    ...incoming
  };

  for (const field of MERGEABLE_FIELDS) {
    const incomingValue = incoming[field];
    const existingValue = existing[field];
    if (incomingValue !== undefined && incomingValue !== null) {
      merged[field] = incomingValue as never;
    } else if (existingValue !== undefined && existingValue !== null) {
      merged[field] = existingValue as never;
    }
  }

  merged.reply_count = Math.max(
    typeof incoming.reply_count === 'number' ? incoming.reply_count : 0,
    typeof existing.reply_count === 'number' ? existing.reply_count : 0
  );

  merged.repliesTotal = Math.max(
    typeof incoming.repliesTotal === 'number' ? incoming.repliesTotal : merged.reply_count,
    typeof existing.repliesTotal === 'number' ? existing.repliesTotal : merged.reply_count
  );

  if (!merged.replies) merged.replies = existing.replies ?? [];
  return merged;
}

export function dedupeComments(
  existing: CommentNode[],
  incoming: CommentNode[],
  order: typeof COMMENT_ORDER[keyof typeof COMMENT_ORDER] = COMMENT_ORDER.DESC
): CommentNode[] {
  const map = new Map<string, CommentNode>();
  for (const node of existing) {
    map.set(node.comment_id, node);
  }
  for (const node of incoming) {
    const current = map.get(node.comment_id);
    map.set(node.comment_id, mergeNode(current, node));
  }
  const sorted = Array.from(map.values());
  sorted.sort((a, b) => {
    const diff = Number(new Date(a.created_at)) - Number(new Date(b.created_at));
    return order === COMMENT_ORDER.ASC ? diff : -diff;
  });
  return sorted;
}

export function mergeReplies(existing: CommentNode[], incoming: CommentNode[]): CommentNode[] {
  return dedupeComments(existing, incoming, COMMENT_ORDER.ASC);
}

function countSubtree(node: CommentNode): number {
  let total = 1;
  if (node.replies && node.replies.length > 0) {
    for (const reply of node.replies) {
      total += countSubtree(reply);
    }
  }
  return total;
}

export function removeCommentFromTree(tree: CommentNode[], commentId: string): {
  tree: CommentNode[];
  removed: number;
} {
  let removed = 0;
  const result: CommentNode[] = [];
  for (const node of tree) {
    if (node.comment_id === commentId) {
      removed += countSubtree(node);
      continue;
    }
    const clone: CommentNode = { ...node };
    if (clone.replies && clone.replies.length > 0) {
      const child = removeCommentFromTree(clone.replies, commentId);
      clone.replies = child.tree;
      if (child.removed > 0) {
        removed += child.removed;
        clone.reply_count = Math.max(0, clone.reply_count - child.removed);
        clone.repliesTotal = Math.max(clone.reply_count, clone.repliesTotal ?? 0);
      }
    }
    result.push(clone);
  }
  return { tree: result, removed };
}

export function findComment(tree: CommentNode[], id: string): CommentNode | null {
  for (const node of tree) {
    if (node.comment_id === id) return node;
    if (node.replies) {
      const found = findComment(node.replies, id);
      if (found) return found;
    }
  }
  return null;
}

export function depthOf(comment: CommentNode): number {
  return typeof comment.depth === 'number' ? comment.depth : 0;
}

export function remainingRepliesText(totalRemaining: number, batchSize = INLINE_REPLY_BATCH_SIZE): string {
  if (totalRemaining <= 0) return '';
  return `View ${batchSize} more replies (${totalRemaining} left)`;
}

export function keyForCursor(comment: CommentNode): string | null {
  return comment.created_at ?? null;
}

async function requestComments(url: URL): Promise<CommentsFetchResult> {
  console.debug('[comments:get]', url.toString());
  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      const message = payload?.error ?? `Request failed (${res.status})`;
      console.error('comments:get', message);
      return { items: [], error: message };
    }
    const payload = (await res.json().catch(() => null)) as { items?: PostComment[] } | null;
    return {
      items: Array.isArray(payload?.items) ? payload!.items : [],
      error: null
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('comments:get', err);
    return { items: [], error: message };
  }
}

export async function fetchPostComments(
  postId: string,
  opts: { limit?: number; before?: string } = {}
): Promise<CommentsFetchResult> {
  const limit = normaliseLimit(opts.limit, 10);
  const before = opts.before ?? new Date().toISOString();
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(API_BASE, origin);
  url.searchParams.set('postId', postId);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('before', before);
  return requestComments(url);
}

export async function fetchReplies(
  commentId: string,
  opts: { limit?: number; after?: string | null } = {}
): Promise<CommentsFetchResult> {
  const limit = normaliseLimit(opts.limit, 10);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(API_BASE, origin);
  url.searchParams.set('replyTo', commentId);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('after', opts.after ?? '');
  return requestComments(url);
}
