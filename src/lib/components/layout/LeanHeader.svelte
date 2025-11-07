<script lang="ts">
  import LeanHeaderMobile from '$lib/components/header/LeanHeaderMobile.svelte';
  import LeanHeaderDesktop from '$lib/components/header/LeanHeaderDesktop.svelte';
  import type { NotificationItem } from '$lib/components/ui/NotificationBell.svelte';
  import type { IconNavItem } from '$lib/components/ui/CenterIconNav.svelte';

  export let iconNavItems: IconNavItem[] = [];
  export let energy: number | null = null;
  export let energyMax: number | null = null;
  export let level: number | null = null;
  export let xp: number | null = null;
  export let xpNext: number | null = null;
  export let walletBalance: number | null = null;
  export let walletCurrency = 'SHARDS';
  export let notifications: NotificationItem[] = [];
  export let unreadCount = 0;
  export let userEmail: string | null = null;
  export let onLogout: () => void = () => {};
</script>

<div class="md:hidden">
  <LeanHeaderMobile {notifications} {userEmail} />
</div>
<div class="hidden md:block">
  <LeanHeaderDesktop
    {iconNavItems}
    {energy}
    {energyMax}
    {level}
    {xp}
    {xpNext}
    {walletBalance}
    {walletCurrency}
    {notifications}
    {unreadCount}
    {userEmail}
    {onLogout}
  />
</div>
