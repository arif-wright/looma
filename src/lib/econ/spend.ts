export class EconomyError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'EconomyError';
  }
}

type SpendPayload = {
  amount: number;
  source: string;
  refId?: string;
  meta?: Record<string, unknown>;
  itemId?: string;
  qty?: number;
};

const parseJson = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const handleEconomyResponse = async (response: Response) => {
  const payload = await parseJson(response);
  if (!response.ok) {
    const message = typeof payload?.message === 'string' ? payload.message : 'Economy request failed.';
    const code = typeof payload?.code === 'string' ? payload.code : undefined;
    throw new EconomyError(message, response.status, code);
  }
  return payload ?? {};
};

export const spendCurrency = async (input: SpendPayload) => {
  const response = await fetch('/api/econ/spend', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(input)
  });
  return handleEconomyResponse(response);
};

export const fetchWalletSummary = async () => {
  const response = await fetch('/api/econ/wallet', {
    headers: { 'cache-control': 'no-store' }
  });
  return handleEconomyResponse(response);
};
