<script lang="ts">
  import LeanHeaderMobile from '$lib/components/header/LeanHeaderMobile.svelte';
  import LeanHeaderDesktop from '$lib/components/header/LeanHeaderDesktop.svelte';
  import type { NotificationItem, IconNavItem } from '$lib/components/ui/types';
  import type { ActiveCompanionSnapshot } from '$lib/stores/companions';
  import type { CurrentProfile } from '$lib/stores/profile';

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
  export let profile: CurrentProfile = null;
  export let activeCompanion: ActiveCompanionSnapshot | null = null;
</script>

<div class="lg:hidden">
  <LeanHeaderMobile {notifications} {userEmail} {profile} {onLogout} />
</div>
<div class="hidden lg:block">
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
    {profile}
    {onLogout}
    {activeCompanion}
  />
</div>
