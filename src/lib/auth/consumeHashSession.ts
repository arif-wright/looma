import { supabaseBrowser } from '$lib/supabaseClient';

export type HashResult = {
  status: 'success' | 'expired' | 'invalid' | 'network_error';
  message?: string;
};

const STATUS_MESSAGES: Record<HashResult['status'], string> = {
  success: 'Signed in successfully.',
  expired: 'This link has expired. Request a new magic link.',
  invalid: 'This link is invalid or already used.',
  network_error: "We couldn't reach the server. Check your connection and try again."
};

function hasSupabaseHash(hash: string): boolean {
  return ['access_token=', 'refresh_token=', 'type=recovery', 'type=magiclink'].some((token) =>
    hash.includes(token)
  );
}

type AuthLikeError = { message?: string; status?: number } | null | undefined;

function mapErrorToStatus(error: AuthLikeError): HashResult['status'] {
  if (!error) return 'invalid';
  const status = typeof error.status === 'number' ? error.status : null;
  if (status === 410) return 'expired';
  if (status === 400) return 'invalid';

  const message = error.message?.toLowerCase() ?? '';
  if (message.includes('expired')) return 'expired';
  if (message.includes('invalid') || message.includes('not valid')) return 'invalid';
  return 'invalid';
}

function buildResult(status: HashResult['status'], message?: string): HashResult {
  return { status, message: message ?? STATUS_MESSAGES[status] };
}

export function sanitizeInternalPath(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//')) return null;
  return trimmed;
}

export async function consumeHashSession(): Promise<HashResult> {
  if (typeof window === 'undefined') {
    return buildResult('invalid');
  }

  const supabase = supabaseBrowser();

  try {
    const { data } = await supabase.auth.getSession();
    const hash = window.location.hash ?? '';
    const hasHash = hasSupabaseHash(hash);

    if (!hasHash) {
      if (data.session) {
        return buildResult('success');
      }
      return buildResult('invalid');
    }

    const { error, data: sessionData } = await supabase.auth.getSessionFromUrl({ storeSession: true });
    if (error) {
      if (import.meta.env.DEV) {
        console.debug('[looma:consumeHashSession] getSessionFromUrl error', error);
      }
      return buildResult(mapErrorToStatus(error));
    }

    if (sessionData.session) {
      return buildResult('success');
    }

    return buildResult('invalid');
  } catch (error) {
    if (error instanceof TypeError) {
      return buildResult('network_error');
    }
    if (import.meta.env.DEV) {
      console.debug('[looma:consumeHashSession] unexpected error', error);
    }
    const message = error instanceof Error ? error.message : undefined;
    return buildResult(mapErrorToStatus({ message }));
  }
}
