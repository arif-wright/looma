<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
  import ProfileStats from '$lib/components/profile/ProfileStats.svelte';
  import ProfileAbout from '$lib/components/profile/ProfileAbout.svelte';
  import FeaturedCompanionCard from '$lib/components/profile/FeaturedCompanionCard.svelte';
  import ProfileHighlights from '$lib/components/profile/ProfileHighlights.svelte';
  import ProfileFeed from '$lib/components/profile/ProfileFeed.svelte';
  import ProfileComposer from '$lib/components/profile/ProfileComposer.svelte';
  import CompanionPickerModal from '$lib/components/profile/CompanionPickerModal.svelte';
  import type { PageData } from './$types';
  import type { PostRow } from '$lib/social/types';

  export let data: PageData;

  const profile = data.profile;
  const stats = data.stats;

  let pickerOpen = false;
  let pickerBusy = false;
  let feedRef: InstanceType<typeof ProfileFeed> | null = null;

  const handleEdit = () => {
    void goto('/app/profile/edit');
  };

  const handleSwap = () => {
    pickerOpen = true;
  };

  const handleComposerPosted = (event: CustomEvent<PostRow>) => {
    feedRef?.prepend(event.detail);
  };

  const handlePickerClose = () => {
    if (pickerBusy) return;
    pickerOpen = false;
  };

  const handlePickerSelect = async (event: CustomEvent<{ id: string }>) => {
    const id = event.detail?.id;
    if (!id) return;
    pickerBusy = true;
    try {
      const res = await fetch('/app/profile/featured-companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionId: id })
      });
      if (!res.ok) {
        console.error('failed to update featured companion', await res.text());
      } else {
        await invalidateAll();
      }
    } catch (err) {
      console.error('picker error', err);
    } finally {
      pickerBusy = false;
      pickerOpen = false;
    }
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
      level={stats?.level ?? null}
      on:edit={handleEdit}
    />

    <FeaturedCompanionCard
      companion={data.featuredCompanion}
      isOwner={data.isOwner}
      busy={pickerBusy}
      on:swap={handleSwap}
    />

    <ProfileStats
      level={stats?.level ?? null}
      xp={stats?.xp ?? null}
      xpNext={stats?.xp_next ?? null}
      energy={stats?.energy ?? null}
      energyMax={stats?.energy_max ?? null}
      shards={data.walletShards}
    />

    <ProfileAbout bio={profile.bio} links={profile.links} />

    <ProfileHighlights
      pinnedPost={data.pinnedPost}
      companion={data.featuredCompanion ? { name: data.featuredCompanion.name, mood: data.featuredCompanion.mood } : null}
      profileHandle={profile.handle}
    />

    <ProfileComposer on:posted={handleComposerPosted} />

    <ProfileFeed
      bind:this={feedRef}
      authorIdentifier={profile.handle || profile.id}
      initialItems={data.posts ?? []}
      initialCursor={data.nextCursor}
    />
  </main>
</div>

<CompanionPickerModal
  open={pickerOpen}
  companions={data.companionOptions ?? []}
  busy={pickerBusy}
  on:close={handlePickerClose}
  on:select={handlePickerSelect}
/>

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
