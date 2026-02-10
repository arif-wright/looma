import { dev } from '$app/environment';
import { json } from '@sveltejs/kit';
import { SAFE_COMPLETION_MESSAGE, SAFE_LOAD_MESSAGE, SAFE_UNAUTHORIZED_MESSAGE } from '$lib/safeMessages';

type GameApiContext = 'start' | 'complete' | 'default';

type HttpErrorLike = {
  status?: number;
  body?: {
    code?: string;
    message?: string;
    [key: string]: unknown;
  };
  code?: string;
  message?: string;
};

const GENERIC_MESSAGE = SAFE_LOAD_MESSAGE;
const UNAUTHORIZED_MESSAGE = SAFE_UNAUTHORIZED_MESSAGE;
const COMPLETE_FAILED_MESSAGE = SAFE_COMPLETION_MESSAGE;

const asHttpErrorLike = (input: unknown): HttpErrorLike => {
  if (!input || typeof input !== 'object') return {};
  return input as HttpErrorLike;
};

const resolveStatus = (err: HttpErrorLike) => {
  if (typeof err.status === 'number' && Number.isFinite(err.status)) {
    return err.status;
  }
  return 500;
};

const resolveCode = (err: HttpErrorLike, status: number) => {
  const bodyCode = err.body?.code;
  if (typeof bodyCode === 'string' && bodyCode.trim()) return bodyCode;
  if (typeof err.code === 'string' && err.code.trim()) return err.code;
  if (status === 401) return 'unauthorized';
  if (status >= 500) return 'server_error';
  return 'bad_request';
};

const resolveMessage = (status: number, code: string, context: GameApiContext) => {
  if (status === 401 || code === 'unauthorized') return UNAUTHORIZED_MESSAGE;
  if (context === 'complete' && (status >= 500 || code === 'server_error')) {
    return COMPLETE_FAILED_MESSAGE;
  }
  return GENERIC_MESSAGE;
};

export const safeGameApiError = (context: GameApiContext, input: unknown) => {
  const err = asHttpErrorLike(input);
  const status = resolveStatus(err);
  const code = resolveCode(err, status);
  const message = resolveMessage(status, code, context);

  if (dev) {
    console.error(`[games/api:${context}]`, {
      status,
      code,
      detail: err.body ?? null,
      error: input
    });
  }

  return json({ code, message }, { status });
};
