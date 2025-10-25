import type { CommentNode, PostComment } from './types';

const COMMENT_ORDER = {
  ASC: 'asc',
  DESC: 'desc'
} as const;

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
    map.set(node.id, node);
  }
  for (const node of incoming) {
    const current = map.get(node.id);
    map.set(node.id, mergeNode(current, node));
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
    if (node.id === commentId) {
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
    if (node.id === id) return node;
    if (node.replies) {
      const found = findComment(node.replies, id);
      if (found) return found;
    }
  }
  return null;
}
