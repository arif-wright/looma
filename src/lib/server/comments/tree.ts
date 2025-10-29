import type { SupabaseClient } from '@supabase/supabase-js';
import type { Comment, DbUser } from '$lib/threads/types';

export type TreeRow = {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_id: string;
  body: string | null;
  created_at: string;
  depth: number;
  path: string[];
  sort_key: string | null;
};

type BuildOptions = {
  maxDepth?: number;
  ancestorId?: string | null;
};

export async function fetchTreeRows(
  supabase: SupabaseClient,
  postId: string
): Promise<TreeRow[]> {
  const { data, error } = await supabase
    .from('comment_tree_view')
    .select('id, post_id, parent_id, author_id, body, created_at, depth, path, sort_key')
    .eq('post_id', postId)
    .order('sort_key', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as TreeRow[];
}

export async function hydrateAuthors(
  supabase: SupabaseClient,
  rows: TreeRow[]
): Promise<Map<string, DbUser>> {
  const authorIds = Array.from(new Set(rows.map((row) => row.author_id))).filter(Boolean);
  const authorMap = new Map<string, DbUser>();

  if (authorIds.length === 0) {
    return authorMap;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, handle, avatar_url')
    .in('id', authorIds);

  if (error) {
    console.error('[comment tree] profile lookup failed', error);
    return authorMap;
  }

  for (const row of data ?? []) {
    if (!row?.id) continue;
    authorMap.set(row.id, {
      id: row.id,
      display_name: row.display_name ?? null,
      handle: row.handle ?? null,
      avatar_url: row.avatar_url ?? null
    });
  }

  return authorMap;
}

export function buildCommentTree(
  rows: TreeRow[],
  authorMap: Map<string, DbUser>,
  options: BuildOptions = {}
): Comment[] {
  const limitDepth = typeof options.maxDepth === 'number' ? options.maxDepth : Number.POSITIVE_INFINITY;
  const ancestorId = options.ancestorId ?? null;

  const sorted = rows.slice().sort((a, b) => {
    if (a.sort_key && b.sort_key) {
      return a.sort_key.localeCompare(b.sort_key);
    }
    return a.created_at.localeCompare(b.created_at);
  });

  const depthById = new Map<string, number>();
  for (const row of sorted) {
    depthById.set(row.id, row.depth);
  }

  const filtered = ancestorId
    ? sorted.filter((row) => row.id !== ancestorId && Array.isArray(row.path) && row.path.includes(ancestorId))
    : sorted;

  const baseDepth = ancestorId ? depthById.get(ancestorId) ?? 0 : -1;
  const childTotals = new Map<string, number>();

  for (const row of filtered) {
    if (!row.parent_id) continue;
    childTotals.set(row.parent_id, (childTotals.get(row.parent_id) ?? 0) + 1);
  }

  const nodes = new Map<string, Comment>();
  const overflowCounts = new Map<string, number>();
  const roots: Comment[] = [];

  for (const row of filtered) {
    const relativeDepth = ancestorId ? row.depth - baseDepth - 1 : row.depth;

    if (relativeDepth > limitDepth) {
      const offset = ancestorId ? baseDepth + 1 + limitDepth : limitDepth;
      const overflowIndex = ancestorId ? offset : limitDepth;
      const path = Array.isArray(row.path) ? row.path : [];
      const overflowTarget = path[overflowIndex] ?? row.parent_id;
      if (overflowTarget) {
        overflowCounts.set(overflowTarget, (overflowCounts.get(overflowTarget) ?? 0) + 1);
      }
      continue;
    }

    const author = authorMap.get(row.author_id) ?? {
      id: row.author_id,
      display_name: null,
      handle: null,
      avatar_url: null
    };

    const comment: Comment = {
      id: row.id,
      post_id: row.post_id,
      parent_id: row.parent_id,
      body: row.body ?? '',
      created_at: row.created_at,
      author,
      reply_count: childTotals.get(row.id) ?? 0,
      children: []
    };

    nodes.set(row.id, comment);

    const parentId = row.parent_id;
    const isDirectChildOfAncestor = ancestorId !== null && parentId === ancestorId;

    if (parentId && !isDirectChildOfAncestor) {
      const parent = nodes.get(parentId);
      if (parent) {
        (parent.children ??= []).push(comment);
      } else {
        roots.push(comment);
      }
    } else if (!parentId || isDirectChildOfAncestor) {
      roots.push(comment);
    }
  }

  for (const comment of nodes.values()) {
    const visibleChildren = comment.children?.length ?? 0;
    if (visibleChildren === 0) {
      delete comment.children;
    } else {
      comment.children?.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }

    const overflow = overflowCounts.get(comment.id) ?? 0;
    const missing = Math.max(0, (comment.reply_count ?? 0) - (comment.children?.length ?? 0));
    const totalHidden = Number.isFinite(limitDepth) ? Math.max(overflow, missing) : 0;

    if (totalHidden > 0) {
      comment.hasMoreChildren = true;
      comment.moreChildrenCount = totalHidden;
    }
  }

  roots.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return roots;
}
