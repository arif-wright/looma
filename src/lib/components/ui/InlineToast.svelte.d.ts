import type { SvelteComponentTyped } from 'svelte';

export interface InlineToastProps {
  message?: string;
  kind?: 'success' | 'error';
  show?: boolean;
  onClose?: () => void;
}

export default class InlineToast extends SvelteComponentTyped<
  InlineToastProps,
  Record<string, never>,
  { default: {} }
> {}
