export type ShopErrorCode =
  | 'invalid_payload'
  | 'sku_inactive'
  | 'price_missing'
  | 'limit_exceeded'
  | 'cooldown_active'
  | 'inventory_cap'
  | 'insufficient_funds'
  | 'rate_limited'
  | 'internal_error';

export class ShopError extends Error {
  readonly code: ShopErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code: ShopErrorCode, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ShopError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const isShopError = (error: unknown): error is ShopError =>
  error instanceof ShopError ||
  (typeof error === 'object' && error !== null && 'code' in error && 'status' in error && 'message' in error);

export const ensureShopError = (
  error: unknown,
  fallback: { code: ShopErrorCode; status?: number; message?: string }
): ShopError => {
  if (error instanceof ShopError) return error;
  const status = typeof (error as any)?.status === 'number' ? (error as any).status : fallback.status ?? 400;
  const code = typeof (error as any)?.code === 'string' ? ((error as any).code as ShopErrorCode) : fallback.code;
  const message = typeof (error as any)?.message === 'string' ? (error as any).message : fallback.message ?? 'Shop error';
  return new ShopError(message, code, status);
};
