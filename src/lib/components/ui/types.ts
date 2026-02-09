export type IconComponent = typeof import('lucide-svelte').Home;

export type IconNavItem = {
  href: string;
  label: string;
  icon: IconComponent;
  analyticsKey?: string;
};

export type NotificationItem = {
  id: string;
  user_id: string;
  actor_id: string | null;
  kind: 'reaction' | 'comment' | 'share' | 'achievement_unlocked' | 'companion_nudge';
  target_id: string;
  target_kind: 'post' | 'comment' | 'achievement' | 'companion';
  created_at: string;
  read: boolean;
  metadata: Record<string, unknown> | null;
};
