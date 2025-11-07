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

export function formatShards(n: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0
  }).format(n);
}
