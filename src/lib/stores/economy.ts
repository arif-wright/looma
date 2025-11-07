import { writable, derived } from 'svelte/store';

export type WalletTx = {
  kind: 'credit' | 'debit';
  amount: number;
  source: string;
  created_at: string;
};

export const walletBalance = writable<number>(0);
export const walletTx = writable<WalletTx[]>([]);
export const hasTransactions = derived(walletTx, ($tx) => $tx.length > 0);

export function setWalletBalance(input: unknown, fallback = 0) {
  let value: number | null = null;

  if (typeof input === 'number' && Number.isFinite(input)) {
    value = input;
  } else if (typeof input === 'object' && input !== null) {
    const maybeBalance = (input as Record<string, unknown>).balance;
    const maybeShards = (input as Record<string, unknown>).shards;
    if (typeof maybeBalance === 'number' && Number.isFinite(maybeBalance)) {
      value = maybeBalance;
    } else if (typeof maybeShards === 'number' && Number.isFinite(maybeShards)) {
      value = maybeShards;
    }
  } else if (typeof input === 'string') {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) {
      value = parsed;
    }
  }

  if (value === null) {
    const parsedFallback = Number(fallback);
    value = Number.isFinite(parsedFallback) ? parsedFallback : 0;
  }

  walletBalance.set(value);
}

export function formatShards(n: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0
  }).format(n);
}
