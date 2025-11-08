<script lang="ts">
  import { goto } from '$app/navigation';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
  import ProfileStats from '$lib/components/profile/ProfileStats.svelte';
  import ProfileAbout from '$lib/components/profile/ProfileAbout.svelte';
  import FeaturedCompanionCard from '$lib/components/profile/FeaturedCompanionCard.svelte';
  import ProfileHighlights from '$lib/components/profile/ProfileHighlights.svelte';
  import ProfileFeed from '$lib/components/profile/ProfileFeed.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  const profile = data.profile;
  const stats = {
    level: profile.level ?? null,
    xp: profile.xp ?? null,
    xp_next: profile.xp_next ?? null,
    energy: profile.energy ?? null,
    energy_max: profile.energy_max ?? null
  };

  const handleEdit = () => {
    if (!data.isOwner) return;
    void goto('/app/profile/edit');
  };
</script>

<BackgroundStack class="profile-bg" />

<div class="relative z-10 min-h-screen safe-bottom pb-safe md:pb-8">
  <main class="profile-page">
    <ProfileHeader
      displayName={profile.display_name}
      handle={profile.handle}
      avatarUrl={profile.avatar_url}
      bannerUrl={profile.banner_url}
      joinedAt={profile.joined_at}
      isOwner={data.isOwner}
      isPrivate={profile.is_private}
      level={stats.level}
      on:edit={handleEdit}
    />

    <FeaturedCompanionCard companion={data.featuredCompanion} isOwner={false} />

    <ProfileStats
      level={stats.level}
      xp={stats.xp}
      xpNext={stats.xp_next}
      energy={stats.energy}
      energyMax={stats.energy_max}
      shards={null}
    />

    <ProfileAbout bio={profile.bio} links={profile.links} />

    <ProfileHighlights
      pinnedPost={data.pinnedPost}
      companion={data.featuredCompanion ? { name: data.featuredCompanion.name, mood: data.featuredCompanion.mood } : null}
      profileHandle={profile.handle}
    />

    <ProfileFeed
      authorIdentifier={profile.handle || profile.id}
      initialItems={data.posts ?? []}
      initialCursor={data.nextCursor}
      emptyMessage="No public posts yet."
    />
  </main>
</div>

<style>
  .profile-page {
    width: 100%;
    max-width: 960px;
    margin: 0 auto;
    padding: calc(env(safe-area-inset-top, 0px) + 20px) clamp(1rem, 4vw, 2rem) 64px;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  @media (max-width: 720px) {
    .profile-page {
      padding-bottom: 96px;
    }
  }
</style>
