export type ReactionKind = 'like' | 'cheer' | 'spark';

export type ReactionCounts = {
  like: number;
  cheer: number;
  spark: number;
};

type TogglePayload = {
  toggledOn: boolean;
  counts: ReactionCounts;
};

export class ReactionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ReactionError';
  }
}

export async function togglePostReaction(
  postId: string,
  kind: ReactionKind
): Promise<TogglePayload> {
  return toggleReaction('/api/reactions/post', { post_id: postId, kind });
}

export async function toggleCommentReaction(
  commentId: string,
  kind: ReactionKind
): Promise<TogglePayload> {
  return toggleReaction('/api/reactions/comment', { comment_id: commentId, kind });
}

async function toggleReaction(
  endpoint: string,
  payload: Record<string, string | ReactionKind>
): Promise<TogglePayload> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    },
    body: JSON.stringify(payload)
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // ignore JSON parse errors for non-JSON responses
  }

  if (!response.ok || !isTogglePayload(body)) {
    const message = typeof (body as any)?.error === 'string' ? (body as any).error : 'Request failed';
    throw new ReactionError(message, response.status, body ?? undefined);
  }

  return {
    toggledOn: body.toggledOn,
    counts: body.counts
  };
}

function isTogglePayload(payload: unknown): payload is TogglePayload {
  if (!payload || typeof payload !== 'object') return false;
  const value = payload as Record<string, unknown>;

  if (typeof value.toggledOn !== 'boolean') return false;
  const counts = value.counts;

  if (!counts || typeof counts !== 'object') return false;
  return ['like', 'cheer', 'spark'].every(
    (key) => typeof (counts as Record<string, unknown>)[key] === 'number'
  );
}
