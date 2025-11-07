<script lang="ts">
  import { goto } from '$app/navigation';
  import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
  import ProfileStats from '$lib/components/profile/ProfileStats.svelte';
  import ProfileAbout from '$lib/components/profile/ProfileAbout.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  const profile = data.profile;
  const stats = data.stats ?? {
    level: null,
    xp: null,
    xp_next: null,
    energy: null,
    energy_max: null
  };

  const handleEdit = () => {
    void goto('/app/profile/edit');
  };
</script>

<div class="profile-page">
  <ProfileHeader
    displayName={profile.display_name}
    handle={profile.handle}
    avatarUrl={profile.avatar_url}
    bannerUrl={profile.banner_url}
    joinedAt={profile.joined_at}
    isOwner={data.isOwner}
    isPrivate={profile.is_private}
    on:edit={handleEdit}
  />

  <ProfileStats
    level={stats.level}
    xp={stats.xp}
    xpNext={stats.xp_next}
    energy={stats.energy}
    energyMax={stats.energy_max}
    shards={data.walletShards}
  />

  <ProfileAbout bio={profile.bio} links={profile.links} />
</div>

<style>
  .profile-page {
    width: 100%;
    max-width: 960px;
    margin: 0 auto;
    padding: calc(env(safe-area-inset-top, 0px) + 20px) clamp(1rem, 4vw, 2rem) 64px;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  @media (max-width: 720px) {
    .profile-page {
      padding-bottom: 96px;
      gap: 1.25rem;
    }
  }
</style>
