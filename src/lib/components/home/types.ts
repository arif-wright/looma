export type QuickLink = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon?: any;
  indicator?: { kind: 'needs_attention' | 'new_activity' | 'gentle_nudge'; label: string } | null;
};
