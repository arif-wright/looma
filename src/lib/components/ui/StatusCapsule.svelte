<script lang="ts">
  import NotificationBell from '$lib/components/ui/NotificationBell.svelte';
  import type { NotificationItem } from '$lib/components/ui/NotificationBell.svelte';

  export let energy: number | null = null;
  export let energyMax: number | null = null;
  export let level: number | null = null;
  export let xp: number | null = null;
  export let xpNext: number | null = null;
  export let unreadCount = 0;
  export let notifications: NotificationItem[] = [];
  export let userEmail: string | null = null;
  export let onLogout: () => void = () => {};
  export let className = '';

  const capsuleBaseClass =
    'status-capsule flex h-9 flex-wrap items-center gap-2 rounded-full bg-white/5 px-3 text-[13px] text-white/80 backdrop-blur-xl';

  const energyDisplay =
    typeof energy === 'number' && typeof energyMax === 'number'
      ? `${energy}/${energyMax}`
      : '—';

  const levelDisplay = level ?? '—';

  const xpDisplay =
    typeof xp === 'number' && typeof xpNext === 'number' ? `${xp}/${xpNext}` : 'Aligning…';

  const initials =
    userEmail && userEmail.length > 0 ? userEmail.charAt(0).toUpperCase() : '•';
</script>

<div class={`${capsuleBaseClass} ${className}`.trim()} data-testid="top-status">
  <span class="flex items-center gap-1.5 whitespace-nowrap text-white">
    <span class="text-sm leading-none" aria-hidden="true">⚡</span>
    <span class="text-sm font-medium text-white/90" aria-label="Current energy">{energyDisplay}</span>
  </span>

  <span aria-hidden="true" class="text-white/35">•</span>

  <span class="flex items-center gap-2 whitespace-nowrap">
    <span class="text-sm leading-none" aria-hidden="true">★</span>
    <span class="text-sm font-medium text-white" aria-label="Bond level">Level {levelDisplay}</span>
    <span class="text-[11px] text-white/60">{xpDisplay}</span>
  </span>

  <span aria-hidden="true" class="text-white/35">•</span>

  <NotificationBell class="shrink-0" notifications={notifications} unreadCount={unreadCount} />

  <span aria-hidden="true" class="text-white/35">•</span>

  <button
    type="button"
    class="btn-ripple group relative flex h-7 items-center gap-1.5 rounded-full bg-white/10 px-1.5 text-sm text-white/90 transition-colors duration-150 ease-out hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 motion-reduce:transition-none"
    on:click={onLogout}
    aria-label={userEmail ? `Account menu for ${userEmail}` : 'Open account menu'}
  >
    <span
      class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-aura-cyan/40 to-aura-violet/40 text-xs font-semibold uppercase tracking-wide text-ink-900"
      aria-hidden="true"
    >
      {initials}
    </span>
    {#if userEmail}
      <span class="max-w-[140px] truncate text-xs text-white/75">{userEmail}</span>
    {/if}
  </button>
</div>
