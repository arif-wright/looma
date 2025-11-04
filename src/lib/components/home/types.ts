import type { Icon as LucideIcon } from 'lucide-svelte';

export type QuickLink = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon?: LucideIcon | null;
};
