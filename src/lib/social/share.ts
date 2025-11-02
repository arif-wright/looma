export class ShareError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'ShareError';
  }
}

export type RunShareInput = {
  sessionId: string;
  score: number;
  durationMs: number;
  slug: string;
  text?: string;
};

export type AchievementShareInput = {
  key: string;
  text?: string;
};

export type ShareResponse = {
  postId: string;
};

const CACHE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store'
} as const;

const parseResponse = async (response: Response): Promise<ShareResponse> => {
  let payload: any = null;
  try {
    payload = await response.json();
  } catch (err) {
    if (!response.ok) {
      throw new ShareError('Unexpected server response.', response.status);
    }
  }

  if (!response.ok) {
    const message = typeof payload?.message === 'string' ? payload.message : 'Unable to share right now.';
    const code = typeof payload?.code === 'string' ? payload.code : undefined;
    throw new ShareError(message, response.status, code);
  }

  if (!payload || typeof payload.postId !== 'string') {
    throw new ShareError('Malformed response from server.', response.status);
  }

  return { postId: payload.postId };
};

export async function shareRun(input: RunShareInput): Promise<ShareResponse> {
  const response = await fetch('/api/social/share/run', {
    method: 'POST',
    headers: CACHE_HEADERS,
    body: JSON.stringify(input)
  });
  return parseResponse(response);
}

export async function shareAchievement(input: AchievementShareInput): Promise<ShareResponse> {
  const response = await fetch('/api/social/share/achievement', {
    method: 'POST',
    headers: CACHE_HEADERS,
    body: JSON.stringify(input)
  });
  return parseResponse(response);
}
