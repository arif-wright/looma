export class ShareError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ShareError';
  }
}

type ShareResponse = {
  share_id: string;
  shares_count: number;
};

type SharePayload = ShareResponse & {
  ok: boolean;
};

export async function createShare(postId: string, quote?: string): Promise<ShareResponse> {
  const response = await fetch('/api/shares', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    },
    body: JSON.stringify({
      post_id: postId,
      quote: quote?.trim() ? quote.trim() : undefined
    })
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // ignore parse errors
  }

  if (!response.ok || !isSharePayload(body)) {
    const message = typeof (body as any)?.details === 'string'
      ? (body as any).details
      : typeof (body as any)?.error === 'string'
      ? (body as any).error
      : 'Unable to share';
    throw new ShareError(message, response.status, body ?? undefined);
  }

  return {
    share_id: body.share_id,
    shares_count: body.shares_count
  };
}

function isSharePayload(payload: unknown): payload is SharePayload {
  if (!payload || typeof payload !== 'object') return false;
  const value = payload as Record<string, unknown>;
  return value.ok === true && typeof value.share_id === 'string' && typeof value.shares_count === 'number';
}
